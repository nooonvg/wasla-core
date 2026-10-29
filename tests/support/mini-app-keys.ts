/**
 * `tests/support/mini-app-keys.ts` — مفاتيحُ وأدلّةُ دخولِ المصغّرِ للاختبارِ.
 *
 * مولِّدٌ لا يُستعملُ في الإنتاجِ أبدًا: يبني مفتاحَ Ed25519 ودليلَ `init_data`
 * موقَّعًا — للحدودِ الوظيفيّةِ في اختبارِ التحققِّ وللمسارِ الكاملِ في اختبارِ
 * الخدمةِ. الموقِّعُ هنا مستقلٌّ عن المتحقِّقِ (لا يستوردُه) — فاختبارُ التوقيعِ
 * لا يصيرُ محاكاةً للدالّةِ نفسِها التي يفحصُها.
 */

import { generateKeyPairSync, sign as ed25519Sign, type KeyObject } from "node:crypto";

export interface MiniAppTestKey {
  readonly privateKey: KeyObject;
  /** المفتاحُ العلنيُّ خامًا بصيغةِ hex — كما تُقرأُ المفاتيحُ المنشورةُ في التهيئةِ. */
  readonly publicHex: string;
}

/** مفتاحٌ جديدٌ — البايتاتُ الخامُّ الـ32 من تغليفِ SPKI هي المفتاحَ العلنيَّ. */
export function freshMiniAppKey(): MiniAppTestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return { privateKey, publicHex: der.subarray(der.length - 32).toString("hex") };
}

/**
 * نصُّ التحققِّ لمسارِ الطرفِ الثالثِ — كما في توثيقِ تيليجرامِ: سطرُ
 * `bot_id:WebAppData` ثمَّ الحقولُ (ما عدا `hash` و`signature`) مرتَّبةً
 * مفصولةً بسطرٍ جديدٍ. مستقلٌّ عن المتحقِّقِ عمدًا: لو انحرفَ أحدُهما فشلَ
 * الاختبارُ لا نجحَ بالتوافقِ.
 */
export function miniAppCheckString(botId: string, fields: Readonly<Record<string, string>>): string {
  const body = Object.entries(fields)
    .filter(([k]) => k !== "hash" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return `${botId}:WebAppData\n${body}`;
}

/**
 * يبني دليلَ `init_data` موقَّعًا — **للاختبارِ فقط**. التوقيعُ Ed25519 على نصِّ
 * التحققِّ بصيغةِ base64url، والحقولُ مرمَّزةٌ كترميزِ الاستعلامِ. يمكن للمستدعي
 * تعطيلُ الترميزِ الافتراضيِّ (`encodeURIComponent`) لبناءِ ترميزٍ مكافئٍ يختلفُ
 * نصُّهُ الخامُّ — وهو ما يقيسُ قانونيّةَ البصمةِ.
 */
export function signedMiniAppInitData(
  key: MiniAppTestKey,
  botId: string,
  fields: Readonly<Record<string, string>>,
  encode: (value: string) => string = encodeURIComponent,
  order?: readonly string[],
): string {
  const checkString = miniAppCheckString(botId, fields);
  const signature = ed25519Sign(null, Buffer.from(checkString, "utf8"), key.privateKey).toString(
    "base64url",
  );
  const entries = Object.entries(fields);
  const ordered = order
    ? [...entries].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    : entries;
  return `${ordered.map(([k, v]) => `${k}=${encode(v)}`).join("&")}&signature=${signature}`;
}
