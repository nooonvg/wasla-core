-- Rollback for migration 0025.
--
-- Returns the database to the shape 0024 left. A true inverse: the table the
-- forward migration created (the mini app proof ledger), dropped, and the
-- journal row removed.
--
-- What rolling back costs, stated plainly: the mini app sign-in route that
-- consumes this ledger fails on the missing table, so
-- `POST /v1/web-session/telegram/init-data` answers `500` rather than issuing
-- sessions — deliberate, in the same spirit as 0023's rollback: there is no
-- half-working state where the replay guard is skipped and sign-in continues,
-- because that would mint person sessions with the protection appearing to be
-- in place.

BEGIN;

DROP TABLE IF EXISTS mini_app_init_data_proofs;

DELETE FROM schema_migrations WHERE version = '0025_mini_app_init_data_proofs';

COMMIT;
