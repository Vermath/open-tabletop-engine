import type { Actor, CalculationFieldExplanation, CompendiumCatalogEntry, CompendiumProvenance } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { dnd5eCustomMonsterActorData, dnd5eMonsterContentDataFromStatBlock } from "./dnd-monster-variants.js";
import {
  dnd5eSrdCalculationExplanation,
  dnd5eSrdInitiativeRoll,
  dnd5eSrdMonsterActorData,
  dnd5eSrdSavingThrow,
  dnd5eSrdSkillCheck
} from "./index.js";

const timestamp = "2026-07-15T00:00:00.000Z";
const provenance: CompendiumProvenance = {
  sourceKind: "user",
  sourceName: "T22 test bestiary",
  sourceVersion: "1",
  contentVersion: "1.0.0",
  systemId: "dnd-5e-srd",
  systemVersion: "5.2.1",
  rulesVersion: "Custom 1",
  license: { name: "Private home game", usage: "private_home_game" }
};

function monster(data: Record<string, unknown>, name = "Exact Monster"): Actor {
  return {
    id: `act_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    campaignId: "camp_monster_core_rolls",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_gm",
    type: "monster",
    name,
    data,
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function customEntry(data: Record<string, unknown>): CompendiumCatalogEntry {
  return {
    id: "custom-exact-monster",
    type: "monster",
    name: "Custom Exact Monster",
    summary: "A monster used to prove exact core roll preservation.",
    provenance,
    data: {
      customContentKind: "monster",
      size: "medium",
      creatureType: "Aberration",
      armorClass: 12,
      hitPoints: 20,
      hitDice: "4d8+2",
      challengeRating: "2",
      xp: 450,
      proficiencyBonus: 2,
      speed: { walk: 30 },
      abilities: { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 10, charisma: 10 },
      savingThrows: {},
      skills: {},
      ...data
    }
  };
}

function field(actor: Actor, id: string): CalculationFieldExplanation {
  return dnd5eSrdCalculationExplanation(actor).fields.find((entry) => entry.id === id)!;
}

describe("D&D exact monster core rolls", () => {
  it("uses bundled Aboleth initiative, save, and expertise-like skill bonuses verbatim", () => {
    const data = dnd5eSrdMonsterActorData("aboleth")!;
    const actor = monster(data, "Aboleth");

    expect(dnd5eSrdInitiativeRoll(actor)).toMatchObject({ formula: "1d20+7", metadata: { statBlockBonus: 7, bonusSource: "monsterStatBlock" } });
    expect(dnd5eSrdSavingThrow(actor, "dexterity")).toMatchObject({ formula: "1d20+3", metadata: { statBlockBonus: 3 } });
    expect(dnd5eSrdSkillCheck(actor, "history")).toMatchObject({ formula: "1d20+12", metadata: { statBlockBonus: 12 } });
    expect(dnd5eSrdSkillCheck(actor, "perception").formula).toBe("1d20+10");

    expect(field(actor, "initiative").terms).toContainEqual(expect.objectContaining({ label: "Monster stat-block initiative bonus", signedValue: 7, source: expect.objectContaining({ name: "Aboleth stat block", version: "SRD 5.2.1" }) }));
    expect(field(actor, "saving-throw.dexterity").terms).toContainEqual(expect.objectContaining({ label: "Dexterity stat-block save bonus", signedValue: 3 }));
    expect(field(actor, "skill.history").terms).toContainEqual(expect.objectContaining({ label: "History stat-block skill bonus", signedValue: 12 }));
    expect(field(actor, "passive-perception").result).toBe(20);
  });

  it("preserves explicit negative and zero custom bonuses through both conversion directions", () => {
    const builderData = dnd5eMonsterContentDataFromStatBlock({
      size: "Medium",
      creatureType: "Aberration",
      armorClass: 12,
      initiative: 0,
      hitPoints: 20,
      hitDice: "4d8+2",
      challengeRating: "2",
      xp: 450,
      proficiencyBonus: 2,
      speed: "30 ft.",
      abilities: { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 10, charisma: 10 },
      saves: { dexterity: -2 },
      skills: { history: 9, stealth: 0 }
    });
    expect(builderData).toMatchObject({ initiative: 0, savingThrows: { dexterity: -2 }, skills: { history: 9, stealth: 0 } });

    const data = dnd5eCustomMonsterActorData(customEntry(builderData))!;
    expect(data).toMatchObject({ monster: { statBlock: { source: "Custom 1", initiative: 0, saves: { dexterity: -2 }, skills: { history: 9, stealth: 0 } } } });
    const actor = monster(data, "Custom Exact Monster");
    expect(dnd5eSrdInitiativeRoll(actor).formula).toBe("1d20+0");
    expect(dnd5eSrdSavingThrow(actor, "dexterity").formula).toBe("1d20-2");
    expect(dnd5eSrdSkillCheck(actor, "history").formula).toBe("1d20+9");
    expect(dnd5eSrdSkillCheck(actor, "stealth")).toMatchObject({ formula: "1d20+0", metadata: { statBlockBonus: 0 } });
  });

  it("falls back per missing or malformed exact field without discarding other valid exact values", () => {
    const data = dnd5eCustomMonsterActorData(customEntry({
      initiative: "not-a-number",
      savingThrows: { dexterity: "bad", constitution: -1 },
      skills: { history: "bad", perception: 5 }
    }))!;
    const statBlock = (data.monster as { statBlock: Record<string, unknown> }).statBlock;
    expect(statBlock).not.toHaveProperty("initiative");
    expect(statBlock).toMatchObject({ saves: { constitution: -1 }, skills: { perception: 5 } });

    const actor = monster({
      ...data,
      saveProficiencies: ["dexterity"],
      skillProficiencies: ["history"]
    }, "Partial Custom Monster");
    expect(dnd5eSrdInitiativeRoll(actor).formula).toBe("1d20+2");
    expect(dnd5eSrdSavingThrow(actor, "dexterity").formula).toBe("1d20+4");
    expect(dnd5eSrdSavingThrow(actor, "constitution").formula).toBe("1d20-1");
    expect(dnd5eSrdSkillCheck(actor, "history").formula).toBe("1d20+1");
    expect(dnd5eSrdSkillCheck(actor, "perception").formula).toBe("1d20+5");
  });
});
