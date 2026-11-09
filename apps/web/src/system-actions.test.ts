import type { SystemManifestIdentity } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import type { SystemRuntimeInfo } from "./api.js";
import {
  prepareDeclarativeCharacter,
  prepareSystemActivation,
  prepareSystemBinding,
  prepareSystemManifestInstall,
  systemRollId,
  systemRollLabel
} from "./system-actions.js";

const campaign = { id: "campaign/one", updatedAt: "2026-09-06T10:00:00.123Z" };
const previousIdentity: SystemManifestIdentity = { systemId: "custom/fantasy", version: "1.0.0", checksum: "a".repeat(64) };
const nextIdentity: SystemManifestIdentity = { systemId: "custom/fantasy", version: "2.0.0", checksum: "b".repeat(64) };

function system(): SystemRuntimeInfo {
  return {
    id: "custom/fantasy", name: "Custom fantasy", version: "1.0.0", active: true,
    definition: {
      kind: "declarative-v1", actorTypes: ["traveler"], itemTypes: ["gear"],
      actorDefaults: { focus: 3 }, itemDefaults: {}, sheet: { fields: [] }, quickRolls: []
    },
    installedVersions: [{ ...previousIdentity }, { ...nextIdentity }],
    binding: { ...previousIdentity }
  };
}

describe("declarative system binding requests", () => {
  it("captures the exact campaign revision and previous and selected identities for stable retries", () => {
    const target = system();
    const selected = { ...nextIdentity };
    const sourceCampaign = { ...campaign };
    const request = prepareSystemBinding(sourceCampaign, target, selected);

    expect(request.path).toBe("/api/v1/campaigns/campaign%2Fone/systems/custom%2Ffantasy/binding");
    expect(request.payload).toEqual({ expectedUpdatedAt: campaign.updatedAt, system: nextIdentity, expectedBinding: previousIdentity });
    expect(prepareSystemBinding(sourceCampaign, target, selected).idempotencyKey).toBe(request.idempotencyKey);
    expect(prepareSystemBinding({ ...sourceCampaign, updatedAt: "new-revision" }, target, selected).idempotencyKey).not.toBe(request.idempotencyKey);
    expect(prepareSystemBinding(sourceCampaign, { ...target, binding: { ...nextIdentity } }, selected).idempotencyKey).not.toBe(request.idempotencyKey);
    expect(prepareSystemBinding(sourceCampaign, target, previousIdentity).idempotencyKey).not.toBe(request.idempotencyKey);

    sourceCampaign.updatedAt = "new-revision";
    selected.checksum = "c".repeat(64);
    target.binding!.version = "changed-after-prepare";
    expect(request.payload).toEqual({ expectedUpdatedAt: campaign.updatedAt, system: nextIdentity, expectedBinding: previousIdentity });
  });

  it("rejects undeclared versions, mismatched checksums, foreign systems, and nondeclarative systems", () => {
    for (const identity of [
      { ...nextIdentity, version: "3.0.0" },
      { ...nextIdentity, checksum: "c".repeat(64) },
      { ...nextIdentity, systemId: "another-system" }
    ]) {
      expect(() => prepareSystemBinding(campaign, system(), identity)).toThrow("Choose an installed version");
    }
    expect(() => prepareSystemBinding(campaign, { ...system(), installedVersions: [] }, nextIdentity)).toThrow();
    expect(() => prepareSystemBinding(campaign, { ...system(), definition: undefined }, nextIdentity)).toThrow();
  });

  it("sends an explicit null previous binding when selecting the first installed version", () => {
    const request = prepareSystemBinding(campaign, { ...system(), binding: undefined }, nextIdentity);
    expect(request.payload.expectedBinding).toBeNull();
    expect(request.payload.system).toEqual(nextIdentity);
  });

  it("requires a declarative binding before activation and captures the campaign revision", () => {
    expect(() => prepareSystemActivation(campaign, { ...system(), binding: undefined })).toThrow("Bind an installed version");
    const sourceCampaign = { ...campaign };
    const request = prepareSystemActivation(sourceCampaign, system());
    sourceCampaign.updatedAt = "new-revision";
    expect(request.path).toBe("/api/v1/campaigns/campaign%2Fone/systems/custom%2Ffantasy/install");
    expect(request.payload).toEqual({ expectedUpdatedAt: campaign.updatedAt });
    expect(prepareSystemActivation(campaign, system()).idempotencyKey).toBe(request.idempotencyKey);
  });
});

