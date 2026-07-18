import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  DND_5E_SRD_SUBCLASS_OPTIONS,
  dnd5eSrdActionClassificationIssues,
  dnd5eSrdActionKind,
  dnd5eSrdActionRolls,
  dnd5eSrdCharacterOrigins,
  dnd5eSrdCharacterTemplates,
  dnd5eSrdClassFeatureRolls,
  dnd5eSrdCompendium,
  dnd5eSrdEncounterThreats,
  dnd5eSrdMonsterActionRolls,
  dnd5eSrdMonsterActorData,
  dnd5eSrdSpeciesTraitRolls,
  type QuickRoll,
} from "./index.js";

const timestamp = "2026-07-16T00:00:00.000Z";

function actor(id: string, data: Record<string, unknown>, type: Actor["type"] = "character"): Actor {
  return { id, campaignId: "camp_action_sweep", systemId: "dnd-5e-srd", type, name: id, data, permissions: {}, createdAt: timestamp, updatedAt: timestamp };
}

function actionItem(owner: Actor, entry: ReturnType<typeof dnd5eSrdCompendium>[number]): Item {
  return {
    id: `sweep-${entry.id}`,
    campaignId: owner.campaignId,
    systemId: owner.systemId,
    actorId: owner.id,
    type: entry.type as "item" | "spell",
    name: entry.name,
    data: { ...(entry.data ?? {}), equipped: true, prepared: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("D&D exhaustive action-economy catalog gate", () => {
  it("classifies every generated class, species, monster, weapon, and spell quick roll", () => {
    const generated: Array<{ source: string; roll: QuickRoll }> = [];
    const templates = dnd5eSrdCharacterTemplates();
    for (const template of templates) {
      const subclasses = DND_5E_SRD_SUBCLASS_OPTIONS.filter((option) => option.className.toLowerCase() === template.id).map((option) => option.id);
      for (const subclass of [undefined, ...subclasses]) {
        const source = `class:${template.id}:${subclass ?? "base"}`;
        const candidate = actor(source, { ...template.data, level: 20, ...(subclass ? { subclass, subclasses: { [template.name]: subclass } } : {}) });
        generated.push(...dnd5eSrdClassFeatureRolls(candidate).map((roll) => ({ source, roll })));
      }
    }

    const origins = dnd5eSrdCharacterOrigins();
    for (const species of origins.species) {
      const variants: Record<string, unknown>[] = species.id === "dragonborn"
        ? origins.draconicAncestors.map((choice) => ({ draconicAncestry: choice.id }))
        : species.id === "goliath"
          ? origins.giantAncestries.map((choice) => ({ giantAncestry: choice.id }))
          : species.id === "elf"
            ? origins.elfLineages.map((choice) => ({ elfLineage: choice.id }))
            : species.id === "gnome"
              ? origins.gnomeLineages.map((choice) => ({ gnomeLineage: choice.id }))
              : species.id === "tiefling"
                ? origins.tieflingLegacies.map((choice) => ({ tieflingLegacy: choice.id }))
                : [{}];
      for (const origin of variants) {
        const variant = Object.values(origin)[0] ?? "base";
        const source = `species:${species.id}:${variant}`;
        const candidate = actor(source, { class: "Fighter", level: 20, species: species.name, origin, attributes: { strength: 16, dexterity: 14, constitution: 14, intelligence: 14, wisdom: 14, charisma: 14 }, resources: {} });
        generated.push(...dnd5eSrdSpeciesTraitRolls(candidate).map((roll) => ({ source, roll })));
      }
    }

    const threats = dnd5eSrdEncounterThreats();
    let monsterSources = 0;
    for (const threat of threats) {
      const data = dnd5eSrdMonsterActorData(threat.id);
      if (!data) continue;
      monsterSources += 1;
      const source = `monster:${threat.id}`;
      generated.push(...dnd5eSrdMonsterActionRolls(actor(source, data, "monster")).map((roll) => ({ source, roll })));
    }

    const itemActor = actor("catalog-actions", { class: "Wizard", level: 20, proficiencyBonus: 6, attributes: { strength: 18, dexterity: 18, constitution: 18, intelligence: 20, wisdom: 18, charisma: 18 }, conditions: [], spellSlots: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`level${index + 1}`, { current: 9, max: 9 }])) });
    const catalog = dnd5eSrdCompendium();
    const spells = catalog.filter((entry) => entry.type === "spell");
    const weapons = catalog.filter((entry) => {
      const data = entry.data ?? {};
      return entry.type === "item" && (data.equipmentCategory === "weapon" || data.category === "weapon" || data.magicItemCategory === "weapon" || Boolean(data.weaponKind));
    });
    for (const entry of [...spells, ...weapons]) {
      const source = `${entry.type === "spell" ? "spell" : "weapon"}:${entry.id}`;
      generated.push(...dnd5eSrdActionRolls(itemActor, [actionItem(itemActor, entry)]).map((roll) => ({ source, roll })));
    }

    const issues = generated.flatMap(({ source, roll }) => dnd5eSrdActionClassificationIssues(roll).map((issue) => `${source}:${roll.id}:${issue.field}=${issue.value}`));
    expect(issues).toEqual([]);
    expect(generated.every(({ roll }) => ["action", "bonusAction", "reaction", "free"].includes(dnd5eSrdActionKind(roll)))).toBe(true);
    expect(templates).toHaveLength(12);
    expect(origins.species).toHaveLength(9);
    expect(monsterSources).toBe(threats.length);
    // Base Monk keeps Deflect Attacks, while only the selected Warrior of the
    // Open Hand fixture contributes Open Hand Technique.
    expect(generated.filter(({ source }) => source.startsWith("class:"))).toHaveLength(117);
    expect(generated.filter(({ source }) => source.startsWith("species:")).length).toBeGreaterThan(50);
    expect(generated.filter(({ source }) => source.startsWith("monster:")).length).toBeGreaterThan(1_000);
    expect(generated.filter(({ source }) => source.startsWith("spell:")).length).toBeGreaterThan(250);
    expect(generated.filter(({ source }) => source.startsWith("weapon:")).length).toBeGreaterThan(75);
    expect(spells.length).toBeGreaterThan(300);
    expect(weapons.length).toBeGreaterThan(25);
  });
});
