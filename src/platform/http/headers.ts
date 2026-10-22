/**
 * The request headers CORE reads, and the shape each one is accepted in.
 *
 * The third and last request surface. Milestone 24 closed the query string and
 * milestone 25 closed the body; both had the same defect and the same fix — the
 * route declares what it accepts, the router refuses the rest, and the handler
 * cannot reach what was not declared. Headers are the surface where that
 * argument was weakest and the consequence largest, because a header is the only
 * part of the request CORE **stores as its own record of what happened**.
 *
 * Measured on `main` at `a043ab7`, through `createServer(router.nodeListener())`
 * and a raw socket rather than through the test harness:
 *
 *   x-correlation-id: <8000 characters>   → 200, echoed and recorded in full
 *   x-correlation-id: "   "               → 200, "   " is the identity of record
 *   x-correlation-id: "a\tb"              → 200, accepted
 *   x-correlation-id: a  (twice)          → 200, recorded as "a, b"
 *
 * `correlation_id` is a `text` column on audit, outbox, ledger, inbound-event,
 * notification and subscription rows, and it is the field every reconciliation
 * and audit read traces a request by. So the old rule — *any* non-empty string,
 * taken verbatim — meant a caller could write kilobytes of chosen text into the
 * audit trail with every ordinary request, that two unrelated requests could
 * both be traced by `"   "`, and that a repeated header became one id belonging
 * to neither half. `bearer()` had the matching flaw in the other direction: a
 * repeated `authorization` was silently narrowed to `[0]`, so CORE chose which
 * of two credentials to authenticate.
 *
 * Three deliberate differences from the query string and the body:
 *
 *   - **An undeclared header is not refused.** HTTP requires unknown headers to
 *     be ignored, and every proxy, browser and load balancer adds its own; a
 *     router that refused them would refuse ordinary traffic. What the gate
 *     enforces instead is that CORE never *reads* a header it has not declared —
 *     the half of the rule that is actually about CORE's behaviour.
 *   - **A malformed declared header is refused before the rate limiter**, not
 *     after. The limiter derives its subject from `authorization` and the
 *     forwarding headers, so it cannot run before those values are known to be
 *     single and bounded. The refusal costs a length check and one regular
 *     expression, touches no store, and is the cheapest work in the request.
 *   - **A refusal cannot echo the header that caused it.** The response carries a
 *     freshly generated correlation id, and the refusal says the header was
 *     rejected. Echoing an 8000-character value back to prove it was too long
 *     would be the defect answering itself.
 *
 * Milestone 32 added the sixth declaration, `idempotency-key`, and it is the
 * first header CORE requires rather than merely reads: five write routes have
 * no natural key to collapse a repeat on, so the caller's key is what lets the
 * router answer a retried request with the answer it already gave. It is
 * declared here like the rest, which is also why sending it before that
 * milestone did nothing at all — an undeclared header is never read.
 */
import { invalid } from "../errors.js";

/** What CORE does with a header, which decides how strictly it is checked. */
export type HeaderUse =
  /**
   * Stored, echoed and logged by CORE as its own record of the request. Checked
   * against an explicit shape, because everything downstream treats it as an
   * identifier rather than as caller text.
   */
  | "recorded"
  /**
   * Read to authenticate or to attribute a rate limit, never stored raw and
   * never echoed. Bounded and required to be single and unambiguous; whether the
   * credential is *valid* is not this module's question — that answer is 401 and
   * belongs to the identity module.
   */
  | "credential"
  /**
   * The browser attempt cookie. Read only by the web sign-in login route to tie
   * the login to the browser that opened the attempt; parsed for the
   * `wasla_web_attempt` value, hashed, never stored and never echoed. A
   * legitimate Cookie header is semicolon-separated pairs, so pairs are what
   * is accepted — bounded, because an unbounded cookie is unbounded input to a
   * credential path.
   */
  | "binding"
  /**
   * A proxy chain. Legitimately a comma-separated list, so a list is accepted
   * and the first entry is the one CORE attributes to; bounded, because the
   * chain is caller-controlled text on the way to a hash.
   */
  | "forwarded"
  /**
   * A key the caller chooses and CORE stores as the primary key of a recorded
   * answer, then compares a later request against — milestone 32. Checked as an
   * identifier rather than as caller text for two reasons the other uses do not
   * share: it becomes a database key, so it must be a bounded single token; and
   * a caller that sends a *slightly* different key by accident gets a second
   * charge rather than a replay, so the accepted alphabet is the narrow one the
   * generators of such keys (UUIDs, ULIDs, hashes) already produce.
   */
  | "idempotency";

