import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyGenericFantasyCondition, genericFantasyActorConditions, genericFantasyCompendiumEntry, genericFantasyQuickRolls, genericFantasySheet, removeGenericFantasyCondition } from "./index.js";

const actor: Actor = {
  id: "act_test",
  campaignId: "camp_demo",
  systemId: "generic-fantasy",
  ownerUserId: "usr_demo_player",
  type: "character",
  name: "Test Hero",
  data: {
    attributes: { strength: 14, dexterity: 12, constitution: 13, intelligence: 11, wisdom: 10, charisma: 15 },
    hp: { current: 8, max: 12 },
    conditions: []
  },
  permissions: {},
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

describe("generic fantasy rules", () => {
  it("adds compendium-backed condition effects to quick rolls", () => {
    const blessedData = applyGenericFantasyCondition(actor, "blessed", "2026-05-01T00:00:00.000Z");
    const blessedActor = { ...actor, data: blessedData };

    expect(genericFantasyActorConditions(blessedActor)).toContainEqual(expect.objectContaining({ id: "blessed", name: "Blessed" }));
    expect(genericFantasyQuickRolls(blessedActor).find((roll) => roll.id === "ability-charisma")?.formula).toBe("1d20+2+1d4");

    const poisonedData = applyGenericFantasyCondition(blessedActor, "poisoned", "2026-05-01T00:00:01.000Z");
    const poisonedActor = { ...actor, data: poisonedData };
    expect(genericFantasyQuickRolls(poisonedActor).find((roll) => roll.id === "ability-charisma")?.formula).toBe("2d20kl1+2+1d4");

    const clearedActor = { ...actor, data: removeGenericFantasyCondition(poisonedActor, "poisoned") };
    expect(genericFantasyActorConditions(clearedActor).map((condition) => condition.id)).toEqual(["blessed"]);
  });

  it("builds sheets with inventory, spells, and compendium entries", () => {
    const items: Item[] = [
      {
        id: "itm_longsword",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        actorId: actor.id,
        type: "item",
        name: "Longsword",
        data: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "itm_healing_word",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        actorId: actor.id,
        type: "spell",
        name: "Healing Word",
        data: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    expect(genericFantasyCompendiumEntry("healing-word")).toEqual(expect.objectContaining({ type: "spell", name: "Healing Word" }));
    const sheet = genericFantasySheet(actor, items);
    expect(sheet.inventory.map((item) => item.name)).toEqual(["Longsword"]);
    expect(sheet.spells.map((item) => item.name)).toEqual(["Healing Word"]);
  });
});
