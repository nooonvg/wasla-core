/**
 * The shape of the column a value goes into, restated once for the reference
 * backend: `NOT NULL`, type, length, and whether the database would have
 * supplied a default.
 *
 * Five parity cycles — uniqueness, `CHECK`s, foreign keys, triggers, the delete
 * path — are all about *values*. None of them is about the column. Measured
 * across the 28 ruled tables before this file existed: **254 columns, 197
 * `NOT NULL`, 45 with a database default**, in 11 types including
 * `character(2)`, `character(3)`, `integer`, `bigint`, `text[]` and `jsonb`; and
 * the reference backend enforced none of it. A currency of `"SARX"` in a
 * `character(3)` column, a `2.5` in an `integer`, an `amount_minor` past
 * `int8`, a number where Postgres wants `text`, and a `null` in any of the 197
 * `NOT NULL` columns were all accepted in memory and refused by the database —
 * which is the failure B-12 names, one family further down.
 *
 * Three decisions worth stating, because each had an alternative:
 *
 * 1. **The path, not just the column.** A reference row is a domain object, not
 *    a tuple: `outbox` and `inbound_event` keep the envelope's nine columns
 *    under `event`, and their `payload` under `event.payload`. The path is
 *    declared per column so the checks read the value the adapter would write
 *    rather than a column name that happens not to exist at the top level. The
 *    paths were measured, not guessed: `putRow` was instrumented and the whole
 *    suite run, and every path here is one a reference store actually wrote.
 * 2. **No default is applied.** Postgres completes a row from 45 defaults; this
 *    file refuses a row that leaves one of those columns out instead. Applying
 *    the default here would put the value in two places — the store and this
 *    table — and the copies would drift. Refusing makes the store write it,
 *    which is one source of truth and a louder failure. It immediately found
 *    two real divergences: the memory outbox wrote no `created_at` where the
 *    column is `NOT NULL DEFAULT now()`, and the memory inbound-event row
 *    omitted `processed_at` instead of storing null.
 * 3. **A key that is absent is not the same as null, and both are refused where
 *    the column is `NOT NULL`.** An absent key is how a reference row silently
 *    lacks a column; Postgres has no such state. So every declared column has
 *    to be present in the row, with `null` written explicitly where the column
 *    is nullable. That is stricter than the database and deliberately so: the
 *    alternative is two backends whose rows have different shapes, which is
 *    what a handler reading `row.processed_at` would trip over.
 *
 * Refusals quote Postgres' own wording, as every parity cycle before this one
 * did, because a refusal that reads differently in the two backends is a
 * difference a caller can see. Every wording here was measured against
 * Postgres 16 by inserting the offending value, not recalled.
 *
 * **Three places this file is deliberately stricter than the database**, all
 * measured the same way, all because the alternative is the two backends
 * storing different values for one write rather than one of them refusing:
 *
 * - a number in a `text` column: Postgres coerces `1` to `"1"`, memory would
 *   keep the number, so this file refuses it;
 * - a string in a `boolean` column: Postgres reads `"yes"` as true, memory
 *   would keep the string, so this file refuses it;
 * - an integer past `Number.MAX_SAFE_INTEGER` in a `bigint` column: Postgres
 *   accepts what it is sent, but JavaScript has already rounded the literal, so
 *   what memory holds and what the database holds are two different numbers.
 *   A `bigint` value is accepted; an unsafe `number` is not.
 *
 * These are refusals of writes Postgres would have accepted, which is the safe
 * direction — a store that trips one has a bug the database was papering over —
 * and they are recorded here and in `docs/column-parity.md` rather than left
 * for a reader to discover.
 */

/** The type classes the schema actually uses, named as Postgres names them. */
export type ColumnType =
  | "uuid"
  | "text"
  | "char"
  | "timestamptz"
  | "integer"
  | "bigint"
  | "double"
  | "boolean"
  | "jsonb"
  | "text array";