export interface HeaderSpec {
  /** The wire name, lower case: Node lower-cases incoming header names. */
  readonly name: string;
  readonly use: HeaderUse;
  /** Longest accepted value. Node's own 16 KB limit is not a policy. */
  readonly maxLength: number;
  /** Why CORE reads it. Recorded here so the list cannot grow silently. */
  readonly why: string;
}

/**
 * A correlation id is an identifier, so it is accepted as one: letters, digits
 * and the separators that UUIDs, W3C `traceparent` values and CORE's own
 * `newId()` output use. No space, no comma, no tab, no control character — which
 * is what refuses `"   "`, `"a\tb"` and the `"a, b"` a repeated header becomes.
 */
const CORRELATION_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * An idempotency key is a caller-chosen identifier, so it is accepted as one —
 * and deliberately as the *same* expression rather than a second one that would
 * drift from it. Both headers are strings a caller invents and CORE stores as a
 * key, so "letters, digits and . _ : -" is the same rule for the same reason;
 * an alias keeps the one regular expression while letting each use name itself
 * where it is declared.
 */
const IDEMPOTENCY_KEY = CORRELATION_ID;

/**
 * One credential, as `scheme token`. Deliberately not a check that the scheme is
 * `Bearer` or that the token is well formed: an unknown scheme and an invalid
 * token are both 401, answered by the identity module against real state. This
 * pattern refuses only what cannot be a single credential — a value carrying a
 * comma (what Node makes of a repeated header), whitespace beyond the one
 * separator, or a control character.
 */
const CREDENTIAL = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+ [\x21-\x2b\x2d-\x7e]+$/;

/** Addresses and ports, and the commas of a chain. */
const FORWARDED = /^[A-Za-z0-9.:[\]%_-]+(, ?[A-Za-z0-9.:[\]%_-]+)*$/;

/**
 * Every header CORE reads anywhere. The gate asserts that no other header name
 * is read in `src/`, so this list is the whole of CORE's dependence on what a
 * caller sends outside the URL and the body.
 */
export const DECLARED_HEADERS: readonly HeaderSpec[] = [
  {
    name: "x-correlation-id",
    use: "recorded",
    // Long enough for a UUID, a W3C traceparent and any sane composite of both;
    // short enough that the audit trail cannot be used as storage.
    maxLength: 128,
    why: "the caller's trace id: echoed in the response, written to the request log, and persisted in the correlation_id column of audit, outbox, ledger, inbound_event, notification and subscription rows",
  },
  {
    name: "authorization",
    use: "credential",
    // A session token is 32 random bytes in base64url; the bound is generous
    // for a signed credential and far below Node's header limit.
    maxLength: 4096,
    why: "the session credential read by bearer() in identity-access, and hashed by the rate limiter to attribute a budget to one caller",
  },
  {
    name: "x-forwarded-for",
    use: "forwarded",
    maxLength: 512,
    why: "the proxy chain the rate limiter attributes an anonymous caller by, first entry only, hashed and never stored",
  },
  {
    name: "x-real-ip",
    use: "forwarded",
    maxLength: 128,
    why: "the reported client address, used by the rate limiter when no forwarded chain is present",
  },
  {
    name: "x-client-ip",
    use: "forwarded",
    maxLength: 128,
    why: "the reported client address, used by the rate limiter when neither of the above is present",
  },
  {
    name: "cookie",
    use: "binding",
    // A browser sends its whole cookie basket for the origin, not our one
    // cookie: the bound is a transport-safe size for that basket, not a shape
    // for names — RFC 6265 names include `.` `~` `+`, and this gate runs on
    // every route, so an allowlist here would refuse ordinary browsers. The
    // login route alone decides what a Cookie header means: it extracts
    // `wasla_web_attempt`, skips the rest, and refuses a duplicate.
    maxLength: 4096,
    why: "the web sign-in attempt binding: the HttpOnly cookie the nonce route set, read by POST /v1/web-session/telegram so only the browser that opened the attempt can finish it; parsed for wasla_web_attempt, hashed and never stored",
  },
  {
    name: "idempotency-key",
    use: "idempotency",
    // The same bound as a correlation id, and for a stronger reason: the value
    // is a `text` primary key column, so an unbounded one is unbounded storage
    // with an index on it. A UUID is 36 characters and a caller prefixing its
    // own system name still fits several times over.
    maxLength: 128,
    why: "the caller's retry key on a route with no natural key: CORE records the answer under it and replays that answer instead of creating a second organization, subscription or geography row",
  },
];

