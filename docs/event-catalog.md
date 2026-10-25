# WASLA CORE — Event Catalog

Every event uses the canonical envelope in `contracts/events/envelope.schema.json`.
Delivery is at-least-once. Consumers must be idempotent on `event_id` via their inbox.

## Published by CORE

| Event type | Version | Status | Entity | Consumers | Schema |
|---|---|---|---|---|---|
| `core.identity.verified` | 1 | implemented | identity | MOVE, MARKET | `contracts/events/core.identity.verified.v1.schema.json` |
| `core.identity.account.deleted` | 1 | implemented | identity | MOVE, MARKET | `contracts/events/core.identity.account.deleted.v1.schema.json` |
| `core.money.credited` | 1 | implemented | wallet | authorized consumers | `contracts/events/core.money.credited.v1.schema.json` |
| `core.payment.authorized` | 1 | implemented | payment authorization | MARKET | `contracts/events/core.payment.authorized.v1.schema.json` |
| `core.payment.captured` | 1 | implemented | payment authorization | MARKET | `contracts/events/core.payment.captured.v1.schema.json` |
| `core.payment.voided` | 1 | implemented | payment authorization | MARKET | `contracts/events/core.payment.voided.v1.schema.json` |
| `core.payment.refunded` | 1 | implemented | payment authorization | MARKET | `contracts/events/core.payment.refunded.v1.schema.json` |
| `core.fulfillment.created` | 1 | implemented | fulfillment | MOVE | `contracts/events/core.fulfillment.created.v1.schema.json` |
| `core.fulfillment.dispatched` | 1 | implemented | fulfillment | MARKET | `contracts/events/core.fulfillment.dispatched.v1.schema.json` |
| `core.fulfillment.completed` | 1 | implemented | fulfillment | MARKET | `contracts/events/core.fulfillment.completed.v1.schema.json` |
| `core.fulfillment.cancelled` | 1 | implemented | fulfillment | MARKET, MOVE | `contracts/events/core.fulfillment.cancelled.v1.schema.json` |
| `core.fulfillment.executed_after_cancellation` | 1 | implemented | fulfillment | MARKET, MOVE | `contracts/events/core.fulfillment.executed_after_cancellation.v1.schema.json` |
| `core.subscription.created` | 1 | implemented | subscription | MARKET, MOVE | `contracts/events/core.subscription.created.v1.schema.json` |
| `core.subscription.period_settled` | 1 | implemented | subscription | MARKET | `contracts/events/core.subscription.period_settled.v1.schema.json` |
| `core.subscription.past_due` | 1 | implemented | subscription | MARKET, MOVE | `contracts/events/core.subscription.past_due.v1.schema.json` |
| `core.subscription.renewed` | 1 | implemented | subscription | MARKET | `contracts/events/core.subscription.renewed.v1.schema.json` |
| `core.subscription.cancelled` | 1 | implemented | subscription | MARKET, MOVE | `contracts/events/core.subscription.cancelled.v1.schema.json` |
| `core.subscription.expired` | 1 | implemented | subscription | MARKET, MOVE | `contracts/events/core.subscription.expired.v1.schema.json` |
| `core.reputation.signal_recorded` | 1 | implemented | reputation signal | MARKET, MOVE | `contracts/events/core.reputation.signal_recorded.v1.schema.json` |
| `core.reputation.signal_retracted` | 1 | implemented | reputation signal | MARKET, MOVE | `contracts/events/core.reputation.signal_retracted.v1.schema.json` |

## Consumed by CORE

| Event type | Version | Producer | Status | Handler |
|---|---|---|---|---|
| `market.order.created` | 1 | MARKET | implemented in local bus | `core.fulfillment.market-order` |
| `move.job.accepted` | 1 | MOVE | implemented in local bus | `core.fulfillment.move-acceptance` |
| `move.job.rejected` | 1 | MOVE | implemented in local bus | `core.fulfillment.move-rejection` |
| `move.job.completed` | 1 | MOVE | implemented in local bus | `core.fulfillment.move-completion` |
| `market.review.rated` | 1 | MARKET | implemented in local bus, no producer yet | `core.reputation.market-review` |
| `market.review.retracted` | 1 | MARKET | implemented in local bus, no producer yet | `core.reputation.market-review-retraction` |

`implemented in local bus` means the schema, idempotent consumer and tests exist;
production transport remains unproven until a broker or durable queue is selected.

`no producer yet` is a stronger caveat and is stated separately for the two review
events: MARKET does not publish them today. The schema, the normaliser, the
exactly-once ingestion and the tests are CORE's side of a contract whose other
side has not been written, so no reputation signal exists in any deployed system
until MARKET starts publishing. Recorded as an external dependency in
`ROADMAP.md` rather than presented as a working pipeline.

### Reputation events carry facts, never standings

