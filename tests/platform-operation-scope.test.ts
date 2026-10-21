/**
 * B-46: the routes that act on the whole platform are the operator's, not a
 * tenant administrator's.
 *
 * Measured on `main` at `fc4cb81`, before the change. Fourteen routes were
 * guarded by `organization.write` or `organization.read` **without an
 * organization**, and `authorize` checks an unscoped permission by presence
 * alone. `org_admin` holds both and `org_member` holds the read, and both are
 * roles granted *inside one tenant*. So an `org_admin` of tenant A could, and
 * this file's first run measured each as a 2xx:
 *
 *  - register an event subscription that delivers **every** tenant's events of a
 *    type to a URL of its choosing, and list every subscriber and endpoint;
 *  - read the undelivered-delivery queue across the platform;
 *  - register a notification recipient for tenant B, and list B's recipients;
 *  - overwrite a country's name and currency, and add regions, cities and
 *    service areas the whole platform resolves against;
 *  - create new tenants, of which nobody is a member;
 *
 * and an `org_member` of A could list every tenant's notifications — subjects,
 * bodies and recipient addresses. The comments on those routes said
 * "operator-only"; the permission they named did not mean that.
 *
 * Also measured: `GET /v1/subscriptions/:id` checked `subscription.read`
 * unscoped, so an `org_admin` or `support_agent` of A read B's subscription.
 *
 * The fix is one new permission, `platform.operate`, held by `platform_admin`
 * only, and scoping the subscription read to its owner. Geography **reads** stay
 * open to any member: reference data every product resolves against.
 *
 * Memory backend; runs in both CI jobs.
 */
import { describe, expect, it } from "vitest";
import { createCoreApp, type CoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { ROLE_PERMISSIONS, type Role } from "../src/modules/identity-access/domain.js";

const CORR = "platform-scope";
const START = new Date("2026-06-01T00:00:00.000Z");

interface World {
  core: CoreApp;
  tenantA: string;
  tenantB: string;
  operator: string;
  tokens: Record<"adminA" | "memberA" | "supportA", string>;
  identityB: string;
}

let counter = 0;
async function personWith(
  core: CoreApp,
  organizationId: string,
  roles: Role[],
  channel: "web" | "email" = "web",
): Promise<{ token: string; identityId: string }> {
  counter += 1;
  const registered = await core.identity.registerIdentity({
    channel_type: channel,
    external_id: `platform-scope-${counter}-${Math.random().toString(36).slice(2)}`,
    correlation_id: CORR,
  });
  await core.identity.grantMembership({
    principal_id: registered.principal.principal_id,
    organization_id: organizationId,
    roles,
    correlation_id: CORR,
  });
  const session = await core.identity.issueSession({
    principal_id: registered.principal.principal_id,
    channel_type: channel,
    correlation_id: CORR,
  });
  return { token: session.token, identityId: registered.identity.identity_id };
}

async function world(): Promise<World> {
  const clock = new FixedClock(START);
  const core = createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit: false });
  const root = await core.organization.create({ name: "Root", country_code: "SA", correlation_id: CORR });
  const a = await core.organization.create({ name: "Tenant A", country_code: "SA", correlation_id: CORR });
  const b = await core.organization.create({ name: "Tenant B", country_code: "SA", correlation_id: CORR });
  const operator = await personWith(core, root.organization_id, ["platform_admin"]);
  const adminA = await personWith(core, a.organization_id, ["org_admin"]);
  const memberA = await personWith(core, a.organization_id, ["org_member"]);
  const supportA = await personWith(core, a.organization_id, ["support_agent"]);
  const personB = await personWith(core, b.organization_id, ["org_member"], "email");
  return {
    core,
    tenantA: a.organization_id,
    tenantB: b.organization_id,
    operator: operator.token,
    tokens: { adminA: adminA.token, memberA: memberA.token, supportA: supportA.token },
    identityB: personB.identityId,
  };
}

async function call(
  core: CoreApp,
  token: string,
  method: "GET" | "POST",
  url: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await core.router.handle({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, "idempotency-key": crypto.randomUUID() },
    ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, body: response.body as Record<string, unknown> };
}

