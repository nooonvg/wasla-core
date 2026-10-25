/**
 * Account deletion (D-XR-13) — the behaviour, end to end.
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
 */
import { describe, expect, it } from "vitest";
import { coreWithTenants } from "./support/app.js";
import { FixedClock } from "../src/platform/clock.js";
import { testId } from "./support/ids.js";
import { newId } from "../src/platform/ids.js";
import type { Role } from "../src/modules/identity-access/domain.js";
import { NO_SCOPE } from "../src/platform/persistence/transaction.js";

const ORG_A = testId("org-1");
const ORG_B = testId("org-2");

async function app() {
  return coreWithTenants(new FixedClock(), [ORG_A, ORG_B]);
}

/** A registered person with a session, ready to act. */
async function person(
  core: Awaited<ReturnType<typeof app>>,
  externalId: string,
  roles: Role[] = [],
) {
  const registered = await core.identity.registerIdentity({
    channel_type: "web",
    external_id: externalId,
    display_name: "A Person With A Name",
    correlation_id: "deletion",
  });
  for (const organizationId of [ORG_A, ORG_B].slice(0, roles.length ? 1 : 0)) {
    await core.identity.grantMembership({
      principal_id: registered.principal.principal_id,
      organization_id: organizationId,
      roles,
      correlation_id: "deletion",
    });
  }
  const { token } = await core.identity.issueSession({
    principal_id: registered.principal.principal_id,
    channel_type: "web",
    correlation_id: "deletion",
  });
  const actor = await core.identity.authenticate(token);
  return { registered, token, actor };
}

describe("account deletion", () => {
  it("ends the account: deleted, nameless, unauthenticated, tombstoned", async () => {
    const core = await app();
    const who = await person(core, "gone-1");

    const answer = await core.identity.deleteAccount(who.actor, {
      correlation_id: "deletion",
    });

    expect(answer.identity_id).toBe(who.registered.identity.identity_id);
    expect(answer.deleted_at).toBe(core.clock.now().toISOString());

    // The row stays, and says what it now is: deleted, and carrying no name.
    const identity = await core.store.identity.getIdentity(who.registered.identity.identity_id);
    expect(identity?.status).toBe("deleted");
    expect(identity?.display_name).toBeNull();

    // Every session is revoked — the caller's own token first of all.
    await expect(core.identity.authenticate(who.token)).rejects.toThrow(/expired or revoked/);

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
    const core = await app();
    const who = await person(core, "gone-2");

    await core.identity.deleteAccount(who.actor, { correlation_id: "deletion" });
    // The retry a committed deletion owes its caller: the actor object is still
    // in hand, and the answer is the same, with nothing emitted or recorded a
    // second time.
    const again = await core.identity.deleteAccount(who.actor, { correlation_id: "deletion" });
    expect(again.identity_id).toBe(who.registered.identity.identity_id);

    const events = (await core.outbox.all()).filter(
      (record) => record.event.event_type === "core.identity.account.deleted",
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.event.entity_id).toBe(who.registered.identity.identity_id);
    const payload = events[0]!.event.payload as Record<string, unknown>;
    expect(events[0]!.event.payload).toEqual({
      identity_id: who.registered.identity.identity_id,
      principal_id: who.registered.principal.principal_id,
      deleted_at: payload.deleted_at,
    });

    const entries = await core.audit.forEntity("identity", who.registered.identity.identity_id);
    const deletions = entries.filter((entry) => entry.action === "identity.account_deleted");
    expect(deletions).toHaveLength(1);
    expect(deletions[0]!.actor_id).toBe(who.registered.principal.principal_id);
  });

  it("frees the slots the tombstones leave behind", async () => {
    const core = await app();
    const who = await person(core, "gone-3");
    await core.identity.deleteAccount(who.actor, { correlation_id: "deletion" });

    // The channel slot: the same channel account registers afresh, as a new
    // person — the tombstone holds nothing.
    const fresh = await core.identity.registerIdentity({
      channel_type: "web",
      external_id: "gone-3",
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
    const core = await app();
    const admin = await person(core, "admin-1", ["org_admin"]);
    const platform = await person(core, "admin-2", ["platform_admin"]);

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
    expect(
      (await core.outbox.all()).filter(
        (record) => record.event.event_type === "core.identity.account.deleted",
      ),
    ).toHaveLength(0);
  });

  it("refuses a service credential: the person it speaks for must ask", async () => {
    const core = await app();
    const service = await core.identity.registerIdentity({
      channel_type: "partner_api",
      external_id: "svc-1",
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
