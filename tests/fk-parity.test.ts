/**
 * Every `FOREIGN KEY` in the schema, probed against both backends (B-12).
 *
 * The uniqueness cycle closed 24 rules of one kind and the check-constraint
 * cycle 100 of another. This closes the third family: the schema declares 30
 * foreign keys, and before this cycle exactly one of them was restated in
 * `src/`. The other 29 were enforced by Postgres alone, so a dual-backend test
 * could store a fulfillment in no tenant, a membership for no principal, a
 * session for no principal, a notification addressed to a recipient row that
 * was never created, or a delivery of an envelope the outbox never recorded —
 * and pass on the reference half. A green in-memory run then certified rows
 * production refuses, which is the defect B-12 names.
 *
 * Each case writes a row that is valid in every other respect and names a
 * parent that does not exist, then asserts two things on both backends:
 *
 *   1. **The write is refused.** Acceptance by either backend fails the case.
 *   2. **The refusal names the constraint**, so a reference-store stack trace
 *      and a production one read the same and a store cannot pass by refusing
 *      the row for an unrelated reason.
 *
 * One key is recorded as exempt rather than probed:
 * `ledger_entry_transaction_id_fkey`. Entries are not a row table of their own
 * in the reference backend — `insertTransaction` takes the header with its
 * entries nested inside it — so there is no map to declare a rule against and
 * no entry a caller could point at a different transaction. Postgres keeps
 * enforcing it; the exemption and its reason are recorded in `UNPROBEABLE` and
 * the coverage gates treat that list, and only that list, as an excuse.
 *
 * Four gates hold the file honest, and the first two are the ones that make the
 * declaration self-checking rather than a second opinion:
 *
 *   - `covers every foreign key the live schema declares` reads `pg_constraint`
 *     and fails when a key has neither a case nor a recorded reason.
 *   - `declares each key exactly as the schema does` reads the child column,
 *     the parent table and the column's nullability out of the catalog and
 *     compares them with `FOREIGN_KEYS`. A migration that repoints a key, or
 *     drops a `NOT NULL`, fails here instead of quietly disabling a check.
 *   - `resolves every parent table` asserts the reference bundle registered a
 *     source for every parent a rule reads. This is the one weakening in the
 *     design — an unregistered parent is a key that cannot be evaluated — and
 *     it is measured rather than trusted.
 *   - `records a reason for every unprobeable key`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../src/platform/clock.js";
import {
  memoryPersistence,
  postgresPersistence,
  type Persistence,
} from "../src/platform/persistence/backends.js";
import {
  FOREIGN_KEYS,
  foreignKeyConstraints,
  referencedParents,
  type ForeignKeyRule,
} from "../src/platform/persistence/reference-keys.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";
import {
  authorization,
  city,
  delivery,
  eventSubscription,
  fulfillment,
  identity,
  LATER,
  notification,
  NOW,
  period,
  refuse,
  region,
  seedCountry,
  seedEvent,
  seedGeography,
  seedOrganization,
  seedPlan,
  seedPrincipal,
  seedRecipient,
  seedSubscription,
  seedWallet,
  serviceArea,
  signal,
  subscription,
  transaction,
  type Verdict,
} from "./support/rows.js";

const url = process.env.DATABASE_URL;

const TABLES = `reputation_signal, notification, notification_recipient, membership,
  session, principal, identity_link, identity, fulfillment, ledger_entry,
  ledger_transaction, payment_authorization, wallet, usage_record,
  subscription_period, subscription, plan_grant, plan, event_delivery,
  event_subscription, inbound_event, organization, outbox, inbox,
  idempotency_key, audit_entry, service_area, city, region`;

/** An id that is well-formed and belongs to nothing. The orphan under test. */
function absent(): string {
  return randomUUID();
}

interface KeyCase {
  /** The constraint name in the schema. */
  readonly constraint: string;
  /** What accepting this row would mean. */
  readonly what: string;
  /**
   * Constraints the same row unavoidably violates. Postgres does not promise
   * which of two violated constraints it reports, so either name counts.
   */
  readonly alsoViolates?: readonly string[];
  probe(store: Persistence): Promise<Verdict>;
}

/**
 * A key that has neither a rule nor a case, with the reason it can have
 * neither. The exemption is recorded here so that it is one named,
 * reviewable line rather than a silent absence from the inventory.
 */
interface Unprobeable {
  readonly constraint: string;
  readonly why: string;
}

