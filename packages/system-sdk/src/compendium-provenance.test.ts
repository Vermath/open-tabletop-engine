import { describe, expect, it } from "vitest";
import {
  dnd5eSrdCompendium,
  dnd5eSrdCompendiumEntry,
  genericFantasyCompendium,
  mysticNoirCompendium,
  stellarFrontiersCompendium
} from "./index.js";

describe("bundled compendium provenance", () => {
  it("attaches one transparent provenance record to every bundled entry", () => {
    const catalogs = [
      dnd5eSrdCompendium(),
      genericFantasyCompendium(),
      stellarFrontiersCompendium(),
      mysticNoirCompendium()
    ];

    for (const catalog of catalogs) {
      expect(catalog.length).toBeGreaterThan(0);
      for (const entry of catalog) {
        expect(entry.provenance.systemId).toBeTruthy();
        expect(entry.provenance.systemVersion).toBeTruthy();
        expect(entry.provenance.rulesVersion).toBeTruthy();
        expect(entry.provenance.contentVersion).toBeTruthy();
        expect(entry.provenance.license.name).toBeTruthy();
      }
    }
  });

  it("identifies the D&D catalog as SRD 5.2.1 under CC BY 4.0", () => {
    const entry = dnd5eSrdCompendiumEntry("longsword");

    expect(entry?.provenance).toMatchObject({
      sourceKind: "srd",
      sourceVersion: "5.2.1",
      contentVersion: "5.2.1",
      systemId: "dnd-5e-srd",
      systemVersion: "5.2.1",
      rulesVersion: "SRD 5.2.1",
      license: {
        usage: "srd"
      }
    });
    expect(entry?.provenance.license.url).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("marks the example systems as bundled MIT content", () => {
    for (const catalog of [genericFantasyCompendium(), stellarFrontiersCompendium(), mysticNoirCompendium()]) {
      expect(catalog.every((entry) => entry.provenance.sourceKind === "bundled")).toBe(true);
      expect(catalog.every((entry) => entry.provenance.license.name === "MIT" && entry.provenance.license.usage === "open")).toBe(true);
    }
  });
});
