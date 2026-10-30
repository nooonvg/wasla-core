/**
 * MARKET node for the isolated XR-4.3 journey. Uses MARKET's OWN delivery
 * code: placeStoreOrder (which writes core_egress_outbox in the placement
 * transaction), fulfillmentTransition (the store's walk), and
 * consumeCoreFulfillmentEvent (the XR-3.5 consumer). Two transports that do
 * NOT exist on main are written here and named as gaps:
 *   G-1  egress relay  core_egress_outbox -> CORE POST /v1/events
 *   G-3  signed intake CORE webhook -> consumeCoreFulfillmentEvent
 * The catalog (marketplace service) is the existing test fake, given the
 * CORE organization id: that IS the XR-6.1 store<->organization binding.
 */
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { StoreOrderStore } from "../../../wasla/services/delivery/src/infrastructure/store-order-store.js";
import { PgCoreFulfillmentInbox } from "../../../wasla/services/delivery/src/infrastructure/pg-core-fulfillment-inbox.js";
import { placeStoreOrder } from "../../../wasla/services/delivery/src/use-cases/place-store-order.js";
import { fulfillmentTransition } from "../../../wasla/services/delivery/src/use-cases/fulfillment-transition.js";
import { cancelStoreOrder } from "../../../wasla/services/delivery/src/use-cases/cancel-store-order.js";
import { consumeCoreFulfillmentEvent } from "../../../wasla/services/delivery/src/use-cases/consume-core-fulfillment.js";
import { FakeCatalog, FakeReservationPort, CUSTOMER_REF, PRODUCT_A, PRODUCT_B, STORE_SLUG, STORE_ID } from "../../../wasla/services/delivery/src/__tests__/store-order-fakes.js";

/*
 * MARKET_TRANSPORTS=real (wasla CLM-0708 and later): G-1, G-3 and G-6 use
 * MARKET's OWN transports instead of the stand-ins below:
 *   G-1  relayCoreEgressOnce   (services/delivery/src/infrastructure/pg-core-relays.ts)
 *   G-6  relayCoreCancelsOnce  (same file)
 *   G-3  POST /delivery/core/fulfillment-events of buildDeliveryHttpApp, driven
 *        through fastify.inject with CORE's exact body and headers.
 * Only proof of delivery (G-4) stays out of band: when the journey registered a
 * proof for the order, that one delivery goes to the consumer directly with it.
 */
const REAL = process.env.MARKET_TRANSPORTS === "real";
type RealTransports = {
  relay: () => Promise<{ sent: number; failed: number; cancels_sent: number; cancels_failed: number }>;
  intake: (body: string, headers: Record<string, string | string[] | undefined>) => Promise<[number, { result: string }]>;
};
async function loadReal(): Promise<RealTransports> {
  const relays = await import("../../../wasla/services/delivery/src/infrastructure/pg-core-relays.js");
  const { buildDeliveryHttpApp } = await import("../../../wasla/services/delivery/src/http/app.js");
  const sa = await import("@wasla/service-auth");
  const opts = { coreUrl: CORE, token: TOKEN, backoffBaseSeconds: 0 };
  const app = buildDeliveryHttpApp({
    readPort: store,
    writePort: store,
    reservationPort,
    reservationStore: store,
    serviceIdentity: {
      keys: sa.keyRegistryFromEnv({ WASLA_SERVICE_AUTH_KEYS: `journey:active:${"j".repeat(48)}`, WASLA_SERVICE_AUTH_ACTIVE_KID: "journey" }),
      replayGuard: new sa.InMemoryServiceTokenReplayGuard(),
    },
    coreFulfillmentIntake: { secret: SECRET, inbox, links: new relays.PgCoreFulfillmentLinks(pool) },
  });
  await app.fastify.ready();
  return {
    relay: async () => {
      const e = await relays.relayCoreEgressOnce(pool, opts);
      const c = await relays.relayCoreCancelsOnce(pool, opts);
      return { sent: e.sent, failed: e.retried + e.refused, cancels_sent: c.sent, cancels_failed: c.retried + c.refused };
    },
    intake: async (body, headers) => {
      const res = await app.fastify.inject({
        method: "POST",
        url: "/delivery/core/fulfillment-events",
        headers: {
          "content-type": "application/json",
          "x-wasla-signature": String(headers["x-wasla-signature"] ?? ""),
          "x-wasla-event-id": String(headers["x-wasla-event-id"] ?? ""),
          "x-wasla-delivery-attempt": String(headers["x-wasla-delivery-attempt"] ?? ""),
        },
        payload: body,
      });
      return [res.statusCode, res.json() as { result: string }];
    },
  };
}

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v; };
const pool = new pg.Pool({ connectionString: env("MARKET_DATABASE_URL"), max: 4 });
const store = new StoreOrderStore(pool);
const inbox = new PgCoreFulfillmentInbox(pool);
const ORG = env("CORE_ORGANIZATION_ID");
const CORE = env("CORE_BASE_URL");
const TOKEN = env("CORE_MARKET_TOKEN");
const SECRET = env("MARKET_INBOUND_SIGNING_SECRET");
const ids = () => ({ newUuid: () => crypto.randomUUID(), now: () => new Date().toISOString() });
const reservationPort = new FakeReservationPort();
const transitionDeps = { readPort: store, writePort: store, reservationPort, reservationStore: store, ...ids() };

