import { createServer } from "node:http";
import { createCoreApp, type TelegramMiniAppVerificationConfig, type TelegramWebSignInOptions } from "./app.js";
import type { Pool } from "pg";
import { TELEGRAM_ED25519_PUBLIC_KEYS } from "./modules/web-session/init-data.js";
import { postgresPersistence } from "./platform/persistence/backends.js";
import { systemClock } from "./platform/clock.js";
import { CachedJwksSource, HttpJwksFetcher } from "./modules/web-session/jwks.js";

/**
 * Process entry point. Configuration comes only from the environment — no
 * credential or endpoint is ever hardcoded or committed.
 */
const port = Number(process.env["PORT"] ?? 8080);

// Persistence. In-memory is the default of last resort, kept for a process that
// has no database to talk to; when the environment names one, the process runs
// on it — every durable decision in CORE (identity, sessions, the outbox, the
// web sign-in ledgers) reads and writes through that database. The migrations
// are a separate step (`scripts/db-migrate.mjs up`) and are NOT applied here:
// a server that cannot reach its tables says so loudly rather than silently
// writing to memory.
const databaseUrl = process.env["DATABASE_URL"];
// `pg` loads only when a database is named: a process with no database never
// loads the driver at all, and the import cannot run unconditionally.
const pool: Pool | undefined = databaseUrl
  ? new (await import("pg")).Pool({ connectionString: databaseUrl, max: 8 })
  : undefined;

// Web sign-in (XR-8.5): configured only when the environment names the client
// AND the process runs on a database — the nonce and token ledgers are durable
// decisions, and a login surface whose replay guard resets on restart is not a
// login surface. Absent means the route answers `503` by name, never a silent
// fallback that would invent a second source of sessions. The keys are public
// (JWKS); no secret reaches CORE for this path.
const webSignIn = pool === undefined ? null : webSignInFromEnvironment(process.env);
// Mini app sign-in (D-XR-13), same rule as web sign-in: the proof ledger must
// be durable — a replay guard that resets on restart is not a login surface —
// so the flow is only wired when the process owns the database. Verification
// is Ed25519 against Telegram's published public keys; the only configured
// value is the mini app bot's *id* (public), never a bot secret.
const miniAppSignIn = pool === undefined ? null : miniAppSignInFromEnvironment(process.env);

const app = createCoreApp({
  ...(pool === undefined ? {} : { persistence: postgresPersistence(pool, systemClock) }),
  ...(webSignIn === null ? {} : { webSignIn }),
  ...(miniAppSignIn === null ? {} : { miniAppSignIn }),
});

const server = createServer(app.router.nodeListener());

// Outbox relay. In production this runs as a separate process against the same
// database; here it shares the process while persistence is in-memory.
const relayIntervalMs = Number(process.env["OUTBOX_RELAY_INTERVAL_MS"] ?? 1000);
const relay = setInterval(() => {
  void app.publisher.drainOnce().catch((err) => {
    console.error(JSON.stringify({ level: "error", component: "outbox-relay", message: String(err) }));
  });
}, relayIntervalMs);

// Inbound dispatcher and webhook delivery worker (XR-4.3). Without these two
// loops an event accepted by `POST /v1/events` is recorded and never handed to
// its consumer (fulfillment never sees `market.order.created`), and a
// subscription is registered and never called. Measured on main at 99f4336:
// `server.ts` ran only the outbox relay, so the live journey stopped at
// ingress. Each loop drains one batch per tick and logs, never throws.
const dispatchIntervalMs = Number(process.env["INBOUND_DISPATCH_INTERVAL_MS"] ?? 1000);
const dispatchTimer = setInterval(() => {
  void app.dispatcher.drainOnce().catch((err) => {
    console.error(JSON.stringify({ level: "error", component: "inbound-dispatcher", message: String(err) }));
  });
}, dispatchIntervalMs);
const deliveryIntervalMs = Number(process.env["EVENT_DELIVERY_INTERVAL_MS"] ?? 1000);
const deliveryTimer = setInterval(() => {
  void app.deliveries.drainOnce().catch((err) => {
    console.error(JSON.stringify({ level: "error", component: "event-delivery", message: String(err) }));
  });
}, deliveryIntervalMs);

// Depth sampler — runs on a fixed interval so the metrics exposition is
// populated before any scrape, not read at scrape time. See DepthSampler.
const sampleIntervalMs = Number(process.env["SAMPLE_INTERVAL_MS"] ?? 15000);
const sampleTimer = setInterval(() => {
  void app.depthSampler.sample().catch((err) => {
    console.error(JSON.stringify({ level: "error", component: "depth-sampler", message: String(err) }));
  });
}, sampleIntervalMs);

// Run once immediately so the first scrape has data.
void app.depthSampler.sample().catch(() => {});

server.listen(port, () => {
  console.log(JSON.stringify({ level: "info", component: "http", message: `listening on ${port}` }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", component: "http", message: `shutting down (${signal})` }));
  clearInterval(relay);
  clearInterval(dispatchTimer);
  clearInterval(deliveryTimer);
  clearInterval(sampleTimer);
  server.close(() => {
    if (pool === undefined) {
      process.exit(0);
      return;
    }
    void pool.end().then(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));


/**
 * Telegram OIDC web sign-in from the environment, or `null` when the
 * environment did not configure one. Fail closed: an absent audience is a
 * deployment decision, not a default.
 */
function webSignInFromEnvironment(
  env: NodeJS.ProcessEnv,
): TelegramWebSignInOptions | null {
  const audience = env["TELEGRAM_OIDC_AUDIENCE"];
  if (audience === undefined || audience === "") return null;
  const issuer = env["TELEGRAM_OIDC_ISSUER"] ?? "https://oauth.telegram.org";
  const jwksUrl = env["TELEGRAM_OIDC_JWKS_URL"] ?? `${issuer}/.well-known/jwks.json`;
  return {
    issuer,
    audience,
    jwks: new CachedJwksSource(new HttpJwksFetcher(jwksUrl)),
  };
/**
 * قراءةُ دخولِ المصغّرِ منَ البيئةِ — قيمةٌ واحدةٌ علنيّةٌ لا سرَّ فيها:
 * معرّفُ البوتِ صاحبِ المصغّرِ (`TELEGRAM_MINI_APP_BOT_ID` · أرقامٌ فقط)،
 * ومفاتيحُ Ed25519 العلنيّةُ اختياريّةٌ (`TELEGRAM_ED25519_PUBLIC_KEYS` · hex
 * مفصولةٌ بفواصلَ) إن أرادَ المشغِّلُ مفتاحًا جديدًا قبلَ تحديثِ المنشورِ
 * الافتراضيِّ. لا يُبنى المسارُ بلا معرّفِ البوتِ: الدليلُ مربوطٌ بتوقيعِهِ
 * إليهِ، فغيابُهُ غيابُ التحققِّ كلِّهِ — لا مصدرُ جلسةٍ ثانٍ يُختلَقُ.
 */

}

function miniAppSignInFromEnvironment(
  env: Record<string, string | undefined>,
): TelegramMiniAppVerificationConfig | null {
  const botId = env["TELEGRAM_MINI_APP_BOT_ID"];
  if (botId === undefined || !/^\d+$/.test(botId)) return null;
  const rawKeys = env["TELEGRAM_ED25519_PUBLIC_KEYS"];
  const publicKeys = rawKeys
    ? rawKeys.split(",").map((k) => k.trim()).filter((k) => k.length > 0)
    : [TELEGRAM_ED25519_PUBLIC_KEYS.production, TELEGRAM_ED25519_PUBLIC_KEYS.test];
  return { botId, publicKeys };
}