const BY_NAME = new Map(DECLARED_HEADERS.map((spec) => [spec.name, spec]));

/** What a caller sent, before it has been checked. */
export type RawHeaders = Record<string, string | string[] | undefined>;

/**
 * The declared headers of one request, already checked.
 *
 * Reading an undeclared name throws rather than returning `undefined`, for the
 * reason `Selection` and `Body` throw: a reader asking for a header nobody
 * declared would otherwise see "not sent" on every request, and the whole point
 * of this module is that CORE knows which headers it depends on.
 */
export class RequestHeaders {
  constructor(private readonly values: ReadonlyMap<string, string>) {}

  private spec(name: string): HeaderSpec {
    const spec = BY_NAME.get(name);
    if (!spec) throw new Error(`header ${name} is not declared in DECLARED_HEADERS`);
    return spec;
  }

  /** The value as sent, or `undefined` when the header was absent. */
  value(name: string): string | undefined {
    this.spec(name);
    return this.values.get(name);
  }

  /**
   * The first entry of a forwarded chain, or `undefined`.
   *
   * A chain is the one declared header where taking one part of the value is
   * correct rather than a narrowing: `x-forwarded-for: client, proxy1, proxy2`
   * is a list by definition, and the client is the entry CORE attributes to.
   */
  firstForwarded(name: string): string | undefined {
    const spec = this.spec(name);
    if (spec.use !== "forwarded") {
      throw new Error(`header ${name} is not a forwarded chain`);
    }
    return this.values.get(name)?.split(",")[0]?.trim() || undefined;
  }

  /** The declared names that were sent, for the gate and for the log record. */
  present(): readonly string[] {
    return [...this.values.keys()].sort();
  }
}

function single(spec: HeaderSpec, raw: string | string[]): string {
  if (Array.isArray(raw)) {
    // Node joins repeated headers into one comma-separated string, so this is
    // the in-process caller of `handle()`; either way, two values mean CORE
    // would have to choose one, and choosing silently is the defect.
    throw invalid(
      `${spec.name} was sent more than once; send exactly one value`,
    );
  }
  return raw;
}

/**
 * Check the declared headers of one request.
 *
 * Undeclared headers are left alone — see the note at the top of this file.
 * Every refusal names the header and says what is accepted, and never quotes the
 * value back.
 */
export function parseHeaders(raw: RawHeaders): RequestHeaders {
  const values = new Map<string, string>();
  for (const spec of DECLARED_HEADERS) {
    const sent = raw[spec.name];
    if (sent === undefined) continue;
    const value = single(spec, sent);
    if (value.length === 0) continue;
    if (value.length > spec.maxLength) {
      throw invalid(
        `${spec.name} must be at most ${spec.maxLength} characters, and was ${value.length}`,
      );
    }
    switch (spec.use) {
      case "recorded": {
        if (!CORRELATION_ID.test(value)) {
          throw invalid(
            `${spec.name} must be an identifier: letters, digits, and . _ : - only ` +
              "(it is echoed, logged and stored as CORE's record of this request)",
          );
        }
        break;
      }
      case "credential": {
        if (!CREDENTIAL.test(value)) {
          throw invalid(
            `${spec.name} must be a single credential of the form "scheme token"`,
          );
        }
        break;
      }
      case "forwarded": {
        if (!FORWARDED.test(value)) {
          throw invalid(`${spec.name} must be an address, or a comma-separated chain of them`);
        }
        break;
      }
      case "idempotency": {
        if (!IDEMPOTENCY_KEY.test(value)) {
          throw invalid(
            `${spec.name} must be an identifier: letters, digits, and . _ : - only ` +
              "(it is the key CORE records this request's answer under, so it must be a single stable token)",
          );
        }
        break;
      }
    }
    values.set(spec.name, value);
  }
  return new RequestHeaders(values);
}
