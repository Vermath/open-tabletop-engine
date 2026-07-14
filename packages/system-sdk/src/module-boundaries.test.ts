import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const monsterCatalogSource = readFileSync(new URL("./dnd-monster-stat-blocks.ts", import.meta.url), "utf8");
const staticContentSource = readFileSync(new URL("./dnd-static-content.ts", import.meta.url), "utf8");
const rollIdentifiersSource = readFileSync(new URL("./dnd-roll-identifiers.ts", import.meta.url), "utf8");

function physicalLineCount(source: string): number {
  return source.split(/\r?\n/).length;
}

describe("System SDK module boundaries", () => {
  it("keeps the public orchestration entrypoint below the remediated architecture budget", () => {
    expect(physicalLineCount(indexSource)).toBeLessThanOrEqual(18_000);
    expect(indexSource).toContain('from "./dnd-monster-stat-blocks.js"');
    expect(indexSource).toContain('from "./dnd-static-content.js"');
    expect(indexSource).toContain('from "./dnd-roll-identifiers.js"');
    expect(indexSource).not.toContain("const DND_5E_SRD_MONSTER_STAT_BLOCKS");
    expect(indexSource).not.toContain("export const DND_5E_SRD_DEATH_SAVE_ROLL_ID");
    expect(indexSource).not.toContain("const DND_5E_SRD_CONDITION_ENTRIES:");
  });

  it("keeps immutable monster content in a bounded dependency-free catalog module", () => {
    expect(physicalLineCount(monsterCatalogSource)).toBeGreaterThan(7_500);
    expect(physicalLineCount(monsterCatalogSource)).toBeLessThanOrEqual(8_500);
    expect(monsterCatalogSource).toContain("export const DND_5E_SRD_MONSTER_STAT_BLOCKS");
    expect(monsterCatalogSource).toContain("aboleth:");
    expect(monsterCatalogSource).toContain("zombie:");
    expect(monsterCatalogSource.match(/^import\s/gm) ?? []).toEqual([]);
    expect(monsterCatalogSource).not.toMatch(/@open-tabletop\//);
  });

  it("keeps immutable rules content and stable roll identifiers dependency-free", () => {
    expect(physicalLineCount(staticContentSource)).toBeLessThanOrEqual(250);
    expect(staticContentSource).toContain("export const DND_5E_SRD_CONDITION_ENTRIES");
    expect(staticContentSource).toContain("export const DND_5E_SRD_ENCOUNTER_XP_BUDGETS_BY_LEVEL");
    expect(rollIdentifiersSource).toContain("export const DND_5E_SRD_DEATH_SAVE_ROLL_ID");
    expect(rollIdentifiersSource).toContain("export const DND_5E_SRD_ORC_RELENTLESS_ENDURANCE_ROLL_ID");
    expect(staticContentSource.match(/^import\s/gm) ?? []).toEqual([]);
    expect(rollIdentifiersSource.match(/^import\s/gm) ?? []).toEqual([]);
    expect(staticContentSource).not.toMatch(/@open-tabletop\//);
    expect(rollIdentifiersSource).not.toMatch(/@open-tabletop\//);
  });
});
