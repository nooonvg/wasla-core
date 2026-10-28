/**
 * `tests/mini-app-sign-in.test.ts` — المسارُ الكاملُ لدخولِ المصغّرِ (D-XR-13).
 *
 * ما يقيسُهُ هذا الملفُ ليسَ التحققَّ الصافيَ بل **التركيبَ على الخلفيتينِ
 * كلتيهما**: الذاكرةَ المرجعيّةَ وPostgreSQL الحقيقيّةَ — نفسُ التوقعاتِ، لأنَّ
 * قرارَ «أوّلِ مستهلِكٍ» ذرّيٌّ لا يُثبَتُ إلا على المحرّكِ نفسِهِ.
 *
 * الدليلُ على القبولِ ليسَ صفًّا وُجدَ بل مصادِقًا قبلَ: الجلسةُ تعملُ على مسارٍ
 * محميٍّ (`GET /v1/sessions/current`) بنفسِ المصادِقِ الذي يحمي كلَّ مسارٍ آخرَ،
 * **وتقبلُها رحلةُ الحذفِ نفسُها** (`POST /v1/me/deletion` · 204) — فهذا هو
 * الغرضُ الأصليُّ منَ الجسرِ: الشخصُ داخلَ تيليجرامَ يملكُ أخيرًا إثباتَ شخصٍ
 * عندَ النواةِ. والرفضُ يُبرَّنُ بالنفيِ المباشرِ: لا جلسةَ تُنشأُ (عدُّ صفوفِ
 * الجلساتِ قبلَ الرفضِ وبعدَهِ) لا مجرَّدَ «401 عادَ».
 *
 * **البصمةُ القانونيّةُ**: الدليلُ الموقَّعُ نفسُهُ بترتيبِ معاملاتٍ مختلفٍ أو
 * ترميزٍ متكافئٍ (حالةُ البتّاتِ الحشوِيّةِ) نصٌّ خامٌّ آخرَ لكنَّهُ الدليلَ نفسَهُ
 * — فاستهلاكُهُ مرةً واحدةً يُبرهنُ أنَّ مفتاحَ منعِ الإعادةِ مشتقٌّ منَ التمثيلِ
 * الذي تحقَّقَ التوقيعُ منهُ لا منَ النصِّ الخامِّ.
 *
 * **الجيلُ بعدَ الحذفِ**: حسابٌ مُقبَرٌ يحرّرُ رابطَ قناتِهِ، فالدليلُ الطازجُ
 * للقناةِ نفسِها يفتحُ هويةً جديدةً لا ميراثَ فيها — وهذا ما يجعلَ الحذفَ ثمّ
 * إعادةَ الفتحِ جيلًا جديدًا في MARKET أيضًا (مفتاحُ الحسمِ CLM-0701).
 */
import { createCoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence, postgresPersistence } from "../src/platform/persistence/backends.js";
import type { Persistence } from "../src/platform/persistence/backends.js";
import { describe, expect, it } from "vitest";
import { freshMiniAppKey, signedMiniAppInitData } from "./support/mini-app-keys.js";

const BOT_ID = "111222333";
const NOW = new Date("2026-10-28T10:00:00Z");
const clock = new FixedClock(NOW);
const AUTH_DATE = Math.floor(NOW.getTime() / 1000) - 60;

/** حقولُ دليلٍ صالحٍ — برمزِ استعلامٍ جديدٍ لكلِّ دليلٍ (كما يفتحُها المصغّرُ فعلًا). */
const fieldsFor = (queryId: string, telegramId: number) => ({
  auth_date: String(AUTH_DATE),
  query_id: queryId,
  user: JSON.stringify({ id: telegramId, first_name: "زبون المصغر" }),
});

interface App {
  readonly core: ReturnType<typeof createCoreApp>;
  readonly store: Persistence;
  countSessions(): Promise<number>;
}

type SqlCounter = { query: (sql: string) => Promise<{ rows: { n: number }[] }> };

interface AppWithKey extends App {
  readonly key: ReturnType<typeof freshMiniAppKey>;
}

