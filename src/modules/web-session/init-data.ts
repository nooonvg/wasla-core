/**
 * `modules/web-session/init-data.ts` — التحققُّ من `init_data` للمصغّرِ (D-XR-13).
 *
 * هذا محوِّلُ دخولِ المصغّرِ داخلَ تيليجرامَ: الدليلُ الذي يوقّعهُ تيليجرامُ
 * نفسُهُ (`signature` بصيغةِ Ed25519) يُتحقَّقُ منهُ هنا ضدَّ المفاتيحِ العلنيّةِ
 * المنشورةِ — **بلا سرِّ بوتٍ في الخادمِ إطلاقًا**. مسارُ الطرفِ الثالثِ في
 * توثيقِ تيليجرامِ (WebApps · «Validating data for third-party use») هو عينُ
 * ما تحتاجهُ النواةُ هنا: طرفٌ ثالثٌ لا يملكُ سرَّ البوتِ لكنَّهُ يملكُ معرّفَهُ.
 *
 * دوالٌّ صافيةٌ كلُّها: لا قاعدةَ بياناتِ ولا شبكةَ — الزمنُ والمفاتيحُ ومعرّفُ
 * البوتِ تُمرَّرُ صراحةً، فتُختبرُ الحدودُ كلُّها بلا محاكاةِ ساعةٍ.
 */

import { createHash, createPublicKey, verify as ed25519Verify, type KeyObject } from "node:crypto";

/** ما يتوقعهُ التحققُّ عن تكوينِ البيئةِ — معرّفُ البوتِ صاحبِ المصغّرِ لا سرُّهُ. */
export interface TelegramMiniAppVerificationConfig {
  /** معرّفُ البوتِ صاحبِ المصغّرِ (أرقامٌ فقط) — يُربطُ الدليلَ بهِ في نصِّ التحققِّ. */
  readonly botId: string;
  /** مفاتيحُ Ed25519 العلنيّةُ (hex خامٌ 32 بايتًا) التي تُقبلُ — منشورةٌ افتراضيًّا. */
  readonly publicKeys: readonly string[];
}

/**
 * مفاتيحُ تيليجرامِ العلنيّةُ المنشورةُ في توثيقِ الـWebApps نفسِهِ («Validating
 * data for third-party use») — بيئةُ الإنتاجِ وبيئةُ الاختبارِ. دورانُ المفاتيحِ
 * إن وقعَ يومًا فهو تعديلٌ هنا بقرارٍ مؤرَّخٍ، لا اكتشافٌ في زمنِ الطلبِ.
 */
export const TELEGRAM_ED25519_PUBLIC_KEYS = {
  production: "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d",
  test: "40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec",
} as const;

/** أطولُ عمرٍ مقبولٍ للدليلِ بالثواني — توثيقُ تيليجرامِ يُلزمُ فحصَ `auth_date`. */
export const INIT_DATA_MAX_AGE_SECONDS = 900;

/** سماحُ انحرافِ الساعةِ للأمامِ بالثواني — ساعةُ خادمٍ متأخّرةٌ تُقاطعُ الكلَّ بدونهِ. */
export const INIT_DATA_CLOCK_SKEW_SECONDS = 60;

/**
 * أسبابُ الرفضِ المسمّاةُ — كلُّ سببٍ يصلُ المتصلَ في رسالةِ الرفضِ، لأنَّ مطوّرَ
 * المصغّرِ يصلحُ خطأَهُ بهذا الاسمِ، لا برقمٍ ولا بتجاهلٍ.
 */
export type TelegramInitDataRejection =
  | "malformed_init_data"
  | "signature_missing"
  | "signature_mismatch"
  | "auth_date_missing"
  | "init_data_expired"
  | "init_data_from_future"
  | "user_missing";

export interface TelegramInitDataUser {
  readonly id: number;
  readonly firstName?: string;
}

