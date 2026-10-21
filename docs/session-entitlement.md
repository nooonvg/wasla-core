# Issuing a session, and ending one

Milestone 31. It closes **B-39** and **B-40**, the two blockers milestone 30 had
to leave open, and a third defect that was found while measuring them and had
never been recorded anywhere.

## What was true before, measured rather than recalled

Taken on `main` at `b63585d` before a line was edited, against the real router
with the memory backend, with a victim tenant whose administrator holds
`platform_admin` — 14 permissions — and a live session.

| Request | Credential | Answer before |
| --- | --- | --- |
| `POST /v1/sessions` `{principal_id: <the administrator's>, channel_type}` | none | **201** with a working `access_token` |
| `GET /v1/sessions/current` with that token | the minted one | **200**, `platform_admin`, 14 permissions, the victim organization |
| `POST /v1/sessions` for the administrator's principal | an outsider's own valid token | **201** — holding a credential neither helped nor was required |
| `POST /v1/sessions/revoke` `{session_id: <the administrator's>}` | none | **204**, and the administrator's next request → `401 session expired or revoked` |
| `POST /v1/sessions/revoke` with a well-formed id that exists nowhere | none | **204**, and then **the process terminated** |

The first three rows are B-39. A principal id is not a secret: it is returned by
`GET /v1/sessions/current`, by every membership answer and by audit reads, so
"anybody who has seen an administrator's principal id can become that
administrator" is the accurate reading. The fourth is B-40 — a denial rather
than an escalation, but an unauthenticated one.

The fifth was new. The handler called `identity.revokeSession(...)` **without
`await`**, so the rejection for an absent session escaped the router's error
handling entirely: the caller was told `204` for a revocation that never
happened, and the unhandled rejection took the process down. An anonymous
request was a remote kill.

The contract agreed with none of it and half of it: `POST /v1/sessions`
documented `201`, `404`, `429`; `POST /v1/sessions/revoke` documented `204`,
`429`; neither documented `401` or `403`, which was consistent, because neither
refused anyone. But `/v1/sessions/revoke` carried **no** `security: []` while
being anonymous in code — the contract already said a credential was needed and
the router did not require one. The contract was right and the code was wrong,
which is the direction this repository usually does not get to enjoy.

## What it is now

`session.issue` is a permission. It is held by `platform_admin` and by
`service`, and by nothing else.

`service` is the answer B-39's own text recommended out of the three it listed:
a channel adapter authenticates a person the way its own channel already does —
Telegram, WhatsApp, a partner's API — and then asks CORE for a session on their
behalf with a credential CORE issued it. That is what the `service` role and the
`partner_api` channel already existed for. The two directions not taken, an OTP
to the registered channel and a signed assertion from the caller, are login
flows CORE cannot pick unilaterally for MOVE and MARKET; this one moves the
decision to the adapter that already owns it, without CORE pretending to know
how any channel authenticates.

`session.issue` is deliberately **not** implied by `identity.write`. Editing an
identity's display name and being able to become that identity are different
powers, and a reviewer reaching for the nearest existing permission would have
merged them.

Both routes declare `AUTHENTICATED`, so the router refuses an anonymous caller
before it parses a body or reads a row — milestone 30's ordering, inherited for
free by two routes that until now opted out of it.

Revocation has its own rule, in `IdentityService.revokeSessionAs`:

- your own session needs **no permission at all**, because ending your own
  session is not an administrative act and requiring a permission for it would
  make logging out a privilege;
- anybody else's needs `identity.write`;
- and the authorization is checked **before** the "does this session exist"
  refusal.

That last clause is the whole difficulty of closing B-40. Requiring a credential
and then answering `404` for an invented id and `403` for a real one would have
replaced an open door with an **existence oracle** — exactly what milestone 30
spent a cycle removing from the fulfillment reads — readable by anybody holding
any credential at all. So an unprivileged caller gets `403` either way, and only
a caller who may revoke other people's sessions can learn that a session id is
not real.

And the revocation is awaited.

## The first credential of an environment

A route that requires a session to issue a session cannot issue the first one.
`npm run bootstrap:credential -- --service-name <name> --organization <id>
[--roles service]` provisions it: it requires an organization that already
exists, registers a `partner_api` identity for the named service, grants the
membership (tolerating one that is already there), issues a session, and then
**authenticates the token it just minted and verifies every role asked for is
actually present** before printing anything. If an existing membership carries
weaker roles, it fails loudly rather than handing back a credential that holds
less than the operator asked for.

