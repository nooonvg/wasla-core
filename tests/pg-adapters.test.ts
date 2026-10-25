/**
 * Adapter conformance.
 *
 * Every assertion in this file runs twice: once against the in-memory
 * reference adapters and once against the Postgres adapters. That is the
 * point. A test written only against Postgres proves the SQL runs; running
 * the identical expectations against both proves the two are substitutable,
 * which is the only property the rest of the system depends on.
 *
 * The Postgres pass is skipped when DATABASE_URL is absent, so the default
 * suite stays dependency-free. Run it with:
 *
 *   DATABASE_URL=postgres://... node scripts/db-migrate.mjs up
 *   DATABASE_URL=postgres://... npx vitest run tests/pg-adapters.test.ts
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../src/platform/clock.js";
import { makeEvent } from "../src/platform/eventing/envelope.js";
import { UNFENCED } from "../src/platform/eventing/fencing.js";
import { InMemoryInbox, type InboxStore } from "../src/platform/eventing/inbox.js";
import { InMemoryOutbox, type OutboxStore } from "../src/platform/eventing/outbox.js";
import { PgInbox } from "../src/platform/eventing/pg-inbox.js";
import { PgOutbox } from "../src/platform/eventing/pg-outbox.js";
import { withTransaction } from "../src/platform/eventing/unit-of-work.js";
import { PgTransactionBoundary, type Queryable } from "../src/platform/persistence/postgres.js";
import { InMemoryAuditLog, type AuditLog } from "../src/platform/audit/audit.js";
import { PgAuditLog } from "../src/platform/audit/pg-audit.js";
import {
  InMemoryTransactionBoundary,
  NestedTransactionError,
  NO_SCOPE,
  type TransactionBoundary,
} from "../src/platform/persistence/transaction.js";
import {
  InMemoryFulfillmentRepository,
  type FulfillmentRepository,
} from "../src/modules/fulfillment/service.js";
import { PgFulfillmentRepository } from "../src/modules/fulfillment/pg-repository.js";
import {
  InMemoryGeographyRepository,
  type GeographyRepository,
} from "../src/modules/geography/repository.js";
import { PgGeographyRepository } from "../src/modules/geography/pg-repository.js";
import { InMemoryMoneyRepository, type MoneyRepository } from "../src/modules/money/repository.js";
import { PgMoneyRepository } from "../src/modules/money/pg-repository.js";
import { InMemoryIdentityRepository } from "../src/modules/identity-access/memory-repository.js";
import { PgIdentityRepository } from "../src/modules/identity-access/pg-repository.js";
import type { IdentityRepository } from "../src/modules/identity-access/ports.js";
import { PgOrganizationRepository } from "../src/modules/organization/pg-repository.js";
import {
  InMemoryOrganizationRepository,
  type OrganizationRepository,
} from "../src/modules/organization/service.js";

const DATABASE_URL = process.env["DATABASE_URL"];
const AT = "2026-01-01T00:00:00.000Z";

interface Backend {
  identity: IdentityRepository;
  organization: OrganizationRepository;
  geography: GeographyRepository;
  money: MoneyRepository;
  fulfillment: FulfillmentRepository;
  outbox: OutboxStore;
  inbox: InboxStore;
  boundary: TransactionBoundary;
  audit: AuditLog;
}

interface Harness {
  clock: FixedClock;
  make(): Promise<Backend>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

function organization(id = randomUUID()) {
  return {
    organization_id: id,
    name: "Wasla Logistics",
    status: "active" as const,
    country_code: "SA",
    created_at: AT,
    updated_at: AT,
    source_system: "core",
    legacy_id: null,
  };
}

function identity(id = randomUUID()) {
  return {
    identity_id: id,
    status: "active" as const,
    canonical_identity_id: null,
    display_name: "Sara",
    created_at: AT,
    updated_at: AT,
    source_system: "core",
    legacy_id: null,
  };
}

function identityLink(identityId: string, externalId = randomUUID()) {
  return {
    identity_link_id: randomUUID(),
    identity_id: identityId,
    channel_type: "telegram" as const,
    external_id: externalId,
    verified_at: null,
    created_at: AT,
    deleted_at: null,
  };
}

function event(entityId: string) {
  return makeEvent({
    event_type: "core.identity.registered",
    version: 1,
    producer: "wasla-core",
    occurred_at: new Date(AT),
    correlation_id: "corr-1",
    entity_type: "identity",
    entity_id: entityId,
    payload: { identity_id: entityId },
  });
}

/** Everything a commit needs, for whichever backend is under test. */
function context(backend: Backend) {
  return { boundary: backend.boundary, outbox: backend.outbox, audit: backend.audit };
}