export interface ColumnShape {
  readonly column: string;
  readonly type: ColumnType;
  /** Declared width of a `character(n)` column. */
  readonly length?: number;
  readonly notNull: boolean;
  /**
   * The default expression, verbatim from `pg_attrdef`, where the database has
   * one. Recorded rather than applied: see the header. Its presence is gated
   * against the catalog, so a migration that adds or drops a default fails.
   */
  readonly databaseDefault?: string;
  /** Where the value lives in the reference row, when it is not the column name. */
  readonly path?: string;
}

/**
 * Every column of every ruled table.
 *
 * Generated once from `pg_attribute` and the measured row paths, then checked
 * against the catalog on every run by `tests/column-parity.test.ts` — which is
 * what keeps it from becoming a stale copy of the schema.
 */
export const COLUMN_SHAPES: Readonly<Record<string, readonly ColumnShape[]>> = {
  audit_entry: [
    { column: "audit_id", type: "uuid", notNull: true },
    { column: "occurred_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "actor_type", type: "text", notNull: true },
    { column: "actor_id", type: "uuid", notNull: false },
    { column: "action", type: "text", notNull: true },
    { column: "entity_type", type: "text", notNull: true },
    { column: "entity_id", type: "text", notNull: true },
    { column: "correlation_id", type: "text", notNull: true },
    { column: "metadata", type: "jsonb", notNull: true, databaseDefault: "'{}'::jsonb" },
  ],
  city: [
    { column: "city_id", type: "uuid", notNull: true },
    { column: "region_id", type: "uuid", notNull: true },
    { column: "country_code", type: "char", length: 2, notNull: true },
    { column: "name", type: "text", notNull: true },
    { column: "latitude", type: "double", notNull: true },
    { column: "longitude", type: "double", notNull: true },
    { column: "status", type: "text", notNull: true },
  ],
  country: [
    { column: "country_code", type: "char", length: 2, notNull: true },
    { column: "name", type: "text", notNull: true },
    { column: "default_currency", type: "char", length: 3, notNull: true },
    { column: "status", type: "text", notNull: true },
  ],
  event_delivery: [
    { column: "delivery_id", type: "text", notNull: true },
    { column: "event_id", type: "uuid", notNull: true },
    { column: "subscription_id", type: "text", notNull: true },
    { column: "status", type: "text", notNull: true, databaseDefault: "'pending'::text" },
    { column: "attempts", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "last_error", type: "text", notNull: false },
    { column: "last_status", type: "integer", notNull: false },
    { column: "next_attempt_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "delivered_at", type: "timestamptz", notNull: false },
    { column: "claimed_at", type: "timestamptz", notNull: false },
    { column: "reclaims", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "claim_token", type: "text", notNull: false },
  ],
  event_subscription: [
    { column: "subscription_id", type: "text", notNull: true },
    { column: "subscriber", type: "text", notNull: true },
    { column: "event_type", type: "text", notNull: true },
    { column: "endpoint_url", type: "text", notNull: true },
    { column: "signing_secret", type: "text", notNull: true },
    { column: "active", type: "boolean", notNull: true, databaseDefault: "true" },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
  ],
  fulfillment: [
    { column: "fulfillment_id", type: "uuid", notNull: true },
    { column: "organization_id", type: "uuid", notNull: true },
    { column: "market_order_reference", type: "text", notNull: true },
    { column: "move_job_reference", type: "text", notNull: false },
    { column: "status", type: "text", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true },
    { column: "completed_at", type: "timestamptz", notNull: false },
    { column: "payment_authorization_id", type: "uuid", notNull: false },
    { column: "closure_reason", type: "text", notNull: false },
    { column: "settlement_state", type: "text", notNull: true, databaseDefault: "'none'::text" },
    { column: "executed_after_cancellation_at", type: "timestamptz", notNull: false },
    { column: "executed_after_cancellation_job_reference", type: "text", notNull: false },
  ],
  identity: [
    { column: "identity_id", type: "uuid", notNull: true },
    { column: "status", type: "text", notNull: true, databaseDefault: "'active'::text" },
    { column: "canonical_identity_id", type: "uuid", notNull: false },
    { column: "display_name", type: "text", notNull: false },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "updated_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "source_system", type: "text", notNull: true },
    { column: "legacy_id", type: "text", notNull: false },
  ],
  identity_link: [
    { column: "identity_link_id", type: "uuid", notNull: true },
    { column: "identity_id", type: "uuid", notNull: true },
    { column: "channel_type", type: "text", notNull: true },
    { column: "external_id", type: "text", notNull: true },
    { column: "verified_at", type: "timestamptz", notNull: false },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
  ],
  // Claims and the answers they became, as migration 0021 reshaped what 0020
  // reshaped from the table 0001 created and nothing ever wrote to. Everything
  // that identifies the request is NOT NULL, because a record missing any part
  // of "what was asked" cannot be compared against a retry; `response_body` is
  // nullable because SQL NULL is how both backends say "the recorded answer
  // carried no body", and JSON null would mean that on one of them only.
  //
  // The three answer columns are nullable since 0021 and that is the shape of
  // the milestone rather than a loosening: the row exists *before* the answer
  // does, because it is what decides which of two concurrent twins is allowed
  // to produce one. `idempotency_key_state_record_ck` is what keeps the
  // nullability from meaning anything else — null status, null body and null
  // completion time occur together, under `state = 'claimed'`, and never once
  // the row says `completed`.
  idempotency_key: [
    { column: "key", type: "text", notNull: true },
    { column: "method", type: "text", notNull: true },
    { column: "scope", type: "text", notNull: true },
    { column: "request_fingerprint", type: "text", notNull: true },
    { column: "state", type: "text", notNull: true, databaseDefault: "'claimed'::text" },
    { column: "claim_token", type: "uuid", notNull: true },
    { column: "claimed_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "completed_at", type: "timestamptz", notNull: false },
    { column: "response_status", type: "integer", notNull: false },
    { column: "response_body", type: "jsonb", notNull: false },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "expires_at", type: "timestamptz", notNull: true },
  ],
  inbound_event: [
    { column: "event_id", type: "uuid", notNull: true, path: "event.event_id" },
    { column: "event_type", type: "text", notNull: true, path: "event.event_type" },
    { column: "version", type: "integer", notNull: true, path: "event.version" },
    { column: "producer", type: "text", notNull: true, path: "event.producer" },
    { column: "occurred_at", type: "timestamptz", notNull: true, path: "event.occurred_at" },
    { column: "correlation_id", type: "text", notNull: true, path: "event.correlation_id" },
    { column: "causation_id", type: "text", notNull: false, path: "event.causation_id" },
    { column: "entity_type", type: "text", notNull: true, path: "event.entity_type" },
    { column: "entity_id", type: "text", notNull: true, path: "event.entity_id" },
    { column: "payload", type: "jsonb", notNull: true, path: "event.payload" },
    { column: "status", type: "text", notNull: true, databaseDefault: "'pending'::text" },
    { column: "attempts", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "last_error", type: "text", notNull: false },
    { column: "next_attempt_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "received_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "processed_at", type: "timestamptz", notNull: false },
    { column: "claimed_at", type: "timestamptz", notNull: false },
    { column: "reclaims", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "claim_token", type: "text", notNull: false },
  ],
  inbox: [
    { column: "consumer", type: "text", notNull: true },
    { column: "event_id", type: "uuid", notNull: true },
    { column: "received_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
  ],
  ledger_entry: [
    { column: "entry_id", type: "uuid", notNull: true },
    { column: "transaction_id", type: "uuid", notNull: true },
    { column: "account_reference", type: "text", notNull: true },
    { column: "amount_minor", type: "bigint", notNull: true },
    { column: "currency", type: "char", length: 3, notNull: true },
  ],
  ledger_transaction: [
    { column: "transaction_id", type: "uuid", notNull: true },
    { column: "kind", type: "text", notNull: true },
    { column: "business_reference", type: "text", notNull: true },
    { column: "occurred_at", type: "timestamptz", notNull: true },
    { column: "authorization_id", type: "uuid", notNull: false },
  ],
  membership: [
    { column: "membership_id", type: "uuid", notNull: true },
    { column: "principal_id", type: "uuid", notNull: true },
    { column: "organization_id", type: "uuid", notNull: true },
    { column: "roles", type: "text array", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
  ],
  notification: [
    { column: "notification_id", type: "text", notNull: true },
    { column: "event_id", type: "uuid", notNull: true },
    { column: "recipient_id", type: "text", notNull: true },
    { column: "organization_id", type: "uuid", notNull: false },
    { column: "channel", type: "text", notNull: true },
    { column: "address", type: "text", notNull: false },
    { column: "template", type: "text", notNull: true },
    { column: "subject", type: "text", notNull: false },
    { column: "body", type: "text", notNull: true },
    { column: "data", type: "jsonb", notNull: true, databaseDefault: "'{}'::jsonb", path: "data" },
    { column: "idempotency_key", type: "text", notNull: true },
    { column: "status", type: "text", notNull: true, databaseDefault: "'pending'::text" },
    { column: "attempts", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "last_error", type: "text", notNull: false },
    { column: "provider_message_id", type: "text", notNull: false },
    { column: "claim_token", type: "text", notNull: false },
    { column: "claimed_at", type: "timestamptz", notNull: false },
    { column: "next_attempt_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "accepted_at", type: "timestamptz", notNull: false },
    { column: "delivered_at", type: "timestamptz", notNull: false },
    { column: "failed_at", type: "timestamptz", notNull: false },
  ],
  notification_recipient: [
    { column: "recipient_id", type: "text", notNull: true },
    { column: "organization_id", type: "uuid", notNull: false },
    { column: "event_type", type: "text", notNull: true },
    { column: "identity_id", type: "uuid", notNull: true },
    { column: "channel", type: "text", notNull: true },
    { column: "active", type: "boolean", notNull: true, databaseDefault: "true" },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
  ],
  organization: [
    { column: "organization_id", type: "uuid", notNull: true },
    { column: "name", type: "text", notNull: true },
    { column: "status", type: "text", notNull: true, databaseDefault: "'active'::text" },
    { column: "country_code", type: "char", length: 2, notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "updated_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "source_system", type: "text", notNull: true },
    { column: "legacy_id", type: "text", notNull: false },
  ],
  outbox: [
    { column: "event_id", type: "uuid", notNull: true, path: "event.event_id" },
    { column: "event_type", type: "text", notNull: true, path: "event.event_type" },
    { column: "version", type: "integer", notNull: true, path: "event.version" },
    { column: "producer", type: "text", notNull: true, path: "event.producer" },
    { column: "occurred_at", type: "timestamptz", notNull: true, path: "event.occurred_at" },
    { column: "correlation_id", type: "text", notNull: true, path: "event.correlation_id" },
    { column: "causation_id", type: "text", notNull: false, path: "event.causation_id" },
    { column: "entity_type", type: "text", notNull: true, path: "event.entity_type" },
    { column: "entity_id", type: "text", notNull: true, path: "event.entity_id" },
    { column: "payload", type: "jsonb", notNull: true, path: "event.payload" },
    { column: "status", type: "text", notNull: true, databaseDefault: "'pending'::text" },
    { column: "attempts", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "last_error", type: "text", notNull: false },
    { column: "next_attempt_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "claimed_at", type: "timestamptz", notNull: false },
    { column: "reclaims", type: "integer", notNull: true, databaseDefault: "0" },
    { column: "claim_token", type: "text", notNull: false },
  ],
  payment_authorization: [
    { column: "authorization_id", type: "uuid", notNull: true },
    { column: "wallet_id", type: "uuid", notNull: true },
    { column: "amount_minor", type: "bigint", notNull: true },
    { column: "currency", type: "char", length: 3, notNull: true },
    { column: "status", type: "text", notNull: true },
    { column: "business_reference", type: "text", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true },
    { column: "captured_at", type: "timestamptz", notNull: false },
    { column: "voided_at", type: "timestamptz", notNull: false },
    { column: "expires_at", type: "timestamptz", notNull: false },
    { column: "void_reason", type: "text", notNull: false },
    { column: "captured_minor", type: "bigint", notNull: true, databaseDefault: "0" },
    { column: "refunded_minor", type: "bigint", notNull: true, databaseDefault: "0" },
  ],
  plan: [
    { column: "plan_id", type: "uuid", notNull: true },
    { column: "code", type: "text", notNull: true },
    { column: "name", type: "text", notNull: true },
    { column: "currency", type: "char", length: 3, notNull: true },
    { column: "amount_minor", type: "bigint", notNull: true },
    { column: "billing_interval", type: "text", notNull: true },
    { column: "interval_count", type: "integer", notNull: true, databaseDefault: "1" },
    { column: "status", type: "text", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "activated_at", type: "timestamptz", notNull: false },
    { column: "retired_at", type: "timestamptz", notNull: false },
  ],
  plan_grant: [
    { column: "plan_id", type: "uuid", notNull: true },
    { column: "feature_key", type: "text", notNull: true },
    { column: "limit_value", type: "bigint", notNull: false },
  ],
  principal: [
    { column: "principal_id", type: "uuid", notNull: true },
    { column: "identity_id", type: "uuid", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "service_name", type: "text", notNull: false },
    { column: "issues_for_channels", type: "text array", notNull: true, databaseDefault: "'{}'::text[]" },
  ],
  region: [
    { column: "region_id", type: "uuid", notNull: true },
    { column: "country_code", type: "char", length: 2, notNull: true },
    { column: "code", type: "text", notNull: true },
    { column: "name", type: "text", notNull: true },
    { column: "status", type: "text", notNull: true },
  ],
  rate_limit_counter: [
    { column: "subject_kind", type: "text", notNull: true },
    { column: "subject_hash", type: "text", notNull: true },
    { column: "rate_class", type: "text", notNull: true },
    { column: "window_start", type: "timestamptz", notNull: true },
    { column: "hits", type: "bigint", notNull: true, databaseDefault: "0" },
    { column: "updated_at", type: "timestamptz", notNull: true },
  ],
  reputation_signal: [
    { column: "reputation_signal_id", type: "uuid", notNull: true },
    { column: "organization_id", type: "uuid", notNull: true },
    { column: "subject_type", type: "text", notNull: true },
    { column: "subject_id", type: "uuid", notNull: true },
    { column: "signal_kind", type: "text", notNull: true },
    { column: "rating_value", type: "integer", notNull: false },
    { column: "source_system", type: "text", notNull: true },
    { column: "source_reference", type: "text", notNull: true },
    { column: "occurred_at", type: "timestamptz", notNull: true },
    { column: "recorded_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "correlation_id", type: "text", notNull: true },
    { column: "retracted_at", type: "timestamptz", notNull: false },
    { column: "retraction_reason", type: "text", notNull: false },
  ],
  service_area: [
    { column: "service_area_id", type: "uuid", notNull: true },
    { column: "city_id", type: "uuid", notNull: true },
    { column: "country_code", type: "char", length: 2, notNull: true },
    { column: "name", type: "text", notNull: true },
    { column: "centre_latitude", type: "double", notNull: true },
    { column: "centre_longitude", type: "double", notNull: true },
    { column: "radius_metres", type: "integer", notNull: true },
    { column: "status", type: "text", notNull: true },
  ],
  session: [
    { column: "session_id", type: "uuid", notNull: true },
    { column: "principal_id", type: "uuid", notNull: true },
    { column: "token_hash", type: "text", notNull: true },
    { column: "channel_type", type: "text", notNull: true },
    { column: "issued_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "expires_at", type: "timestamptz", notNull: true },
    { column: "revoked_at", type: "timestamptz", notNull: false },
  ],
  subscription: [
    { column: "subscription_id", type: "uuid", notNull: true },
    { column: "owner_type", type: "text", notNull: true },
    { column: "owner_id", type: "uuid", notNull: true },
    { column: "plan_id", type: "uuid", notNull: true },
    { column: "wallet_id", type: "uuid", notNull: true },
    { column: "status", type: "text", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "cancelled_at", type: "timestamptz", notNull: false },
    { column: "cancel_reason", type: "text", notNull: false },
    { column: "ended_at", type: "timestamptz", notNull: false },
  ],
  subscription_period: [
    { column: "period_id", type: "uuid", notNull: true },
    { column: "subscription_id", type: "uuid", notNull: true },
    { column: "sequence", type: "integer", notNull: true },
    { column: "starts_at", type: "timestamptz", notNull: true },
    { column: "ends_at", type: "timestamptz", notNull: true },
    { column: "currency", type: "char", length: 3, notNull: true },
    { column: "amount_minor", type: "bigint", notNull: true },
    { column: "status", type: "text", notNull: true },
    { column: "authorization_id", type: "uuid", notNull: false },
    { column: "created_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "settled_at", type: "timestamptz", notNull: false },
    { column: "uncollectible_reason", type: "text", notNull: false },
  ],
  usage_record: [
    { column: "usage_id", type: "uuid", notNull: true },
    { column: "period_id", type: "uuid", notNull: true },
    { column: "feature_key", type: "text", notNull: true },
    { column: "quantity", type: "bigint", notNull: true },
    { column: "usage_reference", type: "text", notNull: true },
    { column: "recorded_at", type: "timestamptz", notNull: true, databaseDefault: "now()" },
    { column: "correlation_id", type: "text", notNull: false },
  ],
  wallet: [
    { column: "wallet_id", type: "uuid", notNull: true },
    { column: "owner_type", type: "text", notNull: true },
    { column: "owner_id", type: "uuid", notNull: true },
    { column: "currency", type: "char", length: 3, notNull: true },
    { column: "status", type: "text", notNull: true },
    { column: "created_at", type: "timestamptz", notNull: true },
  ],};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;
const INT8_MIN = -9223372036854775808n;
const INT8_MAX = 9223372036854775807n;

function at(row: Record<string, unknown>, path: string): { found: boolean; value: unknown } {
  const parts = path.split(".");
  let current: unknown = row;
  for (const part of parts.slice(0, -1)) {
    if (typeof current !== "object" || current === null) return { found: false, value: undefined };
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "object" || current === null) return { found: false, value: undefined };
  const last = parts.at(-1)!;
  const container = current as Record<string, unknown>;
  return { found: last in container, value: container[last] };
}

/**
 * Why a value does not fit the column, in Postgres' words, or null if it fits.
 *
 * The wordings are the ones Postgres produces for the common case of a literal
 * that cannot be coerced; where Postgres has several messages for one class
 * (a malformed `uuid` versus a `uuid` of the wrong length, say) the one quoted
 * here is the one an adapter passing a JavaScript value actually provokes.
 */
function misfit(shape: ColumnShape, value: unknown): string | null {
  switch (shape.type) {
    case "uuid":
      if (typeof value !== "string" || !UUID.test(value)) {
        return `invalid input syntax for type uuid: "${String(value)}"`;
      }
      return null;
    case "text":
      // Postgres would coerce a number in a literal; an adapter passing one
      // through node-postgres gets a type error instead, and the two backends
      // storing 1 and "1" for the same write is the difference that matters.
      return typeof value === "string"
        ? null
        : `column "${shape.column}" is of type text but expression is of type ${typeof value}`;
    case "char": {
      if (typeof value !== "string") {
        return `column "${shape.column}" is of type character but expression is of type ${typeof value}`;
      }
      // `character(n)` blank-pads, so a shorter value is legal and comes back
      // padded; only a longer one is refused.
      return value.length > (shape.length ?? 0)
        ? `value too long for type character(${shape.length})`
        : null;
    }
    case "timestamptz": {
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? `date/time field value out of range: "Invalid Date"` : null;
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        return `invalid input syntax for type timestamp with time zone: "${String(value)}"`;
      }
      return null;
    }
    case "integer":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `invalid input syntax for type integer: "${String(value)}"`;
      }
      if (!Number.isInteger(value)) {
        // The database rounds a numeric literal; an adapter sending 2.5 for an
        // int4 column gets refused, and silently truncating in memory would
        // make the reference backend lose a digit the database never had.
        return `invalid input syntax for type integer: "${String(value)}"`;
      }
      return value < INT4_MIN || value > INT4_MAX
        ? `value "${String(value)}" is out of range for type integer`
        : null;
    case "bigint": {
      if (typeof value === "bigint") {
        return value < INT8_MIN || value > INT8_MAX
          ? `value "${value.toString()}" is out of range for type bigint`
          : null;
      }
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return `invalid input syntax for type bigint: "${String(value)}"`;
      }
      return !Number.isSafeInteger(value)
        ? `value "${String(value)}" is out of range for type bigint`
        : null;
    }
    case "double":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `invalid input syntax for type double precision: "${String(value)}"`;
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `invalid input syntax for type boolean: "${String(value)}"`;
    case "jsonb":
      // Anything JSON can carry is legal in a jsonb column; a function or an
      // undefined is not, and neither survives a round trip through the
      // adapter, so both are refused rather than stored in memory only.
      if (typeof value === "function" || typeof value === "undefined") {
        return `invalid input syntax for type json`;
      }
      return null;
    case "text array": {
      // Measured against Postgres 16 rather than guessed: inserting the string
      // `admin` into `membership.roles` raises `malformed array literal:
      // "admin"`, not a type error, because the value is parsed as an array
      // literal first.
      if (!Array.isArray(value)) return `malformed array literal: "${String(value)}"`;
      return value.every((item) => typeof item === "string")
        ? null
        : `malformed array literal: "${JSON.stringify(value)}"`;
    }
  }
}

/**
 * Refuses a row whose columns do not fit the schema's columns.
 *
 * Called from `putRow` **before** the checks, and from the two ruled tables
 * that do not go through `putRow`. The order matters and it is Postgres': a
 * `NOT NULL` violation is raised before a `CHECK` on the same column is
 * evaluated, so a refusal ordered the other way would quote a constraint name
 * for a row the database would have rejected without ever reaching it.
 */
export function assertColumns(table: string, row: Record<string, unknown>): void {
  const shapes = COLUMN_SHAPES[table];
  if (!shapes) return;
  for (const shape of shapes) {
    const { found, value } = at(row, shape.path ?? shape.column);
    if (!found) {
      // An absent key has no equivalent in a tuple. Where the database has a
      // default it would have filled the column in; where it does not, the
      // column would be null. Either way the reference row is a different
      // shape from the Postgres row, so it is refused here rather than stored.
      throw new Error(
        shape.databaseDefault === undefined
          ? `row for relation "${table}" has no value for column "${shape.column}", which is ${shape.notNull ? "not null" : "nullable"} in the schema — write null explicitly rather than omitting it`
          : `row for relation "${table}" has no value for column "${shape.column}", which the database would fill from its default ${shape.databaseDefault} — the reference backend applies no default, so the store has to write it`,
      );
    }
    if (value === null || value === undefined) {
      if (shape.notNull) {
        throw new Error(
          `null value in column "${shape.column}" of relation "${table}" violates not-null constraint`,
        );
      }
      continue;
    }
    const problem = misfit(shape, value);
    if (problem) throw new Error(problem);
  }
}

/** Tables whose column shape this file declares, for the coverage gate. */
export function shapedTables(): readonly string[] {
  return Object.keys(COLUMN_SHAPES).sort();
}

/** Columns the database would default, which the reference backend refuses to. */
export function defaultedColumns(): readonly string[] {
  return Object.entries(COLUMN_SHAPES)
    .flatMap(([table, shapes]) =>
      shapes
        .filter((shape) => shape.databaseDefault !== undefined)
        .map((shape) => `${table}.${shape.column}`),
    )
    .sort();
}