It needs `DATABASE_URL`. That is the security argument, stated plainly: anybody
who can run this command can already read every row and write every table, while
the route it replaces needed only the ability to send an HTTP request. `--roles`
defaults to `service`; `platform_admin` has to be asked for, because the default
of a provisioning command must be the weaker credential. The token is printed
once inside a JSON report and cannot be recovered — only its hash is stored — so
re-running the command mints a new session rather than reprinting the old one,
and the previous one keeps working, because provisioning again is not a rotation
and revoking is a separate, entitled act.

Run against a real PostgreSQL, first invocation: `identity_created: true`,
`membership_created: true`, `roles: ["service"]`. Second invocation, same
arguments: the same `principal_id` and `identity_id`, a different `session_id`
and token, `identity_created: false`, `membership_created: false`. Against an
organization id that does not exist: `organization not found` on stderr, exit
code `1`.

## After

| Request | Credential | Answer now |
| --- | --- | --- |
| `POST /v1/sessions` | none | **401**, no `access_token`, and the victim's session untouched |
| `POST /v1/sessions` | a principal holding nothing | **403** |
| `POST /v1/sessions` | `org_admin` of the very organization | **403** — the permission's identity, not merely its presence |
| `POST /v1/sessions` | `service`, or `platform_admin` | **201**, and the session belongs to the *named principal*, with that principal's roles and no others |
| `POST /v1/sessions` for a principal that does not exist | entitled | **404** |
| the same | not entitled | **403** — no existence oracle |
| `POST /v1/sessions/revoke`, own session | any | **204**, and the token is dead |
| `POST /v1/sessions/revoke`, somebody else's | without `identity.write` | **403**, and the session survives |
| `POST /v1/sessions/revoke`, real id vs invented id | without `identity.write` | identical status **and** identical error code |
| `POST /v1/sessions/revoke`, invented id | with `identity.write` | **404**, returned by the router, with nothing escaping it |
| `POST /v1/sessions/revoke`, twice on the same session | with `identity.write` | **204** then **204** |

Anonymous routes are now **4**, not 6: `/health`, `/ready`, `POST
/v1/identities` and `/metrics`. Routes requiring a credential are **48**. The
contract documents `401`, `403` and `404` on both session operations.

## Falsification

Six mutations, each applied to the committed tree, measured, and reverted.

| Mutation | Caught by | Result |
| --- | --- | --- |
| `requirePrincipal(ctx, identity)` without the permission on `POST /v1/sessions` | 5 cases across 2 files | caught |
| the not-found refusal moved **before** the authorization in `revokeSessionAs` | the real-vs-invented case | caught |
| `void` instead of `await` on `revokeSessionAs` in the handler | 4 cases | caught |
| `security: []` restored on `/v1/sessions` in the contract | the anonymous-census equality | caught |
| `session.issue` granted to `org_admin` | 2 cases | caught |
| the role verification disabled in `provisionServiceCredential` | the weaker-roles case | caught |

The second and fourth are the ones worth keeping: the second is the only thing
standing between this milestone and a new oracle, and the fourth is what makes
`security: []` in the contract and `anonymous(...)` in the registration one fact
instead of two. That invariant is asserted as a set equality rather than a count,
so neither statement can drift without the other — the disagreement this cycle
found on `/v1/sessions/revoke` cannot recur silently.

## What this does not claim

**`session.issue` was unscoped — B-42, now closed (2026-10-21).** When this
milestone shipped, a `service` credential could mint a session for **any**
principal, including a `platform_admin`, and this paragraph claimed every
issuance was audited "against the issuing principal". Measured on `6972a73`, the
audit row actually named the principal the session was *for*.

Both are fixed (migration 0022, `IdentityService.issueSessionAs`, gate
`tests/session-issuance-scope.test.ts`):

- a service names the person-facing channels it issues for
  (`principal.issues_for_channels`, set by `bootstrap:credential --issue-for`,
  empty by default, never `partner_api`, never on a person);
- it may issue only on one of those channels, only for a person with a verified
  link on that channel, and never for a service or for a principal whose roles
  grant `session.issue` — every such refusal, and a nonexistent principal, is
  one identical `403`;
- `platform_admin` is not scoped;
- the `session.issued` audit entry names the issuer as `actor_id` and the person
  in `metadata.principal_id`; an in-process issuance is audited as `system`.

It does not add a proof-of-possession flow: CORE still never verifies that a
person controls a channel account. It moves that verification to the adapter,
explicitly, and says so.

It does not give `/metrics`, `/health` or `/ready` a credential — **B-5** still
owns where those live — and `POST /v1/identities` stays anonymous because
registration is how a principal comes to exist at all.

It does not touch session expiry, rotation or refresh. And it does not claim the
audit trail is sufficient to detect misuse of `session.issue`; it claims the
entries exist.
