/**
 * The response headers CORE sets, and the shape each one is sent in.
 *
 * The answer side's last undeclared surface. Milestone 26 closed the headers
 * CORE **reads** (`headers.ts`); milestone 27 closed the status, the content type
 * and the body it **answers** with, and said so explicitly in its own record:
 * it made no claim about response headers. This module is that claim.
 *
 * Measured on `main` at `ea793f3`, by driving all 52 operations through the real
 * router and reading the answers rather than the code:
 *
 *   x-correlation-id            set on 52 of 52 responses, documented on 0
 *   x-ratelimit-limit/remaining/reset
 *                               set on every *limited* response — successes and
 *                               refusals alike — documented only on the shared
 *                               `RateLimited` 429, as if they were a refusal
 *                               feature
 *   retry-after                 429 only, documented there
 *   content-type                set by one route (`/metrics`), which is the only
 *                               response in CORE that is not JSON
 *
 * and two defects, both on the paths a caller reaches when something is already
 * wrong:
 *
 *   - **An unmatched route answered `404` with no headers at all.** The body
 *     carried `correlation_id`, every other answer carried the header, and the
 *     one response a caller gets when it cannot reach CORE at all was the one it
 *     could not quote back. The `if (!matched)` branch simply returned no
 *     `headers` key.
 *   - **An unparseable JSON body answered `400` from the Node adapter**, above
 *     the router, with `{code, message}` and no `correlation_id`, no `details`
 *     and no `retryable` — not the `Error` shape milestone 27 made every
 *     documented refusal use, and with no correlation id anywhere in it.
 *
 * The fix is structural rather than per-site: every answer leaves through
 * `sealHeaders`, which is the only place in CORE that decides what a response
 * header may be. It refuses a name that is not declared here, and refuses a
 * value that does not match the declared shape — so a header CORE sets and has
 * not documented is a 500 in a test rather than an undocumented field in
 * production. That direction is deliberate: an undeclared *request* header must
 * be ignored, because proxies add their own and refusing them would refuse
 * ordinary traffic (`headers.ts` records that asymmetry), but an undeclared
 * *response* header is CORE's own doing and nobody else's, so there is nothing to
 * be tolerant of.
 *
 * Milestone 32 added the seventh declaration, `idempotent-replay`, which is the
 * first header whose presence is a fact about one call rather than about the
 * route or the deployment: it marks an answer the router replayed from a
 * recorded one instead of running the handler again.
 */

/** When CORE sets a header, which is what a caller can rely on. */
export type ResponseHeaderWhen =
  /** On every answer CORE produces, including refusals it did not route. */
  | "always"
  /**
   * On every answer produced while a rate limiter is wired — success or refusal.
   * Absent, not zeroed, when no limiter is configured: a budget that does not
   * exist is not a budget of zero.
   */
  | "limited"
  /** Only on an answer that asks the caller to come back later. */
  | "retry"
  /**
   * Only on an answer CORE has already given: a retried request that was
   * collapsed against the caller's `Idempotency-Key` rather than run again.
   * Absent on the first answer, which is what makes it readable as a fact
   * about *this* call and not as a property of the route.
   */
  | "replay"
  /** Only on the routes that answer with something other than JSON. */
  | "route";

export interface ResponseHeaderDeclaration {
  /** Lower case, as it is written on the wire by the Node adapter. */
  readonly name: string;
  readonly when: ResponseHeaderWhen;
  /** Why a caller is given this, in one sentence. */
  readonly reason: string;
  /** The whole value CORE is permitted to send. Anchored. */
  readonly shape: RegExp;
}

/** A positive whole number, no sign and no leading zero. */
const WHOLE = /^(?:0|[1-9][0-9]*)$/;

