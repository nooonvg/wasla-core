/**
 * `modules/web-session/service.ts` — محوّلُ دخولِ الويبِ (XR-8.5 · B-45).
 *
 * هذا هو البُنيانُ الذي غابَ حينَ قِيسَ B-45: «لا محوِّلَ دخولٍ يتحقّقُ من
 * دليلِ القناةِ نفسِهِ قبلَ `session.issue`». الطريقُ المؤدّي إلى هنا كانَ
 * `POST /v1/sessions` نفسُهُ مغلَقًا بالترخيصِ (B-39) لأنَّ إصدارَ جلسةٍ
 * «لشخصٍ مسمّى» قرارٌ لا يملكهُ مجهولٌ — والدخولُ الحقيقيُّ يبدأُ من هنا:
 * الشخصُ يُثبِتُ نفسَهُ بدليلٍ من قناتِهِ (رمزُ Telegram OIDC موقَّعٌ من
 * مزوّدِ الهويةِ)، فيتحقّقُ CORE من الدليلِ ويُصدِرُ الجلسةَ بنفسِهِ.
 *
 * قراراتٌ محفوظةٌ هنا كما في الواجهةِ القديمةِ:
 *
 *  - **الهويةُ واحدةٌ داخلَ CORE**: الرابطُ على قناةِ `telegram` بمعرّفِ
 *    `tg-<sub>`، و`registerIdentity` يفصلُ (resolve-or-create) — فمن دخلَ من
 *    الويبِ مرتينِ هو هويةٌ واحدةٌ. **ما لا يُدَّعى هنا** أنَّ دخولَ المصغّرِ
 *    التشغيليَّ يسجّلُ في CORE أصلًا: تسجيلُهُ في خدمةِ هويةِ MOVE بمخزنِها
 *    ومعرّفِها الرقميِّ المجردِ (قيسَ في الكودِ)، وتوحيدُ المخزنينِ قرارُ
 *    تكاملٍ ليسَ من هذه الدورةِ — مسجَّلٌ في الخارطةِ لا مُدَّعًى هنا.
 *  - **الجلسةُ على قناةِ `web`**: الجلسةُ ربطُ عميلٍ بمستخدمٍ — والعميلُ هنا
 *    متصفّحُ الويبِ، والقناةُ مقيَّدةٌ في عقدِ الهويةِ أصلًا.
 *  - **الرمزُ يُطلِقُ مرةً واحدةً عبرَ المحاولةِ**: مطالبةُ `nonce` داخلَ
 *    الرمزِ تُثبِتُهُ لمحاولةٍ واحدةٍ نُصدِرُها نحنُ وتُستهلَكُ مرةً واحدةً —
 *    فملتقطُ رمزٍ لا يستطيعُ استعمالَهُ أصلًا خارجَ محاولتِهِ، والمُعادُ
 *    حرفيًّا يُرفَضُ بالاسمِ. (سجلُّ رموزٍ منفصلٌ كانَ سيكونُ رمزًا ميتًا:
 *    القرارُ نفسُهُ يُتَّخَذُ حيثُ المحاولةِ — فأُزيلَ بعلّةٍ مسجَّلةٍ.)
 *  - **مفاتيحُ علنيّةٌ فقط**: لا سرَّ بوتٍ في الخادمِ — التحققُّ ضدَّ JWKS،
 *    فإعدادُ البيئةِ لا ينقلُ سرًّا حسّاسًا إلى CORE.
 */

import { unavailable, unauthenticated } from "../../platform/errors.js";
import { hashToken, newToken } from "../../platform/ids.js";
import type { Clock } from "../../platform/clock.js";
import type { IdentityService } from "../identity-access/service.js";
import { verifyTelegramIdToken, telegramSubject, type TelegramIdTokenVerification } from "./verify.js";
import { verifyTelegramInitData, type TelegramMiniAppVerificationConfig } from "./init-data.js";
export type { TelegramMiniAppVerificationConfig };
import type { Jwks } from "./jwt.js";

