/**
 * Read-path parity: what a store *returns*, not only what it accepts.
 *
 * Six parity cycles gate writes. `putRow` refuses a row Postgres would refuse,
 * column by column, check by check, key by key. Nothing gated reads, and three
 * of the last three cycles found the same defect for the same reason:
 *
 *   - `outbox.created_at` — inserted by the Postgres adapter, selected by
 *     neither, absent from the reference record (milestone 18).
 *   - `inbound_event.processed_at` — the same shape, same cycle.
 *   - `rate_limit_counter.updated_at` — written by the database's own `now()`
 *     on one backend and by the injected clock on the other (milestone 19).
 *
 * Each was invisible to the whole suite because a column that one backend
 * writes and no read returns is a difference nothing can observe. Two of them
 * were closed by adding a name to a `SELECT_COLUMNS` string, and nothing kept
 * those strings complete — which is the gap this file closes.
 *
 * Two halves, deliberately different in kind:
 *
 *   1. **Static.** Every `select` and `returning` in the Postgres adapters is
 *      parsed, the column-list constants are expanded, and the result is
 *      compared with `COLUMN_SHAPES`. A column the schema has and no read
 *      surfaces must be declared, by name, with a reason. A declaration for a
 *      column that *is* read fails, so the list cannot rot into a permanent
 *      excuse. A name read that the schema does not have fails as well, which
 *      is also what keeps the parser honest: a mis-parse produces ghosts.
 *   2. **Behavioural.** For the four stores that return records, a row is
 *      written and read back through *both* backends and the two records are
 *      compared key for key. This is the gate that would have caught all three
 *      historical divergences on the day they were introduced, and it does not
 *      depend on reading SQL at all.
 *
 * The static half cannot prove a read is *correct*; it proves no column is
 * unreachable. The behavioural half cannot see a column no record carries; it
 * proves the two backends answer alike. Neither subsumes the other, and the
 * three known divergences needed both to be closed and kept closed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FixedClock } from "../src/platform/clock.js";
import { makeEvent } from "../src/platform/eventing/envelope.js";
import { UNFENCED } from "../src/platform/eventing/fencing.js";
import {
  memoryPersistence,
  postgresPersistence,
  type Persistence,
} from "../src/platform/persistence/backends.js";
import { COLUMN_SHAPES, shapedTables } from "../src/platform/persistence/column-shapes.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";
import { NOW, delivery, eventSubscription } from "./support/rows.js";

const url = process.env.DATABASE_URL;
const SOURCE_ROOT = new URL("../src", import.meta.url).pathname;

/* ------------------------------------------------------------------ *
 * The static half
 * ------------------------------------------------------------------ */

/**
 * A column no read surfaces, with the reason it is allowed to stay that way.
 *
 * The bar for an entry here is that the *store's interface* has no reader that
 * returns the row at all — not that the current callers happen not to need the
 * column. "Nobody needs it yet" is how `created_at` stayed invisible for
 * seventeen migrations.
 */
interface Unread {
  readonly table: string;
  readonly column: string;
  readonly why: string;
}

