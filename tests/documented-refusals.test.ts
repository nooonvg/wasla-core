/**
 * A route documents every refusal it can actually produce — milestone 36.
 *
 * The answer surface has been gated from the contract *outwards* since milestone
 * 27: every documented status must be produced, every produced body must satisfy
 * its documented schema (27), every response must declare the headers it sets
 * (28), and `401` must be documented wherever it can happen (30). Nothing gated
 * the other direction — **a status a route can answer that the contract never
 * mentions**. A caller generating a client from this file would have no branch
 * for it.
 *
 * Measured on `main` at `2390649` before anything was edited, by driving all 52
 * registrations twice with a credential (once with a body naming a field no
 * route declares, once with no body at all):
 *
 *  - **33 of 52 operations answered a refusal they do not document.** All 33
 *    answered an undocumented `400`, including `GET /health`, `GET /ready` and
 *    `GET /metrics`, which documented only `200`.
 *  - Two also answered an undocumented `404`:
 *    `POST /v1/fulfillments/{fulfillment_id}/cancel` and
 *    `GET /v1/geography/regions/{region_id}/cities`.
 *
 * **The decision the reservation left open, and why.** Those three probe routes
 * refuse a request carrying a body they do not read, which is milestone 25's
 * boundary rule applied uniformly. The alternative was to exempt them so a
 * liveness check cannot be made to refuse by a stray body. That was rejected:
 * an exception in a uniform boundary rule is three more branches in the router
 * and a rule with a hole in it, to remove a refusal a correct caller never
 * triggers. The refusal is real, deliberate and now documented — and documented
 * against `UnlimitedError`, not the shared `Error`, because these routes send no
 * `x-ratelimit-*` headers and milestone 28's gate compares documented headers
 * against real ones.
 *
 * What this file asserts:
 *
 *  1. **Every refusal produced by the matrix below is documented** for the
 *     operation that produced it. This is the guarantee.
 *  2. **Coverage**: the operations driven are exactly the operations the
 *     contract publishes, so a route added later cannot go unmeasured.
 *  3. **Every refusal produced is the documented refusal shape**, so the new
 *     entries are not a status code with no schema behind it.
 *  4. **The documented refusal declares the headers that refusal carries**,
 *     derived from `rateClassFor` rather than from a second list: the
 *     correlation header always, the three budget headers exactly when the route
 *     has a rate class. This is what makes `UnlimitedError` load-bearing instead
 *     of decorative — pointing `/health`'s new `400` at the shared `Error` would
 *     publish three headers CORE does not send there, and milestone 28's gate
 *     would not notice, because it checks the status each operation returns on a
 *     successful call and `400` is not that status.
 *  5. **429 is documented by exactly the routes that can produce one**, decided
 *     per rate class against a real budget rather than per route: a
 *     representative of each limited class is driven past its limit and must
 *     answer 429, and the three `UNLIMITED_ROUTES` are driven far past every
 *     budget and must never answer one.
 *
 * The matrix is deliberately shallow and uniform — anonymous, a body no route
 * declares, no body, an unknown path parameter, a keyed route with no key. It
 * reaches `400`, `401`, `403` and `404`. It does **not** reach `409` or `500`,
 * and this gate therefore makes no claim about them; the routes that document
 * those are covered by their own milestones' tests. Stated here rather than
 * implied, because a whole-surface sweep reads as a stronger claim than it is —
 * the lesson recorded in milestone 34, where the sweep held vacuously. The
 * status set the matrix reaches is asserted rather than described, so widening
 * it later is a decision somebody makes on purpose.
 *
 * No database: the memory backend, so this runs in both CI jobs.
 */
import { describe, expect, it } from "vitest";
import { createCoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import {
  DEFAULT_RATE_LIMIT_POLICY,
  UNLIMITED_ROUTES,
  rateClassFor,
} from "../src/platform/http/rate-limit.js";
import { loadContract, violations } from "./support/openapi.js";
import { contractPath, runScenario, type Scenario } from "./support/http-scenario.js";

const contract = loadContract();
const scenario: Scenario = await runScenario();

const documentedStatuses = new Map<string, ReadonlySet<string>>(
  contract.operations.map((operation) => [
    `${operation.method.toUpperCase()} ${operation.path}`,
    new Set(operation.responses.keys()),
  ]),
);

const errorSchema = contract.resolve({ $ref: "#/components/schemas/Error" });

/** A syntactically valid identifier that identifies nothing, for the 404 probe. */
const ABSENT = "00000000-0000-4000-8000-000000000000";

const concrete = (template: string): string =>
  template
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ABSENT : segment))
    .join("/");