/**
 * مخزنُّ الـnonce — ربطُ المحاولةِ بالمتصفّحِ. الإصدارُ والتقبيلُ ذرّيّانِ في
 * التنفيذِ: أولُ مستهلِكٍ يفوزُ، والمنتهي والمجهولُ رفضٌ واحدٌ مسمّى.
 */
export interface WebSignInNonceStore {
  /**
   * يسجّلُ nonce مفتوحًا مربوطًا بمحاولةٍ بعينِها — لا يفشلُ إن كانَ مُصدَرًا
   * قبلُ (إعادةُ إرسالٍ). المحاولةُ هي الكوكي الذي فتحَ المسارُ: من دونه
   * لا يكتملُ الدخولُ ولو كانَ الرمزُ صحيحَ التوقيعِ.
   */
  issue(nonceHash: string, attemptHash: string, expiresAt: Date): Promise<void>;
  /**
   * يستهلكُهُ إن كانَ مفتوحًا وغيرَ منتهيًا. يعيدُ `false` للمستهلَكِ والمنتهي
   * والمجهولِ على السواءِ — قرارٌ واحدٌ في مكانِ الصفِّ، لا قراءةً ثمّ كتابةً.
   */
  consumeIfFresh(nonceHash: string, attemptHash: string): Promise<boolean>;
}

/** مصدرُ مفاتيحِ التحققِ — يُحقنُ (ذاكرةٌ مخبّأةٌ في الإنتاجِ، ثابتٌ في الاختبارِ). */
export interface JwksSource {
  current(): Promise<Jwks>;
}

/** تكوينُ دخولِ الويبِ المُمرَّرُ من البيئةِ — لا يُبنى افتراضيًّا افتراضًا. */
export interface TelegramWebSignInOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwks: JwksSource;
}

/** nonce مفتوحٌ لطلبِ دخولٍ واحدٍ — صلاحيّتُهُ أقصرُ من صلاحيّةِ أيِّ رمزٍ. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

export interface IssuedLoginNonce {
  readonly nonce: string;
  readonly expires_at: string;
  /**
   * قيمةُ كوكي المحاولةِ (`wasla_web_attempt`): يفتحُها مسارُ الـnonce في
   * رأسِ الجوابِ، ويعيدُها المتصفّحُ تلقائيًّا معَ مسارِ الدخولِ. HttpOnly
   * فلا يقرؤها سكربتٌ — ولهذا كانَ الربطُ بها لا بالـnonce وحده.
   */
  readonly attempt: string;
}

export interface WebSignInSession {
  readonly session_id: string;
  readonly access_token: string;
  readonly expires_at: string;
  readonly identity_id: string;
  readonly identity_created: boolean;
}

export class WebSignInService {
  constructor(
    private readonly identity: IdentityService,
    private readonly nonces: WebSignInNonceStore,
    private readonly options: TelegramWebSignInOptions,
    private readonly clock: Clock,
  ) {}

  /**
   * يفتحُ محاولةَ دخولٍ: nonce جديدٌ لمتصفّحٍ بعينِهِ. الرمزُ الذي يعودُ بعدَها
   * يجبُ أن يحملَهُ — وهذا هو الربطُ: محاولةٌ لم يبدأها هذا المتصفّحُ لا
   * تُقابَلُ بأيِّ رمزٍ مهما كانَ توقيعُهُ صحيحًا.
   */
  async issueTelegramLoginNonce(): Promise<IssuedLoginNonce> {
    // المحاولةُ هي الرابطُ الثاني: nonce واحدٌ لكلِّ نداءِ، ومحاولةٌ واحدةٌ
    // لكلِّ متصفّحٍ. الكوكي HttpOnly فلا يقرؤهُ إلا هذا المتصفّحُ ومسارُ
    // الدخولِ، والقاعدةُ تحفظُهُ مهشَّرًا.
    const attempt = newToken();
    const nonce = newToken();
    const expiresAt = new Date(this.clock.now().getTime() + NONCE_TTL_MS);
    await this.nonces.issue(hashToken(nonce), hashToken(attempt), expiresAt);
    return { nonce, expires_at: expiresAt.toISOString(), attempt };
  }

