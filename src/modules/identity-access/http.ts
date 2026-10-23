import { unauthenticated } from "../../platform/errors.js";
import { AUTHENTICATED, anonymous } from "../../platform/http/authentication.js";
import { objectBody } from "../../platform/http/body.js";
import { natural, newEachTime } from "../../platform/http/retry.js";
import type { RequestContext, Router } from "../../platform/http/router.js";
import { CHANNEL_TYPES } from "./domain.js";
import type { ChannelType, Permission, Role } from "./domain.js";
import type { AuthenticatedPrincipal, IdentityService } from "./service.js";

const CHANNELS: readonly ChannelType[] = CHANNEL_TYPES;
const ROLES: readonly Role[] = [
  "platform_admin",
  "org_admin",
  "org_member",
  "support_agent",
  "service",
];

/**
 * The authenticated caller the router already established.
 *
 * There is no second authentication here, and no second read of
 * `authorization`. Until milestone 30 every handler that needed a caller
 * authenticated one itself, which made authentication a property of a function
 * body: 28 registrations answered `400` about the body to a caller with no
 * credential at all, and the two fulfillment reads answered `404` for an
 * unknown identifier and `401` for a real one. The router now authenticates
 * before it parses anything, so by the time a handler runs the question is
 * already answered — and answering it twice would let the two answers differ.
 */
export function currentPrincipal(
  ctx: RequestContext<AuthenticatedPrincipal>,
): AuthenticatedPrincipal {
  // Unreachable on a route that declared `AUTHENTICATED`: the router refuses
  // the request before the handler exists. Reachable only if a route declares
  // itself anonymous and then asks who the caller is, which is a contradiction
  // in the registration, and is refused rather than guessed.
  if (ctx.principal === null) throw unauthenticated("missing bearer token");
  return ctx.principal;
}

export async function requirePrincipal(
  ctx: RequestContext<AuthenticatedPrincipal>,
  identity: IdentityService,
  permission: Permission,
  organizationId?: string,
): Promise<AuthenticatedPrincipal> {
  const actor = currentPrincipal(ctx);
  await identity.authorize(actor, permission, organizationId);
  return actor;
}

