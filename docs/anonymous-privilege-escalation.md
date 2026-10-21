# The membership grant nobody had to prove they were allowed to make

Milestone 29. Branch `http-auth-order`. Reserved before any edit; the measurement
below was taken on `main` at `a5ab512`.

## How it was found

Milestone 28 closed with a note that it said nothing about *which documented
refusal statuses are actually reachable*. So this cycle started by driving all 52
operations with no credential and comparing what came back against what the
contract documents. Two things came out of that census.

The first was ordering, which is what the milestone was reserved for: `401` is
documented on 2 of 52 operations while 49 refuse an anonymous caller, and on 24
write routes an anonymous request answers `400` about the body rather than `401`,
because `parseBody` runs in the router and authentication runs inside the handler.

The second was found while listing which routes authenticate at all — a scan for
handlers that never call `requirePrincipal`, `bearer()` or
`identity.authenticate`. It returned five: `GET /metrics`, `POST /v1/identities`,
`POST /v1/sessions`, `POST /v1/sessions/revoke`, and **`POST /v1/memberships`** —
the route that decides who a tenant's administrators are.

## What was measured

Against the real router, with **no credential of any kind**, in this order:

| call | result |
| --- | --- |
| `POST /v1/identities` `{channel_type: "phone", external_id: "+966500000999"}` | `201` — a new identity and principal |
| `POST /v1/memberships` `{principal_id, organization_id: <an existing tenant>, roles: ["org_admin"]}` | **`201` — granted** |
| `POST /v1/sessions` `{principal_id, channel_type: "phone"}` | `201` — a bearer token |
| `GET /v1/sessions/current` with that token | `200` — `roles: ["org_admin"]`, 7 permissions, the victim organization in `organization_ids` |
| `GET /v1/organizations/<the victim>` with that token | `200` — their record |

Three ordinary calls. Nothing held at the start, `org_admin` over somebody else's
organization at the end. The only thing the caller needed to know was an
organization id, which is not a secret: it is in every fulfillment, subscription,
invoice and audit answer that organization produces.

The first two attempts at this measurement answered `400` (`channel`, not
`channel_type`; `owner`, not one of the five real roles). Those are recorded here
because they are the reason the census under-counted: **a `400` about the body
looks like a refusal and is not one.** The route was reached on the third attempt
with the declared shape, and it answered `201`.

## What this cycle changes

`POST /v1/memberships` now requires `organization.write` **on the organization
named in the body** — `requirePrincipal(ctx, identity, "organization.write",
ctx.input.requiredText("organization_id"))`, before the grant.

`organization.write` was chosen because it already exists and already means "may
change who this organization is": `platform_admin` holds it in every tenant,
`org_admin` inside its own. So an administrator adds a colleague, an org_admin
cannot reach into a neighbouring tenant, and nobody adds themselves. The first
membership of a brand-new organization is a `platform_admin` action, which is the
shape `POST /v1/organizations` already has. No new permission, no new role, no new
policy invented in a milestone that had no mandate to invent one.

The contract now documents `401` and `403` on the operation, with the history in
its `description`.

## What this cycle does not claim, and what it leaves open

**The escalation is not fully closed. Half of it is recorded as B-39, on purpose.**

`POST /v1/sessions` mints a bearer token for **any** `principal_id` with no proof
that the caller controls that principal. So an outsider who knows an
administrator's principal id — which appears in `GET /v1/sessions/current`, in
every membership answer and in audit reads — can still obtain that
administrator's session directly, without touching the membership route at all.
The last case in `tests/anonymous-privilege-escalation.test.ts` asserts exactly
that, and asserts that the minted token reads the victim organization and gets
`200`.

That case is a deliberate, uncomfortable assertion of current behaviour. Deleting
it, or marking the file skipped until the login flow is decided, would remove the
only automatic evidence that the hole is open. Closing B-39 means deciding what
proof of possession is — an OTP to the channel, a service credential held by the
channel adapter, or a signed assertion from the caller — and that is an owner
decision about how humans log in, not a coordination detail CORE may pick for MOVE
and MARKET on its own. The fail-closed direction is written into B-39 so the
decision starts from a default that refuses.

