/**
 * Every write route accepts only the body it declares — milestone 25.
 *
 * Milestone 24 closed the query string and said in its own record that the body
 * was the other half and was still open. Measuring it before reserving this
 * milestone turned that from a symmetry argument into a money defect:
 *
 *   POST /v1/payment-authorizations/<id>/capture  {"amountMinor": 500, ...}
 *   → 200, captured 5000
 *
 * An absent `amount_minor` means "capture the whole remaining hold", which is the
 * right meaning for absence, so one camelCase spelling took ten times what the
 * caller asked for and the response said success. `refund` has the same shape.
 * `POST /v1/wallets` accepted `nonsense` and `CURRENCY` beside `currency` and
 * answered 201. Every write route hand-parsed `ctx.body as Record<string,
 * unknown>` with helpers duplicated across seven files, and not one refused a
 * property it did not read.
 *
 * The fix is structural, as in milestone 24: `router.post` takes what the route
 * accepts as its second argument, the router parses the body before the handler
 * runs, and `RequestContext` carries **no raw body at all** — only the parsed
 * `Body`. So a handler cannot read an undeclared property and an undeclared
 * property cannot reach a handler.
 *
 * This file is the gate on that structure, driven off `router.registrations()`
 * rather than a list maintained here:
 *
 *  1. **Every write route refuses an unknown property**, 400, naming it — before
 *     authentication, so the refusal cannot be confused with a permission answer.
 *  2. **A route that declares no body refuses every property**, and still accepts
 *     an absent body and `{}`, which ask for nothing.
 *  3. **Every declared field is live**: a wrong-typed value for it is refused by
 *     name, which is only true if the declaration is what the parse reads.
 *  4. **Declared and read agree**: a field declared and never read is a name the
 *     route advertises and ignores, the same lie from the other end.
 *  5. **The declarations are well formed**, and the one opaque body is the event
 *     envelope, named here so a second cannot appear quietly.
 *  6. **No handler reads a body any other way**: `ctx.body` is gone and the
 *     hand-rolled readers are deleted, measured in the source.
 *  7. **The contract agrees**: every documented request-body property is declared
 *     and every declared property is documented.
 *  8. **The capture and refund defects are refused**, by their real request shapes.
 *
 * No database: none of this depends on a store, so it runs in both CI jobs.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createCoreApp } from "../src/app.js";
import { memoryPersistence } from "../src/platform/persistence/backends.js";
import { FixedClock } from "../src/platform/clock.js";
import { Body, parseBody, type BodySpec, type FieldSpec } from "../src/platform/http/body.js";
import { calls, readCode, sourceFiles } from "./support/source.js";
import { anonymousCredential } from "./support/credential.js";

const clock = new FixedClock(new Date("2026-06-01T00:00:00.000Z"));
const core = createCoreApp({ clock, persistence: memoryPersistence(clock), rateLimit: false });
const registrations = core.router.registrations();
const writes = registrations.filter((route) => route.method !== "GET");

/** A property name nothing can plausibly declare. */
const UNKNOWN = "__unexpected_property";

/** The one route entitled to a body CORE does not decompose. */
const OPAQUE_ROUTES = ["POST /v1/events"];

/** A concrete path for a template, so the router matches before it parses. */
function concrete(template: string): string {
  return template
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "00000000-0000-4000-8000-000000000001" : segment))
    .join("/");
}

/** A value the field must accept, for probing a *different* property. */
function validValue(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case "enum":
      return spec.values[0]!;
    case "enum_list":
      return [spec.values[0]!];
    case "integer":
    case "nullable_integer":
      return 1;
    case "number":
      return 1;
    case "list":
      return [Object.fromEntries(spec.items.map((item) => [item.name, validValue(item)]))];
    default:
      return "probe";
  }
}

/** A value the field must refuse, for proving the declaration is read. */
function invalidValue(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case "text":
    case "nullable_text":
    case "enum":
      return 17;
    case "integer":
    case "nullable_integer":
    case "number":
      return "not a number";
    case "enum_list":
    case "list":
      return "not an array";
  }
}

