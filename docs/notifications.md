# Notifications to people

`docs/outbound-delivery.md` describes how CORE delivers events to **systems**:
signed HTTP POSTs to registered subscribers. This document describes the other
half — how CORE tells **a person** that something happened — and what the
delivery guarantee actually is, as opposed to what it is convenient to say.

## What Milestone 4 turned out to mean

The roadmap line "Channels / Notifications" predates the code. Reading the code
instead of the line:

- Events reach systems (migration 0008, `event_subscription` / `event_delivery`).
- `identity_link` already had `channel_type` including `telegram` (ADR 0016), but
  purely as an **inbound** identity: a way to recognise who is talking to CORE.
  There was no outbound path to that channel, no message contract, and nothing
  that turned an event into something a human reads.

So Milestone 4 is the missing person-facing half, and it is built on the parts
that already exist rather than beside them: the same outbox, the same claim
discipline, the same clock.

## The path

```
domain state change ─┐
                     ├─ one transaction ─→ commit
outbox append ───────┘
        │
        ▼  relay claims the outbox row
   fan-out (inside the relay's markPublished transaction)
        │
        ├─→ event_delivery rows   (to systems, pre-existing)
        └─→ notification rows     (to people, this milestone)
                  │
                  ▼  dispatcher claims with a lease + fencing token
            channel adapter (telegram / email / phone)
                  │
                  ▼
        accepted │ delivered │ retryable │ permanent
```

Two properties fall out of that shape and are both tested:

- **No notification without committed state.** The notification row is derived
  from an outbox row, and the outbox row commits with the state change. A rolled
  back transaction leaves neither. There is no code path that messages somebody
  about a fulfillment that does not exist.
- **No lost notification after committed state.** The fan-out runs inside the
  relay transaction that marks the event published, so an event cannot be marked
  published without its notification rows existing.

The outbox is the commit point. Nothing external is called inside a domain
transaction, so no provider — reachable, slow, or down — can roll back CORE
state.

## The channel contract

`src/modules/notification/ports.ts`. A send returns one of four outcomes, never
`void` and never a boolean:

| Outcome     | Meaning                                                     | Dispatcher does           |
| ----------- | ----------------------------------------------------------- | ------------------------- |
| `accepted`  | A provider took responsibility. Not proof of receipt.       | Records, stops attempting |
| `delivered` | A provider confirmed it reached the recipient.              | Records terminal success  |
| `retryable` | This attempt failed; the same message may succeed later.    | Backs off and retries     |
| `permanent` | This message will never succeed as it is.                   | Fails, stops              |

Each carries an optional `provider_message_id`, kept when the provider offers
one, because without it a support question ("did they get it?") has no handle to
ask the provider with.

`accepted` and `delivered` are separate on purpose. Collapsing them would be a
claim CORE cannot support: every real transport (Telegram, SMTP, SMS) returns
acceptance synchronously and confirms receipt, if at all, out of band. Today no
adapter can produce `delivered` — that needs a provider callback, recorded as
**dependency D-8**. Keeping the state unreachable-but-modelled is cheaper than
renaming the meaning of `accepted` later.

A thrown error is treated as `retryable`, and a missing adapter for a channel is
`retryable` too, not `permanent`: an adapter absent from this deployment is a
configuration fact that may be fixed, and burning the message would turn an
operational gap into lost information.

## Delivery semantics, stated honestly

- **At most one attempt in flight.** Guaranteed by CORE: lease + fencing token.
- **At least once.** Guaranteed by CORE: a row is never abandoned; an
  unacknowledged claim returns when its lease expires.
- **Exactly once, end to end.** Not guaranteed, and not claimable. It would
  require the provider to deduplicate, or an atomic commit spanning CORE and the
  provider, which does not exist.
- **Effectively once, with a cooperating provider.** Every send carries a stable
  `idempotency_key` (`event_id:recipient_id`). A provider that honours it
  collapses a repeat into one message for the recipient. `tests/notifications.test.ts`
  proves this with an `IdempotentChannel` that deduplicates on the key, and also
  proves that a provider which does not honour it produces a visible repeat
  rather than a silent loss. That is the trade taken deliberately: a repeat is
  recoverable, a loss is not.

