import { emptyState, makeArchive, type CampaignArchive, type DeclarativeSystemManifest, type EngineState, type SystemInstallation } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { archiveForImportScope, archiveWithRegeneratedIds, mergeArchive, normalizeArchiveForImport, stateForArchiveMerge } from "./archive-operations.js";
import { createCampaignArchiveStream, parseCampaignArchiveStream } from "./archive-stream.js";
import { validateCampaignArchiveShape } from "./archive-validation.js";
import type { AssetStorage } from "./asset-storage.js";
import { assertDeclarativeArchiveDependencies, assertDeclarativeArchiveSystemRequirements, declarativeArchiveSystemRequirement, DeclarativeArchiveDependencyError } from "./declarative-system-archive.js";
import { declarativeSystemManifestChecksum } from "./declarative-system-runtime.js";
import { DeclarativeSystemStateError } from "./declarative-system-state.js";

const timestamp = "2026-09-06T12:00:00.000Z";
const limits = { maxMetadataBytes: 1024 * 1024, maxAssetBytes: 1024, maxEmbeddedAssetBytes: 1024, maxAssetFiles: 10 };

describe("declarative campaign archive dependencies", () => {
  it("round-trips exact inert manifest, pin, actor and item without installing or changing the source", () => {
    const source = fixture();
    const before = structuredClone(source);
    const archive = exportArchive(source);
    const destination = installedDestination(source);
    const installations = structuredClone(destination.systemInstallations);
    expect(archive.data.systemInstallations).toEqual([]);
    expect(archive.manifest.systemRequirements![0]).toMatchObject({ identity: source.campaigns[0]!.systemBindings![0], manifest: source.systemInstallations[0]!.manifest });
    expect(validateCampaignArchiveShape(archive, { maxAssetBytes: 1024 }).ok).toBe(true);
    const candidate = merge(destination, JSON.parse(JSON.stringify(archive)));
    expect(() => assertDeclarativeArchiveDependencies(destination, candidate, archive)).not.toThrow();
    expect(candidate.actors).toEqual(source.actors);
    expect(candidate.items).toEqual(source.items);
    expect(candidate.campaigns[0]!.systemBindings).toEqual(source.campaigns[0]!.systemBindings);
    expect(candidate.systemInstallations).toEqual(installations);
    expect(source).toEqual(before);
    archive.manifest.systemRequirements![0]!.manifest!.definition.actorDefaults.focus = 4;
    expect(source).toEqual(before);
  });

  it("preserves exact package identity when campaign and record IDs regenerate", () => {
    const source = fixture();
    const archive = archiveWithRegeneratedIds(exportArchive(source), { userId: "usr_copy", organizationId: "org_destination" });
    expect(archive.data.campaigns[0]!.id).not.toBe("camp_archive");
    expect(archive.data.campaigns[0]!.systemBindings).toEqual(source.campaigns[0]!.systemBindings);
    const destination = installedDestination(source);
    const candidate = merge(destination, archive);
    expect(() => assertDeclarativeArchiveDependencies(destination, candidate, archive)).not.toThrow();
    expect(candidate.actors[0]!.campaignId).toBe(candidate.campaigns[0]!.id);
  });

  it("regenerates record IDs without remapping colliding system IDs, versions or checksums", () => {
    const source = fixture();
    const pin = source.campaigns[0]!.systemBindings![0]!;
    source.actors[0]!.id = pin.systemId;
    source.items[0]!.id = pin.version;
    source.items[0]!.actorId = pin.systemId;
    source.actors.push({ ...structuredClone(source.actors[0]!), id: pin.checksum });
    source.compendia.push({ id: "pack_archive", systemId: pin.systemId, name: "Archive pack", entries: [], createdAt: timestamp, updatedAt: timestamp });
    const before = structuredClone(source);
    const original = exportArchive(source);
    const archiveBefore = structuredClone(original);
    const copy = archiveWithRegeneratedIds(original, { userId: "usr_copy", organizationId: "org_destination" });
    expect(copy.data.campaigns[0]!.id).not.toBe(source.campaigns[0]!.id);
    expect(copy.data.campaigns[0]!.defaultSystemId).toBe(pin.systemId);
    expect(copy.data.campaigns[0]!.systemBindings).toEqual([pin]);
    expect(copy.manifest.systemRequirements).toEqual(original.manifest.systemRequirements);
    for (const actor of copy.data.actors) {
      expect([pin.systemId, pin.checksum]).not.toContain(actor.id);
      expect(actor.systemId).toBe(pin.systemId);
      expect(actor.campaignId).toBe(copy.data.campaigns[0]!.id);
    }
    expect(copy.data.items[0]!.id).not.toBe(pin.version);
    expect(copy.data.items[0]!.actorId).toBe(copy.data.actors[0]!.id);
    expect(copy.data.items[0]!.systemId).toBe(pin.systemId);
    expect(copy.data.compendia[0]!.systemId).toBe(pin.systemId);
    const destination = installedDestination(source);
    expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, copy), copy)).not.toThrow();
    expect(source).toEqual(before);
    expect(original).toEqual(archiveBefore);
  });

  it("keeps JSON and streamed metadata dependency results identical", async () => {
    const source = fixture();
    const archive = exportArchive(source);
    const storage: AssetStorage = { provider: "local", put: vi.fn(async () => { throw new Error("unexpected write"); }), read: async () => undefined, stream: async () => undefined, delete: async () => false };
    const parsed = await parseCampaignArchiveStream(createCampaignArchiveStream(archive, storage, limits), limits);
    try {
      expect(parsed.archive.manifest.systemRequirements).toEqual(archive.manifest.systemRequirements);
      for (const encoded of [JSON.parse(JSON.stringify(archive)) as CampaignArchive, parsed.archive]) {
        const destination = installedDestination(source);
        expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, encoded), encoded)).not.toThrow();
        const missing = emptyState();
        expect(dependencyError(() => assertDeclarativeArchiveDependencies(missing, merge(missing, encoded), encoded)).issues[0]!.code).toBe("missing_installed_definition");
      }
      expect(storage.put).not.toHaveBeenCalled();
    } finally { await parsed.cleanup(); }
  });

  it("requires the older pinned version even when a newer version is installed", () => {
    const source = fixture();
    source.systemInstallations.push(installation(manifest("2.0.0")));
    const archive = exportArchive(source);
    expect(archive.manifest.systemRequirements![0]!.version).toBe("1.0.0");
    const destination = installedDestination(source);
    expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).not.toThrow();
    destination.systemInstallations = destination.systemInstallations.filter((entry) => entry.manifest.version === "2.0.0");
    const error = dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive));
    expect(error.issues[0]).toMatchObject({ code: "missing_installed_definition", version: "1.0.0", checksum: source.campaigns[0]!.systemBindings![0]!.checksum });
    expect(error.message).toContain("server administrator");
  });

  it.each(["checksum", "content", "id", "version", "metadata", "capabilities"] as const)("rejects contradictory %s in executable requirement metadata", (change) => {
    const archive = exportArchive(fixture());
    const requirement = archive.manifest.systemRequirements![0]!;
    if (change === "checksum") requirement.identity!.checksum = "0".repeat(64);
    if (change === "content") requirement.manifest!.definition.actorDefaults.focus = 4;
    if (change === "id") requirement.id = "unrelated-system";
    if (change === "version") requirement.version = "9.0.0";
    if (change === "metadata") requirement.name = "Contradictory name";
    if (change === "capabilities") requirement.capabilities = ["data-model"];
    expect(() => assertDeclarativeArchiveSystemRequirements(archive.manifest.systemRequirements)).toThrow(DeclarativeArchiveDependencyError);
    expect(validateCampaignArchiveShape(archive, { maxAssetBytes: 1024 }).ok).toBe(false);
  });

  it("rejects changed installed content under a preserved identity and prevents implicit installs", () => {
    const source = fixture();
    const archive = exportArchive(source);
    const destination = installedDestination(source);
    const changed = destination.systemInstallations[0]!.manifest as DeclarativeSystemManifest;
    changed.definition.actorDefaults.focus = 4;
    expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).toThrow(DeclarativeSystemStateError);
    const empty = emptyState();
    const candidate = merge(empty, archive);
    candidate.systemInstallations = structuredClone(source.systemInstallations);
    expect(dependencyError(() => assertDeclarativeArchiveDependencies(empty, candidate, archive)).issues[0]!.code).toBe("installation_authority");
  });

  it("reports a different accepted checksum as an actionable exact dependency conflict", () => {
    const source = fixture();
    const archive = exportArchive(source);
    const alternate = manifest();
    alternate.definition.actorDefaults.focus = 4;
    const destination = installedDestination(fixture(alternate));
    const error = dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive));
    expect(error.issues[0]).toMatchObject({ code: "installed_definition_mismatch", systemId: "archive-lantern", version: "1.0.0" });
    expect(error.message).toContain("server administrator");
  });

  it.each(["actors", "items"] as const)("validates imported %s under the exact final pin", (collection) => {
    const source = fixture();
    const archive = exportArchive(source);
    archive.data[collection][0]!.data = { unexpected: true };
    const destination = installedDestination(source);
    let caught: unknown;
    try { assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(DeclarativeSystemStateError);
    expect((caught as DeclarativeSystemStateError).issues[0]!.collection).toBe(collection);
  });

  it("uses destination bindings for selected actors and rejects a different pinned version", () => {
    const source = fixture();
    const archive = archiveForImportScope(exportArchive(source), "selected_collections", ["actors"]);
    const destination = fixture(manifest("2.0.0"));
    destination.actors = [];
    destination.systemInstallations.push(...structuredClone(source.systemInstallations));
    const error = dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive));
    expect(error.issues[0]!.code).toBe("system_pin_mismatch");
    destination.campaigns = structuredClone(source.campaigns);
    expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).not.toThrow();
  });

  it("does not require unused definitions for assets-only import or advisory legacy metadata", () => {
    const source = fixture();
    const archive = archiveForImportScope(exportArchive(source), "assets_only", ["assets"]);
    const destination = emptyState();
    expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).not.toThrow();
    archive.manifest.systemRequirements = [{ id: "old-unknown-system", name: "Historical metadata", version: "1.0.0", compatibleCore: "*", capabilities: ["data-model"] }];
    expect(validateCampaignArchiveShape(archive, { maxAssetBytes: 1024 }).ok).toBe(true);
    expect(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).not.toThrow();
  });

  it("rejects missing requirement/pin even if the records otherwise fit a schema", () => {
    const source = fixture();
    const destination = installedDestination(source);
    const archive = exportArchive(source);
    delete archive.manifest.systemRequirements;
    expect(dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).issues[0]!.code).toBe("missing_requirement");
    archive.manifest.systemRequirements = exportArchive(source).manifest.systemRequirements;
    delete archive.data.campaigns[0]!.systemBindings;
    expect(dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).issues[0]!.code).toBe("missing_binding");
  });

  it("requires exact pins for an installed declarative default even when an empty archive omits dependency metadata", () => {
    const source = fixture();
    const destination = installedDestination(source);
    const archive = exportArchive(source);
    archive.data.actors = [];
    archive.data.items = [];
    delete archive.data.campaigns[0]!.systemBindings;
    delete archive.manifest.systemRequirements;
    expect(dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).issues[0]!.code).toBe("missing_binding");
    archive.data.campaigns[0]!.systemBindings = structuredClone(source.campaigns[0]!.systemBindings);
    expect(dependencyError(() => assertDeclarativeArchiveDependencies(destination, merge(destination, archive), archive)).issues[0]!.code).toBe("missing_requirement");
  });

  it("rejects duplicate and malformed executable markers, overlarge definitions and getters without invoking them", () => {
    const requirements = exportArchive(fixture()).manifest.systemRequirements!;
    for (const malformed of [[...requirements, ...requirements], [{ definition: null }], new Array(129).fill({}), [{ ...requirements[0], manifest: { ...requirements[0]!.manifest, oversized: "x".repeat(70_000) } }]]) {
      expect(() => assertDeclarativeArchiveSystemRequirements(malformed)).toThrow(DeclarativeArchiveDependencyError);
    }
    const getter = vi.fn(() => requirements[0]!.manifest);
    const accessor = { ...requirements[0] };
    Object.defineProperty(accessor, "manifest", { get: getter, enumerable: true });
    expect(() => assertDeclarativeArchiveSystemRequirements([accessor])).toThrow(DeclarativeArchiveDependencyError);
    const capabilityGetter = vi.fn(() => "data-model");
    const capabilities: string[] = [];
    Object.defineProperty(capabilities, "0", { get: capabilityGetter, enumerable: true });
    capabilities.length = requirements[0]!.capabilities.length;
    expect(() => assertDeclarativeArchiveSystemRequirements([{ ...requirements[0], capabilities }])).toThrow(DeclarativeArchiveDependencyError);
    expect(getter).not.toHaveBeenCalled();
    expect(capabilityGetter).not.toHaveBeenCalled();
  });
});

