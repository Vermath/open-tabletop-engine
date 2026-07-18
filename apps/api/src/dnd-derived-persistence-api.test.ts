import { emptyState, type Actor, type EngineState, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };
const timestamp = "2026-07-17T00:00:00.000Z";

function character(id: string, className: string, level: number, data: Record<string, unknown> = {}): Actor {
  return {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_player",
    type: "character",
    name: id,
    data: {
      class: className,
      level,
      classes: [{ className, level }],
      speed: 30,
      attributes: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 },
      hp: { current: 50, max: 50 },
      hitDice: { current: level, max: level, size: className === "Monk" ? "d8" : className === "Barbarian" ? "d12" : "d10" },
      conditions: [],
      ...data
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function armor(actorId: string, id: string, armorType: "light" | "medium" | "heavy" | "shield"): Item {
  return {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    actorId,
    type: "item",
    name: id,
    data: {
      quantity: 1,
      equipped: true,
      armorType,
      ...(armorType === "shield" ? { armorBonus: 2 } : { armorBase: armorType === "light" ? 11 : armorType === "medium" ? 14 : 16 })
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("D&D derived sheet persistence", () => {
  it("keeps class speed and explicit subclass action availability stable through API sheet and archive reload", async () => {
    const store = new MemoryStateStore();
    const sourceApp = await buildApp({ store });
    const monkUnarmored = character("act_speed_monk_unarmored", "Monk", 10);
    const monkLegacyArmor = character("act_speed_monk_legacy_armor", "Monk", 10);
    const barbarianMedium = character("act_speed_barbarian_medium", "Barbarian", 5);
    const barbarianHeavy = character("act_speed_barbarian_heavy", "Barbarian", 5);
    const multiclassExhausted = character("act_speed_multiclass_exhausted", "Monk", 11, {
      classes: [{ className: "Monk", level: 6 }, { className: "Barbarian", level: 5 }],
      conditions: [{ id: "exhaustion", level: 2 }]
    });
    const champion = character("act_subclass_champion", "Fighter", 5, {
      subclass: "Champion",
      subclasses: { Fighter: "champion" },
      features: ["Champion", "Improved Critical", "Remarkable Athlete"]
    });
    const respecedFighter = character("act_subclass_respeced_fighter", "Fighter", 5, {
      subclass: "Battle Master",
      subclasses: { Fighter: "battle-master" },
      features: ["Champion", "Improved Critical", "Remarkable Athlete"]
    });
    const openHand = character("act_subclass_open_hand", "Monk", 17, {
      subclass: "Warrior of the Open Hand",
      subclasses: { Monk: "warrior-of-the-open-hand" },
      features: ["Warrior of the Open Hand", "Open Hand Technique", "Wholeness of Body", "Fleet Step", "Quivering Palm"],
      resources: { focus: { current: 17, max: 17, recovery: "short" }, wholenessOfBody: { current: 2, max: 2, recovery: "long" } }
    });
    const respecedMonk = character("act_subclass_respeced_monk", "Monk", 17, {
      subclass: "Way of Shadow",
      subclasses: { Monk: "way-of-shadow" },
      features: ["Warrior of the Open Hand", "Open Hand Technique", "Wholeness of Body", "Fleet Step", "Quivering Palm"],
      resources: { focus: { current: 17, max: 17, recovery: "short" }, wholenessOfBody: { current: 2, max: 2, recovery: "long" } }
    });
    const actors = [monkUnarmored, monkLegacyArmor, barbarianMedium, barbarianHeavy, multiclassExhausted, champion, respecedFighter, openHand, respecedMonk];
    store.state.actors.push(...actors);
    store.state.items.push(
      armor(monkLegacyArmor.id, "itm_legacy_leather", "light"),
      armor(barbarianMedium.id, "itm_scale_mail", "medium"),
      armor(barbarianHeavy.id, "itm_chain_mail", "heavy")
    );

    const sheet = async (app: Awaited<ReturnType<typeof buildApp>>, actorId: string) => {
      const response = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/sheet`, headers });
      expect(response.statusCode, response.body).toBe(200);
      return response.json();
    };
    const assertRules = async (app: Awaited<ReturnType<typeof buildApp>>) => {
      const expectedSpeeds = new Map([
        [monkUnarmored.id, 50],
        [monkLegacyArmor.id, 30],
        [barbarianMedium.id, 40],
        [barbarianHeavy.id, 30],
        [multiclassExhausted.id, 45]
      ]);
      for (const [actorId, effectiveSpeed] of expectedSpeeds) {
        expect((await sheet(app, actorId)).data).toEqual(expect.objectContaining({ effectiveSpeed, speedDetails: expect.objectContaining({ value: effectiveSpeed }) }));
      }
      const rollIds = async (actorId: string) => (await sheet(app, actorId)).quickRolls.map((roll: { id: string }) => roll.id);
      expect(await rollIds(champion.id)).toEqual(expect.arrayContaining(["feature-champion-critical-range", "feature-champion-remarkable-athlete"]));
      expect(await rollIds(respecedFighter.id)).not.toEqual(expect.arrayContaining(["feature-champion-critical-range", "feature-champion-remarkable-athlete"]));
      expect(await rollIds(openHand.id)).toEqual(expect.arrayContaining(["feature-open-hand-technique", "feature-open-hand-wholeness-of-body", "feature-open-hand-fleet-step", "feature-open-hand-quivering-palm-damage"]));
      expect(await rollIds(respecedMonk.id)).not.toEqual(expect.arrayContaining(["feature-open-hand-technique", "feature-open-hand-wholeness-of-body", "feature-open-hand-fleet-step", "feature-open-hand-quivering-palm-damage"]));
    };

    try {
      await assertRules(sourceApp);
      const exported = await sourceApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers });
      expect(exported.statusCode, exported.body).toBe(200);
      const targetState: EngineState = emptyState();
      targetState.users.push({ id: "usr_demo_gm", displayName: "Archive GM", createdAt: timestamp, updatedAt: timestamp });
      const targetStore = new MemoryStateStore(targetState);
      const targetApp = await buildApp({ store: targetStore });
      try {
        const imported = await targetApp.inject({ method: "POST", url: "/api/v1/import/campaign", headers, payload: exported.json() });
        expect(imported.statusCode, imported.body).toBe(200);
        await assertRules(targetApp);
      } finally {
        await targetApp.close();
      }
    } finally {
      await sourceApp.close();
    }
  }, 60_000);
});
