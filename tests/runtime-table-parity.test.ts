/**
 * The tables the parity work never reached (milestone 19).
 *
 * Five parity cycles and a column cycle all measured the same 28 tables,
 * because those are the tables with a `ROW_RULES` entry — and the reason they
 * have one is that somebody wrote one. The cycle that closed column parity said
 * the four tables outside that set are "migration bookkeeping, written by the
 * migration runner rather than by a store". Re-measuring found that wrong, and
 * this file is what stops the same claim being made again:
 *
 * - `inbox` is written on every consumer claim (ADR 0009). Its `event_id` is a
 *   `uuid` column; the reference store kept a `Set` of composed strings, so
 *   `claim(consumer, "not-a-uuid")` was accepted in memory and refused by
 *   Postgres.
 * - `rate_limit_counter` is written on every request. It carries **three**
 *   `CHECK` constraints, all three of which were recorded in
 *   `tests/check-parity.test.ts` as unprobeable *because the reference limiter
 *   held no row*.
 * - `idempotency_key` was written by nothing at all. Milestone 32 made it the
 *   record of a keyed route's answer, so it is written on every successful
 *   call to one, and its exemption is gone: it is declared in `COLUMN_SHAPES`,
 *   ruled in `ROW_RULES`, and gated like the rest. The sentence above is kept
 *   because it is what the table was, and B-37 — "a table nothing writes" — is
 *   what this milestone closed.
 * - `schema_migrations` is the one table the original sentence described.
 *
 * The first two are rows now, and gated like the other 28; the third became one
 * in milestone 32. `schema_migrations` remains the single exemption — and an
 * exemption in this repository is a claim a test tries to break, not a sentence
 * in a document, so it is asserted here.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLUMN_SHAPES, shapedTables } from "../src/platform/persistence/column-shapes.js";
import { RATE_LIMIT_VOCABULARIES, ROW_RULES } from "../src/platform/persistence/row-rules.js";
import { InMemoryInbox } from "../src/platform/eventing/inbox.js";
import { PgInbox } from "../src/platform/eventing/pg-inbox.js";
import { InMemoryRateLimitWindowStore } from "../src/platform/http/rate-limit.js";
import { PgRateLimitWindowStore } from "../src/platform/http/pg-rate-limit.js";
import type { Clock } from "../src/platform/clock.js";

const url = process.env.DATABASE_URL;

/** The instant every store in this file is asked to stamp its rows with. */
const FIXED = new Date("2026-09-13T07:30:00.000Z");
const clock: Clock = { now: () => FIXED };

/**
 * Tables deliberately outside the gate, each with the claim that keeps it out.
 *
 * `holds` is what a test below tries to falsify — not a comment, a predicate.
 */
const EXEMPT: readonly {
  table: string;
  why: string;
  /** Source files allowed to name the table in SQL. Empty means none may. */
  writtenBy: readonly string[];
}[] = [
  {
    table: "schema_migrations",
    // Measured, and it corrected the guess this file started with: nothing in
    // `src/` or `scripts/` writes this table. Each forward migration inserts
    // its own version row as its last statement, and `scripts/db-migrate.mjs`
    // only *reads* the table to decide what is left to apply — which is a
    // stronger arrangement than a runner that records the work it did, because
    // the record and the work land in the same transaction. Asserted below.
    why: "written by the migration files themselves, each recording its own version in the same transaction as its DDL; nothing in src/ or scripts/ writes it, and there is no reference backend for 'has this migration been applied', only a database",
    writtenBy: [],
  },
  // `idempotency_key` was the second exemption until milestone 32. It is not
  // listed here any more because the reason no longer holds: the router writes
  // it through `InMemoryRetryRecordStore` and `PgRetryRecordStore`, so there is
  // a write to gate, and the gate below — which fails a table that is both
  // excused and written — is what would have caught it had the exemption been
  // left in place.
];


function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts") || path.endsWith(".mjs")) out.push(path);
    }
  };
  walk(root);
  return out;
}