The two `core.reputation.*` events state what was reported and what was
withdrawn. Neither carries a count, an average or a score, and that is a
decision rather than an omission. A total placed in an event is computed at
publication time without any signal recorded concurrently with it, so two events
about one subject could each carry a different total and a consumer would have no
way to tell which is current — the same drift ADR 0013 refuses for entitlement
and the settlement cycle refuses for money. A consumer that needs a standing
either accumulates this stream, which it receives exactly-once, or reads
`GET /v1/reputation/{subject_type}/{subject_id}`, where the answer is derived
from the signals at the moment of the read. See `docs/reputation.md`.

## Lifecycle of a fulfillment as seen on the bus

```
market.order.created            (MARKET -> CORE)
  └─ core.fulfillment.created   (CORE -> MOVE)     status: coordinating
       ├─ move.job.accepted     (MOVE -> CORE)
       │    └─ core.fulfillment.dispatched (CORE -> MARKET)  status: dispatched
       │         └─ move.job.completed (MOVE -> CORE)
       │              └─ core.fulfillment.completed (CORE -> MARKET) status: completed | failed
       ├─ move.job.rejected     (MOVE -> CORE)
       │    └─ core.fulfillment.completed (outcome failed)   status: failed
       └─ cancellation (MARKET or operator, via CORE API)
            └─ core.fulfillment.cancelled (CORE -> MARKET, MOVE)     status: cancelled
                 └─ move.job.completed arriving afterwards, outcome completed
                      └─ core.fulfillment.executed_after_cancellation
                                        (CORE -> MARKET, MOVE)      status: cancelled (unchanged)
```

The last branch is the one exception to "every transition is published": it is not a
transition. The fulfillment stays `cancelled` and the money stays where the
cancellation left it. What is published is a fact that arrived after the lifecycle
had ended — MOVE performed the work anyway — and it is published because MARKET has
already told a customer their order was cancelled and handed the money back, and only
MARKET can talk to that customer about an order that turned up regardless. Before
B-29 that report was refused with a 409, retried until the inbound event was
dead-lettered, and stored nowhere. See `docs/settlement.md`.

Every transition of the fulfillment lifecycle is published. A consumer that
replays the CORE stream can reconstruct the exact state without querying CORE.

### Every fulfillment event names its tenant (B-23, resolved 2026-09-12)

All four — `created`, `dispatched`, `completed`, `cancelled` — carry a **required**
`organization_id`. CORE owns tenancy and is the only system that can state it, so
an event that omitted it forced every consumer to call CORE back before it could
route, authorize or filter. That is now unnecessary: a closure is routable on its
own contents.

Two things follow for consumers:

- A consumer validating these payloads with `additionalProperties: false`
  against a copy of the schema taken **before** this change will now reject them.
  Refresh the schema. This is an additive field, but strict validators do not
  treat additions as compatible.
- Events **persisted before** this change have no `organization_id`. Replay and
  history readers must treat its absence as unknown rather than as an error or as
  a tenantless event.

### The amount that moved, on both closure paths

`core.fulfillment.completed` and `.cancelled` both carry an optional
`captured_minor`. Two rules govern reading it:

- It is the authorization's **running total**, never the last capture leg. A hold
  part-captured out of band and then closed by CORE reports the sum of both.
- **Absent means CORE observed no amount**, not zero. An order that carried no
  payment hold closes without the field; reading a missing value as `0` would
  turn "nothing to say" into a positive claim that nothing moved.

Until 2026-09-12 the success path published no figure at all while the failure
paths did. It now reports one, so `settlement_state: "captured"` and a stated
amount arrive together.

## Lifecycle of a subscription as seen on the bus

```
POST /v1/subscriptions            (operator or tenant, via CORE API)
  └─ core.subscription.created                          status: active | past_due
       ├─ collection succeeded
       │    └─ core.subscription.period_settled          period:  settled
       │         └─ end of period (renewal sweep)
       │              └─ core.subscription.renewed       period:  pending
       │                   └─ core.subscription.period_settled | .past_due
       ├─ collection refused
       │    └─ core.subscription.past_due                period:  uncollectible
       │         └─ later collection of the SAME period
       │              └─ core.subscription.period_settled  status: active
       └─ cancellation (owner, via CORE API)
            └─ core.subscription.cancelled               status: cancelled
                 └─ paid coverage runs out (renewal sweep)
                      └─ core.subscription.expired       status: expired
```

`cancelled` and `expired` are separate facts and are published separately. A
cancelled subscription still entitles its owner until the period it already
paid for ends; only then does coverage stop. A consumer that treated the two as
one could not tell a customer who left from one whose payment failed.

Usage is deliberately not on the bus. It is high-volume bookkeeping with no
consumer outside CORE, and the stream carries business facts (ADR 0009).
Neither is a draft plan: its terms can still change, so nothing outside CORE
can act on them. A plan becomes visible to others only through the
subscriptions that reference it.

## Compatibility rules

- Additive optional fields only within a version.
- A removed or retyped field ships as `vN+1`; the previous version stays
  published for the documented overlap window.
- `event_type` and `version` together identify the contract. Consumers must
  ignore unknown fields.
