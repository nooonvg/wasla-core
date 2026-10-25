/**
 * Every `CHECK` constraint in the schema, probed against both backends (B-12).
 *
 * The uniqueness cycle closed the same gap for uniqueness rules and left this
 * one open: the schema declares a hundred `CHECK` constraints, and until this
 * cycle the reference store restated thirty-one of them. The other sixty-nine
 * were enforced by Postgres alone, so a dual-backend test could store a status
 * no reader understands, a currency that is not a currency, a claim token with
 * no claim, or a delivered notification with no delivery time — and pass. A
 * green in-memory run then certified rows production would have refused, which
 * is exactly the defect B-12 names.
 *
 * Each case takes a row the live schema accepts, breaks **one** field, and
 * asserts two things on both backends:
 *
 *   1. **The write is refused.** Acceptance by either backend fails the case.
 *   2. **The refusal names the constraint.** Not merely "invalid": the schema's
 *      own name, so a reference-store stack trace and a production stack trace
 *      read the same, and a store cannot pass by refusing the row for an
 *      unrelated reason.
 *
 * Where breaking one field unavoidably breaks a second constraint that reads it
 * — an unknown `fulfillment.status` also falsifies the coupling between status
 * and settlement state — the case lists that constraint in `alsoViolates` and
 * either name is accepted. Postgres does not promise which of two violated
 * constraints it reports, so demanding one would be asserting an implementation
 * detail rather than the rule.
 *
 * Twelve constraints are recorded as unprobeable rather than probed, each with
 * the reason: no port lets a caller name the value, so no test can construct the
 * violating row through the ports the application uses. They are listed in
 * `UNPROBEABLE`, the coverage gate counts them, and the ones whose columns exist
 * in the reference rows are still declared in `ROW_RULES` — enforced on every
 * internal transition even though a caller cannot reach them.
 *
 * The gate on the file is `covers every check constraint the live schema
 * declares`: it reads `pg_constraint` and fails when a `CHECK` has neither a
 * case nor a recorded reason. A migration adding one cannot ship without
 * measuring parity for it.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../src/platform/clock.js";
import { makeEvent } from "../src/platform/eventing/envelope.js";
import {
  memoryPersistence,
  postgresPersistence,
  type Persistence,
} from "../src/platform/persistence/backends.js";
import { ruledConstraints } from "../src/platform/persistence/row-rules.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";
import {
  auditEntry,
  authorization,
  city,
  country,
  delivery,
  eventSubscription,
  fulfillment,
  identity,
  LATER,
  notification,
  NOW,
  period,
  plan,
  refuse,
  region,
  seedEvent,
  seedGeography,
  seedOrganization,
  seedPrincipal,
  seedRecipient,
  seedSubscription,
  serviceArea,
  signal,
  subscription,
  transaction,
  wallet,
  type Verdict,
} from "./support/rows.js";

const url = process.env.DATABASE_URL;

const TABLES = `reputation_signal, notification, notification_recipient, membership,
  session, principal, identity_link, identity, fulfillment, ledger_entry,
  ledger_transaction, payment_authorization, wallet, usage_record,
  subscription_period, subscription, plan_grant, plan, event_delivery,
  event_subscription, inbound_event, organization, outbox, inbox,
  idempotency_key, audit_entry, service_area, city, region`;

/**
 * A row with one field replaced by a value its TypeScript type forbids.
 *
 * The cast is the point rather than a shortcut. A status or currency arriving in
 * an HTTP body or an external event payload is a `string` at runtime whatever
 * the domain type says, so these rows are reachable in production and the
 * database is what refuses them. Writing the probe without a cast would only
 * prove the compiler works.
 */
function broken<T>(row: T, changes: Record<string, unknown>): T {
  return { ...row, ...changes } as T;
}

interface CheckCase {
  /** The constraint name in the schema. */
  readonly constraint: string;
  /** What accepting this row would mean. */
  readonly what: string;
  /**
   * Constraints the same row unavoidably violates because they read the field
   * this case breaks. Either name counts as naming the rule.
   */
  readonly alsoViolates?: readonly string[];
  probe(store: Persistence): Promise<Verdict>;
}

/** A `CHECK` no port lets a caller violate, with the reason it cannot be probed. */
interface Unprobeable {
  readonly constraint: string;
  readonly why: string;
  /** Whether `ROW_RULES` still restates it for the store's own transitions. */
  readonly declared: boolean;
}

