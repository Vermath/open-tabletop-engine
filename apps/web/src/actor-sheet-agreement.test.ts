import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import {
  dnd5eSrdActionKind,
  dnd5eSrdCharacterTemplates,
  dnd5eSrdCompendiumEntry,
  dnd5eSrdMonsterActorData,
  dnd5eSrdSheet,
} from "../../../packages/system-sdk/src/index.js";
import { actorActionOptions, type ActorActionKind } from "./actor-sheet-data.js";

const timestamp = "2026-07-17T00:00:00.000Z";
const actionRollId = /^(?:feature|species|monster|item|spell)-/;

interface ActionAgreementRow {
  optionId: string;
  label: string;
  actionKind: ActorActionKind;
}

function actor(id: string, data: Record<string, unknown>, type = "character"): Actor {
  return {
    id,
    campaignId: "camp_sheet_agreement",
    systemId: "dnd-5e-srd",
    type,
    name: id,
    permissions: {},
    data,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function templateActor(templateId: string, data: Record<string, unknown>): Actor {
  const template = dnd5eSrdCharacterTemplates().find((candidate) => candidate.id === templateId);
  if (!template) throw new Error(`Missing D&D character template ${templateId}`);
  return actor(`actor-${templateId}`, { ...template.data, ...data });
}

function item(owner: Actor, entryId: string): Item {
  const entry = dnd5eSrdCompendiumEntry(entryId);
  if (!entry) throw new Error(`Missing D&D compendium entry ${entryId}`);
  return {
    id: `item-${entryId}`,
    campaignId: owner.campaignId,
    systemId: owner.systemId,
    actorId: owner.id,
    type: entry.type,
    name: entry.name,
    data: { ...entry.data, prepared: true },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sortRows(rows: ActionAgreementRow[]): ActionAgreementRow[] {
  return rows.sort((left, right) => left.optionId.localeCompare(right.optionId));
}

function authoritativeApiRows(source: Actor, items: Item[]): ActionAgreementRow[] {
  // The actor-sheet GET route returns `{ systemId, ...dnd5eSrdSheet(actor, items) }`.
  // Projecting the SDK sheet here therefore exercises the exact API payload seam
  // without making the web package depend on the API runtime.
  const apiSheet = { systemId: source.systemId, ...dnd5eSrdSheet(source, items) };
  return sortRows(apiSheet.quickRolls
    .filter((roll) => actionRollId.test(roll.id))
    .map((roll) => ({ optionId: roll.id, label: roll.label, actionKind: dnd5eSrdActionKind(roll) })));
}

function webRows(source: Actor, items: Item[]): ActionAgreementRow[] {
  return sortRows(actorActionOptions(source, items).map((option) => ({
    optionId: option.rollId,
    label: option.label,
    actionKind: option.actionKind as ActorActionKind,
  })));
}

describe("D&D authoritative sheet/API and web action agreement", () => {
  const fighter = templateActor("fighter", { level: 2 });
  const barbarian = templateActor("barbarian", {
    level: 3,
    subclass: "path-of-the-berserker",
    subclasses: { Barbarian: "path-of-the-berserker" },
  });
  const wizard = templateActor("wizard", { level: 5 });
  const conflictingFighter = actor("actor-conflicting-fighter", {
    class: "Fighter",
    level: 5,
    classes: [{ className: "Fighter", level: 5 }],
    subclass: "Battle Master",
    subclasses: { Fighter: "battle-master" },
    features: ["Champion", "Improved Critical", "Remarkable Athlete"],
    resources: { secondWind: { current: 2, max: 2 }, actionSurge: { current: 1, max: 1 } },
  });
  const shield = item(wizard, "shield");
  const pantherData = dnd5eSrdMonsterActorData("panther");
  if (!pantherData) throw new Error("Missing D&D Panther fixture");
  const panther = actor("actor-panther", pantherData, "monster");

  const fixtures: Array<{ name: string; actor: Actor; items: Item[] }> = [
    { name: "fighter", actor: fighter, items: [] },
    { name: "barbarian", actor: barbarian, items: [] },
    { name: "wizard", actor: wizard, items: [shield] },
    { name: "explicit non-Champion Fighter", actor: conflictingFighter, items: [] },
    { name: "monster", actor: panther, items: [] },
  ];

  for (const fixture of fixtures) {
    it(`keeps ${fixture.name} option ids, labels, and action economy identical`, () => {
      const authoritative = authoritativeApiRows(fixture.actor, fixture.items);
      const web = webRows(fixture.actor, fixture.items);
      expect(web).toEqual(authoritative);
      expect(web.every((row) => row.actionKind !== undefined)).toBe(true);
    });
  }

  it("pins the T38/T39 and monster economy counterexamples in the generated fixtures", () => {
    expect(authoritativeApiRows(fighter, [])).toEqual(expect.arrayContaining([
      { optionId: "feature-second-wind-healing", label: "Second Wind Healing", actionKind: "bonusAction" },
      { optionId: "feature-tactical-mind-bonus", label: "Tactical Mind Bonus", actionKind: "free" },
    ]));
    expect(authoritativeApiRows(wizard, [shield])).toEqual(expect.arrayContaining([
      { optionId: "spell-item-shield-effect", label: "Shield Effect", actionKind: "reaction" },
    ]));
    expect(authoritativeApiRows(panther, [])).toEqual(expect.arrayContaining([
      { optionId: "monster-nimble-escape-effect", label: "Nimble Escape Effect", actionKind: "bonusAction" },
      { optionId: "monster-rend-damage", label: "Rend Damage", actionKind: "free" },
    ]));
  });

  it("does not revive legacy Champion features when an explicit different subclass is selected", () => {
    const optionIds = webRows(conflictingFighter, []).map((row) => row.optionId);
    expect(optionIds).not.toContain("feature-champion-critical-range");
    expect(optionIds).not.toContain("feature-champion-remarkable-athlete");
  });
});
