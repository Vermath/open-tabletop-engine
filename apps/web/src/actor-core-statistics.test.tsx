import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoreStatisticsSection } from "./actor-panel.js";
import { actorCoreStatistics, rollFormulaModifier } from "./actor-sheet-data.js";

const sheet = {
  data: { attributes: { strength: 16, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 12, charisma: 8 }, effectiveSpeed: 30 },
  quickRolls: [
    { id: "ability-strength", label: "Strength Check", formula: "1d20+3" },
    { id: "ability-dexterity", label: "Dexterity Check", formula: "1d20+2" },
    { id: "save-strength", label: "Strength Save", formula: "1d20+5" },
    { id: "save-dexterity", label: "Dexterity Save", formula: "1d20+2" },
    { id: "initiative", label: "Initiative", formula: "1d20+2" },
    { id: "skill-perception", label: "Perception Check", formula: "1d20+3" },
    { id: "skill-athletics", label: "Athletics Check", formula: "1d20+5" },
    { id: "feature-second-wind-healing", label: "Second Wind Healing", formula: "1d10+1" }
  ]
};

describe("rollFormulaModifier", () => {
  it("reads the flat modifier out of server-computed d20 formulas", () => {
    expect(rollFormulaModifier("1d20+5")).toBe(5);
    expect(rollFormulaModifier("1d20-1")).toBe(-1);
    expect(rollFormulaModifier("2d20kh1+3")).toBe(3);
    expect(rollFormulaModifier("1d20+3+1d4")).toBe(3);
    expect(rollFormulaModifier("1d20")).toBe(0);
    expect(rollFormulaModifier("0")).toBeUndefined();
  });
});

describe("actorCoreStatistics", () => {
  it("derives abilities, saves, initiative, speed, passives, and skills from the authoritative sheet payload", () => {
    const stats = actorCoreStatistics(sheet);
    expect(stats.abilities).toEqual([
      expect.objectContaining({ key: "strength", label: "Strength", score: 16, modifier: 3, check: { rollId: "ability-strength", formula: "1d20+3" }, save: { rollId: "save-strength", formula: "1d20+5" } }),
      expect.objectContaining({ key: "dexterity", label: "Dexterity", score: 14, modifier: 2 })
    ]);
    expect(stats.initiative).toEqual({ rollId: "initiative", formula: "1d20+2" });
    expect(stats.speed).toBe(30);
    expect(stats.passives).toEqual([expect.objectContaining({ id: "passive-perception", label: "Passive Perception", value: 13 })]);
    expect(stats.skills).toEqual([
      { rollId: "skill-perception", label: "Perception", formula: "1d20+3" },
      { rollId: "skill-athletics", label: "Athletics", formula: "1d20+5" }
    ]);
  });

  it("returns an empty model for payloads without ability quick rolls", () => {
    expect(actorCoreStatistics({ quickRolls: [], data: {} }).abilities).toEqual([]);
    expect(actorCoreStatistics({}).abilities).toEqual([]);
  });
});

describe("CoreStatisticsSection", () => {
  it("exposes ability check, saving throw, initiative, passive, and skill roll affordances", () => {
    const html = renderToStaticMarkup(<CoreStatisticsSection stats={actorCoreStatistics(sheet)} canRoll onRoll={vi.fn()} />);
    expect(html).toContain("Strength");
    expect(html).toContain("Roll Strength check 1d20+3");
    expect(html).toContain("Roll Strength saving throw 1d20+5");
    expect(html).toContain("Roll initiative 1d20+2");
    expect(html).toContain("Passive Perception");
    expect(html).toContain("Speed 30 ft");
    expect(html).toContain("Roll Athletics check 1d20+5");
  });

  it("renders nothing when the sheet has no ability rolls", () => {
    expect(renderToStaticMarkup(<CoreStatisticsSection stats={actorCoreStatistics({})} canRoll onRoll={vi.fn()} />)).toBe("");
  });
});
