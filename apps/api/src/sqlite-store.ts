import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { emptyState, seedState, type EngineState } from "@open-tabletop/core";
import { demoSeedEnabled, type StateStore, type StoreSeedOptions } from "./store.js";

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteStatement {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
}

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => SqliteDatabase;
};

const stateCollections = [
  "users",
  "sessions",
  "identities",
  "oauthStates",
  "passwordResetTokens",
  "emailOutbox",
  "scimGroups",
  "scimGroupRoleMappings",
  "organizations",
  "organizationMembers",
  "invites",
  "campaigns",
  "members",
  "worlds",
  "scenes",
  "assets",
  "tokens",
  "actors",
  "items",
  "journals",
  "handouts",
  "chat",
  "rolls",
  "diceMacros",
  "encounters",
  "combats",
  "compendia",
  "proposals",
  "aiThreads",
  "aiEvaluations",
  "aiMemory",
  "aiToolCalls",
  "auditLogs",
  "permissionGrants",
  "pluginStorage",
  "pluginReviews",
  "contentImports",
  "fogPresets",
  "idempotencyRecords",
  "jobs"
] as const satisfies ReadonlyArray<keyof EngineState>;

type StateCollection = (typeof stateCollections)[number];
const expectedMigrationVersions = [1];
const requiredEngineRecordIndexes = ["idx_engine_records_campaign", "idx_engine_records_updated"];

interface EngineRecordRow {
  collection: StateCollection;
  data: string;
}

interface StoredEngineRecordRow {
  collection: string;
  id: string;
  campaign_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  data: string;
}

interface DesiredEngineRecord {
  collection: StateCollection;
  id: string;
  campaignId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  data: string;
}

interface CountRow {
  collection: string;
  count: number;
}

interface MigrationRow {
  version: number;
  name: string;
  applied_at: string;
}

interface IntegrityCheckRow {
  integrity_check: string;
}

export interface SqliteBackupSummary {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface SqliteStorageOperations {
  provider: "sqlite-json-records";
  supported: true;
  database: {
    fileName: string;
    sizeBytes: number;
    jsonRecordModel: true;
  };
  migrations: {
    expectedVersions: number[];
    applied: Array<{ version: number; name: string; appliedAt: string }>;
    latestAppliedVersion: number;
    missingVersions: number[];
  };
  integrity: {
    checkedAt: string;
    ok: boolean;
    result: string;
  };
  records: {
    total: number;
    collections: Array<{ collection: string; count: number }>;
  };
  indexes: {
    required: string[];
    present: string[];
    missing: string[];
  };
  backups: {
    directoryName: string;
    latest?: SqliteBackupSummary;
  };
  actionRequired: boolean;
  actionReasons: string[];
}

export interface SqliteBackupResult {
  status: "created";
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  reason?: string;
}

export interface SqliteRestoreDrillResult {
  status: "passed" | "failed";
  backup?: SqliteBackupSummary;
  checkedAt: string;
  integrity?: SqliteStorageOperations["integrity"];
  campaignCount?: number;
  recordCount?: number;
  collections?: SqliteStorageOperations["records"]["collections"];
  error?: string;
}

export interface SqliteRestoreBackupResult extends SqliteRestoreDrillResult {
  restoredAt?: string;
  reason?: string;
}

interface IdentifiedRecord {
  id: string;
  campaignId?: string;
  sceneId?: string;
  threadId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class SqliteStateStore implements StateStore {
  db: SqliteDatabase;
  state: EngineState;

  constructor(private readonly filePath = resolve(process.cwd(), "storage", "opentabletop.sqlite"), private readonly options: StoreSeedOptions = {}) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.migrate();
    this.state = this.load();
    if (this.state.campaigns.length === 0 && demoSeedEnabled(this.options)) {
      this.state = seedState();
      this.save();
    }
  }