const UNREAD: readonly Unread[] = [
  // `InboxStore` is `claim`/`seen`/`release`/`size`: four questions, none of
  // which is "give me the row". `claim` returns whether the insert won,
  // `seen` is `select 1`. There is no record type for an inbox row on either
  // backend, so there is nothing a read could disagree about — and the write
  // path is fully gated as of milestone 19, which is what the behavioural half
  // would otherwise be checking.
  {
    // دخولُ الويبِ (XR-8.5): كلا مخزنَّي الدخولِ لا يعيدانِ صفًّا أصلًا — سؤالُهما
    // الوحيدُ «هل فازَ هذا الاستهلاكُ/التقبيلُ؟» (boolean من إدخالٍ مشروطٍ أو
    // تحديثٍ مشروطٍ)، فلا قراءةً تُعيدُ أيَّ عمودٍ زمنيٍّ. الأعمدةُ تُكتبُ كلُّها
    // عبرَ putRow فتخضعُ كتابتُها لبوابةِ الأعمدةِ كاملةً؛ ما لا يحدثُ هو
    // إعادتُها — وليسَ لذلكَ مستهلكٌ يختلفُ بينَ الخلفيتينِ أصلًا.
    table: "web_sign_in_nonces",
    column: "created_at",
    why: "the web sign-in stores return no record at all: both answer one boolean question (did this consume/issue win). Every column is written through putRow, so the write path is fully gated; only the read-back is absent, and no consumer of it exists",
  },
  {
    table: "web_sign_in_nonces",
    column: "attempt_hash",
    why: "same as web_sign_in_nonces.created_at: the store answers a boolean (did this browser's attempt win), returns no record, and no consumer of the column exists",
  },
  {
    table: "web_sign_in_nonces",
    column: "expires_at",
    why: "same as web_sign_in_nonces.created_at: the store answers a boolean, returns no record, and no consumer of the column exists",
  },
  {
    table: "web_sign_in_nonces",
    column: "consumed_at",
    why: "same as web_sign_in_nonces.created_at: the store answers a boolean, returns no record, and no consumer of the column exists",
  },
  {
    table: "inbox",
    column: "consumer",
    why: "InboxStore returns no record: claim reports whether the insert won, seen is `select 1`. Half of the primary key, so it is bound on every read as a predicate rather than returned",
  },
  {
    table: "inbox",
    column: "received_at",
    why: "InboxStore returns no record; the value is written from the injected clock and asserted directly against the database in tests/runtime-table-parity.test.ts, which is a stronger check than a read comparison",
  },
  // `RateLimitWindowStore` answers "how many hits in this window" and prunes.
  // Its four key columns are bound as predicates on every statement, and
  // `updated_at` is the divergence milestone 19 fixed — kept honest by a
  // fixed-clock database probe rather than by a read.
  {
    table: "rate_limit_counter",
    column: "subject_kind",
    why: "RateLimitWindowStore returns a count, not a row; part of the primary key, bound as a predicate on every statement",
  },
  {
    table: "rate_limit_counter",
    column: "subject_hash",
    why: "RateLimitWindowStore returns a count, not a row; part of the primary key, bound as a predicate on every statement",
  },
  {
    table: "rate_limit_counter",
    column: "rate_class",
    why: "RateLimitWindowStore returns a count, not a row; part of the primary key, bound as a predicate on every statement",
  },
  {
    table: "rate_limit_counter",
    column: "updated_at",
    why: "RateLimitWindowStore returns a count, not a row. This is the column milestone 19 found diverging (the Postgres store wrote it from the database's now()); it is held by a fixed-clock database probe in tests/runtime-table-parity.test.ts, which reads the stored value back out of Postgres — a read comparison could not have caught it, because no read returns it",
  },
];

/** Every `.ts` file under `src/`. */
function sourceFiles(dir: string = SOURCE_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith(".ts")) found.push(path);
  }
  return found;
}

/**
 * The column lists in these adapters are template constants, sometimes composed
 * of other constants (`const SELECT_COLUMNS = \`${COLUMNS}, created_at, …\``)
 * and sometimes aliases (`const DEL_SELECT_COLUMNS = DEL_COLUMNS;`). Both forms
 * are expanded before the statements are parsed; three passes is more than the
 * deepest nesting in the tree and the expansion is a fixed point after that.
 */
