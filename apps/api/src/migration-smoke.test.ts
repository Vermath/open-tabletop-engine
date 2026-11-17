import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTimestamped,
  seedState,
  type CampaignArchive,
  type ContentImportBatch,
  type EngineState,
  type FogPreset,
  type MapAsset,
  type PermissionGrant,
  type PluginStorageEntry,
  type User,
  type WorkerJobRecord
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { LocalAssetStorage } from "./asset-storage.js";
import { SqliteStateStore } from "./sqlite-store.js";

const adminHeaders = { "x-user-id": "usr_demo_gm" };

describe("migration smoke", () => {
  it("imports older archives into SQLite, exports current archives, and proves backup restore drills", async () => {
    const previousAdminIds = process.env.OTTE_ADMIN_USER_IDS;
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";

    const directory = mkdtempSync(join(tmpdir(), "otte-migration-smoke-"));
    const store = new SqliteStateStore(join(directory, "opentabletop.sqlite"), { seedDemo: false });
    store.state.users.push(
      createTimestamped("usr", {
        id: "usr_demo_gm",
        displayName: "Migration Admin",
        email: "migration.admin@example.test",
        serverAdmin: true
      }) satisfies User
    );
    store.save();
    const app = await buildApp({ store });

    try {
      const publicAlphaArchive = readArchive("docs/demo/ember-vault-public-alpha.ottx.json");
      expect(publicAlphaArchive.version).toBe("0.1.0");
      const alphaImport = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: adminHeaders,
        payload: publicAlphaArchive
      });
      expect(alphaImport.statusCode).toBe(200);
      expect(alphaImport.json().importedCampaignIds).toContain("camp_public_alpha_ember_vault");

      const alphaExport = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_public_alpha_ember_vault/export",
        headers: adminHeaders
      });
      expect(alphaExport.statusCode).toBe(200);
      expect(alphaExport.json()).toMatchObject({
        format: "ottx",
        version: "0.2.0",
        manifest: { schemaVersion: "0.2.0", campaignId: "camp_public_alpha_ember_vault" }
      });
      expect(alphaExport.json().data.scenes.length).toBeGreaterThan(0);
      expect(alphaExport.json().data.members.some((member: { userId: string }) => member.userId === "usr_demo_gm")).toBe(true);

      const betaArchive = readArchive("docs/demo/ember-vault-beta-dogfood.ottx.json");
      expect(betaArchive.version).toBe("0.2.0");
      const betaImport = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: adminHeaders,
        payload: betaArchive
      });
      expect(betaImport.statusCode).toBe(200);
      expect(betaImport.json().importedCampaignIds).toContain("camp_beta_ember_vault");

      const betaExport = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_beta_ember_vault/export",
        headers: adminHeaders
      });
      expect(betaExport.statusCode).toBe(200);
      expect(betaExport.json()).toMatchObject({
        format: "ottx",
        version: "0.2.0",
        manifest: { schemaVersion: "0.2.0", campaignId: "camp_beta_ember_vault" }
      });
      expect(betaExport.json().data.aiMemory.map((memory: { id: string }) => memory.id)).toContain("aim_beta_party_goal");

      const storageBeforeBackup = await app.inject({
        method: "GET",
        url: "/api/v1/admin/storage/operations",
        headers: adminHeaders
      });
      expect(storageBeforeBackup.statusCode).toBe(200);
      expect(storageBeforeBackup.json()).toMatchObject({
        supported: true,
        migrations: { expectedVersions: [1, 2], latestAppliedVersion: 2, missingVersions: [] },
        indexes: { missing: [] },
        integrity: { ok: true }
      });

      const backup = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/backup",
        headers: { ...adminHeaders, "idempotency-key": "migration-smoke-storage-backup" },
        payload: { reason: "migration smoke" }
      });
      expect(backup.statusCode).toBe(200);
      expect(backup.json()).toMatchObject({ status: "created", reason: "migration smoke" });

      const restoreDrill = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/restore-drill",
        headers: adminHeaders
      });
      expect(restoreDrill.statusCode, restoreDrill.body).toBe(200);
      expect(restoreDrill.json()).toMatchObject({ status: "passed", campaignCount: 2 });
      expect(restoreDrill.json().recordCount).toBeGreaterThan(0);

      const unsupportedArchive = { ...betaArchive, version: "9.9.9", manifest: { ...betaArchive.manifest, schemaVersion: "9.9.9" } };
      const unsupported = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: adminHeaders,
        payload: unsupportedArchive
      });
      expect(unsupported.statusCode).toBe(400);
      expect(unsupported.json()).toMatchObject({ error: "unsupported_archive_version", version: "9.9.9" });
    } finally {
      await app.close();
      store.close();
      rmSync(directory, { recursive: true, force: true });
      if (previousAdminIds === undefined) {
        delete process.env.OTTE_ADMIN_USER_IDS;
      } else {
        process.env.OTTE_ADMIN_USER_IDS = previousAdminIds;
      }
    }
  });

  it("opens a v0.3 SQLite JSON-record store with current persistence, backup, and export checks", async () => {
    const previousAdminIds = process.env.OTTE_ADMIN_USER_IDS;
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";

    const directory = mkdtempSync(join(tmpdir(), "otte-v03-upgrade-smoke-"));
    const databasePath = join(directory, "opentabletop-v03.sqlite");

    try {
      const legacyStore = new SqliteStateStore(databasePath, { seedDemo: false });
      legacyStore.replace(v03LegacyFixtureState());
      legacyStore.close();

      const upgradedStore = new SqliteStateStore(databasePath, { seedDemo: false });
      const uploadDir = join(directory, "uploads");
      const assetStorage = new LocalAssetStorage(uploadDir);
      const legacyAsset = upgradedStore.state.assets.find((asset) => asset.id === "ast_v03_tactical_map")!;
      await assetStorage.put(legacyAsset, Buffer.alloc(legacyAsset.sizeBytes));
      const app = await buildApp({ store: upgradedStore, assetStorage, uploadDir });
      try {
        expect(upgradedStore.state.campaigns.map((campaign) => campaign.id)).toContain("camp_demo");
        expect(upgradedStore.state.scenes.map((scene) => scene.id)).toContain("scn_vault_entry");
        expect(upgradedStore.state.assets.map((asset) => asset.id)).toContain("ast_v03_tactical_map");
        expect(upgradedStore.state.permissionGrants.map((grant) => grant.id)).toContain("grant_v03_player_authoring");
        expect(upgradedStore.state.pluginStorage.map((entry) => entry.id)).toContain("plugstore_v03_clock");
        expect(upgradedStore.state.contentImports.map((batch) => batch.id)).toContain("imp_v03_manual_batch");
        expect(upgradedStore.state.fogPresets.map((preset) => preset.id)).toContain("fogpre_v03_vault_entry");
        expect(upgradedStore.state.jobs.map((job) => job.id)).toContain("job_v03_storage_backup");
        expect(upgradedStore.storageOperations()).toMatchObject({
          supported: true,
          migrations: { expectedVersions: [1, 2], latestAppliedVersion: 2, missingVersions: [] },
          indexes: { missing: [] },
          integrity: { ok: true }
        });

        const campaignRevisionBeforeSceneCreate = upgradedStore.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt;
        const createdScene = await app.inject({
          method: "POST",
          url: "/api/v1/campaigns/camp_demo/scenes",
          headers: { ...adminHeaders, "Idempotency-Key": "v03-upgrade-scene-create" },
          payload: {
            name: "V0.3 Upgrade Verification",
            width: 640,
            height: 480,
            gridSize: 40,
            expectedUpdatedAt: campaignRevisionBeforeSceneCreate
          }
        });
        expect(createdScene.statusCode).toBe(200);
        expect(upgradedStore.state.idempotencyRecords).toHaveLength(1);

        const replayedScene = await app.inject({
          method: "POST",
          url: "/api/v1/campaigns/camp_demo/scenes",
          headers: { ...adminHeaders, "Idempotency-Key": "v03-upgrade-scene-create" },
          payload: {
            expectedUpdatedAt: campaignRevisionBeforeSceneCreate,
            gridSize: 40,
            height: 480,
            name: "V0.3 Upgrade Verification",
            width: 640
          }
        });
        expect(replayedScene.statusCode).toBe(200);
        expect(replayedScene.headers["idempotency-replayed"]).toBe("true");

        const backup = await app.inject({
          method: "POST",
          url: "/api/v1/admin/storage/backup",
          headers: { ...adminHeaders, "idempotency-key": "v03-upgrade-storage-backup" },
          payload: { reason: "v0.3 upgrade smoke" }
        });
        expect(backup.statusCode).toBe(200);
        expect(backup.json()).toMatchObject({ status: "created", reason: "v0.3 upgrade smoke" });

        const restoreDrill = await app.inject({
          method: "POST",
          url: "/api/v1/admin/storage/restore-drill",
          headers: adminHeaders
        });
        expect(restoreDrill.statusCode, restoreDrill.body).toBe(200);
        expect(restoreDrill.json()).toMatchObject({ status: "passed", campaignCount: 1 });
        expect(restoreDrill.json().collections).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ collection: "assets", count: 1 }),
            expect.objectContaining({ collection: "permissionGrants", count: 1 }),
            expect.objectContaining({ collection: "pluginStorage", count: 1 }),
            expect.objectContaining({ collection: "contentImports", count: 1 }),
            expect.objectContaining({ collection: "fogPresets", count: 1 }),
            expect.objectContaining({ collection: "jobs", count: 1 }),
            expect.objectContaining({ collection: "idempotencyRecords", count: 1 })
          ])
        );

        const exported = await app.inject({
          method: "GET",
          url: "/api/v1/campaigns/camp_demo/export",
          headers: adminHeaders
        });
        expect(exported.statusCode).toBe(200);
        expect(exported.json()).toMatchObject({
          format: "ottx",
          version: "0.2.0",
          manifest: { schemaVersion: "0.2.0", campaignId: "camp_demo" }
        });
        expect(exported.json().data.assets.map((asset: { id: string }) => asset.id)).toContain("ast_v03_tactical_map");
        expect(exported.json().data.permissionGrants.map((grant: { id: string }) => grant.id)).toContain("grant_v03_player_authoring");
        expect(exported.json().data.pluginStorage.map((entry: { id: string }) => entry.id)).toContain("plugstore_v03_clock");
        expect(exported.json().data.contentImports.map((batch: { id: string }) => batch.id)).toContain("imp_v03_manual_batch");
        expect(exported.json().data.fogPresets.map((preset: { id: string }) => preset.id)).toContain("fogpre_v03_vault_entry");
        expect(exported.json().data.jobs).toHaveLength(0);
      } finally {
        await app.close();
        upgradedStore.close();
      }

      const persistedStore = new SqliteStateStore(databasePath, { seedDemo: false });
      try {
        expect(persistedStore.state.idempotencyRecords.some((record) => record.key === "v03-upgrade-scene-create")).toBe(true);
        expect(persistedStore.state.scenes.some((scene) => scene.name === "V0.3 Upgrade Verification")).toBe(true);
        expect(persistedStore.state.assets.some((asset) => asset.id === "ast_v03_tactical_map")).toBe(true);
        expect(persistedStore.state.jobs.some((job) => job.id === "job_v03_storage_backup")).toBe(true);
      } finally {
        persistedStore.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
      if (previousAdminIds === undefined) {
        delete process.env.OTTE_ADMIN_USER_IDS;
      } else {
        process.env.OTTE_ADMIN_USER_IDS = previousAdminIds;
      }
    }
  });
});

