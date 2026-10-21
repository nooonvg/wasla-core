/**
 * Milestone 34 — a refusal that tells the caller when to come back says so in
 * its body too. Closes B-44.
 *
 * **Measured first**, on `main` at `cdc09ce`, before a line of this was
 * written: every refusal CORE can produce, swept by driving all 52
 * registrations anonymously, driving all 52 again with a credential and a body
 * they reject, and racing the five-way concurrent keyed write from milestone
 * 33. **105 refusals.** 53 `invalid_request` and 48 `unauthenticated`, all
 * `retryable: false` with no `retry-after` — the flag and the header agree.
 * **4 `conflict`, all carrying `retry-after: 1` while reporting
 * `retryable: false`**, and those four were the only contradictions in the
 * sweep. Against `rate_limited`, which gets it right, the rule CORE already
 * followed everywhere else was plain:
 *
 *     a refusal carries `retry-after` if and only if its body says
 *     `retryable: true`
 *
 * The cause was structural. `retryable` came from a set of error codes in
 * `errors.ts`; `retry-after` was written by hand in two unrelated places
 * (`rateLimitHeaders` and a `IN_FLIGHT_HEADERS` constant in `retry.ts`). Two
 * independent statements about one fact, and nothing made them agree.
 *
 * What this gate holds, on both backends:
 *
 *  1. **The biconditional, over the whole surface.** Every refusal reachable
 *     from every registration: `retry-after` present ⇔ `retryable: true`.
 *
 *     Its limit, measured rather than assumed and reported in
 *     `docs/refusal-retryability.md`: this case **does not catch B-44 being
 *     restored**. Every refusal the sweep reaches is `invalid_request` or
 *     `unauthenticated`, neither of which states a time, so the biconditional
 *     holds vacuously however `retryable` is derived. It is a guard against a
 *     refusal added *later* with a time and a stale flag — which is how B-44
 *     would come back — and it is not what proves today's behaviour. The cases
 *     below are.
 *  2. **The four refusals that were wrong are right**, named rather than
 *     counted: an in-flight twin is `409`, `retryable: true`, `retry-after: 1`.
 *  3. **The refusals that were right are unchanged**: a reuse is `409`,
 *     `retryable: false`, no header; a rate-limited caller is `429`,
 *     `retryable: true`, and its `retry-after` still matches the window and
 *     still agrees with `details.retry_after_ms`.
 *  4. **One field, not two.** `CoreError` renders both from
 *     `retryAfterSeconds`, refuses a time that is not a whole second of at
 *     least one, and leaves a code-retryable refusal (`unavailable`,
 *     `internal`) retryable without inventing a time for it.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CoreError, conflict, invalid } from "../src/platform/errors.js";
import { FixedClock } from "../src/platform/clock.js";
import { createCoreApp } from "../src/app.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import {
  rateLimited,
  rateLimitHeaders,
  retryAfterSeconds,
  type RateLimitPolicy,
} from "../src/platform/http/rate-limit.js";
import { IN_FLIGHT_RETRY_AFTER_SECONDS } from "../src/platform/http/retry.js";
import { runScenario } from "./support/http-scenario.js";
import { ORGANIZATION, retryHarnesses, type Ground } from "./support/retry-harness.js";

interface Refusal {
  readonly how: string;
  readonly where: string;
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfter: string | undefined;
}

const A_UUID = "00000000-0000-4000-8000-000000000000";

function refusal(how: string, where: string, res: { status: number; body: unknown; headers?: Record<string, string> }): Refusal {
  const body = res.body as { code?: string; retryable?: boolean };
  return {
    how,
    where,
    status: res.status,
    code: String(body?.code),
    retryable: body?.retryable === true,
    retryAfter: res.headers?.["retry-after"],
  };
}

/** Every refusal the published surface can be made to produce, in one pass. */
async function sweep(): Promise<Refusal[]> {
  const scenario = await runScenario();
  const router = scenario.core.router;
  const found: Refusal[] = [];
  for (const registration of router.registrations()) {
    const url = registration.template
      .split("/")
      .map((segment) => (segment.startsWith(":") ? A_UUID : segment))
      .join("/");
    const where = `${registration.method} ${registration.template}`;
    // Anonymously: reaches the authentication refusal on 46 routes and the
    // body refusal on the 6 anonymous ones.
    const anonymous = await router.handle({
      method: registration.method,
      url,
      headers: { "x-correlation-id": "refusal-sweep" },
      body: registration.method === "GET" ? undefined : {},
    });
    if (anonymous.status >= 400) found.push(refusal("anonymous", where, anonymous));
    // With a credential and a body the route rejects: reaches the request
    // refusals behind authentication.
    const malformed = await router.handle({
      method: registration.method,
      url,
      headers: {
        authorization: `Bearer ${scenario.token}`,
        "x-correlation-id": "refusal-sweep",
        "idempotency-key": `refusal-sweep-${where}`,
      },
      body: registration.method === "GET" ? undefined : { nonsense: true },
    });
    if (malformed.status >= 400) found.push(refusal("authenticated, malformed", where, malformed));
  }
  return found;
}

