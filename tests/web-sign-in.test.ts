/**
 * `tests/web-sign-in.test.ts` — المسارُ الكاملُ لدخولِ الويبِ (XR-8.5 · B-45).
 *
 * ما يقيسُهُ هذا الملفُ ليسَ التحققَّ الصافيَ (ذاكَ في `web-sign-in-verification`)
 * بل **التركيبَ على الخلفيتينِ كلتيهما**: الذاكرةَ المرجعيّةَ وPostgreSQL الحقيقيّةَ
 * — نفسُ التوقعاتِ، لأنَّ قرارَ «أوّلِ مستهلِكٍ» ذرّيٌّ لا يُثبَتُ إلا على المحرّكِ
 * نفسِهِ، والباقي لا معنى لقبولِهِ على خلفيّةٍ واحدةٍ ورفضِهِ على الأخرى.
 *
 * الدليلُ على القبولِ ليسَ صفًّا وُجدَ بل مصادِقًّا قبلَ: الجلسةُ تعملُ على مسارٍ
 * محميٍّ (`GET /v1/sessions/current`) بنفسِ المصادِقِ الذي يحمي كلَّ مسارٍ آخرَ.
 * والرفضُ يُبرَّنُ بالنفيِ المباشرِ: لا جلسةَ تُنشأُ (عدُّ صفوفِ الجلساتِ قبلَ
 * الرفضِ وبعدَهُ) لا مجرَّدَ «401 عادَ».
 *
 * **ربطُ المحاولةِ بالمتصلِ نفسِهِ (الكوكي)**: الدخولُ يبدأُ بفتحِ محاولةٍ من
 * عندِنا — nonce في الجسمِ **وكوكي `wasla_web_attempt` في رأسِ الجوابِ** —
 * والمتصفّحُ يرفقُ الكوكيَ تلقائيًّا معَ مسارِ الدخولِ. الرمزُ الذي لا يحملُ
 * nonce مفتوحًا، أو يحملُ مستهلَكًا، أو يأتي بلا كوكي المحاولةِ، أو بكوكي
 * متصفّحٍ آخرَ — كلُّها مرفوضةٌ بالاسمِ. هذا هو الفرقُ بينَ «توقيعٌ صحيحٌ»
 * و«محاولةٌ بدأها هذا المتصفّحُ»، وهو ما يُثبِتُهُ اختبارُ المتصفّحينِ اثنينِ:
 * الرمزُ نفسُهُ الصحيحُ التوقيعِ لا يُكمِلُ محاولةَ متصفّحٍ لم يفتحْها.
 *
 * **الشكلُ القياسيُّ للترميزِ**: توقيعٌ واحدٌ بترميزينَ متكافئينَ (حروفٌ تختلفُ في
 * البتّاتِ الحشوِيّةِ) كانَ سيُفتحُ بهِ جلستانِ من دليلٍ واحدٍ — فالرفضُ يُبرهنُ
 * أنَّ العائلةَ كلَّها مُغلقةٌ، لا أنَّ حالةً واحدةً مُغلقةٌ.
 */
import { createCoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence, postgresPersistence } from "../src/platform/persistence/backends.js";
import type { Persistence } from "../src/platform/persistence/backends.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";
import { describe, expect, it } from "vitest";
import {
  freshTelegramKey,
  fixedJwksSource,
  signedTelegramIdToken,
  WEB_SIGN_IN_AT,
} from "./support/web-sign-in-keys.js";

const ISSUER = "https://oauth.telegram.org";
const AUDIENCE = "wasla-web-test";
const NOW = new Date(WEB_SIGN_IN_AT);
const clock = new FixedClock(NOW);

/** حمولةُ رمزٍ صالحةٍ — برمزِ محاولةٍ يفتحُهُ الاختبارُ أولًا. */
const claimsFor = (sub: string, nonce: string) => ({
  iss: ISSUER,
  aud: AUDIENCE,
  sub,
  exp: Math.floor(NOW.getTime() / 1000) + 3600,
  iat: Math.floor(NOW.getTime() / 1000) - 60,
  nonce,
  name: "زبون الويب",
});

