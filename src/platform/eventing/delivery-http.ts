import { AUTHENTICATED } from "../http/authentication.js";
import { notFound } from "../errors.js";
import { NO_BODY, objectBody } from "../http/body.js";
import { natural } from "../http/retry.js";
import type { Router } from "../http/router.js";
import { requirePrincipal } from "../../modules/identity-access/http.js";
import type { AuthenticatedPrincipal, IdentityService } from "../../modules/identity-access/service.js";
import { redactDelivery, type SubscriptionRegistry } from "./delivery.js";

export function registerDeliveryRoutes(
  router: Router<AuthenticatedPrincipal>,
  registry: SubscriptionRegistry,
  identity: IdentityService,
): void {
  // Operator-only, deliberately: an endpoint CORE will sign payloads for is
  // infrastructure configuration, not something a tenant may add.
  router.post(
    "/v1/event-subscriptions",
    objectBody(
      { name: "subscriber", kind: "text", required: true },
      { name: "event_type", kind: "text", required: true },
      { name: "endpoint_url", kind: "text", required: true },
      { name: "signing_secret", kind: "text", required: true },
    ),
    AUTHENTICATED,
    natural(
      "a subscription is unique on (subscriber, event_type, endpoint_url): measured on main at bd92b69 a repeat added no event_subscription row, so no event is delivered twice",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const created = await registry.register({
      subscriber: ctx.input.requiredText("subscriber"),
      event_type: ctx.input.requiredText("event_type"),
      endpoint_url: ctx.input.requiredText("endpoint_url"),
      signing_secret: ctx.input.requiredText("signing_secret"),
    });
    // The secret is never echoed, not even to the caller that just sent it.
    // A response body is the easiest place for a secret to end up in a log.
    return { status: 201, body: created };
  });

  router.get("/v1/event-subscriptions", [], AUTHENTICATED, async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const items = await registry.list();
    return { status: 200, body: { count: items.length, items } };
  });

  // Pausing a subscriber stops the fan-out queueing new work for it. Deliveries
  // already queued stay queued: they were promised, and dropping them silently
  // would be worse than delivering them late.
  router.post("/v1/event-subscriptions/:subscription_id/deactivate", NO_BODY, AUTHENTICATED, natural(
      "deactivation is a transition that is a no-op once made",
    ), async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const id = ctx.params["subscription_id"] ?? "";
    const items = await registry.list();
    if (!items.some((s) => s.subscription_id === id)) throw notFound("subscription not found");
    await registry.setActive(id, false);
    return { status: 200, body: { subscription_id: id, active: false } };
  });

  router.post("/v1/event-subscriptions/:subscription_id/activate", NO_BODY, AUTHENTICATED, natural(
      "activation is a transition that is a no-op once made",
    ), async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const id = ctx.params["subscription_id"] ?? "";
    const items = await registry.list();
    if (!items.some((s) => s.subscription_id === id)) throw notFound("subscription not found");
    await registry.setActive(id, true);
    return { status: 200, body: { subscription_id: id, active: true } };
  });

  // What CORE has promised to deliver and has not. An empty list is the
  // invariant an operator should expect to see.
  router.get("/v1/event-deliveries/undelivered", [], AUTHENTICATED, async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const items = await registry.undelivered();
    // The claim token is redacted for the reason the signing secret is: it is a
    // credential, not a fact about the delivery. The route is operator-only
    // since B-46 (until then it checked `organization.read`, held by every
    // member of every tenant), and the redaction stays regardless: a caller
    // holding a live claim token can acknowledge a delivery it is not performing.
    return { status: 200, body: { count: items.length, items: items.map(redactDelivery) } };
  });
}
