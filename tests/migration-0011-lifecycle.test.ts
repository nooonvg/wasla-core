import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The full lifecycle of migration 0011 against a real PostgreSQL server.
 *
 * 0011 widened two check constraints so a fulfillment can record
 * `partially_captured`, and its rollback deliberately **refuses** while any row
 * holds that value: narrowing the list back leaves no honest value for such a
 * row — `released` would claim no money moved and `captured` would claim all of
 * it did. That refusal is the safety property, so it is tested rather than
 * described, in both directions: it must refuse when such a row exists and it
 * must succeed when none does.
 *
 * Everything runs in a throwaway database created and dropped by this suite. It
 * applies and rolls back real DDL, so sharing the development database with the
 * rest of the suite would make the two interfere.
 *
 * That isolation was documented here and not enforced anywhere, and it cost this
 * file several cycles as a "known flake": it timed out in teardown under
 * full-suite load and passed in isolation. The cause was measured rather than
 * guessed. A scratch database isolates the *schema*; `create database` and
 * `drop database` are cluster-wide operations that do not. Timing one
 * create-and-drop pair on this machine: **0.3s** on an idle server and **51s**
 * while the rest of the suite was working the same server, against a 60s hook
 * timeout. So the flake was contention, and the file was right about needing
 * isolation and wrong to expect a comment to provide it.
 *
 * Two things changed, and both were needed. `npm test` now runs the lifecycle
 * files in their own pass, so nothing competes with these two statements — the
 * cause is removed rather than tolerated. And the hook timeouts here no longer
 * carry their own number: they inherit `vitest.config.ts`, so the timeout for a
 * cluster-wide operation is decided in one place instead of drifting per file.
 */

const url = process.env.DATABASE_URL;
const run = promisify(execFile);

const ORG = "11111111-1111-4111-8111-111111111111";

