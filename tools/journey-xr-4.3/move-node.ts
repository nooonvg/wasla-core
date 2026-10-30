/**
 * MOVE node for the isolated XR-4.3 journey. Composes MOVE's OWN code only:
 * the signed CORE intake route, the fulfillment lifecycle, the operational
 * job repository and the CORE shipper. The /control routes stand in for the
 * driver surface, which does not exist yet for operational jobs (gap G-5).
 */
import { Hono } from "../../../ceezr/node_modules/hono/dist/index.js";
import { createCoreEventIntakeRoutes } from "../../../ceezr/apps/gateway/src/routes/core-event-intake.ts";
import { createFulfillmentLifecycle } from "../../../ceezr/packages/application/wasla/fulfillment-lifecycle.ts";
import { shipDueMoveEvents } from "../../../ceezr/packages/application/wasla/ship-due-move-events.ts";
import { createOperationalJobRepository } from "../../../ceezr/packages/infrastructure/wasla/operational-job-repository.ts";
import { createCoreEventShipper } from "../../../ceezr/packages/infrastructure/wasla/core-event-shipper.ts";
import { createSql } from "../../../ceezr/packages/infrastructure/db/client.ts";

const env = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v; };
const sql = createSql({ connectionString: env("MOVE_DATABASE_URL"), max: 4, idleTimeoutSeconds: null });
const lifecycle = createFulfillmentLifecycle(createOperationalJobRepository(sql));
const shipper = createCoreEventShipper({ baseUrl: env("CORE_EVENTS_BASE_URL"), bearerToken: env("CORE_EVENTS_BEARER_TOKEN") });

const app = new Hono();
app.route("/", createCoreEventIntakeRoutes({ signingSecret: env("CORE_INBOUND_SIGNING_SECRET"), lifecycle, log: (m, meta) => console.log("[move]", m, JSON.stringify(meta)) }));

const corr = () => crypto.randomUUID();
app.post("/control/:op", async (c) => {
  const op = c.req.param("op");
  const body = await c.req.json().catch(() => ({}));
  let r: unknown;
  if (op === "accept") r = await lifecycle.accept(body.fulfillment_id, corr());
  else if (op === "reject") r = await lifecycle.reject(body.fulfillment_id, body.reason ?? "driver_unavailable", corr());
  else if (op === "complete") r = await lifecycle.complete(body.fulfillment_id, corr());
  else if (op === "ship") r = await shipDueMoveEvents({ lifecycle, shipper, maxEvents: 50 });
  else return c.json({ error: "unknown op" }, 404);
  return c.json(r as object);
});
app.get("/control/state", async (c) => {
  const jobs = await sql`select * from operational_jobs order by created_at`;
  const inbox = await sql`select event_id, event_type, processed_at, outcome, outcome_note from core_event_inbox order by received_at`;
  const outbox = await sql`select * from move_event_outbox order by created_at`;
  return c.json({ jobs, inbox, outbox });
});

Bun.serve({ port: Number(process.env.PORT ?? 18090), fetch: app.fetch, tls: { cert: Bun.file(new URL("./cert.pem", import.meta.url).pathname), key: Bun.file(new URL("./key.pem", import.meta.url).pathname) } });
console.log("[move] listening", process.env.PORT ?? 18090);