const UNPROBEABLE: readonly Unprobeable[] = [
  {
    constraint: "idempotency_key_state_ck",
    why: "the state is the store's own: `claim` writes 'claimed' and `complete` writes 'completed', and no caller supplies one — the same reason the outbox and inbound-event status checks are here",
    declared: true,
  },
  {
    constraint: "idempotency_key_state_record_ck",
    why: "no port call can ask for the rows it forbids. A completed row with no status is unreachable because `complete` takes the status as an argument and stamps completed_at itself; a claimed row carrying an answer is unreachable because `claim` writes the three answer columns as null in the same statement that creates the row. It is declared all the same, because the nullability milestone 33 had to add to response_status is only safe while this holds",
    declared: true,
  },
  {
    constraint: "outbox_status_check",
    why: "`append` takes an envelope, never a status: the store sets 'pending' and only its own transitions change it",
    declared: true,
  },
  {
    constraint: "outbox_claim_check",
    why: "claims are stamped by `claimDue` and cleared by acknowledgement; no caller supplies claimed_at",
    declared: true,
  },
  {
    constraint: "outbox_claim_token_check",
    why: "the fencing token is minted by `claimDue`; no caller supplies one",
    declared: true,
  },
  {
    constraint: "outbox_reclaims_check",
    why: "the reclaim count is incremented by recovery alone; no caller supplies it",
    declared: true,
  },
  {
    constraint: "inbound_event_status_check",
    why: "`accept` takes an envelope; the status is the store's, set to 'pending' and moved only by acknowledgement",
    declared: true,
  },
  {
    constraint: "inbound_event_claim_check",
    why: "claims are stamped by `claimDue`; no caller supplies claimed_at",
    declared: true,
  },
  {
    constraint: "inbound_event_claim_token_check",
    why: "the fencing token is minted by `claimDue`; no caller supplies one",
    declared: true,
  },
  {
    constraint: "inbound_event_reclaims_check",
    why: "the reclaim count is incremented by recovery alone; no caller supplies it",
    declared: true,
  },
  {
    constraint: "inbound_event_processed_at_check",
    why: "processed_at is a Postgres column with no field in the reference record: the reference store answers 'processed' from the status it holds, so there is no second value that can disagree with it",
    declared: false,
  },
  {
    constraint: "rate_limit_counter_hits_ck",
    // Rewritten in milestone 19. The old reason was "there is no row and no
    // caller-supplied count"; the first half stopped being true when the
    // reference limiter started writing rows, so the exemption is now the
    // narrower claim that survives: the count is still not caller-supplied. It
    // is `declared: true` now, so the rule runs on the store's own writes and
    // the gate below checks it is restated in `ROW_RULES`.
    why: "hits is incremented by the limiter from zero and reaches no caller's hand; the rule is declared and runs on the store's own row, but no caller can express a negative count to probe it with",
    declared: true,
  },
];