describe.skipIf(!url)("migration 0011 lifecycle", () => {
  let adminUrl: string;
  let scratchUrl: string;
  let scratch: string;

  async function admin<T = unknown>(sql: string): Promise<{ rows: T[] }> {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      return (await client.query(sql)) as unknown as { rows: T[] };
    } finally {
      await client.end();
    }
  }

  async function query<T = unknown>(sql: string): Promise<{ rows: T[] }> {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: scratchUrl });
    await client.connect();
    try {
      return (await client.query(sql)) as unknown as { rows: T[] };
    } finally {
      await client.end();
    }
  }

  /** The real runner, against the scratch database only. */
  async function migrate(...args: string[]): Promise<{ stdout: string; stderr: string }> {
    return await run("node", ["scripts/db-migrate.mjs", ...args], {
      env: { ...process.env, DATABASE_URL: scratchUrl },
    });
  }

  async function versions(): Promise<string[]> {
    const result = await query<{ version: string }>(
      "select version from schema_migrations order by version",
    );
    return result.rows.map((row) => row.version);
  }

  /** A fulfillment row written straight to SQL, bypassing the service. */
  async function insertFulfillment(reference: string, settlement: string, status: string) {
    await query(
      `insert into fulfillment (fulfillment_id, organization_id, market_order_reference,
         status, settlement_state, created_at, completed_at)
       values (gen_random_uuid(), '${ORG}', '${reference}', '${status}', '${settlement}',
         now(), now())`,
    );
  }

  /**
   * Rolls back one migration at a time until `version` itself is rolled back.
   *
   * The runner only ever removes the newest applied migration, so a test about
   * 0011 has to peel off whatever was added after it. A loop rather than a
   * fixed number of calls, because the fixed version is what broke when 0012
   * arrived: the assertions silently started describing the wrong migration.
   * A rejection from any step propagates, which is what step 5 relies on.
   */
  async function downThrough(version: string): Promise<{ stdout: string }> {
    for (let i = 0; i < 20; i++) {
      const applied = await versions();
      const newest = applied[applied.length - 1];
      const result = await migrate("down");
      if (newest === version) return result;
    }
    throw new Error(`rollback never reached ${version}`);
  }

  beforeAll(async () => {
    scratch = `wasla_mig_${Date.now().toString(36)}`;
    const parsed = new URL(url!);
    adminUrl = url!;
    parsed.pathname = `/${scratch}`;
    scratchUrl = parsed.toString();
    // `template0` rather than the default `template1`: creating from a template
    // requires that nobody else is connected to it, and template1 is what every
    // other `create database` on the server also copies. template0 is never
    // connected to by anything, so this cannot wait on an unrelated session.
    await admin(`create database ${scratch} template template0`);
  });

  afterAll(async () => {
    // `with (force)` terminates whatever is still attached instead of refusing.
    // Without it, one connection this file's own migration subprocesses had not
    // finished closing is enough to fail the drop and leave a database behind on
    // every run — and the failure would be reported as a teardown error about
    // something that is not the property under test.
    if (scratch) await admin(`drop database if exists ${scratch} with (force)`);
  });

  it("applies cleanly to an empty database, then over existing data, and rolls back and forward again", async () => {
    // 1. apply clean
    const first = await migrate("up");
    expect(first.stdout).toContain("0011_fulfillment_partial_settlement");
    expect(await versions()).toContain("0011_fulfillment_partial_settlement");

    // 2. roll back to 0010 with no rows in the new state — the rollback must
    //    succeed, because nothing depends on the widened list.
    const down = await downThrough("0011_fulfillment_partial_settlement");
    expect(down.stdout).toContain("0011_fulfillment_partial_settlement");
    expect(await versions()).not.toContain("0011_fulfillment_partial_settlement");

    // 3. apply over existing data: rows written under the pre-0011 constraints
    //    must survive the widening untouched.
    await query(
      `insert into organization (organization_id, name, country_code, source_system)
       values ('${ORG}', 'migration-lifecycle', 'SA', 'test')`,
    );
    await insertFulfillment("mig-released", "released", "cancelled");
    await insertFulfillment("mig-captured", "captured", "completed");
    await migrate("up");
    const survived = await query<{ market_order_reference: string; settlement_state: string }>(
      "select market_order_reference, settlement_state from fulfillment order by market_order_reference",
    );
    expect(survived.rows).toEqual([
      { market_order_reference: "mig-captured", settlement_state: "captured" },
      { market_order_reference: "mig-released", settlement_state: "released" },
    ]);

    // 4. the widened constraint actually accepts the new pair, and still
    //    refuses a value outside the list.
    await insertFulfillment("mig-partial", "partially_captured", "cancelled");
    await expect(insertFulfillment("mig-nonsense", "settled_somehow", "cancelled")).rejects.toThrow(
      /fulfillment_settlement_/,
    );

    // 5. rollback with a real row in the new state: it must refuse, and the row
    //    and the applied version must both still be there afterwards. This is
    //    the property that stops a rollback from silently rewriting money
    //    history into a value that is not true.
    await expect(downThrough("0011_fulfillment_partial_settlement")).rejects.toThrow(
      /partially_captured/,
    );
    expect(await versions()).toContain("0011_fulfillment_partial_settlement");
    expect(
      (await query("select 1 from fulfillment where settlement_state = 'partially_captured'")).rows,
    ).toHaveLength(1);

    // 6. once the operator has decided what those rows are — which is the part
    //    CORE cannot decide for them — the rollback goes through, and 0011
    //    re-applies afterwards. Deleting here stands in for that decision; it is
    //    a scratch database, not a policy.
    await query("delete from fulfillment where settlement_state = 'partially_captured'");
    await migrate("down");
    expect(await versions()).not.toContain("0011_fulfillment_partial_settlement");
    // Narrowed again: the pair the rollback exists to protect is refused.
    await expect(
      insertFulfillment("mig-partial-again", "partially_captured", "cancelled"),
    ).rejects.toThrow(/fulfillment_settlement_/);

    // 7. re-apply
    await migrate("up");
    expect(await versions()).toContain("0011_fulfillment_partial_settlement");
    await insertFulfillment("mig-partial-reapplied", "partially_captured", "failed");
    expect(
      (await query("select 1 from fulfillment where settlement_state = 'partially_captured'")).rows,
    ).toHaveLength(1);
  }, 120_000);
  it("0023: the nonce store appears with the journal row, disappears with it, and returns — a true inverse", async () => {
    // قد يكونُ هذا أولَ اختبارٍ في الملفِّ على قاعدةٍ فارغةٍ — up مرّةً يُطبّقُ
    // كلَّ شيءٍ (ومن بعدُها عدمٌ)، فالترحيلُ مطبَّقٌ قبلَ أيِّ سؤالٍ.
    await migrate("up");
    // فالجدولُ وسطرُهُ موجودانِ.
    const applied = await query<{ version: string }>(
      "select version from schema_migrations where version = '0023_web_sign_in_nonces'",
    );
    expect(applied.rows).toHaveLength(1);
    const table = await query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_name = 'web_sign_in_nonces'",
    );
    expect(table.rows).toHaveLength(1);
    const column = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'web_sign_in_nonces' and column_name = 'attempt_hash'`,
    );
    expect(column.rows).toHaveLength(1);

    // العكسُ: 0024 صارَ أحدثَ من 0023 (أعمدةُ الشاهدِ فوقَ سطرِ الترحيلِ هذا)،
    // فتراجُعُ واحدٌ يرفعُهُ أوّلًا، والذي بعدهُ يرفعُ 0023 نفسَهُ — الجدولُ
    // وسطرُ الترحيلِ معًا، لا نصفُ عكسٍ يتركُ أحدهما.
    await migrate("down");
    const down = await migrate("down");
    expect(down.stdout).toContain("0023_web_sign_in_nonces");
    expect(
      (await query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_name = 'web_sign_in_nonces'",
      )).rows,
    ).toHaveLength(0);
    expect(
      (await query<{ version: string }>(
        "select version from schema_migrations where version = '0023_web_sign_in_nonces'",
      )).rows,
    ).toHaveLength(0);

    // والعودةُ: up مرتينِ — أولاهما تأسيسٌ والثانيةُ عدمٌ (ON CONFLICT)،
    // والجدولُ يعودُ كما كانَ.
    await migrate("up");
    expect(
      (await query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_name = 'web_sign_in_nonces'",
      )).rows,
    ).toHaveLength(1);
    await migrate("up");
    expect(
      (await query<{ version: string }>(
        "select version from schema_migrations where version = '0023_web_sign_in_nonces'",
      )).rows,
    ).toHaveLength(1);
  });

  it("0024: the tombstone columns and partial indexes appear with the journal row, disappear with it, and return — a true inverse", async () => {
    // 0023 أعادَ كلَّ شيءٍ بـ«up» الأخيرةِ، فالترحيلُ 0024 مطبَّقٌ قبلَ أيِّ سؤالٍ.
    const applied = await query<{ version: string }>(
      "select version from schema_migrations where version = '0024_account_deletion'",
    );
    expect(applied.rows).toHaveLength(1);

    // فالأعمدةُ موجودةٌ، والفهرسانِ الجزئيانِ يحملانِ القاعدةَ، والقيدانِ
    // القديمانِ الكاملانِ مرفوعانِ — القيدُ الذي كانَ يمنعُ التكرارَ مهما ماتَ
    // السطرُ لم يعُد موجودًا، لأنَّ الفهرسَ الجزئيَّ هو الذي يقولُ «الوحيدُ بينَ
    // الأحياءِ» في المخططِ نفسِه.
    for (const [table, column] of [
      ["identity_link", "deleted_at"],
      ["membership", "deleted_at"],
    ] as const) {
      const found = await query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_name = '${table}' and column_name = '${column}'`,
      );
      expect(found.rows, `${table}.${column}`).toHaveLength(1);
    }
    const indexes = await query<{ indexname: string }>(
      `select indexname from pg_indexes
       where indexname in ('identity_link_channel_external_active_key', 'membership_principal_org_active_key')`,
    );
    expect(indexes.rows).toHaveLength(2);
    const oldConstraints = await query<{ conname: string }>(
      `select conname from pg_constraint
       where conname in ('identity_link_channel_type_external_id_key', 'membership_principal_id_organization_id_key')`,
    );
    expect(oldConstraints.rows).toHaveLength(0);

    // العكسُ: تراجُعٌ واحدٌ يرفعُ 0024 — فهو الأحدثُ — فتختفي الأعمدةُ
    // والفهرسانِ معًا، ويعودُ القيدانِ الكاملانِ، لا نصفُ عكسٍ يتركُ أحدهما.
    const down = await migrate("down");
    expect(down.stdout).toContain("0024_account_deletion");
    for (const [table, column] of [
      ["identity_link", "deleted_at"],
      ["membership", "deleted_at"],
    ] as const) {
      const found = await query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_name = '${table}' and column_name = '${column}'`,
      );
      expect(found.rows, `${table}.${column}`).toHaveLength(0);
    }
    const indexesGone = await query<{ indexname: string }>(
      `select indexname from pg_indexes
       where indexname in ('identity_link_channel_external_active_key', 'membership_principal_org_active_key')`,
    );
    expect(indexesGone.rows).toHaveLength(0);
    const constraintsBack = await query<{ conname: string }>(
      `select conname from pg_constraint
       where conname in ('identity_link_channel_type_external_id_key', 'membership_principal_id_organization_id_key')`,
    );
    expect(constraintsBack.rows).toHaveLength(2);

    // والعودةُ: up مرتينِ — أولاهما تأسيسٌ والثانيةُ عدمٌ (ON CONFLICT)،
    // والأعمدةُ والفهرسانِ يعودانِ كما كانا.
    await migrate("up");
    const restored = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'membership' and column_name = 'deleted_at'`,
    );
    expect(restored.rows).toHaveLength(1);
    await migrate("up");
    const journal = await query<{ version: string }>(
      "select version from schema_migrations where version = '0024_account_deletion'",
    );
    expect(journal.rows).toHaveLength(1);
  });

});
