/**
 * A session is issued only by a caller entitled to issue one, and ended only by
 * a caller entitled to end it — milestone 31, closing B-39 and B-40 and a third
 * defect the measurement found on the same route.
 *
 * What was measured on `main` at `b63585d`, before any edit, against the real
 * router, with a victim tenant whose administrator holds `platform_admin` (14
 * permissions) and a live session:
 *
 *  - `POST /v1/sessions` with **no credential** and the administrator's
 *    `principal_id` → **201** with a working `access_token`; that token read
 *    `GET /v1/sessions/current` as `platform_admin` with 14 permissions. A
 *    principal id is not a secret — it is returned by that same route, by every
 *    membership answer and by audit reads — so anybody who had seen one could
 *    become it. **B-39.**
 *  - The same call with an **outsider's own valid token** (a principal with a
 *    session and no membership anywhere) → **201** for the administrator's
 *    principal. Holding a credential was neither required nor helpful.
 *  - `POST /v1/sessions/revoke` with **no credential** and the administrator's
 *    `session_id` → **204**, and the administrator's next request → `401 session
 *    expired or revoked`. Anybody who had seen a session id could end anybody's
 *    session. **B-40.**
 *  - The same route with a **well-formed `session_id` that does not exist** →
 *    **204 and then the process terminated** with an unhandled rejection
 *    (`session not found`), because the handler called `identity.revokeSession`
 *    **without `await`**: the rejection escaped the router's error handling
 *    entirely, so the caller was told a revocation succeeded that never
 *    happened, and an unauthenticated request was a remote kill. Not previously
 *    recorded anywhere.
 *  - Contract: `POST /v1/sessions` documented `201`, `404`, `429`;
 *    `POST /v1/sessions/revoke` documented `204`, `429`. Neither documented
 *    `401` or `403` — consistent with neither refusing anyone. `/v1/sessions`
 *    also carried `security: []`, while `/v1/sessions/revoke` did **not**: the
 *    contract already said revocation needed a credential and the router did not
 *    require one. The contract was right and the code was wrong.
 *
 * What changed. `session.issue` is a permission, held by `platform_admin` and by
 * `service` — a channel adapter authenticates a person the way its own channel
 * already does, then asks CORE for a session on their behalf — and by nothing
 * else. It is deliberately not implied by `identity.write`: editing an
 * identity's name and being able to become it are different powers. Both session
 * routes declare `AUTHENTICATED`. Revocation allows the caller's own session with
 * no permission at all, and anyone else's only with `identity.write`, checked
 * **before** the "does this session exist" refusal so an unprivileged caller
 * cannot tell a real session id from an invented one — the existence oracle
 * milestone 30 removed from the fulfillment reads must not reappear here as the
 * price of closing B-40. The revocation is awaited.
 *
 * The first credential of an environment cannot come from a route that requires
 * one, so it comes from `npm run bootstrap:credential`
 * (`src/platform/bootstrap/`), which needs `DATABASE_URL`. That is the security
 * argument: anybody who can run it can already read every row and write every
 * table, while the route it replaces needed only the ability to send a request.
 *
 * What this file does not claim: that `session.issue` is *scoped*. That was
 * **B-42**, recorded here while it was open; it is closed now, and its gate is
 * `tests/session-issuance-scope.test.ts`: a service issues only on the channels
 * it was provisioned for, only for a person verified on that channel, never for
 * a principal that could issue itself, and the audit row names the issuer.
 *
 * No database: memory backend, so this gate runs in both CI jobs.
 */
