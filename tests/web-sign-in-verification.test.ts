/**
 * `tests/web-sign-in-verification.test.ts` — برهانُ التحققِّ من رمزِ Telegram OIDC.
 *
 * طبقةُ `verify.ts` صافيةٌ كلُّها، فكلُّ حدٍّ من حدودِها يُختبرُ هنا بلا قاعدةِ
 * بياناتٍ ولا شبكةٍ: التوقيعُ، الخوارزميةُ، المفتاحُ، المُصدِرُ، المُستقبِلُ،
 * الصلاحيّةُ الزمنيّةُ، والموضوعُ.
 *
 * المتجهُ المجمدُّ (independent vector): الرمزُ والمفتاحُ في الأسفلِ وُلِّدا
 * بتنفيذٍ مستقلٍّ تمامًا عن هذا المستودعِ (مكتبةُ `cryptography` في بايثون،
 * لا `node:crypto` في هذا الملفِ) — فلو اقتسمَ المُولِّدُ والمُتحقِّقُ عيبًا
 * واحدًا لما رآهُ هذا الاختبارِ. الرموزُ المولَّدةُ داخلَ الاختبارِ تخدمُ
 * الحدودِ، والمجمدُّ يخدمُ الاستقلالَ: الاثنانِ معًا هما البرهانُ.
 *
 * لا قاعدةَ بياناتٍ: يعملُ في الوظيفةِ `suite` كما في أيِّ بيئةٍ بلا `DATABASE_URL`.
 */
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { hashToken } from "../src/platform/ids.js";
import { describe, expect, it } from "vitest";
import { verifyTelegramIdToken, telegramSubject } from "../src/modules/web-session/verify.js";
import frozenVectorJson from "./fixtures/web-sign-in-frozen-vector.json" with { type: "json" };
import type { Jwk } from "../src/modules/web-session/jwt.js";

const frozenVector = frozenVectorJson as {
  jwks: { keys: readonly Jwk[] };
  idToken: string;
  expectedSubject: string;
};

const ISSUER = "https://oauth.telegram.org";
const AUDIENCE = "wasla-web-test";

/** مفتاحُ الاختبارِ — يُنشأُ لكلِّ حزمةِ اختباراتٍ، لا يُخزَّنُ ولا يُرسَلُ. */
function freshKey() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 65537,
  });
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  return { privateKey, jwk: { kty: "RSA", kid: "test-1", alg: "RS256", use: "sig", n: jwk.n, e: jwk.e } };
}

const b64u = (buf: Buffer) => buf.toString("base64url");

