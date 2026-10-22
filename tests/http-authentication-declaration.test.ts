/**
 * Every route declares whether it needs a credential, the router enforces that
 * declaration before it reads anything else, and `401` is published wherever it
 * can happen — milestone 30.
 *
 * What was measured on the reservation commit, by sweeping all 52 registrations
 * over the router with no `authorization` header and a syntactically valid but
 * invented identifier in every path parameter:
 *
 *  - **200 × 3** — `/health`, `/ready`, `/metrics`. Intended.
 *  - **400 × 28** — twenty-eight routes parsed an anonymous caller's query
 *    string or body and told it what was wrong with them. Authentication lived
 *    inside each handler, so the parse always ran first and the caller learned
 *    which properties the route accepts, which are required, and which it
 *    misspelled, before CORE ever asked who it was.
 *  - **401 × 19**, **404 × 2**.
 *  - The two 404s are the sharp one. `GET /v1/fulfillments/{id}` answered **404
 *    for an invented identifier and 401 for a real one**, to the same anonymous
 *    caller. That difference is an existence oracle: anyone could test whether a
 *    fulfillment id exists without holding any credential at all.
 *  - **3 of 52 operations documented `401`** in `contracts/openapi/core-v1.yaml`,
 *    while 46 of them can answer it.
 *
 * What changed. Authentication became a property of the route rather than a
 * line inside a handler: `AuthenticationSpec` is `AUTHENTICATED` or
 * `anonymous(reason)`, every registration carries one, and `Router.handle`
 * resolves it after the rate limiter and before `parseSelection`, `parseBody`
 * and the handler. `bearerCredential` in `src/platform/http/authentication.ts`
 * is now the only reader of the `authorization` header in the repository, and
 * no handler calls `authenticate` at all.
 *
 * After: **200 × 3, 400 × 3, 401 × 46** — the three 400s being the three
 * anonymous-by-declaration write routes refusing an empty body, which is the
 * answer they should give. Real and invented identifiers are indistinguishable
 * to an anonymous caller everywhere.
 *
 * This reverses the ordering milestones 24 and 25 chose, deliberately; the
 * record is in `docs/authentication-ordering.md` and in the two cases those
 * milestones' gates now carry. Their stated reason — "a request CORE cannot
 * understand must not reach a store, and authentication is a store read" —
 * still holds: a request with no bearer header is refused before any session is
 * read, and a junk credential costs one indexed read that the rate limiter,
 * which still runs first, already bounds. `rate-limit.test.ts` owns that
 * ordering ("attributes an unauthenticated flood to the network").
 *
 * What this file does not claim: that authorization is right. Who may do what
 * is `identity.authorize`, and B-39 and B-40 are still open — `POST
 * /v1/sessions` will mint a token for any principal id, so "authenticated" is
 * today a weaker statement than it reads. Those are recorded, gated by
 * `anonymous-privilege-escalation.test.ts`, and not touched here.
 *
 * **Superseded in one respect, and only additively (milestone 31).** The
 * paragraph above was true when it was written and is kept as written. B-39 and
 * B-40 were answered in the next cycle: issuing a session requires
 * `session.issue`, revoking one requires that it be your own or that you hold
 * `identity.write`, and the census below therefore names four anonymous routes
 * instead of six and 48 required instead of 46. So "authenticated" is no longer
 * the weaker statement that paragraph warns about — a token can now only come
 * from a caller entitled to issue it, or from `npm run bootstrap:credential`,
 * which needs the database rather than an HTTP request. The measurements in this
 * header are the ones taken on the milestone-30 reservation commit and are not
 * restated; `tests/session-issuance-entitlement.test.ts` carries milestone 31's.
 *
 * No database: memory backend, so this gate runs in both CI jobs.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createCoreApp } from "../src/app.js";
import { AUTHENTICATED, anonymous } from "../src/platform/http/authentication.js";
import { FixedClock } from "../src/platform/clock.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { contractPath, runScenario, type Scenario } from "./support/http-scenario.js";
import { readCode, sourceFiles } from "./support/source.js";

const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));
const core = createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit: false });
const registrations = core.router.registrations();

/**
 * The routes entitled to answer without a credential, named rather than counted.
 *
 * **Four, not the six this milestone left.** `POST /v1/sessions` and
 * `POST /v1/sessions/revoke` were anonymous here because B-39 and B-40 were
 * open: requiring a credential on them without deciding who may issue and who
 * may revoke would have changed the refusal without closing the hole. Milestone
 * 31 decided both — `session.issue` to issue, your own session or
 * `identity.write` to revoke — so they are authenticated now, and the count
 * below moves from 46 to 48. The measurements in the header stay as they were
 * taken; nothing above this line is rewritten because a later cycle improved
 * the number.
 */