  /**
   * يدخلُ الشخصُ من الويبِ برمزِ Telegram OIDC: تحقّقٌ، ثمّ استهلاكٌ واحدٌ،
   * ثمّ الهويةُ والجلسةُ. الرمزُ المرفوضُ لا يلمسُ الهويةَ أصلًا.
   */
  async issueSessionWithTelegramIdToken(
    idToken: string,
    attempt: string,
    correlationId: string,
  ): Promise<WebSignInSession> {
    const now = this.clock.now();
    const verification: TelegramIdTokenVerification = verifyTelegramIdToken(
      idToken,
      await this.options.jwks.current(),
      { issuer: this.options.issuer, audience: this.options.audience },
      now,
    );
    if (!verification.ok) {
      // السببُ المسمّى يصلُ المتصلَ: مطوّرُ الواجهةِ يصلحُ الخطأَ به، والرمزُ
      // المرفوضُ لا يكشفُ شيئًا عن الهوياتِ القائمةِ.
      throw unauthenticated(`telegram id_token refused: ${verification.rejection}`);
    }
    const claims = verification.claims;

    // ربطُ المحاولةِ بالمتصلِ نفسِهِ أولًا (قبلَ حرقِ الرمزِ): محاولةٌ فاشلةٌ —
    // متصفّحٌ آخرَ أو رمزٌ بلا كوكي محاولةٍ — لا تحرقُ الرمزَ، فمالكُهُ يُكملُ
    // محاولتَهُ بهِ بعدَها. الرمزُ يُحرقُ فقط حينَ أكملَ محاولةً مفتوحةً فعلًا.
    // ربطُ المحاولةِ بالمتصلِ نفسِه: الرمزُ يجبُ أن يحملَ nonce مفتوحًا من
    // عندِنا **وللمحاولةِ التي فتحَها كوكي هذا المتصلِّ**. القرارُ ذرّيٌّ واحدٌ
    // في المخزنِّ — nonce ومحاولةً معًا — ويردُّ رفضًا مسمّى واحدًا لكلِّ
    // عائلةِ «هذهِ المحاولةُ ليستْ مفتوحةً لهذا المتصفّحِ الآن»: مجهولةً أو
    // مستهلَكةً أو منتهيةً أو مفتوحةً لمتصفّحٍ آخرَ. التمييزُ بينَها في الجوابِ
    // ليسَ حقًّ للمتصلِ: الفرقَ بينَها يعرفُهُ من فتحَ المحاولةَ فعلًا.
    const issuedNonce = await this.nonces.consumeIfFresh(
      hashToken(String(claims.nonce)),
      hashToken(attempt),
    );
    if (!issuedNonce) {
      throw unauthenticated("telegram id_token refused: nonce_unknown");
    }

    const subject = telegramSubject(claims);
    const registered = await this.identity.registerIdentity({
      channel_type: "telegram",
      external_id: `tg-${subject}`,
      correlation_id: correlationId,
      display_name: typeof claims.name === "string" && claims.name.length > 0 ? claims.name : undefined,
    });

    const { session, token } = await this.identity.issueSession({
      principal_id: registered.principal.principal_id,
      channel_type: "web",
      correlation_id: correlationId,
      // المُصدِرُ هو الشخصُ نفسُهُ — بدليلِهِ الموثَّقِ، لا «system»:
      // سطرُ التدقيقِ يقولُ من فتحَ الجلسةَ وبأيِّ دليلٍ.
      issued_by: registered.principal.principal_id,
    });

    return {
      session_id: session.session_id,
      access_token: token,
      expires_at: session.expires_at,
      identity_id: registered.identity.identity_id,
      identity_created: registered.created,
    };
  }
}