The key comes from the event and the recipient, not from a counter or a
timestamp, so it is identical across retries, across dispatcher restarts, and
across two workers racing — which is what makes it usable as a provider-side
deduplication key at all.

## Idempotency, in three places

1. **Fan-out.** `${event_id}:${recipient_id}` is unique in the database. A
   duplicated outbox delivery of the same event inserts nothing the second time,
   so re-publishing an event never doubles a message.
2. **Claim.** Claiming is a write: `status` becomes `processing`, `attempts` is
   incremented, `next_attempt_at` moves out by the lease, and a fresh
   `claim_token` is stamped — one statement. A second dispatcher polling at the
   same moment matches nothing.
3. **Acknowledgement.** Every mark is fenced on the `claim_token` it was claimed
   with and returns whether it applied. A worker that stalled past its lease and
   comes back to report cannot overwrite the attempt that replaced it; the
   dispatcher counts that as `fenced` and moves on.

`attempts` is spent at claim time, not at acknowledgement. A worker that dies
mid-attempt therefore costs one attempt, and a message that kills its worker
every time cannot loop forever.

## Retry and failure

- Max 6 attempts, exponential backoff from 1s (`1s, 2s, 4s, 8s, 16s`).
- A `retryable` outcome may carry `retry_after_ms`; the provider's own advice
  wins over the computed backoff.
- `permanent` fails immediately and is never retried.
- Exhausting the attempts fails the row terminally. `failed` is visible through
  `GET /v1/notifications?status=failed`, which is the point: a message nobody
  received should be findable, not garbage-collected.
- `retrying` is derived (`pending` with `attempts > 0`), not stored. One row
  cannot be pending and retrying at once, and a stored duplicate of a derivable
  fact drifts.

## What gets sent, and what does not

Nothing is invented per event. Five templates map to the events that a person has
a reason to hear about:

| Event                        | Template                 | Said to the recipient                       |
| ---------------------------- | ------------------------ | ------------------------------------------- |
| `core.fulfillment.dispatched`| `fulfillment_dispatched` | The request was assigned and is in progress |
| `core.fulfillment.completed` (outcome `completed`) | `fulfillment_completed` | It is done |
| `core.fulfillment.completed` (outcome `failed`)    | `fulfillment_failed`   | It could not be completed |
| `core.fulfillment.cancelled` | `fulfillment_cancelled`  | It was cancelled                            |
| `core.subscription.past_due` | `subscription_past_due`  | A subscription period is unpaid             |

Other emitted event types produce nothing. `core.payment.*` is settlement
mechanics, not news to a person; `core.identity.verified` is the recipient's own
action; `core.fulfillment.created` has no assignment to report yet.

Payloads are rendered against a published contract,
`contracts/notifications/notification-message.v1.schema.json`, not serialised
from a domain object. Serialising an internal object would make every field a de
facto external interface and leak the next field somebody adds.

### Money wording

CORE only says something about money when it knows what happened to it, using
`settlement_state` from the closure event:

- `decision_required` → "A payment amount is held pending review; no refund or
  charge has been decided yet."
- `released` → "No payment was taken."
- `captured` / `partially_captured` → "The authorised payment was charged."
- anything else → silence.

This is the standing constraint that `decision_required ≠ settled`. The pending
case is a real state (blocker **D-6**: what happens to funding-less open work is
undecided), and no message may read as a refund or a final settlement while the
decision has not been made. A test asserts the absence of "has been refunded",
"will be refunded", "settled", "reimburs", "credited back" from that message —
the honest sentence names the possibility and denies the promise.

## Who gets told

