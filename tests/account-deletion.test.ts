/**
 * Account deletion (D-XR-13) — the behaviour, end to end, on both backends.
 *
 * The contract gates above this file prove the shape: the route is declared,
 * its refusals are documented, its event is published and its payloads
 * conform. None of them prove the account actually ends. This file does, on
 * the only question that matters to the person asking: after the call, am I
 * gone?
 *
 * The answer is a tombstone, and every assertion below reads that choice back:
 * the identity row stays but reads as deleted and nameless, the sessions are
 * dead, the links and memberships are tombstoned, and the slots they held are
 * free — the same channel account can register afresh, and the same principal
 * can hold a live membership in the same organization again. Nothing is
 * removed, because the audit trail is append-only; everything is ended.
 *
 * Three rules this file learned the hard way, all from review of its first
 * green run:
 *
 *  - **The state it asserts about must exist before the deletion.** A person
 *    seeded with no membership made the membership assertions vacuous, so the
 *    person now joins as a plain `org_member` and the live membership is read
 *    back *before* the deletion ends it.
 *  - **One session proves one session.** Bulk revocation is the contract's
 *    promise, so the person is issued sessions on three channels and every
 *    one of them has to be dead afterwards.
 *  - **Memory is not the system.** The same suite runs against Postgres when
 *    `DATABASE_URL` is present, because a tombstone written by SQL and read
 *    back through the partial unique indexes of migration 0024 is a different
 *    proof from a `Map` marking a row. On the shared worker database the
 *    assertions are scoped to the entities each test created — the scenario's
 *    own deleter writes deletion events into the same outbox.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCoreApp, type CoreApp } from "../src/app.js";
import { FixedClock } from "../src/platform/clock.js";
import {
  memoryPersistence,
  postgresPersistence,
  type Persistence,
} from "../src/platform/persistence/backends.js";
import { seedTenant } from "./support/rows.js";
import { testId } from "./support/ids.js";
import { newId } from "../src/platform/ids.js";
import type { Role } from "../src/modules/identity-access/domain.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";

const ORG_A = testId("org-1");
const ORG_B = testId("org-2");
const PG_URL = process.env["DATABASE_URL"];

interface Harness {
  readonly core: CoreApp & { store: Persistence; clock: FixedClock };
  dispose(): Promise<void>;
}

/** The app, wired over whichever persistence the backend hands it. */
async function build(store: Persistence, clock: FixedClock): Promise<Harness["core"]> {
  const core = createCoreApp({ clock, persistence: store });
  for (const organizationId of [ORG_A, ORG_B]) {
    await seedTenant(store, organizationId);
  }
  return { ...core, store, clock };
}

type Backend = readonly [name: string, make: () => Promise<Harness>];

const BACKENDS: Backend[] = [
  [
    "memory",
    async () => {
      const clock = new FixedClock();
      const core = await build(memoryPersistence(clock), clock);
      return { core, dispose: async () => undefined };
    },
  ],
];

if (PG_URL !== undefined) {
  BACKENDS.push([
    "postgres",
    async () => {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: PG_URL });
      const clock = new FixedClock();
      const core = await build(postgresPersistence(pool, clock), clock);
      return { core, dispose: () => pool.end() };
    },
  ]);
}

/** A registered person with a live membership and sessions, ready to act. */
async function person(
  core: Harness["core"],
  externalId: string,
  roles: Role[] = ["org_member"],
) {
  const registered = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: externalId,
    display_name: "A Person With A Name",
    correlation_id: "deletion",
  });
  if (roles.length > 0) {
    await core.identity.grantMembership({
      principal_id: registered.principal.principal_id,
      organization_id: ORG_A,
      roles,
      correlation_id: "deletion",
    });
  }
  // Three channels, three sessions: the contract revokes them all, and one
  // token alone could not prove that. `partner_api` stays out because a
  // person is not issued for it (B-42).
  const sessions: string[] = [];
  for (const channel of ["web", "telegram", "email"] as const) {
    const { token } = await core.identity.issueSession({
      principal_id: registered.principal.principal_id,
      channel_type: channel,
      correlation_id: "deletion",
    });
    sessions.push(token);
  }
  const actor = await core.identity.authenticate(sessions[0]!);
  return { registered, sessions, actor };
}

