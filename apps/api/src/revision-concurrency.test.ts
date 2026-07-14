import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

describe("combat-critical optimistic concurrency", () => {
  it("rejects a stale actor PATCH with authoritative state and replays a successful idempotent retry", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
    const reviewedUpdatedAt = actor.updatedAt;
    const actorAuditCountBefore = store.state.auditLogs.filter((log) => log.targetType === "actor" && log.targetId === actor.id).length;
    const headers = { ...authHeaders, "idempotency-key": "actor-revision-client-one" };
    const payload = { name: "Valen from client one", expectedUpdatedAt: reviewedUpdatedAt };

    try {
      const first = await app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers, payload });
      expect(first.statusCode).toBe(200);
      expect(first.json().name).toBe("Valen from client one");
      expect(first.json().updatedAt).not.toBe(reviewedUpdatedAt);

      const replay = await app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: { ...authHeaders, "idempotency-key": "actor-revision-client-two" },
        payload: { name: "Valen from stale client two", expectedUpdatedAt: reviewedUpdatedAt }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        error: "conflict",
        code: "stale_write",
        resourceType: "actor",
        resourceId: actor.id,
        expectedUpdatedAt: reviewedUpdatedAt,
        currentUpdatedAt: first.json().updatedAt,
        current: expect.objectContaining({ id: actor.id, updatedAt: first.json().updatedAt })
      }));
      expect(actor.name).toBe("Valen from client one");
      expect(actor.updatedAt).toBe(first.json().updatedAt);
      expect(store.state.auditLogs.filter((log) => log.targetType === "actor" && log.targetId === actor.id)).toHaveLength(actorAuditCountBefore);
    } finally {
      await app.close();
    }
  });

  it("rejects stale combat and combatant PATCHes without mutation or audit", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats",
        headers: { ...authHeaders, "idempotency-key": "combat-revision-create" },
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
          manualTurnOrder: true,
          combatants: [{ id: "cmbt_revision_valen", tokenId: "tok_valen", actorId: "act_valen", name: "Valen", initiative: 10, defeated: false }]
        }
      });
      expect(created.statusCode).toBe(200);
      const reviewed = created.json();

      const first = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${reviewed.id}`,
        headers: { ...authHeaders, "idempotency-key": "combat-revision-first" },
        payload: { round: 2, expectedUpdatedAt: reviewed.updatedAt }
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual(expect.objectContaining({ round: 2 }));
      const combatAuditCountAfterFirst = store.state.auditLogs.filter((log) =>
        (log.targetType === "combat" && log.targetId === reviewed.id) ||
        (log.targetType === "combatant" && log.targetId === "cmbt_revision_valen")
      ).length;

      const staleCombat = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${reviewed.id}`,
        headers: { ...authHeaders, "idempotency-key": "combat-revision-stale-combat" },
        payload: { round: 3, expectedUpdatedAt: reviewed.updatedAt }
      });
      expect(staleCombat.statusCode).toBe(409);
      expect(staleCombat.json()).toEqual(expect.objectContaining({
        code: "stale_write",
        resourceType: "combat",
        resourceId: reviewed.id,
        expectedUpdatedAt: reviewed.updatedAt,
        currentUpdatedAt: first.json().updatedAt,
        current: expect.objectContaining({ id: reviewed.id, updatedAt: first.json().updatedAt })
      }));

      const staleCombatant = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${reviewed.id}/combatants/cmbt_revision_valen`,
        headers: { ...authHeaders, "idempotency-key": "combat-revision-stale-combatant" },
        payload: { defeated: true, expectedUpdatedAt: reviewed.updatedAt }
      });
      expect(staleCombatant.statusCode).toBe(409);
      const stored = store.state.combats.find((combat) => combat.id === reviewed.id)!;
      expect(stored.round).toBe(2);
      expect(stored.combatants[0]?.defeated).toBe(false);
      expect(store.state.auditLogs.filter((log) =>
        (log.targetType === "combat" && log.targetId === reviewed.id) ||
        (log.targetType === "combatant" && log.targetId === "cmbt_revision_valen")
      )).toHaveLength(combatAuditCountAfterFirst);
    } finally {
      await app.close();
    }
  });
});