/**
 * الدخولُ غيرُ المُهيَّأِ يُجيبُ بالرفضِ المسمّى لا بالصمتِ — مثلَ محوّلاتِ
 * الإشعاراتِ كاملةً: لا يُختلَقُ مصدرُ جلسةٍ ثانٍ، والغيابُ مرئيٌّ (503).
 */
export function requireWebSignIn(service: WebSignInService | null): WebSignInService {
  if (service === null) throw unavailable("web sign-in is not configured");
  return service;
}

/**
 * مخزنُّ أدلّةِ المصغّرِ — قرارُ «الدليلُ أُستُعمِلَ» يُتَّخَذُ حيثُ الصفُّ
 * الواحدُ: استهلاكٌ ذرّيٌّ واحدٌ، وأولُ مستهلِكٍ يفوزُ. الدليلُ الذي يُرفضُ
 * تحققُّهُ لا يصلُ هنا أصلًا، والذي يصلُ يُستهلَكُ مرةً واحدةً أبديّةً —
 * الصفُّ سجلُّ تدقيقٍ دائمٌ لا حالةً تُنظَّفُ.
 */
export interface MiniAppInitDataStore {
  /**
   * يسجّلُ الدليلَ ويستهلِكُهُ إن كانَ أولَ استعمالٍ — يعيدُ `false` للمستهلَكِ
   * سلفًا. القرارُ ذرّيٌّ في مكانِ الصفِّ: إدراجٌ واحدٌ مشروطٌ بعدمِ الوجودِ.
   */
  consumeIfFirstUse(proofFingerprint: string): Promise<boolean>;
}

/**
 * محوّلُ دخولِ المصغّرِ (D-XR-13): الشخصُ داخلَ تيليجرامَ يُثبِتُ نفسَهُ بدليلٍ
 * منَ المصغّرِ نفسِهِ — `init_data` الموقّعِ بتوقيعِ Ed25519 العلنيِّ — فتتحقّقُ
 * النواةُ منَ التوقيعِ ضدَّ المفاتيحِ المنشورةِ **بلا سرِّ بوتٍ في الخادمِ**،
 * وتُصدِرُ جلسةَ الشخصِ بنفسِها.
 *
 * قراراتٌ محفوظةٌ هنا كما في دخولِ الويبِ:
 *
 *  - **الهويةُ واحدةٌ داخلَ CORE**: الرابطُ على قناةِ `telegram` بمعرّفِ `tg-<id>`
 *    — نفسُ فضاءِ المعرّفاتِ الذي يربطُ بهِ دخولُ الويبِ (`tg-<sub>` منَ OIDC)
 *    والبوتُ عندَ أولِ لقاءٍ. فمن دخلَ منَ الويبِ ومن المصغّرِ هو هويةٌ واحدةٌ
 *    (resolve-or-create)، ومن دخلَ بطريقةٍ ثانيةٍ من حسابٍ مفتوحٍ فهو رابطٌ جديدٌ
 *    للشخصِ نفسِهِ — قرارُ D-XR-13 المعلنُ.
 *  - **الجيلُ المحذوفُ لا يُورِّثُ**: حسابٌ مُقبَرٌ يحرّرُ رابطَ قناتِهِ (ترحيلُ
 *    0024) فإعادةُ الدخولِ بنفسِ القناةِ تُنشئُ هويةً جديدةً لا ميراثَ فيها —
 *    وهذا ما يجعلَ الحذفَ ثمّ إعادةَ التسجيلِ جيلًا جديدًا في MARKET أيضًا
 *    (مفتاحُ الحسمِ CLM-0701).
 *  - **الدليلُ أحاديُّ الاستعمالِ**: بصمةٌ قانونيّةٌ (sha256 لنصِّ التحققِّ نفسِهِ)
 *    تُستهلَكُ في أولِ إتمامٍ — فإعادةُ إرسالِ الدليلِ نفسِهِ، من صاحبِهِ أو من
 *    ملتقطِهِ، رفضٌ مسمّى واحدٌ. المصغّرُ يفتحُ من تيليجرامَ دليلاً طازجًا في
 *    كلِّ مرةٍ، فهذا لا يُغلقُ بابًا مشروعًا ويُغلقُ بابَ إعادةِ التشغيلِ.
 *  - **الجلسةُ على قناةِ `telegram`**: العميلُ هنا ويبْ-فيو تيليجرامَ — والقناةُ
 *    مقيّدةٌ في عقدِ الهويةِ أصلًا، والشخصُ يملكُ على القناةِ رابطًا موثّقًا
 *    (فحصُ الاستحقاقِ في `issueSessionAs` يقرأُهُ من هناك).
 */
