/**
 * Identity & Access domain (ADR 0003 — CORE is the source of truth for identity).
 *
 * Deliberate separations:
 *  - Identity      : the person/system that exists once in WASLA.
 *  - IdentityLink  : how that identity reaches us on a channel (Telegram, phone, email).
 *                    A channel account is NEVER the identity itself.
 *  - Principal     : the acting subject in a security decision.
 *  - Session       : an authenticated, expiring binding of a principal to a client.
 *  - Membership    : principal ↔ organization, carrying roles.
 */

export type IdentityStatus = "active" | "suspended" | "merged";

export interface Identity {
  identity_id: string;
  status: IdentityStatus;
  /** Set only when this identity was explicitly merged into another. Never automatic. */
  canonical_identity_id: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  source_system: string;
  legacy_id: string | null;
}

/**
 * The channels an identity can be linked on, as a runtime list.
 *
 * A list rather than a bare union so other code can check membership and, more
 * importantly, so a test can compare it against the notification module's
 * `RECEIVABLE_CHANNELS`. Those two lists are deliberately different — `web` and
 * `partner_api` are ways in with no address to answer on — and a difference that
 * only exists in two hand-written unions drifts silently.
 */
export const CHANNEL_TYPES = ["telegram", "phone", "email", "web", "partner_api"] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

/**
 * The channels a service may issue sessions for (B-42, migration 0022).
 *
 * Every channel a *person* is reached on — and not `partner_api`, which is how
 * a *system* reaches CORE: a system's credential is provisioned by an operator
 * with database access and is never minted by another system. Restated by the
 * `principal_issues_for_channels_check` constraint; the two are compared by
 * `tests/session-issuance-scope.test.ts`.
 */
export const ISSUABLE_CHANNEL_TYPES = ["telegram", "phone", "email", "web"] as const satisfies readonly ChannelType[];

export type IssuableChannelType = (typeof ISSUABLE_CHANNEL_TYPES)[number];

export interface IdentityLink {
  identity_link_id: string;
  identity_id: string;
  channel_type: ChannelType;
  /** Identifier as issued by the channel. Unique per (channel_type, external_id). */
  external_id: string;
  verified_at: string | null;
  created_at: string;
}

export interface Principal {
  principal_id: string;
  identity_id: string;
  created_at: string;
  /**
   * Set only when this principal *is* an external system rather than a person.
   * It is the answer to "who is calling", and it comes from the credential, so
   * no request may claim it. `null` for every human principal.
   */
  service_name: string | null;
  /**
   * The person-facing channels this principal may issue sessions for (B-42).
   * Empty for every person, and for every service until an operator names its
   * channels at provisioning. A service authenticates people on *its* channel;
   * a session it asks CORE for must be for somebody linked on that channel.
   */
  issues_for_channels: IssuableChannelType[];
}