function readArchive(path: string): CampaignArchive {
  return JSON.parse(readFileSync(join(process.cwd(), "..", "..", path), "utf8")) as CampaignArchive;
}

function v03LegacyFixtureState(): EngineState {
  const state = seedState();
  const now = "2026-03-15T12:00:00.000Z";
  const scene = state.scenes.find((item) => item.id === "scn_vault_entry");
  if (scene) scene.backgroundAssetId = "ast_v03_tactical_map";

  state.assets.push({
    id: "ast_v03_tactical_map",
    campaignId: "camp_demo",
    name: "V0.3 Tactical Map",
    url: "/assets/v03/tactical-map.png",
    mimeType: "image/png",
    sizeBytes: 4096,
    checksum: "sha256-v03-tactical-map",
    folder: "maps/v0.3",
    tags: ["migration", "map"],
    storage: { provider: "local", key: "campaigns/camp_demo/assets/ast_v03_tactical_map.png" },
    lifecycle: { status: "active", updatedAt: now, updatedByUserId: "usr_demo_gm", reason: "v0.3 fixture" },
    security: { status: "clean", scanner: "migration-smoke", scannedAt: now, findings: [] },
    createdAt: now,
    updatedAt: now
  } satisfies MapAsset);

  state.permissionGrants.push({
    id: "grant_v03_player_authoring",
    subjectType: "role",
    subjectId: "player",
    campaignId: "camp_demo",
    permissions: ["journal.create", "token.move"],
    metadata: { source: "v0.3_fixture" },
    createdAt: now,
    updatedAt: now
  } satisfies PermissionGrant);

  state.pluginStorage.push({
    id: "plugstore_v03_clock",
    campaignId: "camp_demo",
    pluginId: "timekeeper-plugin",
    key: "round_clock",
    value: { round: 3, label: "Vault pressure plate" },
    updatedByType: "plugin",
    updatedById: "timekeeper-plugin",
    createdAt: now,
    updatedAt: now
  } satisfies PluginStorageEntry);

  const contentSource = {
    sourceType: "manual" as const,
    sourceName: "V0.3 migration notes",
    submittedByUserId: "usr_demo_gm",
    submittedAt: now,
    license: { name: "Private home game", usage: "private_home_game" as const }
  };
  state.contentImports.push({
    id: "imp_v03_manual_batch",
    campaignId: "camp_demo",
    status: "applied",
    source: contentSource,
    entities: [
      {
        id: "ent_v03_secret",
        kind: "journal",
        name: "V0.3 Secret Door",
        selectedByDefault: true,
        provenance: contentSource,
        data: { title: "Secret Door", body: "The lower glyph rotates clockwise." },
        warnings: []
      }
    ],
    selectedEntityIds: ["ent_v03_secret"],
    appliedRecords: [{ collection: "journals", id: "jnl_hook", entityId: "ent_v03_secret" }],
    appliedAt: now,
    appliedByUserId: "usr_demo_gm",
    createdAt: now,
    updatedAt: now
  } satisfies ContentImportBatch);

  state.fogPresets.push({
    id: "fogpre_v03_vault_entry",
    campaignId: "camp_demo",
    name: "Vault Entry Reset",
    description: "Legacy fog preset carried through v0.3 migration smoke.",
    sourceSceneId: "scn_vault_entry",
    regions: [{ x: 540, y: 360, radius: 190, hidden: false, shape: "circle", mode: "reveal" }],
    metadata: { source: "v0.3_fixture" },
    createdAt: now,
    updatedAt: now
  } satisfies FogPreset);

  state.jobs.push({
    id: "job_v03_storage_backup",
    type: "storage.backup",
    status: "queued",
    payload: { reason: "v0.3 fixture scheduled backup" },
    attempts: 0,
    maxAttempts: 3,
    queuedAt: now,
    logs: [{ at: now, level: "info", message: "Legacy scheduled backup queued" }],
    createdAt: now,
    updatedAt: now
  } satisfies WorkerJobRecord);

  return state;
}