/** يبني رمزًا موقَّعًا بحمولةٍ ورأسٍ قابلينِ للتعديلِ — مولِّدُ الاختبارِ. */
function signedToken(
  key: ReturnType<typeof freshKey>,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "test-1", typ: "JWT" },
): string {
  const signingInput = `${b64u(Buffer.from(JSON.stringify(header)))}.${b64u(
    Buffer.from(JSON.stringify(claims)),
  )}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key.privateKey);
  return `${signingInput}.${b64u(signature)}`;
}

/** تاريخٌ صالحٌ للحمولةِ المرجعيّةِ (2026-10-22 ضمنَ صلاحيّةِ الرمزِ). */
const NOW = new Date("2026-10-22T12:00:00.000Z");
/** حمولةٌ مرجعيّةٌ صحيحةٌ — كلُّ اختبارِ رفضٍ يعدّلُ حقلًا واحدًا منها. */
const validClaims = { iss: ISSUER, aud: AUDIENCE, sub: "111222333", exp: 1792700000, iat: 1792600000, nonce: "verification-nonce" };

describe("التحققُّ من رمزِ Telegram OIDC — الحدودُ الوظيفيّةُ", () => {
  const key = freshKey();

  it("رمزٌ صحيحٌ يُقبَلُ بحمولتِهِ كاملةً", () => {
    const result = verifyTelegramIdToken(
      signedToken(key, validClaims),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(telegramSubject(result.claims)).toBe("111222333");
    }
  });

  it("حملٌ مُبدَّلٌ بعدَ التوقيعِ يُرفَضُ بالتوقيعِ لا بالبنيّةِ", () => {
    const token = signedToken(key, validClaims);
    const [h, , s] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...validClaims, sub: "999" }),
    ).toString("base64url");
    const result = verifyTelegramIdToken(
      `${h}.${tampered}.${s}`,
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, rejection: "signature_mismatch" });
  });

  it("مفتاحٌ آخرَ (khid مُختلفٌ) — لا مفتاحَ فلا تحقُّقَ", () => {
    const other = freshKey();
    const otherJwk = { ...other.jwk, kid: "another-key" } as typeof other.jwk;
    const result = verifyTelegramIdToken(
      signedToken(key, validClaims),
      { keys: [otherJwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, rejection: "key_not_found" });
  });

  it("خوارزميّةٌ غيرُ RS256 مرفوضةٌ بالاسمِ — لا تُجرَّبُ أصلًا", () => {
    for (const alg of ["none", "HS256", "ES256"]) {
      const result = verifyTelegramIdToken(
        signedToken(key, validClaims, { alg, kid: "test-1", typ: "JWT" }),
        { keys: [key.jwk] },
        { issuer: ISSUER, audience: AUDIENCE },
        NOW,
      );
      expect(result).toMatchObject({ ok: false, rejection: "algorithm_not_supported" });
    }
  });

  it("مُصدِرٌ ومُستقبِلٌ لا يطابقانِ التكوينَ — رفضٌ مسمّى لكلٍّ", () => {
    const wrongIss = verifyTelegramIdToken(
      signedToken(key, { ...validClaims, iss: "https://evil.example" }),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(wrongIss).toMatchObject({ ok: false, rejection: "issuer_mismatch" });

    const wrongAud = verifyTelegramIdToken(
      signedToken(key, { ...validClaims, aud: "someone-else" }),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(wrongAud).toMatchObject({ ok: false, rejection: "audience_mismatch" });
  });

  it("aud كمصفوفةٍ تُقبَلُ إن احتوتِ المُستقبِلَ المُهيَّأَ", () => {
    const result = verifyTelegramIdToken(
      signedToken(key, { ...validClaims, aud: ["other-client", AUDIENCE] }),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("منتهيُ الصلاحيّةِ ومُستقبَلُ المستقبلِ — كلاهُما رفضٌ", () => {
    const expired = verifyTelegramIdToken(
      signedToken(key, { ...validClaims, exp: Math.floor(NOW.getTime() / 1000) - 1 }),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(expired).toMatchObject({ ok: false, rejection: "expired" });

    const future = verifyTelegramIdToken(
      signedToken(key, { ...validClaims, iat: Math.floor(NOW.getTime() / 1000) + 3600 }),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(future).toMatchObject({ ok: false, rejection: "issued_in_future" });
  });

  it("رمزٌ بلا موضوعٍ لا يمنحُ هويةً", () => {
    const result = verifyTelegramIdToken(
      signedToken(key, { ...validClaims, sub: "" }),
      { keys: [key.jwk] },
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, rejection: "subject_missing" });
  });

  it("ليس رمزَ ثلاثِ أجزاءٍ — بنيّةٌ مكسورةٌ من أولِ خطوةٍ", () => {
    const result = verifyTelegramIdToken("not-a-jwt", { keys: [key.jwk] }, { issuer: ISSUER, audience: AUDIENCE }, NOW);
    expect(result).toMatchObject({ ok: false, rejection: "malformed_token" });
  });
});

describe("المتجهُ المجمدُّ — استقلالُ البرهانِ", () => {
  it("رمزٌ من تنفيذٍ آخرَ يُقبَلُ بجوابِهِ الكاملِ", () => {
    const result = verifyTelegramIdToken(
      frozenVector.idToken,
      frozenVector.jwks,
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(telegramSubject(result.claims)).toBe(frozenVector.expectedSubject);
      expect(result.claims.exp).toBe(1792700400);
    }
  });

  it("حرفٌ واحدٌ في الحملِ يكسرُ التوقيعَ", () => {
    const [h, p, s] = frozenVector.idToken.split(".");
    if (h === undefined || p === undefined || s === undefined) {
      throw new Error("frozen vector is not a three-part token");
    }
    const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
    decoded.sub = "987654322";
    const forged = `${h}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${s}`;
    const result = verifyTelegramIdToken(
      forged,
      frozenVector.jwks,
      { issuer: ISSUER, audience: AUDIENCE },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, rejection: "signature_mismatch" });
  });
});

/**
 * تجزئةُ الاستهلاكِ — نفسُ دالةِ تجزئةِ الجلساتِ (`hashToken`) على رمزِ الدخولِ:
 * تُختبرُ هنا لثباتِ أنَّ سجلَّ الاستهلاكِ لا يعتمدُ على محتوى الرمزِ بلا
 * تجزئةٍ (رمزٌ لا يُخزَّنُ أبدًا كما هو).
 */
describe("تجزئةُ رمزِ الدخولِ لسجلِّ الاستهلاكِ", () => {
  it("التجزئةُ حتميّةٌ ومستقلّةٌ عن طولِ الرمزِ", () => {
    const first = hashToken(frozenVector.idToken);
    expect(first).toBe(hashToken(frozenVector.idToken));
    expect(first).not.toBe(frozenVector.idToken);
    expect(first).toHaveLength(createHash("sha256").digest("hex").length);
  });
});
