import { forbidden } from "../../platform/errors.js";
import { AUTHENTICATED } from "../../platform/http/authentication.js";
import { NO_BODY, objectBody } from "../../platform/http/body.js";
import { keyed, natural } from "../../platform/http/retry.js";
import type { Router } from "../../platform/http/router.js";
import { requirePrincipal } from "../identity-access/http.js";
import type { AuthenticatedPrincipal, IdentityService } from "../identity-access/service.js";
import type { BillingInterval, SubscriptionOwnerType } from "./domain.js";
import type { SubscriptionService } from "./service.js";

/** The plan statuses `GET /v1/plans` may be filtered by. */
const PLAN_STATUSES = ["draft", "active", "retired"] as const;

/** The owner kinds a subscription may belong to. */
const OWNER_TYPES = ["identity", "organization"] as const;

/** The intervals a plan may bill on. */
const BILLING_INTERVALS = ["day", "week", "month", "year"] as const;

/**
 * CORE's own management surface for plans and subscriptions.
 *
 * Note what is deliberately absent: there is no entitlement-check endpoint.
 * ADR 0008 closes the list of synchronous paths between systems and the ADR
 * register requires a new ADR before any new one is written. An endpoint that
 * MARKET or MOVE would call on every request is exactly that, so
 * `SubscriptionService.checkEntitlement` is implemented and tested but reachable
 * only in-process, and the endpoint is recorded as a blocked decision in
 * ROADMAP.md. The routes below are operator and tenant management, the same
 * class as `/v1/wallets`, not a product integration path.
 */
