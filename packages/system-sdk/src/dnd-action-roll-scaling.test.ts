import type { Actor, Item } from "@open-tabletop/api-contracts";
import { describe, expect, it } from "vitest";
import { dnd5eSrdActionRolls } from "./index.js";

const updatedAt = "2026-11-17T00:00:00.000Z";

function actor(className: string, data: Record<string, unknown> = {}): Actor {
  return {
    id: "act_scaling",
    campaignId: "camp_scaling",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Scaling Hero",
    data: { class: className, level: 5, attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 }, hp: { current: 30, max: 30 }, resources: {}, conditions: [], ...data },
    permissions: {},
    createdAt: updatedAt,
    updatedAt,
  };
}

function item(id: string, data: Record<string, unknown>): Item {
  return { id, campaignId: "camp_scaling", systemId: "dnd-5e-srd", actorId: "act_scaling", type: "item", name: id, data, createdAt: updatedAt, updatedAt };
}

function weapons(count: number, data: Record<string, unknown> = {}): Item[] {
  return Array.from({ length: count }, (_, index) => item(`weapon-${index}`, { category: "weapon", damage: "1d8", versatileDamage: "1d10", ability: "strength", equipped: true, ...data }));
}

describe("D&D 5e SRD action roll scaling", () => {
  it("keeps Extra Attack metadata on every weapon damage roll and off other rolls", () => {
    const rolls = dnd5eSrdActionRolls(actor("Fighter"), [...weapons(3), item("potion", { category: "consumable", damage: "2d4" })]);
    for (let index = 0; index < 3; index++) {
      for (const suffix of ["damage", "versatile-damage"]) {
        expect(rolls.find((roll) => roll.id === `item-weapon-${index}-${suffix}`)?.metadata).toMatchObject({ attacksPerAction: 2, feature: "Extra Attack" });
      }
    }
    for (const roll of rolls.filter((entry) => entry.id.startsWith("item-potion-"))) expect(roll.metadata?.feature).not.toBe("Extra Attack");
  });

  it("still grants weapon proficiency from proficiency-granting items", () => {
    const martial = weapons(1, { weaponCategory: "martial" });
    const without = dnd5eSrdActionRolls(actor("Wizard"), martial).find((roll) => roll.id === "item-weapon-0-attack")!;
    const withGrant = dnd5eSrdActionRolls(actor("Wizard"), [...martial, item("manual", { category: "gear", weaponProficiencies: ["martial"] })]).find((roll) => roll.id === "item-weapon-0-attack")!;
    expect(without.formula).not.toBe(withGrant.formula);
    expect(withGrant.formula).toBe("1d20+6");
  });

  it("builds rolls for thousands of weapons in near-linear time", () => {
    const startedAt = performance.now();
    const rolls = dnd5eSrdActionRolls(actor("Fighter"), weapons(6000));
    expect(rolls).toHaveLength(18000);
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });
});
