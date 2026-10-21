# خارطة طريق منظومة وَصْلة — الوثيقة المشتركة بين المستودعات الثلاثة

> **هذا الملف نسخة واحدة متطابقة حرفًا في ثلاثة مستودعات** وفي المسار نفسه `docs/ecosystem/ECOSYSTEM_ROADMAP.md`:
> [`nooonvg/wasla`](https://github.com/nooonvg/wasla) (MARKET) · [`nooonvg/wasla-core`](https://github.com/nooonvg/wasla-core) (CORE) · [`nooonvg/ceezr`](https://github.com/nooonvg/ceezr) (MOVE).
> أي تعديل عليه يُدمج في المستودعات الثلاثة بالمراجعة نفسها (`Revision`)، ويفرض التطابق الفحص `docs/ecosystem/check-ecosystem-sync.mjs` وسير العمل `ecosystem-sync.yml` في كل مستودع.

| الحقل | القيمة |
|---|---|
| Revision | 1 |
| التاريخ | 2026-10-21 |
| مصدر القرار | تعليمة المالك المسجلة نصًا في §1 (2026-10-21) |
| رؤوس `main` المقيسة عند الكتابة | wasla `9d6925c` · wasla-core `995f4fa` · ceezr `9880f65` |
| معرّفات هذه الخارطة | `XR-<المرحلة>.<البند>` — بادئة جديدة لا تتقاطع مع `WR-` و`PRD-` و`ECO-` و`F9..F12` في ceezr، ولا مع `Mx-yy` و`CLM-` و`RISK-` في wasla، ولا مع `B-` و`D-` وأرقام المعالم في wasla-core |

## 0. كيف تُقرأ هذه الخارطة

1. **لا تحل محل الخرائط الداخلية.** لكل مستودع خارطته الحاكمة وبواباته، وهي باقية ملزمة:
   - MOVE: [`ORDER-20261012.md`](https://github.com/nooonvg/ceezr/blob/main/docs/roadmap/execution/ORDER-20261012.md) و[`STATUS.md`](https://github.com/nooonvg/ceezr/blob/main/docs/roadmap/execution/STATUS.md) (`DEC-25`)، و[بوابة الجاهزية](https://github.com/nooonvg/ceezr/blob/main/docs/governance/PRODUCTION_READINESS_GATE.md) (ADR 0246)، و`ROADMAP.md`.
   - MARKET: [`LAUNCH_EXECUTION_BOARD.md`](https://github.com/nooonvg/wasla/blob/main/docs/16-progress/LAUNCH_EXECUTION_BOARD.md) و[`LAUNCH_TO_100_ROADMAP.md`](https://github.com/nooonvg/wasla/blob/main/docs/16-progress/LAUNCH_TO_100_ROADMAP.md) و`ROADMAP.md` (ADR-017).
   - CORE: [`ROADMAP.md`](https://github.com/nooonvg/wasla-core/blob/main/ROADMAP.md) (المعالم وسجل العوائق `B-`).
2. **هذه الخارطة طبقة فوقها:** تحدد ملكية المجالات بين الأنظمة، وترتب المراحل المشتركة، وتربط كل بند مشترك ببنود الخرائط الداخلية بأرقامها. حالة البند الداخلي تُقرأ من مستودعه، لا من هنا.
3. **مراتب الإثبات** المستعملة في كل جدول: `[مقيس]` قرأناه من الشيفرة أو الوثيقة الحاكمة في رأس `main` المذكور أعلاه · `[موثّق]` مكتوب في وثائق المستودع ولم يُعَد قياسه هنا · `[مقترح]` قرار هذه الخارطة · `[غير متحقق]` لا دليل عليه بعد. لا يُرفع بند إلى «مكتمل» هنا إلا بدليل في مستودعه.
4. **التزامن:** كل مرحلة لها مسار لكل مستودع وبوابة خروج واحدة. لا تبدأ مرحلة تعتمد على أخرى قبل بوابة خروج تلك المرحلة، والمراحل المستقلة تجري متوازية.

## 1. تعليمة المالك (نصها، 2026-10-21)

> «لك صلاحية كاملة في صياغة الخطة وخارطة الطريق كاملة مفصلة ودمجها في كل الثلاثة المشاريع ولكن لا تهلوس، أريد أن تكون خارطة الطريق حقيقية 100%، وأريدها أن تشمل كل شيء بلا استثناء وتكون متطابقة جميع الثلاث الخارطات … سير عمل خارطة الطريق في كل مشروع متناسقة ومتزامنة … حتى لو أردت حذف التوصيل من ماركت والاعتماد على ceezr لك كل الصلاحيات.»

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

## 4. المراحل المتزامنة

```text
XR-0  الحوكمة وخط الأساس           ← الآن، الثلاثة معًا
XR-1  تجميد الحدود                  ← بعد XR-0، الثلاثة معًا
XR-2  إطلاق MOVE مستقلًا            ← متوازٍ مع XR-1..XR-3 (لا ينتظر غيره)
XR-3  جاهزية CORE وMARKET للتكامل  ← متوازٍ مع XR-2
XR-4  رحلة التكامل الأولى: توصيل طلب المتجر عبر CORE إلى MOVE  ← بعد XR-3 وبعد بوابة XR-2 للتفعيل الإنتاجي
XR-5  حذف المكرر من MARKET          ← بعد بوابة XR-4
XR-6  الخدمات المشتركة عبر CORE (الهوية، الاشتراكات، السمعة، المال)  ← بعد XR-4، ومشروط بقرارات المالك
XR-7  إطلاق MARKET والمنظومة        ← بعد XR-5 وXR-6
```

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
| XR-3.2 ثغرة الجلسات | — | B-42: `session.issue` غير محصور بنطاق — يجب إغلاقه قبل أن يحمل أي نظام خارجي اعتماد خدمة | — | B-42 Resolved في سجل CORE |
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
| XR-4.2 اعتمادات الخدمات | اعتماد خدمة MARKET | يُصدر اعتمادين محصورين (بعد XR-3.2) | اعتماد خدمة MOVE | لا اعتماد يصدر جلسة لنظام آخر |
| XR-4.3 الرحلة كاملة في staging | منتج + مستهلك | توجيه وتسجيل | مستهلك + منتج | اختبار طرف إلى طرف واحد على بيئة CORE: طلب متجر ← مهمة MOVE ← تسليم بإثبات ← `store_order delivered`، مع سجل الأحداث |
| XR-4.4 حالات الفشل | إلغاء قبل التسليم وبعده | B-20 وB-30 (ما المستحق عند فشل جزئي أو تسليم بعد إلغاء) قرار المالك؛ قبله يُسجَّل الواقع ويتوقف كما هو الآن | رفض المهمة وانتهاء مهلتها | كل حالة لها اختبار |
| XR-4.5 الساق المالية | — | معطلة حتى F12-11 وB-4 (D-XR-7) | — | قرار المالك |
| XR-4.6 التفعيل الإنتاجي | — | B-6 | بعد XR-2.1 فقط | موافقة المالك الصريحة |

### XR-5 — حذف المكرر من MARKET (بعد بوابة XR-4.3)

| البند | ما يُحذف | الشرط المسبق |
|---|---|---|
| XR-5.1 مجال MOVE | `services/{dispatch,drivers,matching,negotiations,orders,rides}`، وجزء نشر المشوار من `services/customers`، و`apps/driver-mini-app`، و`bots/driver-bot`، وتدفقات المشوار في `bots/customer-bot`، ووظائف CI وقواعد البيانات الخاصة بها، وساق `delivery_task` من `services/delivery` | XR-4.3 أخضر، وتأكيد أن لا بيانات إنتاج في MARKET (CORE B-2 لجهة MARKET) |
| XR-5.2 التوثيق | تُنقل ADRات المجال المحذوف إلى حالة «Superseded by ADR-076» ولا تُحذف | — |
| XR-5.3 القياس بعد الحذف | `pnpm verify` و`governance:verify` أخضران | — |

### XR-6 — الخدمات المشتركة عبر CORE (بعد XR-4، مشروطة بقرارات المالك)

| البند | MARKET | CORE | MOVE | قرار المالك اللازم |
|---|---|---|---|---|
| XR-6.1 الهوية الموحدة | يتبنى هوية CORE ويُحذف `services/identity` | دمج الهويات المكررة | يربط مستخدمي تيليجرام بهوية CORE | B-2 (جرد بيانات الإنتاج)، B-3 (سياسة دمج الهويات) |
| XR-6.2 الاشتراكات والاستحقاق | يُحذف `services/subscriptions` | نقطة تحقق الاستحقاق تحتاج ADR جديدًا (B-14) | `ECO-001..008` | B-14..B-19 |
| XR-6.3 المال والفوترة | يُحذف `services/billing` | نشر محرك المال | مزود الدفع | F12-11، B-4، F12-16 |
| XR-6.4 السمعة | `market.review.rated/retracted` منتج حقيقي، ويُحذف `services/reputation` | الإشارات قائمة بلا منتج | عقد سمعة لـMOVE يُعتمد منفصلًا | B-31..B-34 |
| XR-6.5 الإشعارات | — | المحوّل الحي لتيليجرام (المعلم 4 بمحوّل وهمي) وD-8 | بوتات MOVE تبقى قناة دخول (ADR 0286) | D-8 |

### XR-7 — إطلاق MARKET والمنظومة

| البند | MARKET | CORE | MOVE |
|---|---|---|---|
| XR-7.1 إعادة تعريف M7 | M7-01..M7-06 بنطاق MARKET بعد الحذف (متاجر، منتجات، بحث، طلب متجر عبر CORE) | — | — |
| XR-7.2 Go/No-Go المنظومة | M7-03 | B-6 | بوابة الجاهزية |
| XR-7.3 بيانات الإقامة | — | — | F12-15 (تفضيل المملكة) يُطبَّق على الثلاثة |

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

## 6. قواعد التزامن

1. أي تغيير في هذا الملف يُفتح بثلاثة طلبات دمج تحمل الـ`Revision` نفسه، ولا يُعتبر نافذًا حتى تُدمج الثلاثة.
2. الفحص `check-ecosystem-sync.mjs` يقارن بصمة SHA-256 للملف المحلي بنسختي المستودعين الآخرين على `main`. في طلبات الدمج يُنبّه فقط (لأن أحد الطلبات الثلاثة يسبق الآخرين حتمًا)، وفي التشغيل المجدول على `main` يفشل عند الاختلاف.
3. حالة البند المشترك تُغلق حين تُغلق بنوده الداخلية في مستودعاتها بأدلتها. هذه الوثيقة لا ترفع حالة بند داخلي.
4. ما يُكتشف أثناء التنفيذ ويمس أكثر من مستودع يُضاف هنا بمراجعة جديدة، وما يمس مستودعًا واحدًا يذهب إلى خارطته الداخلية.

## 7. ما لم يُقس في هذه المراجعة

- لم يُقس الإنتاج الحي لـMOVE بعد 2026-10-13 (آخر قياس موثّق في المستودع).
- لم تُشغّل اختبارات قاعدة البيانات والعنقود في CORE، ولا `pnpm verify` الكامل في MARKET، ولا `bun run ci` الكامل في MOVE، ضمن هذه المراجعة؛ نتائج CI على `nooonvg` تُسجّل في XR-0.5.
- عدد الأسطر في F-5..F-7 عدّ خام لملفات `*.ts` المتتبعة (يشمل الاختبارات)، لا مقياس جودة.
