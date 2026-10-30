import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * XR-4.3: the process entry point must drive every worker the live journey
 * depends on. Measured on main at 99f4336 against a real PostgreSQL with
 * MARKET and MOVE as HTTP peers: `server.ts` ran only the outbox relay, so
 * `POST /v1/events` returned 202 and fulfillment never saw the event (no
 * dispatcher), and a registered subscription was never called (no delivery
 * worker). The journey stopped at ingress while every unit test was green,
 * because the tests call `drainOnce()` themselves.
 */
const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");

describe("server entry point drives the journey's workers", () => {
  for (const worker of ["publisher", "dispatcher", "deliveries"]) {
    it(`runs app.${worker}.drainOnce on an interval`, () => {
      expect(server).toMatch(new RegExp(`setInterval\\([\\s\\S]{0,120}app\\.${worker}\\.drainOnce\\(`));
    });
  }

  it("clears every worker interval on shutdown", () => {
    const shutdown = server.slice(server.indexOf("function shutdown"));
    for (const timer of ["relay", "dispatchTimer", "deliveryTimer", "sampleTimer"]) {
      expect(shutdown).toContain(`clearInterval(${timer})`);
    }
  });
});
