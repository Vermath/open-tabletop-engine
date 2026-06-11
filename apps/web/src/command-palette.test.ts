import { describe, expect, it } from "vitest";
import { filterPaletteCommands, fuzzyScore, movePaletteIndex, paletteDiceFormula, type PaletteCommand } from "./command-palette.js";

const commands: PaletteCommand[] = [
  { id: "ws-live", label: "Go to Live Table", section: "Workspace", keywords: "play board map" },
  { id: "ws-prep", label: "Go to Prep", section: "Workspace", keywords: "scenes assets journals" },
  { id: "scene-vault", label: "Open scene: Vault Entry", section: "Scenes" },
  { id: "scene-crypt", label: "Open scene: Crypt of Embers", section: "Scenes" },
  { id: "theme", label: "Switch theme", section: "Actions", keywords: "midnight ember appearance" }
];

describe("palette dice formula detection", () => {
  it("recognizes bare formulas", () => {
    expect(paletteDiceFormula("1d20+5")).toBe("1d20+5");
    expect(paletteDiceFormula("2d6 + 3")).toBe("2d6 + 3");
    expect(paletteDiceFormula("d20")).toBe("d20");
    expect(paletteDiceFormula("4d6+1d8+2")).toBe("4d6+1d8+2");
  });

  it("strips roll command prefixes", () => {
    expect(paletteDiceFormula("/roll 2d6")).toBe("2d6");
    expect(paletteDiceFormula("/r 1d20+5")).toBe("1d20+5");
  });

  it("rejects plain text and empty queries", () => {
    expect(paletteDiceFormula("vault")).toBe(null);
    expect(paletteDiceFormula("")).toBe(null);
    expect(paletteDiceFormula("d")).toBe(null);
    expect(paletteDiceFormula("20+5")).toBe(null);
  });
});

describe("fuzzy scoring", () => {
  it("matches subsequences and rejects non-matches", () => {
    expect(fuzzyScore("vlt", "vault entry")).not.toBe(null);
    expect(fuzzyScore("xyz", "vault entry")).toBe(null);
  });

  it("ranks word-start and adjacent matches higher", () => {
    const wordStart = fuzzyScore("vault", "open scene: vault entry");
    const scattered = fuzzyScore("vault", "very animated ultra long title");
    expect(wordStart).not.toBe(null);
    expect(scattered).not.toBe(null);
    expect(wordStart!).toBeGreaterThan(scattered!);
  });
});

describe("palette filtering", () => {
  it("returns everything for an empty query", () => {
    expect(filterPaletteCommands(commands, "")).toHaveLength(commands.length);
  });

  it("filters and ranks by label", () => {
    const results = filterPaletteCommands(commands, "vault");
    expect(results[0]?.id).toBe("scene-vault");
  });

  it("matches keywords", () => {
    const results = filterPaletteCommands(commands, "ember");
    const ids = results.map((command) => command.id);
    expect(ids).toContain("theme");
    expect(ids).toContain("scene-crypt");
  });

  it("drops commands that do not match", () => {
    const results = filterPaletteCommands(commands, "journals");
    expect(results.map((command) => command.id)).toEqual(["ws-prep"]);
  });
});

describe("palette index movement", () => {
  it("wraps in both directions", () => {
    expect(movePaletteIndex(0, 1, 3)).toBe(1);
    expect(movePaletteIndex(2, 1, 3)).toBe(0);
    expect(movePaletteIndex(0, -1, 3)).toBe(2);
  });

  it("stays at zero for empty lists", () => {
    expect(movePaletteIndex(5, 1, 0)).toBe(0);
  });
});
