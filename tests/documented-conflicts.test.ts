/**
 * Every documented conflict has a producer, and every producer is documented.
 *
 * Milestone 36 built the response gate and named the two statuses its matrix
 * does not reach: `409` and `500`. Milestone 37 closed `500` by replaying the
 * scenario against a persistence that throws. This file closes `409`, and it
 * cannot be done the same way, because a conflict is not a broken backend — it
 * is a business fact that has to be *made* before the route will refuse.
 *
 * Two rules this file follows, both of them learned the hard way in cycle 39's
 * own measurement:
 *
 *  - **A driver must change the business fact, not repeat the request.** The
 *    first probe of this cycle re-sent each recorded request with a fresh
 *    idempotency key and an identical body, and read `2xx` on 14 of the 17
 *    documented conflicts — which looked like "11 documented conflicts are
 *    unreachable" and was wrong. An identical body exercises the natural-key and
 *    idempotency path. `POST .../capture` really does answer `409` when the
 *    second capture asks for money the hold no longer has.
 *  - **The mechanism is declared, not discovered.** Each driver says whether it
 *    reaches the conflict through a domain rule or through the platform's
 *    key-reuse refusal, and the census of mechanisms is asserted exactly. Some
 *    keyed creates have no domain conflict at all — `POST /v1/geography/countries`
 *    upserts, by a decision recorded in its own route — so their documented `409`
 *    is only reachable by a caller reusing a key with a different request. That is
 *    a fact about the contract, and it is written down here rather than hidden
 *    inside a helper that tries mechanisms until one works.
 *
 * Setup runs over HTTP wherever a route can make the state. Two places it
 * cannot: closing a fulfillment other than by cancelling it needs a
 * `move.job.completed` event from MARKET's own service token, and expiring a
 * subscription needs the renewal sweep, which no route exposes. Both are driven
 * through the service, and the refusal being measured is still taken over
 * `router.handle`.
 */
import { describe, expect, it } from "vitest";
import { runScenario, type Scenario } from "./support/http-scenario.js";
import { loadContract } from "./support/openapi.js";
import { makeEvent } from "../src/platform/eventing/envelope.js";
import { FixedClock } from "../src/platform/clock.js";

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

interface Context {
  readonly scenario: Scenario;
  /** A write over `router.handle` with a fresh key, as the token stands now. */
  send(method: string, url: string, body?: unknown, key?: string): Promise<Answer>;
  /** The recorded request and answer for a contract label. */
  recorded(label: string): { url: string; body: unknown; headers: Record<string, string> };
  /** A wallet with money, funded by the scenario. */
  fundedWallet(): string;
}

type Mechanism = "domain" | "key_reuse";

interface Driver {
  /** The contract label whose `409` this driver produces. */
  readonly label: string;
  readonly mechanism: Mechanism;
  /** The exact refusal expected, so a producer cannot be swapped unnoticed. */
  readonly message: string;
  /**
   * True for the one driver that moves the clock. It runs last: a fixed clock
   * moved seventy days forward also expires the scenario's session, and every
   * driver after it would measure `401` instead of a conflict.
   */
  readonly advancesClock?: true;
  run(context: Context): Promise<Answer>;
}

const CORR = "documented-conflicts";

/** A plan nobody else uses, created and left in the state the driver needs. */
async function plan(
  context: Context,
  code: string,
  activate: boolean,
  amountMinor = 1000,
): Promise<string> {
  const created = await context.send("POST", "/v1/plans", {
    code,
    name: `Conflict driver ${code}`,
    currency: "SAR",
    amount_minor: amountMinor,
    billing_interval: "month",
    grants: [{ feature_key: "deliveries", limit_value: null }],
  });
  expect(created.status, `plan ${code} should have been created`).toBe(201);
  const planId = (created.body as { plan_id: string }).plan_id;
  if (activate) {
    const activated = await context.send("POST", `/v1/plans/${planId}/activate`);
    expect(activated.status, `plan ${code} should have been activated`).toBe(200);
  }
  return planId;
}