/** A body satisfying every required field of a spec, for probing one property. */
function minimalBody(spec: BodySpec): Record<string, unknown> {
  if (spec.kind !== "object") return {};
  const body: Record<string, unknown> = {};
  for (const field of spec.fields) if (field.required) body[field.name] = validValue(field);
  return body;
}

/**
 * A credential that is valid and entitled to nothing.
 *
 * Every probe below is sent with it. Until milestone 30 these probes were sent
 * anonymously and the parse answered first; the router now authenticates a
 * route that declared `AUTHENTICATED` before it parses anything, so an
 * anonymous probe would measure the 401 and never reach the refusal this file
 * exists to assert. Authenticated-but-unauthorized is the weakest credential
 * that still gets past the router, and it keeps the old property this file had
 * for free: the 400 is shown to come before the 403 this caller would
 * otherwise get, so a parse refusal still cannot be confused with a permission
 * answer.
 */
let token = "";
beforeAll(async () => {
  token = await anonymousCredential(core);
});

async function send(
  route: { method: string; template: string },
  body: unknown,
  credential: string | null = token,
) {
  return core.router.handle({
    method: route.method,
    url: concrete(route.template),
    headers: credential === null ? {} : { authorization: `Bearer ${credential}` },
    body,
  });
}

function messageOf(response: { body: unknown }): string {
  const body = response.body as { error?: { message?: string; code?: string } } | undefined;
  return body?.error?.message ?? JSON.stringify(response.body);
}

