/**
 * `modules/web-session/http.ts` — مسارُ دخولِ الويبِ (XR-8.5 · B-45).
 *
 * مسارٌ مجهولٌ واحدٌ: الدخولُ هنا يُثبِتُ نفسَهُ بدليلِ قناتِهِ، فلا مُستخدمٍ
 * مسمّى يُطلبُ قبلَ الدليلِ — عكسَ `POST /v1/sessions` الذي يظلُّ مغلَقًا
 * بالترخيصِ (B-39). وما لا يزالُ صحيحًا: أولُ اعتمادِ بيئةٍ لا يأتي من أيِّ
 * مسارٍ HTTP إطلاقًا — `bootstrap:credential` يحتاجُ وصولًا إلى القاعدةِ.
 *
 * إعادةُ الإرسالِ الحرفيّةِ للطلبِ نفسِهِ (بوابةُ إعادةِ المحاولةِ) مرفوضةٌ
 * لا مُدمَجةٌ: الرمزُ استُهلكَ، والجوابُ الثاني هو الرفضُ المسمّى — قصدًا،
 * لأنَّ دمجَها يعيدُ توزيعَ جلسةٍ قد يكونُ صاحبُها أنهى عمليّةَ الدخولِ.
 */

import { unauthenticated } from "../../platform/errors.js";
import { anonymous } from "../../platform/http/authentication.js";
import { objectBody } from "../../platform/http/body.js";
import { natural, newEachTime } from "../../platform/http/retry.js";
import type { Router } from "../../platform/http/router.js";
import type { AuthenticatedPrincipal } from "../identity-access/service.js";
import { requireWebSignIn, type WebSignInService } from "./service.js";

/**
 * يستخرجُ قيمةَ كوكي المحاولةِ من رأسِ Cookie كما يرسلُهُ المتصفّحُ. الكوكيّاتُ
 * الأخرى التي يحملُها المتصفّحُ بحقٍّ لا تُرفَضُ ولا تُقرأ — تُتجاوَز؛ وتكرارُ
 * الاسمِ التباسٌ لا جوابَ واحدَ لهُ، فالقرارُ أنَّهُ غائبةٌ.
 */
function readAttemptCookie(cookie: string): string | undefined {
  let found: string | undefined;
  for (const pair of cookie.split("; ")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq) !== "wasla_web_attempt") continue;
    if (found !== undefined) return undefined;
    found = pair.slice(eq + 1);
  }
  return found;
}

export function registerWebSessionRoutes(
  router: Router<AuthenticatedPrincipal>,
  webSignIn: WebSignInService | null,
): void {
  // فتحُ المحاولةِ: nonce جديدٌ لمتصفّحٍ بعينِهِ. تكرارُ الطلبِ الحرفيِّ يفتحُ
  // محاولةً ثانيةً لا يعيدُ الأولى — فذلكَ مقصودٌ: nonce غيرُ مستعمَلٍ ينتهي
  // وحدهُ بعدَ عشرِ دقائقَ، وأثرُ الطلبِ المكرَّرِ نتيجتُهُ لا ضررُهُ.
  router.post(
    "/v1/web-session/telegram/nonce",
    objectBody(),
    anonymous(
      "فتحُ محاولةِ دخولٍ: لا مُستخدمٍ يُفحَصُ قبلَ أن يبدأَ — الـnonce هو ما يربطُ المحاولةَ القادمةَ بهذا المتصفّحِ",
    ),
    newEachTime(
      "إصدارُ nonce جديدٍ في كلِّ طلبٍ: المحاولةُ المكرَّرةُ محاولةٌ جديدةٌ، وnonce غيرُ المستعمَلِ ينتهي وحدهُ — لا حالةً تُلزِمُ دمجَها",
    ),
    async () => {
      const service = requireWebSignIn(webSignIn);
      const issued = await service.issueTelegramLoginNonce();
      // الكوكي هو نصفُ الربطِ الذي لا يظهرُ في الجسمِ: HttpOnly فلا يقرؤهُ
      // سكربتٌ، وSecure فلا يسافرَ إلا مشفَّرًا، وSameSite=Lax فلا يُرفَقَ
      // بطلبٍ من أصلٍ آخرَ. القيمةُ هي المحاولةُ، والمسارُ التالي يُلزَمُ بها.
      return {
        status: 201,
        body: { nonce: issued.nonce, expires_at: issued.expires_at },
        headers: {
          "set-cookie": `wasla_web_attempt=${issued.attempt}; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      };
    },
  );

  router.post(
    "/v1/web-session/telegram",
    objectBody({ name: "id_token", kind: "text", required: true }),
    anonymous(
      "دخولُ الويبِ: الدليلُ هنا رمزُ Telegram OIDC موقَّعٌ من مزوّدِ الهويةِ، والتحققُّ منهُ في CORE نفسِهِ قبلَ إصدارِ الجلسةِ — لا مُستخدمٍ يُفحَصُ قبلَ الدليلِ",
    ),
    natural(
      "محاولةُ الدخولِ نفسُها هي المفتاحُ الطبيعيُّ: nonce واحدةٌ لمتصفّحٍ واحدٍ تُستهلَكُ في أولِ إتمامٍ، فأيُّ إعادةٍ حرفيّةٍ للطلبِ — أو أيُّ محاولةٍ أخرى بالرمزِ نفسِهِ — تُرفَضُ بـ401 ولا تكتبُ شيئًا: لا صفَّ جلسةٍ ولا هويّةً. مطالبةُ nonce داخلَ الرمزِ تُثبِتُهُ لمحاولةٍ واحدةٍ، والمحاولةُ تُطلِقُ مرةً واحدةً",
    ),
    async (ctx) => {
      const service = requireWebSignIn(webSignIn);
      // الكوكي رأسُ طلبٍ معلَنٌ لا حقلُ جسمٍ: المتصفّحُ يرفقُهُ تلقائيًّا،
      // وقيمتُهُ هي التي حكمَتِ المحاولةَ عندَ فتحِها. غيابُهُ رفضٌ مسمًّى —
      // لا تجاهلًا: الدخولُ بلا محاولةٍ فتحَها هذا المتصلُّ ليسَ دخولًا.
      const cookie = ctx.headers.value("cookie");
      const attempt = cookie === undefined ? undefined : readAttemptCookie(cookie);
      if (attempt === undefined) {
        throw unauthenticated("telegram id_token refused: attempt_missing");
      }
      const session = await service.issueSessionWithTelegramIdToken(
        ctx.input.requiredText("id_token"),
        attempt,
        ctx.correlation_id,
      );
      return {
        status: 201,
        body: {
          session_id: session.session_id,
          access_token: session.access_token,
          token_type: "Bearer",
          expires_at: session.expires_at,
          identity_id: session.identity_id,
          identity_created: session.identity_created,
        },
      };
    },
  );
}
