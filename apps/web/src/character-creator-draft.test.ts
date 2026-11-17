import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterTemplateInfo } from "./api.js";
import {
  CharacterCreatorDialog,
  recoverableCharacterCreatorDraft,
  storedCharacterCreatorDraft,
  type StoredCharacterCreatorDraft
} from "./character-creator-dialog.js";
import { localDraftKey } from "./local-draft-storage.js";

const fighterTemplate = {
  id: "fighter",
  systemId: "dnd-5e-srd",
  name: "Fighter",
  summary: "A martial class",
  actorType: "character",
  items: []
} satisfies CharacterTemplateInfo;

const validDraft = {
  templateId: "fighter",
  stepIndex: 2,
  input: {
    creationMode: "level-one-srd",
    name: "Nyra",
    ownerUserId: "user-1",
    abilityScoreIncreases: { strength: 2, constitution: 1 },
    classSkillProficiencies: ["athletics"],
    classEquipmentChoices: { weapon: "longsword" }
  }
} satisfies StoredCharacterCreatorDraft;

describe("character creator draft recovery", () => {
  it("deeply accepts a safe character draft", () => {
    expect(storedCharacterCreatorDraft(validDraft)).toEqual(validDraft);
  });

  it.each([
    { ...validDraft, stepIndex: 99 },
    { ...validDraft, input: { ...validDraft.input, name: 4 } },
    { ...validDraft, input: { ...validDraft.input, classSkillProficiencies: ["athletics", 4] } },
    { ...validDraft, input: { ...validDraft.input, classEquipmentChoices: { weapon: 4 } } },
    { ...validDraft, input: { ...validDraft.input, abilityScoreIncreases: { strength: Number.POSITIVE_INFINITY } } },
    { ...validDraft, input: { ...validDraft.input, creationMode: "unsupported" } }
  ])("rejects malformed nested data instead of hydrating it", (value) => {
    expect(storedCharacterCreatorDraft(value)).toBeUndefined();
  });

  it("only resumes drafts whose class template is still available", () => {
    expect(recoverableCharacterCreatorDraft(validDraft, [fighterTemplate])).toBe(validDraft);
    expect(recoverableCharacterCreatorDraft(validDraft, [{ ...fighterTemplate, id: "wizard" }])).toBeUndefined();
  });

  it("offers explicit recovery and close decisions and reports save failures truthfully", () => {
    const source = readFileSync(resolve(__dirname, "character-creator-dialog.tsx"), "utf8");
    expect(source).toContain("Resume saved draft");
    expect(source).toContain("Discard draft");
    expect(source).toContain("Keep this character draft?");
    expect(source).toContain("Keep draft and close");
    expect(source).toContain("Discard and close");
    expect(source).toContain("Draft could not be saved in this browser.");
    expect(source).toContain("It remains stored unchanged until you explicitly discard it.");
    expect(source).toContain("inspectLocalDraft<unknown>(draftStorageKey)");
    expect(source).not.toContain("if (storedValue !== undefined && !draft) removeLocalDraft");
    expect(source).toContain("await props.onCreate(template, creationInput())");
    expect(source).toContain("removeLocalDraft(draftStorageKey)");
  });

  it("renders a safe-discard decision without deleting a schema-invalid saved draft", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); }
    };
    const key = localDraftKey("character-creator", "campaign-1", "user-1");
    const rawValue = JSON.stringify({ version: 1, savedAt: "2026-07-17T00:00:00.000Z", value: { ...validDraft, input: { ...validDraft.input, name: 4 } } });
    values.set(key, rawValue);
    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
    try {
      const html = renderToStaticMarkup(createElement(CharacterCreatorDialog, {
        campaignId: "campaign-1",
        templates: [fighterTemplate],
        members: [],
        currentUserId: "user-1",
        onClose: () => undefined,
        onCreate: async () => undefined
      }));
      expect(html).toContain("did not pass safety validation");
      expect(html).toContain("remains stored unchanged");
      expect(html).toContain("Discard draft");
      expect(html).not.toContain("Resume saved draft");
      expect(values.get(key)).toBe(rawValue);
    } finally {
      if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