async function appOnWithKey(persistence: Persistence, pgPool?: SqlCounter): Promise<AppWithKey> {
  const key = freshMiniAppKey();
  const core = createCoreApp({
    clock,
    persistence,
    miniAppSignIn: { botId: BOT_ID, publicKeys: [key.publicHex] },
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

/** الدخولُ بدليلٍ — نداءُ المسارِ كما يرسلُهُ المصغّرُ. */
function signIn(app: AppWithKey, initData: string) {
  return app.core.router.handle({
    method: "POST",
    url: "/v1/web-session/telegram/init-data",
    body: { init_data: initData },
  });
}

const DATABASE_URL = process.env["DATABASE_URL"];

/** الخلفيّاتُ المتاحةُ: الذاكرةَ دائمًا، وPostgreSQL إن ضُبطَ `DATABASE_URL`. */
async function backends(): Promise<readonly { name: string; make: () => Promise<AppWithKey> }[]> {
  const entries = [{ name: "الذاكرة المرجعية", make: () => appOnWithKey(memoryPersistence(clock)) }];
  if (DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
    entries.push({
      name: "PostgreSQL الحقيقية",
      make: () => appOnWithKey(postgresPersistence(pool as never, clock), pool as never),
    });
  }
  return entries;
}

describe("ترحيلُ 0025 — عكسٌ كاملٌ مُثبَتٌ بالتجربةِ (up → down → up)", () => {
  it.skipIf(!DATABASE_URL)("الجدولُ يختفي ويعود، وسطرُ الترحيلِ معه", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
    const readFile = (await import("node:fs/promises")).readFile;
    const forward = await readFile("db/migrations/0025_mini_app_init_data_proofs.sql", "utf8");
    const rollback = await readFile("db/migrations/0025_mini_app_init_data_proofs.down.sql", "utf8");
    try {
      await pool.query(rollback).catch(() => undefined);
      await pool.query(forward);
      const up = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
         WHERE table_name = 'mini_app_init_data_proofs' AND column_name = 'proof_hash'`,
      );
      expect(Number(up.rows[0]?.n)).toBe(1);
      const journal = await pool.query(
        `SELECT count(*)::int AS n FROM schema_migrations WHERE version = '0025_mini_app_init_data_proofs'`,
      );
      expect(Number(journal.rows[0]?.n)).toBe(1);

      await pool.query(rollback);
      const down = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_name IN ('mini_app_init_data_proofs')`,
      );
      expect(Number(down.rows[0]?.n)).toBe(0);
      const journalGone = await pool.query(
        `SELECT count(*)::int AS n FROM schema_migrations WHERE version = '0025_mini_app_init_data_proofs'`,
      );
      expect(Number(journalGone.rows[0]?.n)).toBe(0);

      await pool.query(forward);
      const restored = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_name = 'mini_app_init_data_proofs'`,
      );
      expect(Number(restored.rows[0]?.n)).toBe(1);
    } finally {
      await pool.query(forward).catch(() => undefined);
      await pool.end();
    }
  });
});

for (const backend of await backends()) {
  describe(`دخولُ المصغّرِ — المسارُ الكاملُ على ${backend.name}`, () => {
    it("دليلٌ صحيحٌ يفتحُ جلسةَ شخصٍ يقبلُها مصادِقُّ المساراتِ نفسُهُ", async () => {
      const app = await backend.make();
      const first = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQfirst", 445566778)),
      );
      expect(first.status).toBe(201);
      const session = first.body as {
        access_token: string;
        identity_created: boolean;
        token_type: string;
        identity_id: string;
      };
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
      expect(principal.identity_id).toBe(session.identity_id);
    });

    it("روابطُ قنواتِ الهويةِ في الجوابِ — نصفُ الطرفِ الموثوقِ في جسرِ السوقِ", async () => {
      // ما يقرأُهُ حدُّ السوقِ حينَ يُبدّلُ جلسةَ الشخصِ بجلسةِ السوقِ: رابطُ
      // القناةِ (`tg-<id>`) هو المفتاحُ الذي يُسوّي بهِ السوقُ مستخدمَهُ، وربطُ
      // الجيلِ (CLM-0701) يقرأُ `identity_id` منَ الجوابِ نفسِهِ.
      const app = await backend.make();
      const first = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQlinks", 445566780)),
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
        identity_id?: string;
        channel_links?: Array<{
          channel_type: string;
          external_id: string;
          verified_at: string | null;
        }>;
      };
      expect(body.identity_id).toBe((first.body as { identity_id: string }).identity_id);
      expect(body.channel_links).toBeDefined();
      const telegram = body.channel_links!.find((link) => link.channel_type === "telegram");
      expect(telegram).toBeDefined();
      expect(telegram!.external_id).toBe("tg-445566780");
      expect(telegram!.verified_at).not.toBeNull();
      // والرمزُ نفسُهُ لا يظهرُ في الجوابِ — روابطُ القنواتِ ليستْ ثغرةَ إفشاءٍ.
      expect(JSON.stringify(body)).not.toContain(session.access_token);
    });

    it("الدليلُ نفسُهُ لا يفتحُ جلسةً ثانيةً — ولا جلسةَ تُنشأُ", async () => {
      const app = await backend.make();
      const initData = signedMiniAppInitData(
        app.key,
        BOT_ID,
        fieldsFor("AAQreplay", 445566779),
      );
      const before = await app.countSessions();
      const first = await signIn(app, initData);
      expect(first.status).toBe(201);
      const replay = await signIn(app, initData);
      expect(replay.status).toBe(401);
      expect(JSON.stringify(replay.body)).toContain("proof_already_used");

      // النفي المباشر: جلسةٌ واحدةٌ لا اثنتانِ — بالعدِّ لا بالجوابِ.
      expect(await app.countSessions()).toBe(before + 1);
    });

    it("تلاعبٌ بالحمولةِ بعدَ التوقيعِ — توقيعٌ لا يطابقُ فلا جلسةَ", async () => {
      const app = await backend.make();
      const before = await app.countSessions();
      const tampered = signedMiniAppInitData(
        app.key,
        BOT_ID,
        fieldsFor("AAQtamper", 445566772),
      ).replace("445566772", "999999999");
      const refused = await signIn(app, tampered);
      expect(refused.status).toBe(401);
      expect(JSON.stringify(refused.body)).toContain("signature_mismatch");
      expect(await app.countSessions()).toBe(before);
    });

    it("دليلٌ منتهيًا أو مستقبليًّا — الحدودُ شاملةٌ لا مقاربةً", async () => {
      const app = await backend.make();
      // الحدُّ شاملٌ: عمرٌ يساوي أقصى العمرِ مقبولٌ.
      const atLimit = { auth_date: String(Math.floor(NOW.getTime() / 1000) - 900) };
      const atLimitAnswer = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, { ...fieldsFor("AAQlimit", 445566782), ...atLimit }),
      );
      expect(atLimitAnswer.status).toBe(201);
      // ثانيةٌ واحدةٌ بعدَ الحدِّ — رفضٌ مسمًّى.
      const expired = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, {
          ...fieldsFor("AAQexpired", 445566783),
          auth_date: String(Math.floor(NOW.getTime() / 1000) - 901),
        }),
      );
      expect(expired.status).toBe(401);
      expect(JSON.stringify(expired.body)).toContain("init_data_expired");
      // سماحُ الانحرافِ للأمامِ شاملٌ كذلك: 60 مقبولةٌ و61 مرفوضةٌ.
      const skewLimit = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, {
          ...fieldsFor("AAQskew", 445566784),
          auth_date: String(Math.floor(NOW.getTime() / 1000) + 60),
        }),
      );
      expect(skewLimit.status).toBe(201);
      const fromFuture = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, {
          ...fieldsFor("AAQfuture", 445566785),
          auth_date: String(Math.floor(NOW.getTime() / 1000) + 61),
        }),
      );
      expect(fromFuture.status).toBe(401);
      expect(JSON.stringify(fromFuture.body)).toContain("init_data_from_future");
    });

    it("بلا حقلِ توقيعٍ — رفضٌ مسمًّى لا تجاهلٌ", async () => {
      const app = await backend.make();
      // دليلٌ بلا `signature` — الحقلُ الذي يتحققُ منهُ مسارُ الطرفِ الثالثِ.
      const fields = fieldsFor("AAQnosig", 445566786);
      const raw = Object.entries(fields)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      const refused = await signIn(app, raw);
      expect(refused.status).toBe(401);
      expect(JSON.stringify(refused.body)).toContain("signature_missing");
    });

    it("حقلٌ مكرَّرٌ (تلوثُ المعاملاتِ) — بنيةٌ مرفوضةٌ صراحةً", async () => {
      const app = await backend.make();
      const fields = fieldsFor("AAQdup", 445566787);
      const signed = signedMiniAppInitData(app.key, BOT_ID, fields);
      // إضافةُ `user` ثانٍ بعدَ التوقيعِ: التوقيعُ سليمٌ على الأولِ — والبنيةُ
      // نفسُها مرفوضةٌ قبلَ أيِّ قراءةٍ، فلا يقرأُ التحققُّ أحدَهما ويقرأُ
      // التطبيقُ الآخرَ.
      const polluted = `${signed}&user=${encodeURIComponent(JSON.stringify({ id: 999999999 }))}`;
      const refused = await signIn(app, polluted);
      expect(refused.status).toBe(401);
      expect(JSON.stringify(refused.body)).toContain("malformed_init_data");
    });

    it("حقلُ hash موجودٌ — طريقُ الطرفِ الأولِ لا يُقرأُ هنا ولا يُبطِلُ الدليلَ", async () => {
      const app = await backend.make();
      const answer = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, {
          ...fieldsFor("AAQhash", 445566788),
          hash: "0".repeat(64),
        }),
      );
      expect(answer.status).toBe(201);
    });

    it("الشخصُ نفسُهُ بدليلٍ جديدٍ — هويةٌ واحدةٌ لا هويتانِ", async () => {
      const app = await backend.make();
      const first = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQone-a", 445566781)),
      );
      expect(first.status).toBe(201);
      const second = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQone-b", 445566781)),
      );
      expect(second.status).toBe(201);
      const firstBody = first.body as { identity_id: string; identity_created: boolean };
      const secondBody = second.body as { identity_id: string; identity_created: boolean };
      expect(secondBody.identity_id).toBe(firstBody.identity_id);
      expect(secondBody.identity_created).toBe(false);
    });

    it("دليلٌ موقَّعٌ لبوتٍ آخرَ — الربطُ بالبوتِ جزءٌ منَ التوقيعِ نفسِهِ", async () => {
      const app = await backend.make();
      const answer = await signIn(
        app,
        signedMiniAppInitData(app.key, "999888777", fieldsFor("AAQotherbot", 445566790)),
      );
      expect(answer.status).toBe(401);
      expect(JSON.stringify(answer.body)).toContain("signature_mismatch");
    });

    it("البصمةُ قانونيّةٌ: ترتيبٌ مختلفٌ وترميزٌ متكافئٌ — دليلٌ واحدٌ لا دليلانِ", async () => {
      const app = await backend.make();
      const fields = fieldsFor("AAQcanonical", 445566791);
      const first = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fields),
      );
      expect(first.status).toBe(201);
      // نفسُ الحقولِ بترتيبِ معاملاتٍ مختلفٍ: نصٌّ خامٌّ آخرَ لكنَّهُ الدليلَ
      // الموقَّعَ نفسَهُ — فالرفضُ يُبرهنُ أنَّ مفتاحَ منعِ الإعادةِ مشتقٌّ منَ
      // التمثيلِ الذي تحقَّقَ التوقيعُ منهُ لا منَ النصِّ الخامِّ.
      const reordered = signedMiniAppInitData(app.key, BOT_ID, fields, encodeURIComponent, [
        "user",
        "query_id",
        "auth_date",
      ]);
      const reorderedAnswer = await signIn(app, reordered);
      expect(reorderedAnswer.status).toBe(401);
      expect(JSON.stringify(reorderedAnswer.body)).toContain("proof_already_used");
      // وترميزٌ متكافئٌ (حالةُ البتّاتِ الحشوِيّةِ في hex): الدليلُ نفسُهُ.
      const caseVariant = signedMiniAppInitData(
        app.key,
        BOT_ID,
        fields,
        (value) => encodeURIComponent(value).replace(/%2c/gi, (m) => m.toLowerCase()),
        ["query_id", "auth_date", "user"],
      );
      const caseAnswer = await signIn(app, caseVariant);
      expect(caseAnswer.status).toBe(401);
      expect(JSON.stringify(caseAnswer.body)).toContain("proof_already_used");
    });

    it("دليلانِ متزامنانِ — فائزٌ واحدٌ بالضبطِ", async () => {
      const app = await backend.make();
      const initData = signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQrace", 445566792));
      const [a, b] = await Promise.all([signIn(app, initData), signIn(app, initData)]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 401]);
      expect(await app.countSessions()).toBe(1);
    });

    it("503 مسمًّى حينَ لا تكوينَ — لا يُختلَقُ مصدرُ جلسةٍ ثانٍ", async () => {
      const persistence = memoryPersistence(clock);
      const core = createCoreApp({ clock, persistence });
      const answer = await core.router.handle({
        method: "POST",
        url: "/v1/web-session/telegram/init-data",
        body: { init_data: "auth_date=1&user=%7B%7D&signature=abc" },
      });
      expect(answer.status).toBe(503);
      expect(JSON.stringify(answer.body)).toContain("mini app sign-in is not configured");
    });
  });
}

for (const backend of await backends()) {
  describe(`دخولُ المصغّرِ — رحلةُ الحذفِ الحاسمةُ (D-XR-13) على ${backend.name}`, () => {
    it("الحذفُ منَ المصغّرِ بجلسةِ الشخصِ ثمّ الجيلُ الجديدُ", async () => {
      const app = await backend.make();
      const telegramId = 445566795;

      // 1) الدخولُ بدليلٍ أولَ: هويةٌ وجلسةُ شخصٍ.
      const first = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQdel-a", telegramId)),
      );
      expect(first.status).toBe(201);
      const firstBody = first.body as { access_token: string; identity_id: string };

      // 2) الحذفُ نفسُهُ بجلسةِ الشخصِ — لا بجلسةِ خدمةٍ: 204 لا رفضَ.
      const deletion = await app.core.router.handle({
        method: "POST",
        url: "/v1/me/deletion",
        headers: { authorization: `Bearer ${firstBody.access_token}` },
      });
      expect(deletion.status).toBe(204);

      // 3) الجلسةُ ماتتْ عندَ النواةِ بفعلِ الحذفِ نفسِهِ — والرمزُ لا يعودُ.
      const afterDeletion = await app.core.router.handle({
        method: "GET",
        url: "/v1/sessions/current",
        headers: { authorization: `Bearer ${firstBody.access_token}` },
      });
      expect(afterDeletion.status).toBe(401);

      // 4) إعادةُ الدليلِ نفسِهِ بعدَ الحذفِ — رفضٌ لا رجوعَ للمسارِ القديمِ.
      const replay = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQdel-a", telegramId)),
      );
      expect(replay.status).toBe(401);
      expect(JSON.stringify(replay.body)).toContain("proof_already_used");

      // 5) دليلٌ طازجٌ للقناةِ نفسِها بعدَ الحذفِ — جيلٌ جديدٌ لا ميراثَ فيهِ:
      // القبرُ حرَّرَ رابطَ القناةِ فتُنشأُ هويةٌ جديدةٌ بمفتاحٍ مختلفٍ.
      const fresh = await signIn(
        app,
        signedMiniAppInitData(app.key, BOT_ID, fieldsFor("AAQdel-b", telegramId)),
      );
      expect(fresh.status).toBe(201);
      const freshBody = fresh.body as { identity_id: string; identity_created: boolean };
      expect(freshBody.identity_created).toBe(true);
      expect(freshBody.identity_id).not.toBe(firstBody.identity_id);
    });
  });
}

