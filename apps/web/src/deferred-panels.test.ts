import { describe, expect, it } from "vitest";
import { nonAiPanelImporters } from "./deferred-panels.js";

describe("deferred non-AI panels", () => {
  it("resolves every direct-navigation module without the App entry eagerly importing it", async () => {
    const modules = await Promise.all([
      nonAiPanelImporters.campaignWebhooks(),
      nonAiPanelImporters.compendium(),
      nonAiPanelImporters.compatibility(),
      nonAiPanelImporters.contentImport(),
      nonAiPanelImporters.controlledCreatures(),
      nonAiPanelImporters.dndCharacterReview(),
      nonAiPanelImporters.dndCustomContent(),
      nonAiPanelImporters.dndInventoryCommerce(),
      nonAiPanelImporters.sdk()
    ]);

    expect(modules.map((module) => Object.values(module).some((value) => typeof value === "function"))).toEqual(Array(9).fill(true));
  });
});
