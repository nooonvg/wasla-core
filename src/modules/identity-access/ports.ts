import type { TransactionScope } from "../../platform/persistence/transaction.js";
import type { ChannelType, Identity, IdentityLink, Membership, Principal, Session } from "./domain.js";

export interface IdentityRepository {
  insertIdentity(identity: Identity, scope: TransactionScope): Promise<void>;
  getIdentity(identityId: string): Promise<Identity | undefined>;
  updateIdentity(identity: Identity, scope: TransactionScope): Promise<void>;
  listIdentities(): Promise<Identity[]>;

  insertLink(link: IdentityLink, scope: TransactionScope): Promise<void>;
  findLink(channelType: ChannelType, externalId: string): Promise<IdentityLink | undefined>;
  listLinksForIdentity(identityId: string): Promise<IdentityLink[]>;
  /**
   * Account deletion (D-XR-13): tombstones every link of an identity. An update,
   * never a row removal — see `tests/delete-parity.test.ts` for why CORE keeps
   * it that way. Reads stop seeing tombstoned links, so the channel slot frees.
   */
  tombstoneLinksForIdentity(identityId: string, deletedAt: string, scope: TransactionScope): Promise<void>;

  insertPrincipal(principal: Principal, scope: TransactionScope): Promise<void>;
  getPrincipal(principalId: string): Promise<Principal | undefined>;
  findPrincipalByIdentity(identityId: string): Promise<Principal | undefined>;

  insertSession(session: Session, scope: TransactionScope): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | undefined>;
  getSession(sessionId: string): Promise<Session | undefined>;
  updateSession(session: Session, scope: TransactionScope): Promise<void>;
  /**
   * Account deletion (D-XR-13): revokes every live session of a principal in
   * one write. An update on `revoked_at`, the same field `revokeSession` sets,
   * so the caller's own token dies inside the same transaction as the deletion.
   */
  revokeSessionsForPrincipal(principalId: string, revokedAt: string, scope: TransactionScope): Promise<void>;

  insertMembership(membership: Membership, scope: TransactionScope): Promise<void>;
  listMemberships(principalId: string): Promise<Membership[]>;
  findMembership(principalId: string, organizationId: string): Promise<Membership | undefined>;
  /**
   * Account deletion (D-XR-13): tombstones every membership of a principal. An
   * update, never a row removal. Authorization reads stop seeing them, so a
   * deleted account holds no role anywhere.
   */
  tombstoneMembershipsForPrincipal(principalId: string, deletedAt: string, scope: TransactionScope): Promise<void>;
}
