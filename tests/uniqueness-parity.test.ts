/**
 * Every uniqueness rule in the schema, probed against both backends (B-12).
 *
 * Why this file exists, and why it is a table rather than prose: the schema
 * declares twenty-four uniqueness rules — UNIQUE constraints, one
 * `EXCLUDE USING gist`, and three partial unique indexes — and the reference
 * store is a `Map`, which enforces exactly one of them for free: the primary
 * key. Every other rule has to be restated by hand, and until this cycle most of
 * them were not. Where a rule is missing from the reference store the in-memory
 * backend accepts a row Postgres refuses, so a dual-backend test can pass on a
 * race production would have rejected, and the suite's green means less than it
 * looks. That is the same defect B-12 recorded for money, which was fixed for
 * money only.
 *
 * Two properties are asserted per rule, and the second is the one that turns
 * this from a checklist into a gate:
 *
 *   1. **Both backends refuse the second row.** Refusal means an error for a
 *      plain insert, or the documented "already there" outcome for the ports
 *      whose contract is idempotent (`queue`, `insertIfAbsent`) — recorded per
 *      case, so a store cannot quietly swap one for the other.
 *   2. **Both backends refuse it for the same stated reason.** The error names
 *      the constraint or index in the schema, so a reference store cannot pass
 *      by refusing the write for an unrelated reason, and an operator reading a
 *      memory-backend stack trace is looking at the production constraint name.
 *
 * And one property is asserted about the file itself: with `DATABASE_URL` set,
 * `covers every uniqueness rule the live schema declares` reads
 * `pg_constraint`/`pg_indexes` and fails if the schema holds a rule this table
 * does not probe. A migration that adds a UNIQUE therefore cannot ship without
 * a parity case — which is the difference between having fixed this once and
 * keeping it fixed. The enumeration needs a real database, so it is skipped
 * without one; the CI database job runs it on every push.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../src/platform/clock.js";
import {
  memoryPersistence,
  postgresPersistence,
  type Persistence,
} from "../src/platform/persistence/backends.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";
import {
  delivery,
  eventSubscription,
  fulfillment,
  identity,
  LATER,
  notification,
  NOW,
  organization,
  period,
  refuse,
  seedAuthorization,
  seedCapturedAuthorization,
  seedCountry,
  seedEvent,
  seedPlan,
  seedPrincipal,
  seedRecipient,
  seedSubscription,
  seedWallet,
  signal,
  type Verdict,
} from "./support/rows.js";

const url = process.env.DATABASE_URL;

const TABLES = `reputation_signal, notification, notification_recipient, membership,
  session, principal, identity_link, identity, fulfillment, ledger_entry,
  ledger_transaction, payment_authorization, wallet, usage_record,
  subscription_period, subscription, plan_grant, plan, event_delivery,
  event_subscription, inbound_event, organization, outbox, inbox,
  idempotency_key, audit_entry, service_area, city, region`;

interface ParityCase {
  /** The constraint or index name in the schema. */
  readonly rule: string;
  /** What a second row would mean if it were accepted. */
  readonly what: string;
  /**
   * How refusal is expressed by this port.
   *
   * `error` for a plain insert. `outcome` for the ports whose contract is
   * idempotent by design, where a returned value is the refusal and an
   * exception would be wrong: re-running a fan-out must be free.
   */
  readonly refusal: "error" | "outcome";
  /** The exact value an `outcome` port must return for the second write. */
  readonly outcome?: string;
  /**
   * Names that count as naming the rule. Needed where Postgres truncates a
   * generated constraint name at 63 characters, so the schema's name and the
   * columns it is built from do not match character for character.
   */
  readonly aliases?: readonly string[];
  /** Seeds whatever the second write needs, then attempts it. */
  probe(store: Persistence): Promise<Verdict>;
}