interface Refusal {
  readonly label: string;
  readonly probe: string;
  readonly status: number;
  readonly body: unknown;
}

const registrations = scenario.core.router.registrations();
const authorization = `Bearer ${scenario.token}`;
let keys = 0;

const refusals: Refusal[] = [];

for (const registration of registrations) {
  const label = `${registration.method.toUpperCase()} ${contractPath(registration.template)}`;
  const url = concrete(registration.template);
  const probes: readonly { readonly name: string; readonly headers: Record<string, string>; readonly body?: unknown }[] = [
    // No credential at all. Reaches 401 on every route that requires one, and
    // the documented success on the three that do not.
    { name: "anonymous", headers: {} },
    // A body naming a property no route in CORE declares. Reaches the boundary
    // refusal on every route, including the ones that read no body.
    {
      name: "undeclared body property",
      headers: { authorization, "idempotency-key": `refusal-${++keys}` },
      body: { "not-a-field-any-route-declares": true },
    },
    // No body where one is required, and no body where none is expected.
    { name: "no body", headers: { authorization, "idempotency-key": `refusal-${++keys}` } },
    // A well-formed identifier that identifies nothing. Reaches 404 on the
    // parameterised routes and nothing new on the rest.
    {
      name: "unknown path parameter",
      headers: { authorization, "idempotency-key": `refusal-${++keys}` },
    },
    // Milestone 32: a keyed write route refuses a request with no key. Sent to
    // every route rather than only the keyed ones, so this file holds no second
    // copy of which routes are keyed.
    { name: "no idempotency key", headers: { authorization } },
  ];

  for (const probe of probes) {
    const response = await scenario.core.router.handle({
      method: registration.method,
      url,
      headers: probe.headers,
      ...(probe.body === undefined ? {} : { body: probe.body }),
    });
    if (response.status >= 400) {
      refusals.push({ label, probe: probe.name, status: response.status, body: response.body });
    }
  }
}

