/**
 * Every response declares the headers it sets, and every response carries the one
 * a caller cannot work without — milestone 28.
 *
 * The four surfaces before this one are declared and gated: the query string
 * (24), the body (25), the request headers (26) and the answer's status, content
 * type and body (27). Milestone 27's own record says in as many words that it
 * makes no claim about response **headers**. This is that claim, and the two
 * defects it found are both on the paths a caller reaches when something has
 * already gone wrong — measured on `main` at `ea793f3`, before anything was
 * changed:
 *
 *  1. **An unmatched route answered `404` with no headers at all.** The body
 *     carried `correlation_id`; the header a caller reads it from was absent, on
 *     the one answer it gets when it cannot reach any route in CORE.
 *  2. **An unparseable JSON body answered `400` from the Node adapter** with
 *     `{code, message}` — no `correlation_id`, no `details`, no `retryable`, no
 *     header — so the one refusal produced above the router was the one refusal
 *     that was not the documented `Error`.
 *
 * And two things that were true but undeclared: `x-correlation-id` was set on 52
 * of 52 responses and documented on none of them, and the three `x-ratelimit-*`
 * headers were sent on **every** limited response, successes included, while the
 * contract documented them only on the shared `RateLimited` 429 — as if a caller
 * could only learn its budget by exceeding it.
 *
 * What this file asserts, all of it measured against real answers rather than
 * read out of the router:
 *
 *  1. The declaration is well formed: lower-case unique names, anchored shapes, a
 *     reason each.
 *  2. Every one of the 52 operations answers with `x-correlation-id`, it matches
 *     the declared shape, and it equals the `correlation_id` in the body whenever
 *     the body carries one — the two must be the same fact.
 *  3. No response carries a header that is not declared, and the router cannot
 *     send one: `sealHeaders` refuses it.
 *  4. The contract documents, for the status each operation actually returns,
 *     exactly the headers CORE sets on it when a limiter is wired.
 *  5. The paths that had no headers now have them: the unmatched 404, the
 *     malformed-header 400, the unparseable-body 400 over a real socket, and an
 *     unhandled exception's 500.
 *  6. With a limiter wired, the rate-limit headers are on a success too, they are
 *     consistent with each other, and `retry-after` appears on the 429 and
 *     nowhere else.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createCoreApp } from "../src/app.js";
import { anonymous } from "../src/platform/http/authentication.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import {
  RESPONSE_HEADERS,
  UndeclaredResponseHeaderError,
  declaredResponseHeader,
  sealHeaders,
} from "../src/platform/http/response-headers.js";
import { UNLIMITED_ROUTES, rateClassFor } from "../src/platform/http/rate-limit.js";
import { loadContract } from "./support/openapi.js";
import { contractPath, runScenario } from "./support/http-scenario.js";

const RATE_LIMIT_HEADERS = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"];

function app(rateLimit: boolean) {
  const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));
  return createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit });
}

describe("declared response headers", () => {
  it("declares each header once, lower case, anchored, with a reason", () => {
    const names = RESPONSE_HEADERS.map((h) => h.name);
    expect(names).toEqual([...new Set(names)]);
    for (const header of RESPONSE_HEADERS) {
      expect(header.name).toBe(header.name.toLowerCase());
      expect(header.reason.length).toBeGreaterThan(20);
      expect(header.shape.source.startsWith("^")).toBe(true);
      expect(header.shape.source.endsWith("$")).toBe(true);
      expect(declaredResponseHeader(header.name.toUpperCase())).toBe(header);
    }
    // The set is closed on purpose: a header added to the router without being
    // added here is a 500, and a header added here without a reason is this test.
    expect(names).toEqual([
      "x-correlation-id",
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
      "retry-after",
      "content-type",
      // Milestone 32. The list was closed at the six above until a keyed route
      // needed a way to say "this is the answer you already had": added here
      // deliberately, with its reason and its shape, rather than sent from the
      // router and discovered as a 500.
      "idempotent-replay",
      // Cycle 45. CORS on /metrics only: the dashboard is a single HTML file
      // that may be served from a different origin. A simple GET needs these
      // two headers on the response, and no preflight, so no OPTIONS route.
      "access-control-allow-origin",
      "access-control-allow-methods",
      // Cycle XR-8.5: the browser attempt binding. The nonce route sets one
      // cookie — HttpOnly, Secure, SameSite=Lax — and the login route reads it
      // back: the login answers only for the browser that opened the attempt.
      "set-cookie",
    ]);
  });

  it("refuses to send a header it has not declared, or a value of the wrong shape", () => {
    expect(() => sealHeaders({ "x-tenant-id": "org_1" })).toThrow(UndeclaredResponseHeaderError);
    expect(() => sealHeaders({ "retry-after": "0" })).toThrow(UndeclaredResponseHeaderError);
    expect(() => sealHeaders({ "x-ratelimit-remaining": "-1" })).toThrow(
      UndeclaredResponseHeaderError,
    );
    expect(() => sealHeaders({ "x-correlation-id": "  " })).toThrow(UndeclaredResponseHeaderError);
    // Lower-cased on the way out, and the later part wins — which is why the
    // router passes CORE's own correlation id after the route's headers.
    expect(sealHeaders({ "X-Correlation-Id": "a" }, { "x-correlation-id": "b" })).toEqual({
      "x-correlation-id": "b",
    });
  });

  it("answers every operation with a correlation id that matches the body's", async () => {
    const scenario = await runScenario();
    expect(scenario.answers.size).toBe(55);
    const shape = declaredResponseHeader("x-correlation-id")!.shape;
    const missing: string[] = [];
    for (const [label, answer] of scenario.answers) {
      const value = answer.headers?.["x-correlation-id"];
      if (value === undefined || !shape.test(value)) {
        missing.push(`${label}: ${JSON.stringify(value)}`);
        continue;
      }
      const body = answer.body;
      if (body !== null && typeof body === "object" && "correlation_id" in body) {
        const inBody = (body as { correlation_id: unknown }).correlation_id;
        if (inBody !== value) missing.push(`${label}: header ${value} but body ${String(inBody)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("sets no header it has not declared, on any operation", async () => {
    const scenario = await runScenario();
    const undeclared: string[] = [];
    for (const [label, answer] of scenario.answers) {
      for (const [name, value] of Object.entries(answer.headers ?? {})) {
        const declaration = declaredResponseHeader(name);
        if (declaration === undefined) undeclared.push(`${label}: ${name}`);
        else if (!declaration.shape.test(value)) undeclared.push(`${label}: ${name}=${value}`);
      }
    }
    expect(undeclared).toEqual([]);
  });

  it("documents, for the status each operation returns, exactly the headers CORE sets on it", async () => {
    const contract = loadContract();
    const scenario = await runScenario();
    const limited = app(true);
    const mismatches: string[] = [];
    for (const operation of contract.operations) {
      const answer = scenario.answers.get(operation.label);
      expect(answer, `${operation.label} is not driven`).toBeDefined();
      const documented = operation.responses.get(String(answer!.status));
      expect(documented, `${operation.label} does not document ${answer!.status}`).toBeDefined();
      // What CORE actually sends in a deployment that has a limiter: the headers
      // the scenario observed, plus the rate-limit trio the limiter adds. Taken
      // from the limited app rather than assumed, so the claim stays measured.
      const real = new Set(Object.keys(answer!.headers ?? {}));
      real.delete("content-type"); // declared by `content`, per OpenAPI; gated by milestone 27
      // `/health`, `/ready` and `/metrics` are exempt from the limiter
      // (`UNLIMITED_ROUTES`), so they carry no budget and must not document one:
      // documenting a header CORE never sends is the same defect as sending one it
      // never documented, in the other direction. Derived from the limiter itself
      // rather than listed here, so an exemption added later moves both at once.
      const limitedRoute = rateClassFor(operation.method, operation.path) !== null;
      if (limitedRoute) for (const name of RATE_LIMIT_HEADERS) real.add(name);
      // Milestone 32: a `keyed` route answers a *retried* request with
      // `idempotent-replay: true` and the status it is answering with here, so
      // the header belongs in this operation's documentation even though the
      // scenario sends each request once and never observes it. Derived from
      // the registration rather than listed here, for the reason the rate-limit
      // trio is derived from the limiter: a route that becomes keyed later must
      // move the contract with it, and a list in a test moves only when
      // somebody remembers.
      const keyed = scenario.core.router
        .registrations()
        .some(
          (registration) =>
            registration.method === operation.method &&
            contractPath(registration.template) === operation.path &&
            registration.retry.mechanism === "keyed",
        );
      if (keyed) real.add("idempotent-replay");
      const declared = new Set([...documented!.headers.keys()]);
      const missing = [...real].filter((name) => !declared.has(name)).sort();
      const extra = [...declared].filter((name) => !real.has(name)).sort();
      if (missing.length || extra.length) {
        mismatches.push(`${operation.label} ${answer!.status}: missing ${missing}, extra ${extra}`);
      }
      for (const [name, declaration] of documented!.headers) {
        const record = declaration as Record<string, unknown>;
        expect(typeof record["description"], `${operation.label} ${name} description`).toBe(
          "string",
        );
        expect(record["schema"], `${operation.label} ${name} schema`).toBeDefined();
        expect(declaredResponseHeader(name), `${operation.label} documents ${name}`).toBeDefined();
      }
    }
    expect(mismatches).toEqual([]);
    // The rate-limit trio is really added by the limiter, on a success — the
    // assumption the loop above makes, checked rather than trusted.
    const limitedSuccess = await limited.router.handle({
      method: "POST",
      url: "/v1/access/check",
      headers: {},
      body: {},
    });
    for (const name of RATE_LIMIT_HEADERS) {
      expect(Object.keys(limitedSuccess.headers ?? {}), name).toContain(name);
    }
    // And the exempt routes really are exempt, which is the other half of the rule
    // the loop above applies.
    for (const template of UNLIMITED_ROUTES) {
      const exempt = await limited.router.handle({ method: "GET", url: template, headers: {} });
      for (const name of RATE_LIMIT_HEADERS) {
        expect(Object.keys(exempt.headers ?? {}), `${template} ${name}`).not.toContain(name);
      }
      expect(exempt.headers?.["x-correlation-id"], template).toBeDefined();
    }
  });

  it("documents the shared refusal responses too, so every documented refusal carries them", () => {
    const contract = loadContract();
    // Every refusal in the contract is a `$ref` to one of these two, so their
    // headers are the headers of every 4xx CORE publishes. Read through an
    // operation that refs both, since the reader resolves refs.
    const operation = contract.operations.find((candidate) => candidate.responses.has("429"))!;
    const rateLimited = operation.responses.get("429")!;
    expect([...rateLimited.headers.keys()].sort()).toEqual([
      "retry-after",
      "x-correlation-id",
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
    ]);
    const error = contract.operations
      .flatMap((candidate) => [...candidate.responses])
      .find(([status]) => status === "403" || status === "400" || status === "404")![1];
    expect([...error.headers.keys()]).toContain("x-correlation-id");
  });

  it("carries a correlation id on the answers that used to carry no headers at all", async () => {
    const core = app(false);
    // 1. An unmatched route. This is the defect the milestone was reserved for.
    const unmatched = await core.router.handle({ method: "GET", url: "/v1/nope", headers: {} });
    expect(unmatched.status).toBe(404);
    expect(unmatched.headers?.["x-correlation-id"]).toBe(
      (unmatched.body as { correlation_id: string }).correlation_id,
    );
    // 2. A malformed declared request header, refused before the route is known.
    const malformed = await core.router.handle({
      method: "GET",
      url: "/health",
      headers: { "x-correlation-id": "   " },
    });
    expect(malformed.status).toBe(400);
    const generated = malformed.headers?.["x-correlation-id"];
    expect(generated).toBeDefined();
    // Never the rejected value, and never empty: a refusal that echoed the header
    // that caused it would put it in the log it was refused to keep it out of.
    expect(generated).not.toBe("   ");
    expect(declaredResponseHeader("x-correlation-id")!.shape.test(generated!)).toBe(true);
    // 3. An unhandled exception from a route.
    // A throwaway app, not the scenario's: adding a route to a shared router
    // breaks the coverage gate that says the driven set equals the contract's.
    const probe = app(false);
    probe.router.get(
      "/v1/throwing-probe",
      [],
      // Declared anonymous so the answer under test is the 500 this case is
      // about, rather than the 401 an authenticated declaration would produce
      // before the handler ever ran.
      anonymous("throwaway probe: the assertion is about an unhandled exception"),
      () => {
        throw new Error("boom");
      },
    );
    const thrown = await probe.router.handle({
      method: "GET",
      url: "/v1/throwing-probe",
      headers: {},
    });
    expect(thrown.status).toBe(500);
    expect(thrown.headers?.["x-correlation-id"]).toBe(
      (thrown.body as { correlation_id: string }).correlation_id,
    );
  });

  it("answers an unparseable body as the documented Error, with the header, over a real socket", async () => {
    const core = app(false);
    const server = createServer(core.router.nodeListener());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/v1/organizations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      });
      expect(response.status).toBe(400);
      const correlationId = response.headers.get("x-correlation-id");
      expect(correlationId).toBeTruthy();
      const body = (await response.json()) as Record<string, unknown>;
      // The canonical `Error`, not the two-field object this path used to send.
      expect(Object.keys(body).sort()).toEqual([
        "code",
        "correlation_id",
        "details",
        "message",
        "retryable",
      ]);
      expect(body["correlation_id"]).toBe(correlationId);
      expect(body["retryable"]).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("sends retry-after on a refusal that comes good, and on nothing else", async () => {
    const core = app(true);
    // A limited route, deliberately: `/health` is exempt, so it can never produce
    // the refusal this test is about.
    const headers = { "x-forwarded-for": "203.0.113.9" };
    let refusal: Awaited<ReturnType<typeof core.router.handle>> | undefined;
    const seen: number[] = [];
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const response = await core.router.handle({
        method: "GET",
        url: "/v1/sessions/current",
        headers,
      });
      if (response.status === 429) {
        refusal = response;
        break;
      }
      seen.push(Number(response.headers?.["x-ratelimit-remaining"]));
      expect(response.headers?.["retry-after"]).toBeUndefined();
    }
    expect(refusal, "the limiter never refused").toBeDefined();
    expect(Number(refusal!.headers?.["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(refusal!.headers?.["x-ratelimit-remaining"]).toBe("0");
    // The budget counts down rather than repeating itself, which is what makes the
    // header worth reading before the refusal instead of after it.
    expect(seen[0]).toBeGreaterThan(seen[seen.length - 1]!);
    expect(Number(refusal!.headers?.["x-ratelimit-reset"])).toBeGreaterThan(0);
  });
});
