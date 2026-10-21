/**
 * XR-8.9 (CORE part): any person opens an organization of their own.
 *
 * The ecosystem roadmap (D-XR-10) lets anybody become a store owner, a partner
 * or a driver from the same account. In CORE terms, opening a store is opening
 * an organization and administering it. Until this cycle only an operator could
 * do that (`POST /v1/organizations`, `platform.operate` since B-46), and a
 * person had no way to become `org_admin` of anything without one.
 *
 * Handing `org_admin` to anybody was not safe before B-46 and B-47: measured on
 * `fc4cb81` an `org_admin` of one tenant could subscribe a URL to every tenant's
 * events, and measured on `942fbad` an `org_admin` of A who was a plain member
 * of B could grant `org_admin` in B. Both are closed, and this file re-checks the
 * second against an organization opened here, since that is exactly the route
 * that would make it exploitable at scale.
 *
 * What is asserted:
 *  - a person with no membership at all opens one: `201`, and is its
 *    `org_admin` on their very next request, without a new session;
 *  - both audit rows (organization, membership) name the person;
 *  - they administer their own organization and nothing else;
 *  - a service credential is refused `403`;
 *  - the self-service limit (three administered organizations) refuses the
 *    fourth with `403` and `details.limit`, and an operator still can;
 *  - an identical retry replays and opens nothing; the same key with another
 *    body is `409`;
 *  - the organization and its administrator commit together or not at all.
 *
 * Not asserted, and recorded as such: the limit is read from the caller's
 * memberships at authentication, so two concurrent requests from one person at
 * two administered organizations can both pass it. It is a guard against a
 * loop, not an invariant; making it one needs a lock on the principal.
 *
 * Memory backend; runs in both CI jobs.
 */
import { describe, expect, it } from "vitest";
import { createCoreApp, type CoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { provisionServiceCredential } from "../src/platform/bootstrap/credential.js";
import { SELF_SERVICE_ORGANIZATION_LIMIT } from "../src/modules/identity-access/service.js";

const CORR = "self-service-org";
const START = new Date("2026-06-01T00:00:00.000Z");

interface Answer {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

async function call(
  core: CoreApp,
  token: string,
  method: "GET" | "POST",
  url: string,
  body?: Record<string, unknown>,
  key: string = crypto.randomUUID(),
): Promise<Answer> {
  const response = await core.router.handle({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, ...(method === "POST" ? { "idempotency-key": key } : {}) },
    ...(body === undefined ? {} : { body }),
  });
  return {
    status: response.status,
    body: response.body as Record<string, unknown>,
    headers: (response.headers ?? {}) as Record<string, string>,
  };
}

let counter = 0;
async function newcomer(core: CoreApp): Promise<{ token: string; principalId: string }> {
  counter += 1;
  const registered = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: `self-service-${counter}-${Math.random().toString(36).slice(2)}`,
    correlation_id: CORR,
  });
  const session = await core.identity.issueSession({
    principal_id: registered.principal.principal_id,
    channel_type: "web",
    correlation_id: CORR,
  });
  return { token: session.token, principalId: registered.principal.principal_id };
}

async function world() {
  const clock = new FixedClock(START);
  const core = createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit: false });
  const root = await core.organization.create({ name: "Root", country_code: "SA", correlation_id: CORR });
  const other = await core.organization.create({ name: "Someone else's", country_code: "SA", correlation_id: CORR });
  const operator = await newcomer(core);
  await core.identity.grantMembership({
    principal_id: operator.principalId,
    organization_id: root.organization_id,
    roles: ["platform_admin"],
    correlation_id: CORR,
  });
  return { core, rootId: root.organization_id, otherId: other.organization_id, operator: operator.token };
}

const open = (core: CoreApp, token: string, name = "My Store", key?: string) =>
  call(core, token, "POST", "/v1/me/organizations", { name, country_code: "SA" }, key);

