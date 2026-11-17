import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { actorActionOptions, actorDamageTraitValues, actorRageStatus } from "./actor-sheet-data.js";

const timestamp = "2026-07-15T00:00:00.000Z";

const barbarian: Actor = {
  id: "act_raging_barbarian",
  campaignId: "camp_rage",
  systemId: "dnd-5e-srd",
  type: "character",
  name: "Kara Stoneheart",
  permissions: {},
  data: {
    class: "Barbarian",
    level: 9,
    attributes: { strength: 18, dexterity: 16 },
    resources: { rage: { current: 2, max: 4 } },
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const greataxe: Item = {
  id: "itm_greataxe",
  campaignId: barbarian.campaignId,
  systemId: barbarian.systemId,
  actorId: barbarian.id,
  type: "equipment",
  name: "Greataxe",
  data: { category: "weapon", weaponCategory: "martial", ability: "strength", damage: "1d12", equipped: true },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const longbow: Item = {
  ...greataxe,
  id: "itm_longbow",
  name: "Longbow",
  data: { category: "weapon", weaponCategory: "martial", ability: "dexterity", damage: "1d8", equipped: true },
};

function ragingActor(): Actor {
  return {
    ...barbarian,
    data: {
      ...barbarian.data,
      rulesEngine: {
        activeEffects: [{
          id: "rage:act_raging_barbarian:1",
          kind: "rage",
          lifecycleVersion: 1,
          rollId: "feature-rage",
          damageBonus: 3,
          resistance: ["bludgeoning", "piercing", "slashing"],
          expiresAtRound: 5,
          maximumExpiresAtRound: 104,
        }],
      },
    },
  };
}

describe("authoritative Rage sheet data", () => {
  it("switches the normal action sheet from start to extend/end while Rage is active", () => {
    expect(actorActionOptions(barbarian, []).map((action) => action.rollId)).toContain("feature-rage");

    const rollIds = actorActionOptions(ragingActor(), []).map((action) => action.rollId);
    expect(rollIds).not.toContain("feature-rage");
    expect(rollIds).toEqual(expect.arrayContaining(["feature-rage-extend", "feature-rage-end", "feature-rage-damage-bonus"]));
  });

  it("surfaces the resolver-owned badge, expiry, and physical resistances", () => {
    expect(actorRageStatus(ragingActor())).toEqual({
      label: "Raging (+3 damage; B/P/S resistance)",
      damageBonus: 3,
      resistances: ["bludgeoning", "piercing", "slashing"],
      expiresAtRound: 5,
      maximumExpiresAtRound: 104,
    });
    expect(actorDamageTraitValues(ragingActor(), ["resistances"])).toEqual(["bludgeoning", "piercing", "slashing"]);
  });

  it("shows the automatic bonus only on eligible Strength weapon damage", () => {
    const actions = actorActionOptions(ragingActor(), [greataxe, longbow]);
    expect(actions.find((action) => action.rollId === "item-itm_greataxe-damage")?.description).toContain("1d12+4+3");
    expect(actions.find((action) => action.rollId === "item-itm_longbow-damage")?.description).toContain("1d8+3");
    expect(actions.find((action) => action.rollId === "item-itm_longbow-damage")?.description).not.toContain("1d8+3+3");
  });
});
