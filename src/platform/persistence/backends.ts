import { InMemoryAuditLog, type AuditLog } from "../audit/audit.js";
import { PgAuditLog } from "../audit/pg-audit.js";
import type { Clock } from "../clock.js";
import { InMemoryInbox, type InboxStore } from "../eventing/inbox.js";
import { InMemoryRateLimitWindowStore, type RateLimitWindowStore } from "../http/rate-limit.js";
import { PgRateLimitWindowStore } from "../http/pg-rate-limit.js";
import { InMemoryRetryRecordStore, type RetryRecordStore } from "../http/retry.js";
import { PgRetryRecordStore } from "../http/pg-retry.js";
import { InMemoryInboundEventStore, type InboundEventStore } from "../eventing/ingress.js";
import { InMemoryDeliveryStore, type DeliveryStore } from "../eventing/delivery.js";
import { PgDeliveryStore } from "../eventing/pg-delivery.js";
import { PgInboundEventStore } from "../eventing/pg-ingress.js";
import { InMemoryOutbox, type OutboxStore } from "../eventing/outbox.js";
import { PgInbox } from "../eventing/pg-inbox.js";
import { PgOutbox } from "../eventing/pg-outbox.js";
import { InMemoryFulfillmentRepository } from "../../modules/fulfillment/service.js";
import type { FulfillmentRepository } from "../../modules/fulfillment/service.js";
import { PgFulfillmentRepository } from "../../modules/fulfillment/pg-repository.js";
import { InMemoryGeographyRepository } from "../../modules/geography/repository.js";
import type { GeographyRepository } from "../../modules/geography/repository.js";
import { PgGeographyRepository } from "../../modules/geography/pg-repository.js";
import { InMemoryIdentityRepository } from "../../modules/identity-access/memory-repository.js";
import type { IdentityRepository } from "../../modules/identity-access/ports.js";
import { PgIdentityRepository } from "../../modules/identity-access/pg-repository.js";
import { InMemoryMiniAppProofStore, InMemoryWebSignInNonceStore } from "../../modules/web-session/memory-ledger.js";
import type { MiniAppInitDataStore, WebSignInNonceStore } from "../../modules/web-session/service.js";
import { InMemoryNotificationStore } from "../../modules/notification/repository.js";
import type { NotificationStore } from "../../modules/notification/repository.js";
import { PgMiniAppProofStore, PgWebSignInNonceStore } from "../../modules/web-session/pg-ledger.js";
import { PgNotificationStore } from "../../modules/notification/pg-repository.js";
import { InMemoryMoneyRepository } from "../../modules/money/repository.js";
import type { MoneyRepository } from "../../modules/money/repository.js";
import { PgMoneyRepository } from "../../modules/money/pg-repository.js";
import { InMemoryOrganizationRepository } from "../../modules/organization/service.js";
import { InMemorySubscriptionRepository } from "../../modules/subscription/repository.js";
import type { SubscriptionRepository } from "../../modules/subscription/repository.js";
import { PgSubscriptionRepository } from "../../modules/subscription/pg-repository.js";
import { InMemoryReputationRepository } from "../../modules/reputation/repository.js";
import type { ReputationRepository } from "../../modules/reputation/repository.js";
import { PgReputationRepository } from "../../modules/reputation/pg-repository.js";
import type { OrganizationRepository } from "../../modules/organization/service.js";
import { PgOrganizationRepository } from "../../modules/organization/pg-repository.js";
import type { Queryable } from "./postgres.js";
import { ReferenceKeys } from "./reference-keys.js";
import {
  InProcessReplayLock,
  PgAdvisoryReplayLock,
  REVIVAL_LOCK_KEY,
  type ReplayLock,
} from "../replay/lock.js";
import { PgTransactionBoundary } from "./postgres.js";
import { InMemoryTransactionBoundary, type TransactionBoundary } from "./transaction.js";

/**
 * Everything the composition root needs in order to persist anything.
 *
 * It is one bundle on purpose. A unit of work commits a domain write and an
 * outbox append together, so the repositories, the outbox and the boundary
 * must all belong to the same backend. Selecting them individually would make
 * it possible to wire a `Map` repository next to a Postgres outbox, which
 * compiles, runs, and is not atomic.
 */
