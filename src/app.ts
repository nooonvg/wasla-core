import { type Clock, systemClock } from "./platform/clock.js";
import { type AuditLog } from "./platform/audit/audit.js";
import { LocalEventBus } from "./platform/eventing/bus.js";
import { type OutboxStore } from "./platform/eventing/outbox.js";
import { memoryPersistence, type Persistence } from "./platform/persistence/backends.js";
import { type TransactionBoundary } from "./platform/persistence/transaction.js";
import { OutboxPublisher } from "./platform/eventing/publisher.js";
import { EventIngress } from "./platform/eventing/ingress.js";
import { QueueRevivalService } from "./platform/replay/revive.js";
import { ReplayService } from "./platform/replay/service.js";
import { registerIngressRoutes } from "./platform/eventing/ingress-http.js";
import { InboundDispatcher } from "./platform/eventing/dispatcher.js";
import {
  DeliveryFanOut,
  DeliveryWorker,
  SubscriptionRegistry,
  type EventTransport,
} from "./platform/eventing/delivery.js";
import { FetchTransport } from "./platform/eventing/fetch-transport.js";
import { registerDeliveryRoutes } from "./platform/eventing/delivery-http.js";
import { newId } from "./platform/ids.js";
import { unavailable } from "./platform/errors.js";
import { anonymous } from "./platform/http/authentication.js";
import { Router } from "./platform/http/router.js";
import {
  DEFAULT_RATE_LIMIT_POLICY,
  RateLimiter,
  type RateLimitPolicy,
  type RateLimitWindowStore,
} from "./platform/http/rate-limit.js";
import { MetricsRegistry } from "./platform/observability/metrics.js";
import { registerMetricsRoutes } from "./platform/observability/http.js";
import { DepthSampler } from "./platform/observability/sampler.js";
import { workerMetrics } from "./platform/observability/worker-metrics.js";
import { IdentityService, type AuthenticatedPrincipal } from "./modules/identity-access/service.js";
import { OrganizationService } from "./modules/organization/service.js";
import { registerIdentityRoutes } from "./modules/identity-access/http.js";
import { registerOrganizationRoutes } from "./modules/organization/http.js";
import { MoneyService } from "./modules/money/service.js";
import { registerMoneyRoutes } from "./modules/money/http.js";
import { FulfillmentService } from "./modules/fulfillment/service.js";
import { registerFulfillmentRoutes } from "./modules/fulfillment/http.js";
import { GeographyService } from "./modules/geography/service.js";
import { registerGeographyRoutes } from "./modules/geography/http.js";
import { SubscriptionService } from "./modules/subscription/service.js";
import { registerSubscriptionRoutes } from "./modules/subscription/http.js";
import { ReputationService } from "./modules/reputation/service.js";
import { registerReputationRoutes } from "./modules/reputation/http.js";
import {
  NotificationDispatcher,
  NotificationFanOut,
  NotificationReadService,
  NotificationRecipientRegistry,
} from "./modules/notification/service.js";
import { IdentityChannelDirectory } from "./modules/notification/identity-directory.js";
import { registerNotificationRoutes } from "./modules/notification/http.js";
import {
  MiniAppSignInService,
  WebSignInService,
  type TelegramMiniAppVerificationConfig,
  type TelegramWebSignInOptions,
} from "./modules/web-session/service.js";
export type { TelegramWebSignInOptions, TelegramMiniAppVerificationConfig };
import { registerWebSessionRoutes } from "./modules/web-session/http.js";
import type { NotificationChannel } from "./modules/notification/ports.js";

