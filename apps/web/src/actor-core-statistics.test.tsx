import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoreStatisticsSection } from "./actor-panel.js";
import { actorCoreStatistics, deathSaveStatusText, rollFormulaModifier } from "./actor-sheet-data.js";

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

  it("preserves the server-authored save mode and its named sources", () => {
    const dangerSenseSheet = {
      ...sheet,
      quickRolls: sheet.quickRolls.map((roll) => roll.id === "save-dexterity" ? {
        ...roll,
        formula: "2d20kh1+2",
        metadata: { d20Mode: "advantage", advantageSources: ["Danger Sense"], disadvantageSources: [] }
      } : roll)
    };
    expect(actorCoreStatistics(dangerSenseSheet).abilities.find((ability) => ability.key === "dexterity")?.save).toEqual({
      rollId: "save-dexterity",
      formula: "2d20kh1+2",
      d20Mode: "advantage",
      advantageSources: ["Danger Sense"]
    });
  });

  it("exposes the death save only for a character at 0 HP, with counters and terminal state", () => {
    const dyingSheet = {
      data: { ...sheet.data, hp: { current: 0, max: 12 }, deathSaves: { successes: 1, failures: 2 }, lifeState: "unconscious" },
      quickRolls: [...sheet.quickRolls, { id: "death-save", label: "Death Saving Throw", formula: "1d20" }]
    };
    expect(actorCoreStatistics(dyingSheet).deathSave).toEqual({ rollId: "death-save", formula: "1d20", successes: 1, failures: 2 });
    // Raw 0-HP data straight from the HP steppers (no lifecycle fields yet) still shows the roll.
    expect(actorCoreStatistics({ ...dyingSheet, data: { ...sheet.data, hp: { current: 0, max: 12 } } }).deathSave).toEqual({ rollId: "death-save", formula: "1d20", successes: 0, failures: 0 });
    // Healthy characters, monsters, and sheets without the roll expose nothing.
    expect(actorCoreStatistics({ ...dyingSheet, data: { ...dyingSheet.data, hp: { current: 5, max: 12 } } }).deathSave).toBeUndefined();
    expect(actorCoreStatistics(dyingSheet, { actorType: "monster" }).deathSave).toBeUndefined();
    expect(actorCoreStatistics({ ...dyingSheet, quickRolls: sheet.quickRolls }).deathSave).toBeUndefined();
    // Terminal lifecycle states surface instead of another roll.
    expect(actorCoreStatistics({ ...dyingSheet, data: { ...dyingSheet.data, lifeState: "stable", deathSaves: { successes: 0, failures: 0 } } }).deathSave).toMatchObject({ state: "stable", successes: 0, failures: 0 });
    expect(actorCoreStatistics({ ...dyingSheet, data: { ...dyingSheet.data, lifeState: "dead", deathSaves: { successes: 0, failures: 3 } } }).deathSave).toMatchObject({ state: "dead", failures: 3 });
  });
});

describe("deathSaveStatusText", () => {
  it("summarizes committed outcomes for the status line", () => {
    expect(deathSaveStatusText({ outcome: "success", successes: 2, failures: 1 })).toBe("success — 2/3 successes, 1/3 failures");
    expect(deathSaveStatusText({ outcome: "critical-failure", successes: 0, failures: 2 })).toBe("natural 1 (two failures) — 0/3 successes, 2/3 failures");
    expect(deathSaveStatusText({ outcome: "critical-success", successes: 0, failures: 0, result: "revived", hitPointsRestored: 1 })).toBe("natural 20 — regains 1 HP and is conscious");
    expect(deathSaveStatusText({ outcome: "success", successes: 3, failures: 1, result: "stable" })).toBe("third success — Stable");
    expect(deathSaveStatusText({ outcome: "failure", successes: 1, failures: 3, result: "dead" })).toBe("third failure — dead");
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

  it("announces and visually labels the authoritative save mode and source", () => {
    const stats = actorCoreStatistics({
      ...sheet,
      quickRolls: sheet.quickRolls.map((roll) => roll.id === "save-dexterity" ? {
        ...roll,
        formula: "2d20kh1+2",
        metadata: { d20Mode: "advantage", advantageSources: ["Danger Sense"], disadvantageSources: [] }
      } : roll)
    });
    const html = renderToStaticMarkup(<CoreStatisticsSection stats={stats} canRoll onRoll={vi.fn()} />);
    expect(html).toContain("Save · Advantage");
    expect(html).toContain("Roll Dexterity saving throw 2d20kh1+2; Advantage from Danger Sense");
  });

  it("shows the death-save counters with a roll control while dying and the terminal state instead once settled", () => {
    const base = actorCoreStatistics(sheet);
    const dying = renderToStaticMarkup(
      <CoreStatisticsSection stats={{ ...base, deathSave: { rollId: "death-save", formula: "1d20", successes: 1, failures: 2 } }} canRoll onRoll={vi.fn()} />
    );
    expect(dying).toContain("Death saves 1/3 - 2/3");
    expect(dying).toContain("Roll Death Saving Throw 1d20");
    const stable = renderToStaticMarkup(
      <CoreStatisticsSection stats={{ ...base, deathSave: { rollId: "death-save", formula: "1d20", successes: 0, failures: 0, state: "stable" } }} canRoll onRoll={vi.fn()} />
    );
    expect(stable).toContain("Stable");
    expect(stable).not.toContain("Roll Death Saving Throw");
    const denied = renderToStaticMarkup(
      <CoreStatisticsSection stats={{ ...base, deathSave: { rollId: "death-save", formula: "1d20", successes: 0, failures: 0 } }} canRoll={false} onRoll={vi.fn()} />
    );
    expect(denied).toContain("disabled");
  });
});
