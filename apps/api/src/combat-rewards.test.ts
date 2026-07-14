import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function addRewardFixtures(store: MemoryStateStore) {
  const first = createTimestamped("act", {
    id: "act_reward_first",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Reward First",
    data: { xp: 25, currency: { gp: 2 } },
    permissions: {}
  }) satisfies Actor;
  const second = createTimestamped("act", {
    id: "act_reward_second",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Reward Second",
    data: { xp: 10, currency: { gp: 1 } },
    permissions: {}
  }) satisfies Actor;
  const combat: Combat = createTimestamped("cmb", {
    id: "cmb_rewards",
    campaignId: "camp_demo",
    active: true,
    round: 3,
    turnIndex: 0,
    combatants: [
      { id: "cmbt_reward_first", tokenId: "tok_reward_first", actorId: first.id, name: first.name, initiative: 18, defeated: false },
      { id: "cmbt_reward_second", tokenId: "tok_reward_second", actorId: second.id, name: second.name, initiative: 12, defeated: false }
    ]
  });
  store.state.actors.push(first, second);
  store.state.combats.push(combat);
  return { first, second, combat };
}

describe("combat reward and loot history", () => {
  it("atomically splits XP and GP, records loot, and requires combat plus actor permissions", async () => {
    const store = new MemoryStateStore();
    const { first, second, combat } = addRewardFixtures(store);
    store.state.permissionGrants.push(createTimestamped("grant", {
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      campaignId: combat.campaignId,
      permissions: ["combat.manage"]
    }));
    const app = await buildApp({ store });
    const payload = {
      recipientActorIds: [first.id, second.id],
      totalXp: 101,
      totalGp: 11,
      loot: ["Potion of Healing", "brass key"],
      note: "Vault guardians",
      expectedUpdatedAt: combat.updatedAt,
      expectedActorUpdatedAt: { [first.id]: first.updatedAt, [second.id]: second.updatedAt }
    };

    try {
      const before = { first: structuredClone(first), second: structuredClone(second), combat: structuredClone(combat) };
      const blocked = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/rewards`, headers: { ...playerHeaders, "idempotency-key": "combat-reward-player-blocked" }, payload });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toMatchObject({ error: "forbidden", message: "Missing permission: actor.update" });
      expect(first).toEqual(before.first);
      expect(second).toEqual(before.second);
      expect(combat).toEqual(before.combat);

      const rewardHeaders = { ...gmHeaders, "idempotency-key": "combat-reward-replay" };
      const awarded = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/rewards`, headers: rewardHeaders, payload });
      expect(awarded.statusCode).toBe(200);
      expect(awarded.json()).toMatchObject({
        combat: { id: combat.id, rewards: [expect.objectContaining({ totalXp: 101, xpPerActor: 50, unallocatedXp: 1, totalGp: 11, gpPerActor: 5, unallocatedGp: 1 })] },
        actors: [
          expect.objectContaining({ id: first.id, data: expect.objectContaining({ xp: 75, currency: expect.objectContaining({ gp: 7 }) }) }),
          expect.objectContaining({ id: second.id, data: expect.objectContaining({ xp: 60, currency: expect.objectContaining({ gp: 6 }) }) })
        ],
        reward: expect.objectContaining({
          combatId: combat.id,
          awardedByUserId: "usr_demo_gm",
          recipientActorIds: [first.id, second.id],
          loot: ["Potion of Healing", "brass key"],
          note: "Vault guardians"
        })
      });
      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "combat.rewardsAwarded", targetId: combat.id }));
      const afterFirst = { first: structuredClone(first), second: structuredClone(second), combat: structuredClone(combat) };
      const replayed = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/rewards`, headers: rewardHeaders, payload });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.headers["idempotency-replayed"]).toBe("true");
      expect(replayed.json()).toEqual(awarded.json());
      expect(first).toEqual(afterFirst.first);
      expect(second).toEqual(afterFirst.second);
      expect(combat).toEqual(afterFirst.combat);
      expect(combat.rewards).toHaveLength(1);
      expect(store.state.auditLogs.filter((entry) => entry.action === "combat.rewardsAwarded" && entry.targetId === combat.id)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("rejects stale or malformed reward requests without partial actor changes", async () => {
    const store = new MemoryStateStore();
    const { first, second, combat } = addRewardFixtures(store);
    const app = await buildApp({ store });
    const before = { first: structuredClone(first), second: structuredClone(second), combat: structuredClone(combat) };

    try {
      const missingKey = await app.inject({
        method: "POST",
        url: `/api/v1/combats/${combat.id}/rewards`,
        headers: { ...gmHeaders, "idempotency-key": "" },
        payload: { recipientActorIds: [first.id], totalXp: 1 }
      });
      expect(missingKey.statusCode).toBe(400);
      expect(missingKey.json().message).toContain("idempotency-key");

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/combats/${combat.id}/rewards`,
        headers: { ...gmHeaders, "idempotency-key": "combat-reward-stale" },
        payload: { recipientActorIds: [first.id, second.id], totalXp: 50, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ error: "conflict", code: "stale_write", resourceType: "combat", resourceId: combat.id });

      const malformed = await app.inject({
        method: "POST",
        url: `/api/v1/combats/${combat.id}/rewards`,
        headers: { ...gmHeaders, "idempotency-key": "combat-reward-malformed" },
        payload: { recipientActorIds: [first.id], totalXp: -1, loot: "not-an-array" }
      });
      expect(malformed.statusCode).toBe(400);
      expect(first).toEqual(before.first);
      expect(second).toEqual(before.second);
      expect(combat).toEqual(before.combat);
    } finally {
      await app.close();
    }
  });
});