const CASES: readonly CheckCase[] = [
  // ---- audit -------------------------------------------------------------
  {
    constraint: "audit_entry_actor_type_check",
    what: "an audit trail whose actor is a kind no reviewer can interpret",
    async probe(store) {
      return refuse(() => store.audit.record(broken(auditEntry(), { actor_type: "ghost" }), NO_SCOPE));
    },
  },

  // ---- rate limiting -----------------------------------------------------
  // Both of these were recorded as unprobeable until milestone 19, on the
  // grounds that the reference limiter kept a map key rather than a row. It
  // keeps a row now, so the claim is testable and is tested: these two run on
  // both backends like every other case in this file.
  {
    constraint: "rate_limit_counter_subject_kind_ck",
    what: "a rate-limit window for a subject kind no policy can price",
    async probe(store) {
      return refuse(() =>
        store.rateLimit.hit(
          { subject_kind: "ghost" as never, subject_hash: "h", rate_class: "read" },
          new Date("2026-01-01T00:00:00.000Z"),
        ),
      );
    },
  },
  {
    constraint: "rate_limit_counter_rate_class_ck",
    what: "a rate-limit window counted against a class no route belongs to",
    async probe(store) {
      return refuse(() =>
        store.rateLimit.hit(
          { subject_kind: "network", subject_hash: "h", rate_class: "ghost" as never },
          new Date("2026-01-01T00:00:00.000Z"),
        ),
      );
    },
  },

  // ---- retry records -----------------------------------------------------
  // Milestone 32. The rule the router relies on is "a refusal is never
  // recorded", and the router is where it is implemented; this case is what
  // makes it a property of the schema instead. Probed through the port a
  // caller's request actually reaches, because that is the path a future
  // change would break: the store is asked to record a `400`, which is what
  // recording a refusal looks like from here.
  {
    constraint: "idempotency_key_response_status_ck",
    what: "a recorded refusal, which would answer a caller's corrected request with the old rejection",
    async probe(store) {
      // Two calls since milestone 33, because the row is now claimed before it
      // is completed: the claim is legitimate and the completion is what the
      // constraint has to refuse. Probed through the port a caller's request
      // actually reaches, because that is the path a future change would break.
      const lookup = {
        key: "check-parity-refusal",
        method: "POST",
        scope: "/v1/organizations",
      };
      const claimed = await store.retry.claim({
        ...lookup,
        request_fingerprint: "f".repeat(64),
      });
      if (claimed.outcome !== "claimed") {
        throw new Error(`the probe could not claim: ${claimed.outcome}`);
      }
      return refuse(() =>
        store.retry.complete({
          ...lookup,
          claim_token: claimed.claim_token,
          response_status: 400,
          response_body: { error: { code: "invalid_request" } },
        }),
      );
    },
  },

  // ---- geography ---------------------------------------------------------
  {
    constraint: "country_country_code_check",
    what: "a country code that is not an ISO alpha-2 code, so joins on it silently miss",
    async probe(store) {
      return refuse(() =>
        store.geography.upsertCountry(broken(country(), { country_code: "sa" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "country_default_currency_check",
    what: "a default currency no money column would match",
    async probe(store) {
      return refuse(() =>
        store.geography.upsertCountry(broken(country(), { default_currency: "sar" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "country_status_check",
    what: "a country in a state nothing knows how to read",
    async probe(store) {
      return refuse(() =>
        store.geography.upsertCountry(broken(country(), { status: "provisional" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "region_status_check",
    what: "a region in a state nothing knows how to read",
    async probe(store) {
      await store.geography.upsertCountry(country(), NO_SCOPE);
      return refuse(() =>
        store.geography.insertRegion(broken(region(), { status: "provisional" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "city_latitude_check",
    what: "a latitude off the planet, which every distance calculation would still use",
    async probe(store) {
      const { regionId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertCity(broken(city(regionId), { latitude: 91 }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "city_longitude_check",
    what: "a longitude off the planet",
    async probe(store) {
      const { regionId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertCity(broken(city(regionId), { longitude: -181 }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "city_status_check",
    what: "a city in a state nothing knows how to read",
    async probe(store) {
      const { regionId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertCity(broken(city(regionId), { status: "planned" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "service_area_centre_latitude_check",
    what: "a service area centred off the planet",
    async probe(store) {
      const { cityId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertServiceArea(
          broken(serviceArea(cityId), { centre_latitude: -91 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "service_area_centre_longitude_check",
    what: "a service area centred off the planet",
    async probe(store) {
      const { cityId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertServiceArea(
          broken(serviceArea(cityId), { centre_longitude: 181 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "service_area_radius_metres_check",
    what: "a 'local' area with a thousand-kilometre radius, or none at all",
    async probe(store) {
      const { cityId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertServiceArea(
          broken(serviceArea(cityId), { radius_metres: 1_000_000 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "service_area_status_check",
    what: "a service area in a state nothing knows how to read",
    async probe(store) {
      const { cityId } = await seedGeography(store);
      return refuse(() =>
        store.geography.insertServiceArea(
          broken(serviceArea(cityId), { status: "draft" }),
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- identity and access ----------------------------------------------
  {
    constraint: "identity_status_check",
    what: "an identity in a state no authorisation decision can evaluate",
    async probe(store) {
      return refuse(() =>
        store.identity.insertIdentity(
          broken(identity(randomUUID()), { status: "archived" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "identity_merged_requires_canonical",
    what: "an identity merged into nobody: every read that follows the chain dead-ends",
    async probe(store) {
      return refuse(() =>
        store.identity.insertIdentity(
          broken(identity(randomUUID()), { status: "merged", canonical_identity_id: null }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "identity_link_channel_type_check",
    what: "a channel account on a channel CORE cannot deliver to",
    async probe(store) {
      const { identityId } = await seedPrincipal(store);
      return refuse(() =>
        store.identity.insertLink(
          broken(
            {
              identity_link_id: randomUUID(),
              identity_id: identityId,
              channel_type: "telegram" as const,
              external_id: `tg-${randomUUID()}`,
              verified_at: NOW,
              created_at: NOW,
              deleted_at: null,
            },
            { channel_type: "carrier_pigeon" },
          ),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "principal_service_name_check",
    what: "a service principal named by the empty string, which no policy can match",
    async probe(store) {
      const identityId = randomUUID();
      await store.identity.insertIdentity(identity(identityId), NO_SCOPE);
      return refuse(() =>
        store.identity.insertPrincipal(
          {
            principal_id: randomUUID(),
            identity_id: identityId,
            created_at: NOW,
            service_name: "",
            issues_for_channels: [],
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "principal_issues_for_channels_check",
    what: "a person carrying issuance channels, which would make them a delegated issuer nobody provisioned",
    async probe(store) {
      const identityId = randomUUID();
      await store.identity.insertIdentity(identity(identityId), NO_SCOPE);
      return refuse(() =>
        store.identity.insertPrincipal(
          {
            principal_id: randomUUID(),
            identity_id: identityId,
            created_at: NOW,
            service_name: null,
            issues_for_channels: ["telegram"],
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "membership_roles_check",
    what: "a membership granting nothing, which reads as belonging without permission",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { principalId } = await seedPrincipal(store);
      return refuse(() =>
        store.identity.insertMembership(
          {
            membership_id: randomUUID(),
            principal_id: principalId,
            organization_id: organizationId,
            roles: [],
            created_at: NOW,
            deleted_at: null,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "organization_status_check",
    what: "an organization in a state nothing knows how to read",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      void organizationId;
      return refuse(() =>
        store.organization.insert(
          broken(
            {
              organization_id: randomUUID(),
              name: "Parity",
              status: "active" as const,
              country_code: "SA",
              created_at: NOW,
              updated_at: NOW,
              source_system: "parity",
              legacy_id: null,
            },
            { status: "dormant" },
          ),
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- money -------------------------------------------------------------
  {
    constraint: "wallet_currency_check",
    what: "a wallet in a currency no amount column can be compared against",
    async probe(store) {
      return refuse(() =>
        store.money.insertWallet(broken(wallet(), { currency: "sar" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "wallet_owner_type_check",
    what: "a wallet owned by a kind of thing CORE does not model",
    async probe(store) {
      return refuse(() =>
        store.money.insertWallet(broken(wallet(), { owner_type: "household" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "wallet_status_check",
    what: "a wallet in a state no spending decision can evaluate",
    async probe(store) {
      return refuse(() =>
        store.money.insertWallet(broken(wallet(), { status: "dormant" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "payment_authorization_amount_minor_check",
    what: "a hold for nothing, which is not consent to charge anything",
    alsoViolates: ["payment_authorization_status_amounts"],
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), { amount_minor: 0 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "payment_authorization_currency_check",
    what: "a hold in a currency the ledger cannot balance against",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), { currency: "sar" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "payment_authorization_status_check",
    what: "a hold in a state no settlement path handles",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), { status: "expired" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "payment_authorization_capture_ceiling",
    what: "a capture larger than the hold that authorised it",
    alsoViolates: ["payment_authorization_status_amounts"],
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), { captured_minor: 2_000 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "payment_authorization_refund_ceiling",
    what: "a refund of money that was never captured",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), { refunded_minor: 500 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "payment_authorization_status_amounts",
    what: "a hold marked fully captured while its captured amount says otherwise",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), { status: "captured", captured_minor: 400 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "payment_authorization_void_reason_required",
    what: "money released with no recorded reason, so no review can tell why",
    alsoViolates: ["payment_authorization_status_amounts"],
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.money.insertAuthorization(
          broken(authorization(walletId), {
            status: "voided",
            captured_minor: 0,
            voided_at: NOW,
            void_reason: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "ledger_transaction_kind_check",
    what: "a ledger movement of a kind no report accounts for",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const authorizationId = randomUUID();
      await store.money.insertAuthorization(authorization(walletId, authorizationId), NO_SCOPE);
      return refuse(() =>
        store.boundary.run(async (scope) => {
          const base = transaction(walletId);
          // `authorization_id` is set so the presence rule still holds and only
          // the kind is wrong: it is the kind under test, not the coupling.
          await store.money.insertTransaction(
            broken(base, { kind: "adjustment", authorization_id: authorizationId }),
            scope,
          );
        }),
      );
    },
  },
  {
    constraint: "ledger_transaction_authorization_presence",
    what: "a capture that names no hold, so nothing ties the movement to consent",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.boundary.run(async (scope) => {
          await store.money.insertTransaction(
            broken(transaction(walletId), { kind: "capture", authorization_id: null }),
            scope,
          );
        }),
      );
    },
  },
  {
    constraint: "ledger_entry_amount_minor_check",
    what: "a zero entry, which makes a balanced transaction look like it moved money",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.boundary.run(async (scope) => {
          const base = transaction(walletId);
          await store.money.insertTransaction(
            broken(base, {
              entries: [broken(base.entries[0]!, { amount_minor: 0 }), base.entries[1]],
            }),
            scope,
          );
        }),
      );
    },
  },
  {
    constraint: "ledger_entry_currency_check",
    what: "an entry in a currency the balance rule cannot group",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      return refuse(() =>
        store.boundary.run(async (scope) => {
          const base = transaction(walletId);
          // Both legs, so the transaction still balances and the only fault is
          // the currency itself.
          await store.money.insertTransaction(
            broken(base, {
              entries: base.entries.map((entry) => broken(entry, { currency: "sar" })),
            }),
            scope,
          );
        }),
      );
    },
  },

  // ---- fulfillment -------------------------------------------------------
  {
    constraint: "fulfillment_status_check",
    what: "coordination in a state no reconciliation read recognises",
    alsoViolates: ["fulfillment_settlement_alignment_check"],
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.fulfillment.insert(
          broken(fulfillment(organizationId, `order-${randomUUID()}`, null), {
            status: "paused",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "fulfillment_settlement_state_check",
    what: "a settlement state no money reconciliation can act on",
    alsoViolates: ["fulfillment_settlement_alignment_check"],
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.fulfillment.insert(
          broken(fulfillment(organizationId, `order-${randomUUID()}`, null), {
            settlement_state: "pending",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "fulfillment_settlement_alignment_check",
    what: "work still coordinating while its money is already captured",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.fulfillment.insert(
          broken(fulfillment(organizationId, `order-${randomUUID()}`, null), {
            status: "coordinating",
            settlement_state: "captured",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "fulfillment_execution_after_cancellation_check",
    what: "a recorded execution-after-cancellation naming no job, or a job with no time",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.fulfillment.insert(
          broken(fulfillment(organizationId, `order-${randomUUID()}`, null), {
            status: "cancelled",
            executed_after_cancellation_at: NOW,
            executed_after_cancellation_job_reference: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "fulfillment_execution_after_cancellation_status_check",
    what: "an execution after a cancellation on work that was never cancelled",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.fulfillment.insert(
          broken(fulfillment(organizationId, `order-${randomUUID()}`, null), {
            executed_after_cancellation_at: NOW,
            executed_after_cancellation_job_reference: `job-${randomUUID()}`,
          }),
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- eventing ----------------------------------------------------------
  {
    constraint: "outbox_version_check",
    what: "an event at version zero, which no consumer contract describes",
    async probe(store) {
      const event = makeEvent({
        event_type: "core.fulfillment.completed",
        version: 1,
        producer: "core",
        occurred_at: new Date(NOW),
        correlation_id: "corr-parity",
        entity_type: "fulfillment",
        entity_id: randomUUID(),
        payload: {},
      });
      return refuse(() => store.outbox.append(broken(event, { version: 0 }), NO_SCOPE));
    },
  },
  {
    constraint: "inbound_event_version_check",
    what: "an accepted external event at version zero, which no handler contract describes",
    async probe(store) {
      const event = makeEvent({
        event_type: "market.order.placed",
        version: 1,
        producer: "market",
        occurred_at: new Date(NOW),
        correlation_id: "corr-parity",
        entity_type: "order",
        entity_id: randomUUID(),
        payload: {},
      });
      return refuse(() => store.inbound.accept(broken(event, { version: 0 }), NO_SCOPE));
    },
  },
  {
    constraint: "event_subscription_endpoint_url_check",
    what: "a subscriber with no endpoint, whose deliveries can only fail",
    async probe(store) {
      return refuse(() =>
        store.delivery.insertSubscription(
          broken(eventSubscription("partner", "core.fulfillment.completed"), {
            endpoint_url: "",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "event_subscription_signing_secret_check",
    what: "a subscription with an empty secret, so its signatures prove nothing",
    async probe(store) {
      return refuse(() =>
        store.delivery.insertSubscription(
          broken(eventSubscription("partner", "core.fulfillment.completed"), {
            signing_secret: "",
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "event_delivery_status_check",
    what: "a delivery in a state the worker loop cannot classify",
    async probe(store) {
      const eventId = await seedEvent(store);
      const theSubscription = eventSubscription("partner", "core.fulfillment.completed");
      await store.delivery.insertSubscription(theSubscription, NO_SCOPE);
      return refuse(() =>
        store.delivery.queue(
          broken(delivery(eventId, theSubscription.subscription_id), { status: "retrying" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "event_delivery_reclaims_check",
    what: "a negative reclaim count, which the reclaim budget would read as headroom",
    async probe(store) {
      const eventId = await seedEvent(store);
      const theSubscription = eventSubscription("partner", "core.fulfillment.completed");
      await store.delivery.insertSubscription(theSubscription, NO_SCOPE);
      return refuse(() =>
        store.delivery.queue(
          broken(delivery(eventId, theSubscription.subscription_id), { reclaims: -1 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "event_delivery_claim_check",
    what: "a claim on work already finished, which a lease sweep would then reclaim",
    async probe(store) {
      const eventId = await seedEvent(store);
      const theSubscription = eventSubscription("partner", "core.fulfillment.completed");
      await store.delivery.insertSubscription(theSubscription, NO_SCOPE);
      return refuse(() =>
        store.delivery.queue(
          broken(delivery(eventId, theSubscription.subscription_id), {
            status: "dead",
            claimed_at: NOW,
            claim_token: randomUUID(),
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "event_delivery_claim_token_check",
    what: "a fencing token with no claim behind it, which would authorise an acknowledgement nobody holds",
    async probe(store) {
      const eventId = await seedEvent(store);
      const theSubscription = eventSubscription("partner", "core.fulfillment.completed");
      await store.delivery.insertSubscription(theSubscription, NO_SCOPE);
      return refuse(() =>
        store.delivery.queue(
          broken(delivery(eventId, theSubscription.subscription_id), {
            claim_token: randomUUID(),
            claimed_at: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "event_delivery_delivered_at_check",
    what: "a delivery reported delivered with no time it happened",
    async probe(store) {
      const eventId = await seedEvent(store);
      const theSubscription = eventSubscription("partner", "core.fulfillment.completed");
      await store.delivery.insertSubscription(theSubscription, NO_SCOPE);
      return refuse(() =>
        store.delivery.queue(
          broken(delivery(eventId, theSubscription.subscription_id), {
            status: "delivered",
            delivered_at: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- notification ------------------------------------------------------
  {
    constraint: "notification_recipient_channel_check",
    what: "a subscription on a channel CORE cannot send through",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      return refuse(() =>
        store.notification.insertRecipient(
          broken(
            {
              recipient_id: randomUUID(),
              organization_id: organizationId,
              event_type: "core.fulfillment.completed",
              identity_id: identityId,
              channel: "telegram" as const,
              active: true,
              created_at: NOW,
            },
            { channel: "fax" },
          ),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_recipient_event_type_check",
    what: "a subscription to an event CORE never emits, which can only ever be silent",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      return refuse(() =>
        store.notification.insertRecipient(
          {
            recipient_id: randomUUID(),
            organization_id: organizationId,
            event_type: "market.order.placed",
            identity_id: identityId,
            channel: "telegram",
            active: true,
            created_at: NOW,
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_channel_check",
    what: "a queued message on a channel with no sender",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), { channel: "fax" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_status_check",
    what: "a message in a state the sender loop cannot classify",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), { status: "sending" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_address_check",
    what: "an address that is the empty string, which is not the same as having none",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), { address: "" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_body_check",
    what: "an empty message, which is a delivery that tells the reader nothing",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), { body: "" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_address_when_failed_check",
    what: "a pending message with nowhere to send it, which will fail only when it is tried",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), { address: null }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_claim_check",
    what: "a message being processed with no claim token, so two senders could both hold it",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), {
            status: "processing",
            claim_token: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_accepted_check",
    what: "a message the provider accepted with no time it was accepted",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), {
            status: "accepted",
            accepted_at: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_delivered_check",
    what: "a message reported delivered with no time it arrived",
    alsoViolates: ["notification_accepted_check"],
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), {
            status: "delivered",
            accepted_at: NOW,
            delivered_at: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "notification_failed_check",
    what: "a failure with no time it failed, which no retry policy can age",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      const { identityId } = await seedPrincipal(store);
      const recipientId = await seedRecipient(store, organizationId, identityId);
      return refuse(() =>
        store.notification.queue(
          broken(notification(recipientId, organizationId), {
            status: "failed",
            failed_at: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- subscription ------------------------------------------------------
  {
    constraint: "plan_status_check",
    what: "a plan in a state no billing run can interpret",
    alsoViolates: ["plan_status_timestamps"],
    async probe(store) {
      return refuse(() =>
        store.subscription.insertPlan(broken(plan(), { status: "paused" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "plan_interval_check",
    what: "a billing interval no schedule can advance",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertPlan(broken(plan(), { billing_interval: "fortnight" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "plan_interval_count_positive",
    what: "an interval count of zero, which is a period that never ends",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertPlan(broken(plan(), { interval_count: 0 }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "plan_amount_non_negative",
    what: "a plan that pays the subscriber",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertPlan(broken(plan(), { amount_minor: -1 }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "plan_currency_format",
    what: "a plan priced in something no wallet can match",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertPlan(broken(plan(), { currency: "sar" }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "plan_status_timestamps",
    what: "an active plan with no activation time, so no audit can say when billing began",
    async probe(store) {
      return refuse(() =>
        store.subscription.insertPlan(broken(plan(), { activated_at: null }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "plan_grant_feature_key_present",
    what: "an entitlement to a feature named by whitespace, which no check can match",
    async probe(store) {
      // A draft plan: grants on an active plan are refused for a different and
      // legitimate reason — usage has already been measured against them — and
      // that refusal would not measure this rule.
      const thePlan = broken(plan(), { status: "draft", activated_at: null });
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertGrant(
          { plan_id: thePlan.plan_id, feature_key: "   ", limit_value: 10 },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "plan_grant_limit_non_negative",
    what: "a negative allowance, which reads as an entitlement already overdrawn",
    async probe(store) {
      // A draft plan: grants on an active plan are refused for a different and
      // legitimate reason — usage has already been measured against them — and
      // that refusal would not measure this rule.
      const thePlan = broken(plan(), { status: "draft", activated_at: null });
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertGrant(
          { plan_id: thePlan.plan_id, feature_key: "moves", limit_value: -1 },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_owner_type_check",
    what: "a subscription owned by a kind of thing CORE does not model",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const thePlan = plan();
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertSubscription(
          broken(subscription(thePlan.plan_id, walletId), { owner_type: "household" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_status_check",
    what: "a subscription in a state no billing run can interpret",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const thePlan = plan();
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertSubscription(
          broken(subscription(thePlan.plan_id, walletId), { status: "paused" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_cancel_fields",
    what: "an active subscription carrying a cancellation time",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const thePlan = plan();
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertSubscription(
          broken(subscription(thePlan.plan_id, walletId), { cancelled_at: NOW }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_cancel_reason_required",
    what: "a cancellation with no reason, so no review can tell why billing stopped",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const thePlan = plan();
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertSubscription(
          broken(subscription(thePlan.plan_id, walletId), {
            status: "cancelled",
            cancelled_at: NOW,
            cancel_reason: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_ended_fields",
    what: "a live subscription that has already ended",
    async probe(store) {
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const thePlan = plan();
      await store.subscription.insertPlan(thePlan, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertSubscription(
          broken(subscription(thePlan.plan_id, walletId), { ended_at: LATER }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_period_status_check",
    what: "a billing period in a state no collection run can interpret",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(
          broken(period(subscriptionId), { status: "collecting" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_period_sequence_positive",
    what: "a period numbered zero, so ordering by sequence no longer means anything",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(period(subscriptionId, { sequence: 0 }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "subscription_period_ordered",
    what: "a period that ends before it starts, which no coverage read can answer with",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, { starts_at: LATER, ends_at: NOW }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_period_amount_non_negative",
    what: "a period that owes the subscriber money",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(period(subscriptionId, { amount_minor: -1 }), NO_SCOPE),
      );
    },
  },
  {
    constraint: "subscription_period_currency_format",
    what: "a period priced in something no wallet can match",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(
          broken(period(subscriptionId), { currency: "sar" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_period_authorization_only_when_settled",
    what: "a pending period already pointing at a hold, so the hold has two owners",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      const walletId = randomUUID();
      await store.money.insertWallet(wallet(walletId), NO_SCOPE);
      const theAuthorization = authorization(walletId);
      await store.money.insertAuthorization(theAuthorization, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, { authorization_id: theAuthorization.authorization_id }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_period_settlement_fields",
    what: "a settled period with no settlement time, so no audit can say when it was collected",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(
          period(subscriptionId, { status: "settled", settled_at: null }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "subscription_period_uncollectible_reason",
    what: "a period written off with no reason recorded",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      return refuse(() =>
        store.subscription.insertPeriod(
          broken(period(subscriptionId, { status: "uncollectible" }), {
            uncollectible_reason: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "usage_record_quantity_positive",
    what: "a usage record of nothing, which still counts as a record against an allowance",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      const thePeriod = period(subscriptionId);
      await store.subscription.insertPeriod(thePeriod, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertUsage(
          {
            usage_id: randomUUID(),
            period_id: thePeriod.period_id,
            feature_key: "moves",
            quantity: 0,
            usage_reference: `use-${randomUUID()}`,
            recorded_at: NOW,
            correlation_id: "corr-parity",
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "usage_record_feature_key_present",
    what: "usage against a feature named by whitespace, which no allowance can match",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      const thePeriod = period(subscriptionId);
      await store.subscription.insertPeriod(thePeriod, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertUsage(
          {
            usage_id: randomUUID(),
            period_id: thePeriod.period_id,
            feature_key: "   ",
            quantity: 1,
            usage_reference: `use-${randomUUID()}`,
            recorded_at: NOW,
            correlation_id: "corr-parity",
          },
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "usage_record_reference_present",
    what: "usage with a blank reference, which is what makes recording it once possible",
    async probe(store) {
      const subscriptionId = await seedSubscription(store);
      const thePeriod = period(subscriptionId);
      await store.subscription.insertPeriod(thePeriod, NO_SCOPE);
      return refuse(() =>
        store.subscription.insertUsage(
          {
            usage_id: randomUUID(),
            period_id: thePeriod.period_id,
            feature_key: "moves",
            quantity: 1,
            usage_reference: "   ",
            recorded_at: NOW,
            correlation_id: "corr-parity",
          },
          NO_SCOPE,
        ),
      );
    },
  },

  // ---- reputation --------------------------------------------------------
  {
    constraint: "reputation_signal_kind_check",
    what: "a signal of a kind no aggregate knows how to weigh",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(
          broken(signal(organizationId, `ref-${randomUUID()}`), {
            signal_kind: "applause",
            rating_value: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "reputation_signal_subject_type_check",
    what: "a signal about a kind of subject CORE does not model",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(
          broken(signal(organizationId, `ref-${randomUUID()}`), { subject_type: "spaceship" }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "reputation_signal_rating_shape",
    what: "a rating outside the scale it is averaged on",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(
          broken(signal(organizationId, `ref-${randomUUID()}`), { rating_value: 9 }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "reputation_signal_retraction_fields",
    what: "a retraction with no reason, which removes a signal and explains nothing",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(
          broken(signal(organizationId, `ref-${randomUUID()}`), {
            retracted_at: NOW,
            retraction_reason: null,
          }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "reputation_signal_source_system_present",
    what: "a signal from nowhere, which no audit can trace back",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(
          broken(signal(organizationId, `ref-${randomUUID()}`), { source_system: "   " }),
          NO_SCOPE,
        ),
      );
    },
  },
  {
    constraint: "reputation_signal_source_reference_present",
    what: "a signal with a blank source reference, which is what makes it recordable once",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(signal(organizationId, "   "), NO_SCOPE),
      );
    },
  },
  {
    constraint: "reputation_signal_correlation_present",
    what: "a signal with no correlation id, so the trail it belongs to cannot be reassembled",
    async probe(store) {
      const organizationId = await seedOrganization(store);
      return refuse(() =>
        store.reputation.insertIfAbsent(
          broken(signal(organizationId, `ref-${randomUUID()}`), { correlation_id: "   " }),
          NO_SCOPE,
        ),
      );
    },
  },
] as const;

interface Backend {
  readonly name: string;
  open(clock: FixedClock): Promise<{ store: Persistence; close(): Promise<void> }>;
  truncate(): Promise<void>;
  /**
   * A new reference store per case: a `Map` has nothing to truncate, and rows
   * left behind by an earlier case could refuse a later write for the wrong
   * reason.
   */
  fresh?(clock: FixedClock): Persistence;
  /** Only the Postgres backend can enumerate the live schema. */
  constraints?(): Promise<readonly string[]>;
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
    async constraints() {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: url, max: 1 });
      try {
        const declared = await pool.query<{ name: string }>(
          `select conname as name from pg_constraint
            where connamespace = 'public'::regnamespace and contype = 'c'`,
        );
        return declared.rows.map((row) => row.name);
      } finally {
        await pool.end();
      }
    },
  });
}

for (const backend of backends) {
  describe(`check parity on '${backend.name}'`, () => {
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

    for (const checkCase of CASES) {
      it(`refuses a row that would violate ${checkCase.constraint}: ${checkCase.what}`, async () => {
        const verdict = await checkCase.probe(store);
        expect(
          verdict.refused,
          `${backend.name} accepted a row violating ${checkCase.constraint}`,
        ).toBe(true);
        if (!verdict.refused) return;
        const named = [checkCase.constraint, ...(checkCase.alsoViolates ?? [])].some((name) =>
          verdict.detail.includes(name),
        );
        expect(
          named,
          `${backend.name} refused the row but did not name ${checkCase.constraint}: ${verdict.detail}`,
        ).toBe(true);
      });
    }
  });
}

/**
 * The gate on this file.
 *
 * Asked of the live schema rather than of the migration text, for the same
 * reason the uniqueness gate is: an inline `CHECK` gets a generated name, and
 * only the database knows what it is actually enforcing.
 */
describe.skipIf(!url)("check parity coverage", () => {
  it("covers every check constraint the live schema declares", async () => {
    const postgres = backends.find((backend) => backend.name === "postgres");
    const declared = new Set((await postgres?.constraints?.()) ?? []);
    const probed = new Set(CASES.map((checkCase) => checkCase.constraint));
    const excused = new Set(UNPROBEABLE.map((entry) => entry.constraint));
    const uncovered = [...declared]
      .filter((name) => !probed.has(name) && !excused.has(name))
      .sort();
    const stale = [...probed, ...excused].filter((name) => !declared.has(name)).sort();
    expect(
      uncovered,
      "a migration added a check constraint with neither a parity case nor a recorded reason it cannot be probed; the reference backend is free to accept what Postgres refuses until one exists",
    ).toEqual([]);
    expect(stale, "a case or exemption names a constraint the schema no longer declares").toEqual(
      [],
    );
  });

  it("restates every unprobeable constraint whose columns the reference rows carry", async () => {
    const ruled = new Set(ruledConstraints());
    // An exemption says no caller can reach the rule, not that the store may
    // ignore it: where the columns exist in the reference row the rule is still
    // declared and still runs on the store's own transitions.
    const missing = UNPROBEABLE.filter((entry) => entry.declared && !ruled.has(entry.constraint));
    expect(missing.map((entry) => entry.constraint)).toEqual([]);
    const unexplained = UNPROBEABLE.filter((entry) => entry.why.trim().length === 0);
    expect(unexplained).toEqual([]);
  });
});