function memoryHarness(): Harness {
  const clock = new FixedClock();
  return {
    clock,
    async make() {
      return {
        identity: new InMemoryIdentityRepository(),
        organization: new InMemoryOrganizationRepository(),
        geography: new InMemoryGeographyRepository(),
        money: new InMemoryMoneyRepository(),
        fulfillment: new InMemoryFulfillmentRepository(),
        outbox: new InMemoryOutbox(clock),
        inbox: new InMemoryInbox(),
        boundary: new InMemoryTransactionBoundary(),
        audit: new InMemoryAuditLog(clock),
      };
    },
    async reset() {},
    async close() {},
  };
}

function postgresHarness(url: string): Harness {
  const clock = new FixedClock();
  // Imported lazily so the default suite never needs the driver installed.
  let pool: { query: Queryable["query"]; connect: unknown; end(): Promise<void> } | undefined;

  async function getPool() {
    if (!pool) {
      const { Pool } = await import("pg");
      pool = new Pool({ connectionString: url, max: 4 }) as unknown as typeof pool;
    }
    return pool!;
  }

  return {
    clock,
    async make() {
      const p = (await getPool()) as never;
      return {
        identity: new PgIdentityRepository(p),
        organization: new PgOrganizationRepository(p),
        geography: new PgGeographyRepository(p),
        money: new PgMoneyRepository(p),
        fulfillment: new PgFulfillmentRepository(p),
        outbox: new PgOutbox(p, clock),
        inbox: new PgInbox(p, clock),
        boundary: new PgTransactionBoundary(p),
        audit: new PgAuditLog(p, clock),
      };
    },
    async reset() {
      const p = await getPool();
      await p.query(
        `truncate membership, session, principal, identity_link, identity,
         organization, outbox, inbox, fulfillment, ledger_entry,
         ledger_transaction, payment_authorization, wallet, service_area,
         city, region, country, audit_entry restart identity cascade`,
      );
    },
    async close() {
      if (pool) await pool.end();
    },
  };
}

const harnesses: Array<[string, Harness]> = [["in-memory", memoryHarness()]];
if (DATABASE_URL) harnesses.push(["postgres", postgresHarness(DATABASE_URL)]);

