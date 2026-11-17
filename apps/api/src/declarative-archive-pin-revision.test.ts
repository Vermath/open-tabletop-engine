import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState, type Actor, type CampaignArchive, type DeclarativeSystemManifest, type Item, type SystemInstallation, type SystemManifestIdentity } from "@open-tabletop/core";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { AssetStorage } from "./asset-storage.js";
import { CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE, createCampaignArchiveStream } from "./archive-stream.js";
import { declarativeArchiveSystemRequirement } from "./declarative-system-archive.js";
import { declarativeSystemManifestChecksum } from "./declarative-system-runtime.js";
import { SqliteStateStore } from "./sqlite-store.js";

const campaignId = "camp_demo";
const systemId = "archive-revision-rules";
const actorId = "act_archive_revision";
const itemId = "item_archive_revision";
const adminId = "usr_demo_gm";
const playerId = "usr_demo_player";
const createdAt = "2026-09-06T12:00:00.000Z";
type Transport = "json" | "stream";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string, options: { readOnly: boolean }) => { prepare(sql: string): { all(): unknown[] }; close(): void };
};

interface Harness { directory: string; databasePath: string; store: SqliteStateStore; app: FastifyInstance; storage: AssetStorage }

describe("archive pin changes invalidate existing sheet revisions through the raw API", () => {
  it.each(["json", "stream"] as const)("%s campaign-only import advances retained actor/item revisions and rejects an old sheet edit", async (transport) => {
    const h = await harness();
    try {
      const beforeActor = structuredClone(h.store.state.actors.find((entry) => entry.id === actorId)!);
      const beforeItem = structuredClone(h.store.state.items.find((entry) => entry.id === itemId)!);
      const archive = pinArchive(h, "2.0.0");
      expect(archive.data.actors).toEqual([]);
      expect(archive.data.items).toEqual([]);
      const response = await importArchive(h, archive, transport, "retained-pin-switch");
      expect(response.statusCode, response.body).toBe(200);
      assertAdvanced(h, beforeActor, beforeItem, "2.0.0");
      const stale = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${actorId}`, headers: headers(playerId, "stale-sheet-edit"), payload: { expectedUpdatedAt: beforeActor.updatedAt, data: { ...beforeActor.data, focus: 3 } } });
      expect(stale.statusCode, stale.body).toBe(409);
      expect(h.store.state.actors.find((entry) => entry.id === actorId)!.data).toEqual(beforeActor.data);
      assertDurableMatchesLive(h);
      expect(h.storage.put).not.toHaveBeenCalled();
    } finally { await close(h); }
  });

  it.each(["json", "stream"] as const)("%s import advances beyond both existing and incoming record timestamps", async (transport) => {
    const h = await harness();
    try {
      const beforeActor = structuredClone(h.store.state.actors.find((entry) => entry.id === actorId)!);
      const beforeItem = structuredClone(h.store.state.items.find((entry) => entry.id === itemId)!);
      const archive = pinArchive(h, "2.0.0");
      archive.data.actors = [{ ...beforeActor, updatedAt: "2020-01-01T00:00:00.000Z" }];
      archive.data.items = [{ ...beforeItem, updatedAt: "2035-01-01T00:00:00.000Z" }];
      const response = await importArchive(h, archive, transport, "imported-pin-switch");
      expect(response.statusCode, response.body).toBe(200);
      assertAdvanced(h, beforeActor, beforeItem, "2.0.0");
      expect(Date.parse(h.store.state.actors.find((entry) => entry.id === actorId)!.updatedAt)).toBeGreaterThan(Date.parse(archive.data.actors[0]!.updatedAt));
      expect(Date.parse(h.store.state.items.find((entry) => entry.id === itemId)!.updatedAt)).toBeGreaterThan(Date.parse(archive.data.items[0]!.updatedAt));
      assertDurableMatchesLive(h);
    } finally { await close(h); }
  });

  it.each(["json", "stream"] as const)("%s incompatible pin preflight preserves live and durable state and all revisions", async (transport) => {
    const h = await harness();
    try {
      const archive = pinArchive(h, "3.0.0");
      const before = structuredClone(h.store.state);
      const durableBefore = durableRecords(h);
      const response = await importArchive(h, archive, transport, "incompatible-pin-switch");
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toMatchObject({ error: "invalid_system_state", issues: expect.arrayContaining([expect.objectContaining({ collection: "actors", recordId: actorId, code: "value_range" })]) });
      expect(structuredClone(h.store.state)).toEqual(before);
      expect(durableRecords(h)).toEqual(durableBefore);
      expect(h.storage.put).not.toHaveBeenCalled();
    } finally { await close(h); }
  });

  it("rejects an empty imported campaign whose installed declarative default omits both binding and requirement", async () => {
    const h = await harness();
    try {
      const archive = pinArchive(h, "2.0.0");
      archive.manifest.campaignId = "camp_empty_unpinned";
      archive.data.campaigns[0]!.id = "camp_empty_unpinned";
      delete archive.data.campaigns[0]!.systemBindings;
      delete archive.manifest.systemRequirements;
      const before = structuredClone(h.store.state);
      const durableBefore = durableRecords(h);
      const response = await importArchive(h, archive, "json", "empty-unpinned");
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toMatchObject({ error: "archive_system_dependency", issues: [expect.objectContaining({ code: "missing_binding", systemId })] });
      expect(structuredClone(h.store.state)).toEqual(before);
      expect(durableRecords(h)).toEqual(durableBefore);
    } finally { await close(h); }
  });
});

function headers(userId: string, key?: string) { return { "x-user-id": userId, ...(key ? { "idempotency-key": key } : {}) }; }

async function harness(): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), "otte-archive-pin-revision-"));
  const databasePath = join(directory, "state.sqlite");
  const store = new SqliteStateStore(databasePath, { seedDemo: true });
  const first = manifest("1.0.0");
  const second = manifest("2.0.0");
  const incompatible = manifest("3.0.0");
  incompatible.schemas.actor.properties.focus = { type: "integer", minimum: 3, maximum: 5 };
  incompatible.definition.actorDefaults.focus = 3;
  store.state.systemInstallations.push(...[first, second, incompatible].map(installation));
  const campaign = store.state.campaigns.find((entry) => entry.id === campaignId)!;
  campaign.defaultSystemId = systemId;
  campaign.systemBindings = [identity(first)];
  store.state.actors.push({ id: actorId, campaignId, systemId, ownerUserId: playerId, name: "Archive Scout", type: "scout", data: { focus: 2 }, permissions: {}, createdAt, updatedAt: "2030-01-01T00:00:00.000Z" });
  store.state.items.push({ id: itemId, campaignId, systemId, actorId, name: "Archive kit", type: "kit", data: { weight: 1 }, createdAt, updatedAt: "2031-01-01T00:00:00.000Z" });
  store.save(); store.flush();
  const storage: AssetStorage = { provider: "local", put: vi.fn(async () => { throw new Error("Asset-free pin import must not write objects"); }), read: async () => undefined, stream: async () => undefined, delete: async () => false };
  try {
    const app = await buildApp({ store, assetStorage: storage, requestLogStream: { write() {} } });
    store.flush();
    store.restoreDurableState();
    return { directory, databasePath, store, app, storage };
  } catch (error) { store.close(); rmSync(directory, { recursive: true, force: true }); throw error; }
}

async function close(h: Harness): Promise<void> {
  try { await h.app.close(); }
  finally { h.store.close(); rmSync(h.directory, { recursive: true, force: true }); }
}

function pinArchive(h: Harness, version: string): CampaignArchive {
  const campaign = structuredClone(h.store.state.campaigns.find((entry) => entry.id === campaignId)!);
  const definition = h.store.state.systemInstallations.find((entry) => entry.manifest.id === systemId && entry.manifest.version === version)!.manifest as DeclarativeSystemManifest;
  campaign.systemBindings = [identity(structuredClone(definition))];
  const source = { ...h.store.state, campaigns: [campaign] };
  const data = emptyState();
  data.campaigns = [campaign];
  return { format: "ottx", version: "0.2.0", exportedAt: createdAt, manifest: { campaignId, name: "Pin switch", schemaVersion: "0.2.0", assetCount: 0, systemRequirements: [declarativeArchiveSystemRequirement(source, campaignId, systemId)] }, data };
}

async function importArchive(h: Harness, archive: CampaignArchive, transport: Transport, key: string) {
  const expectedUpdatedAt = h.store.state.campaigns.find((entry) => entry.id === campaignId)!.updatedAt;
  if (transport === "json") return h.app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: headers(adminId, key), payload: { archive, expectedUpdatedAt } });
  const chunks: Buffer[] = [];
  for await (const chunk of createCampaignArchiveStream(archive, h.storage, { maxMetadataBytes: 1024 * 1024, maxAssetBytes: 1024, maxEmbeddedAssetBytes: 1024, maxAssetFiles: 10 })) chunks.push(Buffer.from(chunk as Uint8Array));
  return h.app.inject({ method: "POST", url: `/api/v1/import/campaign/stream?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, headers: { ...headers(adminId, key), "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE }, payload: Buffer.concat(chunks) });
}

function assertAdvanced(h: Harness, beforeActor: Actor, beforeItem: Item, version: string): void {
  const actor = h.store.state.actors.find((entry) => entry.id === actorId)!;
  const item = h.store.state.items.find((entry) => entry.id === itemId)!;
  expect(actor.data).toEqual(beforeActor.data);
  expect(item.data).toEqual(beforeItem.data);
  expect(Date.parse(actor.updatedAt)).toBeGreaterThan(Date.parse(beforeActor.updatedAt));
  expect(Date.parse(item.updatedAt)).toBeGreaterThan(Date.parse(beforeItem.updatedAt));
  expect(h.store.state.campaigns.find((entry) => entry.id === campaignId)!.systemBindings![0]!.version).toBe(version);
}

function durableRecords(h: Harness): Array<{ collection: string; id: string; data: string }> {
  const database = new DatabaseSync(h.databasePath, { readOnly: true });
  try { return database.prepare("SELECT collection, id, data FROM engine_records ORDER BY collection, id").all() as Array<{ collection: string; id: string; data: string }>; }
  finally { database.close(); }
}

function assertDurableMatchesLive(h: Harness): void {
  const records = durableRecords(h);
  for (const [collection, id] of [["campaigns", campaignId], ["actors", actorId], ["items", itemId]] as const) {
    expect(JSON.parse(records.find((entry) => entry.collection === collection && entry.id === id)!.data)).toEqual(structuredClone(h.store.state[collection].find((entry) => entry.id === id)));
  }
}

function identity(definition: DeclarativeSystemManifest): SystemManifestIdentity { return { systemId, version: definition.version, checksum: declarativeSystemManifestChecksum(definition) }; }
function installation(definition: DeclarativeSystemManifest): SystemInstallation { return { id: `install_archive_revision_${definition.version}`, manifest: definition, checksum: identity(definition).checksum, installedByUserId: adminId, authorizedByCampaignId: campaignId, source: "api", createdAt, updatedAt: createdAt }; }
function manifest(version: string): DeclarativeSystemManifest {
  return {
    id: systemId, name: "Archive Revision Rules", version, compatibleCore: ">=0.3.0 <0.4.0", entrypoints: {},
    schemas: {
      actor: { type: "object", additionalProperties: false, required: ["focus"], properties: { focus: { type: "integer", minimum: 0, maximum: 5 } } },
      item: { type: "object", additionalProperties: false, required: ["weight"], properties: { weight: { type: "integer", minimum: 0, maximum: 10 } } },
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"], capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions"],
    definition: { kind: "declarative-v1", actorTypes: ["scout"], itemTypes: ["kit"], actorDefaults: { focus: 2 }, itemDefaults: { weight: 1 }, sheet: { fields: [{ path: ["focus"], label: "Focus", editable: true }] }, quickRolls: [{ id: "scan", label: "Scan", dice: { count: 2, sides: 6, bonus: 0, addFields: [["focus"]] }, cost: { path: ["focus"], amount: 1 } }] },
  };
}

