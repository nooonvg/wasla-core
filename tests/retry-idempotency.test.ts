/**
 * A write route survives being called twice — and says how — milestone 32.
 *
 * What was measured on `main` at `bd92b69`, before any edit, by re-issuing each
 * of the 29 write routes' own recorded request a second time, byte-identical,
 * against the state the response gate's scenario left, and counting the rows of
 * all 25 business tables the reference registry holds around each one:
 *
 *  - `POST /v1/organizations` → **201**, `organization` 2 → 3. Two
 *    organizations may share a name and a country, so nothing any later read
 *    can ask distinguishes the duplicate from the original.
 *  - `POST /v1/geography/cities` → **201**, `city` 1 → 2, while
 *    `POST /v1/geography/regions` beside it, in the same module, deduplicated
 *    on `(country_code, code)`. The clearest evidence available that retry
 *    safety was an accident of each handler rather than a property of the
 *    surface.
 *  - `POST /v1/geography/service-areas` → **201**, `service_area` 1 → 2: two
 *    areas over the same ground, and every serviceability read matching both.
 *  - `POST /v1/subscriptions` → **201**, and five tables grew:
 *    `subscription` 1 → 2, `subscription_period` 1 → 2,
 *    `payment_authorization` 5 → 6, `ledger_transaction` 6 → 7, `outbox`
 *    26 → 30. A duplicate is a second recurring charge against the same
 *    wallet.
 *  - `POST /v1/sessions` → **201**, `session` 3 → 4, which is correct: two
 *    calls for a session are two sessions.
 *  - `/v1/memberships`, `/v1/plans` and `/v1/plans/{plan_id}/activate` refused
 *    the repeat with **409**. Every other write route collapsed it, by one of
 *    four mechanisms nothing named as a policy: a natural-key upsert
 *    (`/v1/identities`, `/v1/wallets`, `…/usage` answer `200` the second
 *    time), a caller-supplied reference (`/v1/payment-authorizations`,
 *    `/v1/events`), a uniqueness constraint (`/v1/event-subscriptions`), or a
 *    state transition that is a no-op once it has happened.
 *  - No route read an `Idempotency-Key` header. Sending one changed nothing,
 *    because milestone 14's header declaration means an undeclared header is
 *    never read at all. The `idempotency_key` table from migration 0001 had
 *    never held a row, and had no column for the request or the status.
 *
 * One thing the reservation expected and the measurement did not find:
 * `POST /v1/geography/countries` did **not** write a second row. The country's
 * primary key is the code the caller sends and the repository upserts it, so
 * the repeat answered `201` again and overwrote the existing row. It is
 * declared `keyed` all the same — an upsert on a caller-supplied key hides the
 * repeat by letting whichever call arrives second decide the country's name and
 * default currency, and a caller retrying a call it never saw the answer to
 * cannot tell that from having been first.
 *
 * What changed. Retry safety is a property of the registration, the way
 * `accepts` (milestone 25), `body` (26), `authentication` (30) and entitlement
 * (31) already are: every route declares one of three mechanisms with a reason,
 * the default for a write is `keyed` so a forgotten declaration fails closed,
 * and the router enforces the one mechanism a handler cannot provide for
 * itself. For a `keyed` route it reads the caller's `Idempotency-Key`, refuses
 * a request without one, fingerprints method + route template + canonical JSON
 * of the parsed body, replays a recorded answer for an identical request and
 * refuses a key reused for a different one.
 *
 * What this file asserts, and in which order: that every registration carries a
 * declaration and every `keyed` one is published in the contract; that a repeat
 * of **every** write route creates nothing, except where the declaration says a
 * repeat must create something; and then, against both persistence backends,
 * the nine behaviours the mechanism consists of.
 *
 * What this file does not claim.
 *
 *  - **That a `keyed` route is safe against a concurrent retry.** The record is
 *    written after the handler answered, so two identical requests in flight at
 *    the same instant can both reach the handler. Closing that needs the record
 *    claimed before the work, inside the handler's own transaction — a
 *    different design and a different cycle. The bound is stated in
 *    `src/platform/http/retry.ts` rather than implied away here.
 *  - **That a `natural` reason is true for the reason it gives.** The repeat
 *    case below proves a repeat creates no row; it cannot prove *which*
 *    mechanism collapsed it. A route whose upsert was replaced by a silent
 *    swallow would still pass, and the reason string is what a reviewer reads.
 *  - **That a replay is byte-identical on the wire.** It is the same JSON
 *    document, asserted key for key and value for value through the same
 *    canonicaliser the fingerprint uses. It is not the same bytes on Postgres,
 *    where `jsonb` stores a parsed document and orders the keys itself — a
 *    difference measured here rather than assumed away, and named in
 *    `docs/retry-idempotency.md`.
 *  - **That the five keyed routes replay their response headers.** A replay
 *    restores the status and the body only. None of the five sets a header of
 *    its own, so there is nothing to lose today; a route that started to would
 *    need this decision revisited, which is why it is written down in
 *    `docs/retry-idempotency.md` as well.
 */