describe("declarative registration and character requests", () => {
  it("registers a parsed manifest object with the explicit campaign and separates registration attempts", () => {
    const manifest = { id: "custom/fantasy", version: "1.0.0", definition: { kind: "declarative-v1" } };
    const source = JSON.stringify(manifest);
    const request = prepareSystemManifestInstall(campaign.id, source, "first-attempt");
    expect(request.path).toBe("/api/v1/systems/install");
    expect(request.payload).toEqual({ campaignId: campaign.id, manifest });
    expect(typeof request.payload.manifest).toBe("object");
    expect(prepareSystemManifestInstall(campaign.id, source, "first-attempt").idempotencyKey).toBe(request.idempotencyKey);
    expect(prepareSystemManifestInstall(campaign.id, source, "second-attempt").idempotencyKey).not.toBe(request.idempotencyKey);
    for (const invalid of ["not JSON", "null", "[]", "42", '"manifest"']) {
      expect(() => prepareSystemManifestInstall(campaign.id, invalid, "first-attempt")).toThrow();
    }
  });

  it("creates from host actor defaults and uses distinct keys for distinct character intents", () => {
    const request = prepareDeclarativeCharacter(campaign.id, system(), "  Mira  ", "owner-one", "first-attempt");
    expect(request.path).toBe("/api/v1/campaigns/campaign%2Fone/actors");
    expect(request.payload).toEqual({ systemId: "custom/fantasy", name: "Mira", ownerUserId: "owner-one" });
    expect(request.payload).not.toHaveProperty("data");
    expect(request.payload).not.toHaveProperty("type");
    expect(prepareDeclarativeCharacter(campaign.id, system(), "Mira", "owner-one", "first-attempt").idempotencyKey).toBe(request.idempotencyKey);
    expect(prepareDeclarativeCharacter(campaign.id, system(), "Mira", "owner-one", "second-attempt").idempotencyKey).not.toBe(request.idempotencyKey);
    expect(prepareDeclarativeCharacter(campaign.id, system(), "Mira", "", "third-attempt").payload).not.toHaveProperty("ownerUserId");
  });

  it("requires a binding for the selected declarative system and a nonblank character name", () => {
    for (const target of [
      { ...system(), binding: undefined },
      { ...system(), binding: { ...previousIdentity, systemId: "another-system" } },
      { ...system(), definition: undefined }
    ]) {
      expect(() => prepareDeclarativeCharacter(campaign.id, target, "Mira", "", "attempt")).toThrow("Bind an installed rules version");
    }
    expect(() => prepareDeclarativeCharacter(campaign.id, system(), " \t ", "", "attempt")).toThrow("Enter a character name");
  });
});

describe("system quick-roll labels", () => {
  it("keeps bundled quick rolls explicit and sends unknown systems to their character sheet", () => {
    for (const [id, roll, label] of [
      ["stellar-frontiers", "aptitude-tech", "Tech Check"],
      ["mystic-noir", "skill-investigation", "Investigation Check"],
      ["dnd-5e-srd", "ability-strength", "Strength Check"],
      ["generic-fantasy", "ability-charisma", "Charisma Check"]
    ]) {
      expect(systemRollId(id!)).toBe(roll);
      expect(systemRollLabel(id)).toBe(label);
    }
    expect(systemRollId("custom/fantasy")).toBeUndefined();
    expect(systemRollId("")).toBeUndefined();
    expect(systemRollLabel("custom/fantasy")).toBe("Open character sheet");
    expect(systemRollLabel()).toBe("Open character sheet");
  });
});
