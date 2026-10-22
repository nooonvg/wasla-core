/**
 * `modules/web-session/verify.ts` — التحققُّ من رمزِ Telegram OIDC (XR-8.5 · B-45).
 *
 * هذا هو «المحوِّلُ» الذي كانَ مفقودًا: الدليلُ الذي يوقّعهِ مزوِّدُ الهويةِ
 * نفسُهُ (id_token من oauth.telegram.org) يُتحقَّقُ منهُ هنا — التوقيعُ ضدَّ
 * مفاتيحِ Telegram العلنيّةِ المنشورةِ (JWKS)، ثمّ مطالباتُ المُصدِرِ والمستقبِلِ
 * والصلاحيةِ الزمنيّةِ. لا سرٍّ خادميٍّ يحتاجهُ هذا التحققُّ: المفاتيحُ علنيّةٌ،
 * وهذا هو الفارقُ الجوهريُّ عن أداةِ الويبِ القديمةِ (HMAC بسرِّ البوت —
 * مؤرشفةٌ الآنَ في وثائقِ تيليجرام).
 *
 * دوالٌّ صافيةٌ كلُّها: لا قاعدةَ بياناتِ ولا شبكةَ ولا ساعةَ — الزمنُ
 * والمفاتيحُ يُمرَّرانِ، فتُختبرُ الحدودُ كلُّها بلا محاكاةٍ.
 */

import { parseJwt, rsaKeyFromJwk, verifyRs256, type Jwks, type JwtClaims } from "./jwt.js";

/** ما يتوقعهُ التحققُّ عن تكوينِ البيئةِ — المُستقبِلُ (audience) هو معرّفُ تطبيقِ الدخولِ. */
export interface TelegramOidcVerificationConfig {
  readonly issuer: string;
  readonly audience: string;
}

/**
 * أسبابُ الرفضِ المسمّاةُ — كلُّ سببٍ يصلُّ المتصلَ في رسالةِ الرفضِ، لأنَّ
 * مطوّرَ واجهةِ الويبِ يصلحُ خطأَهُ بهذا الاسمِ، لا برقمٍ.
 */
export type TelegramIdTokenRejection =
  | "malformed_token"
  | "algorithm_not_supported"
  | "key_not_found"
  | "signature_mismatch"
  | "issuer_mismatch"
  | "audience_mismatch"
  | "expired"
  | "issued_at_missing"
  | "issued_in_future"
  | "nonce_missing"
  | "nonce_unknown"
  | "subject_missing";

export type TelegramIdTokenVerification =
  | { readonly ok: true; readonly claims: JwtClaims }
  | { readonly ok: false; readonly rejection: TelegramIdTokenRejection };

/**
 * نافذةُ السماحِ لساعةِ المتلقّي: `iat` في المستقبلِ القريبِ مقبولٌ (انحرافُ
 * ساعاتٍ لا يُفسدُ دخولًا صحيحًا)، وما بعدَها رفضٌ — رمزٌ «مستقبليٌّ» رمزٌ
 * مُختلَقٌ أو معادُ تشغيلِهِ من بيئةٍ بزمنٍ مغايرٍ.
 */