/** Proof captured at the door (OTP the customer reads to the courier). Out of band: G-4. */
const proofs = new Map<string, { proofType: "otp"; proofRef: string }>();
const consumed: unknown[] = [];
let realTransports: RealTransports | null = null;
const real = async (): Promise<RealTransports> => (realTransports ??= await loadReal());

// ---- G-1 egress relay -------------------------------------------------------
async function relayOnce(): Promise<{ sent: number; failed: number }> {
  const client = await pool.connect();
  let sent = 0, failed = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM core_egress_outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for (const r of rows) {
      const envelope = { event_id: r.event_id, event_type: r.event_type, version: r.version, producer: r.producer,
        occurred_at: new Date(r.occurred_at).toISOString(), correlation_id: r.correlation_id, causation_id: r.causation_id,
        entity_type: r.entity_type, entity_id: r.entity_id, payload: r.payload };
      let res: Response | null = null, err = "";
      try {
        res = await fetch(`${CORE}/v1/events`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(5000) });
      } catch (e) { err = String(e); }
      if (res && res.status >= 200 && res.status < 300) {
        await client.query(`UPDATE core_egress_outbox SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE event_id = $1`, [r.event_id]);
        sent++;
      } else {
        const detail = res ? `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` : err;
        await client.query(`UPDATE core_egress_outbox SET attempts = attempts + 1, last_error = $2 WHERE event_id = $1`, [r.event_id, detail]);
        failed++;
      }
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  return { sent, failed };
}

// ---- G-3 signed intake ------------------------------------------------------
function signatureOk(body: string, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = createHmac("sha256", SECRET).update(body).digest("hex");
  const got = header.slice(7);
  return got.length === want.length && timingSafeEqual(Buffer.from(want, "hex"), Buffer.from(got, "hex"));
}
// Terminal outcomes acknowledge (2xx); retryable outcomes answer 503 so CORE retries.
const RETRYABLE = new Set(["out_of_order", "proof_missing", "order_not_found", "error"]);

