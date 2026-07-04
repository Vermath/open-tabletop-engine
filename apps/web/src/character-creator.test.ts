import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const creatorSource = readFileSync(resolve(__dirname, "character-creator-dialog.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("character creator", () => {
  it("exposes a guided creator wizard driving the origins endpoint", () => {
    expect(creatorSource).toContain("function CharacterCreatorDialog");
    expect(appSource).toContain("character-origins");
    expect(appSource).toContain("openCharacterCreator");
    expect(appSource).toContain("createCharacterFromCreator");
    expect(stylesSource).toContain(".modal-dialog.character-creator");
    expect(stylesSource).toContain(".creator-card.selected");
  });

  it("collects the SRD origin choices the API validates", () => {
    expect(creatorSource).toContain("abilityScoreIncreases");
    expect(creatorSource).toContain("elfLineage");
    expect(creatorSource).toContain("gnomeLineage");
    expect(creatorSource).toContain("tieflingLegacy");
    expect(creatorSource).toContain("speciesSpellcastingAbility");
    expect(creatorSource).toContain('aria-label="Human skill proficiency"');
    expect(creatorSource).toContain('aria-label="Plus two ability"');
  });

  it("is reachable from the party rail and the SDK panel", () => {
    expect(appSource).toContain('aria-label="Open character creator"');
    expect(appSource).toContain("Open character creator");
    expect(appSource).toContain("onOpenCharacterCreator");
  });
});