/** An authorization on a funded wallet, captured to the degree asked for. */
async function hold(
  context: Context,
  reference: string,
  amountMinor: number,
  captureMinor?: number,
): Promise<string> {
  const authorized = await context.send("POST", "/v1/payment-authorizations", {
    wallet_id: context.fundedWallet(),
    amount_minor: amountMinor,
    business_reference: reference,
  });
  expect(authorized.status, `hold ${reference} should have been authorized`).toBe(201);
  const id = (authorized.body as { authorization_id: string }).authorization_id;
  if (captureMinor !== undefined) {
    const captured = await context.send("POST", `/v1/payment-authorizations/${id}/capture`, {
      amount_minor: captureMinor,
      capture_reference: `${reference}-capture`,
    });
    expect(captured.status, `hold ${reference} should have been captured`).toBe(200);
  }
  return id;
}

/** An organization with a wallet holding nothing, so its first period cannot be collected. */
async function pennilessSubscription(
  context: Context,
  suffix: string,
): Promise<{ subscriptionId: string; voidedPeriodId: string }> {
  const organization = await context.send("POST", "/v1/organizations", {
    name: `Conflict driver org ${suffix}`,
    country_code: "SA",
  });
  expect(organization.status, "the driver's organization should exist").toBe(201);
  const organizationId = (organization.body as { organization_id: string }).organization_id;
  const wallet = await context.send("POST", "/v1/wallets", {
    owner_type: "organization",
    owner_id: organizationId,
    currency: "SAR",
  });
  expect([200, 201], "the driver's empty wallet should exist").toContain(wallet.status);
  const planId = await plan(context, `conflict-${suffix}`, true, 5000);
  const subscribed = await context.send("POST", "/v1/subscriptions", {
    owner_type: "organization",
    owner_id: organizationId,
    plan_id: planId,
    wallet_id: (wallet.body as { wallet_id: string }).wallet_id,
  });
  expect(subscribed.status, "the driver's subscription should exist").toBe(201);
  const subscriptionId = (subscribed.body as { subscription_id: string }).subscription_id;
  // The first period was charged against an empty wallet, so it is
  // uncollectible rather than settled, and cancelling voids it.
  const cancelled = await context.send("POST", `/v1/subscriptions/${subscriptionId}/cancel`, {
    reason: "customer_request",
  });
  expect(cancelled.status, "the driver's subscription should have been cancelled").toBe(200);
  const voidedPeriodId = (cancelled.body as { voided_period_id: string | null }).voided_period_id;
  expect(voidedPeriodId, "cancelling an unpaid period should void it").not.toBeNull();
  return { subscriptionId, voidedPeriodId: voidedPeriodId as string };
}

/**
 * One field of a recorded body changed, keeping the body valid: the first string
 * that is not a two-letter code gets a character, else the first number gains 1.
 * `undefined` when the body has no field this rule can touch — five routes take
 * no body at all, and the caller skips them rather than guessing.
 */
function changeOneField(body: unknown): Record<string, unknown> | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined;
  const fields = { ...(body as Record<string, unknown>) };
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.length > 0 && !/^[A-Z]{2}$/.test(value)) {
      return { ...fields, [name]: `${value}-changed` };
    }
    if (typeof value === "number") return { ...fields, [name]: value + 1 };
  }
  return undefined;
}

/** Re-sends a recorded request under its own key, with one field changed. */
async function reuseKey(context: Context, label: string): Promise<Answer> {
  const recorded = context.recorded(label);
  const key = recorded.headers["idempotency-key"];
  expect(key, `${label} should have been sent with a key`).toBeTruthy();
  const body = recorded.body as Record<string, unknown>;
  return context.send("POST", recorded.url, { ...body, name: `${String(body.name)} (changed)` }, key);
}

