/**
 * B-42, closed: `session.issue` is scoped to the channels a service speaks for.
 *
 * Measured on `main` at `6972a73`, before the change: a credential provisioned
 * with `npm run bootstrap:credential --roles service` held `session.issue`, and
 * `POST /v1/sessions` with it answered `201` for a `platform_admin`'s
 * `principal_id` — the minted token then read `GET /v1/sessions/current` as
 * `platform_admin`. The permission answered "may this caller create sessions at
 * all" and never "for whom". The first test below is that exact request, and it
 * is now a `403`.
 *
 * The rules, in the order `IdentityService.issueSessionAs` applies them:
 *
 *  1. no `session.issue`, no session;
 *  2. `platform_admin` is unscoped (it already holds every permission);
 *  3. a service issues only on a channel named in its `issues_for_channels`;
 *  4. only for a principal that is a person, verified on that channel, and
 *     holding no role that grants `session.issue` — and every refusal of rule 4,
 *     including "no such principal", is the same `403` with the same message.
 *
 * Also asserted, because the documentation claimed it and the code did not: the
 * `session.issued` audit row names the issuer, not the principal issued for.
 *
 * No database: memory backend, so this gate runs in both CI jobs. The schema
 * side (the check constraint) is probed by `tests/check-parity.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCoreApp, type CoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { VOCABULARIES } from "../src/platform/persistence/row-rules.js";
import {
  CHANNEL_TYPES,
  ISSUABLE_CHANNEL_TYPES,
  type ChannelType,
  type IssuableChannelType,
  type Role,
} from "../src/modules/identity-access/domain.js";
import { provisionServiceCredential } from "../src/platform/bootstrap/credential.js";
import { CliUsageError, parseArgs, USAGE } from "../src/platform/bootstrap/cli.js";

const CORR = "session-scope";
const START = new Date("2026-06-01T00:00:00.000Z");
/** Well formed, and naming nobody. */
const ABSENT_PRINCIPAL_ID = "3f1b2c44-0000-4000-8000-0000000000aa";

interface Fixture {
  core: CoreApp;
  organizationId: string;
  adminToken: string;
  adminPrincipalId: string;
}

async function fixture(): Promise<Fixture> {
  const clock = new FixedClock(START);
  const core = createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit: false });
  const organization = await core.organization.create({
    name: "Scope Org",
    country_code: "SA",
    correlation_id: CORR,
  });
  const admin = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: "scope-admin",
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

async function service(
  fix: Fixture,
  name: string,
  issuesFor: readonly IssuableChannelType[],
): Promise<{ principalId: string; token: string }> {
  const provisioned = await provisionServiceCredential(fix.core, {
    service_name: name,
    organization_id: fix.organizationId,
    roles: ["service"],
    issues_for_channels: issuesFor,
    correlation_id: CORR,
  });
  return { principalId: provisioned.principal_id, token: provisioned.access_token };
}

