# خارطة طريق منظومة وَصْلة — الوثيقة المشتركة بين المستودعات الثلاثة

> **هذا الملف نسخة واحدة متطابقة حرفًا في ثلاثة مستودعات** وفي المسار نفسه `docs/ecosystem/ECOSYSTEM_ROADMAP.md`:
> [`nooonvg/wasla`](https://github.com/nooonvg/wasla) (MARKET) · [`nooonvg/wasla-core`](https://github.com/nooonvg/wasla-core) (CORE) · [`nooonvg/ceezr`](https://github.com/nooonvg/ceezr) (MOVE).
> أي تعديل عليه يُدمج في المستودعات الثلاثة بالمراجعة نفسها (`Revision`)، ويفرض التطابق الفحص `docs/ecosystem/check-ecosystem-sync.mjs` وسير العمل `ecosystem-sync.yml` في كل مستودع.

| الحقل | القيمة |
|---|---|
| Revision | 3 |
| التاريخ | 2026-10-21 |
| مصدر القرار | تعليمتا المالك المسجلتان نصًا في §1 (2026-10-21): الأولى أسست المراجعة 1، والثانية (القنوات المتعددة والحساب الواحد) أسست المراجعة 2. المراجعة 3 لا تضيف قرارًا: تسجل ما أُغلق بأدلته (§9) بتفويض المالك الكامل في 2026-10-21 |
| رؤوس `main` المقيسة عند الكتابة | wasla `5104858` · wasla-core `a46bdb5` · ceezr `30cf8ce` (رؤوس المراجعات السابقة في §8) |
| معرّفات هذه الخارطة | `XR-<المرحلة>.<البند>` — بادئة جديدة لا تتقاطع مع `WR-` و`PRD-` و`ECO-` و`F9..F12` في ceezr، ولا مع `Mx-yy` و`CLM-` و`RISK-` في wasla، ولا مع `B-` و`D-` وأرقام المعالم في wasla-core |

## 0. كيف تُقرأ هذه الخارطة

1. **لا تحل محل الخرائط الداخلية.** لكل مستودع خارطته الحاكمة وبواباته، وهي باقية ملزمة:
   - MOVE: [`ORDER-20261012.md`](https://github.com/nooonvg/ceezr/blob/main/docs/roadmap/execution/ORDER-20261012.md) و[`STATUS.md`](https://github.com/nooonvg/ceezr/blob/main/docs/roadmap/execution/STATUS.md) (`DEC-25`)، و[بوابة الجاهزية](https://github.com/nooonvg/ceezr/blob/main/docs/governance/PRODUCTION_READINESS_GATE.md) (ADR 0246)، و`ROADMAP.md`.
   - MARKET: [`LAUNCH_EXECUTION_BOARD.md`](https://github.com/nooonvg/wasla/blob/main/docs/16-progress/LAUNCH_EXECUTION_BOARD.md) و[`LAUNCH_TO_100_ROADMAP.md`](https://github.com/nooonvg/wasla/blob/main/docs/16-progress/LAUNCH_TO_100_ROADMAP.md) و`ROADMAP.md` (ADR-017).
   - CORE: [`ROADMAP.md`](https://github.com/nooonvg/wasla-core/blob/main/ROADMAP.md) (المعالم وسجل العوائق `B-`).
2. **هذه الخارطة طبقة فوقها:** تحدد ملكية المجالات بين الأنظمة، وترتب المراحل المشتركة، وتربط كل بند مشترك ببنود الخرائط الداخلية بأرقامها. حالة البند الداخلي تُقرأ من مستودعه، لا من هنا.
3. **مراتب الإثبات** المستعملة في كل جدول: `[مقيس]` قرأناه من الشيفرة أو الوثيقة الحاكمة في رأس `main` المذكور أعلاه · `[موثّق]` مكتوب في وثائق المستودع ولم يُعَد قياسه هنا · `[مقترح]` قرار هذه الخارطة · `[موثّق خارجيًا]` من الوثائق الرسمية لمنصة خارجية (آبل، جوجل، تيليجرام، ديسكورد) كما قُرئت يوم الكتابة، وقد تتغير · `[غير متحقق]` لا دليل عليه بعد. لا يُرفع بند إلى «مكتمل» هنا إلا بدليل في مستودعه.
4. **التزامن:** كل مرحلة لها مسار لكل مستودع وبوابة خروج واحدة. لا تبدأ مرحلة تعتمد على أخرى قبل بوابة خروج تلك المرحلة، والمراحل المستقلة تجري متوازية.

## 1. تعليمات المالك (نصها، 2026-10-21)

**التعليمة الأولى (أساس المراجعة 1):**

> «لك صلاحية كاملة في صياغة الخطة وخارطة الطريق كاملة مفصلة ودمجها في كل الثلاثة المشاريع ولكن لا تهلوس، أريد أن تكون خارطة الطريق حقيقية 100%، وأريدها أن تشمل كل شيء بلا استثناء وتكون متطابقة جميع الثلاث الخارطات … سير عمل خارطة الطريق في كل مشروع متناسقة ومتزامنة … حتى لو أردت حذف التوصيل من ماركت والاعتماد على ceezr لك كل الصلاحيات.»

**التعليمة الثانية (أساس المراجعة 2):**

> «لابد أن يكون واجهته ليست فقط تيليجرام أو ميني اب، لابد أن يكون ميني اب تيليجرام وديسكورد وتطبيق أندرويد وتطبيق آيفون ومناسب للمتصفحات، سواء للكمبيوتر أو غيرها، لابد أن يكون هناك عدة تطبيقات، باستثناء الزبون فهو يستطيع استخدام تطبيق واحد يبحث عن بضاعته أو يشتري أو يطلب مشوار أو يطلب توصيل، وإذا ترى أن بإمكانه أن يقوم برفع بضاعته وبيعها عبر وصلة، أريد أن يكون وصلة تجعل بإمكان أي شخص أن يكون كما يريد سواء شريك أو زبون أو صاحب متجر أو سائق، يختار ما يريد ويدير تجارته ووضعه ويطلب ما يريد من خلال وصلة … قم بدمج ما أخبرتك كله بعد وضع خطة محكمة … قم بضم ذلك إلى خارطات الطريق.»

## 2. الحقائق التي بُنيت عليها القرارات

| # | الحقيقة | المرتبة | المرجع |
|---|---|---|---|
| F-1 | التقسيم المعلن: MARKET = التجار والمتاجر والمنتجات والمخزون والطلبات التجارية والبحث؛ MOVE = السائقون والمركبات والمهام التشغيلية والمشاوير وتنفيذ التوصيل والتوزيع والتتبع وإثبات التسليم؛ CORE = الهوية والصلاحيات والمنظمات والمال والاشتراكات والسمعة والقنوات والإشعارات والعمود الفقري للأحداث وتنسيق التنفيذ (fulfillment). ثلاثة مستودعات منفصلة دائمًا، بلا مستودع موحد ولا حزمة تشغيل مشتركة ولا وصول بين قواعد البيانات | [مقيس] | [wasla-core README](https://github.com/nooonvg/wasla-core/blob/main/README.md) · [CORE ADR 0001/0002/0007](https://github.com/nooonvg/wasla-core/blob/main/docs/adr/README.md) |
| F-2 | MOVE هو النظام الوحيد الذي عمل في الإنتاج بمستخدمين حقيقيين: بنود منشورة ومتحقق منها في الإنتاج (WR-04، 05، 09، 12، 14، 18، 20)، والمدن الخمس مفعّلة. آخر قياس إنتاج موثّق 2026-10-13، وبعده أوقف Render الخدمات لتجاوز حصة الفوترة (`OPS-EGRESS-01`) | [موثّق] | [ceezr STATUS.md](https://github.com/nooonvg/ceezr/blob/main/docs/roadmap/execution/STATUS.md) · [ceezr AGENTS.md §4](https://github.com/nooonvg/ceezr/blob/main/AGENTS.md) |
| F-3 | MOVE مستقل بتعليمة المالك `O-7` (ADR 0094)، وتكامل CORE مُخرَج إلى `deferred/core-integration/` بشرط استئناف مكتوب: «قرار مالك صريح يلغي O-7 أو يقيده» | [مقيس] | [ADR 0094](https://github.com/nooonvg/ceezr/blob/main/docs/adr/0094-move-is-a-standalone-commercial-product.md) · [deferred/core-integration/README.md](https://github.com/nooonvg/ceezr/blob/main/deferred/core-integration/README.md) |
| F-4 | MARKET قرار إصداره `NO-GO`، والبرنامج «Blocked — لا إطلاق خارجي»، وبنود الإصدار M7-01..M7-06 لم تبدأ؛ فلا مستخدمين خارجيين ولا بيانات إنتاج تجارية فيه | [مقيس] | [LAUNCH_EXECUTION_BOARD.md](https://github.com/nooonvg/wasla/blob/main/docs/16-progress/LAUNCH_EXECUTION_BOARD.md) |
| F-5 | MARKET يحمل نسخة موازية كاملة من مجال MOVE: `services/dispatch` (≈13.3 ألف سطر TS) و`drivers` (≈15.3 ألف) و`matching` (≈9.5 ألف) و`negotiations` (≈16.3 ألف) و`orders` (طلب النقل، آلة 21 حالة، ≈11.7 ألف) و`customers` (نشر طلب المشوار، ≈11.5 ألف) و`rides` (فارغ)، و`apps/driver-mini-app` و`bots/driver-bot` و`bots/customer-bot` | [مقيس] عدّ أسطر `*.ts` المتتبعة في `9d6925c` | [wasla services/](https://github.com/nooonvg/wasla/tree/main/services) |
| F-6 | `services/delivery` في MARKET (≈32.1 ألف سطر) تملك مجموعتين: **طلب المتجر** `store_order` (مجال تجاري = MARKET) و**مهمة التوصيل** `delivery_task` التي تفوّض المطابقة والإرسال إلى `services/dispatch` (مجال MOVE) | [مقيس] | [ADR-026](https://github.com/nooonvg/wasla/blob/main/docs/15-decisions/ADR-026-store-orders-and-delivery-boundary.md) §2.1 و§2.4 |
| F-7 | MARKET يحمل أيضًا نسخًا من مجالات CORE: `identity` (≈7 آلاف) و`subscriptions` (≈14 ألف) و`billing` (≈5.4 ألف) و`reputation` (≈16.2 ألف)، و`notifications` و`auth` فارغان | [مقيس] | [wasla services/](https://github.com/nooonvg/wasla/tree/main/services) |
| F-8 | CORE: المعلم 1 (الدخول والخروج للأحداث) «مكتمل من جهة CORE»، والمعلم 5 (تبنّي العقود في MOVE وMARKET) «محجوب — اعتماد خارجي»، والتنفيذ على ناقل محلي فقط، والنشر محجوب بـB-5 وB-6 | [مقيس] | [wasla-core ROADMAP.md](https://github.com/nooonvg/wasla-core/blob/main/ROADMAP.md) «Remaining, in dependency order» |
| F-9 | نسخ عقود CORE المنسوخة في MOVE (`docs/contracts/core/`: المغلّف وخمسة مخططات أحداث) مطابقة بايتًا لنسخ wasla-core الحالية | [مقيس] مقارنة ملفات في 2026-10-21 | [ceezr docs/contracts/core](https://github.com/nooonvg/ceezr/tree/main/docs/contracts/core) · [wasla-core contracts](https://github.com/nooonvg/wasla-core/tree/main/contracts) |
| F-10 | مغلّف أحداث MARKET المحلي (`event_version`، `aggregate`) يختلف عن مغلّف CORE (`version`، `correlation_id`، `causation_id`، `entity_type`، `entity_id`، ونمط `event_type` يبدأ بـ`core.|move.|market.`)، ولا منتج لحدث `market.order.created` بهذا الاسم في MARKET | [مقيس] | [wasla-core contracts/events](https://github.com/nooonvg/wasla-core/tree/main/contracts/events) |
| F-11 | لا مزود دفع حي في MOVE (F12-11 «تأجيل»)، وCORE يملك محرك المال لكنه غير منشور | [موثّق] | [بوابة الجاهزية PRD-205](https://github.com/nooonvg/ceezr/blob/main/docs/governance/PRODUCTION_READINESS_GATE.md) · [CORE ADR 0005](https://github.com/nooonvg/wasla-core/blob/main/docs/adr/README.md) |
| F-12 | حادثة أمنية مفتوحة في MARKET: `INC-0007` (مفتاح Render API ومعرّف المالك ورموز بوتات مكشوفة)، وPR #730 محجوز حتى تدوير المفتاح | [موثّق] | [INCIDENTS.md](https://github.com/nooonvg/wasla/blob/main/docs/07-security/INCIDENTS.md) |
| F-13 | المستودعات الثلاثة نُقلت إلى الحساب `nooonvg` (عامة)، والمراجع الداخلية ما زالت تشير إلى `uxxxug/*` و`noor-seez/*` و`skyosv10-art/*` و`gitlab.com/uxxxu/*`. والفرع الافتراضي لـwasla كان `fix/clm-0576-attestation-verify-gate` لا `main` | [مقيس] | إعدادات GitHub للمستودعات |
| F-14 | قياس CORE المحلي في 2026-10-21 على `995f4fa`: `npm ci` ثم فحص الأنواع نظيف، ومجموعة الاختبارات `WASLA_TEST_PASS=suite` = 868 ناجحًا و147 متخطى؛ مراحل العنقود وقاعدة البيانات لم تُشغَّل | [مقيس] محليًا | — |
| F-15 | خارطة MARKET نفسها تقرر الحد نفسه مسبقًا: «`drivers`، `dispatch`، `matching`، `rides`، `delivery` belong to MOVE; `identity`، `auth`، `billing`، `subscriptions`، `notifications`، `reputation`، `referrals`، `geography`، `audit`، `compliance`، `support` belong to CORE. They stay in place until their replacement is proven» | [مقيس] | [wasla ROADMAP.md](https://github.com/nooonvg/wasla/blob/main/ROADMAP.md) «Current state of this repository» |
| F-16 | **كل واجهات المستخدم اليوم تيليجرام فقط** (تطبيق مصغر أو بوت) في المستودعات الثلاثة. لا شيفرة لديسكورد، ولا مشروع Android أو iOS، ولا Capacitor أو React Native أو Expo، ولا ملف PWA manifest أو service worker. ذكر ديسكورد الوحيد في ملفين من أدلة CI في wasla. والـAndroid وiOS المذكوران في وثائق MOVE هما عميلا تيليجرام على هذين النظامين | [مقيس] بحث نصي في الملفات المتتبعة عند الرؤوس المذكورة | [wasla apps/](https://github.com/nooonvg/wasla/tree/main/apps) · [ceezr apps/](https://github.com/nooonvg/ceezr/tree/main/apps) |
| F-17 | في MOVE صف المستخدم `users` يحمل `telegram_id bigint not null unique` و`role user_role not null`، والتعداد `user_role` = `rider`، `driver`، `support`، `admin`. فلا يوجد مستخدم بلا تيليجرام، وللمستخدم دور واحد: الشخص نفسه لا يكون راكبًا وسائقًا بالحساب نفسه | [مقيس] | [ceezr هجرة phase_2_1_core_schema](https://github.com/nooonvg/ceezr/blob/main/supabase/migrations/20260806120000_phase_2_1_core_schema.sql) |
| F-18 | قرار المالك `DEC-07` في MOVE (2026-09-21): «تيليجرام مزود الهوية الوحيد للإطلاق الرسمي الأول»، ورُدّت بدائل ADR 0031 (جوال+OTP، نفاذ، الترقية) لأن كلًا منها يشترط تبعية خارجية غير متاحة (اشتراك مزود رسائل، سجل تجاري). و`ARCH-014` («التطبيق يعمل من متصفح عادي بمصادقة بديلة») و`TG-004` مفتوحان بلا تاريخ | [مقيس] | [ceezr ROADMAP-MASTER.md](https://github.com/nooonvg/ceezr/blob/main/docs/ROADMAP-MASTER.md) · [ADR 0164](https://github.com/nooonvg/ceezr/blob/main/docs/adr/0164-dec-07-telegram-is-the-only-identity-provider-for-launch-one.md) |
| F-19 | تطبيق MOVE المصغر يمرر كل استدعاء تيليجرام عبر طبقة واحدة قابلة للاستبدال `apps/miniapp/src/tg/` (شرط `ARCH-014`)، وله أسطح جذرية بحسب الدور: `rider`، `driver`، `admin`، `onboarding` | [مقيس] | [ceezr role-route.ts](https://github.com/nooonvg/ceezr/blob/main/apps/miniapp/src/routing/role-route.ts) |
| F-20 | هوية CORE: شخص واحد (`principal`) له روابط قنوات كثيرة (`identity_link`) بـ`channel_type` ∈ `telegram`، `phone`، `email`، `web`، `partner_api` وقيد `UNIQUE (channel_type, external_id)`، وعضويات شخص↔منظمة تحمل الأدوار. أدوار CORE عامة (`platform_admin`، `org_admin`، `org_member`، `support_agent`، `service`) والنص: «Product-specific capability lives in the product». لا قناة `discord` ولا `apple` ولا `google` بعد | [مقيس] | [CORE 0001_core_foundation.sql](https://github.com/nooonvg/wasla-core/blob/main/db/migrations/0001_core_foundation.sql) · [identity-access/domain.ts](https://github.com/nooonvg/wasla-core/blob/main/src/modules/identity-access/domain.ts) |
| F-21 | هوية MARKET (المجمّدة في XR-1.2): `identity_links.provider` ∈ `telegram`، `phone`، `email`، `web`، `mobile`، و`identity_sessions.channel` ∈ `telegram`، `web`، `mobile`. وملف الزبون يشير إلى الهوية مرجعًا معتمًا «ووجوده لا يمنع ملف سائق للشخص نفسه» | [مقيس] | [wasla identity schema.sql](https://github.com/nooonvg/wasla/blob/main/services/identity/contracts/schema.sql) · [customers schema.sql](https://github.com/nooonvg/wasla/blob/main/services/customers/contracts/schema.sql) |
| F-22 | تطبيق زبون MARKET `apps/customer-mini-app` هو من الآن بشكل «التطبيق الواحد»: شاشات `Home`، `Search`، `Marketplace`، `RideOrder`، `DeliveryOrder`، `MyOrders`، `SavedPlaces`، `Reputation`، `Profile`، لكنه يعمل داخل تيليجرام فقط (تهيئة الجلسة من `Telegram.WebApp`)، وساق المشوار فيه تعتمد مجال MOVE المجمّد في MARKET. أما `apps/partner-mini-app` و`apps/admin-web` فمجلدان فارغان، وADR-046 أجّل تطبيق الشريك لصالح البوت | [مقيس] | [customer-mini-app screens](https://github.com/nooonvg/wasla/tree/main/apps/customer-mini-app/src/screens) · [ADR-046](https://github.com/nooonvg/wasla/blob/main/docs/15-decisions/ADR-046-defer-partner-mini-app.md) |
| F-23 | في MARKET أدوار طاقم المتجر `owner`، `manager`، `staff`، ولا مفهوم لبائع فرد (بيع من زبون إلى زبون) في مجال `marketplace` | [مقيس] بحث نصي | [marketplace schema.sql](https://github.com/nooonvg/wasla/blob/main/services/marketplace/contracts/schema.sql) |
| F-24 | Discord Activities تطبيقات ويب تعمل في iframe داخل ديسكورد على الحاسوب والجوال والويب عبر Embedded App SDK، وكل Activity مربوط بتطبيق مسجل في بوابة مطوري ديسكورد، والمصادقة بـOAuth2 (`authorize` ثم `authenticate`) | [موثّق خارجيًا] | [Discord Activities Overview](https://docs.discord.com/developers/activities/overview) · [How Activities Work](https://docs.discord.com/developers/activities/how-activities-work) |
| F-25 | تيليجرام يوفر تسجيل دخول للمواقع الخارجية (مكتبة Telegram Login أو OpenID Connect) وحزمًا أصلية لتطبيقات iOS وAndroid، ويحتاج بوتًا وتسجيل العناوين المسموحة في @BotFather | [موثّق خارجيًا] | [Log In With Telegram](https://core.telegram.org/bots/telegram-login) |
| F-26 | إرشادات مراجعة App Store: 4.8 (من يستعمل تسجيل دخول من طرف ثالث للحساب الأساسي يلزمه خيار مكافئ يحد البيانات ويخفي البريد، وSign in with Apple يستوفيه)، و5.1.1(v) (إن لم تكن الوظيفة الأساسية مرتبطة بشبكة اجتماعية فيجب وصول بلا تسجيل أو بآلية أخرى، وحذف الحساب داخل التطبيق إلزامي)، و4.2 (التطبيق يجب أن يتجاوز «موقعًا معاد التغليف»)، و3.1.3(e) (السلع المادية والخدمات المستهلكة خارج التطبيق تُدفع بغير الشراء داخل التطبيق) | [موثّق خارجيًا] | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) |
| F-27 | النشر في المتاجر يحتاج عضوية Apple Developer Program (99 دولارًا سنويًا) وحساب Google Play Console (رسم تسجيل 25 دولارًا مرة واحدة) | [موثّق خارجيًا] | [Apple Developer Program](https://developer.apple.com/programs/whats-included/) · [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) |
| F-28 | Capacitor يغلّف تطبيق ويب قائمًا في تطبيقي iOS وAndroid أصليين ويخرج PWA من الشيفرة نفسها، مع إضافات للوصول إلى ميزات الجهاز. لم يُجرَّب في أي من المستودعات الثلاثة | [موثّق خارجيًا] · التجربة [غير متحقق] | [Capacitor](https://capacitorjs.com/) |

## 3. القرارات المعمارية لهذه الخارطة

| # | القرار | المرتبة | يُسجَّل في |
|---|---|---|---|
| D-XR-1 | **MOVE (ceezr) هو المالك الوحيد لتنفيذ النقل والتوصيل**: السائقون، والمركبات، والتوزيع، والمطابقة، والتفاوض على المشوار، والمشاوير، ومهام التوصيل، والتتبع، وإثبات التسليم. لا يُبنى منطق من هذا المجال في MARKET أو CORE بعد اليوم | [مقترح] بتفويض المالك §1 | wasla ADR-076 · ceezr ADR 0292 |
| D-XR-2 | **إزالة التوصيل من MARKET تكون على مرحلتين، لا حذفًا فوريًا:** تجميد فوري (XR-1) ثم حذف بعد أن يعمل البديل (XR-5). السبب المقيس: `delivery_task` هو الطريق الوحيد الحالي لتسليم طلب المتجر (F-6)، وحذفه قبل البديل يترك `store_order` بلا مسار تسليم. ولأن MARKET لم يُطلق (F-4)، فلا بيانات إنتاج تُرحَّل عند الحذف | [مقترح] | wasla ADR-076 |
| D-XR-3 | **طلب المتجر يبقى في MARKET** (`store_order` وأصنافه وحالة الدفع المرآة). أما ساق التوصيل فتُستبدل بطلب تنفيذ إلى CORE (`core.fulfillment.*`) يُنفّذه MOVE مهمةً تشغيلية (`move.job.*`) | [مقترح] | wasla ADR-076 |
| D-XR-4 | **مجالات CORE في MARKET** (F-15): المكرر منها تكرارًا كاملًا لنظام قائم في CORE (`identity`، `subscriptions`، `billing`، `reputation`) يُجمَّد في XR-1 ولا يُوسَّع، ويُستبدل بعقود CORE في XR-6 ثم يُحذف. والباقي (`geography`، `audit`، `support`، `compliance`، `referrals`، `auth`، `notifications`) يبقى في مكانه حتى يثبت بديله في CORE كما تقرر خارطة MARKET، ولا يُجمَّد الآن لأن `geography` يخدم عملًا جاريًا في MARKET (G-S9.3) والبقية فارغة أو صغيرة | [مقترح] | wasla ADR-076 |
| D-XR-5 | **تعديل `O-7` لا إلغاؤه:** «كل مستودع يبقى قابلًا للبناء والإصدار باستقلال. إطلاق MOVE لا ينتظر MARKET أو CORE. القدرات المشتركة تصبح مرجعية عبر محطات تكامل معتمدة ومختبرة فقط.» فيبقى إطلاق MOVE التجاري أولوية مستقلة، ويُفتح شرط استئناف `deferred/core-integration/` بمحطة محددة (XR-4) لا بقرار عام | [مقترح] بتفويض المالك §1 | ceezr ADR 0292 · ceezr `DEC-26` |
| D-XR-6 | **لا اتصال مباشر بين MOVE وMARKET.** كل تكامل يمر عبر CORE بأحداث بمغلّف CORE (CORE ADR 0007، وسجل الخروج في MOVE `packages/shared/wasla/egress-registry.ts`) | [مقيس] قائم ويُثبَّت | — |
| D-XR-7 | **الساق المالية للتكامل مشروطة** بقرار مزود الدفع (F12-11) وسياسة التسعير (CORE B-4، MOVE F12-16). قبل ذلك يجري التكامل بلا حجز ولا تحصيل مالي في CORE | [مقترح] | هذه الخارطة |
| D-XR-8 | **مصدر الحقيقة لمكان المستودعات** هو `github.com/nooonvg/*`، والفرع الافتراضي لكل مستودع `main` | [مقترح] نُفّذ في XR-0.4 | هذه الخارطة |
| D-XR-9 | **حساب وصلة واحد لكل شخص، وهو `principal` في CORE.** كل قناة (تيليجرام، ديسكورد، الويب، Android، iOS) وكل طريقة دخول رابط (`identity_link`) بهذا الشخص لا هوية مستقلة (F-20). لا يُوسَّع نظام هوية MARKET المجمّد (F-21) ولا يُبنى نظام هوية جديد في MOVE للقنوات الجديدة: القنوات الجديدة تدخل من CORE وحده | [مقترح] بتفويض §1 | wasla ADR-077 · ceezr ADR 0293 · CORE `ROADMAP.md` |
| D-XR-10 | **الدور قدرة تُفعَّل على الحساب نفسه، لا حساب جديد.** الشخص الواحد يجمع ما يشاء: **زبون** (افتراضي لكل حساب بلا طلب)، **بائع فرد** (MARKET، مشروط بـD-XR-16)، **صاحب متجر** (منظمة في CORE وعضوية `org_admin`، ومتجر وطاقم `owner/manager/staff` في MARKET)، **سائق** (ملف سائق في MOVE بعد التحقق من مستنداته)، **شريك** (تعريفه قرار المالك OD-XR-6). أدوار CORE تبقى عامة، وملف كل دور يعيش في منتجه (F-20). وهذا يستلزم في MOVE استبدال الدور المفرد و`telegram_id` الإلزامي (F-17) في XR-6.1 | [مقترح] | wasla ADR-077 · ceezr ADR 0293 |
| D-XR-11 | **خريطة التطبيقات (§4-أ):** تطبيق واحد للزبون هو **«وصلة»** ومكانه MARKET (يتطور من `apps/customer-mini-app`، F-22)، وتطبيق للسائق **«وصلة كابتن»** ومكانه MOVE (سطح `driver` في `apps/miniapp`)، وتطبيق لأصحاب المتاجر والباعة والشركاء **«وصلة أعمال»** ومكانه MARKET (`apps/partner-mini-app`، يرفع تأجيل ADR-046)، ولكل مستودع لوحة إدارته. الأسماء مؤقتة (OD-XR-7). تطبيق الزبون عميل واجهة لا خدمة: استدعاؤه واجهة MOVE العامة لطلب المشوار بجلسة CORE (XR-8.6) لا يخالف D-XR-6 لأن D-XR-6 يحكم التكامل بين الخدمات، ولا تمس خدمة MARKET المشوار. وسطح الراكب في MOVE يبقى منتج MOVE المستقل (`O-7` المقيّد)، ومصيره بعد أن يعمل المشوار من «وصلة» قرار OD-XR-8 | [مقترح] بتفويض §1 | wasla ADR-077 · ceezr ADR 0293 |
| D-XR-12 | **شيفرة ويب واحدة لكل تطبيق، وأغلفة متعددة.** كل تطبيق يعزل منصة تشغيله خلف «طبقة مضيف» واحدة (النمط القائم في MOVE `tg/`، F-19)، وتُنتج منه خمسة أغلفة: تطبيق تيليجرام المصغر (قائم)، الويب المتجاوب مع PWA للحاسوب والجوال، Discord Activity (F-24)، وتطبيقا Android وiOS بغلاف أصلي. أداة الغلاف الأصلي لا تُحسم هنا: Capacitor مرشح أول (F-28)، والحسم بـADR بعد تجربة XR-8.4. والغلاف الأصلي يجب أن يضيف ميزات أجهزة حقيقية (إشعارات، موقع، كاميرا، عمل منقطع) لأن إرشاد آبل 4.2 يرفض الموقع المعاد تغليفه (F-26) | [مقترح] | wasla ADR-077 · ceezr ADR 0293 |
| D-XR-13 | **الدخول بطرق متعددة يُنتج جلسة CORE واحدة.** الطرق المقترحة وكلها بلا اشتراك مزود رسائل (السبب الذي ردّ به `DEC-07` البدائل، F-18): `initData` داخل تيليجرام (قائم)، Telegram Login للويب والتطبيقات (F-25)، Discord OAuth2 داخل Activity وعلى الويب (F-24)، Sign in with Apple على iOS (مطلوب إذا عُرض تيليجرام أو ديسكورد، F-26)، ومفاتيح المرور (passkeys) للعودة بلا طرف ثالث. الجوال+OTP والبريد يحتاجان مزود إرسال فهما قرار المالك (OD-XR-4). الدخول بطريقة ثانية من حساب مفتوح = رابط جديد للشخص نفسه، ودمج حسابين موجودين خاضع لسياسة B-3. وحذف الحساب من داخل التطبيق إلزامي في كل الأغلفة | [مقترح] | CORE `ROADMAP.md` · wasla ADR-077 · ceezr ADR 0293 |
| D-XR-14 | **`DEC-07` يبقى نافذًا على الإطلاق الأول لـMOVE (XR-2) ولا يُمسّ.** تعليمة المالك الثانية تحدد الوجهة بعده: القنوات الجديدة في MOVE تبدأ بعد XR-2.1 وبعد أن يقبل MOVE جلسة CORE (XR-6.1)، لأن تجميد الميزات `PRD-010` في بوابة جاهزية MOVE قائم. أما MARKET وCORE فلم يُطلقا (F-4)، فتُبنى القنوات المتعددة فيهما من الآن | [مقترح] | ceezr ADR 0293 · `DEC-27` |
| D-XR-15 | **رابط واحد لكل شيء عام** (منتج، متجر، طلب، مشوار، دعوة) على نطاق وصلة، يفتح في القناة التي يكون فيها المستخدم: التطبيق الأصلي إن كان مثبتًا، أو تيليجرام، أو ديسكورد، وإلا الويب. فيصبح كل منتج قابلًا للمشاركة في مجموعات تيليجرام وخوادم ديسكورد ويفتح في مكانه. النطاق قرار المالك (OD-XR-7) | [مقترح] | wasla ADR-077 |
| D-XR-16 | **البيع من الأفراد («بِع غرضك») ممكن ومؤجل بشروط:** مزود دفع يحمي الطرفين (F12-11)، وسياسة منتجات محظورة وتحقق (OD-XR-5)، ومراجعة نظامية (OD-XR-9). لا يُبنى قبلها شيء منه في الشيفرة. وتصميمه المقترح: البائع الفرد متجر من نوع `individual` في MARKET بمالك واحد، لا مجال جديد، فيرث الكتالوج والطلب والتوصيل عبر MOVE | [مقترح] | wasla ADR-077 |
| D-XR-17 | **سلّم الأدوار من داخل التطبيق:** من صفحة «حسابي» في «وصلة» يختار الشخص «بِع غرضًا» أو «افتح متجرًا» أو «انضم كابتنًا» أو «كن شريكًا»، فيُفتح المسار بالحساب نفسه بلا تسجيل جديد، ثم يُنقل إلى التطبيق المختص عند التفعيل (مبدّل تطبيقات بين التطبيقات الثلاثة بالجلسة نفسها). انضمام السائق يبقى مشروطًا بتحقق MOVE (رفع المستندات WR-21 متوقف اليوم) | [مقترح] | wasla ADR-077 · ceezr ADR 0293 |

## 4. المراحل المتزامنة

```text
XR-0  الحوكمة وخط الأساس           ← الآن، الثلاثة معًا
XR-1  تجميد الحدود                  ← بعد XR-0، الثلاثة معًا
XR-2  إطلاق MOVE مستقلًا            ← متوازٍ مع XR-1..XR-3 (لا ينتظر غيره)
XR-3  جاهزية CORE وMARKET للتكامل  ← متوازٍ مع XR-2
XR-4  رحلة التكامل الأولى: توصيل طلب المتجر عبر CORE إلى MOVE  ← بعد XR-3 وبعد بوابة XR-2 للتفعيل الإنتاجي
XR-5  حذف المكرر من MARKET          ← بعد بوابة XR-4
XR-6  الخدمات المشتركة عبر CORE (الهوية، الاشتراكات، السمعة، المال)  ← بعد XR-4، ومشروط بقرارات المالك
XR-7  إطلاق MARKET والمنظومة        ← بعد XR-5 وXR-6، وحدّه الأدنى من XR-8 (تيليجرام + الويب)
XR-8  القنوات المتعددة والحساب الواحد والتطبيقات الثلاثة (Revision 2)
      8.1 المواصفة والقرارات                ← الآن، الثلاثة معًا
      8.2..8.4 طبقة المضيف والويب/PWA وتجربة الغلاف الأصلي  ← MARKET الآن متوازيًا مع XR-3؛ MOVE بعد XR-2.1
      8.5 الهوية متعددة القنوات في CORE      ← ممكن الآن: XR-3.2 مغلق (المراجعة 3)
      8.6 المشوار من تطبيق «وصلة»             ← بعد XR-2.1 وXR-6.1
      8.7 ديسكورد · 8.8 المتاجر              ← بعد قرارات المالك OD-XR-1..4
      8.9 سلّم الأدوار · 8.11 «وصلة أعمال»       ← بعد 8.5 (وجزء السائق بعد XR-6.1)
      8.10 «بِع غرضك»                          ← بعد F12-11 وOD-XR-5 وOD-XR-9
```

### 4-أ. خريطة التطبيقات والأدوار والقنوات (الهدف المقترح، D-XR-9..17)

| التطبيق (الاسم مؤقت) | لمن | ما يفعله | المستودع المالك | نقطة البداية المقيسة |
|---|---|---|---|---|
| **وصلة** | كل شخص (زبون) | البحث عن البضائع، الشراء من المتاجر، طلب مشوار، طلب توصيل (طرد أو طلب متجر)، طلباتي، الأماكن المحفوظة، السمعة، «بِع غرضك» (لاحقًا)، وبوابة سلّم الأدوار | MARKET (واجهة)؛ المشوار والتوصيل تنفذهما MOVE؛ الهوية والمال CORE | `apps/customer-mini-app` بشاشاته التسع (F-22) |
| **وصلة كابتن** | السائق | استقبال المشاوير ومهام توصيل المتاجر في طابور واحد (بعد XR-4)، التفاوض، التتبع، إثبات التسليم، الأرباح، المستندات | MOVE | سطح `driver` في `apps/miniapp` (F-19) |
| **وصلة أعمال** | صاحب المتجر، طاقمه، البائع المحترف، الشريك | المتجر والمنتجات والمخزون والطلبات والتفاوض وحالة التوصيل والطاقم والاشتراك | MARKET | `apps/partner-mini-app` فارغ وADR-046 مؤجل (F-22)، وخدمات `marketplace` و`orders`/`delivery` (ساق `store_order`) قائمة |
| لوحات الإدارة | فريق وصلة | تشغيل كل نظام | كل مستودع لوحته | ceezr `apps/admin` و`apps/admin-dashboard` · wasla `apps/admin-portal` · wasla-core `dashboard/` |

| القناة | وصلة | وصلة كابتن | وصلة أعمال | الدخول (D-XR-13) | البند |
|---|---|---|---|---|---|
| تطبيق تيليجرام المصغر | قائم جزئيًا | قائم (منتج في الإنتاج) | يُبنى | `initData` | XR-8.2، XR-8.11 |
| الويب وPWA (حاسوب وجوال) | يُبنى | بعد XR-2.1 | يُبنى | Telegram Login، Discord، passkeys | XR-8.3 |
| Discord Activity | يُبنى | لا يُبنى الآن (القيادة لا تناسب iframe داخل ديسكورد) | يُبنى | Discord OAuth2 | XR-8.7 |
| Android | يُبنى | يُبنى (لتتبع الموقع في الخلفية والإشعارات الأصلية؛ حدود التطبيق المصغر في ذلك تُقاس في XR-8.4) | يُبنى | Telegram Login، Google (OD-XR-4)، passkeys | XR-8.4، XR-8.8 |
| iOS | يُبنى | يُبنى | يُبنى | Sign in with Apple إلزامي مع أي دخول اجتماعي، Telegram Login، passkeys | XR-8.4، XR-8.8 |

**لماذا يجذب هذا التصميم كل طرف [مقترح، بلا قياس سوقي بعد]:**

1. **الزبون:** تطبيق واحد للسوق والمشوار والتوصيل، في القناة التي يعيش فيها أصلًا، وبحساب واحد لا يتغير إذا انتقل من تيليجرام إلى الجوال أو الحاسوب.
2. **السائق:** مصدرا دخل (مشاوير MOVE ومهام توصيل المتاجر عبر XR-4) في تطبيق واحد.
3. **صاحب المتجر:** متجر وتوصيل مدمج من أسطول MOVE بلا تعاقد منفصل مع شركة توصيل، وزبائن يصلون إليه برابط واحد يُنشر في أي مجموعة (D-XR-15).
4. **أي شخص:** يبدأ زبونًا ثم يرتقي بائعًا أو صاحب متجر أو كابتنًا أو شريكًا بالحساب نفسه (D-XR-17)، فيجمع أدواره ويديرها من مكان واحد.
5. **المنظومة:** كل دور يغذي غيره: المتاجر تجلب طلبات توصيل تزيد دخل السائقين، وكثرة السائقين تقصر زمن التوصيل للزبائن، والزبائن هم الباعة المحتملون. هذه فرضيات تُقاس بعد الإطلاق، لا نتائج.

### XR-0 — الحوكمة وخط الأساس (الثلاثة معًا)

| البند | MARKET (wasla) | CORE (wasla-core) | MOVE (ceezr) | شرط الإغلاق |
|---|---|---|---|---|
| XR-0.1 الخارطة المشتركة في المستودعات الثلاثة | `docs/ecosystem/` | `docs/ecosystem/` | `docs/ecosystem/` | الملف متطابق في `main` الثلاثة، وفحص التطابق أخضر |
| XR-0.2 تسجيل القرارات D-XR-1..8 | ADR-076 | قيد دورة في `ROADMAP.md` (لا تغيير في حدود CORE: القرارات تطابق ADR 0001/0002/0007) | ADR 0292 + `DEC-26` | الملفات مدموجة |
| XR-0.3 تصحيح مراجع المستودعات إلى `nooonvg` | README وCODEOWNERS وروابط الوثائق | README («Related repositories») | `AGENTS.md` وأوامر `gh` | لا مرجع تشغيلي إلى الحسابات القديمة (المراجع التاريخية في السجلات تبقى كما كُتبت) |
| XR-0.4 الفرع الافتراضي `main` | يُضبط `main`؛ فرع `fix/clm-0576-attestation-verify-gate` (PR #730 سابقًا) يبقى كما هو حتى `INC-0007` | قائم `main` | قائم `main` | إعدادات GitHub |
| XR-0.5 حكم CI على البيت الجديد | تشغيل `ci.yml` على `main` في `nooonvg/wasla` | تشغيل `ci.yml` | تشغيل `ci.yml` | نتيجة كل تشغيل مسجلة برقمه في سجل المستودع |
| XR-0.6 الأسرار المكشوفة | `INC-0007`: تدوير مفتاح Render ورموز البوتات (المالك) | — | التحقق أن رموز البوتات في Render ليست هي المكشوفة (المالك) | إغلاق `INC-0007` بدليل |

### XR-1 — تجميد الحدود (الثلاثة معًا)

| البند | MARKET | CORE | MOVE | شرط الإغلاق |
|---|---|---|---|---|
| XR-1.1 تجميد مجال MOVE في MARKET | حارس CI يرفض أي تغيير في `services/{dispatch,drivers,matching,negotiations,orders,rides}` و`apps/driver-mini-app` و`bots/driver-bot` إلا ما يحمل وسم `XR-RETIRE` أو `SECURITY`؛ وبند اللوحة `M5-13D` (ربط مهمة التوزيع بنشر المشوار) يُغلق `Cancelled` بمرجع ADR-076 | — | — | الحارس مدموج ومختبر بخرق مزروع |
| XR-1.2 تجميد مجالات CORE في MARKET | الحارس نفسه يشمل `services/{identity,subscriptions,billing,reputation}` | — | — | كما سبق |
| XR-1.3 حد `services/delivery` | `store_order` يبقى قابلًا للتطوير؛ ساق `delivery_task → dispatch` مجمّدة | — | — | الحارس يميّز المسارين |
| XR-1.4 حارس الحدود في CORE | قائم: `check-governance.mjs` يرفض كيانات MOVE وMARKET | قائم | — | لا عمل جديد |
| XR-1.5 حارس الخروج في MOVE | — | — | قائم: `egress-registry.ts` يمنع الاقتران المباشر بـMARKET | لا عمل جديد |

### XR-2 — إطلاق MOVE مستقلًا (MOVE وحده، لا ينتظر غيره)

هذه المرحلة هي خارطة MOVE الداخلية نفسها دون تغيير في ترتيبها. البنود المفتوحة عند الكتابة (من [STATUS.md](https://github.com/nooonvg/ceezr/blob/main/docs/roadmap/execution/STATUS.md) و[بوابة الجاهزية](https://github.com/nooonvg/ceezr/blob/main/docs/governance/PRODUCTION_READINESS_GATE.md)):

| المجموعة | البنود وحالتها في مستودعها عند 2026-10-21 |
|---|---|
| بنود التنفيذ «قيد التنفيذ» | WR-07، WR-10، WR-11، WR-13، WR-15، WR-16C، WR-17، WR-25، WR-27 |
| «نُفذ في الشيفرة» (لم يُنشر) | WR-16A، WR-16B، WR-16D |
| «اجتاز الاختبارات الآلية» (لم يُنشر) | WR-00، WR-06، WR-08، WR-19، WR-22، WR-23، WR-24 |
| «متوقف» | WR-21 (رفع المستندات موقوف)، WR-26 (الاختبار الميداني على تيليجرام) |
| بوابة الجاهزية «Blocked» | PRD-008 (smoke من تيليجرام حقيقي)، PRD-009 (أداء الإنتاج)، PRD-101 (قارئ الشاشة)، PRD-201 (staging = F9)، PRD-202 (سعة = F10)، PRD-203 (صمود = F11)، PRD-204 (`ECO-001..008`)، PRD-205 (F12) |
| بوابة الجاهزية «Ready» | PRD-010 (تجميد الميزات) |
| السعة | `LOAD-01` فاشل (الدفعة 24) — العمل جارٍ في MOVE |
| التشغيل | إيقاف Render للفوترة (`OPS-EGRESS-01`) — يحتاج المالك |

| البند المشترك | MARKET | CORE | MOVE | شرط الإغلاق |
|---|---|---|---|---|
| XR-2.1 MOVE «Production Ready» | لا عمل | لا عمل | حسب ADR 0246 | شهادة الإغلاق في بوابة الجاهزية |
| XR-2.2 لا تراجع عن الاستقلال | لا اعتماد على MARKET | لا اعتماد على CORE | `check-deferred-area.ts` قائم | يبقى أخضر |

### XR-3 — جاهزية CORE وMARKET للتكامل (متوازٍ مع XR-2)

| البند | MARKET | CORE | MOVE | شرط الإغلاق |
|---|---|---|---|---|
| XR-3.1 بيئة CORE | — | قرار B-5 (الطوبولوجيا والهدف) ثم بيئة staging؛ B-6 للإنتاج | — | `/ready` لبيئة CORE مقيس |
| XR-3.2 ثغرة الجلسات | — | B-42: `session.issue` غير محصور بنطاق — يجب إغلاقه قبل أن يحمل أي نظام خارجي اعتماد خدمة | — | B-42 Resolved في سجل CORE — **تحقق في 2026-10-21** (§9) |
| XR-3.3 قواعد التدهور | — | B-35 / المعلم 11 (ADR 0010): نص القاعدة غير موجود في المستودع — يحتاج نص المالك | — | ADR 0010 منفّذ أو مقرر |
| XR-3.4 منتج `market.order.created` | منتج حقيقي في MARKET من `store_order` عند `placed`، بمغلّف CORE وعبر outbox، بمحوّل من المغلّف المحلي (F-10) | العقد قائم في `contracts/events` | — | اختبار تكافؤ عقد في MARKET أخضر |
| XR-3.5 مستهلك `core.fulfillment.*` في MARKET | مستهلك inbox يحرّك `store_order` إلى `handed_to_courier`/`delivered`/فشل | العقود قائمة | — | اختبار تكامل على PostgreSQL حقيقي |
| XR-3.6 نسخ العقود في MARKET | `docs/contracts/core/` بملف مصدر (PROVENANCE) كما في MOVE، وفحص تكافؤ في CI | مصدر العقود | قائم (`check-core-contract-parity.ts`) | الفحص أخضر في المستودعين |
| XR-3.7 بنود MARKET الداخلية المفتوحة | M0-49 وM0-53 (قيد التنفيذ)، M5-14 وM5-13M وM6-19A..C («Ready for Gate»)، M6-18B وM6-20 (Blocked) تستمر بحوكمة wasla. ويُعاد تعريف نطاق M7 في XR-7 | — | — | حسب اللوحة |

### XR-4 — رحلة التكامل الأولى: توصيل طلب متجر

المسار المستهدف (كل سهم حدث بمغلّف CORE، ولا اتصال مباشر بين MARKET وMOVE):

```text
MARKET store_order placed ──market.order.created──▶ CORE fulfillment (core.fulfillment.created)
CORE ──core.fulfillment.*──▶ MOVE operational job (deferred/core-integration)
MOVE ──move.job.accepted / move.job.completed / move.job.rejected──▶ CORE
CORE ──core.fulfillment.* (closed)──▶ MARKET store_order delivered / failed
```

| البند | MARKET | CORE | MOVE | شرط الإغلاق |
|---|---|---|---|---|
| XR-4.1 تفعيل منطقة التأجيل | — | — | قرار مالك يقيّد `O-7` (ADR 0292 + `DEC-26`) يفتح شرط الاستئناف، ثم نقل الهجرات الست من `deferred/core-integration/migrations` إلى `supabase/migrations` مع مصدر مدينة حقيقي (القاعدة 0.4)، وإغلاق `DEP-CORE-001..008` بندًا بندًا | `check-deferred-area.ts` ومسار التكامل الحرج أخضر |
| XR-4.2 اعتمادات الخدمات | اعتماد خدمة MARKET | يُصدر اعتمادين محصورين بـ`bootstrap:credential --issue-for <قنوات>` (متاح منذ XR-3.2) | اعتماد خدمة MOVE | لا اعتماد يصدر جلسة لنظام آخر (يفرضه CORE منذ الهجرة 0022: `partner_api` لا يُصدر له، ولا جلسة لخدمة) |
| XR-4.3 الرحلة كاملة في staging | منتج + مستهلك | توجيه وتسجيل | مستهلك + منتج | اختبار طرف إلى طرف واحد على بيئة CORE: طلب متجر ← مهمة MOVE ← تسليم بإثبات ← `store_order delivered`، مع سجل الأحداث |
| XR-4.4 حالات الفشل | إلغاء قبل التسليم وبعده | B-20 وB-30 (ما المستحق عند فشل جزئي أو تسليم بعد إلغاء) قرار المالك؛ قبله يُسجَّل الواقع ويتوقف كما هو الآن | رفض المهمة وانتهاء مهلتها | كل حالة لها اختبار |
| XR-4.5 الساق المالية | — | معطلة حتى F12-11 وB-4 (D-XR-7) | — | قرار المالك |
| XR-4.6 التفعيل الإنتاجي | — | B-6 | بعد XR-2.1 فقط | موافقة المالك الصريحة |

### XR-5 — حذف المكرر من MARKET (بعد بوابة XR-4.3)

| البند | ما يُحذف | الشرط المسبق |
|---|---|---|
| XR-5.1 مجال MOVE | `services/{dispatch,drivers,matching,negotiations,orders,rides}`، وجزء نشر المشوار من `services/customers`، و`apps/driver-mini-app`، و`bots/driver-bot`، وتدفقات المشوار في `bots/customer-bot`، وربط شاشة `RideOrder` في `apps/customer-mini-app` بمجال MARKET (تُستبدل برابط عميق إلى MOVE حتى XR-8.6 لا تُحذف الشاشة)، ووظائف CI وقواعد البيانات الخاصة بها، وساق `delivery_task` من `services/delivery` | XR-4.3 أخضر، وتأكيد أن لا بيانات إنتاج في MARKET (CORE B-2 لجهة MARKET) |
| XR-5.2 التوثيق | تُنقل ADRات المجال المحذوف إلى حالة «Superseded by ADR-076» ولا تُحذف | — |
| XR-5.3 القياس بعد الحذف | `pnpm verify` و`governance:verify` أخضران | — |

### XR-6 — الخدمات المشتركة عبر CORE (بعد XR-4، مشروطة بقرارات المالك)

| البند | MARKET | CORE | MOVE | قرار المالك اللازم |
|---|---|---|---|---|
| XR-6.1 الهوية الموحدة (شرط مسبق لـXR-8.6 وجزء السائق من XR-8.9) | يتبنى هوية CORE ويُحذف `services/identity` | دمج الهويات المكررة | يربط مستخدمي تيليجرام بهوية CORE، وهجرة تجعل `users.telegram_id` رابطًا اختياريًا وتستبدل `role` المفرد بملفات أدوار (راكب/سائق) للشخص نفسه (F-17)، على بيانات إنتاج حقيقية فلا تُنفّذ إلا بخطة ترحيل واسترجاع | B-2 (جرد بيانات الإنتاج)، B-3 (سياسة دمج الهويات) |
| XR-6.2 الاشتراكات والاستحقاق | يُحذف `services/subscriptions` | نقطة تحقق الاستحقاق تحتاج ADR جديدًا (B-14) | `ECO-001..008` | B-14..B-19 |
| XR-6.3 المال والفوترة | يُحذف `services/billing` | نشر محرك المال | مزود الدفع | F12-11، B-4، F12-16 |
| XR-6.4 السمعة | `market.review.rated/retracted` منتج حقيقي، ويُحذف `services/reputation` | الإشارات قائمة بلا منتج | عقد سمعة لـMOVE يُعتمد منفصلًا | B-31..B-34 |
| XR-6.5 الإشعارات | — | المحوّل الحي لتيليجرام (المعلم 4 بمحوّل وهمي) وD-8 | بوتات MOVE تبقى قناة دخول (ADR 0286) | D-8 |

### XR-7 — إطلاق MARKET والمنظومة

| البند | MARKET | CORE | MOVE |
|---|---|---|---|
| XR-7.1 إعادة تعريف M7 | M7-01..M7-06 بنطاق MARKET بعد الحذف (متاجر، منتجات، بحث، طلب متجر عبر CORE)، وحدّه الأدنى من القنوات «وصلة» و«وصلة أعمال» على تيليجرام والويب (XR-8.3)، والمتاجر وديسكورد تتبع حين تنغلق XR-8.7 وXR-8.8 | — | — |
| XR-7.2 Go/No-Go المنظومة | M7-03 | B-6 | بوابة الجاهزية |
| XR-7.3 بيانات الإقامة | — | — | F12-15 (تفضيل المملكة) يُطبَّق على الثلاثة |

### XR-8 — القنوات المتعددة والحساب الواحد والتطبيقات الثلاثة (Revision 2)

مبدأ الترتيب: ما لا يمس إنتاج MOVE يبدأ الآن في MARKET وCORE، وما يمس MOVE يبدأ بعد إطلاقه (D-XR-14). وما يحتاج حسابًا أو مالًا أو سياسة من المالك لا يبدأ قبل قراره (§5).

| البند | MARKET (wasla) | CORE (wasla-core) | MOVE (ceezr) | شرط الإغلاق |
|---|---|---|---|---|
| XR-8.1 المواصفة والقرارات | ADR-077 (التطبيقات والأدوار والقنوات، ورفع تأجيل ADR-046 مشروطًا بـXR-8.11) | قيد دورة في `ROADMAP.md` يسجل XR-8.5 عائقًا مفتوحًا | ADR 0293 + `DEC-27` (تعليمة المالك الثانية نصًا، و`DEC-07` باقٍ للإطلاق الأول) | الملفات مدموجة في الثلاثة |
| XR-8.2 طبقة المضيف | `customer-mini-app` يكف عن استدعاء `Telegram.WebApp` مباشرة ويمر عبر واجهة مضيف واحدة (تيليجرام، متصفح، ديسكورد، أصلي) | — | بعد XR-2.1: تعميم `tg/` القائمة إلى مضيف عام | التطبيق يعمل في اختباراته بمضيف متصفح ومضيف وهمي، وفحص يرفض استدعاء SDK منصة خارج الطبقة |
| XR-8.3 الويب وPWA | «وصلة» و«وصلة أعمال» تعملان في متصفح عادٍ بتصميم متجاوب للحاسوب والجوال، مع manifest وservice worker | محوّل دخول الويب (XR-8.5) | بعد XR-2.1: إغلاق `ARCH-014` و`TG-004` بهذا البند | اختبار طرف إلى طرف في متصفح حقيقي بلا تيليجرام: دخول، بحث، طلب، خروج، حذف حساب |
| XR-8.4 تجربة الغلاف الأصلي | بناء «وصلة» لـAndroid وiOS (مرشح Capacitor، F-28) مع إشعارات وموقع وكاميرا، وقياس الحجم وزمن الإقلاع | — | بعد XR-2.1: التجربة نفسها على «وصلة كابتن» مع الموقع في الخلفية | ADR يحسم أداة الغلاف بأرقام مقيسة، أو يرفضها ويختار بديلًا. البناء لـiOS يحتاج بيئة macOS مع Xcode |
| XR-8.5 الهوية متعددة القنوات | لا توسيع لـ`services/identity` (مجمّد)؛ التطبيقات تأخذ جلسة CORE | إضافة القنوات `discord` و`apple` (و`google` إن قرر المالك) إلى `CHANNEL_TYPES` وقيد الهجرة، ومحوّل دخول لكل طريقة يتحقق من توقيعها ثم يطلب `session.issue`، ومفاتيح المرور، وواجهة ربط طريقة ثانية وفكها، وحذف الحساب، وعمر الجلسة لكل قناة (بند مفتوح في خارطة CORE) | — (يتبع XR-6.1) | اختبارات CORE: شخص واحد بثلاث طرق دخول ينتج جلسة واحدة الهوية، وربط رابط مملوك لشخص آخر يُرفض. شرطه XR-3.2 تحقق (§9) |
| XR-8.6 المشوار من «وصلة» | شاشة `RideOrder` تستدعي عقد MOVE العام المنسوخ بملف مصدر (PROVENANCE) وفحص تكافؤ، وقبله رابط عميق إلى MOVE | تصدر الجلسة | نشر عقد طلب المشوار للعملاء الخارجيين (OpenAPI) وقبول جلسة CORE | مشوار طرف إلى طرف من «وصلة» في staging، بلا استدعاء لأي خدمة مشوار في MARKET |
| XR-8.7 ديسكورد | غلاف Discord Activity لـ«وصلة» ثم «وصلة أعمال»، وبوت يفتحها بـ`LAUNCH_ACTIVITY` | محوّل إشعارات ديسكورد بعد المحوّل الحي لتيليجرام (XR-6.5) | — | Activity يعمل في خادم اختبار، والدخول فيه يربط الحساب القائم نفسه. يحتاج OD-XR-3 |
| XR-8.8 النشر في المتاجر | «وصلة» و«وصلة أعمال» | — | «وصلة كابتن» (بعد XR-2.1) | اختبار TestFlight واختبار Google Play المغلق ثم القبول، مع Sign in with Apple وحذف الحساب وتصريحات الخصوصية والدفع خارج الشراء داخل التطبيق (F-26). يحتاج OD-XR-1 وOD-XR-2 وOD-XR-7 |
| XR-8.9 سلّم الأدوار | صفحة «حسابي»: أدواري، «افتح متجرًا»، «انضم كابتنًا»، «كن شريكًا»، ومبدّل التطبيقات | إنشاء منظمة وعضوية من طلب الشخص نفسه، وقائمة أدوار الشخص عبر المنتجات | بعد XR-6.1: طلب انضمام سائق من حساب CORE قائم (مع WR-21) | اختبار طرف إلى طرف: شخص واحد زبون وصاحب متجر وسائق بحساب واحد |
| XR-8.10 «بِع غرضك» | متجر `individual` (D-XR-16) | المال والضمان بعد XR-6.3 | التوصيل عبر XR-4 | لا يبدأ قبل F12-11 وOD-XR-5 وOD-XR-9 |
| XR-8.11 «وصلة أعمال» | `apps/partner-mini-app` من الصفر على طبقة المضيف: متجر، منتجات، مخزون، طلبات، طاقم، حالة التوصيل | المنظمة والعضويات | — | صاحب متجر يدير متجره من تيليجرام والمتصفح بالحساب نفسه، وADR-046 يصير «Superseded by ADR-077» |

## 5. سجل قرارات المالك المفتوحة (كل ما لا يملكه المهندس)

| المعرّف | السؤال | المستودع | يحجب |
|---|---|---|---|
| INC-0007 | تدوير مفتاح Render ورموز البوتات المكشوفة | wasla | XR-0.6 |
| OPS-EGRESS-01 | وسيلة دفع في Render أو انتظار الشهر لرفع الإيقاف | ceezr | XR-2 |
| PRD-008 / PRD-101 / WR-26 | أجهزة المالك للاختبار الميداني | ceezr | XR-2 |
| PRD-201..205، F9..F12، ECO-001..008 | staging، سعة خارجية، صمود، اقتصاد، قرارات تجارية | ceezr | XR-2 |
| F12-11 | مزود الدفع | ceezr | XR-4.5، XR-6.3 |
| F12-15 | موضع البيانات | ceezr | XR-7.3 |
| F12-16 | التسعير | ceezr | XR-6.3 |
| B-2 | جرد بيانات الإنتاج لـMOVE وMARKET | wasla-core | XR-5.1، XR-6.1 |
| B-3 | سياسة دمج الهويات | wasla-core | XR-6.1 |
| B-4 | سياسة التسعير التنظيمية (ADR 0012) | wasla-core | XR-4.5 |
| B-5 / B-6 | هدف النشر والطوبولوجيا / موافقة الإصدار | wasla-core | XR-3.1، XR-4.6 |
| B-14..B-19 | الاستحقاق والتناسب والسماح والتجارب والحصص والاستثناءات | wasla-core | XR-6.2 |
| B-20 / B-30 | المستحق عند الفشل الجزئي / التسليم بعد الإلغاء | wasla-core | XR-4.4 |
| B-31..B-34 | أوزان السمعة والاضمحلال والعتبات وعبور المنظمات | wasla-core | XR-6.4 |
| B-35 | نص قواعد التدهور ADR 0010 | wasla-core | XR-3.3 |
| D-8 | تأكيد تسليم الإشعارات | wasla-core | XR-6.5 |
| أسئلة MOVE المفتوحة | [`OWNER-QUESTIONS-20261009.md`](https://github.com/nooonvg/ceezr/blob/main/docs/governance/OWNER-QUESTIONS-20261009.md) | ceezr | حسب كل سؤال |
| OD-XR-1 | عضوية Apple Developer Program (99 دولارًا سنويًا، F-27) وبأي صفة (فرد أو منشأة) | الثلاثة | XR-8.8 (iOS)، وتوزيع TestFlight الخارجي |
| OD-XR-2 | حساب Google Play Console (25 دولارًا مرة واحدة، F-27) وبأي صفة | الثلاثة | XR-8.8 (Android) |
| OD-XR-3 | إنشاء تطبيق ديسكورد في بوابة المطورين وخادم اختبار | wasla · wasla-core | XR-8.7 |
| OD-XR-4 | طرق الدخول خارج تيليجرام: أي من (Telegram Login، Discord، Sign in with Apple، Google، مفاتيح المرور، البريد، الجوال+OTP)، ومزود الإرسال إن اختير البريد أو الجوال، ومتى يُرفع `DEC-07` في MOVE بعد الإطلاق الأول | الثلاثة | XR-8.5، XR-6.1، XR-8.3 في MOVE |
| OD-XR-5 | سياسة البيع من الأفراد: السماح، والمنتجات المحظورة، والتحقق من البائع، والعمولة، والنزاعات | wasla | XR-8.10 |
| OD-XR-6 | تعريف «الشريك»: مالك أسطول في MOVE؟ شريك تكامل عبر API في MARKET؟ مسوّق بالإحالة؟ أو أكثر من واحد | الثلاثة | XR-8.9، XR-8.11 |
| OD-XR-7 | أسماء التطبيقات الثلاثة والعلامة، ونطاق الروابط الموحدة (D-XR-15) | الثلاثة | XR-8.3، XR-8.8 |
| OD-XR-8 | مصير سطح الراكب في تطبيق MOVE بعد أن يعمل المشوار من «وصلة» (يبقى منتجًا مستقلًا أو يُدمج) | ceezr | ما بعد XR-8.6 |
| OD-XR-9 | الترخيص النظامي لكل دولة تشغيل (نقل الركاب، التجارة الإلكترونية، البيع بين الأفراد) — لم يُبحث في هذه المراجعة | الثلاثة | XR-8.8، XR-8.10 |

## 6. قواعد التزامن

1. أي تغيير في هذا الملف يُفتح بثلاثة طلبات دمج تحمل الـ`Revision` نفسه، ولا يُعتبر نافذًا حتى تُدمج الثلاثة.
2. الفحص `check-ecosystem-sync.mjs` يقارن بصمة SHA-256 للملف المحلي بنسختي المستودعين الآخرين على `main`. في طلبات الدمج يُنبّه فقط (لأن أحد الطلبات الثلاثة يسبق الآخرين حتمًا)، وفي التشغيل المجدول على `main` يفشل عند الاختلاف.
3. حالة البند المشترك تُغلق حين تُغلق بنوده الداخلية في مستودعاتها بأدلتها. هذه الوثيقة لا ترفع حالة بند داخلي.
4. ما يُكتشف أثناء التنفيذ ويمس أكثر من مستودع يُضاف هنا بمراجعة جديدة، وما يمس مستودعًا واحدًا يذهب إلى خارطته الداخلية.

## 7. ما لم يُقس في هذه المراجعة

- لم يُقس الإنتاج الحي لـMOVE بعد 2026-10-13 (آخر قياس موثّق في المستودع).
- لم تُشغّل اختبارات قاعدة البيانات والعنقود في CORE، ولا `pnpm verify` الكامل في MARKET، ولا `bun run ci` الكامل في MOVE، ضمن هذه المراجعة؛ نتائج CI على `nooonvg` تُسجّل في XR-0.5.
- عدد الأسطر في F-5..F-7 عدّ خام لملفات `*.ts` المتتبعة (يشمل الاختبارات)، لا مقياس جودة.
- **(Revision 2)** لم يُجرَّب Capacitor ولا Discord Activity ولا Telegram Login ولا Sign in with Apple في شيفرة أي مستودع؛ ما في F-24..F-28 قراءة لوثائق رسمية لا تجربة.
- **(Revision 2)** نتيجة مراجعة آبل وجوجل لأي تطبيق لا تُعرف قبل التقديم؛ إرشاد 4.2 تقديري.
- **(Revision 2)** الأثر السوقي لتصميم الأدوار والتطبيقات (§4-أ «لماذا يجذب») فرضيات غير مقيسة.
- **(Revision 2)** لم يُبحث الإطار النظامي لنقل الركاب والتجارة الإلكترونية والبيع بين الأفراد (OD-XR-9).
- **(Revision 2)** F-16 بحث نصي بكلمات محددة (`capacitor`، `react-native`، `expo`، `webmanifest`، `serviceWorker`، `discord`، ومجلدات `android/` و`ios/`)، لا مراجعة يدوية لكل ملف.
- **(Revision 3)** لم يُشغَّل أي اعتماد خدمة على بيئة حقيقية، لأن CORE بلا بيئة (XR-3.1)؛ إغلاق XR-3.2 مقيس في الاختبارات وCI فقط. ولم يُثبَّت تطبيق الويب فعليًا على جهاز؛ معايير التثبيت في XR-8.3a مقروءة من وثائق Chrome وMDN ومفحوصة باختبار متصفح.
- **(Revision 3)** F-16 قيس قبل XR-8.3a: `webmanifest` موجود الآن في `nooonvg/wasla` (§9)، فالحقيقة F-16 تاريخية لا حالية في هذا الجزء.

## 8. سجل المراجعات

| Revision | التاريخ | رؤوس `main` المقيسة | ما تغيّر |
|---|---|---|---|
| 1 | 2026-10-21 | wasla `9d6925c` · wasla-core `995f4fa` · ceezr `9880f65` | الخارطة الأولى: F-1..F-15، D-XR-1..8، المراحل XR-0..XR-7، سجل قرارات المالك. نُفذ بعدها XR-0 (wasla PR #2، wasla-core PR #1، ceezr PR #1) وXR-1 (wasla PR #3) |
| 2 | 2026-10-21 | wasla `4b8cbf4` · wasla-core `a546b14` · ceezr `1f7fae0` | تعليمة المالك الثانية (§1): F-16..F-28، D-XR-9..17، §4-أ خريطة التطبيقات والأدوار والقنوات، المرحلة XR-8، OD-XR-1..9، وتعديل XR-5.1 وXR-6.1 وXR-7.1. لا بند من المراجعة 1 أُلغي |
| 3 | 2026-10-21 | wasla `5104858` · wasla-core `a46bdb5` · ceezr `30cf8ce` | §9 جديد (حالة التنفيذ المقيسة): XR-0.1 وXR-0.2 وXR-1.1..1.3 وXR-8.1 مغلقة، وXR-3.2 مغلق (wasla-core PR #3، B-42)، وXR-8.2 جزء MARKET مدموج (wasla PR #5)، وXR-8.3 جزء الـmanifest مدموج (wasla PR #6) والبند مفتوح. تعديل XR-4.2 وXR-8.5 و§4 بما يترتب على XR-3.2. لا قرار جديد ولا بند أُلغي |

## 9. حالة التنفيذ المقيسة (من المراجعة 3)

كل سطر هنا له دليل مدموج على `main` ونتيجة CI خضراء. بحسب القاعدة 3 في §6 هذه الوثيقة تنقل الحالة ولا ترفعها: البند الداخلي يُغلق في مستودعه أولًا.

| البند | الحالة | الدليل |
|---|---|---|
| XR-0.1 الخارطة المشتركة | مغلق | wasla PR #2 · wasla-core PR #1 · ceezr PR #1، وفحص `ecosystem-sync` أخضر على `main` الثلاثة |
| XR-0.2 تسجيل القرارات D-XR-1..8 | مغلق | ADR-076 في wasla · قيد دورة في `ROADMAP.md` لـwasla-core · ADR 0292 و`DEC-26` في ceezr |
| XR-0.6 الأسرار المكشوفة | مفتوح — للمالك | `INC-0007` (تدوير المفاتيح) لا يملكه المهندس |
| XR-1.1..1.3 تجميد الحدود في MARKET | مغلق | wasla PR #3: الفحص 29 `xr-domain-freeze` (ADR-076)، و`M5-13D` أُغلق `Cancelled` |
| XR-3.2 ثغرة الجلسات | **مغلق** | wasla-core PR #3 (`a46bdb5`): الهجرة 0022 `principal.issues_for_channels`؛ الخدمة تُصدر فقط على قنوات اعتمادها، ولشخص مرتبط بتلك القناة، ولا تُصدر لخدمة ولا لمن يملك `session.issue`، والرفض `403` واحد لا يكشف وجود الحساب؛ سجل التدقيق صار يسمّي المُصدِر. قِيس قبل الإصلاح على `6972a73`: اعتماد `service` أصدر جلسة `platform_admin` بـ`201`. الاختبار `tests/session-issuance-scope.test.ts` (18 حالة) |
| XR-8.1 المواصفة والقرارات | مغلق | wasla PR #4 (ADR-077) · wasla-core PR #2 (B-45) · ceezr PR #2 (ADR 0293، DEC-27) |
| XR-8.2 طبقة المضيف | جزء MARKET مغلق؛ جزء MOVE بعد XR-2.1 | wasla PR #5: `apps/customer-mini-app/src/host/` وفحص يرفض استدعاء SDK المنصة خارجها. وُجد أثناءه أن `telegram-web-app.js` لم يكن محمّلًا في `index.html` وأُصلح |
| XR-8.3 الويب وPWA | مفتوح | wasla PR #6: manifest وأيقونات مؤقتة (بانتظار OD-XR-7) وتخطيط الحاسوب. الباقي: service worker، ودخول الويب (XR-8.5 / B-45)، واختبار الدخول والخروج وحذف الحساب |
| XR-8.5 الهوية متعددة القنوات | مفتوح، غير محجوب | شرطاه في CORE (B-39 في المعلم 31، وB-42) مغلقان؛ قائمة طرق الدخول قرار المالك OD-XR-4 |

