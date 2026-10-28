-- WASLA CORE — migration 0025: the mini app init_data proof ledger (D-XR-13)
-- Forward only, additive. No table here is owned by MOVE or MARKET.
-- Rollback: db/migrations/0025_mini_app_init_data_proofs.down.sql
--
-- D-XR-13 names multiple sign-in methods producing one CORE session, and the
-- mini app's proof (`init_data`) was the declared open item: a mini app user
-- held no person proof at CORE, so the most destructive act (account deletion)
-- sent them to the web version, and their MARKET identity carried no core
-- generation binding. This migration is the durable half of the answer.
--
-- One table, one decision, atomic by construction:
--
--  `mini_app_init_data_proofs` — the single-use proof ledger. A proof is the
--  `init_data` string Telegram signed with Ed25519 (public-key verification,
--  no bot secret in CORE — Telegram's own third-party validation path). The
--  service verifies the signature and freshness first, then consumes the
--  proof's canonical fingerprint here in one conditional INSERT
--  (`ON CONFLICT DO NOTHING`): the winner is decided where the single row
--  lives. The row is kept forever — it is the audit trail of every consumed
--  proof, not a state to sweep; a swept row would resurrect a replayed proof.

BEGIN;

CREATE TABLE IF NOT EXISTS mini_app_init_data_proofs (
    proof_hash text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mini_app_init_data_proofs IS
    'One row per consumed mini app init_data proof (D-XR-13): the single-use replay guard — a proof''s canonical fingerprint is inserted exactly once, and the row stays as the audit trail.';

-- Row level security, as on every CORE table: no role gets rows by default
-- (`tests/db-schema.test.ts` reads the live catalogue, not a list). The
-- service account's policies are the app's concern; the store is reached only
-- through the MiniAppSignInService, never by a role browsing it.
ALTER TABLE mini_app_init_data_proofs ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations (version) VALUES ('0025_mini_app_init_data_proofs')
ON CONFLICT (version) DO NOTHING;

COMMIT;