describe("XR-8.9: a person opens an organization of their own", () => {
  it("opens it, and the person is its org_admin on the next request", async () => {
    const { core } = await world();
    const person = await newcomer(core);

    const before = await call(core, person.token, "GET", "/v1/sessions/current");
    expect(before.status).toBe(200);
    expect(before.body.memberships).toEqual([]);

    const opened = await open(core, person.token);
    expect(opened.status).toBe(201);
    expect(opened.body.name).toBe("My Store");
    expect(opened.body.status).toBe("active");
    const organizationId = opened.body.organization_id as string;

    const after = await call(core, person.token, "GET", "/v1/sessions/current");
    expect(after.body.memberships).toEqual([{ organization_id: organizationId, roles: ["org_admin"] }]);
    expect(after.body.roles).toEqual(["org_admin"]);
  });

  it("names the person in both audit rows", async () => {
    const { core } = await world();
    const person = await newcomer(core);
    const opened = await open(core, person.token);
    const organizationId = opened.body.organization_id as string;

    const created = await core.audit.forEntity("organization", organizationId);
    expect(created.map((e) => [e.action, e.actor_type, e.actor_id])).toEqual([
      ["organization.created", "principal", person.principalId],
    ]);
    const grants = (await core.audit.entries()).filter(
      (e) =>
        e.action === "membership.granted" &&
        (e.metadata as Record<string, unknown>)["organization_id"] === organizationId,
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]!.actor_type).toBe("principal");
    expect(grants[0]!.actor_id).toBe(person.principalId);
    expect((grants[0]!.metadata as Record<string, unknown>)["self_service"]).toBe(true);
  });

  it("administers its own organization and no other", async () => {
    const { core, otherId } = await world();
    const owner = await newcomer(core);
    const opened = await open(core, owner.token);
    const mine = opened.body.organization_id as string;
    const hire = await newcomer(core);

    // Own organization: read it, and hire somebody into it.
    expect((await call(core, owner.token, "GET", `/v1/organizations/${mine}`)).status).toBe(200);
    const hired = await call(core, owner.token, "POST", "/v1/memberships", {
      principal_id: hire.principalId,
      organization_id: mine,
      roles: ["org_member"],
    });
    expect(hired.status).toBe(201);

    // Somebody else's: neither read nor grant.
    expect((await call(core, owner.token, "GET", `/v1/organizations/${otherId}`)).status).toBe(403);
    const intruding = await call(core, owner.token, "POST", "/v1/memberships", {
      principal_id: owner.principalId,
      organization_id: otherId,
      roles: ["org_admin"],
    });
    expect(intruding.status).toBe(403);

    // And nothing platform-wide: org_admin no longer reaches it (B-46).
    expect(
      (await call(core, owner.token, "POST", "/v1/organizations", { name: "Shadow", country_code: "SA" })).status,
    ).toBe(403);
    expect((await call(core, owner.token, "GET", "/v1/event-subscriptions")).status).toBe(403);
  });

  it("does not let a member of a self-opened organization escalate into another (B-47 re-checked)", async () => {
    const { core, otherId } = await world();
    const owner = await newcomer(core);
    const mine = (await open(core, owner.token)).body.organization_id as string;
    // The owner is also a plain member of another organization...
    await core.identity.grantMembership({
      principal_id: owner.principalId,
      organization_id: otherId,
      roles: ["org_member"],
      correlation_id: CORR,
    });
    const third = await newcomer(core);
    // ...and still may grant only where they administer.
    const there = await call(core, owner.token, "POST", "/v1/memberships", {
      principal_id: third.principalId,
      organization_id: otherId,
      roles: ["org_admin"],
    });
    expect(there.status).toBe(403);
    const here = await call(core, owner.token, "POST", "/v1/memberships", {
      principal_id: third.principalId,
      organization_id: mine,
      roles: ["org_member"],
    });
    expect(here.status).toBe(201);
  });

  it("refuses a service credential", async () => {
    const { core, rootId } = await world();
    const provisioned = await provisionServiceCredential(core, {
      service_name: "channel-adapter",
      organization_id: rootId,
      roles: ["service"],
      issues_for_channels: [],
      correlation_id: CORR,
    });
    const refused = await open(core, provisioned.access_token);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("forbidden");
    expect(refused.body.message).toBe("a service credential does not open organizations of its own");
  });

  it(`stops at ${SELF_SERVICE_ORGANIZATION_LIMIT} administered organizations, and an operator still can`, async () => {
    const { core, operator } = await world();
    const person = await newcomer(core);
    for (let i = 0; i < SELF_SERVICE_ORGANIZATION_LIMIT; i += 1) {
      expect((await open(core, person.token, `Store ${i}`)).status).toBe(201);
    }
    const refused = await open(core, person.token, "One too many");
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe(
      "this person already administers as many organizations as self-service allows",
    );
    expect(refused.body.details).toEqual({ limit: SELF_SERVICE_ORGANIZATION_LIMIT });
    expect(refused.body.retryable).toBe(false);

    const memberships = (await call(core, person.token, "GET", "/v1/sessions/current")).body.memberships as unknown[];
    expect(memberships).toHaveLength(SELF_SERVICE_ORGANIZATION_LIMIT);

    // The operator path is unaffected.
    expect(
      (await call(core, operator, "POST", "/v1/organizations", { name: "Operator-made", country_code: "SA" })).status,
    ).toBe(201);
  });

  it("counts administered organizations only: memberships as a member do not use the limit up", async () => {
    const { core, otherId, rootId } = await world();
    const person = await newcomer(core);
    for (const organization_id of [otherId, rootId]) {
      await core.identity.grantMembership({
        principal_id: person.principalId,
        organization_id,
        roles: ["org_member"],
        correlation_id: CORR,
      });
    }
    for (let i = 0; i < SELF_SERVICE_ORGANIZATION_LIMIT; i += 1) {
      expect((await open(core, person.token, `Store ${i}`)).status).toBe(201);
    }
  });

  it("replays an identical retry and opens nothing; another body under the same key is 409", async () => {
    const { core } = await world();
    const person = await newcomer(core);
    const key = crypto.randomUUID();
    const first = await open(core, person.token, "Retried Store", key);
    const again = await open(core, person.token, "Retried Store", key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body.organization_id).toBe(first.body.organization_id);
    expect(again.headers["idempotent-replay"]).toBe("true");

    const memberships = (await call(core, person.token, "GET", "/v1/sessions/current")).body.memberships as unknown[];
    expect(memberships).toHaveLength(1);

    const reused = await open(core, person.token, "A different store", key);
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe("conflict");
  });

  it("validates the body before opening anything", async () => {
    const { core } = await world();
    const person = await newcomer(core);
    const bad = await call(core, person.token, "POST", "/v1/me/organizations", { name: "x", country_code: "sa" });
    expect(bad.status).toBe(400);
    const blank = await call(core, person.token, "POST", "/v1/me/organizations", { name: "  ", country_code: "SA" });
    expect(blank.status).toBe(400);
    const memberships = (await call(core, person.token, "GET", "/v1/sessions/current")).body.memberships as unknown[];
    expect(memberships).toEqual([]);
  });

  it("refuses an anonymous caller", async () => {
    const { core } = await world();
    const response = await core.router.handle({
      method: "POST",
      url: "/v1/me/organizations",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: { name: "Nobody's", country_code: "SA" },
    });
    expect(response.status).toBe(401);
  });

  it("commits the organization and its administrator together or not at all", async () => {
    const { core } = await world();
    const person = await newcomer(core);
    const entriesBefore = (await core.audit.entries()).length;
    let staged: string | undefined;
    await expect(
      core.organization.openOwn(
        { name: "Doomed", country_code: "SA", correlation_id: CORR, owner_principal_id: person.principalId },
        async (_uow, organization) => {
          staged = organization.organization_id;
          throw new Error("the owner's membership could not be staged");
        },
      ),
    ).rejects.toThrow("the owner's membership could not be staged");
    expect(staged).toBeDefined();
    await expect(core.organization.require(staged!)).rejects.toMatchObject({ status: 404 });
    expect((await core.audit.entries()).length).toBe(entriesBefore);
  });
});
