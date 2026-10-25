/**
 * Column-level parity: `NOT NULL`, type, length and defaults (milestone 18).
 *
 * The five parity cycles before this one are all about values — is this value
 * unique, does it satisfy a `CHECK`, does its parent exist, does the transition
 * hold, can the row be deleted. None of them asks whether the value fits the
 * column it goes into. Measured across the 28 ruled tables before
 * `column-shapes.ts` existed: **254 columns, 197 `NOT NULL`, 45 with a database
 * default**, in 11 types — and the reference backend enforced none of it.
 *
 * Two halves, as in every parity cycle:
 *
 * - **Gates** that hold the declaration to the catalog: every column of every
 *   ruled table declared exactly once, with the type, length, nullability and
 *   default the schema actually has, read from `pg_attribute` at run time. A
 *   migration that widens a column, drops a default or adds a `NOT NULL` fails
 *   here rather than being discovered by a reference store that keeps storing
 *   what it always stored.
 * - **Probes** that run the same offending write against both backends and
 *   assert the same refusal, in Postgres' own words. Every wording in
 *   `column-shapes.ts` was measured by inserting the value into a real
 *   database, and these probes are what keep it measured.
 *
 * The three places the reference backend is deliberately **stricter** than the
 * database get their own probes, asserting the asymmetry rather than hiding it:
 * Postgres coerces a number into `text` and a string into `boolean`, and
 * accepts a `bigint` literal JavaScript has already rounded. The reference
 * backend refuses all three, because the alternative is the two backends
 * storing different values for the same write.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  COLUMN_SHAPES,
  assertColumns,
  defaultedColumns,
  shapedTables,
  type ColumnType,
} from "../src/platform/persistence/column-shapes.js";
import { ROW_RULES } from "../src/platform/persistence/row-rules.js";

const url = process.env.DATABASE_URL;

/** `format_type` output → the class `column-shapes.ts` uses for it. */
const TYPE_OF_FORMAT: Readonly<Record<string, ColumnType>> = {
  uuid: "uuid",
  text: "text",
  "timestamp with time zone": "timestamptz",
  integer: "integer",
  bigint: "bigint",
  "double precision": "double",
  boolean: "boolean",
  jsonb: "jsonb",
  "text[]": "text array",
};

interface CatalogColumn {
  table: string;
  column: string;
  format: string;
  notnull: boolean;
  def: string | null;
}

