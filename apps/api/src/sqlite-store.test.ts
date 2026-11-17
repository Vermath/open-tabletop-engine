import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyState,
  type Campaign,
  type EngineState,
  type MapAsset,
  type User,
} from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteStateStore } from "./sqlite-store.js";

interface WriteAuditRow {
  sequence: number;
  event: "insert" | "update" | "delete";
  collection: string;
  id: string;
  data: string | null;
  oldData: string | null;
}

interface EngineRecordTestRow {
  collection: string;
  id: string;
  data: string;
}

describe("SqliteStateStore", () => {
  let directory: string;
  let store: SqliteStateStore;
  let alphaCampaign: Campaign;
  let betaCampaign: Campaign;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "otte-sqlite-store-"));
    store = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
    });
    alphaCampaign = campaign("camp_alpha", "Alpha");
    betaCampaign = campaign("camp_beta", "Beta");
    store.state = stateWithCampaigns([alphaCampaign, betaCampaign]);
    store.save();
    store.flush();
    installWriteAudit(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("does not rewrite engine records when save is unchanged", () => {
    store.save();
    store.flush();

    expect(writeAudit(store)).toEqual([]);
    expect(engineRecords(store)).toEqual([
      {
        collection: "campaigns",
        id: "camp_alpha",
        data: JSON.stringify(alphaCampaign),
      },
      {
        collection: "campaigns",
        id: "camp_beta",
        data: JSON.stringify(betaCampaign),
      },
    ]);
  });

  it("restores the last committed database state and discards a pending mutation", () => {
    store.state.campaigns[0]!.name = "Uncommitted Alpha";
    store.save();

    store.restoreDurableState();
    store.flush();

    expect(store.state.campaigns[0]!.name).toBe("Alpha");
    expect(writeAudit(store)).toEqual([]);
  });

  it("updates only the changed engine record", () => {
    const updatedAlpha = {
      ...alphaCampaign,
      name: "Alpha Revised",
      updatedAt: "2026-06-11T00:01:00.000Z",
    };
    store.state.campaigns = [updatedAlpha, betaCampaign];

    store.save();
    store.flush();

    expect(writeAudit(store)).toEqual([
      {
        sequence: 1,
        event: "update",
        collection: "campaigns",
        id: "camp_alpha",
        data: JSON.stringify(updatedAlpha),
        oldData: JSON.stringify(alphaCampaign),
      },
    ]);
    expect(engineRecords(store)).toEqual([
      {
        collection: "campaigns",
        id: "camp_alpha",
        data: JSON.stringify(updatedAlpha),
      },
      {
        collection: "campaigns",
        id: "camp_beta",
        data: JSON.stringify(betaCampaign),
      },
    ]);
  });

  it("serializes and writes only a directly mutated record without re-reading persisted data", () => {
    const trackedAlpha = store.state.campaigns[0]!;
    const trackedBeta = store.state.campaigns[1]!;
    const originalUpdatedAt = trackedAlpha.updatedAt;
    const stringify = vi.spyOn(JSON, "stringify");
    const prepare = vi.spyOn(store.db, "prepare");

    trackedAlpha.name = "Alpha Direct Mutation";
    store.save();
    store.flush();

    expect(
      stringify.mock.calls.filter(([value]) => value === trackedAlpha),
    ).toHaveLength(1);
    expect(
      stringify.mock.calls.filter(([value]) => value === trackedBeta),
    ).toHaveLength(0);
    expect(
      prepare.mock.calls
        .map(([sql]) => sql.replace(/\s+/g, " ").trim().toLowerCase())
        .filter(
          (sql) =>
            sql.startsWith("select") && sql.includes("from engine_records"),
        ),
    ).toEqual([]);
    stringify.mockRestore();
    prepare.mockRestore();

    const writes = writeAudit(store);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      event: "update",
      collection: "campaigns",
      id: "camp_alpha",
    });
    expect(JSON.parse(writes[0]!.data!)).toMatchObject({
      name: "Alpha Direct Mutation",
      updatedAt: originalUpdatedAt,
    });
    expect(JSON.parse(writes[0]!.oldData!)).toMatchObject({
      name: "Alpha",
      updatedAt: originalUpdatedAt,
    });

    const reopened = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
    });
    try {
      expect(
        reopened.state.campaigns.find(
          (campaign) => campaign.id === "camp_alpha",
        ),
      ).toMatchObject({
        name: "Alpha Direct Mutation",
        updatedAt: originalUpdatedAt,
      });
    } finally {
      reopened.close();
    }
  });

  it("tracks nested edits, array shape changes, and newly added fields without rewriting other records", () => {
    const asset = mapAsset();
    store.state.assets.push(asset);
    store.save();
    store.flush();
    store.db.exec("delete from write_audit");

    const trackedAsset = store.state.assets[0]!;
    const trackedAlpha = store.state.campaigns[0]!;
    const trackedBeta = store.state.campaigns[1]!;
    const stringify = vi.spyOn(JSON, "stringify");

    trackedAsset.storage!.key = "camp_alpha/recovery-map-revised.png";
    trackedAsset.renditions![0]!.width = 256;
    trackedAsset.renditions!.push({
      ...trackedAsset.renditions![0]!,
      kind: "optimized",
      storage: {
        ...trackedAsset.renditions![0]!.storage,
        key: "camp_alpha/recovery-map-preview.webp",
      },
    });
    (
      trackedAsset as MapAsset & { persistenceMetadata?: { verified: boolean } }
    ).persistenceMetadata = { verified: true };
    store.save();
    store.flush();

    expect(
      stringify.mock.calls.filter(([value]) => value === trackedAsset),
    ).toHaveLength(1);
    expect(
      stringify.mock.calls.filter(
        ([value]) => value === trackedAlpha || value === trackedBeta,
      ),
    ).toHaveLength(0);
    stringify.mockRestore();
    expect(
      writeAudit(store).map(({ event, collection, id }) => ({
        event,
        collection,
        id,
      })),
    ).toEqual([{ event: "update", collection: "assets", id: asset.id }]);

    const reopened = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
    });
    try {
      const persisted = reopened.state.assets[0] as MapAsset & {
        persistenceMetadata?: { verified: boolean };
      };
      expect(persisted.storage?.key).toBe(
        "camp_alpha/recovery-map-revised.png",
      );
      expect(persisted.renditions).toHaveLength(2);
      expect(persisted.renditions?.[0]?.width).toBe(256);
      expect(persisted.persistenceMetadata).toEqual({ verified: true });
    } finally {
      reopened.close();
    }
  });

  it("keeps the persisted index dirty across a rolled-back update and retries it", () => {
    store.db.exec(`
      create trigger reject_alpha_update
        before update on engine_records
        when new.collection = 'campaigns' and new.id = 'camp_alpha'
        begin
          select raise(abort, 'intentional update failure');
        end;
    `);
    store.state.campaigns[0]!.name = "Alpha Retried";
    store.save();

    expect(() => store.flush()).toThrow(/intentional update failure/i);
    expect(
      engineRecords(store).find((record) => record.id === "camp_alpha")?.data,
    ).toContain('"name":"Alpha"');

    store.db.exec("drop trigger reject_alpha_update");
    store.flush();

    expect(
      engineRecords(store).find((record) => record.id === "camp_alpha")?.data,
    ).toContain('"name":"Alpha Retried"');
  });

  it("deletes removed engine records without rewriting survivors", () => {
    store.state.campaigns = [alphaCampaign];

    store.save();
    store.flush();

    expect(writeAudit(store)).toEqual([
      {
        sequence: 1,
        event: "delete",
        collection: "campaigns",
        id: "camp_beta",
        data: null,
        oldData: JSON.stringify(betaCampaign),
      },
    ]);
    expect(engineRecords(store)).toEqual([
      {
        collection: "campaigns",
        id: "camp_alpha",
        data: JSON.stringify(alphaCampaign),
      },
    ]);
  });

  it("coalesces writes and flushes after the debounce window", () => {
    vi.useFakeTimers();
    const updatedAlpha = {
      ...alphaCampaign,
      name: "Alpha Debounced",
      updatedAt: "2026-06-11T00:02:00.000Z",
    };
    store.state.campaigns = [updatedAlpha, betaCampaign];

    store.save();

    expect(writeAudit(store)).toEqual([]);
    vi.advanceTimersByTime(35);
    expect(writeAudit(store)).toEqual([
      {
        sequence: 1,
        event: "update",
        collection: "campaigns",
        id: "camp_alpha",
        data: JSON.stringify(updatedAlpha),
        oldData: JSON.stringify(alphaCampaign),
      },
    ]);
  });

  it("flush forces durability synchronously and survives reopen", () => {
    const updatedAlpha = {
      ...alphaCampaign,
      name: "Alpha Flushed",
      updatedAt: "2026-06-11T00:03:00.000Z",
    };
    store.state.campaigns = [updatedAlpha, betaCampaign];

    store.save();
    store.flush();

    const reopened = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
    });
    try {
      expect(reopened.state.campaigns).toEqual([
        { ...updatedAlpha, eventSequence: 0, aiPolicy: undefined },
        { ...betaCampaign, eventSequence: 0, aiPolicy: undefined },
      ]);
    } finally {
      reopened.close();
    }
  });

  it("close flushes a pending write before reopen", () => {
    const updatedAlpha = {
      ...alphaCampaign,
      name: "Alpha Closed",
      updatedAt: "2026-06-11T00:04:00.000Z",
    };
    store.state.campaigns = [updatedAlpha, betaCampaign];

    store.save();
    store.close();

    const reopened = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
    });
    try {
      expect(reopened.state.campaigns).toEqual([
        { ...updatedAlpha, eventSequence: 0, aiPolicy: undefined },
        { ...betaCampaign, eventSequence: 0, aiPolicy: undefined },
      ]);
    } finally {
      reopened.close();
    }
  });

  it("prunes SQLite backups to the configured retention count", () => {
    store.close();
    store = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
      backupRetentionCount: 2,
    });
    store.state = stateWithCampaigns([alphaCampaign]);
    store.save();
    store.flush();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T12:00:00.000Z"));
    const first = store.createBackup({ reason: "first" });
    const firstManifestPath = join(
      directory,
      "backups",
      `${first.fileName}.recovery.json`,
    );
    expect(existsSync(firstManifestPath)).toBe(true);
    const manualRestorePoint = "zzzz-manual-restore-point.sqlite";
    copyFileSync(
      join(directory, "backups", first.fileName),
      join(directory, "backups", manualRestorePoint),
    );
    vi.setSystemTime(new Date("2026-07-12T12:00:01.000Z"));
    store.createBackup({ reason: "second" });
    vi.setSystemTime(new Date("2026-07-12T12:00:02.000Z"));
    const third = store.createBackup({ reason: "third" });

    expect(third.prunedFileNames).toEqual([first.fileName]);
    expect(existsSync(firstManifestPath)).toBe(false);
    expect(
      readdirSync(join(directory, "backups"))
        .filter((fileName) => fileName.endsWith(".sqlite"))
        .sort(),
    ).toEqual([
      "opentabletop-2026-07-12T12-00-01-000Z.sqlite",
      "opentabletop-2026-07-12T12-00-02-000Z.sqlite",
      manualRestorePoint,
    ]);
    expect(store.storageOperations().backups).toEqual(
      expect.objectContaining({
        count: 3,
        retentionCount: 2,
        latest: expect.objectContaining({
          fileName: "opentabletop-2026-07-12T12-00-02-000Z.sqlite",
        }),
      }),
    );
    expect(
      store.runRestoreDrill({ backupFileName: manualRestorePoint }).status,
    ).toBe("passed");
  });

  it("records and strictly verifies an exact operator-created asset snapshot pair", () => {
    const asset = mapAsset();
    store.state.assets = [asset];
    store.save();
    store.flush();
    const assetSnapshot = {
      provider: "local" as const,
      snapshotId: "local-volume-snapshot-2026-07-13-001",
      createdAt: "2026-07-13T18:30:00.000Z",
    };

    const backup = store.createBackup({
      reason: "paired recovery point",
      assetProvider: "local",
      assetSnapshot,
      requireAssetSnapshot: true,
    });

    expect(backup.recoveryPoint).toMatchObject({
      manifestStatus: "present",
      paired: true,
      actionRequired: false,
      manifest: {
        database: {
          fileName: backup.fileName,
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        assetInventory: {
          provider: "local",
          assetCount: 1,
          objectCount: 2,
          sizeBytes: 384,
          digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        assetSnapshot,
      },
    });
    const manifestPath = join(
      directory,
      "backups",
      `${backup.fileName}.recovery.json`,
    );
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      checksumAlgorithm: "sha256",
      manifestChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    expect(
      store.runRestoreDrill({
        backupFileName: backup.fileName,
        requireAssetSnapshot: true,
        expectedAssetSnapshot: assetSnapshot,
      }),
    ).toMatchObject({
      status: "passed",
      actionRequired: false,
      actionReasons: [],
    });
    expect(
      store.runRestoreDrill({
        backupFileName: backup.fileName,
        requireAssetSnapshot: true,
        expectedAssetSnapshot: {
          ...assetSnapshot,
          snapshotId: "wrong-snapshot",
        },
      }),
    ).toMatchObject({
      status: "failed",
      actionRequired: true,
      actionReasons: expect.arrayContaining([
        "asset_snapshot_identity_mismatch",
      ]),
    });
  });

  it("keeps database-only restore drills available but explicitly marks them unpaired", () => {
    const backup = store.createBackup({ assetProvider: "local" });

    expect(backup.recoveryPoint).toMatchObject({
      paired: false,
      actionRequired: true,
      actionReasons: ["asset_snapshot_unpaired"],
    });
    expect(
      store.runRestoreDrill({ backupFileName: backup.fileName }),
    ).toMatchObject({
      status: "passed",
      actionRequired: true,
      actionReasons: ["asset_snapshot_unpaired"],
    });
    expect(
      store.runRestoreDrill({
        backupFileName: backup.fileName,
        requireAssetSnapshot: true,
      }),
    ).toMatchObject({
      status: "failed",
      actionReasons: expect.arrayContaining(["asset_snapshot_required"]),
    });
  });

  it("rejects recovery manifest checksum and asset inventory mismatches before restore", () => {
    store.state.assets = [mapAsset()];
    store.save();
    store.flush();
    const backup = store.createBackup({ assetProvider: "local" });
    const manifestPath = join(
      directory,
      "backups",
      `${backup.fileName}.recovery.json`,
    );
    const envelope = JSON.parse(readFileSync(manifestPath, "utf8"));
    envelope.manifestChecksum = "0".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(envelope));

    expect(
      store.runRestoreDrill({ backupFileName: backup.fileName }),
    ).toMatchObject({
      status: "failed",
      actionReasons: expect.arrayContaining(["recovery_manifest_invalid"]),
    });

    envelope.recoveryPoint.assetInventory.assetCount = 99;
    envelope.manifestChecksum = createHash("sha256")
      .update(JSON.stringify(envelope.recoveryPoint), "utf8")
      .digest("hex");
    writeFileSync(manifestPath, JSON.stringify(envelope));
    expect(
      store.runRestoreDrill({ backupFileName: backup.fileName }),
    ).toMatchObject({
      status: "failed",
      actionReasons: expect.arrayContaining(["asset_inventory_mismatch"]),
    });

    envelope.recoveryPoint.assetInventory.assetCount = 1;
    envelope.manifestChecksum = createHash("sha256")
      .update(JSON.stringify(envelope.recoveryPoint), "utf8")
      .digest("hex");
    writeFileSync(manifestPath, JSON.stringify(envelope));
    appendFileSync(
      join(directory, "backups", backup.fileName),
      Buffer.from("tampered"),
    );
    expect(
      store.runRestoreDrill({ backupFileName: backup.fileName }),
    ).toMatchObject({
      status: "failed",
      actionReasons: expect.arrayContaining([
        "database_backup_checksum_mismatch",
      ]),
    });
  });

  it("persists idempotency records using their composite request identity", () => {
    const record = {
      key: "create-scene",
      method: "POST",
      path: "/api/v1/campaigns/camp_alpha/scenes",
      userId: "usr_test",
      requestHash: "request-hash",
      authorizationHash: "authorization-hash",
      statusCode: 200,
      contentType: "application/json",
      responseBody: JSON.stringify({ id: "scn_alpha" }),
      createdAt: "2026-06-11T00:05:00.000Z",
      updatedAt: "2026-06-11T00:05:00.000Z",
    };
    store.state.idempotencyRecords = [record];

    store.save();
    store.flush();

    expect(engineRecords(store)).toContainEqual({
      collection: "idempotencyRecords",
      id: JSON.stringify([record.userId, record.method, record.key]),
      data: JSON.stringify(record),
    });
    store.close();

    const reopened = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: false,
    });
    expect(reopened.state.idempotencyRecords).toEqual([record]);
    reopened.close();
  });

  it("does not replace existing non-campaign data with the demo seed", () => {
    const existingUser: User = {
      id: "usr_existing_without_campaign",
      displayName: "Existing User",
      email: "existing@example.test",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
    };
    const state = emptyState();
    state.users.push(existingUser);
    store.replace(state);
    store.close();

    store = new SqliteStateStore(join(directory, "state.sqlite"), {
      seedDemo: true,
    });

    expect(store.state.users).toEqual([existingUser]);
    expect(store.state.campaigns).toEqual([]);
  });
});