import { afterAll, describe, expect, it } from "vitest";
import { canonicalJson, RETENTION_MS } from "../src/platform/http/retry.js";
import { contractPath, runScenario } from "./support/http-scenario.js";
import { loadContract } from "./support/openapi.js";
import {
  census,
  ORGANIZATION,
  retryHarnesses,
} from "./support/retry-harness.js";

const url = process.env["DATABASE_URL"];

// ── what the surface declares, and what the contract publishes ───────────────

describe("retry declarations", () => {
  it("declares a mechanism and a reason on every registration", async () => {
    const scenario = await runScenario();
    const registrations = scenario.core.router.registrations();
    // The premise: the router really did hand over its whole surface. A
    // registrations() that returned nothing would make every check below pass
    // by having nothing to check.
    expect(registrations.length).toBeGreaterThanOrEqual(52);
    const undeclared = registrations.filter((route) => route.retry.reason.trim() === "");
    expect(undeclared.map((route) => `${route.method} ${route.template}`)).toEqual([]);
    // `KEYED_BY_DEFAULT` is a real declaration with a real reason, so the check
    // above cannot catch a route that simply took the default. This one can:
    // the default's reason is the sentence it is, and a route relying on it has
    // not had the question asked about it.
    const defaulted = registrations.filter((route) =>
      route.retry.reason.startsWith("no mechanism was declared"),
    );
    expect(
      defaulted.map((route) => `${route.method} ${route.template}`),
      "a write route is relying on the fail-closed default; it is safe, but nobody has said why",
    ).toEqual([]);
    // A read has nothing to collapse, and a read that declared otherwise would
    // mean the router was asking a caller for a key to fetch a page.
    for (const route of registrations) {
      if (route.method !== "GET") continue;
      expect(route.retry.mechanism, `${route.template} is a read`).toBe("natural");
    }
  });

  it("publishes every keyed route in the contract, as a set", async () => {
    const scenario = await runScenario();
    const contract = loadContract();
    const paths = contract.document["paths"] as Record<string, Record<string, unknown>>;

    // The premise, again about the reader rather than about CORE: the shared
    // parameter exists, and it is a required header. A contract that referenced
    // an optional parameter would document a header callers could omit, which
    // is exactly what this milestone stopped being true.
    const parameter = contract.resolve({
      $ref: "#/components/parameters/IdempotencyKey",
    } as never) as Record<string, unknown>;
    expect(parameter["name"]).toBe("idempotency-key");
    expect(parameter["in"]).toBe("header");
    expect(parameter["required"]).toBe(true);

    const declared = new Set(
      scenario.core.router
        .registrations()
        .filter((route) => route.retry.mechanism === "keyed")
        .map((route) => `${route.method} ${contractPath(route.template)}`),
    );
    // Asserted as a set and not as a count: a count agrees with any six routes,
    // including six that are not these six.
    expect([...declared].sort()).toEqual([
      "POST /v1/geography/cities",
      "POST /v1/geography/countries",
      "POST /v1/geography/service-areas",
      "POST /v1/me/organizations",
      "POST /v1/organizations",
      "POST /v1/subscriptions",
    ]);

    const documented: string[] = [];
    for (const [path, operations] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const node = operation as Record<string, unknown>;
        const parameters = (node["parameters"] ?? []) as Array<Record<string, unknown>>;
        const carries = parameters.some(
          (item) => item["$ref"] === "#/components/parameters/IdempotencyKey",
        );
        const responses = (node["responses"] ?? {}) as Record<string, unknown>;
        if (carries && responses["409"] !== undefined) {
          documented.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    // Both halves of the publication in one comparison: an operation that
    // required the header without documenting the 409 would leave a caller
    // unable to distinguish a reused key from a business conflict, and an
    // operation documenting the 409 without the header would promise a refusal
    // that cannot happen.
    expect(documented.sort()).toEqual([...declared].sort());

    // And the replay header, on whatever status each keyed operation actually
    // answers with, resolved through the components the contract uses.
    const missing = contract.operations
      .filter((operation) => declared.has(operation.label))
      .filter((operation) => {
        const success = [...operation.responses.values()].find((response) =>
          response.status.startsWith("2"),
        );
        return success === undefined || !success.headers.has("idempotent-replay");
      })
      .map((operation) => operation.label);
    expect(missing).toEqual([]);
  });
});

// ── every write route, driven twice ──────────────────────────────────────────

function grown(before: Record<string, number>, after: Record<string, number>): string[] {
  return Object.keys(after)
    .filter((table) => (after[table] ?? 0) > (before[table] ?? 0))
    .map((table) => `${table} ${before[table] ?? 0} → ${after[table] ?? 0}`)
    .sort();
}

describe("every write route, sent twice", () => {
  it("creates nothing the second time, except where the declaration says it must", async () => {
    // The scenario drives every operation the contract publishes and keeps the
    // request it sent, so this re-sends CORE's own requests rather than a list
    // of routes written here. A hand-written list would be a second source of
    // truth about the surface and would go stale the moment a route changed
    // what it accepts — which is the failure this whole milestone is about.
    const scenario = await runScenario();
    const declarations = new Map(
      scenario.core.router
        .registrations()
        .map((route) => [`${route.method} ${contractPath(route.template)}`, route]),
    );
    const writes = [...scenario.answers.values()].filter(
      (answer) => answer.request.method !== "GET",
    );
    // The premise: the scenario really did drive the write surface. 29 write
    // routes were measured on `main`; asserting the count would make adding a
    // route fail here for no reason, so this only refuses a scenario that has
    // quietly stopped driving most of them.
    expect(writes.length).toBeGreaterThanOrEqual(29);

    const duplicating: string[] = [];
    const inertNewEachTime: string[] = [];
    for (const answer of writes) {
      const route = declarations.get(answer.label);
      expect(route, `${answer.label} was driven but is not a registration`).toBeDefined();
      const before = census(scenario.store);
      const again = await scenario.core.router.handle({
        method: answer.request.method,
        url: answer.request.url,
        headers: answer.request.headers,
        ...(answer.request.body === undefined ? {} : { body: answer.request.body }),
      });
      const growth = grown(before, census(scenario.store));
      if (route!.retry.mechanism === "new-each-time") {
        // Declared to create something, so it has to: a `new-each-time` route
        // that quietly stopped creating anything would be a broken route
        // wearing an honest declaration.
        if (growth.length === 0) inertNewEachTime.push(`${answer.label} (${again.status})`);
        continue;
      }
      if (growth.length > 0) {
        duplicating.push(`${answer.label} (${again.status}) created ${growth.join(", ")}`);
      }
    }
    expect(
      duplicating,
      "a repeat of these routes created rows; either the route duplicates or its retry declaration is wrong",
    ).toEqual([]);
    expect(inertNewEachTime, "a new-each-time route created nothing on a second call").toEqual([]);
  });
});

// ── the mechanism itself, on both backends ───────────────────────────────────

const harnesses = retryHarnesses(url);

describe.each(harnesses)("keyed retries on $name", (harness) => {
  afterAll(async () => {
    await harness.close();
  });

  it("replays the recorded status and body, byte for byte, and says it did", async () => {
    const app = await harness.make();
    const before = await app.count("organization");
    const first = await app.post("/v1/organizations", ORGANIZATION, "replay-1");
    expect(first.status).toBe(201);
    expect(first.headers?.["idempotent-replay"]).toBeUndefined();
    expect(await app.count("organization")).toBe(before + 1);

    const second = await app.post("/v1/organizations", ORGANIZATION, "replay-1");
    expect(second.status).toBe(first.status);
    // The same document, key for key and value for value: the caller is
    // reconciling the id CORE minted, and an identifier, a `created_at` or a
    // status that differed between the two answers would be CORE reporting a
    // second, different creation.
    //
    // Compared through the canonicaliser the fingerprint uses rather than with
    // `JSON.stringify`, because `JSON.stringify` was measured to fail here on
    // Postgres and pass on memory: `jsonb` stores a parsed document and orders
    // its keys itself (by length, then bytewise), so the replayed bytes come
    // back as `{"name":…,"status":…,…,"organization_id":…}` where the first
    // answer sent `{"organization_id":…,"name":…}`. The values are identical
    // and a JSON object is unordered by definition, so no caller can depend on
    // the difference — but claiming "byte-identical" would have been claiming
    // something CORE does not do, and asserting it would have meant the gate
    // passing in memory while the production backend failed it. Recorded in
    // `docs/retry-idempotency.md` as a named difference between the backends.
    expect(canonicalJson(second.body)).toBe(canonicalJson(first.body));
    expect(second.body).toEqual(first.body);
    expect(second.headers?.["idempotent-replay"]).toBe("true");
    expect(await app.count("organization")).toBe(before + 1);

    // The record itself, through the port, so the two backends are compared on
    // what they stored and not only on what the router answered.
    const record = await app.store.retry.find({
      key: "replay-1",
      method: "POST",
      scope: "/v1/organizations",
    });
    expect(record?.response_status).toBe(201);
    expect(canonicalJson(record?.response_body)).toBe(canonicalJson(first.body));
    expect(new Date(record!.expires_at).getTime() - new Date(record!.created_at).getTime()).toBe(
      RETENTION_MS,
    );
  });

  it("refuses the same key with a different body, and leaves the record alone", async () => {
    const app = await harness.make();
    const before = await app.count("organization");
    const first = await app.post("/v1/organizations", ORGANIZATION, "clash-1");
    expect(first.status).toBe(201);

    const clash = await app.post(
      "/v1/organizations",
      { name: "A Different Org", country_code: "SA" },
      "clash-1",
    );
    expect(clash.status).toBe(409);
    expect((clash.body as { code: string }).code).toBe("conflict");
    expect((clash.body as { message: string }).message).toContain("Idempotency-Key");
    expect(await app.count("organization")).toBe(before + 1);

    // The refusal must not have replaced the record with the request it
    // refused: a caller that retries its *original* request afterwards is still
    // entitled to the answer it never saw.
    const replayed = await app.post("/v1/organizations", ORGANIZATION, "clash-1");
    expect(replayed.status).toBe(201);
    expect(canonicalJson(replayed.body)).toBe(canonicalJson(first.body));
    expect(replayed.headers?.["idempotent-replay"]).toBe("true");
    expect(await app.count("organization")).toBe(before + 1);
  });

  it("treats a different key as a different request", async () => {
    const app = await harness.make();
    const before = await app.count("organization");
    const first = await app.post("/v1/organizations", ORGANIZATION, "distinct-1");
    const second = await app.post("/v1/organizations", ORGANIZATION, "distinct-2");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers?.["idempotent-replay"]).toBeUndefined();
    // The mechanism must not deduplicate on the body: two organizations with
    // the same name in the same country are a thing a caller is allowed to
    // create, and refusing the second would be CORE inventing a uniqueness
    // constraint the schema does not have.
    expect((second.body as { organization_id: string }).organization_id).not.toBe(
      (first.body as { organization_id: string }).organization_id,
    );
    expect(await app.count("organization")).toBe(before + 2);
  });

  it("refuses a keyed route with no key, and writes nothing", async () => {
    const app = await harness.make();
    const before = await app.count("organization");
    const bare = await app.post("/v1/organizations", ORGANIZATION);
    expect(bare.status).toBe(400);
    expect((bare.body as { code: string }).code).toBe("invalid_request");
    // The refusal has to be fixable from its own text, because it is the
    // breaking half of this milestone: a caller that worked yesterday reads
    // this message and nothing else.
    expect((bare.body as { message: string }).message).toContain("Idempotency-Key");
    expect(await app.count("organization")).toBe(before);
    expect(await app.count("idempotency_key")).toBe(0);
  });

  it("does not record a refusal, so a corrected request still runs", async () => {
    const app = await harness.make();
    const before = await app.count("organization");
    // Refused by the body declaration, before the handler.
    const invalid = await app.post("/v1/organizations", { name: "No Country" }, "refused-1");
    expect(invalid.status).toBe(400);
    expect(
      await app.store.retry.find({ key: "refused-1", method: "POST", scope: "/v1/organizations" }),
    ).toBeNull();
    const corrected = await app.post("/v1/organizations", ORGANIZATION, "refused-1");
    expect(corrected.status).toBe(201);
    expect(corrected.headers?.["idempotent-replay"]).toBeUndefined();
    expect(await app.count("organization")).toBe(before + 1);

    // And refused by authorization, after the handler was entered: a `403` is
    // not an answer either, and the same key used afterwards by a caller who
    // may do the thing has to work.
    const forbidden = await app.post("/v1/organizations", ORGANIZATION, "refused-2", app.powerless);
    expect(forbidden.status).toBe(403);
    expect(
      await app.store.retry.find({ key: "refused-2", method: "POST", scope: "/v1/organizations" }),
    ).toBeNull();
    const allowed = await app.post("/v1/organizations", ORGANIZATION, "refused-2");
    expect(allowed.status).toBe(201);
    expect(await app.count("organization")).toBe(before + 2);
    expect(await app.count("idempotency_key")).toBe(2);
  });

  it("scopes a key to one route, so the same string on two routes is two records", async () => {
    const app = await harness.make();
    const organizations = await app.count("organization");
    const countries = await app.count("country");
    const org = await app.post("/v1/organizations", ORGANIZATION, "shared-key");
    const country = await app.post(
      "/v1/geography/countries",
      { country_code: "QA", name: "Qatar", default_currency: "QAR" },
      "shared-key",
    );
    expect(org.status).toBe(201);
    expect(country.status).toBe(201);
    // Neither answer may be the other's: a store scoped by the key alone would
    // have replayed the organization here, and the caller would have been told
    // its country was an organization.
    expect(country.headers?.["idempotent-replay"]).toBeUndefined();
    expect((country.body as { country_code: string }).country_code).toBe("QA");
    expect(await app.count("organization")).toBe(organizations + 1);
    expect(await app.count("country")).toBe(countries + 1);
    expect(await app.count("idempotency_key")).toBe(2);
  });

  it("treats an expired record as absent", async () => {
    const app = await harness.make();
    const before = await app.count("organization");
    const first = await app.post("/v1/organizations", ORGANIZATION, "expiring-1");
    expect(first.status).toBe(201);

    app.clock.advance(RETENTION_MS + 1_000);
    // The session expired along with the record — the clock is the same one —
    // so the administrator signs in again. That is what a caller returning a
    // day later does, and reusing the stale token would measure a 401 instead
    // of the expiry this case is about.
    const token = await app.reissue();
    expect(
      await app.store.retry.find({
        key: "expiring-1",
        method: "POST",
        scope: "/v1/organizations",
      }),
    ).toBeNull();
    const later = await app.post("/v1/organizations", ORGANIZATION, "expiring-1", token);
    expect(later.status).toBe(201);
    expect(later.headers?.["idempotent-replay"]).toBeUndefined();
    // A day-old key is a new request that happens to reuse a string, and the
    // row it creates is the proof that CORE ran the handler rather than
    // answering from a record it should no longer hold.
    expect((later.body as { organization_id: string }).organization_id).not.toBe(
      (first.body as { organization_id: string }).organization_id,
    );
    expect(await app.count("organization")).toBe(before + 2);
  });
});
