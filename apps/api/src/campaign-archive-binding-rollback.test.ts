import {
  emptyState,
  normalizeEngineState,
  type Actor,
  type CampaignArchive,
  type DeclarativeSystemManifest,
  type EngineState,
  type Item,
  type SystemManifestIdentity,
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import type { AssetStorage } from "./asset-storage.js";
import {
  createCampaignArchiveImportOperation,
  previewCampaignArchiveImportRollback,
  rollbackCampaignArchiveImportOperation,
} from "./campaign-archive-import-recovery.js";
import { declarativeSystemManifestChecksum } from "./declarative-system-runtime.js";
import { MemoryStateStore } from "./store.js";

const timestamp = "2026-09-06T12:00:00.000Z";
const campaignId = "camp_lantern";
const userId = "usr_test";
const safeActorId = "actor_safe_import";
const campaignConflict = { collection: "campaigns", id: campaignId, reason: "reference_conflict" };
const assetStorage: AssetStorage = {
  provider: "local",
  put: async (asset) => asset.storage ?? { provider: "local", key: asset.id },
  read: async () => undefined,
  delete: async () => false,
};

// Keep the same executable schema and defaults as declarative-system-state.test.
function lanternManifest(version = "1.0.0"): DeclarativeSystemManifest {
  return {
    id: "lantern-survey", name: "Lantern Survey", version, compatibleCore: ">=0.3.0 <0.4.0", entrypoints: {},
    schemas: {
      actor: {
        type: "object", additionalProperties: false, required: ["wits", "grit", "stamina"],
        properties: {
          wits: { type: "integer", minimum: 0, maximum: 4 },
          grit: { type: "integer", minimum: 0, maximum: 4 },
          stamina: { type: "integer", minimum: 0, maximum: 6 },
        },
      },
      item: {
        type: "object", additionalProperties: false, required: ["weight", "quality"],
        properties: {
          weight: { type: "integer", minimum: 0, maximum: 20 },
          quality: { type: "string", enum: ["basic", "refined"], maxLength: 16 },
        },
      },
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions"],
    definition: {
      kind: "declarative-v1", actorTypes: ["surveyor"], itemTypes: ["gear"],
      actorDefaults: { wits: 2, grit: 1, stamina: 6 }, itemDefaults: { weight: 1, quality: "basic" },
      sheet: { fields: [
        { path: ["wits"], label: "Wits", editable: true },
        { path: ["grit"], label: "Grit", editable: true },
        { path: ["stamina"], label: "Stamina", editable: true },
      ] },
      quickRolls: [
        { id: "survey", label: "Survey", dice: { count: 2, sides: 6, bonus: 0, addFields: [["wits"]] } },
        { id: "push", label: "Push forward", dice: { count: 2, sides: 6, bonus: 0, addFields: [["grit"]] }, cost: { path: ["stamina"], amount: 1 } },
      ],
    },
  };
}

function identity(manifest: DeclarativeSystemManifest): SystemManifestIdentity {
  return { systemId: manifest.id, version: manifest.version, checksum: declarativeSystemManifestChecksum(manifest) };
}

function stateBeforeImport(manifests: DeclarativeSystemManifest[], bound?: DeclarativeSystemManifest): EngineState {
  const state = emptyState();
  state.campaigns = [{
    id: campaignId, ownerUserId: userId, name: "Lantern campaign", description: "",
    defaultSystemId: "generic-fantasy", ...(bound ? { systemBindings: [identity(bound)] } : {}),
    visibility: "private", createdAt: timestamp, updatedAt: timestamp,
  }];
  state.systemInstallations = manifests.map((manifest) => ({
    id: `install_${manifest.id}_${manifest.version}`, manifest, checksum: declarativeSystemManifestChecksum(manifest),
    installedByUserId: userId, authorizedByCampaignId: campaignId, source: "api", createdAt: timestamp, updatedAt: timestamp,
  }));
  return state;
}

function importedBinding(before: EngineState, manifest: DeclarativeSystemManifest): EngineState {
  const after = structuredClone(before);
  after.campaigns[0]!.systemBindings = [identity(manifest)];
  after.campaigns[0]!.updatedAt = "2026-09-06T12:01:00.000Z";
  return after;
}

function actor(id: string, manifest: DeclarativeSystemManifest): Actor {
  return {
    id, campaignId, systemId: manifest.id, ownerUserId: userId, type: "surveyor", name: id,
    data: structuredClone(manifest.definition.actorDefaults), permissions: {}, createdAt: timestamp, updatedAt: timestamp,
  };
}

function item(id: string, manifest: DeclarativeSystemManifest): Item {
  return {
    id, campaignId, systemId: manifest.id, type: "gear", name: id,
    data: structuredClone(manifest.definition.itemDefaults), createdAt: timestamp, updatedAt: timestamp,
  };
}

function importHarness(before: EngineState, after: EngineState, records: { actors?: Actor[]; items?: Item[] } = {}) {
  const safeActor: Actor = {
    id: safeActorId, campaignId, systemId: "generic-fantasy", type: "character", name: "Unrelated imported actor",
    data: {}, permissions: {}, createdAt: timestamp, updatedAt: timestamp,
  };
  after.actors.push(safeActor);
  before = normalizeEngineState(before);
  after = normalizeEngineState(after);
  const archiveData = emptyState();
  archiveData.campaigns = structuredClone(after.campaigns);
  archiveData.actors = structuredClone([safeActor, ...records.actors ?? []]);
  archiveData.items = structuredClone(records.items ?? []);
  const archive: CampaignArchive = {
    format: "ottx", version: "0.2.0", exportedAt: timestamp,
    manifest: { campaignId, name: "Lantern campaign", schemaVersion: "0.2.0", assetCount: 0 }, data: archiveData,
  };
  const operation = createCampaignArchiveImportOperation({
    id: "arcimp_binding", stateBefore: before, stateAfter: after, archive, campaignIds: [campaignId],
    createdByUserId: userId, mode: "upsert", scope: "all", collections: ["campaigns", "actors", "items"], assetSteps: [],
  });
  after.campaignArchiveImportOperations.push(operation);
  const store = new MemoryStateStore(after);
  return {
    store,
    preview: () => previewCampaignArchiveImportRollback(store.state, assetStorage, store.state.campaignArchiveImportOperations[0]!),
    rollback: () => rollbackCampaignArchiveImportOperation({ store, assetStorage, operationId: operation.id, campaignId, userId }),
  };
}

describe("campaign archive rollback of declarative bindings", () => {
  it.each(["actor", "item"] as const)("preserves the imported pin for a new surviving %s, rolls back safe rows, and completes after an explicit retry", async (kind) => {
    const manifest = lanternManifest();
    const before = stateBeforeImport([manifest]);
    const harness = importHarness(before, importedBinding(before, manifest));
    const survivor = kind === "actor" ? actor("surviving_actor", manifest) : item("surviving_item", manifest);
    const withSurvivor = structuredClone(harness.store.state);
    if (kind === "actor") withSurvivor.actors.push(survivor as Actor);
    else withSurvivor.items.push(survivor as Item);
    harness.store.replace(withSurvivor);

    const current = structuredClone(harness.store.state);
    const preview = await harness.preview();
    expect(preview.conflicts).toEqual([campaignConflict]);
    expect(preview.impact).toMatchObject({ restoreRecords: 0, deleteRecords: 1 });
    expect(harness.store.state).toEqual(current);

    const result = await harness.rollback();
    expect(result.conflicts).toEqual(preview.conflicts);
    expect(result).toMatchObject({ rolledBackRecords: 1, operation: { status: "partially_rolled_back", remainingRecordCount: 1 } });
    expect(harness.store.state.campaigns[0]!.systemBindings).toEqual([identity(manifest)]);
    expect(harness.store.state.actors.some((record) => record.id === safeActorId)).toBe(false);
    const survivingRecords = kind === "actor" ? harness.store.state.actors : harness.store.state.items;
    expect(survivingRecords.find((record) => record.id === survivor.id)).toEqual(survivor);

    const withoutSurvivor = structuredClone(harness.store.state);
    withoutSurvivor.actors = withoutSurvivor.actors.filter((record) => record.id !== survivor.id);
    withoutSurvivor.items = withoutSurvivor.items.filter((record) => record.id !== survivor.id);
    harness.store.replace(withoutSurvivor);
    const retryPreview = await harness.preview();
    expect(retryPreview.conflicts).toEqual([]);
    expect(retryPreview.impact).toMatchObject({ restoreRecords: 1, deleteRecords: 0 });
    const retried = await harness.rollback();
    expect(retried).toMatchObject({ rolledBackRecords: 1, conflicts: [], operation: { status: "rolled_back", remainingRecordCount: 0 } });
    expect(harness.store.state.campaigns[0]!.systemBindings).toBeUndefined();
    expect(harness.store.state.actors.some((record) => record.id === safeActorId)).toBe(false);
  });

  it("allows unbinding when the same plan deletes all imported actor and item dependents", async () => {
    const manifest = lanternManifest();
    const before = stateBeforeImport([manifest]);
    const after = importedBinding(before, manifest);
    const importedActor = actor("actor_imported", manifest);
    const importedItem = { ...item("item_imported", manifest), actorId: importedActor.id };
    after.actors.push(importedActor);
    after.items.push(importedItem);
    const harness = importHarness(before, after, { actors: [importedActor], items: [importedItem] });

    const preview = await harness.preview();
    expect(preview.conflicts).toEqual([]);
    expect(preview.impact).toMatchObject({ restoreRecords: 1, deleteRecords: 3 });
    const result = await harness.rollback();
    expect(result).toMatchObject({ rolledBackRecords: 4, conflicts: [], operation: { status: "rolled_back" } });
    expect(harness.store.state.campaigns[0]!.systemBindings).toBeUndefined();
    expect(harness.store.state.actors).toEqual([]);
    expect(harness.store.state.items).toEqual([]);
  });

  it("blocks restoration of an older pin whose schema rejects a new surviving actor", async () => {
    const previous = lanternManifest();
    previous.schemas.actor.properties.wits = { type: "integer", minimum: 0, maximum: 2 };
    const current = lanternManifest("2.0.0");
    const before = stateBeforeImport([previous, current], previous);
    const after = importedBinding(before, current);
    const harness = importHarness(before, after);
    const survivor = { ...actor("actor_new_version", current), data: { wits: 4, grit: 1, stamina: 6 } };
    const withSurvivor = structuredClone(harness.store.state);
    withSurvivor.actors.push(survivor);
    harness.store.replace(withSurvivor);

    expect((await harness.preview()).conflicts).toEqual([campaignConflict]);
    const result = await harness.rollback();
    expect(result).toMatchObject({ rolledBackRecords: 1, conflicts: [campaignConflict], operation: { status: "partially_rolled_back" } });
    expect(harness.store.state.campaigns[0]!.systemBindings).toEqual([identity(current)]);
    expect(harness.store.state.actors).toEqual([survivor]);
  });

  it("restores a compatible older pin and advances surviving actor and item revisions beyond future timestamps", async () => {
    const previous = lanternManifest();
    const current = lanternManifest("2.0.0");
    const before = stateBeforeImport([previous, current], previous);
    const harness = importHarness(before, importedBinding(before, current));
    const futureTimestamp = "2099-01-01T00:00:00.000Z";
    const survivor = { ...actor("actor_compatible", current), updatedAt: futureTimestamp };
    const survivingItem = { ...item("item_compatible", current), updatedAt: futureTimestamp };
    const withSurvivor = structuredClone(harness.store.state);
    withSurvivor.actors.push(survivor);
    withSurvivor.items.push(survivingItem);
    harness.store.replace(withSurvivor);

    const acceptedState = harness.store.state;
    const acceptedSnapshot = structuredClone(acceptedState);
    expect((await harness.preview()).conflicts).toEqual([]);
    expect(harness.store.state).toEqual(acceptedSnapshot);
    const result = await harness.rollback();
    expect(result).toMatchObject({ rolledBackRecords: 2, conflicts: [], operation: { status: "rolled_back" } });
    expect(harness.store.state.campaigns[0]!.systemBindings).toEqual([identity(previous)]);
    const restoredActor = harness.store.state.actors[0]!;
    const restoredItem = harness.store.state.items[0]!;
    expect(restoredActor).toEqual({ ...survivor, updatedAt: restoredActor.updatedAt });
    expect(restoredItem).toEqual({ ...survivingItem, updatedAt: restoredItem.updatedAt });
    expect(Date.parse(restoredActor.updatedAt)).toBeGreaterThan(Date.parse(futureTimestamp));
    expect(Date.parse(restoredItem.updatedAt)).toBeGreaterThan(Date.parse(futureTimestamp));
    expect(acceptedState).toEqual(acceptedSnapshot);
    expect(survivor.updatedAt).toBe(futureTimestamp);
    expect(survivingItem.updatedAt).toBe(futureTimestamp);
  });

  it("does not restore a historical unpinned declarative default even when no actor or item survives", async () => {
    const manifest = lanternManifest();
    const historical = stateBeforeImport([manifest]);
    // Historical inverse data is not admitted as live store state. The import
    // repaired this missing pin, and rollback must preserve that repair.
    historical.campaigns[0]!.defaultSystemId = manifest.id;
    const harness = importHarness(historical, importedBinding(historical, manifest));

    expect((await harness.preview()).conflicts).toEqual([campaignConflict]);
    const result = await harness.rollback();
    expect(result).toMatchObject({ rolledBackRecords: 1, conflicts: [campaignConflict], operation: { status: "partially_rolled_back" } });
    expect(harness.store.state.campaigns[0]!.systemBindings).toEqual([identity(manifest)]);
    expect(harness.store.state.actors).toEqual([]);
    expect(harness.store.state.items).toEqual([]);
  });

  it("also blocks an actor inverse incompatible with the retained pin while removing an unrelated safe row", async () => {
    const previous = lanternManifest();
    const current = lanternManifest("2.0.0");
    current.schemas.actor.properties.wits = { type: "integer", minimum: 0, maximum: 2 };
    current.schemas.actor.properties.stamina = { type: "integer", minimum: 0, maximum: 8 };
    const before = stateBeforeImport([previous, current], previous);
    const original = { ...actor("actor_migrated", previous), data: { wits: 4, grit: 1, stamina: 6 } };
    before.actors.push(original);
    const after = importedBinding(before, current);
    const migrated = { ...original, data: { wits: 2, grit: 1, stamina: 6 }, updatedAt: "2026-09-06T12:01:00.000Z" };
    after.actors = [migrated];
    const harness = importHarness(before, after, { actors: [migrated] });
    const survivor = { ...actor("actor_needs_new_pin", current), data: { wits: 1, grit: 1, stamina: 8 } };
    const withSurvivor = structuredClone(harness.store.state);
    withSurvivor.actors.push(survivor);
    harness.store.replace(withSurvivor);

    const conflicts = [campaignConflict, { collection: "actors", id: original.id, reason: "reference_conflict" }];
    const preview = await harness.preview();
    expect(preview.conflicts).toEqual(expect.arrayContaining(conflicts));
    expect(preview.conflicts).toHaveLength(2);
    expect(preview.impact).toMatchObject({ restoreRecords: 0, deleteRecords: 1 });
    const result = await harness.rollback();
    expect(result).toMatchObject({ rolledBackRecords: 1, operation: { status: "partially_rolled_back", remainingRecordCount: 2 } });
    expect(result.conflicts).toEqual(preview.conflicts);
    expect(harness.store.state.campaigns[0]!.systemBindings).toEqual([identity(current)]);
    expect(harness.store.state.actors).toEqual([migrated, survivor]);
  });
});