export function registerIdentityRoutes(
  router: Router<AuthenticatedPrincipal>,
  identity: IdentityService,
): void {
  // Resolve-or-create an identity from a channel account. Idempotent by design.
  router.post(
    "/v1/identities",
    objectBody(
      { name: "channel_type", kind: "enum", values: CHANNELS, required: true },
      { name: "external_id", kind: "text", required: true },
      { name: "display_name", kind: "nullable_text" },
      { name: "source_system", kind: "text" },
      { name: "legacy_id", kind: "nullable_text" },
    ),
    // An unknown caller has to be able to appear: this is where a person who
    // has never spoken to CORE becomes a principal, so requiring a credential
    // here would mean no credential could ever be obtained.
    anonymous("the entry point: a caller with no identity yet asks for one"),
    natural(
      "registerIdentity resolves an existing identity by its (channel_type, external_id) link: measured on main at bd92b69 the second call answered 200 rather than 201 with the same identity_id and principal_id, and no identity, principal or identity_link row was added",
    ),
    async (ctx) => {
    const sourceSystem = ctx.input.text("source_system");
    const result = await identity.registerIdentity({
      channel_type: ctx.input.requiredText("channel_type") as ChannelType,
      external_id: ctx.input.requiredText("external_id"),
      display_name: ctx.input.text("display_name") ?? null,
      correlation_id: ctx.correlation_id,
      ...(typeof sourceSystem === "string" ? { source_system: sourceSystem } : {}),
      legacy_id: ctx.input.text("legacy_id") ?? null,
    });
    return {
      status: result.created ? 201 : 200,
      body: {
        identity_id: result.identity.identity_id,
        principal_id: result.principal.principal_id,
        status: result.identity.status,
        created: result.created,
      },
    };
  });

  // Issue a session for an existing principal.
  router.post(
    "/v1/sessions",
    objectBody(
      { name: "principal_id", kind: "text", required: true },
      { name: "channel_type", kind: "enum", values: CHANNELS, required: true },
    ),
    // **Not** the login surface, and this is the correction milestone 31 makes.
    // Measured on `main` at `b63585d`: with no credential at all, and given the
    // `principal_id` of a tenant's administrator — a value returned by
    // `GET /v1/sessions/current`, by every membership answer and by audit reads,
    // so not a secret — this route answered `201` with a working token, and that
    // token read `GET /v1/sessions/current` as `platform_admin` with 14
    // permissions. Issuing a session is not "asking to log in": it is deciding
    // that a named principal's credential may now exist, and CORE has no way to
    // check a person's channel account from here.
    //
    // So the decision moves to whoever can already prove *something*: a caller
    // holding `session.issue` — `platform_admin`, or a `service` credential held
    // by the channel adapter that did authenticate the person on its own channel.
    // The first credential of an environment cannot come from this route by
    // construction, and comes from `npm run bootstrap:credential`, which needs
    // database access rather than an HTTP request.
    AUTHENTICATED,
    newEachTime(
      "issuing a session is the one write where a repeat must create something: a caller asking twice wants two credentials, and collapsing them would hand back a token the first call may already have discarded — revocation, not idempotency, is how a session is undone",
    ),
    async (ctx) => {
    // Not scoped to an organization: a session is not org-scoped — it carries
    // every membership the principal has — so there is no organization to check
    // it against, and pretending otherwise would be a check that reads as a
    // boundary and is not one. It **is** scoped to a channel since B-42 was
    // closed: a service issues only on the channels it was provisioned for, only
    // for a person verified there, and never for a principal that could itself
    // issue. The rules and their order live in `IdentityService.issueSessionAs`.
    const { session, token } = await identity.issueSessionAs(currentPrincipal(ctx), {
      principal_id: ctx.input.requiredText("principal_id"),
      channel_type: ctx.input.requiredText("channel_type") as ChannelType,
      correlation_id: ctx.correlation_id,
    });
    return {
      status: 201,
      body: {
        session_id: session.session_id,
        access_token: token,
        expires_at: session.expires_at,
        token_type: "Bearer",
      },
    };
  });

  // Verify the caller's own session. Returns principal, org membership and permissions.
  router.get("/v1/sessions/current", [], AUTHENTICATED, async (ctx) => {
    const principal = currentPrincipal(ctx);
    // The caller's own channel links (XR-6.1's relying-party half): a service
    // that verifies this session downstream — MARKET's channel edge bridging a
    // web session to its own user — reads here the channel subject (e.g.
    // `tg-12345`) that keys its idempotent resolve. The links are the
    // caller's own data, served to the caller's own credential: nothing is
    // published here that authenticate() did not already read to answer.
    const links = await identity.channelLinks(principal.identity_id);
    return {
      status: 200,
      body: {
        ...principal,
        channel_links: links.map((link) => ({
          identity_link_id: link.identity_link_id,
          channel_type: link.channel_type,
          external_id: link.external_id,
          verified_at: link.verified_at,
          created_at: link.created_at,
        })),
      },
    };
  });

  router.post(
    "/v1/sessions/revoke",
    objectBody({ name: "session_id", kind: "text", required: true }),
    // B-40, answered. Measured on `main` at `b63585d`: with no credential, this
    // route ended a `platform_admin`'s live session — `204`, and the
    // administrator's next request answered `401 session expired or revoked`.
    // With a well-formed id that did not exist it answered `204` **and then
    // terminated the process**, because the call below was made without `await`:
    // the rejection escaped the router's error handling as an unhandled
    // rejection, so the caller was told a revocation succeeded that never
    // happened, and an unauthenticated request was a remote kill.
    AUTHENTICATED,
    natural(
      "revocation is a state machine that is a no-op once it has happened: the second call finds the session already revoked and answers the same way, because a session cannot be revoked twice",
    ),
    async (ctx) => {
    // Awaited, and the entitlement rule lives in the service next to the lookup
    // it depends on: whose session this is cannot be decided without reading it,
    // and deciding it here would mean a second read whose answer could differ.
    await identity.revokeSessionAs(
      currentPrincipal(ctx),
      ctx.input.requiredText("session_id"),
      ctx.correlation_id,
    );
    return { status: 204, body: null };
  });

  // Service-to-service authorization probe used by MOVE and MARKET.
  router.post(
    "/v1/access/check",
    objectBody(
      { name: "permission", kind: "text", required: true },
      { name: "organization_id", kind: "text" },
    ),
    AUTHENTICATED,
    natural(
      "an entitlement check writes nothing at all — it is a read expressed as a POST because the question travels in the body — so a repeat is the same question asked twice",
    ),
    async (ctx) => {
    const actor = currentPrincipal(ctx);
    const permission = ctx.input.requiredText("permission") as Permission;
    const organizationId = ctx.input.text("organization_id") ?? undefined;
    try {
      await identity.authorize(actor, permission, organizationId);
      return { status: 200, body: { allowed: true, principal_id: actor.principal_id } };
    } catch {
      return { status: 200, body: { allowed: false, principal_id: actor.principal_id } };
    }
  });

  router.post(
    "/v1/memberships",
    objectBody(
      { name: "principal_id", kind: "text", required: true },
      { name: "organization_id", kind: "text", required: true },
      { name: "roles", kind: "enum_list", values: ROLES, required: true, minItems: 1 },
    ),
    AUTHENTICATED,
    natural(
      "a membership is unique on (organization_id, principal_id): measured on main at bd92b69 a repeat answered 409 and added no membership row, so the repeat is refused rather than duplicated",
    ),
    async (ctx) => {
    const roles = [...ctx.input.strings("roles")] as Role[];
    // Authenticated and authorized **on the organization being granted into**,
    // which this route required neither of until milestone 29 measured it. With
    // nothing at all — no token, no session, no membership — three ordinary calls
    // were a full escalation: `POST /v1/identities` makes a principal (anonymous
    // by design, since an unknown caller has to be able to appear), this route
    // granted that principal `org_admin` in **any organization id the caller
    // could name**, and `POST /v1/sessions` minted a bearer token for it. The
    // resulting token read another tenant's organization and answered 200.
    //
    // `organization.write` scoped to the target organization is the permission
    // that already means "may change who this organization is": `platform_admin`
    // holds it everywhere and `org_admin` holds it inside its own tenant, so an
    // administrator can add a colleague and nobody can add themselves. The first
    // membership of a brand-new organization is therefore a `platform_admin`
    // action, which is the same shape `POST /v1/organizations` already has.
    await requirePrincipal(
      ctx,
      identity,
      "organization.write",
      ctx.input.requiredText("organization_id"),
    );
    const membership = await identity.grantMembership({
      principal_id: ctx.input.requiredText("principal_id"),
      organization_id: ctx.input.requiredText("organization_id"),
      roles,
      correlation_id: ctx.correlation_id,
    });
    return { status: 201, body: membership };
  });
}