export interface CoreApp {
  router: Router<AuthenticatedPrincipal>;
  /** Web sign-in (XR-8.5): null when the environment configured none. */
  webSignIn: WebSignInService | null;
  /** دخولُ المصغّرِ (D-XR-13) — أو `null` إن لم يُهيَّأْ، والمسارُ يُجيبُ 503 بالاسمِ. */
  miniAppSignIn: MiniAppSignInService | null;
  bus: LocalEventBus;
  outbox: OutboxStore;
  boundary: TransactionBoundary;
  publisher: OutboxPublisher;
  ingress: EventIngress;
  dispatcher: InboundDispatcher;
  /**
   * Historical replay (milestone 6). On the bundle rather than behind the CLI so
   * it is the same object, with the same consumers subscribed, that an operator
   * drives and a test asserts on. A replay path wired separately from the
   * application would be a second delivery path, and the whole point is that
   * there is only one.
   */
  replay: ReplayService;
  /**
   * Revival of dead `outbox` and `event_delivery` rows (B-27). On the bundle for
   * the same reason as `replay`: it must be the same stores, with the same
   * workers reading them, that an operator drives and a test asserts on. It
   * publishes nothing itself — it returns rows to `pending` and the existing
   * relay and delivery worker do the rest, which is why it is not a second
   * delivery path.
   */
  revival: QueueRevivalService;
  subscriptions: SubscriptionRegistry;
  deliveries: DeliveryWorker;
  /**
   * Notifications to people. Named apart from `subscriptions`/`deliveries` on
   * purpose: those reach systems over signed HTTP, these reach a person on a
   * channel, and one bundle holding both must not let them answer to one name.
   */
  notificationRecipients: NotificationRecipientRegistry;
  notifications: NotificationReadService;
  notificationDispatcher: NotificationDispatcher;
  /**
   * Exposed because a redelivered event is a case worth testing directly: the
   * relay already calls it, and asserting that a second call queues nothing
   * needs the same object the relay uses, not a copy of it.
   */
  notificationFanOut: NotificationFanOut;
  audit: AuditLog;
  identity: IdentityService;
  organization: OrganizationService;
  money: MoneyService;
  /**
   * ADR 0013: plans, subscriptions, periods, usage and the entitlement
   * decision. Named `billing` on this bundle and not `subscriptions`, because
   * `subscriptions` above is the event-delivery registry and two unrelated
   * things answering to one name is how a caller ends up wiring the wrong one.
   */
  billing: SubscriptionService;
  fulfillment: FulfillmentService;
  /**
   * ADR 0015: reported reputation signals and the standing derived from them.
   * No score is stored anywhere on this bundle or under it.
   */
  reputation: ReputationService;
  geography: GeographyService;
  clock: Clock;
  /**
   * Counters, gauges and histograms for the whole process. Exposed on the bundle
   * so a test can read a value without parsing the exposition, and so the
   * operator loop can be written outside CORE.
   */
  metrics: MetricsRegistry;
  /**
   * Refreshes the queue-depth gauges. Not called by the metrics endpoint — see
   * `DepthSampler` for why the scrape must not do database work — so whoever
   * runs CORE calls this on an interval, next to the worker drains.
   */
  depthSampler: DepthSampler;
  /** Which backend is actually wired. Reported by /ready so it cannot be guessed. */
  persistence: Persistence["kind"];
}

/**
 * Composition root. Modules are wired here and nowhere else — a module never
 * imports another module's internals, only its published service interface.
 */