describe("every write route accepts only the body it declares", () => {
  it("registers write routes, and reports what each accepts", () => {
    // The premise. An empty list would make every loop below pass silently.
    expect(registrations.length).toBeGreaterThanOrEqual(52);
    expect(writes.length).toBe(32);
    for (const route of writes) {
      expect(route.body, `${route.method} ${route.template}`).toBeDefined();
      expect(["none", "object", "opaque"]).toContain(route.body.kind);
    }
    // And the declarations are not all empty: this milestone would pass a gate
    // made only of refusals by declaring nothing anywhere.
    const declared = writes
      .filter((route) => route.body.kind === "object")
      .reduce((total, route) => total + (route.body as { fields: readonly FieldSpec[] }).fields.length, 0);
    expect(declared).toBeGreaterThanOrEqual(50);
  });

  it("refuses an unknown property on every write route", async () => {
    for (const route of writes) {
      if (route.body.kind === "opaque") continue;
      const body = { ...minimalBody(route.body), [UNKNOWN]: "x" };
      const response = await send(route, body);
      const where = `${route.method} ${route.template}`;
      expect(response.status, `${where} accepted ${UNKNOWN}: ${messageOf(response)}`).toBe(400);
      expect(messageOf(response), where).toContain(UNKNOWN);
    }
  });

  it("refuses an unknown property to a caller who has one, and 401 to a caller who has none", async () => {
    // This case is the reverse of the one milestone 25 wrote here, and the
    // reversal is deliberate rather than incidental. What it used to assert:
    // "a request carrying no token and a typo must hear about the typo, because
    // 401 would send the caller to fix a credential that was never the
    // problem". That reasoning is kept — for a caller CORE has authenticated,
    // the typo is still what it hears about, and that is the first assertion
    // below.
    //
    // What changed is the answer to a caller with **no** credential. Milestone
    // 30 measured what the old order cost: 28 of 52 registrations described
    // their body to a caller who had presented nothing, and the two fulfillment
    // reads answered 404 for an unknown identifier and 401 for a real one,
    // which told an anonymous caller which identifiers exist. An anonymous
    // caller now learns one thing — that it is anonymous.
    //
    // Milestone 25's other reason was that "a request CORE cannot understand
    // must not reach a store, and authentication is a store read". It still
    // does not: a request with no bearer header is refused by the router before
    // any session is looked up, so this answer costs zero reads. A request with
    // a *junk* credential costs one indexed session read, which the rate
    // limiter — checked before authentication — already bounds.
    const authenticated = await send(
      { method: "POST", template: "/v1/wallets" },
      { owner_type: "identity", owner_id: "x", currency: "SAR", CURRENCY: "SAR" },
    );
    expect(authenticated.status).toBe(400);
    expect(messageOf(authenticated)).toContain("CURRENCY");

    const anonymous = await send(
      { method: "POST", template: "/v1/wallets" },
      { owner_type: "identity", owner_id: "x", currency: "SAR", CURRENCY: "SAR" },
      null,
    );
    expect(anonymous.status).toBe(401);
    // And it is told nothing about the body it sent: not the property it
    // misspelled, and not the spelling the route would have accepted.
    expect(JSON.stringify(anonymous.body)).not.toContain("CURRENCY");
    expect(JSON.stringify(anonymous.body)).not.toContain("currency");
  });

  it("refuses any property on a route that declares no body", async () => {
    const none = writes.filter((route) => route.body.kind === "none");
    // The premise: several routes really do read nothing.
    expect(none.length).toBeGreaterThanOrEqual(5);
    for (const route of none) {
      const response = await send(route, { anything: 1 });
      const where = `${route.method} ${route.template}`;
      expect(response.status, `${where}: ${messageOf(response)}`).toBe(400);
      expect(messageOf(response), where).toContain("anything");
      // …and still accepts the two ways of asking for nothing. Neither reaches a
      // 400: what happens next is the handler's business (401 without a token).
      for (const empty of [undefined, {}]) {
        const accepted = await send(route, empty);
        expect(accepted.status, `${where} refused an empty body`).not.toBe(400);
      }
    }
  });

  it("keeps every declared field live", async () => {
    // A declaration that the parse does not read would be decoration. Probed by
    // sending a value of the wrong type for exactly one field at a time: the
    // refusal must name that field, which only the parse can do.
    let probed = 0;
    for (const route of writes) {
      if (route.body.kind !== "object") continue;
      for (const field of route.body.fields) {
        const body = { ...minimalBody(route.body), [field.name]: invalidValue(field) };
        const response = await send(route, body);
        const where = `${route.method} ${route.template} ${field.name}`;
        expect(response.status, `${where}: ${messageOf(response)}`).toBe(400);
        expect(messageOf(response), where).toContain(field.name);
        probed += 1;
      }
    }
    expect(probed).toBeGreaterThanOrEqual(50);
  });

  it("refuses a missing required field, naming it", async () => {
    let probed = 0;
    for (const route of writes) {
      if (route.body.kind !== "object") continue;
      for (const field of route.body.fields) {
        if (!field.required) continue;
        const body = minimalBody(route.body);
        delete body[field.name];
        const response = await send(route, body);
        const where = `${route.method} ${route.template} ${field.name}`;
        expect(response.status, `${where}: ${messageOf(response)}`).toBe(400);
        expect(messageOf(response), where).toContain(field.name);
        probed += 1;
      }
    }
    expect(probed).toBeGreaterThanOrEqual(30);
  });

  it("refuses a body that is not a JSON object", async () => {
    for (const route of writes) {
      if (route.body.kind === "none") continue;
      for (const body of ["a string", 5, [1, 2], true]) {
        const response = await send(route, body);
        expect(response.status, `${route.template} accepted ${JSON.stringify(body)}`).toBe(400);
      }
    }
  });

  it("refuses an unknown property inside a declared list item", async () => {
    // Nesting is where a hand-written reader is most likely to stop looking.
    // `grants` on a plan is the one nested shape in CORE, and a `featureKey` typo
    // inside a grant used to be ignored, which silently changed what a plan sells.
    const response = await send(
      { method: "POST", template: "/v1/plans" },
      {
        code: "p",
        name: "p",
        currency: "SAR",
        amount_minor: 1,
        billing_interval: "month",
        grants: [{ feature_key: "f", limit_value: null, featureKey: "f" }],
      },
    );
    expect(response.status).toBe(400);
    expect(messageOf(response)).toContain("grants[0].featureKey");
  });

  it("refuses an omitted grant limit and accepts an explicit null", async () => {
    // The distinction subscription.test.ts asserts at the service level, held at
    // the edge: null is granted-without-a-quota, 0 is a quota of nothing, and an
    // omission is refused rather than resolved to either.
    const omitted = await send(
      { method: "POST", template: "/v1/plans" },
      {
        code: "p",
        name: "p",
        currency: "SAR",
        amount_minor: 1,
        billing_interval: "month",
        grants: [{ feature_key: "f" }],
      },
    );
    expect(omitted.status).toBe(400);
    expect(messageOf(omitted)).toContain("grants[0].limit_value");
    expect(messageOf(omitted)).toContain("null for an unmetered grant");

    const explicit = await send(
      { method: "POST", template: "/v1/plans" },
      {
        code: "p",
        name: "p",
        currency: "SAR",
        amount_minor: 1,
        billing_interval: "month",
        grants: [{ feature_key: "f", limit_value: null }],
      },
    );
    // Not a 400: the body was understood. This credential is entitled to
    // nothing, so the answer is the 403 the authorization check gives — which
    // is the point: the parse refusal above came first.
    expect(explicit.status).not.toBe(400);
  });

  it("refuses the capture and refund defects this milestone was reserved for", async () => {
    const capture = await send(
      { method: "POST", template: "/v1/payment-authorizations/:authorization_id/capture" },
      { amountMinor: 500, capture_reference: "cap-1" },
    );
    expect(capture.status).toBe(400);
    expect(messageOf(capture)).toContain("amountMinor");
    // And the message says what the route does accept, so the caller can see the
    // spelling they meant rather than guess it.
    expect(messageOf(capture)).toContain("amount_minor");

    const refund = await send(
      { method: "POST", template: "/v1/payment-authorizations/:authorization_id/refund" },
      { refund_reference: "r-1", reason: "duplicate", amountMinor: 500 },
    );
    expect(refund.status).toBe(400);
    expect(messageOf(refund)).toContain("amountMinor");

    // The wallet case from the same measurement.
    const wallet = await send(
      { method: "POST", template: "/v1/wallets" },
      { owner_type: "identity", owner_id: "x", currency: "SAR", nonsense: true },
    );
    expect(wallet.status).toBe(400);
    expect(messageOf(wallet)).toContain("nonsense");

    // A whole-hold capture is still a legal request: the fix must not have made
    // the absent amount illegal, because absence is what "capture everything"
    // means and this route has always meant it.
    const whole = await send(
      { method: "POST", template: "/v1/payment-authorizations/:authorization_id/capture" },
      undefined,
    );
    expect(whole.status).not.toBe(400);
  });

  it("declares nothing a handler does not read, and reads nothing undeclared", () => {
    // The direction the probes above cannot see: the router parses a declared
    // field whether or not a handler asks for it, so a declaration can be pure
    // decoration. Measured in the source, per file, and attributed to the
    // `router.post(...)` call it was written in.
    //
    // The stated limit, as in milestone 24: file granularity. Two routes in one
    // file that declare different fields and read each other's would pass here —
    // the router still refuses by route, and only this cross-check is file-wide.
    const declaredByFile = new Map<string, Set<string>>();
    const readByFile = new Map<string, Set<string>>();
    for (const file of sourceFiles("src")) {
      const source = readCode(file);
      if (!source.includes("router.post(")) continue;
      const declared = new Set<string>();
      for (const call of calls(source, "router.post(")) {
        for (const match of call.matchAll(/\{\s*name:\s*"([A-Za-z0-9_]+)"\s*,\s*kind:/g)) {
          declared.add(match[1]!);
        }
      }
      const read = new Set<string>();
      for (const match of source.matchAll(
        /([A-Za-z_$][\w$]*)\.(?:text|requiredText|number|requiredNumber|strings|list|has)\(\s*"([A-Za-z0-9_]+)"\s*\)/g,
      )) {
        // `selection` is milestone 24's reader and its names are query parameters,
        // declared in the same files by `router.get`. Counting them here would
        // report every read route's parameters as undeclared body properties.
        if (match[1] === "selection") continue;
        read.add(match[2]!);
      }
      const relative = file.replace(/\\/g, "/");
      declaredByFile.set(relative, declared);
      readByFile.set(relative, read);
    }
    // The premise: the scan found the write-route files and declarations in them.
    expect(declaredByFile.size).toBeGreaterThanOrEqual(7);
    expect([...declaredByFile.values()].reduce((total, set) => total + set.size, 0)).toBeGreaterThanOrEqual(40);

    const unread: string[] = [];
    const undeclared: string[] = [];
    for (const [file, declared] of declaredByFile) {
      const read = readByFile.get(file) ?? new Set<string>();
      for (const name of declared) if (!read.has(name)) unread.push(`${file}: ${name}`);
      for (const name of read) if (!declared.has(name)) undeclared.push(`${file}: ${name}`);
    }
    expect(unread).toEqual([]);
    expect(undeclared).toEqual([]);
  });

  it("declares well-formed specs", () => {
    const wellFormed = (fields: readonly FieldSpec[], where: string): void => {
      const names = fields.map((field) => field.name);
      expect(new Set(names).size, `${where} duplicate names`).toBe(names.length);
      for (const field of fields) {
        expect(field.name, `${where} ${field.name}`).toMatch(/^[a-z][a-z0-9_]*$/);
        if (field.kind === "enum" || field.kind === "enum_list") {
          // An empty vocabulary refuses every value the field can take, which is
          // a route nobody can call rather than a strict one.
          expect(field.values.length, `${where} ${field.name}`).toBeGreaterThan(0);
          expect(new Set(field.values).size, `${where} ${field.name}`).toBe(field.values.length);
        }
        if (field.kind === "list") {
          expect(field.items.length, `${where} ${field.name}`).toBeGreaterThan(0);
          wellFormed(field.items, `${where} ${field.name}[]`);
        }
      }
    };
    for (const route of writes) {
      if (route.body.kind !== "object") continue;
      wellFormed(route.body.fields, `${route.method} ${route.template}`);
    }
  });

  it("keeps the opaque body to the one route entitled to it, with its reason", () => {
    const opaque = writes
      .filter((route) => route.body.kind === "opaque")
      .map((route) => `${route.method} ${route.template}`);
    expect(opaque).toEqual(OPAQUE_ROUTES);
    for (const route of writes) {
      if (route.body.kind !== "opaque") continue;
      // A reason is required by construction; asserted here so the requirement
      // survives a future edit to `opaqueBody`.
      expect(route.body.reason.trim().length, route.template).toBeGreaterThan(20);
    }
  });

  it("keeps the declaration the only way a handler reads a body", () => {
    // The structural claim, measured rather than trusted. `body.ts` owns the
    // readers and `router.ts` owns the one place a raw body is touched. A second
    // way in is a second set of rules to keep in step, which is how seven copies
    // of `objectBody` came to disagree about what a write route accepts.
    const owners = new Set(["src/platform/http/body.ts", "src/platform/http/router.ts"]);
    const readers = ["ctx.body", "objectBody(ctx", "requiredString(input", "input[\""];
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const relative = file.replace(/\\/g, "/");
      if (owners.has(relative)) continue;
      const source = readCode(file);
      for (const reader of readers) {
        if (source.includes(reader)) offenders.push(`${relative}: ${reader}`);
      }
    }
    expect(offenders).toEqual([]);
    // And `RequestContext` really has no raw body for a handler to read: the type
    // would let one back in even if today's handlers behave. The transport input
    // the router itself receives is a different interface and does carry one —
    // something has to hand the raw body to `parseBody`.
    const router = readCode("src/platform/http/router.ts");
    // The type parameter arrived with milestone 30: the context now carries the
    // principal the router established, and its type is the module's.
    const context = /export interface RequestContext(?:<[^>]*>)? \{([\s\S]*?)\n\}/.exec(router);
    expect(context, "RequestContext not found").not.toBeNull();
    expect(context![1]!).not.toMatch(/\bbody\b/);
    expect(context![1]!).toMatch(/input: Body;/);
  });

  it("refuses to read a property the route did not declare", () => {
    // The property the whole design rests on, probed directly: an undeclared read
    // throws rather than returning undefined, because undefined is precisely how
    // a capture of 5000 looked like a capture of 500.
    const body = parseBody({ amount_minor: 500 }, { kind: "object", fields: [{ name: "amount_minor", kind: "integer" }] });
    expect(body.number("amount_minor")).toBe(500);
    expect(() => body.number("amountMinor")).toThrow(/did not declare/);
    expect(() => new Body(new Map()).raw()).toThrow(/opaque/);
    expect(body.names()).toEqual(["amount_minor"]);
  });

  it("agrees with the published contract about what every write route accepts", () => {
    // The contract is what MARKET and MOVE build against. A property CORE accepts
    // and does not document is a private extension; one it documents and refuses
    // is a promise it breaks. Milestone 24 found `country_code` in exactly this
    // way, so the same cross-check is applied to bodies.
    const documented = contractRequestBodies();
    // The premise: the reader found bodies at all.
    expect(documented.size).toBeGreaterThanOrEqual(18);

    const missingDeclaration: string[] = [];
    const undocumented: string[] = [];
    for (const route of writes) {
      if (route.method !== "POST") continue;
      const key = route.template.replace(/:([a-z_]+)/g, (_, name) => `{${name}}`);
      const contract = documented.get(key);
      const declared = new Set(
        route.body.kind === "object" ? route.body.fields.map((field) => field.name) : [],
      );
      if (!contract) {
        // Undocumented body: legal only if the route declares none. An opaque
        // body is documented as a free-form envelope, so it is listed above.
        if (declared.size > 0) missingDeclaration.push(`${key}: documented no body, accepts ${[...declared]}`);
        continue;
      }
      for (const name of contract.properties) {
        if (!declared.has(name) && route.body.kind !== "opaque") {
          missingDeclaration.push(`${key}: documented ${name}, not declared`);
        }
      }
      for (const name of declared) {
        if (!contract.properties.has(name)) undocumented.push(`${key}: declares ${name}, undocumented`);
      }
    }
    expect(missingDeclaration).toEqual([]);
    expect(undocumented).toEqual([]);
  });
});