const DRIVERS: readonly Driver[] = [
  {
    label: "POST /v1/me/deletion",
    mechanism: "domain",
    message: "transfer or close the organizations you administer before deleting your account",
    run: (context) => context.send("POST", "/v1/me/deletion"),
  },
  {
    label: "POST /v1/memberships",
    mechanism: "domain",
    message: "membership already exists",
    run: (context) => {
      const recorded = context.recorded("POST /v1/memberships");
      return context.send("POST", recorded.url, recorded.body);
    },
  },
  {
    label: "POST /v1/organizations",
    mechanism: "key_reuse",
    message: "this Idempotency-Key was already used with a different request",
    run: (context) => reuseKey(context, "POST /v1/organizations"),
  },
  {
    label: "POST /v1/me/organizations",
    mechanism: "key_reuse",
    message: "this Idempotency-Key was already used with a different request",
    run: (context) => reuseKey(context, "POST /v1/me/organizations"),
  },
  {
    label: "POST /v1/payment-authorizations",
    mechanism: "domain",
    message: "insufficient available balance",
    run: (context) =>
      context.send("POST", "/v1/payment-authorizations", {
        wallet_id: context.fundedWallet(),
        amount_minor: 999_999_999,
        business_reference: "conflict-driver-too-large",
      }),
  },
  {
    label: "POST /v1/payment-authorizations/{authorization_id}/capture",
    mechanism: "domain",
    message: "capture of 900 exceeds the remaining hold of 600",
    run: async (context) => {
      const id = await hold(context, "conflict-driver-partial", 1000, 400);
      return context.send("POST", `/v1/payment-authorizations/${id}/capture`, {
        amount_minor: 900,
        capture_reference: "conflict-driver-partial-second",
      });
    },
  },
  {
    label: "POST /v1/payment-authorizations/{authorization_id}/refund",
    mechanism: "domain",
    message: "nothing has been captured on this authorization",
    run: async (context) => {
      const id = await hold(context, "conflict-driver-uncaptured", 1000);
      return context.send("POST", `/v1/payment-authorizations/${id}/refund`, {
        refund_reference: "conflict-driver-refund",
        reason: "customer_cancelled",
        amount_minor: 100,
      });
    },
  },
  {
    label: "POST /v1/payment-authorizations/{authorization_id}/void",
    mechanism: "domain",
    message: "a captured authorization cannot be voided",
    run: async (context) => {
      const id = await hold(context, "conflict-driver-fully-captured", 1000, 1000);
      return context.send("POST", `/v1/payment-authorizations/${id}/void`, {
        reason: "expired_hold",
      });
    },
  },
  {
    label: "POST /v1/geography/countries",
    mechanism: "key_reuse",
    message: "this Idempotency-Key was already used with a different request",
    run: (context) => reuseKey(context, "POST /v1/geography/countries"),
  },
  {
    label: "POST /v1/geography/cities",
    mechanism: "key_reuse",
    message: "this Idempotency-Key was already used with a different request",
    run: (context) => reuseKey(context, "POST /v1/geography/cities"),
  },
  {
    label: "POST /v1/geography/service-areas",
    mechanism: "domain",
    message: "radius_metres exceeds the reference-data limit",
    run: (context) => {
      const recorded = context.recorded("POST /v1/geography/service-areas");
      return context.send("POST", recorded.url, {
        ...(recorded.body as Record<string, unknown>),
        name: "Conflict driver area",
        radius_metres: 600_000,
      });
    },
  },
  {
    label: "POST /v1/plans",
    mechanism: "domain",
    message: "plan code already exists",
    run: (context) => {
      const recorded = context.recorded("POST /v1/plans");
      return context.send("POST", recorded.url, recorded.body);
    },
  },
  {
    label: "POST /v1/plans/{plan_id}/activate",
    mechanism: "domain",
    message: "plan is retired",
    run: (context) =>
      context.send("POST", context.recorded("POST /v1/plans/{plan_id}/activate").url),
  },
  {
    label: "POST /v1/plans/{plan_id}/retire",
    mechanism: "domain",
    message: "a draft plan was never offered and cannot be retired",
    run: async (context) => {
      const planId = await plan(context, "conflict-driver-draft", false);
      return context.send("POST", `/v1/plans/${planId}/retire`);
    },
  },
  {
    label: "POST /v1/subscriptions",
    mechanism: "domain",
    message: "owner already has a live subscription to this plan",
    run: async (context) => {
      const recorded = context.recorded("POST /v1/subscriptions");
      const planId = await plan(context, "conflict-driver-live", true);
      const body = { ...(recorded.body as Record<string, unknown>), plan_id: planId };
      const first = await context.send("POST", "/v1/subscriptions", body);
      expect(first.status, "the first subscription should have been created").toBe(201);
      return context.send("POST", "/v1/subscriptions", body);
    },
  },
  {
    label: "POST /v1/subscriptions/{subscription_id}/usage",
    mechanism: "domain",
    message: "period was voided and cannot accrue usage",
    run: async (context) => {
      const { subscriptionId } = await pennilessSubscription(context, "usage");
      return context.send("POST", `/v1/subscriptions/${subscriptionId}/usage`, {
        feature_key: "deliveries",
        quantity: 1,
        usage_reference: "conflict-driver-usage",
      });
    },
  },
  {
    label: "POST /v1/subscription-periods/{period_id}/collect",
    mechanism: "domain",
    message: "period was voided and cannot be collected",
    run: async (context) => {
      const { voidedPeriodId } = await pennilessSubscription(context, "collect");
      return context.send("POST", `/v1/subscription-periods/${voidedPeriodId}/collect`);
    },
  },
  {
    label: "POST /v1/fulfillments/{fulfillment_id}/cancel",
    mechanism: "domain",
    message: "fulfillment is already closed",
    run: async (context) => {
      // Cancelling a cancelled fulfillment is idempotent by decision (B-29), so
      // the conflict needs a fulfillment closed some other way. The only route
      // to that is MARKET's completion event, which arrives on a service token
      // this file does not hold, so the event is consumed directly.
      const rows = await (
        context.scenario.store as unknown as {
          fulfillment: { all(): Promise<ReadonlyArray<{ fulfillment_id: string; status: string }>> };
        }
      ).fulfillment.all();
      const open = rows.find((row) => row.status === "coordinating");
      expect(open, "the scenario should leave one fulfillment open").toBeDefined();
      const closed = await context.scenario.core.fulfillment.consumeMoveCompletion(
        makeEvent({
          event_type: "move.job.completed",
          version: 1,
          producer: "wasla-move",
          occurred_at: context.scenario.core.clock.now(),
          correlation_id: CORR,
          entity_type: "move_job",
          entity_id: "conflict-driver-job",
          payload: {
            fulfillment_id: open!.fulfillment_id,
            job_id: "conflict-driver-job",
            outcome: "failed",
            completed_at: context.scenario.core.clock.now().toISOString(),
          },
        }),
      );
      expect(closed.status, "the completion should have closed the fulfillment").toBe("failed");
      return context.send("POST", `/v1/fulfillments/${open!.fulfillment_id}/cancel`, {
        reason: "customer_cancelled",
      });
    },
  },
  {
    label: "POST /v1/subscriptions/{subscription_id}/cancel",
    mechanism: "domain",
    message: "subscription has already expired",
    advancesClock: true,
    run: async (context) => {
      const { subscriptionId } = await pennilessSubscription(context, "expiry");
      // A cancelled subscription expires once its last period ends, and only the
      // renewal sweep does that. Moving a fixed clock seventy days forward also
      // expires every session issued before it, so this driver re-issues one.
      (context.scenario.core.clock as FixedClock).advance(70 * 24 * 60 * 60 * 1000);
      const sweep = await context.scenario.core.billing.renewDuePeriods(CORR);
      expect(sweep.expired, "the sweep should have expired the subscription").toContain(
        subscriptionId,
      );
      const current = context.scenario.answers.get("GET /v1/sessions/current")!.body as {
        principal_id: string;
      };
      const session = await context.scenario.core.identity.issueSession({
        principal_id: current.principal_id,
        channel_type: "web",
        correlation_id: CORR,
      });
      return context.scenario.core.router.handle({
        method: "POST",
        url: `/v1/subscriptions/${subscriptionId}/cancel`,
        headers: {
          authorization: `Bearer ${session.token}`,
          "idempotency-key": "conflict-driver-cancel-expired",
        },
        body: { reason: "duplicate_request" },
      }) as Promise<Answer>;
    },
  },
];

