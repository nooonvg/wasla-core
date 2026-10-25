import { iso, isoRequired, runner, type Queryable } from "../../platform/persistence/postgres.js";
import { NO_SCOPE, type TransactionScope } from "../../platform/persistence/transaction.js";
import type {
  ChannelType,
  Identity,
  IdentityLink,
  IdentityStatus,
  IssuableChannelType,
  Membership,
  Principal,
  Role,
  Session,
} from "./domain.js";
import type { IdentityRepository } from "./ports.js";

interface IdentityRow {
  identity_id: string;
  status: IdentityStatus;
  canonical_identity_id: string | null;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
  source_system: string;
  legacy_id: string | null;
}

interface LinkRow {
  identity_link_id: string;
  identity_id: string;
  channel_type: ChannelType;
  external_id: string;
  verified_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}

interface PrincipalRow {
  principal_id: string;
  identity_id: string;
  created_at: Date;
  service_name: string | null;
  issues_for_channels: IssuableChannelType[];
}

interface SessionRow {
  session_id: string;
  principal_id: string;
  token_hash: string;
  channel_type: ChannelType;
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

interface MembershipRow {
  membership_id: string;
  principal_id: string;
  organization_id: string;
  roles: Role[];
  created_at: Date;
  deleted_at: Date | null;
}

const toIdentity = (row: IdentityRow): Identity => ({
  identity_id: row.identity_id,
  status: row.status,
  canonical_identity_id: row.canonical_identity_id,
  display_name: row.display_name,
  created_at: isoRequired(row.created_at),
  updated_at: isoRequired(row.updated_at),
  source_system: row.source_system,
  legacy_id: row.legacy_id,
});

const toLink = (row: LinkRow): IdentityLink => ({
  identity_link_id: row.identity_link_id,
  identity_id: row.identity_id,
  channel_type: row.channel_type,
  external_id: row.external_id,
  verified_at: iso(row.verified_at),
  created_at: isoRequired(row.created_at),
  deleted_at: iso(row.deleted_at),
});

const toPrincipal = (row: PrincipalRow): Principal => ({
  principal_id: row.principal_id,
  identity_id: row.identity_id,
  created_at: isoRequired(row.created_at),
  service_name: row.service_name,
  issues_for_channels: [...row.issues_for_channels],
});

const toSession = (row: SessionRow): Session => ({
  session_id: row.session_id,
  principal_id: row.principal_id,
  token_hash: row.token_hash,
  channel_type: row.channel_type,
  issued_at: isoRequired(row.issued_at),
  expires_at: isoRequired(row.expires_at),
  revoked_at: iso(row.revoked_at),
});

const toMembership = (row: MembershipRow): Membership => ({
  membership_id: row.membership_id,
  principal_id: row.principal_id,
  organization_id: row.organization_id,
  roles: [...row.roles],
  created_at: isoRequired(row.created_at),
  deleted_at: iso(row.deleted_at),
});

const IDENTITY_COLUMNS = `identity_id, status, canonical_identity_id, display_name,
  created_at, updated_at, source_system, legacy_id`;
const LINK_COLUMNS = `identity_link_id, identity_id, channel_type, external_id, verified_at, created_at, deleted_at`;
const SESSION_COLUMNS = `session_id, principal_id, token_hash, channel_type, issued_at, expires_at, revoked_at`;
const MEMBERSHIP_COLUMNS = `membership_id, principal_id, organization_id, roles, created_at, deleted_at`;

/**
 * Postgres adapter for the identity ports.
 *
 * Every write takes the caller's scope and runs through `runner`, so a write
 * issued inside a unit of work lands in that transaction. Reads go to the pool:
 * the unit of work applies its mutations at the commit point, after the service
 * has finished reading, so no read needs to see an uncommitted write.
 *
 * Uniqueness is enforced by the schema, not restated here. `identity_link` has
 * a unique index on (channel_type, external_id) and `session` one on
 * token_hash; letting the database refuse a duplicate is the only check that
 * stays correct with more than one process running.
 */
export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Queryable) {}

  async insertIdentity(identity: Identity, scope: TransactionScope = NO_SCOPE): Promise<void> {
    await runner(this.pool, scope).query(
      `insert into identity (${IDENTITY_COLUMNS}) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        identity.identity_id,
        identity.status,
        identity.canonical_identity_id,
        identity.display_name,
        identity.created_at,
        identity.updated_at,
        identity.source_system,
        identity.legacy_id,
      ],
    );
  }

  async getIdentity(identityId: string): Promise<Identity | undefined> {
    const result = await this.pool.query<IdentityRow>(
      `select ${IDENTITY_COLUMNS} from identity where identity_id = $1`,
      [identityId],
    );
    const row = result.rows[0];
    return row ? toIdentity(row) : undefined;
  }

  async updateIdentity(identity: Identity, scope: TransactionScope = NO_SCOPE): Promise<void> {
    await runner(this.pool, scope).query(
      `update identity
       set status = $2, canonical_identity_id = $3, display_name = $4,
           updated_at = $5, source_system = $6, legacy_id = $7
       where identity_id = $1`,
      [
        identity.identity_id,
        identity.status,
        identity.canonical_identity_id,
        identity.display_name,
        identity.updated_at,
        identity.source_system,
        identity.legacy_id,
      ],
    );
  }

  async listIdentities(): Promise<Identity[]> {
    const result = await this.pool.query<IdentityRow>(
      `select ${IDENTITY_COLUMNS} from identity order by created_at, identity_id`,
    );
    return result.rows.map(toIdentity);
  }

  async insertLink(link: IdentityLink, scope: TransactionScope = NO_SCOPE): Promise<void> {
    await runner(this.pool, scope).query(
      `insert into identity_link (${LINK_COLUMNS}) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        link.identity_link_id,
        link.identity_id,
        link.channel_type,
        link.external_id,
        link.verified_at,
        link.created_at,
        link.deleted_at,
      ],
    );
  }

  async findLink(channelType: ChannelType, externalId: string): Promise<IdentityLink | undefined> {
    // A tombstoned link does not resolve: the partial unique index
    // `identity_link_channel_external_active_key` says only a live link holds
    // the (channel_type, external_id) slot, so a person who deleted their
    // account registers afresh rather than being resolved to a tombstone.
    const result = await this.pool.query<LinkRow>(
      `select ${LINK_COLUMNS} from identity_link
       where channel_type = $1 and external_id = $2 and deleted_at is null`,
      [channelType, externalId],
    );
    const row = result.rows[0];
    return row ? toLink(row) : undefined;
  }

  async listLinksForIdentity(identityId: string): Promise<IdentityLink[]> {
    const result = await this.pool.query<LinkRow>(
      `select ${LINK_COLUMNS} from identity_link
       where identity_id = $1 and deleted_at is null
       order by created_at, identity_link_id`,
      [identityId],
    );
    return result.rows.map(toLink);
  }

  async tombstoneLinksForIdentity(
    identityId: string,
    deletedAt: string,
    scope: TransactionScope = NO_SCOPE,
  ): Promise<void> {
    await runner(this.pool, scope).query(
      `update identity_link set deleted_at = $2
       where identity_id = $1 and deleted_at is null`,
      [identityId, deletedAt],
    );
  }

  async insertPrincipal(principal: Principal, scope: TransactionScope = NO_SCOPE): Promise<void> {
    await runner(this.pool, scope).query(
      `insert into principal (principal_id, identity_id, created_at, service_name, issues_for_channels)
       values ($1,$2,$3,$4,$5)`,
      [
        principal.principal_id,
        principal.identity_id,
        principal.created_at,
        principal.service_name,
        principal.issues_for_channels,
      ],
    );
  }

  async getPrincipal(principalId: string): Promise<Principal | undefined> {
    const result = await this.pool.query<PrincipalRow>(
      `select principal_id, identity_id, created_at, service_name, issues_for_channels from principal where principal_id = $1`,
      [principalId],
    );
    const row = result.rows[0];
    return row ? toPrincipal(row) : undefined;
  }

  async findPrincipalByIdentity(identityId: string): Promise<Principal | undefined> {
    const result = await this.pool.query<PrincipalRow>(
      `select principal_id, identity_id, created_at, service_name, issues_for_channels from principal where identity_id = $1`,
      [identityId],
    );
    const row = result.rows[0];
    return row ? toPrincipal(row) : undefined;
  }

  async insertSession(session: Session, scope: TransactionScope = NO_SCOPE): Promise<void> {
    await runner(this.pool, scope).query(
      `insert into session (${SESSION_COLUMNS}) values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        session.session_id,
        session.principal_id,
        session.token_hash,
        session.channel_type,
        session.issued_at,
        session.expires_at,
        session.revoked_at,
      ],
    );
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | undefined> {
    const result = await this.pool.query<SessionRow>(
      `select ${SESSION_COLUMNS} from session where token_hash = $1`,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? toSession(row) : undefined;
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const result = await this.pool.query<SessionRow>(
      `select ${SESSION_COLUMNS} from session where session_id = $1`,
      [sessionId],
    );
    const row = result.rows[0];
    return row ? toSession(row) : undefined;
  }

  async updateSession(session: Session, scope: TransactionScope = NO_SCOPE): Promise<void> {
    await runner(this.pool, scope).query(
      `update session set token_hash = $2, expires_at = $3, revoked_at = $4 where session_id = $1`,
      [session.session_id, session.token_hash, session.expires_at, session.revoked_at],
    );
  }

  async revokeSessionsForPrincipal(
    principalId: string,
    revokedAt: string,
    scope: TransactionScope = NO_SCOPE,
  ): Promise<void> {
    // The same field `revokeSession` sets, for every live session at once, so
    // the caller's own token dies inside the deletion's transaction (D-XR-13).
    await runner(this.pool, scope).query(
      `update session set revoked_at = $2
       where principal_id = $1 and revoked_at is null`,
      [principalId, revokedAt],
    );
  }

  async insertMembership(
    membership: Membership,
    scope: TransactionScope = NO_SCOPE,
  ): Promise<void> {
    await runner(this.pool, scope).query(
      `insert into membership (${MEMBERSHIP_COLUMNS}) values ($1,$2,$3,$4,$5,$6)`,
      [
        membership.membership_id,
        membership.principal_id,
        membership.organization_id,
        membership.roles,
        membership.created_at,
        membership.deleted_at,
      ],
    );
  }

  async listMemberships(principalId: string): Promise<Membership[]> {
    const result = await this.pool.query<MembershipRow>(
      `select ${MEMBERSHIP_COLUMNS} from membership
       where principal_id = $1 and deleted_at is null
       order by created_at, membership_id`,
      [principalId],
    );
    return result.rows.map(toMembership);
  }

  async findMembership(
    principalId: string,
    organizationId: string,
  ): Promise<Membership | undefined> {
    const result = await this.pool.query<MembershipRow>(
      `select ${MEMBERSHIP_COLUMNS} from membership
       where principal_id = $1 and organization_id = $2 and deleted_at is null`,
      [principalId, organizationId],
    );
    const row = result.rows[0];
    return row ? toMembership(row) : undefined;
  }

  async tombstoneMembershipsForPrincipal(
    principalId: string,
    deletedAt: string,
    scope: TransactionScope = NO_SCOPE,
  ): Promise<void> {
    await runner(this.pool, scope).query(
      `update membership set deleted_at = $2
       where principal_id = $1 and deleted_at is null`,
      [principalId, deletedAt],
    );
  }
}