`notification_recipient` binds `(event_type, identity_id, channel)`, optionally
scoped to an organization. Registration is operator-only — `platform.operate`,
held by `platform_admin` alone, as are listing recipients and reading the
notification log. (Until B-46 these four routes checked `organization.write` /
`organization.read` with no organization, so an `org_admin` of any tenant could
register a recipient for another tenant, and an `org_member` of any tenant could
read every tenant's notifications; both measured.) Registration refuses more than
it accepts:

- Only channels a person can receive on: `telegram`, `email`, `phone`.
- Only a **verified** `identity_link` on that channel. An unverified address is
  somebody's claim about themselves, and messaging it is how an account takeover
  becomes a notification.
- Only a tenant scope the event can actually carry. See B-23 below.

Per-customer routing — telling the person who placed an order — is not CORE's:
CORE holds an `order_reference` from MARKET, not an end customer. Recorded as
**dependency D-7**.

## Backend parity

`InMemoryNotificationStore` and `PgNotificationStore` are tested by the same
`describe.each` suite. The memory store writes the lease and the token
synchronously so it can fail the same tests; a memory double that is more
permissive than Postgres certifies a bug (B-12).

One documented difference: the memory store's claim is synchronous, so two
in-process dispatchers serialise rather than race. On Postgres the disjointness
is enforced by `for update skip locked` plus the claiming write. Both are
asserted in `tests/worker-claim-atomicity.test.ts`; the Postgres case is the one
that proves the property, and it fails if the claiming write is removed.

## Blocker B-22: a claim has to be a write

Found while building this and fixed here, because the notification dispatcher
could not have been correct on top of it.

`PgOutbox.claimDue`, `PgInboundEventStore.claimDue` and `PgDeliveryStore.claimDue`
each ran a single `select … for update skip locked` statement and marked nothing.
Sent as one statement it runs in its own implicit transaction, so the row locks
were released the moment it returned. Measured on a real database before the fix:
two pools each claiming five due outbox rows received five rows each, all five
shared — 100% overlap. In production that is two signed POSTs to a partner's
webhook and two runs of the same inbound event. The in-memory equivalents only
filtered a `Map`, so they could not fail a test either.

`for update skip locked` was not wrong, it was incomplete. All six
implementations now claim by writing the lease in the same statement, with the
signature `claimDue(now, limit, leaseMs = 30_000)`. No schema change: the lease
rides on `next_attempt_at`, so an abandoned claim comes back on the same clock
that schedules retries. `attempts` is deliberately **not** incremented for the
three pre-existing workers, which would have changed their backoff behaviour
under the guise of a concurrency fix.

## Tenant scoping (B-23, resolved 2026-09-12)

`core.fulfillment.dispatched`, `.completed` and `.cancelled` now carry
`organization_id`, so `organizationScope()` reads a real tenant off them and
`recipientsFor(type, organizationId)` can narrow. A tenant-scoped recipient for a
fulfillment event is therefore a recipient that matches something, and
registration no longer refuses one.

The refusal itself is unchanged and still guards the case it was written for: any
`core.*` event type may be registered for, and one whose payload names no
organization — `core.payment.captured`, `core.identity.verified` — still gets
HTTP 400 rather than a stored recipient that matches nothing for ever. The
permitted list in `TENANT_SCOPED_EVENT_TYPES` stays explicit rather than derived,
because the thing being asserted is a property of each published payload and a
derivation would quietly start permitting a scope the moment an unrelated event
grew an `organization_id` field for its own reasons.

Two consequences worth knowing:

- Events **stored before this change** have no `organization_id`. On replay their
  scope reads as null, so they fan out to platform-wide recipients only. Absence
  is "not stated", not "no tenant".
- A platform-wide recipient (`organization_id: null`) and a tenant-scoped one for
  the same event type are two recipients, and both match. That is intended — an
  operator watching everything and a tenant watching itself are different people
  — but it means the same closure produces two notifications.

## Recorded, not solved

- **D-7** — per-customer routing is owned by MARKET.
- **D-8** — a provider delivery-confirmation callback; without it `delivered` is
  unreachable and `accepted` is the best truth CORE has.
- **D-6** — unchanged and untouched: the fate of funding-less open work. The
  notification vocabulary is built to survive either answer.