const ANONYMOUS = [
  "GET /health",
  "GET /ready",
  "GET /metrics",
  "POST /v1/identities",
  "POST /v1/web-session/telegram",
  "POST /v1/web-session/telegram/nonce",
];

const JUNK_ID = "01JZZZZZZZZZZZZZZZZZZZZZZZ";
const JUNK_TOKEN = "not-a-token-anybody-ever-issued";

function label(route: { method: string; template: string }): string {
  return `${route.method} ${contractPath(route.template)}`;
}

/** A concrete URL for a template, with `fill` in every path parameter. */
function concrete(template: string, fill: string): string {
  return template
    .split("/")
    .map((segment) => (segment.startsWith(":") ? fill : segment))
    .join("/");
}

/** Recursively finds a value the scenario really created for a parameter name. */
function findValue(body: unknown, key: string): string | undefined {
  if (Array.isArray(body)) {
    for (const item of body) {
      const found = findValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (body === null || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === "string" && direct !== "") return direct;
  for (const value of Object.values(record)) {
    const found = findValue(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

let scenario: Scenario;
/** Real identifiers, by parameter name, harvested from what the scenario created. */
const real = new Map<string, string>();

beforeAll(async () => {
  scenario = await runScenario();
  for (const route of registrations) {
    for (const segment of route.template.split("/")) {
      if (!segment.startsWith(":")) continue;
      const name = segment.slice(1);
      if (real.has(name)) continue;
      for (const answer of scenario.answers.values()) {
        const found = findValue(answer.body, name);
        if (found !== undefined) {
          real.set(name, found);
          break;
        }
      }
    }
  }
});

async function anonymously(route: { method: string; template: string }, fill: string, body?: unknown) {
  return core.router.handle({
    method: route.method,
    url: concrete(route.template, fill),
    headers: {},
    body: route.method === "GET" ? undefined : (body ?? {}),
  });
}

describe("every route declares whether it needs a credential", () => {
  it("declares one on every registration, and names the anonymous ones", () => {
    // The premise. An empty list, or a declaration CORE invented a default for,
    // would make every loop below pass without asserting anything.
    expect(registrations.length).toBeGreaterThanOrEqual(52);
    for (const route of registrations) {
      expect(route.authentication, label(route)).toBeDefined();
      expect(typeof route.authentication.required, label(route)).toBe("boolean");
    }
    const anonymous = registrations.filter((route) => !route.authentication.required).map(label);
    // By name, not by count: a route added later that quietly declares itself
    // anonymous fails here, which is the whole point of writing the list out.
    expect(anonymous.sort()).toEqual([...ANONYMOUS].sort());
    expect(registrations.filter((route) => route.authentication.required).length).toBe(49);
    // والقنوةُ الجديدةُ (XR-8.5) مجهولةٌ كقائمةِ الهوياتِ: دليلُ الشخصِ يصلُ في
    // الجسمِ لا في الترويسةِ — لكنها دخولٌ لا إنشاءُ محتوى، فأُدرجت في القائمةِ
    // بالاسمِ كما تقتضي قاعدةُ «بلا عددٍ». عدّادُ المصادَقِ عليهِ لا يتغيرُ: 49.
  });

  it("makes every anonymous route say why, in a sentence", () => {
    for (const route of registrations.filter((one) => !one.authentication.required)) {
      const reason = route.authentication.reason;
      expect(reason, label(route)).toBeTruthy();
      // A reason is an argument, not a word. The three probes name the blocker
      // that keeps them anonymous, which is how B-5 stays visible.
      expect(reason!.length, label(route)).toBeGreaterThan(20);
    }
    const reasons = registrations
      .filter((one) => !one.authentication.required)
      .map((one) => one.authentication.reason!)
      .join(" ");
    expect(reasons).toContain("B-5");
    // B-39 and B-40 were answered in milestone 31, so no route may still be
    // anonymous *because of them*. Asserted as an absence rather than deleted:
    // a future cycle that re-opens either route citing a closed blocker fails
    // here instead of quietly reintroducing the reason.
    expect(reasons).not.toContain("B-39");
    expect(reasons).not.toContain("B-40");
  });

  it("refuses a route declared anonymous with an empty reason", () => {
    // The declaration cannot be satisfied by a blank: an exemption without an
    // argument throws at construction, so it cannot be registered at all and
    // no test has to notice it later.
    expect(() => anonymous("")).toThrow();
    expect(() => anonymous("   ")).toThrow();
    expect(anonymous("a scrape target holds no session").required).toBe(false);
    expect(AUTHENTICATED.required).toBe(true);
    // `AUTHENTICATED` needs no argument: requiring a credential is the default
    // a route falls back to, and only the exemption has to be justified.
    expect(AUTHENTICATED.reason).toBeFalsy();
  });
});

describe("the declaration is what the router enforces", () => {
  it("answers 401 on every route that requires a credential, with no credential", async () => {
    const wrong: string[] = [];
    for (const route of registrations.filter((one) => one.authentication.required)) {
      const response = await anonymously(route, JUNK_ID);
      if (response.status !== 401) wrong.push(`${label(route)} → ${response.status}`);
    }
    // The measurement this milestone was reserved for: 28 of these answered
    // 400 and two answered 404 before it.
    expect(wrong).toEqual([]);
  });

  it("answers 401 on every route that requires a credential, with a junk one", async () => {
    const wrong: string[] = [];
    for (const route of registrations.filter((one) => one.authentication.required)) {
      const response = await core.router.handle({
        method: route.method,
        url: concrete(route.template, JUNK_ID),
        headers: { authorization: `Bearer ${JUNK_TOKEN}` },
        body: route.method === "GET" ? undefined : {},
      });
      if (response.status !== 401) wrong.push(`${label(route)} → ${response.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it("does not answer 401 on the routes declared anonymous", async () => {
    const wrong: string[] = [];
    for (const route of registrations.filter((one) => !one.authentication.required)) {
      const response = await anonymously(route, JUNK_ID);
      if (response.status === 401) wrong.push(`${label(route)} → 401`);
    }
    // These six must keep working without a credential: two are how a caller
    // obtains one, and three are how an operator sees whether CORE is alive.
    expect(wrong).toEqual([]);
  });

  it("tells an anonymous caller nothing about which identifiers exist", async () => {
    // The existence oracle, closed. Every parameterised route is driven twice:
    // once with an identifier the scenario really created, once with an
    // invention. The two answers must be indistinguishable.
    const parameterised = registrations.filter(
      (one) => one.authentication.required && one.template.includes(":"),
    );
    expect(parameterised.length).toBeGreaterThanOrEqual(20);
    let compared = 0;
    const oracles: string[] = [];
    for (const route of parameterised) {
      const names = route.template
        .split("/")
        .filter((segment) => segment.startsWith(":"))
        .map((segment) => segment.slice(1));
      const known = names.map((name) => real.get(name)).filter((value) => value !== undefined);
      if (known.length !== names.length) continue; // nothing real to compare against
      const withReal = await core.router.handle({
        method: route.method,
        url: route.template
          .split("/")
          .map((segment) => (segment.startsWith(":") ? real.get(segment.slice(1))! : segment))
          .join("/"),
        headers: {},
        body: route.method === "GET" ? undefined : {},
      });
      const withJunk = await anonymously(route, JUNK_ID);
      compared += 1;
      if (withReal.status !== withJunk.status) {
        oracles.push(`${label(route)}: real ${withReal.status} vs invented ${withJunk.status}`);
      }
      // Correlation ids differ by construction — one per request — so the
      // comparison is of everything else.
      const shape = (body: unknown) =>
        JSON.stringify(body).replace(/"correlation_id":"[^"]*"/g, '"correlation_id":"<per-request>"');
      if (shape(withReal.body) !== shape(withJunk.body)) {
        oracles.push(`${label(route)}: ${shape(withReal.body)} vs ${shape(withJunk.body)}`);
      }
      for (const value of known) {
        if (shape(withReal.body).includes(value!)) {
          oracles.push(`${label(route)} echoed a real identifier`);
        }
      }
    }
    // The premise: the comparison actually ran on the routes that had one,
    // including the two fulfillment reads that were the measured oracle.
    expect(compared).toBeGreaterThanOrEqual(8);
    expect(real.has("fulfillment_id")).toBe(true);
    expect(oracles).toEqual([]);
  });

  it("refuses before it parses the query string or the body", async () => {
    // 401 before 400, on every route that could have answered 400. Driven with
    // an unknown property and an unknown parameter — the two refusals
    // milestones 24 and 25 gate — and the answer must be the credential one.
    const leaks: string[] = [];
    for (const route of registrations.filter((one) => one.authentication.required)) {
      const url = `${concrete(route.template, JUNK_ID)}?not_a_parameter=1`;
      const response = await core.router.handle({
        method: route.method,
        url,
        headers: {},
        body: route.method === "GET" ? undefined : { not_a_property: "x" },
      });
      if (response.status !== 401) leaks.push(`${label(route)} → ${response.status}`);
      const rendered = JSON.stringify(response.body);
      if (rendered.includes("not_a_property") || rendered.includes("not_a_parameter")) {
        leaks.push(`${label(route)} echoed the input`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("answers one refusal, in the documented shape, saying only that", async () => {
    const response = await anonymously({ method: "GET", template: "/v1/notifications" }, JUNK_ID);
    expect(response.status).toBe(401);
    const body = response.body as Record<string, unknown>;
    expect(body["code"]).toBe("unauthenticated");
    expect(body["retryable"]).toBe(false);
    // The message says what is missing and nothing else: no route, no
    // identifier, no property, no hint about what would have happened next.
    expect(String(body["message"]).toLowerCase()).toMatch(/credential|token|authenticat/);
    expect(String(body["message"])).not.toContain("/v1/");
  });

  it("still refuses a flood before it authenticates it", () => {
    // Milestone 25's second argument, kept: authentication is a store read, so
    // it must not be the first thing an unauthenticated flood costs. The
    // limiter runs before it, which `rate-limit.test.ts` drives; here the
    // source order is asserted so a later edit cannot quietly swap them.
    const router = readCode("src/platform/http/router.ts");
    const limit = router.indexOf("rateLimiter");
    const authenticate = router.indexOf("authenticator.authenticate");
    const parseBody = router.indexOf("parseBody(");
    expect(limit).toBeGreaterThan(-1);
    expect(authenticate).toBeGreaterThan(-1);
    expect(parseBody).toBeGreaterThan(-1);
    expect(limit).toBeLessThan(authenticate);
    expect(authenticate).toBeLessThan(parseBody);
  });

  it("lets a real credential through every route it declares", () => {
    // The other direction: a declaration that refused everybody would pass all
    // of the above. The response gate drives all 52 operations with a real
    // token; none of those answers may be a 401.
    const refused = [...scenario.answers.values()].filter((answer) => answer.status === 401);
    expect(refused.map((answer) => answer.label)).toEqual([]);
    expect(scenario.answers.size).toBeGreaterThanOrEqual(52);
  });
});

describe("nothing authenticates anywhere else", () => {
  it("reads the authorization header in three modules, each with a reason", () => {
    // Not one module, and the difference is the point:
    //
    //  - `authentication.ts` turns the header into a credential. It is the only
    //    module that decides what a credential *is*.
    //  - `headers.ts` names it in the canonical header list, which is how a
    //    repeated `authorization` is refused rather than silently narrowed.
    //  - `rate-limit.ts` hashes it to attribute a flood to a caller, and it
    //    runs *before* authentication on purpose: a flood must be cheap to
    //    refuse. It never decides whether the credential is valid.
    //
    // Any fourth reader is a second opinion about what a credential looks like.
    const allowed = new Set([
      "src/platform/http/authentication.ts",
      "src/platform/http/headers.ts",
      "src/platform/http/rate-limit.ts",
    ]);
    const readers: string[] = [];
    for (const file of sourceFiles("src")) {
      const relative = file.replace(/\\/g, "/");
      const source = readCode(file);
      if (/["']authorization["']/.test(source) && !allowed.has(relative)) readers.push(relative);
    }
    expect(readers).toEqual([]);
    // And the three really do still read it: an allowlist nothing matches
    // would pass this case while the header moved somewhere unwatched.
    for (const file of allowed) {
      expect(/["']authorization["']/.test(readCode(file)), file).toBe(true);
    }
  });

  it("keeps authentication out of every handler", () => {
    const callers: string[] = [];
    for (const file of sourceFiles("src")) {
      const relative = file.replace(/\\/g, "/");
      if (!relative.endsWith("http.ts")) continue;
      const source = readCode(file);
      if (source.includes(".authenticate(")) callers.push(relative);
    }
    // A handler that authenticates is a handler that runs before the router
    // decided it should, which is exactly the defect measured above.
    expect(callers).toEqual([]);
  });

  it("requires an authenticator to build a router at all", () => {
    const router = readCode("src/platform/http/router.ts");
    // Not optional, and not defaulted: a router constructed without one would
    // be a router that cannot enforce what its routes declare, and the type
    // system refuses it rather than a test catching it later.
    expect(router).toMatch(/authenticator: Authenticator<A>;/);
    expect(router).not.toMatch(/authenticator\?:/);
  });
});

describe("the contract publishes the refusal", () => {
  it("documents 401 on every route that can answer it, and on no other", () => {
    const contract = readCode("contracts/openapi/core-v1.yaml").split("\n");
    const documented = new Set<string>();
    let path: string | null = null;
    let method: string | null = null;
    for (const line of contract) {
      const pathLine = /^ {2}(\/\S*):\s*$/.exec(line);
      if (pathLine) {
        path = pathLine[1]!;
        method = null;
      }
      const methodLine = /^ {4}([a-z]+):\s*$/.exec(line);
      if (methodLine && path) method = methodLine[1]!;
      if (/^ {8}"401":/.test(line) && path && method) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }
    const required = registrations
      .filter((route) => route.authentication.required)
      .map(label)
      .filter((one) => one.includes("/v1/"));
    const missing = required.filter((one) => !documented.has(one)).sort();
    // استثناءٌ مسمّى واحدٌ: مسارُ دخولِ الويبِ (XR-8.5) مجهولٌ — دليلُ الشخصِ
    // يصلُ في الجسمِ لا في الترويسةِ — لكنَّ رفضَهُ هو نفسُهُ فشلُ المصادقةِ،
    // فالـ401 عليهِ معناهُ الحرفيُّ (الدليلُ مرفوضٌ) لا «كانَ يجبُ أن يُقدَّمَ
    // اعتمادٌ». بلا هذا الاستثناءِ يُجبَرُ العقدُ على إخفاءِ رفضٍ حقيقيٍّ
    // يصلُ المتصلَ في الإنتاجِ — عكسَّ ما وُجدَ هذا البابُ لأجلِهِ.
    const ANONYMOUS_401 = new Set(["POST /v1/web-session/telegram"]);
    const spurious = [...documented]
      .filter((one) => !required.includes(one) && !ANONYMOUS_401.has(one))
      .sort();
    // Measured at 3 of 46 before this milestone. 48 since milestone 31 made the
    // two session routes require a credential. 50 since XR-8.5 added the web
    // login surface, whose 401 is the refused proof, not a missing credential.
    expect(missing).toEqual([]);
    expect(spurious).toEqual([]);
    expect(documented.size).toBe(50);
  });

  it("explains the ordering where a client will read it", () => {
    const contract = readCode("contracts/openapi/core-v1.yaml");
    expect(contract).toContain("Unauthenticated:");
    // The component says the two things a client cannot infer from a status
    // code: that this refusal comes first, and that it is the same answer for
    // an identifier that exists and one that does not.
    expect(contract).toMatch(/before the query string is parsed/);
    expect(contract).toMatch(/invented one alike/);
  });
});