describe("a refusal states its retry time once", () => {
  it("carries retry-after exactly when its body says retryable, across the whole surface", async () => {
    const found = await sweep();
    // The sweep has to actually reach refusals, or the biconditional below is
    // satisfied by an empty list. 105 when this was measured; asserted as a
    // floor so that adding routes does not fail the gate for the wrong reason.
    expect(found.length).toBeGreaterThanOrEqual(100);

    const contradictions = found.filter(
      (r) => (r.retryAfter !== undefined) !== (r.retryable),
    );
    expect(
      contradictions,
      `a refusal's retry-after and its body's retryable disagree: ${JSON.stringify(contradictions.slice(0, 5))}`,
    ).toEqual([]);

    // And what the sweep found is what B-44 said it would, minus the defect:
    // the two unretryable codes, neither with a time.
    const codes = [...new Set(found.map((r) => r.code))].sort();
    expect(codes).toEqual(["invalid_request", "unauthenticated"]);
    expect(found.every((r) => !r.retryable && r.retryAfter === undefined)).toBe(true);
  }, 60_000);

  it("refuses a retry time that is not a whole second of at least one", () => {
    // Refused at construction, the way `anonymous("")` is: by the time a `0`
    // reaches the header registry the error exists and something downstream
    // has to decide what to do with a refusal it cannot render.
    for (const bad of [0, -1, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new CoreError("conflict", "no", {}, bad), `retry-after ${bad}`).toThrow(
        /whole number of seconds/,
      );
    }
    expect(new CoreError("conflict", "yes", {}, 1).retryAfterSeconds).toBe(1);
    expect(new CoreError("conflict", "yes", {}, 3600).retryAfterSeconds).toBe(3600);
  });

  it("renders the flag and the header from one field", () => {
    const timed = conflict("a twin holds the key", { claimed_at: "now" }, 1);
    expect(timed.retryable).toBe(true);
    expect(timed.headers).toEqual({ "retry-after": "1" });
    expect(timed.toBody("c")).toMatchObject({ code: "conflict", retryable: true });

    // The same code without a time is unchanged, which is the whole point of
    // an override rather than a reclassification: `conflict` still means "the
    // state moved" and still reports false.
    const untimed = conflict("the key is spent");
    expect(untimed.retryable).toBe(false);
    expect(untimed.headers).toEqual({});

    // A code-retryable refusal stays retryable without a time being invented
    // for it: CORE does not know when its dependency will be well.
    for (const code of ["unavailable", "internal"] as const) {
      const error = new CoreError(code, "unwell");
      expect(error.retryable, code).toBe(true);
      expect(error.headers, code).toEqual({});
    }
    // And a plain refusal is neither.
    expect(invalid("wrong").retryable).toBe(false);
    expect(invalid("wrong").headers).toEqual({});
  });

  it("keeps the rate-limited refusal's header and its published detail in step", () => {
    const decision = {
      allowed: false as const,
      limit: 3,
      remaining: 0 as const,
      reset_at: new Date("2026-06-01T00:01:00.000Z"),
      retry_after_ms: 2_400,
    };
    const error = rateLimited(decision);
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    // Rounded up, never below one second, and the same duration the published
    // detail states — two precisions of one measured value, both from this
    // decision.
    expect(error.headers).toEqual({ "retry-after": "3" });
    expect(error.details).toMatchObject({ retry_after_ms: 2_400 });
    expect(retryAfterSeconds(1)).toBe(1);
    expect(retryAfterSeconds(0)).toBe(1);

    // The budget headers no longer carry the retry time: it would be a second
    // place to get it wrong, which is what B-44 was.
    expect(rateLimitHeaders(decision)).toEqual({
      "x-ratelimit-limit": "3",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.ceil(decision.reset_at.getTime() / 1000)),
    });
  });

  it("answers a rate-limited caller with a header and a flag that agree", async () => {
    const policy: RateLimitPolicy = {
      windowMs: 60_000,
      limits: { ingress_events: 3, write: 3, read: 2, unmatched: 2 },
    };
    const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));
    const core = createCoreApp({
      persistence: memoryPersistence(clock),
      clock,
      rateLimitPolicy: policy,
    });
    let refused: Awaited<ReturnType<typeof core.router.handle>> | null = null;
    for (let attempt = 0; attempt < 10 && refused === null; attempt += 1) {
      const res = await core.router.handle({
        method: "GET",
        url: "/v1/organizations",
        headers: { "x-correlation-id": `limit-${attempt}` },
      });
      if (res.status === 429) refused = res;
    }
    expect(refused, "the tight policy never refused a read").not.toBeNull();
    expect(refused!.body).toMatchObject({ code: "rate_limited", retryable: true });
    const header = Number(refused!.headers?.["retry-after"]);
    expect(Number.isInteger(header)).toBe(true);
    expect(header).toBeGreaterThanOrEqual(1);
    // The header and the published detail describe the same wait.
    const ms = (refused!.body as { details: { retry_after_ms: number } }).details.retry_after_ms;
    expect(header).toBe(retryAfterSeconds(ms));
  });
});

