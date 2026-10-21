import { AUTHENTICATED } from "../../platform/http/authentication.js";
import { objectBody } from "../../platform/http/body.js";
import { natural } from "../../platform/http/retry.js";
import type { Router } from "../../platform/http/router.js";
import { requirePrincipal } from "../identity-access/http.js";
import type { AuthenticatedPrincipal, IdentityService } from "../identity-access/service.js";
import type { NotificationStatus } from "./domain.js";
import type { NotificationReadService, NotificationRecipientRegistry } from "./service.js";

const STATUSES: readonly NotificationStatus[] = [
  "pending",
  "processing",
  "accepted",
  "delivered",
  "failed",
];

/**
 * Four routes, and no more.
 *
 * Configuration needs create, list and deactivate. Observability needs one list
 * with filters and the counts an operator actually watches, which is why there
 * is no `/pending`, `/failed` or `/retrying` endpoint: those are the same
 * question with a different filter, and a separate path per status is how one
 * concept ends up with five sources of truth that drift.
 *
 * Nothing here duplicates `/v1/event-deliveries/undelivered`. That answers "has
 * a subscribing system received this event"; these answer "has a person been
 * told". Folding them together would report a webhook as if it were a message
 * to somebody's phone.
 */
export function registerNotificationRoutes(
  router: Router<AuthenticatedPrincipal>,
  recipients: NotificationRecipientRegistry,
  reads: NotificationReadService,
  identity: IdentityService,
): void {
  // Operator-only. Deciding that a person is messaged about a tenant's events is
  // an infrastructure decision with a privacy consequence, not a tenant setting.
  router.post(
    "/v1/notification-recipients",
    objectBody(
      // Absent and explicit `null` both mean platform-wide, which is why this is
      // `nullable_text` rather than optional text: `null` is a value a caller
      // sends on purpose, and refusing it would refuse the platform-wide case.
      { name: "organization_id", kind: "nullable_text" },
      { name: "event_type", kind: "text", required: true },
      { name: "identity_id", kind: "text", required: true },
      { name: "channel", kind: "text", required: true },
      { name: "correlation_id", kind: "text", required: true },
    ),
    AUTHENTICATED,
    natural(
      "a recipient is unique on its (organization_id, event_type, identity_id, channel) registration: measured on main at bd92b69 a repeat added no notification_recipient row",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const created = await recipients.register({
      organization_id: ctx.input.text("organization_id") ?? null,
      event_type: ctx.input.requiredText("event_type"),
      identity_id: ctx.input.requiredText("identity_id"),
      channel: ctx.input.requiredText("channel"),
      correlation_id: ctx.input.requiredText("correlation_id"),
    });
    return { status: 201, body: created };
  });

  router.get(
    "/v1/notification-recipients",
    [{ name: "organization_id", kind: "text" }],
    AUTHENTICATED,
    async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const organizationId = ctx.selection.text("organization_id");
    const items = await recipients.list(organizationId);
    return { status: 200, body: { count: items.length, items } };
  });

  // Stops future events queueing for this recipient. Notifications already
  // queued stay queued: they describe something that already happened, and
  // dropping them silently is worse than sending them late.
  router.post(
    "/v1/notification-recipients/:recipient_id/deactivate",
    objectBody({ name: "correlation_id", kind: "text", required: true }),
    AUTHENTICATED,
    natural(
      "deactivation is a transition that is already done the second time round",
    ),
    async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const updated = await recipients.setActive(
      ctx.params["recipient_id"] ?? "",
      false,
      ctx.input.requiredText("correlation_id"),
    );
    return { status: 200, body: updated };
  });

  /**
   * The operator surface: what has been sent, what is stuck, and why.
   *
   * `summary` carries the counts including the derived `retrying`, so the common
   * question ("is anything piling up") is one request and not five.
   */
  router.get(
    "/v1/notifications",
    [
      { name: "status", kind: "enum", values: STATUSES },
      { name: "organization_id", kind: "text" },
      { name: "limit", kind: "limit", default: 100, min: 1, max: 500 },
    ],
    AUTHENTICATED,
    async (ctx) => {
    await requirePrincipal(ctx, identity, "platform.operate");
    const status = ctx.selection.text("status") as (typeof STATUSES)[number] | undefined;
    const organizationId = ctx.selection.text("organization_id");
    const limit = ctx.selection.number("limit");
    const items = await reads.list({
      ...(organizationId === undefined ? {} : { organization_id: organizationId }),
      ...(status === undefined ? {} : { status }),
      limit,
    });
    const summary = await reads.counts(organizationId);
    // Bodies and addresses are personal data, but they are also what an operator
    // needs to answer "what were they told". The route is operator-scoped for
    // that reason; the audit trail and the logs still never carry either.
    return { status: 200, body: { count: items.length, summary, items } };
  });
}