  save(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const desiredRecords = this.recordsForState();
      const desiredByKey = new Map<string, DesiredEngineRecord>();
      for (const record of desiredRecords) {
        const key = engineRecordKey(record.collection, record.id);
        if (desiredByKey.has(key))
          throw new Error(
            `Duplicate engine record key: ${record.collection}/${record.id}`,
          );
        desiredByKey.set(key, record);
      }

      const existingRows = this.db
        .prepare(
          "select collection, id, campaign_id, created_at, updated_at, data from engine_records",
        )
        .all() as StoredEngineRecordRow[];
      const existingByKey = new Map(
        existingRows.map((row) => [
          engineRecordKey(row.collection, row.id),
          row,
        ]),
      );
      const deleteRecord = this.db.prepare(
        "delete from engine_records where collection = ? and id = ?",
      );
      const insert = this.db.prepare(`
        insert into engine_records (collection, id, campaign_id, created_at, updated_at, data)
        values (?, ?, ?, ?, ?, ?)
      `);
      const update = this.db.prepare(`
        update engine_records
        set campaign_id = ?, created_at = ?, updated_at = ?, data = ?
        where collection = ? and id = ?
      `);

      for (const row of existingRows) {
        if (!desiredByKey.has(engineRecordKey(row.collection, row.id))) {
          deleteRecord.run(row.collection, row.id);
        }
      }

      for (const record of desiredRecords) {
        const existing = existingByKey.get(
          engineRecordKey(record.collection, record.id),
        );
        if (!existing) {
          insert.run(
            record.collection,
            record.id,
            record.campaignId,
            record.createdAt,
            record.updatedAt,
            record.data,
          );
          continue;
        }

        if (
          existing.campaign_id !== record.campaignId ||
          existing.created_at !== record.createdAt ||
          existing.updated_at !== record.updatedAt ||
          existing.data !== record.data
        ) {
          update.run(
            record.campaignId,
            record.createdAt,
            record.updatedAt,
            record.data,
            record.collection,
            record.id,
          );
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  replace(state: EngineState): void {
    this.state = state;
    this.save();
  }

  storageOperations(): SqliteStorageOperations {
    const checkedAt = new Date().toISOString();
    const databaseStats = statSync(this.filePath);
    const appliedRows = this.db.prepare("select version, name, applied_at from schema_migrations order by version").all() as MigrationRow[];
    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const missingVersions = expectedMigrationVersions.filter((version) => !appliedVersions.has(version));
    const integrityRows = this.db.prepare("pragma integrity_check").all() as IntegrityCheckRow[];
    const integrityResult = integrityRows.map((row) => row.integrity_check).join("; ") || "unknown";
    const recordRows = this.db.prepare("select collection, count(*) as count from engine_records group by collection order by collection").all() as CountRow[];
    const indexes = this.db.prepare("select name from sqlite_master where type = 'index' and tbl_name = 'engine_records' order by name").all() as Array<{ name: string }>;
    const presentIndexes = indexes.map((row) => row.name);
    const missingIndexes = requiredEngineRecordIndexes.filter((name) => !presentIndexes.includes(name));
    const latestBackup = this.latestBackup();
    const actionReasons = [
      integrityResult === "ok" ? undefined : "sqlite_integrity_check_failed",
      missingVersions.length > 0 ? "sqlite_migrations_missing" : undefined,
      missingIndexes.length > 0 ? "sqlite_indexes_missing" : undefined,
      latestBackup ? undefined : "sqlite_backup_missing"
    ].filter((reason): reason is string => Boolean(reason));

    return {
      provider: "sqlite-json-records",
      supported: true,
      database: {
        fileName: basename(this.filePath),
        sizeBytes: databaseStats.size,
        jsonRecordModel: true
      },
      migrations: {
        expectedVersions: [...expectedMigrationVersions],
        applied: appliedRows.map((row) => ({ version: row.version, name: row.name, appliedAt: row.applied_at })),
        latestAppliedVersion: Math.max(0, ...appliedRows.map((row) => row.version)),
        missingVersions
      },
      integrity: {
        checkedAt,
        ok: integrityResult === "ok",
        result: integrityResult
      },
      records: {
        total: recordRows.reduce((total, row) => total + row.count, 0),
        collections: recordRows.map((row) => ({ collection: row.collection, count: row.count }))
      },
      indexes: {
        required: [...requiredEngineRecordIndexes],
        present: presentIndexes,
        missing: missingIndexes
      },
      backups: {
        directoryName: basename(this.backupDir()),
        ...(latestBackup ? { latest: latestBackup } : {})
      },
      actionRequired: actionReasons.length > 0,
      actionReasons
    };
  }

  createBackup(options: { reason?: string } = {}): SqliteBackupResult {
    this.save();
    const backupDir = this.backupDir();
    mkdirSync(backupDir, { recursive: true });
    const createdAt = new Date().toISOString();
    const fileName = `opentabletop-${createdAt.replace(/[:.]/g, "-")}.sqlite`;
    const targetPath = join(backupDir, fileName);
    copyFileSync(this.filePath, targetPath);
    const stats = statSync(targetPath);
    return {
      status: "created",
      fileName,
      sizeBytes: stats.size,
      createdAt,
      ...(options.reason ? { reason: options.reason.slice(0, 160) } : {})
    };
  }

  runRestoreDrill(options: { backupFileName?: string } = {}): SqliteRestoreDrillResult {
    const checkedAt = new Date().toISOString();
    const backup = options.backupFileName ? this.backupByFileName(options.backupFileName) : this.latestBackup();
    if (!backup) {
      return {
        status: "failed",
        checkedAt,
        error: "No SQLite backup is available for restore drill"
      };
    }

    const tempDir = mkdtempSync(join(tmpdir(), "otte-sqlite-restore-drill-"));
    const tempPath = join(tempDir, "restore-drill.sqlite");
    try {
      copyFileSync(join(this.backupDir(), backup.fileName), tempPath);
      const drillStore = new SqliteStateStore(tempPath, { seedDemo: false });
      const operations = drillStore.storageOperations();
      const result: SqliteRestoreDrillResult = {
        status: operations.integrity.ok ? "passed" : "failed",
        backup,
        checkedAt,
        integrity: operations.integrity,
        campaignCount: drillStore.state.campaigns.length,
        recordCount: operations.records.total,
        collections: operations.records.collections,
        ...(operations.integrity.ok ? {} : { error: operations.integrity.result })
      };
      drillStore.close();
      return result;
    } catch (error) {
      return {
        status: "failed",
        backup,
        checkedAt,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  restoreBackup(options: { backupFileName: string; reason?: string }): SqliteRestoreBackupResult {
    const drill = this.runRestoreDrill({ backupFileName: options.backupFileName });
    if (drill.status === "failed" || !drill.backup) return drill;

    const backupPath = join(this.backupDir(), drill.backup.fileName);
    this.db.close();
    copyFileSync(backupPath, this.filePath);
    this.db = new DatabaseSync(this.filePath);
    this.migrate();
    this.state = this.load();
    const operations = this.storageOperations();
    return {
      status: operations.integrity.ok ? "passed" : "failed",
      backup: drill.backup,
      checkedAt: new Date().toISOString(),
      restoredAt: new Date().toISOString(),
      integrity: operations.integrity,
      campaignCount: this.state.campaigns.length,
      recordCount: operations.records.total,
      collections: operations.records.collections,
      ...(options.reason ? { reason: options.reason.slice(0, 160) } : {}),
      ...(operations.integrity.ok ? {} : { error: operations.integrity.result })
    };
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists schema_migrations (
        version integer primary key,
        name text not null,
        applied_at text not null default current_timestamp
      );
    `);

    const hasInitialMigration = this.db
      .prepare("select version from schema_migrations where version = ?")
      .get(1);
    if (hasInitialMigration) return;

    this.db.exec(`
      create table if not exists engine_records (
        collection text not null,
        id text not null,
        campaign_id text,
        created_at text,
        updated_at text,
        data text not null,
        primary key (collection, id)
      );
      create index if not exists idx_engine_records_campaign
        on engine_records (campaign_id, collection);
      create index if not exists idx_engine_records_updated
        on engine_records (updated_at);
      insert into schema_migrations (version, name)
        values (1, 'engine_records');
    `);
  }

  private load(): EngineState {
    const state = emptyState();
    const rows = this.db.prepare("select collection, data from engine_records order by collection, id").all() as EngineRecordRow[];
    for (const row of rows) {
      if (!isStateCollection(row.collection)) continue;
      (state[row.collection] as unknown[]).push(JSON.parse(row.data));
    }
    return state;
  }

  private campaignIdForRecord(collection: StateCollection, record: IdentifiedRecord): string | null {
    if (record.campaignId) return record.campaignId;
    if (collection === "tokens" && record.sceneId) {
      return this.state.scenes.find((scene) => scene.id === record.sceneId)?.campaignId ?? null;
    }
    if (collection === "aiToolCalls" && record.threadId) {
      const thread = this.state.aiThreads.find((item) => item.id === record.threadId);
      return thread?.campaignId ?? null;
    }
    return null;
  }

  private recordsForState(): DesiredEngineRecord[] {
    const records: DesiredEngineRecord[] = [];
    for (const collection of stateCollections) {
      for (const record of this.state[collection] as IdentifiedRecord[]) {
        records.push({
          collection,
          id: record.id,
          campaignId: this.campaignIdForRecord(collection, record),
          createdAt: record.createdAt ?? null,
          updatedAt: record.updatedAt ?? null,
          data: JSON.stringify(record),
        });
      }
    }
    return records;
  }

  private backupDir(): string {
    return resolve(dirname(this.filePath), "backups");
  }

  private latestBackup(): SqliteBackupSummary | undefined {
    const backupDir = this.backupDir();
    if (!existsSync(backupDir)) return undefined;
    return readdirSync(backupDir)
      .filter((fileName) => fileName.endsWith(".sqlite"))
      .map((fileName) => this.backupSummary(fileName))
      .filter((summary): summary is SqliteBackupSummary => Boolean(summary))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  private backupByFileName(fileName: string): SqliteBackupSummary | undefined {
    const safeFileName = basename(fileName);
    if (safeFileName !== fileName || !safeFileName.endsWith(".sqlite")) return undefined;
    return this.backupSummary(safeFileName);
  }

  private backupSummary(fileName: string): SqliteBackupSummary | undefined {
    const path = join(this.backupDir(), fileName);
    if (!existsSync(path)) return undefined;
    const stats = statSync(path);
    return {
      fileName,
      sizeBytes: stats.size,
      createdAt: stats.birthtime.toISOString()
    };
  }
}

function isStateCollection(value: string): value is StateCollection {
  return (stateCollections as readonly string[]).includes(value);
}

function engineRecordKey(collection: string, id: string): string {
  return JSON.stringify([collection, id]);
}
