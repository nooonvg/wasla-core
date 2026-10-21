-- Rollback for migration 0022.
--
-- Returns `principal` to the shape 0021 left. A true inverse; nothing else is
-- touched.
--
-- What rolling back costs, stated plainly: the code reads and writes
-- `issues_for_channels`, so every principal insert and read fails on the missing
-- column — `POST /v1/sessions` and `POST /v1/identities` answer `500` rather
-- than issuing unscoped sessions. That is deliberate: there is no half-working
-- state where the scope is skipped and issuance continues, because that would
-- restore B-42 with the protection appearing to be in place.

BEGIN;

ALTER TABLE principal DROP CONSTRAINT IF EXISTS principal_issues_for_channels_check;
ALTER TABLE principal DROP COLUMN IF EXISTS issues_for_channels;

DELETE FROM schema_migrations WHERE version = '0022_principal_issuance_channels';

COMMIT;
