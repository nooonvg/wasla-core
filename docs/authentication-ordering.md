# Where authentication happens, and why it happens first

Milestone 30. This file is the record of a deliberate reversal: milestones 24
and 25 ordered the request parse **before** authentication, and this milestone
orders authentication **before** the parse. Both decisions were argued; this
explains what changed the answer, what the old argument got right, and what it
now costs.

## What was measured

On the reservation commit (`af2afd7`), all 52 registrations were driven over the
router with **no `authorization` header** and a syntactically valid but invented
identifier in every path parameter:

| Answer | Count | What it means |
| --- | ---: | --- |
| `200` | 3 | `/health`, `/ready`, `/metrics`. Intended. |
| `400` | 28 | The route parsed an anonymous caller's query string or body, and told it what was wrong with them. |
| `401` | 19 | The credential refusal. |
| `404` | 2 | `GET /v1/fulfillments/{fulfillment_id}` and `POST /v1/fulfillments/{fulfillment_id}/cancel`. |

Two findings, one worse than the other.

**The 28.** Authentication lived inside each handler, so the parse always ran
first. A caller holding nothing at all could enumerate which properties a write
route accepts, which are required, which spelling it wants, and which query
parameters exist — 28 routes answered those questions before asking who was
asking. The contract publishes the same facts, so this is disclosure of nothing
secret; it is still an unauthenticated caller driving CORE's parser 28 different
ways and reading structured answers about internals it has no relationship with.

**The 2.** Those two routes answered `404` for an invented identifier and `401`
for a real one, to the same anonymous caller. That difference is an **existence
oracle**: anyone could test whether a fulfillment id exists, without a
credential, by reading the status code. It is not a disclosure the contract also
makes, and it is the finding that settled the ordering question.

A third measurement: the contract documented `401` on **3 of the 46** operations
that can answer it.

## What changed

Authentication became a property of the route rather than a line inside a
handler.

- `src/platform/http/authentication.ts` is new. `AuthenticationSpec` is either
  `AUTHENTICATED` or `anonymous(reason)`, and `anonymous("")` throws: an
  exemption without a written argument cannot be registered at all.
- Every `Router` registration carries one. `add`, `get` and `post` default to
  `AUTHENTICATED`, so the unsafe direction is the one that has to be typed out.
- `Router.handle` resolves it **after the rate limiter** and **before**
  `parseSelection`, `parseBody` and the handler.
- `bearerCredential` is the only place a credential is read out of the
  `authorization` header. `bearer()` in `identity-access/http.ts` is gone, and no
  handler calls `authenticate` any more; `requirePrincipal` authorizes the
  principal the router already established.
- `RequestContext<A>` carries `principal: A | null`. A handler on a route that
  declared `AUTHENTICATED` can rely on it being non-null.

Six routes are anonymous by declaration, each with its reason:

| Route | Reason |
| --- | --- |
| `GET /health` | a liveness probe holds no session and must answer even when identity is unwell |
| `GET /ready` | a readiness probe holds no session; system-level facts only (B-5) |
| `GET /metrics` | a scrape target has no session; kept off the public internet by deployment (B-5) |
| `POST /v1/identities` | the entry point: a caller with no identity yet asks for one |
| `POST /v1/sessions` | the login surface: this is how a credential is obtained (B-39) |
| `POST /v1/sessions/revoke` | revocation takes no credential today (B-40) |

Three of those reasons name an open blocker. That is the point of requiring a
reason: the exemptions that are wrong stay legible as wrong.

## After

The same sweep, on the implementation commit:

| Answer | Count | What it means |
| --- | ---: | --- |
| `200` | 3 | The three probes. Unchanged. |
| `400` | 3 | The three anonymous write routes refusing an empty body — the answer they should give. |
| `401` | 46 | Every route that declares it needs a credential. |
| `404` | 0 | The oracle is closed: real and invented identifiers are indistinguishable. |

The contract now documents `401` on **46 of 46**, through a dedicated
`Unauthenticated` response component that states the two things a status code
cannot: that the refusal comes first, and that it is the same answer for an
identifier that exists and one that does not.

## The conflict with milestones 24 and 25, resolved on purpose

Those milestones asserted the opposite ordering, in two cases that have now been
replaced by their inverse. Their reasoning, quoted from the gates:

> The refusal is about the route's own contract — which parameters exist is
> published in `contracts/openapi.yaml` — so answering it before the credential
> is checked discloses nothing a reader of the contract lacks.

> A request CORE cannot understand must not reach a store, and authentication is
> a store read.

> A request carrying no token and a typo must hear about the typo, because 401
> would send the caller to fix a credential that was never the problem.

