import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DndCustomContentPanel,
  customContentPath,
  defaultDndCustomContentDraft,
  dndCustomContentKinds,
  parseCustomFeatureRows,
  parseCustomNamedRows
} from "./dnd-custom-content-panel.js";
import {
  monsterBasePath,
  monsterTemplatePath,
  monsterVariantPath,
  parseMonsterActions,
  parseNamedFeatures,
  parseNumberMap
} from "./dnd-monster-variant-panel.js";

describe("D&D custom content panel", () => {
  it("renders an accessible typed builder with explicit provenance and reviewed save controls", () => {
    const markup = renderToStaticMarkup(
      <DndCustomContentPanel
        campaignId="campaign/demo"
        campaignUpdatedAt="2026-07-13T00:00:00.000Z"
        onMutation={() => undefined}
        onStatus={() => undefined}
      />
    );

    expect(markup).toContain("D&amp;D custom content");
    expect(markup).toContain("Preview is required");
    expect(markup).toContain("never labeled as official SRD content");
    for (const kind of dndCustomContentKinds) expect(markup).toContain(`value="${kind}"`);
    expect(markup).toContain("Monster stat block");
    expect(markup).toContain("Armor Class");
    expect(markup).toContain("Walking speed (feet)");
    expect(markup).toContain("Usage declaration");
    expect(markup).toContain("Create reviewed content");
    expect(markup).toContain("Monster workshop");
    expect(markup).toContain("Create variant");
    expect(markup).toContain("Manage templates");
    expect(markup).toContain("combat changes require explicit CR and XP");
    expect(markup).toContain("disabled");
  });

  it("creates D&D-specific defaults instead of one universal JSON form", () => {
    expect(defaultDndCustomContentDraft("monster").data).toMatchObject({
      armorClass: 10,
      hitPoints: 1,
      speed: { walk: 30 },
      abilities: { strength: 10, charisma: 10 }
    });
    expect(defaultDndCustomContentDraft("spell").data).toMatchObject({ level: 0, school: "evocation", components: { verbal: true } });
    expect(defaultDndCustomContentDraft("background").data).toMatchObject({ abilityScoreOptions: [], skillProficiencies: [] });
    expect(defaultDndCustomContentDraft("condition").data).toMatchObject({ stacking: "manual" });
  });

  it("parses readable row editors into structured benefits and subclass features", () => {
    expect(parseCustomNamedRows("Slam: Deal bludgeoning damage\ninvalid row\nGuard: Raise AC")).toEqual([
      { name: "Slam", description: "Deal bludgeoning damage" },
      { name: "Guard", description: "Raise AC" }
    ]);
    expect(parseCustomFeatureRows("3 | Vanguard | Gain a defensive stance\n7 | Rally | Help an ally")).toEqual([
      { level: 3, name: "Vanguard", description: "Gain a defensive stance" },
      { level: 7, name: "Rally", description: "Help an ally" }
    ]);
  });

  it("encodes campaign identifiers in API paths", () => {
    expect(customContentPath("campaign/demo")).toBe("/api/v1/campaigns/campaign%2Fdemo/dnd/custom-content");
    expect(monsterTemplatePath("campaign/demo")).toBe("/api/v1/campaigns/campaign%2Fdemo/dnd/monster-templates");
    expect(monsterBasePath("campaign/demo")).toBe("/api/v1/campaigns/campaign%2Fdemo/dnd/monster-bases");
    expect(monsterVariantPath("campaign/demo")).toBe("/api/v1/campaigns/campaign%2Fdemo/dnd/monster-variants");
  });

  it("parses every structured monster override editor without raw JSON", () => {
    expect(parseNumberMap("walk: 30\nfly: 60\ninvalid")).toEqual({ walk: 30, fly: 60 });
    expect(parseNamedFeatures("Pack Tactics: Advantage near an ally\ninvalid")).toEqual([{ name: "Pack Tactics", description: "Advantage near an ally" }]);
    expect(parseMonsterActions("Spear | action | 3 | 1d6+1 | piercing | 20/60 ft. | 5-6 | Prone | dexterity | 11 | half | A reviewed spear attack. | pushed, marked")).toEqual([{
      name: "Spear",
      description: "A reviewed spear attack.",
      kind: "action",
      attackBonus: 3,
      damageFormula: "1d6+1",
      damageType: "piercing",
      range: "20/60 ft.",
      recharge: "5-6",
      condition: "Prone",
      save: { ability: "dexterity", dc: 11, success: "half" },
      effects: ["pushed", "marked"]
    }]);
  });
});