describe("a route documents every refusal it can produce", () => {
  it("produced enough refusals for the rest of this file to mean anything", () => {
    // A guard against the whole gate passing because the matrix stopped
    // producing anything — the failure mode milestone 34's sweep had.
    expect(refusals.length).toBeGreaterThan(100);
    // 409 since D-XR-13: the uniform matrix reaches it on its own, because the
    // deletion route's caller here is a platform admin, and an admin's account
    // is not theirs to delete alone — the organizations that would be left
    // unadministered are named in the refusal. A deliberate refusal, so 409 is
    // now a matrix answer rather than a comment.
    expect(new Set(refusals.map((refusal) => refusal.status))).toEqual(new Set([400, 401, 403, 404, 409]));
  });

  it("documents every refusal the matrix produced, for the operation that produced it", () => {
    const undocumented = refusals
      .filter((refusal) => !(documentedStatuses.get(refusal.label)?.has(String(refusal.status)) ?? false))
      .map(
        (refusal) =>
          `${refusal.label} answered ${refusal.status} to "${refusal.probe}" and documents ` +
          `${[...(documentedStatuses.get(refusal.label) ?? [])].sort().join(",") || "nothing"}`,
      );
    expect([...new Set(undocumented)]).toEqual([]);
  });

  it("drives exactly the operations the contract publishes", () => {
    const driven = new Set(
      registrations.map((r) => `${r.method.toUpperCase()} ${contractPath(r.template)}`),
    );
    expect([...driven].sort()).toEqual([...documentedStatuses.keys()].sort());
  });

  it("answers every one of those refusals in the documented refusal shape", () => {
    const wrong: string[] = [];
    for (const refusal of refusals) {
      const problems = violations(refusal.body, errorSchema, `${refusal.label} ${refusal.status}`);
      if (problems.length > 0) wrong.push(`${refusal.label} (${refusal.probe}): ${problems.join("; ")}`);
    }
    expect(wrong).toEqual([]);
  });

  it("declares, on each documented refusal, the headers that refusal carries", () => {
    // Which routes are keyed is read off the router, not restated here.
    const keyed = new Set(
      registrations
        .filter((registration) => registration.retry.mechanism === "keyed")
        .map((registration) => `${registration.method.toUpperCase()} ${contractPath(registration.template)}`),
    );

    const wrong: string[] = [];
    for (const operation of contract.operations) {
      const limited = rateClassFor(operation.method.toUpperCase(), operation.path) !== null;
      for (const [status, response] of operation.responses) {
        if (Number(status) < 400) continue;
        const declared = new Set(response.headers.keys());
        const required = new Set([
          "x-correlation-id",
          ...(limited ? ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"] : []),
          // Milestone 34: a refusal states its retry time once, and 429 always
          // has one.
          ...(status === "429" ? ["retry-after"] : []),
        ]);
        // A keyed route's 409 is the only refusal that may or may not carry a
        // retry time: the in-flight twin gets one, the reuse refusal does not.
        const permitted = new Set(required);
        if (status === "409" && keyed.has(operation.label)) permitted.add("retry-after");

        const missing = [...required].filter((header) => !declared.has(header));
        const extra = [...declared].filter((header) => !permitted.has(header));
        if (missing.length > 0 || extra.length > 0) {
          wrong.push(
            `${operation.label} ${status}: missing [${missing.join(", ")}] extra [${extra.join(", ")}]`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("documents a body for every refusal, not a status code with a sentence behind it", () => {
    // The second defect this cycle found, and the reason the assertion above
    // exists at all. Eighteen refusals were written as `{ description: "..." }`
    // with no `content` and no headers, so milestone 27's schema gate had
    // nothing to compare a real body against and passed them by. A caller
    // generating a client got a status with no type.
    const bare: string[] = [];
    for (const operation of contract.operations) {
      for (const [status, response] of operation.responses) {
        if (Number(status) < 400) continue;
        if (response.schema === undefined) bare.push(`${operation.label} ${status}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("documents 429 on exactly the routes a real budget can refuse", async () => {
    const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));
    const limited = createCoreApp({ clock, persistence: memoryPersistence(clock) });

    // One representative per rate class, driven past that class's real limit.
    // Per class rather than per route because the class is where the budget
    // lives; asserting it route by route would restate `rateClassFor` here.
    const byClass = new Map<string, { method: string; template: string }>();
    for (const registration of limited.router.registrations()) {
      const rateClass = rateClassFor(registration.method, registration.template);
      if (rateClass !== null && !byClass.has(rateClass)) {
        byClass.set(rateClass, { method: registration.method, template: registration.template });
      }
    }
    expect([...byClass.keys()].sort()).toEqual(["ingress_events", "read", "write"]);

    const drive = async (
      app: typeof limited,
      method: string,
      template: string,
      attempts: number,
    ): Promise<boolean> => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const response = await app.router.handle({
          method,
          url: concrete(template),
          headers: { authorization: `Bearer ${scenario.token}`, "idempotency-key": `budget-${attempt}` },
          ...(method === "GET" ? {} : { body: {} }),
        });
        if (response.status === 429) return true;
      }
      return false;
    };

    for (const [rateClass, route] of byClass) {
      const limit = DEFAULT_RATE_LIMIT_POLICY.limits[rateClass as keyof typeof DEFAULT_RATE_LIMIT_POLICY.limits];
      const app = createCoreApp({ clock: new FixedClock(new Date("2026-06-01T00:00:00.000Z")), persistence: memoryPersistence(clock) });
      const reached = await drive(app, route.method, route.template, limit + 2);
      expect(reached, `${rateClass} (${route.method} ${route.template}) never refused inside ${limit + 2} calls`).toBe(true);
      const label = `${route.method.toUpperCase()} ${contractPath(route.template)}`;
      expect(documentedStatuses.get(label)?.has("429"), `${label} produced 429 and must document it`).toBe(true);
    }

    // And the other side: a route that is never limited, driven far past every
    // budget in the policy, must never answer 429 and must not document one.
    const highest = Math.max(...Object.values(DEFAULT_RATE_LIMIT_POLICY.limits));
    for (const template of UNLIMITED_ROUTES) {
      const reached = await drive(limited, "GET", template, highest + 5);
      expect(reached, `${template} is on UNLIMITED_ROUTES and must never refuse for budget`).toBe(false);
      expect(documentedStatuses.get(`GET ${template}`)?.has("429")).toBe(false);
    }
  }, 120_000);
});