describe.each(harnesses)("%s adapters", (_name, harness) => {
  let backend: Backend;

  beforeEach(async () => {
    await harness.reset();
    backend = await harness.make();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe("organization", () => {
    it("round-trips a row without mangling any field", async () => {
      const org = organization();
      await backend.organization.insert(org, NO_SCOPE);
      expect(await backend.organization.get(org.organization_id)).toEqual(org);
    });

    it("reports a missing row as undefined rather than throwing", async () => {
      expect(await backend.organization.get(randomUUID())).toBeUndefined();
    });

    it("lists what was inserted", async () => {
      await backend.organization.insert(organization(), NO_SCOPE);
      await backend.organization.insert(organization(), NO_SCOPE);
      expect(await backend.organization.list()).toHaveLength(2);
    });
  });

  describe("identity", () => {
    it("round-trips an identity, a link, a principal and a session", async () => {
      const person = identity();
      await backend.identity.insertIdentity(person, NO_SCOPE);
      expect(await backend.identity.getIdentity(person.identity_id)).toEqual(person);

      const link = {
        identity_link_id: randomUUID(),
        identity_id: person.identity_id,
        channel_type: "telegram" as const,
        external_id: "tg-1",
        verified_at: null,
        created_at: AT,
        deleted_at: null,
      };
      await backend.identity.insertLink(link, NO_SCOPE);
      expect(await backend.identity.findLink("telegram", "tg-1")).toEqual(link);
      expect(await backend.identity.findLink("telegram", "absent")).toBeUndefined();
      expect(await backend.identity.listLinksForIdentity(person.identity_id)).toEqual([link]);

      const principal = {
        principal_id: randomUUID(),
        identity_id: person.identity_id,
        created_at: AT,
        service_name: null, issues_for_channels: [],
      };
      await backend.identity.insertPrincipal(principal, NO_SCOPE);
      expect(await backend.identity.getPrincipal(principal.principal_id)).toEqual(principal);
      expect(await backend.identity.findPrincipalByIdentity(person.identity_id)).toEqual(principal);

      const session = {
        session_id: randomUUID(),
        principal_id: principal.principal_id,
        token_hash: "hash-1",
        channel_type: "telegram" as const,
        issued_at: AT,
        expires_at: "2026-01-02T00:00:00.000Z",
        revoked_at: null,
      };
      await backend.identity.insertSession(session, NO_SCOPE);
      expect(await backend.identity.getSessionByTokenHash("hash-1")).toEqual(session);
      expect(await backend.identity.getSession(session.session_id)).toEqual(session);

      const revoked = { ...session, revoked_at: "2026-01-01T06:00:00.000Z" };
      await backend.identity.updateSession(revoked, NO_SCOPE);
      expect(await backend.identity.getSession(session.session_id)).toEqual(revoked);
    });

    it("persists the roles array of a membership as an array", async () => {
      const org = organization();
      const person = identity();
      await backend.organization.insert(org, NO_SCOPE);
      await backend.identity.insertIdentity(person, NO_SCOPE);
      const principal = {
        principal_id: randomUUID(),
        identity_id: person.identity_id,
        created_at: AT,
        service_name: null, issues_for_channels: [],
      };
      await backend.identity.insertPrincipal(principal, NO_SCOPE);

      const membership = {
        membership_id: randomUUID(),
        principal_id: principal.principal_id,
        organization_id: org.organization_id,
        roles: ["org_admin" as const, "org_member" as const],
        created_at: AT,
        deleted_at: null,
      };
      await backend.identity.insertMembership(membership, NO_SCOPE);

      expect(await backend.identity.listMemberships(principal.principal_id)).toEqual([membership]);
      expect(
        await backend.identity.findMembership(principal.principal_id, org.organization_id),
      ).toEqual(membership);
      expect(
        await backend.identity.findMembership(principal.principal_id, randomUUID()),
      ).toBeUndefined();
    });

    it("applies an update in place rather than inserting a second row", async () => {
      const person = identity();
      await backend.identity.insertIdentity(person, NO_SCOPE);
      const suspended = { ...person, status: "suspended" as const, updated_at: AT };
      await backend.identity.updateIdentity(suspended, NO_SCOPE);

      expect(await backend.identity.getIdentity(person.identity_id)).toEqual(suspended);
      expect(await backend.identity.listIdentities()).toHaveLength(1);
    });
  });

  describe("outbox", () => {
    it("appends, then serves the record back with pending status", async () => {
      const e = event(randomUUID());
      await backend.outbox.append(e, NO_SCOPE);

      const all = await backend.outbox.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.event).toEqual(e);
      expect(all[0]!.status).toBe("pending");
      expect(all[0]!.attempts).toBe(0);
      expect(all[0]!.last_error).toBeNull();
    });

    it("ignores a duplicate append of the same event id", async () => {
      const e = event(randomUUID());
      await backend.outbox.append(e, NO_SCOPE);
      await backend.outbox.append(e, NO_SCOPE);
      expect(await backend.outbox.all()).toHaveLength(1);
    });

    it("claims only rows that are due", async () => {
      const e = event(randomUUID());
      await backend.outbox.append(e, NO_SCOPE);
      expect(await backend.outbox.claimDue(new Date(AT), 10)).toHaveLength(1);

      // UNFENCED: this test acknowledges rows it never claimed (B-26).
      await backend.outbox.markFailed(
        e.event_id,
        UNFENCED,
        "transport down",
        new Date("2026-01-01T01:00:00.000Z"),
      );
      expect(await backend.outbox.claimDue(new Date(AT), 10)).toHaveLength(0);
      expect(
        await backend.outbox.claimDue(new Date("2026-01-01T02:00:00.000Z"), 10),
      ).toHaveLength(1);

      const failed = (await backend.outbox.all())[0]!;
      expect(failed.attempts).toBe(1);
      expect(failed.last_error).toBe("transport down");
    });

    it("moves a record out of pending on publish and on death", async () => {
      const published = event(randomUUID());
      const dead = event(randomUUID());
      await backend.outbox.append(published, NO_SCOPE);
      await backend.outbox.append(dead, NO_SCOPE);

      await backend.outbox.markPublished(published.event_id, UNFENCED);
      await backend.outbox.markDead(dead.event_id, UNFENCED, "gave up");

      expect(await backend.outbox.byStatus("pending")).toHaveLength(0);
      expect(await backend.outbox.byStatus("published")).toHaveLength(1);
      const deadRecords = await backend.outbox.byStatus("dead");
      expect(deadRecords).toHaveLength(1);
      expect(deadRecords[0]!.last_error).toBe("gave up");
    });
  });

  describe("inbox", () => {
    it("claims an event once and refuses the second claim", async () => {
      const id = randomUUID();
      expect(await backend.inbox.claim("move", id)).toBe(true);
      expect(await backend.inbox.claim("move", id)).toBe(false);
      expect(await backend.inbox.seen("move", id)).toBe(true);
      expect(await backend.inbox.size()).toBe(1);
    });

    it("keeps consumers independent", async () => {
      const id = randomUUID();
      expect(await backend.inbox.claim("move", id)).toBe(true);
      expect(await backend.inbox.claim("market", id)).toBe(true);
      expect(await backend.inbox.size()).toBe(2);
    });

    it("allows a retry after release", async () => {
      const id = randomUUID();
      await backend.inbox.claim("move", id);
      await backend.inbox.release("move", id);
      expect(await backend.inbox.seen("move", id)).toBe(false);
      expect(await backend.inbox.claim("move", id)).toBe(true);
    });
  });

  describe("geography", () => {
    it("round-trips a country, region, city and service area", async () => {
      const country = {
        country_code: "SA",
        name: "Saudi Arabia",
        default_currency: "SAR",
        status: "active" as const,
      };
      await backend.geography.upsertCountry(country, NO_SCOPE);
      expect(await backend.geography.getCountry("SA")).toEqual(country);

      const region = {
        region_id: randomUUID(),
        country_code: "SA",
        code: "MAKKAH",
        name: "Mecca Region",
        status: "active" as const,
      };
      await backend.geography.insertRegion(region, NO_SCOPE);
      expect(await backend.geography.getRegion(region.region_id)).toEqual(region);
      expect(await backend.geography.findRegion("SA", "MAKKAH")).toEqual(region);
      expect(await backend.geography.listRegions("SA")).toEqual([region]);

      const city = {
        city_id: randomUUID(),
        region_id: region.region_id,
        country_code: "SA",
        name: "Jeddah",
        latitude: 21.4858,
        longitude: 39.1925,
        status: "active" as const,
      };
      await backend.geography.insertCity(city, NO_SCOPE);
      expect(await backend.geography.getCity(city.city_id)).toEqual(city);
      expect(await backend.geography.listCities(region.region_id)).toEqual([city]);

      const area = {
        service_area_id: randomUUID(),
        city_id: city.city_id,
        country_code: "SA",
        name: "Jeddah North",
        centre_latitude: 21.6,
        centre_longitude: 39.15,
        radius_metres: 15_000,
        status: "active" as const,
      };
      await backend.geography.insertServiceArea(area, NO_SCOPE);
      expect(await backend.geography.getServiceArea(area.service_area_id)).toEqual(area);
      expect(await backend.geography.listServiceAreas("SA")).toEqual([area]);
      expect(await backend.geography.listServiceAreas()).toEqual([area]);
      expect(await backend.geography.listServiceAreas("AE")).toEqual([]);
    });

    it("treats upsertCountry as an update, not a duplicate", async () => {
      const country = {
        country_code: "SA",
        name: "Saudi Arabia",
        default_currency: "SAR",
        status: "active" as const,
      };
      await backend.geography.upsertCountry(country, NO_SCOPE);
      await backend.geography.upsertCountry({ ...country, status: "inactive" }, NO_SCOPE);

      expect(await backend.geography.listCountries()).toHaveLength(1);
      expect((await backend.geography.getCountry("SA"))?.status).toBe("inactive");
    });
  });

  describe("money", () => {
    it("round-trips a wallet and finds it by owner and currency", async () => {
      const wallet = {
        wallet_id: randomUUID(),
        owner_type: "organization" as const,
        owner_id: randomUUID(),
        currency: "SAR",
        status: "active" as const,
        created_at: AT,
      };
      await backend.money.insertWallet(wallet, NO_SCOPE);

      expect(await backend.money.getWallet(wallet.wallet_id)).toEqual(wallet);
      expect(
        await backend.money.findWallet("organization", wallet.owner_id, "SAR"),
      ).toEqual(wallet);
      expect(await backend.money.findWallet("organization", wallet.owner_id, "USD")).toBeUndefined();
    });

    it("keeps an authorization's amount an integer through the round trip", async () => {
      const wallet = {
        wallet_id: randomUUID(),
        owner_type: "organization" as const,
        owner_id: randomUUID(),
        currency: "SAR",
        status: "active" as const,
        created_at: AT,
      };
      await backend.money.insertWallet(wallet, NO_SCOPE);

      const authorization = {
        authorization_id: randomUUID(),
        wallet_id: wallet.wallet_id,
        amount_minor: 5_000,
        captured_minor: 0,
        refunded_minor: 0,
        currency: "SAR",
        status: "authorized" as const,
        business_reference: "order-1",
        created_at: AT,
        captured_at: null,
        voided_at: null,
        expires_at: "2026-01-02T00:00:00.000Z",
        void_reason: null,
      };
      await backend.money.insertAuthorization(authorization, NO_SCOPE);

      const stored = await backend.money.getAuthorization(authorization.authorization_id);
      expect(stored).toEqual(authorization);
      // bigint arrives from the driver as a string; a missed conversion would
      // make this a "5000" that still passes a loose comparison.
      expect(typeof stored?.amount_minor).toBe("number");

      expect(await backend.money.findAuthorizationByReference("order-1")).toEqual(authorization);
      expect(await backend.money.listAuthorizations(wallet.wallet_id)).toEqual([authorization]);
      expect(await backend.money.allAuthorizations()).toEqual([authorization]);

      // Capturing the whole hold, which is what `captured` now means. The
      // aggregate has to move with the ledger or 0009's drift check refuses
      // it, so the capture transaction is written in the same unit of work —
      // which is what the service does and the only state the database
      // accepts.
      const captured = {
        ...authorization,
        status: "captured" as const,
        captured_minor: 5_000,
        captured_at: AT,
      };
      const captureId = randomUUID();
      await withTransaction(context(backend), (uow) => {
        uow.stage(async (scope) => {
          await backend.money.updateAuthorization(captured, scope);
          await backend.money.insertTransaction(
            {
              transaction_id: captureId,
              kind: "capture",
              authorization_id: authorization.authorization_id,
              business_reference: `capture:${authorization.authorization_id}`,
              occurred_at: AT,
              entries: [
                {
                  entry_id: randomUUID(),
                  transaction_id: captureId,
                  account_reference: "clearing:captured",
                  amount_minor: 5_000,
                  currency: "SAR",
                },
                {
                  entry_id: randomUUID(),
                  transaction_id: captureId,
                  account_reference: `wallet:${wallet.wallet_id}`,
                  amount_minor: -5_000,
                  currency: "SAR",
                },
              ],
            },
            scope,
          );
        });
      });
      expect(await backend.money.getAuthorization(authorization.authorization_id)).toEqual(
        captured,
      );
    });

    it("stores a balanced ledger transaction with its entries", async () => {
      const transactionId = randomUUID();
      const transaction = {
        transaction_id: transactionId,
        kind: "credit" as const,
        // A credit is not tied to an authorization; 0009 requires exactly that.
        authorization_id: null,
        business_reference: "deposit-1",
        occurred_at: AT,
        entries: [
          {
            entry_id: randomUUID(),
            transaction_id: transactionId,
            account_reference: "wallet:funds",
            amount_minor: 20_000,
            currency: "SAR",
          },
          {
            entry_id: randomUUID(),
            transaction_id: transactionId,
            account_reference: "external:topup",
            amount_minor: -20_000,
            currency: "SAR",
          },
        ],
      };

      // The ledger balance trigger is checked at COMMIT, so the header and its
      // entries have to reach it together. Writing through a unit of work is
      // the only correct way, and the adapter refuses anything else.
      await withTransaction(context(backend), (uow) => {
        uow.stage((scope) => backend.money.insertTransaction(transaction, scope));
      });

      const stored = await backend.money.findTransactionByReference("deposit-1");
      expect(stored?.transaction_id).toBe(transactionId);
      expect(stored?.entries).toHaveLength(2);
      expect(stored?.entries.reduce((sum, entry) => sum + entry.amount_minor, 0)).toBe(0);
      expect(await backend.money.transactions()).toHaveLength(1);
    });
  });

  describe("fulfillment", () => {
    it("round-trips a fulfillment and updates it in place", async () => {
      const org = organization();
      await backend.organization.insert(org, NO_SCOPE);

      const created = {
        fulfillment_id: randomUUID(),
        organization_id: org.organization_id,
        market_order_reference: "order-1",
        move_job_reference: null,
        payment_authorization_id: null,
        status: "coordinating" as const,
        settlement_state: "none" as const,
        created_at: AT,
        completed_at: null,
        closure_reason: null,
        executed_after_cancellation_at: null,
        executed_after_cancellation_job_reference: null,
      };
      await backend.fulfillment.insert(created, NO_SCOPE);
      expect(await backend.fulfillment.get(created.fulfillment_id)).toEqual(created);
      expect(await backend.fulfillment.findByOrderReference("order-1")).toEqual(created);
      expect(await backend.fulfillment.findByOrderReference("absent")).toBeUndefined();

      const dispatched = {
        ...created,
        status: "dispatched" as const,
        move_job_reference: "job-1",
      };
      await backend.fulfillment.update(dispatched, NO_SCOPE);
      expect(await backend.fulfillment.get(created.fulfillment_id)).toEqual(dispatched);
      expect(await backend.fulfillment.all()).toHaveLength(1);
    });

    it("stores a completed fulfillment with its captured settlement state", async () => {
      const org = organization();
      await backend.organization.insert(org, NO_SCOPE);

      const completed = {
        fulfillment_id: randomUUID(),
        organization_id: org.organization_id,
        market_order_reference: "order-2",
        move_job_reference: "job-2",
        payment_authorization_id: null,
        status: "completed" as const,
        settlement_state: "captured" as const,
        created_at: AT,
        completed_at: "2026-01-01T03:00:00.000Z",
        closure_reason: "delivered",
        executed_after_cancellation_at: null,
        executed_after_cancellation_job_reference: null,
      };
      await backend.fulfillment.insert(completed, NO_SCOPE);
      expect(await backend.fulfillment.get(completed.fulfillment_id)).toEqual(completed);
    });
  });

  describe("transaction boundary", () => {
    it("commits the row and the event together", async () => {
      const org = organization();
      const e = event(org.organization_id);

      await withTransaction(context(backend), (uow) => {
        uow.stage((scope) => backend.organization.insert(org, scope));
        uow.emit(e);
      });

      expect(await backend.organization.get(org.organization_id)).toEqual(org);
      expect(await backend.outbox.all()).toHaveLength(1);
    });

    it("leaves neither the row nor the event behind when the work throws", async () => {
      const org = organization();

      await expect(
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) => backend.organization.insert(org, scope));
          uow.emit(event(org.organization_id));
          throw new Error("domain rule rejected the command");
        }),
      ).rejects.toThrow(/domain rule rejected/);

      expect(await backend.organization.get(org.organization_id)).toBeUndefined();
      expect(await backend.outbox.all()).toHaveLength(0);
    });

    it("appends no event when a later write in the same unit of work fails", async () => {
      const org = organization();
      const person = identity();

      await expect(
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) => backend.organization.insert(org, scope));
          uow.stage((scope) => backend.identity.insertIdentity(person, scope));
          uow.stage(async () => {
            throw new Error("a later write failed");
          });
          uow.emit(event(org.organization_id));
        }),
      ).rejects.toThrow(/a later write failed/);

      // Holds for both adapters: the append is the last thing the unit of work
      // does, so a failure before it means no event was ever written.
      expect(await backend.outbox.all()).toHaveLength(0);
    });

    /**
     * This was B-10, and it used to be a Postgres-only assertion.
     *
     * Staging is not rollback: once the commit point starts applying staged
     * writes, an earlier one has already landed when a later one throws.
     * `InMemoryTransactionBoundary` now journals the inverse of every write it
     * is given a scope for, so it unwinds like Postgres does, and this test
     * therefore runs against both adapters instead of documenting a gap.
     *
     * The trigger is a duplicate identity link, which both adapters reject:
     * the reference one on its own uniqueness check, Postgres on the unique
     * index. Two writes have already succeeded at that point.
     */
    it("discards writes already applied earlier in the same transaction", async () => {
      const org = organization();
      const person = identity();
      const link = identityLink(person.identity_id);

      await expect(
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) => backend.organization.insert(org, scope));
          uow.stage((scope) => backend.identity.insertIdentity(person, scope));
          uow.stage((scope) => backend.identity.insertLink(link, scope));
          uow.stage((scope) => backend.identity.insertLink(link, scope));
          uow.emit(event(org.organization_id));
        }),
      ).rejects.toThrow();

      expect(await backend.organization.get(org.organization_id)).toBeUndefined();
      expect(await backend.identity.getIdentity(person.identity_id)).toBeUndefined();
      expect(await backend.identity.findLink("telegram", link.external_id)).toBeUndefined();
      expect(await backend.outbox.all()).toHaveLength(0);
    });

    it("restores the previous value of a row the transaction overwrote", async () => {
      const person = identity();
      await withTransaction(context(backend), (uow) => {
        uow.stage((scope) => backend.identity.insertIdentity(person, scope));
      });

      await expect(
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) =>
            backend.identity.updateIdentity({ ...person, display_name: "Renamed" }, scope),
          );
          uow.stage(async () => {
            throw new Error("failed after the update");
          });
        }),
      ).rejects.toThrow(/failed after the update/);

      // Not merely absent — back to the committed value. A journal that only
      // deleted keys would pass the previous test and fail this one.
      expect((await backend.identity.getIdentity(person.identity_id))?.display_name).toBe("Sara");
    });

    /**
     * This was B-9. The audit entry used to be written after the transaction
     * returned, so a rolled-back command could still leave a trail entry
     * claiming it happened — and the trail is what an investigation treats as
     * authoritative, which makes a false entry worse than a missing one.
     */
    it("commits state, audit entry and event together", async () => {
      const org = organization();

      await withTransaction(context(backend), (uow) => {
        uow.stage((scope) => backend.organization.insert(org, scope));
        uow.audit({
          actor_type: "system",
          actor_id: null,
          action: "organization.created",
          entity_type: "organization",
          entity_id: org.organization_id,
          correlation_id: "corr-1",
          metadata: { country_code: org.country_code },
        });
        uow.emit(event(org.organization_id));
      });

      expect(await backend.organization.get(org.organization_id)).toEqual(org);
      expect(await backend.audit.forEntity("organization", org.organization_id)).toHaveLength(1);
      expect(await backend.outbox.all()).toHaveLength(1);
    });

    it("leaves no audit entry behind when the command is rolled back", async () => {
      const org = organization();

      await expect(
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) => backend.organization.insert(org, scope));
          uow.audit({
            actor_type: "system",
            actor_id: null,
            action: "organization.created",
            entity_type: "organization",
            entity_id: org.organization_id,
            correlation_id: "corr-1",
            metadata: {},
          });
          uow.stage(async () => {
            throw new Error("a later write failed");
          });
          uow.emit(event(org.organization_id));
        }),
      ).rejects.toThrow(/a later write failed/);

      expect(await backend.organization.get(org.organization_id)).toBeUndefined();
      expect(await backend.audit.forEntity("organization", org.organization_id)).toHaveLength(0);
      expect(await backend.outbox.all()).toHaveLength(0);
    });

    it("keeps an out-of-band audit entry even when the caller rolls back", async () => {
      const org = organization();

      await expect(
        withTransaction(context(backend), async (uow) => {
          // Written directly on the log, not through the unit of work: this is
          // how a refusal or a detected inconsistency is recorded, where there
          // is no committed change to be atomic with and rollback would erase
          // the only evidence of why nothing happened.
          await backend.audit.record({
            actor_type: "service",
            actor_id: null,
            action: "organization.refused",
            entity_type: "organization",
            entity_id: org.organization_id,
            correlation_id: "corr-1",
            metadata: { reason: "duplicate" },
          });
          uow.stage(async () => {
            throw new Error("the command was rejected");
          });
        }),
      ).rejects.toThrow(/the command was rejected/);

      expect(await backend.audit.forEntity("organization", org.organization_id)).toHaveLength(1);
    });

    it("refuses a transaction opened inside another one", async () => {
      await expect(
        backend.boundary.run(async () => {
          await backend.boundary.run(async () => undefined);
        }),
      ).rejects.toThrow(NestedTransactionError);
    });

    it("keeps two concurrent transactions independent", async () => {
      const kept = organization();
      const discarded = organization();

      const [, rejected] = await Promise.allSettled([
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) => backend.organization.insert(kept, scope));
        }),
        withTransaction(context(backend), (uow) => {
          uow.stage((scope) => backend.organization.insert(discarded, scope));
          uow.stage(async () => {
            throw new Error("second transaction fails");
          });
        }),
      ]);

      // The nesting guard keys off async context, not a flag on the boundary,
      // so concurrency is not mistaken for nesting and one rollback does not
      // reach into the other transaction.
      expect(rejected.status).toBe("rejected");
      expect(await backend.organization.get(kept.organization_id)).toEqual(kept);
      expect(await backend.organization.get(discarded.organization_id)).toBeUndefined();
    });
  });
});