/** `insert into t`, `update t`, `delete from t` — a write, not a mention. */
function writesTo(source: string, table: string): boolean {
  return new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+${table}\\b`, "i").test(source);
}

describe("runtime tables: the two that were outside every gate", () => {
  it("gates inbox and rate_limit_counter like every other written table", () => {
    expect(shapedTables()).toContain("inbox");
    expect(shapedTables()).toContain("rate_limit_counter");
    expect(Object.keys(ROW_RULES)).toContain("inbox");
    // Three rules for three CHECK constraints, restated where the store can see
    // them rather than excused because the store had no row.
    expect(ROW_RULES.rate_limit_counter.map((rule) => rule.constraint).sort()).toEqual([
      "rate_limit_counter_hits_ck",
      "rate_limit_counter_rate_class_ck",
      "rate_limit_counter_subject_kind_ck",
    ]);
  });

  it("refuses a consumer claim for an event id that is not an id", async () => {
    const inbox = new InMemoryInbox(clock);
    await expect(inbox.claim("mover", "not-a-uuid")).rejects.toThrow(
      `invalid input syntax for type uuid: "not-a-uuid"`,
    );
    // And the refusal is a refusal, not a half-write: nothing was claimed, so a
    // retry of the same bad delivery is still a first arrival rather than a
    // silently swallowed one.
    expect(await inbox.size()).toBe(0);
  });

  it("still claims exactly once for a well-formed event id", async () => {
    const inbox = new InMemoryInbox(clock);
    const eventId = randomUUID();
    expect(await inbox.claim("mover", eventId)).toBe(true);
    expect(await inbox.claim("mover", eventId)).toBe(false);
    expect(await inbox.seen("mover", eventId)).toBe(true);
    await inbox.release("mover", eventId);
    expect(await inbox.seen("mover", eventId)).toBe(false);
    expect(await inbox.size()).toBe(0);
  });

  it("refuses a rate-limit window outside either closed vocabulary", async () => {
    const limiter = new InMemoryRateLimitWindowStore(clock);
    await expect(
      limiter.hit({ subject_kind: "ghost" as never, subject_hash: "h", rate_class: "read" }, FIXED),
    ).rejects.toThrow("rate_limit_counter_subject_kind_ck");
    await expect(
      limiter.hit(
        { subject_kind: "network", subject_hash: "h", rate_class: "ghost" as never },
        FIXED,
      ),
    ).rejects.toThrow("rate_limit_counter_rate_class_ck");
  });

  it("still counts, and still prunes, now that the counter is a row", async () => {
    const limiter = new InMemoryRateLimitWindowStore(clock);
    const key = { subject_kind: "network", subject_hash: "h", rate_class: "read" } as const;
    expect(await limiter.hit(key, FIXED)).toBe(1);
    expect(await limiter.hit(key, FIXED)).toBe(2);
    // A different window is a different row, not a continuation of this one.
    const later = new Date(FIXED.getTime() + 60_000);
    expect(await limiter.hit(key, later)).toBe(1);
    expect(await limiter.prune(later)).toBe(1);
    expect(await limiter.prune(new Date(later.getTime() + 1))).toBe(1);
    expect(await limiter.prune(new Date(later.getTime() + 1))).toBe(0);
  });
});

describe("runtime tables: the two exemptions, tried rather than trusted", () => {
  it("names an exemption for every written table the gate does not cover", () => {
    // Derived from the migrations rather than from a list in this file: a
    // migration that adds a table gets it gated or gets it excused, and cannot
    // quietly do neither.
    const dir = new URL("../db/migrations", import.meta.url).pathname;
    const created = new Set<string>();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)) {
        created.add(match[1]!.toLowerCase());
      }
    }
    expect(created.size, "no tables parsed: the gate would pass vacuously").toBeGreaterThan(20);
    const gated = new Set(shapedTables());
    const excused = new Set(EXEMPT.map((entry) => entry.table));
    const ungoverned = [...created].filter((table) => !gated.has(table) && !excused.has(table));
    expect(
      ungoverned.sort(),
      "a table the schema creates is neither gated nor excused; the reference backend is free to accept what Postgres refuses in it",
    ).toEqual([]);
    const stale = [...excused].filter((table) => !created.has(table));
    expect(stale, "an exemption names a table the schema no longer creates").toEqual([]);
    const alsoGated = [...excused].filter((table) => gated.has(table));
    expect(alsoGated, "a table is both gated and excused: one of the two is a lie").toEqual([]);
  });

  it("finds every forward migration recording its own version", () => {
    // The other half of the `schema_migrations` exemption: the table is not
    // gated because no store writes it, and this is what makes "the migrations
    // write it" true rather than assumed.
    const dir = new URL("../db/migrations", import.meta.url).pathname;
    const forward = readdirSync(dir).filter(
      (file) => file.endsWith(".sql") && !file.endsWith(".down.sql"),
    );
    // 20 since milestone 32's 0020 gave `idempotency_key` the columns a record
    // of an answer needs; 19 before it. 21 since milestone 33's 0021 gave the
    // same table the columns a *claim* needs, so the row can be written before
    // the work rather than after it. 23 since XR-8.5's 0023 created the
    // one-time web sign-in token ledger.
    expect(forward.length, "no migrations found: the gate would pass vacuously").toBe(23);
    const silent = forward.filter((file) => {
      const sql = readFileSync(join(dir, file), "utf8");
      const version = file.replace(/\.sql$/, "");
      return !new RegExp(`insert\\s+into\\s+schema_migrations[\\s\\S]*'${version}'`, "i").test(sql);
    });
    expect(
      silent,
      "a forward migration does not record its own version, so the runner would apply it again",
    ).toEqual([]);
  });

  it("proves each exemption by finding nothing that writes the table", () => {
    const files = [...sourceFiles(new URL("../src", import.meta.url).pathname), ...sourceFiles(new URL("../scripts", import.meta.url).pathname)];
    expect(files.length, "no sources scanned: the gate would pass vacuously").toBeGreaterThan(50);
    const problems: string[] = [];
    for (const entry of EXEMPT) {
      const writers = files
        .filter((file) => writesTo(readFileSync(file, "utf8"), entry.table))
        .map((file) => file.slice(file.indexOf("/wasla-core/") + "/wasla-core/".length))
        .sort();
      const allowed = [...entry.writtenBy].sort();
      if (JSON.stringify(writers) !== JSON.stringify(allowed)) {
        problems.push(
          `${entry.table}: written by ${writers.join(", ") || "nothing"}, declared ${allowed.join(", ") || "nothing"}`,
        );
      }
      if (entry.why.trim().length === 0) problems.push(`${entry.table}: no reason recorded`);
    }
    expect(
      problems,
      "an exemption's reason is no longer true: something writes a table nothing was supposed to write, so it needs gating rather than excusing",
    ).toEqual([]);
  });
});

describe.skipIf(!url)("runtime tables against the live schema", () => {
  it("reads both rate-limit vocabularies out of the schema and compares them", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const declared = await pool.query<{ name: string; def: string }>(
        `select conname as name, pg_get_constraintdef(oid) as def
           from pg_constraint
          where conrelid = 'rate_limit_counter'::regclass and contype = 'c'`,
      );
      expect(declared.rows.length, "no constraints read: vacuous").toBe(3);
      const vocabularyOf = (name: string): string[] => {
        const def = declared.rows.find((row) => row.name === name)?.def ?? "";
        return [...def.matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1]!).sort();
      };
      // The two arrays in `row-rules.ts` cannot be tied to a domain union at
      // typecheck time (the unions live in `platform/http`, which persistence
      // must not import — ADR 0017), so they are tied to the schema here.
      // Compared with the arrays the reference limiter actually enforces, not
      // with literals repeated in this file: repeating them here would have
      // made the gate pass while `row-rules.ts` drifted, which is exactly the
      // failure it exists to catch (falsified by widening the array — the gate
      // fails).
      expect(vocabularyOf("rate_limit_counter_subject_kind_ck")).toEqual(
        [...RATE_LIMIT_VOCABULARIES.subject_kind].sort(),
      );
      expect(vocabularyOf("rate_limit_counter_rate_class_ck")).toEqual(
        [...RATE_LIMIT_VOCABULARIES.rate_class].sort(),
      );
      // And the literals are still what the schema says, so a simultaneous
      // edit to both sides is still caught.
      expect([...RATE_LIMIT_VOCABULARIES.rate_class].sort()).toEqual([
        "ingress_events",
        "read",
        "unmatched",
        "write",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("stamps both tables from the injected clock, not from the database's", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      await pool.query("delete from inbox where consumer = 'parity-probe'");
      await pool.query("delete from rate_limit_counter where subject_hash = 'parity-probe'");
      const eventId = randomUUID();
      expect(await new PgInbox(pool as never, clock).claim("parity-probe", eventId)).toBe(true);
      const received = await pool.query<{ received_at: Date }>(
        `select received_at from inbox where consumer = 'parity-probe' and event_id = $1`,
        [eventId],
      );
      expect(received.rows[0]?.received_at.toISOString()).toBe(FIXED.toISOString());

      // `updated_at` used to be the database's own `now()`: the one store in
      // CORE that told time by itself. A fixed clock is how that is visible.
      const limiter = new PgRateLimitWindowStore(pool as never, clock);
      await limiter.hit(
        { subject_kind: "network", subject_hash: "parity-probe", rate_class: "read" },
        FIXED,
      );
      await limiter.hit(
        { subject_kind: "network", subject_hash: "parity-probe", rate_class: "read" },
        FIXED,
      );
      const counter = await pool.query<{ hits: string; updated_at: Date }>(
        `select hits::text, updated_at from rate_limit_counter where subject_hash = 'parity-probe'`,
      );
      expect(counter.rows.length).toBe(1);
      expect(counter.rows[0]?.hits).toBe("2");
      // Both the insert and the `do update` branch take the injected instant.
      expect(counter.rows[0]?.updated_at.toISOString()).toBe(FIXED.toISOString());
    } finally {
      await pool.query("delete from inbox where consumer = 'parity-probe'").catch(() => {});
      await pool
        .query("delete from rate_limit_counter where subject_hash = 'parity-probe'")
        .catch(() => {});
      await pool.end();
    }
  });

  it("refuses the same bad claim in the same words on both backends", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("begin");
      let database: string | null = null;
      try {
        await client.query(
          `insert into inbox (consumer, event_id, received_at) values ($1, $2, $3)`,
          ["parity-probe", "not-a-uuid", FIXED],
        );
      } catch (error) {
        database = (error as Error).message;
      }
      let memory: string | null = null;
      try {
        await new InMemoryInbox(clock).claim("parity-probe", "not-a-uuid");
      } catch (error) {
        memory = (error as Error).message;
      }
      expect(database).not.toBeNull();
      expect(memory).toBe(database);
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
      await pool.end();
    }
  });

  it("declares the live shape of both runtime tables", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const columns = await pool.query<{
        table: string;
        column: string;
        format: string;
        notnull: boolean;
        def: string | null;
      }>(
        `select cl.relname as table, a.attname as column,
                format_type(a.atttypid, a.atttypmod) as format,
                a.attnotnull as notnull, pg_get_expr(d.adbin, d.adrelid) as def
           from pg_attribute a
           join pg_class cl on cl.oid = a.attrelid
           left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where cl.relname in ('inbox', 'rate_limit_counter')
            and a.attnum > 0 and not a.attisdropped
          order by cl.relname, a.attnum`,
      );
      // 3 + 6. The whole-schema version of this gate lives in
      // `tests/column-parity.test.ts`; this one is here so the two tables this
      // cycle added are checked by name even if the count gate is edited.
      expect(columns.rows.length).toBe(9);
      for (const column of columns.rows) {
        const declared = (COLUMN_SHAPES[column.table] ?? []).find(
          (shape) => shape.column === column.column,
        );
        expect(declared, `${column.table}.${column.column} is not declared`).toBeDefined();
        expect(declared?.notNull).toBe(column.notnull);
        expect(declared?.databaseDefault ?? null).toBe(column.def);
      }
    } finally {
      await pool.end();
    }
  });
});