function expandConstants(source: string): string {
  let text = source;
  for (let pass = 0; pass < 3; pass += 1) {
    const constants: Record<string, string> = {};
    for (const match of text.matchAll(/const (\w+) = `([^`]*)`;/g)) {
      constants[match[1] as string] = match[2] as string;
    }
    for (const match of text.matchAll(/const (\w+) = (\w+);/g)) {
      const target = constants[match[2] as string];
      if (target !== undefined) constants[match[1] as string] = target;
    }
    text = text.replace(/\$\{(\w+)\}/g, (whole, name: string) => constants[name] ?? whole);
  }
  return text;
}

function columnNames(list: string): string[] {
  return list
    .split(",")
    .map((part) => (part.split(/\s+as\s+/i)[0] ?? "").trim().replace(/^\w+\./, ""))
    .filter((name) => /^\w+$/.test(name));
}

/** table -> the columns some statement in `src/` surfaces. `*` means all of them. */
function readColumns(): Map<string, Set<string>> {
  const reads = new Map<string, Set<string>>();
  const add = (table: string, column: string): void => {
    const set = reads.get(table) ?? new Set<string>();
    set.add(column);
    reads.set(table, set);
  };
  for (const file of sourceFiles()) {
    const text = expandConstants(readFileSync(file, "utf8"));
    for (const match of text.matchAll(/select\s+([\s\S]*?)\s+from\s+(\w+)/gi)) {
      const [, list = "", table = ""] = match;
      if (!(table in COLUMN_SHAPES)) continue;
      if (/^\s*\*\s*$/.test(list)) {
        add(table, "*");
        continue;
      }
      // `select 1`, `select count(*)`: existence and cardinality, not columns.
      if (!list.includes(",") && /count\(|^\s*1\s*$/i.test(list)) continue;
      for (const name of columnNames(list)) add(table, name);
    }
    // `delete … returning` counts: `prune` learns which windows it removed that
    // way, and a column surfaced by a delete is a column the caller can see.
    for (const match of text.matchAll(
      /(?:insert\s+into|update|delete\s+from)\s+(\w+)[\s\S]{0,3000}?returning\s+([^\n`;]*)/gi,
    )) {
      const [, table = "", list = ""] = match;
      if (!(table in COLUMN_SHAPES)) continue;
      if (list.includes("*")) {
        add(table, "*");
        continue;
      }
      for (const name of columnNames(list)) add(table, name);
    }
  }
  return reads;
}