async function person(
  fix: Fixture,
  channel: ChannelType,
  reference: string,
  roles: readonly Role[] = [],
): Promise<string> {
  const registered = await fix.core.identity.registerIdentity({
    channel_type: channel,
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
  return registered.principal.principal_id;
}

async function issue(
  core: CoreApp,
  token: string,
  body: { principal_id: string; channel_type: string },
): Promise<{ status: number; body: { code?: string; message?: string; access_token?: string } }> {
  const response = await core.router.handle({
    method: "POST",
    url: "/v1/sessions",
    headers: { authorization: `Bearer ${token}` },
    body,
  });
  return { status: response.status, body: response.body as never };
}

async function whoAmI(core: CoreApp, token: string): Promise<{ principal_id: string; roles: string[] }> {
  const response = await core.router.handle({
    method: "GET",
    url: "/v1/sessions/current",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return response.body as { principal_id: string; roles: string[] };
}

/** Each request carries its own correlation id; everything else must be equal. */
function withoutCorrelation(body: unknown): unknown {
  const { correlation_id: _ignored, ...rest } = (body ?? {}) as Record<string, unknown>;
  return rest;
}

async function sessionCount(core: CoreApp): Promise<number> {
  return (await core.audit.entries()).filter((e) => e.action === "session.issued").length;
}

describe("B-42: a service credential cannot mint a session for whoever it likes", () => {
  it("refuses the measured escalation: a service minting a platform_admin session", async () => {
    const fix = await fixture();
    const adapter = await service(fix, "web-adapter", ["web"]);
    const before = await sessionCount(fix.core);
    // The admin is verified on web, which is the adapter's own channel — so the
    // refusal comes from rule 4's "cannot issue itself", not from the channel.
    const refused = await issue(fix.core, adapter.token, {
      principal_id: fix.adminPrincipalId,
      channel_type: "web",
    });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("forbidden");
    expect(await sessionCount(fix.core)).toBe(before);
  });

  it("issues for a person verified on the service's own channel, and the session is the person's", async () => {
    const fix = await fixture();
    const adapter = await service(fix, "telegram-adapter", ["telegram"]);
    const target = await person(fix, "telegram", "tg-1001");
    const issued = await issue(fix.core, adapter.token, { principal_id: target, channel_type: "telegram" });
    expect(issued.status).toBe(201);
    const current = await whoAmI(fix.core, issued.body.access_token as string);
    expect(current.principal_id).toBe(target);
    expect(current.roles).toEqual([]);
  });

  it("refuses a channel the credential was not provisioned for, before reading any principal", async () => {
    const fix = await fixture();
    const adapter = await service(fix, "telegram-only", ["telegram"]);
    const target = await person(fix, "phone", "+966500000901");
    const real = await issue(fix.core, adapter.token, { principal_id: target, channel_type: "phone" });
    const invented = await issue(fix.core, adapter.token, {
      principal_id: ABSENT_PRINCIPAL_ID,
      channel_type: "phone",
    });
    expect(real.status).toBe(403);
    expect(invented.status).toBe(403);
    expect(withoutCorrelation(real.body)).toEqual(withoutCorrelation(invented.body));
  });

  it("refuses a service provisioned without any channel: holding session.issue is no longer enough", async () => {
    const fix = await fixture();
    const unscoped = await service(fix, "unscoped", []);
    const target = await person(fix, "telegram", "tg-1002");
    const refused = await issue(fix.core, unscoped.token, { principal_id: target, channel_type: "telegram" });
    expect(refused.status).toBe(403);
  });

  it("refuses a person who holds the service role but was never provisioned as a service", async () => {
    const fix = await fixture();
    const pretender = await person(fix, "telegram", "tg-1003", ["service"]);
    const session = await fix.core.identity.issueSession({
      principal_id: pretender,
      channel_type: "telegram",
      correlation_id: CORR,
    });
    const target = await person(fix, "telegram", "tg-1004");
    const refused = await issue(fix.core, session.token, { principal_id: target, channel_type: "telegram" });
    expect(refused.status).toBe(403);
  });

  it("gives one indistinguishable refusal for every principal outside rule 4", async () => {
    const fix = await fixture();
    const adapter = await service(fix, "web-scope", ["web"]);
    const otherService = await service(fix, "other-service", []);
    const unlinked = await person(fix, "phone", "+966500000902");
    const issuer = await person(fix, "web", "web-issuer", ["service"]);
    const refusals = await Promise.all(
      [ABSENT_PRINCIPAL_ID, unlinked, otherService.principalId, issuer, fix.adminPrincipalId].map((id) =>
        issue(fix.core, adapter.token, { principal_id: id, channel_type: "web" }),
      ),
    );
    for (const refusal of refusals) {
      expect(refusal.status).toBe(403);
      expect(withoutCorrelation(refusal.body)).toEqual(withoutCorrelation(refusals[0]?.body));
    }
    // And the shape carries no principal id, so it cannot echo one back.
    expect(JSON.stringify(refusals[0]?.body)).not.toContain(unlinked);
  });

  it("leaves platform_admin unscoped, so an absent principal is still a 404 for an operator", async () => {
    const fix = await fixture();
    const target = await person(fix, "phone", "+966500000903");
    const issued = await issue(fix.core, fix.adminToken, { principal_id: target, channel_type: "telegram" });
    expect(issued.status).toBe(201);
    const absent = await issue(fix.core, fix.adminToken, {
      principal_id: ABSENT_PRINCIPAL_ID,
      channel_type: "phone",
    });
    expect(absent.status).toBe(404);
  });
});

describe("the session.issued audit row names who asked", () => {
  it("records the issuing service as the actor and the person in the metadata", async () => {
    const fix = await fixture();
    const adapter = await service(fix, "audited-adapter", ["telegram"]);
    const target = await person(fix, "telegram", "tg-1005");
    const issued = await issue(fix.core, adapter.token, { principal_id: target, channel_type: "telegram" });
    expect(issued.status).toBe(201);
    const entries = (await fix.core.audit.entries()).filter((e) => e.action === "session.issued");
    const last = entries[entries.length - 1];
    expect(last?.actor_type).toBe("principal");
    expect(last?.actor_id).toBe(adapter.principalId);
    expect(last?.metadata).toMatchObject({ channel_type: "telegram", principal_id: target });
  });

  it("records an in-process issuance (bootstrap) as the system, not as the person", async () => {
    const fix = await fixture();
    const entries = (await fix.core.audit.entries()).filter((e) => e.action === "session.issued");
    // The fixture's own admin session was issued in-process.
    expect(entries[0]?.actor_type).toBe("system");
    expect(entries[0]?.actor_id).toBeNull();
    expect(entries[0]?.metadata).toMatchObject({ principal_id: fix.adminPrincipalId });
  });
});

describe("issuance channels are provisioned, and only for a service", () => {
  it("refuses issuance channels on a person", async () => {
    const fix = await fixture();
    await expect(
      fix.core.identity.registerIdentity({
        channel_type: "web",
        external_id: "person-with-scope",
        issues_for_channels: ["web"],
        correlation_id: CORR,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("refuses partner_api as an issuance channel: a system never mints a system", async () => {
    const fix = await fixture();
    await expect(
      provisionServiceCredential(fix.core, {
        service_name: "minting-system",
        organization_id: fix.organizationId,
        roles: ["service"],
        issues_for_channels: ["partner_api" as IssuableChannelType],
        correlation_id: CORR,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("refuses to re-scope an existing service by provisioning it again", async () => {
    const fix = await fixture();
    await service(fix, "rescoped", ["telegram"]);
    await expect(service(fix, "rescoped", ["telegram", "web"])).rejects.toMatchObject({
      code: "invalid_request",
    });
    // The same scope again is the idempotent case.
    const again = await provisionServiceCredential(fix.core, {
      service_name: "rescoped",
      organization_id: fix.organizationId,
      roles: ["service"],
      issues_for_channels: ["telegram"],
      correlation_id: CORR,
    });
    expect(again.identity_created).toBe(false);
    expect(again.issues_for_channels).toEqual(["telegram"]);
  });
});

describe("the bootstrap CLI names the scope", () => {
  const base = ["--service-name", "market", "--organization", ABSENT_PRINCIPAL_ID];

  it("defaults to no channel, the weaker credential", () => {
    expect(parseArgs(base).issuesFor).toEqual([]);
  });

  it("parses, trims and de-duplicates --issue-for", () => {
    expect(parseArgs([...base, "--issue-for", "telegram, web,telegram"]).issuesFor).toEqual([
      "telegram",
      "web",
    ]);
  });

  it("refuses an unknown or system channel, and an empty list", () => {
    expect(() => parseArgs([...base, "--issue-for", "partner_api"])).toThrow(CliUsageError);
    expect(() => parseArgs([...base, "--issue-for", "carrier-pigeon"])).toThrow(CliUsageError);
    expect(() => parseArgs([...base, "--issue-for", ","])).toThrow(CliUsageError);
  });

  it("documents the flag", () => {
    expect(USAGE).toContain("--issue-for");
  });
});

describe("one list of issuable channels, stated three times and kept equal", () => {
  it("is every channel except partner_api", () => {
    expect([...ISSUABLE_CHANNEL_TYPES].sort()).toEqual(
      CHANNEL_TYPES.filter((channel) => channel !== "partner_api").sort(),
    );
  });

  it("matches the row rule vocabulary and the migration's check constraint", () => {
    expect([...VOCABULARIES.issuable_channel_type].sort()).toEqual([...ISSUABLE_CHANNEL_TYPES].sort());
    const sql = readFileSync("db/migrations/0022_principal_issuance_channels.sql", "utf8");
    const match = /issues_for_channels <@ ARRAY\[([^\]]*)\]/.exec(sql);
    const fromSql = (match?.[1] ?? "")
      .split(",")
      .map((part) => part.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(fromSql).toEqual([...ISSUABLE_CHANNEL_TYPES].sort());
  });
});