export interface Session {
  session_id: string;
  principal_id: string;
  token_hash: string;
  channel_type: ChannelType;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** Roles are CORE-level. Product-specific capability lives in the product. */
export type Role = "platform_admin" | "org_admin" | "org_member" | "support_agent" | "service";

export interface Membership {
  membership_id: string;
  principal_id: string;
  organization_id: string;
  roles: Role[];
  created_at: string;
}

export type Permission =
  | "identity.read"
  | "identity.write"
  | "organization.read"
  | "organization.write"
  | "fulfillment.request"
  | "fulfillment.read"
  | "money.authorize"
  | "support.act"
  | "events.submit"
  // Replaying history is separate from submitting an event, and much stronger:
  // it can re-drive consumers over facts from months ago and, in `reapply` mode,
  // ask handlers to act on them again. `events.submit` is held by every service
  // caller, so reusing it would have handed MARKET and MOVE the ability to
  // replay CORE's history. It is granted to `platform_admin` alone.
  | "events.replay"
  // Reviving a dead `outbox` or `event_delivery` row (B-27). Its own permission
  // rather than a reuse of `events.replay`, because the two reach different
  // systems: a replay re-drives CORE's own consumers, while a revival causes a
  // signed POST to leave the building for a partner's webhook. Also
  // `platform_admin` only, so neither MARKET nor MOVE can decide on CORE's behalf
  // that a dead-lettered event should be sent after all.
  | "events.revive"
  // Plans and their prices are operator territory; reading a subscription is
  // not. Split into two so a tenant can see what it is paying for without
  // also being able to publish a plan or collect a charge. The names are
  // CORE's own capabilities, not product features — a plan's `feature_key` is
  // opaque data and never becomes a permission (ADR 0018).
  | "subscription.read"
  | "subscription.write"
  // Reading a subject's standing and the signals behind it (ADR 0015). One
  // permission, not two: there is no route that writes a signal, because
  // signals arrive as events from the systems that observed them, so a
  // `reputation.write` permission would guard nothing and would advertise a
  // capability CORE does not have.
  | "reputation.read"
  // Minting a session for a principal, which is not "acting on behalf of" that
  // principal — it **is** that principal: the token the route returns carries
  // every role and permission its memberships give it, and CORE cannot tell it
  // apart from one the principal obtained itself. So this is the strongest
  // permission in the list, and deliberately not implied by `identity.write`:
  // editing an identity's display name and being able to become it are not the
  // same power, and a role that needs the first must not silently get the
  // second. Held by `platform_admin` and by `service` — a channel adapter
  // exists to obtain sessions for the people it speaks to — and by nothing
  // else. Before milestone 31 the route that consumes this required no
  // credential at all (B-39).
  | "session.issue";

/**
 * Role → permission mapping is data, not branching logic scattered in handlers
 * (ADR 0018: no product-specific logic in CORE).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  platform_admin: [
    "identity.read",
    "identity.write",
    "organization.read",
    "organization.write",
    "fulfillment.request",
    "fulfillment.read",
    "money.authorize",
    "support.act",
    "events.submit",
    "events.replay",
    "events.revive",
    "subscription.read",
    "subscription.write",
    "reputation.read",
    "session.issue",
  ],
  org_admin: [
    "identity.read",
    "organization.read",
    "organization.write",
    "fulfillment.request",
    "fulfillment.read",
    "subscription.read",
    "reputation.read",
  ],
  // Deliberately not granted to `org_member`: a standing is about a person or a
  // company, and reading everyone's is an administrative act, not an ordinary
  // member's.
  org_member: ["organization.read", "fulfillment.read"],
  // A support agent has to be able to see why a subscription was refused —
  // that is the whole reason an entitlement decision carries a reason rather
  // than a bare boolean.
  support_agent: [
    "identity.read",
    "organization.read",
    "fulfillment.read",
    "support.act",
    "subscription.read",
    // A support agent handling a complaint has to be able to see what a
    // standing is made of; that is the whole reason the signals are listable
    // rather than only summarised.
    "reputation.read",
  ],
  // A service caller exists to feed CORE events; submitting them is the point.
  // It also holds `session.issue`, because a channel adapter is how a person who
  // only ever speaks to Telegram or to MARKET gets a CORE credential at all: the
  // adapter authenticates the person the way its channel already does, then asks
  // CORE for a session on their behalf. Holding the permission is necessary and
  // not sufficient: since B-42 was closed, a service may issue only on the
  // channels it was provisioned for (`Principal.issues_for_channels`), only for a
  // person verified on that channel, and never for a principal that could itself
  // issue — see `IdentityService.issueSessionAs`.
  service: [
    "fulfillment.request",
    "fulfillment.read",
    "identity.read",
    "events.submit",
    "session.issue",
  ],
};

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) out.add(permission);
  }
  return out;
}

export function isSessionActive(session: Session, now: Date): boolean {
  if (session.revoked_at !== null) return false;
  return new Date(session.expires_at).getTime() > now.getTime();
}