const CASES: readonly ParityCase[] = [
  {
    rule: "identity_legacy_idx",
    what: "one legacy record imported twice as two identities",
    refusal: "error",
    async probe(store) {
      await store.identity.insertIdentity(identity(randomUUID(), "legacy-1"), NO_SCOPE);
      return refuse(() =>
        store.identity.insertIdentity(identity(randomUUID(), "legacy-1"), NO_SCOPE),
      );
    },
  },
  {
    rule: "identity_link_channel_type_external_id_key",
    what: "one channel account pointing at two identities",
    refusal: "error",
    async probe(store) {
      const first = randomUUID();
      const second = randomUUID();
      await store.identity.insertIdentity(identity(first), NO_SCOPE);
      await store.identity.insertIdentity(identity(second), NO_SCOPE);
      await store.identity.insertLink(
        {
          identity_link_id: randomUUID(),
          identity_id: first,
          channel_type: "telegram",
          external_id: "tg-1",
          verified_at: NOW,
          created_at: NOW,
        },
        NO_SCOPE,
      );
      return refuse(() =>
        store.identity.insertLink(
          {
            identity_link_id: randomUUID(),
            identity_id: second,
            channel_type: "telegram",
            external_id: "tg-1",
            verified_at: NOW,
            created_at: NOW,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "principal_identity_id_key",
    what: "two principals for one identity, so a permission answer depends on which is read",
    refusal: "error",
    async probe(store) {
      const { identityId } = await seedPrincipal(store);
      return refuse(() =>
        store.identity.insertPrincipal(
          { principal_id: randomUUID(), identity_id: identityId, created_at: NOW, service_name: null, issues_for_channels: [] },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "principal_service_name_key",
    what: "two principals answering to one service credential",
    refusal: "error",
    async probe(store) {
      const first = randomUUID();
      const second = randomUUID();
      await store.identity.insertIdentity(identity(first), NO_SCOPE);
      await store.identity.insertIdentity(identity(second), NO_SCOPE);
      await store.identity.insertPrincipal(
        { principal_id: randomUUID(), identity_id: first, created_at: NOW, service_name: "move", issues_for_channels: [] },
        NO_SCOPE,
      );
      return refuse(() =>
        store.identity.insertPrincipal(
          { principal_id: randomUUID(), identity_id: second, created_at: NOW, service_name: "move", issues_for_channels: [] },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "session_token_hash_key",
    what: "one bearer token resolving to two sessions",
    refusal: "error",
    async probe(store) {
      const { principalId } = await seedPrincipal(store);
      const session = (id: string) => ({
        session_id: id,
        principal_id: principalId,
        token_hash: "hash-parity",
        channel_type: "web" as const,
        issued_at: NOW,
        expires_at: LATER,
        revoked_at: null,
      });
      await store.identity.insertSession(session(randomUUID()), NO_SCOPE);
      return refuse(() => store.identity.insertSession(session(randomUUID()), NO_SCOPE));
    },
  },
  {
    rule: "membership_principal_id_organization_id_key",
    what: "two membership rows for one principal in one organization, with different roles",
    refusal: "error",
    async probe(store) {
      const { principalId } = await seedPrincipal(store);
      const organizationId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.identity.insertMembership(
        {
          membership_id: randomUUID(),
          principal_id: principalId,
          organization_id: organizationId,
          roles: ["org_member"],
          created_at: NOW,
        },
        NO_SCOPE,
      );
      return refuse(() =>
        store.identity.insertMembership(
          {
            membership_id: randomUUID(),
            principal_id: principalId,
            organization_id: organizationId,
            roles: ["org_admin"],
            created_at: NOW,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "organization_legacy_idx",
    what: "one legacy organization imported twice",
    refusal: "error",
    async probe(store) {
      await store.organization.insert(organization(randomUUID(), "legacy-org"), NO_SCOPE);
      return refuse(() =>
        store.organization.insert(organization(randomUUID(), "legacy-org"), NO_SCOPE),
      );
    },
  },
  {
    rule: "region_country_code_code_key",
    what: "one region code meaning two regions inside one country",
    refusal: "error",
    async probe(store) {
      await seedCountry(store);
      const region = (id: string) => ({
        region_id: id,
        country_code: "SA",
        code: "MK",
        name: "Mecca Region",
        status: "active" as const,
      });
      await store.geography.insertRegion(region(randomUUID()), NO_SCOPE);
      return refuse(() => store.geography.insertRegion(region(randomUUID()), NO_SCOPE));
    },
  },
  {
    rule: "wallet_owner_type_owner_id_currency_key",
    what: "one owner holding two wallets in one currency, so a balance has two homes",
    refusal: "error",
    async probe(store) {
      const ownerId = randomUUID();
      const wallet = (id: string) => ({
        wallet_id: id,
        owner_type: "organization" as const,
        owner_id: ownerId,
        currency: "SAR" as const,
        status: "active" as const,
        created_at: NOW,
      });
      await store.money.insertWallet(wallet(randomUUID()), NO_SCOPE);
      return refuse(() => store.money.insertWallet(wallet(randomUUID()), NO_SCOPE));
    },
  },
  {
    rule: "payment_authorization_business_reference_key",
    what: "one business reference holding two payment authorizations",
    refusal: "error",
    async probe(store) {
      const walletId = await seedWallet(store);
      await seedAuthorization(store, walletId, "hold:parity");
      return refuse(() => seedAuthorization(store, walletId, "hold:parity"));
    },
  },
  {
    rule: "ledger_transaction_business_reference_key",
    what: "the same movement recorded twice, so the money moves twice",
    refusal: "error",
    async probe(store) {
      const transaction = (id: string) => ({
        transaction_id: id,
        kind: "credit" as const,
        business_reference: "credit:parity",
        authorization_id: null,
        occurred_at: NOW,
        entries: [
          {
            entry_id: randomUUID(),
            transaction_id: id,
            account_reference: "external:funding",
            amount_minor: -1_000,
            currency: "SAR" as const,
          },
          {
            entry_id: randomUUID(),
            transaction_id: id,
            account_reference: "wallet:parity",
            amount_minor: 1_000,
            currency: "SAR" as const,
          },
        ],
      });
      await store.boundary.run((scope) =>
        store.money.insertTransaction(transaction(randomUUID()), scope),
      );
      return refuse(() =>
        store.boundary.run((scope) =>
          store.money.insertTransaction(transaction(randomUUID()), scope),
        ),
      );
    },
  },
  {
    rule: "fulfillment_market_order_reference_key",
    what: "one MARKET order coordinated twice",
    refusal: "error",
    async probe(store) {
      const organizationId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.fulfillment.insert(fulfillment(organizationId, "order-parity", null), NO_SCOPE);
      return refuse(() =>
        store.fulfillment.insert(fulfillment(organizationId, "order-parity", null), NO_SCOPE),
      );
    },
  },
  {
    rule: "fulfillment_move_job_reference_key",
    what: "one MOVE job attached to two fulfillments, so a completion report is ambiguous",
    refusal: "error",
    async probe(store) {
      const organizationId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.fulfillment.insert(
        fulfillment(organizationId, "order-a", "job-parity"),
        NO_SCOPE,
      );
      return refuse(() =>
        store.fulfillment.insert(fulfillment(organizationId, "order-b", "job-parity"), NO_SCOPE),
      );
    },
  },
  {
    rule: "event_subscription_subscriber_event_type_key",
    what: "one subscriber registered twice for one event type, so every event fans out twice",
    refusal: "error",
    async probe(store) {
      await store.delivery.insertSubscription(eventSubscription("move", "core.fulfillment.completed"));
      return refuse(() =>
        store.delivery.insertSubscription(eventSubscription("move", "core.fulfillment.completed")),
      );
    },
  },
  {
    rule: "event_delivery_event_id_subscription_id_key",
    what: "one event queued twice for one subscription",
    refusal: "outcome",
    outcome: "false",
    async probe(store) {
      const subscription = eventSubscription("move", "core.fulfillment.completed");
      await store.delivery.insertSubscription(subscription);
      const eventId = await seedEvent(store);
      await store.delivery.queue(delivery(eventId, subscription.subscription_id));
      const queued = await store.delivery.queue(delivery(eventId, subscription.subscription_id));
      return queued
        ? { refused: false }
        : { refused: true, kind: "outcome", detail: String(queued) };
    },
  },
  {
    rule: "notification_recipient_organization_id_event_type_identity__key",
    aliases: ["notification_recipient_organization_id_event_type_identity"],
    what: "one person registered twice for one event type on one channel",
    refusal: "error",
    async probe(store) {
      const organizationId = randomUUID();
      const identityId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.identity.insertIdentity(identity(identityId), NO_SCOPE);
      await seedRecipient(store, organizationId, identityId);
      return refuse(() => seedRecipient(store, organizationId, identityId));
    },
  },
  {
    rule: "notification_event_id_recipient_id_key",
    what: "one event notifying one person twice",
    refusal: "outcome",
    outcome: "false",
    async probe(store) {
      const organizationId = randomUUID();
      const identityId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.identity.insertIdentity(identity(identityId), NO_SCOPE);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      const eventId = await seedEvent(store);
      await store.notification.queue(notification(recipientId, organizationId, { event_id: eventId }));
      const queued = await store.notification.queue(
        notification(recipientId, organizationId, { event_id: eventId }),
      );
      return queued
        ? { refused: false }
        : { refused: true, kind: "outcome", detail: String(queued) };
    },
  },
  {
    rule: "notification_idempotency_key_key",
    what: "one idempotency key reused for a different message, which is a collision, not a retry",
    refusal: "error",
    async probe(store) {
      const organizationId = randomUUID();
      const identityId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.identity.insertIdentity(identity(identityId), NO_SCOPE);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      const key = `parity-${randomUUID()}`;
      await store.notification.queue(
        notification(recipientId, organizationId, {
          event_id: await seedEvent(store),
          idempotency_key: key,
        }),
      );
      // A different event, so the (event_id, recipient_id) rule is not what
      // refuses this: the collision under test is the key itself.
      const otherEvent = await seedEvent(store);
      return refuse(() =>
        store.notification.queue(
          notification(recipientId, organizationId, {
            event_id: otherEvent,
            idempotency_key: key,
          }),
        ),
      );
    },
  },
  {
    rule: "plan_code_key",
    what: "one plan code priced two ways",
    refusal: "error",
    async probe(store) {
      await seedPlan(store, "parity-code");
      return refuse(() => seedPlan(store, "parity-code"));
    },
  },
  {
    rule: "subscription_period_sequence_unique",
    what: "two period 3s on one subscription, so a billing history has no order",
    refusal: "error",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      await store.subscription.insertPeriod(
        period(subscriptionId, { sequence: 3, starts_at: NOW, ends_at: LATER }),
        NO_SCOPE,
      );
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, {
            sequence: 3,
            starts_at: "2026-03-01T00:00:00.000Z",
            ends_at: "2026-04-01T00:00:00.000Z",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "subscription_period_no_overlap",
    what: "two periods covering the same instant, so one month is billed twice",
    refusal: "error",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      await store.subscription.insertPeriod(
        period(subscriptionId, { sequence: 1, starts_at: NOW, ends_at: LATER }),
        NO_SCOPE,
      );
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, {
            sequence: 2,
            starts_at: "2026-01-15T00:00:00.000Z",
            ends_at: "2026-03-01T00:00:00.000Z",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "subscription_period_authorization_unique",
    what: "one hold settling two periods, so one payment is claimed twice",
    refusal: "error",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      const walletId = await seedWallet(store);
      const authorizationId = await seedCapturedAuthorization(store, walletId);
      await store.subscription.insertPeriod(
        period(subscriptionId, {
          sequence: 1,
          starts_at: NOW,
          ends_at: LATER,
          status: "settled",
          settled_at: NOW,
          authorization_id: authorizationId,
        }),
        NO_SCOPE,
      );
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, {
            sequence: 2,
            starts_at: LATER,
            ends_at: "2026-03-01T00:00:00.000Z",
            status: "settled",
            settled_at: LATER,
            authorization_id: authorizationId,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    rule: "usage_record_once",
    what: "one reported usage counted twice against a quota",
    refusal: "error",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      const periodRow = period(subscriptionId, { sequence: 1, starts_at: NOW, ends_at: LATER });
      await store.subscription.insertPeriod(periodRow, NO_SCOPE);
      const usage = () => ({
        usage_id: randomUUID(),
        period_id: periodRow.period_id,
        feature_key: "orders",
        quantity: 1,
        usage_reference: "usage-parity",
        recorded_at: "2026-01-05T00:00:00.000Z",
        correlation_id: "corr-parity",
      });
      await store.subscription.insertUsage(usage(), NO_SCOPE);
      return refuse(() => store.subscription.insertUsage(usage(), NO_SCOPE));
    },
  },
  {
    rule: "reputation_signal_source_unique",
    what: "one reported review counted twice in a standing",
    refusal: "outcome",
    outcome: "duplicate_source_reference",
    async probe(store) {
      const organizationId = randomUUID();
      await store.organization.insert(organization(organizationId), NO_SCOPE);
      await store.reputation.insertIfAbsent(signal(organizationId, "review-parity"), NO_SCOPE);
      const outcome = await store.reputation.insertIfAbsent(
        signal(organizationId, "review-parity"),
        NO_SCOPE,
      );
      return outcome === "inserted"
        ? { refused: false }
        : { refused: true, kind: "outcome", detail: outcome };
    },
  },
] as const;

interface Backend {
  readonly name: string;
  open(clock: FixedClock): Promise<{ store: Persistence; close(): Promise<void> }>;
  /**
   * Empties the backend between cases.
   *
   * For Postgres that is a truncation; for the reference store it is a new
   * instance, because a `Map` has nothing to truncate and leaving one in place
   * would let an earlier case's rows refuse a later case's write — a green that
   * proves the wrong rule.
   */
  truncate(): Promise<void>;
  fresh?(clock: FixedClock): Persistence;
  /** Only the Postgres backend can enumerate the live schema. */
  rules?(): Promise<readonly string[]>;
}

const backends: Backend[] = [
  {
    name: "in-memory",
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
    async rules() {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        const constraints = await pool.query<{ name: string }>(
          `select conname as name from pg_constraint
            where connamespace = 'public'::regnamespace and contype in ('u','x')`,
        );
        const indexes = await pool.query<{ name: string }>(
          `select indexname as name from pg_indexes
            where schemaname = 'public'
              and indexdef like '%UNIQUE%'
              and indexname not in (
                select conname from pg_constraint where connamespace = 'public'::regnamespace
              )`,
        );
        return [...constraints.rows, ...indexes.rows].map((row) => row.name);
      } finally {
        await pool.end();
      }
    },
  });
}

for (const backend of backends) {
  describe(`uniqueness parity on '${backend.name}'`, () => {
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

    for (const parityCase of CASES) {
      it(`refuses a second row that would violate ${parityCase.rule}: ${parityCase.what}`, async () => {
        const verdict = await parityCase.probe(store);
        // The message names the whole point of the assertion: a backend that
        // accepts this row is a backend that certifies the defect.
        expect(verdict.refused, `${backend.name} accepted a row violating ${parityCase.rule}`).toBe(
          true,
        );
        if (!verdict.refused) return;
        expect(verdict.kind).toBe(parityCase.refusal);
        if (parityCase.refusal === "outcome") {
          expect(verdict.detail).toBe(parityCase.outcome);
          return;
        }
        // Same refusal, same stated reason. Without this a reference store could
        // pass by rejecting the write for something unrelated, and the two
        // backends would still be telling an operator different stories.
        const named = [parityCase.rule, ...(parityCase.aliases ?? [])].some((name) =>
          verdict.detail.includes(name),
        );
        expect(
          named,
          `${backend.name} refused the row but did not name ${parityCase.rule}: ${verdict.detail}`,
        ).toBe(true);
      });
    }
  });
}

/**
 * The gate on this file.
 *
 * Enumerating the rules from the live schema rather than from the migration text
 * is deliberate: a `UNIQUE` written inline gets a generated name, and a parser
 * would have to reinvent Postgres's naming to find it. This asks the database
 * what it is actually enforcing, which is the same question the parity cases
 * answer.
 */
describe.skipIf(!url)("uniqueness parity coverage", () => {
  it("covers every uniqueness rule the live schema declares", async () => {
    const postgres = backends.find((backend) => backend.name === "postgres");
    const declared = new Set((await postgres?.rules?.()) ?? []);
    const probed = new Set(CASES.map((parityCase) => parityCase.rule));
    const unprobed = [...declared].filter((rule) => !probed.has(rule)).sort();
    const stale = [...probed].filter((rule) => !declared.has(rule)).sort();
    expect(
      unprobed,
      "a migration added a uniqueness rule with no parity case; the reference backend is free to accept what Postgres refuses until one exists",
    ).toEqual([]);
    expect(stale, "a parity case names a rule the schema no longer declares").toEqual([]);
  });
});
