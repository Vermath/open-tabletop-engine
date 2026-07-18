import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { dnd5eSrdMonsterActorData } from "@open-tabletop/system-sdk";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const observer = { "x-user-id": "usr_demo_observer" };

function monsterActor(): Actor {
  return createTimestamped("act", {
    id: "act_legendary_api",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "monster",
    name: "API Aboleth",
    data: dnd5eSrdMonsterActorData("aboleth")!,
    permissions: {}
  }) satisfies Actor;
}

function supportingActor(id: string, name: string): Actor {
  return createTimestamped("act", {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name,
    data: { hp: { current: 10, max: 10 }, conditions: [] },
    permissions: {}
  }) satisfies Actor;
}

describe("legendary-action combat API", () => {
  it("persists between-turn prompts, enforces permissions/revisions/idempotency, spends, and resets", async () => {
    const store = new MemoryStateStore();
    const legendary = monsterActor();
    const other = supportingActor("act_legendary_other", "Other");
    const third = supportingActor("act_legendary_third", "Third");
    store.state.users.push(createTimestamped("usr", { id: "usr_demo_observer", displayName: "Demo Observer", email: "observer@example.test" }));
    store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: "usr_demo_observer", role: "member" as const }));
    store.state.members.push(createTimestamped("mem", { campaignId: "camp_demo", userId: "usr_demo_observer", role: "observer" as const }));
    store.state.actors.push(legendary, other, third);
    const combat = createTimestamped("cmb", {
      id: "cmb_legendary_api",
      campaignId: "camp_demo",
      active: true,
      round: 1,
      turnIndex: 1,
      combatants: [
        { id: "cmbt_legendary_api", tokenId: "tok_legendary_api", actorId: legendary.id, name: legendary.name, initiative: 20, defeated: false },
        { id: "cmbt_legendary_other", tokenId: "tok_legendary_other", actorId: other.id, name: other.name, initiative: 15, defeated: false },
        { id: "cmbt_legendary_third", tokenId: "tok_legendary_third", actorId: third.id, name: third.name, initiative: 10, defeated: false }
      ]
    }) satisfies Combat;
    store.state.combats.push(combat);
    const app = await buildApp({ store });
    try {
      const advanced = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: gm, payload: { turnIndex: 2, expectedUpdatedAt: combat.updatedAt } });
      expect(advanced.statusCode, advanced.body).toBe(200);
      const betweenTurns = advanced.json() as Combat;
      expect(betweenTurns.legendaryActionPrompts).toEqual([expect.objectContaining({ actorId: legendary.id, remainingUses: 3, maximumUses: 3, options: expect.arrayContaining(["Lash", "Psychic Drain"]), resolution: "reviewed-manual" })]);
      const prompt = betweenTurns.legendaryActionPrompts![0]!;
      const currentActor = store.state.actors.find((actor) => actor.id === legendary.id)!;

      const hidden = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/combats", headers: observer });
      expect((hidden.json() as Combat[]).find((candidate) => candidate.id === combat.id)?.legendaryActionPrompts).toEqual([]);
      const denied = await app.inject({
        method: "POST",
        url: `/api/v1/combats/${combat.id}/legendary-actions/${legendary.id}/spend`,
        headers: { ...observer, "idempotency-key": "legendary-denied" },
        payload: { promptId: prompt.id, optionName: "Lash", cost: 1, expectedActorUpdatedAt: currentActor.updatedAt, expectedCombatUpdatedAt: betweenTurns.updatedAt }
      });
      expect(denied.statusCode).toBe(403);

      const request = {
        promptId: prompt.id,
        optionName: "Psychic Drain",
        cost: 2,
        expectedActorUpdatedAt: currentActor.updatedAt,
        expectedCombatUpdatedAt: betweenTurns.updatedAt
      };
      const spent = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/legendary-actions/${legendary.id}/spend`, headers: { ...gm, "idempotency-key": "legendary-spend" }, payload: request });
      expect(spent.statusCode, spent.body).toBe(200);
      expect(spent.json()).toMatchObject({ use: { actorId: legendary.id, optionName: "Psychic Drain", cost: 2, remainingUses: 1, maximumUses: 3 }, combat: { legendaryActionPrompts: [{ id: prompt.id, remainingUses: 1 }] } });
      const replay = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/legendary-actions/${legendary.id}/spend`, headers: { ...gm, "idempotency-key": "legendary-spend" }, payload: request });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json().use.id).toBe(spent.json().use.id);

      const stale = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/legendary-actions/${legendary.id}/spend`, headers: { ...gm, "idempotency-key": "legendary-stale" }, payload: request });
      expect(stale.statusCode).toBe(409);

      const afterSpendCombat = store.state.combats.find((candidate) => candidate.id === combat.id)!;
      const ownTurn = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: gm, payload: { round: 2, turnIndex: 0, expectedUpdatedAt: afterSpendCombat.updatedAt } });
      expect(ownTurn.statusCode, ownTurn.body).toBe(200);
      expect(ownTurn.json().legendaryActionPrompts).toEqual([]);
      const afterOwn = ownTurn.json() as Combat;
      const otherTurn = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: gm, payload: { turnIndex: 1, expectedUpdatedAt: afterOwn.updatedAt } });
      expect(otherTurn.statusCode, otherTurn.body).toBe(200);
      const afterOther = otherTurn.json() as Combat;
      const nextBoundary = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: gm, payload: { turnIndex: 2, expectedUpdatedAt: afterOther.updatedAt } });
      expect(nextBoundary.statusCode, nextBoundary.body).toBe(200);
      expect(nextBoundary.json().legendaryActionPrompts).toEqual([expect.objectContaining({ actorId: legendary.id, remainingUses: 3, maximumUses: 3 })]);

      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "combat.legendaryActionSpent", targetId: combat.id, after: expect.objectContaining({ actorId: legendary.id, cost: 2, remainingUses: 1 }) }));
    } finally {
      await app.close();
    }
  }, 20_000);
});
