/**
 * The first credential of an environment.
 *
 * Milestone 31 made `POST /v1/sessions` require `session.issue`, which creates a
 * question that route cannot answer: a route that needs a session in order to
 * issue a session cannot issue the first one. Until then the answer was that
 * anybody could mint a token for any principal id they had seen (B-39), which is
 * not a bootstrap path, it is the absence of one.
 *
 * So the first credential is provisioned here, and the security argument is
 * about **what it takes to run this**: a live `DATABASE_URL` for CORE's own
 * database. Anybody who has that can already read every row and write every
 * table, so a path that requires it grants nothing new — while the HTTP route it
 * replaces needed only the ability to send a request.
 *
 * Three properties this deliberately has:
 *
 *  - **It invents no tenant.** The organization must already exist and is named
 *    by id. Creating one here would mean CORE conjuring a tenant during
 *    provisioning, and the roles a credential holds are meaningful only relative
 *    to a real organization.
 *  - **It is idempotent on the identity and the membership, and never on the
 *    token.** Re-running it against the same service name resolves the same
 *    principal, tolerates the membership already existing, and mints a *new*
 *    session: a token cannot be re-read, only re-issued, because only its hash
 *    is stored.
 *  - **It verifies what it just printed.** The session is authenticated before
 *    it is returned, and the roles that come back must contain every role asked
 *    for. A pre-existing membership with weaker roles therefore fails loudly
 *    instead of handing an operator a credential that quietly cannot do the job
 *    it was provisioned for.
 */
import { invalid } from "../errors.js";
import type { IssuableChannelType, Role } from "../../modules/identity-access/domain.js";
import type { IdentityService } from "../../modules/identity-access/service.js";
import type { OrganizationService } from "../../modules/organization/service.js";

export interface ProvisionedCredential {
  readonly principal_id: string;
  readonly identity_id: string;
  readonly session_id: string;
  readonly organization_id: string;
  readonly roles: readonly Role[];
  /** The channels this credential may issue sessions on (B-42); empty unless asked for. */
  readonly issues_for_channels: readonly IssuableChannelType[];
  readonly expires_at: string;
  /** Printed once and never recoverable: only the hash is persisted. */
  readonly access_token: string;
  /** `false` when the identity already existed and was resolved rather than created. */
  readonly identity_created: boolean;
  /** `false` when the membership already existed with the roles asked for. */
  readonly membership_created: boolean;
}

export async function provisionServiceCredential(
  services: { identity: IdentityService; organization: OrganizationService },
  input: {
    service_name: string;
    organization_id: string;
    roles: readonly Role[];
    /**
     * The person-facing channels the service authenticates people on, and so
     * may issue sessions for (B-42). Defaults to none: a credential that can
     * issue for nobody is the weaker default, as `--roles` is.
     */
    issues_for_channels?: readonly IssuableChannelType[];
    correlation_id: string;
  },
): Promise<ProvisionedCredential> {
  if (input.service_name.trim() === "") {
    throw invalid("service_name is required: a credential nobody can name cannot be audited");
  }
  if (input.roles.length === 0) {
    throw invalid("at least one role is required: a credential with no role can do nothing");
  }
  // Refuses before anything is written if the tenant does not exist.
  const organization = await services.organization.require(input.organization_id);

  const registered = await services.identity.registerIdentity({
    channel_type: "partner_api",
    external_id: input.service_name,
    service_name: input.service_name,
    display_name: input.service_name,
    source_system: "bootstrap",
    issues_for_channels: input.issues_for_channels ?? [],
    correlation_id: input.correlation_id,
  });
  // A repeat run resolves the existing principal and never re-scopes it, so a
  // different scope asked for is refused loudly — the same reasoning as the
  // roles check below: never print a credential that quietly cannot do (or can
  // do more than) what it was provisioned for. Checked before anything else is
  // written, so a refused re-run leaves no new membership and no new session.
  const askedScope = [...new Set(input.issues_for_channels ?? [])].sort();
  const heldScope = [...registered.principal.issues_for_channels].sort();
  if (askedScope.join(",") !== heldScope.join(",")) {
    throw invalid(
      "this service already exists with different issuance channels, and provisioning again does not re-scope it",
      { asked_issues_for_channels: askedScope, held_issues_for_channels: heldScope },
    );
  }

  let membershipCreated = false;
  try {
    await services.identity.grantMembership({
      principal_id: registered.principal.principal_id,
      organization_id: organization.organization_id,
      roles: [...input.roles],
      correlation_id: input.correlation_id,
    });
    membershipCreated = true;
  } catch (error: unknown) {
    // A membership that already exists is the idempotent case. Any other
    // failure is not, and must not be swallowed.
    if ((error as { code?: string }).code !== "conflict") throw error;
  }

  const { session, token } = await services.identity.issueSession({
    principal_id: registered.principal.principal_id,
    channel_type: "partner_api",
    correlation_id: input.correlation_id,
  });

  // The verification. Authenticating the token exercises the same path a request
  // will: the session row, the principal, the identity's status and the
  // memberships that give it roles.
  const actor = await services.identity.authenticate(token);
  const missing = input.roles.filter((role) => !actor.roles.includes(role));
  if (missing.length > 0) {
    throw invalid(
      "the provisioned credential does not hold the roles asked for, so an existing membership carries different ones",
      { missing_roles: missing, granted_roles: actor.roles },
    );
  }

  return {
    principal_id: actor.principal_id,
    identity_id: actor.identity_id,
    session_id: session.session_id,
    organization_id: organization.organization_id,
    roles: actor.roles,
    issues_for_channels: heldScope as IssuableChannelType[],
    expires_at: session.expires_at,
    access_token: token,
    identity_created: registered.created,
    membership_created: membershipCreated,
  };
}
