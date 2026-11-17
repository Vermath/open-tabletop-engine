import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { itemPreparedLabel } from "./actor-sheet-data.js";
import { initialPreparedSpellIds, spellItemRevisionMap } from "./dnd-spell-preparation-panel.js";

const actorLoadoutSource = readFileSync(resolve(__dirname, "actor-loadout-panel.tsx"), "utf8");
const preparationPanelSource = readFileSync(resolve(__dirname, "dnd-spell-preparation-panel.tsx"), "utf8");
const timestamp = "2026-07-13T00:00:00.000Z";

const actor: Actor = {
  id: "act_spells",
  campaignId: "camp_spells",
  systemId: "dnd-5e-srd",
  type: "character",
  name: "Prepared Wizard",
  data: {},
  permissions: {},
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("spell preparation UI", () => {
  it("labels always-prepared spells and disables their preparation toggle", () => {
    const item: Item = {
      id: "itm_always_prepared",
      campaignId: "camp_spells",
      systemId: "dnd-5e-srd",
      actorId: "act_spells",
      type: "spell",
      name: "Always Prepared Spell",
      data: { prepared: true, alwaysPrepared: true },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    expect(itemPreparedLabel(item)).toBe("always prepared");
    expect(initialPreparedSpellIds(actor, [item])).toEqual([]);
  });

  it("routes D&D class spells through preview and confirm instead of generic PATCH", () => {
    expect(actorLoadoutSource).toContain("<DndSpellPreparationPanel");
    expect(actorLoadoutSource).toContain('actor.systemId !== "dnd-5e-srd" && (');
    expect(actorLoadoutSource).toContain('isSpellLike && (actor.systemId !== "dnd-5e-srd" || item.type !== "spell")');
    expect(preparationPanelSource).toContain("/spell-preparation`;");
    expect(preparationPanelSource).toContain("/preview`");
    expect(preparationPanelSource).toContain("/apply`");
    expect(preparationPanelSource).toContain("preview.blockers");
    expect(preparationPanelSource).toContain("preview.capacity");
    expect(preparationPanelSource).toContain("preview.changes");
    expect(preparationPanelSource).toContain("I reviewed the timing, capacity, blockers, and exact changes.");
  });

  it("builds revisions for every actor-owned spell and selects only normal prepared spells", () => {
    const prepared: Item = {
      id: "itm_prepared",
      campaignId: actor.campaignId,
      systemId: actor.systemId,
      actorId: actor.id,
      type: "spell",
      name: "Alarm",
      data: { prepared: true },
      createdAt: timestamp,
      updatedAt: "2026-07-13T00:00:01.000Z",
    };
    const alwaysPrepared: Item = {
      ...prepared,
      id: "itm_always",
      name: "Magic Initiate Spell",
      data: { prepared: true, alwaysPrepared: true },
      updatedAt: "2026-07-13T00:00:02.000Z",
    };
    const foreign = { ...prepared, id: "itm_foreign", actorId: "act_other" };

    expect(initialPreparedSpellIds(actor, [alwaysPrepared, prepared, foreign])).toEqual([prepared.id]);
    expect(spellItemRevisionMap(actor, [alwaysPrepared, prepared, foreign])).toEqual({
      [alwaysPrepared.id]: alwaysPrepared.updatedAt,
      [prepared.id]: prepared.updatedAt,
    });
  });
});