function manifest(version = "1.0.0"): DeclarativeSystemManifest {
  return {
    id: "archive-lantern", name: "Archive Lantern", version, compatibleCore: ">=0.3.0 <0.4.0", entrypoints: {},
    schemas: {
      actor: { type: "object", properties: { focus: { type: "integer", minimum: 0, maximum: 4 } }, required: ["focus"], additionalProperties: false },
      item: { type: "object", properties: { weight: { type: "integer", minimum: 0, maximum: 10 } }, required: ["weight"], additionalProperties: false },
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions"],
    definition: { kind: "declarative-v1", actorTypes: ["surveyor"], itemTypes: ["gear"], actorDefaults: { focus: 2 }, itemDefaults: { weight: 1 }, sheet: { fields: [{ path: ["focus"], label: "Focus", editable: true }] }, quickRolls: [{ id: "survey", label: "Survey", dice: { count: 2, sides: 6, bonus: 0, addFields: [["focus"]] }, cost: { path: ["focus"], amount: 1 } }] },
  };
}

function installation(definition: DeclarativeSystemManifest): SystemInstallation {
  return { id: `install_${definition.version}`, manifest: definition, checksum: declarativeSystemManifestChecksum(definition), installedByUserId: "usr_admin", authorizedByCampaignId: "camp_archive", source: "api", createdAt: timestamp, updatedAt: timestamp };
}

function fixture(definition = manifest()): EngineState {
  const state = emptyState();
  state.systemInstallations = [installation(definition)];
  state.campaigns = [{ id: "camp_archive", name: "Archive", description: "", ownerUserId: "usr_admin", defaultSystemId: definition.id, systemBindings: [{ systemId: definition.id, version: definition.version, checksum: state.systemInstallations[0]!.checksum! }], visibility: "private", createdAt: timestamp, updatedAt: timestamp }];
  state.actors = [{ id: "actor_archive", campaignId: "camp_archive", systemId: definition.id, name: "Surveyor", type: "surveyor", data: structuredClone(definition.definition.actorDefaults), permissions: {}, createdAt: timestamp, updatedAt: timestamp }];
  state.items = [{ id: "item_archive", campaignId: "camp_archive", systemId: definition.id, name: "Gear", type: "gear", data: structuredClone(definition.definition.itemDefaults), createdAt: timestamp, updatedAt: timestamp }];
  return state;
}

function exportArchive(state: EngineState): CampaignArchive {
  const archive = makeArchive(state, "camp_archive");
  archive.manifest.systemRequirements = [declarativeArchiveSystemRequirement(state, "camp_archive", "archive-lantern")];
  return archive;
}

function installedDestination(source: EngineState): EngineState {
  return { ...emptyState(), systemInstallations: structuredClone(source.systemInstallations) };
}

function merge(state: EngineState, archive: CampaignArchive): EngineState {
  const normalized = normalizeArchiveForImport(archive, "org_destination");
  const candidate = stateForArchiveMerge(state, normalized);
  mergeArchive(candidate, normalized);
  return candidate;
}

function dependencyError(action: () => void): DeclarativeArchiveDependencyError {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DeclarativeArchiveDependencyError);
  return caught as DeclarativeArchiveDependencyError;
}