/** Every platform-wide route, with a body that would succeed for the operator. */
function platformRoutes(w: World): Array<{ name: string; method: "GET" | "POST"; url: string; body?: Record<string, unknown> }> {
  return [
    {
      name: "register an event subscription",
      method: "POST",
      url: "/v1/event-subscriptions",
      body: {
        subscriber: "exfiltrator",
        event_type: "core.fulfillment.created",
        endpoint_url: "https://example.invalid/hook",
        signing_secret: "s".repeat(32),
      },
    },
    { name: "create a tenant", method: "POST", url: "/v1/organizations", body: { name: "Shadow", country_code: "SA" } },
    { name: "list event subscriptions", method: "GET", url: "/v1/event-subscriptions" },
    { name: "read undelivered deliveries", method: "GET", url: "/v1/event-deliveries/undelivered" },
    {
      name: "register a notification recipient for another tenant",
      method: "POST",
      url: "/v1/notification-recipients",
      body: {
        organization_id: w.tenantB,
        event_type: "core.fulfillment.created",
        identity_id: w.identityB,
        channel: "email",
        correlation_id: CORR,
      },
    },
    { name: "list another tenant's notification recipients", method: "GET", url: `/v1/notification-recipients?organization_id=${w.tenantB}` },
    { name: "list every tenant's notifications", method: "GET", url: "/v1/notifications" },
    {
      name: "overwrite a country",
      method: "POST",
      url: "/v1/geography/countries",
      body: { country_code: "SA", name: "Renamed", default_currency: "USD" },
    },
  ];
}

describe("B-46: platform-wide routes need platform.operate", () => {
  it("is held by platform_admin and by no other role", () => {
    const holders = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
      (ROLE_PERMISSIONS[role] as readonly string[]).includes("platform.operate"),
    );
    expect(holders).toEqual(["platform_admin"]);
  });

  it("refuses a tenant administrator every platform-wide route", async () => {
    const w = await world();
    for (const route of platformRoutes(w)) {
      const answer = await call(w.core, w.tokens.adminA, route.method, route.url, route.body);
      expect({ route: route.name, status: answer.status }).toEqual({ route: route.name, status: 403 });
      expect(answer.body["details"]).toMatchObject({ permission: "platform.operate" });
    }
  });

  it("refuses a tenant member the platform-wide notification list", async () => {
    const w = await world();
    const answer = await call(w.core, w.tokens.memberA, "GET", "/v1/notifications");
    expect(answer.status).toBe(403);
  });

  it("still serves the operator every one of them", async () => {
    const w = await world();
    for (const route of platformRoutes(w)) {
      const answer = await call(w.core, w.operator, route.method, route.url, route.body);
      expect({ route: route.name, ok: answer.status >= 200 && answer.status < 300 }).toEqual({
        route: route.name,
        ok: true,
      });
    }
  });

  it("leaves geography reads open to any member: reference data, not operation", async () => {
    const w = await world();
    const answer = await call(w.core, w.tokens.memberA, "GET", "/v1/geography/countries");
    expect(answer.status).toBe(200);
  });

  it("did not change the country a refused tenant administrator tried to overwrite", async () => {
    const w = await world();
    await call(w.core, w.operator, "POST", "/v1/geography/countries", {
      country_code: "SA",
      name: "Saudi Arabia",
      default_currency: "SAR",
    });
    await call(w.core, w.tokens.adminA, "POST", "/v1/geography/countries", {
      country_code: "SA",
      name: "Renamed",
      default_currency: "USD",
    });
    const countries = await call(w.core, w.tokens.memberA, "GET", "/v1/geography/countries");
    expect(JSON.stringify(countries.body)).toContain("Saudi Arabia");
    expect(JSON.stringify(countries.body)).not.toContain("Renamed");
  });
});