What survives:

- **The third point is kept as behaviour.** A caller CORE has authenticated
  still hears about its typo, and both gates still assert exactly that. What
  changed is only the answer to a caller with *no* credential, which was never
  going to be helped by a message about a property name.
- **The second point is kept as fact.** Authentication is still not the first
  store read a flood costs. The limiter runs before it —
  `rate-limit.test.ts` ("attributes an unauthenticated flood to the network")
  drives that, and `http-authentication-declaration.test.ts` asserts the source
  order so a later edit cannot swap them. Beyond that: a request carrying **no**
  `authorization` header is refused by `bearerCredential` before `authenticate`
  is called at all, so it costs **zero** reads. A request carrying a **junk**
  credential costs **one** indexed session lookup, inside a budget the limiter
  has already applied.
- **The first point was true and insufficient.** The parameter list is public,
  so disclosing it early disclosed nothing. The existence of a fulfillment id is
  not public, and the old ordering disclosed that too. One ordering cannot be
  right for the public half and the private half of the same answer, so the
  ordering that is safe for both wins.

What it cost: the two gates could previously drive every route anonymously.
They now mint a credential through the two anonymous routes
(`tests/support/credential.ts`) that is **authenticated and entitled to
nothing**, so their `400`s are still proven — and proven to come before the
`403` that caller would otherwise receive, which is a slightly stronger claim
than they made before.

## Falsification

Each mutation was applied to the committed tree, the gate was run, the mutation
was reverted, and `git status` was confirmed clean afterwards.

| # | Mutation | Result |
| --- | --- | --- |
| 1 | Declare a route that needs a credential `anonymous("falsification")` (`notification/http.ts`) | **4 cases fail**: the anonymous set is no longer the named six; the reason is not a real argument; the scenario's answer for that route changes; the contract now documents `401` on a route declared anonymous. |
| 2 | Move authentication *after* `parseSelection` and `parseBody` in `router.ts` — milestone 24/25's ordering, restored | **4 cases fail**: anonymous sweep with no credential, with a junk credential, `401`-before-`400`, and the asserted source order. |
| 3 | Remove router authentication for parameterised routes only, restoring the measured oracle | **The file fails**: the scenario fixture cannot even be built, because the routes it drives with a real token stop accepting it. Recorded as a weakness of that case's fixture rather than a clean single-case signal. |
| 4 | Make the refusal name the path it refused (`no credential for ${url.pathname}`) | **2 cases fail**: the refusal echoes a real identifier, so the oracle comparison sees two different bodies, and the "says only that" case sees `/v1/` in the message. |
| 5 | Delete one `"401"` from `contracts/openapi/core-v1.yaml` | **1 case fails**: 45 documented against 46 that can answer it. |
| 6 | Remove the empty-reason guard from `anonymous()` | **1 case fails**: an exemption with no argument becomes registrable. |
| 7 | Read `"authorization"` in `money/http.ts` | **1 case fails**: a fourth reader of the header, i.e. a second opinion about what a credential is. |

## What this does not claim

That authorization is right. Who may do what is `identity.authorize`, and
**B-39** (`POST /v1/sessions` mints a token for any `principal_id`) and **B-40**
(`POST /v1/sessions/revoke` needs no credential) are still open, which makes
"authenticated" a weaker statement today than it reads. Both are gated by
`tests/anonymous-privilege-escalation.test.ts` and are untouched here. Closing
them is the next thing this milestone makes possible rather than something it
did.

It also does not claim the deployment is safe. `/metrics` and `/ready` are
anonymous by declaration and must be kept off the public internet by the
topology, which is **B-5**, still open.

## Census since, kept current

The table above is milestone 31's census, kept as written. Three later
surfaces joined the anonymous set, each still by name with its reason, and the
census the gate now asserts is **seven** routes: milestone 31's six above,
plus `POST /v1/web-session/telegram/nonce` and `POST /v1/web-session/telegram`
(XR-8.5: the nonce pair is the anti-replay binding of a browser login, and the
login itself is how the credential is obtained — the same standing decision as
B-39), and since the mini-app bridge
(D-XR-13, CLM-0701/0702 follow-up) `POST /v1/web-session/telegram/init-data`:
the mini-app's `init_data` is signed by Telegram's own Ed25519 key and verified
at CORE against the published public keys before any session exists — public
keys only, no bot secret held by CORE, so the entry surface needs no
credential of its own to check. The refusal it can answer (`401`, the refused
proof) is documented on the route like the web login's. The census lives in
`tests/http-authentication-declaration.test.ts` and the OpenAPI contract;
this section only keeps the prose from contradicting them.
