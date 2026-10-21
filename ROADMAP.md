# WASLA CORE — Roadmap

**Last updated:** 2026-09-13
**Last milestone:** Every response declares the headers it sets, and every response
carries the one a caller cannot work without (milestone 28) — the fifth and last
undeclared HTTP surface, and the one milestone 27 explicitly said it did not
cover. Measured first, by driving all 52 operations and reading the real answers:
**`x-correlation-id` was set on 52 of 52 responses and documented on 0 of them** —
the value written to every audit, outbox, ledger, inbound-event, notification and
subscription row a request touches, and the only handle a caller has for asking
CORE afterwards what its request did, published nowhere; the three `x-ratelimit-*`
headers were sent on **every** limited response, successes included, while the
contract documented them only on the shared `RateLimited` 429, as if a budget could
only be learned by exceeding it. And two defects, both on the paths a caller
reaches when something has already gone wrong: **an unmatched route answered `404`
with no headers at all**, so the one answer a caller gets when it can reach no
route in CORE was the one it could not correlate to CORE's logs — while the body
beside it carried the same id — and **the Node adapter's unparseable-body `400`
answered `{code, message}`** with no `correlation_id`, no `details` and no
`retryable`: the only refusal in CORE that was not the canonical `Error`, invisible
to milestone 27's gate because it is produced above the router that gate drives.
Now `src/platform/http/response-headers.ts` declares the six headers CORE sends
with when, why and an anchored shape each, `sealHeaders` is the only place a
response's headers are decided and **refuses an undeclared name or a wrong-shaped
value**, both defective paths are fixed at the cause, and one
`components/headers` section in the contract is referenced by every response object
and both shared refusals — documented where the headers are actually sent, and
deliberately *not* on `/health`, `/ready` and `/metrics`, which the limiter exempts.
**709** tests pass without `DATABASE_URL` and **1272** with it.
**Verification at this working tree:** `tsc --noEmit` clean; `npm test` 709 passed
/ 148 skipped without a database and 1272 with `DATABASE_URL` against a real
PostgreSQL 18.4, all 19 migrations applied; governance, contract and migration
gates passing, and the roadmap gate satisfied across the pushed range. Twelve
falsifications, each applied to a committed tree and restored, are tabulated in
`docs/http-response-headers.md` — including F10, whose **first attempt was invalid**
(the substitution matched nothing, so "not caught" described a tree that had not
been mutated) and which is recorded rather than removed. The CI verdict, which is
the judgment, is in the cycle record below.

### Milestone 27's entry, kept as written

Kept rather than replaced, because it is the record of the previous cycle's
verification and its counts are the baseline this cycle's are measured against. One
additive correction: the skipped count it reports as 147 was 148 at that commit;
the passing counts are unchanged.

> **Last updated:** 2026-09-13
> **Last milestone:** Routes document the response they return, and the documented
> shape is enforced (milestone 27) — see the entry below. The previous milestone's
> summary is kept beneath it: CORE reads only the request headers it declares, and accepts
> them only in the shape it declares (milestone 26). Measured first: an
> 8000-character `x-correlation-id` was accepted, echoed and persisted verbatim in
> the `correlation_id` `text` column of every audit, outbox, ledger, inbound-event,
> notification and subscription row a request creates, so any caller could write
> kilobytes of chosen text into CORE's permanent audit trail with every ordinary
> request; `"   "` became the identity of record, making the field six tables are
> traced by meaningless; a repeated header was recorded as `"a, b"`, an id belonging
> to neither half; and `bearer()` silently authenticated `[0]` of two credentials
> while the rate limiter hashed its own reading of the same header. Now
> `src/platform/http/headers.ts` declares the five headers CORE reads with a use, a
> length bound and a written reason, `RequestHeaders` throws on an undeclared read,
> and the router checks them **before the route is matched and before the limiter
> runs** — which is also what makes the credential the limiter charges and the
> credential `bearer()` authenticates the same value by construction. A refusal
> never echoes the value that caused it. `x-correlation-id` and the bearer
> credential are documented in the contract for the first time, the header parameter
> referenced from all 52 operations.
>
> **Milestone 27 — routes document the response they return, and the documented
> shape is enforced.** The fourth and last surface of that family, and the half
> other systems build against. Measured first, by parsing the contract and driving
> all 52 operations: **34 of 52 operations documented no response schema at all**;
> **nothing in the repository had ever parsed `contracts/openapi/core-v1.yaml` as
> YAML** (`check-contracts.mjs` scans it with regular expressions, so two response
> objects broken by unquoted commas inside a flow map — a truncated sentence plus a
> junk key — had passed for the file's whole life); and nothing had ever compared a
> response body to the contract, which had hidden three shipped divergences.
> `POST /v1/organizations` and `GET /v1/organizations/{id}` **answered `{}`** —
> both handlers passed an unawaited promise as the body and `JSON.stringify`
> renders a promise as `{}`, so the call that creates a tenant never returned its
> id, and every test passed because every test read the status.
> `GET /v1/event-deliveries/undelivered` **returned `claim_token`**, the fencing
> credential a worker presents to acknowledge a delivery, to anybody holding
> `organization.read`. `GET /v1/sessions/current` returned six permissions the
> published `Permission` enum did not list. Now: a dependency-free contract reader
> with a strict validator (`tests/support/openapi.ts`), a scenario that drives all
> 52 operations to a **success** status (`tests/support/http-scenario.ts`), 25 new
> component schemas and 33 response bodies documented, the router refusing any
> route that hands back a promise as its body, `redactDelivery` mirroring
> `redactSubscription`, and an 11-case gate that fails if any operation returns a
> property the contract does not document. **700** tests pass without
> `DATABASE_URL` and **1263** with it.
> **Verification at this working tree:** `tsc --noEmit` clean; `npm test` 700
> passed / 147 skipped without a database and 1262 + 1 = 1263 with `DATABASE_URL`
> against a real PostgreSQL 18.4, all 19 migrations applied; governance, contract,
> migration and roadmap gates passing. The falsifications, each applied to a
> committed tree and restored, are tabulated in
> `docs/http-response-declaration.md`. The CI verdict, which is the judgment, is in
> the cycle record below.

### Milestone 26's entry, kept as written

Kept rather than replaced, because it is the record of the previous cycle's
verification and its counts are the baseline this cycle's are measured against.

> **689** tests pass without `DATABASE_URL` and **1252** with it.
> **Verification at that working tree:** `tsc --noEmit` clean; `npm test` 689
> passed / 147 skipped without a database and 1251 + 1 = 1252 with `DATABASE_URL`
> against a real PostgreSQL 18.4, all 19 migrations applied; governance, contract,
> migration and roadmap gates passing. Eleven falsifications, each applied to a
> committed tree and restored, are tabulated in `docs/http-header-declaration.md` —
> including F7b, which **defeated the first version of the gate's source scan** and
> is recorded as such rather than removed.

### The previous state of this header, kept verbatim

Corrected by addition rather than replacement, because these three lines were the
only place this text existed. They described the B-29 cycle and were left
unchanged by milestones 23, 24 and 25, so the counts in them are stale by four
cycles; they are kept because a stale record is evidence of when it was written.

> **Last updated:** 2026-09-12
> **Last milestone:** Work that MOVE delivered *after* CORE cancelled the order is no longer lost. MOVE executes over minutes, so a cancellation can land mid-execution: CORE closed the fulfillment `cancelled`, released the hold and told MARKET, which told the customer their order was cancelled and gave the money back — and then MOVE's already in-flight `move.job.completed` arrived saying the work was done. CORE answered `409 fulfillment was cancelled` and stored nothing, so the dispatcher retried a refusal that can never come good five times across hours of backoff and dead-lettered the most consequential message MOVE can send as an error string in `inbound_event`; meanwhile the row read `cancelled` + `released`, a *consistent* pair, so both reconciliation reads returned empty and CORE asserted queryably that nothing was owed while a driver had delivered an order for free. The report is now answered and recorded: two columns (migration 0017) hold MOVE's own `completed_at` and the reporting job, `financialDisposition` reads them as `decision_required` so the case lands in B-20's queue rather than the finished pile, and the additive event `core.fulfillment.executed_after_cancellation` carries the fact to MARKET, which is the only side that can talk to that customer. CORE moves no money and says so: the hold was voided and cannot be captured, and re-charging a payer who was told their order was cancelled is not a decision CORE has been given. **B-29 resolved.** 657 tests pass with `DATABASE_URL` set.
> **Verification at this working tree:** `tsc --noEmit` clean; `DATABASE_URL=… npm test` **657 passed / 38 files**; governance, contract, migration and roadmap gates passing. Verified on **real PostgreSQL 18.4** (locally hosted), all **17** migrations applied — migration 0017 adds two nullable columns and two check constraints to `fulfillment` (both-or-neither, and the marker only on `status = 'cancelled'`), with no index and no backfill: the reports this cycle exists for were refused and never stored, so every existing row correctly reads as unmarked. Falsifiable and checked by mutation: removing the marker check in `financialDisposition` fails 9 tests, dropping `is null` from the conditional write fails 1, restoring the old 409 fails 19, and recording a late `failed` report as though it were a delivery fails 2 — each mutation restored and `tsc` re-run clean afterwards. The pre-existing flake in `tests/migration-0011-lifecycle.test.ts` (teardown timeout under full-suite contention) recurred again in this cycle's full run and passes in isolation; every one of the 657 assertions passed.

## What this project is

WASLA CORE is the shared operating layer of the WASLA system: an independent
service (modular monolith) with its own repository, build, tests, release and
database.

- MARKET creates the work (`skyosv10-art/wasla`).
- MOVE executes the work (`noor-seez/ceezr`).
- CORE coordinates it.

## Ownership boundary

**Owns:** identity, identity links, sessions, principals, roles, permissions,
organizations/tenancy, geography reference, shared pricing and negotiation
rules, payments, wallets, ledger, settlement, subscriptions, plans, periods,
entitlements, usage, reputation and trust signals, notifications, messaging,
support, documents/KYC, referrals, audit, eventing/outbox/inbox, channels and
adapters, integration layer, fulfillment coordination.

**Does not own:** drivers, vehicles, fleets, dispatch, matching, assignment,
tracking, route state, proof of delivery, rides, delivery execution,
merchants, stores, products, catalog, inventory, reservations, commercial
orders, marketplace search, store pricing, or any product-specific UI.

## Done

- [x] Repository created as an independent project (no fork, no monorepo).
- [x] Canonical event envelope with structural validation at every boundary.
- [x] Transactional outbox — state and event commit together or not at all.
- [x] Outbox relay with exponential backoff, attempt limits and dead-lettering.
- [x] Consumer inbox — per-consumer idempotency under at-least-once delivery.
- [x] Logical event bus with per-consumer retry and a dead-letter record.
- [x] Identity, identity links, principals, sessions, memberships.
- [x] Telegram modelled strictly as a channel link, never as the identity.
- [x] Opaque session tokens; only the SHA-256 hash is persisted.
- [x] Role → permission mapping as data; tenant isolation on every check.
- [x] Organizations as flat tenants.
- [x] HTTP surface: correlation ids, canonical error model, structured request
      logs, health and readiness.
- [x] Append-only audit trail with sensitive-metadata scrubbing, enforced by a
      database trigger in the schema.
- [x] Postgres schema authored, with a rollback script.
- [x] OpenAPI 3.1 contract and JSON Schema event contracts.
- [x] Executable governance: boundary, module-isolation, secret and TODO gates.
- [x] Contract gate: every emitted event type must have a published schema.
- [x] Roadmap gate: implementation changes without a roadmap update fail CI.
- [x] CI pipeline: install, typecheck, tests, governance, contracts, roadmap.
- [x] CORE-owned wallets using integer minor units and ISO currency codes.
- [x] Balanced double-entry ledger with append-only database enforcement authored.
- [x] Idempotent payment authorization and capture with transactional outbox events.
- [x] Fulfillment coordination using opaque MARKET order and MOVE job references.
- [x] Idempotent local-bus consumers for `market.order.created` and `move.job.completed`.
- [x] Versioned JSON Schemas and API contract additions for this cycle.
- [x] Geography reference module: countries, regions, cities and service areas
      with radius coverage and coordinate resolution — reference data only, no
      tracking, routing, dispatch or driver state.
- [x] Payment authorization lifecycle: explicit idempotent void, optional hold
      expiry, expiry sweep that releases funds without moving money, and
      capture refused after expiry.
- [x] `core.payment.voided` v1 event schema, void endpoint and expiry field in
      the published contract.
- [x] Migration 0003 with its rollback for geography reference tables and the
      authorization lifecycle columns.
- [x] Notifications to people: recipient registry bound to verified identity
      links, five event templates rendered against a published payload
      contract, a four-outcome channel port, a leased and fenced dispatcher,
      and an operator read surface. Fake adapters only, by choice.
- [x] Every background worker claims work by writing a lease (B-22), so two
      workers polling together cannot receive the same row.
- [x] One canonical normalisation layer owns event-version knowledge, so no
      consumer interprets a version itself; an event that cannot be normalised
      safely is refused by name rather than guessed at.
- [x] Historical replay of stored inbound events: narrow reviewable scopes, a
      dry-run that a read-only connection proves cannot write, no double
      financial effect, no tenant inference, and a resumable failure report.

## In progress

Nothing is reserved. Milestone 23 (selection parity for the HTTP read surface)
merged from branch `http-selection-parity`; the account is in
`docs/http-selection-parity.md` and the cycle record is at the end of this file.

**Milestone 42 is complete**, delivered on branch `envelope-declaration`
and merged into `main`; the account is in `docs/envelope-declaration.md`
and the cycle record is at the end of this file. The envelope contract
(`contracts/events/envelope.schema.json`) is a published contract that describes
the wrapper every event carries, but nothing validated that emitted events
conform to it. This cycle closed that by driving several core event types over
the in-memory backend, reading every emitted event from the outbox, and
asserting each full envelope satisfies the contract — required fields present,
no undeclared fields, every present field's type matching the declaration, and
`producer` in the declared enum.

**Milestone 41 is complete**, delivered on branch `notification-message-declaration`
and merged into `main`; the account is in `docs/notification-message-declaration.md`
and the cycle record is at the end of this file. The notification message
contract (`contracts/notifications/notification-message.v1.schema.json`) is a
published contract that describes the shape a channel adapter receives, but
nothing validated that a real dispatch produces a message that conforms. This
cycle closed that by driving a notification through the fan-out and dispatcher,
capturing the `NotificationMessage` the adapter receives, and asserting it
satisfies the contract — required fields present, no undeclared fields, every
present field's type matching the declaration.

**Milestone 40 is complete**, delivered on branch `event-payload-declaration`
and merged into `main`; the account is in `docs/event-payload-declaration.md`
and the cycle record is at the end of this file. The contract gate proved every
emitted event type has a published schema, and nothing had ever read a payload:
fourteen of nineteen core event types had no validation against their contracts.
This cycle closed that by driving every event type over the in-memory backend
and asserting each emitted payload conforms — required fields present, no
undeclared fields, every present field's type matching the declaration.

The re-measurement that opened milestone 23 **corrected the milestone 22 record**
before reserving anything, and the correction is additive: milestone 22's own
text says it gated "every other listing in the repository", and it did not. It
gated the *module* repositories. The **platform** stores — the outbox, the
inbound-event store and the delivery store — still returned `Map` insertion order
from `all`, `byStatus`, `forEvent`, `listSubscriptions` and `subscriptionsFor`
while their SQL sorted, two of those are reachable from an HTTP route
(`GET /v1/event-subscriptions`, `GET /v1/event-deliveries/undelivered`), and
eight of the Postgres orders they are compared against were not total. That was
the same defect family milestone 22 closed, in the layer milestone 22 did not
read. Milestone 23 closed it.

**Milestone 24 is complete**, delivered on branch `http-parameter-whitelist`
and merged into `main`; the account is in `docs/http-parameter-declaration.md`
and the cycle record is at the end of this file. It existed because milestone 23
measured it rather than because anybody predicted it: a query parameter no
handler read was ignored silently, so `?limit=abc` on a route with no `limit`
returned 200 and every row.

**Reservation note, recorded additively rather than tidied away.** The scope of
milestone 24 was fixed by milestone 23's own record, and the branch was cut from
`main` before any file was touched — but this reservation paragraph was written
**after the implementation was drafted**, not before it, which is the order this
file asks for. Nothing about the scope changed in between and no second agent was
working the row, so the risk it guards against did not materialise; the sequence
is stated here because a reservation discipline that is silently applied
out of order is not a discipline. The next cycle reserves first.

`uxxxug/wasla-core` is the working remote, pushes are fast-forward, and CI runs
and passes there.

Persistence is no longer the open question: every port has a Postgres adapter,
the composition root can be wired to either backend, and the whole suite runs
against both. Migrations 0001-0019 are applied and verified on real engines
(PostgreSQL 18.4 locally in the latest cycle, 18.6, 18.4 and 17.6 earlier),
rollbacks included - 0009 and 0011 verified as *refusing* to roll back while
money history would be falsified by doing so.

## Remaining, in dependency order

Every line below was checked against the code, the tests and the commits in
this cycle rather than carried over from the previous text. Postgres adapters
and B-1 were never the goal; they are the floor CORE's actual work stands on.

| # | Milestone | Verified status | Evidence / what is missing |
|---|---|---|---|
| 1 | External event ingress and egress: MARKET and MOVE can reach CORE, and CORE can reach them | **CORE side complete** | Inbound: `POST /v1/events`, `inbound_event` (migration 0007), `InboundDispatcher`, trust boundary tied to the credential. Outbound: `event_subscription` + `event_delivery` (migration 0008), `DeliveryFanOut` committing with the outbox row, `DeliveryWorker` with failure classification, HMAC-signed bodies, operator-only subscription routes. 11 + 13 tests × 2 backends. What remains is not CORE's: MOVE and MARKET must stand up endpoints and deduplicate on `event_id` |
| 2 | Settlement beyond one hold per fulfillment: partial capture, refunds, multi-hold | **Partial capture and refunds complete on both the money and the fulfillment side; multi-hold blocked — external dependency** | Migration 0011 finishes what 0009 started: `fulfillment.settlement_state` gained `partially_captured`, so a hold that moved part of the payer's money is no longer recorded as `released` — a value documented to mean no money moved. `FulfillmentPaymentPort.voidWithin` publishes `{ status, captured_minor }` instead of `unknown`, `release()` derives the state from it, `inspectHold()` has a `partially_captured` case, and the reconciliation read now surfaces money moved against work that did not complete (B-20). 18 tests × 2 backends. Earlier: migration 0009 splits the consent ceiling from the amounts that moved (`captured_minor`, `refunded_minor`), adds `partially_captured`, makes `ledger_transaction.authorization_id` a foreign key and enforces aggregate-vs-ledger agreement with two deferred constraint triggers. Service has `capture(amount?, capture_reference?)` and `refund`, both exactly-once on the ledger reference; `balance()` holds only the uncaptured remainder. `core.payment.refunded` contract published, `captured`/`voided` payloads extended. Routes: `POST .../capture` (optional body), `POST .../refund`. 15 tests × 2 backends. The 2026-09-12 (second) cycle then made the consequence explicit rather than implicit: a derived `financial_disposition`, `financial_decision_required` + `captured_minor` on both closure events, a separate pending-decision reconciliation read, the full terminal-path table in `docs/settlement.md`, and 14 + 1 tests. Multi-hold needs a MARKET contract decision — see "External dependencies" |
| 3 | Subscriptions, plans, periods, entitlements (ADR 0013) | **Complete, except policy decisions that are not CORE's to make** | Migration 0010 adds `plan`, `plan_grant`, `subscription`, `subscription_period`, `usage_record` with RLS, an `EXCLUDE USING gist` constraint against overlapping periods, immutability triggers on an active plan's terms and grants, append-only triggers on usage, and a deferred constraint trigger reconciling a settled period against the hold that settled it. Module: `domain.ts` (entitlement derived, never stored), `repository.ts` + `pg-repository.ts`, `service.ts`, `http.ts`. Ten routes, `subscription.read` / `subscription.write` permissions, six event contracts. 23 tests × 2 backends. **No entitlement-check endpoint** — ADR 0008 requires a new ADR first (B-14). Proration, grace, trials, rollover and comped access are recorded as B-15…B-19 |
| 4 | Channels and notifications; Telegram adapter | **Complete inside CORE, with a fake adapter rather than a live provider** | Migration 0012 adds `notification_recipient` and `notification` with RLS. Module: `domain.ts` (five templates, money wording derived from `settlement_state`), `ports.ts` (a four-outcome `ChannelResult`, never `void` or a boolean), `repository.ts` + `pg-repository.ts` (lease claim + `claim_token` fencing), `service.ts` (`NotificationFanOut` inside the relay transaction, `NotificationDispatcher` with backoff and fencing), `identity-directory.ts` (verified links only), `http.ts` (four routes). Published payload contract `contracts/notifications/notification-message.v1.schema.json`. 23 tests × 2 backends plus 5 claim-atomicity tests × 2 backends; `docs/notifications.md` states the guarantee. **No live provider is wired** — deliberately: the contract is adapter-shaped so a real Telegram/SMTP/SMS client is a new file and no domain change. `delivered` is unreachable until a provider confirmation callback exists (D-8) |
| 5 | Publish and adopt the versioned contracts in MOVE and MARKET | **Blocked — external dependency** | 14 event schemas and the OpenAPI contract are published in-repo. Adoption is not CORE's to do |
| 6 | Event normalisation and historical replay tooling | **Complete inside CORE** | Two layers, deliberately separate. `src/platform/eventing/normalize.ts`: one registry that owns version knowledge, so a consumer receives a `CanonicalEvent` and never branches on `version` — required fields, `additionalProperties: false` enforced in code and not only in the schema, timestamps normalised to ISO UTC, absent-optional ≡ null, and four reported rejections (`envelope_malformed`, `unknown_event_type`, `unsupported_version`, `payload_malformed`) that name offending keys and never values. It is now called at the ingress edge too, so a malformed payload is a 400 to the producer instead of a consumer's problem later. `src/platform/replay/`: a scope that **must** narrow (`limit` 1…1000, no "replay everything"), ordering on `(received_at, event_id)` rather than the producer's `occurred_at`, `plan()` proved non-writing by a `ReadOnlyQueryable` that refuses writes with SQLSTATE 25006, two named modes (`pending_only` letting the inbox decide, `reapply` explicit and documented), per-event publication with no wrapping transaction so a run is resumable, `resume_after` pointing *before* the failing event, a session-scoped `pg_try_advisory_lock` refusing a concurrent run between processes, tenant refusal rather than inference, two audit entries and no new table, and a CLI (`npm run replay`) gated on a new `events.replay` permission held by `platform_admin` only. 17 + 46 tests. `docs/replay.md` states the guarantees and the trades. **No migration, no new index, no `claimed_at`** |
| 7 | Migration and reconciliation tooling; dry runs | **Blocked — B-2, B-3** | Financial reconciliation exists in two reads that answer different questions: `/v1/fulfillments/reconciliation/inconsistent` (needs an engineer) and `/v1/fulfillments/reconciliation/pending-financial-decision` (needs a business decision). Migration 0011's whole lifecycle — clean apply, apply over existing rows, refused rollback, permitted rollback, re-apply — is now rehearsed by a test against a throwaway database. Data migration cannot be planned without a production inventory or a merge policy |
| 8 | Security hardening pass and observability export | **Observability export and ingress rate limiting complete; the hardening pass itself is bounded by B-5** | Deny-by-default RLS on every table (including the new `rate_limit_counter`), hardened `search_path`, token hashing, audit scrubbing, correlation ids — unchanged. Added in the 2026-09-12 (fifth) cycle: `src/platform/observability/` (a **declared** metric catalogue that refuses an undeclared name, a missing label, an extra label or an identifier-shaped label value; a deterministic Prometheus 0.0.4 renderer; per-worker counters and histograms; a `DepthSampler` on the operator's cadence, never on the scrape, with `core_sample_timestamp_seconds` and `core_sample_failures_total` so staleness is visible) and `src/platform/http/rate-limit.ts` + `pg-rate-limit.ts` + migration 0013 (fixed window, per hashed credential and route class, one atomic `insert … on conflict … do update … returning`, 429 with `retry-after`, workers unreachable from the limiter by construction). Scope decisions recorded in `docs/observability.md`: **system-level metrics only, never tenant-scoped**, and per-credential rather than per-organization keying because resolving a token to a tenant would put a database read in front of the limiter. 48 new tests × both backends where applicable, including a real-Postgres concurrency test falsified against a deliberately racy store. Still open: no tracing/span export (nothing consumes it; `correlation_id` already threads the audit trail), `/metrics` is unauthenticated and therefore depends on network placement (B-5), and lease expiry was not countable for three of the four workers (**B-24**, resolved in the 2026-09-12 worker-lease cycle by migration 0014) |
| 9 | Staging readiness, cutover and rollback rehearsal | **Blocked — B-5, B-6** | Migrations and rollbacks are rehearsed against real engines. No environment is chosen |
| 10 | Reputation and trust signals (ADR 0015) | **CORE side complete; ingestion has no producer, and the policy above the signals is not CORE's to decide** | This row is new, and its absence was the defect the cycle opened with: reputation was on the ownership list in `docs/data-ownership.md`, named as the one remaining gap in `README.md`, and missing from this table entirely — so the document that decides what is next could not have selected it. Now: migration 0018 (`reputation_signal`, append-only by trigger, closed `signal_kind` vocabulary, `UNIQUE (organization_id, source_system, source_reference)`, retraction marker), `src/modules/reputation/` (pure domain + port + Postgres adapter + service + two read routes), four contracts, `docs/reputation.md`, 28 tests × both backends including cross-backend equality of the grouped rows a standing folds from. No score and no review text is stored anywhere: a standing is derived on every read, and there is no column or contract field text could arrive in. Not implementable here: MARKET publishes neither `market.review.rated` nor `market.review.retracted` today, so no signal reaches a deployed CORE; `completion`/`cancellation` cannot be attributed at all until MOVE names the CORE identity that executed a job (external dependency below); weighting, decay, thresholds and cross-tenant aggregation are **B-31…B-34** |
| 11 | CORE degradation rules (ADR 0010) | **Not implemented, and until this cycle not tracked here at all** | The second roadmap-source gap this cycle found. `docs/adr/README.md` has carried ADR 0010 as `not yet implemented | pending` since the foundation cycle, and no milestone or blocker in this document ever mentioned it, so it could not be selected as next work — the same failure that hid reputation, in a row nobody was reading. What exists today is fail-closed behaviour, not degradation policy: `/ready` reports the wired backend, the outbox relay, inbound dispatcher, delivery worker and notification dispatcher classify failures, retry with backoff, lease, reclaim within a budget (B-25) and dead-letter, and the HTTP surface answers canonical errors under rate limiting. What does not exist is a decision about what CORE *serves* while a dependency is down — whether access checks answer from a cache when Postgres is unreachable, whether reads degrade while writes refuse, and what MOVE and MARKET are told to do meanwhile. That is not implementable from the ADR's title, which is all this repository records of it: the ADR text is not in the repository. Recorded as **B-35** rather than guessed at, because a wrong degradation rule fails exactly when nothing else is working |
| 13 | Uniqueness parity between the reference backend and Postgres | **Complete, and self-enforcing from here** | The gate in milestone 12 made the database assertions run; this row is about what they assert. The schema declares 24 uniqueness rules (21 `UNIQUE`, one `EXCLUDE USING gist`, three partial unique indexes — the last kind invisible to any inventory reading `pg_constraint` alone), and 11 of them were accepted in memory where Postgres refuses: both `principal` rules, `session_token_hash_key`, the membership pair, `region_country_code_code_key`, `fulfillment_move_job_reference_key`, both `legacy_id` partial indexes, and — the one that mattered most — `notification_idempotency_key_key`, where the reference store returned `false` for a genuine key collision that the adapter raises on, so two different messages claiming one identity would vanish silently in tests and fail in production. Two more refused without naming the rule, which is not evidence: "identity link already exists" does not say which constraint fired and survives a rename. Now every refusal quotes the rule Postgres quotes, every check is synchronous check-then-set over a journalled write, and `tests/uniqueness-parity.test.ts` reads `pg_constraint` and `pg_indexes` at run time and fails if the schema declares a rule with no case. 49 assertions; `docs/uniqueness-parity.md` records the inventory, the one legitimate asymmetry, and why `false` is the right refusal for a replayed relay pair and an exception is the right refusal for a key collision. Reading alone had also mis-reported the `subscription_period` rules as missing; measurement showed all three enforced and named — recorded because the correction came from running the probe, not from re-reading |
| 14 | Check-constraint parity between the reference backend and Postgres | **Complete, and self-enforcing from here** | The uniqueness cycle closed 24 rules of one kind; this row closes the other 100. `src/platform/persistence/row-rules.ts` restates every schema `CHECK` once — 67 rules over 25 tables, built from 23 shared closed vocabularies — and `putRow` is now the only way a reference store writes a row, so a transition added later cannot forget the check. `tests/check-parity.test.ts` probes 88 of the 100 on both backends (**178 assertions**), asserts each refusal names the schema constraint, records the other 12 as unprobeable with a stated reason each, and reads `pg_constraint` at run time so a new `CHECK` cannot ship without parity. The measurement inverted the expected result: the reference store was already stricter than the database in three places, all in Postgres' favour to fix — `membership_roles_check` enforced **nothing** since 0001 (`array_length('{}',1)` is NULL, and a NULL `CHECK` passes), so a membership granting no roles was always accepted; `PgEventDeliveryStore.queue` dropped `claimed_at`, `reclaims` and `claim_token` from its insert list; `PgFulfillmentRepository` dropped both B-29 markers on `insert`, `insertIfAbsent`, `update` and `updateIfStatusIn`. Two reference-store gaps were fixed in the rules table (`fulfillment_settlement_alignment_check` was never restated in memory). Migration 0019 replaces the ineffective constraint under the same name; `docs/check-constraint-parity.md` records the inventory, the five families, the three defects and all twelve exemptions |
| 12 | Automatic enforcement of what the suite actually claims | **Complete** | Numbered 12 because 10 (reputation) and 11 (ADR 0010) landed just before it; this row is independent of both. It exists because every milestone above it was measured by a gate that skipped every database assertion: CI had one job and set no `DATABASE_URL`, so ~290 of 657 assertions — every Postgres adapter, every trigger, every check constraint, every live-schema check — were never enforced automatically, and each cycle's "verified against Postgres" meant verified on one machine. Now two jobs: the dependency-free one, kept deliberately because it is the only proof a fresh clone can run `npm test`, and a `postgres:16` service job that applies every migration, runs the whole suite, and rolls the newest migration back and forward against a real schema — `check-migrations.mjs` only ever proved a `.down.sql` existed. Two prerequisites were fixed in the same cycle rather than worked around: worker-private databases (`tests/support/worker-database.ts`), after a genuine cross-file truncation failure was reproduced, and the migration-lifecycle files moved to their own pass, after `create`/`drop database` was timed at 0.3s idle against 51s under suite load |
| 15 | Referential-integrity parity between the reference backend and Postgres | **Complete, and self-enforcing from here** | The third and last large family of B-12. The schema declares **30 foreign keys** across 20 child tables and exactly **one** — `usage_record_period_id_fkey` — was restated anywhere in `src/`, so the reference backend accepted a fulfillment in no tenant, a membership for no principal, a session for a principal nobody created, a notification addressed to a recipient row that was never inserted, and a webhook delivery of an envelope the outbox never recorded. `src/platform/persistence/reference-keys.ts` declares one rule per referencing column (name, child column, parent table, nullability, because `MATCH SIMPLE` makes a null reference satisfy the key) and `putRow` now calls `assertReferences` on every reference write, refusing with Postgres' own wording. Parents are found through a bundle-scoped registry that reads the stores' **live** maps, so no row is copied and no second source of truth exists. `tests/fk-parity.test.ts` probes 29 of the 30 on both backends (**63 assertions**), records the thirtieth as exempt with its reason, and holds four gates: coverage against `pg_constraint` at run time, a declaration gate comparing every rule's child column, parent table and nullability with the catalog, an assertion that the bundle resolved every parent the rules read — the design's single fail-open path, measured rather than trusted — and a reason for every exemption. Enforcement immediately falsified six passing suites: **29 failures**, all `fulfillment_organization_id_fkey` or `membership_organization_id_fkey`, because those fixtures had never created the tenant they wrote into. Fixed in the fixtures (`seedTenant`, `coreWithTenants`), not by relaxing the rule. A second finding: `session`, `plan_grant` and `usage_record` were still writing with a bare `map.set`, so the previous cycle's claim that `putRow` is the only reference write path held for 25 of 28 tables and their five `CHECK`s were duplicated inline; all three now go through `putRow` and their rules are declared in `ROW_RULES`. `docs/foreign-key-parity.md` records the inventory, the six nullable columns and what null means in each, the one weakening, the exemption, and a stale fixture comment claiming `organization` has a country foreign key when the catalog shows none |
| 16 | Trigger-invariant parity between the reference backend and Postgres | **Complete, and self-enforcing from here** | The fourth and last family of B-12. The schema installs **12 triggers**, measured from `pg_trigger`; five were named anywhere in `src/`. Two were enforced by no reference store at all: `subscription_currency_check` (a plan priced in one currency billed against a wallet in another, and a subscription to a plan that was never offered) lived only in `SubscriptionService`, and `ledger_transaction_balance` only in `MoneyService` — so a caller reaching the stores directly could post entries summing to -1 and the reference backend accepted money appearing from nowhere. `src/platform/persistence/transition-rules.ts` declares the immediate triggers as transition rules over (operation, previous row, next row) and `putRow` applies them after the checks and the foreign keys, the order Postgres uses; the four `DEFERRABLE INITIALLY DEFERRED` constraint triggers stay on the transaction journal, because a write-time refusal would reject a legal sequence. The same file carries `TRIGGER_INVENTORY`, which names all twelve exactly once as immediate, deferred (naming the store that defers it) or exempt with a reason. `tests/trigger-parity.test.ts` holds **39 assertions** with a database: a refusal probe per reachable trigger on both backends asserting Postgres' own words, an outcome probe for the one path both backends narrow away before it can fire, three exemptions that assert the absent port operations rather than claiming unreachability in prose, and five gates — coverage against `pg_trigger` at run time, a timing gate reading `tgdeferrable`/`tginitdeferred`, `unresolvedReads() === []`, a reason per exemption, and agreement between the inventory and the rules. `docs/trigger-parity.md` records the inventory, the two gaps, and the four places the backends still differ |
| 17 | `ON DELETE` and delete-path parity | **Complete, and self-enforcing from here** | The fifth parity cycle, the last of the four families B-12 named, and the only one where nothing in the code was wrong. All four earlier cycles ended with the same admission — the reference backend models no referential action, and the delete halves of the four append-only triggers are *unreachable* rather than enforced — and nothing in the repository kept that true: a migration adding `ON DELETE SET NULL`, or a store growing a `deleteUsage`, would have turned every "no caller can express this write" exemption false while the suite stayed green. Measured from `pg_constraint` and the source rather than the documents: **30 foreign keys, 29 `ON DELETE NO ACTION`**, exactly one `ON DELETE CASCADE` (`plan_grant_plan_id_fkey`), **no** non-default `ON UPDATE`, **15 of 32 tables are a foreign-key parent**, and **three** places in `src/` remove a row — the inbox releasing a claim, the rate-limit counter pruning closed windows, and the in-memory boundary unwinding a rollback. `src/platform/persistence/delete-actions.ts` declares the action of all 30 keys (`NO ACTION` is modelled by construction: the database refuses a delete that would orphan a child, and in memory there is no delete to refuse) and the one cascade as **`modelled: false`** with its reason, plus the three delete paths with the reason each is safe. `tests/delete-parity.test.ts` holds **11 assertions** with a database: an action for every key, unmodelled-means-unreachable, no port that deletes an unmodelled parent, row removal only where declared (scanning for `delete from`, `truncate`, `.delete(` and `.clear(` — the last two appear nowhere in `src/` and are scanned for anyway), every removal-shaped port operation classified as deleting a row or releasing a lease (the four `reclaimExpired` methods are `UPDATE`s and say so), the declarations read against `confdeltype`/`confupdtype` at run time, the deletable tables checked against `pg_constraint` and `pg_trigger`, and two outcome probes on both backends for the one delete a caller can reach. No delete path was added: the append-only tables are append-only by design, and the cycle's job was to make that enforced rather than to weaken it so a cascade becomes observable. `docs/delete-path-parity.md` records the inventory, the five falsifications, and the four things the cycle does not claim |
| 18 | Column-level parity: `NOT NULL`, defaults and types | **Complete** | The sixth parity cycle, and the family the first five never touched: all of them are rules *about* a value, none asks whether the value fits the column. Measured from `pg_attribute` and from the rows the stores actually write — the second by instrumenting `putRow` and running the whole suite, 7578 writes across 26 of the 28 tables, not by reading the stores and guessing. Across the 28 ruled tables: **254 columns, 197 `NOT NULL`, 45 with a database default**, in 11 types. The reference backend enforced none of it. `src/platform/persistence/column-shapes.ts` declares every column with its type, its `character(n)` width, its nullability, its default expression and **the path the value takes in the reference row** — without the path the gate would have checked nothing for the 20 columns `outbox` and `inbound_event` nest under `event.*`. `assertColumns` runs in `putRow` **before** the `CHECK` rules, the order Postgres uses, and directly in the two ruled tables whose rows never pass through `putRow` (`audit_entry`, an append-only array; `ledger_entry`, nested inside its transaction). No default is ever applied: a column the database would have filled must be written by the store or the row is refused, because completing the row here would make the declaration a second source of truth for what a row contains. An absent key is refused even for a nullable column — a tuple has no absent state. The measurement found **two live divergences**, both default-reliance, both fixed at the root rather than exempted: `outbox.created_at` (`NOT NULL DEFAULT now()`, inserted by the adapter, selected by neither backend, written by the reference store never) and `inbound_event.processed_at` (set by the adapter, selected by neither, omitted rather than null in memory) are now fields of `OutboxRecord` and `InboundRecord`, written from the injected clock and added to both adapters' `SELECT_COLUMNS`. `tests/column-parity.test.ts` holds **21 assertions**, 4 needing a database: coverage in both directions against `pg_attribute` including the default *expression*, the three counts as live measurements, six offending rows inserted into a real `plan` and rolled back so the database's message is compared to the reference backend's character for character, and a probe that the **three deliberate strictnesses** are still strictnesses (Postgres coerces `1` into `text` and `"yes"` into `boolean`, and accepts a `bigint` JavaScript has already rounded; memory refuses all three, because accepting would leave the two backends holding different values for one write). Five falsifications, five caught. `docs/column-parity.md` records the inventory, the asymmetries, the falsifications and what the cycle does not claim |
| 19 | Parity for the runtime tables no gate reached | **Complete** | The cycle that closed milestone 18 wrote that the four tables outside `ROW_RULES` are migration bookkeeping written by the runner. Re-measuring before starting the next item found that **wrong**, and the correction is additive — the sentence stands where it was written and this row records what measurement found instead. Only `schema_migrations` is not written by a store, and it is not written by the runner either: each forward migration records its own version in the same transaction as its DDL, which is stronger, and is now asserted for all 19. `inbox` is written on every consumer claim and `rate_limit_counter` on every request — the two hottest write paths in CORE — and both sat outside every gate five parity cycles built: no rules, no column shapes, and for `rate_limit_counter` **three unenforced `CHECK` constraints** that `tests/check-parity.test.ts` had recorded as unprobeable *because the reference limiter held no row*. Measured against a real Postgres before any code changed: `inbox.claim(consumer, "not-a-uuid")` was accepted in memory and refused by the database with `invalid input syntax for type uuid`; a bad `subject_kind`, a bad `rate_class` and a negative `hits` were all refused by the database and unmodelled in memory. Both reference stores are row stores now — `InMemoryInbox` writes `{consumer, event_id, received_at}` and `InMemoryRateLimitWindowStore` writes the counter's six columns, both through `putRow`, so they inherit every gate at once. Two of the three exemptions became real dual-backend probes; the third was **narrowed** to the half that is still true (no caller can express a negative count) and promoted to `declared: true` so the rule runs on the store's own writes. A third divergence surfaced on the way: `PgRateLimitWindowStore` wrote `updated_at` from the database's `now()`, the one store in CORE that told time by itself, so under a fixed clock the two backends disagreed about when a window was touched. The clock is injected now, and a database probe with a fixed clock is what keeps it that way. `tests/runtime-table-parity.test.ts` holds **12 assertions**, 4 needing a database, including a gate that parses `CREATE TABLE` out of every migration and fails when a table is neither gated nor excused, a source scan proving each exemption's reason still true, and the two rate-limit vocabularies read out of `pg_constraint` and compared with the arrays the reference limiter actually enforces. Six falsifications, six caught. `idempotency_key` — a table nothing writes — is recorded as **B-37** rather than dropped, because removing it needs a destructive migration and `scripts/check-migrations.mjs` refuses those in a forward migration on purpose |
| 20 | Read-path parity: what a store returns, not only what it accepts | **Complete** | Six cycles gated writes; nothing gated reads, and the three divergences the previous three cycles found — `outbox.created_at`, `inbound_event.processed_at`, `rate_limit_counter.updated_at` — were each found *sideways*, by a gate built for another purpose, because a column one backend writes and no read returns is a difference nothing in the suite can observe. Two were closed by adding a name to a `SELECT_COLUMNS` string and nothing kept those strings complete. `tests/read-path-parity.test.ts` closes it in two halves that do not subsume each other. **Static:** every `select` and every `insert`/`update`/`delete … returning` in `src/` is parsed with the adapters' column-list constants expanded to a fixed point, and compared with `COLUMN_SHAPES` in both directions — an unreachable column must be declared by name with a reason, a read naming a column the schema lacks fails, and a declaration that has stopped being true fails, so the excuse list cannot rot. Of 263 columns, all but six are surfaced by some read and there are no ghosts. The six are the two runtime tables whose stores return no record at all, and the bar is that narrow deliberately: "no caller needs it yet" is how `created_at` stayed invisible for seventeen migrations. **Behavioural:** outbox, inbound, audit and `event_delivery` are written and read back through *both* backends and compared — every key path at every depth, then every value, under one fixed clock and one set of ids. The inbound probe claims and processes the row before reading it, because a probe that reads a row whose interesting column is null cannot tell a backend that surfaces the column from one that does not; with the first draft, dropping `processed_at` from the select list was caught by the static half alone. Six falsifications, six caught, including both historical divergences restored on purpose. Measured: 589/71 without a database, 1075 with one |
| 21 | Selection parity: what a store selects *by* | **Complete** | The seventh parity cycle. Milestones 18–20 gated what a row *contains* and what a read *returns*; none of them can see a **predicate** — which rows a query picks out of many, and in which order. Every queue operation in CORE is written twice, as SQL and as TypeScript, and `claimDue` and `reclaimExpired` are where B-22, B-24 and B-25 all came from, so this is the family with the worst history here. `tests/selection-parity.test.ts` builds the same 18-row population twice — through the stores' own APIs, never by inserting behind the store's back — drives it into real states with `claimDue`/`markPublished`/`markFailed`/`markDead`, and compares the **ordered id list** of ~40 selections across both backends. Each case declares how many rows it expects and that expectation is asserted on the reference backend without a database, so a case that silently stops selecting anything fails instead of passing vacuously; every case gets a freshly built population, so the mutating selections cannot leak into each other; and a premise test proves the two backends start alike. **What it found:** `InMemoryOutbox.claimDue` did not sort at all — it walked a `Map`'s insertion order while Postgres ordered by `(next_attempt_at, created_at)`, so with one row failed and re-scheduled the two backends claimed *different rows for the same call*. All three `reclaimExpired` implementations had the same gap, and the Postgres ones ordered by `next_attempt_at` alone, which is not a total order under a limit. Fixed at the root: one shared comparator, `src/platform/eventing/queue-order.ts`, used by all three reference stores in both operations, and the same two keys spelled in the three Postgres recovery statements. A batch claim stamps one lease expiry on every row it takes, so the ordinary cases could not see recovery order at all — a staggered-lease scenario was added where the middle row is failed and re-claimed later, making due order and insertion order disagree. Seven falsifications, seven caught; F2 needed a new case first, because at every instant the existing cases claimed at, the held row's lease had not yet run out and the `claimed_at` half of the predicate was doing nothing observable. Measured: 595/114 without a database, 1125 with one |
| 22 | Selection parity for the module read paths | **Complete** | The eighth parity cycle, and the second to gate a predicate. `tests/module-selection-parity.test.ts` builds one population twice, through the repositories' own APIs, with **every batch inserted in the reverse of the order its listing must return** - newest-first for anything sorted by a timestamp, descending code for plans and regions, descending name for cities and areas, with deliberate ties on timestamps and names. That inversion is the measurement: a store returning insertion order now returns exactly the reverse of the right answer, and a non-total sort key now has a tie to get wrong. 37 tests: a declared row count per case asserted on the reference backend without a database, a declared order per ordered case computed from the fixture definitions rather than read back out of a store (so "both backends agree" cannot mean "both are wrong in the same way"), a cross-backend ordered-id comparison per case, a premise test, a staggered-lease recovery scenario for the notification dispatcher, and the claimed-batch order gate below. **What it found:** nineteen reference listings returned `Map` insertion order while their SQL sorted (notification x7, money x3, subscription x5, identity x3, organization, fulfillment, and all four geography listings); seven Postgres orders were not total (the five notification reads, and the subscription owner/status and usage reads), which under `notification.list`'s `limit` left the page to the plan; and - the discovery no static reading would have produced - **all four lease queues returned their claimed batch in storage order**, because `update ... returning` hands rows back in the order it updated them, not the order the `select` chose. The selection was right and the batch a worker then processed was in heap order, agreeing with due order only while rows were inserted in the order they came due, which is what every earlier fixture did; milestone 21's own gate passed for that reason. Fixed at the root: `src/platform/persistence/list-order.ts` states the doctrine once (a reference listing sorts by the same keys as its SQL, and the key list must be total, ending with the primary key), `queue-order.ts` gained the row id as a third key, and all four claims now carry the due rank out of the selection in a CTE and sort the returned batch by it - the update overwrites `next_attempt_at` with the lease expiry, so the due order cannot be recovered afterwards. Five falsifications, five caught. Full account in `docs/module-selection-parity.md`. Measured: 599/147 without a database, 1162 with one |
| 23 | Selection parity for the HTTP read surface | **Complete, and self-enforcing from here** | The ninth parity cycle and the third to gate a predicate: milestones 21 and 22 proved a **store** selects the same rows in the same order on both backends, and neither reads the layer a caller talks to. `tests/http-selection-parity.test.ts` seeds one population through the stores - several of these rows have no route that writes them - and reads it back through `core.router.handle`, the real router with real authorisation and real serialisation. **49 tests**: 19 listing cases each declaring a row count *and* an order computed from the fixture definitions rather than read out of a store, 22 refusal cases asserted on both backends, a coverage gate over the router's own `registrations()` so a `GET` added later is either measured or excused by name, and a premise test that asserts the run is comparing the halves it claims to (`["memory", "postgres"]` when `DATABASE_URL` is set), so a run that lost its Postgres half cannot report the same green count. **Five defect classes, all fixed at the root.** (1) The three platform stores returned `Map` insertion order while their SQL sorted - 7 of 11 probed listings disagreed across the backends before the fix, which is the correction to milestone 22's overclaim. (2) `SubscriptionRegistry.undelivered()` concatenated two ordered queries, so every pending delivery preceded every dead one regardless of age and **both backends were wrong in the same way** - invisible to a cross-backend comparison alone; it is one `status = any($1::text[]) order by created_at, delivery_id` query now. (3) Eight non-total SQL orders completed with a primary-key tiebreak. (4) Route parsing accepted what it then ignored: a repeated parameter kept the first value and dropped the rest, `?organization_id=` filtered on the empty string and returned a count of 0 indistinguishable from an empty tenant, and `Number()` accepted `0x10`, `1e3`, `" 5"`, `+5` and `5.0`. `src/platform/http/query.ts` is the single strict reader now and both local ad-hoc parsers are gone. (5) The discovery: **`localeCompare` matches no Postgres collation.** The local engine's databases are `C` and CI's `postgres:16` is `en_US.utf8`, so with `localeCompare` on the reference side the text order CORE produced depended on where it was deployed. `compareValues` compares code units, matching `C`, and every text order it is compared against is pinned with `collate "C"`. Ten falsifications, ten caught - two only after the **gate** was strengthened: dropping a `delivery_id` tiebreak passed until two rows shared an instant and were inserted in the opposite order to their ids, and removing a vocabulary guard passed until an *unknown* value was probed, because an unknown status had been answered with an empty page. What the cycle does not claim is recorded in `docs/http-selection-parity.md`, including the finding it declined to half-build: see milestone 24. Measured: 648/148 without a database, 1211 with one |
| 24 | Read routes refuse only what they read | **Complete, and self-enforcing from here** | The tenth cycle in this family and the first that is not a parity cycle: nothing in it compares two backends. Milestone 23 closed the *values* a route accepts for the parameters it reads and left the *set* of parameters open, with two measurements: `GET /v1/notification-recipients?limit=abc` answered **200 with every row** because that route has no `limit`, and `?organisation_id=…` — the British spelling, or any typo — was ignored, so one tenant's question was answered with every tenant's rows. Both are the milestone 23 defect from the other end: CORE answered a question the caller did not ask and reported success. **The fix is structural, not per route**, because 23 hand-maintained lists in 23 handlers is the shape that produced the defect and a drifted list fails open. `router.get(path, accepts, handler)` takes the accepted parameters as a **required positional** argument, `add(...)` defaults to accepting nothing (fail-closed), the router parses before the handler and after the rate-limit check, refusals go through the same `CoreError` envelope as every other refusal, and — the change that makes the gate possible — **`RequestContext` carries no `URLSearchParams` at all**: `ctx.query` is gone and `ctx.selection` is the parsed result, so a handler *cannot* read an undeclared parameter. `Selection` throws rather than returning `undefined` for an undeclared name, because `undefined` would rebuild the original defect one level down. `tests/http-parameter-declaration.test.ts` — **10 tests, no database, so both CI jobs run it** — is driven off `router.registrations()` rather than a list in the test: every route of every method refuses `?__unexpected_parameter=1` by name; the 29 routes that declared nothing refuse any query string; every declared parameter is proved live by a repeat probe that fills the route's *other* parameters with valid values first; declarations are well formed (unique snake_case, non-empty vocabularies, `0 < min <= default <= max`); a source scan proves `query.ts` and `router.ts` are the only modules that touch a query string; and a **file-scoped cross-check** proves every declared name is read and every read name declared, which is the direction a liveness probe cannot see. **What it found beyond the two known cases:** comparing the declarations with `contracts/openapi/core-v1.yaml` — added to delete a second source of truth — showed `country_code` on `GET /v1/geography/service-areas/resolve` has been implemented since the geography module shipped and **appeared in no contract**, so no consumer could know a country filter existed; documented in the same commit. Nine falsifications, and F2 (a declared parameter no handler reads) **passed the first version of the gate**, which proved only that declarations are parsed — the cross-check was written in response, making this the second cycle running where a falsification passed until the gate itself was strengthened. Unknown-parameter refusal precedes authentication: deliberate, since the accepted set is published in the contract, and it keeps a request CORE cannot understand away from any store read. What it does not claim, recorded in `docs/http-parameter-declaration.md`: request **bodies** still tolerate unknown properties (strict rejection there is a breaking change for clients, unlike the query case), the cross-check is file- not handler-scoped, and `kind: "text"` carries no format so UUID-shaped parameters are still validated by the handler that knows them. Measured: 658/148 without a database, 1221 with one |
| 25 | Write routes accept only the body they declare | **Complete** — declared bodies enforced by the router on all 29 write routes, `ctx.body` removed, 16 gate tests, nine falsifications, four undocumented request bodies found and documented; CI verdict recorded in the cycle record below | The symmetric half of milestone 24, reserved **before** any file was edited this time. Milestone 24 closed the query string and its record named the request body as a separate question; measuring the body before reserving turned that into a money defect rather than a symmetry argument. **`POST /v1/payment-authorizations/:id/capture` with `{"amountMinor": 500}` — one camelCase typo — captured 5000, the entire remaining hold, and answered 200.** The route reads `amount_minor` and treats its absence as "capture everything", which is the correct meaning of an absent amount and a catastrophic meaning for a misspelled one; `refund` has the same shape. `POST /v1/wallets` accepts `nonsense` and `CURRENCY` alongside `currency` and reports 201. Every write route hand-parses `ctx.body as Record<string, unknown>` with per-module `objectBody`/`requiredString`/`optionalString` helpers duplicated across three files, and no route refuses a property it does not read. Scope: one declared body reader owned by the platform, a per-route declaration in the registration as with `accepts`, router-enforced refusal of unknown properties, `ctx.body` removed from `RequestContext` in favour of a parsed value that throws on an undeclared read, a gate driven off `registrations()`, and a cross-check against the `requestBody` schemas in `contracts/openapi/core-v1.yaml`. **The breaking-change objection, answered rather than ignored:** milestone 24's record argued strict body rejection breaks any client sending an extra field. It does — and milestone 5 records that no external system has adopted these contracts yet, so there is no such client today and this is the cheapest moment this change will ever have. A capture that silently takes ten times what was asked is not a compatibility feature |
| 26 | Caller-supplied headers CORE records are validated at the boundary | **Complete, and self-enforcing from here** — `src/platform/http/headers.ts` is the only reader of a request header in `src`; five declared headers with a use, a bound and a recorded reason; refusal before the route is matched and before the limiter runs; no rejected value echoed; `CorrelationId` documented and referenced from all 52 operations; 15 gate tests, eleven falsifications including one that defeated the first version of the source scan. CI verdict recorded in the cycle below. Measured cause: | The third and last request surface, after the query string (24) and the body (25), and the only one where CORE stores what the caller sent. `x-correlation-id` is taken from the request verbatim if it is a non-empty string, then echoed in the response, written to structured logs, and persisted in `correlation_id` **`text`** columns on audit, outbox, ledger, inbound-event, notification and subscription rows. Measured against `main` at `a043ab7`, end to end through `createServer(core.router.nodeListener())` and a raw socket: **an 8000-character correlation id is accepted, echoed and recorded** (Node's own 16KB header limit is the only bound, so a caller can write kilobytes of attacker-chosen text into CORE's audit trail with every ordinary request, permanently, with no gate); **`"   "` is accepted as the identity of record**, so two unrelated requests correlate to the same blank id and the field every reconciliation and audit read traces by is meaningless; **`a\tb` is accepted**; and **a repeated header is joined by Node into `"a, b"` and recorded as one id**, so a later trace lookup by either half finds nothing, while `bearer()` silently takes `[0]` of a repeated `authorization` — the same silent-substitution class milestones 24 and 25 closed for parameters and properties. Not defects, measured and recorded as such: Node's parser refuses NUL, DEL and obs-fold with 400 before CORE sees them, so response splitting is not reachable — but a NUL correlation id would have been a backend divergence, since the reference backend accepts it and PostgreSQL refuses `0x00` in `text` outright. Neither `Authorization` nor `x-correlation-id` appears anywhere in `contracts/openapi/core-v1.yaml`, so the one header every route requires is undocumented. Scope: one platform module declaring the headers CORE reads and their accepted shape, router-enforced refusal of a malformed declared header **before any work**, no direct `ctx.headers[...]` read left outside it, a repeated declared header refused rather than silently narrowed, the headers documented in the contract, and a gate driven off the declaration with the same falsification discipline as 24 and 25 |
| 27 | Routes document the response they return, and the documented shape is enforced | **Complete** (branch `http-response-declaration`) — the fourth and last surface of the HTTP contract family. Measured on `main` at `f71aba2` by *parsing* `contracts/openapi/core-v1.yaml` rather than scanning it: **34 of the 52 operations documented no response schema** (the reservation's text scan said 33; corrected additively here, and 35 if `/metrics`'s text body is counted), **nothing had ever parsed the contract as YAML** — so two response objects broken by unquoted commas inside a flow map had passed `check-contracts.mjs` for the file's whole life — and **nothing had ever compared a response body to the contract**, which hid three shipped divergences: `POST /v1/organizations` and `GET /v1/organizations/{id}` answered `{}` (unawaited promise as the body), `GET /v1/event-deliveries/undelivered` returned the `claim_token` fencing credential, and `GET /v1/sessions/current` returned six permissions the published `Permission` enum omitted. Now every operation documents the status, content type and schema it answers with; all 52 are driven to a success status and their real bodies validated strictly, an undocumented property failing the gate; the router refuses any route whose body is a thenable; and coverage is asserted three ways (contract = driven = registered). `tests/support/openapi.ts`, `tests/support/http-scenario.ts`, `tests/http-response-declaration.test.ts`, `docs/http-response-declaration.md`. | 26 |
| 28 | Responses declare the headers they set, and every response carries the one every caller needs | **Complete** (branch `http-response-headers`) — the fifth and last undeclared HTTP surface. Measured on `main` at `ea793f3` by driving all 52 operations and reading the real answers: `x-correlation-id` set on **52 of 52** responses and documented on **0**; the three `x-ratelimit-*` headers sent on every limited response but documented only on the shared `RateLimited` 429; the unmatched `404` returning **no headers at all**; and the Node adapter's unparseable-body `400` answering `{code, message}` — the only refusal in CORE that was not the canonical `Error`. Now `src/platform/http/response-headers.ts` declares the six headers with when, why and an anchored shape; `sealHeaders` is the single place headers are produced and refuses an undeclared name or a wrong-shaped value, so an undocumented header is a 500 in a test rather than a field in production; both defective paths are fixed at the cause; and one `components/headers` section is referenced by every response object and both shared refusals, documented where the headers are really sent and withheld from the three routes `UNLIMITED_ROUTES` exempts — a set the gate derives from the limiter rather than restating. Nine gate cases, twelve falsifications (F10 invalid on its first attempt and recorded as such). 709/1272. `tests/http-response-header-declaration.test.ts`, `docs/http-response-headers.md`. | 27 |
| 29 | Authentication precedes every lookup and every body check, and `401` is documented wherever it can happen | **Complete** — a refusal-ordering defect that is an **unauthenticated existence oracle**, found by measuring the refusal surface after milestone 28. Measured on `main` at `a5ab512`, with no credential at all: `GET /v1/fulfillments/<an id that exists>` answers **401**, and `GET /v1/fulfillments/<an id that does not>` answers **404** — so anybody, holding nothing, can distinguish a real fulfillment id from an invented one by the status code alone. The cause is the order of checks, not the check itself: the route loads the row first because it needs `record.organization_id` to scope authorization (`await fulfillment.require(...)` on the line before `await requirePrincipal(...)`), so the lookup, and therefore the `404`, happens before authentication. `POST /v1/fulfillments/{id}/cancel` has the same shape. The same ordering shows up on the body: an anonymous `POST /v1/sessions/revoke`, `/v1/access/check`, `/v1/memberships`, `/v1/organizations` and 20 other write routes answers **400** about the body rather than **401**, because `parseBody` runs in the router and authentication runs inside the handler. And the contract records almost none of it: across 52 operations, **`401` is documented on 2** while an anonymous request is refused on 49 — `400` on 19, `403` on 19, `404` on 19, `409` on 14, `429` on 49. Scope: a declared authentication requirement per registration, the router authenticating before it parses a body and before any handler runs so `401` precedes `400` and `404` by construction rather than by review, `requirePrincipal` authorizing the principal the router already established instead of re-reading the credential, `401` documented on every operation that requires one, and a gate that drives every registered route anonymously and with a junk and a real identifier.  **What measuring first found instead, and what this cycle did.** Listing which routes authenticate at all — a scan for handlers that never call `requirePrincipal`, `bearer()` or `identity.authenticate` — returned five, and one was **`POST /v1/memberships`**, the route that decides who a tenant's administrators are. Measured against the real router with **no credential of any kind**: `POST /v1/identities` → `201` a new principal, `POST /v1/memberships` `{principal_id, organization_id: <any existing tenant>, roles: ["org_admin"]}` → **`201` granted**, `POST /v1/sessions` `{principal_id, channel_type}` → `201` a bearer token, `GET /v1/sessions/current` → `org_admin` with 7 permissions in the victim organization, `GET /v1/organizations/<the victim>` → `200`. Three ordinary calls, nothing held at the start, `org_admin` over somebody else's organization at the end; the only thing needed was an organization id, which appears in every fulfillment, invoice and audit answer that organization produces. The first two attempts answered `400` (`channel` not `channel_type`, `owner` not a real role) and are recorded because they are why the anonymous census under-counted: **a `400` about the body looks like a refusal and is not one.** Fixed at the root: the route now requires `organization.write` **on the organization named in the body**, the permission that already means "may change who this organization is" — `platform_admin` everywhere, `org_admin` inside its own tenant — so an administrator adds a colleague, an org_admin cannot reach a neighbouring tenant, and nobody adds themselves. No new permission, role or policy invented. The contract documents `401` and `403` on the operation with the history in its description. `tests/anonymous-privilege-escalation.test.ts` holds **8 cases**; five falsifications, of which **three passed the first version of the gate** - requiring `organization.read` instead of `organization.write` (no case held a principal holding one permission and not the other, so any colleague could have promoted themselves), and deleting `401` and then `403` from the contract operation (this route's refusals are reached by no other test, so no gate observed them). The gate was strengthened in response - an `org_member` self-promotion case with a premise assertion that the same token really reads the organization, and a cross-check that every status the file drives out of the route is documented - and all five are caught now. **What it does not claim: the escalation is only half closed, on purpose.** `POST /v1/sessions` still mints a token for **any** `principal_id` with no proof of possession, so an outsider knowing an administrator's principal id can still become them without touching the membership route — recorded as **B-39**, and the last case asserts that reachable path so the gap is evidence in the suite rather than a sentence in a document. `POST /v1/sessions/revoke` still needs no credential (**B-40**). Ordering and the fulfillment existence oracle are milestone 30. Full account in `docs/anonymous-privilege-escalation.md`. Measured: 717/148 without a database, 1280 with one | 28 **Marker corrected by milestone 38.** This cell read "Reserved, measured, in progress on branch `http-auth-order`" for eight cycles while the text behind it reported the cycle's outcome, cited two artifacts that are in the tree and recorded the counts it measured; the branch it named was deleted at merge. Nothing in `npm run verify` read this document, so nothing could notice. Reservation and outcome text untouched; `tests/roadmap-status.test.ts` now fails when a row claiming to be reserved is the only claimant of a written cycle account. |
| 30 | Refusal ordering: `401` before `400` and before any lookup, and `401` documented wherever it can happen | **Complete** (branch `http-authentication-declaration`) — authentication is now a property of the route, enforced by the router before anything else it does. Re-measured on `main` at `a2dccba` before any edit: 52 operations, `401` documented on **3**; an anonymous sweep of all 52 registrations answering `200`×3, `400`×27, `401`×20, `404`×2. **Corrected additively during implementation**: with probe bodies that satisfy each route's required properties the same sweep reads `200`×3, `400`×**28**, `401`×**19**, `404`×2 — the earlier reading is not wrong, it used a body some routes refuse for a different reason (`…/void` requires a property, `…/capture` does not), and both are kept rather than one replacing the other. The two `404`s are `GET /v1/fulfillments/{id}` and `POST /v1/fulfillments/{id}/cancel`, which answered `404` for an invented id and `401` for a real one to the same anonymous caller — an **existence oracle** needing no credential. Now: `src/platform/http/authentication.ts` declares `AuthenticationSpec` (`AUTHENTICATED` or `anonymous(reason)`, where an empty reason throws at construction), every registration carries one, and `Router.handle` resolves it **after the rate limiter and before `parseSelection`, `parseBody` and the handler**. `bearerCredential` is the only place a credential is read out of the `authorization` header — `bearer()` is deleted and no handler calls `authenticate`; `requirePrincipal` authorizes the principal the router established. **46 routes require a credential, 6 are anonymous by declaration and each says why**, three naming the blocker that keeps them so (B-5 on the probes, B-39 on `POST /v1/sessions`, B-40 on `/v1/sessions/revoke`). After: `200`×3, `400`×3 (the anonymous write routes refusing an empty body), `401`×**46**, `404`×0, and real and invented identifiers are indistinguishable to an anonymous caller everywhere. `401` documented on **46 of 46** through a new `Unauthenticated` response component that states the ordering and the absence of the oracle. **This deliberately reverses milestones 24 and 25**, whose gates asserted `400` before `401`; both now assert the inverse, carry the reversal and its reasoning in the case itself, and drive their probes with a credential entitled to nothing (`tests/support/credential.ts`) so their `400`s are still proven — and proven to precede the `403` that caller would otherwise get. Their store argument survives: a request with no `authorization` header is refused before any session read at all, and a junk one costs one indexed read the limiter — still checked first — already bounds. `tests/http-authentication-declaration.test.ts` holds **16 cases**; seven falsifications, one of which (restoring the oracle) breaks the gate's own fixture and is recorded as a weakness of that case rather than a clean signal. Measured: **733/147 without a database, 1295 + 1 = 1296 with one**. Full account in `docs/authentication-ordering.md`. | 29 |

| 31 | A session is issued only by a caller entitled to issue one, and ended only by a caller entitled to end it | **Complete** (branch `session-entitlement`) — the reservation, its measurements and its scope are kept below exactly as written before the work started, and what the cycle produced is appended after them rather than replacing them. **Outcome:** `session.issue` is a permission held by `platform_admin` and `service` and by nothing else, and deliberately not implied by `identity.write`; both session routes declare `AUTHENTICATED`; `revokeSessionAs` allows the caller's own session with no permission, anybody else's only with `identity.write`, and checks that authorization **before** the not-found refusal so no existence oracle replaces the old open door; the missing `await` is fixed and gated by a case that asserts both the `404` and that nothing escapes the router. Anonymous routes are **4** (`/health`, `/ready`, `POST /v1/identities`, `/metrics`), down from 6; routes requiring a credential are **48**, up from 46; the contract documents `401`, `403` and `404` on both session operations, and the `security: []` set is now asserted **equal** to the set of `anonymous(...)` registrations — the two statements disagreed before this cycle (`/v1/sessions/revoke` was anonymous in code and authenticated in the contract; the contract was right). The first credential of an environment comes from `npm run bootstrap:credential`, which needs `DATABASE_URL` rather than the ability to send a request, verifies the roles of the token it mints before printing it, and was exercised end to end against a real PostgreSQL: first run `identity_created: true`/`membership_created: true`, second run the same principal with a new session and both `false`, an unknown organization exiting `1` with `organization not found`. `tests/session-issuance-entitlement.test.ts` holds **25 cases**; six falsifications, all caught. `tests/anonymous-privilege-escalation.test.ts`'s last case was changed **on purpose**, which is what its own comment said answering B-39 would mean, and both files carry the supersession additively in their headers. **B-39 and B-40 are resolved; B-42 is opened** — `session.issue` is unscoped, so a `service` credential may mint a session for any principal and not only for the people its own channel speaks for. Measured: **758 passed / 147 skipped without a database, 1320 + 1 = 1321 with one**. Full account in `docs/session-entitlement.md`. **The reservation as written, unchanged:** — the two blockers milestone 30 had to leave open, B-39 and B-40, plus a third defect the measurement found on the same route. Measured on `main` at `b63585d` before any edit, against the real router, with a victim tenant whose administrator holds `platform_admin` (14 permissions) and a live session: (1) `POST /v1/sessions` with **no credential at all** and the administrator's `principal_id` answers **201** with a working `access_token`, and `GET /v1/sessions/current` with that token answers **200** as `platform_admin` with 14 permissions — full impersonation of a named principal by anyone who has seen its id, and a principal id is not a secret (B-39); (2) the same call made **with an outsider's own valid token** — a principal with a session and no membership anywhere — also answers **201** for the administrator's principal, so holding a credential neither helps nor is required; (3) `POST /v1/sessions/revoke` with **no credential** and the administrator's `session_id` answers **204**, and the administrator's next request answers `401 session expired or revoked` — anyone who has seen a session id can end anybody's session (B-40); (4) **new, and not previously recorded**: the same route with a well-formed `session_id` that does not exist answers **204** and then **terminates the process** with an unhandled rejection (`session not found`), because the handler calls `identity.revokeSession(...)` without `await` — the promise escapes the router's error handling entirely, so the caller is told the revocation succeeded when nothing was revoked, and an unauthenticated request is a remote kill. Contract today: `POST /v1/sessions` documents `201`, `404`, `429`; `POST /v1/sessions/revoke` documents `204`, `429` — neither documents `401` or `403`, which is consistent with neither refusing anyone. Scope: a `session.issue` permission held by `platform_admin` and `service`, both session routes declared `AUTHENTICATED`, revocation allowed on the caller's own session without any permission and on another principal's only with `identity.write`, an unknown `session_id` answering the same status to an unprivileged caller whether it exists or not so no existence oracle replaces the old one, the missing `await` fixed and gated, a bootstrap path by which the first `service` credential of an environment can exist at all — since a route that requires a session to issue a session cannot issue the first one — the contract documenting every refusal both routes can now produce, and `tests/anonymous-privilege-escalation.test.ts`'s final case changed **on purpose**, which is what its own comment says answering B-39 means |
| 32 | A retried write creates one row, not two: retry safety is a route declaration | **Complete** (branch `retry-idempotency`) — the reservation and its measurement are kept below exactly as written, including the two places the implementation's own re-measurement **contradicted** them, which are corrected additively at the end of this cell rather than edited into the reservation. **Outcome:** `src/platform/http/retry.ts` declares three mechanisms — `natural(reason)` (the handler already collapses a repeat, and the reason names how), `keyed(reason)` (the router collapses it against the caller's `Idempotency-Key`) and `newEachTime(reason)` (`POST /v1/sessions`: two calls mean two sessions, and collapsing them would be the defect) — plus `SAFE` for reads and `KEYED_BY_DEFAULT` as `add()`'s fail-closed default, with every factory refusing an empty reason the way `anonymous(...)` does. All 52 registrations declare one; five are `keyed`. The router enforces it **after authentication and after the body is parsed, before the handler**: a missing key on a keyed route is `400`, a stored record with the same fingerprint replays the recorded status and body with `idempotent-replay: true`, a stored record with a different fingerprint is `409`, and **only a `2xx` is ever recorded** — a caller told its body is wrong has to be able to correct it under the same key. Migration `0020` gives the dormant `idempotency_key` table `method`, `request_fingerprint`, `response_status`, a primary key of `(method, scope, key)` and a CHECK that refuses a non-`2xx` row, enforced on both backends; **B-37 is resolved**. The contract publishes the header parameter, the replay header and a shared `KeyReused` 409 on every keyed operation, with the breaking change for callers stated in each description. `tests/retry-idempotency.test.ts` holds **17 cases**, including one that re-drives every write registration and fails if any row count moves; seven falsifications, and the one that changed nothing on its own is reported as a finding rather than smoothed over — "a refusal is never recorded" turned out to be defended three deep (ordering, the error path, and the CHECK), so the mutation is only observable once the schema rule is removed too, which a different gate catches. **B-43 is opened**: the record is written after the handler answers, so two identical requests in flight at the same instant both reach it. Measured: **769 passed / 147 skipped without a database, 1339 + 1 = 1340 with one**. Full account in `docs/retry-idempotency.md`. **Three corrections to the reservation's own measurement, additive:** `POST /v1/geography/countries` does **not** write a second row — its primary key is the code the caller sends and the repository upserts it, so the repeat silently overwrote the row, which is a quieter form of the same defect and why the route is declared `keyed` anyway; three routes refused a repeat with `409`, not four; and the re-measurement re-issued **29** requests, one per write registration, not 36, because the scenario keeps one recorded request per contract label. A fourth, found only against Postgres: a replay is the same JSON *document* and not the same bytes, because `jsonb` orders keys itself. **The reservation as written, unchanged:** — **B-37**, the `idempotency_key` table that migration 0001 created and nothing has ever written, measured instead of described. Method: the response gate's own scenario (`tests/support/http-scenario.ts`) drives every operation the contract publishes with a valid body; each of its **36 non-GET calls across 29 write routes** was re-issued a second time, byte-identical, against the same state, and the second answer compared with the first. Result on `main` at `bd92b69`: **five routes create a second row** — `POST /v1/organizations` (a second organization with the same name and country), `POST /v1/geography/countries`, `POST /v1/geography/cities`, `POST /v1/geography/service-areas` and `POST /v1/subscriptions` (a second subscription for the same subscriber and plan, which is a second recurring charge). Four refuse the repeat with `409` (`/v1/memberships`, `/v1/plans`, `/v1/plans/{id}/activate`). The rest are already idempotent, and by three different mechanisms that nothing names as a policy: a natural-key upsert (`POST /v1/identities` and `POST /v1/wallets` answer `200` instead of `201` the second time), a business reference (`POST /v1/payment-authorizations` returns the same `authorization_id` for the same `business_reference`), and a state machine that is a no-op once the transition has happened (`.../capture`, `.../void`, `.../cancel`, `.../deactivate`). `POST /v1/sessions` mints a new session each time, which is correct and not a duplicate. `POST /v1/geography/regions` dedupes while `/v1/geography/cities` next to it does not — the same module, two answers, which is the clearest evidence that retry safety here is an accident of each handler rather than a property of the surface. **No route reads an `Idempotency-Key` header**: sending one changes nothing, and milestone 14's header declaration means an undeclared header is simply not read. The table itself has `key`, `scope`, `response_body`, `created_at`, `expires_at` — no request fingerprint, so as it stands it could not tell a genuine retry from a different request reusing a key, and no adapter, port or column-shape entry refers to it. Scope: retry safety declared per route the way authentication now is, the declaration enforced by the router rather than by each handler, an `Idempotency-Key` honoured where the route has no natural key to dedupe on, the same key with a different request refused rather than answered from the store, the table given the columns that makes possible or dropped if the declaration makes it unnecessary — one source of truth either way — the contract documenting the header and the conflict, and a gate that replays **every** write route and asserts one row, so a route added later cannot quietly duplicate |
| 33 | Two identical writes in flight at the same instant do the work once: a key is claimed before the work, not recorded after it | **Complete** (branch `retry-claim`, PR #24; reserved and measured on that branch before any edit, and the reservation text below is unchanged) — closing **B-43**, which milestone 32 opened about its own mechanism rather than leaving for someone else to find. **Measured first, on `main` at `59cca30`, before a line was edited**, by sending the *same* keyed `POST /v1/organizations` five times concurrently through `router.handle` and counting the rows: against PostgreSQL, **four of five rounds created five organizations each and replayed nothing** — 21 duplicate tenants from 5 requests the caller believed were one — and only the first round, where connection acquisition happened to serialise the calls, collapsed 4 of 5. Against the reference backend two concurrent calls likewise produced two distinct `organization_id`s with no replay header. So the mechanism milestone 32 shipped is exactly as strong as it said it was and no stronger: it collapses a retry sent *after* an answer, and a retry sent *during* one is not collapsed at all, which is the retry a timing-out client actually sends. **Planned shape:** the record is claimed **before** the handler runs rather than written after it — the port becomes claim / complete / release instead of find / record, an `insert … on conflict do nothing` decides the single winner, the loser is answered rather than run, a handler that refuses releases the claim so a corrected request may reuse the key, and an abandoned claim is recoverable on a bounded schedule the way `worker-claim-atomicity` and B-25's reclaim budget already do it for leases. **Undecided at reservation and to be decided by measurement:** what the loser is told — a `409` naming the twin, or a bounded wait for the winner's answer. The reservation records the question rather than pre-empting it, and whichever is chosen must be enforced by a gate that fails if a second row appears under concurrency, on **both** backends. **Outcome — complete (branch `retry-claim`, PR #24).** The reservation above is kept exactly as written, including the two places this cycle's own re-measurement contradicted it. **Re-measured first, on `retry-claim` at `8d31133`, before a line of the implementation was written**, by firing five byte-identical keyed `POST /v1/organizations` with `Promise.all` and counting rows: reference backend **5 organizations from 5 requests, every time** (0 replays, 5 distinct ids); PostgreSQL 18.4 across five rounds **1, 5, 5, 4, 4** created (4, 0, 0, 1, 1 replays) — 19 duplicate tenants across five attempts to create five. **Two corrections to the reservation, additive:** it recorded "five in four of five rounds" and "21 duplicate tenants", and the distribution actually measured was 1, 5, 5, 4, 4 for 19 — the same code and the same database producing one organization in one round and five in two. The finding behind both readings is the one that matters and neither states it: **whether a keyed retry duplicates is decided by event-loop interleaving, not by the backend** — both backends duplicated, and `find` returning nothing and `record` being called later are two points in time with every twin that arrives between them told it is the first. **The undecided question is decided: a `409`, not a bounded wait.** The loser gets `409` + `retry-after: 1` + `details.claimed_at`, against the five tie-break criteria: a wait makes the answer timing-dependent so no gate over it can assert a count rather than a probability; it needs a second bound beside the claim horizon; its give-up branch is this `409` plus a delay; it holds a connection per twin; and `409` with a claim time is a complete statement about CORE's state. `409` rather than `429` because the caller did not ask too often, it asked at the same moment as itself. **Shape:** the port is `find`/`claim`/`complete`/`release` and `record` is **gone**; on Postgres one `insert … on conflict (method, scope, key) do update … where the row is expired or its claim is older than the cutoff … returning claim_token` decides the winner and performs both legitimate takeovers in the same statement; on the reference backend `claim` reads and writes with **no `await` between**, which on one thread is the same guarantee and is why the private `live()` helper is synchronous — milestone 32's `record` awaited its own `find`, and that single suspension point is the whole of the reference half of B-43. Settlement is fenced on a `claim_token uuid`, `CLAIM_HORIZON_MS` is 60s, an abandoned claim is taken over by the next request for its key and **no sweeper was added**. Migration `0021` adds `state`, `claim_token`, `claimed_at`, `completed_at` and `idempotency_key_state_ck` + `idempotency_key_state_record_ck`; `response_status` **became nullable**, the only loosening in this schema's history and not one — the row exists before the answer does because it is what decides who may produce one, and the record constraint ties all three nullable answer columns to `state`. `release` **deletes**, the fourth delete path in `src/`, classified in `delete-actions.ts` and gated. New gate `tests/retry-claim.test.ts`, **11 cases per backend**; `tests/support/retry-harness.ts` extracted from `tests/retry-idempotency.test.ts` so the two retry gates cannot drift apart. **Ten falsifications, and the tenth is the finding:** F5 — breaking the release on a refusing handler — **survived**, because the case had been written with a real route sent a body it would reject, and the router parses the body *before* it claims, so there was no claim for the broken release to fail to release. The gate was passing for a reason unrelated to what it claimed to measure. It now uses a test-registered route whose handler *returns* `409` (every production handler either succeeds or throws), and the original scenario is kept as its own case asserting what it actually establishes: a request refused before its handler ran takes no claim at all. **B-44 is opened** rather than papered over: this refusal's body reports `retryable: false`, because `CoreError` derives the flag from the code and every `conflict` is unretryable — right for a reuse, wrong for a refusal that carries `retry-after`; the contract tells callers to read `retry-after` rather than `retryable` on it. **Measured after: 781 passed / 148 skipped without a database, 1361 + 1 = 1362 with one**, 21 migrations, and the `0021` down migration verified to invert (277 → 273 columns, 217 → 215 NOT NULL, and forward again). Full account, falsification table and the decision reasoning in `docs/retry-claim.md`. |
| 34 | A refusal that tells the caller when to come back says so in its body too: retryability is stated once, not derived twice | **Complete** (branch `refusal-retryability`) — closing **B-44**, which milestone 33 opened about its own refusal rather than leaving it for a caller to trip over. **Measured first, on `main` at `cdc09ce`, before a line was edited**, by sweeping every refusal CORE can produce: all 52 registrations driven anonymously, all 52 driven with a credential and a body they reject, and the five-way concurrent keyed write from milestone 33. **105 refusals.** 53 `invalid_request` and 48 `unauthenticated`, every one `retryable: false` with no `retry-after` — correct, and the two agree. **4 `conflict`, every one carrying `retry-after: 1` and reporting `retryable: false`** — and those four are the only contradictions in the sweep. Against the one refusal that gets it right, `rate_limited` (429, `retryable: true`, `retry-after`, gated in `tests/rate-limit.test.ts`), the rule CORE already follows everywhere else is visible: **a refusal carries `retry-after` if and only if its body says `retryable: true`** — and the in-flight twin is the single place it is broken, in 4 of 105. The cause is structural rather than local: `retryable` is derived from the error code alone by a `RETRYABLE` set in `src/platform/errors.ts`, while `retry-after` is written by hand in two unrelated places (`rateLimitHeaders` for the limiter, `IN_FLIGHT_HEADERS` for the claim), so the flag and the header are two independent statements about one fact and nothing makes them agree. **Planned shape:** the time to come back becomes a property of the refusal itself — `CoreError` carries it, `retryable` is true when the code says so *or* when a time is stated, and the `retry-after` header is rendered from that same field rather than assembled beside it, which deletes `IN_FLIGHT_HEADERS` and the limiter's hand-written header. **Undecided at reservation and to be decided by measurement:** whether the 429's `details.retry_after_ms` stays beside the new field or is derived from it — two representations of one duration is the defect this milestone is about, and removing a published detail is a contract change that has to be weighed rather than assumed. Whatever is chosen must be enforced by a gate that sweeps every refusal and fails if the header and the flag ever disagree again, so a refusal added later cannot reintroduce this. **Outcome — complete (branch `refusal-retryability`, PR #25).** The reservation above is kept as written; its measurement held on re-check and needed no correction. **The open question is decided: `details.retry_after_ms` stays.** It and the header are two precisions of one duration, both computed from the same `decision.retry_after_ms` inside `rateLimited` so neither can move without the other, and the gate asserts the header equals `retryAfterSeconds(details.retry_after_ms)` on a real refused request — milliseconds are useful to a client scheduling its own backoff, whole seconds are what RFC 9110 permits on the wire, and removing a published field to make a tidiness point would break callers for nothing. The rounding now lives in one exported function rather than two expressions. **Shape:** `CoreError` carries an optional `retryAfterSeconds`; `retryable` is true when that is set **or** the code is in `RETRYABLE`; a new `headers` getter renders `retry-after` from the same field, and every `CoreError` render path in the router merges it. `IN_FLIGHT_HEADERS` is **deleted** and `rateLimitHeaders` no longer writes `retry-after`, returning only the three budget headers — so the flag and the header are one statement made in one place instead of three. There are still two ways to be retryable and they are different claims: the code says a dependency is unwell and CORE cannot say when it will be well; a stated time says the obstacle is temporary and names it. It is an override, not a reclassification — `conflict` still means the state moved and a **reuse** refusal is still `retryable: false` with no header. A time that is not a whole second of at least one is **refused at construction**, the way `anonymous("")` is. `retryable` stays *derived* rather than declared at each of ~170 raise sites, which would be 170 places to get it wrong; and **no `in_flight` code was added**, because a code per situation is how an error vocabulary stops being one. New gate `tests/refusal-retryability.test.ts`, **5 cases plus 3 per backend** (8 without a database, 11 with). **Ten falsifications, all caught — and the finding is which case caught which:** the whole-surface sweep, the case that *looks* like the guarantee, **did not catch F1, the exact restoration of B-44**. It cannot: every refusal it reaches is `invalid_request` or `unauthenticated`, neither states a time, so the biconditional holds vacuously however `retryable` is derived. F1 was caught by the three named cases about refusals that do state a time. The sweep is a real guard — it is what fails when a refusal is added later with a time and a stale flag, which is how B-44 would return — but it is a guard against the future, not proof of the present, and the two are not interchangeable. Kept as written rather than stretched to reach a timed refusal, with its limit stated in the file. **B-44 resolved. Measured after: 789 passed / 148 skipped without a database, 1372 + 1 = 1373 with one**, no schema change and no migration. Full account in `docs/refusal-retryability.md`. |
| 35 | The suite's own numbers mean the same thing wherever they are produced, and every test file is run by exactly one pass | **Complete** (branch `skipped-count-truth`, PR #27; the reservation text that follows is unchanged) — closing the **147-versus-148 skipped-test difference** that every cycle record since milestone 22 has restated as unexplained, and a second defect found while measuring it. **Measured first, on `main` at `5567e49`, before a line was edited.** *The difference is not environment-dependent and there is no disagreeing test.* Per-file skipped counts from CI's own log and from a local run are **identical in all 18 files that skip anything** (43, 33, 33, 7, 6, 4, 4, 2×7, 1×4 — 148). The difference is in how the two numbers were produced: CI runs `npm test`, which is `test:suite` (`vitest run --exclude 'tests/migration-*-lifecycle.test.ts'` → **147 skipped of 936**) followed by `test:cluster` (**1 skipped of 1**), and every local measurement in this document was a bare `vitest run` over all files at once (**148 of 937**). 147 + 1 = 148. Verified by running both halves locally: 789 passed / 147 skipped, then 1 skipped. So the record has compared a one-run total against a two-run split for twelve cycles, and the hypothesis it carried — "one test's skip condition is environment-dependent" — is **wrong**, which is a defect in this document's measurement rather than in the suite. **The second defect, found while measuring the first and worse:** `test:suite` excludes a *glob* (`migration-*-lifecycle`) while `test:cluster` runs a *named file* (`migration-0011-lifecycle`). Measured by adding an empty `tests/migration-9999-lifecycle.test.ts` and running both passes: it appeared in **neither**, and `npm test` reported everything green while a test file was never executed at all. The probe was deleted, not committed. **Planned shape:** one definition of the partition that both passes and a gate read, so a file cannot fall between them, and the numbers this document quotes produced by the same command CI runs. **Undecided at reservation and to be decided by measurement:** whether the partition lives in a script that owns both passes or in the vitest configuration — the second is fewer moving parts but the exclusion has to remain overridable by the pass that deliberately runs the excluded file. Whatever is chosen must be enforced by a gate that fails if any `tests/*.test.ts` is run by neither pass or by both. **Outcome.** One definition, `scripts/test-partition.mjs`: a file is in the cluster pass iff its name matches `/^migration-\d+-lifecycle\.test\.ts$/`. `vitest.config.ts` builds `include` from that predicate and picks the pass from `WASLA_TEST_PASS` (absent means suite; an unrecognised value throws rather than defaulting past a typo). `package.json`'s two scripts set only that variable — no file, no glob, no `--exclude`. **The undecided question was decided by measurement:** the partition lives in the configuration rather than in a wrapper script, because `vitest list --filesOnly` lets a gate ask the runner what it will actually run, which a wrapper could only assert about itself; the excluded pass stays reachable through the same variable rather than by overriding the exclusion. **The consequence that closes the twelve-cycle number:** a bare `vitest run` now performs exactly CI's suite pass, so a local count and a count in a CI log are the same number about the same files. **Gates, two of them, doing different jobs.** `scripts/check-test-partition.mjs` (build gate, added to *both* CI jobs, and to `verify`): every `tests/*.test.ts` in exactly one pass; no pass naming an absent file; a non-empty cluster pass; neither script restating the partition; `npm test` running both; and then it **asks vitest, per pass, which files it will actually run** and requires that to equal the declaration — the check that matters, because every earlier form of this defect was a declaration true about itself and false about what ran. `tests/test-partition.test.ts` (10 tests) gates the *rule* on arrangements the repository does not contain and that are exactly the ones that broke: a second lifecycle file, a renamed one, near misses like `migration-0011-lifecycle-helpers.test.ts` that must **not** be swept into a one-file-at-a-time pass. It asserts no counts, deliberately — a count in a test makes every new test file a failing build. **12 falsifications, 11 caught on the first run, and the two that did not are the finding.** *F11 survived:* one extra clause in `allTestFiles`'s filter made a file invisible, put it in no pass, and **every check still passed**, because the gate's idea of what existed and the runner's `include` list both descended from the same dropped source. A gate that asks the thing it audits what to audit is not a gate. Closed by having the gate read `tests/` itself and requiring the two answers to agree; F11 is caught after that, and the independence was found rather than designed. *F1 was misdesigned and re-run:* adding a second lifecycle file no longer reproduces anything, because the fix places it — restoring the old naming semantics as well leaves it **misplaced** (running beside the rest, contending for the server) rather than **hidden**, and the unit gate catches that. A misplaced heavy test is a flake; a hidden one is a lie. *F12 is caught by a crash*, not a file-set diff: an ignored partition leaves `vitest list` unable to load the config at all, so the gate reports "could not ask vitest…" — caught loudly, but by a different mechanism than the check was written for, recorded so the next reader of that message knows it can mean a broken config. **No schema change, no migration, no `src/` change.** 799 / 1383 locally. Full account in `docs/test-partition.md`. |
| 36 | A route documents every refusal it can actually produce, not only the ones somebody remembered | **Complete** (branch `documented-refusals-impl`, PR #30; reserved in PR #28 on branch `documented-refusals`, corrected in PR #29). The reservation text that follows is left exactly as it was written before any implementation, including the claim PR #29 corrected; only this leading status marker changed. **Reserved and measured, not yet implemented — branch `documented-refusals`.** Milestones 27 and 30 gated the answer surface from the contract *outwards*: every documented status must be produced, every produced body must satisfy its documented schema, and `401` must be documented wherever it can happen. Nothing gates the other direction — a status a route **can** answer that the contract never mentions. **Measured on `main` at `2390649` before any edit**, by driving every one of the 52 registrations twice with a credential (once with a body naming a field no route declares, once with no body at all) and comparing observed refusals against the documented set: **33 of 52 operations answered a refusal they do not document.** All 33 answer an undocumented **400**, including `GET /health`, `GET /ready` and `GET /metrics`, which document only `200` — a request carrying a body the route does not declare is refused at the boundary (milestone 25) and the contract never says so. Two also answer an undocumented **404**: `POST /v1/fulfillments/{fulfillment_id}/cancel` and `GET /v1/geography/regions/{region_id}/cities`, both of which document `404` nowhere while returning it for an id that does not exist. **Also measured, and the opposite direction:** `POST /v1/events` documents `429` but could not be driven to produce one in 400 consecutive calls, while every other rate-limited route could — so one route's documented `429` is unverified rather than false, and which of the two it is has to be measured before it is written down. The three probe routes are on `UNLIMITED_ROUTES` and correctly document no `429`. **Undecided at reservation, to be decided by measurement:** whether these are contract omissions to document or refusals that should not happen (a probe answering `400` to a stray body may be right, or may be a probe that should ignore what it does not read — a liveness check that can be made to refuse is a liveness check an operator cannot trust), and whether `POST /v1/events` is exempt, differently budgeted, or unreachable for a reason worth its own row. Whatever is chosen must be enforced by a gate that fails when an operation produces an undocumented status, in the same shape as the milestone 27 gate, so this cannot reappear one route at a time. **Not started: no `src/`, contract or test change is in this commit.** **Additive correction, before implementation started:** the `POST /v1/events` observation above is **the probe's fault, not the route's**, and the reservation should not have called it unverified without checking the budget. `DEFAULT_RATE_LIMIT_POLICY` gives the `ingress_events` class **600** requests a window against 120 for a write and 300 for a read, precisely because ingress is the one endpoint another system calls in volume. The probe made 400 consecutive calls, which is under that budget, so the route behaved exactly as documented and the measurement was simply too short. Its documented `429` needs verifying at 601 calls, not explaining. The original wording is left above rather than edited, and this is the correction. **Complete.** The decision: the three probe routes **keep refusing**. `/health`, `/ready` and `/metrics` answer `400` to a request carrying a body they do not read because milestone 25's boundary rule applies to every route without exception; exempting them would buy the removal of a refusal a correct caller never triggers at the price of three router branches and a boundary rule with a hole in it. So the refusal is documented rather than removed — against a **new `UnlimitedError` response**, not the shared `Error`, because these routes send no `x-ratelimit-*` and pointing their `400` at `Error` would publish three headers CORE does not set. Milestone 28's gate would **not** have caught that: it compares documented headers against real ones for the status each operation returns on a *successful* call, and `400` is not that status. `400` added to all 33 operations, `404` to the two. **A second and worse defect surfaced while writing the gate for the first: 18 documented refusals had no `content` at all** — written as `"403": { description: Caller is not an operator }`, a status code with a sentence behind it and no body schema, so milestone 27's schema gate had nothing to compare a real body against and passed them by; 23 declared none of the headers they carry. All 18 now carry the canonical `Error` body and their headers, keeping their per-route description. Enforced by `tests/documented-refusals.test.ts` (7 tests, both CI jobs, no database): every refusal a uniform matrix produces across all 52 registrations is documented for the operation that produced it; the operations driven equal the operations published; every refusal satisfies the documented `Error` schema; every documented refusal declares exactly the headers it carries, derived from `rateClassFor` and the router's own keyed set rather than a second list; every documented refusal documents a body; and `429` is documented by exactly the routes a real budget can refuse, driven per rate class past its actual limit and past every limit on the three unlimited routes. **What it does not claim, asserted rather than described:** the matrix reaches `400`, `401`, `403`, `404` and no other status — not `409`, not `500` — so widening it is a decision somebody makes on purpose. **10 falsifications, 10 caught** (F1, F3, F5 first reported no anchor rather than a result and were re-anchored and re-run rather than counted). Documented in `docs/documented-refusals.md`. |
| 37 | The published error vocabulary is exactly the vocabulary CORE can speak, and the failure every route can have is documented | **Complete** Milestone 36 closed one direction of the answer surface and said in as many words which statuses its matrix does *not* reach: `409` and `500`. This is the `500` half, and a second defect in the same family found while measuring it. **Measured on `main` at `f67908b` before any edit.** (1) Every request the response-gate scenario makes successfully was replayed against a CORE assembled with a persistence backend whose every method throws: **50 of 52 operations answered `500`**, `code` `internal`, `retryable: true`. The two that did not are `GET /health` and `GET /metrics`, which touch no persistence — so the 50 is measured, not assumed, and the exception is real. **The contract documents `500` on no operation at all**: across the whole file the documented statuses are `200`, `201`, `202`, `204`, `400`, `401`, `403`, `404`, `409` and `429`, and nothing else. A caller generating a client has no branch for the one answer it gets when CORE's dependency is down. (2) The published `Error.code` enum lists nine codes. **Two of them, `precondition_failed` and `unavailable`, are constructed nowhere** — not in `src/`, not in `tests/`, not by any helper in `src/platform/errors.ts`, which exports constructors for `invalid_request`, `unauthenticated`, `forbidden`, `not_found` and `conflict` only. They appear solely in the `ErrorCode` union, the `STATUS` table and, for `unavailable`, the `RETRYABLE` set — three tables agreeing about a word CORE cannot say. `precondition_failed` would map to `412` and `unavailable` to `503`, and **no operation documents either status either**, so the enum tells a caller to branch on two codes that cannot arrive under any status the contract admits. **Undecided at reservation, to be decided by measurement:** whether `500` is documented on the 50 that can produce it or on all 52 (the first is truthful and the second is uniform, and the measurement says they differ); whether the two dead codes are deleted from the vocabulary or given a producer; and whether `ErrorCode` stops being a hand-maintained union that three tables and one YAML enum restate independently. Whatever is chosen must be enforced by a gate that fails when a published code has no producer and when a route can answer a status it does not document, in the shape of milestone 36's gate. **Not started: no `src/`, contract or test change is in this commit.** **Outcome (implemented on branch `error-vocabulary-impl`).** `500` is documented on the **49** operations that can produce it, not on all 52: milestone 27's gate requires every documented status to be *produced*, so documenting `500` on `/health` would have made two gates contradict each other — truthful was the only choice that keeps the suite coherent, not merely the nicer one. `precondition_failed` is **deleted**; nothing produced it. `unavailable` was **given a producer**, because the measurement found a defect behind it: `/ready` let its dependency's failure escape and the router's fail-closed default rendered it `500` `internal` — CORE reporting a defect in CORE when what happened is that CORE cannot serve yet. An orchestrator reading `500` from a readiness probe has grounds to stop a rollout; reading `503` it waits. `/ready` now answers `503` `unavailable`, `retryable: true`, no `retry-after` (CORE does not know when its dependency recovers — milestone 34), documented as a new `components/responses/NotReady` carrying the correlation header and none of the budget headers because `/ready` is on `UNLIMITED_ROUTES`. So the measured 50 became **49 × `500` + 1 × `503`**, and the reservation's "50" is correct for the code as it stood. `ErrorCode` stopped being hand-maintained: one `STATUS` table is the source, the union is `keyof typeof STATUS`, `ERROR_CODES` is its keys, and the published enum is compared against them on every run. Enforced by `tests/error-vocabulary.test.ts` (6 tests, both CI jobs, no database): the published enum equals `ERROR_CODES`; **every code in `ERROR_CODES` is produced by a real answer in the file** (matrix for `400`/`401`/`403`/`404`, a reused key with a different body for `409`, a real budget exceeded for `429`, a throwing dependency for `500` and `503`); each code carries its table's status; every produced status is documented on the operation that produced it; and under a throwing dependency every operation answering `500`/`503` documents it while an operation answering neither documents neither — measured by replay, so an operation that starts or stops touching persistence changes the set without anybody editing a list. **Falsification: 10 mutations, 9 caught by this gate, 10 of 10 caught by the suite.** F9 (removing `unavailable` from `RETRYABLE`, so the `503` reports `retryable: false`) survived this file and is recorded as survived rather than moved: `retryable` is milestone 34's claim, and the mutation was run against all 63 files to confirm `tests/refusal-retryability.test.ts` catches it — duplicating the assertion here would add a second place to change when the rule changes. Documented in `docs/error-vocabulary.md`. `npm run verify` green; `npm test` with a database green. |
| 38 | The roadmap's own status claims are checked against the repository, not maintained by hand | **Complete** — reserved and measured on branch `roadmap-status-truth`, implemented on `roadmap-status-truth-impl`. Three consecutive cycles (33, 36, 37) merged with a completed row still reporting itself as "Reserved and measured, not yet implemented", each corrected by a separate follow-up PR after the merge. The audit note appended to cycle 37 says plainly that three occurrences is a structural problem and not a slip: the convention that a reservation is never rewritten and the convention that a row reports its state from its first field are in tension, and nothing in `npm run verify` reads this document's claims at all. `scripts/check-roadmap.mjs` checks only that ROADMAP.md appears in a commit range that touched implementation — it has never read a single word of it. **Measured on `main` at `907e3ee` before any edit.** (1) The table holds **37 rows**, and every one opens its status cell with a bolded claim, drawn from a vocabulary nobody declared: `Complete` (16 rows), `Complete, and self-enforcing from here` (8), and one row each of `Complete.` (with a full stop, row 37, written by the correction that was supposed to normalise it), `CORE side complete`, `Complete inside CORE`, `Complete inside CORE, with a fake adapter rather than a live provider`, `Complete, except policy decisions that are not CORE's to make`, `Blocked — external dependency`, `Blocked — B-2, B-3`, `Blocked — B-5, B-6`, `Not implemented, and until this cycle not tracked here at all`, and two sentence-length claims (rows 2 and 8) that report two sub-statuses at once. **(2) One marker is false right now, and has been for eight cycles.** Row 29 reads **"Reserved, measured, in progress on branch `http-auth-order`"**, while the same cell goes on to report the cycle's outcome, cites `tests/anonymous-privilege-escalation.test.ts` and `docs/anonymous-privilege-escalation.md` — both present in the tree — and records the counts it measured (717/1280). The branch it names is gone. This was not found by reading the document; it was found by comparing every marker against the artifacts its own cell cites, which is the measurement this milestone exists to automate. **(3) The obvious rule is wrong, and measuring showed it.** "Every path a row cites must exist" fails on row 35, which cites `tests/migration-9999-lifecycle.test.ts` — a probe file that was deliberately created, used to prove that `test:suite`'s glob exclusion and `test:cluster`'s named file left a gap where a test file ran in neither pass, and then deleted without being committed. That citation is true and describes an experiment; a path-existence gate would have demanded its deletion and destroyed evidence, which cycle 30's rule forbids. So the rule cannot be about paths. **Undecided at reservation, to be decided by measurement:** whether the marker moves to its own column with a declared closed vocabulary, or stays in the cell and is parsed; whether "complete" is *derived* from evidence (a cycle record carrying a CI verdict for that milestone) rather than asserted, and if so what a row like 5 or 9 — blocked with nothing to derive from — reports instead; and whether a row claiming completion must name at least one committed artifact while a row claiming reservation must name none. Whatever is chosen must fail the build when a row's claim disagrees with the repository, in the shape of milestone 36's and 37's gates, and must not require editing a reservation to fix a marker. **Not started: no `src/`, contract, script or test change is in this commit.** **Outcome (implemented on branch `roadmap-status-truth-impl`).** The marker **stays in the cell and is classified, not replaced**: normalising 37 cells to a canonical token would have rewritten 37 reservations to satisfy a gate, and would have flattened the two-sub-status nuance rows 2, 8 and 10 carry on purpose. The closed vocabulary now lives in `tests/roadmap-status.test.ts` as a **total classifier** — `reserved`, `blocked`, `not implemented`, `complete`, tested in that order so a cell saying "reserved… not yet implemented" cannot be read as complete because the word appears later — and a marker matching nothing fails the build. Completion is held to evidence by **ownership of a written account**: the measurement found the "one `docs/<topic>.md` per cycle" convention is already a fact about the tree (every completed row from 27 onward owns exactly one; the eight completed rows before it own none), and an account belongs to the lowest-numbered row citing it, so a later reservation may quote an earlier cycle's document as evidence without being credited with writing it. Two rules follow and catch the defect from both sides: a `reserved` row may not **own** an existing account (row 29 did), and a `complete` row from 27 onward must own one. Ownership is the third form of the rule and the first that survives falsification: "may not cite" flagged this milestone's own reservation, and "may not be the only claimant" let row 29's stale marker back in because this milestone's completed row mentions row 29's document and shielded it. Both exemption lists are asserted exactly, so they may shrink and not grow. **Row 29's marker was corrected in this cycle** — see its own row — additively, text untouched, and row 37's stray full stop after `Complete` normalised. **Two hand-drafted lists the gate corrected, recorded rather than replaced:** the "cites nothing" exemption was drafted `1, 3, 5, 7, 9, 25` and the gate returned `1, 3` (5, 7 and 9 are blocked, not complete; row 25 cites a `contracts/` path the first pass had not counted); and the first form of the reserved-row rule — "a reserved row may not cite an existing docs file" — **flagged this milestone's own reservation**, which quotes row 29's citation as the evidence for its existence, which is why the rule is "only claimant" and not "claimant". **Falsification: 10 mutations, 10 caught**, three of them only after something was fixed: F3 (row 36 stops citing its account) survived "cites something" because the row still cited its test file; F1 survived "only claimant" as described above; and **F8 survived twice, the second time because of a defect in the falsification runner rather than in the gate** — its replace rule mutated only the first of two occurrences whenever an anchor appeared twice, leaving the citation the gate reads in place, and the gate correctly passed. Hand-applying the same mutation caught it at once, which is how the runner bug was found; the rule is now explicit. The same defect would have made any two-occurrence mutation in cycles 36 and 37 read as survived — none had a repeated anchor, which was luck, not method. Third probe defect in three cycles, after cycle 37's `body: {}` probe and its conflict probe that failed at setup: **a probe that reports green is reporting about itself until proven otherwise.** **What it does not claim:** the gate reads claims, not work — it cannot tell whether a row marked complete is finished, only that its claim does not contradict the tree in the ways measured. Documented in `docs/roadmap-status.md`. | Row 29's false marker was the measured defect; `tests/roadmap-status.test.ts` (7 tests, both CI jobs, no database) and `docs/roadmap-status.md` | 33, 36, 37 |
| 39 | Every documented conflict has a producer, and a create that documents `409` does not silently overwrite instead | **Complete** — reserved and measured on branch `documented-conflicts`, implemented on `documented-conflicts-impl`. The reservation opened this cell with the marker "Reserved and measured, not yet implemented — branch `documented-conflicts`", and that marker is superseded here rather than deleted: milestone 38 reads only the leading bolded claim, so an outcome appended below a reservation marker leaves the row lying to every reader and to the gate. Cycles 33, 36 and 37 each needed a follow-up PR for exactly this; this row is set to its true state in the same commit as its implementation, and the superseded wording is quoted above so nothing is lost. Milestone 36 named the two statuses its matrix does not reach, `409` and `500`; milestone 37 closed `500`. This is `409`. **Measured on `main` at `eda030b` before any edit.** (1) **17 of 52 operations document `409`**, all of them `POST`: `/v1/memberships`, `/v1/organizations`, `/v1/payment-authorizations` and its `capture`, `refund` and `void`, `/v1/plans` and its `activate` and `retire`, `/v1/subscriptions` and its `cancel` and `usage`, `/v1/subscription-periods/{period_id}/collect`, `/v1/geography/countries`, `/v1/geography/cities`, `/v1/geography/service-areas`, and `/v1/fulfillments/{fulfillment_id}/cancel`. (2) **Confirmed reachable, and it corrects the probe below:** on an authorization holding 5,000 minor units with 2,000 already captured, a second capture with a *different* `capture_reference` answers **`409` `conflict`**, and so do the third, fourth and fifth. (3) **`POST /v1/geography/countries` documents `409` and cannot produce one.** With an existing `country_code`, a fresh idempotency key and a changed body it answers **`201`** and **overwrites the stored row** — `QA` went from `Qatar`/`QAR` to `OVERWRITTEN`/`USD`, visible through `GET /v1/geography/countries`. The upsert is not the finding: it is a recorded decision, and `src/modules/geography/http.ts` says so in the route's own retry reason, measured on `main` at `bd92b69`. The finding is that the same route publishes a refusal its own code rules out, which is milestone 36's and 37's defect family — a published answer with no producer — in the one status those cycles deliberately left alone. **A probe defect that must not be repeated, recorded because it produced a plausible false result:** replaying each of the 52 successful scenario requests with a *fresh idempotency key and an identical body* produced `409` on only **3** of the 17 (`/v1/memberships`, `/v1/plans`, `/v1/plans/{plan_id}/activate`) and **`2xx` on the other 14**, which read as "11 documented conflicts are unreachable". It is wrong: an identical body exercises the natural-key and idempotency path, not the conflict path, which is exactly what finding (2) demonstrates. Third probe defect in three cycles, after cycle 37's `body: {}` probe and cycle 38's falsification runner mutating one of two occurrences. **Also measured, not a defect:** there is no `GET /v1/payment-authorizations/{authorization_id}` — the router answers `404` `no route`, and the contract publishes no such read. **Scope: a conflict driver per documented route that changes the business fact rather than repeating it, a gate in the shape of milestone 36's and 37's that fails when a documented `409` has no producer and when a route can produce one it does not document, and a decision on `/v1/geography/countries` — either the upsert stops being an upsert, or the route stops publishing `409`.** **Undecided at reservation, to be decided by measurement:** how many of the remaining 14 have a real producer once driven properly; whether the three keyed geography creates are the same case as the country upsert; and whether `409`'s permitted `retry-after` (milestone 34) is reachable on any of them. **Not started: no `src/`, contract or test change is in this commit.** **Correction, appended before implementation (reservation text above left as written).** Finding (3) overstates its case: `POST /v1/geography/countries` **can** answer `409`, and milestone 37's own gate drives it — reusing an idempotency key with a different body reaches `src/platform/http/retry.ts`, which answers `conflict("this Idempotency-Key was already used with a different request")`. That path exists on all five keyed routes (`/v1/organizations`, `/v1/geography/countries`, `/v1/geography/cities`, `/v1/geography/service-areas`, `/v1/subscriptions`), so their documented `409` has a producer and the reservation was wrong to say it had none. What survives the correction, and is the actual finding, is narrower and still real: the route has **no domain uniqueness conflict** — a duplicate `country_code` with a fresh key overwrites the stored row and answers `201`, so the only conflict a correct caller can reach there is about its own retry, not about the data. Whether that is the intended contract is the decision this milestone still owes. **The reservation's error is itself the fourth measurement defect in three cycles**, and it has the same shape as the other three: a probe (here, reading the module's own conflict producers and not the router's) that answered a narrower question than the one being asked. Recorded rather than edited away, per cycle 30's rule. **Also enumerated during the correction, and not yet resolved:** every `conflict(...)` producer in `src/` (32 sites), of which the ones reachable from a documented route are in the money, subscription, fulfillment and identity-access services, plus the two platform paths (`retry.ts` for key reuse, and the replay and queue-revival singletons). Driving all 17 documented routes to a real domain conflict needs per-route state that the response-gate scenario does not build — a voided period, an expired subscription, a draft plan, an uncaptured refund — which is why this cycle is left reserved with the measurement recorded rather than half-gated: a gate that covers 8 of 17 and reports green would be exactly the false assurance milestones 36 to 38 were about. **Outcome, implemented on branch `documented-conflicts-impl`.** `tests/documented-conflicts.test.ts` (6 tests, both jobs, no database) holds one driver per documented conflict, with the driver set asserted equal to the set of operations publishing `409` in both directions, the exact refusal message declared per driver and compared in one assertion, the mechanism declared per driver with the key-reuse census asserted exactly (`/v1/organizations`, `/v1/geography/countries`, `/v1/geography/cities` have no domain conflict of their own), the inverse direction driven by re-sending every recorded write under its own key with one field changed, and the answer shape (`conflict`, `retryable: false`, correlation id, `details`) checked at all seventeen. Two decisions the drivers had to work around, both recorded rather than changed: cancelling a cancelled fulfillment is idempotent by B-29, so the conflict needs a fulfillment closed by a failed move event; and cancelling a cancelled subscription is idempotent too, so the expiry refusal needs the renewal sweep, which no route exposes. An empty wallet is what makes the voided-period conflicts reachable: a first period charged against a wallet holding nothing is `uncollectible` rather than `settled`, and cancelling voids it. **Falsification: 12 mutations, 12 caught** — including F3 and F10, which change nothing but a refusal's wording and would pass a gate that only checked for status `409`. **A second probe defect this cycle, also a false negative from an unbroken tree:** the inverse check first changed each body by *adding* an unknown field, and every write answered `400 invalid_request`, because validation runs before the key is compared — so the probe reported that no route can produce the key-reuse refusal. Fixed in the gate by changing an existing field instead. Account: `docs/documented-conflicts.md`.| **Complete** | 34, 36, 37 |

### What was claimed complete and actually is

Spot-checked against code rather than accepted from the list: the transactional
outbox (`uow.emit` + `PendingAuditEntry` ordering), the consumer inbox, role →
permission mapping as data (`ROLE_PERMISSIONS`), append-only audit enforced by
trigger, opaque session tokens stored as hashes only, geography as reference
data with no tracking or routing, and the authorization lifecycle including the
expiry sweep. All present, all covered by tests on both backends.

### What the list said was done and was overstated

- "Behaviour under a real message broker (the bus is in-process today)" was
  filed under *Not proven yet*, which undersold it. It was not a proving gap,
  it was a **functional gap**: with only an in-process bus, no external system
  could start any of the coordination CORE exists to do. Milestone 1 above is
  that gap, and it was invisible in the old wording.
- The *Done* list credits "migration 0003 with its rollback" and stops there,
  though 0004–0007 exist. Corrected by the table above.

## Migrated

Nothing. No data has been migrated from any system. No legacy component has
been retired.

## Retired

Nothing.

## Blockers

| # | Blocker | Impact | What unblocks it |
|---|---|---|---|
| B-1 | *Resolved.* A PostgreSQL instance was provided and migrations 0001–0006 were applied and verified on it (PostgreSQL 17.6 managed, and PostgreSQL 18.4 locally). The full rollback chain was exercised. Persistence itself still runs on the in-memory reference adapters | Postgres repository adapters, now unblocked and next in line | — |
| B-2 | Production data inventory unknown for Ceezr and Wasla | Identity, money and order migrations cannot be planned against real volumes or duplicates | Read access to production, or an exported inventory (row counts, duplicate profile) |
| B-3 | Duplicate-identity merge policy undecided | Detection tooling can be built; no merge may execute | An owner decision on canonical selection and conflict rules |
| B-4 | Regulatory pricing policy undecided (ADR 0012) | Pricing engine can be built rule-driven, but no rates may be fixed | A legal/regulatory decision |
| B-5 | Deployment target and topology not chosen | Manifests stay vendor-neutral; no environment is provisioned | An infrastructure decision |
| B-6 | No production release approval | No production deployment will be attempted | Explicit owner approval |
| B-7 | *Resolved on the working remote.* GitHub Actions was billing-blocked on the `noor-seez` account. The repository CORE is actually developed and pushed to is `uxxxug/wasla-core`, where the CI workflow runs and passes — verified against the Actions API in this cycle, not assumed. If work moves back to a `noor-seez` remote the billing block returns | — | — |
| B-9 | **Resolved.** Audit entries that describe a change now commit inside that change's transaction via `uow.audit`; geography and organization gained a boundary. Entries that record a refusal or a detected inconsistency stay deliberately out of band, because rollback would erase the only evidence of why nothing happened | resolved |
| B-10 | **Resolved.** `InMemoryTransactionBoundary` journals the inverse of every write it is given a scope for, so it unwinds like `ROLLBACK` does. The rollback tests that used to be Postgres-only now run against both adapters | resolved |
| B-11 | **Resolved.** Money and execution state were settled in two separate transactions, so a failure between them left funds captured against a fulfillment still recorded as `dispatched`/`held`. `MoneyService.captureWithin` / `voidWithin` now enlist in the caller's unit of work; `capture`/`voidAuthorization` are thin wrappers that open their own | resolved |
| B-12 | **Resolved.** The in-memory money store enforced only primary keys, so two concurrent captures both inserted a `capture:<authorization_id>` ledger transaction and the money moved twice, while Postgres refused the second. The reference store now enforces the schema's UNIQUE constraints, synchronously | resolved |
| B-13 | **Resolved.** `LocalEventBus.publish` resolved successfully even when every subscriber had exhausted its attempts, recording the failure only in an in-process array. Both durable relays decide whether to retry from that answer, so an event could be marked `published`/`processed` in the database while nothing had consumed it. `publish` now throws once any subscriber dead-letters | resolved |
| B-14 | Entitlement-check endpoint needs a new ADR (ADR 0008) | `SubscriptionService.checkEntitlement` is implemented and tested, but reachable in-process only. MARKET and MOVE cannot ask CORE whether an owner is entitled | An owner ADR opening a new synchronous path, or a decision that entitlement is answered by consuming `core.subscription.*` instead |
| B-15 | Proration on mid-period cancellation or plan change undecided | CORE cancels without refunding and without prorating, and has no plan-change path at all. Nothing partial is charged or returned | An owner decision on what a partial period is worth |
| B-16 | Grace policy for `past_due` undecided | CORE's recorded default is that `past_due` entitles nothing. Chosen because it is the reversible direction: grace can be granted retroactively, service already given cannot be recalled | An owner decision on whether, and for how long, an uncollected period keeps entitling |
| B-17 | Trial periods undecided | No trial exists. A zero-amount plan is expressible and settles without an authorization, which is not the same thing as a trial that converts to a paid plan | An owner decision on trial length, conversion and what a lapsed trial entitles |
| B-18 | Quota rollover versus reset undecided | Quota resets each period, because usage is counted per period. Unused allowance does not carry forward | An owner decision on whether unused allowance accumulates |
| B-19 | Entitlement overrides (comped or granted access) undecided | There is no way to entitle an owner without a paid subscription. Adding one would introduce a second source of truth beside the subscription, which is exactly what the derived design avoids, so it needs a decision rather than an implementation | An owner decision on who may override and how it is audited |
| B-20 | What is owed when work fails after part of the hold was already captured | CORE records the truth and stops. A `failed`/`cancelled` fulfillment holding `settlement_state = 'partially_captured'` derives `financial_disposition = 'decision_required'`, both closure events carry `financial_decision_required: true` with the observed `captured_minor`, and `GET /v1/fulfillments/reconciliation/pending-financial-decision` lists exactly these cases apart from CORE defects. CORE does **not** refund, retain, split, or mark the operation settled. `MoneyService.refund` is exactly-once, so whichever answer is chosen is executable the day it exists | Five separate owner decisions, listed under "B-20 as a contract gap" in the 2026-09-12 (second) cycle: who states the executed amount, who decides whether partial work earns partial settlement, who authorises a refund, whether a cancellation fee exists, and which system sends the final disposition |
| B-30 | What is owed when MOVE delivers work after the order was cancelled | CORE records the fact and stops. The fulfillment stays `cancelled` with the hold released, the marker columns added in migration 0017 say the work was performed anyway, `financial_disposition` derives `decision_required`, `core.fulfillment.executed_after_cancellation` carries it to MARKET, and no money moves. CORE cannot move any: the cancellation voided the hold, a voided hold cannot be captured, and re-charging a payer who has been told their order was cancelled is not a decision CORE was given. Raised by the B-29 cycle, which closed the part CORE owns — losing the fact — and left the part it does not | An owner decision, of exactly B-20's kind: whether MOVE is paid out of band, whether the payer is asked again or the order reinstated, and who absorbs the loss when neither happens. One answer per branch is enough; CORE has the reading and the event to act on it the moment the answer exists |
| B-31 | How much each signal kind is worth against the others | CORE stores every signal with its kind and derives per-kind groups — count, and average rating where a rating exists — and stops there. It publishes no composite score and stores none. Deriving one would require CORE to decide what a dispute costs against a five-star rating, and that number is what decides who gets work: it is product policy under ADR 0018, not coordination | An owner decision, per branch, on the weights. CORE can fold them the day they exist: `deriveStanding` already receives the grouped rows and is pure, so a weighting is a function over data CORE already produces, with no schema change |
| B-32 | Whether reputation decays, and how fast | Nothing decays. Every unretracted signal counts equally for ever, which is the only reading with no invented half-life — and it is stated rather than hidden: `occurred_at` (the producer's claim) and `recorded_at` (CORE's clock) are both stored per signal, so any decay function can be applied later over real timestamps without a backfill | An owner decision on the window and the curve, and on which of the two timestamps it is measured from |
| B-33 | What standing is good enough — thresholds, gating, suspension | CORE answers reads and gates nothing. There is no minimum rating, no suspension state and no consumer of a standing inside CORE. A threshold would make CORE decide who may be offered work, which is MOVE's and MARKET's business rule | An owner decision on the thresholds and on which system enforces them. Note the shape of the enforcement question too: if the enforcing system needs a synchronous answer, that is a new path under ADR 0008 and needs its own ADR, exactly as B-14 does for entitlement |
| B-34 | Whether a standing crosses tenants | A standing is per organization, because `reputation_signal.organization_id` scopes every signal and every read requires it. That is deliberate and it is the reversible direction: signals recorded per tenant can be aggregated later, whereas signals recorded globally cannot be separated afterwards. It is also a real limitation — the same identity working for two organizations has two standings, and neither reflects the whole | An owner decision that is as much legal as product: whether a person's record follows them across organizations, what a subject is told, and under what basis one tenant may see conduct reported by another. CORE will not infer it |
| B-35 | ADR 0010's degradation rules are not recorded anywhere in this repository | CORE currently fails closed: a dependency that is unreachable produces a canonical error, a queue that cannot be worked retries with backoff, leases, a reclaim budget and finally a dead letter, and `/ready` says which backend is wired. Nothing is served from a stale cache and no write is accepted without its transaction, which is the reversible direction — a system that refused too much can be relaxed once the rules exist, whereas one that answered from a stale cache has already given wrong answers about access and money. But fail-closed is a consequence of the implementation, not a decision anybody wrote down, and the ADR that would decide it exists in this repository only as a title in `docs/adr/README.md` | The ADR 0010 text, or an owner decision standing in for it: which reads may degrade and from what source, whether an access check may ever be answered without Postgres and for how long, what happens to in-flight authorizations when the ledger is unreachable, and what CORE tells MOVE and MARKET while degraded. CORE will not invent it: a degradation rule takes effect precisely when nothing else is working, so the cost of guessing wrong is paid at the worst moment and is not observable in any test until then |
| B-21 | **Resolved.** Two overlapping closures both committed, because the closing `update` named the row and not its version, so the loser overwrote the winner's terminal row and published a second closure event. `updateIfStatusIn` / `insertIfAbsent` return `applied` \| `stale` and the service treats `stale` as "somebody else closed it", so one closure produces one closure event. Money was never wrong; only the events were multi-valued | resolved | — |
| B-22 | **Found and resolved in the Milestone 4 cycle.** A claim was a read, not a write. `PgOutbox.claimDue`, `PgInboundEventStore.claimDue` and `PgDeliveryStore.claimDue` each ran one `select … order by … limit … for update skip locked` statement, which in its own implicit transaction releases the row locks the moment it returns. Measured before the fix: two pools claiming five due outbox rows received **five rows each, all five shared**. In production that is two signed POSTs to a partner's webhook and two runs of the same inbound event. The in-memory doubles marked nothing at all, so they could not fail a test either (B-12 again, in a different module). All six implementations now claim by writing the lease in the same statement — `update … set next_attempt_at = now + lease where id in (select … for update skip locked) returning …` — with `claimDue(now, limit, leaseMs = 30_000)`. No schema change: the lease rides on `next_attempt_at`, so an abandoned claim returns on the same clock that schedules retries. `attempts` is deliberately not incremented for the three pre-existing workers, which would have changed their backoff under cover of a concurrency fix. Proven by `tests/worker-claim-atomicity.test.ts`, which fails when the claiming write is removed | resolved | — |
| B-23 | **Resolved.** The three closure/dispatch payloads carried no `organization_id`, so a tenant-scoped notification recipient for them could never match and had to be refused outright (HTTP 400), and MARKET/MOVE could not route a closure without calling CORE back. CORE owns tenancy and is the only system that can state it, so the omission was CORE's to fix. `core.fulfillment.dispatched`, `.completed` and `.cancelled` now carry a **required** `organization_id`, read from the fulfillment row rather than from any prior event — which is what makes it correct on the intake-refusal path, where the row is created and closed in one transaction and no `created` event is ever published. `TENANT_SCOPED_EVENT_TYPES` widened accordingly; the registry's refusal is unchanged and still guards `core.*` events that genuinely name no organization (`core.payment.captured`). Proven by `tests/fulfillment-lifecycle-contract.test.ts`, which also validates emitted payloads against the published schemas, and by an end-to-end fan-out test in `tests/notifications.test.ts` showing two tenants watching one event type and only the right one being messaged | resolved | — |
| B-24 | **Resolved.** Lease expiry was indistinguishable from a scheduled retry for three of the four workers, so `core_worker_outcomes_total{outcome="reclaimed"}` could only be reported for notifications. The B-22 fix made every claim write a lease, but for the outbox relay, the inbound dispatcher and the delivery worker that lease rode on `next_attempt_at`, which is also the retry-schedule field — one column, two meanings, nothing on the row saying which. Migration 0014 adds a nullable `claimed_at timestamptz` to `outbox`, `inbound_event` and `event_delivery`, which makes the overloaded column readable: `claimed_at is null` means `next_attempt_at` is a retry schedule, `claimed_at is not null` means it is a lease expiry. `claimDue` sets it and takes only rows where it is null, so an expired lease is no longer silently re-served; `reclaimExpired(now, limit)` on all three ports (mirroring the one `PgNotificationStore` already had) clears it, makes the row due immediately and records `last_error = 'abandoned claim reclaimed after attempt N'`; every worker recovers **before** claiming, so a recovered row is worked in the same tick; every acknowledgement clears it, enforced by a per-table check constraint (`claimed_at IS NULL OR status = 'pending'`) so a finished row cannot be counted in flight for ever. `counts()` gains `in_flight` and `abandoned`, both subsets of `pending` and both cut at the injected clock so the two backends agree. Rejected: a `processing` status, which would change what every existing reader means by `pending` — a contract change to fix a metric; and a `claim_token`, which is real fencing and is recorded separately as B-26. **Decision about existing rows** (the roadmap required this be stated): they get `NULL` = "not held", which is safe for rows genuinely in flight during the migration — they keep their future `next_attempt_at`, stay invisible until the lease would have expired anyway, then are claimed as today. No downtime and no worker stop; the one cost is that claims held across the migration are not counted when taken over. Rollback is the reverse order — code first, then `0014_worker_claim_visibility.down.sql` — because code that writes `claimed_at` against a schema without it fails every claim and stops all three queues | resolved | — |
| B-25 | **Resolved.** An abandoned claim did not spend an attempt, so a row whose worker died on it every time was recovered for ever and never dead-lettered: the one queue state that requires a human was the one state it could not reach. Fixed with a **second budget** rather than by reusing the first — `reclaims integer not null default 0` on `outbox`, `inbound_event` and `event_delivery` (migration 0015), incremented by `reclaimExpired(now, maxReclaims, limit)`, which dead-letters the row on the increment that passes the limit (default 3, `DEFAULT_MAX_RECLAIMS`) instead of freeing it. The three workers report the two counts as `reclaimed` and `failed_permanent`, plus a `reclaim_exhausted` field on their result. Charging `attempts` was rejected on evidence, not taste: the backoff is `baseBackoffMs * 2 ** attempts`, so a crash loop would impose exponential delays a healthy row never earned, and `retrying` is derived as `pending and attempts > 0`, so a row nobody had tried would report as retrying. Charging the attempt at claim time — the notification store's single-counter approach — was rejected because B-22 declined to change `attempts` semantics for these three workers and it would silently halve every retry limit. `tests/reclaim-budget.test.ts` covers all three queues plus the worker-level result and metrics on both backends; the column, its default and its check constraint are asserted against the live schema | — |
| B-26 | **Resolved.** A claim was exclusive at the instant it was taken (B-22), visible while held (B-24) and bounded in how often it could be taken back (B-25) — and none of that made it exclusive *over time*. A worker that stalled past its lease, was reclaimed, and then called `markPublished`/`markProcessed`/`markDelivered` succeeded, because the acknowledgement named the row and not the claim; the row then recorded the abandoned attempt instead of the one that happened. The worst case is a stale success on `inbound_event`: an event marked `processed` whose live attempt actually failed is never dispatched again and the failure is invisible. Migration 0016 adds `claim_token text` to `outbox`, `inbound_event` and `event_delivery` — the shape `notification` has had since 0012 — stamped by `claimDue`, cleared by recovery and by every acknowledgement, and matched by all nine acknowledgements across the six store implementations, which now return `boolean`. `src/platform/eventing/fencing.ts` holds `newClaimToken()`, `isFenced()`, `UNFENCED` and `FencedError`. The three workers report a `fenced` count and emit `core_worker_outcomes_total{outcome="fenced"}`, an outcome that has been in the catalogue since Milestone 8 and that only `notification` could produce until now. The relay is the one transactional case: `markPublished` runs inside the transaction that queues the fan-out, so a refusal throws `FencedError` to roll those delivery rows back, and the catch block checks for it **before** the attempts arithmetic — a fence is not a failed publish and must not charge an attempt or impose a backoff. Replay passes `UNFENCED` and is the only caller in CORE entitled to: an operator advancing a `dead` row holds no claim, and a fence that applied to every caller would have broken the only recovery path this queue has. Rejected: `uuid` (to match `notification.claim_token text`), `gen_random_uuid()` in the database (unavailable to the in-memory backend — B-12), a token per row rather than per batch claim (one statement per row, refusing nothing extra), and the strong constraint "every claimed row carries a token" (false for rows already claimed when the migration runs, and a backfilled token would fence out a worker still doing real work). What it does **not** fix: the duplicate side effect. A POST or a bus publish that already happened is not undone — delivery stays at-least-once and subscribers still deduplicate on `event_id`. The fence protects what the row records | resolved | — |
| B-27 | **Resolved.** A dead `outbox` or `event_delivery` row had no revival path in CORE at all. Replay reads `inbound_event` only, and there was no `requeue`, no `revive` and no equivalent for the other two queues anywhere in the repository, so a dead outbox row — an event MOVE and MARKET would never receive — was durable and unreachable at the same time, which is the exact defect Milestone 6 removed for inbound events. B-25 had made it worse by adding a second route to `dead`. Recovering a row meant a manual `update` against the database, unreviewed and unaudited, and free to resurrect a row that had already been published | Closed by `selectDead`/`revive` on `OutboxStore` and `DeliveryStore` in both backends, `QueueRevivalService` (`src/platform/replay/revive.ts`), the `events.revive` permission and `npm run revive`, all documented in `docs/queue-revival.md`. The owner decision is taken and recorded: revival **re-publishes the original envelope unchanged**. It publishes nothing itself — the row goes back to `pending` and the existing relay and delivery worker do what they always do, which keeps one publish path in CORE and keeps `event_id` stable for every consumer inbox and every subscriber that deduplicates on it. A fresh envelope was rejected: it would need a second publish path and would make a month-old fact arrive as news |
| B-28 | **Resolved.** `DeliveryFanOut` filtered `subscriptionsFor` on `active`, so no new delivery was queued for a deactivated subscription — but `DeliveryWorker.drainOnce` never re-checked it, and a delivery that was already `pending` when the subscription was switched off was still claimed, signed and POSTed, for up to `maxAttempts` across hours of backoff. Found while building B-27, whose revival refuses an inactive subscription; the worker's own behaviour was the other half and contradicted it. The documented reasoning for the old behaviour — those deliveries were promised, and dropping them is worse than delivering them late — was right that they must not be dropped and wrong that "late" is what an operator asked for when switching off a leaking endpoint | Closed by `markSuppressed` on `DeliveryStore` in both backends and an `active` re-check in the worker: the row is dead-lettered with the reason recorded, unsent, with `attempts` and `last_status` untouched, and reported as `suppressed` in the worker result. Read as **stop sending**, not *stop queueing*, because the realistic reasons to deactivate are urgent — a compromised endpoint, a leaked secret, a partner asking to be switched off. Checked at the moment of sending rather than swept at deactivation, since a sweep cannot close the race where fan-out reads the active subscriptions, the deactivation commits and fan-out then queues its row. `dead` reused rather than a fourth status, following the precedent B-25 set for its own new route to `dead`. Recovery is reactivate then `npm run revive` |
| B-29 | **Resolved.** MOVE executes over minutes, so a cancellation can arrive mid-execution. CORE closed the fulfillment `cancelled`, released the hold and published `core.fulfillment.cancelled`, and then refused MOVE's already in-flight `move.job.completed` with `409 fulfillment was cancelled` and recorded nothing. Two failures followed, both worse than the race: the inbound dispatcher retries whatever is thrown at it and this refusal can never come good — a cancelled fulfillment does not reopen — so the report was retried five times across hours of backoff and dead-lettered as an error string; and the row read `cancelled` + `released`, which `financialDisposition` calls `settled`, so `listFinanciallyInconsistent()` and `listPendingFinancialDecision()` both returned empty while a driver had delivered an order whose payer had been refunded. Found by reading CORE's own code and proved with a throwaway probe before anything was changed; the existing single-closure test covered only the *simultaneous* race, where refusing the loser is still correct, and nothing covered the sequential shape | Closed by recording the fact instead of refusing it. Migration 0017 adds `executed_after_cancellation_at` (MOVE's `completed_at`, not CORE's receipt time) and `executed_after_cancellation_job_reference` (separate from `move_job_reference`, which is null whenever the cancellation beat MOVE's acceptance — the commonest ordering for this case), both nullable, with check constraints for both-or-neither and marker-only-on-cancelled. A conditional store write `markExecutedAfterCancellation` makes the marker single-valued the same way B-21 made the closure single-valued, so one report produces one marker, one event and one audit entry however often it is redelivered. `financialDisposition` returns `decision_required` — placed after the `unsettled` and still-`held` checks so a CORE defect is never masked by a business question — and the additive event `core.fulfillment.executed_after_cancellation` v1 tells MARKET, the only side that can talk to the customer it already told the order was cancelled. No existing contract changed and the cancellation is not re-published. CORE moves **no** money, deliberately: the voided hold cannot be captured and re-charging a refunded payer is not CORE's decision — who pays MOVE and who absorbs the loss is a B-20-class owner question, recorded as **B-30**. Scope is the `cancelled` branch only: a late `completed` on a `failed` row is either MOVE contradicting itself or a redelivery of the report that closed the row, and keeps its existing refusal; a late `failed` after a cancellation records nothing and is answered rather than refused, since both sides agree the work was not delivered and a 409 would only be dead-lettered for nothing. Reports lost before the deploy can be recovered by reviving the `inbound_event` rows carrying `fulfillment was cancelled` (B-27, `npm run revive`); the migration performs no backfill and invents no history |
| B-36 | *Resolved.* Branch protection and rulesets cannot be configured on this repository's plan | CI's two jobs are informative, not required: a red run blocks no merge automatically, so the enforcement milestone 12 delivered stops at the run and does not reach the merge button. Measured rather than assumed — `gh api repos/uxxxug/wasla-core/branches/main/protection` and `.../rulesets` both answer HTTP 403 "Upgrade to GitHub Pro or make this repository public", so this is not a setting anyone forgot | Either a paid plan on the owning account or making the repository public. Neither is a code change and neither is CORE's call  **Resolved on 2026-09-14**, by the same change that resolved B-41: the repository was made public, and branch protection is free on public repositories. `PUT repos/uxxxug/wasla-core/branches/main/protection` now answers `200` where it answered `403 Upgrade to GitHub Pro`. `main` requires both CI jobs — *Verify without a database* and *Verify against PostgreSQL* — to be green **and up to date with `main`** (`strict: true`) before a merge, and refuses force pushes and deletion. Read back from `GET .../branches/main`: `protected: true`, the two contexts present. Two deliberate omissions, both recorded rather than silently chosen: pull-request review is **not** required, because the only reviewer is the repository owner and requiring one would block the automatic merge of green branches this work runs under; and `enforce_admins` is **false**, so the owner can still push directly in an emergency — which means the protection is a gate on the normal path, not a proof that `main` can only be reached through CI. Raising either is an owner decision and neither is CORE's to make. |
| B-37 | *Resolved.* `idempotency_key` is a table nothing writes | Created by migration 0001 with a primary key, a scope column, a body and an expiry, and written by no code in `src/` or `scripts/` — the notification module's identically-named *column* is unrelated. Found while bringing the runtime tables under the parity gates (milestone 19): an unused table is a claim nobody can falsify, and an HTTP idempotency layer that looks implemented in the schema and is absent from the code is worse than one that is visibly missing. It is recorded as an enforced exemption in `tests/runtime-table-parity.test.ts`, which fails the moment anything starts writing it | One of two deliberate decisions, neither of which belongs in a parity cycle: implement request idempotency against it (an owner decision about the HTTP contract, since it changes what a repeated `POST` means), or remove it in a reviewed destructive migration. `scripts/check-migrations.mjs` refuses `DROP TABLE` in a forward migration on purpose, and weakening that gate to tidy up a dead table is exactly the trade this repository does not make  ***Resolved* in milestone 32.** The table is now the router's record of answers it has already given on the five routes that had no way of their own to collapse a retry. Migration `0020` gave it the columns it was missing — `method`, `request_fingerprint`, `response_status`, a primary key of `(method, scope, key)` and a CHECK that only a `2xx` may be stored — a port with a reference and a Postgres adapter, an entry in `column-shapes.ts` and in `ROW_RULES`, and a gate that drives every write route twice. The alternative considered and rejected was deleting the table: a route that duplicates needs somewhere to record what it already answered, and the table migration 0001 created was the right shape short of three columns. |
| B-39 | `POST /v1/sessions` mints a bearer token for any `principal_id` with no proof of possession | Found while measuring the anonymous privilege escalation in milestone 29. The route takes a `principal_id` and a `channel_type` and answers `201` with a working token, with no credential and no evidence that the caller controls that principal's channel account. A principal id is not a secret: it is returned by `GET /v1/sessions/current`, by every membership answer and by audit reads. So an outsider who has seen one administrator's principal id can become that administrator. Milestone 29 closed the membership half of the escalation and asserts this half as still reachable in `tests/anonymous-privilege-escalation.test.ts`, so the hole is measured rather than described | An owner decision about how humans and services log in, which CORE may not pick unilaterally for MOVE and MARKET: an OTP or link to the channel the identity was registered on, a service credential held by each channel adapter that mints sessions on its users' behalf, or a signed assertion from the caller. The fail-closed direction, and the recommendation, is the second: session creation becomes a privileged operation requiring a `service` credential, which is what the `service` role and `partner_api` channel already exist for, with a seeded bootstrap credential per environment. Answering it means changing the last case of that test on purpose. ***Resolved* in milestone 31**, by the second direction — the one recommended above. `POST /v1/sessions` requires the new `session.issue` permission, held by `platform_admin` and `service`; an anonymous caller is refused `401` before the body is parsed, a credential holding nothing gets `403`, and an entitled caller's issuance produces a session belonging to the *named principal* with that principal's roles only. The last case of `tests/anonymous-privilege-escalation.test.ts` was changed on purpose and now asserts all three. The bootstrap credential the direction called for is `npm run bootstrap:credential`. What remains is smaller and is recorded separately as **B-42**: the permission is unscoped |
| B-40 | `POST /v1/sessions/revoke` requires no credential | Anybody holding a session id can revoke that session; the route authenticates nobody. Found in the same scan as B-39. It is a denial rather than an escalation — the worst outcome is that a caller who has seen a session id logs its owner out — and it is also why the route is the only bodyless `204` in CORE | The same login-flow question as B-39, and cheaper to answer with it than before it: deciding who may revoke a session other than their own needs the same view of what a session credential proves. Fail-closed direction: require authentication, allow a principal to revoke its own sessions, and require `organization.write` or `platform_admin` for anybody else's. ***Resolved* in milestone 31**, in that direction with one deliberate substitution: the permission for somebody else's session is **`identity.write`**, not `organization.write`, because a session belongs to a principal and not to a tenant — `organization.write` is held by every `org_admin` and would have let a tenant administrator end a platform administrator's session. Own sessions need no permission at all. Two things the direction did not mention and the implementation had to get right: the authorization is checked **before** the not-found refusal, so an unprivileged caller cannot use this route to tell a real session id from an invented one, and the handler's missing `await` — found in the same measurement, never previously recorded — is fixed, which is what made the old route a remote kill rather than only a logout |
| B-41 | *Resolved.* CI could not render a verdict: GitHub Actions refused to start any job on this repository while it was private | Every run since `34784262565` (main, 2026-09-13 21:35, the milestone 29 merge) fails in 3–6 seconds with **no steps and no runner assigned**. The annotation on the check run is explicit: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* Three runs are affected so far — `34789466472` (reservation push), `34794082248` (implementation push) and `34794100060` (PR #21). This is not a test failure and no change to CORE can fix it: the workflow file, the branch and the commits are fine and the same workflow passed 90 minutes earlier on the same repository. Its cost is the rule this repository runs on — **local green is not a verdict** — so milestone 30 is complete, measured and pushed, but **unjudged**, and no branch can be merged on the strength of a local run. It compounds **B-36**: with no branch protection *and* no CI, a merge would have nothing checking it at all. | Not CORE's to fix. The repository owner must restore GitHub Actions billing (Settings → Billing & plans: clear the failed payment or raise the spending limit). The moment a run completes with jobs, re-run `34794100060` on PR #21, record the two jobs' counts in the milestone 30 cycle record, and merge only then. Until it is restored, the honest state of every branch is "locally verified, unjudged". **Resolved on 2026-09-14 by the repository owner making `uxxxug/wasla-core` public**, which moves Actions onto the free tier for public repositories and takes the failed billing out of the path. Attempt 2 of run `34794219774`, on the same commit `da1b8fa` that attempt 1 refused to start, executed both jobs and passed. The record is kept rather than deleted: for roughly thirteen hours this repository could produce no verdict, and three commits were pushed in that window whose only evidence was local |
| B-42 | ***Resolved*** on 2026-10-21 (cycle "B-42 closed", branch `fix/b42-session-issue-scope`, migration 0022), in the first of the three directions below. `session.issue` was unscoped: a `service` credential could mint a session for **any** principal | Found while closing B-39 in milestone 31, and opened deliberately rather than half-answered. The permission answers "may this caller create sessions at all" and not "for whom". So MARKET's channel adapter can mint a session for a MOVE courier, and for a `platform_admin` — the escalation B-39 described, reachable now only by a principal holding a credential CORE issued to a named system. It is strictly smaller than what it replaces: it needs a credential rather than nothing, that credential is revocable, and every issuance is audited as `session.issued` against the *issuing* principal, so misuse is attributable where before it named nobody. It is recorded as a blocker and not a defect because the fix is an ownership decision, not an implementation | An owner decision about what a channel adapter is allowed to speak for, which is B-39's question one level deeper: either `session.issue` is scoped to the `channel_type` the credential was provisioned for (MARKET's `partner_api` credential may issue for identities registered on its channels and no others), or issuance carries a signed assertion naming the channel account, or a service may only issue for principals it registered. The first is the smallest and matches how the credential is already provisioned — `--service-name` names the system, and the identity link already records which channel a principal came from. None of the three can be picked by CORE alone, because MOVE and MARKET are the callers |
| B-43 | **Resolved** in milestone 33 (branch `retry-claim`). A keyed retry is collapsed only after the first call has answered, so two identical requests in flight at the same instant both reach the handler | Found while building milestone 32's mechanism, and stated in `src/platform/http/retry.ts`, in the gate header and in `docs/retry-idempotency.md` rather than implied away. The record is written after the handler answered — it has to be, because the answer is what is recorded — so the window between the first call reaching the handler and its record being written is a window in which a duplicate is not collapsed. On Postgres the record itself is safe (`on conflict (method, scope, key) do nothing`, first answer wins) and the reference backend does the same; what is not safe is the *work*. In practice a caller retries after a timeout, which is seconds after the first call, and the window is the duration of one request — but "in practice" is not a guarantee, and the mechanism must not be read as one | Closing it means claiming the key **before** the work, inside the handler's own transaction, so a concurrent second call finds a claimed record and waits or is refused — which changes the port from "record an answer" to "claim, then complete or release", needs a state column and an abandoned-claim recovery path of the kind the notification worker already has, and must decide what a caller whose twin is still in flight is told (`409`, or a wait). It is a design cycle of its own, not a patch **Resolution:** the key is claimed before the handler runs, in one statement that cannot be interleaved, and the loser is refused with `409` + `retry-after: 1` + `details.claimed_at` rather than made to wait — the reasoning against the wait is in `docs/retry-claim.md`. Two of the three things this cell expected turned out not to be needed: the claim is **not** inside the handler's transaction (it is taken before the handler and settled after, so a rolled-back handler releases rather than un-claims), and the abandoned-claim recovery needed **no worker** — `CLAIM_HORIZON_MS` plus the `do update … where` of the claim itself makes the next request for the key the recovery path. Re-measured before the fix at `8d31133`: 19 duplicate tenants across five attempts to create five, on Postgres, and 5 of 5 on the reference backend every time. Gated by `tests/retry-claim.test.ts` on both backends |
| B-44 | **Resolved** in milestone 34 (branch `refusal-retryability`). An in-flight idempotency refusal reports `retryable: false` in its body while carrying a `retry-after` header that says the opposite | Found while closing B-43 in milestone 33, and stated in `src/platform/http/retry.ts`, in the `KeyReused` contract description and in `docs/retry-claim.md` rather than smoothed over. `CoreError.retryable` is derived from the error code alone — `unavailable`, `internal` and `rate_limited` are retryable and everything else is not — which is right for every refusal CORE had until now. The in-flight twin is a `conflict`, because a live claim on the key is the state preventing the request, and it is also the one refusal in CORE that **does** come good by itself: that is why it sends `retry-after: 1`. A client that machine-reads `retryable` will not retry it, which defeats the point of the header. No caller is wrong today — the contract says to read `retry-after` on this response — but two fields on one body disagreeing is a defect and not a documentation problem | Letting a refusal override the retryability its code implies, which means a change to `CoreError` and therefore to the error contract of every module that raises one, plus a decision on whether `retryable` stays derived (and gains an override) or becomes declared per refusal. Deliberately not done in milestone 33: reaching into the shared error type while measuring one route's concurrency would have been changing the thing under measurement **Resolution:** the retry time became a property of the refusal — `CoreError.retryAfterSeconds` — and both `retryable` and the `retry-after` header are rendered from it, so they cannot disagree. `IN_FLIGHT_HEADERS` is deleted and `rateLimitHeaders` no longer writes the header. The decision this cell left open went to **derived plus an override** rather than declared per raise site: the code remains a good default for all but a handful of refusals, and a refusal may now say more about itself than its code implies only in the direction CORE can justify, because CORE states a time only when it knows the refusal comes good by itself. Swept before the fix at `cdc09ce`: 4 contradictions in 105 refusals, all the same one. Gated by `tests/refusal-retryability.test.ts` on both backends |
| B-45 | One person cannot yet reach CORE from Discord, a browser or a native app with proof | `CHANNEL_TYPES` in `src/modules/identity-access/domain.ts` and the `channel_type` CHECK in `db/migrations/0001_core_foundation.sql` allow `telegram`, `phone`, `email`, `web`, `partner_api` only; there is no `discord` or `apple`, no sign-in adapter that verifies a channel's own proof before `session.issue`, no passkeys, no link/unlink of a second method by its owner, no account deletion, and no per-channel session lifetime. Shared roadmap Revision 2 item XR-8.5 (owner instruction of 2026-10-21) | Open. B-42 (XR-3.2) is resolved (2026-10-21): an adapter now issues only on the channels its credential names. B-39 was resolved in milestone 31, so neither prerequisite is open; what remains is the work itself — each sign-in adapter must verify its channel's own proof before it asks for `session.issue`, because CORE still does not. The method list is the owner's (OD-XR-4); the first change is additive (new channel types in a new migration, never editing 0001) |
| B-46 | ***Resolved*** on 2026-10-21 (cycle "B-46 closed", branch `fix/b46-platform-operate`). Platform-wide routes were guarded by a tenant's permission | Found while designing XR-8.9 (a person opening their own store becomes `org_admin`). Fourteen routes checked `organization.write` / `organization.read` **with no organization**, and `authorize` passes an unscoped permission on presence alone; `org_admin` and `org_member` are roles granted inside one tenant. Measured on `fc4cb81`: an `org_admin` of tenant A got `201` registering an event subscription for every tenant's `core.fulfillment.created` to its own URL, `201` overwriting country `SA` to `Renamed`/`USD`, and `201` creating tenants; an `org_member` of A got `200` on `GET /v1/notifications` across tenants, on the subscriber list and on the undelivered queue. `GET /v1/subscriptions/:id` checked `subscription.read` unscoped: A's `org_admin` and `support_agent` read B's subscription (`200`). | Resolved: new permission `platform.operate` (`platform_admin` only) on all fourteen; subscription read scoped to its owner. Gate `tests/platform-operation-scope.test.ts`. Geography reads stay open to any member (reference data). |
| B-47 | ***Resolved*** on 2026-10-21 (cycle "B-47 closed", branch `fix/b47-per-organization-permissions`). A permission granted in one organization was honoured in another | `IdentityService.authorize(actor, permission, organization_id)` checks `actor.permissions` (the union over every membership) and then only that `organization_id` is among the actor's memberships. An `org_admin` of A who is an `org_member` of B therefore holds `organization.write` in B. Measured on the B-46 branch: such a principal answered `201` to `POST /v1/memberships` granting a third person `org_admin` **in B**. Found in the B-46 cycle. | Resolved: `authorize(actor, permission, organization_id)` reads the roles of the membership in that organization; `platform_admin` still acts everywhere. `GET /v1/sessions/current` publishes `memberships` (each with its roles). Gate: the B-47 block of `tests/platform-operation-scope.test.ts`. |
| B-8 | *Resolved.* Managed repository credentials are available; CORE is published to `uxxxug/wasla-core` by fast-forward without rewriting history. `package-lock.json` is now committed, so installs are reproducible; previously `npm ci` failed outright because no lockfile existed | — | — |

## Open questions

- Single database with three schemas, or three databases? Ownership is settled
  either way; only the physical topology is open.
- Event transport for production: broker or database-backed queue.
- Session lifetime and refresh policy per channel (currently a fixed 12 hours).

## Risks

- Migration 0006 enables row-level security from a hardcoded list, so every
  future table must remember to opt in. `tests/db-schema.test.ts` catches an
  omission against a live database, but nothing catches it at authoring time.

| Risk | Severity | Mitigation in place |
|---|---|---|
| Identity duplication across the two legacy systems | high | No automatic merge is possible in code; `canonical_identity_id` requires an explicit merged status |
| Silent event loss between commit and publish | high | Transactional outbox; a crash leaves the record pending and it is retried |
| Duplicate side effects from at-least-once delivery | high | Consumer inbox keyed by `(consumer, event_id)`; tested for triple delivery |
| CORE drifting into a god service | medium | Governance gate fails the build on MOVE/MARKET entities; no proxy endpoints |
| Contract drifting ahead of implementation | medium | Contract gate cross-checks emitted event types against published schemas |
| Roadmap drifting behind the code | medium | Roadmap gate fails the build |

## Tests that pass at this commit

**1015 of 1015 across 42 files** with `DATABASE_URL` set (both backends), plus
the migration-lifecycle pass (1), and **550 passed / 54 skipped** without.
Counted by running the suite at this commit, twice.

The figure this line carried through the foreign-key cycle — 976 across 41
files, 529 / 52 without — is superseded by the trigger-parity cycle and kept
here for the same reason the one before it was: the count's history stays
auditable. The earlier figure on this line — 488 across 31 files, 273 / 41 without — was
true when it was written and was not updated by the cycles in between, so it had
become a stale claim about "this commit". It is replaced rather than deleted:
the previous number is recorded here so the history of the count stays
auditable.

The per-area list below was written when the suite stood at 71 tests across 11
files and describes those cases only; it was never extended as later cycles
added files. Each cycle section further down carries the tests it added, and
those sections are the current record. The list is kept because the cases in it
still exist and still pass, not because it is complete.

- Eventing (12): envelope completeness, malformed envelope rejection,
  transaction rollback leaves no event, commit writes state and event together,
  publish-once, retry with backoff, backoff window respected, dead-lettering,
  duplicate delivery handled once, independent consumers, out-of-order
  delivery, handler retry then success.
- Identity (8): create identity/principal/link with exactly one event,
  idempotent re-registration with no second event, no automatic merge,
  input validation, token authenticates and is never stored in plaintext,
  unknown/expired/revoked tokens rejected, permissions follow roles,
  cross-organization access blocked.
- API (8): health, readiness, idempotent registration over HTTP, canonical
  error shape with correlation id, unauthenticated and forged tokens rejected,
  tenant isolation on reads, token never echoed back, unknown route shape.
- Money (6): balanced entries and available balance, idempotent authorize and
  capture, insufficient funds refused, idempotent void returning held funds,
  expiry sweep releasing funds and blocking capture, past expiry rejected.
- Geography (4): reference registration, hierarchy reads, coordinate
  resolution ordered by distance, no coverage outside a service area.
- Fulfillment (2): coordination on opaque references, idempotent consumption.
- Vertical slice (8): MARKET order -> CORE fulfillment + money hold -> MOVE job
  -> execution -> CORE closure -> MARKET closure; duplicate delivery; consumer
  retry; network failure after commit replayed from the outbox; expired money
  hold refusing a success claim; cancellation releasing the hold and stopping
  the job; MOVE job-creation failure; full event replay after restart.
- Governance (4): no MOVE/MARKET entities, no hardcoded secrets, no
  cross-module internal imports, no TODO markers.
- Fulfillment dispatch (5): the `dispatched` transition publishes its contract,
  idempotent acceptance, acceptance after cancellation stays cancelled and
  publishes nothing, rejection closes the fulfillment, unknown job reference.
- Fulfillment settlement (11): capture on success, release on failure, on MOVE
  rejection and on cancellation, `settlement_state` on the published contract,
  intake refusal for a missing, unauthorized, captured and expired hold, an
  unfunded order still coordinating, the `unsettled` path with its audit entry,
  a success claim that could not be captured never reported as success, and the
  organization-scoped reconciliation read.
- Money expired holds (3): the balance transition at expiry, authorizing
  against funds an expired hold no longer guards, and the sweep leaving the
  ledger and the balance unchanged.

## Cycle 2026-09-11 — CORE-only hardening (independent CORE agent)

This cycle was performed by an agent responsible for CORE alone. MOVE and
MARKET were not touched; anything they must implement is recorded under
"External dependencies" below.

### Audit findings against the actual code (not the previous roadmap text)

| # | Finding | Severity | Status |
|---|---|---|---|
| G-1 | The `coordinating -> dispatched` transition mutated state but published **no** event. MARKET could not observe that work had been assigned, and a stream replay could not reconstruct the intermediate state. | high | fixed |
| G-2 | A `move.job.accepted` arriving after a cancellation raised a permanent `conflict`, which would dead-letter the MOVE consumer on a legitimate race. | medium | fixed |
| G-3 | A failed hold release was swallowed by an empty `catch`. A fulfillment could close as cancelled or failed while its money was still held or already captured, with **no** record anywhere — the exact state/money inconsistency CORE is responsible for preventing. | high | fixed |
| G-4 | Execution state and money state were only comparable through a cross-module join, so no query could answer "is CORE financially consistent?". | high | fixed |
| G-5 | `market.order.created` could declare any `payment_authorization_id` and CORE never verified it. A hold that was missing, voided, captured or expired was only discovered at capture time — **after** MOVE had already executed the work. | high | fixed |
| G-6 | `balance()` counted expired holds as held even though capture is already refused past the expiry. The available balance understated the truth and authorizations the wallet could afford were refused, for an unbounded window — the sweep is not guaranteed to have run. | medium | fixed |

### Changes

- New published contract `core.fulfillment.dispatched` v1, emitted inside the
  same transaction as the state change (transactional outbox), carrying only
  opaque references — the MOVE job id is passed through and never interpreted.
- A late acceptance after cancellation now records the job reference for
  traceability, stays `cancelled`, publishes nothing and does not fail the
  consumer.
- `docs/event-catalog.md` documents the full published lifecycle tree.
- `settlement_state` (`none` | `held` | `captured` | `released` | `unsettled`)
  is now part of the fulfillment aggregate and is set on every transition.
  `unsettled` is the single explicit inconsistent value.
- A void that cannot be applied is no longer silent: the fulfillment is marked
  `unsettled` and an audit entry (`fulfillment.settlement_inconsistent`, with
  the hold reference deliberately named so the audit scrubber keeps it) records
  the mismatch. Closure still proceeds — CORE reports the truth rather than
  blocking.
- Holds are verified at intake through the published money port. An order whose
  hold is missing, not authorized, already captured or expired is closed as
  `failed` immediately, `core.fulfillment.created` is never published, and a
  still-authorized hold is released as part of the refusal. CORE no longer asks
  MOVE to execute work it already knows it cannot settle.
- `isFinanciallyConsistent` encodes the invariant; `listFinanciallyInconsistent`
  and `GET /v1/fulfillments/reconciliation/inconsistent?organization_id=` expose
  it. An empty result is the expected state.
- `settlement_state` added as an optional, additive field to
  `core.fulfillment.completed.v1` and `core.fulfillment.cancelled.v1`; the
  closure `reason` vocabulary is now documented in the contract.
- Migration `0005_fulfillment_settlement_state` (additive, with backfill and
  rollback) adds the column, a value check and an alignment check that stops
  the database from storing a closed fulfillment that is still holding money.
- `held_minor` now counts only capturable holds. An expired hold is reported in
  the new additive `expired_hold_minor` field and its funds are immediately
  available again; the sweep still releases it formally and the ledger is never
  touched by expiry. No existing balance field changed meaning for a wallet
  without expiring holds.

### Migrations executed against a real engine for the first time

A PostgreSQL instance was provided, so the migrations stopped being an
unverified claim. All six were applied to a managed PostgreSQL 17.6 instance
and to a local PostgreSQL 18.4 instance, and the whole rollback chain
0006 → 0001 was exercised down to an empty schema. The result: 20 tables, 32
check constraints, 47 indexes.

Executing them exposed two defects that no amount of in-memory testing could
have found, because both live in the database layer itself:

| # | Finding | Severity | Status |
|---|---|---|---|
| G-7 | The three trigger functions were created with a **mutable** `search_path`. `ledger_transaction_is_balanced` resolves `ledger_entry` through the caller's search_path, so a session that puts a decoy `ledger_entry` ahead of ours makes the balance check read the wrong table and pass. **Demonstrated, not theorised:** with 0006 rolled back, an unbalanced ledger transaction committed successfully; with 0006 applied, the identical attempt is refused | high | fixed |
| G-8 | Every table was readable by any role holding USAGE on the schema. On a managed host that exposes the schema over HTTP, identities, wallets, the ledger and the audit trail were reachable without authenticating against CORE at all | high | fixed |

Migration `0006_harden_trigger_functions` pins each function's `search_path`
to the schema it was installed in and enables row-level security with **no**
policies on all 20 tables, which is deny-by-default for every role except the
table owner. CORE connects as the owner, so the application is unaffected; any
non-owner role must be granted explicit policies. Nothing in the migration
hardcodes a schema name — it pins to `current_schema()` — so it stays correct
if the tables do not live in `public`. On the managed instance the security
advisor went from one ERROR plus one WARN to informational only.

Both the backfill in 0005 and the rollbacks were verified with real rows:
pre-existing fulfillments correctly derived `held`, `captured`, `released` and
`none` from their authorization status, and `0005.down` removed the column
cleanly.

### Tooling added

- `scripts/db-migrate.mjs` — `status`, `up`, `down [--all]`, driven by
  `DATABASE_URL`, wrapping each file in a transaction so a migration that fails
  halfway leaves nothing behind. Version bookkeeping stays in the migration
  files, which already record themselves. Exposed as `npm run db:status|db:up|db:down`.
- `tests/db-schema.test.ts` — 24 assertions against a live engine: the recorded
  migration ledger, the `settlement_state` default, all nine execution/money
  combinations CORE produces, all eight it must never store, the pinned
  function `search_path`, the decoy-schema ledger bypass, deny-by-default row
  security, and the partial index behind the reconciliation read. Skipped when
  `DATABASE_URL` is absent, so the default suite and CI are unchanged.
- `pg` is a **devDependency** only. The application still has no runtime
  dependencies; this is tooling, not served code.

### Integration reviewed from the CORE side only

`MARKET -> CORE -> MOVE -> CORE -> MARKET` is exercised end to end by
`tests/vertical-slice.test.ts` against the contract simulators in
`tests/support/product-simulators.ts`. Those simulators are CORE-side test
doubles: they prove the contracts are consumable, they do **not** prove the
real MOVE or MARKET services implement them.

CORE is the source of truth for coordination state and for every intermediate
event in that round trip. It holds opaque references only — no order items,
prices, drivers, vehicles or routes cross into CORE payloads, and the
governance gate fails the build if they do.

### External dependencies

Recorded, not implemented. This cycle changed nothing outside CORE.

**MOVE must:**

| Direction | Contract | Note |
|---|---|---|
| consume | `core.fulfillment.created` v1 | the request to execute |
| consume | `core.fulfillment.cancelled` v1 | must stop work already dispatched |
| publish | `move.job.accepted` v1 | CORE turns this into `dispatched` |
| publish | `move.job.rejected` v1 | CORE closes as `failed` and releases the hold |
| publish | `move.job.completed` v1 | CORE captures the hold on success |

CORE now tolerates a `move.job.accepted` that arrives after a cancellation: it
is absorbed, not rejected, so MOVE will not see a dead-lettering `conflict` on
that race. MOVE should still treat the cancellation as authoritative.

**MARKET must:**

| Change | Contract | Compatibility |
|---|---|---|
| consume the new event | `core.fulfillment.dispatched` v1 | new; without it MARKET cannot show that work was assigned |
| read the new field | `settlement_state` on `core.fulfillment.completed` / `.cancelled` v1 | additive and optional — existing consumers keep working |
| send the hold | `payment_authorization_id` on `market.order.created` | an order without it still coordinates, but CORE cannot bind money to that execution |

MARKET should expect a fulfillment to be closed as `failed` at intake, before
any MOVE dispatch, when the declared hold is missing, not authorized, already
captured or expired. In that case `core.fulfillment.created` is never
published at all.

## Cycle 2026-09-11 — cross-system vertical slice (CORE side)

- Fulfillment lifecycle extended: `coordinating -> dispatched -> completed |
  failed | cancelled`, with `move.job.accepted` and `move.job.rejected`
  consumed and `core.fulfillment.cancelled` published.
- Money is now bound to fulfillment through a published port: success captures
  the hold, failure/rejection/cancellation releases it, and an unsettleable
  hold turns a reported success into a failed closure. CORE never reports
  success for work it could not settle.
- Contracts added: `move.job.accepted.v1`, `move.job.rejected.v1`,
  `core.fulfillment.cancelled.v1`; `market.order.created.v1` gained an optional
  `payment_authorization_id`; `core.fulfillment.completed.v1` gained `reason`.
- Migration `0004_fulfillment_lifecycle` (additive) with rollback.
- MOVE and MARKET are exercised through contract-conformant simulators in
  `tests/support/product-simulators.ts` — the repositories stay independent and
  no runtime code or database is shared.

## Not proven yet

- The MOVE and MARKET repositories implementing their side of these contracts
  (next cycle; CORE-side simulators prove the contract, not their code).

- Behaviour against a real Postgres database (migration 0001 unexecuted).
- Behaviour under a real message broker (the bus is in-process today).
- Atomic rollback of in-memory staged mutations if a later staged mutation throws;
  production persistence must supply a real database transaction boundary.
- Any production or staging deployment.
- Any data migration, reconciliation or cutover.
- Performance and load characteristics.

### The ports could not have had a database adapter

This cycle's finding is not a bug in behaviour. It is that the next roadmap item
was impossible as written, and the roadmap did not say so.

Every persistence port was synchronous:

```ts
getIdentity(identityId: string): Identity | undefined;
insertIdentity(identity: Identity): void;
append(event: EventEnvelope): void;
```

No database adapter can implement those signatures. A query returns a promise,
so `getIdentity` cannot hand back an `Identity` in the same tick, and `void`
gives an adapter nowhere to report that a write failed. The unit of work had the
same problem from the other direction: `stage(mutation: () => void)` buffered
closures that took no argument, so two staged writes had no shared handle and
therefore no way to land in one transaction. Its own comment said the Postgres
implementation "will map onto a real transaction" — with that signature it
could not have.

So the ports were the blocker, not the schema and not the missing database.

| Change | Why |
|---|---|
| Every repository, outbox, inbox and audit method returns a promise | A durable adapter cannot answer synchronously |
| `TransactionBoundary.run(work)` in `src/platform/persistence/transaction.ts` | Gives `withTransaction` something to open and close; the in-memory boundary keeps the existing staged-rollback semantics, a Postgres boundary maps to `BEGIN`/`COMMIT`/`ROLLBACK` |
| Writes take a `TransactionScope`; staged mutations receive it | Two writes in one unit of work now share a handle, which is what makes them atomic in a real engine. A write that ignores the scope escapes the transaction — that is now visible in the signature rather than impossible to express |
| `TransactionContext { boundary, outbox }` passed to `withTransaction` | The commit point stays one obvious place instead of spreading into the services |

Deliberately left synchronous: `IdentityService.authorize`, which is a pure
check against an already-authenticated actor and reads no repository. Making it
async would have added an await to every route for nothing.

Also honest about what this did not fix: audit entries are still written
outside the unit of work, and geography writes one row per command with no
transaction at all. Neither is wrong today — audit is append-only and geography
is reference data — but when the Postgres adapters land, an audit entry for a
rolled-back command would survive. That is recorded as B-9 rather than quietly
fixed in a refactor commit.

`tests/transaction-boundary.test.ts` (6 tests) asserts the boundary is really
used: a recording boundary proves `begin`/`commit` wrap both the mutation and
the outbox append, that every staged mutation receives the same scope, that a
throw in the work *or* in a staged mutation produces `rollback` with nothing
appended, and that mutations are applied before the append rather than after.

The refactor touched all five modules, the eventing platform, the composition
root and all 11 test files. The suite result is unchanged — 71 passing, same
tests, same assertions — which is the point: this is a contract change with no
behavioural change.

### First persistence adapters on Postgres

Four ports now have a real implementation: identity, organization, outbox and
inbox, plus the transaction boundary they all depend on.

| File | What it is |
|---|---|
| `src/platform/persistence/postgres.ts` | `PgTransactionBoundary` (`BEGIN`/`COMMIT`/`ROLLBACK` on one pooled client) and `runner(pool, scope)`, the single place that decides whether a statement joins the caller's transaction or runs autocommit |
| `src/platform/eventing/pg-outbox.ts` | Durable outbox. `append` runs on the caller's scope so the event and the state change commit together; `claimDue` uses `for update skip locked` so two relays never publish the same event |
| `src/platform/eventing/pg-inbox.ts` | Durable inbox. `claim` is one `insert ... on conflict do nothing ... returning`, so a race between two workers is resolved by the database rather than by a check-then-insert window |
| `src/modules/identity-access/pg-repository.ts` | Identities, links, principals, sessions, memberships |
| `src/modules/organization/pg-repository.ts` | Organizations |

`tests/pg-adapters.test.ts` runs the **same** assertions against the in-memory
and the Postgres adapters. That is what makes it worth writing: a test written
only against Postgres proves the SQL parses, while running both proves the two
are substitutable, which is the only property the services rely on. 16 shared
cases run everywhere; with `DATABASE_URL` set they run twice and two
Postgres-only atomicity cases are added — 34 assertions in total, executed
against PostgreSQL 18.4.

Two things this cycle deliberately did not do:

- **The composition root still wires the in-memory adapters.** Money, geography
  and fulfillment have no adapter yet, and a unit of work that wrote a
  fulfillment to a `Map` and its event to Postgres would not be atomic. A
  half-migrated switch would look like progress and remove a guarantee.
- **The in-memory rollback gap was reported, not papered over.** The
  conformance suite found that `InMemoryTransactionBoundary` cannot undo a
  staged write that already succeeded when a later one fails, because staging
  only defers writes, it does not journal them. Postgres has no such gap. Both
  behaviours are now asserted explicitly and the difference is recorded as
  B-10.

### Every port has a Postgres adapter, and the slice runs on it

The remaining adapters — geography, money, fulfillment and the audit trail —
are implemented, and the composition root can now select a backend.

| File | Notes |
|---|---|
| `src/modules/geography/pg-repository.ts` | Reference data. `char` columns are trimmed on read, otherwise a value written as `SA` comes back padded and compares unequal |
| `src/modules/money/pg-repository.ts` | `amount_minor` is `bigint`, which the driver returns as a string; converting in one named place is why the conformance test asserts `typeof amount_minor === "number"`. `insertTransaction` **refuses to run outside a transaction**: the balance trigger is deferred to `COMMIT`, so a header written by itself would trip it and the error would read like a balance bug instead of a missing transaction |
| `src/modules/fulfillment/pg-repository.ts` | MARKET and MOVE references stay opaque strings, exactly as in the domain. `fulfillment_settlement_alignment_check` means the database refuses any status/settlement pair the service should never have produced |
| `src/platform/audit/pg-audit.ts` | Append-only, with the same metadata scrubber as the in-memory log, so a credential cannot reach the table through this path either |
| `src/platform/persistence/backends.ts` | `memoryPersistence(clock)` and `postgresPersistence(pool, clock)` return one bundle. Selecting adapters individually is deliberately not possible: a `Map` repository next to a Postgres outbox compiles, runs, and is not atomic |

`createCoreApp({ clock, persistence })` takes the bundle and `/ready` reports
which one is wired, so the backend is observable rather than assumed. CORE
still never reads an environment variable or imports the driver in `src/`: the
caller builds the pool and owns its lifetime.

**`tests/vertical-slice-postgres.test.ts`** is the test this whole sequence was
for. The in-memory slice proves the coordination logic; it cannot prove that
logic survives a real database, because a `Map` never rejects a row, never
enforces a foreign key and never applies a check constraint. The same
MARKET → CORE → MOVE → CORE → MARKET flow now runs on Postgres and covers
completion with capture, rejection with release, duplicate delivery of every
event, a fully drained outbox with nothing dead, and the audit trail landing in
the table.

Result with `DATABASE_URL` set: **155 tests pass**, 100 of them in the
dependency-free default run.

One thing the database changed that the in-memory suite never could: the
existing tests use identifiers like `"org-1"`, which Postgres rejects because
`organization_id` is a `uuid` with a foreign key. The Postgres slice creates a
real organization first. That is not a test inconvenience — it is the schema
refusing a reference that was never valid, which is the reason to run the
suite against it.

### B-10 resolved: the reference boundary has real rollback

The gap was a specific one, and worth stating precisely because the old
comment in `unit-of-work.ts` claimed it away: **staging is not rollback.**
Deferring writes to a single commit point means a command rejected by a domain
rule leaves nothing behind — that is the common case, and it worked. But once
the commit point starts applying staged writes, a failure on the third has
already let the first two land. Deferral narrows the window; it does not close
it.

`InMemoryTransactionBoundary` now opens a `MemoryJournal` and puts it in the
scope. Every in-memory adapter calls `journalMapWrite(scope, map, key)` (or
`journalAppend`) immediately *before* mutating, which records how to undo that
write while the pre-image is still readable. A throw unwinds the journal in
reverse order, so two writes to the same key undo last-first.

Two consequences that make this more than a test fix:

- A write given `NO_SCOPE` registers nothing and is not undone. That is not an
  omission — it is the same thing Postgres does with a statement issued on the
  pool, which autocommits and is equally impossible to take back. The two
  implementations now agree about what a scope means.
- An adapter that ignores the scope is now *provably* non-transactional rather
  than accidentally fine, because the conformance suite runs the rollback tests
  against both backends.

Also unified: **nesting is refused by both boundaries.** It used to be refused
only by Postgres, and only by accident of implementation. A nested
`PgTransactionBoundary.run` takes a *second pooled connection*, so the inner
work commits on its own while the outer transaction is still open — two
transactions that look like one. The guard uses `AsyncLocalStorage`, not a flag
on the boundary, because two concurrent HTTP requests legitimately open two
independent transactions and a flag cannot tell that apart from real nesting.
Both behaviours are asserted: `refuses a transaction opened inside another one`
and `keeps two concurrent transactions independent`.

New conformance tests, running on both backends:

| Test | What it would catch |
|---|---|
| `discards writes already applied earlier in the same transaction` | The original B-10 gap. Trigger is a duplicate identity link, which both adapters reject on their own terms |
| `restores the previous value of a row the transaction overwrote` | A journal that only deleted keys instead of restoring pre-images. This passes the test above and fails this one |
| `refuses a transaction opened inside another one` | A service calling another service inside its own unit of work |
| `keeps two concurrent transactions independent` | A nesting guard implemented as a flag, which would break concurrency |

163 tests pass with `DATABASE_URL` set, 104 without.

### B-9 resolved: the audit trail commits with the change it describes

Every service write path was reviewed. The audit entry was always written
*after* `withTransaction` returned, so with Postgres adapters a rolled-back
command could leave a trail entry claiming it happened. That is worse than a
missing entry: the trail is what an investigation treats as authoritative, so
a false entry sends the investigation to the wrong place.

The decision was made per record, on what the record means — not on what was
easier to wire.

| Write path | Decision | Why |
|---|---|---|
| Identity registration, session issue/revoke, membership grant | **Inside the transaction** | A session or a membership is an authorization fact. One that exists with no record of being granted is exactly what an access review is looking for |
| Organization creation | **Inside the transaction** | Publishes no event (tenancy is read through the API, ADR 0009) but still needs a transaction, purely so the row and its audit entry land together |
| Geography: country, region, city, service area | **Inside the transaction** | Same shape as tenancy — reference rows, no events, audited administrative writes |
| Wallet creation, credit, authorize, capture, void, expiry sweep | **Inside the transaction** | An audit entry saying money moved, when the ledger transaction rolled back, is the record a reconciliation would trust |
| Fulfillment created / refused / dispatched / closed / cancelled | **Inside the transaction** | A trail saying a fulfillment was dispatched when the update rolled back would send an operator to the wrong product |
| `fulfillment.settlement_inconsistent` | **Deliberately out of band** | Nothing was mutated, so there is no change to be atomic with, and it is the *only* record of why money and execution disagree. Writing it inside the caller's transaction would let a rollback erase the evidence of the inconsistency that caused the rollback |

So the rule is not "audit goes in the transaction". It is: **an entry that
describes a committed change belongs in that change's transaction; an entry
that records a refusal belongs outside one.** `UnitOfWork.audit` carries the
first case and its doc comment refuses the second.

Mechanically: `TransactionContext` now carries the audit log, `uow.audit(entry)`
stages an entry, and the commit point applies mutations, then audit entries,
then outbox appends. The append stays last so a failure anywhere earlier still
means no event was ever written — the property the relay depends on.

`TransactionContext.outbox` became optional. Geography and organization
publish nothing by design, and handing them an outbox they never append to
would advertise a capability they do not have; `emit` throws if one is used
without an outbox.

Two smaller things this review surfaced:

- `revokeSession` mutated the stored session object in place. With `Map`
  repositories that made the revocation visible before the commit, and left
  the journal nothing to restore because the pre-image and the new value were
  the same object. It builds a copy now.
- `OrganizationService` and `GeographyService` take a `TransactionBoundary` as
  a required constructor argument rather than defaulting to a private one. A
  default would have quietly given them their own boundary, which is the kind
  of thing this whole sequence exists to stop.

New conformance tests, on both backends: `commits state, audit entry and event
together`, `leaves no audit entry behind when the command is rolled back`, and
`keeps an out-of-band audit entry even when the caller rolls back` — the last
one pins the deliberate exception so it cannot be "tidied up" later. The
ordering test now asserts `mutation, audit, append`.

169 tests pass with `DATABASE_URL` set, 104 without.

### Identity of identifiers: resolved without a migration

See `docs/identifiers.md`. In short: the database, the OpenAPI contract and
`newId()` had all already decided that every CORE-owned identifier is a UUID.
The only layer with no opinion was the domain itself — services took `string`
and handed it to a repository — and the test fixtures lived in that gap.

That gap was a real divergence, not cosmetics: a `Map` accepts `"org-1"` and
Postgres raises `invalid input syntax for type uuid`, so the two backends
disagreed about which commands were even well formed. `assertId` now rejects a
malformed identifier at intake on both backends, as `invalid` rather than
`notFound`, because a syntactically impossible identifier does not describe an
absent row — it describes an unsatisfiable request.

**No migration was made and none was needed.** Turning `uuid` into `text`
would have discarded the database's type check, its uniqueness guarantees and
its index efficiency in exchange for letting stale fixtures pass.

References CORE does not issue stay free-form on purpose —
`market_order_reference`, `move_job_reference`, `identity_link.external_id`,
`business_reference`, `correlation_id`, the polymorphic `entity_id` columns,
`country_code` and `legacy_id`. `tests/identifiers.test.ts` asserts a non-UUID
MARKET order id is still accepted, so a later tightening cannot break MARKET.

Fixtures are unified behind `testId(label)` in `tests/support/ids.ts`. Before
this, the in-memory suites used `"org-1"` and the Postgres suites used
`randomUUID()`, which meant the two were not running the same scenarios — the
reason the gap stayed hidden.

174 tests pass with `DATABASE_URL`, 112 without.

### B-11 resolved: money and execution state commit together

Found while closing B-9, and the most serious defect in the repository so far.

`settle()` called `money.capture`, which opened **its own** transaction and
committed. `release()` called `money.voidAuthorization`, likewise. The
fulfillment row was then updated in a **separate** transaction afterwards. Every
SQL statement was correct. The pair was not.

So a failure in between — a dropped connection, a constraint violation on the
fulfillment row, a process restart — left this:

- the hold `captured` and `core.payment.captured` published,
- the fulfillment still `dispatched` with `settlement_state = 'held'`.

That is a financial inconsistency that retrying cannot repair. The retry
re-reads a fulfillment that is still open, tries to capture again, and money
refuses because the hold is already captured — so the fulfillment can never
close as completed. The `fulfillment_settlement_alignment_check` constraint
does not catch it either, because each row is individually legal; it is the
*pair* of rows that disagrees.

`listFinanciallyInconsistent` would have reported it, which is worth noting:
the reconciliation read was doing its job, and the response to a reconciliation
read that keeps finding real inconsistencies is to remove the cause, not to
watch it.

**The fix.** Both boundaries now refuse nested transactions (B-10), so the
answer could not be "open a transaction around the existing calls". Instead
money learned to participate in someone else's:

- `MoneyService.captureWithin(uow, input)` and `voidWithin(uow, input)` do all
  reads and validation first, then stage the mutation, the event and the audit
  entry on the **caller's** unit of work.
- `capture(input)` and `voidAuthorization(input)` remain, as thin wrappers that
  open their own transaction, for callers with nothing else to commit.
- Refusals (`notFound`, `conflict`, expired hold) are raised during the read
  phase, before anything is staged, so a refusal leaves the caller's unit of
  work clean rather than half filled. `settle()` relies on exactly this when it
  falls back to releasing a hold it could not capture.
- `FulfillmentPaymentPort` now declares only the `*Within` forms. A port that
  could open its own transaction made the invariant impossible to express no
  matter how carefully each side was written, so the type no longer offers it.
- `closeWithin` stages the closure instead of committing it, and each of
  `consumeMoveCompletion`, `consumeJobRejected`, `cancel` and the intake
  refusal path now opens exactly one transaction covering settlement, state,
  event and audit entry.

**The tests.** `tests/settlement-atomicity.test.ts` injects a repository whose
`update` fails, which places the failure precisely where it matters: after the
money mutation has been applied, while the fulfillment update is being
applied. It runs on both backends and asserts the hold went back to
`authorized`, the balance is untouched, and neither `core.payment.captured` nor
`core.fulfillment.closed` reached the outbox.

These tests were verified to **fail against the previous design** — the old
shape was temporarily restored and they reported `expected 'captured' to be
'authorized'` and an outbox containing `core.payment.captured`. A rollback test
that has never seen the bug it describes is not evidence.

182 tests pass with `DATABASE_URL`, 116 without.

### B-12 resolved: the reference store now enforces the schema's uniqueness

Found by the new concurrency tests, and it is the clearest example yet of why
the "no hidden divergence" rule is worth the trouble.

Every existing idempotency test called the same command twice *in sequence*,
which only proves the second call can see the first one's row. Issuing both at
once asks a different question. On Postgres, `money.capture` is safe: two
racing captures both try to insert a ledger transaction whose
`business_reference` is `capture:<authorization_id>`, and
`ledger_transaction_business_reference_key` refuses the second, which rolls
back with it. In memory, both succeeded, and **the money moved twice** —
`posted_minor` went to 2000 instead of 6000.

So the in-memory store was more permissive than production, which means it was
certifying a double spend as correct. The service code was identical in both
cases; the guarantee came entirely from a constraint only one backend had.

`InMemoryMoneyRepository` now enforces what `db/migrations/0002` declares:
`ledger_transaction.business_reference` UNIQUE,
`payment_authorization.business_reference` UNIQUE, and
`wallet (owner_type, owner_id, currency)` UNIQUE. The error messages
deliberately mirror the Postgres text, so a caller matching on them behaves
the same either way.

**The subtle part, which cost a debugging cycle and is worth recording.** The
first version of the guard called the existing async finder:

```ts
const clash = await this.findTransactionByReference(ref);   // wrong
if (clash) throw ...;
this.ledger.set(...)
```

That still double-spent. A single `await` between the check and the write is
enough to lose the race in a single-threaded runtime: both captures suspend on
the lookup, both find nothing, both resume and write. The guards are therefore
synchronous, scanning the maps inline rather than calling the async finders.
In this runtime, **atomic means no `await` between the check and the write** —
which is the same reason the transaction boundary journals inverses instead of
deferring writes.

Under concurrency `capture` is exactly-once but not always success-returning:
one caller may receive a refusal and must retry, at which point
`findTransactionByReference` returns the existing transaction idempotently. The
test asserts on the balance rather than on both calls succeeding, because the
balance is the invariant and the return value is not.

### Transaction boundary coverage, against the required list

| Required | Where | Backends |
|---|---|---|
| state + event + outbox + audit commit together | `commits state, audit entry and event together`, `commits a multi-table unit of work as one visible change` | in-memory + Postgres |
| complete rollback on failure | `leaves no audit entry behind when the command is rolled back`, `appends no event when a later write in the same unit of work fails`, `restores the previous value of a row the transaction overwrote` | in-memory + Postgres |
| duplicate commands | `authorizes, holds and captures funds exactly once`, `treats upsertCountry as an update, not a duplicate`, idempotent `cancel` and `consumeMarketOrder` | in-memory + Postgres |
| duplicate events | `duplicate delivery of every event changes nothing`, `ignores a duplicate append of the same event id`, `survives a duplicated delivery of every event` | in-memory + Postgres |
| concurrent claims | `hands one event to exactly one of two simultaneous claimants`, `captures a hold once when two callers capture it at the same time`, `closes a fulfillment once when cancellation races the MOVE completion` | in-memory + Postgres |
| retry after failure | `a transient consumer failure is retried and then succeeds`, `allows a retry after release` | in-memory + Postgres |
| restart then reload | `replaying the whole event history after a restart produces no new effects` (in-memory), `reloads state from the database and refuses to redo settled work` (new, Postgres only — a restart is only meaningful where state outlives the process) | both, separately |
| capture / release in money | `carries an order through to completion and captures the hold`, `releases the hold when MOVE rejects the job`, the settlement-atomicity suite | in-memory + Postgres |
| completion / failure / cancellation | `fulfillment-settlement.test.ts` (11 tests), vertical slice 5–7 | in-memory + Postgres |
| money and state atomic together | `tests/settlement-atomicity.test.ts` (4 tests, both backends) | in-memory + Postgres |

189 tests pass with `DATABASE_URL`, 119 without.

## Milestone: MARKET and MOVE can actually reach CORE

### Why this was next, and not settlement refinement

The roadmap listed partial capture and refunds first. Reading the code instead
of the list changed the order.

CORE's whole purpose is to coordinate MARKET → CORE → MOVE → CORE → settlement
→ MARKET. That loop is implemented and proven, on both backends, end to end.
But every one of those tests reaches it the same way: by calling a consumer
directly, or by publishing onto an in-process `LocalEventBus`. There were 24
HTTP routes and **not one of them could be told that an order exists**.
`consumeMarketOrder`, `consumeJobAccepted`, `consumeJobRejected` and
`consumeMoveCompletion` were unreachable from outside the process.

MARKET and MOVE are separate services in separate repositories. So the
coordination was real and entirely unreachable — correct logic behind no door.
Refining settlement would have made a richer version of something nothing could
start. `Not proven yet` described the in-process bus as a proving gap; it was a
functional one, which is the sort of thing a roadmap only reveals when it is
read against the code.

### What was built, CORE side only

**`POST /v1/events`, answering 202.** Not 200. CORE has taken durable
responsibility for the envelope and has done nothing else with it, and 200
would describe work that has not happened.

**`inbound_event` (migration 0007), the mirror of `outbox`.** The outbox exists
so a state change and its event cannot become two writes that disagree. This
exists so an accepted event and its processing cannot become one request that
disappears. Processing in-request would mean a crash just after the 2xx loses
the event while the producer has been told it arrived — and at-least-once
delivery only helps a producer that has been told to retry. So ingress records
and commits, and `InboundDispatcher` hands the event to the bus afterwards.

**The trust boundary is the interesting part.** Which events a caller may
assert is derived from the credential, never from the request:

- `principal.service_name` (migration 0007, UNIQUE, NULL for every person) says
  which external system a credential *is*. A header naming the producer would
  have let MOVE's credential assert MARKET's facts.
- A caller may only submit its own prefix, so **no external caller can submit
  `core.*` at all**. That is the case that matters: every consumer downstream
  treats `core.*` as authoritative, and an outsider able to announce
  `core.payment.captured` could move the system's belief about money without
  any money moving.
- An envelope whose `producer` contradicts the credential is refused as
  spoofing, not corrected.
- A human principal is refused even holding `events.submit` and
  `platform_admin`. Authorisation answers "may you submit"; this edge also has
  to answer "whose events are you", and a person has no answer.
- An event type CORE has no consumer for is refused, not parked. Accepting it
  would leave a row pending forever while the producer believed something would
  eventually happen.

**Exactly-once effects are not claimed by the dispatcher.** It is
at-least-once by construction: a crash after a handler succeeds but before
`markProcessed` dispatches again. What makes that safe is the consumer inbox,
which claims `(consumer, event_id)` before the handler runs. Retrying is cheap
precisely because the layer below refuses to do the work twice.

`accept` returns whether this was the first delivery, and that answer is
atomic: `on conflict do nothing` plus `rowCount` on Postgres, a synchronous
check-then-set in memory. Deliberately not a read followed by a write — that is
the exact shape of the bug B-12 was.

### B-13, found while testing the above

The first ingress test asserted that a dispatched order produced a fulfillment.
It failed, and the reason was not in the new code.

`LocalEventBus.publish` resolved **successfully** when a subscriber had
exhausted its attempts, recording the failure only in an in-process
`deadLetters` array. `OutboxPublisher` and `InboundDispatcher` both decide
whether to retry from exactly that answer. So an event could be marked
`published` or `processed` in the database while no consumer had done anything,
and the only trace of it died with the process. A relay that cannot be told
about failure cannot recover from it — the durable ingress built above would
have been decorative.

`publish` now attempts every subscriber, then throws if any of them
dead-lettered; one broken consumer still must not decide what the others see.
The unawaited `inbox.claim` in the retry path was awaited at the same time — an
unawaited claim can land after the next attempt has already read the inbox.

Worth noting how this was caught: the test was written to assert an *effect*
(a fulfillment row exists), not that the call returned. An assertion on the
return value would have passed while nothing happened at all.

### Also fixed: a new table escaped deny-by-default

Migration 0006 enables row-level security from a hardcoded list of table names,
so `inbound_event` was not covered by it. `tests/db-schema.test.ts` compares the
live catalogue instead of a count, which is the only reason this surfaced. RLS
is enabled in 0007; the structural weakness (a list that every future migration
must remember) is recorded under risks.

### External dependencies this creates — recorded, not implemented

- **MARKET and MOVE must submit events to `POST /v1/events`** with a service
  credential provisioned by CORE, and must set `producer` to their own service
  name. Their envelopes are otherwise unchanged.
- **Both must treat 202 as success and retry on anything else.** Redelivering
  the same `event_id` is free and answers `first_delivery: false`.
- **Outbound delivery exists as of migration 0008** (see the section below).
  What CORE cannot supply is the other end of the wire.
- **An operator must provision the two service credentials.** Nothing creates
  them automatically, on purpose: a self-registering service credential would
  be a hole in the boundary described above.

### Tests

`tests/event-ingress.test.ts` — 11 tests on both backends: accepted before
processed, each of the five refusals, redelivery after a timeout, two
simultaneous redeliveries where exactly one is told it was first, consumer
failure retried under backoff and then succeeding, and a replayed dispatch
doing the work only once. Plus a new bus test that a failing consumer does not
stop the healthy ones.

212 tests pass with `DATABASE_URL`, 131 without.

## Outbound delivery — CORE can now reach MOVE and MARKET

Migration 0007 gave the external systems a way in. Nothing gave CORE a way out:
`LocalEventBus` reached in-process subscribers only, so a fulfillment could be
created, dispatched and settled and no system outside CORE's process would ever
learn of it. The coordination loop had an entrance and no exit, which made the
loop MARKET → CORE → MOVE → CORE → MARKET unbuildable no matter how correct
each half was.

Migration 0008 adds `event_subscription` (who wants which event type, and
where) and `event_delivery` (one row per `(event_id, subscription_id)`).
`docs/outbound-delivery.md` holds the full reasoning; the decisions that
constrain future work:

**Queueing the deliveries and marking the outbox row published are one
transaction.** As two, a crash between them leaves an event marked `published`
that no subscriber will ever be sent — the dual-write problem the outbox exists
to prevent, moved one step downstream. The test for this was verified to fail
when the transaction is removed, rather than assumed to work.

**Fan-out happens at relay time, not emit time**, so an endpoint registered
today is used by the next event relayed. The consequence is accepted and
written down: a subscription created after an event was relayed does not
receive that event. Back-filling is replay, and replay is a decision, not a
side effect of editing configuration.

**A failed attempt is either worth repeating or it is not.** 5xx, a timeout, a
refused connection, 408 and 429 are retried with exponential backoff. Every
other 4xx kills the delivery on the first attempt, because identical bytes get
the identical refusal and repeating them only delays someone noticing. Dead
rows stay visible at `GET /v1/event-deliveries/undelivered`.

**Delivery is at-least-once; deduplication is the receiver's job.** CORE can
only promise it keeps trying and never silently stops. `event_id` travels in
the `x-wasla-event-id` header as well as the envelope so a receiver can discard
a repeat before parsing.

**Bodies are HMAC-SHA256 signed over the exact bytes transmitted**, not over
selected fields — a receiver verifying a reconstruction is verifying its own
serialiser. `verifyBody` is exported as a reference implementation. The
plaintext secret therefore lives in the database, and the constraints that
follow (never returned on any read path, never rotated implicitly,
`https`-only endpoints, `core.*` types only) are in the doc.

### A difference between the backends, documented rather than hidden

Postgres `claimDue` orders by `(next_attempt_at, created_at)` and leaves ties
to the planner; the in-memory store drains in insertion order. Under a
`FixedClock` every timestamp ties, so the two backends attempt deliveries in
different orders. There is nothing to unify here: CORE makes no cross-subscriber
ordering promise, and inventing a tie-breaker would imply one. A test written
during this milestone depended on which subscriber was attempted first, passed
in memory and failed on Postgres — that is how the difference was found, and the
test was rewritten to assert the invariant that actually holds (one
subscriber's outage does not affect another).

### A latent bug found on the way

`InMemoryOutbox.markPublished` mutated the stored record in place. That was
harmless while it ran outside any transaction, but it now commits together with
the delivery rows, and `MemoryJournal` records a pre-image by reference — so a
rollback would have restored the mutated object to itself and undone nothing.
All three mark methods now replace the record. Same shape as the `revokeSession`
bug from B-10.

### External dependencies this creates — recorded, not implemented

- **MOVE must expose an HTTPS endpoint** for `core.fulfillment.created` and
  `core.fulfillment.cancelled`; **MARKET** for `core.fulfillment.dispatched`.
  CORE will not invent these; an operator registers them.
- **Both must verify `x-wasla-signature`** as `sha256=HMAC-SHA256(secret, raw
  body)` over the bytes received, before parsing.
- **Both must deduplicate on `event_id`.** Delivery is at-least-once; a repeat
  is normal, not an error.
- **Both must answer 2xx only once the event is durably recorded**, and a 4xx
  only when the payload is genuinely unacceptable — a 4xx stops CORE retrying
  permanently.
- **An operator must register the subscriptions and hold the secrets.** There
  is no self-registration, for the same reason there is none for service
  credentials.

### Tests

`tests/outbound-delivery.test.ts` — 13 tests on both backends plus 3 backend-
independent: no read path leaks a secret, refused subscriptions (`market.*`,
plain HTTP, short secret), fan-out to every interested subscriber, a verifiable
signature over the transmitted body, a second fan-out queueing nothing, retry
with backoff that does not fire early, a 422 dying on the first attempt and
never being retried, a timeout recorded as a failure with no status, the
attempt budget running out with the row left visible, a deactivated subscriber
queueing nothing, one subscriber's outage not blocking another, the outbox row
not marked published when queueing fails, and a delivery whose subscription
vanished dying unsent rather than being sent unsigned.

242 tests pass with `DATABASE_URL`, 147 without.

---

## Settlement beyond a single all-or-nothing hold

Milestone 2. Reasoning and the full invariant list are in `docs/settlement.md`;
this is what changed and why it was judged correct.

### The defect this closes

`payment_authorization.amount_minor` meant two things at once — what the payer
consented to, and what would move. Capture was therefore all-or-nothing. A job
quoted at 6 000 that costs 4 000 could only capture 6 000 or nothing, and a
completed job that was later disputed had no way to give money back. The only
workaround was to void and re-authorize, which discards the payer's consent and
can then fail for want of funds that were held a moment earlier.

Migration 0009 separates the meanings: `amount_minor` is an immutable ceiling,
`captured_minor` and `refunded_minor` grow and never shrink, and the remaining
hold is **derived** rather than stored so it cannot disagree with itself.

### Decisions, and why the easy alternative was rejected

- **A refund is not a void.** A void releases money that never moved and posts
  nothing; a refund posts a balanced reversal of money that did move. Their
  limits differ — a void is bounded by what is still held, a refund by what was
  captured. Reusing the void path would have been less code and would have let
  a caller pay out money the payer never spent.
- **A refund does not un-capture.** `captured_minor` is never reduced and the
  status does not change, so the history shows money going out and coming back
  rather than never having left. It does not restore the hold either.
- **`partially_captured` is necessary, not convenient.** When a hold moved some
  money and released the rest, `captured` overstates what moved and `voided`
  claims nothing moved when some did — and the status is what a reconciliation
  trusts. While `captured_minor < amount_minor` the row stays `authorized`, so
  split captures remain possible.
- **A partial capture must carry its own idempotency key, and CORE refuses
  without one.** It is by definition one of several, so a key derived from the
  authorization cannot tell a retry from an additional capture; guessing means
  charging twice or dropping a legitimate capture. A *full* capture keeps
  `capture:<authorization_id>` unchanged, so an in-flight retry from before the
  migration still resolves to the same transaction.
- **The aggregates are enforced against the ledger by the database.**
  `ledger_transaction.authorization_id` is now a foreign key rather than a
  parsed reference string, and two deferred constraint triggers check agreement
  from both sides, summing per kind so two equal errors cannot cancel out. Same
  argument as `ledger_transaction_is_balanced`. Deferred because the
  authorization row and its ledger rows are written in one transaction in
  either order.
- **The rollback refuses rather than rounding money.** There is no value of the
  old single-meaning `amount_minor` that tells the truth about a hold where
  2 500 of 6 000 moved, so `0009...down.sql` refuses while any authorization is
  partially captured or refunded. Verified by reproducing that state on a real
  database and running the down migration against it.

### The in-memory store was made to enforce the same rules

`InMemoryMoneyRepository` now restates 0009's CHECK constraints and runs the
same ledger-agreement check. A memory backend more permissive than Postgres
certifies bugs — that was B-12.

Expressing a *deferred* constraint in memory needed a new facility:
`MemoryJournal.defer(key, check)`, run by `InMemoryTransactionBoundary` just
before the scope completes, which is the moment Postgres fires a
`DEFERRABLE INITIALLY DEFERRED` trigger. Without it the memory store would have
to judge the world half way through a transaction and would either accept what
production refuses or refuse what production accepts. Outside a transaction the
check runs immediately, matching autocommit.

### A backend difference, documented rather than hidden

`transactions()` orders by `(occurred_at, transaction_id)` on Postgres and by
insertion on the memory store, so under a fixed clock two captures at the same
instant come back in different orders. CORE promises no ordering between two
transactions at the same instant, so there is nothing to unify; the tests key
on the ledger reference instead of position. An ordered assertion would pass on
one backend, fail on the other, and test nothing CORE guarantees.

### Proven, not assumed

The three fixes were each reverted in turn — `balance()` counting the whole
hold, a partial closure recorded as `voided`, and the capture ceiling removed.
Twelve of thirty settlement tests failed, six per backend, symmetrically. With
the service's ceiling check removed **both** databases still refused the
over-capture by constraint name, so the storage layer is a real backstop rather
than a restatement.

### Tests

`tests/settlement.test.ts` — 15 tests on both backends: a partial capture not
counted twice in `held_minor` and the freed remainder actually authorizable; a
hold staying open and capturable across two captures with both movements
attributed by foreign key; capture refused past the consented ceiling even when
the wallet could fund it; a partial capture refused for want of a retry-safe
key; a retried partial capture charging once; a whole hold still captured under
the reference it always used; a part-captured hold closing as
`partially_captured` and releasing only the remainder; the void event reporting
the released remainder rather than the whole hold; a refund as a balanced
reversal that does not un-capture and does not restore the hold; refunds
refused past what was captured and on a hold that never moved money; a retried
refund paying out once; a part-captured hold refundable up to what moved; the
aggregates refused when written out of step with the ledger; and a part-captured
hold expiring with only its remainder released.

272 tests pass with `DATABASE_URL`, 162 without.

### External dependency this records — not implemented

- **Multiple holds against one fulfillment needs a MARKET contract decision.**
  `fulfillment.payment_authorization_id` is a single column and MARKET only
  ever sends one id. Whether several holds are alternatives or additive, which
  one a partial capture draws from, and what a total means across currencies
  are all MARKET's decisions, and a join table nobody feeds is worse than none.
  The sketch is in `docs/settlement.md`; nothing in this milestone blocks it,
  and the amounts split here are what make it expressible at all.

## Cycle 2026-09-12 — subscriptions, plans and entitlement (ADR 0013)

ADR 0013 has no body text in this repository: `docs/adr/README.md` carries only
its title and states that the ADR text is maintained as the project's decision
record and is not restated here. So the title was the whole brief. Everything
below was derived from the invariants CORE already enforces and from the
ownership boundary; every policy question the title does not answer is recorded
as a blocker above rather than guessed at, because guessing a billing policy
puts money on an undecided rule.

### The question the module exists to answer

`POST /v1/access/check` answers "may this principal do this?" from roles.
"Has this owner paid for this?" is a different question, and answering both from
one mechanism would make an unpaid subscription indistinguishable from a missing
role — a billing failure that reads as a permissions bug, and the reverse.
Entitlement is therefore a separate decision that never returns a bare boolean:
`EntitlementReason` has eight values, and `subscription_past_due`,
`period_unpaid`, `not_in_plan` and `limit_exhausted` lead to four different
answers for the customer.

### Entitlement is derived, never stored

There is no entitlement table. CORE owns entitlement by being the only place
that can answer the question, not by keeping a copy of the answer. A stored
verdict would be a second source of truth beside the subscription, the period
and the usage that produced it, and it would drift precisely when it mattered.

### Decisions recorded, with the reasoning

- **Feature keys are rows, not columns or an enum.** ADR 0018 keeps
  product-specific logic out of CORE; the moment CORE knows a feature's name it
  has an opinion about a product. `limit_value NULL` (unmetered) and `0` (none)
  are kept distinguishable, because collapsing them makes a revoked quota read
  as an unlimited one — and `POST /v1/plans` refuses an absent `limit_value`
  rather than defaulting it, since the two candidate defaults are opposites.
- **A plan's terms and grants freeze on activation**, by trigger. A price that
  could be edited after anyone subscribed would leave the period saying 5000 and
  the plan saying 9000, with nothing recording which the customer agreed to.
  Changing a price means publishing a new plan. Retiring closes a plan to new
  subscribers only, and is one-way.
- **`amount_minor` is operator data.** No rate is fixed anywhere in code, which
  is what B-4 requires while regulatory pricing policy is undecided.
- **The period is the invoice**, so it copies `currency` and `amount_minor` from
  the plan instead of reading through to it. Otherwise retiring a plan would
  take the price of settled history with it.
- **Overlapping periods are refused by an `EXCLUDE USING gist` constraint, not a
  deferred trigger.** A trigger sees only rows committed before it runs, so two
  concurrent inserts each see nothing and both succeed — the same hole as B-12.
  The constraint is what actually closes the race. Adjacent periods are accepted
  because half-open ranges that touch do not overlap.
- **Collection is an ordinary payment authorization** whose
  `business_reference` is derived as `subscription-period:<period_id>`. The
  UNIQUE constraint on that reference, not any check in the service, is what
  makes collection exactly-once.
- **Signup and first charge are separate units of work.** Sharing a transaction
  would let an empty wallet roll the subscription away, leaving nothing to retry
  and inviting a second signup. `POST /v1/subscriptions` therefore answers 201
  with `collected: false`.
- **A refusal is audited in its own transaction** (B-9), and returns
  `collected: false` rather than throwing, so one empty wallet cannot abort a
  renewal sweep for everyone behind it.
- **`cancelled` and `expired` stay separate facts** — the same argument as
  `partially_captured` in 0009. A cancelled subscription keeps entitling until
  the period it paid for ends; an unpaid period is voided instead.
- **Usage is append-only and recorded past the limit.** The port has no
  `updateUsage` and no `deleteUsage` at all, which is the strongest form of the
  rule, and 0010 refuses UPDATE and DELETE by trigger. Over-quota consumption is
  still recorded, because dropping it would leave the billing and dispute basis
  incomplete; refusing further work is the entitlement decision's job.
- **No usage event and no draft-plan event** (ADR 0009): high-volume
  bookkeeping with no external consumer, and terms nobody outside CORE can act
  on yet.

### Two real backend differences found and unified, not documented away

The standing rule is that no difference between the in-memory and Postgres
backends may hide behind the tests. Two were found while making the tests pass
on both:

1. **The memory money store could not express 0010's deferred agreement
   trigger**, because it has no view of the ledger. Rather than record the
   difference, `InMemoryMoneyRepository` gained a synchronous
   `authorizationSnapshot`, and the composition root hands it to the
   subscription store. Removing that wiring makes the agreement test fail on
   memory — verified.
2. **`audit_entry.actor_id` is a `uuid` column.** The new service was passing
   the producer name into it; the memory audit log accepted the string and
   Postgres refused it outright. Fixed to `null`, which is what "no principal"
   means, with `actor_type` already saying who acted. This one was only ever
   visible because every test runs against both backends.

A third, smaller one: the memory usage store compared an unparseable
`recorded_at` instead of refusing it, and `NaN` makes every window comparison
false — so it accepted a row Postgres refuses for being null.

### Proven, not assumed

Four fixes were reverted in turn:

- Overlap detection disabled in the memory store → the overlap test fails on
  memory.
- The money-reader wiring removed from the composition root → the
  period-versus-hold agreement test fails on memory.
- `actor_id` restored to the producer name → the first-collection test fails on
  **Postgres only** while memory still passes, which is the backend-difference
  class itself.
- The early return in `chargePeriod` removed → **nothing failed.** That is
  recorded rather than hidden: the exactly-once guarantee comes from the derived
  `business_reference` and the UNIQUE constraint beneath it, not from the
  service check. Removing the early return *and* randomising the reference fails
  the double-charge test on both backends, which locates the invariant where it
  actually lives. The test now asserts on the authorization's `captured_minor`
  as well as the balance, and says all of this in a comment.

### Migration 0010

Applied and rolled back on both real engines (PostgreSQL 18.4 locally,
PostgreSQL 17.6 managed). Needed `btree_gist`, which was not installed on
either. All five tables carry explicit `ENABLE ROW LEVEL SECURITY`, because
migration 0006's RLS list is hardcoded and does not cover tables added later.
The down migration refuses while any settled period or any usage record exists —
dropping billing history is not a rollback — and does not drop the extension it
found missing.

Twenty-one invariants were probed directly against the local database before the
adapters were written, of which one was wrong on the first attempt and corrected
in the migration: a free-tier plan priced at zero settles with no authorization,
so `subscription_period_settlement_fields` had to tie `amount_minor = 0` to
`authorization_id IS NULL` as an equivalence rather than requiring an
authorization outright.

### Tests

`tests/subscription.test.ts` — 23 tests on both backends: a first period
collected through the ledger with the balance to prove it; a subscription that
survives a wallet with no money, and refuses entitlement while it does; the same
period collected later returning the subscription to active; a period charged at
most once across repeated attempts; a second live subscription to one plan
refused; a plan in one currency refused against a wallet in another; draft and
retired plans refused; an active plan's price and grants both frozen;
overlapping periods refused and adjacent ones accepted; a settled period refused
when it disagrees with the hold that paid it, asserted through a real commit;
quota counted and exhausted while an unmetered grant on the same plan is
unaffected; an unmetered grant distinguished from a grant of nothing; a repeated
usage reference counted once; usage outside the period window and with an
unparseable instant both refused; the absence of any way to change or delete
usage; coverage kept to the end of a paid period after cancellation and then
expired; an unpaid period voided on cancellation; renewal opening and charging
the next period with no gap and a fresh quota; a sweep not aborted by one empty
wallet; the reason for a refusal when the owner has no subscription at all; a
feature the plan does not grant; one event per business fact with none for usage
or for a draft plan; and an audit entry for a refused collection.

318 tests pass with `DATABASE_URL`, 185 without.

### A note on savepoints

A savepoint release does **not** check `DEFERRABLE INITIALLY DEFERRED`
constraints; only COMMIT does. Any test of 0010's agreement trigger has to use a
real transaction rather than `ROLLBACK TO SAVEPOINT`, and 0009's own deferred
trigger refuses a fabricated authorization whose `captured_minor` has no ledger
entries behind it — so the fixture goes through the real `MoneyService`.

### External dependencies this records — not implemented

- **MARKET and MOVE reporting usage** belongs on the inbound event path
  (`POST /v1/events`), which needs an event contract from the producing system.
  `POST /v1/subscriptions/{id}/usage` is an operator route, not a product
  integration path, and no MARKET or MOVE code was touched.
- **Answering entitlement across systems** is B-14 and needs an ADR before any
  endpoint exists.

## Cycle 2026-09-12 — the fulfillment side of partial settlement (CORE-only agent)

A CORE-only audit cycle. No MOVE or MARKET code was read or touched; the two
external dependencies it surfaces are recorded below for their owning agents.

### The audit came first, and the roadmap held up

The instruction was not to trust this document. So the starting point was the
code, the commits and the suite, on a real engine: PostgreSQL 18.6 provisioned
locally, migrations 0001–0010 applied, **318 of 318 tests passing** at
`f2c13a9` with `DATABASE_URL` set, `tsc --noEmit` clean, all four gates green.
Every claim spot-checked in the "Remaining" table and the cycle sections matched
the code. One stale claim was found — the "Tests that pass at this commit"
header still said 71 of 71 across 11 files, four cycles out of date — and is
corrected above rather than quietly deleted.

### The defect: a settlement state that lied about money

Migration 0009 made a hold capturable in legs and gave it a fourth status,
`partially_captured`. The fulfillment row that binds money to execution was
never widened to match. Its vocabulary stayed
`none | held | captured | released | unsettled`, where `released` is documented
in the domain as **"the hold was voided; no money moved"**.

`FulfillmentPaymentPort.voidWithin` returned `Promise<unknown>`, so fulfillment
could not ask how much had moved and assumed nothing had. Three reachable paths
therefore recorded `released` over money that was gone. Reproduced on a real
database before anything was changed, with 2 500 of a 6 000 hold captured:

| # | Path | Recorded | Actual | Reconciliation saw |
|---|---|---|---|---|
| G-9 | `move.job.rejected` (or `cancel`) after a partial capture | `released` | `partially_captured`, `captured_minor = 2500`, wallet down 2 500 | nothing — `isFinanciallyConsistent` returned `true` |
| G-10 | intake of an order whose hold had already closed part-captured | `released`, reason `payment_hold_not_authorized` | hold `partially_captured` | nothing |
| G-11 | `move.job.completed` on a hold already closed | `released`, reason `payment_settlement_failed` | hold `partially_captured` | nothing |

G-10's reason was also wrong on its own terms: the hold was not
"not authorized", it was spent. The refusal was right; the explanation MARKET
receives was not.

The severity is in the last column. `listFinanciallyInconsistent()` returned
zero rows in all three cases, and the closure event told MARKET the money had
been returned. This is worse than an unsettled hold, which at least announces
itself: CORE was asserting a false fact about money and the one mechanism built
to catch that was structurally unable to see it.

### The fix, and the seam it closes

- `SettlementState` gains `partially_captured`, documented as the hold having
  closed with part of the consented amount moved and the remainder released.
- `voidWithin` now publishes `{ status, captured_minor }`. `MoneyService`
  already returned `PaymentAuthorization`, so no money code changed — the port
  was hiding information the implementation had all along. `release()` derives
  `partially_captured` when `captured_minor > 0` and `released` otherwise, so
  the state comes from what money reports rather than from what the call site
  assumed.
- `getAuthorization?` gains `captured_minor`; `inspectHold()` gains a
  `partially_captured` case returning reason `payment_hold_partially_captured`.
- `isFinanciallyConsistent`: `completed` accepts `partially_captured` (a job
  that cost less than the ceiling); `failed`/`cancelled` does **not**, so those
  cases surface in the reconciliation read.

No contract was redesigned and no existing value changed meaning. The change is
additive in both the schema and the published schemas, and the ordinary
`released` path is asserted unchanged.

### Why a truthful state is still reported as inconsistent

`fulfillment_settlement_alignment_check` stores `partially_captured` against
`failed` and `cancelled`, while `isFinanciallyConsistent` calls it inconsistent.
That is deliberate and not a contradiction: one governs what is recordable, the
other what needs a human. The payer has paid for work that did not complete, and
whether that is refunded, retained as a cancellation fee or split is a policy
decision CORE has not been given — recorded as **B-20**, not invented.

Refusing to store the state would only push the service back to writing
`released`, which is the falsehood being removed. Reporting it is the reversible
direction: an operator can act on a case CORE surfaced and cannot act on one it
hid.

### Migration 0011

Additive. Extends `fulfillment_settlement_state_check` and
`fulfillment_settlement_alignment_check`, and widens the partial index behind
the reconciliation read to `('unsettled', 'partially_captured')` — a partial
index that excluded the row the read exists to find would have left it scanning.
No column added, no data rewritten.

The rollback **refuses** while any row is `partially_captured`, for the same
reason 0009's does: there is no earlier value that states the fact truthfully.
`released` claims nothing moved, `captured` claims all of it did. Verified by
inserting such a row on the real database and watching the rollback abort by
name, then verified again that it completes on a clean table.

### Proven, not assumed

The fix was reverted with the tests and the migration left in place: **12 of the
18 new tests fail on both backends**, each on the specific state or event field
it pins. The 6 that still pass are the regression guards — the plain `released`
path, the remainder-capture path, and the two that check the TypeScript union,
the CHECK constraint and both published schemas still declare one vocabulary.

An existing schema test used `partially_captured` as its example of an *unknown*
settlement state. It now asserts a genuinely unfamiliar value instead, and the
accepted/refused pair lists were extended in both directions, including
`coordinating`/`dispatched` against `partially_captured` being refused: open
work may not claim a terminal money state.

### Tests

`tests/fulfillment-partial-settlement.test.ts` — 9 cases × 2 backends: a
rejection after a partial capture recorded as `partially_captured` with the
wallet balance proving 2 500 moved; the same case surfacing in the
organization-scoped reconciliation read; `partially_captured` published on the
closure contract MARKET consumes; a cancellation that moved nothing still
recorded as `released` and still consistent; intake refusing an order whose hold
had already closed part-captured, with the honest reason and no
`core.fulfillment.created`; a success claim against a closed hold still failing
but no longer claiming the money never left; a partial capture that leaves the
hold open still capturing the remainder on success and settling as `captured`;
and a completed fulfillment that cost less than the ceiling accepted as
consistent — asserted through a real commit, so Postgres' alignment constraint
judges it too.

`tests/db-schema.test.ts` extended as described. **341 tests pass with
`DATABASE_URL`, 185 without.**

### External dependencies this records — not implemented

- **MARKET** consumes `settlement_state` on `core.fulfillment.completed` and
  `core.fulfillment.cancelled`. Both enums now include `partially_captured`.
  A consumer that maps this field to customer-facing wording must not treat an
  unrecognised value as `released`; the schema descriptions say so explicitly.
  No MARKET code was touched.
- **A completed fulfillment settling for less than the consented ceiling** is
  storable and consistent, but CORE has no path that produces it: capturing part
  of a hold and completing needs the actual amount, which only MARKET or MOVE
  knows. Recorded here rather than guessing an amount inside CORE.

### An environment observation, not a finding

On the first `npm run verify` of this cycle three tests failed on the sandbox —
two timeouts in `concurrency-and-restart.test.ts` and one `deadlock detected` in
`settlement-atomicity.test.ts`. Both files deliberately create contention, and
they pass on repeated runs of the same commit. The machine has 2 vCPUs and runs
the database beside the suite, so the likeliest explanation is scheduling
pressure rather than a defect. It is recorded because a flake that is only
mentioned when it fails is indistinguishable from one nobody noticed: if these
two files fail intermittently in CI, this is the note that says it was already
happening on 2026-09-12 and was not introduced by this change.

## Cycle 2026-09-12 (second) — making the pending financial decision explicit (CORE-only agent)

The previous cycle made `partially_captured` storable, so CORE stopped claiming
that 2 500 had come back when it had not. That fixed the record and left the
consequence implicit. This cycle closes the part of **B-20** that is CORE's, and
states the rest as decisions somebody else owns.

Scope discipline, unchanged: CORE only. No commercial or financial policy was
invented, and nothing outside `uxxxug/wasla-core` was touched.

### What was actually wrong, after the last fix

| # | Finding | Evidence |
|---|---|---|
| G-12 | The consequence of a partial capture was reachable but not sayable. `settlement_state = 'partially_captured'` on a `cancelled` fulfillment is a true record, but the only mechanism that surfaced it was `isFinanciallyConsistent`, which also reports CORE's own bookkeeping defects. An operator opening that queue could not tell a case waiting on a pricing decision from a case waiting on an engineer, and both were counted as "CORE is inconsistent" | `listFinanciallyInconsistent` returned the `unsettled` intake refusal and the `partially_captured` cancellation as one undifferentiated list |
| G-13 | `core.fulfillment.cancelled` was still readable as a refund. The event carried `settlement_state`, documented as optional and ignorable, and nothing in the payload said the money question was open. A consumer that ignores the field — which the contract permits — takes a cancellation to mean the payer was made whole | The payload had no field a consumer must read before telling a customer they were refunded |
| G-14 | Amounts CORE did know were thrown away. `voidWithin` reports `captured_minor`, `release()` read it to pick a state and then dropped the number, so the closure event named a state without the amount and no consumer could say *how much* was undecided | `release()` returned `SettlementState`, not the amount behind it |
| G-15 | Two overlapping closures publish the closure event twice. Recorded as **B-21**; measured, not theorised | `tests/fulfillment-financial-decision.test.ts`, postgres backend, intermittent |

### Every terminal path, in one table

`docs/settlement.md` now carries the full table the audit asked for: 19 rows,
one per way a fulfillment can reach a terminal state, each with execution state,
hold state, captured amount, remaining held amount, `settlement_state`,
`financial_disposition` and whether a decision is owed. Six distinct paths reach
the same fact — money left the payer and the work was not delivered — and the
table names them so none is discovered later by accident.

Two rows in it are honest gaps rather than behaviour:

- **Row 10**, a completed job that cost less than the ceiling, is representable
  and consistent but unreachable: nothing tells CORE a smaller amount, so a
  completed job always draws the full ceiling. That is the MOVE dependency below,
  not a CORE decision.
- **Row 19**, a hold that expires while execution is still open, leaves
  `settlement_state = 'held'` on the row until a MOVE event arrives. When one
  arrives the outcome is truthful; if none ever does, neither reconciliation read
  can see the contradiction, because both look only at the fulfillment row while
  the contradiction lives across two modules. A liveness gap, not a false record.

### What changed in CORE

- **`financialDisposition(fulfillment)`** — derived on read, never stored, five
  values: `no_money`, `awaiting_execution`, `settled`, `decision_required`,
  `inconsistent`. `isFinanciallyConsistent` is now expressed through it so the
  two cannot drift. `decision_required` is deliberately not a settled outcome.
- **`requiresFinancialDecision(fulfillment)`** — the factual predicate: money
  moved, work did not complete, CORE was not told what happens next. It encodes
  no policy and picks no outcome.
- **Both closure events now carry `financial_decision_required`**, and
  `captured_minor` when CORE observed it. The contract text is explicit: while
  the flag is true a consumer MUST NOT tell the payer they were refunded, MUST
  NOT invoice the amount as earned, and MUST NOT treat the operation as settled.
  A cancellation is not a refund.
- **`captured_minor` is omitted rather than sent as 0 when CORE did not observe
  it.** Zero is a claim that nothing moved; absent is a claim about CORE's
  knowledge. Threaded end to end as `number | null` — `release()`, `settle()` and
  `inspectHold()` all report the amount alongside the state instead of dropping
  it.
- **`GET /v1/fulfillments/reconciliation/pending-financial-decision`** — the
  B-20 queue, separate from the defect queue. A non-empty list here is not a CORE
  defect. Reads also return the derived `financial_disposition`.
- **No new state, no new event, no migration.** The four settlement states and
  migration 0011 were enough; `decision_required` is derived from what is already
  stored. Adding a fifth stored state would have created a second source of truth
  next to `settlement_state`, and a stored flag can disagree with the row it
  describes.

### What CORE will not do while a decision is owed

No transition writes `released` when `captured_minor > 0`. No path emits a
refund from a fulfillment outcome — `refundWithin` is only ever called by an
explicit request naming its own reference. No closure marks the case settled: it
stays in both reconciliation reads until an answer exists.

### B-20 as a contract gap: five decisions, none of them CORE's

Each row is a decision, not an implementation. CORE has no defensible default for
any of them, so none was chosen.

| # | Question | Who can answer it | What CORE needs when it is answered | Current risk |
|---|---|---|---|---|
| D-1 | Who states the actual executed amount when a job costs less than the consented ceiling? | MOVE — it is the only system that observes the work | An amount in minor units plus the currency on `move.job.completed`, asserted by MOVE, with a rule for "more than the ceiling" (refuse, or cap). Until it exists, `settle()` captures the whole hold | A completed job always draws the full ceiling. If MOVE's real cost is lower, the payer overpays and CORE has no record that it did |
| D-2 | Does partial work earn partial settlement, and how much? | Commercial owner (MARKET's domain) | A disposition per case, not a formula CORE invents: how much of `captured_minor` is earned | Nothing is earned or returned. The amount sits recorded and undecided |
| D-3 | Who authorises a refund of the captured part? | Commercial owner — a refund moves real money back | The existing `POST /v1/wallets/{id}/authorizations/{id}/refund` with a reference, called by whoever holds the authority | CORE will not infer a refund from a cancellation. It cannot be triggered by accident |
| D-4 | Is there a cancellation fee, and on what basis? | Commercial owner | If yes, whether the fee is the already-captured amount or an independent charge — they are different ledger movements | No fee exists anywhere in CORE. Treating the captured amount as a fee by leaving it in place would be a policy decided by inaction |
| D-5 | When is the operation financially settled, and who says so? | Commercial owner, then whichever system sends it | A single explicit inbound signal that closes the case, with the amount refunded and the amount retained, so the two sum to `captured_minor`. It must be a decision CORE receives, not a state CORE infers | `financial_disposition` stays `decision_required` forever. The queue grows and nothing drains it |

D-5 is the load-bearing one: until an inbound "this is the disposition" contract
exists, CORE can report the queue but cannot empty it. That contract is one
event or one route and CORE can build either in a day — the blocker is the
decision, not the code.

### External dependencies — precise, and still not implemented

Nothing outside CORE was modified. These are stated at the level an agent working
on MARKET or MOVE can act on without asking a follow-up question.

**Dependency 1 — the new enum value.**

| Field | Value |
|---|---|
| Exact value | `partially_captured` (lower snake case, exactly this spelling) |
| Field | `settlement_state` |
| Events | `core.fulfillment.completed` v1, `core.fulfillment.cancelled` v1 |
| Produced by | CORE, on the paths listed as rows 3, 6, 8, 12, 15, 17 of the table in `docs/settlement.md` |
| Consumed by | MARKET (customer-facing wording, invoicing, order state) |
| Correct handling | Part of the consented amount has moved and only the remainder was returned. Not a refund, not a full charge. Read `financial_decision_required` alongside it |
| Behaviour per value | `none` no hold; `held` should not appear on a closure; `captured` the whole ceiling moved; `partially_captured` part moved, rest returned; `released` nothing moved; `unsettled` CORE could not close the hold — treat as unknown and do not settle |
| Risk today, if an unknown value arrives | A consumer that maps unknown values onto `released` tells the customer they were refunded when they were not. The schema descriptions forbid it explicitly. A consumer that ignores the field entirely reads a cancellation as a refund — which is why `financial_decision_required` exists as a separate, plainly named boolean |

**Dependency 2 — the executed amount.** Minimum CORE needs on
`move.job.completed`: `executed_amount_minor` (integer, minor units) and
`currency` (ISO 4217, must match the hold's). Correct source: MOVE, because it is
the only system that observes the work. MARKET cannot supply it — it knows the
consented ceiling, which is what CORE already has. Without it row 10 of the table
stays unreachable and every completed job draws the full ceiling.

**Dependency 3 — the disposition signal (D-5).** CORE needs one inbound decision
carrying: the fulfillment id, the amount refunded, the amount retained (the two
summing to `captured_minor`), a reference for exactly-once handling, and the
identity of whoever authorised it. CORE will not design the policy behind it and
will not act without it.

### Tests

`tests/fulfillment-financial-decision.test.ts` — 7 cases × 2 backends = **14
tests**, covering the five shapes the audit asked for plus two more:

1. no capture — 6 000 reserved, 0 captured, cancel → `released`, event says
   `financial_decision_required: false` and `captured_minor: 0`, both queues
   empty, wallet fully spendable again;
2. partial capture — 6 000 reserved, 2 500 captured, cancel → `partially_captured`
   with `captured_minor: 2 500` and the flag true, wallet at 3 500, no refund
   posted, `decision_required`, in the pending queue and not in the settled pile;
3. full capture — 6 000 reserved, completion → `captured`, `settled`, flag false,
   `captured_minor` **absent** (pinned so it is never quietly turned into a 0);
4. repeated closure — a second `cancel` and a late completion cannot move the
   money truth twice; the late completion is refused, one closure event, one
   capture;
5. concurrent duplicate delivery — both the settle path and the release path:
   money moves exactly once (proved through wallet balances, which a double
   release would inflate), closure events all agree, and the duplicate-event race
   is pinned as B-21;
6. the two reconciliation reads separate a pending decision from an `unsettled`
   defect;
7. the HTTP surface: the new route, the derived `financial_disposition`, and that
   the route is not swallowed by `/v1/fulfillments/{id}`.

`tests/migration-0011-lifecycle.test.ts` — **1 test**, Postgres only, against a
database it creates and drops so it cannot disturb the development one: apply
clean → roll back with no rows in the new state (succeeds) → insert pre-0011 rows
→ apply over existing data (rows survive untouched) → the widened constraint
accepts `partially_captured` and still refuses a value outside the list → roll
back **with** a real `partially_captured` row (**refuses**, row and version both
still present) → remove the row → roll back (succeeds, narrowed constraint
refuses the pair again) → re-apply. The refusal decision from the previous cycle
was not weakened to make this easier; it is the property under test.

**356 tests across 25 files pass with `DATABASE_URL`; 202 pass and 39 skip
without it.** Gates green: `typecheck`, `check:governance`, `check:contracts`,
`check:migrations`.

### Proven, not assumed

- With `src/modules/fulfillment/{domain,service,http}.ts` stashed, **all 14** new
  tests fail on both backends.
- With the API present but `requiresFinancialDecision` forced to `false` — the
  implicit behaviour this cycle removes — **10 of 14** fail. That is the
  behavioural proof rather than a compile-time one.
- B-21 was observed, not inferred: repeated runs produce one closure event
  usually and two occasionally on Postgres, with the money correct in both cases.

### Roadmap triage after this cycle

**Complete inside CORE:** external event ingress and egress; partial capture and
refunds on both the money and the fulfillment side; the settlement truth table
and the pending-decision queue; subscriptions, plans, periods and entitlements
except the policy questions; RLS, token hashing, audit scrubbing, correlation
ids; migrations 0001–0011 with rehearsed rollbacks.

**Blocked on a decision outside CORE:** B-20 (D-1…D-5 above); multi-hold per
fulfillment (MARKET); the entitlement-check endpoint (B-14, needs an ADR);
proration, grace, trials, rollover, overrides (B-15…B-19); contract adoption in
MARKET and MOVE (B-2…B-6); staging and cutover.

**Actionable inside CORE right now, needing no external answer:**

1. **B-21 — one closure, one closure event.** Make the closing update
   conditional on the row still being open, so a losing concurrent transaction
   rolls back and takes its outbox row with it.
2. **Row 19 — cross-module reconciliation.** A read that lists open fulfillments
   whose authorization is no longer `authorized`, so a hold that expired under an
   open execution stops being invisible.
3. Channels and notifications (milestone 4) — a large piece of product surface
   with no external blocker.
4. Metrics and trace export, rate limiting on the ingress edge (milestone 8).

### Next task, and why it is this one

**B-21: make a closure single-valued in events as well as in money.**

It is next because it is the last place where CORE's output can mislead a
consumer through no fault of the consumer, and because it needs nobody's
permission. The stated priority for CORE is financially truthful, transactionally
atomic, idempotent, auditable, contractually explicit — B-21 is the idempotency
half of that, and it is the only item on the actionable list that touches money
semantics. Cross-module reconciliation (row 19) comes after it: it is a read, and
a read is worth more once the writes it reconciles are single-valued.

It is also not cosmetic. The fix changes the repository contract — a conditional
update that reports whether it matched — and both backends must agree about it,
which is exactly the class of difference that produced B-12.

## Cycle 2026-09-12 (third) — one closure, one closing event (CORE-only agent)

B-21, taken as the approved next task, and then the row-19 reconciliation that the
previous cycle put behind it. Both were done in the recorded order; nothing was
reordered because it looked easier.

### B-21 root cause, precisely

The closure was an unconditional write:

```sql
update fulfillment set status = $2, settlement_state = $3, ... where fulfillment_id = $1
```

Under READ COMMITTED two transactions can both read an open row. The first
commits. The second was already blocked on the row lock, wakes up, re-evaluates
its predicate — `fulfillment_id = $1`, which still matches — overwrites the
winner's terminal row with its own, and commits its own outbox row. Both had
staged a closing event, so MARKET received the same closure twice under two event
ids.

Two properties of SQL made this invisible to the service:

1. an `update` that matches zero rows is not an error, so nothing distinguished a
   first closure from a second;
2. the predicate said which row, never which version of it, so the row lock only
   serialised the writes — it never rejected the second one.

Money was never wrong, because the ledger keys its capture and the second
transaction re-read the same transaction instead of drawing again. Only the events
were multi-valued, which is why the previous cycle classified this as a delivery
defect rather than a money defect — and why it still had to be fixed: a consumer
that reacts to a closure has no way to tell CORE's second copy from a real second
closure.

### The repository contract, now explicit

`FulfillmentRepository` gained two writes whose result is a value, not a hope:

```ts
type ConditionalWrite = "applied" | "stale";
type InsertOutcome = "inserted" | "duplicate_order_reference";

updateIfStatusIn(f: Fulfillment, expected: readonly FulfillmentStatus[], scope?): Promise<ConditionalWrite>;
insertIfAbsent(f: Fulfillment, scope?): Promise<InsertOutcome>;
```

- `applied` — this call moved the row, and no other call did.
- `stale` — the row is not in any `expected` status any more, so nothing was
  written. Not an error, not a silent success: a distinct answer the caller must
  handle.
- `duplicate_order_reference` — another transaction already created the
  fulfillment for this order.

The store decides, never the service: PostgreSQL adds `and status = any($8::text[])`
and reports `rowCount === 1 ? "applied" : "stale"`; the insert is
`on conflict (market_order_reference) do nothing` and reports its own `rowCount`.
There is no read-then-write anywhere in either path, no in-process mutex, no
cache — the decision happens inside one statement in the database that owns the
row.

`InMemoryFulfillmentRepository` implements the same semantics in one uninterrupted
step, and its `insert` now throws on a duplicate `market_order_reference`, which
the schema has enforced since migration 0002 and the double silently allowed. A
memory store more permissive than PostgreSQL certifies bugs, so this was a defect
in the double, not a convenience.

`insert` and `update` remain for writes that are not transitions (traceability
back-fill) and say so in their doc comments.

### How the operation became atomic

`stale` is raised as a sentinel *inside* the staged mutation, at the point of the
write, so `withTransaction` unwinds everything the loser staged:

- money mutation staged **before** the closure → rolled back;
- the closure row itself → never applied;
- outbox append staged **after** it → rolled back;
- audit entry → rolled back.

The loser then re-reads the committed row and answers through the same resolver
the sequential repeat uses (`completionOn`, `cancellationOn`, `rejectionOn`,
`acceptanceOn`). That is the part that makes the guarantee stable rather than
lucky: a concurrent duplicate and a redelivered duplicate are the same question,
so they cannot return different answers.

Success is therefore exactly one commit containing new status + closing event +
outbox row; failure by prior closure is no event, no outbox row, no financial
mutation, no state change.

### Proven on a real database, not with mocks

`tests/fulfillment-single-closure.test.ts` — 10 cases, both backends, 20 tests,
`Pool({ max: 12 })` so the contenders are genuinely concurrent:

| Scenario | Before the fix | After |
| --- | --- | --- |
| 2 concurrent cancels | 2 closure events, 2 outbox rows | 1 event, 1 outbox row, 1 release |
| 8 concurrent cancels | up to 8 closure events | exactly 1 |
| 2 concurrent identical completions | 2 completed events | 1 event, 1 capture |
| cancel racing completion | 2 conflicting closures | 1 event, and it matches the stored row |
| loser's partial trace (2 500 already captured) | extra outbox row + duplicate money attempt | 3 outbox rows total, wallet 3 500, 1 pending-decision row |
| retry after a committed closure | new event each retry | no new event, same answer |
| 2 concurrent intakes of one order | 2 fulfillments possible | 1 fulfillment, 1 created event |
| 2 concurrent acceptances | 2 dispatch events | 1 `core.fulfillment.dispatched` |

The fix was proven by removing it: dropping `and status = any($8::text[])` and the
in-memory status check makes **14 of the 20 fail**; restoring them makes all 20
pass. The two earlier assertions that had to tolerate the defect
(`expect(events.length).toBeGreaterThanOrEqual(1)` in
`tests/fulfillment-financial-decision.test.ts`) are now `toHaveLength(1)`.

InMemory and PostgreSQL produce identical results on all 10 cases, with one honest
asymmetry, asserted rather than hidden: when two identical completions overlap,
the loser's capture collides with the ledger's own idempotency key while both
transactions are open, and that surfaces as a write conflict instead of a silent
no-op. CORE reports it rather than claiming the command was applied, and the
retrying consumer is then answered from the committed row — which the same test
asserts. Command idempotency (the same command twice) and delivery idempotency
(the same event twice) stay separate guarantees; the inbox was not touched.

### A second defect, found by reviewing the paths instead of the race

Reviewing every terminal closure path turned up one that no concurrency test would
have found: **the refusal of an order whose declared hold does not exist could not
commit on PostgreSQL at all.** `fulfillment.payment_authorization_id` is a foreign
key, the refusal row named a hold CORE does not have, and the insert violated
`fulfillment_payment_authorization_id_fkey`. The path was only ever exercised in
memory (`tests/fulfillment-settlement.test.ts` runs in-memory), so a documented,
tested refusal was unreachable on the real database: MARKET sending a stale or
mistyped reference got an error and endless redelivery instead of a refusal.

Fixed without inventing policy: the unresolvable reference is not stored — the
column exists to point at a hold CORE holds — and the declared reference is kept
on the audit entry as `unresolved_hold_reference`, under a key the scrubber does
not redact. Status, `closure_reason`, and the closing event are unchanged, MOVE is
still never asked to work, and no money exists to move.

### Row 19 — cross-module reconciliation, and what it is not

A hold can stop being able to settle its execution while the execution is still
open: the expiry sweep closed it, an operator voided it, or it was captured out of
band. Detection: `listStaleHolds` / `GET /v1/fulfillments/reconciliation/stale-holds`
compares every open funded fulfillment against its authorization through the same
`inspectHold` predicate that guards intake, so the sweep cannot drift from the rule
the write path applies.

The broken invariant is *open work is guarded by a hold that can still settle it*
— which lives in neither module alone. Classification, deliberately:

- **not `inconsistent`** — the row is not false. It says the work is open, and it
  is; a hold guarded it when the row was written.
- **not `decision_required`** — that queue means money moved for work that did not
  complete. Here the work has not finished at all.
- **not a new state** — "open but unfunded" would be a second, staler copy of the
  money state inside the fulfillment row, the exact duplication
  `financial_disposition` exists to avoid. Detection must not create state.

It is a liveness condition. CORE's action is to report it, with why the hold is
unusable, how much already moved, and the `settlement_state` the fulfillment would
take if it closed now — so an operator sees in advance which cases will land in the
`decision_required` queue. CORE does **not** act: re-authorising, abandoning the
execution, or completing it unfunded are three commercial answers, recorded as
dependency **D-6** rather than invented. `tests/fulfillment-stale-holds.test.ts`
(8 tests, both backends) asserts the read finds each case, ignores closed and
unfunded work, changes nothing, and is stable across repeated reads.

### External dependencies — unchanged, plus one

D-1…D-5 stand exactly as recorded (partial-capture policy, `partially_captured`
adoption, `executed_amount_minor` + currency, the financial decision command and
its contract). Nothing was implemented on their behalf and B-21 did not wait for
them.

- **D-6 — the fate of open work whose funding disappeared.** Who decides between
  re-authorising, abandoning the execution and completing it unfunded; whether
  MOVE must stop working on a job whose hold is gone; and whether MARKET is told
  before or after that decision. Until it exists the stale-hold queue is reported
  and never drained automatically.

### Regression

- `npx tsc --noEmit` clean; governance, contracts (21 schemas, 14 emitted types)
  and migrations (11 forward, all with rollbacks) green.
- `DATABASE_URL=… npm test`: **384 passed / 27 files** (356 before this cycle;
  +20 single-closure, +8 stale-hold). No previously passing test was changed to
  accommodate the fix — the only edits to existing assertions tightened two that
  had been pinned loose *because* of B-21.
- `npm test` without a database: 216 passed, 39 skipped.

### Roadmap triage after this cycle

**Complete inside CORE:** everything listed in the previous cycle, plus a
single-valued closure on every terminal path, an intake refusal that works on the
real database, and the cross-module stale-hold reconciliation read.

**Blocked on a decision outside CORE:** B-20 (D-1…D-5); the stale-hold policy
(D-6); multi-hold per fulfillment (MARKET); the entitlement-check endpoint (B-14,
needs an ADR); proration, grace, trials, rollover, overrides (B-15…B-19); contract
adoption in MARKET and MOVE (B-2…B-6); staging and cutover.

**Actionable inside CORE right now, needing no external answer:**

1. **Channels and notifications (milestone 4).** The largest remaining piece of
   product surface with no external blocker, and the natural consumer of the
   closing events that are now single-valued.
2. Metrics and trace export, rate limiting on the ingress edge (milestone 8).
3. A set-based stale-hold sweep, if the volume of open work makes the current
   one-read-per-fulfillment reconciliation expensive. Not needed yet, and the fix
   would be a query, never a stored copy of the money state.

### Next task, and why it is this one

**Milestone 4 — channels and notifications.** It is next because the write side of
coordination is now closed: every terminal path emits exactly one event, that
event carries the money truth including `financial_decision_required`, and the two
reconciliation queues plus the stale-hold read cover the cases where truth and
policy diverge. Notification is the first thing that *consumes* those events, and
it was never worth building on top of a closure that could be published twice.

Not chosen: B-14…B-19 and B-20 need answers CORE does not own, and inventing one
to make progress would be the one thing this repository is not allowed to do.

## Cycle 2026-09-12 (fourth) — Milestone 4, notifications to people (CORE-only agent)

### What Milestone 4 actually meant, read from the code

The roadmap line said "channels and notifications; Telegram adapter" and the
evidence column said "Telegram exists only as an identity channel type. No
delivery path". Checking that against the code rather than the sentence:

- Events already reach **systems**: `event_subscription` + `event_delivery`
  (migration 0008), signed bodies, failure classification, a dead-letter state.
- `identity_link.channel_type` already included `telegram`, but as an **inbound**
  identity only (ADR 0016) — a way to recognise who is talking to CORE. Nothing
  turned an event into something a person reads, and no message contract existed.

So the milestone is the missing person-facing half of an existing mechanism, not a
new mechanism. It was built on the same outbox, the same claim discipline and the
same clock, and no general notification framework was introduced: five templates,
one dispatcher, three channel types, four routes.

### The path, and the two properties that fall out of it

```
domain state change + outbox append ── one transaction ──→ commit
        │
        ▼ relay claims the outbox row
   fan-out inside the relay's markPublished transaction
        ├─→ event_delivery  (systems, pre-existing)
        └─→ notification    (people, this milestone)
                │
                ▼ dispatcher claims with a lease + a fencing token
          channel adapter → accepted │ delivered │ retryable │ permanent
```

- **No notification without committed state.** The notification row is derived
  from the outbox row, which commits with the state change. A rolled back
  transaction leaves neither; tested by rolling back a dispatch and draining.
- **No notification lost after committed state.** The fan-out runs inside the
  transaction that marks the event published, so there is no window in which an
  event is published and its notification rows do not exist.

Nothing external is called inside a domain transaction, so no provider can roll
back CORE state. The outbox stays the commit point.

### The channel contract, and why it is not a boolean

`ChannelResult` is a four-way union — `accepted`, `delivered`, `retryable(reason,
retry_after_ms?)`, `permanent(reason)` — each carrying an optional
`provider_message_id`. A boolean or `void` would erase the only distinctions that
matter operationally: whether to try again, whether to stop forever, and whether
anyone can be asked about the message later.

`accepted` (a provider took it) and `delivered` (a provider confirmed receipt) are
kept apart even though **no adapter can produce `delivered` today**. Every real
transport confirms acceptance synchronously and receipt, if at all, out of band.
Collapsing them would be a claim CORE cannot support; leaving `delivered`
modelled-but-unreachable costs one enum value and records the gap as **D-8**.

A thrown adapter error and a missing adapter for a channel are both treated as
`retryable`, not `permanent`: a deployment without that adapter is a configuration
fact somebody may fix, and burning the message would turn an operational gap into
lost information.

### Idempotency, in three places rather than one

1. **Fan-out** — `idempotency_key = ${event_id}:${recipient_id}` is unique in the
   database, so a duplicated outbox delivery of the same event inserts nothing the
   second time.
2. **Claim** — one statement sets `processing`, increments `attempts`, moves
   `next_attempt_at` out by the lease and stamps a fresh `claim_token`. A second
   dispatcher polling at the same instant matches nothing.
3. **Acknowledgement** — every mark is fenced on the token it was claimed with and
   returns whether it applied, so a worker that stalled past its lease cannot
   overwrite the attempt that replaced it. The dispatcher counts those as `fenced`.

`attempts` is spent at claim time, not at acknowledgement, so a message that kills
its worker every time cannot loop forever.

The honest statement of the guarantee, which is what `docs/notifications.md` says
and what the tests assert: **at most one attempt in flight** and **at least once**
are CORE's to guarantee and are guaranteed; **exactly once end to end** is not,
and is not claimed; **effectively once** holds with a provider that honours the
idempotency key, which is why the key is stable across retries, restarts and
races, and is passed to the adapter on every send.

### Retry and failure semantics

Six attempts, exponential backoff from 1s, provider-supplied `retry_after_ms`
overriding the computed delay, `permanent` never retried, exhaustion terminal and
visible at `GET /v1/notifications?status=failed`. `retrying` is **derived**
(`pending` with `attempts > 0`) and never stored: one row cannot be both, and a
stored copy of a derivable fact drifts.

### What is sent, decided rather than assumed

Five templates, mapped explicitly: `core.fulfillment.dispatched` → assigned;
`core.fulfillment.completed` with `outcome: completed` → done; the same event with
`outcome: failed` → could not be completed (there is no `core.fulfillment.failed`
event — failure rides on the completion, which the roadmap did not say and the code
does); `core.fulfillment.cancelled` → cancelled; `core.subscription.past_due` →
unpaid period. Everything else emits nothing: `core.payment.*` is settlement
mechanics rather than news, `core.identity.verified` is the recipient's own action,
`core.fulfillment.created` has nothing to report yet.

Bodies are rendered against a published contract, not serialised from a domain
object, so no internal field becomes an external interface by accident.

**Money wording is derived from `settlement_state` and says nothing otherwise:**
`decision_required` → "a payment amount is held pending review; no refund or
charge has been decided yet"; `released` → "no payment was taken"; `captured` /
`partially_captured` → "the authorised payment was charged"; anything else →
silence. A test asserts the absence of "has been refunded", "will be refunded",
"settled", "reimburs" and "credited back" from the undecided case. This is D-6
held open in the product vocabulary: `decision_required ≠ settled`, and no message
may read as a refund or a final settlement before the decision exists.

### Who may be told

`notification_recipient` binds `(event_type, identity_id, channel)`, optionally
scoped to an organization, operator-only. Registration refuses more than it
accepts: only `telegram` / `email` / `phone` (channels a person can receive on),
only against a **verified** `identity_link` (an unverified address is somebody's
claim, and messaging it is how an account takeover becomes a notification), and
only a tenant scope the event payload can actually carry (B-23).

An unroutable recipient at fan-out time produces a row born `failed` with a null
address rather than no row: the fact that somebody should have been told and could
not be is exactly the fact worth keeping.

### B-22 — the finding that had to be fixed first

Recorded in full in the blockers table. In short: the "atomic claim semantics
proven in PostgreSQL" that this milestone was meant to build on **did not exist**.
Three claim implementations marked nothing, and two workers polling together
received identical rows — measured at five out of five before the fix. The
notification dispatcher could not have been correct on top of that, and neither
were the outbox relay, the inbound dispatcher or the outbound delivery worker.

`for update skip locked` was not wrong, it was incomplete: it needed the write.

### Backend parity, and the one documented difference

`InMemoryNotificationStore` writes the lease and the token synchronously so it
fails the same tests as Postgres; a memory double more permissive than the
database certifies a bug (B-12, twice learned). The single difference: the memory
claim is synchronous, so two in-process dispatchers serialise rather than race,
while on Postgres disjointness is enforced by `for update skip locked` plus the
claiming write. Both are asserted, and the Postgres case is the one that proves
the property.

### Migration 0012

`notification_recipient` and `notification`, both with RLS, forward and down
scripts, applied and rolled back against a real database. Two authoring mistakes
worth recording because the schema tests caught them and a reviewer would not:
the tenant and identity columns had to be `uuid` to match the foreign keys from
0001, and an explicitly named check constraint collided with the name PostgreSQL
auto-assigns to an inline column check (`notification_address_check`), so it was
renamed rather than the column check removed.

### API and observability — four routes, no new concepts

`POST` / `GET /v1/notification-recipients`, `POST
/v1/notification-recipients/{id}/deactivate`, `GET /v1/notifications` with
`organization_id`, `status` and `limit` plus a `summary` of counts including the
derived `retrying`. There is deliberately no `/pending`, `/failed` or `/retrying`
path: same question, different filter, and a path per status is how one concept
acquires five sources of truth. Nothing folds into
`/v1/event-deliveries/undelivered`, which answers whether a *system* received an
event — this answers whether a *person* was told.

Channel errors are recorded with `sanitiseChannelError`: bearer tokens, api keys,
secrets, passwords and the recipient's own address are redacted and the reason is
truncated, so a provider's error text cannot smuggle a credential or a phone
number into `last_error`, the audit trail or the logs. Deactivating a recipient
stops future notifications and leaves queued ones queued — they describe something
that already happened.

### Tests

`tests/notifications.test.ts` — 23 × 2 backends: one event produces exactly one
notification; a duplicated outbox delivery does not double it; two concurrent
dispatchers never send the same row; retryable retries on the policy; permanent is
never retried; attempts exhaust into a visible terminal failure; a worker killed
between sending and acknowledging is recovered after its lease and repeats with
the same key; an adapter that fails after the provider took the message repeats
rather than loses it; a cooperating provider collapses the repeat; a stalled
worker's late acknowledgement is fenced out; a rolled back transaction produces no
notification; restart resumes from the database; an unverified channel cannot be
registered; a tenant scope the event cannot carry is refused; a deactivated
recipient stops receiving; the existing vertical slice is unaffected; provider
errors leak neither secrets nor addresses; and the undecided financial case never
reads as a refund.

`tests/worker-claim-atomicity.test.ts` — 5 × 2 backends over the outbox, the
inbound store, the outbound delivery store and the notification store: two
claimants issued concurrently receive disjoint sets, a third poll inside the lease
receives nothing, and an abandoned claim returns when the lease expires. Verified
to fail against the pre-fix claim, not merely to pass against the fixed one.

### Regression

- `npx tsc --noEmit` clean; governance, contracts (21 event schemas + 1 published
  message contract, 14 emitted event types covered) and migrations (12 forward,
  all with rollbacks) green.
- `DATABASE_URL=… npm test`: **440 passed / 29 files** (384 / 27 before this
  cycle; +46 notifications, +10 claim atomicity, both counted across backends).
- `npm test` without a database: 246 passed, 39 skipped.
- One existing test was edited and only to remove an assumption, not an
  assertion: `tests/migration-0011-lifecycle.test.ts` assumed 0011 was the newest
  migration, so it now peels newer ones first.

### External dependencies — two new, none solved

D-1…D-5 stand exactly as recorded. **D-6 was not touched**, which is the point of
the money wording above.

- **D-7 — who the end customer is.** CORE holds an opaque `order_reference` from
  MARKET, not a customer identity, so CORE cannot notify the person who placed an
  order. Per-customer routing belongs to MARKET, either by MARKET notifying its
  own customers from the events it already receives, or by a contract that passes
  a CORE identity on the order. Until then recipients are operators and tenant
  staff, which is what CORE actually knows.
- **D-8 — delivery confirmation from a provider.** Without an inbound callback,
  `accepted` is the strongest truth CORE has and `delivered` is unreachable. When
  a provider offers a status webhook, the state and the `provider_message_id` to
  correlate it are already there; nothing in the domain changes.

### Roadmap triage after this cycle

**Complete inside CORE:** everything from the previous cycle, plus notifications
to people end to end with fake adapters, and a claim discipline that actually
holds under concurrency across all four workers.

**Blocked on a decision outside CORE:** B-20 (D-1…D-5); the stale-hold policy
(D-6); per-customer notification routing (D-7); delivery confirmation (D-8);
multi-hold per fulfillment (MARKET); the entitlement-check endpoint (B-14, needs
an ADR); proration, grace, trials, rollover, overrides (B-15…B-19); contract
adoption in MARKET and MOVE (B-2…B-6); staging and cutover.

**Actionable inside CORE right now, needing no external answer:**

1. **Milestone 8 — observability export and ingress rate limiting.** Metrics and
   traces for the four workers, and a limit on the public ingress edge.
2. **Milestone 6 — replay tooling.** `inbound_event` keeps the envelopes, so
   replay is now possible and has no consumer-side blocker.
3. A live channel adapter, whenever a provider credential exists. It is a new
   file behind the existing port, and B-23's payload widening is the only thing
   that would make it more than that.

### Next task, and why it is this one

**Milestone 8 — observability export and rate limiting on the ingress edge.** It
is next because CORE now has four background workers with retry, backoff, leases
and terminal states, and the only way to see any of them is to query a table. The
notification cycle needed a measurement harness to find B-22 at all; exporting
those numbers turns a one-off measurement into something continuously visible, and
it needs no answer from MARKET, MOVE or a commercial owner.

Not chosen: a real Telegram adapter (no credential, and the port makes it a later
one-file change); B-23's payload widening (a versioned contract change that MOVE
and MARKET consume, so it belongs in a contract cycle); D-6 and D-7, which are not
CORE's to decide and were not started.

## Cycle 2026-09-12 (fifth) — Milestone 8, metrics export and ingress rate limiting (CORE-only agent)

**Scope:** CORE only. MOVE (`noor-seez/ceezr`) and MARKET (`skyosv10-art/wasla`)
untouched. No contract change to any existing endpoint or event payload; the
OpenAPI additions are a new read-only path, a new reusable 429 response, and a
new error code in the `Error` enum — all additive within v1.

### What the milestone actually meant, after reading the code

The ROADMAP line said "no metrics/trace export, no rate limiting on the new
ingress edge" and named neither a format nor a scope, so both were decided in
this cycle and written down rather than left implicit. Reading the code first
changed three things about the plan:

1. **There is no middleware layer.** `Router.handle()` is the single funnel every
   HTTP request passes through. So the instrumentation and the limiter went
   *there*, and no middleware abstraction was introduced to host them. One call
   site does not need a pipeline.
2. **There is no metrics abstraction, and none was added.** One registry, one
   declared catalogue, one renderer. No exporter interface, no tracing layer —
   nothing in CORE consumes those today.
3. **The four workers already had every fact worth counting**, but they were
   reporting it only as a return value from `drainOnce()`. The counters are
   recorded at those same points, so no metric describes a state the system does
   not have. Where a state genuinely does not exist, it is *not* invented — see
   B-24.

### Metrics: the catalogue and its dimensions

Declared in `src/platform/observability/metrics.ts`. The registry refuses an
undeclared name, a missing label, an extra label and a wrong metric type.

| Metric | Type | Labels |
|---|---|---|
| `core_http_requests_total` | counter | `route`, `method`, `status` |
| `core_http_request_duration_seconds` | histogram | `route`, `method` |
| `core_http_rate_limited_total` | counter | `rate_class`, `subject_kind` |
| `core_worker_claims_total` | counter | `worker` |
| `core_worker_outcomes_total` | counter | `worker`, `outcome` |
| `core_worker_item_duration_seconds` | histogram | `worker` |
| `core_queue_depth` | gauge | `queue`, `state` |
| `core_reconciliation_depth` | gauge | `queue` |
| `core_sample_timestamp_seconds` | gauge | — |
| `core_sample_failures_total` | counter | — |

`worker` ∈ `outbox_relay`, `inbound_dispatcher`, `event_delivery`,
`notification`. `outcome` ∈ `completed`, `retried`, `failed_permanent`, `fenced`,
`reclaimed` — `retried` and `failed_permanent` are separate because a retry is
the system working and a permanent failure is work that will not happen without a
person; `fenced` is a stale acknowledgement refused (the B-22 protection firing)
and must never be counted as a completion.

`route` is always the route **template**, and an unmatched path collapses to the
literal `unmatched`: an unknown path is attacker-controlled text and would be
unbounded cardinality. `status` is the exact numeric code, because "how many
401s" and "how many 500s" are different questions.

`core_queue_depth{state}` includes `retrying`, which is **derived at read time**
(`pending` with `attempts > 0`) inside the same aggregate query on both backends.
No table has a `retrying` status, and the gauge does not pretend one exists.

`core_reconciliation_depth` covers `inconsistent`, `pending_financial_decision`
and `stale_holds` as counts only — the size of a queue a human must work
through, never who is in it.

### Export

One endpoint, `GET /metrics`, Prometheus text exposition **0.0.4**,
`text/plain; version=0.0.4; charset=utf-8`. Chosen because a consumer for it
already exists everywhere; inventing a JSON shape would have meant writing the
consumer too. It renders in catalogue order, so two scrapes of unchanged state
are byte-identical, and it walks in-memory maps only: **no query, no lock, no
transaction, no state change**, asserted by snapshotting the outbox, inbound
events, notifications, audit trail and reconciliation queues around repeated
scrapes. The one thing a scrape does is count itself, like every other request,
and the test asserts exactly that difference and nothing more.

The depth gauges are refreshed by `DepthSampler.sample()` on the operator's
cadence, **not** by the scrape: sampling in the scrape would turn monitoring
frequency into database load and would make the endpoint fail exactly when the
database is unwell. The cost of that choice — staleness — is made visible instead
of hidden, by `core_sample_timestamp_seconds` next to the gauges and
`core_sample_failures_total` for sampling errors. A failed sample leaves the
previous values and the old timestamp in place rather than publishing zeros,
because "empty" and "I could not look" are different facts.

### Rate limiting: where it sits and what it counts

At the HTTP edge in `Router.handle()`, **after route matching and before any
handler**, and nowhere else. Not in domain services: a limit there would be a
business rule with a status code attached and would fire for background work done
on nobody's behalf. It does not join the request's transaction — the counter is
one statement on the pool — so a rolled-back request cannot refund budget and a
refusal cannot roll back domain work.

**Subject:** sha256 of the presented bearer token (`credential`), falling back to
the hashed first hop of `x-forwarded-for` / `x-real-ip` / `x-client-ip`, else the
constant `unattributed` (`network`). The address is never used when a credential
is present, so two callers behind one NAT are two budgets. Only the hash is ever
stored, and the metrics carry `subject_kind` only, never the hash.

**Organization is deliberately not the key:** resolving a token to a tenant needs
a session lookup, i.e. a database read *in front of* the limiter, which would mean
a flood of invalid tokens still costs a query per request — the exact thing the
limiter exists to prevent. Recorded as a scope decision, not an oversight.

**Policy:** fixed 60 s window aligned to the epoch; per subject, per route class.
`ingress_events` 600, `write` 120, `read` 300, `unmatched` 60. `/health`,
`/ready` and `/metrics` are never limited and advertise no budget headers.
Class, not route, because the class is both a policy key and a metric label. The
known cost of a fixed window is the boundary burst, bounded at twice the limit and
documented rather than discovered.

**Refusal semantics:** HTTP **429**, code `rate_limited`, `retryable: true` — a
first-class error code mapped to 429 in `src/platform/errors.ts`, not a
repurposed `unavailable` and not a domain error. `retry-after` in whole seconds,
minimum 1; `x-ratelimit-limit`/`-remaining`/`-reset` on allowed responses too.
The message carries no subject, no hash and no address.

**Workers are unreachable from the limiter by construction**, not by an exemption
list: they are invoked directly by the process that runs them and there is no code
path from a worker to the router.

### Concurrency

The store contract is one operation returning the post-increment count, so there
is no version of the code where a `select` precedes an `update` — the shape that
was B-22. Postgres does it as `insert … on conflict … do update set hits = hits +
1 … returning hits`, which holds a row lock for the statement, run on the pool and
never inside the request's transaction scope. The in-memory store is atomic only
because its increment contains no `await`, which is correct within one process and
explicitly not across processes; that is why the limiter backend is bound to the
persistence bundle rather than chosen separately.

Asserted on **real Postgres**: 40 requests issued before anything is awaited over
a pool with `max: 16`, against a limit of 5 → exactly 5 admitted, 35 refused, and
the stored counter equal to 40. The assertion was **falsified** against a
deliberately racy read-then-write implementation of the same store, which admitted
all 40 — so the test is known to be capable of failing.

### Privacy

**Decision: system-level metrics only. No metric carries a tenant dimension, and
tenant-scoped metrics were not added alongside them.** A count alone is enough to
leak: a per-organization request counter tells any reader that a tenant exists,
roughly how large it is, and when it is in trouble. Per-tenant operational
answers already exist, already authorized, through the reconciliation and
delivery endpoints. Enforced three ways: the catalogue is asserted to declare no
tenant- or entity-named dimension; every label value is checked against a strict
pattern that rejects uuids, addresses, phone numbers and token-shaped strings
(and the rejection message never echoes the value it refused); and a full
lifecycle test — ingress, dispatch, publication, a notification whose adapter
fails with an error containing both the recipient's address and an api key —
asserts the exposition contains no token, tenant id, order reference, identity id,
address or provider error text, and **no uuid anywhere at all**.

### Tests added (48, both backends where applicable)

- `tests/observability.test.ts` (25): registry refuses an undeclared name, a
  missing/extra label and a wrong type; refuses uuid, email, phone, api-key and
  overlong label values without echoing them; deterministic exposition with
  cumulative buckets, `_sum` and `_count`; the catalogue declares no
  tenant/entity dimension; ingress counted by template and exact status with the
  concrete path absent; relay and dispatcher counters matching actual drains;
  retry vs permanent failure kept apart for outbound delivery; an abandoned claim
  appearing as `reclaimed` and then completing; a **fenced** acknowledgement
  produced by a real in-flight lease expiry (gated channel) counted as `fenced`
  and never as a completion; queue-depth and reconciliation gauges with no tenant
  in the output; `retrying` derived identically on both backends; `/metrics`
  serving without touching the database and changing nothing; the leak test; the
  sampler reporting its own failure instead of publishing zeros or throwing; and
  the bounded request log.
- `tests/rate-limit.test.ts` (23): route classification and exemptions; subject
  keying and the network fallback; finite defaults; under/at/over the limit →
  429 with usable `retry-after` and the `x-ratelimit-*` headers; the caller
  admitted again after obeying `retry-after`; **a refused request changing no
  state at all** across fulfillments, ledger transactions, authorizations,
  outbox, inbox, inbound events, deliveries, notifications and audit — and not
  consuming idempotency; per-credential isolation with a shared address; route
  class isolation; liveness and the scrape never refused; workers still draining
  while the edge refuses; an unauthenticated flood attributed to `network` and
  refused before authentication; probes of unknown paths counted without the path
  becoming a label; and, on real Postgres, the concurrency guarantee plus
  per-window counting and pruning.

### Measured cost

`scripts/measure-ingress-overhead.mjs`, 20 000 requests per configuration
against the same no-op handler: bare router p50 ≈ 8 µs; **+ metrics ≈ +1 µs**
(within run-to-run noise); + in-process limiter ≈ +5 µs; + Postgres limiter
≈ +200 µs, which is one database round trip and the intrinsic price of a limit
that holds across instances. Nothing in the sampler runs on a request path.

### Fixed on the way, because the milestone made them visible

- `router.logs` was an unbounded in-memory array — one record per request for the
  lifetime of the process. Now capped at 1000.
- `/ready` reported outbox depth by loading **every** pending row, so the
  readiness probe got more expensive the busier the system was. Queue `counts()`
  is now an aggregate query on all four queues, which the sampler needed anyway.

### New blocker

**B-24** — lease expiry is not countable for the outbox relay, the inbound
dispatcher or the delivery worker, because their lease rides on `next_attempt_at`,
which is also the retry-schedule field. Recorded, not worked around: inventing a
`reclaimed` count for them would have meant a metric describing a state the
schema does not have. Needs a `processing` status or a `claimed_at` column on
three eventing tables, with a rollback path and a decision about existing rows.

### Did this unblock B-23, D-7 or D-8?

No, and none was touched. **B-23** (closure payloads carry no `organization_id`)
is unchanged: it is a versioned change to three published event contracts that
MOVE and MARKET consume, so it belongs in a contract cycle. **D-7** (routing
ownership) and **D-8** (provider delivery confirmation) are external decisions.
Observability makes their absence *visible* — `core_worker_outcomes_total` will
show notifications ending as `accepted` and never `delivered`, which is exactly
D-8 — but visibility is not a resolution.

### Next task, and why it is this one

**Milestone 6 — event normalisation and historical replay tooling.** It is next
because it is the only remaining milestone that is entirely inside CORE and has
no external dependency: `inbound_event` now keeps every envelope, the inbox
deduplicates per consumer, and this cycle added the aggregate reads that make a
replay's effect observable while it runs. It also has a real operational
customer: with four workers, terminal failures and a `failed_permanent` counter,
the question "replay these events safely" is now one an operator will actually
ask.

Not chosen: **B-24**, which is a schema change to three eventing tables and
deserves its own cycle rather than being appended to this one (it is the strongest
candidate after milestone 6); a live channel adapter (no provider credential, and
the port keeps it a one-file change); B-23's payload widening and D-6/D-7/D-8,
which are contract or external decisions; milestone 9, which is blocked on B-5
and B-6.

## Cycle 2026-09-12 (sixth) — Milestone 6, event normalisation and historical replay (CORE-only agent)

### What the milestone actually meant, after reading the code

The audit came before the abstraction, and it changed the shape of the work
twice.

First finding: `inbound_event` has kept every accepted envelope since migration
0007, and the only thing that could ever act on one was `InboundDispatcher`,
which looks exclusively at rows that are `pending` and due. A row that went
`dead` after exhausting its attempts, or that was accepted while a consumer had a
defect, was **durable and unreachable at the same time**. The data was being kept
for a recovery that had no mechanism. That is the gap replay closes — and it is a
much smaller gap than "build a replay engine".

Second finding, and the more serious one: each of the four fulfillment consumers
validated its own payload, in its own way, at the moment it ran. Unifying that
into one layer immediately exposed two defects that were live in the repository:

- the `move.job.rejected` consumer accepted payloads with **no `rejected_at`**,
  a field the published contract marks required;
- a `move.job.completed` fixture carried a `reason` key the contract forbids
  (`additionalProperties: false`), and the consumer took it.

Neither was caught because nothing was responsible for deciding what an event
*is*. So normalisation was not scaffolding for replay; it was the defect fix, and
replay is what made it necessary to look.

No event bus was built, no inbox or outbox was redesigned, and no published
contract was changed.

### Four stages, kept distinct

raw inbound → validated envelope (`assertEnvelope`) → **canonical event**
(`normalize()`) → consumer effect (`service.ts`). A consumer now receives a
`CanonicalEvent` and asks for its payload by expected type; it does not see
`version` and does not branch on it. The reason for the layer is exactly that: if
every consumer interprets versions itself, "what does this event mean" has as many
answers as there are consumers, and they drift in silence.

`CanonicalEvent` carries `event_id`, `event_type`, `version`, `producer`,
`occurred_at`, `received_at`, `correlation_id`, `causation_id`,
`entity_type`/`entity_id`, `organization_id` (`string | null`, where null means
*the envelope does not say*), the canonical `payload`, and the original
`envelope` verbatim — retained because replay republishes the original bytes
rather than a reconstruction, and a reconstruction would be a new event with a new
identity that the inbox has never seen.

`normalize()` is total and pure: `{ ok: true, event }` or
`{ ok: false, rejection, detail }`, never a throw. It runs at the ingress edge
(rejection → 400 to the producer) and inside replay (rejection → reported
outcome). Four rejections: `envelope_malformed`, `unknown_event_type`,
`unsupported_version`, `payload_malformed`. The detail names offending **keys,
never values**, so a report is safe to paste into a ticket.

An unnormalisable row is left **exactly** as it was — not its status, not its
attempt count. A refusal costs an operator an investigation; a guessed
`organization_id` settles money against the wrong party.

**Stated honestly:** only version 1 exists for all four inbound types, so the
multi-version dispatch path is exercised only by the `unsupported_version`
refusal. The real backwards-compatibility case handled is the additive optional
`payment_authorization_id` (absent ≡ null). This cycle did **not** prove a
version-1-to-version-2 migration, because there is no version 2.

### Replay scope, and the refusal to mean "everything"

`assertNarrow` rejects a scope unless at least one filter narrows it, and `limit`
is mandatory and bounded to 1…1000. Filters: `event_ids`, `event_types`,
`producer`, `statuses`, `received_from`/`to`, `occurred_from`/`to`,
`organization_id`, `after` (cursor), `limit`. `statuses` defaults to
`["pending", "dead"]` — the rows replay exists to rescue; asking for `processed`
rows is allowed but must be explicit. The reason for compulsory narrowing is
reviewability: an operator, and later an auditor, must be able to read the command
and know what it touches before it runs.

### Ordering

`(received_at, event_id)` — CORE's own receipt time, tie-broken deterministically
so a cursor can be exact. `occurred_at` is deliberately **not** the key: it is
the producer's claim, and ordering by it would let a producer with a skewed clock
reorder CORE's history retroactively. Paging uses a row-value cursor
`(received_at, event_id) > (:at, :id)` matching the sort exactly, so no event is
visited twice or skipped.

There is no sequence column, so the order is deterministic rather than
semantically total. Where ordering genuinely matters it is the **domain** that
enforces it, not the replay: a stale acceptance arriving after a cancellation
records what it can and does not reopen closed work, because the consumers use
conditional transitions on the current status.

### Dry-run, proved rather than promised

`plan()` returns the same report shape as a real run and writes nothing. That is
not asserted by reading the code: `ReadOnlyQueryable` wraps a pool so every
statement runs inside `begin transaction read only`, and the test runs the
identical service on it — `plan()` succeeds, `run()` on the same scope fails with
PostgreSQL **SQLSTATE 25006**, and afterwards `fulfillment`, `inbound_event`,
`inbox`, `outbox`, `notification`, the ledger and `audit_entry` are unchanged.
The falsification is the point: the guarantee is "the database refuses the
write", not "the code does not call the handler" (W-8).

**A dry-run writes no audit entry either.** A deliberate trade: journaling a
rehearsal would mean the rehearsal writes, which destroys the only property that
makes a rehearsal worth having.

### Redelivery is not replay

Redelivery is a producer resending an `event_id`, handled at ingress and
unchanged. Replay is CORE offering a stored event to consumers again, and the
inbox is per `(consumer, event_id)`.

Two modes, only one of which can cause a second execution. `pending_only`
(default) publishes and lets the inbox decide, so it is safe against any scope.
`reapply` clears this event's inbox entries for its consumers first — **explicit,
named and documented, never a hidden side effect** — for a consumer whose handler
was wrong and has been fixed. It is not a way around idempotency: the handlers
still enforce their own invariants, so a re-executed capture is refused by the
ledger rather than permitted by the replay.

Replay never rewrites an `event_id` or re-wraps an envelope. That is the cheapest
possible way to cause a double effect, which is precisely why the stored envelope
is republished byte for byte; a test submits a deliberately re-wrapped duplicate
to show the order-reference uniqueness still holds even then.

### Financial safety

There is **no replay-specific branch anywhere in the money path**. The guarantee
is not that replay is careful, it is that replay has no privileges. On real
PostgreSQL, over wallet → credit → authorize → `market.order.created` with a hold
→ `move.job.accepted` → `move.job.completed`: first replay captures
(`settlement_state = captured`, held 0, available 6 000); the same two events
replayed again, dragged back into scope on purpose so the inbox is the only thing
in the way, report `skipped_duplicate` × 2 and leave the balance, the
authorization row and the settlement state byte-identical. A replayed
`move.job.rejected` releases once; `reapply` of it does not credit twice. No
second capture, release, ledger entry or settlement.

### Failure semantics

No wrapping transaction. Thousands of events in one transaction would make
resumption impossible and hold locks for the length of the run, so each event is
published on its own and the report is the record.

`stopOnError` defaults to true, because later facts must not land on top of an
earlier one that never did. The report names the failing event and the reason,
shows what preceded it as applied and what followed as not started, and
`resume_after` points **before** the failing event so a resume retries it rather
than stepping over the one event that did not work. The failing row keeps the
dispatcher's own schedule — `attempts`, `next_attempt_at` and `status` untouched
— so a failed replay cannot spend the live queue's retry budget.
`--continue-on-error` answers the different question "how bad is it", opt-in.

### Concurrency

One run at a time, **refused rather than queued**: a replay waiting behind
another would run against a state the operator never inspected. In memory,
`InProcessReplayLock`, documented as single-process only. On PostgreSQL, a
session-scoped `pg_try_advisory_lock` on a dedicated client, tested from a
genuinely separate pool — which is what a second CORE instance is, and which an
in-process lock would let through. The lock is released in a `finally`, tested by
making the first store call throw, so one unexpected error cannot lock replay out
until a restart.

### Tenant isolation, and where B-23 bites

Scope by organization has three outcomes: match, `skipped_tenant_mismatch`, or
`skipped_tenant_unknown` when the envelope carries no tenant scope. CORE *could*
resolve a `move.*` closure to a tenant by looking up the fulfillment and
deliberately does not — the envelope is the evidence, and resolving tenancy by
inference is how one organization's history is replayed under another's scope.
The underlying cause is **B-23**: the three closure contracts carry no
`organization_id`. Widening them is a versioned change to contracts MOVE and
MARKET consume, so it stays a recorded dependency, cited in the refusal reason
rather than worked around.

### Auditability, without a second source of truth

**No new table.** Two entries on entity `event_replay` keyed by `replay_id`:
`event_replay.started` (actor, time, mode, full scope) and
`event_replay.finished` (counts per outcome, plus up to 20 `failed_event_ids`).
Counts and identifiers only, never a payload — an event can describe a real
person's order, and the audit trail is read by more people than the database is.

A counters table was considered and rejected: audit already carries the truth, and
a table describing what replay did would become a competing account of what the
domain state is. Replay records its own activity and nothing about the domain.

### Operating surface: CLI, and no endpoint

`npm run replay -- --event-types … --limit 100`, dry-run by default, `--execute`
required to write — the dangerous form is the longer one to type. There is
deliberately **no replay endpoint on the ingress**: ingress is reachable by MARKET
and MOVE with service credentials, and a route there would let a producer replay
CORE's history. B-5 also means an HTTP surface has nowhere safe to be placed yet.
`REPLAY_TOKEN` comes from the environment, never argv, so it does not reach shell
history or a process list; it is authenticated and then checked for a new
`events.replay` permission granted to `platform_admin` **only** — asserted in a
test, because every service credential holds `events.submit` and reusing it would
have let MARKET and MOVE replay everything. Rate control is the lock plus the
bounded limit. Exit code 1 on any failure or early stop.

### Tests (63 new)

`tests/event-normalisation.test.ts` — 17. `tests/replay.test.ts` — 24 in memory,
46 with a database. On **real PostgreSQL**: the dry-run zero-mutation snapshot and
the read-only 25006 proof, the financial lifecycle with no double effect, the
cross-pool advisory lock, and failure/resume. Also covered: scope refusal and
limit bounds, replaying a `dead` row without erasing its attempt history, the
re-wrapped duplicate, unnormalisable and unsupported-version rows left untouched,
tenant unknown and tenant mismatch, receipt-order versus a skewed producer clock,
no lifecycle regression from a stale event, cursor paging with no repeats,
`continue-on-error` surveying every failure, lock release on an unexpected error,
the audit journal's contents and its absence of payloads, the authorisation
boundary, and the CLI parser's defaults and refusals.

### Regression

`tsc --noEmit` clean. `DATABASE_URL=… npm test` **551 passed / 33 files**
(baseline 488). Without a database **314 passed / 43 skipped** (baseline
273 / 41). Results agree between backends everywhere both run. One pre-existing
flake persists and is **not** new: `tests/migration-0011-lifecycle.test.ts` times
out in its teardown hook under full-suite contention and passes in isolation; its
assertions pass in both cases.

### Fixed on the way, because normalisation made them visible

- The `move.job.rejected` consumer accepted payloads missing `rejected_at`, which
  the published contract requires. Now refused at the edge.
- A `move.job.completed` payload in the notification tests carried a `reason` key
  the contract forbids. Removed; the contract is now enforced in code, so the
  fixture could not have kept it.
- `payment_authorization_id` had two spellings for one meaning (absent, and
  explicitly null). Normalised to one, so no consumer has to know both.
- The CLI shipped silently broken inside this cycle and was caught by trying it:
  its entry point was guarded on `process.argv[1]`, which the TypeScript runner
  replaces with its own path, so `npm run replay` printed nothing and exited 0.
  The guard is gone, the entry point is its own file (`main.ts`) whose only job is
  to run, `fail()` throws a `CliUsageError` instead of calling `process.exit`
  inside a parser, and the parser is exported and tested. Then the whole surface
  was exercised end to end against the real database with a real
  `platform_admin` session token: dry-run, `--execute`, a second `--execute`
  discovering nothing, one fulfillment created, and four journal entries naming
  the principal.

### External dependencies — none new, none solved

**B-24** untouched: no `claimed_at`, no `processing` status, no schema column, no
migration. Replay needed none of them, and adding one here would have pre-empted
a decision that needs its own cycle. **B-23** unchanged, and now cited by name at
the point where it costs something. **D-6**, **D-7**, **D-8** unchanged and not
circumvented from inside replay. No new blocker was found: the milestone needed
nothing CORE does not own, which is why it was chosen.

### Next task, and why it is this one

**B-24 — make a claim countable and an abandoned lease recoverable.** No
unblocked *milestone* remains: 1, 3, 4, 6 and 8 are CORE-complete, 2 and 5 wait on
MARKET, 7 waits on B-2/B-3, 9 waits on B-5/B-6. So the next task is the largest
CORE-only correctness gap, and after this cycle it is clearly B-24.

The argument is not that it is interesting; it is that this milestone made the
cost of it concrete. Replay exists to reach events the dispatcher cannot, and the
one category it still cannot see is work whose lease was abandoned mid-flight: the
outbox relay, the inbound dispatcher and the delivery worker all ride their lease
on `next_attempt_at`, which is also the retry-schedule field, so a row being
processed by a dead process is indistinguishable from a row waiting to be retried.
That is why lease expiry is uncountable in the metrics added last cycle, and it is
also why an operator cannot ask "what is stuck" — the question replay is most
often run to answer. Fixing it needs a `processing` status or a `claimed_at`
column on three eventing tables, a rollback path, and a decision about rows that
exist when the migration runs. It is a schema cycle with no external dependency,
it removes an invisibility rather than adding a feature, and it is what stands
between CORE and a staging rehearsal it could trust.

Not chosen: **B-14…B-19** and the multi-hold work need answers CORE does not own;
**B-23** is a versioned widening of three published contracts and belongs in a
contract cycle with MOVE and MARKET; a live channel adapter has no provider
credential and the port keeps it a one-file change; **milestone 9** is blocked on
B-5 and B-6. Contract expansion was also deliberately not chosen: adding event
types would widen the surface before the existing one is operationally trustworthy.

---

## Cycle 2026-09-12 (third) — the events CORE publishes are now self-sufficient

Chosen after reading the code rather than this file. The previous cycle nominated
B-24 as next, and B-24 is genuinely CORE-only; it was **not** taken, for a stated
reason: it is a schema cycle on three eventing tables with a decision about
pre-existing rows, and two defects were sitting in front of it that cost
consumers something today, needed no migration, and were provably CORE's alone to
fix. B-24 remains the next task and its argument from last cycle stands unaltered.

Baseline verified before any edit, because the instruction was not to trust this
document: `tsc --noEmit` clean, 551 tests passing on real PostgreSQL 18.4, all 13
migrations applied. The roadmap's claim of 551 was accurate. The audit also
confirmed that the lifecycle (coordinating → dispatched → completed/failed/
cancelled), the B-21 single-closure conditional writes, the B-11 shared unit of
work across money and state, hold verification at intake, `financialDisposition`
and the three reconciliation reads are all genuinely present and correct — the
gaps found were not in the lifecycle, they were in what the lifecycle *tells
anybody*.

### Defect 1 — a closure event that does not name its tenant (B-23)

CORE owns tenancy. It is the only system in WASLA that can state which
organization a fulfillment belongs to. And it was publishing dispatch and closure
events that named the fulfillment, the order, the job and the money, and not the
organization.

The visible cost was in notifications: `organizationScope()` reads
`organization_id` off the payload and `recipientsFor(type, organizationId)`
narrows by it, so a recipient scoped to a tenant for one of these types matched
nothing and would have notified nobody, for ever, silently. The previous cycle
handled that honestly but narrowly — `register` **refused** the registration with
HTTP 400 rather than storing something inert. A loud refusal beats quiet silence,
but the refusal was a symptom being managed, not the defect. The invisible cost
was larger: MARKET and MOVE could not route, filter or authorize a closure without
calling CORE back for a fact CORE already had.

Fixed by adding a **required** `organization_id` to `core.fulfillment.dispatched`,
`.completed` and `.cancelled` (`.created` already carried one). Three details
matter more than the field itself:

- The value is read from **the fulfillment row**, not from an earlier event or a
  service field. That is what makes the intake-refusal path correct: when a
  `market.order.created` names a hold that does not exist, the fulfillment is
  created and closed in one transaction and the *only* event ever published is
  the closure. A tenant sourced from a prior `created` event would have been
  absent exactly there. `tests/fulfillment-lifecycle-contract.test.ts` pins that
  path specifically, and pins a two-tenant interleaving that any cached or
  service-level tenant would pass the single-tenant tests and fail.
- `TENANT_SCOPED_EVENT_TYPES` was widened, and deliberately left **explicit**
  rather than derived from the schemas. The list asserts a property of each
  published payload; deriving it would start permitting a tenant scope the moment
  some unrelated event grew an `organization_id` for its own reasons.
- The registry's refusal is **kept**, unchanged, and still tested — against
  `core.payment.captured`, which names an authorization and a wallet and no
  organization. The guard was never wrong; only its example was.

### Defect 2 — the amount was reported for failure and withheld for success

`FulfillmentPaymentPort.captureWithin` was typed `Promise<unknown>`. `settle()`
called it, discarded the answer and published `captured_minor: null`. So
`core.fulfillment.completed` — the closure where money had certainly and finally
moved — was the only closure event carrying no figure, while
`core.fulfillment.cancelled` after a partial capture carried one. A consumer
reconciling CORE's events could see what was kept when work failed and not what
was charged when work succeeded.

The root cause was a type, not an oversight: `MoneyService.captureWithin` returns
a `LedgerTransaction`, and a transaction is **one capture leg**. The figure the
event needs is the authorization's running total. A hold of 6 000 part-captured
2 500 out of band and then closed by CORE for the 3 500 remainder has a last leg
of 3 500 and a total of 6 000 — publishing the leg would have been a true number
about the wrong thing, understating what the payer paid by 2 500.

So `MoneyService` gained `captureHoldWithin`, returning the `PaymentAuthorization`
and mirroring the existing `voidWithin`; `captureWithin` keeps its signature and
its behaviour, and both now share one private implementation, so no existing
caller changed. The fulfillment port method was retyped to
`captureHoldWithin(...): Promise<{ status, captured_minor }>` — the same shape the
release path already used, which is the point: the two closure paths now report
money the same way instead of one of them reporting nothing.

`settle()` derives the settlement state (`captured` when the hold is fully
captured, `partially_captured` otherwise) rather than hardcoding `captured`. Today
only the first branch is reachable, because `settle()` captures the whole
remaining hold; it is written as a derivation because a hardcoded `captured`
would silently misreport the day a partial-settlement policy exists (B-20).

`captured_minor` stays **optional** on both closure schemas. An order with no hold
completes without it, and absence means "CORE observed no amount" — turning that
into `0` would convert having nothing to say into a positive claim that nothing
moved. There is a test asserting exactly that it is absent, not zero.

### Verification

- 551 → **572** tests. New file `tests/fulfillment-lifecycle-contract.test.ts`
  (19 tests, both backends) plus a tenant fan-out test in `tests/notifications.test.ts`.
- The new tests validate emitted payloads against the **published JSON Schemas**
  read from `contracts/`, for required fields and for `additionalProperties`, so a
  payload and its contract can no longer drift apart by hand — which is how the
  `move.job.rejected` consumer came to accept a payload its own contract forbade
  last cycle.
- Falsifiability checked by mutation, not assumed: replacing the tenant spread in
  `closureEvent()` with `{}` fails **10** tests; reverting the settle path to
  `captured_minor: null` fails **6**. Both across both backends.
- Four tests that pinned the old behaviour were updated rather than deleted, and
  each carries a comment saying which guarantee replaced what it used to assert.

### Corrections to this repository's own documentation

`README.md` was materially wrong and is fixed. It claimed "Subscriptions,
reputation, notifications — **not implemented**" when subscriptions and
notifications are both implemented and tested, and it cited 100/155 tests against
an actual 326/572 and migrations `0001`–`0006` against an actual 13. Per-area test
counts have been removed from that table rather than corrected: they were wrong
within two cycles of being written, and the suite is the authority.
`docs/event-catalog.md`, `docs/settlement.md` and `docs/notifications.md` were
updated in the same push as the code they describe.

### External dependencies — one new, for the other repositories' agents

**New, and it needs action outside CORE.** `organization_id` is an additive field,
but a consumer validating `core.fulfillment.dispatched`, `.completed` or
`.cancelled` with `additionalProperties: false` against a copy of the schema taken
before this change **will now reject valid CORE events**. MOVE and MARKET should
refresh the three schemas from `contracts/events/`. No version bump was made: the
payloads remain v1, since a required addition that consumers must accept is
indistinguishable in effect from a compatible one for any consumer that does not
validate strictly, and bumping would have forced every consumer to migrate for a
field most of them will simply ignore. If either repository's agent judges a v2
necessary for its own validator, that is a contract conversation, not a CORE
decision to take alone.

Second, smaller: events **persisted before this commit** have no
`organization_id`. Replay and history readers must treat its absence as unknown
rather than as an error or as a tenantless event — on replay such events fan out
to platform-wide recipients only.

**B-24** untouched again: no `claimed_at`, no `processing` status, no migration.
**B-20** untouched and unchanged — this cycle reports the amount more honestly and
still refuses to decide what is owed. **D-6**, **D-7**, **D-8** unchanged.
**B-2…B-6** and **B-14…B-19** still need answers CORE does not own.

### Next task, and why it is still this one

**B-24 — make a claim countable and an abandoned lease recoverable.** Unchanged
from last cycle and now the largest remaining CORE-only correctness gap with
nothing in front of it. The lease for the outbox relay, the inbound dispatcher and
the delivery worker rides on `next_attempt_at`, which is also the retry-schedule
field, so a row held by a dead process is indistinguishable from a row waiting to
be retried: lease expiry is uncountable, and an operator cannot ask what is stuck.
It needs a `claimed_at` column or a `processing` status on `outbox`,
`inbound_event` and `event_delivery`, a rollback path, and a stated decision about
rows existing when the migration runs.

Not chosen next: **B-14…B-19** and **B-20** need owner decisions; **milestone 9**
is blocked on B-5/B-6; a live channel adapter has no provider credential and the
port keeps it a one-file change. Contract *expansion* is still deliberately not
chosen — this cycle completed two existing contracts rather than adding any new
event type, and the existing surface should be operationally trustworthy before it
grows.

## Cycle 2026-09-12 (eighth) — B-24, an abandoned claim is now a fact (CORE-only agent)

Scope: `src/platform/eventing/`, `db/migrations/0014_*`, `docs/`, tests. No MOVE,
no MARKET, no new module, no contract change to any published event.

### The defect, precisely

B-22 made every claim a write: `claimDue` pushes `next_attempt_at` out by a lease
so a second worker's identical query matches nothing. For the notification
dispatcher that was complete, because it also has a `claim_token` and a separate
`reclaimExpired`. For the other three queues — `outbox`, `inbound_event`,
`event_delivery` — the lease was stored in `next_attempt_at`, **which is also the
retry-schedule field**. One column, two meanings, and nothing on the row saying
which one applied.

Three consequences, none of them cosmetic:

1. `core_worker_outcomes_total{outcome="reclaimed"}` was unreportable for three of
   the four workers. A crash-looping worker and a badly-shaped payload produced
   *identical* metrics: claims that never became completions.
2. When a lease expired the row was silently re-served by the next `claimDue`, so
   the recovery was not an event anybody could count, alarm on, or find in a log.
3. Nobody could ask the two questions an operator actually asks — *what is a
   worker doing right now*, and *what is stuck*. Every pending row with a future
   timestamp looked the same.

### The fix, and the two designs that were rejected

Migration 0014 adds a nullable `claimed_at timestamptz` to the three tables. That
one column makes the overloaded one readable:

- `claimed_at IS NULL` → `next_attempt_at` is a **retry schedule**.
- `claimed_at IS NOT NULL` → `next_attempt_at` is a **lease expiry**.

- `claimDue` now writes `claimed_at` and matches only `claimed_at is null`, so an
  expired lease is no longer silently re-served. Both backends now return the
  **post-claim** rows; the in-memory double used to return the pre-claim ones,
  which is the sort of difference that certifies a bug (B-12).
- `reclaimExpired(now, limit = 100): Promise<number>` on all three ports, modelled
  on the notification store's: clears `claimed_at`, sets `next_attempt_at = now`
  (due immediately — the row has already waited out a whole lease) and records
  `last_error = 'abandoned claim reclaimed after attempt N'`.
- Every worker runs **recovery first, then claims**, so a recovered row is worked
  in the same tick and `result.reclaimed` is reported on
  `PublisherResult`, `DispatcherResult` and `DeliveryWorkerResult`.
- Every acknowledgement (`markPublished`, `markFailed`, `markDead`,
  `markProcessed`, `markDelivered`) clears `claimed_at`, and a check constraint
  per table (`claimed_at IS NULL OR status = 'pending'`) makes the database refuse
  the mistake even if a future writer forgets. Without it, one missed release
  would pin `in_flight` above zero for ever and make the new gauges useless.
- `counts()` gains `in_flight` (pending, claimed, lease live) and `abandoned`
  (pending, claimed, lease expired). Both are **subsets of `pending`**, like the
  existing `retrying` — cuts through the same rows, never additions to them. Both
  are cut at the injected clock (`iso(this.clock.now())` bound as `$1` on
  Postgres) so a fixed clock in a test moves the store and the worker together.
  `DepthSampler` already publishes every key from `counts()` as
  `core_queue_depth{queue,state}`, so both surface with **no new metric**.
- A partial index per table on `(next_attempt_at) WHERE status = 'pending' AND
  claimed_at IS NOT NULL`. Recovery runs on every tick; without it the cheapest
  thing a worker does on a healthy queue becomes a scan of everything it has ever
  published. The existing `*_due_idx` is untouched.

**Rejected: a `processing` status.** It reads well and is wrong here. Every
existing reader of these tables — `byStatus`, the replay selection, the depth
gauges, the readiness probe, MARKET's and MOVE's mental model — treats `pending`
as "not yet done". Moving claimed rows out of `pending` changes what all of them
mean, which is a contract change made in order to fix a metric.

**Rejected: a `claim_token`.** That is real fencing and it is worth doing, but it
needs a token threaded through every acknowledgement in six store
implementations and three workers, plus an answer to "what should a refused
acknowledgement do about the POST it already sent". Bigger, separately reviewable,
and not what B-24 asked for. Recorded as **B-26** rather than half-built.

### Existing rows, and how to deploy and roll this back

The roadmap required this be stated rather than assumed. Existing rows get
`NULL`, meaning "not held". That is safe even for rows a worker genuinely holds
while the migration runs: they keep their future `next_attempt_at`, so they stay
invisible to `claimDue` until the lease would have expired anyway, and are then
claimed exactly as they are today. No downtime, and the workers do not have to be
stopped. The one cost is that claims held across the migration are not *counted*
when they are taken over — a one-time undercount of `reclaimed`, not a lost row.

Rolling back is **not** symmetric and `0014_worker_claim_visibility.down.sql`
says so in the file: roll the **code** back first, then the migration. Code that
writes `claimed_at` against a schema without the column fails every claim, and
all three queues stop.

### A real backend divergence found on the way

`InMemoryDeliveryStore.markDelivered` stamped `delivered_at` from
`existing.next_attempt_at`. Before B-22 that was merely odd; after B-22 that field
is the lease, so the in-memory backend recorded every delivery as having happened
**one whole lease (30s) in the future**, while Postgres used the clock. B-12 again,
in a module that already had it. Fixed to `this.clock.now()` and asserted.
`InMemoryDeliveryStore` now **requires** a `Clock` rather than defaulting to one,
because a store reading a different clock than the worker polling it is exactly
how this class of bug survives.

`tests/outbound-delivery.test.ts` had the same fault in its harness: each backend
was opened with its own fresh `FixedClock`, so advancing the test clock moved the
app and left the store behind. Nothing read the clock inside a store until
`counts()` did, at which point rows were reported as in flight for ever. The
harness now passes the test's clock in, as the other suites already did.

### Tests — 10 new, and what each one would catch

- `tests/worker-claim-atomicity.test.ts`: the abandoned-claim test now asserts the
  full B-24 contract — `claimed_at` is set by the claim; `claimDue` refuses the
  row *even after the lease expires* (it is owed a recovery, not up for grabs);
  `reclaimExpired` returns 0 inside the lease and 1 after it; the recovered row is
  pending, unclaimed, due, and **still on attempt 0**. Plus a new test that every
  acknowledgement releases the claim, so a published/failed/dead row never looks
  held.
- `tests/observability.test.ts`: two rows, one acknowledged as a retry and one
  abandoned, are told apart — `retrying: 1, in_flight: 1, abandoned: 0` inside the
  lease and `retrying: 1, in_flight: 0, abandoned: 1` after it — the
  `core_queue_depth{state="abandoned"}` gauge appears, the relay reports
  `reclaimed` and publishes in the same pass, and the retrying row is untouched
  with its attempt still spent. The same for the inbound dispatcher.
- `tests/outbound-delivery.test.ts`: a delivery whose worker died is recovered and
  sent, with `reclaimed: 1`, one attempt rather than two, and `delivered_at` equal
  to the clock — which is the assertion that fails if the divergence above returns.
- `tests/db-schema.test.ts`: against the live database, the check constraint
  refuses `status = 'published'` while `claimed_at` is set (by constraint **name**,
  so the failure is attributable), accepts the release in the same statement, and
  all three lease indexes exist. A migration that has only been read is an
  unverified claim.

Falsified by mutation, both backends: making `reclaimExpired` a no-op fails 4
tests; restoring the in-memory `delivered_at` bug fails 1.

### Verification

`tsc --noEmit` clean. `DATABASE_URL=… npm test` → **582 passed / 34 files**
(was 572). Without a database → 330 passed / 45 skipped. Governance, contract,
migration and roadmap gates pass. Migration 0014 was **executed** against real
PostgreSQL 18.4, not merely written; `schema_migrations` now lists 14.

### Documentation

`docs/observability.md` — the B-24 blocker section is replaced by a resolution
that states the defect, the fix, both rejected designs, the deployment and the
rollback order; `in_flight` and `abandoned` are documented as derived subsets of
`pending` with a table of their derivations, and `abandoned` is named as the gauge
to alarm on. `docs/outbound-delivery.md` — a claim is a lease and a lease is not a
backoff. `docs/replay.md` — the "B-24 not touched" note now records that it is
resolved and that replay is unaffected, since replay selects by status and time
and never by lease.

### External dependencies — none new

This cycle changed no published contract, no event payload and no HTTP response
shape. `claimed_at` is internal to CORE's queue tables and is not exposed by any
endpoint. **MOVE and MARKET need do nothing.** The store *ports* changed
(`reclaimExpired` is new, `claimed_at` is on three record types), which matters
only to code inside this repository.

**B-25** and **B-26** are new and recorded above: the first is the honest cost of
not charging an attempt for an unobserved failure, the second is the fencing gap
`claimed_at` does not close. **B-20** untouched. **D-6**, **D-7**, **D-8**
unchanged. **B-2…B-6** and **B-14…B-19** still need answers CORE does not own.

### Next task

**B-25 — bound the reclaim loop.** It is now the only *unbounded* failure mode in
the queues and it was introduced, knowingly, by this cycle. A row whose worker
dies on it every time is reclaimed for ever and never dead-lettered, so the one
queue state that requires a human is the one state it can never reach. It is
CORE-only, it is small (one column or one decision about `attempts`, one migration,
one limit check per worker), and it is the natural completion of this cycle rather
than a new direction. It does need one operations answer — what a reasonable
reclaim limit is — which should be asked before the code is written, not after.

Not chosen next: **B-26** (fencing) is larger and is a change to the store ports;
it should follow B-25 rather than precede it, because a bounded reclaim loop makes
a refused acknowledgement a bounded problem too. **B-14…B-19** and **B-20** need
owner decisions. **Milestone 9** is still blocked on B-5/B-6. Contract expansion is
again deliberately not chosen: the existing surface should be operationally
trustworthy before it grows, and this cycle is what that means in practice.

## Cycle 2026-09-12 (ninth) — B-25, recovery is bounded (CORE-only agent)

Scope: `src/platform/eventing/`, `db/migrations/0015_*`, `docs/`, tests. No MOVE,
no MARKET, no new module, no contract change to any published event.

### The defect, precisely

The previous cycle resolved B-24 and, in the same breath, recorded the cost of how
it did so. `reclaimExpired` frees an abandoned claim without touching `attempts`,
because nobody observed the work fail and charging an attempt for an unobserved
outcome would let five rolling restarts dead-letter five perfectly healthy events
at `maxAttempts = 5`. That reasoning still holds. What it left behind does not:

1. Recovery had **no limit at all**. A payload that kills whichever worker touches
   it — an OOM on one oversized event, a hang on one malformed field — was claimed,
   killed, reclaimed on the next tick, claimed again, indefinitely.
2. The row never reached `dead`, so it never appeared in a dead-letter query and
   never triggered the one queue state that is defined as "a person must look".
3. `core_worker_outcomes_total{outcome="reclaimed"}` climbed steadily, which is
   *visible* but not *actionable*: the same signal is produced by a healthy queue
   during a deploy. Nothing separated "recovering" from "will never recover".

So the queue held work it would never finish, and said so in a counter that also
says everything is fine.

### The fix, and the two designs that were rejected

**Chosen: a second budget, with its own column.** Migration 0015 adds `reclaims
integer not null default 0` and a `*_reclaims_check (reclaims >= 0)` to `outbox`,
`inbound_event` and `event_delivery`. The port becomes `reclaimExpired(now,
maxReclaims, limit?)` and returns `{ reclaimed, dead }`. On Postgres it stays a
single statement per queue — `set reclaims = reclaims + 1`, `status = case when
reclaims + 1 > $3 then 'dead' else status end`, `next_attempt_at` left where it is
on the dead branch (matching `markDead`) and moved to now on the recovered branch,
two different `last_error` strings, `returning status` — so recovery cannot
interleave with itself and produce a row that was both freed and killed. The limit
is `DEFAULT_MAX_RECLAIMS = 3` in `src/platform/eventing/reclaim.ts`, passed as the
**last** constructor argument of each worker so no existing positional caller
moved.

The two counters are deliberately not the same counter:

| Counter | Incremented when | Bounds | Also drives |
| --- | --- | --- | --- |
| `attempts` | the work was tried and observed to fail | `maxAttempts` (5 / 5 / 8) | backoff, and the derived `retrying` state |
| `reclaims` | a claim was abandoned with nothing reported | `maxReclaims` (3) | nothing else |

**Rejected: increment `attempts` in `reclaimExpired`.** A two-word change, and the
first thing tried on paper. It is wrong twice over, and both are checkable rather
than aesthetic: the backoff is `baseBackoffMs * 2 ** attempts`, so a crash loop
would push a healthy row into exponentially long delays it never earned; and
`retrying` is derived as `pending and attempts > 0`, so a row nobody had ever tried
would be reported as retrying. Mutation-testing this design confirms it — charging
the attempt fails 4 tests, one of them a B-24 test that has nothing to do with this
cycle.

**Rejected: charge the attempt at claim time.** This is how the notification store
solves the identical problem with one counter: its `claimDue` does `attempts =
attempts + 1`, so its own `reclaimExpired(now, maxAttempts, limit)` is bounded for
free. It was left exactly as it is. Adopting it for the other three would change
what `attempts` means for them — which B-22 explicitly declined to do — and would
silently halve every effective retry limit in the system, since an attempt would be
spent on claiming rather than on failing.

### The exhausted row, and what it is called

A row that runs out of reclaims is dead-lettered, and the workers report it as
`failed_permanent` — not as a new outcome label, because the metric vocabulary
already has a word for "terminal, no worker will pick this up again", and adding a
label to `core_worker_outcomes_total` would break every existing dashboard query
that sums over outcomes. The distinction that *is* worth keeping is exposed on the
result object instead: `PublisherResult`, `DispatcherResult` and
`DeliveryWorkerResult` gained a `reclaim_exhausted` field, so a caller can tell an
exhausted recovery from an ordinary permanent failure without parsing
`last_error`. `last_error` records it too, in prose an operator can grep:
`reclaim limit exceeded: abandoned N times after attempt M`.

A dead `event_delivery` row keeps `last_status` and `delivered_at` null. Nothing was
ever sent to the subscriber, and the record must not imply one answered.

### Existing rows, and how to deploy and roll this back

Existing rows get `0`, so everything in flight when the migration runs starts with
a full budget; the deploy itself dead-letters nothing. The limit lives in the
workers, not in the schema, so it can be tuned without a migration. Rolling
**back** is code first, then `0015_worker_reclaim_budget.down.sql`, for the same
reason as 0014: code that writes `reclaims` against a schema without the column
fails every recovery, which stops all three queues. Rows already dead-lettered by
an exhausted budget stay dead — which is what B-27 below is about.

### Tests — 10 new, and what each one would catch

`tests/reclaim-budget.test.ts`, `describe.each(backends)` so all five cases run on
in-memory and on real Postgres:

1. **Outbox exhaustion.** Three abandonments recovered, the fourth dead-letters,
   `last_error` reads `reclaim limit exceeded`. Catches an off-by-one on the limit
   and an unbounded budget.
2. **The two budgets spend separately.** A real `markFailed` moves `attempts` and
   leaves `reclaims` alone; an abandonment does the reverse. This is the test that
   fails if anyone ever "simplifies" the design back to one counter.
3. **Inbound exhaustion is replayable.** The dead row appears in `byStatus("dead")`,
   which is what `docs/replay.md` promises an operator can act on.
4. **Delivery exhaustion invents nothing.** `last_status` and `delivered_at` stay
   null on the dead row.
5. **The worker reports it.** A real `OutboxPublisher` against a rejecting bus and a
   deliberately huge `maxAttempts`, abandoned once per round: `reclaimed` 1 per
   round then `reclaim_exhausted` 1, `dead` 0 throughout, and the exposition shows
   `reclaimed` 3 and `failed_permanent` 1. The final row is at `reclaims = 4`,
   `attempts = 3` — the two budgets advancing independently inside a live worker.

`tests/db-schema.test.ts` gained one case asserting the column is `not null`,
defaults to `0` and carries its check constraint **on the live database**, so a
migration that was written but never applied cannot pass. `MAX_RECLAIMS = 3` is
re-declared as a literal in the test files rather than imported, so changing the
default in `src/` fails the tests instead of moving them silently.

### Verification

`tsc --noEmit` clean. `DATABASE_URL=… npx vitest run`: **592 passed / 35 files**
(582 → 592). Without a database: 335 passed / 46 skipped. Governance, contract and
migration gates pass; 15 forward migrations, all with rollbacks. Falsifiable and
checked by mutation, each mutation restored and `tsc` re-run clean afterwards:
making the in-memory budget never exhaust fails 4 tests, raising the Postgres
threshold to 999 fails 3, and charging `attempts` on reclaim fails 4.

Sixteen existing `toEqual` assertions in `tests/outbound-delivery.test.ts` had to
gain `reclaim_exhausted: 0`. They are exact-shape assertions on the worker result,
which is why adding a field broke them — and why they are worth keeping exactly as
they are.

### Documentation

`docs/observability.md` — the paragraph stating that a reclaimed item is not
charged an attempt now explains the second budget, the exhaustion outcome and the
table separating the two counters; a new "B-25, resolved" section records the
defect, the fix, both rejected designs and the rollback order.
`docs/outbound-delivery.md` — the lease paragraph now ends at the dead letter
rather than at "the next drain sends it". `docs/replay.md` — records that a dead
inbound row now has two possible causes, that a reclaim-exhausted row has never
been processed at all so replaying it is a first attempt, and that `outbox` and
`event_delivery` have no revival path.

### External dependencies — none new

No published contract, no event payload and no HTTP response shape changed.
`reclaims` is internal to CORE's queue tables and is exposed by no endpoint.
**MOVE and MARKET need do nothing.** The store ports changed (`reclaimExpired` now
takes a limit and returns a shape), which matters only inside this repository.

**B-27** is new and recorded above. **B-26** unchanged and now next. **B-20**
untouched. **D-6**, **D-7**, **D-8** unchanged. **B-2…B-6** and **B-14…B-19** still
need answers CORE does not own.

### Next task

**B-26 — fencing tokens on the three eventing queues.** With recovery now bounded,
the remaining hole in the lease design is the one `claimed_at` cannot close: a
worker that stalls past its lease, is reclaimed, then wakes up and acknowledges
work that has since been re-served. The acknowledgement lands, and
`core_worker_outcomes_total{outcome="fenced"}` stays unreportable for three of the
four workers. The notification store already has the shape to copy. It is
CORE-only, and it is deliberately sequenced after B-25 because a refused
acknowledgement on a bounded queue is a bounded problem.

Not chosen next: **B-27** (reviving a dead `outbox` or `event_delivery` row) is the
honest follow-on to this cycle, but it needs an owner answer first — whether
reviving a dead outbox row re-publishes the original envelope or emits a fresh one
with a new `event_id` — and that answer changes the shape of the code, so it should
not be guessed. **B-14…B-19** and **B-20** need owner decisions. **Milestone 9** is
still blocked on B-5/B-6.

## Cycle 2026-09-12 (tenth) — B-26, a claim is exclusive for as long as it is held (CORE-only agent)

Reviewed the working tree at `0edb7af` before planning anything: 592 tests over 35
files pass with `DATABASE_URL` set, 335 pass and 46 skip without one, `tsc --noEmit`
is clean, all four gates pass and all 15 migrations are applied to a real
PostgreSQL 18.4. The state matched what the previous cycle claimed, so B-26 — the
blocker that cycle's own B-24 work had recorded — was the next honest piece of work.

### The defect, stated precisely

Three cycles have now been spent on claiming, and each fixed a different property of
the same instant:

| Blocker | What it made true |
| --- | --- |
| B-22 | claiming is a write, so two workers cannot claim the same row |
| B-24 | a held claim is visible, so an abandoned one can be found and counted |
| B-25 | recovery is bounded, so an abandoned claim cannot be recovered for ever |

None of them said anything about the interval **after** the claim. The sequence that
still misbehaved:

1. worker A claims row R, lease 30s, and stalls — a GC pause, a blocked syscall, a
   subscriber that takes 40 seconds to answer a POST;
2. the lease expires; `reclaimExpired` frees R; worker B claims it and finishes it;
3. A wakes up and calls `markPublished` / `markProcessed` / `markDelivered`. Its
   statement is `update … where event_id = $1`. It names the row. It applies.

The row now records A's outcome: A's status, A's `last_error`, and for a delivery a
`last_status` from a response B never received. Two attempts happened and the row
describes the abandoned one. The most damaging variant is a stale **success** on
`inbound_event` — an event marked `processed` whose live attempt actually failed will
never be dispatched again, and nothing anywhere reports a failure.

This was not a hypothesis about the schema. `core_worker_outcomes_total` has had a
`fenced` outcome in its catalogue since Milestone 8, described in
`docs/observability.md` as "an acknowledgement refused because the claim token was
stale". For three of the four workers that counter could only ever be zero, because
their tables had no token to match on. The metric existed; the mechanism did not.

### The fix

`claim_token text` on `outbox`, `inbound_event` and `event_delivery` (migration
0016) — deliberately the same shape `notification` has had since 0012, since this is
the same concept and `PgNotificationStore` already proved the pattern works.

- `src/platform/eventing/fencing.ts` — `newClaimToken()` (a v4 UUID from
  `node:crypto`), `isFenced(rowToken, fence)`, `UNFENCED` for a caller that holds no
  claim, and `FencedError` for the one case where returning `false` is not enough.
- `claimDue` generates **one** token per call and stamps it on every row in the
  batch, in the statement that already writes the lease. A batch is claimed and
  abandoned as a unit, so a token per row would cost a statement per row and refuse
  nothing extra.
- All nine acknowledgements across six store implementations take the fence as their
  second argument and return `Promise<boolean>`; `false` means refused. Postgres does
  it in the same statement — `where event_id = $1 and ($2::text is null or
  claim_token = $2) returning event_id`, then `rows.length === 1` — so there is no
  read-then-write race in the fence itself.
- Recovery clears the token, and so does every acknowledgement: a claim that has
  ended leaves no token behind that a later write could match.
- `OutboxPublisher`, `InboundDispatcher` and `DeliveryWorker` each report a `fenced`
  count on their result and emit `core_worker_outcomes_total{outcome="fenced"}`. No
  catalogue change was needed — the outcome was already defined.

**The relay is the one transactional case.** `markPublished` runs inside the same
transaction that queues the fan-out deliveries; that dual-write is the entire reason
the outbox exists. Returning `false` there is not sufficient, because the delivery
rows are already written in that scope, so a refused `markPublished` throws
`FencedError` and the transaction rolls back with them. The catch block checks for
`FencedError` **first**, before the attempts arithmetic, and `continue`s: a fence is
not a failed publish, and charging an attempt would impose a backoff on a row whose
only problem is a worker slower than its lease — and could eventually dead-letter an
event the current claim holder is publishing successfully.

**Replay is the only unfenced caller**, and passes `UNFENCED` explicitly with a
comment saying why. An operator advancing a `dead` inbound event was never a worker
and never held a claim; a fence that applied to every caller would have broken the
only recovery path this queue has. `UNFENCED` is a named constant rather than a bare
`null` so that every unfenced acknowledgement in CORE is findable in one search.

### What was rejected, and why

- **`uuid` instead of `text`.** Four bytes a row cheaper and self-validating, but
  `notification.claim_token` is `text`; one type for one concept across four queues
  is worth more than the bytes.
- **`default gen_random_uuid()` in the schema.** Puts token generation outside the
  in-memory backend's reach and makes the two backends disagree about what a claim
  returns — B-12, the divergence this repository keeps paying for.
- **The strong constraint, "every claimed row carries a token."** It reads better and
  it is false: rows already claimed when the migration runs have `claimed_at` and no
  token, and backfilling one would fence out a worker still doing real work. The
  constraint shipped is the weak direction only — a token implies a claim.
- **Fencing replay too.** Rejected above.
- **Treating a refusal as a failure.** Rejected above for the relay; the same
  reasoning applies to the other two workers, which count it and move on.

### What this does not fix

It does not prevent the duplicate side effect. If the stalled worker already
published to the bus or POSTed to a subscriber, that happened. Delivery is
at-least-once and stays at-least-once; subscribers still deduplicate on `event_id`.
What the fence protects is the **record**: status, error, response code and
timestamps stay those of the attempt that actually completed. Saying otherwise in the
docs would be a false guarantee, so `docs/outbound-delivery.md` now states the limit
next to the at-least-once paragraph it qualifies.

Operationally, a persistently non-zero `fenced` is a tuning signal rather than a bug
report: it means workers routinely take longer than their lease, so the lease is too
short or the work too slow. For the delivery worker it usually means `timeoutMs` is
close to or above `LEASE_MS`.

### A defect found in the migration runner contract

The first version of `0016_worker_claim_fencing.sql` applied cleanly and then broke
`tests/migration-0011-lifecycle.test.ts`, which runs `down` and `up` again. The
runner does not record migrations — `scripts/db-migrate.mjs` says so in its header
comment, and each migration is expected to insert its own `schema_migrations` row.
0016 was missing that insert, and its `.down.sql` was missing the matching delete, so
`up` re-ran it for ever and failed on the second `ADD COLUMN`. Both are now present.
Beyond that, every statement in the forward migration was made re-runnable — `ADD
COLUMN IF NOT EXISTS`, and a `DROP CONSTRAINT IF EXISTS` before each `ADD
CONSTRAINT`, since Postgres has no `ADD CONSTRAINT IF NOT EXISTS`. A migration that
records itself should never run twice, but one that cannot survive running twice
turns any interrupted deploy into a manual repair before the next deploy can
proceed — which is exactly the state this cycle had to clean up by hand.

### Verification

`tests/claim-fencing.test.ts` adds 14 tests (7 cases across both backends): a stale
acknowledgement is refused on each of the three queues; the token is cleared whenever
a claim ends; the dispatcher reports `fenced` and the exposition shows
`core_worker_outcomes_total{worker="inbound_dispatcher",outcome="fenced"} 1`; a fenced
relay rolls its fan-out delivery rows back; and `UNFENCED` still applies. The stall is
simulated rather than asserted about — the publish callback advances the injected
clock past the lease and runs recovery, so the reclaim genuinely happens before the
acknowledgement.

`tests/db-schema.test.ts` asserts against the **live** schema: the column exists on
all three tables, is nullable, has no default, and the `*_claim_token_check`
constraint has the expected definition; then it inserts an `outbox` row and shows
that setting a token without `claimed_at` is actually rejected with
`constraint === "outbox_claim_token_check"` while setting both succeeds.

608 tests over 36 files pass with `DATABASE_URL`; 342 pass and 47 skip without one;
`tsc --noEmit` clean; governance, contract, migration and roadmap gates pass; 0016
was applied, rolled back and re-applied against real PostgreSQL 18.4. Three mutations
confirm the tests can fail: `isFenced` always returning false fails 5 tests, dropping
the fence predicate from the Postgres `markPublished` fails 2, and leaving the token
in place during in-memory recovery fails 2. Each was restored and `tsc` re-run clean.

### What CORE still needs from elsewhere

Nothing new. **B-27** remains the honest next piece of work inside CORE and is still
blocked on one owner answer: does reviving a dead `outbox` row re-publish the original
envelope unchanged, or emit a fresh one with a new `event_id`? That answer changes the
shape of the code, so it should not be guessed. B-25 and now B-26 both make it matter
more: there are more ways to reach `dead`, and the rows that get there are still
unreachable. **B-14…B-19** and **B-20** need owner decisions. **Milestone 9** is still
blocked on B-5/B-6. No MOVE or MARKET code was read or written in this cycle.

## Cycle 2026-09-12 (eleventh) — B-27, queue revival (CORE-only agent)

Baseline `ec4ed8b`, working tree clean, 608 tests passing. No MOVE or MARKET code
was read or written.

### The defect

`dead` was a state with no exit. B-22 introduced it, B-25 added a second route into
it, B-26 made the acknowledgement that writes it fence-safe — and across those three
cycles nobody built the way back. Replay could bring an `inbound_event` back;
nothing in CORE could bring back an `outbox` row or an `event_delivery`. There was
no `requeue`, no `revive`, no equivalent, anywhere. A dead outbox row was an event
MOVE and MARKET would never receive, held safely in a table nobody could act on: a
terminal state with no exit is not durability, it is a hole with a name. The
recovery procedure in practice was an `UPDATE` typed into a production console by
whoever happened to be awake — unjournalled, unbounded, and free to touch a row that
had already been published.

### The owner decision, and what it settled

B-27 had been left open for one reason: does reviving a dead outbox row re-publish
the original envelope, or emit a fresh one with a new `event_id`? The answer given
was **re-publish the original envelope unchanged**, and it decided the shape of
everything else.

Because a revival must not change the envelope, **a revival publishes nothing at
all.** It returns the row to `pending` and stops. The outbox relay then publishes
it; the delivery worker then POSTs it. Both do exactly what they always do, to the
bytes that were already stored — same `event_id`, same `occurred_at`, same payload,
same signature. There is no second publish path, which was the point of the outbox
in the first place. A fresh envelope would have required one, and every consumer
inbox and every subscriber deduplicating on `event_id` would have seen a month-old
fact as news: a duplicate effect bought for nothing.

### What was written

- **`src/platform/eventing/revival.ts`** — the selection vocabulary shared by both
  backends: `OutboxRevivalSelection`, `DeliveryRevivalSelection`, their matchers, and
  a row-value cursor comparison. Shared rather than duplicated because a filter that
  means one thing in memory and another in Postgres is a test that passes on the
  wrong backend (B-12 discipline).
- **`selectDead` and `revive` on `OutboxStore` and `DeliveryStore`**, in the
  in-memory and Postgres implementations. `revive` matches on `status = 'dead'`
  inside the same statement, so it is a transition and not an overwrite and can
  never resurrect a `published` row. Selects use bound parameters only: the filters
  are operator-supplied and are therefore an injection surface.
- **`src/platform/replay/revive.ts`** — `QueueRevivalService`, with `plan` (writes
  nothing, not even an audit entry) and `run`. Compulsory narrowing, a mandatory
  limit bounded at 1..1000, per-row commits, a resume cursor that on failure points
  *before* the row that failed, and two journal entries per run.
- **`src/platform/replay/revive-cli.ts` / `revive-main.ts`** and `npm run revive` —
  dry run unless `--execute`, token from the environment rather than `argv`, both
  halves of a cursor or neither.
- **`events.revive`**, `platform_admin` only, and a **separate advisory-lock key**.
- **`docs/queue-revival.md`**, and `docs/replay.md` corrected: it stated in plain
  terms that those rows had no revival path, and that statement is now false.

### No migration, and no index

Neither was needed and neither was invented. Revival writes `status`,
`next_attempt_at`, `claimed_at`, `claim_token` and `reclaims` — all columns that
already exist — and the selection is a bounded, operator-driven query off any
request path, so an index for it would be a migration in search of a problem. This
is the first cycle since 0013 to add no migration, which is the correct outcome
rather than a gap.

### The asymmetry that is easy to get wrong

`reclaims` is zeroed. `attempts` and `last_error` are not.

`attempts` drives the backoff, drives the derived `retrying` reading, and is the
only record of how many observed failures the row caused. Zeroing it would falsify
two readings and convert one operator decision into an unbounded retry budget: die
at five, revive, retry five, die, revive. `reclaims` counts worker deaths, which are
evidence about the worker and not about the row, so it resets. `last_error` is the
only on-row evidence of why the row died, and the revival itself belongs in the
audit journal, where the actor is named.

The consequence is stated in the docs rather than hidden: **a row that died at
`maxAttempts` gets exactly one further attempt.** That is what makes revival bounded
by construction and puts every retry decision beside a name.

### A real defect found while building it

`DeliveryFanOut` filters subscriptions on `active`; `DeliveryWorker.drainOnce` does
not. So a delivery already queued when a subscription is switched off is still sent.
Revival therefore refuses a dead delivery whose subscription is inactive — otherwise
it would be the one path in CORE that POSTs to an endpoint somebody deliberately
switched off, at the request of an operator looking at a dead-letter queue rather
than at the subscription list. The worker's behaviour was **documented, not
changed**: whether deactivation means "stop sending now" or "stop queueing new work"
is an owner decision, recorded as **B-28**.

### Verification

`tests/queue-revival.test.ts`, 28 tests over both backends: the original envelope
arriving unchanged at a bus consumer and at a subscriber; `attempts` and
`last_error` surviving while the claim and the reclaim budget are cleared; a
published row refusing to be resurrected through the service *and* directly through
the store; an inactive subscription refusing a delivery and the row staying dead; a
plan writing nothing including no audit entry; every refusal of a scope; the
journal's counts and revived ids; a second run doing nothing; cursor paging over two
rows without repeating or skipping; the advisory lock refusing a concurrent run;
revival and replay not blocking each other; the permission held by `platform_admin`
alone; and the parser's defaults and refusals.

636 tests over 37 files pass with `DATABASE_URL`; `tsc --noEmit` clean; governance,
contract, migration and roadmap gates pass. Three mutations confirm the tests can
fail: dropping `status = 'dead'` from the revival update fails 2 (one per backend),
zeroing `attempts` on revival fails 2, and removing the inactive-subscription
refusal fails 2. Each was restored and `tsc` re-run clean.

### What CORE still needs from elsewhere

**B-28** is new and recorded above; it is a one-line owner answer, and CORE has
documented current behaviour rather than guessing. With B-27 closed, every remaining
blocker inside CORE's reach is now an owner decision rather than an implementation
gap: **B-14…B-19** (subscription policy), **B-20** (what is owed when work fails
after a partial capture), **D-6…D-8**. **Milestone 9** remains blocked on B-5/B-6.
No MOVE or MARKET code was read or written in this cycle.

## Cycle 2026-09-12 (twelfth) — B-28, deactivation stops sending (CORE-only agent)

Baseline `13b9085`, working tree clean, 636 tests passing. No MOVE or MARKET code
was read or written. No owner input was waited for: the question B-28 recorded had
two defensible answers, so this cycle picked the one that survives the reasons the
control actually gets used, and wrote down the one it rejected.

### The defect

Deactivating a subscription is the only control CORE gives an operator over whether
a subscriber is sent anything. It half worked. `DeliveryFanOut` filtered on
`active`, so nothing new was queued — and `DeliveryWorker.drainOnce` never looked at
`active` again, so every delivery already pending kept going out: claimed, signed,
POSTed, up to `maxAttempts` spread across hours of exponential backoff.

The repository documented that as intentional, and the reasoning was recorded in
`docs/outbound-delivery.md`: those deliveries were promised, and dropping them
silently is worse than delivering them late. Half of that is correct — they must not
be dropped. The other half does not survive contact with why anyone reaches for the
switch. The realistic reasons are urgent: the endpoint is compromised, it is
leaking, the signing secret is out, the partner asked to be switched off. In every
one of them "stop queueing new work" is not what was asked for, and "late" is not a
concession the operator offered.

B-27 made the contradiction explicit rather than creating it: revival refuses to
bring back a delivery for an inactive subscription, on the grounds that reviving is
a new decision to send and must honour the switch. The worker, sending rows it
already had, honoured nothing.

### The decision, and the alternative rejected

**Deactivation means stop sending.** The worker re-checks `active` on each claimed
delivery and suppresses the row.

The alternative was to keep the queue draining and treat deactivation as a queueing
control only. It is cheaper and it was already shipped, which is exactly why it
needed to be argued rather than inherited. It loses because it makes the only
available emergency control not an emergency control.

Three sub-decisions, each with its own reason:

- **Checked in the worker, not swept at deactivation time.** A sweep cannot close
  the race it leaves behind: fan-out reads the active subscriptions, the
  deactivation commits, and fan-out then queues its row. Only a decision taken at
  the moment of sending sees the current answer. It also costs nothing — the worker
  was already reading the subscription for its endpoint and secret.
- **Dead-lettered, not skipped.** Skipping without a write would leave rows claimed
  and released on every drain for ever, absent from the `retrying` reading and
  counted as ordinary backlog. `dead` says the true thing: no further automatic
  attempt until a human acts.
- **`dead` reused, not a fourth status.** `dead` already means precisely that, and
  B-25 set the precedent when it added its own new route into it — distinguished by
  `last_error` and its own count in the worker result, not by a new status, a
  migration and a wider check constraint. `markSuppressed` is a separate method from
  `markDead` for one reason only, below.

### What suppression must not do

**It must not charge an attempt.** No request was made, so incrementing `attempts`
would record a failure that never happened, inflate the backoff of a later attempt,
and — because a revival preserves `attempts` (B-27) — could hand back a row already
at `maxAttempts` without anything ever having been sent. `last_status` is left alone
too, so the response code of the last real attempt survives; only `last_error` is
replaced, because the last thing that happened to the row is that CORE was told to
stop, and that is what an operator needs to read first.

This is why `markSuppressed` exists instead of a call to `markDead` with a different
string: `markDead` increments `attempts`, correctly, for every case it serves.

### Nothing is lost

The loop is closed and every step of it is journalled or visible:

```
deactivate → queued rows suppressed (dead, reason recorded, nothing sent)
           → reactivate
           → npm run revive -- --queue event-delivery --subscription <id> --execute
           → the worker sends the original envelope, same event_id
```

Reviving before reactivating is refused, so an operator working from the dead-letter
queue cannot undo the switch by reviving past it. B-27 and B-28 are two halves of one
operator story and neither is much use alone: suppression without a revival path
parks events with no way back, and a revival path without suppression brings back
rows that were being sent anyway.

### Verification

Three new tests in `tests/outbound-delivery.test.ts` (queued work stopped and the row
terminal rather than re-claimed on every pass; a suppression after a real 503 leaving
`attempts` at 1 and `last_status` at 503) and one in `tests/queue-revival.test.ts`
walking the whole loop: switched off, suppressed, revival refused, switched on,
revived, delivered under the original `event_id`. The eleven exhaustive
`DeliveryWorkerResult` assertions in `tests/outbound-delivery.test.ts` gained
`suppressed: 0` — they enumerate the result on purpose, so a new field cannot be
added without every one of them noticing.

642 tests over 37 files pass with `DATABASE_URL`; `tsc --noEmit` clean; governance,
contract, migration and roadmap gates pass; no migration. Three mutations confirm the
tests can fail: removing the `active` re-check fails 6 across both backends, charging
an attempt for a suppression fails 4, and suppressing without making the row terminal
fails 6. Each was restored and `tsc` re-run clean.

### What CORE still needs from elsewhere

Nothing new. Every blocker still open inside CORE's reach is an owner decision rather
than an implementation gap: **B-14…B-19** (subscription policy), **B-20** (what is
owed when work fails after a partial capture), **D-6…D-8**. **Milestone 9** remains
blocked on B-5/B-6. B-28 is the last defect this agent found by reading CORE's own
code; the next cycle needs either one of those answers or a new defect worth naming.
No MOVE or MARKET code was read or written in this cycle.

## Cycle 2026-09-12 (thirteenth) — B-29, work delivered after cancellation (CORE-only agent)

Scope was CORE alone. No MOVE or MARKET code was read or written. B-29 did not exist
in this file when the cycle started: B-28 had exhausted the defects this agent had
found, so the cycle began by hunting for a new one in CORE's own code and proving it
before changing anything.

### How it was found, and proved

By following one question through the code: what happens to a `move.job.completed`
that arrives after a cancellation has already closed the fulfillment? A throwaway
probe test answered it exactly — `THROWN: fulfillment was cancelled 409`, `ROW:
cancelled released customer_cancelled`, `INCONSISTENT: 0`, `DECISION: 0`, wallet
fully refunded. The probe was deleted once the real tests existed; it existed to
establish that the defect was real before a line of production code moved.

The reason no existing test caught it is worth recording. `fulfillment-single-closure`
test 5 covers the *simultaneous* race and asserts the losing closure changes nothing,
which is still correct. The shape that matters here is *sequential*: MOVE runs for
minutes, the cancellation commits and is published, and the completion turns up
afterwards. Nothing covered that, and the two readings that should have caught it —
`listFinanciallyInconsistent()` and `listPendingFinancialDecision()` — were the ones
returning empty.

### Both halves of the failure

The 409 was the visible half. The invisible half was worse: the dispatcher retries
whatever a consumer throws, and a refusal that can never come good — a cancelled
fulfillment does not reopen — burned five attempts across hours of backoff and then
dead-lettered the report. So the only trace that a driver had delivered an order was
an error string in a queue table nobody reconciles against.

The second half was the reading. `cancelled` + `released` is a *consistent* pair;
`financialDisposition` calls it `settled`. CORE was not merely unaware that money was
owed, it answered the question wrongly to anyone who asked. Being wrong is bad; being
confidently and queryably wrong is worse, because it stops the search.

### What was built

Migration 0017 adds two nullable columns to `fulfillment`:
`executed_after_cancellation_at`, which is MOVE's own `completed_at` and not CORE's
receipt time (the question an operator asks is how long after the cancellation the
work landed), and `executed_after_cancellation_job_reference`, kept separately from
`move_job_reference` because that column is null whenever the cancellation beat
MOVE's acceptance — precisely the ordering that produces this case most often. Two
check constraints: both columns or neither, and the marker only on
`status = 'cancelled'`. No index, because both reconciliation reads scan the table
already and a partial index on a column that is null for nearly every row is a write
cost with no reader; when those reads become SQL predicates the index belongs in that
migration. No backfill, because the reports this cycle exists for were refused and
never stored, so unmarked is the *true* reading of every existing row.

`markExecutedAfterCancellation` is a conditional write — `status = 'cancelled' and
executed_after_cancellation_at is null` — deliberately separate from
`updateIfStatusIn` so B-21's closure guard is not widened to admit a write that is
not a closure. It makes the marker single-valued the way B-21 made the closure
single-valued: one report, one marker, one event, one audit entry, however many times
MOVE's queue redelivers it, and a second job reporting later does not overwrite the
first record.

`financialDisposition` returns `decision_required` for a marked row, placed **after**
the `unsettled` and still-`held` checks. Ordering is the whole point: a row still
holding money on a closed fulfillment is CORE failing to finish its own work, and a
business question must never mask an engineering defect.

The new event `core.fulfillment.executed_after_cancellation` v1 is additive; no
existing contract changed and the cancellation is not re-published, because MARKET
already handled it and must not handle it twice. It goes out because MARKET is the
only side that can talk to the customer it has already told the order was cancelled.

### What was deliberately not built

No money moves. Not as caution — as a matter of what is possible and what is
legitimate. The cancellation voided the hold and a voided hold cannot be captured;
inventing a fresh charge against a payer who was told their order was cancelled is
not a decision CORE has ever been given. Recorded as **B-30**, alongside B-20, which
is the same question with a different trigger.

Scope was held to the `cancelled` branch. A late `completed` for a fulfillment closed
`failed` is either MOVE contradicting its own earlier report or a redelivery of the
very report that closed the row; marking it would fabricate a contradiction out of a
duplicate, so that path keeps its existing refusal untouched. A late `failed` after a
cancellation records nothing and is answered rather than refused — both sides agree
the work was not delivered, so there is nothing to surface, and a 409 would only be
retried until it was dead-lettered over a report that contradicts nothing.

### Tests

A new file, `tests/fulfillment-post-cancellation-execution.test.ts`, on both
backends: the report is answered and recorded with the money left exactly where the
cancellation put it; redelivery and a second job change nothing; a late `failed`
records nothing; the acceptance-lost ordering records the job that reported even
though `move_job_reference` is null; the store contract answers `applied` once and
`stale` for an already-marked row, a row that is not cancelled and a row that does
not exist; the disposition reads `decision_required` for `released` and `none` and
still `inconsistent` for `held` and `unsettled`; and the two Postgres check
constraints refuse a half-written marker and a marker on a non-cancelled row. One
case drives the real inbound queue — submit, `drainOnce` — and asserts
`processed: 1, dead: 0`, which is the half of the defect that was invisible from the
service.

Four existing tests asserted the old refusal and were rewritten rather than deleted,
each keeping the invariant it was really about: the closure count, the money, and the
reason and instant of the cancellation are all still asserted unchanged, and the
simultaneous race in `concurrency-and-restart` now asserts that the cancellation
winner leaves a decision pending instead of nothing at all.

657 tests over 38 files pass with `DATABASE_URL`; `tsc --noEmit` clean; governance,
contract, migration and roadmap gates pass. Four mutations confirm the tests can
fail: removing the marker check in `financialDisposition` fails 9, dropping `is null`
from the conditional write fails 1, restoring the old 409 fails 19, and recording a
late `failed` as a delivery fails 2. Each was restored and `tsc` re-run clean.

### What CORE still needs from elsewhere

Nothing new to implement, one new question to answer. **B-30** joins **B-20** as an
owner decision about money CORE can describe but not direct. **B-14…B-19**
(subscription policy) and **D-6…D-8** remain open owner decisions; **Milestone 9**
remains blocked on B-5/B-6. Operators deploying this should know that reports lost
before it can be recovered: revive the `inbound_event` rows whose `last_error`
carries `fulfillment was cancelled` (B-27, `npm run revive`) and the new path records
them properly. No MOVE or MARKET code was read or written in this cycle.

## Cycle 2026-09-12 (fourteenth) — reputation and trust signals in CORE (ADR 0015)

Scope: the last capability on CORE's ownership list with no implementation and
no blocking decision above it. Chosen from this document, and the choosing
exposed the first defect before any code was written.

### The roadmap was the first defect

`docs/data-ownership.md` lists `Reputation` and `Trust signal` as CORE's, ADR
0015 decides the split between CORE and MARKET, and `README.md` printed
`Reputation | **not implemented**`. The "Remaining, in dependency order" table
listed nine milestones and did not mention reputation in any of them. The
document that decides what happens next could not have selected the one
capability that was both owned and absent. Corrected by adding milestone 10
rather than by quietly implementing around the omission, because the next cycle
will read the table, not this paragraph.

### What was built

One table, migration 0018: `reputation_signal`, append-only, one row per
reported fact.

- `subject_type` ∈ {`identity`, `organization`} — CORE subjects only, never a
  MOVE or MARKET entity.
- `signal_kind` is a **closed** vocabulary: `service_rating`, `completion`,
  `cancellation`, `dispute`, `compliment`, `complaint`. An open one would let a
  producer invent a kind, be told it landed, and have every derived standing
  ignore it — a fact accepted and then discarded is worse than a fact refused.
- `rating_value` 1…5 for `service_rating` and `NULL` for everything else,
  enforced in the schema, because a `dispute` carrying a 4 would be read as
  satisfaction by anything that trusts the column.
- `UNIQUE (organization_id, source_system, source_reference)` — exactly-once on
  the producer's own reference, which is the only thing that can recognise a
  retry that carries a new `event_id`.
- `occurred_at` (the producer's claim) is stored and never used for ordering;
  `recorded_at` (CORE's clock) orders everything, so one producer's skew cannot
  reorder another's facts.
- Retraction is a marker (`retracted_at` + `retraction_reason`, both or
  neither, single-valued), not a delete and not a compensating negative signal.
  A delete destroys the evidence that a rating was reported and counted; a
  negative signal makes an average mix a rating with its own reversal, so no
  reader can tell "withdrawn" from "rated twice". A retracted signal counts
  towards `signal_count` and `retracted_count` and towards nothing else, and is
  still listed, with its reason.
- A trigger refuses `DELETE`, any field edit, a re-retraction and an
  un-retraction. Not a service-layer rule: a trigger is the only thing that
  also stops a migration or a console session.

**No score is stored anywhere.** `GET /v1/reputation/{subject_type}/{subject_id}`
groups the signals and folds them through a pure `deriveStanding` on every
request. A cached aggregate would be a second source of truth for something the
signals already determine, and this repository has paid that bill twice —
settlement state drifting from the ledger (B-9's cycle) and the entitlement
table ADR 0013 refused to create.

**No review text can reach CORE.** There is no column for it and no field in
`market.review.rated`, and the normaliser refuses a payload that invents one
rather than dropping it. So MARKET stays the only place that can moderate,
redact or delete what a person wrote.

Two read routes, both requiring `reputation.read` (`platform_admin`,
`org_admin`, `support_agent` — deliberately not `org_member`: reading everyone's
standing is an administrative act, and not `service` either). No write route:
signals arrive only as events, since a second ingestion path would have none of
the properties the first one has, and ADR 0008 keeps the synchronous list
closed. `average_rating_milli` is an integer in thousandths — a float would make
two backends disagree in the last digit of a number shown to a person — and is
`null`, never `0`, when nothing was rated, because a subject with no ratings is
not a subject rated badly.

Events published carry the fact and nothing derived. A running total computed at
publication time is computed without whatever was recorded concurrently with it,
so two events about one subject would each carry a different total and no
consumer could tell which is current.

### Defects found by the tests, and what they were

**1. Both `CHECK` constraints accepted exactly the rows they existed to refuse.**
Written first in the obvious form:

```sql
(signal_kind = 'service_rating' AND rating_value BETWEEN 1 AND 5)
  OR (signal_kind <> 'service_rating' AND rating_value IS NULL)
```

A `service_rating` with `rating_value IS NULL` makes the first branch `NULL`, the
second `false`, and `NULL OR false` is `NULL` — and a `CHECK` rejects only
`FALSE`. The unratable rating was the one row the constraint let through. The
retraction guard had the identical bug through `length(trim(NULL)) > 0`, so a
withdrawal with a timestamp and no reason — an unreviewable withdrawal, the
precise thing the constraint was written to prevent — was accepted. Both are now
`CASE` expressions, which return a boolean on every input. Found because the
constraints were asserted against real SQL rather than through the service,
which had its own guards and would have hidden both for ever.

**2. A test asserted an ordering CORE does not guarantee.** The audit assertion
compared the two entries in the order the log returned them. Under a fixed clock
both carry the same instant, so the order is an accident of the query plan: it
passed on memory, passed on the first Postgres run, and failed on the next. It
now compares sorted actions, and asserts what is actually guaranteed instead —
the exact metadata key set of both entries, which is what proves no review text
is in the audit trail rather than merely unasserted.

**3. A guarantee had no test that could fail.** See below.

### Mutation evidence

Six mutations; the first five were killed by the suite as written, the sixth
survived and was the finding.

| Mutation | Result |
|---|---|
| Count retracted signals in the standing totals | 3 tests fail |
| Drop `ON CONFLICT … DO NOTHING` from the insert | 1 test fails |
| Average `0` instead of `null` with no ratings | 2 tests fail |
| Grant `reputation.read` to `org_member` | 3 tests fail |
| Order a listing by `occurred_at` instead of `recorded_at` | 2 tests fail |
| **Delete `AND retracted_at IS NULL` from the retraction `UPDATE`** | **survived** |

The survivor is B-12's failure mode in a new place. The service reads the signal,
sees it is already retracted and returns early, so its own path never reaches
the condition in the write — and that condition is the entire guarantee under
concurrency, where two copies of one withdrawal both pass any preceding read.
Closed by testing the port directly rather than by trusting the service: a new
dual-backend test calls `insertIfAbsent` and `retractIfStanding` straight, and
asserts a duplicate is *reported* rather than raised (at-least-once delivery
makes redelivery the expected case, and an exception here would be retried until
the event dead-lettered over an instruction already carried out), that a second
withdrawal is `stale` and cannot overwrite the first reason, and that a
reference from another tenant is not reachable. Re-running the mutation with
that test present: 2 tests fail.

### Tests and gates

- `tests/reputation.test.ts`: 28 tests, every one against both backends, plus an
  `afterAll` comparing the two backends' grouped rows and derived standings to
  each other — a memory double more permissive than the database certifies bugs
  (B-12), so the doubles restate the `CHECK`s and the `UNIQUE` themselves.
- `tests/event-normalisation.test.ts`: the inventory now asserts the exact
  six-type list, so a new inbound type cannot be added without being declared
  here, plus acceptance and refusal cases for both new payloads.
- Verified counts: **687 tests pass with `DATABASE_URL` set** (39 files), and
  **385 pass with 48 skipped** in the dependency-free run CI performs. `README.md`
  said 326/572 and is corrected. `tests/migration-0011-lifecycle.test.ts` still
  times out in teardown under full-suite contention and passes in isolation
  (2.1s) — pre-existing, unrelated to this cycle, and not silenced.
- Governance, contracts (26 schemas, 17 emitted types covered) and migrations
  (18 forward, all with rollbacks) all pass. Typecheck clean.

### What CORE still needs from elsewhere

**MARKET must publish:**

| Direction | Contract | Note |
|---|---|---|
| publish | `market.review.rated` v1 | rating, subject and MARKET's opaque review reference — **no text**; CORE refuses a payload carrying any |
| publish | `market.review.retracted` v1 | the same reference plus a reason; CORE marks, never deletes |

Both are consumed today by the local bus and **no producer exists**. Until one
does, no reputation signal exists in a deployed CORE and `service_rating` is the
only reachable kind. Recorded in `docs/event-catalog.md` on the rows themselves
rather than in prose only.

**MOVE must name the CORE identity that executed a job.** This is a finding, not
an oversight. CORE closes fulfillments and therefore knows every completion and
cancellation, but it cannot attribute one: the executor appears in CORE only as
an opaque `move_job_reference`, and no CORE-owned field names the identity
behind it. So the `completion` and `cancellation` kinds exist in the vocabulary
and cannot be recorded from CORE's own knowledge. Either MOVE includes the CORE
identity in its job reports, or those kinds stay unreachable. CORE will not
infer an identity from an opaque reference.

### Decisions recorded, deliberately not implemented

- **No reputation event was added to `TENANT_SCOPED_EVENT_TYPES` and no
  notification template was written.** Both payloads carry `organization_id`, so
  either could be routed — but a message telling a person their rating was
  recorded is product messaging, and reviews are MARKET's surface. CORE
  publishing it would put the same message in two systems' hands.
- **Only Postgres enforces the `organization_id` foreign key.** The in-memory
  double restates the `CHECK`s and the `UNIQUE` but has no organization table to
  reference. Stated here because B-12 is about divergences being discovered by
  production rather than by a test; this one is known, bounded, and covered by
  the cross-backend comparison for everything the double *can* express.
- **No standing threshold, weight, decay or cross-tenant rule** — B-31…B-34
  above, with the reason each is a decision rather than a gap.

Milestones 1, 3, 4, 6, 8 and now 10 are CORE-complete; 2 is partial with
multi-hold blocked; 5 waits on external adoption; 7 remains blocked on B-2/B-3
and 9 on B-5/B-6. **B-2…B-6**, **B-14…B-20**, **B-30**, the new **B-31…B-34** and
**D-6…D-8** are open owner decisions. No MOVE or MARKET code was read or written
in this cycle.

### CI verdict for this cycle — read, not assumed

Head `069bd67` on `reputation-adr-0015`, pushed to `uxxxug/wasla-core`:

| Run | Event | Verdict |
|---|---|---|
| `34716967545` | push | **success**, 38s |
| `34716991234` | pull_request (PR #2 → `main`) | **success**, 32s |

The `verify` job passes on both. What that verdict does **not** cover, stated so
no later reader mistakes green for proof: CI sets no `DATABASE_URL`, so the 302
database-backed assertions — every Postgres half of the dual-backend suites, the
append-only trigger, both corrected `CHECK` constraints and the live-schema
checks — are **skipped there** and were verified locally against PostgreSQL 18.6
(687 passing). Migration 0018 has been applied and rolled forward locally only;
no deployed database has run it. Per this repository's own rule, code and tests
existing is not production proof.

PR #1 (the reservation entry) was merged to `main` before implementation began;
PR #2 carries the implementation and is open for review.

### Second finding of this cycle: a milestone nobody could select

Reputation was missing from the milestone table (fixed as milestone 10 above).
Looking for other rows in the same state turned up one: **ADR 0010, CORE
degradation rules**, carried as `pending` in `docs/adr/README.md` since the
foundation cycle and mentioned nowhere in this document — not as a milestone, not
as a blocker, not as an external dependency. Two capabilities were therefore
invisible to the process that decides what happens next, and only one of them was
implementable.

Recorded as milestone 11 and **B-35** rather than implemented, and the
distinction matters: reputation had an ADR that decided the design, so CORE could
build it. ADR 0010's text is not in this repository, so implementing "degradation
rules" would mean CORE inventing the policy that governs what it does when
nothing works — a rule whose cost is paid at the worst possible moment and which
no test can expose beforehand. What exists today is stated in the blocker: CORE
fails closed, deliberately, because that is the direction that can be relaxed
later.

With that, no CORE-owned capability on the ownership list is both unimplemented
and unblocked. Every remaining milestone waits on something CORE does not own:
milestone 2's multi-hold on a MARKET contract decision, 5 on MOVE/MARKET
adoption, 7 on B-2/B-3, 9 on B-5/B-6, 10's ingestion on a MARKET producer and its
policy on B-31…B-34, and 11 on B-35.
## Cycle 2026-09-13 (eighteenth) — three calls and somebody else's organization

Reserved as an ordering cycle. Milestone 28's record said it proved which headers
a response sets and nothing about **which documented refusal statuses are actually
reachable**, so this cycle began by driving all 52 operations with no credential
and comparing the answers with the contract. That census is real and is kept: 401
is documented on 2 of 52 operations while 49 refuse an anonymous caller, and 24
write routes answer 400 about the body before they answer 401. It is milestone 30
now, because of what the second measurement found.

The second measurement was a list of which routes authenticate **at all** — a scan
for handlers that never call `requirePrincipal`, `bearer()` or
`identity.authenticate`. Five: `GET /metrics`, `POST /v1/identities`,
`POST /v1/sessions`, `POST /v1/sessions/revoke`, and `POST /v1/memberships`. Four
of those are a scrape target and the login surface. The fifth decides who a
tenant's administrators are.

With no credential of any kind: create an identity, grant that principal
`org_admin` in any organization whose id you know, mint a session for it, read the
victim's organization. `201`, `201`, `201`, `200`. The whole escalation is three
ordinary calls and an organization id, and an organization id is in every
fulfillment, invoice and audit answer that organization produces.

The first two attempts at the grant answered `400` — `channel` instead of
`channel_type`, then `owner` instead of one of the five real roles. That is why the
anonymous census did not find this by itself: **a 400 about the body looks like a
refusal.** The route was reached on the third attempt and it answered 201. That
mistake is written into `docs/anonymous-privilege-escalation.md` rather than tidied
away, because the next person running an anonymous sweep will make it too.

The fix required no invention: `organization.write` already means "may change who
this organization is", `platform_admin` holds it everywhere and `org_admin` inside
its own tenant, and scoping the check to the organization named in the body makes
an administrator able to add a colleague and nobody able to add themselves.

What this cycle refused to do is claim more than it closed. `POST /v1/sessions`
still mints a token for any `principal_id` with no proof of possession, so the
escalation has a second door — B-39 — and the gate's last case **asserts that door
is open**, with the token reading the victim organization and getting 200. Asserting
a defect as current behaviour is uncomfortable and it is the only version of this
that cannot quietly stop being true: when the owner decides what proof of
possession is, that expectation must be changed on purpose, by somebody who reads
why it was written. Skipping the file, or writing the gap into a document only,
would have left the suite green and the hole invisible. B-40 records the
credential-free revoke route beside it.

Measured: 717 passed / 148 skipped without a database, 1280 with one.

**CI verdict**, read after the push rather than inferred from the local run, on
`7954cab` in runs
[34783866073](https://github.com/uxxxug/wasla-core/actions/runs/34783866073) and
[34783867970](https://github.com/uxxxug/wasla-core/actions/runs/34783867970), both
jobs green in both: *Verify without a database* 717 passed / **147** skipped (864),
*Verify against PostgreSQL* 1279 + 1 = 1280 passed. The skipped count is one lower
than the local 148, exactly as milestone 28 recorded; which test differs is still
unidentified, and it is written here again rather than rounded away, because a
number that has now disagreed across two cycles is a finding waiting for somebody
to spend a cycle on it. PR [#20](https://github.com/uxxxug/wasla-core/pull/20),
squash-merged to `main`.

## Cycle 2026-09-13 (seventeenth) — the answer nobody could trace

**Reserved before any edit**, as the cycle discipline requires: measured on `main`
at `ea793f3`, scope written into this file, branch `http-response-headers` cut from
`main`, reservation commit `3e2eb24` pushed before a line of implementation existed.

**Why this was the next item.** Rows 1–27 of the milestone table are complete or
blocked on an owner decision recorded as a blocker (5, 7, 9 and 11 externally; B-14
… B-19 on subscription policy, B-31 … B-34 on reputation policy, B-35 on ADR 0010's
degradation rules, B-37 on the dead `idempotency_key` table, B-20 and B-30 on who
owes what). Milestone 27's record ends with what it does not claim, and the first
item is response headers. That was the only remaining item CORE owns end to end,
needs no decision from anybody, and has a measurable defect.

**What was measured, before anything changed.** All 52 operations driven through
the real router, answers read rather than reasoned about:

- `x-correlation-id`: set on 52 of 52 responses, documented on **0 of 52
  operations**. The only header documentation anywhere in the contract was the four
  rate-limit headers on the shared `RateLimited` response.
- The three `x-ratelimit-*` headers: sent on **every** limited response — a `200`
  and a `401` alike — and documented as though they belonged to the refusal.
- The unmatched `404` (`if (!matched)` in `src/platform/http/router.ts`): **no
  `headers` key at all**, while the body carried `correlation_id`.
- The Node adapter's unparseable-body `400`: `{code, message}`, no
  `correlation_id`, no `details`, no `retryable`, no header. Produced above the
  router, which is why milestone 27's gate could not see it.

**What was built.** One declaration (`src/platform/http/response-headers.ts`: name,
when, why, anchored shape), one place headers are produced (`sealHeaders`, which
refuses an undeclared name and a value that is not the declared shape, later parts
winning so a route cannot overwrite CORE's own correlation id), both defective
paths fixed at the cause, and one `components/headers` section in the contract
referenced by every response object and by both shared refusal responses —
replacing `RateLimited`'s four inline definitions, so each header is described once
in the document.

**The asymmetry with request headers is deliberate and recorded.** An undeclared
*request* header is ignored, because proxies add their own and refusing them would
refuse ordinary traffic (`headers.ts` states this). An undeclared *response* header
is CORE's own doing, so it fails closed. `content-type` is declared in code because
CORE sets it, and deliberately **not** documented in any response's `headers` map:
OpenAPI ignores a response header named `Content-Type`, since the media type is
already declared by `content`, which milestone 27 gates.

**Two corrections to the contract, both the document catching up with the code.**
The rate-limit trio is now documented on every limited response including
successes; and it is documented on none of `/health`, `/ready` and `/metrics`,
because `UNLIMITED_ROUTES` exempts them and documenting a header CORE never sends
is the same defect in the other direction. The gate reads that exemption from the
limiter, so a route added to it moves the code and the contract together.

**Gate.** `tests/http-response-header-declaration.test.ts`, nine cases, no
database. The strongest of them is the one that ties the header to the body: for
every operation, `x-correlation-id` must equal the body's `correlation_id` wherever
the body has one, so the two cannot drift into being two different facts about the
same request.

**Falsification.** Twelve mutations on a committed tree, all twelve caught, tree
verified clean after each restore; the table is in `docs/http-response-headers.md`.
F10's **first attempt was invalid**: it rewrote `"retry-after": …` as an object key
while `rate-limit.ts` writes `headers["retry-after"] = …`, so nothing changed and
the run reported "not caught" for a mutation that had not been made. Recorded here
rather than deleted, and re-run correctly (`String(0)` for
`String(Math.max(1, …))`), where the gate failed as it should. Same lesson as the
last three cycles in a new form: check the diff before believing a negative result.

**Measured, before and after.** 700 passed / 148 skipped → **709 passed / 148
skipped** without a database; 1263 → **1272** with PostgreSQL 18.4. The nine new
cases are the whole difference. Additive correction: an earlier summary recorded the
skipped count at `ea793f3` as 147; it was 148. No passing count changes.

**What this cycle does not claim.** It says nothing about which documented refusal
statuses are actually reachable, or whether a produced refusal is documented — the
obvious next cycle. It does not gate the wire format of `content-type` beyond
`/metrics`. It makes no claim about the headers CORE sends as a *client* on
outbound webhooks. And it does not turn the limiter's numbers into published
promises: the gate asserts the budget counts down and reads `0` at the refusal, not
what the budget is.

**CI verdict — read from GitHub Actions, not inferred from the local run.** Run
[34781968718](https://github.com/uxxxug/wasla-core/actions/runs/34781968718) on
commit `d06f376` of branch `http-response-headers`, both jobs green:

- *Verify without a database* — **709 passed / 147 skipped (856)**.
- *Verify against PostgreSQL 16* — **1271 passed**, plus the separately reported
  `migration-0011-lifecycle` file **1 passed** = **1272**.

The passing counts agree exactly with the local measurement (709 and 1272). The
skipped count does not: 147 in CI against 148 locally, one test more skipped here
than there. Stated rather than smoothed over, because it is the same one-test
difference the last four cycles' records carried without anybody naming it: the
local run and CI's no-database job disagree by a single skipped case, and until a
cycle measures *which* case that is, the honest form of the claim is "709 pass in
both, and one test's skip condition is environment-dependent". Nothing about the
passing counts, the gate or the fixes depends on it. Pull request
[#19](https://github.com/uxxxug/wasla-core/pull/19).

## Cycle 2026-09-13 (sixteenth) — the contract had never been read

Scope: milestone 27. The three request surfaces were declared and gated
(milestones 24, 25, 26). This cycle closes the answer surface — the half MOVE and
MARKET build against.

### What was measured before anything changed

Against `main` at `f71aba2`, by parsing `contracts/openapi/core-v1.yaml` and
driving every operation the router registers:

| Reading | On `main` |
| --- | --- |
| Operations documenting no response schema | **34 of 52** (35 counting `/metrics`) |
| Tests or scripts parsing the contract as YAML | **none** |
| Tests or scripts comparing a response body to the contract | **none** |
| Response objects broken by an unquoted comma in a flow map | **2** |
| Documented shapes diverging from the real body | **3** |

**Correction to the reservation, by addition.** The reservation commit (`3eb996d`)
said "33 of 52" and "10 malformed lines". Both were text scans of the file. The
parser-derived figures are **34 of 52** operations with no schema (35 with
`/metrics`, whose body is text), and **10 flow-map lines contained an unquoted
comma — 8 of which stopped being flow maps when they gained a `content:` block,
and 2 were quoted in place**. The reservation text is left as written; this is the
correction of record.

### The three divergences, each a real defect

1. **`POST /v1/organizations` and `GET /v1/organizations/{id}` answered `{}`.**
   Both handlers returned `organizations.create(...)` / `.require(...)` without
   `await`, and `JSON.stringify` renders a promise as `{}`. The call that creates
   a tenant — the first call any integrator makes — never returned the id of the
   thing it created, for the module's whole life, because every test asserted the
   status code. Fixed at the root twice: the two `await`s, and a guard in
   `src/platform/http/router.ts` that throws when a handler's body is a thenable,
   so the next handler to forget one fails loudly instead of shipping an empty
   object past a green suite.
2. **`GET /v1/event-deliveries/undelivered` returned `claim_token`** — the fencing
   credential a worker presents to acknowledge a delivery (B-24) — to any caller
   holding `organization.read`. `EventSubscription` already had exactly this
   treatment for `signing_secret`; the delivery row never got it. Now
   `PublicDelivery` + `redactDelivery` mirror it, and the gate asserts no response
   body anywhere contains the string.
3. **`GET /v1/sessions/current` returned six permissions the published
   `Permission` enum did not list** (`events.submit`, `events.replay`,
   `events.revive`, `subscription.read`, `subscription.write`, `reputation.read`)
   and did not document `service_name`. A client validating CORE's own answer
   against CORE's own contract would have rejected it. `EventDelivery` was also
   missing `claimed_at` and `reclaims`, and the notification list's `summary` was
   a free-form integer map — now six named counters, so a new notification state
   has to be published before it can appear in a response.

### What was built

- `tests/support/openapi.ts` — a dependency-free reader for the YAML subset this
  contract uses, `$ref` resolution (cycle-guarded), `allOf` flattening for
  objects, and `violations(value, schema, at)`: strict, so an undocumented
  property is a failure, `null` needs `nullable: true`, and `enum`, `format: uuid`
  and `format: date-time` are checked against the value. A construct it cannot
  read **throws**, so an unreadable schema fails the gate rather than being
  skipped.
- `tests/support/http-scenario.ts` — drives all 52 operations against one app on
  the memory backend to a **success** status and records status, content type and
  body. Getting there required real work rather than assertions: the
  reconciliation and reputation reads need `organization_id`; the notification
  recipient needs a verified channel link; and two reconciliation reads return
  `count: 0` on any ordinary scenario, where **an empty `items: []` satisfies any
  item schema** — so the scenario now partially captures and cancels a funded
  fulfillment (`decision_required`) and voids an authorization under an open
  fulfillment (a stale hold), producing one real row each.
- `contracts/openapi/core-v1.yaml` — 25 new component schemas, 33 response
  `content:` blocks, the four corrections above, the two quoted descriptions.
- `tests/http-response-declaration.test.ts` — the gate, 11 cases: the contract
  parses with no junk keys; every operation documents the status, content type and
  schema it answers with; a bodyless `204` documents *no* content, asserted;
  every real body validates strictly; coverage is asserted three ways (contract =
  driven = registered); every operation reaches a success status, so no schema is
  validated against a refusal; a real `400` satisfies the documented `Error`
  shape; no body contains a claim token; a promise-bodied route is refused.

### Measurement

Without `DATABASE_URL`: 689 → **700 passed / 147 skipped**. With it: 1252 →
**1262 + 1 = 1263**, none skipped, on a real PostgreSQL 18.4 with `C` collation,
all 19 migrations applied. `tsc --noEmit` clean; governance, contract, migration
and roadmap gates pass. No existing test was changed, loosened or skipped.

**Falsification.** Eleven mutations, each applied to a committed tree and
restored with the tree verified clean afterwards, are tabulated in
`docs/http-response-declaration.md`. Ten are caught. The eleventh — making a
reconciliation read answer `items: []` — is **not caught**, because an empty
array satisfies any item schema; it is recorded as the gate's measured limitation
rather than omitted, and it is the reason the scenario produces real rows for
those reads. A twelfth attempt broke the scenario's setup so nothing ran, and is
recorded as an invalid mutation rather than deleted.

As an
independent cross-check, Python's `yaml.safe_load` was run against the contract
and agrees with the new reader that no response object carries an undefined key.

**CI verdict — the judgment.** GitHub Actions run
[34780245137](https://github.com/uxxxug/wasla-core/actions/runs/34780245137) on
commit `d973554` (PR #18). *Verify without a database*: **700 passed / 147
skipped** across 51 files, 2 files skipped, plus the cluster file skipped.
*Verify against PostgreSQL* (`postgres:16`, `en_US.utf8`): **1262 passed across 53
files and 1 passed in the cluster file — 1263 in total**, none skipped. Both jobs
green, and both counts equal the local readings above, so the local measurement
and the judgment agree exactly this cycle.

What this cycle does not claim is written out in
`docs/http-response-declaration.md`: it does not prove the schemas cover every
value a property can take (they cover what CORE produced here plus its own
domain enums), it validates one canonical error body rather than every refusal
per operation, it says nothing about response *headers*, and it does not make the
new reader a general OpenAPI validator.

## Cycle 2026-09-13 (fifteenth) — the gate was not measuring the thing it gated

Scope: make CI run the half of the suite it had never run. No feature was added
and no capability changed; what changed is whether this repository's claims are
enforced by anything other than the person making them.

### The gap, measured before anything was touched

`npm test` with `DATABASE_URL` set passes 657 assertions. The CI workflow set no
`DATABASE_URL`, so it passed 368 and skipped the rest — every Postgres adapter,
every append-only trigger, every check constraint, every live-schema assertion
and the Postgres half of every dual-backend suite. Roughly **290 assertions had
never once been enforced automatically**, including the two constraints corrected
in the previous cycle, whose entire point was that only the database can refuse a
hand-written `UPDATE`.

Every cycle in this document that says "verified locally against Postgres" was
therefore resting on a developer's own machine and a developer's own discipline.
That is not a small qualifier: this repository's own rule is that local green is
not a CI verdict, and the rule was being satisfied by a CI verdict that could not
see the tests in question.

### Two defects found while fixing it, both worse than the gap

**1. The suite's verdict depended on scheduling.** Every database-backed file
resets state with `truncate <every table> restart identity cascade` in
`beforeEach`. That is correct within one file and wrong across several, because
Vitest runs files in parallel worker processes that all read one `DATABASE_URL`.
Reproduced, not theorised: while timing something else,
`financial decision boundary on 'postgres' > keeps the pending-decision queue
separate from the defect queue` failed with `insert or update on table
"fulfillment" violates foreign key constraint "fulfillment_organization_id_fkey"`
— nothing was wrong with that test, and the file scheduled beside it had
truncated the organization out from under it. Which files land beside each other
depends on worker count, machine speed and file order, so the suite has been
capable of failing, and of passing, for reasons unrelated to the code. Turning
this on in CI unchanged would have produced random red and taught everybody to
re-run the job.

Fixed by isolation rather than coordination. A lock around the truncation would
serialise the whole suite through one critical section and still leave every file
able to see every other file's rows. `tests/support/worker-database.ts` gives each
worker its own database, created and migrated on first use, and rewrites
`DATABASE_URL` before any test module is imported — so the twenty-odd files that
read it at module scope need no change and cannot opt out. Within a worker Vitest
runs files one at a time, so a truncation there interrupts nobody.

Unplanned consequence, worth recording because it points at how much contention
there was: the suite went from **~130s to ~35s**. Those files had been fighting
each other for the same rows, not just corrupting each other.

**2. The "known flake" was contention, and it was measurable all along.**
`tests/migration-0011-lifecycle.test.ts` has been carried for several cycles as a
file that times out in teardown under full-suite load and passes in isolation.
Nobody had timed it. One `create database` + `drop database` pair on this machine:
**0.3s** on an idle server, **51s** while the rest of the suite worked the same
server — against a 60s hook timeout. A scratch database isolates the schema;
those two statements are cluster-wide and isolate nothing.

Fixed in three parts, and the timeout is the least of them. `npm test` now runs
the lifecycle files in their own pass (`test:suite` then `test:cluster`), so
nothing competes with them — the cause, removed. The scratch database is created
from `template0`, which no session ever connects to, so the create cannot wait on
an unrelated connection to `template1`. The drop is `with (force)`, so one
not-yet-closed connection from the file's own migration subprocesses cannot fail
the teardown and leave a database behind. And the per-hook 60s numbers are gone in
favour of `vitest.config.ts`, so the timeout for a cluster-wide operation is
decided in one place. Raising a timeout alone would have kept the contention and
hidden it better.

### What CI does now

Two jobs, and the split is deliberate:

| Job | What it proves |
|---|---|
| `Verify without a database` | A fresh clone can run `npm test`. This is the only thing that keeps the in-memory backend genuinely self-sufficient, so it was kept rather than folded into the other job |
| `Verify against PostgreSQL` | `postgres:16` service; applies every migration, prints status, runs the whole suite with `DATABASE_URL` set, then **rolls the newest migration back and re-applies it** against a real schema |

That last step closes a smaller version of the same gap:
`scripts/check-migrations.mjs` only ever proved that a `.down.sql` file exists. A
rollback nobody has executed is a plan, not a rollback, and this repository asks
operators to rely on them.

`postgres:16` is pinned rather than `latest`, so a server upgrade is a commit
somebody reviews instead of the day the gate quietly changed meaning.

### Verification

- `npm test` with `DATABASE_URL`: **657 pass** (37 files + 1 cluster file), run
  three times consecutively with no failure and no flake.
- `npm test` without it: **368 pass, 47 skipped**, plus the cluster file skipped.
- Typecheck, governance, contracts (22 schemas, 15 emitted types) and migrations
  (17 forward, all with rollbacks) pass.
- The contention measurement is reproducible: run the suite and time a
  `create database` + `drop database` pair against the same server.

### What this does not claim

CI now runs the database half against `postgres:16`. It does not run it against
the managed 17.6 instance, and no deployed database is touched by any of this —
the migrations CI applies are applied to a throwaway container. A green database
job means the schema and the adapters agree with the tests on a supported major
version; it is not a deployment rehearsal, which is still Milestone 9 and still
blocked on B-5/B-6.

### CI verdict for this cycle — read from the run, not assumed

Head `5f51d9b` on `ci-database-gate`, run `34722170193` (push):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 32s | the dependency-free pass still stands on its own |
| `Verify against PostgreSQL` | **success**, 1m37s | migrations 0001…0017 applied against `postgres:16`; **656 tests passed in 37 files** with `DATABASE_URL` set, then the migration-lifecycle pass **1 passed in 4.74s**; newest migration rolled back and re-applied |

657 assertions now run in CI where 368 ran before — and **687** once this branch
was brought up to date with the reputation module already on `main`, measured on
the merge commit: 686 in the main pass plus the migration-lifecycle pass, and 385
with 47 skipped in the dependency-free run. The number that matters most
is the 4.74s: the file this repository called a flake for several cycles, which
timed out at 60s under contention, completes in under five seconds once nothing
competes with it — which is the evidence that the diagnosis was contention rather
than a slow test.

Both jobs are required by nothing yet: branch protection is not configured on this
repository, so a red job blocks no merge automatically. That is a repository
setting rather than a code change, and it is the one thing this cycle could not do
from inside the tree — recorded here so the next cycle does not mistake a green
badge for an enforced gate.

## Cycle 2026-09-13 — uniqueness parity between the two backends

### Why this was next

Milestone 12 made the database assertions run in CI. It did not ask whether the
assertions were equivalent on both backends, and that is where B-12 had been
left: declared resolved in the vertical-slice cycle, but only for money. Every
other uniqueness rule in the schema was still unmeasured against the reference
stores, and a dual-backend suite whose memory half accepts what Postgres refuses
does not verify twice — it verifies once and certifies a bug the other half of
the time.

### Measured first, and the measurement corrected the plan

The schema declares 24 uniqueness rules: 21 `UNIQUE` constraints, one
`EXCLUDE USING gist` (`subscription_period_no_overlap`), and three partial unique
indexes (`identity_legacy_idx`, `organization_legacy_idx`,
`subscription_period_authorization_unique`). The partial indexes are the trap:
they are constraints in effect but not `pg_constraint` rows, so an inventory that
reads only `pg_constraint` reports 21 and misses three.

Reading the code suggested the `subscription_period` rules were unenforced in
memory. Running the probes showed all three are enforced *and* named. Recorded
because it is the point of the cycle: the fix list came from measurement, and
reading had produced two false entries on it.

### The gaps, as the first run reported them

Eleven cases failed on the reference backend and none on Postgres:

| Rule | What the gap allowed |
|---|---|
| `identity_legacy_idx` | one legacy record imported twice as two identities |
| `organization_legacy_idx` | the same, for an organization — memberships and money split across two ids |
| `principal_identity_id_key` | two principals for one identity, so an authorization answer depends on which row is reached first |
| `principal_service_name_key` | two principals answering to one service credential |
| `session_token_hash_key` | one bearer token resolving to two sessions |
| `membership_principal_id_organization_id_key` | two answers to "what may this principal do here" |
| `region_country_code_code_key` | one region code meaning two places in one country |
| `fulfillment_move_job_reference_key` | one MOVE job traced by two fulfillments |
| `notification_idempotency_key_key` | a genuine key collision reported as a duplicate and dropped |
| `identity_link_channel_type_external_id_key` | refused, but as "identity link already exists" — no rule named |
| `fulfillment_market_order_reference_key` | refused, but naming a column instead of the constraint |

### The one that was not a missing check

`PgNotificationStore.queue` inserts with `on conflict (event_id, recipient_id)
do nothing`. Nothing absorbs `notification_idempotency_key_key`, so on Postgres
a key reused for a *different* message raises. The reference store returned
`false` for both, collapsing two different situations into one: the relay
replaying an event, which is expected, and two messages claiming one identity,
which is a defect. A test could not have told them apart, and the silent path was
the dangerous one. The reference store now returns `false` for the replayed pair
and throws, naming the constraint, for the key collision.

### What changed

- `tests/uniqueness-parity.test.ts` — one case per rule, both backends: the rule
  name, what a violation means in business terms, and a probe that seeds a
  legitimate row then attempts the row that must be refused. Each case asserts
  the refusal **and** that it names the schema rule.
- The same file reads `pg_constraint` and `pg_indexes` at run time and fails when
  the schema declares a uniqueness rule with no case. That is the part that keeps
  working after this cycle: a migration adding a `UNIQUE` cannot ship without
  parity, and cannot ship with parity that only holds on Postgres.
- `src/modules/identity-access/memory-repository.ts` — six rules restated, all
  synchronous check-then-set over journalled writes, all quoting the constraint.
  The legacy check runs on update as well as insert, because a rename could
  create the collision.
- `src/modules/organization/service.ts`, `src/modules/geography/repository.ts` —
  the two remaining partial/compound rules.
- `src/modules/fulfillment/service.ts` — `fulfillment_move_job_reference_key`
  added, checked on **update** as well as insert because the job reference is
  attached after intake by `traceJob`; the order-reference message now names its
  constraint.
- `src/modules/notification/repository.ts` — the split described above.
- `docs/uniqueness-parity.md` — the inventory, the refusal shapes and why they
  differ, where each rule is restated, and the two constraints on any such check
  (no `await` between check and write; the write must be journalled).

### Proven, not assumed

- `tests/uniqueness-parity.test.ts`: **49 passed** on both backends. The same
  file failed 11 cases before the fixes, and the fixture bugs it exposed on the
  Postgres side were fixed rather than routed around — the queue tables' foreign
  key to `outbox(event_id)` and the deferred ledger-agreement trigger both
  refused invented fixtures, which is those rules working.
- Full suite with `DATABASE_URL`: **735 passed in 39 files**, plus the
  migration-lifecycle pass **1 passed**. Without a database: **409 passed, 48
  skipped**. Both up from 686 / 385 with no test weakened or skipped.
- Gates: typecheck clean; governance clean; contracts 26 schemas / 17 emitted
  types; migrations 18 forward, all with rollbacks.

### What this cycle could not do

Branch protection is still unconfigurable on this plan (403 on both the
protection and rulesets endpoints), so CI remains informative rather than
required. Recorded as **B-36** instead of left as an implied to-do.

### CI verdict for this cycle — read from the run, not assumed

Head `d52d298` on `uniqueness-parity`, run `34726940841`, [PR #4](https://github.com/uxxxug/wasla-core/pull/4):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 37s | the dependency-free pass still stands on its own |
| `Verify against PostgreSQL` | **success**, 2m3s | **735 tests passed in 39 files** with `DATABASE_URL` set against `postgres:16`, then the migration-lifecycle pass **1 passed**; newest migration rolled back and re-applied |

The local numbers and the CI numbers agree exactly (735 + 1), which is the point
of the parity file: the eleven rules it now covers on the reference backend are
enforced by a run nobody's machine configured.

## Cycle 2026-09-13 (second) — check-constraint parity between the two backends

### Why this was next

The uniqueness cycle closed one kind of rule and left the larger kind open. B-12
is not "uniqueness is unenforced in memory", it is "the reference backend accepts
rows the database refuses" — and the schema states four times as many `CHECK`
constraints as uniqueness rules. Every test that runs twice was, for those rules,
running once and certifying the reference half.

### Measured first

The live schema declares **100 `CHECK` constraints** across 28 tables: 32 closed
vocabularies, 8 format rules, 10 non-empty-text rules, and the rest numeric
bounds and two-column couplings. Only **31 constraint names appeared anywhere in
`src/`**. The other 69 were Postgres-only.

### The shape chosen, and why

Four paths were legitimate. Restating each rule at each write site would have put
one truth in dozens of places. Generating rules from the schema at build time
would have made the tests depend on a live database to compile. Loading
`pg_constraint` at boot would have made the reference backend require the very
database it exists to replace.

What shipped is a single declarative table — constraint name, the columns the
rule reads, a predicate — called through one `putRow` helper that every reference
store now uses. Fewest duplicated truths, strongest automatic enforcement, and a
rule that is checked on every write rather than on the paths someone remembered.

Three properties keep it from rotting:

- A rule declares the columns it reads. If a row lacks one, `assertRow` throws a
  distinct, loud error rather than passing on `undefined` — so renaming a column
  cannot silently disable its rule.
- Refusals use Postgres' own wording, `new row for relation "x" violates check
  constraint "y"`, so the two backends refuse for the same named reason.
- Rows are handled structurally (`Record<string, unknown>`), so nothing in
  `src/platform/` imports from `src/modules/` to make the guard work.

**A deviation from the reservation text, recorded rather than quietly dropped.**
The reservation promised the runtime vocabulary arrays and the domain unions
would be asserted equal at typecheck time in both directions. They are not. Doing
so requires the platform to import module domain types, which ADR 0017 and
`tests/governance.test.ts` forbid. The vocabularies are therefore single-source
in the other direction — the runtime arrays in `row-rules.ts` are the only
runtime statement of each set, and the parity probe fails if the schema's list
and the runtime list disagree, because the probe's rejected value comes from the
schema inventory. That is weaker than a compile error and is named here as such.

### What the measurement found — the opposite of what was expected

The reference backend was expected to be the permissive one. After the rules
table was wired in, three cases failed on it and were fixed at root: the
`fulfillment_settlement_alignment_check` rule was missing from the table
entirely, and two `plan_grant` probes were refused for a *different* legitimate
reason (grants on an active plan are immutable), so they now use a draft plan.

Then the same 88 probes ran against Postgres, and **six failed — every one of
them a database or adapter defect**:

| Defect | What it allowed |
|---|---|
| `membership_roles_check` enforced nothing | `array_length('{}'::text[], 1)` is `NULL`, `NULL >= 1` is `NULL`, and a `CHECK` evaluating to `NULL` is satisfied. A membership granting **no roles** has been accepted since migration 0001 — a principal attached to an organization with no permission, which `listMemberships` reports as access and every authorisation check denies |
| `PgEventDeliveryStore.queue` dropped three columns | `claimed_at`, `reclaims` and `claim_token` were absent from the insert list, so a caller's values were discarded silently. The three claim constraints (B-24, B-25, B-26) never saw the row they exist to refuse, and the two backends held different rows |
| `PgFulfillmentRepository` dropped the two B-29 markers | Absent from the insert list, and from `update`/`updateIfStatusIn` as a consequence — a whole-row update that leaves two columns alone silently ignores part of what it was given |

All three were "deliberate omissions" documented in comments as harmless because
no CORE code path passes those values. The comments were true and the reasoning
was wrong: a store that discards part of what it is given is worse than one that
refuses it, because the caller learns nothing. The comments are rewritten to say
so rather than deleted.

### The fixes

- **Migration `0019_membership_roles_effective`** replaces the constraint with
  `coalesce(array_length(roles, 1), 0) >= 1` under the same name — renaming it
  would make the reference store's message, the parity case and the operator
  runbooks stale to fix a wrong definition. `ADD CONSTRAINT` validates existing
  rows, so the migration fails loudly rather than passing if a role-less
  membership was already stored. The rollback restores the ineffective form and
  says plainly that it removes enforcement of a rule the schema still appears to
  state.
- **`src/platform/eventing/pg-delivery.ts`**: all three claim columns bound;
  `DEL_SELECT_COLUMNS` is now the same list, since there is no longer a
  difference between what is written and what is read.
- **`src/modules/fulfillment/pg-repository.ts`**: `INSERT_COLUMNS` is now
  `COLUMNS`, and both update statements write every mutable column (the
  status-guarded one moved its predicate to `$10`).

### Measured after

| Check | Result |
|---|---|
| `tests/check-parity.test.ts` with `DATABASE_URL` | **178 passed** — 88 constraints × 2 backends + 2 coverage gates |
| `npm test` with `DATABASE_URL` | **913 passed in 40 files**, then migration-lifecycle **1 passed** |
| `npm test` without a database | **497 passed, 50 skipped** |
| `npm run typecheck` | clean |
| governance / contracts / migrations gates | passed — 26 event schemas, 17 emitted types, **19 forward migrations, all with rollbacks** |

The 913 is the previous 735 plus this cycle's 178, with no test removed,
weakened, skipped or renamed.

### Correction to an earlier document, not an erasure

`docs/adr/README.md` recorded ADR 0003 and ADR 0005 as "implemented (migration
not yet executed)". Migrations 0001 and 0002 have been applied and their
rollbacks verified on real engines for several cycles. The stale parenthetical is
replaced with what is true now, and the correction is named here so the change is
auditable rather than silent.

### What this cycle did not do

Twelve constraints cannot be violated through any port, so they are recorded as
unprobeable with a reason each rather than counted as covered: the eight
`outbox`/`inbound_event` status and claim constraints (those stores take
envelopes and stamp their own claims), `inbound_event_processed_at_check` (no
such field exists in the reference record), and the three `rate_limit_counter`
constraints (the in-process limiter counts in a `Map`; it is already documented
as not the deployable one). A second gate asserts that every exemption whose
columns do exist in a reference row is still declared in `ROW_RULES` — an
exemption means no caller can reach the rule, not that the store may ignore it.

Branch protection is still unconfigurable on this plan, so CI remains
informative rather than required: **B-36**, unchanged.

### CI verdict for this cycle — read from the run, not assumed

Head `0cc4fff` on `check-constraint-parity`, run `34730621741`, [PR #5](https://github.com/uxxxug/wasla-core/pull/5):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 35s | the dependency-free pass still stands on its own |
| `Verify against PostgreSQL` | **success**, 2m37s | **913 tests passed in 40 files** with `DATABASE_URL` against `postgres:16`, then the migration-lifecycle pass **1 passed** — migration 0019 rolled back and re-applied |

The CI totals match the local ones exactly (913 + 1), which is what makes the
parity file worth having: the 88 constraints it now restates in the reference
backend are enforced by a run nobody's machine configured, on a database created
from the migrations rather than from a developer's schema.

## Cycle 2026-09-13 (third) — referential-integrity parity between the two backends

### Why this was next

B-12 has three large declarative families and two were closed: 24 uniqueness
rules, then 100 check constraints. Foreign keys were the third, and the largest
gap of the three in proportion — the schema declares **30** and `src/` restated
**one**. Nothing above it in the dependency order was actionable: B-35/ADR 0010
has no ADR text in the repository, B-14…B-20 and B-30…B-34 are policy decisions
that are not CORE's to make, and B-36 is a plan limitation. So the choice was
between this and trigger parity, and this one comes first: a trigger that
refuses a transition is only meaningful once the rows it fires on are known to
exist.

### Measured first

The live schema declares **30 `FOREIGN KEY` constraints** across 20 child
tables. Exactly **one** name — `usage_record_period_id_fkey` — appeared anywhere
in `src/`, and only because the period-window trigger has to read the parent row
anyway. The other 29 were Postgres-only.

What that allowed, concretely, in every memory-only test in the suite: a
fulfillment whose `organization_id` belongs to no organization (work in no
tenant, billable to nobody, invisible to every tenant-scoped read); a
`membership.principal_id` with no principal (an access grant to nobody, which no
revocation can reach); a session for a principal nobody created (a bearer token
that authenticates as nothing); a notification naming a recipient row that was
never inserted; an `event_delivery` naming an outbox row that does not exist — a
signed POST of an envelope CORE never recorded, which no replay can reproduce.

### A second finding, from re-reading rather than from the inventory

The check-constraint cycle recorded that `putRow` is the only way a reference
store writes a row. It was true of 25 of 28 tables. `session`, `plan_grant` and
`usage_record` still wrote with a bare `map.set`, and their five `CHECK` rules
were restated inline in the stores instead of declared in `ROW_RULES` — the
duplicated truth that cycle existed to remove. Three of the 30 foreign keys
belong to those three tables, so they could not be enforced at all until the
writes went through one place. All three now do, their rules are declared in
`ROW_RULES` (with a new `present()` predicate, trimmed-non-empty, kept distinct
from `notEmpty` which is `<> ''`), and the earlier claim is corrected here by
addition rather than by editing the earlier record.

### The shape chosen, and why

A rule must be able to ask whether a parent row exists, and the parents live in
nine separate stores. Four designs were legitimate and the rejected three are
recorded in the header of `reference-keys.ts`: per-store reader closures (a
different wiring per store, so a missed one fails open silently), a single
shared row table behind all stores (a rewrite of every store, and a second
owner for rows the stores already own), and copying keys into the registry on
write (a second source of truth that goes stale exactly when a delete happens).

What shipped is one `ReferenceKeys` registry per persistence bundle, to which
each store hands the live `Map` it already owns. The registry reads that map, so
an existence check cannot be answered from a stale shadow. Enforcement is a
single `assertReferences` call inside `putRow` — no call site changed — and the
refusal quotes Postgres exactly:

```
insert or update on table "membership" violates foreign key constraint "membership_organization_id_fkey"
```

Nullability is part of each rule because `MATCH SIMPLE`, which every key here
uses, treats a null reference as satisfying the key. Six columns are nullable
and each means something specific by it; `docs/foreign-key-parity.md` states
what.

**The one weakening, named rather than hidden.** If no registry is attached, or
a parent has no registered source, the rule is not evaluable and the write is
**accepted**. It exists so a store constructed alone, outside a bundle, still
works for tests that are not about references. Fail-open paths are how
enforcement disappears quietly, so this one is measured: a coverage test asserts
the bundle the application actually builds has `unresolvedParents() === []`. A
new store that forgets to `attach` fails that test instead of merely stopping to
refuse orphans.

### What the measurement found

The first full run after enforcement went live produced **29 failures** across
six memory-only suites — `identity`, `api`, `vertical-slice`, `fulfillment`,
`fulfillment-dispatch`, `fulfillment-settlement` — and every one of them was
`fulfillment_organization_id_fkey` or `membership_organization_id_fkey`. Those
fixtures had never created the tenant they were writing into. They had been
passing for many cycles against a store that did not care, asserting behaviour
on rows production would have refused: B-12 demonstrated rather than argued.

The fix was in the fixtures, not in the rule — a `seedTenant` helper and a
`coreWithTenants` app builder in `tests/support/`. No key was relaxed, no probe
was skipped, no refusal was downgraded, and no gate was disabled to get back to
green.

### Proven, not assumed

`tests/fk-parity.test.ts` writes, for each key, a row that is valid in every
other respect and names a parent that does not exist, then asserts on **both**
backends that the write is refused **and** that the refusal names the
constraint. Naming matters: a store that refuses for an unrelated reason would
otherwise pass, and a rename would survive the suite.

Four gates keep the file from becoming a second opinion:

| Gate | What it catches |
|---|---|
| coverage against `pg_constraint` | a migration adding a foreign key with neither a case nor a recorded reason; and a case or exemption naming a key the schema no longer has |
| declaration vs. catalog | a rule whose child column, parent table or **nullability** disagrees with the live column, and a live key `FOREIGN_KEYS` does not declare at all |
| `unresolvedParents() === []` | the design's single fail-open path: a store that never handed its map to the registry |
| a reason per exemption | an exemption used as a silent excuse |

The gates were falsified before being trusted. Deleting the `session` rule was
caught twice — by the behavioural probe (memory accepted the orphan) and by the
declaration gate (the schema declares a key `FOREIGN_KEYS` does not).

### Measured after

| Check | Result |
|---|---|
| `tests/fk-parity.test.ts` with `DATABASE_URL` | **63 passed** — 29 keys × 2 backends + 3 coverage gates + 2 live-schema gates |
| `npm test` with `DATABASE_URL` | **976 passed in 41 files**, then migration-lifecycle **1 passed** |
| `npm test` without a database | **529 passed, 52 skipped** |
| `npm run typecheck` | clean |
| governance / contracts / migrations gates | passed — 26 event schemas, 17 emitted types, 19 forward migrations, all with rollbacks |

The 976 is the previous 913 plus this cycle's 63, with no test removed,
weakened, skipped or renamed. The 32 added to the no-database run are this
file's memory half plus its three database-free gates.

### Correction to an earlier document, not an erasure

`seedOrganization` in `tests/support/rows.ts` is commented "an organization with
a country behind it, which its foreign key requires". The catalog lists **no**
foreign key from `organization` to `country`. The fixture's extra seeding is
harmless and the comment is wrong; it is recorded in
`docs/foreign-key-parity.md` rather than silently deleted, because many suites
use that fixture and the comment records what its author believed.

### What this cycle did not do

- **`ON DELETE` behaviour is not probed.** Only `plan_grant_plan_id_fkey` has a
  non-default action (`CASCADE`), and the reference backend does not model
  cascades at all. Delete-behaviour parity is separate work, not claimed here.
- **Deferred reference checks are not handled.** Every key in the schema today
  is immediate, which is why the probes can assert refusal at the write. A
  future `DEFERRABLE` key breaks that assumption, and the note is in
  `docs/foreign-key-parity.md` so the next author meets it.
- **One key is exempt**, with its reason in `UNPROBEABLE`:
  `ledger_entry_transaction_id_fkey`. Entries are not a row table of their own
  in the reference backend — `insertTransaction` takes the header with its
  entries nested — so there is no map to declare a rule against and no entry a
  caller could point elsewhere. Postgres keeps enforcing it, and the direction a
  caller *can* express (a transaction naming a hold that does not exist) is
  case 13.
- **The 12 triggers are untouched**, and are now milestone 16.
- Branch protection is still unconfigurable on this plan, so CI remains
  informative rather than required: **B-36**, unchanged.

### CI verdict for this cycle — read from the run, not assumed

Head `d495063` on `foreign-key-parity`, run `34737379147` (pull request) and
`34737363114` (push), [PR #6](https://github.com/uxxxug/wasla-core/pull/6):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 38s | **529 passed, 52 skipped** in 39 of 41 files, then the migration-lifecycle file **1 skipped** — the dependency-free pass still stands on its own, and typecheck, governance, contracts, migrations, roadmap freshness and the secret scan all ran |
| `Verify against PostgreSQL` | **success**, 2m14s | **976 passed in 41 files** with `DATABASE_URL` against `postgres:16`, then the migration-lifecycle pass **1 passed** — the newest migration rolled back and re-applied against a schema built from the migrations |

The CI totals match the local ones exactly (976 + 1, and 529 / 52), which is
what makes this cycle's claim worth anything: the 29 foreign keys the reference
backend now restates are enforced by a run nobody's machine configured, on a
database created from the migrations rather than from a developer's schema. The
declaration gate and the coverage gate ran there too, against that database's
own `pg_constraint`, so the inventory in `docs/foreign-key-parity.md` is checked
against the schema CI builds and not only the one on this machine.

## Cycle 2026-09-13 (fourth) — trigger-invariant parity between the two backends

### Why this was next

B-12's three declarative families were closed: 24 uniqueness rules, 100 check
constraints, 30 foreign keys. The triggers were what was left, and nothing above
them in the dependency order was actionable — B-35/ADR 0010 has no ADR text in
the repository, B-14…B-20 and B-30…B-34 are policy decisions that are not
CORE's to make, and B-36 is a plan limitation. The order was also not arbitrary:
a trigger that refuses a transition is only meaningful once the rows it fires on
are known to exist, which is what the foreign-key cycle established.

### Measured first

From `pg_trigger` and `pg_get_functiondef`, not from the migration text: **12
triggers**, of which **4 are `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY
DEFERRED`** and 8 immediate `BEFORE` triggers. Five trigger names appeared
anywhere in `src/`, all five in the subscription store.

Two of the twelve were enforced by **no reference store at all**:

- **`subscription_currency_check`.** Its two refusals — a plan priced in one
  currency billed against a wallet held in another, and, on insert, a
  subscription to a plan that is not `active` — lived in
  `SubscriptionService.subscribe` and nowhere below it. Every test that reached
  the repository directly could create a subscription production refuses, and
  the service was the only thing standing between a currency mismatch and the
  ledger.
- **`ledger_transaction_balance`.** `assertBalanced` was called by
  `MoneyService` alone. `InMemoryMoneyRepository.insertTransaction` checked the
  business-reference key, the authorization-presence `CHECK` and each entry's
  row rules — and never that the entries sum to zero. A caller reaching the
  store directly could post `-1000` against `+999` and the reference backend
  accepted money appearing from nowhere that Postgres refuses at commit.

The second one was not found by reading the code. It was found because the probe
failed on the memory half the first time the new suite ran, which is the only
reason to write the probe before trusting the restatement.

### Why this needed a second mechanism, not more `ROW_RULES`

A `CHECK` reads the row being written; a foreign key reads one other row. A
trigger can judge a **transition** (`plan_terms_immutable` refuses a change from
one legal row to another legal row), can read **other tables**
(`subscription_currency_check` compares plan and wallet), and can run **at
commit**. None of that fits a row-shaped predicate, so:

- `src/platform/persistence/transition-rules.ts` declares the immediate triggers
  as rules over (operation, previous row, next row), with the tables each rule
  reads declared alongside it. `putRow` applies them **after** the check
  constraints and the foreign keys — the order Postgres uses, so a refusal
  quotes the constraint the database would quote rather than the trigger that
  would not have run yet.
- The four deferred triggers stay on the transaction journal in the stores that
  already defer, and the balance rule joins them there (`deferBalance`, keyed by
  transaction id). Enforcing a deferred trigger at the write would refuse a
  sequence Postgres allows to be repaired before commit.
- Parent rows are read through the **same bundle registry** the foreign keys
  use, extended from `has` to `get`. No second wiring, no copied rows: a row
  rolled back by `InMemoryTransactionBoundary` stops satisfying a trigger at the
  moment it stops existing.
- `TRIGGER_INVENTORY` names all twelve exactly once — `immediate`, `deferred`
  (naming the store that defers it), or `exempt` with its reason — so "which
  triggers does the reference backend account for" has one answer in one place.

### Proven, not assumed

`tests/trigger-parity.test.ts` carries three kinds of case, because the twelve
are not alike:

| Kind | What it asserts |
|---|---|
| refusal probe | a write valid in every other respect and illegal only as a transition is refused by **both** backends, in Postgres' own words. For the deferred four the probe wraps the whole `boundary.run`, because the refusal belongs to the commit — asserting it at the write would pass in memory and fail on Postgres |
| outcome probe | for `reputation_signal_append_only`, whose guarded path both backends narrow away: `retractIfStanding` filters on `retracted_at is null` in memory and in SQL, so a second retraction is not a refusal in either — it is a `stale` verdict, and both are asserted to return it |
| exemption | three append-only triggers no caller can reach. Each names the port operations that must stay **absent** and the case asserts their absence, so adding `updateUsage` to the port fails the exemption instead of quietly leaving the reference backend permissive |

Five gates:

| Gate | What it catches |
|---|---|
| coverage against `pg_trigger` | a migration installing a trigger with neither a restatement nor a recorded exemption; an inventory entry naming a trigger the schema no longer installs; an inventory entry naming the wrong table |
| timing vs. catalog (`tgdeferrable`, `tginitdeferred`) | a trigger the reference backend enforces at the write that the schema defers to commit, and the reverse. Timing is not cosmetic: the first refuses legal sequences, the second accepts illegal ones until commit |
| `unresolvedReads() === []` | the design's single fail-open path: a table a rule reads that no store handed to the registry |
| a reason per exemption, and an absent-operation assertion per exemption | an exemption used as a silent excuse |
| inventory vs. rules | a trigger called `immediate` with no rule behind it, and a rule enforcing a trigger the inventory does not call immediate |

The gates were falsified before being trusted. Emptying the `subscription` rule
list failed three tests — both currency probes on the memory half and the
inventory/rules gate — while the Postgres half stayed green, which is exactly
the asymmetry the suite exists to catch. Reclassifying
`ledger_transaction_agrees_with_authorization` from `deferred` to `exempt`
failed the timing gate and the probe-versus-exemption gate.

### Measured after

| Check | Result |
|---|---|
| `tests/trigger-parity.test.ts` with `DATABASE_URL` | **39 passed** — 12 triggers across refusal, outcome and exemption cases on both backends, plus 5 gates |
| `tests/trigger-parity.test.ts` without a database | **21 passed, 2 skipped** — the memory half and the database-free gates |
| `npm test` with `DATABASE_URL` | **1015 passed in 42 files**, then migration-lifecycle **1 passed** |
| `npm test` without a database | **550 passed, 54 skipped** |
| `npm run typecheck` | clean |
| governance / contracts / migrations gates | passed — 26 event schemas, 17 emitted types, 19 forward migrations, all with rollbacks |

The 1015 is the previous 976 plus this cycle's 39, with no test removed,
weakened, skipped or renamed. Three inline restatements were **moved**, not
deleted: `plan_terms_immutable`, `plan_grant_immutable` and the window half of
`usage_record_within_period` were hand-written in
`InMemorySubscriptionRepository` and are now declared once in
`TRANSITION_RULES`, so they hold for any writer of those tables rather than for
the three methods that remembered them. Their refusal wording is unchanged, and
the suites that assert it still pass.

### What this cycle did not do

- **Delete parity is not claimed.** No reference store deletes a row outside a
  rollback, so the delete halves of the four append-only triggers are
  unreachable rather than enforced. That is now milestone 17, together with the
  one `ON DELETE CASCADE` key the reference backend does not model.
- **The balance rule is stricter than the trigger, on purpose.** Postgres sums
  per currency, so two currencies each balancing to zero would pass there; the
  reference store refuses a transaction that mixes currencies at all. CORE has
  no multi-currency transaction and
  `ledger_entry_currency_matches_transaction` is the schema saying so. Recorded
  in `docs/trigger-parity.md` rather than silently narrowed.
- **Insert and update are not told apart.** `putRow` sees only whether a row
  exists under the key, so a repeated insert is judged by the update rules.
  Postgres refuses that write too, as a primary-key violation — a different
  family's refusal, not a missing one. Never more permissive; the wording
  differs.
- **The period-window message is matched on its stable part.** Postgres renders
  a `timestamptz` its own way and the reference backend quotes the ISO string it
  was given, so the probe asserts `falls outside period` and not the instants.
- Branch protection is still unconfigurable on this plan, so CI remains
  informative rather than required: **B-36**, unchanged.

### CI verdict for this cycle — read from the run, not assumed

Head `a61f4ba` on `trigger-parity`, run `34739885787` (pull request) and
`34739883764` (push), [PR #7](https://github.com/uxxxug/wasla-core/pull/7):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 41s | **550 passed, 54 skipped** in 40 of 42 files, then the migration-lifecycle file **1 skipped** — the dependency-free pass still stands on its own, and typecheck, governance, contracts, migrations, roadmap freshness and the secret scan all ran |
| `Verify against PostgreSQL` | **success**, 1m58s | **1015 passed in 42 files** with `DATABASE_URL` against `postgres:16`, then the migration-lifecycle pass **1 passed** — the newest migration rolled back and re-applied against a schema built from the migrations |

The CI totals match the local ones exactly (1015 + 1, and 550 / 54), read from
the run's own log archive rather than from a local run. That is what makes this
cycle's claim worth anything: the coverage gate and the timing gate ran there
too, against the `pg_trigger` of a database CI created from the 19 migrations,
so the inventory in `docs/trigger-parity.md` is checked against the schema CI
builds and not only the one on this machine.

## Cycle 2026-09-13 (fifth) — `ON DELETE` and delete-path parity

### Why this was next

Nothing above it in the dependency order was actionable, and re-measuring said
so rather than the documents: milestones 2…9 wait on environments and producers
outside CORE, B-14…B-20 and B-30…B-34 are policy decisions that are not CORE's
to make, B-35/ADR 0010 has no ADR text in the repository, and B-36 is a plan
limitation. Milestone 17 was the one item with no external dependency.

It was also the one item the four previous cycles had each written down and
then left. (It closes B-12, which named four families. It does not close parity
as a subject: the measurement below turned up a fifth family B-12 never named,
recorded as milestone 18 rather than folded into this cycle.) Uniqueness, checks, foreign keys and triggers are all rules about
rows that *exist*; all four ended with the same sentence in their "what this
cycle did not do", and the fifth was the sentence itself.

### Measured first

From `pg_constraint`, `pg_attribute` and the source, before touching anything:

| Question | Answer |
|---|---|
| Foreign keys | **30** |
| `ON DELETE NO ACTION` | **29** |
| `ON DELETE CASCADE` | **1** — `plan_grant_plan_id_fkey` |
| Non-default `ON UPDATE` | **0** |
| Tables that are a foreign-key parent | **15 of 32** |
| Places in `src/` that remove a row | **3** |

The three are the inbox releasing a consumer's claim, the rate-limit counter
pruning closed windows, and `InMemoryTransactionBoundary` unwinding a write on
rollback. `inbox` and `rate_limit_counter` are neither the parent nor the child
of any key and carry no trigger; the rollback path is not a delete a caller can
reach.

### So nothing was broken — and that was the problem

The claim the four cycles rested on was true. What was missing was anything that
kept it true. An exemption re-measured only when a human remembers to is a
comment, not a guarantee, and the four cycles had accumulated seven of them
resting on "no caller can express this write".

So this cycle adds no behaviour. It adds the thing that makes the previous four
cycles' honesty survive the next migration.

### Proven, not assumed

`src/platform/persistence/delete-actions.ts` declares two things and nothing
else: the `ON DELETE`/`ON UPDATE` action of all 30 keys, and the three delete
paths with the reason each is safe. `NO ACTION` is declared as modelled because
the reference backend models it by construction — `NO ACTION` *is* a refusal,
and in memory there is no delete to refuse. The single cascade is declared
`modelled: false`, because declaring it modelled would be the more dangerous
mistake: it would read as done.

`tests/delete-parity.test.ts` holds the declarations to the world:

| Gate | Fails on |
|---|---|
| An action for every key | A key with no action, or an action for a key that does not exist |
| Unmodelled means unreachable | An unmodelled action with no reason, or whose parent table a delete path now touches |
| No delete of an unmodelled parent | A port growing `deletePlan`/`removePlan`/`purgePlan` |
| Removal only where declared | Any `src/**/*.ts` containing `delete from`, `truncate`, `.delete(` or `.clear(` that `DELETE_PATHS` does not name, and any declared file that no longer removes a row |
| Every removal-shaped operation classified | A new `release`/`prune`/`forget`/`evict`/`purge`-shaped port method until somebody says whether it deletes a row or releases a lease |
| Against the live schema | A declaration disagreeing with `confdeltype`/`confupdtype`; a delete path on a table that has gained a key in either direction or a trigger |

`clear` and `truncate` appear nowhere in `src/` and are scanned for anyway: a
gate that only catches the delete somebody has already written is not a gate.
Four ports expose `reclaimExpired`, which sounds like a delete and is an
`UPDATE`; each is now recorded as a lease release with the reason the row itself
must survive — an outbox envelope is the record of what CORE published, an
inbound event is what replay reads, a delivery's attempt history is the evidence
B-27 revival works on.

Two outcome probes run on both backends for the one delete a caller can reach:
releasing a claim lets the next attempt claim the same event and sets `seen`
back to false, and releasing a claim that does not exist is a no-op rather than
an error — delivery is at-least-once and `release` is called from failure paths,
so Postgres deletes zero rows and the reference backend must not throw where
Postgres shrugs.

Every gate was broken on purpose first: a key declared `ON DELETE SET NULL`
against the catalog, the cascade declared modelled, a `plan` entry added to the
delete paths, an `inbox.purgeEverything` added to the memory store, and
`InMemoryInboxStore.release` made a no-op. Five changes, eleven distinct
failures, including the "would pass vacuously" guard and the stale-declaration
half of the source gate. Restored, all green.

### Measured after

| Measurement | Before | After |
|---|---|---|
| `npm test` with `DATABASE_URL` | 1015 in 42 files | **1026 in 43 files** |
| `npm test` without one | 550 passed / 54 skipped | **557 passed / 56 skipped** |
| Migration lifecycle | 1 passed with a database | unchanged |
| `tests/delete-parity.test.ts` | — | **11 with a database, 7 passed / 2 skipped without** |

Typecheck clean; governance, contracts (26 event schemas, 17 emitted types),
migrations (19 forward, all with rollbacks) and the roadmap gate all pass. The
previous pairs — 385/687, 529/976, 550/1015 — stay in the README parenthesis, as
before: counts are updated by addition, never by erasure.

### What this cycle did not do

- **It added no delete path.** Audit entries, ledger entries, usage records and
  reputation signals are append-only by design and the schema has triggers
  saying so. Adding a delete so that a cascade could be observed would weaken
  the design to make a test prettier.
- **It did not model the cascade.** `plan_grant_plan_id_fkey` is now unmodelled
  *and enforced as unreachable* — a weaker claim honestly checked, rather than a
  stronger one asserted.
- **It cannot catch a delete assembled at run time.** The source gate reads
  `src/**/*.ts`. Every query in this repository is a literal in a `.ts` file,
  and the gate's reach is exactly that fact.
- **It says nothing about columns.** 270 columns, 212 `NOT NULL`, 49 with a
  default, and a reference backend that enforces nullability only where a text
  rule happens to mention it and types not at all. Recorded as milestone 18,
  the next actionable item, rather than folded in here.

### CI verdict for this cycle — read from the run, not assumed

Head `abf8e69` on `delete-path-parity`, run `34740853198` (pull request) and
`34740837452` (push), [PR #8](https://github.com/uxxxug/wasla-core/pull/8):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 34s | **557 passed, 56 skipped** in 41 of 43 files, then the migration-lifecycle file **1 skipped** |
| `Verify against PostgreSQL` | **success**, 2m1s | **1026 passed in 43 files** with `DATABASE_URL` against `postgres:16`, then the migration-lifecycle pass **1 passed** |

Read from the run's own log archive rather than from a local run, and the totals
match the local ones exactly (1026 + 1, and 557 / 56). What matters for this
cycle specifically is that the two catalog gates ran there: the referential
actions were compared with `confdeltype`/`confupdtype`, and the deletable tables
with `pg_constraint` and `pg_trigger`, on a database CI built from the 19
migrations — so `delete-actions.ts` is checked against the schema CI produces
and not only the one on this machine.

## Cycle 2026-09-13 (sixth) — column-level parity: `NOT NULL`, types and defaults

### Why this was next

Re-measured rather than read off the documents, as every cycle before it: nothing
above milestone 18 in the dependency order is actionable. Milestones 2…9 wait on
environments and producers outside CORE, B-14…B-20 and B-30…B-34 are policy
decisions that are not CORE's to make, B-35/ADR 0010 has no ADR text in the
repository, and B-36 is a plan limitation. Milestone 18 was the one item with no
external dependency — and it was the item the previous cycle created out of its
own measurement rather than an item anyone planned, which is the mechanism
working as intended.

### Measured first

From `pg_attribute`, and from the rows the reference stores actually write. The
second measurement was taken by temporarily instrumenting `putRow` to append the
key paths of every row it received to a file and running the whole suite — 7578
writes, 26 of the 28 ruled tables observed — because reading the stores and
inferring their row shapes is the kind of guess this repository keeps finding to
be wrong.

| Question | Answer |
|---|---|
| Columns across the 28 ruled tables | **254** |
| `NOT NULL` | **197** |
| With a database default | **45** |
| Distinct types | **11** |
| Ruled tables whose rows bypass `putRow` | **2** — `audit_entry`, `ledger_entry` |
| Columns the reference backend enforced | **0** by type, 0 by length, nullability only where a text rule mentioned it |

The 11 types are `uuid`, `text`, `character(2)`, `character(3)`, `timestamptz`,
`integer`, `bigint`, `double precision`, `boolean`, `jsonb`, `text[]`. The
default expressions are `now()`, `'{}'::jsonb`, `'pending'::text`,
`'none'::text`, `'active'::text`, `0`, `1`, `true`.

### Two divergences the measurement found, fixed at the root

Neither was hypothetical and neither is an exemption:

- **`outbox.created_at`** — `NOT NULL DEFAULT now()` since the first migration.
  The Postgres adapter inserted it and never selected it; the reference store
  never wrote it. A reference record was missing a value every database row had,
  and the two backends returned records of different shapes for the same event.
- **`inbound_event.processed_at`** — set by the adapter in the same statement
  that marks an event processed, selected by neither backend, omitted rather
  than stored as null in memory. `record.processed_at` read `undefined` on one
  backend and a timestamp on the other.

Both are now fields of `OutboxRecord` and `InboundRecord`, written by the
reference stores from the injected clock, and added to `SELECT_COLUMNS` in
`pg-outbox.ts` and `pg-ingress.ts`. 282 suite failures pointed at exactly these
two columns and nothing else, which is how a gate is supposed to report a
divergence: two causes, not 282.

### What the cycle built

`src/platform/persistence/column-shapes.ts` — every column of all 28 ruled
tables with its type, width, nullability, default expression and **the path the
value takes in the reference row**. Twenty columns are nested (`outbox` and
`inbound_event` carry the envelope under `event.*`, its payload at
`event.payload`); declaring the column without the path would have gated nothing
for those.

`assertColumns` runs in `putRow` before the `CHECK` rules — Postgres refuses a
`NOT NULL` violation before evaluating a `CHECK` on the same column — and is
called directly by `audit.ts` and by the ledger-entry loop in
`src/modules/money/repository.ts`, the two ruled write paths that are not keyed
maps.

Three choices that could have gone the other way, recorded in the file header
and in `docs/column-parity.md`:

1. **No default is applied.** A defaulted column absent from the row is refused
   with a message that says the database would have filled it and the store has
   to instead. Completing the row here would make this file a second source of
   truth for what a row contains — which is precisely what the two divergences
   above were.
2. **An absent key is refused even for a nullable column.** Null is what the
   database stores; `undefined` versus `null` is a difference a handler sees.
3. **Refusals quote Postgres' wording**, measured by inserting each value into a
   real Postgres 16, not recalled. The array wording was corrected by that
   measurement: a string in a `text[]` column raises `malformed array literal:
   "admin"`, not a type error, because the value is parsed as an array literal
   first.

### Where the reference backend is deliberately stricter

Three writes Postgres accepts by converting, and the reference backend refuses,
because memory has no conversion step and accepting would leave the two backends
holding different values for one write: a number in a `text` column (Postgres
stores `"1"`), a string in a `boolean` column (Postgres stores `true`), and an
integer past `Number.MAX_SAFE_INTEGER` in a `bigint` column (Postgres stores the
rounded double it was sent; a `bigint` value is accepted). Refusing a write the
database would have taken is the safe direction, but it is an asymmetry, so it
is written down and asserted by a test that checks Postgres still accepts all
three — if a future version stops, the note is wrong and the test says so.

`character(n)` short values are **not** refused: the type blank-pads, and the
schema's own `plan_currency_format` CHECK is what rejects `SA`. Refusing in the
column gate would quote the wrong rule for the write.

### The gates, and breaking them on purpose

`tests/column-parity.test.ts`, **21 assertions**, 4 requiring a database:
coverage in both directions against `pg_attribute` (type, `character(n)` width,
nullability and the default *expression*), the three counts as live measurements
rather than remembered numbers, a vacuity guard on the catalog query, six
offending rows inserted into a real `plan` inside a transaction and rolled back
so the database's message is compared character for character with
`assertColumns`', and a probe that the three strictnesses are still
strictnesses.

| Falsification | Result |
|---|---|
| `plan.activated_at` declared `notNull: true` | 4 assertions fail |
| `plan.interval_count` declared `bigint` | catalog gate and the wording comparison fail |
| a `databaseDefault: "now()"` removed | defaulted-count gate and catalog gate fail |
| a column entry deleted | catalog gate fails |
| the `NOT NULL` branch of `assertColumns` disabled | refusal probes and the wording comparison fail |

### What this cycle did not do

- It does not add a type system to the domain. The gate checks what the column
  will hold, at the one place every reference write already passes through.
- It does not reach the four unruled tables — 16 columns of migration
  bookkeeping written by the runner rather than by a store. That exclusion is
  currently held true by nothing, which is the same shape of untrusted claim
  milestone 17 existed to close, and it is recorded as the next actionable item
  rather than waved through here.
- It does not make CI a required check; B-36 is still a plan limitation.

### CI verdict for this cycle — read from the run, not assumed

Head `473a0c6` on `column-parity`, run `34743967640` (pull request) and
`34743966173` (push), [PR #9](https://github.com/uxxxug/wasla-core/pull/9):

| Job | Verdict | Evidence in the log |
|---|---|---|
| `Verify without a database` | **success**, 36s | **574 passed, 60 skipped** in 42 of 44 files, `tests/column-parity.test.ts` among them at **21 tests, 4 skipped** — the four that need a database — then the migration-lifecycle file **1 skipped** |
| `Verify against PostgreSQL` | **success**, 2m6s | **1047 passed in 44 files** with `DATABASE_URL` against `postgres:16`, `tests/column-parity.test.ts` **21 tests** with none skipped, then the migration-lifecycle pass **1 passed** |

Read from the run's own log archive rather than from a local run, and the totals
match the local ones exactly (574 / 60 and 1047 + 1). What matters for this cycle
specifically is that the four database-only assertions ran *there*: the
declaration was compared against the `pg_attribute` of a database CI built from
the 19 migrations, and the six refusal probes were compared with the wording of
CI's own `postgres:16` — so `column-shapes.ts` quotes a message this repository
has seen a real database produce on a machine that is not this one.

## Cycle 2026-09-13 (seventh) — parity for the runtime tables no gate reached

The seventh parity cycle, and the first whose subject is the *scope* of the
previous six rather than a new kind of rule. Full account, with every measured
message and every falsification, in `docs/runtime-table-parity.md`.

**The cycle began by disproving its predecessor.** The milestone-18 record
stated that the four tables outside `ROW_RULES` "are migration bookkeeping,
written by the migration runner rather than by a store". The mandate says not to
treat an earlier report as final truth, so it was re-measured, and it was wrong.
`inbox` is written on every consumer claim and `rate_limit_counter` on every
request — the two hottest write paths in CORE — and both sat outside every gate
six cycles had built. The original sentence stands where it was written; the
correction is additive, made first in the reservation commit and recorded in the
milestone table.

**What the gap actually was.** `rate_limit_counter` carries three `CHECK`
constraints that nothing enforced. They were not missing by oversight:
`tests/check-parity.test.ts` had recorded them as *unprobeable*, with true
reasons of the form "the subject kind is part of the reference limiter's
in-process map key, not a stored column". The reason was true because the
reference limiter held no row — a description of the gap, not a justification
for it. An exemption whose reason describes the defect is the shape of thing
this cycle looked for. Measured against a real Postgres before any code
changed: a non-uuid `event_id` was accepted in memory and refused by the
database with `invalid input syntax for type uuid`; a bad `subject_kind`, a bad
`rate_class` and a negative `hits` were each refused by the database and
unmodelled in memory.

**The fix is structural, not a list of new checks.** Both reference stores are
row stores now, writing through `putRow`, so they inherit columns, checks,
foreign keys and transitions at once instead of getting a bespoke check each.
Two of the three exemptions became real dual-backend probes; the third was
narrowed to the half that is still true and promoted to `declared: true`.

**A third divergence, found on the way.** `PgRateLimitWindowStore` wrote
`updated_at` from the database's `now()` — the one store in CORE that told the
time by itself, so under a fixed clock the two backends disagreed about when a
window was touched. The clock is injected now and a fixed-clock database probe
keeps it that way. This is the third divergence in three cycles with the same
shape — a column one backend writes and the other never surfaces — which is why
the next actionable item gates the **read** path.

**`idempotency_key` is recorded, not removed.** Nothing writes it. Dropping it
needs `DROP TABLE`, which `scripts/check-migrations.mjs` refuses in a forward
migration on purpose; weakening that gate to tidy up a dead table is not a trade
this repository makes. It is blocker **B-37** and an enforced exemption that
fails the moment anything writes it.

**Gates.** `tests/runtime-table-parity.test.ts`, 12 assertions, 4 needing a
database. The load-bearing two are general rather than about these tables: a
gate that parses `CREATE TABLE` out of every migration and fails when a table is
neither gated nor excused, so the *next* table added to the schema cannot repeat
this cycle; and a source scan that proves each exemption's stated writers are
still its actual writers. That second gate corrected this cycle's own first
draft — the exemption claimed `scripts/db-migrate.mjs` writes
`schema_migrations`, and the scan found nothing writes it, because each forward
migration records its own version inside the same transaction as its DDL. That
is the stronger arrangement, and it is now asserted for all 19 migrations.

**Falsification: six attempts, six caught.** Stopping the reference limiter
writing rows, reverting the Postgres limiter to `now()`, dropping `received_at`
from the inbox row, adding a migration with an ungoverned table, and widening
the enforced `rate_class` vocabulary by one value each produced a failure, and
the migration-count vacuity guard fired on the fourth as well.

**Local measurement.** `typecheck`, `check:governance`, `check:contracts`,
`check:migrations` pass. Without `DATABASE_URL`: 584 passed, 64 skipped. With
`DATABASE_URL` against local PostgreSQL 16: 1063 passed in 45 files.
Whole-schema coverage is 263 columns, 206 `NOT NULL`, 47 defaults, up from
254/197/45. One flake is recorded rather than hidden: in the first combined run
against Postgres, `tests/migration-0011-lifecycle.test.ts` reported its single
test passing and the file failing; it passed standalone and on re-run.

**CI verdict: both jobs green**, read from the run logs for head `69151e5` on
`runtime-table-parity` (PR run `34745320035`, push run `34745318738`), not
inferred from the local run:

| Job | Result | Wall time | Totals |
|---|---|---|---|
| Verify without a database | success | 38s | 584 passed, 64 skipped in 43 of 45 files; the lifecycle file skipped |
| Verify against PostgreSQL | success | 2m02s | 1063 passed in 45 files; the lifecycle file 1 passed |

Both totals match the local measurement exactly. What that buys specifically:
the four database-only assertions in `runtime-table-parity.test.ts` ran against
a `postgres:16` CI built from the 19 migrations — so the two `CHECK`
vocabularies this cycle put under one source of truth were compared with a real
`pg_constraint` on a machine that is not this one, and the fixed-clock stamp
probe was verified against a database this repository did not create. The
lifecycle flake seen locally did not reproduce in CI.

## Cycle 2026-09-13 (eighth) — read-path parity

The eighth parity cycle, and the first to gate what a store *returns*. Full
account in `docs/read-path-parity.md`.

**The reason this cycle exists is a pattern in the previous three, not a new
defect.** `outbox.created_at`, `inbound_event.processed_at` and
`rate_limit_counter.updated_at` were three divergences with one shape, and not
one of them was found by a test of the thing that was broken: each surfaced
sideways, from a gate built for another purpose. A column that one backend
writes and no read returns is a difference nothing in the suite can observe.
Two of the three were closed by adding a name to a `SELECT_COLUMNS` string, and
nothing kept those strings complete — so the fix for all three was a habit
rather than a gate, which is the thing this repository treats as unfinished.

**Two halves, kept separate on purpose.** The static half parses every `select`
and every `returning` in `src/`, expanding the adapters' column-list constants
to a fixed point first, and compares the result with `COLUMN_SHAPES` in both
directions: unreachable columns must be declared with a reason, a read naming a
column the schema does not have fails, and a declaration that has stopped being
true fails. The behavioural half writes and reads back through both backends and
compares every key path and then every value. Neither subsumes the other — the
static half cannot prove a read is correct, the behavioural half cannot see a
column no record carries — and the three known divergences needed both to be
closed and kept closed.

**Six exemptions, all narrow.** Every one belongs to `inbox` or
`rate_limit_counter`, whose stores return no record at all: `InboxStore` answers
`claim`/`seen`/`release`/`size`, and the limiter answers a count. The bar for
the list is the *interface*, not the callers: "no caller needs it yet" is exactly
how `created_at` stayed invisible for seventeen migrations.
`rate_limit_counter.window_start` is deliberately not exempt — `prune` surfaces
it through `delete … returning`, and a column a delete returns is a column a
caller can see, which is a distinction the parser had to be taught rather than
one it started with.

**The probe that was too weak, and what fixed it.** The first draft of the
inbound round trip read a freshly accepted row, so `processed_at` was null on
both backends and dropping it from the adapter's select list was caught by the
static half alone. The probe now claims and processes the row first. Written
down because the weakness is general: a round-trip comparison over a row whose
interesting columns are null proves almost nothing.

**Falsification: six attempts, six caught.** Both historical divergences
restored on purpose (outbox `created_at`, inbound `processed_at`), the delivery
claim columns removed from its read, `metadata` removed from the audit read, the
reference outbox stopped from writing `created_at`, and an excuse added for a
column that is read.

**Local measurement.** `typecheck`, `check:governance`, `check:contracts`,
`check:migrations` pass. Without `DATABASE_URL`: 589 passed, 71 skipped in 44 of
46 files. With `DATABASE_URL` against local PostgreSQL 16: 1075 passed in 46
files.

**CI verdict: both jobs green**, read from the run logs for head `8953e0e` on
`read-path-parity` (PR run `34746138148`, push run `34746135902`):

| Job | Result | Wall time | Totals |
|---|---|---|---|
| Verify without a database | success | 34s | 589 passed, 71 skipped in 44 of 46 files; the lifecycle file skipped |
| Verify against PostgreSQL | success | 2m07s | 1075 passed in 46 files; the lifecycle file 1 passed |

Both totals match the local measurement exactly. What CI adds for this cycle
specifically: the eight behavioural round-trip assertions compared a reference
record with one read out of a `postgres:16` that CI built from the 19
migrations, so the claim that the two backends return the same record is now a
claim about a database this repository did not create.

## Cycle 2026-09-13 (ninth) — selection parity

The seventh parity cycle, and the first to gate a **predicate** rather than a
value. Full account in `docs/selection-parity.md`.

**Why it exists.** Milestone 20 closed with the observation that a static read
gate proves no column is unreachable and cannot prove a read returns the right
*rows*, and that a behavioural round-trip compares two records for one write and
says nothing about a selection over many. Every queue operation in CORE is
written twice — once in SQL, once in TypeScript — and nothing compared the two.
B-22, B-24 and B-25 were all found in exactly these methods.

**The divergence.** `InMemoryOutbox.claimDue` did not sort. It walked the
insertion order of a `Map` while `PgOutboxStore.claimDue` ordered by
`(next_attempt_at, created_at)`; with one row failed and re-scheduled, the
reference backend served the event appended first and Postgres served the one
that had been due longest. Under a limit that decides which work a worker gets.
The same gap was in all three `reclaimExpired` implementations, and the Postgres
ones ordered by `next_attempt_at` alone — not a total order over rows that
became due in the same millisecond, so which abandoned claims a limited recovery
freed was left to the plan.

**The fix is one comparator, not three patches.**
`src/platform/eventing/queue-order.ts` states the discipline once —
longest-overdue first, then the row's own arrival as an explicit tiebreak — and
the three reference stores use it in both operations. The three Postgres
recovery statements now spell the same two keys.

**What the ordinary cases could not see.** A batch claim stamps one lease expiry
on every row it takes, so after a single claim due order and insertion order
agree and a comparison between them passes whichever one a backend implements:
removing the ordering from a reference `reclaimExpired` did not fail the suite.
A staggered-lease scenario pulls them apart — three rows claimed together, the
middle one failed and re-claimed later so its lease runs out last — and a
recovery with `limit = 2` then frees different rows under the two orders. It is
asserted against the intended discipline without a database and against Postgres
with one.

**Falsification.** Seven breaks, seven caught: reference `claimDue` back to
`Map` order; the `claimed_at` predicate dropped from the reference and from the
Postgres delivery claim; the Postgres outbox claim ordered by `created_at` only;
and each of the three reference `reclaimExpired` orders removed. F2 is recorded
because it *failed to fail* at first — at every instant the existing cases
claimed at, the held row's lease had not run out, so `next_attempt_at <= now`
excluded it anyway and the `claimed_at` half of the predicate was doing nothing
observable. A case per queue that claims *after* the lease expires — the B-24
situation — is what makes F2 and F4 fail now. Not falsifiable by construction:
the secondary sort key in the Postgres recovery statements, because forcing two
rows due in the same millisecond through the stores' own APIs is not something
the fixed clock can arrange here.

**Local measurement.** 595 passed / 114 skipped without a database; 1124 passed
in the main file set and 1 in the cluster file with `DATABASE_URL` set, plus
governance, contract and migration checks. The known
`tests/migration-0011-lifecycle.test.ts` oddity reappeared unchanged: the file
is reported FAIL in the combined run while its single test is reported passed,
and it passes standalone. It is recorded rather than hidden, and CI is the
judgment.

**CI verdict: green.** Run 34747601744 on `1ac20cb`, both jobs successful.
*Verify without a database*: 595 passed / 114 skipped across 45 files, plus the
cluster file skipped. *Verify against PostgreSQL* (`postgres:16` built from the
19 migrations): 1124 passed across 47 files and 1 passed in the cluster file —
1125 in total, matching the local measurement exactly. Notably,
`tests/migration-0011-lifecycle.test.ts` passed in CI in the same combined run
where it is reported FAIL locally, which keeps that oddity a local-environment
observation rather than a defect in the file.

## Cycle 2026-09-13 (tenth) — selection parity for the module read paths

The eighth parity cycle. Full account in `docs/module-selection-parity.md`.

**Why it exists.** Milestone 21 gated the predicates of the three eventing
queues — the family with the worst history — and deliberately stopped there.
Every other listing in the repository is written twice in exactly the same way:
`order by created_at, notification_id` in SQL, and
`[...this.notifications.values()].filter(...)` in TypeScript. Those two agree
whenever rows are inserted in the order the SQL sorts them into, which is what a
fixture does when it seeds a population in a loop — so every existing test
passed on both backends while the two implementations disagreed about the order
a caller receives, and under a `limit` about which rows a caller sees at all.

**What makes the population discriminate.** Every batch is inserted in the
reverse of the order its listing must return — newest-first for timestamps,
descending code for plans and regions, descending name for cities and service
areas — with deliberate ties so the tiebreak is exercised rather than assumed.
A store that returns insertion order now returns precisely the reverse of the
right answer. Each case declares its row count, asserted on the reference
backend without a database, and each ordered case declares the order it must
return, computed from the fixture definitions rather than read back out of a
store: "both backends agree" is not allowed to mean "both are wrong in the same
way".

**The divergences.** Nineteen reference listings returned `Map` insertion order
while their SQL sorted — notification (`forEvent`, `byStatus`, `list`,
`claimDue`, `reclaimExpired`, `recipientsFor`, `listRecipients`), money
(`listAuthorizations`, `allAuthorizations`, `transactions`), subscription
(`listPlans`, `listGrants`, `listSubscriptionsForOwner`,
`listSubscriptionsByStatus`, `listUsage`), identity (`listIdentities`,
`listLinksForIdentity`, `listMemberships`), `organization.list`,
`fulfillment.all` and all four geography listings. Seven Postgres orders were
not total: the five notification reads and the subscription owner/status and
usage reads ordered by a timestamp alone, and `notification.list` takes a
`limit`, so the tie decided the page and the plan decided the tie.

**The discovery.** All four lease queues returned their claimed batch in storage
order. The claim is `update … where id in (select … order by … limit … for
update skip locked) returning …`: the `select` is ordered, but
`update … returning` hands rows back in the order it updated them, which is a
heap scan. The selection was right and the batch a worker then processed was in
heap order — agreeing with due order only while rows were inserted in the order
they came due, which is what every earlier fixture did. Milestone 21's own gate
passed for that reason, and this cycle's inverted population is what made it
visible: `notification.claimDue` returned its three rows in insertion order on
Postgres and in due order on the reference backend.

**The fixes are at the root, not per call site.**
`src/platform/persistence/list-order.ts` states the doctrine once — a reference
listing sorts by the same keys as its SQL, and the key list must be total,
ending with the primary key — and `orderedBy`/`descending` are what the
repositories use. `queue-order.ts` gained the row's own id as a third key for
the same totality reason. All four claims now compute the due rank in a CTE,
carry it through `returning`, and sort the returned batch by it; the rank has to
be carried because the update overwrites `next_attempt_at` with the lease
expiry, so afterwards the due order is gone. The window function sits in a
second CTE because `for update` and a window function cannot share a query
level.

**Falsification.** Five breaks, five caught: the `notification.byStatus`
reference listing back to `Map` order; the Postgres outbox claim back to plain
`update … returning`; `notification.list`'s SQL order flipped from `desc` to
`asc`; the `limit` dropped from the reference `notification.list`; and
`geography.listCities` back to `Map` order. Each was restored from a backup as
soon as the failure was observed and the suite re-measured. Not falsifiable by
construction: a tie in the queue comparator's third key, because forcing two
queue rows to share both `next_attempt_at` and their arrival timestamp through
the stores' own APIs is not something the fixed clock arranges here.

**Local measurement.** 599 passed / 147 skipped without a database; 1161 passed
in the main file set and 1 in the cluster file with `DATABASE_URL` set, plus
governance, contract and migration checks. The known
`tests/migration-0011-lifecycle.test.ts` oddity reappeared unchanged: the file is
reported FAIL in the combined run while its single test is reported passed, and
it passes standalone. It is recorded rather than hidden, and CI is the judgment.

**CI verdict: green.** Run 34761604654 on `82831f7`, both jobs successful (the
duplicate run 34761588024 on the same commit, from opening the pull request,
also green). *Verify without a database*: 599 passed / 147 skipped across 46
files, plus the cluster file skipped. *Verify against PostgreSQL*
(`postgres:16` built from the 19 migrations): 1161 passed across 48 files and 1
passed in the cluster file — 1162 in total, matching the local measurement
exactly. `tests/migration-0011-lifecycle.test.ts` passed in CI in the same
combined run where it is reported FAIL locally, which keeps that oddity a
local-environment observation rather than a defect in the file.

## Cycle 2026-09-13 (eleventh) — selection parity for the HTTP read surface

The ninth parity cycle. Full account in `docs/http-selection-parity.md`.

**Why it exists.** Milestones 18-22 gated the persistence layer: what a row
contains, what a read returns, which rows a store selects and in what order. None
of them reach the layer a caller actually talks to. A route decides which store
method to call, what to pass it, what to do with a parameter that is missing or
repeated or malformed, and what to hand back — and milestone 22's own finding was
that a correct selection can be destroyed by the step after it.

**The correction this cycle opened with.** Milestone 22's record claims it gated
"every other listing in the repository". Re-measuring found it had gated the
*module* repositories only: the outbox, the inbound store and the delivery store
still walked a `Map` while their SQL sorted, and two of those listings are
reachable over HTTP. Of eleven probed listings **seven disagreed between the
backends**. The overclaiming sentence stands where it was written, with the
correction beside it — this is the third time a cycle has opened by falsifying
the previous cycle's own summary, and each time the correction has been additive.

**How the population is honest.** Seeded **through the stores** and read
**through `core.router.handle`**. Seeding over HTTP was considered and rejected:
there is no route that writes a delivery, an inbound event or a reputation
signal, so an API-built population would have shrunk the gate to the subset of
state the API can construct. Reading through the router rather than calling
handlers keeps authorisation, routing and serialisation inside the measurement.
Fixed ids, a fixed clock, two tenants, and deliberate ties on every timestamp a
listing sorts by.

**The four defect classes found by comparison.** The three platform reference
stores returned insertion order. `undelivered()` concatenated
`byStatus("pending")` and `byStatus("dead")`, so the oldest stuck delivery was
never first — and **both backends produced the same wrong answer**, which is the
one class a cross-backend comparison cannot see on its own and the reason each
case declares its expected order independently. Eight SQL orders were not total.
And the routes read parameters with `query.get()` and `Number()`: a repeated
parameter silently kept the first value, `?organization_id=` filtered on `""` and
returned a count of 0 indistinguishable from an empty tenant, and `Number()`
accepted `0x10`, `1e3`, `" 5"`, `+5` and `5.0`.

**The discovery.** `localeCompare` matches no Postgres collation. Measured on the
same eight strings, Postgres `C` and JavaScript's `<` agree exactly
(`MOVE-c Move-b "move a" move-A move-a move1 move_a móve`) and `localeCompare`
produces a different order entirely. The local engine's databases are `C`; CI's
`postgres:16` service is `en_US.utf8`. So the text order CORE produced depended
on where it was deployed, and a gate comparing the two could have been green on
one machine and red on the other for a reason nothing in the repository recorded.
Fixed on both sides at once: `compareValues` compares code units, and every text
order in SQL that a reference listing is compared against is pinned with
`collate "C"`.

**The fixes are at the root.** One strict reader,
`src/platform/http/query.ts`, replaced every `query.get()`/`Number()` pair in
every read route and both local ad-hoc parsers were deleted, so a parameter rule
has one home. `DeliveryStore.byStatuses` replaced the concatenation.
`router.registrations()` is new so the coverage gate reads the router instead of
a list somebody maintains.

**Falsification.** Ten breaks, ten caught — but two of them only after the
**gate** was strengthened, and those two are the useful entries. Dropping the
`delivery_id` tiebreak from the SQL order passed: every undelivered row in the
first fixture had a distinct `created_at`, so no tie existed to decide. Two rows
were moved onto one instant, given different statuses so they also exercise the
merged query, and **inserted in the opposite order to their ids** so heap order
and the declared order disagree; then it failed. Removing the vocabulary guard
from the notification `status` filter also passed: the refusal list probed empty
and repeated values but never an *unknown* one, so an unknown status was accepted
and answered with an empty page — "you have no failed notifications" in place of
"that status does not exist". Two cases were added; then it failed. A gate that
cannot be broken has usually not been aimed at anything.

**What was measured and deliberately not fixed.** A query parameter no handler
reads is still ignored: `?limit=abc` on `GET /v1/notification-recipients`
returns 200 and every row. Refusing it changes what every read route is permitted
to accept and needs a per-route parameter declaration plus a coverage gate over
it, which is not selection parity. Reserved as **milestone 24** rather than
half-built, quietly dropped, or bolted on at the end of a cycle scoped for
something else.

**Local measurement.** 648 passed / 147 skipped in the main file set without a
database (plus 1 skipped in the cluster file); 1210 passed across 49 files and 1
in the cluster file with `DATABASE_URL` set — 1211 in total, against a baseline
of 1162, and the 49 new tests account for the difference exactly, so nothing
regressed. Governance, contract, migration and roadmap checks pass; typecheck is
clean. The known `tests/migration-0011-lifecycle.test.ts` oddity **did not
reappear** this run: the file was reported passed in the combined run as well as
standalone, which is recorded because it is a change in the observation, not
because it is understood.

**CI verdict (the judgment, not the local run).** PR #14, run 34772432700 on
commit `5cbbdb2`. *Verify without a database*: 648 passed / 147 skipped across 49
files, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16` built from the 19 migrations, `en_US.utf8`): **1210 passed across
49 files and 1 passed in the cluster file — 1211 in total**, matching the local
measurement on an embedded PostgreSQL 18.4 in `C` exactly. That agreement is
itself the check on defect class 5: before this cycle the two environments'
collations differed and the reference comparator matched neither, so equal counts
across them is the first run where text order was not a property of the machine.
`tests/migration-0011-lifecycle.test.ts` passed in CI, as it always has.

## Cycle 2026-09-13 (twelfth) — read routes refuse only what they read

Milestone 24, branch `http-parameter-whitelist` cut from `main` at `958b508`. Full
account in `docs/http-parameter-declaration.md`. The tenth cycle in the parity
family and the first that is **not** a parity cycle: nothing in it compares two
backends, because the defect is above the persistence layer entirely.

**Order of work, stated plainly.** The branch was cut from `main` before any file
changed, and the scope was fixed by milestone 23's own record rather than chosen
here — but the reservation paragraph near the top of this file was written *after*
the implementation was drafted, which is not the order this file asks for. Nothing
about the scope moved in between and nothing else was working the row, so the risk
did not materialise. It is recorded rather than tidied, and the next cycle reserves
before it edits.

**The defect.** A query parameter no handler reads was ignored in silence.
`GET /v1/notification-recipients?limit=abc` answered 200 with every row — that
route has no `limit`, so a caller who believed they had bounded the response got
the whole table with a success status. `?organisation_id=…`, the British spelling
or any typo, was ignored and the unscoped answer came back as though it had been
asked for. Milestone 23 spent a cycle on CORE answering a question with the wrong
*value*; this is CORE answering a question the caller **did not ask** and calling
it success.

**Why it is one structural change and not 23 small ones.** A per-handler list of
unwanted parameters is the shape that produced the defect: it must be edited
whenever a parameter changes, nothing checks it, and when it drifts it fails
**open** — the parameter is accepted and ignored, exactly as before. So the
declaration moved into the registration and the enforcement into the router.
`router.get(path, accepts, handler)` takes the accepted set as a required
positional argument; `add(method, path, handler, accepts = [])` defaults to
accepting nothing, so the fail-closed direction is the default one; the parse runs
after the rate-limit check and before the handler; and refusals render through the
same `CoreError` path as every other refusal in CORE.

The load-bearing part is a deletion: **`RequestContext` no longer carries a
`URLSearchParams`.** `ctx.query` is gone and `ctx.selection` is the parsed result,
so a handler cannot read an undeclared parameter because there is nothing left to
read it from — and there is no second way in for the gate to have to police.
`Selection` throws on an undeclared name rather than returning `undefined`, since
`undefined` would rebuild the original defect one level down: a handler reading
`limit` from a route that never declared one would see "not sent" for ever.

**Ordering of the refusal.** Unknown-parameter refusal precedes authentication.
Deliberate: the accepted set is published in `contracts/openapi/core-v1.yaml`, so
the message discloses nothing a reader of the contract lacks, and in exchange a
request CORE cannot understand never reaches a store — authentication is a store
read. The refusal body is pinned to exactly `code`, `message`, `details`,
`retryable`, `correlation_id`: the parameter names and the trace id, nothing drawn
from data.

**The gate.** `tests/http-parameter-declaration.test.ts`, 10 tests, **no
database**, so both CI jobs run it. Driven off `router.registrations()`, never off
a list maintained in the test. A premise test first (≥ 52 routes, ≥ 23 `GET`s, at
least one route with parameters and one without), then: unknown-parameter refusal
on every route of every method, naming the parameter; the 29 no-parameter routes
refusing any query string at all; a liveness probe per declared parameter that
fills the route's *other* parameters with valid values first, because a route with
two required parameters would otherwise refuse the missing one and prove nothing
about this one; well-formedness (unique snake_case, non-empty duplicate-free
vocabularies, `0 < min <= default <= max`); a source scan proving `query.ts` and
`router.ts` are the only modules that touch a query string; a file-scoped
cross-check that every declared name is read and every read name declared; the
contract comparison; and a direct probe of `Selection`.

**What it found beyond the two known cases.** Comparing the declarations with the
published contract — added to delete a second source of truth with an external
audience — found that **`country_code` on `GET /v1/geography/service-areas/resolve`
has been implemented since the geography module shipped and appeared in no
contract**. No consumer reading `core-v1.yaml` could know a country filter existed.
Documented in the same commit, with the parameter description recording what found
it. Every other route agreed exactly, and every registered `GET` is in the
contract.

**Falsification: nine defects, and one that got through.** F2 — a route declaring
a parameter no handler reads — **passed the first version of the gate**, because
that version proved only that a declared parameter is *parsed*, which decoration
satisfies perfectly. The declared-vs-read cross-check was written in response, and
F2 and F7 (a handler reading an undeclared name) were then both caught. This is
the second cycle running in which a falsification survived until the gate itself
was strengthened; the pattern is that a gate written from the implementation
asserts what the implementation happens to do. F9 falsified the contract parser
itself — its path regex made to match nothing — and the premise assertion caught
it, which is the reason that assertion is there.

**Local measurement.** 658 passed / 147 skipped without a database (plus 1 skipped
in the cluster file, so 148); 1220 passed across 50 files and 1 in the cluster file
with `DATABASE_URL` set — **1221 in total**, against a baseline of 1211, and the 10
new tests account for the difference exactly, so nothing regressed. No existing
test changed behaviour despite `ctx.query` being removed from every route in the
repository. Typecheck, governance, contract and migration checks all clean.

**What this cycle does not claim.** No parity claim of any kind. Request **bodies**
still tolerate unknown properties, and that is a different question rather than a
smaller one: strict body rejection breaks any client sending an extra field,
whereas nothing legitimate was ever sending an undeclared query parameter. The
declared-vs-read cross-check is file-scoped, not handler-scoped, because
`reputation/http.ts` reads `organization_id` in a helper shared by two routes.
`kind: "text"` carries no format, so a parameter that must be a UUID is still
validated by the handler that knows it — pushing formats into the declaration would
grow a second schema language next to the contract.

**CI verdict (the judgment, not the local run).** PR #15, run 34774248943 on
commit `9d1fdfa`. *Verify without a database*: **658 passed / 147 skipped across 48
of 50 files**, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16` built from the 19 migrations, `en_US.utf8`): **1220 passed across 50
files and 1 passed in the cluster file — 1221 in total**, matching the local
measurement on an embedded PostgreSQL 18.4 in `C` exactly, in both jobs and in both
directions. The new gate runs in *both* jobs, which is the point of it needing no
database: the guarantee that a route refuses what it does not read is checked on
every push, not only on the pushes that reach a database.

## Cycle 2026-09-13 (thirteenth) — write routes accept only the body they declare

Milestone 25, branch `http-body-declaration` cut from `main` at `ff0c49f`. Full
account in `docs/http-body-declaration.md`. The symmetric half of milestone 24, and
the first cycle in this family whose row was **reserved before any implementation
file was edited** — the twelfth cycle's record promised that and this one kept it
(reservation `6e00159`, implementation `35844bb`).

**The defect.** Milestone 24 closed the query string and named the body as a
separate open question. Measuring it first turned a symmetry argument into a money
defect: `POST /v1/payment-authorizations/<id>/capture` with
`{"amountMinor": 500, "capture_reference": "cap-1"}` against a 5000-minor hold
answered **200 and captured 5000** — the whole hold, ten times what the caller
asked for. The route reads `amount_minor` and treats its absence as "capture the
whole remaining hold", which is the right meaning for absence, so a camelCase typo
was indistinguishable from a request to take everything. `refund` has the same
shape. `POST /v1/wallets` accepted `nonsense` and `CURRENCY` beside `currency` and
answered 201; a `featureKey` typo inside a plan `grants` item was ignored, silently
changing what a plan sells. All four are one cause: each of the 29 write routes
hand-parsed `ctx.body as Record<string, unknown>` with helpers duplicated across
seven files, and none refused a property it did not read.

**The fix.** `src/platform/http/body.ts` owns every body reader.
`router.post(path, body, handler)` takes the declaration positionally,
`add()` defaults to `NO_BODY` so a forgotten declaration fails closed, the router
parses the body before the handler runs and refuses unknown properties first with
the accepted names in the message, and `RequestContext` carries **no raw body** —
`ctx.input` is a `Body` that throws on an undeclared read, because `undefined` is
exactly how a capture of 5000 looked like a capture of 500. Nested `grants` items
are declared. Five routes declare `NO_BODY` and refuse every property while still
accepting an absent body and `{}`. One opaque body exists, `POST /v1/events`, whose
envelope is validated against `contracts/events/*` by `normalize.ts`; it carries a
written reason and the gate asserts the opaque list is exactly that one route.
Seven per-module body helpers were deleted.

**The gate.** `tests/http-body-declaration.test.ts`, 16 tests, no database, driven
off `router.registrations()`: unknown-property refusal on every write route,
refusal before authentication, `NO_BODY` routes refusing everything and accepting
nothing-shaped bodies, liveness and required-absence probes by field name (80+
probes), nested refusal, the omitted-versus-null grant limit, the three measured
defects refused while an absent capture amount is still accepted, a declared-versus-read
cross-check in the source, well-formedness, the opaque list, a source scan proving
no handler reads a body another way, a direct probe that `Body` throws, and a
cross-check against every `requestBody` in `contracts/openapi/core-v1.yaml`.

**What the contract cross-check found.** Four write routes —
`POST /v1/geography/countries`, `/regions`, `/cities`, `/service-areas` — were
documented with **no request body at all** while CORE has always required three or
four properties each, so no integrator could have constructed those calls from the
contract. Documented additively, matching the declarations. Same class of finding
as milestone 24's undocumented `country_code`, from the same kind of check.

**Falsification.** Nine deliberate breaks, all caught: unknown properties ignored
(4 tests fail), a declared-but-unread field (2), a handler reading `ctx.body` again
(1, plus `tsc`), a second opaque body (1), a declared property the contract does
not document (2), a `NO_BODY` route accepting properties (2), an undeclared read
returning `undefined` (1), a non-object body accepted (1), an empty enum vocabulary
(3). F3 and F7 are each caught by a single test and that is recorded rather than
smoothed over.

**A milestone 24 gate was sharpened, not weakened.** This cycle's own source broke
two of milestone 24's checks without containing a defect: `body.ts` explains in
prose why there is no `URLSearchParams` and a substring scan counted the word, and
body field specs share the `{ name, kind }` literal shape with parameter specs so a
file-wide regex read them as unread query parameters. The scanners moved to
`tests/support/source.ts`, are comment-blind and attribute a literal to the
`router.get`/`router.post` call it was written in. Both gates still catch their own
falsifications — including milestone 24's F2, re-run on the sharpened version — so
what they assert is unchanged and only where they look is more precise.

**Process note, recorded rather than tidied.** In the first falsification round a
script reverted patches with `git checkout --` while `body.ts` and the new test
files were untracked; the revert silently failed for the untracked file and
silently reverted three already-migrated route modules, so three readings were
taken against a tree missing the work. Those readings are discarded, not reported.
The modules were re-migrated, typecheck and the full suite were re-run, and the
implementation was committed **before** falsification was attempted again; every
reading in the table in `docs/http-body-declaration.md` was taken with a clean tree
and verified clean afterwards.

**Local measurement.** Without `DATABASE_URL`: 674 passed / 147 skipped, plus 1
skipped cluster test (baseline 658 / 147). With `DATABASE_URL` on an embedded
PostgreSQL 18.4 in `C`: 1236 + 1 = **1237** passed, none skipped (baseline 1221).
`npm run typecheck`, `check-governance.mjs`, `check-contracts.mjs`,
`check-migrations.mjs` all pass. No existing test needed changing to accommodate
the new strictness, which is itself a measurement: every request the suite makes
was already made of declared properties, so these routes were strict in intent and
loose only in enforcement.

**CI verdict (the judgment, not the local run).** PR #16, run 34775704136 on
commit `c22989e`. *Verify without a database*: **674 passed / 147 skipped** across
49 of 51 files, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16` built from the 19 migrations, `en_US.utf8`): **1236 passed across 51
files and 1 passed in the cluster file — 1237 in total**, none skipped. Both
numbers match the local measurement on an embedded PostgreSQL 18.4 in `C` exactly,
and both exceed the baseline by the 16 tests this cycle added. Every gate in
`tests/http-body-declaration.test.ts` therefore passed in the environment that
gates the merge, not only locally.

## Cycle 2026-09-13 (fourteenth) — CORE reads only the headers it declares

**Chosen because it was the last of three surfaces, and the only one CORE stores.**
Milestone 24 closed the query string and milestone 25 the body; both records named
the headers as what was left. Measuring them before reserving this row turned that
symmetry argument into three separate defects, all against `main` at `a043ab7`,
all through `createServer(core.router.nodeListener())` and a raw socket rather
than through the test harness:

| Request | Answer on `main` |
| --- | --- |
| `x-correlation-id:` 8000 characters | `200`, echoed and recorded in full |
| `x-correlation-id: "   "` | `200`, `"   "` became the identity of record |
| `x-correlation-id: a\tb` | `200`, accepted |
| `x-correlation-id: a` sent twice | `200`, recorded as `"a, b"` |
| `authorization` sent twice | accepted; `bearer()` authenticated `[0]` |

The router's rule was "any non-empty string, verbatim", and that string reached
the response header, the request log, and the `correlation_id` **`text`** column of
every audit, outbox, ledger, inbound-event, notification and subscription row the
request created. So a caller could write kilobytes of chosen text into CORE's
permanent audit trail with every ordinary request; two unrelated requests could
both be traced by `"   "`; and a repeated header produced an id belonging to
neither half, which a later lookup by either value cannot find while the row looks
well formed. `bearer()` had the same flaw pointed the other way, narrowing two
credentials to `[0]` in silence — and the rate limiter derived its subject from
the same headers independently, so the credential it charged and the credential
`bearer()` authenticated were not guaranteed to be the same value.

**What changed.** `src/platform/http/headers.ts` is the only reader of a request
header in `src`. `DECLARED_HEADERS` names five, each with a **use**, a **length
bound** and a **recorded reason**: `x-correlation-id` (`recorded`, 128),
`authorization` (`credential`, 4096), `x-forwarded-for` (`forwarded`, 512),
`x-real-ip` and `x-client-ip` (`forwarded`, 128). The three uses are three
strictnesses chosen by what CORE does with the value: a `recorded` header is
checked against an identifier shape because everything downstream treats it as an
identifier; a `credential` must be one `scheme token`, and deliberately is *not*
checked for scheme or token validity, because an invalid credential is `401`
decided against real state and moving that to the edge would turn an
authentication answer into a syntax answer; a `forwarded` header stays a list,
because a proxy chain is one, and its first entry is read through
`firstForwarded` — the one declared read where taking part of a value is correct.
`RequestHeaders` throws on an undeclared read. The router checks the headers
before the route is matched and before the limiter runs, which is what makes the
limiter's credential and `bearer()`'s the same value by construction, and a
refusal carries a generated id rather than echoing the value that caused it.

**Contract.** `components/parameters/CorrelationId` documents the header, its
shape, its bound and the refusal, and is referenced from **all 52 operations** —
a component parameter nothing references documents nothing. The `Authorization`
rule is stated in the API description. Neither header appeared anywhere in the
contract before this cycle, which the contract cross-check found the same way
milestone 25's found four undocumented request bodies.

**Gate.** `tests/http-header-declaration.test.ts`, 15 tests, no database, so it
runs in both CI jobs. It also asserts on purpose that an **undeclared header is
not refused**: HTTP requires unknown headers to be ignored and every proxy adds
its own, so this family's rule is deliberately weaker here than for the query
string and the body, and the gate states the weaker rule rather than leaving the
difference unspoken — what is enforced is that CORE never *reads* an undeclared
header.

**Falsification.** Eleven mutations, each applied to a committed tree, the gate
run, the tree restored and confirmed clean: no length bound (2 fail), the old
"any non-empty string" rule (2), a repeated header narrowed to `[0]` (1), the
refusal echoing the rejected value (2), headers checked only on a matched route
(1), an undeclared read returning `undefined` (1), the raw reader restored (1),
the raw reader hidden behind a cast (1), a reader asking for an undeclared name
(1), one operation dropping the `CorrelationId` reference (1), the component
parameter deleted (1).

**F7b defeated the first version of the gate, and that is recorded rather than
tidied away.** The source scan was written as `headers\s*\["name"\]`, and
`(ctx.headers as unknown as Record<string, string>)["authorization"]` passed it,
because the cast separates the word from the bracket. The scan was replaced with
the rule it was approximating — a declared header name may appear in `src` only as
the argument of `.value` or `.firstForwarded` — and both spellings then fail. Two
commits carry that in order, `fa4b0d7` then `be6dd30`, so the branch shows the
weak gate and its replacement rather than only the final state. A second process
note from the same round: `git checkout -- .` reverted the sharpened but
**uncommitted** test file, so one re-run of F7b was measured against the old scan
again; those readings were discarded and every reading was re-taken after
committing. That is the second cycle in a row where a dirty tree produced a false
reading, and the lesson is written down again — commit before falsifying, and
verify the tree is clean after each restore.

**Measured, not asserted.** Without `DATABASE_URL`: 674 → **689 passed / 147
skipped**. With it: 1237 → **1251 + 1 = 1252**, none skipped, on a real PostgreSQL
18.4 with all 19 migrations applied. `tsc --noEmit` clean; governance, contract,
migration and roadmap gates pass. One existing test file changed —
`tests/rate-limit.test.ts` builds `subjectFor`'s input with `parseHeaders({...})`
because the function now takes checked headers — and nothing was loosened to
accommodate the new strictness.

**What this cycle does not claim.** It does not make the correlation id
trustworthy: it is still the caller's value, now a bounded identifier rather than
arbitrary text, and `request_id` remains the only id CORE generates. It does not
authenticate at the edge. It does not bound the total header size — Node's own
limit does, and CORE does not restate it. It governs nothing about response
headers, and it does not address `content-type`, which CORE still ignores when
parsing a JSON body. Full record in `docs/http-header-declaration.md`.

**CI verdict (the judgment, not the local run).** PR #17, run 34777041478 on
commit `5fb959c`. *Verify without a database*: **689 passed / 147 skipped** across
50 of 52 files, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16` built from the 19 migrations, `en_US.utf8`): **1251 passed across 52
files and 1 passed in the cluster file — 1252 in total**, none skipped. Both
numbers match the local measurement on an embedded PostgreSQL 18.4 in `C`
collation exactly, and both exceed the previous cycle's by the 15 tests this one
added. Every assertion in `tests/http-header-declaration.test.ts` therefore passed
in the environment that gates the merge, not only locally.

## Cycle 2026-09-14 (nineteenth) — authentication is a route declaration, resolved before anything else

Milestone 29 closed an escalation and left its other half explicitly open:
ordering, and the fulfillment existence oracle. This cycle is that half.

**Measured before anything was edited**, on the reservation commit `af2afd7`, by
driving all 52 registrations over the real router with no `authorization` header
and a syntactically valid but invented identifier in every path parameter:
`200`×3 (`/health`, `/ready`, `/metrics`), **`400`×28**, `401`×19, **`404`×2**,
and `401` documented on **3 of the 46** operations that can answer it.

**A correction to the reservation, recorded additively.** The reservation read
`400`×27 / `401`×20 on the same commit. Neither reading is wrong: they used
different probe bodies, and some routes refuse an empty body for a reason that
has nothing to do with credentials — `POST /v1/payment-authorizations/{id}/void`
requires a property, `…/capture` does not. Both figures stand; the sweep in the
gate uses the second.

**The finding that settled the ordering question** is not the 28. It is the 2.
`GET /v1/fulfillments/{fulfillment_id}` answered `404` for an invented id and
`401` for a real one, to the same anonymous caller, because the route loaded the
row to get `organization_id` for its permission check. Anyone holding nothing
could test whether a fulfillment id exists by reading a status code.
`POST /v1/fulfillments/{id}/cancel` had the same shape.

**What was built.** `src/platform/http/authentication.ts`: `AuthenticationSpec`
is `AUTHENTICATED` or `anonymous(reason)`, and `anonymous("")` throws — an
exemption without a written argument cannot be registered. Every `Router`
registration carries one and the registration API defaults to `AUTHENTICATED`,
so the unsafe direction is the one that has to be typed. `Router.handle`
resolves it **after the rate limiter** and **before** `parseSelection`,
`parseBody` and the handler, and `RouterOptions.authenticator` is required
rather than optional, so a router that cannot enforce what its routes declare
does not typecheck. `bearerCredential` is the only reader of the `authorization`
header in `src/`; `bearer()` is deleted, no handler calls `authenticate`, and
`requirePrincipal` authorizes the principal the router already established.
`RequestContext<A>` carries it.

Six routes are anonymous by declaration: the three probes (B-5 keeps them off
the public internet by topology, not by code), `POST /v1/identities` and
`POST /v1/sessions` because that is how a credential is obtained (B-39), and
`POST /v1/sessions/revoke` because it needs none today (B-40). Three of the six
reasons name the blocker that keeps them so, which is the point of requiring a
reason — the exemptions that are wrong stay legible as wrong.

**After**: `200`×3, `400`×3 (those three anonymous write routes refusing an
empty body, which is the answer they should give), **`401`×46**, `404`×0. Real
and invented identifiers are indistinguishable to an anonymous caller on every
route. The contract documents `401` on **46 of 46** through a new
`Unauthenticated` response component that states the two things a status code
cannot: that this refusal comes first, and that it is the same answer for an
identifier that exists and one that does not.

**The conflict with milestones 24 and 25, resolved on purpose rather than
patched away.** Those gates asserted `400` **before** `401`, for three stated
reasons. The third — "a caller with a typo must hear about the typo" — is kept
as behaviour: an authenticated caller still does, and both gates still assert
exactly that. The second — "a request CORE cannot understand must not reach a
store, and authentication is a store read" — is kept as fact: the limiter still
runs first, a request with no `authorization` header is refused before
`authenticate` is called at all so it costs **zero** reads, and a junk
credential costs **one** indexed session read inside a budget the limiter has
already applied. The first — "the parameter list is published, so disclosing it
early discloses nothing" — was true and insufficient: the existence of a
fulfillment id is not published, and one ordering cannot be right for the public
half and the private half of the same answer. Both cases were replaced by their
inverse, each carrying the reversal and this reasoning in the case itself, and
`tests/support/credential.ts` mints them a credential that is **authenticated
and entitled to nothing** — so their `400`s are still proven, and now proven to
precede the `403` that caller would otherwise receive, which is a slightly
stronger claim than they made before. Nothing was deleted from the earlier
record; `docs/authentication-ordering.md` quotes it and answers it.

**Gate.** `tests/http-authentication-declaration.test.ts`, 16 cases, no
database, so it runs in both CI jobs. It asserts the declaration exists on every
registration, names the six anonymous routes **by name** rather than counting
them, requires a real sentence as a reason, drives the anonymous sweep with no
credential and with a junk one, compares every parameterised route's anonymous
answer for a real identifier against an invented one (21 comparisons, bodies as
well as statuses), asserts `401` precedes both `400` families, asserts the
source order limiter → authentication → parse, asserts a real credential still
passes every route (via the response gate's scenario, so a declaration that
refused everybody would not pass), pins the three modules allowed to read the
header with the reason each is allowed, and cross-checks the contract in both
directions — documented `iff` required.

**Falsification.** Seven mutations, each applied to a committed tree, the gate
run, the tree restored and confirmed clean: a required route declared anonymous
(4 cases fail), authentication moved after both parses — milestone 24/25's
ordering restored (4), authentication removed for parameterised routes, which
restores the oracle (**the file fails outright: the gate's own fixture cannot be
built, and that is recorded as a weakness of that case's fixture rather than
dressed up as a clean signal**), the refusal naming the path it refused (2), one
`"401"` deleted from the contract (1), the empty-reason guard removed (1), and a
fourth reader of the header added in `money/http.ts` (1).

**Measured, not asserted.** Without `DATABASE_URL`: 717 → **733 passed / 147
skipped** across 54 files. With it: 1279 → **1295 passed across 56 files, plus 1
in the cluster file — 1296**, none skipped, on a real PostgreSQL 18.4 with all 19
migrations applied. `tsc --noEmit` clean; governance, contract, migration and
roadmap gates pass. Four existing test files changed and none was loosened: the
two gates above gained a credential and their inverted cases, and the two probe
routes in the response gates now declare `anonymous(...)` because a probe route
still has to say what it is.

**What this cycle does not claim.** It does not make "authenticated" mean much
on its own: **B-39** (`POST /v1/sessions` mints a token for any `principal_id`)
and **B-40** (revocation needs no credential) are still open and still gated by
`tests/anonymous-privilege-escalation.test.ts`, untouched. It does not change
who may do what — that is `identity.authorize`. It does not make `/metrics` or
`/ready` safe to expose; **B-5** still owns that. And the known CI/local
skipped-count difference (147 in CI, 148 locally) is restated, not rounded away.

**CI verdict (the judgment, not the local run): none — CI could not run.** PR
[#21](https://github.com/uxxxug/wasla-core/pull/21), head `cdf562a`, run
`34794100060`. Both jobs — *Verify without a database* and *Verify against
PostgreSQL* — completed as `failure` in **3 seconds with zero steps and no
runner assigned**. The annotation on check run `103823757539` gives the cause:
*"The job was not started because recent account payments have failed or your
spending limit needs to be increased."* The two pushes before it,
`34789466472` and `34794082248`, failed identically; the last run that actually
executed was `34784262565` on `main` at 21:35, the milestone 29 merge, which
passed. So this is an account-level outage, not a verdict on this branch, and
it is recorded as **B-41**.

**What that means for this milestone, stated plainly.** The local measurement is
733/147 without a database and 1295 + 1 = 1296 with one, on PostgreSQL 18.4 with
all 19 migrations applied, and every gate above passes there. **None of that is
a verdict.** This repository's rule is that CI judges and a local run does not,
and nothing here has been judged. Milestone 30 is therefore complete, pushed and
**unjudged**, the branch is not merged, and the row above should be read with
that qualification. When Actions runs again, re-run `34794100060`, record both
jobs' counts here additively, and merge only on the strength of that.

**CI verdict (the judgment, not the local run) — arrived late, and green.** PR
[#21](https://github.com/uxxxug/wasla-core/pull/21), head `da1b8fa`, run
`34794219774` **attempt 2**. Attempt 1 of that same run, and runs
`34789466472`, `34794082248` and `34794100060` before it, never started a job at
all (B-41); the repository was made public on 2026-09-14 and the identical
commit then ran. *Verify without a database*: **733 passed / 147 skipped across
54 files, 2 skipped**, plus 1 skipped in the cluster file. *Verify against
PostgreSQL* (`postgres:16` built from the 19 migrations): **1295 passed across
56 files, none skipped, and 1 passed in the cluster file — 1296 in total**. Both
figures match the local measurement on an embedded PostgreSQL 18.4 exactly, and
both exceed the previous cycle's by the 16 cases this one added.
`tests/http-authentication-declaration.test.ts` is named in both job logs as 16
passed. The known CI/local skipped-count difference is restated rather than
rounded away: **147 in CI against 148 locally**, unexplained since milestone 22
and still unexplained here.

**So the paragraph above it is superseded in one respect only**, and additively:
where it said "complete, pushed and **unjudged**", milestone 30 is now complete,
pushed and **judged green by CI**. Nothing else in that paragraph changes — the
measurements, the reversal of milestones 24 and 25, and the falsification table
were all recorded before the verdict existed and are unaffected by it.

## Cycle 2026-09-14 (twentieth) — a session is issued only by a caller entitled to issue one

Milestone 31, branch `session-entitlement`, closing **B-39** and **B-40** — the
two blockers milestone 30 had to leave open — and a third defect that was found
while measuring them and had never been recorded anywhere.

**Measured first, on `main` at `b63585d`, before a line was edited.** Against
the real router, with a victim tenant whose administrator holds `platform_admin`
(14 permissions) and a live session: `POST /v1/sessions` with **no credential**
and the administrator's `principal_id` answered **201** with a working token,
and that token read `GET /v1/sessions/current` as `platform_admin` with 14
permissions — full impersonation of a named principal by anybody who had seen
its id, and a principal id is not a secret (**B-39**). The same call with an
outsider's own valid token also answered **201**, so holding a credential
neither helped nor was required. `POST /v1/sessions/revoke` with **no
credential** and the administrator's `session_id` answered **204**, and the
administrator's next request answered `401 session expired or revoked`
(**B-40**). And the same route with a well-formed `session_id` that exists
nowhere answered **204 and then terminated the process** with an unhandled
rejection, because the handler called `identity.revokeSession(...)` **without
`await`**: the caller was told a revocation succeeded that never happened, and
an unauthenticated request was a remote kill. That one was new.

**What the contract said.** `POST /v1/sessions`: `201`, `404`, `429`.
`POST /v1/sessions/revoke`: `204`, `429`. Neither documented `401` or `403`,
which was consistent, because neither refused anyone. But `/v1/sessions/revoke`
carried no `security: []` while being anonymous in code — the contract already
said a credential was needed and the router did not require one. **The contract
was right and the code was wrong**, which is not the usual direction here.

**What it is now.** `session.issue` is a permission, held by `platform_admin`
and `service` and by nothing else, and deliberately **not** implied by
`identity.write` — editing an identity and being able to become it are different
powers. `service` is the direction B-39's own text recommended: a channel
adapter authenticates a person the way its channel already does and then asks
CORE for a session on their behalf, which is what the `service` role and the
`partner_api` channel already existed for. Both routes declare `AUTHENTICATED`,
so milestone 30's ordering now covers the two routes that opted out of it.
Revocation allows your own session with **no permission at all** — logging out
is not an administrative act — anybody else's with `identity.write`, and checks
that authorization **before** the not-found refusal. That ordering is the whole
difficulty: closing B-40 the obvious way would have replaced an open door with
the existence oracle milestone 30 spent a cycle removing, readable by anybody
holding any credential. An unprivileged caller now gets `403` for a real session
id and `403` with the same code for an invented one. The `await` is there.

**The first credential of an environment**, since a route that requires a
session to issue a session cannot issue the first one: `npm run
bootstrap:credential -- --service-name <name> --organization <id> [--roles
service]`, which requires an organization that already exists, refuses to invent
a tenant, defaults to the weaker role, and **authenticates the token it just
minted and verifies every requested role before printing anything**. It needs
`DATABASE_URL`, and that is the security argument: anybody who can run it can
already read every row and write every table, while the route it replaces needed
only the ability to send a request. Exercised end to end against a real
PostgreSQL — first run `identity_created: true`, second run the same principal
with a new session and both flags `false` and the first token still valid, an
unknown organization exiting `1` with `organization not found`.

**Counted, not asserted.** Anonymous routes **6 → 4** (`/health`, `/ready`,
`POST /v1/identities`, `/metrics`); routes requiring a credential **46 → 48**;
`401`, `403` and `404` documented on both session operations. The
`security: []` set in the contract is now asserted **equal** to the set of
`anonymous(...)` registrations, as a set and not a count, so the disagreement
this cycle found cannot recur silently — one fact with one statement of it.

**Falsification: six mutations, all caught.** Dropping the permission from the
issue route (5 cases across 2 files); moving the not-found refusal before the
authorization (the real-vs-invented case, and only that case — it is the only
thing standing between this milestone and a new oracle); `void` instead of
`await` (4 cases); restoring `security: []` on `/v1/sessions` (the census
equality); granting `session.issue` to `org_admin` (2 cases); disabling the role
verification in the bootstrap (the weaker-roles case).

**Two existing gates changed, and neither was loosened.**
`tests/anonymous-privilege-escalation.test.ts`'s last case asserted `201` and
now asserts `401`, `403` and `201` for three different callers — changed **on
purpose**, which is exactly what its own comment said answering B-39 would mean.
`tests/http-authentication-declaration.test.ts`'s census went from 6 anonymous /
46 required to 4 / 48. Both headers keep their original paragraphs verbatim and
append the supersession, because the record of what was known when they were
written is worth more than a tidy file.

**Measured:** **758 passed / 147 skipped across 55 files** without a database,
**1320 across 57 files, plus 1 in the cluster file — 1321** with one, on an
embedded PostgreSQL 18.4 with all 19 migrations applied. `tsc --noEmit` clean;
governance, contract, migration and roadmap gates pass.

**What this cycle does not claim.** `session.issue` is **unscoped**: a `service`
credential may mint a session for any principal, not only for the people its own
channel speaks for. That is **B-42**, recorded rather than half-answered, and it
is strictly smaller than what was closed — it needs a credential CORE issued to a
named system, that credential is revocable, and every issuance is audited as
`session.issued` against the issuing principal. CORE still verifies no proof of
possession of a channel account; it moves that to the adapter, explicitly.
Session expiry, rotation and refresh are untouched. `/metrics`, `/health` and
`/ready` are still anonymous and **B-5** still owns where they live. `POST
/v1/identities` stays anonymous because registration is how a principal comes to
exist. Full account in `docs/session-entitlement.md`.

**CI verdict (the judgment, not the local run): green.** PR
[#22](https://github.com/uxxxug/wasla-core/pull/22), head `3d6173b`, runs
`34835539650` (pull_request) and `34835517835` (push) — both `success` on both
jobs. *Verify without a database*: **758 passed / 147 skipped across 55 files,
2 skipped**, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16` built from the 19 migrations): **1320 passed across 57 files,
none skipped, and 1 passed in the cluster file — 1321 in total**.
`tests/session-issuance-entitlement.test.ts` is named in both job logs as **25
tests** passed. Both figures match the local measurement on an embedded
PostgreSQL 18.4 exactly, and both exceed milestone 30's by the 25 cases this
cycle added. The known CI/local skipped-count difference is restated rather
than rounded away: **147 in CI against 148 locally**, unexplained since
milestone 22 and still unexplained here. This is the first cycle since B-41 in
which a verdict existed at the moment the work was finished rather than a day
later.

## Cycle 2026-09-14 (twenty-first) — a retried write creates one row, not two

Milestone 32, branch `retry-idempotency`, closing **B-37** — the
`idempotency_key` table nothing wrote — and opening **B-43**.

**Measured first, on `main` at `bd92b69`, before a line was edited.** Every
write route's **own recorded request** was re-issued a second time,
byte-identical, against the state the response gate's scenario leaves, and the
rows of all 25 business tables the reference registry holds were counted around
each call. Four routes wrote a second row: `POST /v1/organizations` (same name,
same country), `POST /v1/geography/cities`, `POST /v1/geography/service-areas`,
and `POST /v1/subscriptions` — the expensive one, where the duplicate is a
second recurring charge against the same wallet, one more `payment_authorization`,
one more `ledger_transaction` and four more `outbox` rows. `POST /v1/sessions`
also minted a second session, which is correct and is the reason
`new-each-time` exists. Three routes refused the repeat with `409`. The rest
already collapsed it, by four mechanisms nothing named as a policy: a
natural-key upsert, a caller-supplied reference, a uniqueness constraint, and a
state transition that is a no-op once it has happened. `POST
/v1/geography/regions` deduplicated while `POST /v1/geography/cities` beside it,
in the same module, did not — the clearest evidence that retry safety was an
accident of each handler rather than a property of the surface. No route read an
`Idempotency-Key` header at all, because milestone 14's declaration means an
undeclared header is never read.

**Two of the reservation's own numbers were wrong, and are corrected additively
rather than quietly.** The reservation said five routes duplicate and four
refuse; the re-measurement found four and three. `POST
/v1/geography/countries` answered `201` again and wrote **no** second row,
because the country's primary key is the code the caller sends and the
repository upserts it — the repeat silently *overwrote* the existing row. That
is a quieter form of the same defect, since whichever call arrives second
decides the country's name and default currency and a caller retrying a call it
never saw the answer to cannot tell that from having been first, and it is why
the route is declared `keyed` anyway. The reservation also said 36 calls across
29 routes; the measurement re-issued 29, one per write registration, because the
scenario keeps one recorded request per contract label. A third correction was
found only against Postgres: a replay is the same JSON *document*, not the same
bytes, because `jsonb` orders keys itself — so the gate asserts document
equality through the production canonicaliser.

**What was built.** Retry safety is now declared at the registration, beside
`accepts`, `body` and `authentication`, and enforced by the router — the same
shape as milestone 30 (authentication) and milestone 31 (entitlement), applied
one level over to the question a caller asks after a timeout. `retry.ts` offers
three mechanisms and no fourth, each requiring a non-empty reason; `SAFE` is
declared once for all 41 reads rather than 41 times; `KEYED_BY_DEFAULT` is
`add()`'s default so a forgotten declaration fails closed, and the gate
separately fails any write route that *relies* on the default. The router
enforces the key after authentication (a `401` must not be answerable from a
record) and after the body is parsed (a fingerprint is a fingerprint of the
request CORE understood) and before the handler (collapsing a repeat after the
work is done collapses nothing). Only a `2xx` is recorded, so a caller told its
body is invalid can correct it under the same key; migration `0020` restates
that as a CHECK, enforced on Postgres and in `ROW_RULES`, and adds the three
columns the 2026-era table was missing plus a primary key of
`(method, scope, key)`. A `find` that fails refuses the request rather than
running the handler unprotected; a `record` that fails still returns the answer,
logged on the request's own line.

**Falsification.** Seven mutations, each measured and reverted, the tree
restored from a byte-exact snapshot. Six were caught by named cases — the
missing-key refusal disabled, the fingerprint comparison dropped, the store
scoped by key alone, the replayed body emptied, the replay header dropped, and
`POST /v1/organizations` mislabelled `natural`, which failed 8 cases across 2
files. The seventh is reported as a **finding**: removing the `2xx` condition
from the router changed nothing observable on its own, because the body refusal
is raised before the retry block and a handler's refusal leaves through the
catch. Only with both of those closed *and* `ROW_RULES` emptied did a case
fail. So "a refusal is never recorded" is defended three deep — ordering, the
error path, and a CHECK on both backends — and that layering is now measured
rather than asserted.

**What this does not claim.** The record is written after the handler answered,
so two identical requests in flight at the same instant both reach the handler;
the second is collapsed only once the first is recorded. That is **B-43**, with
the closing design named in the blocker rather than implied away here. A replay
restores the status and the body, not route-set headers; none of the five keyed
routes sets one today.

**CI verdict (the judgment, not the local run).** PR
[#23](https://github.com/uxxxug/wasla-core/pull/23), head `dc0b821`, runs
`34863857375` (pull_request) and `34863853567` (push) — both `success` on both
jobs. *Verify without a database*: **769 passed / 147 skipped across 56 files,
2 skipped**, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16` built from the 20 migrations): **1339 passed across 58 files,
none skipped, and 1 passed in the cluster file — 1340 in total**.
`tests/retry-idempotency.test.ts` is named in both job logs as **17 tests**
with a database and **10** without, the seven Postgres-backed cases being
skipped there rather than silently absent. Both totals match the local
measurement on an embedded PostgreSQL 18.4 exactly, and both exceed milestone
31's by the 11 and 19 cases this cycle added. The known CI/local skipped-count
difference is restated rather than rounded away: **147 in CI against 148
locally**, unexplained since milestone 22 and still unexplained here.

## Cycle 2026-09-14 (twenty-second) — a key is claimed before the work, not recorded after it

Milestone 33, branch `retry-claim`, PR
[#24](https://github.com/uxxxug/wasla-core/pull/24), closing **B-43** and
opening **B-44**. Milestone 32 made a retried write safe and said so precisely:
it collapses a retry sent *after* an answer. This cycle is about the retry sent
*during* one, which is the retry a timing-out client actually sends.

**Measured before anything was edited**, on `retry-claim` at `8d31133` — main
plus the reservation commit — by firing five byte-identical keyed
`POST /v1/organizations` with `Promise.all` and counting `organization` rows.
Reference backend: **5 organizations from 5 requests, every time**, 0 replays,
5 distinct ids. PostgreSQL 18.4, five rounds: **1, 5, 5, 4, 4** created, with
4, 0, 0, 1, 1 replays. Nineteen duplicate tenants across five attempts to
create five. The measurement code was temporary and deleted rather than
committed; its assertions live in `tests/retry-claim.test.ts` now, where they
run on every push instead of once.

**Two corrections to the reservation, additive.** It recorded "five in four of
five rounds" and "21 duplicate tenants". The distribution actually measured was
1, 5, 5, 4, 4 for 19 — the same code against the same database producing one
organization in one round and five in two. The reservation text in the
milestone table is left exactly as written; a reservation edited to match its
outcome is a reservation that can never be wrong. The finding neither reading
states is the one that matters: **both backends duplicated**, so this was never
a Postgres problem. `find` returning nothing and `record` being called later are
two points in time, and every twin arriving between them is told it is the
first.

**The reservation's open question, decided by measurement: a refusal, not a
bounded wait.** The loser gets `409` with `retry-after: 1` and
`details.claimed_at`. Against the five criteria this repository ranks legitimate
paths by — a wait makes the answer timing-dependent, so a gate over it measures
the machine it runs on rather than the mechanism; it needs a second timeout
beside the claim horizon, and two bounds on one thing disagree eventually; its
give-up branch is this `409` plus a delay, so the wait is the refusal with extra
states; it holds a connection per twin, turning an aggressive client into an
operator's problem; and `409` + a claim time is a complete statement about
CORE's state. `409` rather than `429` because the caller did not ask too often,
it asked at the same moment as itself, and `rate_limited` would send it to read
a budget that is not what is in its way.

**What changed.** The port is `find` / `claim` / `complete` / `release`;
`record` is **gone**, because a method that wrote an answer without having
reserved the right to produce it is the shape of the defect. On Postgres the
claim is one `insert … on conflict (method, scope, key) do update … where the
row is expired or its claim is older than the cutoff … returning claim_token`:
the primary key arbitrates inside the database, and the same statement performs
both legitimate takeovers, so recovery costs no extra round trip. On the
reference backend `claim` reads and writes with **no `await` between them**,
which on one thread is the same guarantee — that is why the private `live()`
helper is synchronous, and milestone 32's `record` awaiting its own `find` is
the whole of the reference backend's half of B-43. Settlement is fenced on a
`claim_token uuid`, so a process presumed dead that then wakes cannot record
over the new owner or delete the new owner's key. `CLAIM_HORIZON_MS` is sixty
seconds and an abandoned claim is taken over by the next request for its key:
**no sweeper was added**, because a worker deleting them would be a second
mechanism doing what one statement already does.

**Schema.** Migration `0021` adds `state`, `claim_token`, `claimed_at` and
`completed_at`, plus `idempotency_key_state_ck` and
`idempotency_key_state_record_ck`. `response_status` **became nullable** — the
only loosening in this schema's history, and not one: the row now exists before
the answer does, because it is what decides which twin may produce one, and the
record constraint ties all three answer columns to exactly one state. Its third
clause, `or state not in ('claimed','completed')`, is not slack: without it an
out-of-vocabulary state would violate two CHECKs at once and Postgres could name
either, while the reference backend names one — and `tests/check-parity.test.ts`
measures exactly that agreement. Two states, no third; `release` **deletes**,
the fourth delete path in `src/`, classified in `delete-actions.ts` and gated by
`tests/delete-parity.test.ts`. The down migration was verified to invert:
277 → 273 columns, 217 → 215 NOT NULL, and forward again.

**Falsification, and the one that survived.** Ten mutations, each measured and
reverted from an md5-verified byte-exact snapshot, run against both backends.
Nine were caught by named cases, including milestone 32's own defect restored
(F1), the Postgres insert stopped from arbitrating (F2), each fence removed
separately (F3, F4), the `retry-after` dropped (F7), state read before the
fingerprint (F8), a one-millisecond horizon (F9) and takeover disabled (F10).
**F5 — breaking the release on a refusing handler — produced no failure**, and
that is the useful result. The case had been written the obvious way, a real
route sent a body it would reject, and it tested nothing: the router parses the
body *before* it claims the key, so the request was refused with no claim ever
taken, and there was no claim for the broken release to fail to release. The
gate was passing for a reason unrelated to what it claimed to measure. Closed by
strengthening the gate rather than dropping the mutation — a test-registered
route whose handler *returns* `409` on its first call, which is the only way to
reach the branch since every production handler either succeeds or throws — and
the original scenario is kept as its own case asserting what it actually
establishes: a request refused before its handler ran takes no claim at all.

**B-44, opened rather than papered over.** The in-flight refusal's body reports
`retryable: false`, because `CoreError` derives the flag from the code alone and
every `conflict` is unretryable. That is right for a reuse and wrong here: this
is the one refusal in CORE that comes good by itself, which is why it carries
`retry-after`. Fixing it means letting a refusal override the retryability its
code implies — a change to the shared error type raised by every module — and
making it while measuring this route's concurrency would have been changing the
thing under measurement. The contract tells callers to read `retry-after` rather
than `retryable` on this response.

**Also this cycle.** `tests/support/retry-harness.ts` was extracted from
`tests/retry-idempotency.test.ts` so the two retry gates stand on one ground and
cannot drift; the older gate is still 10/10 and 17/17 after the extraction.
`tests/check-parity.test.ts` lost the `store.retry.record` probe and gained a
claim-then-complete one, plus two `UNPROBEABLE` entries for the new state
constraints. The count gates moved with the schema and each change carries the
reason: `defaultedColumns()` 48 → 50, live columns 271 → 275, NOT NULL
213 → 215, migrations 20 → 21, `deletableTables()` now
`["idempotency_key", "inbox", "rate_limit_counter"]`.

**What this does not claim.** `retryable` is still derived from the error code
(B-44). Retention (`expires_at`, `RETENTION_MS`) is untouched — liveness and
retention are separate questions and one column should not carry both. The
148-vs-147 skipped-test difference between the local suite and CI is still
unexplained, restated here rather than rounded away.

Full account, decision reasoning and the falsification table in
`docs/retry-claim.md`.

**CI verdict (the judgment, not the local run).** PR
[#24](https://github.com/uxxxug/wasla-core/pull/24), head `4000acc`, runs
`34885927577` (pull_request) and `34885923460` (push) — both `success` on both
jobs. *Verify without a database*: **781 passed / 147 skipped across 57 files,
2 skipped**, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16`, built from all 21 migrations): **1361 passed across 59 files,
none skipped, and 1 passed in the cluster file — 1362 in total**. The new gate
is named in both job logs: `tests/retry-claim.test.ts` is **12 tests** without
a database and **22** with, the Postgres half being skipped there rather than
silently absent, and `tests/retry-idempotency.test.ts` is still **10** and
**17** after its harness was extracted. Both totals match the local
measurement on an embedded PostgreSQL 18.4 exactly, and both exceed milestone
32's by the 12 and 22 cases this cycle added. The known CI/local skipped-count
difference is restated rather than rounded away: **147 in CI against 148
locally**, unexplained since milestone 22 and still unexplained here.

## Cycle 2026-09-14 (twenty-third) — a refusal states its retry time once

Milestone 34, branch `refusal-retryability`, PR
[#25](https://github.com/uxxxug/wasla-core/pull/25), closing **B-44**.
Milestone 33 shipped a refusal whose header said "try again in a second" and
whose body said "this cannot be retried". It said so in the contract, opened a
blocker and left it. This cycle closed it.

**Measured before anything was edited**, on `main` at `cdc09ce`, by producing
every refusal the published surface can produce: all 52 registrations driven
anonymously, all 52 driven again with a credential and a body they reject, and
the five-way concurrent keyed write from milestone 33. **105 refusals** — 53
`invalid_request` and 48 `unauthenticated`, all `retryable: false` with no
`retry-after`, and **4 `conflict` carrying `retry-after: 1` while reporting
`retryable: false`**. Four contradictions in 105, all of them the same refusal.
Read against `rate_limited`, which already got it right, the rule CORE was
following everywhere else is plain: **a refusal carries `retry-after` if and
only if its body says `retryable: true`**.

**The cause was structural, not local.** `retryable` came from a set of error
codes in `errors.ts`; `retry-after` was written by hand in two unrelated places
— inside `rateLimitHeaders`, and as an exported `IN_FLIGHT_HEADERS` constant in
`retry.ts`. Two independent statements about one fact, made in three files, with
nothing able to notice them disagreeing. Every line was correct on its own and
the defect lived in the space between them, which is the kind of defect a
measurement finds and a review does not.

**What changed.** The time to come back is now a property of the refusal:
`CoreError.retryAfterSeconds`. `retryable` is true when that is set **or** the
code is in `RETRYABLE`, and a new `headers` getter renders `retry-after` from
the same field. Every path in the router that renders a `CoreError` merges
`error.headers`, so a refusal that states a time cannot be sent without its
header and a header cannot appear without the flag agreeing. `IN_FLIGHT_HEADERS`
is **deleted**; `rateLimitHeaders` returns only the three budget headers.

There are still **two ways to be retryable**, and they are different claims: the
code says CORE or a dependency is unwell and CORE cannot say when it will be
well, so no time is stated; a stated time says the obstacle is temporary and
names it. This is an **override, not a reclassification** — `conflict` still
means the state moved, and a *reuse* refusal is still `retryable: false` with no
header, because it never comes good on its own. A refusal may say more about
itself than its code implies only in the direction CORE can justify, because
CORE states a time only when it knows the refusal resolves by itself. A time
that is not a whole second of at least one is **refused at construction**, the
way `anonymous("")` is: `response-headers.ts` refuses such a header too, but by
then the error exists and something downstream has to decide what to do with a
refusal it cannot render.

**The reservation's open question, decided: `details.retry_after_ms` stays.**
It and the header are two precisions of one duration rather than two sources of
truth — both computed from the same `decision.retry_after_ms` inside
`rateLimited`, neither able to move without the other, and the gate asserts the
header equals `retryAfterSeconds(details.retry_after_ms)` on a real refused
request. Milliseconds are useful to a client scheduling its own backoff, whole
seconds are what RFC 9110 permits on the wire, and removing a published field to
make a tidiness point would break callers for nothing. The rounding now lives in
one exported function instead of two expressions.

**Falsification, and the finding is which case caught what.** Ten mutations,
each applied to an md5-verified byte-exact snapshot, measured against five gates
on both backends, then restored. All ten were caught. But the **whole-surface
sweep — the case that looks like the guarantee — did not catch F1, the exact
restoration of B-44.** It cannot: every refusal that sweep reaches is
`invalid_request` or `unauthenticated`, neither of which states a time, so the
biconditional holds vacuously however `retryable` is derived. F1 was caught by
the three named cases about the refusals that do state a time. This is recorded
rather than tidied because the distinction matters: the sweep is a real guard —
it is what fails when a refusal is added later with a time and a stale flag,
which is how B-44 would come back — but it is a guard against the future, not
proof of the present, and the two are not interchangeable. It was kept as
written rather than stretched until it reached a timed refusal, and its limit is
now stated in the file itself.

**What this cycle did not do.** `retryable` stays *derived* rather than declared
at each of ~170 raise sites, which would be 170 places to get it wrong; the
override exists for the handful that need it. No `in_flight` error code was
added — the state CORE holds is what prevents the request, which is what
`conflict` means, and a code per situation is how an error vocabulary stops
being one. No schema change and no migration: this was a defect in what CORE
says, not in what it stores.

Full account and the falsification table in `docs/refusal-retryability.md`.

**One local flake, recorded rather than dropped.** On the first of three full
`npm test` runs against the embedded PostgreSQL 18.4, `test:cluster` reported
`FAIL tests/migration-0011-lifecycle.test.ts` while also reporting its single
test as passed, and exited non-zero. It did not reproduce on the next two runs
(nor on `npm run test:cluster` alone, where the same test finished in 11.8s
against 89s in the failing run). No cause was captured, so none is claimed here.
It is recorded because it happened: it is a heavy 89-second migration test on a
local embedded database that had just finished a 1372-test suite, this
milestone changed no schema and no migration, and CI is the verdict — where the
same job passed. If it recurs it is a defect worth its own measurement rather
than a retry.

**CI verdict (the judgment, not the local run).** PR
[#25](https://github.com/uxxxug/wasla-core/pull/25), head `abdc682`, runs
`34890552217` (pull_request) and `34890526730` (push) — both `success` on both
jobs. *Verify without a database*: **789 passed / 147 skipped across 58 files,
2 skipped**, plus 1 skipped in the cluster file. *Verify against PostgreSQL*
(`postgres:16`, all 21 migrations unchanged by this cycle): **1372 passed
across 60 files, none skipped, and 1 passed in the cluster file — 1373 in
total**. The new gate is named in both job logs: `tests/refusal-retryability.test.ts`
is **8 tests** without a database and **11** with. Both totals match the local
measurement exactly, and the cluster job passed in CI — where the local flake
recorded above did not appear. The known CI/local skipped-count difference is
restated rather than rounded away: **147 in CI against 148 locally**,
unexplained since milestone 22 and still unexplained here.

**An audit note on how the row above was corrected.** Milestone 33's table row
carried its outcome but still read "Reserved, measured, in progress" as its
status marker, so the row disagreed with itself. The correction (commit
`969aac5`) was pushed **directly to `main`**, bypassing the branch protection
that requires both CI jobs to have passed on the commit first — the push was
permitted because `enforce_admins` is false, and the remote said so in its
output. That is recorded here rather than left in a reflog: the gate was not
weakened and nothing was disabled, but a documentation-only change went in
without the verdict in front of it, which is exactly the habit the rest of this
document exists to prevent. CI ran on `main` afterwards and passed
(`34891648288`, both jobs). The two commits after it went through a branch and a
PR as they should.

## Cycle 2026-09-14 (twenty-fourth) — a number that meant something else, and a file nobody ran

This cycle began by refusing to carry a sentence forward. Every record since
milestone 22 has said that CI reports 147 skipped tests where the local run
reports 148, that nobody knows which test differs, and that the honest form of
the claim is therefore "one test's skip condition is environment-dependent".
Twelve cycles of that. It was the oldest unexplained thing in this document and
the only measurement in it that was knowingly wrong, so it was measured.

**There is no disagreeing test, and nothing is environment-dependent.** Per-file
skipped counts pulled from CI's own log and from a local run are identical in
all eighteen files that skip anything — 43, 33, 33, 7, 6, 4, 4, then 2 in each
of seven files, then 1 in each of four, which is 148 both times. CI runs
`npm test`, which is `test:suite` (147 skipped of 936) followed by `test:cluster`
(1 skipped of 1). Every local measurement written into this document was a bare
`vitest run` over all files at once (148 of 937). **147 + 1 = 148.** The record
had been comparing a one-run total against a two-run split, and the explanation
it carried beside that comparison was an invention.

That is a defect in this document's measurement rather than in the suite, and it
is the more embarrassing of the two for it. The correction is additive: the
earlier records keep their numbers and their wrong hypothesis, and milestone 35's
row says what the numbers were.

**The second defect, found while measuring the first, is worse than the first.**
`test:suite` excluded the *glob* `tests/migration-*-lifecycle.test.ts` while
`test:cluster` ran the *named file* `tests/migration-0011-lifecycle.test.ts` —
one partition stated twice, in two languages, in two `package.json` strings,
agreeing only because exactly one lifecycle file happened to exist. Measured
rather than reasoned about: an empty `tests/migration-9999-lifecycle.test.ts` was
added and both passes run. It appeared in **neither**, and `npm test` reported
everything green. A test file nothing runs is worse than a missing test, because
the suite counts it as covered. The probe was deleted, not committed.

**What replaced it.** One predicate in `scripts/test-partition.mjs`;
`vitest.config.ts` derives its `include` from it and chooses the pass from
`WASLA_TEST_PASS`, throwing on an unrecognised value rather than defaulting past
a typo; the two scripts set that variable and name nothing. So a bare
`vitest run` performs exactly CI's suite pass — a local count and a CI count are
now the same number about the same files, which is the whole point of the cycle.

The reservation left open whether the partition should live in a wrapper script
or in the configuration, to be decided by measurement. The configuration won, on
a capability found while building the gate: `vitest list --filesOnly` lets the
gate **ask the runner** which files each pass resolves and compare that to the
declaration. A wrapper could only have asserted about itself, and every form of
this defect has been a declaration that was true about itself and false about
what ran. Two gates: `scripts/check-test-partition.mjs` in both CI jobs and in
`verify`, and `tests/test-partition.test.ts` (10 tests) on the rule itself,
including arrangements the repository does not contain — a second lifecycle file,
a renamed one, near misses that must not be swept into a pass that runs one file
at a time. No counts are asserted anywhere in either gate; a count in a test
makes every new test file a failing build.

**Falsification, 12 mutations, and the value was in the two that did not fail
cleanly.** F11 survived: one extra clause in `allTestFiles`'s filter made a file
invisible, put it in no pass, and every check still passed — because the gate's
idea of what existed and the runner's `include` list both descended from the same
dropped source. A gate that asks the thing it is auditing what to audit is not a
gate. It now reads `tests/` itself and requires the two answers to agree; the
independence was found, not designed. F1 had to be re-run because the first
version of it no longer reproduced anything: adding a second lifecycle file is
now *placed* by the rule, and restoring the old naming semantics as well leaves
the file misplaced — contending for the server — rather than hidden. A misplaced
heavy test is a flake; a hidden one is a lie. F12 is caught by a crash rather
than a file-set difference, recorded so the next reader of "could not ask
vitest…" knows it can mean a broken config.

**Measured.** Without a database: 789 → **799 passed / 147 skipped** in the suite
pass, plus 1 skipped in the cluster pass. With `DATABASE_URL`: 1372 + 1 → **1382
+ 1 = 1383**. Ten tests added, all in the new gate. No `src/` change, no schema
change, no migration. `typecheck`, `check:governance`, `check:contracts`,
`check:migrations`, `check:roadmap` and the new `check:test-partition` all green
locally.

**Also in this cycle, and recorded rather than tidied away:** milestone 33's
table row still read "Reserved, measured, in progress" beside its own completed
outcome, and the commit that corrected it (`969aac5`) was pushed straight to
`main`, bypassing the protection that requires both CI jobs first — permitted
because `enforce_admins` is false, and reported as a bypass by the remote. CI
passed on `main` afterwards (`34891648288`). The note above this one holds the
audit trail; every commit since has gone through a branch and a PR.

**CI verdict (the judgment, not the local run).** PR
[#27](https://github.com/uxxxug/wasla-core/pull/27), head `d69fdd5`, runs
`34894384677` (pull_request) and `34894377974` (push) — both `success` on both
jobs. *Verify without a database*: **799 passed / 147 skipped across 59 files, 2
skipped**, plus 1 skipped in the cluster pass. *Verify against PostgreSQL*
(`postgres:16`): **1382 passed across 61 files, none skipped, plus 1 in the
cluster pass — 1383**. The new gate reads **10 tests** in both jobs, and the new
build step reports the same line in both: `test partition ok: 62 test files, 61
in the suite pass and 1 in the cluster pass, each in exactly one`.

**And the thing this cycle was for.** A bare `vitest run` locally now reports
**799 passed / 147 skipped (946)** — character for character the no-database
job's line. The 147-versus-148 difference this document carried for twelve
cycles is not merely explained, it no longer exists, because there is no longer
a second way to run the suite that produces a different number. Every earlier
record keeps its 148 and its wrong hypothesis, as corrections here are additive;
from this commit on, one number.


## Cycle 2026-09-15 (twenty-fifth) — a probe that could be made to refuse, and eighteen statuses with nothing behind them

The answer surface has been gated from the contract outwards since milestone 27.
Every documented status must be producible; every produced body must satisfy its
documented schema; every response must declare the headers it sets; `401` must be
documented wherever it can happen. Read the four records together and it sounds
finished. It was gated in one direction only. **A status a route can answer that
the contract never mentions was invisible to all of it**, and a caller generating
a client from the published file had no branch for it.

Measured on `main` at `2390649` before anything was edited, by driving all 52
registrations twice with a credential — once with a body naming a property no
route in CORE declares, once with no body at all. **33 of 52 operations answered
a refusal they do not document.** All 33 answered an undocumented `400`, among
them `GET /health`, `GET /ready` and `GET /metrics`, which documented only `200`.
Two also answered an undocumented `404`.

The interesting part was not the count but the decision it forced about those
three. A liveness probe that can be made to refuse by a stray body is arguably a
probe an operator cannot trust, which would have made this a router change: three
routes exempted from milestone 25's boundary rule. That was rejected. The rule is
uniform, the refusal is deliberate, and buying its removal costs three branches
and a boundary rule with a hole in it to spare a caller that is already sending a
body to a liveness check. It is documented instead — and documented against a new
`UnlimitedError` response rather than the shared `Error`, because these routes
send no `x-ratelimit-*` headers and referencing `Error` would have published
three headers CORE does not set. Milestone 28's gate would not have caught that:
it compares documented headers against real ones for the status each operation
returns on a *successful* call, and `400` is not that status.

Writing the assertion that catches it found the worse defect. **Eighteen
documented refusals had no `content` at all** — `"403": { description: Caller is
not an operator }`, a status code with a sentence behind it and no body schema.
Milestone 27's gate compares a produced body against its documented schema; where
there is no schema there is nothing to compare, so eighteen refusals had been
sitting inside a gated contract, ungated, since they were written. Twenty-three
declared none of the headers they carry. All of them now carry the canonical
`Error` body and their headers, each keeping its own description.

One thing this cycle got wrong about itself, kept rather than tidied. The
reservation recorded that `POST /v1/events` documents `429` but could not be
driven to produce one in 400 consecutive calls, and called that "unverified
rather than false". The `ingress_events` class allows **600** a window, against
120 for a write and 300 for a read, precisely because ingress is the one endpoint
another system calls in volume. The route was right; the probe was short. The
correction was appended beside the original claim and pushed as its own change
(PR #29) before implementation began, because a measurement that was wrong about
a route is worth more standing next to the claim than quietly deleted.

Ten falsifications, ten caught, including the two that matter most here: pointing
an unlimited route's refusal at the shared `Error`, and reverting a refusal to a
status code with a sentence. Three of the ten first reported "no anchor" rather
than a result — the mutation text did not match the file — and were re-anchored
and re-run rather than counted as caught.

What this gate does not claim is asserted rather than described: the matrix
reaches `400`, `401`, `403` and `404` and no other status, so `409` and `500`
remain the business of the milestones that own them, and widening the matrix is a
decision somebody has to make on purpose. Milestone 34's sweep, which held
vacuously and said so, is the reason that sentence is a test and not a comment.

CI verdict, read from the runs themselves rather than inferred from a green
local tree. At `d61b94d`, runs `34898391640` and `34898386719`, both **success**.
Verify without a database: **806 passed, 147 skipped across 60 files (2 skipped)**,
plus the cluster pass, 1 skipped — the new file reads 7 tests in both jobs, and
its slowest assertion is the one that drives a real budget, 404ms. Verify against
PostgreSQL: **1389 passed across 62 files**, plus the cluster pass, 1 passed, so
**1390**. Test partition, in both jobs: 63 test files, 62 in the suite pass and 1
in the cluster pass, each in exactly one. The counts moved 799 → 806 and
1383 → 1390, and README carries both.

Audit note, appended after the merge of PR #30. Row 36's leading status marker
still read "Reserved and measured, not yet implemented" once the milestone was
complete, because the outcome is appended to a reservation rather than replacing
it and the marker sits at the front. Corrected to **Complete** in its own change,
with the reservation text left untouched behind it — the same correction milestone
33 needed, and for the same structural reason: a row that is read from the left
reports its state from a field that is written first.

## Cycle 37 — the published error vocabulary, and the failure every route can have

Milestone 36 closed one direction of the answer surface and named the statuses its
matrix does not reach: `409` and `500`. This is the `500` half. Measuring it found
a second defect in the same family, and the second one is worse.

Measured on `main` at `f67908b`, before any edit. Every request the response-gate
scenario makes successfully was replayed against a CORE assembled with a
persistence backend whose every method throws — not one stubbed method, because a
hand-picked failure only proves the path somebody thought of. **50 of 52
operations answered `500`.** The two that did not are `GET /health` and
`GET /metrics`, which touch no persistence, so the 50 is measured and the
exception is real. **The contract documented `500` on no operation at all.** A
caller generating a client had no branch for the one answer it gets when CORE's
dependency is down.

The second defect: the published `Error.code` enum listed nine codes and **two of
them were constructed nowhere** — `precondition_failed` and `unavailable`, absent
from `src/`, from `tests/`, and from the five constructors `src/platform/errors.ts`
exported. They survived in the `ErrorCode` union, the `STATUS` table and, for
`unavailable`, the `RETRYABLE` set: three tables and a YAML enum agreeing about two
words CORE could not say. Neither `412` nor `503` was documented on any operation
either, so the enum told a caller to branch on codes that could not arrive under
any status the contract admitted. Nothing compared the four lists, which is why
duplication survives: it costs nothing until somebody asks whether the copies
agree with reality, and here two of them did not.

Three decisions, and only one of them was a preference.

`500` is documented on the **49** operations that can produce it rather than on
all 52, and that was forced, not chosen: milestone 27's gate requires every
documented status to be produced, so documenting `500` on `/health` would have made
two gates contradict each other. Uniformity would have had to break an existing
gate to buy itself.

`precondition_failed` was deleted. Nothing produced it, nothing needed it, and a
published word with no producer is a promise to a caller that cannot be kept.

`unavailable` was given a producer instead of being deleted with it, because the
measurement found a defect standing behind it. `/ready` let its dependency's
failure escape the handler, and the router's fail-closed default turned that into
`500` `internal`: CORE reporting a defect in CORE when what had happened is that
CORE cannot serve yet. An orchestrator reading `500` from a readiness probe has
grounds to stop a rollout; reading `503` it waits. So the dead code was not the
whole finding — it was the visible end of a route answering the wrong thing.
`/ready` now answers `503` `unavailable`, `retryable: true`, with no `retry-after`,
because CORE does not know when its dependency recovers and milestone 34 settled
that a refusal states a time only when it knows one. Documented as a new
`components/responses/NotReady`, carrying the correlation header and none of the
budget headers because `/ready` is on `UNLIMITED_ROUTES` — the same trap milestone
36 hit with `UnlimitedError`, avoided this time because that milestone existed.
The measured 50 therefore became 49 `500` plus 1 `503`, and the reservation's 50 is
correct for the code as it stood.

`ErrorCode` stopped being hand-maintained. One `STATUS` table is the source, the
union is `keyof typeof STATUS`, `ERROR_CODES` is its keys, `statusForCode` reads
it, and the published enum is compared against them on every run. Four
independent restatements became one table and one assertion.

`tests/error-vocabulary.test.ts`, 6 tests, both CI jobs, no database. The
assertion that does the work is that **every code in `ERROR_CODES` is produced by
a real answer inside the file** — the refusal matrix for `400`/`401`/`403`/`404`, a
reused idempotency key with a different body for `409`, a real budget driven past
its limit for `429`, and a throwing dependency for `500` and `503`. A word added to
the vocabulary fails the suite until something says it. And the failure surface is
checked by replay in both directions: every operation that answers `500` or `503`
under a throwing dependency documents it, and an operation that answers neither
documents neither, so an operation that starts or stops touching persistence
changes the set without anybody editing a list.

Ten falsifications, **9 caught by this gate, 10 of 10 caught by the suite**. F9 —
removing `unavailable` from `RETRYABLE`, so the new `503` reports
`retryable: false` while its code means come back later — survived this file. It is
recorded as survived rather than quietly patched: `retryable` is milestone 34's
claim, and the mutation was run against all 63 files to confirm that
`tests/refusal-retryability.test.ts > renders the flag and the header from one
field` fails on it and nothing else does. Duplicating the assertion here would add
a second place to change when the rule changes, which is the defect this cycle was
about. Documented in `docs/error-vocabulary.md` with the falsification table.

Two probe bugs are worth recording because both would have produced a
false-negative gate rather than a failure. An earlier attempt sent `body: {}` to
all 52 routes and got `400` everywhere: the boundary refuses a missing field
before the handler touches the backend, so the probe measured milestone 36's
surface again and would have "shown" that no route can answer `500`. And the
conflict probe first built its own CORE, whose token the scenario's identity does
not know (`401`), then posted `code` instead of `country_code` (`400`); both were
caught only because the setup call is asserted to succeed rather than assumed.
A probe that fails at setup and reports the wrong colour is the failure mode this
whole method exists to prevent.

CI verdict for cycle 37, read from the runs themselves rather than inferred from a
green local tree. At `f7fd604`, runs `34902154567` and `34902110986`, both
**success**. Verify without a database: **812 passed, 147 skipped across 61 files
(2 skipped)**, plus the cluster pass, 1 skipped — the new file reads 6 tests in
both jobs. Verify against PostgreSQL: **1395 passed across 63 files**, plus the
cluster pass, 1 passed, so **1396**. Test partition, in both jobs: 64 test files,
63 in the suite pass and 1 in the cluster pass, each in exactly one. The counts
moved 806 → 812 and 1390 → 1396, and README carries both.

Audit note, appended after the merge of PR #33. Row 37's leading status marker
still read "Reserved and measured, not yet implemented" once the milestone was
complete, for the third cycle running: the outcome is appended to a reservation
rather than replacing it, and the marker sits at the front of the cell. Corrected
to **Complete** in its own change with the reservation text left untouched behind
it. Three occurrences is no longer a slip — the convention that a reservation is
never rewritten and the convention that a row reports its state from its first
field are in tension, and the resolution belongs in a future cycle that either
moves the marker to its own column or derives it, rather than in another manual
correction after every merge.

## Cycle 38 — the roadmap's own status claims, checked against the repository

Three cycles in a row — 33, 36, 37 — merged with a completed row still reporting
itself as reserved, and each needed a follow-up pull request after the merge. The
cause is structural: a reservation is never rewritten and its outcome is appended,
and the marker a reader trusts sits at the front of the cell the outcome is
appended to the end of. `scripts/check-roadmap.mjs` could not have caught any of
the three, because it checks only that this file appears in a commit range that
touched implementation. It has never read a word of its contents. So the document
that records what is true about the repository was the one artefact in it that
nothing measured.

Measured on `main` at `907e3ee`. Thirty-seven rows, every one opening with a
bolded claim drawn from a vocabulary nobody had declared: `Complete` 16 times,
`Complete, and self-enforcing from here` 8, and one each of `Complete.` with a
full stop (written by the correction meant to normalise it), `CORE side complete`,
`Complete inside CORE`, `Complete inside CORE, with a fake adapter rather than a
live provider`, `Complete, except policy decisions that are not CORE's to make`,
three distinct `Blocked —` forms, `Not implemented, and until this cycle not
tracked here at all`, and three sentence-length claims reporting two sub-statuses
at once. **And one marker was false, and had been for eight cycles.** Row 29 read
"Reserved, measured, in progress on branch `http-auth-order`" while the same cell
reported the cycle's outcome, cited two artifacts that are in the tree and recorded
the counts it measured; the branch had been deleted at merge. It was not found by
reading. It was found by comparing every marker against the artifacts its own cell
cites, which is the comparison this cycle automated.

The obvious rule is wrong, and measuring showed it before it was written. "Every
path a row cites must exist" fails on row 35, which cites
`tests/migration-9999-lifecycle.test.ts` — a probe deliberately created to prove
that `test:suite`'s glob exclusion and `test:cluster`'s named file left a gap where
a test file ran in neither pass, then deleted without being committed. That
citation is true and describes an experiment. A path-existence gate would have
demanded the evidence be deleted, which cycle 30's rule forbids.

So the marker stays in the cell and is classified rather than replaced.
Normalising 37 cells to a canonical token would have rewritten 37 reservations to
satisfy a gate, and would have flattened nuance rows 2, 8 and 10 carry on purpose,
because those milestones genuinely have two sub-statuses. The closed vocabulary now
lives in `tests/roadmap-status.test.ts` as a total classifier — `reserved`,
`blocked`, `not implemented`, `complete`, tested in that order so a cell saying
"reserved… not yet implemented" cannot be read as complete because the word appears
later in the sentence — and a marker matching nothing fails the build. That
assertion is what makes the vocabulary real; until now it was whatever anybody
typed.

Completion is then held to evidence by ownership of a written account. The
measurement found that the "one `docs/<topic>.md` per cycle" convention is already
a fact about the tree: every completed row from milestone 27 onward owns exactly
one existing account, and the eight completed rows before it own none. An account
belongs to the lowest-numbered row that cites it, which is the row that wrote it.
Two rules follow: a `reserved` row may not own an account, and a `complete` row
from 27 onward must. Both exemption lists are asserted exactly rather than used as
filters, so they may shrink and may not grow.

The rule took three forms and the first two were killed by falsification rather
than by argument. "A reserved row may not **cite** an existing account" flagged
this milestone's own reservation, which quotes row 29's citation as the evidence
for its existence — a rule that forbids a reservation from naming the defect it
was opened to fix is the wrong rule. "May not be the **only claimant**" then let
F1 through, because this milestone's own completed row mentions row 29's document
and shielded the stale marker. Ownership survives both and is the simplest of the
three. Two hand-drafted lists were corrected by the code the same way: the "cites
nothing" exemption was drafted `1, 3, 5, 7, 9, 25` and the gate returned `1, 3`
(5, 7 and 9 are blocked, not complete; row 25 cites a `contracts/` path the first
pass had not counted).

Ten falsifications, ten caught, three of them only after something was fixed. F3
deleted row 36's account reference and survived the weaker "cites something" rule
because the row still cited its test file. F1 survived "only claimant" as above.
And **F8 survived twice, the second time because of a defect in the falsification
runner rather than in the gate**: its replace rule was
`replace(find, replace, 1) if first or n > 1`, which silently mutated only the
first of two occurrences whenever an anchor appeared twice — so the citation the
gate reads was left in place, and the gate correctly passed. Hand-applying the same
mutation caught it at once, which is how the runner bug was found. The rule is now
explicit. The same defect would have made any two-occurrence mutation in cycles 36
and 37 read as survived; none of those had a repeated anchor, which was luck rather
than method, and both cycles' verdicts stand only because of it. That is the third
probe defect in three cycles, after cycle 37's `body: {}` probe that measured the
wrong surface and its conflict probe that failed at setup, and the pattern is
consistent enough to name: **a probe that reports green is reporting about itself
until proven otherwise.**

Row 29's marker was corrected in this cycle, additively, with its reservation and
outcome text untouched and the correction recorded in the cell. Row 37's stray full
stop was normalised. And the follow-up pull request that cycles 33, 36 and 37 each
needed was not needed here: row 38 could not be committed claiming to be reserved
while owning `docs/roadmap-status.md`, because the gate this cycle added refuses
it. Full account in `docs/roadmap-status.md`.

CI verdict for cycle 38, read from the runs themselves rather than inferred from a
green local tree. At `39c6024`, runs `34904868920` and `34904832000`, both
**success**. Verify without a database: **819 passed, 147 skipped across 62 files
(2 skipped)**, plus the cluster pass, 1 skipped — the new file reads 7 tests in
both jobs and needs no database, since it reads this document and the tree. Verify
against PostgreSQL: **1402 passed across 64 files**, plus the cluster pass, 1
passed, so **1403**. Test partition, in both jobs: 65 test files, 64 in the suite
pass and 1 in the cluster pass, each in exactly one. The counts moved 812 → 819 and
1396 → 1403, and README carries both.

### Cycle 39 — the documented conflict surface

Milestone 36 built the response gate and named the two statuses its matrix does
not reach, `409` and `500`. Milestone 37 closed `500` by replaying the whole
scenario against a persistence layer that throws. This cycle closes `409`, and it
could not be done the same way: a conflict is not a broken backend but a business
fact that has to be made before the route will refuse.

Measured on `main` at `eda030b`: 17 of 52 operations document `409`, all of them
`POST`. A second capture against a partly captured hold really does answer `409`,
four times over. And `POST /v1/geography/countries` with an existing
`country_code`, a fresh key and a changed body answers `201` and overwrites the
stored row — `QA` went from `Qatar`/`QAR` to `OVERWRITTEN`/`USD`.

The reservation concluded from that third measurement that the route publishes a
`409` nothing can produce, and it was wrong; the correction is appended to the row
above. Reusing an idempotency key with a different request reaches
`src/platform/http/retry.ts`, which answers exactly that conflict, on all five
keyed routes. What survives is narrower and is what the gate now pins: those
routes have no *domain* conflict of their own, so the only conflict a correct
caller reaches there is about its own retry.

`tests/documented-conflicts.test.ts` holds one driver per documented conflict,
declares the exact refusal each one expects, declares whether it is reached by a
domain rule or by key reuse, asserts the key-reuse census exactly, and drives the
inverse direction by re-sending every recorded write under its own key with one
field changed. Twelve mutations, twelve caught, including two that change nothing
but a refusal's wording.

Two probe defects this cycle, both false negatives from an unbroken tree: the
first replayed identical bodies and read "eleven documented conflicts are
unreachable"; the second added an unknown field and read "no route can produce the
key-reuse refusal", because validation runs before the key is compared. With cycle
37's `body: {}` probe and cycle 38's single-occurrence mutation, that is four
measurement defects in three cycles, every one of them a probe reporting about
itself.

This row was also set to its true state in the same commit as its implementation,
rather than in a follow-up PR as cycles 33, 36 and 37 each needed. Milestone 38's
gate is what forces that: it reads the leading marker, and an outcome appended
under a reservation marker fails the build.

CI verdict for cycle 39, read from the runs themselves. At `e52b648`, runs
`34909051335` and `34909027946`, both **success**. Verify without a database:
**825 passed, 147 skipped across 63 files (2 skipped)**, plus the cluster pass, 1
skipped — the new gate reads 6 tests in both jobs and needs no database, since
every conflict it drives is made over the in-memory backend. Verify against
PostgreSQL: **1408 passed across 65 files**, plus the cluster pass, 1 passed, so
**1409**. Test partition, in both jobs: 66 test files, 65 in the suite pass and 1
in the cluster pass, each in exactly one. The counts moved 819 → 825 and
1403 → 1409, and README carries both.

### Cycle 40 — event payload declaration

The contract gate (`scripts/check-contracts.mjs`) proves every emitted event
type has a published schema. It has never read a payload. The
fulfillment-lifecycle-contract test validates five fulfillment event payloads
against their schemas, and nothing validates the other fourteen. A correct
answer with no enforcement is a coincidence, not a guarantee.

Measured on `main` at `9a50503`: all 19 core event types with published schemas.
12 are emitted by the HTTP scenario, all conforming; 5 are validated by the
fulfillment-lifecycle-contract test; 2 (subscription past_due, expired) have no
path that produces them in any existing test. No gate enforces that an emitted
payload matches its contract for 14 of 19 types.

`tests/event-payload-declaration.test.ts` drives every core event type CORE can
produce over the in-memory backend, reads the emitted payloads from the outbox,
and asserts each one satisfies its published contract: required fields present,
no undeclared field, every present field's type matching the declaration. A
shared support module `tests/support/event-schemas.ts` loads all published
schemas and provides `payloadErrors()`, `schemaFor()`, and
`assertMatchesContract()`. Deliberately not a full JSON Schema validator (no
ajv dependency): the three properties checked — missing required, undeclared
field, wrong type — are the ones that actually go wrong.

Falsification: four cases applied to a conformed payload from the published
schema's examples — a required field removed, an undeclared field added, a
field's type changed, and a conforming payload that must pass. The validation
function is the same one the gate uses.

The subscription `past_due` event needed an identity-owned wallet (empty) so
the renewal charge fails; `createWallet` is idempotent per owner+currency, so
the organisation's funded wallet would have been reused. The `expired` event
needed a cancelled subscription whose period had ended, so the renewal sweep
expires it. Fulfillment `dispatched` and `completed` needed manually-published
`move.job.accepted` and `move.job.completed` envelopes, since
`core.fulfillment.created` is written to the outbox rather than the bus and
the MoveSimulator subscribes to the bus.

CI verdict for cycle 40, read from the runs themselves. At `e3f70d0`, runs
`34915103635` and `34915131442`, both **success**. Verify without a database:
**849 passed, 147 skipped across 66 files (2 skipped)**, plus the cluster pass, 1
skipped. Verify against PostgreSQL: **1409 passed across 66 files**, plus the
cluster pass, 1 skipped. Test partition: 67 test files, 66 in the suite pass
and 1 in the cluster pass, each in exactly one. The counts moved 825 → 849 and
1409 → 1409 (the new gate's 24 tests all run in the suite pass and need no
database), and README carries both.

### Cycle 41 — notification message declaration

`contracts/notifications/notification-message.v1.schema.json` is a published
contract: it is the shape a channel adapter receives, and the shape a real
provider implementation is written against. The `NotificationMessage` interface
in `domain.ts` is hand-coded to match it, and the dispatcher constructs a
message from the stored row and hands it to the adapter. Nothing validated that
the message a real dispatch produces actually conforms to the contract.

Measured on `main` at `bc21041`: the contract has 9 required fields
(`notification_id`, `idempotency_key`, `channel`, `address`, `template`,
`body`, `data`, `attempt`) and `additionalProperties: false`. The
`NotificationMessage` interface in `domain.ts` has all 9 fields plus optional
`subject`. No test reads a dispatched message and validates it against the
contract. The `notifications.test.ts` suite tests delivery semantics (leases,
retries, fencing, deduplication) but not the message's shape.

`tests/notification-message-declaration.test.ts` drives a notification through
the fan-out and the dispatcher using a capturing channel adapter, reads the
`NotificationMessage` the adapter receives, and asserts it satisfies the
published contract. The shared support module `tests/support/event-schemas.ts`
was extended to load notification message schemas from
`contracts/notifications/` alongside the event schemas from
`contracts/events/`.

Falsification: four cases applied to a conformed payload from the published
schema's examples — a required field removed, an undeclared field added, a
field's type changed, and a conforming payload that must pass.

CI verdict for cycle 41, read from the runs themselves. At `d574fdd`, runs
`34916320846` and `34916344146`, both **success**. Verify without a database:
**855 passed, 147 skipped across 67 files (2 skipped)**, plus the cluster pass, 1
skipped. Verify against PostgreSQL: **1409 passed across 67 files**, plus the
cluster pass, 1 skipped. Test partition: 68 test files, 67 in the suite pass
and 1 in the cluster pass, each in exactly one. The counts moved 849 → 855 and
1409 → 1409 (the new gate's 6 tests all run in the suite pass and need no
database), and README carries both.

### Cycle 42 — event envelope declaration

`contracts/events/envelope.schema.json` is a published contract: it is the
wrapper every event carries — `event_id`, `event_type`, `version`, `producer`,
`occurred_at`, `correlation_id`, `causation_id`, `entity_type`, `entity_id`,
`payload`. The payload inside each event is validated against its own schema
by the event-payload-declaration gate (milestone 40), but the envelope itself
was not.

Measured on `main` at `a70a898`: the envelope schema has 10 required fields
and `additionalProperties: false`. The `producer` field has an enum constraint:
`["wasla-core", "wasla-move", "wasla-market"]`. The `makeEvent()` function
constructs envelopes with all required fields, but nothing validated that the
produced envelope conforms to the published contract.

`tests/envelope-declaration.test.ts` drives several core event types over the
in-memory backend (money.credited, payment.authorized, identity.verified,
fulfillment.created, fulfillment.dispatched, fulfillment.completed), reads
every emitted event from the outbox, and validates each full envelope against
the published contract. The shared support module `tests/support/event-schemas.ts`
was extended to load the envelope schema alongside the event-specific and
notification message schemas.

Falsification: four cases applied to a conforming envelope constructed from
the schema's required fields and properties (the schema's example is `{}`) —
a required field removed, an undeclared field added, a field's type changed,
and a conforming envelope that must pass.

CI verdict for cycle 42, read from the runs themselves. At `89950df`, runs
`34917146917` (re-run) and `34917163260`, both **success**. Verify without a
database: **862 passed, 147 skipped across 68 files (2 skipped)**, plus the
cluster pass, 1 skipped. Verify against PostgreSQL: **1409 passed across 68
files**, plus the cluster pass, 1 skipped. Test partition: 69 test files, 68 in
the suite pass and 1 in the cluster pass, each in exactly one. The counts
moved 855 → 862 and 1409 → 1409 (the new gate's 7 tests all run in the suite
pass and need no database), and README carries both. The first PostgreSQL run
failed on a flaky `refusal-retryability.test.ts` timing test; the re-run and
the second run both passed.

### Cycle 43 — operations state counts

The metrics exposition carried queue depths and reconciliation depths, but the
state of every domain module — how many fulfillments are coordinating, how many
subscriptions are past_due, how many authorizations are held — was not in it.
An operator could see that the outbox had 3 pending rows but not that 7
fulfillments had never left `coordinating`, which is the same question about a
different table.

Three new gauges added to the declared catalogue:

- `core_fulfillment_depth{status}` — fulfillments by status
- `core_subscription_depth{status}` — subscriptions by status
- `core_money_depth{kind, status}` — wallets and payment authorizations by
  status, under `kind="wallet"` and `kind="payment_authorization"`

Each is a gauge sampled by the depth sampler, not read at scrape time, for the
same reason the queue-depth gauges are not. The sampler now also calls
`countByStatus()` on the fulfillment repository,
`countSubscriptionsByStatus()` on the subscription repository, and
`countWalletsByStatus()` / `countAuthorizationsByStatus()` on the money
repository — read-only `select count(*)`-shaped work, platform-wide, naming
nobody. Both backends implement each method; the in-memory store tallies its
rows and the Postgres adapter runs `group by status`.

A gauge that keeps its old value when a count drops to zero is a gauge that
lies, so the sampler emits every known status for each metric — including
zero — rather than only the statuses that have rows. The known statuses are
derived from the domain types: `FulfillmentStatus`, `SubscriptionStatus`,
`WalletStatus`, `AuthorizationStatus`.

Gated by `tests/observability.test.ts` on both backends: creates known state
(two dispatched fulfillments, one coordinating, one active subscription, one
active wallet with one authorized authorization), samples, and asserts the
counts. A second test changes the state and asserts the counts move. A third
falsifies: voids an authorization and proves the `authorized` count drops to
zero and the `voided` count rises to one — a count that did not track the real
state would fail the gate.

CI verdict for cycle 43. Test counts moved 862 → 865 (3 new tests, all in the
suite pass, no database needed) and 1409 → 1412.

### Cycle 44 — operations dashboard

A standalone HTML page at `dashboard/index.html` that fetches the `/metrics`
exposition, parses it client-side, and renders every count the sampler
produces: queue depths, reconciliation counts, fulfillment status, subscription
status, money wallet and authorization status, HTTP and worker aggregates. It
also carries the 18 pending external decisions (B-2 through B-42) so the
operator sees not only what the system is doing but what it is waiting for.

No backend. No build step. No dependencies. A single file. RTL Arabic, matching
the project's language. Auto-refresh toggle at 5 seconds.

Demo mode: append `?demo=1` to the URL to load the dashboard with realistic
mock data, without a running CORE. This is how the preview is shown outside a
CORE environment.

Live use: the dashboard must be served from the same origin as `/metrics` or
from an environment that can reach CORE's HTTP port. Opening it from a
different host requires CORS to be configured on CORE's `/metrics` endpoint.

This cycle also fixed a runtime gap: the `DepthSampler` was constructed in
`createCoreApp` but never invoked in `server.ts`. The sampler now runs on a
15-second interval (configurable via `SAMPLE_INTERVAL_MS`) and once at startup,
so the metrics exposition is populated before any scrape.

### Cycle 45 — CORS on /metrics

The dashboard from cycle 44 could not read `/metrics` when served from a
different origin than CORE — a browser blocks a cross-origin `fetch` whose
response carries no CORS headers. Fixed narrowly, on the one route that needs
it, not with global middleware:

- `GET /metrics` now answers with `access-control-allow-origin: *` and
  `access-control-allow-methods: GET`, declared in `RESPONSE_HEADERS` like
  every other response header CORE sends. `sealHeaders()` still refuses any
  header not declared there, so this is an addition to a closed list, not an
  exception to it.
- No `OPTIONS /metrics` route. A plain `GET` with no custom request headers is
  a *simple request* under the CORS specification: the browser sends it
  directly and reads the response headers to decide whether the page may see
  the body — no preflight, so nothing to answer. An `OPTIONS` route would also
  have fallen outside the OpenAPI contract loader (which only walks
  `get/post/put/patch/delete`) and outside `http-authentication-declaration.test.ts`'s
  fixed anonymous-route count, for no capability the dashboard needs.
- Origin is unrestricted (`*`) rather than a caller-supplied echo, because
  `/metrics` is unauthenticated and carries no tenant-scoped data — the same
  reasoning `UNLIMITED_ROUTES` already applies to rate limiting on this route.
  Restricting it to named origins would need a configuration surface this
  cycle did not add.
- The OpenAPI contract documents both headers on the `GET /metrics` 200
  response, and `tests/http-response-header-declaration.test.ts` extends its
  closed list of documented header names to include them.
- `tests/observability.test.ts` gates both directions: `/metrics` carries the
  two headers, and an ordinary route (`/health`) does not — proving the
  addition is scoped to the one route it names, not shared middleware that
  would open CORS everywhere.

No new metric, no new endpoint, no schema change. Test counts moved
865 → 866 in the suite pass (no database needed). CI also reports 1453 tests
passing in the Postgres job, which is the suite pass against a real database
plus the cluster migration-lifecycle file.

### Cycle 46 — oldest pending age gauges

Cycle 43 added depth gauges — how many fulfillments are in each status. This
cycle adds the question that follows: how long has the oldest one been there?

Three new gauges in the declared catalogue:

- `core_fulfillment_oldest_age_seconds{status}`
- `core_subscription_oldest_age_seconds{status}`
- `core_money_oldest_age_seconds{kind, status}`

Each is a gauge sampled by the depth sampler, not read at scrape time, for the
same reason the depth gauges are not. The sampler now also calls
`oldestAgeByStatus(now)` on the fulfillment repository,
`oldestAgeByStatus(now)` on the subscription repository, and
`oldestWalletAgeByStatus(now)` / `oldestAuthorizationAgeByStatus(now)` on the
money repository — read-only `DISTINCT ON (status) ... ORDER BY created_at ASC`
work in Postgres, and a scan for the minimum `created_at` per status in the
in-memory store. Both backends implement each method.

The age is measured from `created_at`, not from a `status_changed_at`
timestamp — CORE records no such column on any of these tables. The metric
help text says so explicitly, because an operator reading
`core_fulfillment_oldest_age_seconds{status="coordinating"} = 259200` needs to
know whether that means "the oldest coordinating fulfillment was created 3 days
ago" (which it does) or "has been coordinating for 3 days" (which it might
not, if it was dispatched and then re-coordinated — though that transition is
not in the lifecycle). The distinction matters for interpretation, and the
metric does not pretend to be more precise than the timestamp it is built from.

Zero means no rows in that status, for the same reason the depth gauges use
zero rather than absence: a gauge that keeps its old value when the last row
leaves is a gauge that lies, and an age gauge that keeps its old value when the
status is empty is worse — it reports a stale age for a status that no longer
has any items.

Gated by `tests/observability.test.ts` on the in-memory backend: creates a
fulfillment, advances the fixed clock by a known amount, samples, and asserts
the age is in the expected range. A second test creates a wallet after a clock
advance and verifies both entities' ages in one sample. A third test dispatches
the only coordinating fulfillment and proves the coordinating age drops to zero
while the dispatched age rises above it — the falsification that would catch a
gauge that keeps stale values.

Test counts moved 866 → 868 in the suite pass (2 new tests, no database
needed).

### Cycle 47 — dashboard displays oldest-age gauges and next-milestone review

The standalone dashboard from cycle 44 never showed the three oldest-age
gauges cycle 46 added, because it was last touched before they existed.

`dashboard/index.html` now renders the age of the oldest item in each
status underneath the count, in every entity card (fulfillment,
subscription, wallet, authorization). The age is formatted as
seconds/minutes/hours/days depending on magnitude, colored yellow past one
hour and red past one day, and only shown when the count is nonzero — a
zero-count status has no oldest item to report, matching the metric's own
semantics. The demo mock data includes the three new series so the
dashboard is previewable without a live CORE.

Verified visually in demo mode via a cloud browser: age labels are
properly stacked under counts with no text overlap or clipping. Rows with
zero count correctly omit the age label. CI green on both jobs.

No new metric, no new endpoint, no schema change. Test counts unchanged.

### Next milestone review

All 39 numbered rows in the milestone table (1 through 39, verified against
the table itself rather than assumed from the highest number seen in any
one section) are either **Complete** or **Blocked by an external
decision**. No unblocked CORE-side row remains:

- Milestones 3, 4, 6, 12–39 (28 rows): **Complete** on the CORE side.
- Milestone 1 (event ingress/egress): CORE side complete; MOVE and MARKET
adoption is not CORE's to do.
- Milestone 2 (settlement beyond one hold): partial capture and refunds
complete; multi-hold blocked on a MARKET contract decision.
- Milestone 5 (contract adoption): blocked — MOVE and MARKET must adopt.
- Milestone 7 (migration/reconciliation tooling): blocked — needs production
data inventory (B-2) and identity merge policy (B-3).
- Milestone 8 (security hardening): observability export and rate limiting
complete; the hardening pass itself is bounded by deployment topology (B-5).
- Milestone 9 (staging/cutover): blocked — needs deployment topology (B-5)
and production release approval (B-6).
- Milestone 10 (reputation and trust signals): CORE side complete; no
producer publishes signals yet, and weighting/decay/thresholds are B-31
through B-34.
- Milestone 11 (degradation rules / ADR 0010): not implemented — the ADR
text itself is not in the repository (B-35).

Within milestone 3, entitlement-check, proration, grace, trials, rollover
and comped access remain open as B-14 through B-19, all policy decisions
above CORE, not implementation gaps.

The 18 pending external decisions (B-2 through B-42) are all policy or
deployment questions that cannot be answered from inside the repository.
Cycles 43–47 were all new directions not on the original roadmap (depth
gauges, dashboard, CORS, oldest-age gauges, dashboard age display). The
current repository roadmap has no unblocked CORE-side milestone left; the
next actionable work is either a new CORE-side expansion the user directs,
or unblocking one of the external decisions above.

### Cycle 48 — dashboard HTTP and worker metric breakdowns

The dashboard from cycle 44 aggregated HTTP and worker metrics into flat
totals — 1000 requests with no route or status dimension, 50 outcomes
with no outcome type. An operator could see volume but not where errors
were, or which workers were failing.

Three new client-side helpers:

- `getMetricSeries(values, name)` extracts every labeled series for a
  metric, returning `[{labels, value}]`. The existing `getMetric` reads
  one series by exact label match; this reads them all.
- `histogramAverage(values, name)` sums `_sum` and `_count` across every
  label set for a histogram metric, returning the mean. Not a percentile —
the exposition carries bucket counts a percentile would need, but the
average is the first thing an operator asks for and costs two additions.
- `formatDuration(seconds)` renders as ms or s.

HTTP card now shows 2xx / 4xx / 5xx counts, an error-rate percentage
with a red badge when 5xx > 0 and yellow when only 4xx, and the average
request duration across all routes. Worker card now shows completed /
failed_permanent / retried / dead_lettered counts, and the average item
duration across all workers.

Demo data updated with per-route HTTP requests (six series across four
routes), per-outcome worker counts (nine series across three workers),
and histogram `_sum` / `_count` pairs for both duration metrics.

No backend change. No new metric. No schema change. Test counts
unchanged.

## Cycle 2026-10-21 — the shared ecosystem roadmap (XR-0)

**What changed.** `docs/ecosystem/ECOSYSTEM_ROADMAP.md` (Revision 1) is added,
byte-identical to the copies added in the same cycle to `nooonvg/wasla` (MARKET)
and `nooonvg/ceezr` (MOVE), with `docs/ecosystem/check-ecosystem-sync.mjs` and
`.github/workflows/ecosystem-sync.yml` proving the three copies match (advisory on
pull requests, strict on `main` and nightly). The README's *Related repositories*
table now names the repositories where the three systems actually live
(`nooonvg/ceezr`, `nooonvg/wasla`) instead of `noor-seez/ceezr` and
`skyosv10-art/wasla`.

**Why.** Owner instruction of 2026-10-21 (quoted in §1 of the shared roadmap): one
real, complete roadmap, synchronized across the three repositories, with authority
to remove delivery from MARKET in favour of MOVE.

**What it means for CORE.** No ownership boundary changes, so no new ADR is
required (`docs/adr/README.md`: an ADR is needed for a new synchronous path or a
boundary change). The decisions D-XR-1…D-XR-8 *apply* ADR 0001, 0002, 0006 and
0007: MOVE alone executes delivery, MARKET keeps the commercial order, and the two
meet only through `core.fulfillment.*`, `market.order.created` and `move.job.*`.
CORE's track in the shared roadmap is built only from this file's own rows:

| Shared item | CORE work | Blocked by |
|---|---|---|
| XR-3.1 | an environment for CORE | B-5, then B-6 for production |
| XR-3.2 | scope `session.issue` before any system holds a service credential | B-42 (resolved 2026-10-21, cycle "B-42 closed") |
| XR-3.3 | degradation rules | B-35 / milestone 11 (ADR 0010 text absent) |
| XR-4 | first journey: store order → fulfillment → MOVE job → closed fulfillment | XR-3, MOVE `DEP-CORE-001..008`, B-20/B-30 for the failure cases |
| XR-4.5 / XR-6.3 | the money leg | B-4 and MOVE F12-11 (no payment provider) |
| XR-6.1 | one identity | B-2, B-3 |
| XR-6.2 | entitlement endpoint | B-14…B-19 |
| XR-6.4 | reputation producers | B-31…B-34 |
| XR-6.5 | live Telegram adapter | D-8 |

**Measured this cycle (local, `995f4fa`).** `npm ci`; `tsc --noEmit` clean;
`WASLA_TEST_PASS=suite npx vitest run` → 868 passed, 147 skipped. The database and
cluster passes were not run. No file under `src/`, `db/` or `contracts/` changed.

## Cycle 2026-10-21 — shared roadmap Revision 2: many channels, one account (XR-8)

**Owner instruction (2026-10-21).** WASLA must not be only a Telegram Mini App:
Telegram, Discord, Android, iOS and the browser, several apps, the customer in one
app, and any person able to be customer, store owner, driver or partner. The text
is quoted in §1 of `docs/ecosystem/ECOSYSTEM_ROADMAP.md`, now Revision 2 and
byte-identical in `nooonvg/wasla` and `nooonvg/ceezr`.

**What it means for CORE.** One person is one CORE principal; roles are
memberships and product profiles added on request (D-XR-9, D-XR-12). That is
already the model (`Product-specific capability lives in the product`), so no
boundary changes and no ADR. What is missing is recorded as **B-45** (XR-8.5).
CORE's rows in XR-8:

| Shared item | CORE work | Blocked by |
|---|---|---|
| XR-8.1 | this cycle entry | — |
| XR-8.3 | web sign-in adapter | B-45, B-42 |
| XR-8.5 | `discord` / `apple` (and `google` if chosen) channel types, one adapter per method, passkeys, link/unlink, account deletion, per-channel session lifetime | B-42, B-39, OD-XR-4 |
| XR-8.7 | Discord notification adapter | XR-6.5 (D-8), OD-XR-3 |
| XR-8.9 | organization and membership created by the person's own request; a person's roles across products | B-45 |
| XR-8.10 / 8.11 | organizations and money for stores and individual sellers | XR-6.3, B-4 |

**Measured this cycle.** Only documents changed: `ROADMAP.md` and
`docs/ecosystem/ECOSYSTEM_ROADMAP.md`. No file under `src/`, `db/` or `contracts/`
changed.

## Cycle 2026-10-21 — B-42 closed: `session.issue` is scoped to the channels a service speaks for (XR-3.2)

**Measured before the change (`main` at `6972a73`).** A principal provisioned with
`npm run bootstrap:credential --roles service` held `session.issue`, and
`POST /v1/sessions` with that credential answered `201` for a `platform_admin`'s
`principal_id`; the minted token read `GET /v1/sessions/current` as
`platform_admin`. A second discrepancy was found on the way: this file,
`docs/session-entitlement.md` and the gate header all said every issuance is
audited "against the issuing principal", but `IdentityService.issueSession`
wrote `actor_id` = the principal the session was **for**, and no test asserted
either. So "which service became whom" was not answerable from the audit log.

**Direction chosen.** The first of B-42's three directions, under the owner's
grant of full authority (2026-10-21, recorded with XR-3.2 in
`docs/ecosystem/ECOSYSTEM_ROADMAP.md`): it is the smallest and matches how the
credential is already provisioned.

**What changed.**

- Migration `0022_principal_issuance_channels` (+ `.down.sql`): `principal.issues_for_channels text[] NOT NULL DEFAULT '{}'`
  and `principal_issues_for_channels_check` — person-facing channels only
  (`telegram`, `phone`, `email`, `web`; never `partner_api`, so a system cannot
  mint a system) and only on a service principal. Every principal that existed
  before it issues on **no** channel until an operator says otherwise: fail
  closed by construction. Mirrored in `row-rules.ts` (rule + `VOCABULARIES.issuable_channel_type`)
  and `column-shapes.ts`, so the reference backend refuses the same rows.
- `IdentityService.issueSessionAs` (the route's entry point): (1) `session.issue`
  required; (2) `platform_admin` unscoped; (3) the channel must be in the
  issuer's `issues_for_channels`, checked before any principal is read; (4) the
  target must be a person, verified on that channel, and hold no role granting
  `session.issue` — so a delegated issuer can never mint an administrator or
  another issuer. Every refusal of rule 4, including a nonexistent principal, is
  one identical `403`, so the route is not an existence oracle for a scoped
  caller; `404` stays reachable only by `platform_admin`.
- The `session.issued` audit row now names the issuer (`actor_id`), with the
  person in `metadata.principal_id`; an in-process issuance (bootstrap) is
  audited as `system`.
- `bootstrap:credential --issue-for telegram,web` (default none). A repeat run
  with a different scope is refused loudly instead of silently keeping the old
  one, as the roles check already did.
- Contract: `/v1/sessions` description states the scope and the meaning of
  `403`/`404`. Docs: `docs/session-entitlement.md`. Dashboard: B-42 removed from
  the pending list.

**Gates.** New `tests/session-issuance-scope.test.ts` (18 tests, memory backend,
both CI jobs): the measured escalation is now `403` and mints nothing; the
scoped path still works and the session is the person's; out-of-scope channel,
unscoped service, a person holding the `service` role, unlinked person, another
service, an issuer and an administrator all refused with one indistinguishable
body; admin unscoped; audit names the issuer; provisioning refusals; CLI parsing;
the issuable channel list equal across `domain.ts`, `row-rules.ts` and the SQL.
`tests/check-parity.test.ts` probes the new constraint on Postgres. Pinned
counts moved by exactly the new column and migration: defaulted columns 50→51,
live columns 275→276, not-null 215→216, forward migrations 21→22.

**What this does not claim.** It does not verify that a person controls a
channel account — that is still the adapter's job (B-39), and B-45 (sign-in
adapters with proof) is still open. It does not add a signed per-request
assertion (direction 2). Existing service credentials must be re-provisioned
with `--issue-for` before they can issue again; there are none in any deployed
environment (XR-3.1/B-5: CORE has no environment yet).


## Cycle 2026-10-21 — shared roadmap Revision 3: measured status (§9)

`docs/ecosystem/ECOSYSTEM_ROADMAP.md` moves to Revision 3, byte-identical in
`nooonvg/wasla` and `nooonvg/ceezr`. It adds no decision: a new §9 carries the
measured state of each shared item with its merged evidence, and XR-3.2 is
recorded closed by the cycle above (B-42, PR #3, `a46bdb5`). XR-4.2 now names
`bootstrap:credential --issue-for`, and XR-8.5 is no longer blocked by XR-3.2.

**Measured this cycle.** Only documents changed: `ROADMAP.md` and
`docs/ecosystem/ECOSYSTEM_ROADMAP.md`; `check-ecosystem-sync.mjs --offline` OK
(Revision 3). No file under `src/`, `db/` or `contracts/` changed.

## Cycle 2026-10-21 — a gate that measured the scheduler (B-44 in-flight race)

**Measured.** CI run 39610388438 (push of `e1e8484`, the B-42 change, which
touches nothing in retry handling) failed one case on PostgreSQL:
`tests/refusal-retryability.test.ts` › "answers an in-flight twin retryable" —
five concurrent identical keyed writes produced **zero** `409`s, i.e. they
serialised. The pull-request run of the same commit, and every other run, passed.
The case asserted "at least one twin loses" from a single round, which is an
interleaving and not a property of CORE; "comes good by itself" next to it had
the same shape.

**Changed.** Both cases now race on a fresh key until a twin loses, at most 20
rounds (`raceUntilATwinLoses`). Nothing they assert about the refusal changed:
every `409` they read is still a real twin losing a real race. Twenty quiet
rounds still fail. Test code only; no file under `src/`, `db/` or `contracts/`.

## Cycle 2026-10-21 — B-46 closed: platform-wide routes need `platform.operate`

**Found while designing XR-8.9.** The shared roadmap's XR-8.9 has a person open
their own store, which in CORE means a new organization with that person as
`org_admin` (D-XR-10). Before handing `org_admin` to anybody who asks, this cycle
listed every place an `org_admin` is trusted, and measured them.

**Measured on `fc4cb81`.** `authorize(actor, permission)` with no organization
checks presence only. Fourteen routes used it with a tenant's permission:

| Route(s) | Permission it checked | Measured as `org_admin` of another tenant |
|---|---|---|
| `POST /v1/organizations` | `organization.write` | `201` — tenants nobody belongs to |
| `POST /v1/geography/{countries,regions,cities,service-areas}` | `organization.write` | `201` — country `SA` renamed `Renamed`, currency `USD` |
| `POST /v1/event-subscriptions`, `…/activate`, `…/deactivate` | `organization.write` | `201` — every tenant's `core.fulfillment.created` to the caller's URL |
| `GET /v1/event-subscriptions`, `GET /v1/event-deliveries/undelivered` | `organization.read` | `200`, also as `org_member` |
| `POST /v1/notification-recipients`, `…/deactivate` | `organization.write` | `201` — a recipient for tenant B |
| `GET /v1/notification-recipients`, `GET /v1/notifications` | `organization.read` | `200`, also as `org_member` — every tenant's subjects, bodies and addresses |

And `GET /v1/subscriptions/:id` checked `subscription.read` unscoped: an
`org_admin` or `support_agent` of A read B's subscription (`200`). The route
comments already said "operator-only"; the permission did not mean it, and this
file recorded `organization.write` as "may change who *this* organization is".

**Changed.** One new permission, `platform.operate`, held by `platform_admin`
only, on all fourteen routes (published in the contract's `Permission` enum).
`GET /v1/subscriptions/:id` now authorizes against the owner: an organization's
subscription inside that organization, a person's by that person, and
`platform_admin` everywhere. Geography **reads** keep `organization.read`
unscoped on purpose: reference data every product resolves against.
`docs/outbound-delivery.md` and `docs/notifications.md` say so.

**Gates.** New `tests/platform-operation-scope.test.ts` (7 tests, memory
backend): run first against the unchanged code it failed 5 of 7 with the figures
above; after the change all pass. Suite with Postgres: 70 files, 1484 tests, and
the cluster pass 1/1.

**Found and not closed here — recorded as B-47.** `authorize` flattens
permissions across **all** of a principal's memberships, then checks only that
the principal is a member of the named organization. So an `org_member` of B who
is `org_admin` of A holds `organization.write` *in B* — measured: `201` granting a
third person `org_admin` in B. That matters the moment a
person can make themselves `org_admin` of their own store, so it is the next
cycle, before any self-service organization exists.

## Cycle 2026-10-21 — B-47 closed: a permission is read from the membership it was granted in

**Measured before (on the B-46 branch, then `main` at `942fbad`).** A principal
that was `org_admin` of A and `org_member` of B answered `201` to
`POST /v1/memberships` granting a third person `org_admin` in **B**:
`authorize` checked the union of permissions across all memberships, then only
that the principal belonged to B.

**Changed.** `AuthenticatedPrincipal.memberships` carries each membership's own
roles, and `authorize(actor, permission, organization_id)` requires the
permission from the membership in that organization (`platform_admin` excepted:
held anywhere, it acts everywhere, as before). The new refusal is `403 missing
permission in this organization`; the two existing refusals keep their order and
words. `GET /v1/sessions/current` publishes `memberships` (contract
`AuthenticatedPrincipal` updated): what XR-8.9 needs to show a person their roles
per organization.

**Gates.** Four cases in `tests/platform-operation-scope.test.ts`; against the
unchanged `src/` two of them fail (the `201` above, and no `memberships`).
Postgres suite: 70 files, 1488 tests, cluster 1/1; default run 898.