export class MiniAppSignInService {
  constructor(
    private readonly identity: IdentityService,
    private readonly proofs: MiniAppInitDataStore,
    private readonly config: TelegramMiniAppVerificationConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * يدخلُ الشخصُ منَ المصغّرِ بدليلِ `init_data`: تحقّقٌ منَ التوقيعِ العلنيِّ،
   * ثمّ استهلاكٌ واحدٌ للدليلِ، ثمّ الهويةُ والجلسةُ. الدليلُ المرفوضُ لا يلمسُ
   * المخزنَّ ولا الهويةَ أصلًا — والاستهلاكُ يسبقُ أيَّ أثرٍ آخرَ (هويةٍ أو جلسةٍ).
   */
  async issueSessionWithInitData(
    initData: string,
    correlationId: string,
  ): Promise<WebSignInSession> {
    const verification = verifyTelegramInitData(initData, this.config, this.clock.now());
    if (!verification.ok) {
      // السببُ المسمّى يصلُ المتصلَ: مطوّرُ المصغّرِ يصلحُ الخطأَ به، والدليلُ
      // المرفوضُ لا يكشفُ شيئًا عنِ الهوياتِ القائمةِ.
      throw unauthenticated(`telegram init_data refused: ${verification.rejection}`);
    }

    const consumed = await this.proofs.consumeIfFirstUse(verification.proofFingerprint);
    if (!consumed) {
      throw unauthenticated("telegram init_data refused: proof_already_used");
    }

    const registered = await this.identity.registerIdentity({
      channel_type: "telegram",
      external_id: `tg-${verification.user.id}`,
      correlation_id: correlationId,
      ...(verification.user.firstName !== undefined
        ? { display_name: verification.user.firstName }
        : {}),
    });

    const { session, token } = await this.identity.issueSession({
      principal_id: registered.principal.principal_id,
      channel_type: "telegram",
      correlation_id: correlationId,
      // المُصدِرُ هو الشخصُ نفسُهُ — بدليلِهِ الموقّعِ، لا «system»:
      // سطرُ التدقيقِ يقولُ من فتحَ الجلسةَ وبأيِّ دليلٍ.
      issued_by: registered.principal.principal_id,
    });

    return {
      session_id: session.session_id,
      access_token: token,
      expires_at: session.expires_at,
      identity_id: registered.identity.identity_id,
      identity_created: registered.created,
    };
  }
}

/**
 * دخولُ المصغّرِ غيرُ المُهيَّأِ يُجيبُ بالرفضِ المسمّى لا بالصمتِ — نفسُ حكمِ
 * الويبِ: لا يُختلَقُ مصدرُ جلسةٍ ثانٍ، والغيابُ مرئيٌ (503).
 */
export function requireMiniAppSignIn(service: MiniAppSignInService | null): MiniAppSignInService {
  if (service === null) throw unavailable("mini app sign-in is not configured");
  return service;
}