import { describe, expect, it } from "vitest";
import { createCoreApp, type CoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { ROLE_PERMISSIONS, type Role } from "../src/modules/identity-access/domain.js";
import { provisionServiceCredential } from "../src/platform/bootstrap/credential.js";
import { CliUsageError, main as bootstrapMain, parseArgs } from "../src/platform/bootstrap/cli.js";
import { loadContract } from "./support/openapi.js";
import { readCode } from "./support/source.js";

const CORR = "session-entitlement";
const START = new Date("2026-06-01T00:00:00.000Z");
/** Well formed, and belonging to nothing. */
const ABSENT_SESSION_ID = "3f1b2c44-0000-4000-8000-000000000000";

interface Fixture {
  core: CoreApp;
  organizationId: string;
  /** `platform_admin` of the organization: holds `session.issue` and `identity.write`. */
  adminToken: string;
  adminPrincipalId: string;
}

async function fixture(): Promise<Fixture> {
  const clock = new FixedClock(START);
  const core = createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit: false });
  const organization = await core.organization.create({
    name: "Entitlement Org",
    country_code: "SA",
    correlation_id: CORR,
  });
  const admin = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: "entitlement-admin",
    correlation_id: CORR,
  });
  await core.identity.grantMembership({
    principal_id: admin.principal.principal_id,
    organization_id: organization.organization_id,
    roles: ["platform_admin"],
    correlation_id: CORR,
  });
  const session = await core.identity.issueSession({
    principal_id: admin.principal.principal_id,
    channel_type: "web",
    correlation_id: CORR,
  });
  return {
    core,
    organizationId: organization.organization_id,
    adminToken: session.token,
    adminPrincipalId: admin.principal.principal_id,
  };
}

/**
 * A principal with a real session and the roles asked for, or none.
 *
 * Minted in process rather than over `POST /v1/sessions`, because that route is
 * the subject of this file: obtaining the fixtures through the surface under test
 * would mean a change that broke it could not be measured.
 */
async function principalWith(
  fix: Fixture,
  reference: string,
  roles: readonly Role[] = [],
): Promise<{ principalId: string; token: string }> {
  const registered = await fix.core.identity.registerIdentity({
    channel_type: "phone",
    external_id: reference,
    correlation_id: CORR,
  });
  if (roles.length > 0) {
    await fix.core.identity.grantMembership({
      principal_id: registered.principal.principal_id,
      organization_id: fix.organizationId,
      roles: [...roles],
      correlation_id: CORR,
    });
  }
  const session = await fix.core.identity.issueSession({
    principal_id: registered.principal.principal_id,
    channel_type: "phone",
    correlation_id: CORR,
  });
  return { principalId: registered.principal.principal_id, token: session.token };
}

function auth(token?: string): Record<string, string> {
  return token === undefined ? {} : { authorization: `Bearer ${token}` };
}