interface App {
  core: ReturnType<typeof createCoreApp>;
  key: ReturnType<typeof freshTelegramKey>;
  store: Persistence;
  /** على الذاكرةِ: عدُّ صفوفِ الجلساتِ من التعدادِ المرجعيِّ. على القاعدةِ: SQL مباشرٌ. */
  countSessions: () => Promise<number>;
}

type SqlCounter = { query: (sql: string) => Promise<{ rows: { n: number }[] }> };

async function appOn(persistence: Persistence, pgPool?: SqlCounter): Promise<App> {
  const key = freshTelegramKey();
  const core = createCoreApp({
    clock,
    persistence,
    webSignIn: { issuer: ISSUER, audience: AUDIENCE, jwks: fixedJwksSource(key.jwks) },
  });
  return {
    core,
    key,
    store: persistence,
    countSessions: async () => {
      if (pgPool !== undefined) {
        const result = await pgPool.query("SELECT count(*)::int AS n FROM session");
        return Number(result.rows[0]?.n ?? 0);
      }
      return persistence.referenceKeys?.census().get("session") ?? 0;
    },
  };
}

/** محاولةٌ كما يفتحُها المتصفّحُ فعلًا: nonce من الجسمِ وكوكي المحاولةِ من رأسِ الجوابِ. */
interface Attempt {
  readonly nonce: string;
  readonly attempt: string;
}

async function openAttempt(app: App): Promise<Attempt> {
  const answer = await app.core.router.handle({
    method: "POST",
    url: "/v1/web-session/telegram/nonce",
    body: {},
  });
  if (answer.status !== 201) throw new Error(`nonce refused: ${JSON.stringify(answer.body)}`);
  const setCookie = answer.headers?.["set-cookie"];
  if (setCookie === undefined) throw new Error("no attempt cookie set");
  const match = /^wasla_web_attempt=([^;]+);/.exec(setCookie);
  if (match === null) throw new Error(`unexpected cookie shape: ${setCookie}`);
  return {
    nonce: (answer.body as { nonce: string }).nonce,
    attempt: match[1]!,
  };
}

async function login(app: App, token: string, attempt?: string, extraCookie?: string) {
  const attemptCookie = attempt === undefined ? "" : `wasla_web_attempt=${attempt}`;
  const cookie = [attemptCookie, extraCookie].filter(Boolean).join("; ");
  return app.core.router.handle({
    method: "POST",
    url: "/v1/web-session/telegram",
    body: { id_token: token },
    headers: cookie === "" ? undefined : { cookie },
  });
}

const DATABASE_URL = process.env["DATABASE_URL"];

/** الخلفيّاتُ المتاحةُ: الذاكرةَ دائمًا، وPostgreSQL إن ضُبطَ `DATABASE_URL`. */
async function backends(): Promise<readonly { name: string; make: () => Promise<App> }[]> {
  const entries = [{ name: "الذاكرة المرجعية", make: () => appOn(memoryPersistence(clock)) }];
  if (DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
    entries.push({
      name: "PostgreSQL الحقيقية",
      make: () => appOn(postgresPersistence(pool as never, clock), pool as never),
    });
  }
  return entries;
}


