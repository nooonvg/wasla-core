# XR-4.3 isolated live journey

One command runs the whole MARKET → CORE → MOVE → CORE → MARKET journey on
three fresh **local** PostgreSQL databases, with each system's own code and
real signed HTTP between them. It never touches Render, Supabase or any shared
database. `journey.sh` refuses to start unless `PGBASE` points at localhost.

```
<dir>/wasla        (MARKET, deps installed with pnpm)
<dir>/wasla-core   (CORE, npm ci)   ← this script: tools/journey-xr-4.3/journey.sh
<dir>/ceezr        (MOVE, bun install)
PGBASE=postgres://postgres:<pw>@localhost tools/journey-xr-4.3/journey.sh
```

PostgreSQL needs PostGIS, because MOVE's migrations require it. Every run
creates `xr43_market`, `xr43_core` and `xr43_move` from scratch and generates
fresh signing secrets and a throwaway TLS certificate. CORE refuses to sign
for a non-https endpoint, so the webhooks are https even locally. The script
deletes the certificate when it finishes.

## What runs where

| Node | Code used, unchanged | Written here (named gaps) |
|---|---|---|
| CORE `:18080` | `src/server.ts`. Needs the worker fix in this PR | none |
| MARKET `:18070` | `placeStoreOrder` (writes `core_egress_outbox`), `fulfillmentTransition`, `cancelStoreOrder`, `consumeCoreFulfillmentEvent`, `PgCoreFulfillmentInbox` | **G-1** egress relay; **G-3** signed intake |
| MOVE `:18090` | `createCoreEventIntakeRoutes`, `createFulfillmentLifecycle`, `createOperationalJobRepository`, `createCoreEventShipper`, `shipDueMoveEvents`, plus the 6 migrations in `deferred/core-integration` | `/control/*` stands in for the driver surface (**G-5**) |

The marketplace catalog is MARKET's own test fake. It returns the CORE
organization id for the store, which is exactly what the XR-6.1
store↔organization binding will provide.

## Measured on 2026-10-29

Checkouts: wasla `1db368f`, wasla-core `99f4336` plus this PR, ceezr
`b18bfb6`. Result: **23 passed, 0 failed**.

| Scenario | Result |
|---|---|
| A. Happy path | order → CORE `coordinating` → MOVE job → accept → CORE `dispatched` → MARKET `assigned` → complete → CORE `completed` → MARKET `delivered` **only after proof** |
| A. Order timing | MOVE accepts before the store is ready: MARKET answers `out_of_order` (503), CORE retries, and the retry lands once the store reaches `ready_for_delivery` |
| B. Duplicates | replaying `market.order.created` → still 1 fulfillment; re-sending a signed webhook → `duplicate` |
| B. Security | forged signature → 401; MOVE credential submitting `market.*` → 403; no credential → 401 |
| C. MOVE rejects | CORE `failed`; MARKET **stuck** in `ready_for_delivery` (G-7) |
| D. Customer cancels | MARKET `cancelled`, MOVE job **still open** (G-6). Once the missing CORE cancel call is made, the MOVE job is cancelled |
| E. Unbound store | order held in `core_egress_blocked` (`organization_not_linked`); nothing is sent |
| F. CORE down | the relay records the failure and keeps the row; when CORE returns, the same order reaches MOVE |

Control run: with `src/server.ts` as on `main` (`99f4336`), the first check
already fails. `POST /v1/events` returns 202 and no fulfillment is ever
created, because the process never ran the inbound dispatcher or the delivery
worker.

## Gaps found (these block a live XR-4.3)

| ID | System | Gap | Evidence |
|---|---|---|---|
| G-1 | MARKET | Nothing reads `core_egress_outbox`, so no order ever leaves MARKET | no reader on main; `relayOnce` in `market-node.ts` closes the gap |
| G-2 | CORE | `server.ts` ran only the outbox publisher: no inbound dispatch, no webhook delivery | **fixed in this PR**, with `tests/server-workers.test.ts` |
| G-3 | MARKET | `consumeCoreFulfillmentEvent` exists, but no HTTP door verifies CORE's signature and calls it | `/webhook/core-fulfillment` in `market-node.ts` |
| G-4 | contracts | Proof of delivery has no path. `move.job.completed` and `core.fulfillment.completed` carry no proof (`additionalProperties: false`), while MARKET requires proof for `delivered` | scenario A: `proof_missing` until proof is supplied out of band |
| G-5 | MOVE | No driver surface for operational jobs. `lifecycle.accept/complete/reject` are called only by tests | `/control/*` in `move-node.ts` |
| G-6 | MARKET→CORE | A customer cancel in MARKET never reaches CORE, so MOVE can still dispatch a courier | scenario D |
| G-7 | MARKET | When MOVE rejects, CORE closes `failed`, but MARKET has no `ready_for_delivery → failed` edge. The order stays stuck while CORE retries until the delivery dies | scenario C |
