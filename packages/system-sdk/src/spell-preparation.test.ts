import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  dnd5eSrdQuickRolls,
  resolveDnd5eSrdAction,
  useDnd5eSrdAction,
  validateDnd5eSrdItem
} from "./index.js";

const timestamp = "2026-07-13T00:00:00.000Z";
const wizard: Actor = {
  id: "act_spell_preparation",
  campaignId: "camp_spell_preparation",
  systemId: "dnd-5e-srd",
  ownerUserId: "usr_player",
  type: "character",
  name: "Prepared Wizard",
  data: { class: "Wizard", level: 3, attributes: { intelligence: 16 }, hp: { current: 18, max: 18 } },
  permissions: {},
  createdAt: timestamp,
  updatedAt: timestamp
};

function spell(data: Record<string, unknown>): Item {
  return {
    id: "itm_burning_bolt",
    campaignId: wizard.campaignId,
    systemId: wizard.systemId,
    actorId: wizard.id,
    type: "spell",
    name: "Burning Bolt",
    data: { damageFormula: "1d10", damageType: "fire", spellAttack: true, ...data },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("D&D spell preparation", () => {
  it("does not expose explicitly unprepared spells as actions", () => {
    const unprepared = spell({ prepared: false });
    const prepared = spell({ prepared: true });
    expect(dnd5eSrdQuickRolls(wizard, [unprepared]).some((roll) => roll.id.includes(unprepared.id))).toBe(false);
    expect(dnd5eSrdQuickRolls(wizard, [prepared]).some((roll) => roll.id.includes(prepared.id))).toBe(true);
  });

  it("blocks a stale unprepared spell action without applying or consuming anything", () => {
    const unprepared = spell({ prepared: false });
    const rollId = `spell-${unprepared.id}-damage`;
    expect(() => useDnd5eSrdAction(wizard, [unprepared], rollId)).toThrow("must be prepared");
    expect(resolveDnd5eSrdAction({
      actor: wizard,
      items: [unprepared],
      roll: { id: rollId, label: "Stale Burning Bolt", formula: "1d10", metadata: { damageType: "fire" } },
      targets: [{ actor: wizard, rollTotal: 6 }],
      options: { applyEffect: true, consumeResources: true }
    })).toEqual(expect.objectContaining({
      blocked: expect.objectContaining({ code: "spell_not_prepared" }),
      actorUpdates: [],
      itemUpdates: [],
      effects: []
    }));
  });

  it("reports an always-prepared spell that was forcibly unprepared", () => {
    const report = validateDnd5eSrdItem(spell({ alwaysPrepared: true, prepared: false }));
    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      path: "/data/prepared",
      severity: "error",
      code: "rules.always_prepared"
    }));
  });
});