async function issue(
  core: CoreApp,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await core.router.handle({
    method: "POST",
    url: "/v1/sessions",
    headers: auth(token),
    ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, body: response.body };
}

async function revoke(
  core: CoreApp,
  sessionId: string,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await core.router.handle({
    method: "POST",
    url: "/v1/sessions/revoke",
    headers: auth(token),
    body: { session_id: sessionId },
  });
  return { status: response.status, body: response.body };
}

async function whoAmI(core: CoreApp, token: string): Promise<{ status: number; body: unknown }> {
  const response = await core.router.handle({
    method: "GET",
    url: "/v1/sessions/current",
    headers: auth(token),
  });
  return { status: response.status, body: response.body };
}

describe("issuing a session is a permission, not a public route", () => {
  it("refuses an anonymous caller, and mints nothing", async () => {
    const fix = await fixture();
    const refused = await issue(fix.core, {
      principal_id: fix.adminPrincipalId,
      channel_type: "phone",
    });
    expect(refused.status).toBe(401);
    expect((refused.body as { code: string }).code).toBe("unauthenticated");
    expect(refused.body).not.toHaveProperty("access_token");
    // The administrator's own credential is untouched: nothing was issued, and
    // nothing was invalidated either.
    expect((await whoAmI(fix.core, fix.adminToken)).status).toBe(200);
  });

  it("refuses a caller holding nothing", async () => {
    const fix = await fixture();
    const nobody = await principalWith(fix, "+966500000101");
    const refused = await issue(
      fix.core,
      { principal_id: fix.adminPrincipalId, channel_type: "phone" },
      nobody.token,
    );
    expect(refused.status).toBe(403);
    expect((refused.body as { code: string }).code).toBe("forbidden");
    expect(refused.body).not.toHaveProperty("access_token");
  });

  /**
   * The case that makes the permission's *identity* measurable rather than only
   * its presence. An `org_admin` holds `organization.write`, `identity.read`,
   * `fulfillment.request` and three more, and a route guarded by any of those
   * would pass every other case in this file. It must not be able to issue a
   * session for the tenant's administrator, so `session.issue` cannot be
   * satisfied by "some administrative permission".
   */
  it("refuses an org_admin of the very organization", async () => {
    const fix = await fixture();
    const orgAdmin = await principalWith(fix, "+966500000102", ["org_admin"]);
    // Premise: this credential really is privileged, so the refusal below is
    // about `session.issue` and not about holding nothing.
    const reading = await fix.core.router.handle({
      method: "GET",
      url: `/v1/organizations/${fix.organizationId}`,
      headers: auth(orgAdmin.token),
    });
    expect(reading.status).toBe(200);
    const refused = await issue(
      fix.core,
      { principal_id: fix.adminPrincipalId, channel_type: "phone" },
      orgAdmin.token,
    );
    expect(refused.status).toBe(403);
  });

  it("lets a service credential issue for the people its channel speaks for", async () => {
    const fix = await fixture();
    // Since B-42 a service issues only on the channels it was provisioned for,
    // and only for a person verified there: `principalWith` registers on phone.
    const adapter = await provisionServiceCredential(fix.core, {
      service_name: "phone-adapter",
      organization_id: fix.organizationId,
      roles: ["service"],
      issues_for_channels: ["phone"],
      correlation_id: CORR,
    });
    const person = await principalWith(fix, "+966500000104");
    const issued = await issue(
      fix.core,
      { principal_id: person.principalId, channel_type: "phone" },
      adapter.access_token,
    );
    expect(issued.status).toBe(201);
    const token = (issued.body as { access_token: string }).access_token;
    const current = await whoAmI(fix.core, token);
    // The session belongs to the person, not to the adapter that asked for it.
    expect((current.body as { principal_id: string }).principal_id).toBe(person.principalId);
    expect((current.body as { roles: string[] }).roles).toEqual([]);
  });

  it("does not upgrade the principal it issues for", async () => {
    const fix = await fixture();
    const person = await principalWith(fix, "+966500000105");
    const issued = await issue(
      fix.core,
      { principal_id: person.principalId, channel_type: "phone" },
      fix.adminToken,
    );
    expect(issued.status).toBe(201);
    const current = await whoAmI(
      fix.core,
      (issued.body as { access_token: string }).access_token,
    );
    expect((current.body as { principal_id: string }).principal_id).toBe(person.principalId);
    expect((current.body as { permissions: string[] }).permissions).toEqual([]);
    expect((current.body as { organization_ids: string[] }).organization_ids).toEqual([]);
  });

  it("refuses the anonymous caller before it reads the body at all", async () => {
    const fix = await fixture();
    // No body, which this route requires. `401` and not `400`: the ordering
    // milestone 30 established, still holding on a route that changed hands.
    const refused = await issue(fix.core, undefined);
    expect(refused.status).toBe(401);
  });

  it("answers 404 for an absent principal only to a caller entitled to issue", async () => {
    const fix = await fixture();
    const absent = "3f1b2c44-0000-4000-8000-0000000000aa";
    const entitled = await issue(
      fix.core,
      { principal_id: absent, channel_type: "phone" },
      fix.adminToken,
    );
    expect(entitled.status).toBe(404);
    // The same request from a caller that may not issue learns nothing about
    // whether that principal exists.
    const nobody = await principalWith(fix, "+966500000106");
    const unentitled = await issue(
      fix.core,
      { principal_id: absent, channel_type: "phone" },
      nobody.token,
    );
    expect(unentitled.status).toBe(403);
  });

  it("grants session.issue to exactly platform_admin and service", () => {
    const holders = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
      ROLE_PERMISSIONS[role].includes("session.issue"),
    );
    expect(holders.sort()).toEqual(["platform_admin", "service"]);
    // Not implied by `identity.write`, which is the permission a reviewer would
    // most plausibly reuse: `platform_admin` holds both, and nothing else holds
    // either, so the two are only distinguishable as data.
    const writers = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
      ROLE_PERMISSIONS[role].includes("identity.write"),
    );
    expect(writers).toEqual(["platform_admin"]);
  });
});

