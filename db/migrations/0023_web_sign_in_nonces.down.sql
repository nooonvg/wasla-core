-- Rollback for migration 0023.
--
-- Returns the database to the shape 0022 left. A true inverse: the table the forward migration created (the nonce store), dropped,
-- and the journal row removed.
--
-- What rolling back costs, stated plainly: the web sign-in route that consumes
-- this ledger fails on the missing table, so `POST /v1/web-session/telegram`
-- answers `500` rather than issuing sessions — deliberate, in the same spirit
-- as 0022's rollback: there is no half-working state where the replay guard
-- is skipped and login continues, because that would mint sessions with the
-- protection appearing to be in place.

BEGIN;

DROP TABLE IF EXISTS web_sign_in_nonces;

DELETE FROM schema_migrations WHERE version = '0023_web_sign_in_nonces';

COMMIT;
