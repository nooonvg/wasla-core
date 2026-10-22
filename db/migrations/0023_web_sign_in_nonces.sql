-- WASLA CORE — migration 0023: the web sign-in nonce store (XR-8.5 · B-45)
-- Forward only, additive. No table here is owned by MOVE or MARKET.
-- Rollback: db/migrations/0023_web_sign_in_nonces.down.sql
--
-- B-45, measured on `main` before a line of this was written: CORE had no
-- sign-in adapter that verifies a channel's own proof before `session.issue`.
-- The web login path (customer app in a plain browser — XR-8.3's remainder)
-- had no credential at all: `browserHost.sessionCredential()` returns null and
--  the file says so. This migration is the durable half of the answer.
--
-- One table, one decision, atomic by construction:
--
--  `web_sign_in_nonces` — the browser binding (Telegram's widget docs publish
--  the `nonce` parameter: "Server-generated random string to be included in
--  the resulting id_token to prevent replay attacks"). A login begins when the
--  browser asks CORE for a nonce, not when a token falls out of the sky; the
--  token's nonce claim is what proves *this attempt* was started by *this
--  browser*. The nonce is server-generated, stored hashed, single-use and
--  bound to the attempt cookie — so a token replayed under any other attempt,
--  or replayed under its own consumed attempt, is refused with a name. This
--  subsumes a separate token ledger: the token's nonce claim pins it to one
--  attempt, which fires exactly once — a second table recording the same
--  single-use decision would be unreachable code with a second schema to gate.
--  The consume is one conditional UPDATE — `consumed_at IS NULL AND
--  expires_at > now()` — so the winner is decided where the single row lives.

BEGIN;

CREATE TABLE IF NOT EXISTS web_sign_in_nonces (
    nonce_hash text PRIMARY KEY,
    -- ربطُ المحاولةِ بالمتصلِ نفسِه: كوكي HttpOnly يفتحُهُ مسارُ الـnonce، فلا
    -- يستطيعُ متصلٌ آخرَ أن يُكملَ محاولةً لم يبدأها. يُخزَّنُ مهشَّرًا كما
    -- الـnonce نفسِه.
    attempt_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz
);

COMMENT ON TABLE web_sign_in_nonces IS
    'One row per issued web sign-in nonce (XR-8.5): the browser binding — a login token must carry the nonce this browser asked for, unconsumed and unexpired.';

-- Row level security, as on every CORE table: no role gets rows by default
-- (`tests/db-schema.test.ts` reads the live catalogue, not a list). The
-- service account's policies are the app's concern; both stores are reached
-- only through the WebSignInService, never by a role browsing them.
ALTER TABLE web_sign_in_nonces ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migrations (version) VALUES ('0023_web_sign_in_nonces')
ON CONFLICT (version) DO NOTHING;

COMMIT;
