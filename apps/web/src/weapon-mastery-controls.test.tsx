import type { Actor, Item } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeaponMasteryControls, emptyWeaponMasteryDraft, weaponMasterySelectionForAction, weaponMasteryUseForSelection } from "./weapon-mastery-controls.js";

const actor = (id: string, name = id): Actor => ({ id, campaignId: "campaign", systemId: "dnd-5e-srd", type: "character", name, permissions: {}, data: {}, createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z" });
const weapon = (id: string, name: string, mastery: string, compendiumId?: string): Item => ({ id, campaignId: "campaign", systemId: "dnd-5e-srd", actorId: "source", type: "item", name, data: { category: "weapon", mastery, ...(compendiumId ? { compendiumId } : {}) }, createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z" });

describe("Weapon Mastery combat controls", () => {
  it("exposes mastery only for the actor's selected eligible weapon", () => {
    const greataxe = weapon("inventory-greataxe", "Greataxe", "cleave", "greataxe");
    const fighter = { ...actor("source", "Ari"), data: { weaponMasteries: [{ weaponId: "greataxe", mastery: "cleave" }] } };

    expect(weaponMasterySelectionForAction(fighter, [greataxe], `item-${greataxe.id}-attack`)).toEqual({ itemId: greataxe.id, itemName: "Greataxe", property: "cleave" });
    expect(weaponMasterySelectionForAction(actor("untrained"), [greataxe], `item-${greataxe.id}-attack`)).toBeUndefined();
  });

  it("sends only property-relevant reviewed declarations", () => {
    const draft = { ...emptyWeaponMasteryDraft(), use: true, damageDealt: true, nickExtraAttack: true, secondaryTargetActorId: "secondary", geometryConfirmed: true, pushDistanceFeet: 10 };

    expect(weaponMasteryUseForSelection({ itemId: "one", itemName: "Greataxe", property: "cleave" }, draft)).toEqual({ use: true, secondaryTargetActorId: "secondary", geometryConfirmed: true });
    expect(weaponMasteryUseForSelection({ itemId: "two", itemName: "Longbow", property: "slow" }, draft)).toEqual({ use: true, damageDealt: true });
    expect(weaponMasteryUseForSelection({ itemId: "three", itemName: "Dagger", property: "nick" }, draft)).toEqual({ use: true, nickExtraAttack: true });
    expect(weaponMasteryUseForSelection({ itemId: "four", itemName: "Handaxe", property: "vex" }, draft)).toEqual({ use: true, damageDealt: true });
    expect(weaponMasteryUseForSelection({ itemId: "five", itemName: "Mace", property: "sap" }, draft)).toEqual({ use: true });
    expect(weaponMasteryUseForSelection({ itemId: "six", itemName: "Greatsword", property: "graze" }, draft)).toEqual({ use: true });
    expect(weaponMasteryUseForSelection({ itemId: "seven", itemName: "Battleaxe", property: "topple" }, draft)).toEqual({ use: true });
    expect(weaponMasteryUseForSelection({ itemId: "eight", itemName: "Warhammer", property: "push" }, draft)).toEqual({ use: true, geometryConfirmed: true, pushDistanceFeet: 10 });
  });

  it("renders secondary-target and explicit non-inferred geometry review", () => {
    const html = renderToStaticMarkup(
      <WeaponMasteryControls
        selection={{ itemId: "one", itemName: "Greataxe", property: "cleave" }}
        draft={{ ...emptyWeaponMasteryDraft(), use: true }}
        actors={[actor("source", "Ari"), actor("primary", "Ogre"), actor("secondary", "Goblin")]}
        sourceActorId="source"
        primaryTargetActorId="primary"
        disabled={false}
        onChange={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Cleave secondary target"');
    expect(html).toContain("Goblin");
    expect(html).not.toContain("Ogre</option>");
    expect(html).toContain("does not infer Cleave reach or 5-foot geometry");
  });

  it("passes the reviewed declaration through preview and prepared commit", () => {
    const actorPanelSource = readFileSync(new URL("./actor-panel.tsx", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(actorPanelSource).toContain("weaponMastery: weaponMasteryUseForSelection");
    expect(actorPanelSource).toContain("weaponMastery: previewWeaponMasteryUse");
    expect(appSource).toContain("weaponMastery: options.weaponMastery");
    expect(appSource).toContain("options.applyEffect || options.weaponMastery?.use");
  });
});