describe("ending a session is entitled too", () => {
  it("refuses an anonymous caller, and the session survives", async () => {
    const fix = await fixture();
    const victim = await principalWith(fix, "+966500000201");
    const victimSessionId = (await whoAmI(fix.core, victim.token)).body as {
      session_id: string;
    };
    const refused = await revoke(fix.core, victimSessionId.session_id);
    expect(refused.status).toBe(401);
    // The measurement this replaces: before milestone 31 this answered 204 and
    // the victim's next request answered 401.
    expect((await whoAmI(fix.core, victim.token)).status).toBe(200);
  });

  it("lets a principal end its own session", async () => {
    const fix = await fixture();
    const person = await principalWith(fix, "+966500000202");
    const own = (await whoAmI(fix.core, person.token)).body as { session_id: string };
    const ended = await revoke(fix.core, own.session_id, person.token);
    expect(ended.status).toBe(204);
    // No permission was needed, and the token is now dead.
    const after = await whoAmI(fix.core, person.token);
    expect(after.status).toBe(401);
    expect((after.body as { message: string }).message).toMatch(/expired or revoked/);
  });

  it("refuses another principal's session without identity.write, and it survives", async () => {
    const fix = await fixture();
    const victim = await principalWith(fix, "+966500000203");
    const attacker = await principalWith(fix, "+966500000204", ["org_admin"]);
    const victimSession = (await whoAmI(fix.core, victim.token)).body as { session_id: string };
    const refused = await revoke(fix.core, victimSession.session_id, attacker.token);
    expect(refused.status).toBe(403);
    expect((await whoAmI(fix.core, victim.token)).status).toBe(200);
  });

  /**
   * The oracle case. Requiring a credential without this ordering would have
   * closed B-40 by replacing an open door with a way to enumerate session ids:
   * `403` for a session that exists and `404` for one that does not is a reader
   * for anybody with any credential at all.
   */
  it("answers a real and an invented session id identically to an unprivileged caller", async () => {
    const fix = await fixture();
    const victim = await principalWith(fix, "+966500000205");
    const attacker = await principalWith(fix, "+966500000206", ["org_member"]);
    const victimSession = (await whoAmI(fix.core, victim.token)).body as { session_id: string };
    const real = await revoke(fix.core, victimSession.session_id, attacker.token);
    const invented = await revoke(fix.core, ABSENT_SESSION_ID, attacker.token);
    expect(real.status).toBe(invented.status);
    expect((real.body as { code: string }).code).toBe((invented.body as { code: string }).code);
    expect(real.status).toBe(403);
  });

  it("answers 404 for an absent session only to a caller holding identity.write", async () => {
    const fix = await fixture();
    const absent = await revoke(fix.core, ABSENT_SESSION_ID, fix.adminToken);
    expect(absent.status).toBe(404);
    expect((absent.body as { code: string }).code).toBe("not_found");
  });

  it("lets identity.write end somebody else's session, twice", async () => {
    const fix = await fixture();
    const person = await principalWith(fix, "+966500000207");
    const session = (await whoAmI(fix.core, person.token)).body as { session_id: string };
    const first = await revoke(fix.core, session.session_id, fix.adminToken);
    expect(first.status).toBe(204);
    expect((await whoAmI(fix.core, person.token)).status).toBe(401);
    // Idempotent: a second call is not a 404 and not an error, because the
    // session still exists and is already revoked.
    const second = await revoke(fix.core, session.session_id, fix.adminToken);
    expect(second.status).toBe(204);
  });

  /**
   * The regression for the third defect. The handler used to call
   * `identity.revokeSession` without `await`, so a rejection never reached the
   * router: the response was already `204` and the process died of an unhandled
   * rejection. Both halves are asserted — the status the router returns, and
   * that nothing escaped it.
   */
  it("returns the failure instead of dropping it on the floor", async () => {
    const fix = await fixture();
    const escaped: unknown[] = [];
    const listener = (reason: unknown): void => {
      escaped.push(reason);
    };
    process.on("unhandledRejection", listener);
    try {
      const answer = await revoke(fix.core, ABSENT_SESSION_ID, fix.adminToken);
      expect(answer.status).toBe(404);
      expect(answer.status).not.toBe(204);
      // A rejection escapes on the next tick, not this one.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(escaped).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });
});

describe("the first credential of an environment", () => {
  it("provisions a service credential that can then issue sessions over HTTP", async () => {
    const fix = await fixture();
    const provisioned = await provisionServiceCredential(fix.core, {
      service_name: "market",
      organization_id: fix.organizationId,
      roles: ["service"],
      issues_for_channels: ["phone"],
      correlation_id: CORR,
    });
    expect(provisioned.identity_created).toBe(true);
    expect(provisioned.membership_created).toBe(true);
    expect(provisioned.roles).toEqual(["service"]);
    expect(provisioned.issues_for_channels).toEqual(["phone"]);
    const person = await principalWith(fix, "+966500000301");
    const issued = await issue(
      fix.core,
      { principal_id: person.principalId, channel_type: "phone" },
      provisioned.access_token,
    );
    expect(issued.status).toBe(201);
  });

  it("is idempotent on the identity and the membership, and never on the token", async () => {
    const fix = await fixture();
    const first = await provisionServiceCredential(fix.core, {
      service_name: "move",
      organization_id: fix.organizationId,
      roles: ["service"],
      correlation_id: CORR,
    });
    const second = await provisionServiceCredential(fix.core, {
      service_name: "move",
      organization_id: fix.organizationId,
      roles: ["service"],
      correlation_id: CORR,
    });
    expect(second.principal_id).toBe(first.principal_id);
    expect(second.identity_created).toBe(false);
    expect(second.membership_created).toBe(false);
    // A token cannot be re-read, only re-issued: only its hash is stored.
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.session_id).not.toBe(first.session_id);
    // And the first one still works, because provisioning again is not a
    // rotation — revoking is a separate, entitled act.
    expect((await whoAmI(fix.core, first.access_token)).status).toBe(200);
  });

  it("invents no tenant and accepts no roleless credential", async () => {
    const fix = await fixture();
    await expect(
      provisionServiceCredential(fix.core, {
        service_name: "ghost",
        organization_id: "3f1b2c44-0000-4000-8000-0000000000bb",
        roles: ["service"],
        correlation_id: CORR,
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      provisionServiceCredential(fix.core, {
        service_name: "nameless",
        organization_id: fix.organizationId,
        roles: [],
        correlation_id: CORR,
      }),
    ).rejects.toThrow(/role/i);
  });

  it("fails loudly when an existing membership carries weaker roles", async () => {
    const fix = await fixture();
    await provisionServiceCredential(fix.core, {
      service_name: "weak",
      organization_id: fix.organizationId,
      roles: ["org_member"],
      correlation_id: CORR,
    });
    // The membership already exists with `org_member`, so asking for `service`
    // cannot be satisfied — and must not quietly return a credential that holds
    // less than the operator asked for.
    await expect(
      provisionServiceCredential(fix.core, {
        service_name: "weak",
        organization_id: fix.organizationId,
        roles: ["service"],
        correlation_id: CORR,
      }),
    ).rejects.toThrow(/roles asked for/);
  });

  it("is reachable only with database access, not over HTTP", () => {
    // The command reads `DATABASE_URL` and refuses without it, and nothing in
    // the router registers it. If a future cycle wants an admin-plane route for
    // provisioning, B-5 is the blocker that decides where such a plane lives.
    const cli = readCode("src/platform/bootstrap/cli.ts");
    expect(cli).toContain("DATABASE_URL");
    const routes = readCode("src/app.ts");
    expect(routes).not.toContain("provisionServiceCredential");
  });
});

describe("the operator surface of the bootstrap command", () => {
  it("defaults to the weaker credential rather than to platform_admin", () => {
    const parsed = parseArgs(["--service-name", "market", "--organization", "org-1"]);
    expect(parsed.roles).toEqual(["service"]);
    expect(parsed.roles).not.toContain("platform_admin");
    expect(parsed.serviceName).toBe("market");
  });

  it("refuses a missing tenant, a missing name and an invented role", () => {
    expect(() => parseArgs(["--service-name", "market"])).toThrow(CliUsageError);
    expect(() => parseArgs(["--organization", "org-1"])).toThrow(CliUsageError);
    expect(() =>
      parseArgs(["--service-name", "m", "--organization", "o", "--roles", "root"]),
    ).toThrow(/unknown role/);
    expect(() => parseArgs(["--service-name"])).toThrow(/needs a value/);
  });

  it("answers --help instead of failing, and touches no database", async () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: unknown }).write = (chunk: string): boolean => {
      written.push(String(chunk));
      return true;
    };
    try {
      // No `DATABASE_URL` is read on this path, which is what makes it safe to
      // call `main` here at all.
      expect(await bootstrapMain(["--help"])).toBe(0);
    } finally {
      (process.stdout as { write: unknown }).write = original;
    }
    expect(written.join("")).toContain("bootstrap:credential");
  });
});

describe("the contract publishes both refusals", () => {
  it("documents every status the two session routes can answer", () => {
    const operations = loadContract().operations;
    const issueOp = operations.find(
      (one) => one.method === "POST" && one.path === "/v1/sessions",
    );
    const revokeOp = operations.find(
      (one) => one.method === "POST" && one.path === "/v1/sessions/revoke",
    );
    expect(issueOp).toBeDefined();
    expect(revokeOp).toBeDefined();
    for (const status of ["201", "401", "403", "404", "429"]) {
      expect([...issueOp!.responses.keys()], `POST /v1/sessions must document ${status}`).toContain(
        status,
      );
    }
    for (const status of ["204", "401", "403", "404", "429"]) {
      expect(
        [...revokeOp!.responses.keys()],
        `POST /v1/sessions/revoke must document ${status}`,
      ).toContain(status);
    }
  });

  /**
   * The duplicate truth this cycle removes. `security: []` in the contract and
   * `anonymous(...)` in the registration are two statements of the same fact,
   * and before this milestone they disagreed: `/v1/sessions/revoke` was
   * anonymous in code and authenticated in the contract. Now they are asserted
   * equal, so neither can drift without the other.
   */
  it("marks exactly the anonymous registrations as unsecured", async () => {
    const fix = await fixture();
    const declaredAnonymous = fix.core.router
      .registrations()
      .filter((route) => !route.authentication.required)
      .map((route) => {
        const path = route.template
          .split("/")
          .map((segment) => (segment.startsWith(":") ? `{${segment.slice(1)}}` : segment))
          .join("/");
        return `${route.method.toUpperCase()} ${path}`;
      })
      .sort();

    const contract = readCode("contracts/openapi/core-v1.yaml").split("\n");
    const unsecured: string[] = [];
    let path: string | null = null;
    let method: string | null = null;
    for (const line of contract) {
      const pathLine = /^ {2}(\/[^:]*):\s*$/.exec(line);
      if (pathLine) {
        path = pathLine[1]!;
        method = null;
        continue;
      }
      const methodLine = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
      if (methodLine) {
        method = methodLine[1]!;
        continue;
      }
      if (/^ {6}security: \[\]\s*$/.test(line) && path && method) {
        unsecured.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(unsecured.sort()).toEqual(declaredAnonymous);
    expect(unsecured.length).toBe(6);
  });
});
