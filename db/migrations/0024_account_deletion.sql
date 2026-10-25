-- WASLA CORE — migration 0024: account deletion (D-XR-13)
-- Forward only, additive. No table here is owned by MOVE or MARKET.
-- Rollback: db/migrations/0024_account_deletion.down.sql
--
-- D-XR-13, closed: «حذف الحساب من داخل التطبيق إلزامي في كل الأغلفة» — and
-- XR-8.3's acceptance names it in the browser journey it gates: دخول، بحث،
-- طلب، خروج، حذف حساب. Apple's 5.1.1(v) makes it a condition of shipping at
-- all. Measured before a line of this was written: no route, no service method,
-- no event, and no way for MOVE or MARKET to learn a person is gone.
--
-- The decision this migration encodes: a deletion is a **tombstone, not a row
-- removal**. CORE's row removal is four declared paths (`tests/delete-parity
-- .test.ts`), none of which is this; the audit trail is append-only and the
-- ledger is append-only, so "gone" here means "answers nothing and holds no
-- slot", not "the row is absent":
--
--  - `identity.status` gains `deleted`. `authenticate` already refuses every
--    status but `active`, and `issueSession` already refuses a non-active
--    identity, so a deleted account is unreachable by construction.
--  - `identity_link` gains `deleted_at`, and its full UNIQUE on
--    (channel_type, external_id) becomes a partial unique index over the live
--    rows only. A tombstoned link keeps its row for the record and frees the
--    channel slot: the person who deleted their account may register afresh on
--    the same channel account, and `registerIdentity` reads `findLink`, which
--    filters tombstones, so it creates a fresh identity rather than resolving
--    to one.
--  - `membership` gains `deleted_at`, and its full UNIQUE on
--    (principal_id, organization_id) becomes a partial unique index the same
--    way: a tombstoned membership holds no role and no slot, so a person who
--    returns to the same organization is one fresh row, not a conflict with
--    their own past.
--  - `session` needs nothing: `revokeSessionsForPrincipal` sets the
--    `revoked_at` the revocation path already sets, for every live session at
--    once — the caller's own token included, inside the same transaction.
--
-- The service refuses the deletion while the caller administers anything
-- (org_admin or platform_admin), so no tombstone below is written by an exit
-- that would strand an organization without an administrator.

BEGIN;

-- `deleted` joins the identity vocabulary. The constraint keeps its name:
-- `identity_status_check`, which `tests/check-parity.test.ts` probes and
-- `src/platform/persistence/row-rules.ts` declares.
ALTER TABLE identity DROP CONSTRAINT identity_status_check;
ALTER TABLE identity ADD CONSTRAINT identity_status_check
    CHECK (status IN ('active', 'suspended', 'merged', 'deleted'));

ALTER TABLE identity_link ADD COLUMN deleted_at timestamptz;
ALTER TABLE membership ADD COLUMN deleted_at timestamptz;

-- The slot rules, narrowed from "ever" to "live": a tombstoned row keeps its
-- record and stops holding its slot. Partial unique indexes rather than
-- constraints, because the census in `tests/uniqueness-parity.test.ts` reads
-- `pg_indexes` as well as `pg_constraint`, and a partial index is the only
-- shape that says "unique among the live rows" in the schema itself.
DROP INDEX IF EXISTS identity_link_channel_external_active_key;
ALTER TABLE identity_link DROP CONSTRAINT identity_link_channel_type_external_id_key;
CREATE UNIQUE INDEX identity_link_channel_external_active_key
    ON identity_link (channel_type, external_id)
    WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS membership_principal_org_active_key;
ALTER TABLE membership DROP CONSTRAINT membership_principal_id_organization_id_key;
CREATE UNIQUE INDEX membership_principal_org_active_key
    ON membership (principal_id, organization_id)
    WHERE deleted_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('0024_account_deletion')
ON CONFLICT (version) DO NOTHING;

COMMIT;