describe("read-path parity: the columns a read can surface", () => {
  const reads = readColumns();

  it("parses enough to be worth asserting", () => {
    // Vacuity guard. A parser that silently matched nothing would make every
    // gate below pass, so the shape of its own output is checked first.
    // 31 since milestone 32 added `idempotency_key`; 30 before it.
    expect(shapedTables().length, "no shaped tables: the gates would be vacuous").toBe(32);
    expect(reads.size, "no table is read anywhere: the parser found nothing").toBeGreaterThan(25);
    const surfaced = [...reads.values()].reduce((total, set) => total + set.size, 0);
    expect(surfaced, "suspiciously few columns parsed").toBeGreaterThan(150);
  });

  it("surfaces no column the schema does not have", () => {
    // The reverse direction, and the parser's own honesty check: junk parsed out
    // of a comment or a fragment shows up here as a column no table has.
    const ghosts: string[] = [];
    for (const [table, columns] of reads) {
      const declared = (COLUMN_SHAPES[table] ?? []).map((shape) => shape.column);
      for (const column of columns) {
        if (column !== "*" && !declared.includes(column)) ghosts.push(`${table}.${column}`);
      }
    }
    expect(
      ghosts.sort(),
      "a read names a column the schema does not declare: either the read is broken or the shapes are stale",
    ).toEqual([]);
  });

  it("leaves no column unreachable without a recorded reason", () => {
    const excused = new Set(UNREAD.map((entry) => `${entry.table}.${entry.column}`));
    const unreachable: string[] = [];
    for (const table of shapedTables()) {
      const surfaced = reads.get(table) ?? new Set<string>();
      if (surfaced.has("*")) continue;
      for (const shape of COLUMN_SHAPES[table] ?? []) {
        const key = `${table}.${shape.column}`;
        if (!surfaced.has(shape.column) && !excused.has(key)) unreachable.push(key);
      }
    }
    expect(
      unreachable.sort(),
      "a column the schema has is surfaced by no read and excused by no reason: it can diverge between the backends the way outbox.created_at did, and nothing would see it",
    ).toEqual([]);
  });

  it("keeps no excuse that has stopped being true", () => {
    const stale: string[] = [];
    for (const entry of UNREAD) {
      const shapes = COLUMN_SHAPES[entry.table];
      if (!shapes) {
        stale.push(`${entry.table}.${entry.column}: the table is no longer shaped`);
        continue;
      }
      if (!shapes.some((shape) => shape.column === entry.column)) {
        stale.push(`${entry.table}.${entry.column}: the column no longer exists`);
        continue;
      }
      const surfaced = reads.get(entry.table) ?? new Set<string>();
      if (surfaced.has("*") || surfaced.has(entry.column)) {
        stale.push(`${entry.table}.${entry.column}: something reads it now`);
      }
      if (entry.why.trim().length < 40) stale.push(`${entry.table}.${entry.column}: no real reason`);
    }
    expect(
      stale.sort(),
      "an unread declaration outlived its reason: it now excuses a column that is read, or a column that is gone",
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The behavioural half
 * ------------------------------------------------------------------ */

/**
 * One record written and read back on one backend.
 *
 * Each probe writes through the store's own writer and reads through the
 * store's own reader, so what it compares is the pair of records the rest of
 * CORE would see — not two rows assembled by the test.
 */
interface RoundTrip {
  readonly what: string;
  /**
   * `id` is supplied by the caller and is the *same* on both backends within one
   * comparison and different between comparisons: the two records must be
   * identical to each other, and a probe must not depend on a row a previous
   * assertion left behind.
   */
  run(store: Persistence, id: string): Promise<Record<string, unknown>>;
}

const CLOCK_AT = new Date("2026-03-01T12:00:00.000Z");

const ROUND_TRIPS: readonly RoundTrip[] = [
  {
    what: "outbox: append then get",
    async run(store, id) {
      const event = {
        ...makeEvent({
        event_type: "core.fulfillment.completed",
        version: 1,
        producer: "core",
        occurred_at: new Date(NOW),
        correlation_id: "corr-read-path",
        entity_type: "fulfillment",
        entity_id: id,
        payload: {},
        }),
        event_id: id,
      };
      await store.outbox.append(event, NO_SCOPE);
      const record = await store.outbox.get(event.event_id);
      return record as unknown as Record<string, unknown>;
    },
  },
  {
    what: "inbound_event: accept then get",
    async run(store, id) {
      const event = {
        ...makeEvent({
        event_type: "move.job.completed",
        version: 1,
        producer: "move",
        occurred_at: new Date(NOW),
        correlation_id: "corr-read-path",
        entity_type: "fulfillment",
        entity_id: id,
        payload: {},
        }),
        event_id: id,
      };
      await store.inbound.accept(event);
      // Claimed and completed before the read, deliberately: `processed_at` is
      // null on a freshly accepted row, and a probe that reads a row whose
      // interesting column is null cannot tell a backend that surfaces the
      // column from one that does not. Falsified by removing `processed_at`
      // from the adapter's select list — with the row processed, the value
      // comparison fails as well as the static gate.
      const claimed = await store.inbound.claimDue(new Date(CLOCK_AT.getTime() + 60_000), 10);
      expect(claimed.length, "the accepted event was not claimable").toBe(1);
      await store.inbound.markProcessed(event.event_id, claimed[0]?.claim_token ?? UNFENCED);
      const record = await store.inbound.get(event.event_id);
      return record as unknown as Record<string, unknown>;
    },
  },
  {
    what: "audit_entry: record then read back by entity",
    async run(store, id) {
      const entry = await store.audit.record({
        actor_type: "system",
        actor_id: null,
        action: "read.path.probe",
        entity_type: "fulfillment",
        entity_id: id,
        correlation_id: "corr-read-path",
        metadata: { probe: true },
      });
      const found = await store.audit.forEntity("fulfillment", id);
      // Both the returned entry and the stored one, so a writer that returns a
      // richer object than the reader can produce is caught too.
      return { returned: entry, read: found[0] } as unknown as Record<string, unknown>;
    },
  },
];

/** Fields whose value is legitimately backend-specific or generated. */
const GENERATED = new Set(["audit_id"]);

/**
 * Compares the *shape* of two records: every key, at every depth, on both
 * sides. This is the comparison that catches a column one backend surfaces and
 * the other does not, which is exactly what the three historical divergences
 * were.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  const paths: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    paths.push(...keyPaths(nested, prefix ? `${prefix}.${key}` : key));
  }
  return paths.sort();
}

function withoutGenerated(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(withoutGenerated);
  const copy: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!GENERATED.has(key)) copy[key] = withoutGenerated(nested);
  }
  return copy;
}

describe.runIf(url)("read-path parity: the two backends return the same record", () => {
  let pool: { end(): Promise<void> } | undefined;
  let postgres: Persistence;
  let memory: Persistence;

  beforeAll(async () => {
    const { Pool } = await import("pg");
    const created = new Pool({ connectionString: url });
    pool = created;
    const clock = new FixedClock(CLOCK_AT);
    postgres = postgresPersistence(created as never, clock);
    memory = memoryPersistence(clock);
    await created.query(
      `truncate outbox, inbound_event, event_delivery, event_subscription, audit_entry restart identity cascade`,
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  for (const probe of ROUND_TRIPS) {
    it(`returns the same keys from both backends — ${probe.what}`, async () => {
      const id = randomUUID();
      const fromMemory = await probe.run(memory, id);
      const fromPostgres = await probe.run(postgres, id);
      expect(fromMemory, "the reference backend returned nothing to compare").toBeTruthy();
      expect(fromPostgres, "the Postgres backend returned nothing to compare").toBeTruthy();
      expect(
        keyPaths(fromPostgres),
        "the two backends return records of different shapes: a column one of them surfaces the other does not",
      ).toEqual(keyPaths(fromMemory));
    });

    it(`returns the same values from both backends — ${probe.what}`, async () => {
      // Same fixed clock, same ids, same input: under those conditions the two
      // records are not merely the same shape, they are the same record.
      const id = randomUUID();
      const fromMemory = withoutGenerated(await probe.run(memory, id));
      const fromPostgres = withoutGenerated(await probe.run(postgres, id));
      expect(
        fromPostgres,
        "the two backends read back different values for the same write",
      ).toEqual(fromMemory);
    });
  }

  it("reads back every column of a delivery, including the claim fields", async () => {
    // `event_delivery` has the widest read list in CORE (13 columns) and it got
    // that way by correction: the claim columns were left out of the insert
    // until the check-parity cycle bound them. A listing is the only reader, so
    // it is compared directly rather than through the generic probes.
    const subscription = eventSubscription("read-path", "core.fulfillment.completed");
    const event = {
        ...makeEvent({
      event_type: "core.fulfillment.completed",
      version: 1,
      producer: "core",
      occurred_at: new Date(NOW),
      correlation_id: "corr-read-path",
      entity_type: "fulfillment",
      entity_id: "66666666-6666-4666-8666-666666666666",
      payload: {},
        }),
        event_id: "77777777-7777-4777-8777-777777777777",
      };
    const shape = (COLUMN_SHAPES["event_delivery"] ?? []).map((column) => column.column);
    expect(shape.length, "event_delivery has no declared shape").toBe(13);

    for (const store of [memory, postgres]) {
      await store.outbox.append(event, NO_SCOPE);
      await store.delivery.insertSubscription(subscription);
      const row = delivery(event.event_id, subscription.subscription_id);
      await store.delivery.queue(row);
      const listed = await store.delivery.forEvent(event.event_id);
      expect(listed.length, `${store.kind}: the delivery was not read back`).toBe(1);
      const record = listed[0] as unknown as Record<string, unknown>;
      const missing = shape.filter((column) => !(column in record));
      expect(
        missing,
        `${store.kind}: a delivery column the schema has is missing from what a read returns`,
      ).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Reference-only behaviour, so the file is not vacuous without a database
 * ------------------------------------------------------------------ */

describe("read-path parity: the reference records carry every shaped column", () => {
  it("returns an outbox record whose keys cover the table", async () => {
    const clock = new FixedClock(CLOCK_AT);
    const store = memoryPersistence(clock);
    const event = makeEvent({
      event_type: "core.fulfillment.completed",
      version: 1,
      producer: "core",
      occurred_at: new Date(NOW),
      correlation_id: "corr-read-path",
      entity_type: "fulfillment",
      entity_id: randomUUID(),
      payload: {},
    });
    await store.outbox.append(event, NO_SCOPE);
    const record = (await store.outbox.get(event.event_id)) as unknown as Record<string, unknown>;
    expect(record, "the reference outbox returned nothing").toBeTruthy();
    // The envelope's own columns live under `event`; the rest are top level.
    const flat = new Set([...Object.keys(record), ...Object.keys(record["event"] ?? {})]);
    const missing = (COLUMN_SHAPES["outbox"] ?? [])
      .map((column) => column.column)
      .filter((column) => !flat.has(column));
    expect(
      missing,
      "the reference outbox record does not carry a column the table has: it can be written and never surfaced",
    ).toEqual([]);
  });
});
