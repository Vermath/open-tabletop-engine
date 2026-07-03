import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("character creator", () => {
  it("exposes a guided creator wizard driving the origins endpoint", () => {
    expect(appSource).toContain("function CharacterCreatorDialog");
    expect(appSource).toContain("character-origins");
    expect(appSource).toContain("openCharacterCreator");
    expect(appSource).toContain("createCharacterFromCreator");
    expect(stylesSource).toContain(".modal-dialog.character-creator");
    expect(stylesSource).toContain(".creator-card.selected");
  });

  it("collects the SRD origin choices the API validates", () => {
    expect(appSource).toContain("abilityScoreIncreases");
    expect(appSource).toContain("elfLineage");
    expect(appSource).toContain("gnomeLineage");
    expect(appSource).toContain("tieflingLegacy");
    expect(appSource).toContain("speciesSpellcastingAbility");
    expect(appSource).toContain('aria-label="Human skill proficiency"');
    expect(appSource).toContain('aria-label="Plus two ability"');
  });

  it("is reachable from the party rail and the SDK panel", () => {
    expect(appSource).toContain('aria-label="Open character creator"');
    expect(appSource).toContain("Open character creator");
    expect(appSource).toContain("onOpenCharacterCreator");
  });
});
