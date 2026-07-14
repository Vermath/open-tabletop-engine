import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  applyDnd5eSrdAttunement,
  dnd5eSrdAttunementPrerequisite,
  dnd5eSrdQuickRolls,
  resolveDnd5eSrdAction,
  useDnd5eSrdAction
} from "./index.js";

const timestamp = "2026-07-13T00:00:00.000Z";
const wizard: Actor = {
  id: "act_wizard",
  campaignId: "camp_attunement",
  systemId: "dnd-5e-srd",
  ownerUserId: "usr_player",
  type: "character",
  name: "Iris",
  data: { class: "Wizard", level: 5, attributes: { intelligence: 16 }, hp: { current: 24, max: 24 } },
  permissions: {},
  createdAt: timestamp,
  updatedAt: timestamp
};

function magicItem(id: string, data: Record<string, unknown> = {}): Item {
  return {
    id,
    campaignId: wizard.campaignId,
    systemId: wizard.systemId,
    actorId: wizard.id,
    type: "item",
    name: `Wand ${id}`,
    data: {
      requiresAttunement: true,
      damageFormula: "1d6",
      damageType: "force",
      charges: { current: 3, max: 3 },
      ...data
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("D&D 5e attunement safety", () => {
  it("does not expose or consume an unattuned item's actions", () => {
    const wand = magicItem("itm_wand");
    const rollId = `item-${wand.id}-damage`;
    expect(dnd5eSrdQuickRolls(wizard, [wand]).some((roll) => roll.id === rollId)).toBe(false);
    expect(() => useDnd5eSrdAction(wizard, [wand], rollId)).toThrow("requires active attunement");
    expect(resolveDnd5eSrdAction({
      actor: wizard,
      items: [wand],
      roll: { id: rollId, label: "Stale Wand Action", formula: "1d6", metadata: { damageType: "force" } },
      targets: [{ actor: wizard, rollTotal: 6 }],
      options: { applyEffect: true, consumeResources: true }
    })).toEqual(expect.objectContaining({
      blocked: expect.objectContaining({ code: "attunement_required" }),
      actorUpdates: [],
      effects: []
    }));

    const attuned = { ...wizard, data: applyDnd5eSrdAttunement(wizard, wand, true) };
    expect(dnd5eSrdQuickRolls(attuned, [wand]).some((roll) => roll.id === rollId)).toBe(true);
  });

  it("requires a real, owned item that actually needs attunement", () => {
    const wrongActor = { ...magicItem("itm_other"), actorId: "act_other" };
    const wrongCampaign = { ...magicItem("itm_campaign"), campaignId: "camp_other" };
    const mundane = magicItem("itm_mundane", { requiresAttunement: false });
    delete mundane.data.damageFormula;
    expect(() => applyDnd5eSrdAttunement(wizard, wrongActor, true)).toThrow("does not belong");
    expect(() => applyDnd5eSrdAttunement(wizard, wrongCampaign, true)).toThrow("does not belong");
    expect(() => applyDnd5eSrdAttunement(wizard, mundane, true)).toThrow("does not require attunement");
  });

  it("enforces supported class and spellcaster prerequisites", () => {
    const wizardOnly = magicItem("itm_wizard", { attunementRequirement: "Wizard" });
    const paladinOnly = magicItem("itm_paladin", { attunementRequirement: "Paladin" });
    const spellcaster = magicItem("itm_spellcaster", { attunementRequirement: "Spellcaster" });
    expect(dnd5eSrdAttunementPrerequisite(wizard, wizardOnly)).toEqual(expect.objectContaining({ supported: true, eligible: true }));
    expect(dnd5eSrdAttunementPrerequisite(wizard, spellcaster)).toEqual(expect.objectContaining({ supported: true, eligible: true }));
    expect(() => applyDnd5eSrdAttunement(wizard, paladinOnly, true)).toThrow("requires attunement by Paladin");

    const homebrew = magicItem("itm_homebrew", { attunementRequirement: "Champion of the Ashen Moon" });
    expect(dnd5eSrdAttunementPrerequisite(wizard, homebrew)).toEqual(expect.objectContaining({ supported: false, eligible: false, reason: expect.stringContaining("reviewed override") }));
  });

  it("requires a reasoned override for a fourth active item", () => {
    const items = [1, 2, 3, 4].map((index) => magicItem(`itm_${index}`));
    let actor = wizard;
    for (const item of items.slice(0, 3)) actor = { ...actor, data: applyDnd5eSrdAttunement(actor, item, true) };
    expect(() => applyDnd5eSrdAttunement(actor, items[3]!, true)).toThrow("override reason is required");
    const data = applyDnd5eSrdAttunement(actor, items[3]!, true, { overrideReason: "Thief feature approved by GM" });
    expect((data.rulesEngine as { attunementOverride?: { reason?: string } }).attunementOverride?.reason).toBe("Thief feature approved by GM");
  });
});
