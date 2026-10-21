import type { TransactionBoundary } from "../../platform/persistence/transaction.js";
import type { Clock } from "../../platform/clock.js";
import { conflict, forbidden, invalid, notFound, unauthenticated } from "../../platform/errors.js";
import { assertId, hashToken, newId, newToken } from "../../platform/ids.js";
import type { AuditLog } from "../../platform/audit/audit.js";
import { makeEvent } from "../../platform/eventing/envelope.js";
import type { OutboxStore } from "../../platform/eventing/outbox.js";
import { withTransaction } from "../../platform/eventing/unit-of-work.js";
import {
  type ChannelType,
  type Identity,
  type IssuableChannelType,
  ISSUABLE_CHANNEL_TYPES,
  type IdentityLink,
  type Membership,
  type Permission,
  type Principal,
  type Role,
  type Session,
  isSessionActive,
  permissionsForRoles,
} from "./domain.js";
import type { IdentityRepository } from "./ports.js";

const PRODUCER = "wasla-core";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** The one refusal for every principal a scoped service may not issue for (B-42). */
const NOT_ISSUABLE =
  "this credential may not issue a session for this principal: it must be a person verified on the credential's channel who cannot issue sessions";

export interface AuthenticatedPrincipal {
  principal_id: string;
  identity_id: string;
  session_id: string;
  organization_ids: string[];
  roles: Role[];
  permissions: Permission[];
  /** The external system this credential belongs to, or `null` for a person. */
  service_name: string | null;
}

export interface RegisterIdentityInput {
  channel_type: ChannelType;
  /**
   * Registers this identity as an external system rather than a person. Only
   * set by an operator provisioning MARKET's or MOVE's credential.
   */
  service_name?: string | null;
  /**
   * The person-facing channels a *service* may issue sessions for (B-42). Only
   * meaningful with `service_name`, and refused without it. Set once, when the
   * service's identity is created; an existing service is never re-scoped by a
   * repeat call — see `provisionServiceCredential`, which refuses the mismatch.
   */
  issues_for_channels?: readonly IssuableChannelType[];
  external_id: string;
  display_name?: string | null;
  correlation_id: string;
  source_system?: string;
  legacy_id?: string | null;
}

export interface RegisterIdentityResult {
  identity: Identity;
  principal: Principal;
  created: boolean;
}

