/**
 * `tests/support/web-sign-in-keys.ts` — مفاتيحُ ورموزُ دخولٍ للاختبارِ.
 *
 * مولِّدٌ لا يُستعملُ في الإنتاجِ أبدًا: يبني مفتاحَ RSA وجوازَ JWKS ورمزَ
 * id_token موقَّعًا — للحدودِ الوظيفيّةِ في اختبارِ التحققِّ وللمسارِ الكاملِ
 * في اختبارِ الخدمةِ. المتجهُ المجمدُّ المستقلُّ يعيشُ في `fixtures/`، وهذه
 * المولِّداتُ تخدمُ الحالاتِ التي يحتاجُ فيها الاختبارُ تحكّمًا في الحمولةِ.
 */

import { createSign, generateKeyPairSync } from "node:crypto";
import type { Jwk, Jwks } from "../../src/modules/web-session/jwt.js";

export interface TestKey {
  readonly privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  readonly jwks: Jwks;
}

/** مفتاحٌ جديدٌ بمعرّفِ مفتاحٍ مسمّى — وخزينةُ مفاتيحٍ من مفتاحٍ واحدٍ. */
export function freshTelegramKey(kid = "test-1"): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 65537,
  });
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  const jwks: Jwks = {
    keys: [{ kty: "RSA", kid, alg: "RS256", use: "sig", n: jwk.n, e: jwk.e } as Jwk],
  };
  return { privateKey, jwks };
}

const b64u = (buf: Buffer) => buf.toString("base64url");

/** رمزُ id_token موقَّعٌ بهذا المفتاحِ — الحمولةُ والرأسُ بيدِ الاختبارِ. */
export function signedTelegramIdToken(
  key: TestKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "test-1", typ: "JWT" },
): string {
  const signingInput = `${b64u(Buffer.from(JSON.stringify(header)))}.${b64u(
    Buffer.from(JSON.stringify(claims)),
  )}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key.privateKey);
  return `${signingInput}.${b64u(signature)}`;
}

/** مصدرُ مفاتيحٍ ثابتٌ للاختبارِ — لا شبكةَ ولا تخزينٌ مؤقتٌ. */
export const fixedJwksSource = (jwks: Jwks) => ({ current: async (): Promise<Jwks> => jwks });

/** لحظةٌ مرجعيّةٌ ثابتةٌ لدخولِ الويبِ — تُستعملُ في الساعةِ والحمولاتِ معًا. */
export const WEB_SIGN_IN_AT = "2026-10-22T12:00:00.000Z";
