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
    expect(creatorSource).toContain("classSkillProficiencies");
    expect(creatorSource).toContain("classSkillChoices");
    expect(creatorSource).toContain("originLanguageChoices");
    expect(creatorSource).toContain("classLanguageChoices");
    expect(creatorSource).toContain("draconicAncestry");
    expect(creatorSource).toContain("giantAncestry");
    expect(creatorSource).toContain("classEquipmentPackageId");
    expect(creatorSource).toContain("backgroundEquipmentPackageId");
    expect(creatorSource).toContain("classToolProficiencyChoices");
    expect(creatorSource).toContain("backgroundToolProficiencyChoice");
    expect(creatorSource).toContain("weaponMasteryChoices");
    expect(creatorSource).toContain("elfLineage");
    expect(creatorSource).toContain("gnomeLineage");
    expect(creatorSource).toContain("tieflingLegacy");
    expect(creatorSource).toContain("speciesSpellcastingAbility");
    expect(creatorSource).toContain('creationMode = "level-one-srd"');
    expect(creatorSource).toContain("validateCharacterCreatorInput");
    expect(creatorSource).toContain("validationIssues.length > 0");
    expect(creatorSource).toContain('aria-label="Human skill proficiency"');
    expect(creatorSource).toContain('aria-label="Draconic ancestry"');
    expect(creatorSource).toContain('aria-label="Giant ancestry"');
    expect(creatorSource).toContain('name="class-starting-equipment"');
    expect(creatorSource).toContain('name="background-starting-equipment"');
    expect(creatorSource).toContain("You do not need to start with or equip the weapon");
    expect(creatorSource).toContain('aria-label="Plus two ability"');
    expect(creatorSource).toContain("Origin language ${language.label}");
    expect(creatorSource).toContain("class language ${language.label}");
    expect(creatorSource).toContain("Common is included automatically");
    expect(creatorSource).toContain("Standard or Rare tables");
    expect(creatorSource).toContain('type="checkbox"');
    expect(creatorSource).toContain("classSkillProficiencies.length >= classSkillChoice.count");
  });

  it("is reachable from the party rail and the SDK panel", () => {
    expect(appSource).toContain('aria-label="Open character creator"');
    expect(appSource).toContain("Open character creator");
    expect(appSource).toContain("onOpenCharacterCreator");
  });

  it("gives the close confirmation exclusive modal ownership", () => {
    expect(creatorSource).toContain('aria-modal={closePromptOpen ? undefined : "true"}');
    expect(creatorSource).toContain('aria-hidden={closePromptOpen ? "true" : undefined}');
    expect(creatorSource).toContain("inert={closePromptOpen ? true : undefined}");
    expect(creatorSource).toContain('<CharacterDraftClosePrompt');
    expect(creatorSource).toContain('className="modal-dialog confirm-dialog"\n        role="dialog"\n        aria-modal="true"');
  });
});