/**
 * The documented request-body properties, per path, read from the OpenAPI file.
 *
 * A line reader rather than a YAML parser, because ADR 0002 forbids a runtime
 * dependency for this and `check-contracts.mjs` reads the same file the same way.
 * Only the top-level properties of each request body are collected: the nested
 * `grants` item shape is checked by the refusal probe above.
 */
function contractRequestBodies(): Map<string, { properties: Set<string>; required: Set<string> }> {
  const lines = readFileSync("contracts/openapi/core-v1.yaml", "utf8").split("\n");
  const out = new Map<string, { properties: Set<string>; required: Set<string> }>();
  let path = "";
  let inRequestBody = false;
  let propertyIndent = -1;
  let current: { properties: Set<string>; required: Set<string> } | undefined;
  for (const line of lines) {
    const pathMatch = /^ {2}(\/\S+):\s*$/.exec(line);
    if (pathMatch) {
      path = pathMatch[1]!;
      inRequestBody = false;
      current = undefined;
      propertyIndent = -1;
      continue;
    }
    if (/^ {4}(get|post|patch|delete|put):\s*$/.test(line)) {
      inRequestBody = false;
      current = undefined;
      propertyIndent = -1;
      continue;
    }
    if (/^ {6}requestBody:\s*$/.test(line)) {
      inRequestBody = true;
      current = { properties: new Set(), required: new Set() };
      out.set(path, current);
      propertyIndent = -1;
      continue;
    }
    if (/^ {6}responses:\s*$/.test(line)) {
      inRequestBody = false;
      current = undefined;
      propertyIndent = -1;
      continue;
    }
    if (!inRequestBody || !current) continue;
    const required = /^ {14}required:\s*\[(.*)\]\s*$/.exec(line);
    if (required) {
      for (const name of required[1]!.split(",")) current.required.add(name.trim());
      continue;
    }
    if (/^ {14}properties:\s*$/.test(line)) {
      propertyIndent = 16;
      continue;
    }
    if (propertyIndent > 0) {
      const property = new RegExp(`^ {${propertyIndent}}([a-z_]+):`).exec(line);
      if (property) current.properties.add(property[1]!);
      const indent = line.search(/\S/);
      if (indent >= 0 && indent < propertyIndent) propertyIndent = -1;
    }
  }
  return out;
}