/**
 * Races five identical keyed writes, on a fresh key each round, until one twin
 * is refused as in-flight — at most `RACE_ROUNDS` rounds.
 *
 * Why not one round. On PostgreSQL the five requests share a pool of four and
 * whether any twin overlaps the winner's claim is an interleaving, not a
 * guarantee: measured on CI on 2026-10-21 (run 39610388438, `e1e8484`, a change
 * that touched nothing here), all five serialised once and the gate failed with
 * zero `409`s while the identical run beside it passed. A single round made the
 * gate measure the scheduler. Racing again changes nothing the cases assert —
 * every in-flight answer is still a real twin losing a real race — it only
 * stops one quiet round from being read as a defect. Twenty rounds of none would
 * still fail, and would be worth reading.
 */
const RACE_ROUNDS = 20;
type Answer = Awaited<ReturnType<Ground["post"]>>;
async function raceUntilATwinLoses(app: Ground): Promise<{ answers: Answer[]; key: string }> {
  let last: { answers: Answer[]; key: string } | undefined;
  for (let round = 0; round < RACE_ROUNDS; round += 1) {
    const key = randomUUID();
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => app.post("/v1/organizations", ORGANIZATION, key)),
    );
    last = { answers, key };
    if (answers.some((a) => a.status === 409)) return last;
  }
  return last!;
}

describe.each(retryHarnesses(process.env.DATABASE_URL))(
  "the four refusals B-44 was about, on '$name'",
  (harness) => {
    it("answers an in-flight twin retryable, with the time it stated", async () => {
      const app = await harness.make();
      const { answers } = await raceUntilATwinLoses(app);
      const inFlight = answers.filter((a) => a.status === 409);
      // Not asserted to be four: how many twins lose is an interleaving, and a
      // gate that fixed the number would measure the machine. At least one, and
      // every one of them right, is the claim.
      expect(inFlight.length).toBeGreaterThanOrEqual(1);
      for (const answer of inFlight) {
        expect(answer.body).toMatchObject({ code: "conflict", retryable: true });
        expect(answer.headers?.["retry-after"]).toBe(String(IN_FLIGHT_RETRY_AFTER_SECONDS));
        // Still the in-flight refusal and not the reuse: the claim time is
        // what tells the caller its own twin raced it.
        expect((answer.body as { details: Record<string, unknown> }).details).toHaveProperty(
          "claimed_at",
        );
      }
    });

    it("leaves a reuse refusal unretryable and untimed", async () => {
      const app = await harness.make();
      const key = randomUUID();
      const first = await app.post("/v1/organizations", ORGANIZATION, key);
      expect(first.status).toBe(201);
      // A different body under a spent key never comes good on its own, so it
      // states no time and reports no retryability — the distinction this
      // milestone had to preserve while fixing the case next to it.
      const reused = await app.post(
        "/v1/organizations",
        { ...ORGANIZATION, name: "A Different Org" },
        key,
      );
      expect(reused.status).toBe(409);
      expect(reused.body).toMatchObject({ code: "conflict", retryable: false });
      expect(reused.headers?.["retry-after"]).toBeUndefined();
    });

    it("comes good by itself, which is what retryable: true promised", async () => {
      const app = await harness.make();
      const { answers, key } = await raceUntilATwinLoses(app);
      const refusedTwin = answers.find((a) => a.status === 409);
      expect(refusedTwin).toBeDefined();
      // The flag is a claim about the world, not a label: obeying it has to
      // work. The winner has completed by now, so the identical request the
      // refusal told it to resend is answered rather than refused again.
      const resent = await app.post("/v1/organizations", ORGANIZATION, key);
      expect(resent.status).toBe(201);
      expect(resent.headers?.["idempotent-replay"]).toBe("true");
    });
  },
);