export function createCoreApp(
  options: {
    clock?: Clock;
    persistence?: Persistence;
    transport?: EventTransport;
    /**
     * Channel adapters. Empty by default: CORE ships no provider, and a fake
     * that quietly accepted everything would let the system report deliveries
     * that never happened. With none wired, notifications queue, retry and end
     * as `failed` with `channel_adapter_not_configured` — visible, not silent.
     */
    channels?: readonly NotificationChannel[];
    /**
     * Overrides the window store from the persistence bundle. The bundle
     * already pairs the memory backend with the in-process store and Postgres
     * with the shared one; this exists for tests that need a specific policy
     * against a specific backend.
     */
    rateLimitStore?: RateLimitWindowStore;
    rateLimitPolicy?: RateLimitPolicy;
    /**
     * Set to `false` to wire a router with no limiter at all. Only for tests
     * that assert unthrottled behaviour; a deployment always wants the limit.
     */
    rateLimit?: boolean;
    /**
     * Web sign-in (XR-8.5 · B-45). Absent by default, and the route says so
     * with a named refusal rather than a fake: no proof verifier is invented
     * for an environment that did not configure one, for the same reason the
     * notification module ships no channel adapter — a fake that accepted
     * everything would mint sessions no person earned.
     */
    webSignIn?: TelegramWebSignInOptions;
    /**
     * Mini app sign-in (D-XR-13): the adapter that verifies a Telegram mini
     * app's `init_data` with CORE's own check — Ed25519 against Telegram's
     * published public keys, no bot secret in the server — and issues the
     * person session itself. Absent by default, and the route answers `503`
     * by name: no proof verifier is invented for an environment that did not
     * configure one.
     */
    miniAppSignIn?: TelegramMiniAppVerificationConfig;
  } = {},
): CoreApp {
  const clock = options.clock ?? systemClock;
  // One registry per process. Every counter below is an in-memory increment: no
  // instrumentation in this file adds a query, a transaction or a lock to any
  // request or any worker drain.
  const metrics = new MetricsRegistry();
  // One bundle, never a mix: see `Persistence` for why selecting adapters
  // individually would be a way to lose atomicity without noticing.
  const store = options.persistence ?? memoryPersistence(clock);
  const { audit, outbox, inbox, boundary } = store;
  const bus = new LocalEventBus(inbox);
  // Outbound: the relay queues one delivery row per interested subscriber in
  // the same transaction that marks the event published, and the worker sends
  // them. See `DeliveryFanOut` for why those two are one transaction.
  // Built before the relay because the notification fan-out resolves addresses
  // through identity's published service.
  const identity = new IdentityService(store.identity, outbox, boundary, audit, clock);
  // Web sign-in (XR-8.5): the channel adapter that verifies a Telegram OIDC
  // id_token with CORE's own check and issues the session itself. Null means
  // the environment did not configure it; the route answers `503` by name.
  const webSignIn = options.webSignIn
    ? new WebSignInService(identity, store.webSignInNonces, options.webSignIn, clock)
    : null;
  // Mini app sign-in (D-XR-13): the channel adapter that verifies the mini
  // app's signed `init_data` (Ed25519, public keys only — no bot secret) and
  // issues the person session itself. Null means the environment did not
  // configure it; the route answers `503` by name.
  const miniAppSignIn = options.miniAppSignIn
    ? new MiniAppSignInService(identity, store.miniAppProofs, options.miniAppSignIn, clock)
    : null;
  const fanOut = new DeliveryFanOut(store.delivery, clock, newId);
  // Addresses come from identity links through a port, never from a table this
  // module reads itself (ADR 0016, ADR 0017).
  const channelDirectory = new IdentityChannelDirectory(identity);
  const notificationFanOut = new NotificationFanOut(
    store.notification,
    channelDirectory,
    clock,
    newId,
  );
  // Both fan-outs run inside the relay's transaction, so an event is never
  // marked published without the work it owes: a webhook row for every
  // subscriber and a notification row for every recipient.
  const publisher = new OutboxPublisher(
    outbox,
    bus,
    clock,
    5,
    1000,
    [fanOut, notificationFanOut],
    boundary,
    workerMetrics(metrics, "outbox_relay"),
  );
  const subscriptions = new SubscriptionRegistry(store.delivery, clock, newId);
  const deliveries = new DeliveryWorker(
    store.delivery,
    outbox,
    options.transport ?? new FetchTransport(),
    clock,
    8,
    1000,
    5000,
    workerMetrics(metrics, "event_delivery"),
  );
  // Ingress records; the dispatcher is what actually hands the event over.
  // Splitting them is the point: see `EventIngress` and `InboundDispatcher`.
  const ingress = new EventIngress(
    store.inbound,
    (work) => boundary.run((scope) => work(scope)),
    clock,
  );
  const replay = new ReplayService(
    store.inbound,
    bus,
    inbox,
    audit,
    clock,
    store.replayLock,
  );
  const revival = new QueueRevivalService(
    store.outbox,
    store.delivery,
    audit,
    clock,
    store.revivalLock,
  );
  const dispatcher = new InboundDispatcher(
    store.inbound,
    bus,
    clock,
    5,
    1000,
    workerMetrics(metrics, "inbound_dispatcher"),
  );

  const organization = new OrganizationService(store.organization, audit, clock, boundary);
  const money = new MoneyService(store.money, outbox, boundary, audit, clock);
  const geography = new GeographyService(store.geography, audit, boundary);
  // Takes `money` rather than a wallet store: a billing period is collected by
  // an ordinary payment authorization, and the ledger is the only place that
  // knows whether the money actually moved.
  const billing = new SubscriptionService(
    store.subscription,
    money,
    outbox,
    boundary,
    audit,
    clock,
  );
  const fulfillment = new FulfillmentService(
    store.fulfillment,
    outbox,
    boundary,
    audit,
    clock,
    money,
  );
  bus.subscribe("core.fulfillment.market-order", "market.order.created", async (event) => {
    await fulfillment.consumeMarketOrder(event);
  });
  bus.subscribe("core.fulfillment.move-acceptance", "move.job.accepted", async (event) => {
    await fulfillment.consumeJobAccepted(event);
  });
  bus.subscribe("core.fulfillment.move-rejection", "move.job.rejected", async (event) => {
    await fulfillment.consumeJobRejected(event);
  });
  bus.subscribe("core.fulfillment.move-completion", "move.job.completed", async (event) => {
    await fulfillment.consumeMoveCompletion(event);
  });

  const reputation = new ReputationService(
    store.reputation,
    outbox,
    boundary,
    audit,
    clock,
  );
  // Two subscriptions rather than one handler branching on the event type: each
  // consumer name is a separate delivery position, so a poisoned retraction
  // cannot stall the ingestion of new ratings behind it.
  bus.subscribe("core.reputation.market-review", "market.review.rated", async (event) => {
    await reputation.consumeReviewRated(event);
  });
  bus.subscribe(
    "core.reputation.market-review-retraction",
    "market.review.retracted",
    async (event) => {
      await reputation.consumeReviewRetracted(event);
    },
  );

  const notificationRecipients = new NotificationRecipientRegistry(
    store.notification,
    channelDirectory,
    audit,
    clock,
    newId,
  );
  const notifications = new NotificationReadService(store.notification);
  const notificationDispatcher = new NotificationDispatcher(
    store.notification,
    options.channels ?? [],
    clock,
    6,
    1000,
    30_000,
    workerMetrics(metrics, "notification"),
  );

  const depthSampler = new DepthSampler(
    metrics,
    {
      outbox,
      inbound: store.inbound,
      delivery: store.delivery,
      notification: store.notification,
      reconciliation: fulfillment,
      fulfillment: store.fulfillment,
      subscription: store.subscription,
      money: store.money,
    },
    clock,
  );

  // The limiter is given to the router, not to any service: the edge is the only
  // place a request rate exists. Background workers are invoked directly by the
  // process that runs them and never pass through this router, so they cannot be
  // throttled by construction rather than by remembering to exempt them.
  const rateLimiter =
    options.rateLimit === false
      ? undefined
      : new RateLimiter(
          options.rateLimitStore ?? store.rateLimit,
          clock,
          options.rateLimitPolicy ?? DEFAULT_RATE_LIMIT_POLICY,
        );
  // The identity service is the router's authenticator, and the router cannot
  // be constructed without one: every registration that declared
  // `AUTHENTICATED` is refused before its handler exists, in one place, rather
  // than by each handler remembering to ask.
  // The retry record comes from the same bundle as every other store, for the
  // reason the limiter's does: a router whose recorded answers live in one
  // instance's memory while the data lives in Postgres collapses a retry only
  // when it happens to land on the instance that answered the first call.
  const router = new Router({
    metrics,
    rateLimiter,
    authenticator: identity,
    retry: store.retry,
  });
  router.get(
    "/health",
    [],
    // A liveness probe is answered by whatever is watching the process, which
    // holds no session and must get an answer even when identity itself is
    // unwell. It reports one word and reads nothing.
    anonymous("a liveness probe holds no session and must answer even when identity is unwell"),
    () => ({ status: 200, body: { status: "ok" } }),
  );
  router.get(
    "/ready",
    [],
    // The same, plus a count of the outbox backlog and the name of the
    // persistence backend: operational facts about CORE itself, with no tenant
    // dimension. Like `/metrics`, it is kept off the public internet by
    // deployment (B-5), not by a credential.
    anonymous("a readiness probe holds no session; system-level facts only (B-5)"),
    async () => {
      // The one route that reports on a dependency rather than using it, so the
      // one route where a failing dependency is an answer and not a defect.
      //
      // Milestone 37: this used to let the failure escape, and the router's
      // fail-closed default turned it into `500` `internal` — CORE telling an
      // orchestrator that CORE has a bug, when what happened is that CORE cannot
      // serve yet. An orchestrator reading `500` from a readiness probe has
      // grounds to stop; reading `503` it waits. The distinction is the whole
      // reason `unavailable` is in the vocabulary, and until this commit nothing
      // produced it.
      let pending: number;
      try {
        pending = (await outbox.counts())["pending"] ?? 0;
      } catch (cause) {
        throw unavailable("not ready: the outbox backlog could not be read", {
          persistence: store.kind,
          // The reason, not the stack: an operator needs to know which
          // dependency, and a probe answer is not a place to leak internals.
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
      return {
        status: 200,
        body: {
          status: "ready",
          persistence: store.kind,
          // An aggregate count, not the length of every pending row. Reading the
          // whole queue to report its size made a readiness probe cost more the
          // busier the system was.
          outbox_pending: pending,
        },
      };
    },
  );
  registerMetricsRoutes(router, metrics);
  registerIdentityRoutes(router, identity);
  registerOrganizationRoutes(router, organization, identity);
  registerMoneyRoutes(router, money, identity);
  registerFulfillmentRoutes(router, fulfillment, identity);
  registerIngressRoutes(router, ingress, identity);
  registerDeliveryRoutes(router, subscriptions, identity);
  registerGeographyRoutes(router, geography, identity);
  registerSubscriptionRoutes(router, billing, identity);
  registerReputationRoutes(router, reputation, identity);
  registerNotificationRoutes(router, notificationRecipients, notifications, identity);
  registerWebSessionRoutes(router, webSignIn, miniAppSignIn);

  return {
    router,
    webSignIn,
    miniAppSignIn,
    metrics,
    depthSampler,
    bus,
    outbox,
    boundary,
    publisher,
    ingress,
    dispatcher,
    replay,
    revival,
    subscriptions,
    deliveries,
    notificationRecipients,
    notifications,
    notificationDispatcher,
    notificationFanOut,
    audit,
    identity,
    organization,
    money,
    billing,
    fulfillment,
    reputation,
    geography,
    clock,
    persistence: store.kind,
  };
}
