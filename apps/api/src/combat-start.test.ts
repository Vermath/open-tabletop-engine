import { createTimestamped, type Actor, type Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

function addAtomicCombatFixtures(store: MemoryStateStore) {
  const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
  const baseToken = store.state.tokens.find((item) => item.id === "tok_valen")!;
  const npc = createTimestamped("act", {
    id: "act_atomic_scout",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "monster" as const,
    name: "Atomic Scout",
    data: { attributes: { dexterity: 16 }, conditions: [] },
    permissions: {}
  }) satisfies Actor;
  const npcToken = {
    ...baseToken,
    id: "tok_atomic_scout",
    actorId: npc.id,
    name: npc.name,
    disposition: "hostile" as const
  } satisfies Token;
  const unlinkedToken = {
    ...baseToken,
    id: "tok_atomic_brazier",
    actorId: undefined,
    name: "Atomic Brazier",
    disposition: "neutral" as const
  } satisfies Token;
  store.state.actors.push(npc);
  store.state.tokens.push(npcToken, unlinkedToken);
  return { scene, npc, npcToken, unlinkedToken };
}

describe("atomic combat start", () => {
  it("creates final initiative, roll, chat, and combat state once across idempotent retries", async () => {
    const store = new MemoryStateStore();
    const { scene, npcToken, unlinkedToken } = addAtomicCombatFixtures(store);
    const app = await buildApp({ store });
    const originalRandom = Math.random;
    Math.random = () => 0;
    const before = {
      combats: store.state.combats.length,
      rolls: store.state.rolls.length,
      chat: store.state.chat.length
    };
    const payload = {
      expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
      sceneId: scene.id,
      participants: [
        { tokenId: "tok_valen", initiativeMode: "manual", initiative: 17 },
        { tokenId: npcToken.id, initiativeMode: "server" },
        { tokenId: unlinkedToken.id, initiativeMode: "manual", initiative: 8 }
      ]
    };
    const headers = { ...authHeaders, "idempotency-key": "combat-start-atomic-retry" };

    try {
      const started = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats/start",
        headers,
        payload
      });
      expect(started.statusCode).toBe(200);
      expect(started.headers["idempotency-replayed"]).toBeUndefined();
      expect(started.json().combat).toEqual(expect.objectContaining({ active: true, round: 1, turnIndex: 0 }));
      expect(started.json().combat.combatants).toEqual([
        expect.objectContaining({ tokenId: "tok_valen", actorId: "act_valen", initiative: 17 }),
        expect.objectContaining({ tokenId: unlinkedToken.id, initiative: 8 }),
        expect.objectContaining({ tokenId: npcToken.id, initiative: 4 })
      ]);
      expect(started.json().combat.combatants.some((combatant: { initiative: number }) => combatant.initiative === 0)).toBe(false);
      expect(started.json().rolls).toEqual([
        expect.objectContaining({ label: "Atomic Scout Initiative", formula: "1d20+3", total: 4 })
      ]);
      expect(started.json().chatMessages).toEqual([
        expect.objectContaining({ type: "roll", body: "Atomic Scout Initiative: 1d20+3 = 4" })
      ]);

      const retried = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats/start",
        headers,
        payload
      });
      expect(retried.statusCode).toBe(200);
      expect(retried.headers["idempotency-replayed"]).toBe("true");
      expect(retried.json()).toEqual(started.json());
      expect(store.state.combats).toHaveLength(before.combats + 1);
      expect(store.state.combats.filter((combat) => combat.active)).toHaveLength(1);
      expect(store.state.rolls).toHaveLength(before.rolls + 1);
      expect(store.state.chat).toHaveLength(before.chat + 1);
      expect(store.state.auditLogs.filter((log) => log.action === "combat.started" && log.targetId === started.json().combat.id)).toHaveLength(1);
      expect(store.state.auditLogs.some((log) => log.action === "combat.initiativeRolled" && log.targetId === started.json().combat.id)).toBe(false);
    } finally {
      Math.random = originalRandom;
      await app.close();
    }
  });

  it("keeps hidden participants and their initiative rolls GM-only", async () => {
    const store = new MemoryStateStore();
    const { scene, npcToken } = addAtomicCombatFixtures(store);
    npcToken.hidden = true;
    const app = await buildApp({ store });
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const started = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats/start",
        headers: { ...authHeaders, "idempotency-key": "combat-start-hidden-participants" },
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
          sceneId: scene.id,
          participants: [
            { tokenId: "tok_valen", initiativeMode: "manual", initiative: 17 },
            { tokenId: npcToken.id, initiativeMode: "server" }
          ]
        }
      });
      expect(started.statusCode).toBe(200);
      expect(started.json().combat.combatants).toContainEqual(expect.objectContaining({ tokenId: npcToken.id, hidden: true }));
      expect(started.json().rolls).toContainEqual(expect.objectContaining({ label: "Atomic Scout Initiative", visibility: "gm_only" }));
      expect(started.json().chatMessages).toContainEqual(expect.objectContaining({ body: expect.stringContaining("Atomic Scout"), visibility: "gm_only" }));

      const playerCombats = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/combats",
        headers: { "x-user-id": "usr_demo_player" }
      });
      expect(playerCombats.statusCode).toBe(200);
      expect(JSON.stringify(playerCombats.json())).not.toContain("Atomic Scout");
      expect(playerCombats.json()[0].combatants).toEqual([expect.objectContaining({ tokenId: "tok_valen" })]);

      const playerRolls = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/rolls",
        headers: { "x-user-id": "usr_demo_player" }
      });
      expect(playerRolls.statusCode).toBe(200);
      expect(JSON.stringify(playerRolls.json())).not.toContain("Atomic Scout");

      const playerChat = await app.inject({
        method: "GET",
        url: "/api/v1/chat/messages?campaignId=camp_demo",
        headers: { "x-user-id": "usr_demo_player" }
      });
      expect(playerChat.statusCode).toBe(200);
      expect(JSON.stringify(playerChat.json())).not.toContain("Atomic Scout");
    } finally {
      Math.random = originalRandom;
      await app.close();
    }
  });

  it("rejects stale or invalid reviewed participants without committing partial state", async () => {
    const store = new MemoryStateStore();
    const { scene, npcToken } = addAtomicCombatFixtures(store);
    const app = await buildApp({ store });
    const before = {
      combats: structuredClone(store.state.combats),
      rolls: structuredClone(store.state.rolls),
      chat: structuredClone(store.state.chat),
      combatAuditCount: store.state.auditLogs.filter((log) => log.action.startsWith("combat.")).length
    };

    try {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats/start",
        headers: { ...authHeaders, "idempotency-key": "combat-start-invalid-manual" },
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
          sceneId: scene.id,
          participants: [
            { tokenId: npcToken.id, initiativeMode: "server" },
            { tokenId: "tok_valen", initiativeMode: "manual" }
          ]
        }
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().message).toContain("Manual initiative is required for Valen Ash");
      expect(store.state.combats).toEqual(before.combats);
      expect(store.state.rolls).toEqual(before.rolls);
      expect(store.state.chat).toEqual(before.chat);
      expect(store.state.auditLogs.filter((log) => log.action.startsWith("combat."))).toHaveLength(before.combatAuditCount);

      const wrongScene = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats/start",
        headers: { ...authHeaders, "idempotency-key": "combat-start-missing-scene" },
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
          sceneId: "scn_missing",
          participants: [{ tokenId: "tok_valen", initiativeMode: "manual", initiative: 12 }]
        }
      });
      expect(wrongScene.statusCode).toBe(404);

      const invalidServerRoll = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/combats/start",
        headers: { ...authHeaders, "idempotency-key": "combat-start-invalid-server-roll" },
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
          sceneId: scene.id,
          participants: [{ tokenId: "tok_valen", initiativeMode: "server" }]
        }
      });
      expect(invalidServerRoll.statusCode).toBe(400);
      expect(invalidServerRoll.json().message).toContain("only available for linked NPCs and monsters");
      expect(store.state.combats).toEqual(before.combats);
      expect(store.state.rolls).toEqual(before.rolls);
      expect(store.state.chat).toEqual(before.chat);
      expect(store.state.auditLogs.filter((log) => log.action.startsWith("combat."))).toHaveLength(before.combatAuditCount);
    } finally {
      await app.close();
    }
  });
});
