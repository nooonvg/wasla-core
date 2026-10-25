/**
 * One run of the whole HTTP surface, kept as data.
 *
 * The response gate needs a **real** answer from every operation the contract
 * publishes, because the question it asks — does what CORE returns satisfy what
 * the contract says it returns — cannot be answered from a fixture written to
 * match the contract. So this drives the routes the way a client would: over
 * `router.handle`, with a bearer token, in the order the state requires, each
 * response kept under the contract's own label for the operation.
 *
 * Two rules this file follows, both learned from the parity cycles:
 *
 *  - **Every route is driven, not a chosen subset.** The gate asserts that the
 *    set of labels here equals the set of operations in the contract, so a route
 *    added later cannot quietly go unchecked, and a route removed from here
 *    cannot quietly stop being measured.
 *  - **Every call is kept as the request that produced it**, not only as the
 *    answer it got: milestone 32's retry gate re-issues each write route's own
 *    request a second time, byte-identically, and asks whether anything was
 *    created twice. A gate that re-built those requests from a list of its own
 *    would be measuring a list, and would go stale the moment a route changed
 *    what it accepts.
 *  - **State comes from CORE's own routes wherever a route can make it.** Rows
 *    are seeded through the stores only where no HTTP route creates them at all:
 *    a fulfillment is created by ingesting a market order, a reputation signal by
 *    ingesting a review, and a delivery by the outbound worker. Seeding what a
 *    route could have created would let the gate pass against a response CORE
 *    never actually produces.
 */
import { createCoreApp, type CoreApp } from "../../src/app.js";
import { FixedClock } from "../../src/platform/clock.js";
import { memoryPersistence, type Persistence } from "../../src/platform/persistence/backends.js";
import { makeEvent } from "../../src/platform/eventing/envelope.js";
import { seedCountry } from "./rows.js";
import { fixedJwksSource, freshTelegramKey, signedTelegramIdToken } from "./web-sign-in-keys.js";

/** Exactly what was sent, so it can be sent again unchanged. */
export interface Request {
  readonly method: string;
  /** The router's template, `:name` style; `contractPath` converts it. */
  readonly template: string;
  readonly url: string;
  readonly body?: unknown;
  readonly headers: Record<string, string>;
}