export class IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly outbox: OutboxStore,
    private readonly boundary: TransactionBoundary,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {}

  /**
   * Resolve-or-create by channel link. Idempotent: calling twice with the same
   * (channel_type, external_id) returns the same identity and emits no second event.
   * It never merges two existing identities — that is an explicit, gated operation.
   */
  async registerIdentity(input: RegisterIdentityInput): Promise<RegisterIdentityResult> {
    if (!input.external_id.trim()) throw invalid("external_id is required");
    if (!input.correlation_id.trim()) throw invalid("correlation_id is required");
    const issuesFor = [...new Set(input.issues_for_channels ?? [])];
    for (const channel of issuesFor) {
      if (!(ISSUABLE_CHANNEL_TYPES as readonly string[]).includes(channel)) {
        throw invalid("issues_for_channels may name person-facing channels only", {
          channel_type: channel,
          issuable: [...ISSUABLE_CHANNEL_TYPES],
        });
      }
    }
    if (issuesFor.length > 0 && !input.service_name) {
      throw invalid("issues_for_channels is only for a service: a person is never a delegated issuer");
    }

    const existingLink = await this.repo.findLink(input.channel_type, input.external_id);
    if (existingLink) {
      const identity = await this.repo.getIdentity(existingLink.identity_id);
      if (!identity) throw notFound("identity referenced by link does not exist");
      const principal = await this.repo.findPrincipalByIdentity(identity.identity_id);
      if (!principal) throw notFound("principal for identity does not exist");
      return { identity, principal, created: false };
    }

    const now = this.clock.now();
    const identity: Identity = {
      identity_id: newId(),
      status: "active",
      canonical_identity_id: null,
      display_name: input.display_name ?? null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      source_system: input.source_system ?? PRODUCER,
      legacy_id: input.legacy_id ?? null,
    };
    const principal: Principal = {
      principal_id: newId(),
      identity_id: identity.identity_id,
      created_at: now.toISOString(),
      service_name: input.service_name ?? null,
      issues_for_channels: issuesFor.sort(),
    };
    const link = {
      identity_link_id: newId(),
      identity_id: identity.identity_id,
      channel_type: input.channel_type,
      external_id: input.external_id,
      verified_at: now.toISOString(),
      created_at: now.toISOString(),
    };

    await withTransaction(this.tx, async (uow) => {
      uow.stage(async (scope) => {
        await this.repo.insertIdentity(identity, scope);
        await this.repo.insertPrincipal(principal, scope);
        await this.repo.insertLink(link, scope);
      });
      uow.emit(
        makeEvent({
          event_type: "core.identity.verified",
          version: 1,
          producer: PRODUCER,
          occurred_at: now,
          correlation_id: input.correlation_id,
          entity_type: "identity",
          entity_id: identity.identity_id,
          payload: {
            identity_id: identity.identity_id,
            principal_id: principal.principal_id,
            channel_type: input.channel_type,
            verified_at: now.toISOString(),
          },
        }),
      );
      uow.audit({
        actor_type: "system",
        actor_id: null,
        action: "identity.registered",
        entity_type: "identity",
        entity_id: identity.identity_id,
        correlation_id: input.correlation_id,
        metadata: { channel_type: input.channel_type },
      });
    });

    return { identity, principal, created: true };
  }

  /** Boundary, outbox and audit log — the three things a commit needs. */
  private get tx() {
    return { boundary: this.boundary, outbox: this.outbox, audit: this.audit };
  }

  /**
   * `POST /v1/sessions`: issue a session on behalf of an authenticated caller,
   * which is the entitlement question `issueSession` below does not ask.
   *
   * B-42, closed. Holding `session.issue` is necessary and no longer sufficient
   * for a service. Four rules, and their order matters:
   *
   *  1. **The permission.** Nobody without `session.issue` gets further.
   *  2. **`platform_admin` is not scoped.** An operator acting through CORE's
   *     own administration is a person with every permission already; scoping
   *     them would protect nothing and break the only recovery path there is.
   *  3. **The channel is the credential's, not the request's.** A service may
   *     issue only on a channel in its `issues_for_channels`, checked before
   *     anything is read, so naming a channel it does not speak for learns
   *     nothing about any principal.
   *  4. **The person must be one the channel speaks for, and must not be able to
   *     issue.** The target needs a *verified* link on that channel, must not be
   *     a service, and must hold no role that grants `session.issue` — so a
   *     delegated issuer can never mint a `platform_admin`, nor another issuer.
   *     Every refusal of rule 4 — and an absent principal — is the **same**
   *     `403`, so a scoped service cannot use this route to tell a real
   *     principal id from an invented one, or to learn who is an administrator.
   *
   * The audit row names the **issuer**. Until this change it named the
   * principal the session was for (`docs/session-entitlement.md` said
   * otherwise; measured on `6972a73`: `actor_id` was the target), so "who used a
   * service credential to become whom" was not answerable from the log.
   */
  async issueSessionAs(
    actor: AuthenticatedPrincipal,
    input: { principal_id: string; channel_type: ChannelType; correlation_id: string },
  ): Promise<{ session: Session; token: string }> {
    this.authorize(actor, "session.issue");
    if (!actor.roles.includes("platform_admin")) {
      assertId("principal_id", input.principal_id);
      const issuer = await this.repo.getPrincipal(actor.principal_id);
      const scope: readonly ChannelType[] = issuer?.issues_for_channels ?? [];
      if (!scope.includes(input.channel_type)) {
        throw forbidden("this credential may not issue sessions on this channel", {
          channel_type: input.channel_type,
          issues_for_channels: [...scope],
        });
      }
      if (!(await this.isIssuableBy(input.principal_id, input.channel_type))) {
        throw forbidden(NOT_ISSUABLE, { channel_type: input.channel_type });
      }
    }
    return await this.issueSession({ ...input, issued_by: actor.principal_id });
  }

  /** Rule 4 of `issueSessionAs`, answered as one boolean so every refusal looks alike. */
  private async isIssuableBy(principalId: string, channel: ChannelType): Promise<boolean> {
    const target = await this.repo.getPrincipal(principalId);
    if (!target || target.service_name !== null) return false;
    const links = await this.repo.listLinksForIdentity(target.identity_id);
    if (!links.some((link) => link.channel_type === channel && link.verified_at !== null)) {
      return false;
    }
    const memberships = await this.repo.listMemberships(target.principal_id);
    const permissions = permissionsForRoles(memberships.flatMap((m) => m.roles));
    return !permissions.has("session.issue");
  }

  /**
   * Issues an opaque session token. Only its hash is persisted.
   *
   * In-process only — bootstrap and tests. Over HTTP the entry point is
   * `issueSessionAs`, which decides whether the caller may.
   */
  async issueSession(input: {
    principal_id: string;
    channel_type: ChannelType;
    correlation_id: string;
    /** The principal that asked; absent for an in-process call (bootstrap), audited as `system`. */
    issued_by?: string;
  }): Promise<{ session: Session; token: string }> {
    assertId("principal_id", input.principal_id);
    const principal = await this.repo.getPrincipal(input.principal_id);
    if (!principal) throw notFound("principal not found");
    const identity = await this.repo.getIdentity(principal.identity_id);
    if (!identity) throw notFound("identity not found");
    if (identity.status !== "active") throw forbidden("identity is not active");

    const now = this.clock.now();
    const token = newToken();
    const session: Session = {
      session_id: newId(),
      principal_id: principal.principal_id,
      token_hash: hashToken(token),
      channel_type: input.channel_type,
      issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      revoked_at: null,
    };
    // No event is emitted, but the row and its audit entry still have to
    // commit together: a session that exists with no record of being issued
    // is exactly the gap an access review would be looking for.
    await withTransaction(this.tx, (uow) => {
      uow.stage((scope) => this.repo.insertSession(session, scope));
      uow.audit({
        actor_type: input.issued_by === undefined ? "system" : "principal",
        actor_id: input.issued_by ?? null,
        action: "session.issued",
        entity_type: "session",
        entity_id: session.session_id,
        correlation_id: input.correlation_id,
        metadata: { channel_type: input.channel_type, principal_id: principal.principal_id },
      });
    });
    return { session, token };
  }

  /**
   * Ends a session on behalf of a caller, which is the entitlement question
   * `revokeSession` below deliberately does not ask.
   *
   * Two rules, and the order between them matters:
   *
   *  - **Your own session is yours to end.** No permission is required, because
   *    logging out is not an administrative act and requiring one would mean an
   *    ordinary member could never log out.
   *  - **Anyone else's session needs `identity.write`.** Ending a session is
   *    changing who can act as an identity, which is what that permission
   *    already means.
   *
   * The authorization is checked **before** the "does this session exist"
   * refusal, so an unprivileged caller is told the same thing whether the id is
   * real or invented. That ordering is the whole point: until milestone 31 this
   * route answered `204` to anybody for any id, and simply requiring a
   * credential without this ordering would have replaced an open door with the
   * existence oracle milestone 30 spent a cycle removing from the fulfillment
   * reads.
   */
  async revokeSessionAs(
    actor: AuthenticatedPrincipal,
    sessionId: string,
    correlationId: string,
  ): Promise<void> {
    assertId("session_id", sessionId);
    const session = await this.repo.getSession(sessionId);
    if (session === undefined || session.principal_id !== actor.principal_id) {
      this.authorize(actor, "identity.write");
    }
    if (session === undefined) throw notFound("session not found");
    await this.revokeSession(session.session_id, correlationId);
  }

  async revokeSession(sessionId: string, correlationId: string): Promise<void> {
    assertId("session_id", sessionId);
    const session = await this.repo.getSession(sessionId);
    if (!session) throw notFound("session not found");
    if (session.revoked_at !== null) return;
    // A copy, not an in-place edit. Mutating the stored object would make the
    // change visible before the commit and leave the journal nothing to
    // restore, because the pre-image and the new value would be one object.
    const revoked: Session = { ...session, revoked_at: this.clock.now().toISOString() };
    await withTransaction(this.tx, (uow) => {
      uow.stage((scope) => this.repo.updateSession(revoked, scope));
      uow.audit({
        actor_type: "principal",
        actor_id: revoked.principal_id,
        action: "session.revoked",
        entity_type: "session",
        entity_id: revoked.session_id,
        correlation_id: correlationId,
        metadata: {},
      });
    });
  }

  /** Authenticates a bearer token and resolves the acting principal. */
  async authenticate(token: string): Promise<AuthenticatedPrincipal> {
    if (!token) throw unauthenticated();
    const session = await this.repo.getSessionByTokenHash(hashToken(token));
    if (!session) throw unauthenticated("unknown session token");
    if (!isSessionActive(session, this.clock.now())) throw unauthenticated("session expired or revoked");

    const principal = await this.repo.getPrincipal(session.principal_id);
    if (!principal) throw unauthenticated("principal no longer exists");
    const identity = await this.repo.getIdentity(principal.identity_id);
    if (!identity || identity.status !== "active") throw forbidden("identity is not active");

    const memberships = await this.repo.listMemberships(principal.principal_id);
    const roles = [...new Set(memberships.flatMap((m) => m.roles))];
    return {
      principal_id: principal.principal_id,
      identity_id: identity.identity_id,
      session_id: session.session_id,
      organization_ids: memberships.map((m) => m.organization_id),
      roles,
      permissions: [...permissionsForRoles(roles)],
      service_name: principal.service_name,
    };
  }

  /**
   * The channel links held for an identity.
   *
   * Published so that another module can ask "where can this identity be
   * reached" without reading identity's tables (ADR 0017). Added for the
   * notification module's `ChannelDirectory`, which needs a verified address and
   * must not be given a way to look one up behind this service's back.
   *
   * Returns the links as they are, including unverified ones: whether an
   * unverified link may be used is the caller's decision to justify, and this
   * service filtering silently would hide it.
   */
  async channelLinks(identityId: string): Promise<IdentityLink[]> {
    assertId("identity_id", identityId);
    return await this.repo.listLinksForIdentity(identityId);
  }

  async grantMembership(input: {
    principal_id: string;
    organization_id: string;
    roles: Role[];
    correlation_id: string;
  }): Promise<Membership> {
    assertId("principal_id", input.principal_id);
    assertId("organization_id", input.organization_id);
    if (!await this.repo.getPrincipal(input.principal_id)) throw notFound("principal not found");
    if (await this.repo.findMembership(input.principal_id, input.organization_id)) {
      throw conflict("membership already exists");
    }
    const membership: Membership = {
      membership_id: newId(),
      principal_id: input.principal_id,
      organization_id: input.organization_id,
      roles: input.roles,
      created_at: this.clock.now().toISOString(),
    };
    // Membership is an authorization fact. The grant and the record of who
    // granted it commit together or not at all.
    await withTransaction(this.tx, (uow) => {
      uow.stage((scope) => this.repo.insertMembership(membership, scope));
      uow.audit({
        actor_type: "system",
        actor_id: null,
        action: "membership.granted",
        entity_type: "membership",
        entity_id: membership.membership_id,
        correlation_id: input.correlation_id,
        metadata: { organization_id: input.organization_id, roles: input.roles },
      });
    });
    return membership;
  }

  /**
   * Authorization check. Tenant isolation is enforced here: a permission is only
   * granted inside an organization the principal belongs to.
   */
  authorize(
    actor: AuthenticatedPrincipal,
    permission: Permission,
    organizationId?: string,
  ): void {
    if (!actor.permissions.includes(permission)) {
      throw forbidden("missing permission", { permission });
    }
    if (organizationId !== undefined && !actor.organization_ids.includes(organizationId)) {
      if (!actor.roles.includes("platform_admin")) {
        throw forbidden("principal is not a member of this organization", {
          organization_id: organizationId,
        });
      }
    }
  }
}
