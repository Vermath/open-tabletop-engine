import { emptyState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { validateCampaignArchiveShape } from "./archive-validation.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function archiveWith(collection: "actors" | "items", record: Record<string, unknown>) {
  const data = emptyState() as unknown as Record<string, unknown[]>;
  data[collection] = [record];
  return {
    format: "ottx",
    version: "0.2.0",
    exportedAt: timestamp,
    manifest: { campaignId: "camp_archive", name: "D&D validation", schemaVersion: "0.3.0", assetCount: 0, assetFileCount: 0 },
    data,
    files: []
  };
}

describe("D&D archive schema validation", () => {
  it("accepts a legacy flat actor losslessly when every managed root is structurally valid", () => {
    const legacy = {
      id: "act_legacy_dnd",
      campaignId: "camp_archive",
      systemId: "dnd-5e-srd",
      type: "character",
      name: "Legacy Homebrew Fighter",
      data: {
        ruleset: "SRD 5.2.1",
        class: "Fighter",
        level: 1,
        classes: [{ class: "Fighter", level: 1, homebrewProgression: "keep" }],
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        hp: { current: 12, max: 12 },
        hitDice: { current: 1, max: 1, size: "d10" },
        temporaryHitPoints: { current: 2, source: "homebrew ward" },
        resources: { secondWind: { current: 1, max: 1 }, homebrewClock: { segments: 6 } },
        conditions: [],
        mysterySubsystem: { mode: "preserve-me" }
      },
      permissions: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const result = validateCampaignArchiveShape(archiveWith("actors", legacy), { maxAssetBytes: 1024 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.data.actors[0]?.data).toEqual(legacy.data);
  });

  it("rejects a D&D actor that omits required durable fields", () => {
    const result = validateCampaignArchiveShape(archiveWith("actors", {
      id: "act_missing_dnd",
      campaignId: "camp_archive",
      systemId: "dnd-5e-srd",
      type: "character",
      name: "Incomplete Fighter",
      data: {},
      permissions: {},
      createdAt: timestamp,
      updatedAt: timestamp
    }), { maxAssetBytes: 1024 });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected an invalid archive result");
    expect(result.error).toContain("schema.required");
  });

  it("rejects a structurally valid actor with invalid D&D Hit Points before import", () => {
    const result = validateCampaignArchiveShape(archiveWith("actors", {
      id: "act_invalid_dnd",
      campaignId: "camp_archive",
      systemId: "dnd-5e-srd",
      type: "character",
      name: "Invalid Fighter",
      data: {
        ruleset: "SRD 5.2.1",
        class: "Fighter",
        level: 1,
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        hp: { current: 15, max: 10 },
        hitDice: { current: 1, max: 1, size: "d10" }
      },
      permissions: {},
      createdAt: timestamp,
      updatedAt: timestamp
    }), { maxAssetBytes: 1024 });

    expect(result).toEqual({
      ok: false,
      error: "Campaign archive actors record act_invalid_dnd: D&D SRD 5.2.1 schema 1.0.0 validation failed at /data/hp/current (rules.pool_above_maximum): Current value cannot exceed the maximum."
    });
  });

  it("rejects an invalid known D&D item field while allowing unknown homebrew fields", () => {
    const result = validateCampaignArchiveShape(archiveWith("items", {
      id: "itm_invalid_dnd",
      campaignId: "camp_archive",
      systemId: "dnd-5e-srd",
      type: "weapon",
      name: "Invalid Quantity",
      data: { quantity: -1, homebrewRule: { preserved: true } },
      createdAt: timestamp,
      updatedAt: timestamp
    }), { maxAssetBytes: 1024 });

    expect(result).toEqual({
      ok: false,
      error: "Campaign archive items record itm_invalid_dnd: D&D SRD 5.2.1 schema 1.0.0 validation failed at /data/quantity (schema.minimum): Expected a value of at least 0."
    });
  });

  it("reports a sourced managed resource error before archive import mutates state", () => {
    const result = validateCampaignArchiveShape(archiveWith("actors", {
      id: "act_invalid_resource",
      campaignId: "camp_archive",
      systemId: "dnd-5e-srd",
      type: "character",
      name: "Invalid Resource Fighter",
      data: {
        ruleset: "SRD 5.2.1",
        class: "Fighter",
        level: 1,
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        hp: { current: 12, max: 12 },
        hitDice: { current: 1, max: 1, size: "d10" },
        resources: { rage: { current: 3, max: 2 } }
      },
      permissions: {},
      createdAt: timestamp,
      updatedAt: timestamp
    }), { maxAssetBytes: 1024 });

    expect(result).toEqual({
      ok: false,
      error: "Campaign archive actors record act_invalid_resource: D&D SRD 5.2.1 schema 1.0.0 validation failed at /data/resources/rage/current (rules.pool_above_maximum): Current value cannot exceed the maximum."
    });
  });
});