export interface Answer {
  readonly label: string;
  readonly request: Request;
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

export interface Scenario {
  readonly core: CoreApp;
  readonly store: Persistence;
  /** Every operation's answer, by `"METHOD /contract/path"`. */
  readonly answers: ReadonlyMap<string, Answer>;
  readonly token: string;
}

const START = new Date("2026-06-01T00:00:00.000Z");
const CORR = "response-gate";

/** The contract writes templates as `{name}`; the router registers `:name`. */
export function contractPath(template: string): string {
  return template
    .split("/")
    .map((segment) => (segment.startsWith(":") ? `{${segment.slice(1)}}` : segment))
    .join("/");
}

export async function runScenario(): Promise<Scenario> {
  const clock = new FixedClock(START);
  const store = memoryPersistence(clock);
  // Web sign-in (XR-8.5) wired with a real verifier and test keys, not a fake:
  // the response gate checks the SUCCESS this route really produces — a token
  // verified, consumed once, and a session issued — which is what its 201
  // schema is documented from. The refusal path is measured in
  // `web-sign-in.test.ts`; here the gate sees the same answer a client with a
  // valid Telegram id_token gets.
  const webKey = freshTelegramKey("scenario-web-key");
  const core = createCoreApp({
    clock,
    persistence: store,
    rateLimit: false,
    webSignIn: {
      issuer: "https://oauth.telegram.org",
      audience: "response-gate-web",
      jwks: fixedJwksSource(webKey.jwks),
    },
  });
  const answers = new Map<string, Answer>();

  // ── a tenant, an administrator and a session, so the routes can be called ──
  await seedCountry(store);
  const registered = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: "response-gate-admin",
    correlation_id: CORR,
  });
  const principalId = registered.principal.principal_id;
  const organization = await core.organization.create({
    name: "Response Gate Org",
    country_code: "SA",
    correlation_id: CORR,
  });
  const organizationId = organization.organization_id;
  await core.identity.grantMembership({
    principal_id: principalId,
    organization_id: organizationId,
    roles: ["platform_admin"],
    correlation_id: CORR,
  });
  const session = await core.identity.issueSession({
    principal_id: principalId,
    channel_type: "web",
    correlation_id: CORR,
  });
  const token = session.token;

  // Milestone 32: a `keyed` write route refuses a request that carries no
  // `Idempotency-Key`, so every non-GET call in this scenario sends one, and a
  // distinct one. Sent on all of them rather than only on the five keyed routes
  // for two reasons: this file would otherwise hold a second copy of which
  // routes are keyed, which is the duplicate source of truth the declaration
  // exists to remove; and sending a key to a route that does not read one is
  // exactly what a real client does, so the scenario measures that too. A
  // counter rather than a random string, because the gate re-sends these
  // requests and a random key would make the second run a different request.
  let keysIssued = 0;
  const retryKey = (method: string): Record<string, string> =>
    method === "GET" ? {} : { "idempotency-key": `retry-gate-${++keysIssued}` };

  const call = async (
    method: string,
    template: string,
    url: string,
    body?: unknown,
    anonymous = false,
    extraHeaders: Record<string, string> = {},
  ): Promise<Answer> => {
    const headers = {
      ...(anonymous ? {} : { authorization: `Bearer ${token}` }),
      ...retryKey(method),
      ...extraHeaders,
    };
    const response = await core.router.handle({
      method,
      url,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    const answer: Answer = {
      label: `${method} ${contractPath(template)}`,
      request: { method, template, url, ...(body === undefined ? {} : { body }), headers },
      status: response.status,
      body: response.body,
      headers: response.headers as Record<string, string> | undefined,
    };
    answers.set(answer.label, answer);
    return answer;
  };

  const bodyOf = <T>(answer: Answer): T => answer.body as T;

  // ── probes and metrics: unauthenticated by design ──
  await call("GET", "/health", "/health", undefined, true);
  await call("GET", "/ready", "/ready", undefined, true);
  await call("GET", "/metrics", "/metrics", undefined, true);

  // ── identity and access ──
  // Registered through its Telegram link, which `registerIdentity` marks
  // verified: the notification recipient below is refused without one, and a
  // recipient CORE cannot reach is exactly what that refusal is for.
  const identity = await call("POST", "/v1/identities", "/v1/identities", {
    channel_type: "telegram",
    external_id: "response-gate-subject",
    display_name: "Subject",
    source_system: "market",
  }, true);
  const subjectPrincipal = bodyOf<{ principal_id: string; identity_id: string }>(identity);

  // With the administrator's credential, not anonymously: since milestone 31
  // issuing a session requires `session.issue`, which `platform_admin` holds and
  // an unauthenticated caller does not. Driven anonymously this now answers
  // `401`, and the response gate would be checking the refusal's schema instead
  // of the issued session's.
  const issued = await call("POST", "/v1/sessions", "/v1/sessions", {
    principal_id: subjectPrincipal.principal_id,
    channel_type: "telegram",
  });
  const issuedSession = bodyOf<{ session_id: string }>(issued);

  await call("GET", "/v1/sessions/current", "/v1/sessions/current");

  // The web login surface (XR-8.5 · B-45). This scenario's app configures no
  // web sign-in, so the answer measured here is the named refusal — `503`,
  // not configured — checked against its documented schema like every other
  // refusal. The success path, the replay refusal and the ledger are measured
  // in `web-sign-in.test.ts`, which wires a real verifier with test keys.
  // فتحُ المحاولةِ أولًا — ثمّ الرمزُ يحملُ ما فُتحَ: هذا هو الترتيبُ الحقيقيُّ
  // الذي يمرُّ بهِ المتصفّحُ، والبوابةُ تقيسُ الجوابينِ كليهما.
  const nonceAnswer = await call("POST", "/v1/web-session/telegram/nonce", "/v1/web-session/telegram/nonce", {}, true);
  const loginNonce = bodyOf<{ nonce: string }>(nonceAnswer).nonce;
  // كوكي المحاولةِ من رأسِ الجوابِ — كما يرفقُهُ المتصفّحُ تلقائيًّا: الربطُ
  // الثاني الذي بدونهِ لا يكتملُ الدخولُ.
  const setCookie = nonceAnswer.headers?.["set-cookie"];
  if (typeof setCookie !== "string") throw new Error("no attempt cookie in scenario");
  const attempt = /^wasla_web_attempt=([^;]+);/.exec(setCookie)?.[1];
  if (attempt === undefined) throw new Error("unexpected attempt cookie shape");

  await call(
    "POST",
    "/v1/web-session/telegram",
    "/v1/web-session/telegram",
    {
      id_token: signedTelegramIdToken(
        webKey,
        {
          iss: "https://oauth.telegram.org",
          aud: "response-gate-web",
          sub: "response-gate-web-subject",
          exp: Math.floor(START.getTime() / 1000) + 3600,
          iat: Math.floor(START.getTime() / 1000) - 60,
          nonce: loginNonce,
        },
        { alg: "RS256", kid: "scenario-web-key", typ: "JWT" },
      ),
    },
    true,
    { cookie: `wasla_web_attempt=${attempt}` },
  );
  // Somebody else's session, which needs `identity.write` — also the
  // administrator's. A caller ending its own session would leave every later
  // call in this scenario holding a revoked token.
  await call("POST", "/v1/sessions/revoke", "/v1/sessions/revoke", {
    session_id: issuedSession.session_id,
  });
  await call("POST", "/v1/access/check", "/v1/access/check", {
    permission: "organization.read",
    organization_id: organizationId,
  });
  await call("POST", "/v1/memberships", "/v1/memberships", {
    principal_id: subjectPrincipal.principal_id,
    organization_id: organizationId,
    roles: ["org_member"],
  });

  // ── organizations ──
  const created = await call("POST", "/v1/organizations", "/v1/organizations", {
    name: "Second Org",
    country_code: "SA",
  });
  await call(
    "GET",
    "/v1/organizations/:organization_id",
    `/v1/organizations/${organizationId}`,
  );
  // XR-8.9: the administrator opening an organization of its own. The
  // administrator is a person (a session principal), so this answers 201.
  await call("POST", "/v1/me/organizations", "/v1/me/organizations", {
    name: "Own Org",
    country_code: "SA",
  });

  // ── money ──
  const wallet = await call("POST", "/v1/wallets", "/v1/wallets", {
    owner_type: "organization",
    owner_id: organizationId,
    currency: "SAR",
  });
  const walletId = bodyOf<{ wallet_id: string }>(wallet).wallet_id;
  await core.money.credit({
    wallet_id: walletId,
    amount_minor: 100_000,
    business_reference: "response-gate-funding",
    correlation_id: CORR,
  });
  await call("GET", "/v1/wallets/:wallet_id/balance", `/v1/wallets/${walletId}/balance`);

  const authorize = async (reference: string): Promise<string> => {
    const held = await call("POST", "/v1/payment-authorizations", "/v1/payment-authorizations", {
      wallet_id: walletId,
      amount_minor: 5_000,
      business_reference: reference,
    });
    return bodyOf<{ authorization_id: string }>(held).authorization_id;
  };

  const toCapture = await authorize("response-gate-capture");
  await call(
    "POST",
    "/v1/payment-authorizations/:authorization_id/capture",
    `/v1/payment-authorizations/${toCapture}/capture`,
    { amount_minor: 2_000, capture_reference: "response-gate-capture-1" },
  );
  await call(
    "POST",
    "/v1/payment-authorizations/:authorization_id/refund",
    `/v1/payment-authorizations/${toCapture}/refund`,
    { refund_reference: "response-gate-refund-1", reason: "customer_cancelled", amount_minor: 1_000 },
  );
  const toVoid = await authorize("response-gate-void");
  await call(
    "POST",
    "/v1/payment-authorizations/:authorization_id/void",
    `/v1/payment-authorizations/${toVoid}/void`,
    { reason: "expired_hold" },
  );

  // ── geography ──
  await call("POST", "/v1/geography/countries", "/v1/geography/countries", {
    country_code: "QA",
    name: "Qatar",
    default_currency: "QAR",
  });
  await call("GET", "/v1/geography/countries", "/v1/geography/countries");
  const region = await call("POST", "/v1/geography/regions", "/v1/geography/regions", {
    country_code: "SA",
    code: "MK",
    name: "Mecca Region",
  });
  const regionId = bodyOf<{ region_id: string }>(region).region_id;
  await call(
    "GET",
    "/v1/geography/countries/:country_code/regions",
    "/v1/geography/countries/SA/regions",
  );
  const city = await call("POST", "/v1/geography/cities", "/v1/geography/cities", {
    region_id: regionId,
    name: "Jeddah",
    latitude: 21.5,
    longitude: 39.2,
  });
  const cityId = bodyOf<{ city_id: string }>(city).city_id;
  await call("GET", "/v1/geography/regions/:region_id/cities", `/v1/geography/regions/${regionId}/cities`);
  await call("POST", "/v1/geography/service-areas", "/v1/geography/service-areas", {
    city_id: cityId,
    name: "Central",
    radius_metres: 20_000,
    centre_latitude: 21.5,
    centre_longitude: 39.2,
  });
  await call(
    "GET",
    "/v1/geography/service-areas/resolve",
    "/v1/geography/service-areas/resolve?latitude=21.5&longitude=39.2",
  );

  // ── plans and subscriptions ──
  const plan = await call("POST", "/v1/plans", "/v1/plans", {
    code: "response-gate-plan",
    name: "Response Gate Plan",
    currency: "SAR",
    amount_minor: 1_000,
    billing_interval: "month",
    interval_count: 1,
    grants: [{ feature_key: "deliveries", limit_value: 100 }],
  });
  const planId = bodyOf<{ plan_id: string }>(plan).plan_id;
  await call("POST", "/v1/plans/:plan_id/activate", `/v1/plans/${planId}/activate`);
  await call("GET", "/v1/plans", "/v1/plans");
  await call("GET", "/v1/plans/:plan_id", `/v1/plans/${planId}`);

  const retiring = await call("POST", "/v1/plans", "/v1/plans", {
    code: "response-gate-plan-retired",
    name: "Retired Plan",
    currency: "SAR",
    amount_minor: 1_000,
    billing_interval: "month",
    grants: [{ feature_key: "deliveries", limit_value: null }],
  });
  const retiringId = bodyOf<{ plan_id: string }>(retiring).plan_id;
  await call("POST", "/v1/plans/:plan_id/activate", `/v1/plans/${retiringId}/activate`);
  await call("POST", "/v1/plans/:plan_id/retire", `/v1/plans/${retiringId}/retire`);

  const subscription = await call("POST", "/v1/subscriptions", "/v1/subscriptions", {
    owner_type: "organization",
    owner_id: organizationId,
    plan_id: planId,
    wallet_id: walletId,
  });
  const subscribed = bodyOf<{ subscription_id: string; period?: { period_id: string } }>(subscription);
  const subscriptionId = subscribed.subscription_id;
  await call("POST", "/v1/subscriptions/:subscription_id/usage", `/v1/subscriptions/${subscriptionId}/usage`, {
    feature_key: "deliveries",
    quantity: 1,
    usage_reference: "response-gate-usage-1",
  });
  await call("GET", "/v1/subscriptions/:subscription_id", `/v1/subscriptions/${subscriptionId}`);

  const periods = await store.subscription.listPeriods(subscriptionId);
  const periodId = periods[periods.length - 1]!.period_id;
  await call(
    "POST",
    "/v1/subscription-periods/:period_id/collect",
    `/v1/subscription-periods/${periodId}/collect`,
  );
  await call("POST", "/v1/subscriptions/:subscription_id/cancel", `/v1/subscriptions/${subscriptionId}/cancel`, {
    reason: "customer_request",
  });

  // ── eventing ──
  // A market service token: `POST /v1/events` refuses a caller asserting another
  // system's events, so the administrator cannot post a `market.*` fact.
  const market = await core.identity.registerIdentity({
    channel_type: "partner_api",
    external_id: "wasla-market-credential",
    display_name: "wasla-market",
    service_name: "wasla-market",
    correlation_id: CORR,
  });
  await core.identity.grantMembership({
    principal_id: market.principal.principal_id,
    organization_id: organizationId,
    roles: ["service"],
    correlation_id: CORR,
  });
  const marketSession = await core.identity.issueSession({
    principal_id: market.principal.principal_id,
    channel_type: "partner_api",
    correlation_id: CORR,
  });

  const post = async (template: string, url: string, body: unknown, bearer: string) => {
    const headers = { authorization: `Bearer ${bearer}`, ...retryKey("POST") };
    const response = await core.router.handle({
      method: "POST",
      url,
      headers,
      body,
    });
    const answer: Answer = {
      label: `POST ${contractPath(template)}`,
      request: { method: "POST", template, url, body, headers },
      status: response.status,
      body: response.body,
      headers: response.headers as Record<string, string> | undefined,
    };
    answers.set(answer.label, answer);
    return answer;
  };

  const orderReference = "response-gate-order";
  await post(
    "/v1/events",
    "/v1/events",
    makeEvent({
      event_type: "market.order.created",
      version: 1,
      producer: "wasla-market",
      occurred_at: START,
      correlation_id: CORR,
      entity_type: "order",
      entity_id: orderReference,
      payload: {
        organization_id: organizationId,
        order_id: orderReference,
        requested_service: "delivery",
      },
    }),
    marketSession.token,
  );

  const subscriptionAnswer = await call(
    "POST",
    "/v1/event-subscriptions",
    "/v1/event-subscriptions",
    {
      subscriber: "move",
      event_type: "core.money.credited",
      endpoint_url: "https://move.wasla.internal/hooks/core",
      signing_secret: "a-secret-long-enough-to-sign-with",
    },
  );
  const deliverySubscriptionId = bodyOf<{ subscription_id: string }>(subscriptionAnswer).subscription_id;
  await call("GET", "/v1/event-subscriptions", "/v1/event-subscriptions");
  await call(
    "POST",
    "/v1/event-subscriptions/:subscription_id/deactivate",
    `/v1/event-subscriptions/${deliverySubscriptionId}/deactivate`,
  );
  await call(
    "POST",
    "/v1/event-subscriptions/:subscription_id/activate",
    `/v1/event-subscriptions/${deliverySubscriptionId}/activate`,
  );

  // A queued delivery, produced by CORE's own relay rather than seeded: a credit
  // publishes `core.money.credited`, which the subscription above matches, and
  // the publisher queues the delivery the listing then answers with.
  await core.money.credit({
    wallet_id: walletId,
    amount_minor: 1_000,
    business_reference: "response-gate-funding-2",
    correlation_id: CORR,
  });
  await core.publisher.drainOnce();
  await call("GET", "/v1/event-deliveries/undelivered", "/v1/event-deliveries/undelivered");

  // ── fulfillment: the market order became one when the dispatcher ran ──
  await core.dispatcher.drainOnce();
  const fulfillment = await core.fulfillment.findByOrderReference(orderReference);
  if (fulfillment === undefined) throw new Error("the market order created no fulfillment");
  const fulfillmentId = fulfillment.fulfillment_id;
  await call("GET", "/v1/fulfillments/:fulfillment_id", `/v1/fulfillments/${fulfillmentId}`);
  await call("POST", "/v1/fulfillments/:fulfillment_id/cancel", `/v1/fulfillments/${fulfillmentId}/cancel`, {
    reason: "customer_cancelled",
  });
  // Two more fulfillments, so the three reconciliation reads answer with real
  // rows instead of an empty page. An empty `items` array satisfies any item
  // schema, so a gate measured against one would document nothing:
  //
  //  - `decision` is cancelled after part of its hold was captured, which is
  //    exactly `financial_disposition: decision_required` (blocker B-20): it
  //    appears in the pending-decision queue and, because a fulfillment that is
  //    not finished with money is not consistent, in the defect queue too.
  //  - `stale` stays open while its hold is voided underneath it, which is the
  //    cross-module contradiction the stale-hold read exists to find.
  const decisionAuth = await authorize("response-gate-decision");
  const staleAuth = await authorize("response-gate-stale");
  const secondOrder = "response-gate-order-decision";
  const thirdOrder = "response-gate-order-stale";
  for (const [reference, authorizationId] of [
    [secondOrder, decisionAuth],
    [thirdOrder, staleAuth],
  ] as const) {
    await post(
      "/v1/events",
      "/v1/events",
      makeEvent({
        event_type: "market.order.created",
        version: 1,
        producer: "wasla-market",
        occurred_at: START,
        correlation_id: CORR,
        entity_type: "order",
        entity_id: reference,
        payload: {
          organization_id: organizationId,
          order_id: reference,
          requested_service: "delivery",
          payment_authorization_id: authorizationId,
        },
      }),
      marketSession.token,
    );
  }
  await core.dispatcher.drainOnce();
  const decisionFulfillment = await core.fulfillment.findByOrderReference(secondOrder);
  const staleFulfillment = await core.fulfillment.findByOrderReference(thirdOrder);
  if (decisionFulfillment === undefined || staleFulfillment === undefined) {
    throw new Error("a funded market order created no fulfillment");
  }
  await call(
    "POST",
    "/v1/payment-authorizations/:authorization_id/capture",
    `/v1/payment-authorizations/${decisionAuth}/capture`,
    { amount_minor: 2_000, capture_reference: "response-gate-capture-2" },
  );
  await call(
    "POST",
    "/v1/fulfillments/:fulfillment_id/cancel",
    `/v1/fulfillments/${decisionFulfillment.fulfillment_id}/cancel`,
    { reason: "customer_cancelled" },
  );
  await call(
    "POST",
    "/v1/payment-authorizations/:authorization_id/void",
    `/v1/payment-authorizations/${staleAuth}/void`,
    { reason: "expired_hold" },
  );
  await call(
    "GET",
    "/v1/fulfillments/reconciliation/inconsistent",
    `/v1/fulfillments/reconciliation/inconsistent?organization_id=${organizationId}`,
  );
  await call(
    "GET",
    "/v1/fulfillments/reconciliation/pending-financial-decision",
    `/v1/fulfillments/reconciliation/pending-financial-decision?organization_id=${organizationId}`,
  );
  await call(
    "GET",
    "/v1/fulfillments/reconciliation/stale-holds",
    `/v1/fulfillments/reconciliation/stale-holds?organization_id=${organizationId}`,
  );

  // ── reputation: signals arrive as events, so one is ingested and dispatched ──
  await post(
    "/v1/events",
    "/v1/events",
    makeEvent({
      event_type: "market.review.rated",
      version: 1,
      producer: "wasla-market",
      occurred_at: START,
      correlation_id: CORR,
      entity_type: "review",
      entity_id: "response-gate-review-1",
      payload: {
        review_reference: "response-gate-review-1",
        organization_id: organizationId,
        subject_type: "identity",
        subject_id: subjectPrincipal.identity_id,
        rating: 5,
        rated_at: START.toISOString(),
      },
    }),
    marketSession.token,
  );
  await core.dispatcher.drainOnce();
  await call(
    "GET",
    "/v1/reputation/:subject_type/:subject_id",
    `/v1/reputation/identity/${subjectPrincipal.identity_id}?organization_id=${organizationId}`,
  );
  await call(
    "GET",
    "/v1/reputation/:subject_type/:subject_id/signals",
    `/v1/reputation/identity/${subjectPrincipal.identity_id}/signals?organization_id=${organizationId}`,
  );

  // ── notifications ──
  const recipient = await call(
    "POST",
    "/v1/notification-recipients",
    "/v1/notification-recipients",
    {
      organization_id: organizationId,
      event_type: "core.fulfillment.completed",
      identity_id: subjectPrincipal.identity_id,
      channel: "telegram",
      correlation_id: CORR,
    },
  );
  const recipientId = bodyOf<{ recipient_id: string }>(recipient).recipient_id;
  await call("GET", "/v1/notification-recipients", "/v1/notification-recipients");
  await call(
    "POST",
    "/v1/notification-recipients/:recipient_id/deactivate",
    `/v1/notification-recipients/${recipientId}/deactivate`,
    { correlation_id: CORR },
  );
  await call("GET", "/v1/notifications", "/v1/notifications");

  // ── deletion (D-XR-13) ──
  // A fresh person with no admin role — the scenario's own admin holds
  // platform_admin and would be refused 409, which is a real answer but not
  // this scenario's: here the deletion has to be granted, so the person is
  // registered apart, deleted through their own token, and the scenario's
  // admin lives on to drive everything after. The 204 is the whole answer:
  // the caller is nobody now, and the response carries no body to document.
  const deleter = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: "response-gate-deleter",
    correlation_id: CORR,
  });
  const deleterSession = await core.identity.issueSession({
    principal_id: deleter.principal.principal_id,
    channel_type: "web",
    correlation_id: CORR,
  });
  await call(
    "POST",
    "/v1/me/deletion",
    "/v1/me/deletion",
    undefined,
    false,
    { authorization: `Bearer ${deleterSession.token}` },
  );

  // Recorded for its own label; nothing later needs the second organization.
  void created;

  return { core, store, answers, token };
}
