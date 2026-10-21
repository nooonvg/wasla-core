-- WASLA CORE — migration 0022: scope `session.issue` to the channels a service speaks for
-- Forward only, additive. No table here is owned by MOVE or MARKET.
-- Rollback: db/migrations/0022_principal_issuance_channels.down.sql
--
-- B-42, measured on `main` at `6972a73` before a line of this was written: a
-- principal provisioned with `npm run bootstrap:credential --roles service`
-- held `session.issue`, and `POST /v1/sessions` with that credential answered
-- `201` for a `platform_admin`'s `principal_id`, and the minted token read
-- `GET /v1/sessions/current` as `platform_admin`. The permission answered "may
-- this caller create sessions at all" and never "for whom".
--
-- The answer chosen (ROADMAP B-42, first of the three directions it listed, by
-- the owner's grant of 2026-10-21 recorded in docs/ecosystem/ECOSYSTEM_ROADMAP.md
-- XR-3.2): a service credential names the channels it authenticates people on,
-- and may issue only for a principal that has a verified link on that channel.
-- This column is where the names live.
--
-- Two constraints, both refusing at the row rather than trusting the caller:
--
--  - Only person-facing channels. `partner_api` is how a *system* reaches CORE,
--    and a system's credential is provisioned by an operator with database
--    access, never minted by another system; allowing it here would let one
--    service mint another service.
--  - Only a service principal may carry any. A person holding a non-empty list
--    would be a delegated issuer nobody provisioned.
--
-- The default is the empty list, so every principal that exists today — every
-- person and every service provisioned before this migration — may issue on no
-- channel at all until an operator says otherwise. Fail closed by construction.

BEGIN;

ALTER TABLE principal
    ADD COLUMN IF NOT EXISTS issues_for_channels text[] NOT NULL DEFAULT '{}';

ALTER TABLE principal DROP CONSTRAINT IF EXISTS principal_issues_for_channels_check;
ALTER TABLE principal
    ADD CONSTRAINT principal_issues_for_channels_check
    CHECK (
        issues_for_channels <@ ARRAY['telegram', 'phone', 'email', 'web']::text[]
        AND (cardinality(issues_for_channels) = 0 OR service_name IS NOT NULL)
    );

COMMENT ON COLUMN principal.issues_for_channels IS
  'The person-facing channels this service principal may issue sessions for (B-42). Empty for every person and, by default, for every service.';

INSERT INTO schema_migrations (version) VALUES ('0022_principal_issuance_channels')
ON CONFLICT (version) DO NOTHING;

COMMIT;
