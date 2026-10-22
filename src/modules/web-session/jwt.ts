/**
 * `modules/web-session/jwt.ts` — تحليلُ رمزِ JWT والتحققُ من توقيعِ RS256.
 *
 * لماذا هذه الوحدةُ موجودةٌ أصلًا: هذا المستودعُ بلا أيّةِ تبعيةِ تشغيلٍ —
 * التحققُ من رمزِ الدخولِ لا يحتاجُ مكتبةَ JWT؛ يحتاجُ `node:crypto` فقط.
 * ما هو هُنا مقصورٌ على ما يحتاجهُ مسارُ واحدٍ: رموزُ Telegram OIDC
 * (خوارزميةُ RS256 فقط — ما تنشرهُ مفاتيحُهم العلنيةُ اليومَ، وأيُّ خوارزميةٍ
 * أخرى مرفوضةٌ صراحةً لا متجاوَزةً).
 */

import { createPublicKey, verify as verifyWithNode } from "node:crypto";

/** رأسُ الرمزِ كما وصلَ — بلا افتراضاتٍ: كلُّ حقلٍ يُفحَصُ قبلَ استعمالِهِ. */
export interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
}

/** الحملُ المُصادَقُ عليهِ — الحقولُ التي يقرؤها المسارُ تُفحَصُ بالنوعِ. */
export type JwtClaims = Readonly<Record<string, unknown>>;

/** أجزاءُ الرمزِ بعدَ التحليلِ — `signingInput` هو ما وقَّعَهُ المُصدِرُ حرفيًّا. */
export interface ParsedJwt {
  readonly header: JwtHeader;
  readonly claims: JwtClaims;
  readonly signingInput: string;
  readonly signature: Buffer;
}

/**
 * فكُّ ترميزِ base64url مع رفضِ الشكلِ غيرِ القياسيِّ — هذه ليست زينةً:
 * `Buffer.from` يقبلُ تمثيلاتٍ متعدّدةً لنفسِ البايتاتِ (حروفٌ تختلفُ في البتّاتِ
 * الحشوِيّةِ)، والسجلُّ يجزّئُ النصَّ الخامَ، فتوقيعٌ واحدٌ بترميزينَ = مفتاحا
 * استهلاكٍ مختلفانِ = جلستانِ من دليلٍ واحدٍ. إعادةُ الترميزِ والمقارنةُ
 * تُلغي العائلةَ كلَّها: ما ليسْ الشكلَ القياسيَّ الوحيدَ ليسَ رمزًا.
 */
const fromCanonicalBase64Url = (part: string): Buffer | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) return null;
  const decoded = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (decoded.toString("base64url") !== part) return null;
  return decoded;
};

/** يحلِّلُ `header.payload.signature` — أو `null` إن لم يكنْ رمزًا ذا ثلاثةِ أجزاءٍ. */
export function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const encodedHeader = parts[0];
  const encodedClaims = parts[1];
  const encodedSignature = parts[2];
  if (encodedHeader === undefined || encodedClaims === undefined || encodedSignature === undefined) {
    return null;
  }
  let header: unknown;
  let claims: unknown;
  const decodedHeader = fromCanonicalBase64Url(encodedHeader);
  const decodedClaims = fromCanonicalBase64Url(encodedClaims);
  const signature = fromCanonicalBase64Url(encodedSignature);
  if (decodedHeader === null || decodedClaims === null || signature === null) return null;
  try {
    header = JSON.parse(decodedHeader.toString("utf8"));
    claims = JSON.parse(decodedClaims.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof header !== "object" || header === null) return null;
  if (typeof claims !== "object" || claims === null) return null;
  if (signature.length === 0) return null;
  return {
    header: header as JwtHeader,
    claims: claims as JwtClaims,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature,
  };
}

/**
 * مفتاحٌ عامٌّ بصيغةِ JWK كما تنشرهُ خزائنُ المفاتيحِ (JWKS).
 * حقلانِ فقط يهمّانِ RS256 هنا: `n` و`e` — والباقيَ للانتقاءِ (`kid`، `use`).
 */
export interface Jwk {
  readonly kty?: unknown;
  readonly kid?: unknown;
  readonly alg?: unknown;
  readonly use?: unknown;
  readonly n?: unknown;
  readonly e?: unknown;
}

export interface Jwks {
  readonly keys: readonly Jwk[];
}

/** يبني مفتاحَ RSA من JWK — أو `null` إن لم يكنْ JWKَ خوارزميةٍ مدعومةٍ. */
export function rsaKeyFromJwk(jwk: Jwk): import("node:crypto").KeyObject | null {
  if (jwk.kty !== "RSA") return null;
  if (typeof jwk.n !== "string" || typeof jwk.e !== "string") return null;
  try {
    return createPublicKey({
      key: { kty: "RSA", n: jwk.n, e: jwk.e },
      format: "jwk",
    });
  } catch {
    return null;
  }
}

/**
 * التحققُ من التوقيعِ نفسِهِ — مقارنةً بزمنٍ ثابتٍ (هذا ما تفعلهُ `crypto.verify`
 * داخليًّا، لا مقارنةُ سلاسلٍ للنصِّ المستخرَجِ). يعيدُ `false` لأيِّ سببٍ،
 * لا استثناءً: رفضُ التوقيعِ نتيجةٌ متوقعةٌ لا خطأٌ داخليٌّ.
 */
export function verifyRs256(
  parsed: ParsedJwt,
  key: import("node:crypto").KeyObject,
): boolean {
  try {
    return verifyWithNode(
      "RSA-SHA256",
      Buffer.from(parsed.signingInput, "utf8"),
      key,
      parsed.signature,
    );
  } catch {
    return false;
  }
}
