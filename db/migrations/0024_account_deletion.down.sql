-- WASLA CORE — migration 0024 rollback: account deletion (D-XR-13)
--
-- Rollback means the feature never happened, and the schema returns to what it
-- was. The tombstones this feature writes are the one thing that cannot
-- survive that literally, and each is handled where it blocks the restore:
--
--  - A `deleted` identity becomes `suspended`, not `active`: rolling back the
--    vocabulary must not resurrect an account the person ended, and
--    `suspended` is the status that already meant "present, answers nothing".
--  - Tombstoned links and memberships are deleted outright before the full
--    UNIQUE constraints return, because a tombstone and the fresh row that
--    replaced it share the slot the constraint refuses. The audit trail —
--    append-only by design — keeps the record either way; these rows are the
--    reference, not the record.

BEGIN;

UPDATE identity SET status = 'suspended' WHERE status = 'deleted';

DROP INDEX IF EXISTS identity_link_channel_external_active_key;
DELETE FROM identity_link WHERE deleted_at IS NOT NULL;
ALTER TABLE identity_link ADD CONSTRAINT identity_link_channel_type_external_id_key
    UNIQUE (channel_type, external_id);

DROP INDEX IF EXISTS membership_principal_org_active_key;
DELETE FROM membership WHERE deleted_at IS NOT NULL;
ALTER TABLE membership ADD CONSTRAINT membership_principal_id_organization_id_key
    UNIQUE (principal_id, organization_id);

ALTER TABLE identity_link DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE membership DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE identity DROP CONSTRAINT identity_status_check;
ALTER TABLE identity ADD CONSTRAINT identity_status_check
    CHECK (status IN ('active', 'suspended', 'merged'));

DELETE FROM schema_migrations WHERE version = '0024_account_deletion';

COMMIT;