describe("ترحيلُ 0023 — عكسٌ كاملٌ مُثبَتٌ بالتجربةِ (up → down → up)", () => {
  it.skipIf(!DATABASE_URL)("الجدولُ يختفي ويعود، وسطرُ الترحيلِ معه", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
    const readFile = (await import("node:fs/promises")).readFile;
    const forward = await readFile("db/migrations/0023_web_sign_in_nonces.sql", "utf8");
    const rollback = await readFile("db/migrations/0023_web_sign_in_nonces.down.sql", "utf8");
    try {
      // التراجعُ أولًا إن كانَ الترحيلُ مطبَّقًا (القاعدةُ المشتركةُ قد سبقَتْهُ).
      await pool.query(rollback).catch(() => undefined);
      await pool.query(forward);
      const up = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
         WHERE table_name = 'web_sign_in_nonces' AND column_name = 'attempt_hash'`,
      );
      expect(Number(up.rows[0]?.n)).toBe(1);
      const journal = await pool.query(
        `SELECT count(*)::int AS n FROM schema_migrations WHERE version = '0023_web_sign_in_nonces'`,
      );
      expect(Number(journal.rows[0]?.n)).toBe(1);

      // العكسُ الكاملُ: الجدولانِ وسطرُ الترحيلِ يختفونَ معًا.
      await pool.query(rollback);
      const down = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_name IN ('web_sign_in_nonces')`,
      );
      expect(Number(down.rows[0]?.n)).toBe(0);
      const journalGone = await pool.query(
        `SELECT count(*)::int AS n FROM schema_migrations WHERE version = '0023_web_sign_in_nonces'`,
      );
      expect(Number(journalGone.rows[0]?.n)).toBe(0);

      // ثمّ العودةُ: up مرتينِ — أولاهما تأسيسٌ والثانيةُ عدمٌ (ON CONFLICT).
      await pool.query(forward);
      const restored = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_name = 'web_sign_in_nonces'`,
      );
      expect(Number(restored.rows[0]?.n)).toBe(1);
    } finally {
      // إعادةُ الحالةِ التي كانَ عليها الترخيصُ المشتركُ: الترحيلُ مطبَّقٌ.
      await pool.query(forward).catch(() => undefined);
      await pool.end();
    }
  });
});

for (const backend of await backends()) {
  describe(`دخولُ الويبِ — المسارُ الكاملُ على ${backend.name}`, () => {
    it("رمزٌ صحيحٌ بمحاولتِهِ يفتحُ جلسةً يقبلُها مصادِقُّ المساراتِ نفسُهُ", async () => {
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);
      const first = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566778", nonce)),
        attempt,
      );
      expect(first.status).toBe(201);
      const session = first.body as { access_token: string; identity_created: boolean; token_type: string };
      expect(session.token_type).toBe("Bearer");
      expect(session.identity_created).toBe(true);

      // القبولُ الحقيقيُّ: الجلسةُ تعملُ على مسارٍ محميٍّ بذاتِ المصادِقِ.
      const current = await app.core.router.handle({
        method: "GET",
        url: "/v1/sessions/current",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      expect(current.status).toBe(200);
      const principal = current.body as { identity_id?: string };
      expect(principal.identity_id).toBe((first.body as { identity_id: string }).identity_id);
    });

    it("روابطُ قنواتِ الهويةِ في الجوابِ — نصفُ الطرفِ الموثوقِ في XR-6.1", async () => {
      // ما يقرأُهُ حدُّ السوقِ حينَ يُبدّلُ جلسةَ الويبِ بجلسةِ السوقِ: رابطُ
      // القناةِ (`tg-<sub>`) هو المفتاحُ الذي يُسوّي بهِ السوقُ مستخدمَهُ —
      // فوجودُهُ في `GET /v1/sessions/current` هو عقدُ التبادلِ بينَ النواةِ
      // والحدّ. بياناتُ المتصلِ نفسِهِ على مصادِقِ المتصلِ نفسِهِ: لا يُنشرُ
      // هنا ما لم يقرأهُ المصادِقُ أصلًا ليُجيبَ.
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);
      const first = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566780", nonce)),
        attempt,
      );
      expect(first.status).toBe(201);
      const session = first.body as { access_token: string };
      const current = await app.core.router.handle({
        method: "GET",
        url: "/v1/sessions/current",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      expect(current.status).toBe(200);
      const body = current.body as {
        channel_links?: Array<{ channel_type: string; external_id: string; verified_at: string | null }>;
      };
      expect(body.channel_links).toBeDefined();
      const telegram = body.channel_links!.find((link) => link.channel_type === "telegram");
      expect(telegram).toBeDefined();
      expect(telegram!.external_id).toBe("tg-445566780");
      // والرمزُ نفسُهُ لا يظهرُ في الجوابِ — روابطُ القنواتِ ليستْ ثغرةَ إفشاءٍ جديدة.
      expect(JSON.stringify(body)).not.toContain(session.access_token);
    });

    it("الرمزُ نفسُهُ لا يفتحُ جلسةً ثانيةً — ولا جلسةَ تُنشأُ", async () => {
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);
      const token = signedTelegramIdToken(app.key, claimsFor("445566779", nonce));
      const before = await app.countSessions();
      const first = await login(app, token, attempt);
      expect(first.status).toBe(201);
      const replay = await login(app, token, attempt);
      expect(replay.status).toBe(401);
      // إعادةُ الطلبِ الحرفيِّ نفسِهِ: المحاولةُ استُهلكَت في الإتمامِ الأولِ —
      // الرفضُ المسمّى هو `nonce_unknown` (هذهِ المحاولةُ ليستْ مفتوحةً الآنَ)،
      // والجوابُ الثاني لا يُفتحُ بهِ جلستانِ.
      expect(JSON.stringify(replay.body)).toContain("nonce_unknown");

      // والرمزُ المسروقُ تحتَ محاولةٍ جديدةٍ: nonce الرمزِ مربوطٌ بمحاولةِ
      // المالكِ المستهلَكةِ — فمهما فتحَ السارقُ محاولتَهُ الخاصّةَ، الرفضُ
      // المسمّى واحدٌ: `nonce_unknown`. هذا هوَ ما يجعلُ سجلَّ رموزٍ منفصلًا
      // رمزًا ميتًا: مطالبةُ nonce داخلَ الرمزِ تُثبِتُهُ لمحاولةٍ واحدةٍ
      // تُطلِقُ مرةً واحدةً — ولذلكَ أُزيلَ لا أُبقِيَ.
      const thief = await openAttempt(app);
      const stolen = await login(app, token, thief.attempt);
      expect(stolen.status).toBe(401);
      expect(JSON.stringify(stolen.body)).toContain("nonce_unknown");

      // النفي المباشر: جلسةٌ واحدةٌ لا اثنتانِ — بالعدِّ لا بالجوابِ.
      expect(await app.countSessions()).toBe(before + 1);
    });

    it("الشخصُ نفسُهُ برمزٍ جديدٍ — هويةٌ واحدةٌ لا هويتانِ", async () => {
      const app = await backend.make();
      const first = await openAttempt(app);
      const firstLogin = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566781", first.nonce)),
        first.attempt,
      );
      expect(firstLogin.status).toBe(201);
      // رمزٌ ثانٍ كاملُ الصلاحيّةِ للشخصِ نفسِهِ — وليسَ إعادةَ تشغيلٍ: الموقّعُ
      // حتميٌّ، فاختلافُ `iat` ثانيةً يجعلُهُ رمزًا جديدًا فعلًا.
      const second = await openAttempt(app);
      const secondLogin = await login(
        app,
        signedTelegramIdToken(app.key, {
          ...claimsFor("445566781", second.nonce),
          iat: Math.floor(NOW.getTime() / 1000) - 59,
        }),
        second.attempt,
      );
      expect(secondLogin.status).toBe(201);
      const firstBody = firstLogin.body as { identity_id: string; identity_created: boolean };
      const secondBody = secondLogin.body as { identity_id: string; identity_created: boolean };
      expect(secondBody.identity_id).toBe(firstBody.identity_id);
      expect(secondBody.identity_created).toBe(false);
    });

    it("رابطُ الهويةِ القائمُ يُحَلُّ لا يُنشأُ: من دخلَ قبلُ هو هو", async () => {
      const app = await backend.make();
      // هويةٌ قائمةٌ عبرَ القناةِ نفسِها ومساحةِ المعرفاتِ نفسِها — كما يتركها
      // أيُّ مسارٍ سابقٍ في CORE: من دخلَ قبلُ لا يُنشأُ لهُ ثانٍ.
      const existing = await app.core.identity.registerIdentity({
        channel_type: "telegram",
        external_id: "tg-445566783",
        correlation_id: "pre-existing-identity",
      });
      const attempt = await openAttempt(app);
      const loginAnswer = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566783", attempt.nonce)),
        attempt.attempt,
      );
      expect(loginAnswer.status).toBe(201);
      const session = loginAnswer.body as { identity_id: string; identity_created: boolean };
      expect(session.identity_id).toBe(existing.identity.identity_id);
      expect(session.identity_created).toBe(false);
    });

    it("هويةٌ موقوفةٌ لا تُمنحُ جلسةً ولو كانَ الرمزُ صحيحًا", async () => {
      const app = await backend.make();
      const attempt = await openAttempt(app);
      const registered = await app.core.identity.registerIdentity({
        channel_type: "telegram",
        external_id: "tg-445566784",
        correlation_id: "to-be-suspended",
      });
      // الوقفُ عبرَ المستودعِ نفسِهِ (لا مسارَ HTTP للوقفِ — قرارٌ إداريٌّ ليسَ
      // من هذه الدورةِ)، والهويةُ تعادُ بحالةِ suspended.
      await app.store.identity.updateIdentity(
        { ...registered.identity, status: "suspended" },
        NO_SCOPE,
      );
      const before = await app.countSessions();
      const refused = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566784", attempt.nonce)),
        attempt.attempt,
      );
      expect(refused.status).toBe(403);
      // النفي المباشر: لا جلسةَ إطلاقًا.
      expect(await app.countSessions()).toBe(before);
    });

    it("متصفّحانِ ومحاولةٌ واحدةٌ: من لم يفتحِ المحاولةَ لا يُكملُها", async () => {
      const app = await backend.make();
      // المتصفّحُ «أ» يفتحُ المحاولةَ؛ المتصفّحُ «ب» يحصلُ على الرمزِ somehow
      // (صيدٌ، تسريبٌ) ويحاولُ إكمالَها بكوكِهِ هو — لا بمحاولةِ «أ».
      const a = await openAttempt(app);
      const b = await openAttempt(app);
      const token = signedTelegramIdToken(app.key, claimsFor("445566790", a.nonce));
      const before = await app.countSessions();

      // «ب» يقدّمُ الرمزَ بكوكِهِ: nonce «أ» مفتوحٌ لكنَّ المحاولةَ ليستْ لهُ.
      const byB = await login(app, token, b.attempt);
      expect(byB.status).toBe(401);
      expect(JSON.stringify(byB.body)).toContain("nonce_unknown");

      // ولا كوكيَ أصلًا: الدخولُ بلا محاولةٍ فتحَها هذا المتصلُّ ليسَ دخولًا.
      const bare = await login(app, token);
      expect(bare.status).toBe(401);
      expect(JSON.stringify(bare.body)).toContain("attempt_missing");

      // النفي المباشر: لا شيءَ خُلِقَ من الرفضينِ.
      expect(await app.countSessions()).toBe(before);

      // ثمّ «أ» نفسُهُ يُكملُ محاولتَهُ بالرمزِ نفسِهِ — فائزٌ واحدٌ.
      const byA = await login(app, token, a.attempt);
      expect(byA.status).toBe(201);
      expect(await app.countSessions()).toBe(before + 1);
    });

    it("كوكيّاتُ المتصفّحِ الأخرى لا تُرفَضُ ولا تُقرأ — والالتباسُ غيابٌ", async () => {
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);

      // كوكيّاتٌ بأسماءٍ حقيقيّةٍ يرسلُها أيُّ متصفّحٍ بحقٍّ — نقطةٌ وتيلةٌ
      // وزائدٌ — تُتجاوَز ولا تُرفَضُ الطلباتُ التي تحملُها، والدخولُ يستمرُّ.
      // والسلةُ كلُّها فوقَ 512 محرفًا (ضمنَ حدِّ النقلِ) — فالحدُّ للنقلِ
      // لا لشكلِ الأسماءِ.
      const bigBasket = `session.id=${"x".repeat(200)}; theme+mode=dark; a~b=1`;
      const withOthers = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566791", nonce)),
        attempt,
        bigBasket,
      );
      expect(withOthers.status).toBe(201);

      // ومسارٌ قائمٌ لا علاقةَ لهُ بالدخولِ يحملُها أيضًا — لا يُرفَضُ بها.
      const listed = await app.core.router.handle({
        method: "GET",
        url: "/v1/sessions/current",
        headers: {
          authorization: `Bearer ${(withOthers.body as { access_token: string }).access_token}`,
          cookie: "session.id=abc123; __Host-preferences=dark",
        },
      });
      expect(listed.status).toBe(200);

      // وتكرارُ اسمِ كوكي المحاولةِ التباسٌ: القرارُ أنَّها غائبةٌ.
      const dup = await openAttempt(app);
      const ambiguous = await app.core.router.handle({
        method: "POST",
        url: "/v1/web-session/telegram",
        body: {
          id_token: signedTelegramIdToken(app.key, claimsFor("445566792", dup.nonce)),
        },
        headers: { cookie: `wasla_web_attempt=${dup.attempt}; wasla_web_attempt=${dup.attempt}` },
      });
      expect(ambiguous.status).toBe(401);
      expect(JSON.stringify(ambiguous.body)).toContain("attempt_missing");
    });

    it("nonce واحدةٌ لمحاولةٍ واحدةٍ: الرمزُ الثاني بنفسِها مرفوضٌ", async () => {
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);
      const first = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566785", nonce)),
        attempt,
      );
      expect(first.status).toBe(201);
      // رمزٌ جديدٌ كاملُ الصلاحيّةِ لكنَّهُ يحملُ nonce المحاولةِ الأولى — محاولةٌ
      // استُهلكَتْ من هذا المتصفّحِ بالفعلِ.
      const second = await login(
        app,
        signedTelegramIdToken(app.key, {
          ...claimsFor("445566785", nonce),
          iat: Math.floor(NOW.getTime() / 1000) - 59,
        }),
        attempt,
      );
      expect(second.status).toBe(401);
      expect(JSON.stringify(second.body)).toContain("nonce_unknown");
    });

    it("رمزٌ بـnonce لم نصدرهُ — توقيعٌ صحيحٌ ومحاولةٌ ليستْ من عندِنا", async () => {
      const app = await backend.make();
      const { attempt } = await openAttempt(app);
      const refused = await login(
        app,
        signedTelegramIdToken(app.key, claimsFor("445566786", "an-attacker-crafted-nonce")),
        attempt,
      );
      expect(refused.status).toBe(401);
      expect(JSON.stringify(refused.body)).toContain("nonce_unknown");
    });

    it("توقيعٌ واحدٌ بترميزٍ متكافئٍ لا يفتحُ جلسةً ثانيةً — الشكلُ القياسيُّ شرطٌ", async () => {
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);
      const token = signedTelegramIdToken(app.key, claimsFor("445566787", nonce));
      const first = await login(app, token, attempt);
      expect(first.status).toBe(201);
      // آخرُ محرفٍ في base64url يشفِّرُ بتّاتٍ حشوَيّةً فقط: تبديلُهُ بمحرفٍ
      // يفكُّ إلى البايتاتِ نفسِها يعطي رمزًا «مختلفًا» بتوقيعٍ واحدٍ — البوابةُ
      // القياسيّةُ تُغلقُ العائلةَ كلَّها، وهذا برهانُها.
      const [h, p, s] = token.split(".");
      if (h === undefined || p === undefined || s === undefined) throw new Error("not a token");
      // محارفُ base64url الستةَ والستّينَ مرتبةٌ بقيمةٍ صاعدةٍ، والمحارفُ الأربعةُ
      // التي تشتركُ في أعلى بتّينِها تفكُّ إلى البايتاتِ نفسِها حينَ يكونُ آخرُ
      // المحرفِ على حدِّ بتّينِ (توقيعُ 2048 بتّ). زميلٌ من نفسِ المجموعةِ: رمزٌ
      // يفكُّ إلى التوقيعِ نفسِهِ حرفيًّا ويختلفُ في النصِّ — وهو ما لا يُقبلُ.
      const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const lastChar = s[s.length - 1]!;
      const value = ALPHABET.indexOf(lastChar);
      expect(value).toBeGreaterThanOrEqual(0);
      const groupStart = value - (value % 4);
      const equivalent = ALPHABET[(groupStart + ((value + 1) % 4)) % 64];
      const variant = `${h}.${p}.${s.slice(0, -1)}${equivalent}`;
      const replay = await login(app, variant, attempt);
      expect(replay.status).toBe(401);
      expect(JSON.stringify(replay.body)).toContain("malformed_token");
    });

    it("محاولتانِ متزامنتانِ برمزٍ واحدٍ — فائزٌ واحدٌ بالضبطِ", async () => {
      const app = await backend.make();
      const { nonce, attempt } = await openAttempt(app);
      const token = signedTelegramIdToken(app.key, claimsFor("445566788", nonce));
      const [a, b] = await Promise.all([
        login(app, token, attempt),
        login(app, token, attempt),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 401]);
    });

    it("رمزٌ منتهيًا أو مُزيَّفًا — لا جلسةَ تُنشأُ", async () => {
      const app = await backend.make();
      const before = await app.countSessions();
      const expiredAttempt = await openAttempt(app);
      const expired = await login(
        app,
        signedTelegramIdToken(app.key, {
          ...claimsFor("445566782", expiredAttempt.nonce),
          exp: Math.floor(NOW.getTime() / 1000) - 1,
        }),
        expiredAttempt.attempt,
      );
      expect(expired.status).toBe(401);
      expect(JSON.stringify(expired.body)).toContain("expired");

      const forgedAttempt = await openAttempt(app);
      const [h, p, s] = signedTelegramIdToken(
        app.key,
        claimsFor("445566789", forgedAttempt.nonce),
      ).split(".");
      if (h === undefined || p === undefined || s === undefined) throw new Error("not a token");
      const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
      decoded.sub = "999";
      const forged = `${h}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${s}`;
      const tampered = await login(app, forged, forgedAttempt.attempt);
      expect(tampered.status).toBe(401);
      expect(JSON.stringify(tampered.body)).toContain("signature_mismatch");

      // النفي المباشر: لا شيءَ خُلقَ من الرفضَينِ.
      expect(await app.countSessions()).toBe(before);
    });
  });
}

describe("بيئةٌ بلا محوّلٍ مُهيَّأٍ ترفضُ بالاسمِ لا بصمتٍ", () => {
  it("503 مسمًّى حينَ لا تكوينَ — وغيابُ الكوكي لا يُغَطّيهِ: التهيئةُ أولًا", async () => {
    const core = createCoreApp({ clock });
    // لا كوكيَ ولا تكوينَ: الطلبُ يصلُ المعالِجَ فيجيبُ 503 قبلَ أيِّ كلامٍ
    // عن المحاولةِ — عيبُ التهيئةِ عيبُ النشرِ لا عيبَ المتصفّحِ.
    const refused = await core.router.handle({
      method: "POST",
      url: "/v1/web-session/telegram",
      body: { id_token: "anything" },
    });
    expect(refused.status).toBe(503);
    expect(JSON.stringify(refused.body)).toContain("not configured");

    const nonceRefused = await core.router.handle({
      method: "POST",
      url: "/v1/web-session/telegram/nonce",
      body: {},
    });
    expect(nonceRefused.status).toBe(503);
  });

  it("ورأسٌ يرفضُهُ فحصُ الرؤوسِ العامُّ يُجابُ 400 قبلَ فحصِ التهيئةِ", async () => {
    const core = createCoreApp({ clock });
    // سلةُ كوكيّاتٍ فوقَ حدِّ النقلِ المعلَنِ: طبقةُ الرؤوسِ ترفضُها قبلَ
    // أن يُفتحَ المعالِجُ أصلًا — 400 لا 503، لأنَّ العيبَ في الطلبِ.
    const oversized = await core.router.handle({
      method: "POST",
      url: "/v1/web-session/telegram",
      body: { id_token: "anything" },
      headers: { cookie: `wasla_web_attempt=${"x".repeat(5000)}` },
    });
    expect(oversized.status).toBe(400);
  });
});
