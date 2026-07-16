import type { Actor, CalculationOverride, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  applyDnd5eSrdCalculationOverridesToExplanation,
  applyDnd5eSrdCalculationOverridesToRolls,
  applyDnd5eSrdCalculationOverridesToSheet,
  buildDnd5eSrdCalculationOverrideContext,
  dnd5eSrdCalculationExplanation,
  dnd5eSrdCompendiumEntry,
  dnd5eSrdQuickRolls,
  dnd5eSrdSheet,
  resolveDnd5eSrdAction,
} from "./index.js";

const now = "2026-07-15T21:00:00.000Z";

function actor(data: Record<string, unknown> = {}): Actor {
  return {
    id: "act_override",
    campaignId: "camp_override",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Override Bard",
    data: {
      class: "Bard",
      level: 3,
      attributes: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 12, charisma: 16 },
      hp: { current: 20, max: 20 },
      spellSlots: { level1: { current: 2, max: 4, recovery: "long" } },
      conditions: [],
      ...data,
    },
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };
}

function spell(owner: Actor): Item {
  return {
    id: "itm_healing_word",
    campaignId: owner.campaignId,
    systemId: owner.systemId,
    actorId: owner.id,
    type: "spell",
    name: "Healing Word",
    data: { ...dnd5eSrdCompendiumEntry("healing-word")!.data, prepared: true },
    createdAt: now,
    updatedAt: now,
  };
}

function override(explanation: ReturnType<typeof dnd5eSrdCalculationExplanation>, fieldId: string, effectiveValue: number | string): CalculationOverride {
  const field = explanation.fields.find((candidate) => candidate.id === fieldId)!;
  return {
    id: `calc_${fieldId.replace(/\W/g, "_")}`,
    campaignId: "camp_override",
    actorId: "act_override",
    systemId: "dnd-5e-srd",
    rulesVersion: explanation.rulesVersion,
    fieldId,
    source: "gm_manual",
    baseValue: field.result,
    effectiveValue,
    reason: "Documented table ruling",
    createdByUserId: "usr_gm",
    createdAt: now,
    updatedAt: now,
  };
}

describe("D&D effective calculation overrides", () => {
  it("uses one context for sheet defenses, explanations, action formulas, resolution, consumption, and audit", () => {
    const source = actor();
    const item = spell(source);
    const rollId = `spell-${item.id}-healing`;
    const explanation = dnd5eSrdCalculationExplanation(source, [item]);
    const context = buildDnd5eSrdCalculationOverrideContext(explanation, [
      override(explanation, "armor-class", 19),
      override(explanation, `roll.${rollId}`, "1d4+9"),
    ]);

    const effectiveExplanation = applyDnd5eSrdCalculationOverridesToExplanation(explanation, context);
    const effectiveSheet = applyDnd5eSrdCalculationOverridesToSheet(dnd5eSrdSheet(source, [item]), context);
    const effectiveRoll = applyDnd5eSrdCalculationOverridesToRolls(dnd5eSrdQuickRolls(source, [item]), context).find((roll) => roll.id === rollId)!;
    const resolution = resolveDnd5eSrdAction({ actor: source, items: [item], roll: effectiveRoll, options: { consumeResources: true } });

    expect(context.rejected).toEqual([]);
    expect(effectiveExplanation.fields.find((field) => field.id === "armor-class")).toMatchObject({ result: 19, flags: { override: true } });
    expect(effectiveSheet.data).toMatchObject({ armorClass: 19, armorClassDetails: { value: 19, calculationOverride: true } });
    expect(effectiveSheet.quickRolls.find((roll) => roll.id === rollId)?.formula).toBe("1d4+9");
    expect(resolution.rolls[0]).toMatchObject({ baseFormula: explanation.fields.find((field) => field.id === `roll.${rollId}`)!.result, formula: "1d4+9" });
    expect(resolution.resourceConsumption).toEqual([expect.objectContaining({ type: "spellSlot", key: "level1", remaining: 1 })]);
    expect(resolution.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ code: "calculation.override.applied", data: expect.objectContaining({ id: `calc_roll_spell_itm_healing_word_healing`, effectiveFormula: "1d4+9" }) })]));
  });

  it("fails closed for stale, wrong-version, unsafe, wrong-type, and unsupported targets", () => {
    const source = actor();
    const explanation = dnd5eSrdCalculationExplanation(source);
    const staleArmor = { ...override(explanation, "armor-class", 18), baseValue: 999 };
    const wrongVersion = { ...override(explanation, "initiative", "1d20+20"), rulesVersion: "other" };
    const unsafe = override(explanation, "saving-throw.wisdom", "process.exit()" as string);
    const wrongType = override(explanation, "speed", "60");
    const unsupported = override(explanation, "ability.strength.score", 20);

    const context = buildDnd5eSrdCalculationOverrideContext(explanation, [staleArmor, wrongVersion, unsafe, wrongType, unsupported]);

    expect(context.effective).toEqual([]);
    expect(context.rejected).toHaveLength(5);
    expect(applyDnd5eSrdCalculationOverridesToSheet(dnd5eSrdSheet(source), context).data.armorClass).not.toBe(18);
    expect(applyDnd5eSrdCalculationOverridesToExplanation(explanation, context).fields.find((field) => field.id === "armor-class")?.flags).toMatchObject({ override: false, ambiguous: true });
  });
});