/**
 * Postgres-only: the things a reference adapter cannot be asked to prove.
 */
describe.skipIf(!DATABASE_URL)("postgres transaction guarantees", () => {
  const harness = postgresHarness(DATABASE_URL ?? "");
  let backend: Backend;

  beforeEach(async () => {
    await harness.reset();
    backend = await harness.make();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("discards a write the database itself refused on a primary key", async () => {
    const org = organization();
    const person = identity();

    await expect(
      withTransaction(context(backend), (uow) => {
        uow.stage((scope) => backend.organization.insert(org, scope));
        uow.stage((scope) => backend.identity.insertIdentity(person, scope));
        // Same primary key twice. The reference adapter's map would simply
        // overwrite, so only the database can reject this.
        uow.stage((scope) => backend.identity.insertIdentity(person, scope));
        uow.emit(event(org.organization_id));
      }),
    ).rejects.toThrow();

    expect(await backend.organization.get(org.organization_id)).toBeUndefined();
    expect(await backend.identity.getIdentity(person.identity_id)).toBeUndefined();
    expect(await backend.outbox.all()).toHaveLength(0);
  });

  it("commits a multi-table unit of work as one visible change", async () => {
    const org = organization();
    const person = identity();

    await withTransaction(context(backend), (uow) => {
      uow.stage((scope) => backend.organization.insert(org, scope));
      uow.stage((scope) => backend.identity.insertIdentity(person, scope));
      uow.emit(event(person.identity_id));
    });

    expect(await backend.organization.get(org.organization_id)).toEqual(org);
    expect(await backend.identity.getIdentity(person.identity_id)).toEqual(person);
    expect(await backend.outbox.byStatus("pending")).toHaveLength(1);
  });
});