const UNPROBEABLE: readonly Unprobeable[] = [
  {
    constraint: "ledger_entry_transaction_id_fkey",
    why: "entries are not a row table of their own in the reference backend: `insertTransaction` takes the header with its entries nested inside it, so there is no ledger_entry map to declare a rule against and no entry a caller could point at a different transaction. The key stays enforced by Postgres, and the header-level `ledger_transaction_authorization_id_fkey` case below covers the reference direction that a caller can express.",
  },
];

const CASES: readonly KeyCase[] = [
  // ---- geography ---------------------------------------------------------
  {
    constraint: "region_country_code_fkey",
    what: "a region in a country the platform does not operate in",
    async probe(store) {
      await seedCountry(store);
      return refuse(() =>
        store.geography.insertRegion({ ...region(), country_code: "ZZ" }, NO_SCOPE),
      );
    },
  },
  {
    constraint: "city_country_code_fkey",
    what: "a city whose country is not a country, so its currency cannot be resolved",
    async probe(store) {
      const { regionId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertCity({ ...city(regionId), country_code: "ZZ" }, NO_SCOPE),
      );
    },
  },
  {
    constraint: "city_region_id_fkey",
    what: "a city in no region, which no service area can be rolled up through",
    async probe(store) {
      await seedCountry(store);
      return refuse(() => store.geography.insertCity(city(absent()), NO_SCOPE));
    },
  },
  {
    constraint: "service_area_city_id_fkey",
    what: "a serviceable area around a city that does not exist",
    async probe(store) {
      await seedCountry(store);
      return refuse(() => store.geography.insertServiceArea(serviceArea(absent()), NO_SCOPE));
    },
  },
  {
    constraint: "service_area_country_code_fkey",
    what: "an area whose country disagrees with every country the platform knows",
    async probe(store) {
      const { cityId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertServiceArea(
          { ...serviceArea(cityId), country_code: "ZZ" },
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- identity ----------------------------------------------------------
  {
    constraint: "identity_canonical_identity_id_fkey",
    what: "a merged identity whose survivor does not exist, so following the merge chain ends nowhere",
    async probe(store) {
      return refuse(() =>
        store.identity.insertIdentity(
          { ...identity(absent()), status: "merged", canonical_identity_id: absent() },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "identity_link_identity_id_fkey",
    what: "a channel login that resolves to no identity, so authentication would succeed into nothing",
    async probe(store) {
      return refuse(() =>
        store.identity.insertLink(
          {
            identity_link_id: absent(),
            identity_id: absent(),
            channel_type: "web",
            external_id: `parity-${randomUUID()}`,
            verified_at: null,
            created_at: NOW,
            deleted_at: null,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "principal_identity_id_fkey",
    what: "an actor with no identity behind it, which every audit entry would then attribute to nobody",
    async probe(store) {
      return refuse(() =>
        store.identity.insertPrincipal(
          { principal_id: absent(), identity_id: absent(), created_at: NOW, service_name: null, issues_for_channels: [] },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "session_principal_id_fkey",
    what: "a bearer token that authenticates as a principal nobody created",
    async probe(store) {
      return refuse(() =>
        store.identity.insertSession(
          {
            session_id: absent(),
            principal_id: absent(),
            token_hash: `hash-${randomUUID()}`,
            channel_type: "web",
            issued_at: NOW,
            expires_at: LATER,
            revoked_at: null,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "membership_organization_id_fkey",
    what: "rights inside a tenant that does not exist, which tenant isolation cannot be asserted against",
    async probe(store) {
      const { principalId } = await seedPrincipal(store);
      return refuse(() =>
        store.identity.insertMembership(
          {
            membership_id: absent(),
            principal_id: principalId,
            organization_id: absent(),
            roles: ["org_member"],
            created_at: NOW,
            deleted_at: null,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "membership_principal_id_fkey",
    what: "a grant of rights to nobody, which no revocation can ever reach",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.identity.insertMembership(
          {
            membership_id: absent(),
            principal_id: absent(),
            organization_id: organizationId,
            roles: ["org_member"],
            created_at: NOW,
            deleted_at: null,
          },
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- money -------------------------------------------------------------
  {
    constraint: "payment_authorization_wallet_id_fkey",
    what: "a hold against a wallet that does not exist, so the money it reserves belongs to no one",
    async probe(store) {
      return refuse(() => store.money.insertAuthorization(authorization(absent()), NO_SCOPE));
    },
  },
  {
    constraint: "ledger_transaction_authorization_id_fkey",
    what: "a capture of a hold that was never taken, which no reconciliation can trace",
    async probe(store) {
      const walletId = await seedWallet(store);
      const transactionId = absent();
      const base = transaction(walletId, transactionId);
      // Inside a boundary because `insertTransaction` refuses to run outside
      // one at all: the balance trigger is deferred to COMMIT, so the header
      // and its entries have to reach it together. The reference key is
      // checked when the header row is written, well before that.
      return refuse(() =>
        store.boundary.run(async (scope) => {
          await store.money.insertTransaction(
            {
              ...base,
              kind: "capture",
              business_reference: `capture:${transactionId}`,
              authorization_id: absent(),
            },
            scope,
          );
        }),
      );
    },
  },

  // ---- fulfillment -------------------------------------------------------
  {
    constraint: "fulfillment_organization_id_fkey",
    what: "work coordinated for a tenant that does not exist, which no tenant-scoped read can find or bill",
    async probe(store) {
      return refuse(() =>
        store.fulfillment.insert(fulfillment(absent(), `order-${randomUUID()}`, null), NO_SCOPE),
      );
    },
  },
  {
    constraint: "fulfillment_payment_authorization_id_fkey",
    what: "work guarded by a hold that does not exist, so settlement would have nothing to capture",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.fulfillment.insert(
          {
            ...fulfillment(organizationId, `order-${randomUUID()}`, null),
            payment_authorization_id: absent(),
          },
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- eventing ----------------------------------------------------------
  {
    constraint: "event_delivery_event_id_fkey",
    what: "a signed POST of an envelope CORE never recorded, which no replay can reproduce",
    async probe(store) {
      const subscriber = eventSubscription(
        `parity-${randomUUID()}`,
        "core.fulfillment.completed",
      );
      await store.delivery.insertSubscription(subscriber, NO_SCOPE);
      return refuse(() =>
        store.delivery.queue(delivery(absent(), subscriber.subscription_id), NO_SCOPE),
      );
    },
  },
  {
    constraint: "event_delivery_subscription_id_fkey",
    what: "a delivery to a subscriber with no endpoint and no signing secret to sign it with",
    async probe(store) {
      const eventId = await seedEvent(store);
      return refuse(() => store.delivery.queue(delivery(eventId, absent()), NO_SCOPE));
    },
  },

  // ---- notification ------------------------------------------------------
  {
    constraint: "notification_recipient_identity_id_fkey",
    what: "a notification target that is not a person the platform knows",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() => seedRecipient(store, organizationId, absent()));
    },
  },
  {
    constraint: "notification_recipient_organization_id_fkey",
    what: "a tenant-scoped recipient whose tenant does not exist, which fan-out would then leak across",
    async probe(store) {
      const { identityId } = await seedPrincipal(store);
      return refuse(() => seedRecipient(store, absent(), identityId));
    },
  },
  {
    constraint: "notification_event_id_fkey",
    what: "a message sent because of an event that was never published",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          notification(recipientId, organizationId, { event_id: absent() }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_organization_id_fkey",
    what: "a message attributed to a tenant that does not exist, so no tenant's operators can audit it",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      const eventId = await seedEvent(store);
      return refuse(() =>
        store.notification.queue(
          notification(recipientId, absent(), { event_id: eventId }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_recipient_id_fkey",
    what: "a message addressed to a recipient row that was never created",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const eventId = await seedEvent(store);
      return refuse(() =>
        store.notification.queue(
          notification(absent(), organizationId, { event_id: eventId }),
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- subscription ------------------------------------------------------
  {
    constraint: "plan_grant_plan_id_fkey",
    what: "an entitlement attached to no plan, which no subscription can ever be answered from",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertGrant(
          { plan_id: absent(), feature_key: "api_calls", limit_value: 100 },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_plan_id_fkey",
    what: "a subscription to a plan that does not exist, so its price and interval are unknowable",
    async probe(store) {
      const walletId = await seedWallet(store);
      return refuse(() =>
        store.subscription.insertSubscription(subscription(absent(), walletId), NO_SCOPE),
      );
    },
  },
  {
    constraint: "subscription_wallet_id_fkey",
    what: "a subscription billed to a wallet that does not exist",
    async probe(store) {
      const planId = await seedPlan(store, `parity-${randomUUID().slice(0, 8)}`);
      return refuse(() =>
        store.subscription.insertSubscription(subscription(planId, absent()), NO_SCOPE),
      );
    },
  },
  {
    constraint: "subscription_period_subscription_id_fkey",
    what: "a billing period belonging to no subscription, which would bill nobody for something",
    async probe(store) {
      return refuse(() => store.subscription.insertPeriod(period(absent()), NO_SCOPE));
    },
  },
  {
    constraint: "subscription_period_authorization_id_fkey",
    what: "a period settled by a hold that does not exist, so the money it claims to have taken cannot be traced",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, {
            status: "settled",
            settled_at: NOW,
            authorization_id: absent(),
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "usage_record_period_id_fkey",
    what: "metered usage inside a period that does not exist, which no invoice can contain",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertUsage(
          {
            usage_id: absent(),
            period_id: absent(),
            feature_key: "api_calls",
            quantity: 1,
            usage_reference: `parity-${randomUUID()}`,
            recorded_at: NOW,
            correlation_id: null,
          },
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- reputation --------------------------------------------------------
  {
    constraint: "reputation_signal_organization_id_fkey",
    what: "a rating recorded for a tenant that does not exist, which would move a standing nobody owns",
    async probe(store) {
      return refuse(() =>
        store.reputation.insertIfAbsent(signal(absent(), `parity-${randomUUID()}`), NO_SCOPE),
      );
    },
  },
];

interface Backend {
  readonly name: string;
  open(clock: FixedClock): Promise<{ store: Persistence; close: () => Promise<void> }>;
  truncate(): Promise<void>;
  fresh?(clock: FixedClock): Persistence;
  /** The live schema's keys, read from the catalog. Postgres only. */
  keys?(): Promise<
    readonly { constraint: string; child: string; column: string; parent: string; nullable: boolean }[]
  >;
}

const backends: Backend[] = [
  {
    name: "memory",
    async open(clock) {
      return { store: memoryPersistence(clock), async close() {} };
    },
    async truncate() {},
    fresh(clock) {
      return memoryPersistence(clock);
    },
  },
];

if (url) {
  backends.push({
    name: "postgres",
    async open(clock) {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: url, max: 4 });
      return {
        store: postgresPersistence(pool as never, clock),
        async close() {
          await pool.end();
        },
      };
    },
    async truncate() {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        await pool.query(`truncate ${TABLES} restart identity cascade`);
      } finally {
        await pool.end();
      }
    },
    async keys() {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        // One row per referencing column. Read from the catalog rather than
        // from the migration text: only the database knows what it is actually
        // enforcing after nineteen migrations.
        const declared = await pool.query<{
          constraint: string;
          child: string;
          column: string;
          parent: string;
          notnull: boolean;
        }>(
          `select con.conname as constraint,
                  child.relname as child,
                  att.attname as column,
                  parent.relname as parent,
                  att.attnotnull as notnull
             from pg_constraint con
             join pg_class child on child.oid = con.conrelid
             join pg_class parent on parent.oid = con.confrelid
             join unnest(con.conkey) as k(attnum) on true
             join pg_attribute att
               on att.attrelid = child.oid and att.attnum = k.attnum
            where con.contype = 'f' and con.connamespace = 'public'::regnamespace`,
        );
        return declared.rows.map((row) => ({
          constraint: row.constraint,
          child: row.child,
          column: row.column,
          parent: row.parent,
          nullable: !row.notnull,
        }));
      } finally {
        await pool.end();
      }
    },
  });
}

for (const backend of backends) {
  describe(`foreign key parity on '${backend.name}'`, () => {
    let store: Persistence;
    let close: () => Promise<void>;

    beforeAll(async () => {
      const opened = await backend.open(new FixedClock());
      store = opened.store;
      close = opened.close;
    });
    afterAll(async () => {
      await close();
    });
    beforeEach(async () => {
      await backend.truncate();
      const replacement = backend.fresh?.(new FixedClock());
      if (replacement) store = replacement;
    });

    for (const keyCase of CASES) {
      it(`refuses a row that would violate ${keyCase.constraint}: ${keyCase.what}`, async () => {
        const verdict = await keyCase.probe(store);
        expect(
          verdict.refused,
          `${backend.name} accepted a row violating ${keyCase.constraint}`,
        ).toBe(true);
        if (!verdict.refused) return;
        const named = [keyCase.constraint, ...(keyCase.alsoViolates ?? [])].some((name) =>
          verdict.detail.includes(name),
        );
        expect(
          named,
          `${backend.name} refused the row but did not name ${keyCase.constraint}: ${verdict.detail}`,
        ).toBe(true);
      });
    }
  });
}

/** What `FOREIGN_KEYS` says, flattened for comparison with the catalog. */
function declaredRules(): readonly (ForeignKeyRule & { child: string })[] {
  return Object.entries(FOREIGN_KEYS as Record<string, readonly ForeignKeyRule[]>).flatMap(
    ([child, rules]) => rules.map((rule) => ({ ...rule, child })),
  );
}

describe("foreign key parity coverage", () => {
  it("resolves every parent table a rule reads", () => {
    // The one weakening in the design: a parent nobody registered is a key that
    // cannot be evaluated, and no case would fail for it because the check
    // would accept the orphan. Asserted here so it cannot happen quietly.
    const keys = memoryPersistence(new FixedClock()).referenceKeys;
    expect(keys, "the reference bundle exposes no key registry").toBeDefined();
    expect(
      keys?.unresolvedParents(),
      "a reference store did not hand its map to the bundle registry, so the keys pointing at it cannot be evaluated in memory",
    ).toEqual([]);
    expect(referencedParents().length).toBeGreaterThan(0);
  });

  it("records a reason for every unprobeable key", () => {
    const unexplained = UNPROBEABLE.filter((entry) => entry.why.trim().length === 0);
    expect(unexplained).toEqual([]);
  });

  it("has one case per declared rule and no duplicates", () => {
    const probed = CASES.map((keyCase) => keyCase.constraint);
    expect(probed.length, "two cases probe the same constraint").toBe(new Set(probed).size);
    const declared = new Set(foreignKeyConstraints());
    const unprobed = [...declared].filter((name) => !probed.includes(name)).sort();
    expect(
      unprobed,
      "a key is declared in FOREIGN_KEYS with no parity case, so nothing measures whether the reference backend enforces it",
    ).toEqual([]);
  });
});

/**
 * The gates that need the live schema.
 *
 * Asked of the catalog rather than of the migration text, for the same reason
 * the uniqueness and check gates are: after nineteen migrations only the
 * database knows what it is enforcing.
 */
describe.skipIf(!url)("foreign key parity against the live schema", () => {
  it("covers every foreign key the live schema declares", async () => {
    const postgres = backends.find((backend) => backend.name === "postgres");
    const declared = new Set(((await postgres?.keys?.()) ?? []).map((key) => key.constraint));
    const probed = new Set(CASES.map((keyCase) => keyCase.constraint));
    const excused = new Set(UNPROBEABLE.map((entry) => entry.constraint));
    const uncovered = [...declared].filter((name) => !probed.has(name) && !excused.has(name)).sort();
    const stale = [...probed, ...excused].filter((name) => !declared.has(name)).sort();
    expect(
      uncovered,
      "a migration added a foreign key with neither a parity case nor a recorded reason it cannot be probed; the reference backend is free to accept orphans Postgres refuses until one exists",
    ).toEqual([]);
    expect(stale, "a case or exemption names a key the schema no longer declares").toEqual([]);
  });

  it("declares each key exactly as the schema does", async () => {
    const postgres = backends.find((backend) => backend.name === "postgres");
    const live = new Map(((await postgres?.keys?.()) ?? []).map((key) => [key.constraint, key]));
    const declared = new Set(declaredRules().map((rule) => rule.constraint));
    const excused = new Set(UNPROBEABLE.map((entry) => entry.constraint));
    const undeclared = [...live.keys()]
      .filter((name) => !declared.has(name) && !excused.has(name))
      .sort();
    expect(
      undeclared,
      "the live schema declares a foreign key FOREIGN_KEYS does not, so the reference backend enforces nothing for it",
    ).toEqual([]);
    const mismatches: string[] = [];
    for (const rule of declaredRules()) {
      const actual = live.get(rule.constraint);
      if (!actual) {
        mismatches.push(`${rule.constraint}: not declared by the live schema`);
        continue;
      }
      if (actual.child !== rule.child) {
        mismatches.push(`${rule.constraint}: on ${actual.child}, declared on ${rule.child}`);
      }
      if (actual.column !== rule.column) {
        mismatches.push(`${rule.constraint}: reads ${actual.column}, declared ${rule.column}`);
      }
      if (actual.parent !== rule.parent) {
        mismatches.push(`${rule.constraint}: references ${actual.parent}, declared ${rule.parent}`);
      }
      if (actual.nullable !== rule.nullable) {
        // Nullability is not cosmetic: `MATCH SIMPLE` means a null reference
        // satisfies the key, so declaring a `NOT NULL` column nullable would
        // wave a null through as "references nothing", and the reverse would
        // refuse a row Postgres accepts.
        mismatches.push(
          `${rule.constraint}: column is ${actual.nullable ? "nullable" : "NOT NULL"}, declared ${rule.nullable ? "nullable" : "NOT NULL"}`,
        );
      }
    }
    expect(
      mismatches,
      "FOREIGN_KEYS disagrees with the live schema, so the reference backend is enforcing something the database does not",
    ).toEqual([]);
  });
});