export const RESPONSE_HEADERS: readonly ResponseHeaderDeclaration[] = [
  {
    name: "x-correlation-id",
    when: "always",
    reason:
      "CORE's own record of this request. It is the value written to the audit, outbox, ledger, inbound-event, notification and subscription rows the request touched, and the value every audit and reconciliation read traces it by, so a caller that keeps it can ask what CORE did and be answered from CORE's own tables.",
    // The shape `headers.ts` accepts on the way in, so an echoed id and a
    // generated one are the same kind of value.
    shape: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
  },
  {
    name: "x-ratelimit-limit",
    when: "limited",
    reason: "Requests allowed per window for the class this route belongs to.",
    shape: WHOLE,
  },
  {
    name: "x-ratelimit-remaining",
    when: "limited",
    reason:
      "Requests left in the current window after this one, so a caller can slow down before it is refused rather than after.",
    shape: WHOLE,
  },
  {
    name: "x-ratelimit-reset",
    when: "limited",
    reason: "Unix time in seconds at which the current window ends.",
    shape: WHOLE,
  },
  {
    name: "retry-after",
    when: "retry",
    reason:
      "Whole seconds until the refused request may be resent unchanged, minimum 1 (RFC 9110). Set on a refusal that comes good on its own; never on one that will not.",
    shape: /^[1-9][0-9]*$/,
  },
  {
    name: "content-type",
    when: "route",
    reason:
      "Set by the routes whose answer is not JSON. `/metrics` is the only one in CORE, and its exposition format is part of what a scraper parses.",
    shape: /^[a-z]+\/[a-z0-9.+-]+(?:; *[a-z0-9-]+=[^;]+)*$/,
  },
  {
    name: "idempotent-replay",
    when: "replay",
    reason:
      "This answer was recorded earlier under the same Idempotency-Key and is being replayed: the request did not run again and nothing new was created. A caller reconciling its own records against CORE's needs to tell a collapsed retry from a fresh success, because the second 201 created nothing.",
    // Only ever `true`. A header that could also say `false` would be sent on
    // every answer to mean nothing, and `sealHeaders` refusing the value is
    // what keeps "absent means fresh" true rather than conventional.
    shape: /^true$/,
  },
  {
    name: "access-control-allow-origin",
    when: "route",
    reason:
      "Set on /metrics so a browser dashboard on a different origin can read the exposition. The metrics endpoint is unauthenticated and carries no tenant data (see B-5), so any origin may read it.",
    shape: /^\*$/,
  },
  {
    name: "access-control-allow-methods",
    when: "route",
    reason:
      "Set on /metrics alongside the origin header, naming GET as the only method the route serves.",
    shape: /^GET$/,
  },
  {
    name: "set-cookie",
    when: "route",
    reason:
      "Set only by POST /v1/web-session/telegram/nonce: the browser attempt binding. The cookie is HttpOnly and Secure, so only the pair that opened the attempt — this browser and CORE — can read it, and the login route answers only for the attempt it was opened for. One cookie, one shape, no others: a second cookie would be a second binding CORE has not declared.",
    shape:
      /^wasla_web_attempt=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
  },
];

const BY_NAME = new Map(RESPONSE_HEADERS.map((h) => [h.name, h] as const));

export function declaredResponseHeader(name: string): ResponseHeaderDeclaration | undefined {
  return BY_NAME.get(name.toLowerCase());
}

/** Thrown when CORE is about to send a header it has not declared. */
export class UndeclaredResponseHeaderError extends Error {
  constructor(readonly header: string, reason: string) {
    super(`response header ${header} ${reason}`);
    this.name = "UndeclaredResponseHeaderError";
  }
}

/**
 * The one place a response's headers are decided. Later parts win, which is why
 * the router passes the correlation id last: a route cannot overwrite CORE's
 * record of the request with one of its own.
 */
export function sealHeaders(
  ...parts: readonly (Record<string, string> | undefined)[]
): Record<string, string> {
  const sealed: Record<string, string> = {};
  for (const part of parts) {
    if (part === undefined) continue;
    for (const [rawName, value] of Object.entries(part)) {
      const name = rawName.toLowerCase();
      const declaration = BY_NAME.get(name);
      if (declaration === undefined) {
        throw new UndeclaredResponseHeaderError(rawName, "is not declared in RESPONSE_HEADERS");
      }
      if (typeof value !== "string" || !declaration.shape.test(value)) {
        throw new UndeclaredResponseHeaderError(
          rawName,
          `carries ${JSON.stringify(value)}, which is not the shape it is declared to be sent in`,
        );
      }
      sealed[name] = value;
    }
  }
  return sealed;
}