export interface Persistence {
  readonly kind: "memory" | "postgres";
  audit: AuditLog;
  outbox: OutboxStore;
  inbox: InboxStore;
  inbound: InboundEventStore;
  delivery: DeliveryStore;
  /** Notifications to people, as opposed to `delivery`, which is to systems. */
  notification: NotificationStore;
  /** The web sign-in one-time token ledger (XR-8.5) — the replay guard for login proofs. */
  /** The web sign-in nonce store (XR-8.5) — the browser binding for login attempts. */
  webSignInNonces: WebSignInNonceStore;
  /** دفترُ أدلّةِ المصغّرِ (D-XR-13): استهلاكٌ ذرّيٌّ واحدٌ لكلِّ دليلٍ موقَّعٍ. */
  miniAppProofs: MiniAppInitDataStore;
  boundary: TransactionBoundary;
  /**
   * Mutual exclusion for replay runs. Part of the bundle because the correct
   * lock depends entirely on the backend: in-process is right for the memory
   * store and wrong for Postgres, where two CORE instances share one database
   * and only the database can arbitrate between them.
   */
  replayLock: ReplayLock;
  /**
   * Mutual exclusion for queue revival runs (B-27). Its own lock rather than the
   * replay one: the two operations touch different tables, so making an operator
   * reviving a dead delivery wait for somebody replaying inbound events would be
   * exclusion that protects nothing.
   */
  revivalLock: ReplayLock;
  /**
   * Ingress rate-limit windows. Part of the bundle so that choosing Postgres and
   * choosing the shared, cross-instance limiter is one decision rather than two:
   * wiring the durable backend next to an in-process limiter would silently
   * multiply every limit by the number of instances running.
   */
  rateLimit: RateLimitWindowStore;
  /**
   * Answers already given, for the routes that collapse a retry against the
   * caller's `Idempotency-Key` (milestone 32). Part of the bundle for the same
   * reason the limiter is: an in-process record behind two instances collapses
   * a retry only when it happens to land on the instance that answered the
   * first call, so choosing Postgres and choosing a record every instance can
   * see has to be one decision.
   */
  retry: RetryRecordStore;
  identity: IdentityRepository;
  organization: OrganizationRepository;
  money: MoneyRepository;
  geography: GeographyRepository;
  fulfillment: FulfillmentRepository;
  subscription: SubscriptionRepository;
  reputation: ReputationRepository;
  /**
   * The reference backend's foreign-key registry, present only on that backend.
   *
   * Exposed rather than kept private because it is the one part of the
   * referential check that can be silently incomplete: a parent table no store
   * attached is a key that cannot be evaluated, and the parity suite asserts
   * `referenceKeys.unresolvedParents()` is empty for this bundle. Postgres
   * enforces its own keys and leaves this undefined, which is also what tells
   * the suite which half it is probing.
   */
  referenceKeys?: ReferenceKeys;
}

/** Reference backend. Keeps the tests and local runs dependency-free. */
export function memoryPersistence(clock: Clock): Persistence {
  // Built before the bundle so the subscription store can be handed a reader
  // for it. Migration 0010 gives Postgres a deferred trigger comparing a
  // settled period against the hold that settled it; without this wiring the
  // memory backend could not express that check, and a backend that enforces
  // less than production is a backend that certifies bugs (B-12).
  // One registry per bundle, for the same reason the bundle exists at all: the
  // schema's 30 foreign keys cross store boundaries, so each store hands its
  // maps to this registry and `putRow` refuses a child row whose parent is not
  // in it. Per bundle and not per process, so two `memoryPersistence()` bundles
  // in one test file stay two independent databases — a shared registry would
  // let a row written in one satisfy a key in the other, which no Postgres run
  // would do.
  const keys = new ReferenceKeys();
  const money = new InMemoryMoneyRepository(keys);
  return {
    kind: "memory",
    audit: new InMemoryAuditLog(clock),
    outbox: new InMemoryOutbox(clock, keys),
    inbox: new InMemoryInbox(clock),
    inbound: new InMemoryInboundEventStore(clock),
    delivery: new InMemoryDeliveryStore(clock, keys),
    notification: new InMemoryNotificationStore(keys),
    webSignInNonces: new InMemoryWebSignInNonceStore(clock, keys),
    miniAppProofs: new InMemoryMiniAppProofStore(clock, keys),
    boundary: new InMemoryTransactionBoundary(),
    replayLock: new InProcessReplayLock(),
    revivalLock: new InProcessReplayLock(),
    rateLimit: new InMemoryRateLimitWindowStore(clock),
    retry: new InMemoryRetryRecordStore(clock),
    identity: new InMemoryIdentityRepository(keys),
    organization: new InMemoryOrganizationRepository(keys),
    money,
    geography: new InMemoryGeographyRepository(keys),
    fulfillment: new InMemoryFulfillmentRepository(keys),
    subscription: new InMemorySubscriptionRepository(
      (id) => money.authorizationSnapshot(id),
      keys,
    ),
    reputation: new InMemoryReputationRepository(keys),
    referenceKeys: keys,
  };
}

/**
 * Postgres backend.
 *
 * `pool` is passed in rather than constructed here so that CORE never owns a
 * connection string and nothing in `src/` has to read an environment variable
 * or import the driver. The caller decides how the pool is configured and when
 * it is closed.
 */
export function postgresPersistence(pool: PostgresPool, clock: Clock): Persistence {
  return {
    kind: "postgres",
    audit: new PgAuditLog(pool, clock),
    outbox: new PgOutbox(pool, clock),
    inbox: new PgInbox(pool, clock),
    inbound: new PgInboundEventStore(pool, clock),
    delivery: new PgDeliveryStore(pool, clock),
    notification: new PgNotificationStore(pool),
    webSignInNonces: new PgWebSignInNonceStore(pool, clock),
    miniAppProofs: new PgMiniAppProofStore(pool, clock),
    boundary: new PgTransactionBoundary(pool as never),
    replayLock: new PgAdvisoryReplayLock(pool),
    revivalLock: new PgAdvisoryReplayLock(pool, REVIVAL_LOCK_KEY),
    rateLimit: new PgRateLimitWindowStore(pool, clock),
    retry: new PgRetryRecordStore(pool, clock),
    identity: new PgIdentityRepository(pool),
    organization: new PgOrganizationRepository(pool),
    money: new PgMoneyRepository(pool),
    geography: new PgGeographyRepository(pool),
    fulfillment: new PgFulfillmentRepository(pool),
    subscription: new PgSubscriptionRepository(pool as never),
    reputation: new PgReputationRepository(pool as never),
  };
}

/** The part of a `pg.Pool` this backend uses: queries plus a client to run BEGIN on. */
export interface PostgresPool extends Queryable {
  connect(): Promise<{
    query: Queryable["query"];
    release(): void;
  }>;
}