export function registerSubscriptionRoutes(
  router: Router<AuthenticatedPrincipal>,
  billing: SubscriptionService,
  identity: IdentityService,
): void {
  router.post(
    "/v1/plans",
    objectBody(
      { name: "code", kind: "text", required: true },
      { name: "name", kind: "text", required: true },
      { name: "currency", kind: "text", required: true },
      { name: "amount_minor", kind: "integer", required: true },
      { name: "billing_interval", kind: "enum", values: BILLING_INTERVALS, required: true },
      { name: "interval_count", kind: "integer" },
      {
        name: "grants",
        kind: "list",
        required: true,
        minItems: 1,
        items: [
          { name: "feature_key", kind: "text", required: true },
          // Required *and* nullable: an omitted limit could mean "granted without
          // a quota" or "a quota of nothing", which are opposites, so CORE
          // refuses rather than choosing what a plan sells.
          {
            name: "limit_value",
            kind: "nullable_integer",
            required: true,
            hint: "use null for an unmetered grant",
          },
        ],
      },
    ),
    AUTHENTICATED,
    natural(
      "a plan is unique on its caller-supplied code: measured on main at bd92b69 a repeat answered 409 rather than creating a second plan, which is a refusal and not a duplicate",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    const intervalCount = ctx.input.number("interval_count");
    const result = await billing.createPlan({
      code: ctx.input.requiredText("code"),
      name: ctx.input.requiredText("name"),
      currency: ctx.input.requiredText("currency"),
      amount_minor: ctx.input.requiredNumber("amount_minor"),
      billing_interval: ctx.input.requiredText("billing_interval") as BillingInterval,
      ...(typeof intervalCount === "number" ? { interval_count: intervalCount } : {}),
      grants: ctx.input.list("grants").map((grant) => ({
        feature_key: grant.requiredText("feature_key"),
        limit_value: grant.number("limit_value") ?? null,
      })),
      correlation_id: ctx.correlation_id,
    });
    return { status: 201, body: { ...result.plan, grants: result.grants } };
  });

  router.get("/v1/plans", [{ name: "status", kind: "enum", values: PLAN_STATUSES }], AUTHENTICATED, async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.read");
    const status = ctx.selection.text("status") as (typeof PLAN_STATUSES)[number] | undefined;
    return { status: 200, body: { plans: await billing.listPlans(status) } };
  });

  router.get("/v1/plans/:plan_id", [], AUTHENTICATED, async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.read");
    const result = await billing.getPlan(ctx.params["plan_id"] ?? "");
    return { status: 200, body: { ...result.plan, grants: result.grants } };
  });

  router.post("/v1/plans/:plan_id/activate", NO_BODY, AUTHENTICATED, natural(
      "activation is a transition that has already happened the second time: measured on main at bd92b69 an active plan answered 409 to a second activation and no row changed",
    ), async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    return {
      status: 200,
      body: await billing.activatePlan({
        plan_id: ctx.params["plan_id"] ?? "",
        correlation_id: ctx.correlation_id,
      }),
    };
  });

  router.post("/v1/plans/:plan_id/retire", NO_BODY, AUTHENTICATED, natural(
      "retirement is the same transition in the other direction: measured on main at bd92b69 a second retirement answered 200 and wrote nothing, because a retired plan is already retired",
    ), async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    return {
      status: 200,
      body: await billing.retirePlan({
        plan_id: ctx.params["plan_id"] ?? "",
        correlation_id: ctx.correlation_id,
      }),
    };
  });

  router.post(
    "/v1/subscriptions",
    objectBody(
      { name: "owner_type", kind: "enum", values: OWNER_TYPES, required: true },
      { name: "owner_id", kind: "text", required: true },
      { name: "plan_id", kind: "text", required: true },
      { name: "wallet_id", kind: "text", required: true },
      { name: "starts_at", kind: "text" },
    ),
    AUTHENTICATED,
    keyed(
      "a subscription is the most expensive duplicate in CORE: a repeat creates a second subscription on the same plan and wallet, and therefore a second recurring charge, with no natural key anywhere to collapse it",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    const startsAt = ctx.input.text("starts_at");
    const result = await billing.subscribe({
      owner_type: ctx.input.requiredText("owner_type") as SubscriptionOwnerType,
      owner_id: ctx.input.requiredText("owner_id"),
      plan_id: ctx.input.requiredText("plan_id"),
      wallet_id: ctx.input.requiredText("wallet_id"),
      ...(typeof startsAt === "string" ? { starts_at: startsAt } : {}),
      correlation_id: ctx.correlation_id,
    });
    // 201 either way. A first charge that could not be collected still created
    // the subscription, and reporting that as a failure would invite the
    // caller to retry the signup and produce a second one.
    return {
      status: 201,
      body: {
        ...result.subscription,
        current_period: result.period,
        collected: result.charge.collected,
        uncollectible_reason: result.charge.reason,
      },
    };
  });

  router.get("/v1/subscriptions/:subscription_id", [], AUTHENTICATED, async (ctx) => {
    const actor = await requirePrincipal(ctx, identity, "subscription.read");
    const result = await billing.getSubscription(ctx.params["subscription_id"] ?? "");
    // Scoped to the subscription's owner (B-46). `subscription.read` is held by
    // `org_admin` and `support_agent` *of a tenant*; before B-46 this read
    // checked it with no organization, so either could read any tenant's
    // subscription. An organization's subscription is read inside that
    // organization; a person's only by that person — or by `platform_admin`,
    // whom `authorize` already lets into every organization.
    const owner = result.subscription;
    if (owner.owner_type === "organization") {
      identity.authorize(actor, "subscription.read", owner.owner_id);
    } else if (owner.owner_id !== actor.identity_id && !actor.roles.includes("platform_admin")) {
      throw forbidden("a person's subscription is read by that person", {
        owner_type: owner.owner_type,
      });
    }
    return { status: 200, body: { ...result.subscription, periods: result.periods } };
  });

  router.post(
    "/v1/subscriptions/:subscription_id/cancel",
    objectBody({ name: "reason", kind: "text", required: true }),
    AUTHENTICATED,
    natural(
      "cancellation is a transition that is a no-op once made: a cancelled subscription cannot be cancelled again",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    const result = await billing.cancelSubscription({
      subscription_id: ctx.params["subscription_id"] ?? "",
      reason: ctx.input.requiredText("reason"),
      correlation_id: ctx.correlation_id,
    });
    return {
      status: 200,
      body: { ...result.subscription, voided_period_id: result.voided_period_id },
    };
  });

  router.post(
    "/v1/subscriptions/:subscription_id/usage",
    objectBody(
      { name: "feature_key", kind: "text", required: true },
      { name: "quantity", kind: "integer", required: true },
      { name: "usage_reference", kind: "text", required: true },
      { name: "at", kind: "text" },
    ),
    AUTHENTICATED,
    natural(
      "a usage record is idempotent on (period, feature_key, usage_reference): measured on main at bd92b69 the second call answered 200 rather than 201 and added no usage_record row",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    const at = ctx.input.text("at");
    const result = await billing.recordUsage({
      subscription_id: ctx.params["subscription_id"] ?? "",
      feature_key: ctx.input.requiredText("feature_key"),
      quantity: ctx.input.requiredNumber("quantity"),
      usage_reference: ctx.input.requiredText("usage_reference"),
      ...(typeof at === "string" ? { at } : {}),
      correlation_id: ctx.correlation_id,
    });
    // 200 on a replay, 201 on a first write, so a reporter can tell whether
    // its retry was the one that counted without having to compare totals.
    return { status: result.recorded ? 201 : 200, body: result.usage };
  });

  router.post("/v1/subscription-periods/:period_id/collect", NO_BODY, AUTHENTICATED, natural(
      "collection is a transition on the period: a period already settled is not collected a second time, so the repeat answers from the state the first call left",
    ), async (ctx) => {
    await requirePrincipal(ctx, identity, "subscription.write");
    const result = await billing.chargePeriod({
      period_id: ctx.params["period_id"] ?? "",
      correlation_id: ctx.correlation_id,
    });
    // A refused collection is a recorded outcome, not a transport failure, so
    // it is a 200 carrying `collected: false` rather than a 4xx. The caller
    // asked CORE to attempt a collection and CORE did.
    return {
      status: 200,
      body: { ...result.period, collected: result.collected, reason: result.reason },
    };
  });
}
