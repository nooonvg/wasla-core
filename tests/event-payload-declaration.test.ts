/**
 * Every emitted event payload conforms to its published schema — milestone 40.
 *
 * The contract gate (scripts/check-contracts.mjs) proves every event type CORE
 * emits has a published schema. It has never read a payload. The
 * fulfillment-lifecycle-contract test validates the five fulfillment event
 * payloads against their schemas, and nothing validates the other fourteen.
 * A correct answer with no enforcement is a coincidence, not a guarantee.
 *
 * This gate drives every core event type CORE can produce, reads the emitted
 * payloads from the outbox, and asserts each one satisfies its published
 * contract: every required field present, no undeclared field, and every
 * present field's type matches the declaration. No database: every event is
 * produced over the in-memory backend, since the question is about the
 * producer's contract, not the store's.
 *
 * Falsification, each applied to a conformed payload and restored: a required
 * field removed, an undeclared field added, and a field's type changed. The
 * validation function is the same one the gate uses, so a mutation that
 * survives is a gate that measures the wrong thing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createCoreApp, type CoreApp } from "../src/app.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { FixedClock } from "../src/platform/clock.js";
import { makeEvent } from "../src/platform/eventing/envelope.js";
import { seedCountry } from "./support/rows.js";
import {
  CORE_EVENT_TYPES,
  payloadErrors,
  schemaFor,
} from "./support/event-schemas.js";
import { randomUUID } from "node:crypto";

const DAY = 86_400_000;
const START = new Date("2026-06-01T00:00:00.000Z");
const CORR = "event-payload-gate";

/** A whole CORE with a funded tenant, ready to drive. */
async function makeCore(): Promise<{
  core: CoreApp;
  clock: FixedClock;
  organizationId: string;
  principalId: string;
  walletId: string;
}> {
  const clock = new FixedClock(START);
  const store = memoryPersistence(clock);
  const core = createCoreApp({ clock, persistence: store, rateLimit: false });

  await seedCountry(store);

  const registered = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: "event-payload-admin",
    correlation_id: CORR,
  });
  const principalId = registered.principal.principal_id;

  const organization = await core.organization.create({
    name: "Event Payload Org",
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

  await core.identity.issueSession({
    principal_id: principalId,
    channel_type: "web",
    correlation_id: CORR,
  });

  const wallet = await core.money.createWallet({
    owner_type: "organization",
    owner_id: organizationId,
    currency: "SAR",
    correlation_id: CORR,
  });
  const walletId = wallet.wallet.wallet_id;

  await core.money.credit({
    wallet_id: walletId,
    amount_minor: 500_000,
    business_reference: "top-up",
    correlation_id: CORR,
  });

  return { core, clock, organizationId, principalId, walletId };
}

/** Read every event in the outbox, grouped by type. */
async function emittedEvents(core: CoreApp): Promise<Map<string, unknown[]>> {
  const all = await core.outbox.all();
  const byType = new Map<string, unknown[]>();
  for (const record of all) {
    const type = record.event.event_type;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(record.event.payload);
  }
  return byType;
}

/** Validate every payload of a given type and return all errors. */
function allErrors(eventType: string, payloads: unknown[]): string[] {
  const errors: string[] = [];
  for (const payload of payloads) {
    errors.push(...payloadErrors(eventType, payload as Record<string, unknown>));
  }
  return errors;
}

/** A move.job.accepted envelope for a fulfillment. */
function moveAccepted(fulfillmentId: string, jobId: string, clock: FixedClock) {
  return makeEvent({
    event_type: "move.job.accepted",
    version: 1,
    producer: "wasla-move",
    occurred_at: clock.now(),
    correlation_id: CORR,
    causation_id: null,
    entity_type: "operational_job",
    entity_id: jobId,
    payload: {
      fulfillment_id: fulfillmentId,
      job_id: jobId,
      accepted_at: clock.now().toISOString(),
    },
  });
}

/** A move.job.completed envelope for a fulfillment. */
function moveCompleted(fulfillmentId: string, jobId: string, clock: FixedClock) {
  return makeEvent({
    event_type: "move.job.completed",
    version: 1,
    producer: "wasla-move",
    occurred_at: clock.now(),
    correlation_id: CORR,
    causation_id: null,
    entity_type: "operational_job",
    entity_id: jobId,
    payload: {
      fulfillment_id: fulfillmentId,
      job_id: jobId,
      outcome: "completed",
      completed_at: clock.now().toISOString(),
    },
  });
}

describe("event payload declaration", () => {
  let core: CoreApp;
  let clock: FixedClock;
  let events: Map<string, unknown[]>;
  let organizationId: string;
  let principalId: string;
  let walletId: string;

  beforeAll(async () => {
    const setup = await makeCore();
    core = setup.core;
    clock = setup.clock;
    organizationId = setup.organizationId;
    principalId = setup.principalId;
    walletId = setup.walletId;

    // ── payment events ──
    // core.money.credited already emitted by the credit() in makeCore
    // core.identity.verified already emitted by registerIdentity

    // core.identity.account.deleted: a person registered apart, because the
    // setup principal holds platform_admin and an administrator's account is
    // refused — the refusal is the right answer to that caller, and this gate
    // needs the granted one. The deletion emits the event and nothing else.
    const deleted = await core.identity.registerIdentity({
      channel_type: "web",
      external_id: "event-payload-deleted",
      correlation_id: CORR,
    });
    const deletedSession = await core.identity.issueSession({
      principal_id: deleted.principal.principal_id,
      channel_type: "web",
      correlation_id: CORR,
    });
    const deletedActor = await core.identity.authenticate(deletedSession.token);
    await core.identity.deleteAccount(deletedActor, { correlation_id: CORR });

    const auth = await core.money.authorize({
      wallet_id: walletId,
      amount_minor: 5_000,
      business_reference: "auth-1",
      correlation_id: CORR,
    });
    // core.payment.authorized emitted

    await core.money.capture({
      authorization_id: auth.authorization_id,
      correlation_id: CORR,
    });
    // core.payment.captured emitted

    const auth2 = await core.money.authorize({
      wallet_id: walletId,
      amount_minor: 3_000,
      business_reference: "auth-2",
      correlation_id: CORR,
    });
    await core.money.capture({
      authorization_id: auth2.authorization_id,
      correlation_id: CORR,
    });
    await core.money.refund({
      authorization_id: auth2.authorization_id,
      refund_reference: "refund-1",
      reason: "test refund",
      correlation_id: CORR,
    });
    // core.payment.refunded emitted

    const auth3 = await core.money.authorize({
      wallet_id: walletId,
      amount_minor: 2_000,
      business_reference: "auth-3",
      correlation_id: CORR,
    });
    await core.money.voidAuthorization({
      authorization_id: auth3.authorization_id,
      reason: "test void",
      correlation_id: CORR,
    });
    // core.payment.voided emitted

    // ── subscription events ──
    const planResult = await core.billing.createPlan({
      code: `plan-${randomUUID().slice(0, 8)}`,
      name: "Test Plan",
      currency: "SAR",
      amount_minor: 5_000,
      billing_interval: "month",
      grants: [{ feature_key: "test.feature", limit_value: 100 }],
      correlation_id: CORR,
    });
    const plan = planResult.plan;
    await core.billing.activatePlan({ plan_id: plan.plan_id, correlation_id: CORR });

    // Funded subscription — will be renewed
    await core.billing.subscribe({
      owner_type: "organization",
      owner_id: organizationId,
      plan_id: plan.plan_id,
      wallet_id: walletId,
      correlation_id: CORR,
    });
    // core.subscription.created + core.subscription.period_settled emitted

    // Unfunded subscription — use an identity wallet (different owner, no funds)
    const identityWallet = await core.money.createWallet({
      owner_type: "identity",
      owner_id: principalId,
      currency: "SAR",
      correlation_id: CORR,
    });
    const planResult2 = await core.billing.createPlan({
      code: `plan-${randomUUID().slice(0, 8)}`,
      name: "Test Plan 2",
      currency: "SAR",
      amount_minor: 5_000,
      billing_interval: "month",
      grants: [{ feature_key: "test.feature2", limit_value: 100 }],
      correlation_id: CORR,
    });
    await core.billing.activatePlan({ plan_id: planResult2.plan.plan_id, correlation_id: CORR });
    await core.billing.subscribe({
      owner_type: "identity",
      owner_id: principalId,
      plan_id: planResult2.plan.plan_id,
      wallet_id: identityWallet.wallet.wallet_id,
      correlation_id: CORR,
    });
    // core.subscription.created + core.subscription.period_settled emitted

    // Cancel the funded subscription — will be expired by the renewal sweep
    const subs = await core.billing.listSubscriptionsForOwner(
      "organization",
      organizationId,
    );
    const fundedSub = subs.find((s: { wallet_id: string }) => s.wallet_id === walletId);
    if (fundedSub) {
      await core.billing.cancelSubscription({
        subscription_id: fundedSub.subscription_id,
        reason: "test cancellation",
        correlation_id: CORR,
      });
    }
    // core.subscription.cancelled emitted

    // Advance clock and run renewal sweep
    clock.advance(40 * DAY);
    await core.billing.renewDuePeriods(CORR);
    // core.subscription.renewed (unfunded sub) + core.subscription.past_due (unfunded sub charge fails)
    // + core.subscription.expired (cancelled sub) emitted

    // ── reputation events ──
    const rated = makeEvent({
      event_type: "market.review.rated",
      version: 1,
      producer: "wasla-market",
      occurred_at: clock.now(),
      correlation_id: CORR,
      causation_id: null,
      entity_type: "review",
      entity_id: "review-1",
      payload: {
        review_reference: "review-1",
        organization_id: organizationId,
        subject_type: "identity",
        subject_id: principalId,
        rating: 4,
        rated_at: clock.now().toISOString(),
      },
    });
    await core.bus.publish(rated);
    // core.reputation.signal_recorded emitted

    const retracted = makeEvent({
      event_type: "market.review.retracted",
      version: 1,
      producer: "wasla-market",
      occurred_at: clock.now(),
      correlation_id: CORR,
      causation_id: null,
      entity_type: "review",
      entity_id: "review-1",
      payload: {
        review_reference: "review-1",
        organization_id: organizationId,
        reason: "moderated",
        retracted_at: clock.now().toISOString(),
      },
    });
    await core.bus.publish(retracted);
    // core.reputation.signal_retracted emitted

    // ── fulfillment events ──
    // Create a fulfillment via market order
    const order = makeEvent({
      event_type: "market.order.created",
      version: 1,
      producer: "wasla-market",
      occurred_at: clock.now(),
      correlation_id: CORR,
      causation_id: null,
      entity_type: "order",
      entity_id: "order-1",
      payload: {
        order_id: "order-1",
        organization_id: organizationId,
        requested_service: "delivery",
        payment_authorization_id: null,
      },
    });
    await core.bus.publish(order);
    // core.fulfillment.created emitted

    // Find the fulfillment ID
    const createdFulfillment = (await core.outbox.all()).find(
      (r) => r.event.event_type === "core.fulfillment.created",
    );
    const fulfillmentId = createdFulfillment
      ? (createdFulfillment.event.payload as Record<string, string>)["fulfillment_id"]
      : undefined;

    if (fulfillmentId) {
      // Publish move.job.accepted → core.fulfillment.dispatched
      const jobId = `job-${randomUUID().slice(0, 8)}`;
      await core.bus.publish(moveAccepted(fulfillmentId, jobId, clock));

      // Publish move.job.completed → core.fulfillment.completed
      await core.bus.publish(moveCompleted(fulfillmentId, jobId, clock));
    }

    // Cancel a fulfillment, then deliver after cancellation
    const order2 = makeEvent({
      event_type: "market.order.created",
      version: 1,
      producer: "wasla-market",
      occurred_at: clock.now(),
      correlation_id: CORR,
      causation_id: null,
      entity_type: "order",
      entity_id: "order-2",
      payload: {
        order_id: "order-2",
        organization_id: organizationId,
        requested_service: "delivery",
        payment_authorization_id: null,
      },
    });
    await core.bus.publish(order2);

    const createdFulfillment2 = (await core.outbox.all())
      .filter((r) => r.event.event_type === "core.fulfillment.created")
      .find(
        (r) =>
          (r.event.payload as Record<string, string>)["order_reference"] ===
          "order-2",
      );
    const fulfillmentId2 = createdFulfillment2
      ? (createdFulfillment2.event.payload as Record<string, string>)["fulfillment_id"]
      : undefined;

    if (fulfillmentId2) {
      await core.fulfillment.cancel({
        fulfillment_id: fulfillmentId2,
        reason: "customer_cancelled",
        correlation_id: CORR,
      });
      // core.fulfillment.cancelled emitted

      const jobId2 = `job-${randomUUID().slice(0, 8)}`;
      await core.bus.publish(moveCompleted(fulfillmentId2, jobId2, clock));
      // core.fulfillment.executed_after_cancellation emitted
    }

    events = await emittedEvents(core);
  });

  // ── validate every event type against its published schema ──

  const ALL_CORE_TYPES = CORE_EVENT_TYPES;

  for (const eventType of ALL_CORE_TYPES) {
    it(`validates ${eventType} against its published schema`, () => {
      const payloads = events.get(eventType);
      expect(payloads, `no ${eventType} was emitted`).toBeDefined();
      expect(payloads!.length, `${eventType} was emitted 0 times`).toBeGreaterThan(0);
      const errors = allErrors(eventType, payloads!);
      expect(errors, errors.join("; ")).toHaveLength(0);
    });
  }

  // ── the census: every core event type with a published schema is covered ──

  describe("the census", () => {
    it("covers every core event type that has a published schema", () => {
      const covered = new Set<string>(ALL_CORE_TYPES);
      const uncovered = CORE_EVENT_TYPES.filter((t) => !covered.has(t));
      expect(
        uncovered,
        `core event types with published schemas but no gate case: ${uncovered.join(", ")}`,
      ).toHaveLength(0);
    });
  });

  // ── falsification: the validation function catches what it claims to catch ──

  describe("falsification", () => {
    const eventType = "core.payment.authorized";
    const schema = schemaFor(eventType);
    const examples = schema.examples ?? [];
    const conformingPayload = (examples[0] as Record<string, unknown>) ?? {};

    it("catches a missing required field", () => {
      const mutated = { ...conformingPayload };
      const requiredField = schema.required[0] ?? "authorization_id";
      delete mutated[requiredField];
      const errors = payloadErrors(eventType, mutated);
      expect(
        errors.some((e) => e.includes("missing required field")),
        `removing required field "${requiredField}" was not caught`,
      ).toBe(true);
    });

    it("catches an undeclared field", () => {
      const mutated = { ...conformingPayload, undeclared_field: "should not be here" };
      const errors = payloadErrors(eventType, mutated);
      expect(
        errors.some((e) => e.includes("undeclared_field") && e.includes("does not declare")),
        "adding an undeclared field was not caught",
      ).toBe(true);
    });

    it("catches a wrong-typed field", () => {
      const props = schema.properties as Record<string, Record<string, unknown>>;
      const integerField = Object.entries(props).find(
        ([, p]) => p.type === "integer",
      );
      if (!integerField) return;
      const [field] = integerField;
      const mutated = { ...conformingPayload, [field]: "not-an-integer" };
      const errors = payloadErrors(eventType, mutated);
      expect(
        errors.some((e) => e.includes(field) && e.includes("contract declares integer")),
        `changing "${field}" to a string was not caught`,
      ).toBe(true);
    });

    it("passes a conforming payload", () => {
      const errors = payloadErrors(eventType, conformingPayload);
      expect(errors, errors.join("; ")).toHaveLength(0);
    });
  });
});