export type TelegramInitDataVerification =
  | {
      readonly ok: true;
      readonly user: TelegramInitDataUser;
      /** `auth_date` بالثواني كما وقّعتهُ تيليجرامُ. */
      readonly authDateSeconds: number;
      /**
       * بصمةُ الدليلِ **القانونيّةُ**: sha256 لنصِّ التحققِّ نفسِهِ (`bot_id:WebAppData`
       * + الحقولُ المرتَّبةُ كما فُحِصَ التوقيعُ عليها). ليست بصمةَ النصِّ الخامِّ:
       * إعادةُ ترتيبِ المعاملاتِ أو إعادةُ ترميزِها تُنتجُ نصًّا خامًّا آخرَ للدليلِ
       * الموقَّعِ نفسِهِ — فمفتاحُ منعِ الإعادةِ يُشتقُّ منَ التمثيلِ الذي تحقّقَ
       * التوقيعُ منهُ، ومعرّفُ البوتِ داخلُهُ.
       */
      readonly proofFingerprint: string;
    }
  | { readonly ok: false; readonly rejection: TelegramInitDataRejection };

/** حقلُ التوقيعِ الذي يُتحقَّقُ منهُ هنا — وحقلُ `hash` طريقُ الطرفِ الأولِ (سرُّ البوتِ) لا يُقرأ. */
const SIGNATURE_FIELD = "signature";
/** الحقلانِ المستثنيانِ من نصِّ التحققِّ — كما في توثيقِ تيليجرامِ للمسارَينِ معًا. */
const EXCLUDED_FROM_CHECK_STRING = new Set(["hash", "signature"]);
/** ثابتُ الملحِ المُعلَنُ في التوثيقِ — يسبقُ الحقولَ في نصِّ التحققِّ. */
const CHECK_STRING_PREFIX_CONSTANT = "WebAppData";

/**
 * يُفكِّك `init_data` إلى أزواجٍ **بلا فقدانِ ترتيبٍ ولا تجاهلِ تكرار**.
 *
 * لا يُستعمل `URLSearchParams` هنا لأنّه يقبل الحقلَ المكرَّرَ صامتًا — وهذا بابُ
 * تلبيسٍ (parameter pollution): يوقِّع المهاجمُ على `user` سليمٍ ثمّ يُضيف `user`
 * ثانياً، فيقرأ التحققُّ أحدَهما ويقرأ التطبيقُ الآخر. فالتكرارُ يُرفَض صراحةً.
 */
function parsePairs(raw: string): Map<string, string> | null {
  if (raw.length === 0) return null;
  const out = new Map<string, string>();
  for (const chunk of raw.split("&")) {
    if (chunk.length === 0) return null;
    const eq = chunk.indexOf("=");
    // مفتاحٌ بلا `=` أو مفتاحٌ فارغٌ (`=v`) بنيةٌ غيرُ صالحة.
    if (eq <= 0) return null;
    const key = chunk.slice(0, eq);
    if (out.has(key)) return null;
    try {
      out.set(key, decodeURIComponent(chunk.slice(eq + 1)));
    } catch {
      // `%zz` يُلقي `URIError` — يُترجَم رفضاً لا انفجاراً.
      return null;
    }
  }
  return out;
}

/**
 * نصُّ التحققِّ لمسارِ الطرفِ الثالثِ كما في التوثيقِ: سطرُ `bot_id:WebAppData`
 * ثمَّ كلُّ الحقولِ ما عدا `hash` و`signature`، مرتَّبةً بالمفتاحِ، مفصولةً بسطرٍ
 * جديدٍ.
 *
 * الترتيبُ بمقارنةِ الوحداتِ الرمزيّةِ (`<`) لا بـ`localeCompare`: الأخيرُ يتبع
 * محليّةَ النظامِ فيُنتج ترتيباً مختلفاً على خادمٍ بمحليّةٍ أخرى، فيُخفِق التحققُّ
 * في الإنتاجِ وينجح في الاختبارِ.
 */
function thirdPartyDataCheckString(botId: string, pairs: Map<string, string>): string {
  const body = [...pairs.entries()]
    .filter(([k]) => !EXCLUDED_FROM_CHECK_STRING.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return `${botId}:${CHECK_STRING_PREFIX_CONSTANT}\n${body}`;
}

/** مفتاحُ Ed25519 منَ البايتاتِ الخامِّ — تغليفُ SPKI الثابتُ للخوارزميةِ. */
function ed25519KeyFromRawHex(hex: string): KeyObject | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  // بادئةُ SPKI الثابتةُ لمفتاحِ Ed25519 خامٍ (RFC 8410): 302a300506032b6570032100.
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(hex, "hex"),
  ]);
  try {
    return createPublicKey({ key: spki, format: "der", type: "spki" });
  } catch {
    return null;
  }
}