function stateWithCampaigns(campaigns: Campaign[]): EngineState {
  const state = emptyState();
  state.campaigns = campaigns;
  return state;
}

function campaign(id: string, name: string): Campaign {
  const timestamp = "2026-06-11T00:00:00.000Z";
  return {
    id,
    organizationId: "org_test",
    ownerUserId: "usr_test",
    name,
    description: "",
    defaultSystemId: "generic-fantasy",
    visibility: "private",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mapAsset(): MapAsset {
  const timestamp = "2026-07-13T18:00:00.000Z";
  return {
    id: "asset_recovery",
    campaignId: "camp_alpha",
    name: "Recovery Map",
    url: "/api/v1/assets/asset_recovery/blob",
    mimeType: "image/png",
    sizeBytes: 256,
    checksum: "a".repeat(64),
    storage: { provider: "local", key: "camp_alpha/asset_recovery.png" },
    renditions: [
      {
        kind: "thumbnail",
        mimeType: "image/webp",
        sizeBytes: 128,
        checksum: "b".repeat(64),
        width: 128,
        height: 128,
        storage: {
          provider: "local",
          key: "camp_alpha/asset_recovery-thumbnail.webp",
        },
        createdAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function installWriteAudit(store: SqliteStateStore): void {
  store.db.exec(`
    create table write_audit (
      sequence integer primary key autoincrement,
      event text not null,
      collection text not null,
      id text not null,
      data text,
      old_data text
    );

    create trigger audit_engine_record_insert
      after insert on engine_records
      begin
        insert into write_audit (event, collection, id, data, old_data)
        values ('insert', new.collection, new.id, new.data, null);
      end;

    create trigger audit_engine_record_update
      after update on engine_records
      begin
        insert into write_audit (event, collection, id, data, old_data)
        values ('update', new.collection, new.id, new.data, old.data);
      end;

    create trigger audit_engine_record_delete
      after delete on engine_records
      begin
        insert into write_audit (event, collection, id, data, old_data)
        values ('delete', old.collection, old.id, null, old.data);
      end;
  `);
}

function writeAudit(store: SqliteStateStore): WriteAuditRow[] {
  return store.db
    .prepare(
      "select sequence, event, collection, id, data, old_data as oldData from write_audit order by sequence",
    )
    .all() as WriteAuditRow[];
}

function engineRecords(store: SqliteStateStore): EngineRecordTestRow[] {
  return store.db
    .prepare(
      "select collection, id, data from engine_records order by collection, id",
    )
    .all() as EngineRecordTestRow[];
}