Also unclosed, and unchanged by this cycle:

- **Ordering.** An anonymous request to a write route still answers `400` about
  the body before `401`, including on `POST /v1/memberships` itself: the body is
  parsed by the router, the credential is read by the handler. So the escalation
  is refused, but a caller with no credential still learns the route's body shape.
  Recorded as milestone 30.
- **The existence oracle.** Anonymous `GET /v1/fulfillments/<an id that exists>`
  answers `401` and `<an id that does not>` answers `404`, because the route loads
  the row to get `organization_id` for the permission check. Same cause, same
  milestone 30.
- **`POST /v1/sessions/revoke`** still requires no credential: anybody holding a
  session id can revoke that session. It is a denial, not an escalation, and
  deciding who may revoke somebody else's session is the same login-flow question
  as B-39. Recorded as B-40.
- `GET /metrics` and `POST /v1/identities` are anonymous **by design** — a scrape
  target and the route by which an unknown caller first appears. Neither is a
  finding.
- The `403` a cross-tenant read now returns still tells an authenticated caller
  that a row exists. Turning those into `404` is a contract change with its own
  measurement; it is not claimed here.

## Falsification

Each mutation applied to a committed tree, suite re-run, then restored and
`git status --porcelain` confirmed empty.

| # | mutation | expected | result |
| --- | --- | --- | --- |
| F1 | remove the `requirePrincipal` call from the membership route | anonymous grant answers 201 again | caught — 6 of 8 cases fail |
| F2 | require `organization.read` instead of `organization.write` | a colleague could promote themselves | **passed the first version of the gate** — see below; caught after the gate was strengthened, 2 cases fail |
| F3 | drop the `organization_id` argument, leaving the permission unscoped | an org_admin reaches another tenant | caught |
| F4 | delete `"401"` from the contract operation | a reachable refusal is undocumented | **passed the first version** — caught after the gate was strengthened |
| F5 | delete `"403"` from the contract operation | same | **passed the first version** — caught after the gate was strengthened |

Three of five passed, which is the most this repository has recorded in one cycle,
and both reasons are worth keeping.

**F2 passed because no case in the file held the one principal that can tell the
two permissions apart.** An outsider holds neither `organization.read` nor
`organization.write`; an `org_admin` holds neither *outside* its own tenant (true
by construction only since B-47: until then a principal that was `org_admin` of
A and merely `org_member` of B held `organization.write` in B too). Both
answer `403` under either permission, so every case passed while the route
accepted a permission that any `org_member` holds — meaning any colleague could
have promoted themselves to administrator, which is most of the original defect
back again. The gate now has an `org_member` of the victim organization attempting
exactly that, with a premise assertion that the same token really does read the
organization (`200`), so its `403` is demonstrably about the write permission and
not about having no access at all.

**F4 and F5 passed because this route's refusals are reached by no other test.**
The milestone 27 and 28 gates compare the contract against statuses they *observe*
while driving the 52 operations authenticated, so a `401` and a `403` that only
this file produces were documented by nobody's measurement. The file now records
every status it drives out of the route in a set and asserts the contract documents
each one — asserted against what the cases actually saw, not against a list written
in the test, so a case that stops reaching a refusal cannot leave a stale
expectation passing. This is the fourth cycle in a row in which a falsification
passed until the gate itself was made stronger, and the second in which the
strengthening found a further real weakness rather than only a missing assertion.

## Evidence

- Route: `src/modules/identity-access/http.ts`, `POST /v1/memberships`.
- Gate: `tests/anonymous-privilege-escalation.test.ts`, 8 cases.
- Contract: `contracts/openapi/core-v1.yaml`, `/v1/memberships`.
- Local: 717 passed / 148 skipped without a database (was 709 / 148), 1280 with one (was 1272).
