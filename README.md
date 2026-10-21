# WASLA CORE

Shared operating layer for the WASLA system. Independent repository,
independent build, independent database, independent release.

```
MARKET creates the work.  MOVE executes the work.  CORE coordinates it.
```

CORE is **not** a gateway, not an API proxy, not a shared library, not a shared
database. It owns the capabilities that both products need and must not
duplicate: identity and access, organizations, money, subscriptions,
reputation, channels, notifications, the event backbone and fulfillment
coordination.

## Related repositories

| System | Repository | Owns |
|---|---|---|
| WASLA MOVE | [`nooonvg/ceezr`](https://github.com/nooonvg/ceezr) | drivers, vehicles, operational jobs, rides, delivery execution, dispatch, tracking, POD |
| WASLA MARKET | [`nooonvg/wasla`](https://github.com/nooonvg/wasla) | merchants, stores, products, inventory, commercial orders, search |

The three repositories are permanently separate. No monorepo, no shared runtime
package, no cross-database access.

The cross-repository plan — which system owns which domain, the synchronized
phases `XR-0`…`XR-7`, and every owner decision that blocks them — is
[`docs/ecosystem/ECOSYSTEM_ROADMAP.md`](docs/ecosystem/ECOSYSTEM_ROADMAP.md), kept
byte-identical in the three repositories and checked by `ecosystem-sync.yml`.

## What runs today

| Area | State |
|---|---|
| Event envelope, outbox, relay with backoff and DLQ, consumer inbox, idempotent handlers | implemented, 12 tests |
| Identity, identity links, principals, sessions, memberships, roles, permissions | implemented, 8 tests |
| Organizations / tenancy | implemented |
| Postgres adapters for every repository port, with a real transaction boundary | implemented, 48 conformance assertions |
| HTTP surface with correlation ids, canonical errors, structured logs, health/readiness | implemented, 8 tests |
| Append-only audit trail with metadata scrubbing | implemented |
| Executable architecture governance | implemented, 4 tests |
| Wallet, balanced append-only ledger, payment authorization/capture/expiry | implemented, running on Postgres |
| Fulfillment coordination via MARKET/MOVE events | implemented on local bus; production transport unproven |
| Execution/money consistency: `settlement_state`, hold verification at intake, reconciliation read | implemented, covered by the fulfillment settlement tests |
| Subscriptions: periods, collection, past-due, renewal sweep, cancellation, expiry | implemented |
| Notifications: recipients, tenant-scoped fan-out, rendering, dispatcher with leases | implemented; provider delivery confirmation missing (D-8) |
| Reputation: append-only signals, exactly-once ingestion, retraction marker, standing derived on every read | implemented; no producer publishes `market.review.*` yet, and weighting/decay/thresholds are undecided (B-31…B-34) |

**894 tests** pass in the dependency-free default run and **1485** with
`DATABASE_URL` set, because the database-backed files stop being skipped and the
dual-backend suites run their Postgres half. Both numbers are the sum of two
passes — `npm test` runs `test:suite` and then `test:cluster`, and the second
runs the database-creating migration-lifecycle files alone because they contend
with everything else for the same server. That division has one definition
(`scripts/test-partition.mjs`), a gate that refuses any test file belonging to
neither pass or to both (`npm run check:test-partition`, in both CI jobs), and no
restatement on a command line; a bare `vitest run` therefore performs exactly
CI's suite pass. Until milestone 35 it was stated twice and disagreed with
itself: a lifecycle file added beside the existing one would have run in neither
pass with `npm test` still green, and the "unexplained" 147-versus-148 skipped
count these records carried for twelve cycles was only a one-run total being
compared with a two-run split (147 + 1 = 148). See `docs/test-partition.md`.

(The line has read 385/687, then
529/976, then 550/1015, then 557/1026, then 574/1047, then 584/1063, then 589/1075, then 595/1125, then 599/1162, then 648/1211, then 658/1221, then 674/1237, then 689/1252, then 700/1263, then 709/1272, then 717/1280, then 733/1296, then 758/1321, then 769/1340, then 781/1362, then 789/1373, then 799/1383, then 806/1390, then 812/1396, then 819/1403, then 825/1409, then 849/1409, then 855/1409, then 862/1409, then 865/1412, then 866/1454, then 868/1458, then 887/1478, then 894/1485; the
counts are updated rather than
removed, and the earlier pairs are kept in this parenthesis so the growth stays
auditable.)

**Both numbers are now produced by CI, on every push.** They were not until the
CI database cycle: the workflow set no `DATABASE_URL`, so roughly 300 assertions
— every Postgres adapter, every trigger, every check constraint, every
live-schema check — were skipped in the only place that gates a merge, and each
cycle's "verified against Postgres" meant verified on somebody's laptop. There
are two jobs, and the dependency-free one is kept rather than folded in: it is
the only thing that proves a fresh clone can run `npm test` at all.

Per-area test counts used to be listed in the table above and were wrong within
two cycles of being written, so they are no longer kept there — the suite is the
authority, and `ROADMAP.md` records the verified figure per cycle.

Persistence is real. Every repository port — identity, organization,
geography, money, fulfillment — has a Postgres adapter, as do the outbox, the
inbox and the audit trail, behind a `BEGIN`/`COMMIT`/`ROLLBACK` transaction
boundary. `createCoreApp({ persistence })` selects the backend as one bundle,
never a mix, and `/ready` reports which one is wired.

Two test files are worth knowing about:

- `tests/pg-adapters.test.ts` runs the **same** assertions against the
  in-memory and the Postgres adapters. Running both is what proves they are
  substitutable; testing only Postgres would prove the SQL parses.
- `tests/vertical-slice-postgres.test.ts` runs the whole
  MARKET → CORE → MOVE → CORE → MARKET flow, money capture included, against a
  real database — so foreign keys, check constraints and the deferred ledger
  balance trigger all get a chance to refuse what a `Map` would have accepted.

All **21** migrations are applied on every CI run against PostgreSQL 16, and the
newest one is rolled back and re-applied there — `scripts/check-migrations.mjs`
only proves a `.down.sql` exists, and a rollback nobody has executed is a plan.
They have also been exercised on managed 17.6 and local 18.6.

### Working against a database

```bash
export DATABASE_URL=postgres://user:pass@host:5432/db   # never committed
npm run db:status
npm run db:up
npm test                    # every skipped file now runs
```

`npm test` is two passes, and the split is a fix rather than a preference:

- `npm run test:suite` — everything except the migration lifecycle files.
- `npm run test:cluster` — those files alone, because they `create database` and
  `drop database`, which are cluster-wide operations. Measured on one machine:
  0.3s idle, **51s** while the rest of the suite was working the same server,
  against a 60s hook timeout. That was the "known flake" this repository carried
  for several cycles.

Each Vitest worker also gets **its own database**, created and migrated on first
use (`tests/support/worker-database.ts`), named after yours with a `_w<n>`
suffix. Every database-backed file truncates the whole schema in `beforeEach`,
which is correct inside one file and a defect across parallel files: one file
truncated the organization another was mid-test on, and the second failed on a
foreign key its own code never violated. The suite's verdict depended on
scheduling. Isolation removes the shared mutable state instead of coordinating
access to it — and the suite got about three times faster, because those files
had also been contending for the same rows.

`pg` is a devDependency and stays one: `src/` imports only its *types*. The
composition root receives a pool from the caller, so the application has no
runtime dependency and never reads a connection string itself.

## Development

```bash
npm ci              # a lockfile is committed, so installs are reproducible
npm run typecheck
npm test
npm run verify      # typecheck + tests + governance + contracts
npm run check:migrations
npm run check:roadmap
```

## Layout

```
src/platform/       eventing, audit, http, ids, errors, clock
src/modules/        one folder per bounded module; only service.ts, domain.ts and
                    http.ts are importable from outside the module
contracts/openapi/  API contract (source of truth for the HTTP surface)
contracts/events/   JSON Schema per event type, plus the shared envelope
db/migrations/      forward and rollback SQL
docs/               ownership, event catalog, ADR enforcement
scripts/            governance, contract and roadmap gates run in CI
```

## Rules that CI enforces

- No MOVE- or MARKET-owned entity or table in CORE.
- No module reaching into another module's internals.
- No committed secrets.
- Every emitted event type has a published schema and a catalog entry.
- `ROADMAP.md` is updated in the same push as any implementation change.