/** Runs every driver once, in declaration order, and keeps what each answered. */
async function driveAll(): Promise<{
  answers: Map<string, Answer>;
  scenario: Scenario;
}> {
  const scenario = await runScenario();
  let keys = 0;
  const recorded = (label: string) => {
    const answer = scenario.answers.get(label);
    if (!answer) throw new Error(`the scenario drove no ${label}`);
    return { url: answer.request.url, body: answer.request.body, headers: answer.request.headers };
  };
  const context: Context = {
    scenario,
    send: (method, url, body, key) =>
      scenario.core.router.handle({
        method,
        url,
        headers: {
          authorization: `Bearer ${scenario.token}`,
          "idempotency-key": key ?? `conflict-driver-${++keys}`,
        },
        ...(body === undefined ? {} : { body }),
      }) as Promise<Answer>,
    recorded,
    fundedWallet: () =>
      (recorded("POST /v1/payment-authorizations").body as { wallet_id: string }).wallet_id,
  };
  const answers = new Map<string, Answer>();
  for (const driver of DRIVERS) {
    answers.set(driver.label, await driver.run(context));
  }
  return { answers, scenario };
}

describe("the documented conflict surface", () => {
  it("declares a driver for exactly the operations that document 409", () => {
    const documented = loadContract()
      .operations.filter((operation) => operation.responses.has("409"))
      .map((operation) => `${operation.method.toUpperCase()} ${operation.path}`)
      .sort();
    const driven = DRIVERS.map((driver) => driver.label).sort();
    expect(driven).toEqual(documented);
    expect(new Set(driven).size, "one driver per operation").toBe(driven.length);
  });

  it("answers 409 at every documented conflict, with the refusal it declares", async () => {
    const { answers } = await driveAll();
    const seen = [...answers].map(([label, answer]) => {
      const body = answer.body as { code?: string; message?: string };
      return `${label} -> ${answer.status} ${body.code ?? ""} ${body.message ?? ""}`;
    });
    const expected = DRIVERS.map(
      (driver) => `${driver.label} -> 409 conflict ${driver.message}`,
    );
    expect(seen).toEqual(expected);
  }, 120_000);

  it("declares which mechanism reaches each conflict, and the census is exact", () => {
    const byMechanism = new Map<Mechanism, string[]>();
    for (const driver of DRIVERS) {
      byMechanism.set(driver.mechanism, [...(byMechanism.get(driver.mechanism) ?? []), driver.label]);
    }
    // Four keyed creates have no domain conflict of their own: countries and
    // cities upsert on their natural key by a recorded decision, and an
    // organization — opened by an operator or by its own administrator
    // (XR-8.9) — has no uniqueness rule at all. Their documented `409` is the
    // platform's refusal of a key reused with a different request. If a domain
    // conflict is ever added to one of them, this list shrinks and the driver
    // above it has to say what the new rule is.
    expect(byMechanism.get("key_reuse")?.sort()).toEqual([
      "POST /v1/geography/cities",
      "POST /v1/geography/countries",
      "POST /v1/me/organizations",
      "POST /v1/organizations",
    ]);
    expect(byMechanism.get("domain")?.length).toBe(DRIVERS.length - 4);
  });

  it("keeps the clock-moving driver last, since it expires every session", () => {
    const moving = DRIVERS.filter((driver) => driver.advancesClock === true);
    expect(moving).toHaveLength(1);
    expect(DRIVERS[DRIVERS.length - 1]!.label).toBe(moving[0]!.label);
  });

  it("documents 409 wherever reusing a key with a different request produces it", async () => {
    const contract = loadContract();
    const documents409 = new Set(
      contract.operations
        .filter((operation) => operation.responses.has("409"))
        .map((operation) => `${operation.method.toUpperCase()} ${operation.path}`),
    );
    const scenario = await runScenario();
    const produced: string[] = [];
    for (const [label, answer] of scenario.answers) {
      const key = answer.request.headers["idempotency-key"];
      if (answer.request.method === "GET" || key === undefined) continue;
      // A body the route cannot have seen under this key. It has to stay *valid*:
      // adding an unknown field answers `400 invalid_request` on every write in
      // the surface, which would make this probe report that no route can
      // produce the key-reuse refusal — the same shape of false negative that
      // this cycle's first measurement fell into.
      const changed = changeOneField(answer.request.body);
      if (changed === undefined) continue;
      const again = (await scenario.core.router.handle({
        method: answer.request.method,
        url: answer.request.url,
        headers: { ...answer.request.headers, authorization: `Bearer ${scenario.token}` },
        body: changed,
      })) as Answer;
      if (again.status === 409) produced.push(label);
    }
    expect(produced.filter((label) => !documents409.has(label))).toEqual([]);
    // Exactly the five keyed creates whose recorded body has a field this rule
    // can change into something still valid. `POST /v1/subscriptions` is keyed
    // too, and its documented `409` is driven by the domain driver above; every
    // field of its body is an identifier, so changing one answers `400` rather
    // than reaching the key at all.
    expect(produced.sort()).toEqual([
      "POST /v1/geography/cities",
      "POST /v1/geography/countries",
      "POST /v1/geography/service-areas",
      "POST /v1/me/organizations",
      "POST /v1/organizations",
    ]);
  }, 120_000);

  it("answers every conflict with the same shape: conflict, not retryable, correlated", async () => {
    const { answers } = await driveAll();
    for (const [label, answer] of answers) {
      const body = answer.body as {
        code?: string;
        retryable?: boolean;
        correlation_id?: string;
        details?: unknown;
      };
      expect(body.code, label).toBe("conflict");
      expect(body.retryable, label).toBe(false);
      expect(typeof body.correlation_id, label).toBe("string");
      expect(body.details, label).toBeDefined();
    }
  }, 120_000);
});