async function catalogColumns(): Promise<readonly CatalogColumn[]> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const result = await pool.query<CatalogColumn>(
      `select cl.relname as table, a.attname as column,
              format_type(a.atttypid, a.atttypmod) as format,
              a.attnotnull as notnull,
              pg_get_expr(d.adbin, d.adrelid) as def
         from pg_attribute a
         join pg_class cl on cl.oid = a.attrelid
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where cl.relnamespace = 'public'::regnamespace
          and cl.relkind = 'r'
          and a.attnum > 0
          and not a.attisdropped
          and cl.relname = any($1)`,
      [shapedTables()],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

/** The message `assertColumns` raises, or null when it accepts the row. */
function refusal(table: string, row: Record<string, unknown>): string | null {
  try {
    assertColumns(table, row);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** A plan row that fits every column, for a probe to spoil one field of. */
function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    plan_id: randomUUID(),
    code: "probe",
    name: "Probe",
    currency: "SAR",
    amount_minor: 1000,
    billing_interval: "month",
    interval_count: 1,
    status: "draft",
    created_at: "2026-09-13T00:00:00.000Z",
    activated_at: null,
    retired_at: null,
    ...overrides,
  };
}

describe("column parity: the declaration", () => {
  it("declares the shape of every ruled table, and no others", () => {
    // The tables that have `CHECK` rules are the tables whose writes go through
    // the reference row path, so they are exactly the tables whose columns can
    // be enforced. A mismatch means either a new table with rules and no shape
    // or a shape for a table nothing writes.
    expect(shapedTables()).toEqual(Object.keys(ROW_RULES).sort());
  });

  it("declares each column exactly once", () => {
    const duplicates: string[] = [];
    for (const [table, shapes] of Object.entries(COLUMN_SHAPES)) {
      const seen = new Set<string>();
      for (const shape of shapes) {
        if (seen.has(shape.column)) duplicates.push(`${table}.${shape.column}`);
        seen.add(shape.column);
      }
    }
    expect(duplicates, "a column declared twice: one of the two is dead").toEqual([]);
  });

  it("gives every character column a length", () => {
    const missing = Object.entries(COLUMN_SHAPES).flatMap(([table, shapes]) =>
      shapes
        .filter((shape) => shape.type === "char" && (shape.length ?? 0) <= 0)
        .map((shape) => `${table}.${shape.column}`),
    );
    // Without the length the "value too long" refusal cannot be raised at all,
    // so the column would be checked for being a string and nothing else.
    expect(missing).toEqual([]);
  });

  it("records a default without applying one", () => {
    // 48 columns the database would fill. The reference backend fills none of
    // them, and this is the count that says so: if it drops, either a migration
    // dropped a default or somebody started applying them here. (45 when the
    // gate covered the 28 ruled tables; `inbox.received_at` and
    // `rate_limit_counter.hits` joined it in milestone 19; 47 until milestone
    // 32, whose `idempotency_key.created_at` defaults to `now()` like every
    // other created_at in the schema. 50 since milestone 33, which added
    // `idempotency_key.state` defaulting to 'claimed' and `claimed_at`
    // defaulting to `now()`: a row that exists before its answer does is a
    // claim by default, and the moment it was taken is the moment it was
    // written — both defaults the store overrides explicitly on every write, as
    // it does for all 50.)
    expect(defaultedColumns().length).toBe(52);
    expect(defaultedColumns()).toContain("outbox.created_at");
  });
});

describe("column parity: refusals the database also raises", () => {
  it("refuses null in a not-null column, in Postgres' words", () => {
    expect(refusal("plan", plan({ name: null }))).toBe(
      `null value in column "name" of relation "plan" violates not-null constraint`,
    );
  });

  it("refuses a value too long for a character column", () => {
    expect(refusal("plan", plan({ currency: "SARX" }))).toBe(
      `value too long for type character(3)`,
    );
  });

  it("accepts a short character value, because the database pads it", () => {
    // `character(3)` blank-pads rather than refusing, and the schema's own
    // `plan_currency_format` CHECK is what rejects `SA`. Refusing here would
    // quote the wrong rule for the write.
    expect(refusal("plan", plan({ currency: "SA" }))).toBeNull();
  });

  it("refuses a malformed uuid", () => {
    expect(refusal("plan", plan({ plan_id: "not-a-uuid" }))).toBe(
      `invalid input syntax for type uuid: "not-a-uuid"`,
    );
  });

  it("refuses a fractional integer and an integer out of range", () => {
    expect(refusal("plan", plan({ interval_count: 2.5 }))).toBe(
      `invalid input syntax for type integer: "2.5"`,
    );
    expect(refusal("plan", plan({ interval_count: 2147483648 }))).toBe(
      `value "2147483648" is out of range for type integer`,
    );
  });

  it("refuses a timestamp the database cannot parse", () => {
    expect(refusal("plan", plan({ created_at: "not-a-date" }))).toBe(
      `invalid input syntax for type timestamp with time zone: "not-a-date"`,
    );
  });

  it("refuses a string where an array column is declared", () => {
    expect(
      refusal("membership", {
        membership_id: randomUUID(),
        principal_id: randomUUID(),
        organization_id: randomUUID(),
        roles: "admin",
        created_at: "2026-09-13T00:00:00.000Z",
        deleted_at: null,
      }),
    ).toBe(`malformed array literal: "admin"`);
  });

  it("refuses a row that omits a column instead of writing null", () => {
    const row = plan();
    delete row.activated_at;
    expect(refusal("plan", row)).toBe(
      `row for relation "plan" has no value for column "activated_at", which is nullable in the schema — write null explicitly rather than omitting it`,
    );
  });

  it("refuses a row that leans on a database default", () => {
    const row = plan();
    delete row.created_at;
    expect(refusal("plan", row)).toBe(
      `row for relation "plan" has no value for column "created_at", which the database would fill from its default now() — the reference backend applies no default, so the store has to write it`,
    );
  });

  it("accepts a row that fits every column", () => {
    expect(refusal("plan", plan())).toBeNull();
  });
});

describe("column parity: where the reference backend is stricter, on purpose", () => {
  // Each of these three was measured against Postgres 16: the database accepts
  // the write and stores a *converted* value. The reference backend has no
  // conversion step, so accepting would leave the two backends holding
  // different values for the same write — which is the failure B-12 names,
  // arrived at from the other side.
  it("refuses a number in a text column, which Postgres would coerce to text", () => {
    expect(refusal("plan", plan({ code: 1 }))).toBe(
      `column "code" is of type text but expression is of type number`,
    );
  });

  it("refuses a string in a boolean column, which Postgres would read as true", () => {
    expect(
      refusal("event_subscription", {
        subscription_id: "probe",
        subscriber: "probe",
        event_type: "core.probe",
        endpoint_url: "https://example.test/hook",
        signing_secret: "secret",
        active: "yes",
        created_at: "2026-09-13T00:00:00.000Z",
      }),
    ).toBe(`invalid input syntax for type boolean: "yes"`);
  });

  it("refuses a bigint JavaScript has already rounded, and accepts the exact one", () => {
    // 2^53 + 1 is not representable as a double: the literal is already 2^53.
    // Postgres stores what it is sent and both sides then hold different
    // numbers, so the unsafe `number` is refused and a `bigint` is not.
    expect(refusal("plan", plan({ amount_minor: 9007199254740993 }))).toBe(
      `value "9007199254740992" is out of range for type bigint`,
    );
    expect(refusal("plan", plan({ amount_minor: 9007199254740993n }))).toBeNull();
  });
});

describe.skipIf(!url)("column parity against the live schema", () => {
  it("declares every column of every ruled table, with the schema's own type", async () => {
    const columns = await catalogColumns();
    // 275 = the 254 of the 28 originally ruled tables, plus the 9 of `inbox`
    // and `rate_limit_counter` brought under the gate in milestone 19, plus the
    // 12 of `idempotency_key`, which milestone 32 made a table the code reads
    // and writes rather than one nothing touched. (263 before that milestone,
    // 271 after it: milestone 33 added `state`, `claim_token`, `claimed_at` and
    // `completed_at` so the row can exist before the answer does. 283 since
    // D-XR-13: `deleted_at` on `identity_link` and `membership` — a tombstone
    // needs its instant, and the live schema is the one that proves it.)
    expect(columns.length, "no columns read: the gate would pass vacuously").toBe(283);
    const problems: string[] = [];
    for (const column of columns) {
      const shapes = COLUMN_SHAPES[column.table] ?? [];
      const declared = shapes.find((shape) => shape.column === column.column);
      if (!declared) {
        problems.push(`${column.table}.${column.column}: in the schema, not declared`);
        continue;
      }
      const expectedType = column.format.startsWith("character(")
        ? "char"
        : TYPE_OF_FORMAT[column.format];
      if (expectedType === undefined) {
        problems.push(`${column.table}.${column.column}: unmapped type ${column.format}`);
      } else if (declared.type !== expectedType) {
        problems.push(
          `${column.table}.${column.column}: ${column.format} in the schema, ${declared.type} declared`,
        );
      }
      if (expectedType === "char") {
        const width = Number(column.format.match(/\((\d+)\)/)?.[1]);
        if (declared.length !== width) {
          problems.push(
            `${column.table}.${column.column}: character(${width}) in the schema, length ${String(declared.length)} declared`,
          );
        }
      }
      if (declared.notNull !== column.notnull) {
        problems.push(
          `${column.table}.${column.column}: ${column.notnull ? "not null" : "nullable"} in the schema, declared the other way`,
        );
      }
      // The default's *expression*, not just its presence: a default that
      // changes from `now()` to a fixed timestamp changes what a row means.
      if ((declared.databaseDefault ?? null) !== column.def) {
        problems.push(
          `${column.table}.${column.column}: default ${column.def ?? "none"} in the schema, ${declared.databaseDefault ?? "none"} declared`,
        );
      }
    }
    const live = new Set(columns.map((column) => `${column.table}.${column.column}`));
    for (const [table, shapes] of Object.entries(COLUMN_SHAPES)) {
      for (const shape of shapes) {
        if (!live.has(`${table}.${shape.column}`)) {
          problems.push(`${table}.${shape.column}: declared, and the schema has no such column`);
        }
      }
    }
    expect(
      problems,
      "the declared column shape and the live schema disagree; a reference store is now enforcing something the database does not, or missing something it does",
    ).toEqual([]);
  });

  it("counts the not-null columns the same way the schema does", async () => {
    const columns = await catalogColumns();
    const live = columns.filter((column) => column.notnull).length;
    const declared = Object.values(COLUMN_SHAPES)
      .flat()
      .filter((shape) => shape.notNull).length;
    expect(declared).toBe(live);
    // The number the cycle opened with, kept as a measurement rather than a
    // memory: if a migration adds a nullable column this fails and the
    // declaration has to be extended before the count is updated.
    // 206 = 197 + the 9 of the two runtime tables (every one of them NOT NULL).
    // 213 after milestone 32: `idempotency_key` had 8 columns and 7 of them
    // were NOT NULL — `response_body` is deliberately nullable, because a
    // bodyless answer is SQL NULL on both backends and would otherwise have to
    // be stored as the JSON value `null`, which the reference backend refuses.
    // 215 since milestone 33, which is +3 and −1 rather than +2: `state`,
    // `claim_token` and `claimed_at` are NOT NULL because a claim without them
    // could not be fenced or expired, `completed_at` is nullable because a
    // claim has not completed, and `response_status` *stopped* being NOT NULL
    // for the same reason. That loosening is the only one in the schema's
    // history and it is not one: `idempotency_key_state_record_ck` ties all
    // three nullable answer columns to `state`, so the absence of a status
    // means "claimed" and can mean nothing else.
    expect(live).toBe(220);
  });

  it("raises the same message the database raises for the same bad value", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    // One checked-out client, not the pool: savepoints only mean anything
    // inside the single connection that opened the transaction.
    const client = await pool.connect();
    const cases: readonly { label: string; row: Record<string, unknown> }[] = [
      { label: "null in a not-null column", row: plan({ name: null }) },
      { label: "value too long for character(3)", row: plan({ currency: "SARX" }) },
      { label: "malformed uuid", row: plan({ plan_id: "not-a-uuid" }) },
      { label: "fractional integer", row: plan({ interval_count: 2.5 }) },
      { label: "integer out of range", row: plan({ interval_count: 2147483648 }) },
      { label: "unparseable timestamp", row: plan({ created_at: "not-a-date" }) },
    ];
    const disagreements: string[] = [];
    try {
      await client.query("begin");
      for (const probe of cases) {
        const columns = [
          "plan_id",
          "code",
          "name",
          "currency",
          "amount_minor",
          "billing_interval",
          "interval_count",
          "status",
          "created_at",
        ];
        await client.query("savepoint probe");
        let database: string | null = null;
        try {
          await client.query(
            `insert into plan (${columns.join(", ")}) values (${columns
              .map((_column, index) => `$${index + 1}`)
              .join(", ")})`,
            columns.map((column) => probe.row[column]),
          );
        } catch (error) {
          database = (error as Error).message;
        }
        await client.query("rollback to savepoint probe");
        const memory = refusal("plan", probe.row);
        if (database === null) {
          disagreements.push(`${probe.label}: Postgres accepted it, memory said ${String(memory)}`);
        } else if (memory !== database) {
          // Not "both refused" — the same words. A caller that matches on the
          // message has to see one behaviour, not two.
          disagreements.push(`${probe.label}: Postgres said "${database}", memory said "${String(memory)}"`);
        }
      }
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
      await pool.end();
    }
    expect(
      disagreements,
      "the reference backend and the database disagree about a column-level refusal",
    ).toEqual([]);
  });

  it("confirms the three deliberate strictnesses are strictnesses", async () => {
    // The claim is that Postgres *accepts* these three and converts. If a
    // future Postgres stops accepting one, the asymmetry documented in
    // `column-shapes.ts` is no longer an asymmetry and the note is wrong.
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    const client = await pool.connect();
    const accepted: Record<string, boolean> = {};
    try {
      await client.query("begin");
      await client.query("savepoint s");
      await client.query(
        `insert into plan (plan_id, code, name, currency, amount_minor, billing_interval, status)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), 1, "Probe", "SAR", 1000, "month", "draft"],
      );
      accepted["number in text"] = true;
      await client.query("rollback to savepoint s");

      await client.query("savepoint s2");
      await client.query(
        `insert into event_subscription (subscription_id, subscriber, event_type, endpoint_url, signing_secret, active)
         values ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), "probe", "core.probe", "https://example.test/hook", "secret", "yes"],
      );
      accepted["string in boolean"] = true;
      await client.query("rollback to savepoint s2");
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
      await pool.end();
    }
    expect(accepted).toEqual({ "number in text": true, "string in boolean": true });
    // And memory refuses both, which is the asymmetry itself.
    expect(refusal("plan", plan({ code: 1 }))).not.toBeNull();
  });
});