const IAT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** يتحقّقُ من الرمزِ كاملًا: البنيةُ، الخوارزميةُ، المفتاحُ، التوقيعُ، المطالباتُ. */
export function verifyTelegramIdToken(
  token: string,
  jwks: Jwks,
  config: TelegramOidcVerificationConfig,
  now: Date,
): TelegramIdTokenVerification {
  const parsed = parseJwt(token);
  if (parsed === null) return { ok: false, rejection: "malformed_token" };

  // خوارزميةٌ واحدةٌ مقبولةٌ: RS256 — ما تنشرهُ خزينةُ Telegram اليومَ. أيُّ
  // شيءٍ آخرَ (`none`، `HS256`، خوارزميةٌ مستقبليّةٌ) مرفوضٌ بالاسمِ لا
  // بالتجاهلِ: التحققُّ من التوقيعِ بلا فحصِ الخوارزميةِ أولًا هو الثغرةُ
  // الكلاسيكيّةُ في كلِّ مكتباتِ JWT التي كُسرت.
  if (parsed.header.alg !== "RS256") return { ok: false, rejection: "algorithm_not_supported" };

  // اختيارُ المفتاحِ: `kid` إن وُجدَ في الرأسِ، وإلا فكلُّ المرشَّحينَ.
  // والترشيحُ لا يتجاهلُ الخوارزميةَ والغرضَ: مفتاحٌ ينشرُ `alg` مخالفًا أو
  // `use` مخالفًا ليسَ مفتاحَ تحقُّقٍ لهذا الرمزِ أصلًا — فتخطّيه ليسَ تفضيلًا
  // بل حدودُ ما يُؤمَنُ بهِ من خزينةِ المزوّدِ.
  const candidates = jwks.keys.filter((key) => {
    if (key.kty !== "RSA") return false;
    if (key.alg !== undefined && key.alg !== "RS256") return false;
    if (key.use !== undefined && key.use !== "sig") return false;
    if (typeof parsed.header.kid === "string") return key.kid === parsed.header.kid;
    return true;
  });
  const key = candidates.map(rsaKeyFromJwk).find((k) => k !== null);
  if (key === undefined) return { ok: false, rejection: "key_not_found" };

  if (!verifyRs256(parsed, key)) return { ok: false, rejection: "signature_mismatch" };

  // المطالباتُ — كلُّ واحدةٍ بالنوعِ قبلَ القيمةِ، لأنَّ `typeof` على مجهولٍ
  // أرخصُ من استثناءٍ في منتصفِ الدخولِ.
  const { claims } = parsed;
  if (claims.iss !== config.issuer) return { ok: false, rejection: "issuer_mismatch" };

  const audience = claims.aud;
  const audienceMatches =
    audience === config.audience ||
    (Array.isArray(audience) && audience.includes(config.audience));
  if (!audienceMatches) return { ok: false, rejection: "audience_mismatch" };

  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return { ok: false, rejection: "expired" };
  }
  if (claims.exp * 1000 <= now.getTime()) return { ok: false, rejection: "expired" };

  // `iat` مطلوبٌ حرفيًّا: مطالبةُ التوقيتِ من مزوّدِ OIDC قياسيّةٌ، وغيابُها
  // أو نوعُها الغريبُ ليسَ «رمزًا أقدم» بل رمزٌ ناقصُ المطالباتِ — لا نافذةَ
  // زمنيّةَ تُقاسُ بلا نقطةِ بدايةٍ أصلاً.
  if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat)) {
    return { ok: false, rejection: "issued_at_missing" };
  }
  if (claims.iat * 1000 > now.getTime() + IAT_FUTURE_TOLERANCE_MS) {
    return { ok: false, rejection: "issued_in_future" };
  }

  // الموضوعُ: معرّفُ حسابِ تيليجرامِ — بدونهِ لا هويةَ تُربطُ ولا جلسةَ تُمنحُ.
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    return { ok: false, rejection: "subject_missing" };
  }

  // ربطُ المحاولةِ بالمتصفّحِ (الـnonce): مطالبةٌ إلزاميّةٌ — الدخولُ لا يبدأُ
  // برمزٍ سقطَ من السماءِ بل بمحاولةٍ طلبتْ CORE لها nonce أولًا، فحضورُهُ في
  // الرمزِ هو ما يثبتُ أنَّ هذه المحاولةَ بدأها هذا المتصفّحُ لا ملتقطُ رمزٍ.
  // والقبولَ بالاسمِ (هل هو مفتوحُنا غيرُ المستهلَكِ؟) يُفصلُهُ الخدمةُ ذرّيًّا
  // بعدَ التوقيعِ؛ هنا يُفحصُ الحضورُ والنوعُ فقط.
  if (typeof claims.nonce !== "string" || claims.nonce.length === 0) {
    return { ok: false, rejection: "nonce_missing" };
  }

  return { ok: true, claims };
}

/**
 * توقيعُ `sub` بعدَ التحققِ — مضمونٌ أن يكونَ سلسلةً نصيّةً غيرَ فارغةٍ.
 * للرابطِ على قناةِ `telegram` نفسِ مساحةِ معرّفاتِ تيليجرامِ (`tg-<id>`)،
 * فالشخصُ نفسُهُ من التطبيقِ المصغّرِ (initData) ومن الويبِ (OIDC) هويةٌ واحدةٌ.
 */
export function telegramSubject(claims: JwtClaims): string {
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new Error("telegramSubject called on unverified claims");
  }
  return claims.sub;
}