async function handle(method: string, path: string, body: string, headers: Record<string, string | string[] | undefined>): Promise<[number, unknown]> {
  if (method === "POST" && path === "/webhook/core-fulfillment" && REAL) {
    let envelope: { event_type?: string; event_id?: string; payload?: { order_reference?: string } } = {};
    try { envelope = JSON.parse(body); } catch { /* the real route answers */ }
    const orderRef = envelope?.payload?.order_reference;
    const proof = orderRef ? proofs.get(orderRef) ?? null : null;
    let status: number; let out: { result: string };
    if (proof !== null && signatureOk(body, headers["x-wasla-signature"] as string | undefined)) {
      // G-4 only: proof captured out of band reaches the consumer directly.
      const result = await consumeCoreFulfillmentEvent({ inbox, orders: store, transition: transitionDeps }, envelope as never, proof);
      status = RETRYABLE.has(result.kind) ? 503 : 200; out = { result: result.kind };
    } else {
      [status, out] = await (await real()).intake(body, headers);
    }
    consumed.push({ at: new Date().toISOString(), order_reference: orderRef, event_type: envelope.event_type, event_id: envelope.event_id, attempt: headers["x-wasla-delivery-attempt"], result: out.result });
    console.log("[market] consumed (real transport)", envelope.event_type, out.result, status);
    return [status, out];
  }
  if (method === "POST" && path === "/webhook/core-fulfillment") {
    if (!signatureOk(body, headers["x-wasla-signature"] as string | undefined)) return [401, { error: "bad_signature" }];
    const envelope = JSON.parse(body);
    const orderRef = envelope?.payload?.order_reference as string | undefined;
    const proof = orderRef ? proofs.get(orderRef) ?? null : null;
    const result = await consumeCoreFulfillmentEvent({ inbox, orders: store, transition: transitionDeps }, envelope, proof);
    consumed.push({ at: new Date().toISOString(), order_reference: orderRef, event_type: envelope.event_type, event_id: envelope.event_id, attempt: headers["x-wasla-delivery-attempt"], result: result.kind });
    console.log("[market] consumed", envelope.event_type, result.kind);
    return [RETRYABLE.has(result.kind) ? 503 : 200, { result: result.kind }];
  }
  const b = body ? JSON.parse(body) : {};
  if (method === "POST" && path === "/control/place") {
    const deps = { catalogPort: new FakeCatalog({ storeId: STORE_ID, orderable: true, organizationId: b.unbound ? null : ORG }), writePort: store, readPort: store, reservationPort, reservationStore: store, ...ids() };
    const r = await placeStoreOrder(deps, { customer_ref: CUSTOMER_REF, store_slug: STORE_SLUG, items: [{ product_id: PRODUCT_A, quantity: 2 }, { product_id: PRODUCT_B, quantity: 1 }], delivery_fee_minor_units: 500 }, "xr43-journey",
      b.idempotencyKey ? { key: b.idempotencyKey, route: "POST /store-orders" } as never : undefined);
    return [200, r];
  }
  if (method === "POST" && path === "/control/walk") {
    let last: unknown = null;
    for (const to of b.steps ?? ["confirmed", "picking", "picked", "ready_for_delivery"]) {
      last = await fulfillmentTransition(transitionDeps, b.publicId, to, null, "xr43-store-walk");
      if ((last as { kind: string }).kind !== "applied") return [409, last];
    }
    return [200, last];
  }
  if (method === "POST" && path === "/control/cancel") return [200, await cancelStoreOrder(transitionDeps as never, b.publicId, b.input ?? { reason: "CUSTOMER_CHANGED_MIND" } as never, "xr43").catch((e) => ({ error: String(e) }))];
  if (method === "POST" && path === "/control/proof") { proofs.set(b.orderRef, { proofType: "otp", proofRef: b.proofRef }); return [200, { ok: true }]; }
  if (method === "POST" && path === "/control/relay") return [200, REAL ? await (await real()).relay() : await relayOnce()];
  if (method === "GET" && path.startsWith("/control/last?")) {
    const u = new URLSearchParams(path.slice("/control/last?".length));
    const hit = (consumed as { order_reference?: string; event_type: string; result: string }[]).filter((c) => c.order_reference === u.get("ref") && c.event_type === u.get("type")).at(-1);
    return [200, { result: hit?.result ?? null, attempts: consumed.filter((c) => (c as { order_reference?: string }).order_reference === u.get("ref")).length }];
  }
  if (method === "GET" && path === "/control/relay-status") return [200, (await pool.query(`SELECT count(*) FILTER (WHERE published_at IS NULL)::int AS pending FROM core_egress_outbox`)).rows[0]];
  if (method === "GET" && path.startsWith("/control/order/")) {
    const id = decodeURIComponent(path.slice("/control/order/".length));
    const o = await pool.query(`SELECT order_id, public_id, status FROM store_orders WHERE public_id = $1`, [id]);
    const t = o.rows[0] ? await pool.query(`SELECT from_status, to_status, reason_code, created_at FROM store_order_transitions WHERE order_id = $1 ORDER BY created_at, sequence_number`, [o.rows[0].order_id]).catch(async () => pool.query(`SELECT * FROM store_order_transitions WHERE order_id = $1`, [o.rows[0].order_id])) : { rows: [] };
    const e = await pool.query(`SELECT event_id, event_type, published_at, attempts, last_error FROM core_egress_outbox`);
    const blk = await pool.query(`SELECT * FROM core_egress_blocked`);
    const ib = await pool.query(`SELECT * FROM core_fulfillment_inbox ORDER BY 1`);
    return [200, { order: o.rows[0] ?? null, transitions: t.rows, egress: e.rows, blocked: blk.rows, inbox: ib.rows, consumed }];
  }
  return [404, { error: "not_found" }];
}

createServer({ cert: readFileSync(new URL("./cert.pem", import.meta.url)), key: readFileSync(new URL("./key.pem", import.meta.url)) }, (req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const [status, out] = await handle(req.method ?? "GET", req.url ?? "/", body, req.headers);
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(out));
    } catch (e) { console.error("[market] error", e); res.writeHead(500).end(JSON.stringify({ error: String(e) })); }
  });
}).listen(Number(process.env.PORT ?? 18070), () => console.log("[market] listening", process.env.PORT ?? 18070));