describe("B-46: a subscription is read by its owner", () => {
  async function subscribedTenant(w: World, organizationId: string): Promise<string> {
    const { wallet } = await w.core.money.createWallet({
      owner_type: "organization",
      owner_id: organizationId,
      currency: "SAR",
      correlation_id: CORR,
    });
    await w.core.money.credit({
      wallet_id: wallet.wallet_id,
      amount_minor: 10_000,
      business_reference: `top-up:${crypto.randomUUID()}`,
      correlation_id: CORR,
    });
    const draft = await w.core.billing.createPlan({
      code: `plan-${crypto.randomUUID().slice(0, 8)}`,
      name: "Growth",
      currency: "SAR",
      amount_minor: 5_000,
      billing_interval: "month",
      grants: [{ feature_key: "shipments.monthly", limit_value: 3 }],
      correlation_id: CORR,
    });
    const plan = await w.core.billing.activatePlan({ plan_id: draft.plan.plan_id, correlation_id: CORR });
    const result = await w.core.billing.subscribe({
      owner_type: "organization",
      owner_id: organizationId,
      plan_id: plan.plan_id,
      wallet_id: wallet.wallet_id,
      correlation_id: CORR,
    });
    return result.subscription.subscription_id;
  }

  it("refuses another tenant's administrator and support agent, and serves its own and the operator", async () => {
    const w = await world();
    const ofB = await subscribedTenant(w, w.tenantB);
    const ofA = await subscribedTenant(w, w.tenantA);
    for (const token of [w.tokens.adminA, w.tokens.supportA]) {
      expect((await call(w.core, token, "GET", `/v1/subscriptions/${ofB}`)).status).toBe(403);
      expect((await call(w.core, token, "GET", `/v1/subscriptions/${ofA}`)).status).toBe(200);
    }
    expect((await call(w.core, w.operator, "GET", `/v1/subscriptions/${ofB}`)).status).toBe(200);
  });
});


describe("B-47: a permission granted in one organization is not honoured in another", () => {
  async function dual(w: World): Promise<{ token: string; principalId: string }> {
    const registered = await w.core.identity.registerIdentity({
      channel_type: "web",
      external_id: `dual-${crypto.randomUUID()}`,
      correlation_id: CORR,
    });
    const principalId = registered.principal.principal_id;
    await w.core.identity.grantMembership({
      principal_id: principalId,
      organization_id: w.tenantA,
      roles: ["org_admin"],
      correlation_id: CORR,
    });
    await w.core.identity.grantMembership({
      principal_id: principalId,
      organization_id: w.tenantB,
      roles: ["org_member"],
      correlation_id: CORR,
    });
    const session = await w.core.identity.issueSession({
      principal_id: principalId,
      channel_type: "web",
      correlation_id: CORR,
    });
    return { token: session.token, principalId };
  }

  async function stranger(w: World): Promise<string> {
    const registered = await w.core.identity.registerIdentity({
      channel_type: "web",
      external_id: `stranger-${crypto.randomUUID()}`,
      correlation_id: CORR,
    });
    return registered.principal.principal_id;
  }

  it("refuses an org_admin of A, who is only a member of B, granting a role in B", async () => {
    const w = await world();
    const actor = await dual(w);
    const target = await stranger(w);
    const refused = await call(w.core, actor.token, "POST", "/v1/memberships", {
      principal_id: target,
      organization_id: w.tenantB,
      roles: ["org_admin"],
    });
    expect(refused.status).toBe(403);
    expect(refused.body["message"]).toBe("missing permission in this organization");
    expect(refused.body["details"]).toMatchObject({ permission: "organization.write", organization_id: w.tenantB });
  });

  it("still lets the same principal administer A, and read B as the member it is", async () => {
    const w = await world();
    const actor = await dual(w);
    const target = await stranger(w);
    const granted = await call(w.core, actor.token, "POST", "/v1/memberships", {
      principal_id: target,
      organization_id: w.tenantA,
      roles: ["org_member"],
    });
    expect(granted.status).toBe(201);
    const readB = await call(w.core, actor.token, "GET", `/v1/organizations/${w.tenantB}`);
    expect(readB.status).toBe(200);
  });

  it("publishes each membership with its own roles on the current session", async () => {
    const w = await world();
    const actor = await dual(w);
    const current = await call(w.core, actor.token, "GET", "/v1/sessions/current");
    expect(current.status).toBe(200);
    const memberships = current.body["memberships"] as Array<{ organization_id: string; roles: string[] }>;
    expect(memberships.find((m) => m.organization_id === w.tenantA)?.roles).toEqual(["org_admin"]);
    expect(memberships.find((m) => m.organization_id === w.tenantB)?.roles).toEqual(["org_member"]);
  });

  it("leaves platform_admin acting in every organization", async () => {
    const w = await world();
    const target = await stranger(w);
    const granted = await call(w.core, w.operator, "POST", "/v1/memberships", {
      principal_id: target,
      organization_id: w.tenantB,
      roles: ["org_member"],
    });
    expect(granted.status).toBe(201);
  });
});