/** فكُّ ترميزِ base64url — رفضًا مسمّى لا انفجارًا عندَ دخولٍ غريبٍ. */
function decodeBase64Url(value: string): Buffer | null {
  if (value.length === 0) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

/** يقرأ `user` المُوقَّعَ ويُسقِطُ ما لا نستعمله. */
function parseUser(rawUser: string | undefined): TelegramInitDataUser | null {
  if (rawUser === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUser);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  const id = o["id"];
  // `Number.isSafeInteger` لا `typeof number`: معرّفُ تيليجرامَ يُقارَبُ في العائمِ
  // الكبيرِ فيصير معرّفاً آخرَ، وذلك خلطُ هويّاتٍ لا خطأُ صيغةٍ.
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
  const firstName = o["first_name"];
  return {
    id,
    ...(typeof firstName === "string" && firstName.length > 0
      ? { firstName: firstName }
      : {}),
  };
}

/**
 * يتحقَّقُ من `init_data` كاملًا: البنيةُ، التوقيعُ (Ed25519 ضدَّ المفاتيحِ
 * العلنيّةِ)، ثمَّ العمرُ، ثمَّ المستخدمُ.
 *
 * الترتيبُ مقصودٌ: **التوقيعُ قبلَ كلِّ قرارٍ** على المُدخَلِ — فالبنيةُ تُفكُّ
 * للتحققِ لا للقراءةِ، ولا يُبنى قرارٌ على حقلٍ قبلَ إثباتِ أنَّ تيليجرامَ وقّعتهُ.
 */
export function verifyTelegramInitData(
  raw: string,
  config: TelegramMiniAppVerificationConfig,
  now: Date,
): TelegramInitDataVerification {
  const pairs = parsePairs(raw);
  if (pairs === null) return { ok: false, rejection: "malformed_init_data" };

  const rawSignature = pairs.get(SIGNATURE_FIELD);
  if (rawSignature === undefined || rawSignature.length === 0) {
    return { ok: false, rejection: "signature_missing" };
  }
  const signature = decodeBase64Url(rawSignature);
  if (signature === null) return { ok: false, rejection: "signature_missing" };

  const checkString = thirdPartyDataCheckString(config.botId, pairs);
  const verified = config.publicKeys.some((hex) => {
    const key = ed25519KeyFromRawHex(hex);
    if (key === null) return false;
    try {
      return ed25519Verify(null, Buffer.from(checkString, "utf8"), key, signature);
    } catch {
      return false;
    }
  });
  if (!verified) return { ok: false, rejection: "signature_mismatch" };

  const rawAuthDate = pairs.get("auth_date");
  if (rawAuthDate === undefined || !/^\d+$/.test(rawAuthDate)) {
    return { ok: false, rejection: "auth_date_missing" };
  }
  const authDateSeconds = Number(rawAuthDate);
  if (!Number.isSafeInteger(authDateSeconds) || authDateSeconds <= 0) {
    return { ok: false, rejection: "auth_date_missing" };
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const ageSeconds = nowSeconds - authDateSeconds;
  // الحدُّ **شاملٌ**: عمرٌ يساوي أقصى العمرِ مقبولٌ، وأكبرُ منه مرفوضٌ.
  if (ageSeconds > INIT_DATA_MAX_AGE_SECONDS) {
    return { ok: false, rejection: "init_data_expired" };
  }
  if (ageSeconds < -INIT_DATA_CLOCK_SKEW_SECONDS) {
    return { ok: false, rejection: "init_data_from_future" };
  }

  const user = parseUser(pairs.get("user"));
  if (user === null) return { ok: false, rejection: "user_missing" };

  return {
    ok: true,
    user,
    authDateSeconds,
    proofFingerprint: createHash("sha256").update(checkString, "utf8").digest("hex"),
  };
}