for (const [name, make] of BACKENDS) {
  describe(`account deletion (${name})`, () => {
    let harness: Harness;

    beforeAll(async () => {
      harness = await make();
    });

    afterAll(async () => {
      await harness.dispose();
    });

    it("ends the account: deleted, nameless, unauthenticated, tombstoned", async () => {
      const core = harness.core;
      const who = await person(core, `gone-1-${name}`);

      // The membership this test is about must be live before it can be ended.
      expect(
        await core.store.identity.listMemberships(who.registered.principal.principal_id),
      ).toHaveLength(1);

      const answer = await core.identity.deleteAccount(who.actor, {
        correlation_id: "deletion",
      });

      expect(answer.identity_id).toBe(who.registered.identity.identity_id);
      expect(answer.deleted_at).toBe(core.clock.now().toISOString());

      // The row stays, and says what it now is: deleted, and carrying no name.
      const identity = await core.store.identity.getIdentity(who.registered.identity.identity_id);
      expect(identity?.status).toBe("deleted");
      expect(identity?.display_name).toBeNull();

      // Every session is revoked — every channel the person held, not only
      // the token that asked.
      for (const token of who.sessions) {
        await expect(core.identity.authenticate(token)).rejects.toThrow(/expired or revoked/);
      }

      // The membership and the link are tombstones, not removals: reads stop
      // seeing them, and the slots they held are free (proven below). That the
      // rows themselves stay is what the identity row above already shows — the
      // deletion is one transaction that ends, never removes.
      expect(
        await core.store.identity.listMemberships(who.registered.principal.principal_id),
      ).toHaveLength(0);
      expect(
        await core.store.identity.listLinksForIdentity(who.registered.identity.identity_id),
      ).toHaveLength(0);
    });

    it("emits the event exactly once, and records the audit row once", async () => {
      const core = harness.core;
      const who = await person(core, `gone-2-${name}`);

      await core.identity.deleteAccount(who.actor, { correlation_id: "deletion" });
      // The retry a committed deletion owes its caller: the actor object is still
      // in hand, and the answer is the same, with nothing emitted or recorded a
      // second time.
      const again = await core.identity.deleteAccount(who.actor, { correlation_id: "deletion" });
      expect(again.identity_id).toBe(who.registered.identity.identity_id);

      // Scoped to this person's identity: on the shared worker database the
      // scenario's own deleter has written deletion events into the outbox.
      const identityId = who.registered.identity.identity_id;
      const events = (await core.outbox.all()).filter(
        (record) =>
          record.event.event_type === "core.identity.account.deleted" &&
          record.event.entity_id === identityId,
      );
      expect(events).toHaveLength(1);
      const payload = events[0]!.event.payload as Record<string, unknown>;
      expect(events[0]!.event.payload).toEqual({
        identity_id: identityId,
        principal_id: who.registered.principal.principal_id,
        deleted_at: payload.deleted_at,
      });

      const entries = await core.audit.forEntity("identity", identityId);
      const deletions = entries.filter((entry) => entry.action === "identity.account_deleted");
      expect(deletions).toHaveLength(1);
      expect(deletions[0]!.actor_id).toBe(who.registered.principal.principal_id);
    });

    it("frees the slots the tombstones leave behind", async () => {
      const core = harness.core;
      const who = await person(core, `gone-3-${name}`);
      expect(
        await core.store.identity.listMemberships(who.registered.principal.principal_id),
      ).toHaveLength(1);
      await core.identity.deleteAccount(who.actor, { correlation_id: "deletion" });

      // The channel slot: the same channel account registers afresh, as a new
      // person — the tombstone holds nothing.
      const fresh = await core.identity.registerIdentity({
        channel_type: "web",
        external_id: `gone-3-${name}`,
        correlation_id: "deletion",
      });
      expect(fresh.created).toBe(true);
      expect(fresh.identity.identity_id).not.toBe(who.registered.identity.identity_id);

      // The membership slot: the same principal can hold a live membership in
      // the same organization again, because the tombstone is not the pair.
      await expect(
        core.store.identity.insertMembership(
          {
            membership_id: newId(),
            principal_id: who.registered.principal.principal_id,
            organization_id: ORG_A,
            roles: ["org_member"],
            created_at: core.clock.now().toISOString(),
            deleted_at: null,
          },
          NO_SCOPE,
        ),
      ).resolves.toBeUndefined();
    });

    it("refuses an administrator, naming the organizations to transfer first", async () => {
      const core = harness.core;
      const admin = await person(core, `admin-1-${name}`, ["org_admin"]);
      const platform = await person(core, `admin-2-${name}`, ["platform_admin"]);

      for (const who of [admin, platform]) {
        await expect(
          core.identity.deleteAccount(who.actor, { correlation_id: "deletion" }),
        ).rejects.toMatchObject({
          code: "conflict",
          details: { organization_ids: [ORG_A] },
        });
      }

      // And nothing ended: the account is still there, still named.
      const identity = await core.store.identity.getIdentity(admin.registered.identity.identity_id);
      expect(identity?.status).toBe("active");
      expect(identity?.display_name).toBe("A Person With A Name");
      const identityId = admin.registered.identity.identity_id;
      expect(
        (await core.outbox.all()).filter(
          (record) =>
            record.event.event_type === "core.identity.account.deleted" &&
            record.event.entity_id === identityId,
        ),
      ).toHaveLength(0);
    });

    it("refuses a service credential: the person it speaks for must ask", async () => {
      const core = harness.core;
      const service = await core.identity.registerIdentity({
        channel_type: "partner_api",
        external_id: `svc-1-${name}`,
        service_name: "market",
        correlation_id: "deletion",
      });
      const { token } = await core.identity.issueSession({
        principal_id: service.principal.principal_id,
        channel_type: "partner_api",
        correlation_id: "deletion",
      });
      const actor = await core.identity.authenticate(token);

      await expect(
        core.identity.deleteAccount(actor, { correlation_id: "deletion" }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
  });
}
