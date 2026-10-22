/**
 * `modules/web-session/jwks.ts` — جالبُ مفاتيحِ التحققِ (JWKS) مع تخزينٍ مؤقتٍ.
 *
 * المفاتيحُ علنيّةٌ بحكمِ تعريفِها (خزينةُ مفاتيحِ خوارزميةِ التوقيعِ) لكنَّ
 * جلبَها في كلِّ طلبِ دخولٍ خطأٌ من طرفينِ: زمنُ دخولِ الشخصِ صارَ رهينةَ
 * شبكةِ جلبٍ، ومزوّدُ الهويةِ صارَ يُقابَلُ على كلِّ زائرٍ. فالتخزينُ المؤقتُ
 * مدّةً محدودةً — والفشلُ في التجديدِ لا يُسقِطُ الدخولَ: تُستعمَلُ النسخةُ
 * القديمةُ ما دامتْ صلاحيّةُ الرمزِ نفسِهِ تُغطّيها، لأنَّ رفضَ دخولٍ صحيحٍ
 * بسببِ تعذّرِ التجديدِ هو انقطاعٌ لا أمانٌ.
 *
 * الحدُّ الوحيدُ الصارمُ: أولُ جلبٍ لا بديلَ فيهِ — بلا مفاتيحَ لا تحقُّقَ،
 * والرفضُ الصريحُ خيرٌ من تخطّي التوقيعِ.
 */

import type { Jwks } from "./jwt.js";

export interface JwksFetcher {
  /** يجلبُ الخزينةَ من مزوّدِها — يرمي عندَ الفشلِ، لا يعيدُ بديلًا صامتًا. */
  fetch(): Promise<Jwks>;
}

/** مدّةُ صلاحيّةِ النسخةِ المخبّأةِ قبلَ وجوبِ التجديدِ. */
const CACHE_TTL_MS = 60 * 60 * 1000;
/**
 * أقصى عمرٍ لنسخةٍ قديمةٍ تُستعمَلُ بعدَ فشلِ التجديدِ. حدُّ تسامحٍ مُعلَنٌ لا
 * ادّعاءَ ارتباطٍ بعمرِ رموزِ المزوّدِ (لا ينشرُ عمرَها أحدٌّ موثوقًا): المفتاحُ
 * المُفقودُ يُرفَضُ بالاسمِ (`key_not_found`)، والاعتمادُ الأساسُّ على إعادةِ
 * الجلبِ عندَ أولِ طلبٍ بعدَ انقضاءِ مدّةِ التخزينِ.
 */
const STALE_GRACE_MS = 24 * 60 * 60 * 1000;

export class CachedJwksSource {
  private cached: { jwks: Jwks; fetchedAt: number } | null = null;

  constructor(
    private readonly fetcher: JwksFetcher,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async current(): Promise<Jwks> {
    const now = this.now();
    if (this.cached !== null && now - this.cached.fetchedAt < CACHE_TTL_MS) {
      return this.cached.jwks;
    }
    try {
      const jwks = await this.fetcher.fetch();
      this.cached = { jwks, fetchedAt: now };
      return jwks;
    } catch (err) {
      // النسخةُ القديمةُ تُغطّي زمنَ صلاحيّةِ الرموزِ التي وُقِّعتْ وهي ساريةٌ —
      // والمفتاحُ المُفقودُ يُرفَضُ بالاسمِ (`key_not_found`) لا بالصمتِ.
      if (this.cached !== null && now - this.cached.fetchedAt < STALE_GRACE_MS) {
        return this.cached.jwks;
      }
      throw err;
    }
  }
}

/** جالبٌ من عنوانِ URL عبرَ `fetch` العامِّ — للاستعمالِ في نقطةِ الخدمةِ. */
export class HttpJwksFetcher implements JwksFetcher {
  constructor(private readonly url: string) {}

  async fetch(): Promise<Jwks> {
    const response = await fetch(this.url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`jwks fetch failed: ${response.status} from ${this.url}`);
    }
    const body = (await response.json()) as Jwks;
    if (!Array.isArray(body.keys)) {
      throw new Error(`jwks fetch returned no keys array from ${this.url}`);
    }
    return body;
  }
}
