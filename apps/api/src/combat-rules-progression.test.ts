import { createTimestamped, type Actor, type Combat, type Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };

function mutationHeaders(key: string) {
  return { ...gm, "idempotency-key": key };
}

describe("automatic D&D combat rules progression", () => {
  it("blocks unresolved saves without mutation, then commits every phase and actor/combatant update atomically", async () => {
    const store = new MemoryStateStore();
    const target = createTimestamped("act", {
      id: "act_progression_target", campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm",
      type: "character" as const, name: "Poisoned Hero", permissions: {},
      data: {
        hp: { current: 0, max: 20 }, conditions: [{ id: "poisoned" }],
        rulesEngine: { activeEffects: [{
          id: "effect_progression_poison", label: "Persistent poison", ownedConditionIds: ["poisoned"],
          schedule: { timing: "end_turn", anchorActorId: "act_progression_target", nextRound: 1, repeatSave: { ability: "constitution", dc: 15, endsOn: "success" } }
        }] }
      }
    }) satisfies Actor;
    const champion = createTimestamped("act", {
      id: "act_progression_champion", campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm",
      type: "character" as const, name: "Champion", permissions: {},
      data: { hp: { current: 40, max: 40 }, conditions: [], features: ["Heroic Warrior"], heroicInspiration: false }
    }) satisfies Actor;
    const combat = createTimestamped("cmb", {
      id: "cmb_progression", campaignId: "camp_demo", active: true, round: 1, turnIndex: 0,
      combatants: [
        { id: "cmbt_progression_target", tokenId: "tok_valen", actorId: target.id, name: target.name, initiative: 20, defeated: false, conditions: ["poisoned"] },
        { id: "cmbt_progression_champion", tokenId: "tok_champion", actorId: champion.id, name: champion.name, initiative: 10, defeated: false, conditions: [] }
      ]
    }) satisfies Combat;
    store.state.actors.push(target, champion);
    store.state.combats.push(combat);
    const beforeActor = structuredClone(target);
    const beforeCombat = structuredClone(combat);
    const app = await buildApp({ store });

    try {
      const blocked = await app.inject({
        method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: mutationHeaders("progression-blocked"),
        payload: { turnIndex: 1, expectedUpdatedAt: combat.updatedAt }
      });
      expect(blocked.statusCode).toBe(422);
      expect(blocked.json()).toEqual(expect.objectContaining({
        error: "combat_progression_outcomes_required", canApply: false,
        phases: ["end_turn"], unresolvedEventIds: [expect.any(String)]
      }));
      expect(store.state.actors.find((actor) => actor.id === target.id)).toEqual(beforeActor);
      expect(store.state.combats.find((candidate) => candidate.id === combat.id)).toEqual(beforeCombat);

      const eventId = blocked.json().unresolvedEventIds[0] as string;
      const advanced = await app.inject({
        method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: mutationHeaders("progression-resolved"),
        payload: { turnIndex: 1, expectedUpdatedAt: combat.updatedAt, saveOutcomes: { [eventId]: "success" } }
      });
      expect(advanced.statusCode).toBe(200);
      expect(advanced.json()).toEqual(expect.objectContaining({ round: 1, turnIndex: 1 }));
      expect(store.state.actors.find((actor) => actor.id === target.id)?.data).toMatchObject({
        lifeState: "unconscious", deathSaves: { successes: 0, failures: 0 }, conditions: [{ id: "unconscious" }],
        rulesEngine: { activeEffects: [] }
      });
      expect(store.state.actors.find((actor) => actor.id === champion.id)?.data).toMatchObject({ heroicInspiration: true });
      const committedCombat = store.state.combats.find((candidate) => candidate.id === combat.id)!;
      expect(committedCombat.combatants[0]).toMatchObject({ conditions: ["unconscious"], deathSaveSuccesses: 0, deathSaveFailures: 0 });
      expect(committedCombat.effectScheduleEvents).toContainEqual(expect.objectContaining({ id: eventId, status: "save_succeeded" }));
      expect(store.state.auditLogs.find((log) => log.targetId === combat.id && log.action === "combat.updated")?.after).toMatchObject({
        rulesProgression: { phases: ["end_turn", "start_turn"], actorIds: expect.arrayContaining([target.id, champion.id]) }
      });
    } finally {
      await app.close();
    }
  });

  it("enforces the campaign surprise toggle for creation and ignores legacy surprise on NPC rerolls", async () => {
    const store = new MemoryStateStore();
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    campaign.rulesProfile = { profileId: "dnd-5e-2024-standard", rulesVersion: "SRD 5.2.1", toggles: { "initiative.surprise": false } };
    const baseToken = store.state.tokens.find((candidate) => candidate.id === "tok_valen")!;
    const npc = createTimestamped("act", {
      id: "act_surprise_npc", campaignId: campaign.id, systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm",
      type: "monster" as const, name: "Surprise Scout", permissions: {}, data: { attributes: { dexterity: 16 }, conditions: [] }
    }) satisfies Actor;
    const token = { ...baseToken, id: "tok_surprise_npc", actorId: npc.id, name: npc.name } satisfies Token;
    store.state.actors.push(npc);
    store.state.tokens.push(token);
    const app = await buildApp({ store });

    try {
      const reviewed = await app.inject({
        method: "POST", url: `/api/v1/campaigns/${campaign.id}/combats/start`, headers: mutationHeaders("surprise-reviewed-disabled"),
        payload: { expectedUpdatedAt: campaign.updatedAt, sceneId: token.sceneId, participants: [{ tokenId: token.id, initiativeMode: "server", surprised: true }] }
      });
      expect(reviewed.statusCode).toBe(400);
      expect(reviewed.json().message).toContain("Surprise initiative is disabled");

      const ordinary = await app.inject({
        method: "POST", url: `/api/v1/campaigns/${campaign.id}/combats`, headers: mutationHeaders("surprise-ordinary-disabled"),
        payload: { expectedUpdatedAt: campaign.updatedAt, combatants: [{ id: "cmbt_disabled", tokenId: token.id, actorId: npc.id, name: npc.name, initiative: 10, defeated: false, surprised: true }] }
      });
      expect(ordinary.statusCode).toBe(400);
      expect(ordinary.json().message).toContain("Surprise initiative is disabled");

      const legacyCombat = createTimestamped("cmb", {
        id: "cmb_surprise_legacy", campaignId: campaign.id, active: true, round: 1, turnIndex: 0,
        combatants: [{ id: "cmbt_surprise_legacy", tokenId: token.id, actorId: npc.id, name: npc.name, initiative: 10, defeated: false, surprised: true }]
      }) satisfies Combat;
      store.state.combats.push(legacyCombat);
      const rerolled = await app.inject({
        method: "POST", url: `/api/v1/combats/${legacyCombat.id}/initiative/roll-npcs`, headers: mutationHeaders("surprise-reroll-disabled"),
        payload: { expectedUpdatedAt: legacyCombat.updatedAt }
      });
      expect(rerolled.statusCode).toBe(200);
      expect(rerolled.json().rolls).toEqual([expect.objectContaining({ formula: "1d20+3" })]);
    } finally {
      await app.close();
    }
  });
});
