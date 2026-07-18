import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  emptyState,
  normalizeEngineState,
  seedState,
  type EngineState,
  type MapAsset,
} from "@open-tabletop/core";
import {
  CoalescedStateWriter,
  demoSeedEnabled,
  type StateStore,
  type StoreSeedOptions,
} from "./store.js";

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
  "worldRecords",
  "worldRelations",
  "scenes",
  "assets",
  "tokens",
  "actors",
  "calculationOverrides",
  "characterTransfers",
  "items",
  "dndRulesMutations",
  "pendingAdvancements",
  "journals",
  "handouts",
  "chat",
  "rolls",
  "diceMacros",
  "audioTracks",
  "encounters",
  "campaignSessions",
  "combats",
  "compendia",
  "proposals",
  "aiThreads",
  "aiEvaluations",
  "aiMemory",
  "aiToolCalls",
  "auditLogs",
  "permissionGrants",
  "systemInstallations",
  "pluginStorage",
  "pluginReviews",
  "contentImports",
  "fogPresets",
  "campaignWebhooks",
  "campaignWebhookDeliveries",
  "idempotencyRecords",
  "jobs",
] as const satisfies ReadonlyArray<keyof EngineState>;

type StateCollection = (typeof stateCollections)[number];
const expectedMigrationVersions = [1, 2];
const requiredEngineRecordIndexes = [
  "idx_engine_records_campaign",
  "idx_engine_records_updated",
  "idx_engine_records_collection_created",
];

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
  source: IdentifiedRecord;
  tracker: RecordMutationTracker;
}

interface PersistedEngineRecord {
  collection: string;
  id: string;
  campaignId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  data: string;
  source?: IdentifiedRecord;
}

interface RecordMutationTracker {
  readonly root: IdentifiedRecord;
  dirty: boolean;
}

interface TrackedAccessor {
  readonly get?: () => unknown;
  readonly set?: (value: unknown) => void;
}

interface TrackedObjectMetadata {
  readonly listeners: Set<RecordMutationTracker>;
  readonly accessors: Map<string, TrackedAccessor>;
  arrayLength?: number;
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

interface QuickCheckRow {
  quick_check: string;
}

export interface SqliteBackupSummary {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  recoveryPoint: SqliteRecoveryPointSummary;
}

export type AssetSnapshotProvider = "local" | "s3";

export interface AssetSnapshotIdentity {
  provider: AssetSnapshotProvider;
  snapshotId: string;
  createdAt: string;
}

export interface SqliteAssetMetadataInventory {
  provider: AssetSnapshotProvider | "unknown";
  assetCount: number;
  objectCount: number;
  sizeBytes: number;
  digestAlgorithm: "sha256";
  digest: string;
}

export interface SqliteRecoveryPointManifest {
  kind: "open-tabletop-recovery-point";
  version: 1;
  createdAt: string;
  database: {
    fileName: string;
    sizeBytes: number;
    checksumAlgorithm: "sha256";
    checksum: string;
  };
  assetInventory: SqliteAssetMetadataInventory;
  assetSnapshot?: AssetSnapshotIdentity;
}

export interface SqliteRecoveryPointSummary {
  manifestFileName: string;
  manifestStatus: "present" | "missing" | "invalid";
  paired: boolean;
  actionRequired: boolean;
  actionReasons: string[];
  manifest?: SqliteRecoveryPointManifest;
}

interface SqliteRecoveryManifestEnvelope {
  schemaVersion: 1;
  checksumAlgorithm: "sha256";
  manifestChecksum: string;
  recoveryPoint: SqliteRecoveryPointManifest;
}

export interface SqliteBackupOptions {
  reason?: string;
  assetProvider?: AssetSnapshotProvider;
  assetSnapshot?: AssetSnapshotIdentity;
  requireAssetSnapshot?: boolean;
}

export interface SqliteRestoreDrillOptions {
  backupFileName?: string;
  requireAssetSnapshot?: boolean;
  expectedAssetSnapshot?: AssetSnapshotIdentity;
  expectedAssetInventory?: SqliteAssetMetadataInventory;
}

export type SqliteRestoreFaultPhase =
  | "after_intent_recorded"
  | "after_stage"
  | "after_live_renamed"
  | "after_candidate_promoted"
  | "after_candidate_open"
  | "after_candidate_migrate"
  | "after_candidate_load"
  | "after_reconciliation"
  | "after_commit_recorded"
  | "after_rollback_recorded";

type SqliteRestoreIntentPhase =
  | "preparing"
  | "staged"
  | "live_renamed"
  | "candidate_promoted"
  | "candidate_opened"
  | "candidate_migrated"
  | "candidate_loaded"
  | "reconciled"
  | "committed"
  | "rolled_back";

interface SqliteRestoreIntent {
  schemaVersion: 1;
  databaseFileName: string;
  backupFileName: string;
  nonce: string;
  phase: SqliteRestoreIntentPhase;
  expectedStateRevision: string;
  createdAt: string;
  updatedAt: string;
}

export interface SqliteRestoreBackupOptions extends SqliteRestoreDrillOptions {
  backupFileName: string;
  reason?: string;
  /** Exact live primary-state digest returned by storageOperations(). */
  expectedStateRevision?: string;
  /** Authenticated server admin retained as owner of backup-only campaigns. */
  recoveryAdminUserId?: string;
  /** Automatic paired-restore rollback must reproduce the captured live state byte-for-byte. */
  reconcileSecurityPlane?: boolean;
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
    count: number;
    retentionCount: number;
    latest?: SqliteBackupSummary;
  };
  /** Excludes append-only audit rows so inspecting this endpoint does not stale its own precondition. */
  restoreStateRevision: string;
  actionRequired: boolean;
  actionReasons: string[];
}

export interface SqliteBackupResult {
  status: "created";
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  recoveryPoint: SqliteRecoveryPointSummary;
  reason?: string;
  prunedFileNames?: string[];
}

export interface SqliteStateStoreOptions extends StoreSeedOptions {
  backupRetentionCount?: number;
  /** Test-only deterministic failure injection for atomic restore verification. */
  restoreFaultInjector?: (phase: SqliteRestoreFaultPhase) => void;
}

export interface SqliteRestoreDrillResult {
  status: "passed" | "failed";
  backup?: SqliteBackupSummary;
  checkedAt: string;
  recoveryPoint?: SqliteRecoveryPointSummary;
  actionRequired: boolean;
  actionReasons: string[];
  integrity?: SqliteStorageOperations["integrity"];
  campaignCount?: number;
  recordCount?: number;
  collections?: SqliteStorageOperations["records"]["collections"];
  error?: string;
}

export interface SqliteRestoreBackupResult extends SqliteRestoreDrillResult {
  restoredAt?: string;
  reason?: string;
  reconciliation?: SqliteRestoreReconciliation;
}

export interface SqliteRestoreReconciliation {
  policy: "preserve-live-security-plane";
  usersPreserved: number;
  sessionsPreserved: number;
  oauthStatesCleared: number;
  passwordResetTokensCleared: number;
  invitesPreserved: number;
  pendingEmailsQuarantined: number;
  webhooksDisabled: number;
  pendingWebhookDeliveriesQuarantined: number;
  jobsCancelled: number;
  idempotencyRecordsCleared: number;
  backupOnlyCampaignsAssignedToRecoveryAdmin: number;
}

interface IdentifiedRecord {
  id?: string;
  key?: string;
  method?: string;
  userId?: string;
  campaignId?: string;
  sceneId?: string;
  threadId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class SqliteStateStore implements StateStore {
  db: SqliteDatabase;
  private stateValue: EngineState = emptyState();
  private readonly writer: CoalescedStateWriter;
  private persistedRecords = new Map<string, PersistedEngineRecord>();
  private readonly trackerByRoot = new WeakMap<object, RecordMutationTracker>();
  private readonly trackedObjects = new WeakMap<
    object,
    TrackedObjectMetadata
  >();
  private closed = false;

  get state(): EngineState {
    return this.stateValue;
  }

  set state(value: EngineState) {
    this.stateValue = value;
  }

  constructor(
    private readonly filePath = resolve(
      process.cwd(),
      "storage",
      "opentabletop.sqlite",
    ),
    private readonly options: SqliteStateStoreOptions = {},
  ) {
    mkdirSync(dirname(filePath), { recursive: true });
    recoverInterruptedRestore(filePath);
    this.db = new DatabaseSync(filePath);
    this.migrate();
    this.writer = new CoalescedStateWriter(() => this.flushNow());
    this.state = this.load();
    if (this.isEmpty() && demoSeedEnabled(this.options)) {
      this.state = seedState();
      this.save();
      this.flush();
    }
  }

  save(): void {
    this.writer.save();
  }

  flush(): void {
    this.writer.flush();
  }

  readiness(): { ok: boolean; reason?: string } {
    if (this.closed) return { ok: false, reason: "sqlite_store_closed" };
    try {
      const row = this.db.prepare("pragma quick_check(1)").get() as
        QuickCheckRow | undefined;
      return row?.quick_check === "ok"
        ? { ok: true }
        : { ok: false, reason: "sqlite_integrity_check_failed" };
    } catch {
      return { ok: false, reason: "sqlite_unavailable" };
    }
  }

  restoreDurableState(): void {
    this.writer.discard();
    this.state = this.load();
  }

  private flushNow(): void {
    const desiredRecords = this.recordsForState();
    const desiredByKey = new Map<string, DesiredEngineRecord>();
    for (const record of desiredRecords) {
      const key = engineRecordKey(record.collection, record.id);
      if (desiredByKey.has(key)) {
        throw new Error(
          `Duplicate engine record key: ${record.collection}/${record.id}`,
        );
      }
      desiredByKey.set(key, record);
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
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

      for (const [key, record] of this.persistedRecords) {
        if (!desiredByKey.has(key)) {
          deleteRecord.run(record.collection, record.id);
        }
      }

      for (const record of desiredRecords) {
        const existing = this.persistedRecords.get(
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
          existing.campaignId !== record.campaignId ||
          existing.createdAt !== record.createdAt ||
          existing.updatedAt !== record.updatedAt ||
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
      this.persistedRecords = new Map(
        desiredRecords.map((record) => [
          engineRecordKey(record.collection, record.id),
          {
            collection: record.collection,
            id: record.id,
            campaignId: record.campaignId,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            data: record.data,
            source: record.source,
          },
        ]),
      );
      for (const record of desiredRecords) record.tracker.dirty = false;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  replace(state: EngineState, options: { flush?: boolean } = {}): void {
    this.state = normalizeEngineState(state);
    this.save();
    if (options.flush !== false) this.flush();
  }

  storageOperations(): SqliteStorageOperations {
    this.flush();
    const checkedAt = new Date().toISOString();
    const databaseStats = statSync(this.filePath);
    const appliedRows = this.db
      .prepare(
        "select version, name, applied_at from schema_migrations order by version",
      )
      .all() as MigrationRow[];
    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const missingVersions = expectedMigrationVersions.filter(
      (version) => !appliedVersions.has(version),
    );
    const integrityRows = this.db
      .prepare("pragma integrity_check")
      .all() as IntegrityCheckRow[];
    const integrityResult =
      integrityRows.map((row) => row.integrity_check).join("; ") || "unknown";
    const recordRows = this.db
      .prepare(
        "select collection, count(*) as count from engine_records group by collection order by collection",
      )
      .all() as CountRow[];
    const indexes = this.db
      .prepare(
        "select name from sqlite_master where type = 'index' and tbl_name = 'engine_records' order by name",
      )
      .all() as Array<{ name: string }>;
    const presentIndexes = indexes.map((row) => row.name);
    const missingIndexes = requiredEngineRecordIndexes.filter(
      (name) => !presentIndexes.includes(name),
    );
    const backupSummaries = this.backupSummaries();
    const latestBackup = this.latestBackup();
    const actionReasons = [
      integrityResult === "ok" ? undefined : "sqlite_integrity_check_failed",
      missingVersions.length > 0 ? "sqlite_migrations_missing" : undefined,
      missingIndexes.length > 0 ? "sqlite_indexes_missing" : undefined,
      latestBackup ? undefined : "sqlite_backup_missing",
      ...(latestBackup?.recoveryPoint.actionReasons ?? []),
    ].filter((reason): reason is string => Boolean(reason));

    return {
      provider: "sqlite-json-records",
      supported: true,
      database: {
        fileName: basename(this.filePath),
        sizeBytes: databaseStats.size,
        jsonRecordModel: true,
      },
      migrations: {
        expectedVersions: [...expectedMigrationVersions],
        applied: appliedRows.map((row) => ({
          version: row.version,
          name: row.name,
          appliedAt: sqliteTimestampToIso(row.applied_at),
        })),
        latestAppliedVersion: Math.max(
          0,
          ...appliedRows.map((row) => row.version),
        ),
        missingVersions,
      },
      integrity: {
        checkedAt,
        ok: integrityResult === "ok",
        result: integrityResult,
      },
      records: {
        total: recordRows.reduce((total, row) => total + row.count, 0),
        collections: recordRows.map((row) => ({
          collection: row.collection,
          count: row.count,
        })),
      },
      indexes: {
        required: [...requiredEngineRecordIndexes],
        present: presentIndexes,
        missing: missingIndexes,
      },
      backups: {
        directoryName: basename(this.backupDir()),
        count: backupSummaries.length,
        retentionCount: this.backupRetentionCount(),
        ...(latestBackup ? { latest: latestBackup } : {}),
      },
      restoreStateRevision: restoreStateRevision(this.state),
      actionRequired: actionReasons.length > 0,
      actionReasons: uniqueStrings(actionReasons),
    };
  }

  createBackup(options: SqliteBackupOptions = {}): SqliteBackupResult {
    this.flush();
    assertAssetSnapshotOptions(options);
    const backupDir = this.backupDir();
    mkdirSync(backupDir, { recursive: true });
    const createdAt = new Date().toISOString();
    const fileName = `opentabletop-${createdAt.replace(/[:.]/g, "-")}.sqlite`;
    const targetPath = join(backupDir, fileName);
    copyFileSync(this.filePath, targetPath);
    const stats = statSync(targetPath);
    const recoveryPoint: SqliteRecoveryPointManifest = {
      kind: "open-tabletop-recovery-point",
      version: 1,
      createdAt,
      database: {
        fileName,
        sizeBytes: stats.size,
        checksumAlgorithm: "sha256",
        checksum: sha256File(targetPath),
      },
      assetInventory: assetMetadataInventory(
        this.state,
        options.assetProvider ?? configuredAssetProvider(),
      ),
      ...(options.assetSnapshot
        ? { assetSnapshot: options.assetSnapshot }
        : {}),
    };
    const envelope: SqliteRecoveryManifestEnvelope = {
      schemaVersion: 1,
      checksumAlgorithm: "sha256",
      manifestChecksum: sha256Text(JSON.stringify(recoveryPoint)),
      recoveryPoint,
    };
    const manifestPath = this.recoveryManifestPath(fileName);
    const temporaryManifestPath = `${manifestPath}.tmp`;
    try {
      writeFileSync(
        temporaryManifestPath,
        `${JSON.stringify(envelope, null, 2)}\n`,
        "utf8",
      );
      renameSync(temporaryManifestPath, manifestPath);
    } catch (error) {
      rmSync(temporaryManifestPath, { force: true });
      rmSync(targetPath, { force: true });
      throw error;
    }
    const prunedFileNames = this.pruneBackups();
    const recoverySummary = recoveryPointSummary(fileName, {
      status: "present",
      envelope,
    });
    return {
      status: "created",
      fileName,
      sizeBytes: stats.size,
      createdAt,
      recoveryPoint: recoverySummary,
      ...(options.reason ? { reason: options.reason.slice(0, 160) } : {}),
      ...(prunedFileNames.length > 0 ? { prunedFileNames } : {}),
    };
  }

  /** Root for SQLite backups and application-managed paired asset snapshots. */
  backupArtifactDirectory(): string {
    return this.backupDir();
  }

  runRestoreDrill(
    options: SqliteRestoreDrillOptions = {},
  ): SqliteRestoreDrillResult {
    this.flush();
    const checkedAt = new Date().toISOString();
    const backup = options.backupFileName
      ? this.backupByFileName(options.backupFileName)
      : this.latestBackup();
    if (!backup) {
      return {
        status: "failed",
        checkedAt,
        actionRequired: true,
        actionReasons: ["sqlite_backup_missing"],
        error: "No SQLite backup is available for restore drill",
      };
    }

    const manifestRead = this.readRecoveryManifest(backup.fileName);
    const recoveryPoint = recoveryPointSummary(backup.fileName, manifestRead);
    const manifestFailure = validateRecoveryManifestForDrill(
      backup,
      join(this.backupDir(), backup.fileName),
      manifestRead,
      options,
    );
    if (manifestFailure) {
      return {
        status: "failed",
        backup,
        checkedAt,
        recoveryPoint: withRecoveryFailure(
          recoveryPoint,
          manifestFailure.reason,
        ),
        actionRequired: true,
        actionReasons: uniqueStrings([
          ...recoveryPoint.actionReasons,
          manifestFailure.reason,
        ]),
        error: manifestFailure.error,
      };
    }

    const tempDir = mkdtempSync(join(tmpdir(), "otte-sqlite-restore-drill-"));
    const tempPath = join(tempDir, "restore-drill.sqlite");
    try {
      copyFileSync(join(this.backupDir(), backup.fileName), tempPath);
      const drillStore = new SqliteStateStore(tempPath, { seedDemo: false });
      const operations = drillStore.storageOperations();
      const inventoryFailure =
        manifestRead.status === "present"
          ? compareAssetInventories(
              manifestRead.envelope.recoveryPoint.assetInventory,
              assetMetadataInventory(
                drillStore.state,
                manifestRead.envelope.recoveryPoint.assetInventory.provider,
              ),
            )
          : undefined;
      const integrityOk = operations.integrity.ok && !inventoryFailure;
      const result: SqliteRestoreDrillResult = {
        status: integrityOk ? "passed" : "failed",
        backup,
        checkedAt,
        recoveryPoint: inventoryFailure
          ? withRecoveryFailure(recoveryPoint, "asset_inventory_mismatch")
          : recoveryPoint,
        actionRequired:
          recoveryPoint.actionRequired || Boolean(inventoryFailure),
        actionReasons: uniqueStrings([
          ...recoveryPoint.actionReasons,
          ...(inventoryFailure ? ["asset_inventory_mismatch"] : []),
        ]),
        integrity: operations.integrity,
        campaignCount: drillStore.state.campaigns.length,
        recordCount: operations.records.total,
        collections: operations.records.collections,
        ...(integrityOk
          ? {}
          : { error: inventoryFailure ?? operations.integrity.result }),
      };
      drillStore.close();
      return result;
    } catch (error) {
      return {
        status: "failed",
        backup,
        checkedAt,
        recoveryPoint,
        actionRequired: true,
        actionReasons: uniqueStrings([
          ...recoveryPoint.actionReasons,
          "restore_drill_failed",
        ]),
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  restoreBackup(
    options: SqliteRestoreBackupOptions,
  ): SqliteRestoreBackupResult {
    this.flush();
    const checkedAt = new Date().toISOString();
    const currentRevision = restoreStateRevision(this.state);
    if (
      options.expectedStateRevision !== undefined &&
      options.expectedStateRevision !== currentRevision
    ) {
      return {
        status: "failed",
        checkedAt,
        actionRequired: true,
        actionReasons: ["restore_state_revision_mismatch"],
        error:
          "Live storage changed after restore confirmation; inspect storage operations and confirm the recovery point again",
      };
    }
    const recoveryFence = captureRestoreRecoveryFence(this.state);
    const drill = this.runRestoreDrill({
      backupFileName: options.backupFileName,
      requireAssetSnapshot: options.requireAssetSnapshot,
      expectedAssetSnapshot: options.expectedAssetSnapshot,
      expectedAssetInventory: options.expectedAssetInventory,
    });
    if (drill.status === "failed" || !drill.backup) return drill;

    const backupPath = join(this.backupDir(), drill.backup.fileName);
    const nonce = randomBytes(8).toString("hex");
    const stagedPath = `${this.filePath}.restore-${nonce}.stage`;
    const rollbackPath = `${this.filePath}.restore-${nonce}.rollback`;
    let intent: SqliteRestoreIntent = {
      schemaVersion: 1,
      databaseFileName: basename(this.filePath),
      backupFileName: drill.backup.fileName,
      nonce,
      phase: "preparing",
      expectedStateRevision: currentRevision,
      createdAt: checkedAt,
      updatedAt: checkedAt,
    };
    let intentCreated = false;
    try {
      appendRestoreIntent(this.filePath, intent, true);
      intentCreated = true;
      this.options.restoreFaultInjector?.("after_intent_recorded");
      copyFileSync(backupPath, stagedPath);
      fsyncFile(stagedPath);
      fsyncDirectory(dirname(this.filePath));
      intent = advanceRestoreIntent(this.filePath, intent, "staged");
      this.options.restoreFaultInjector?.("after_stage");
    } catch (error) {
      if (intentCreated) {
        cleanupRestoreArtifacts(this.filePath, stagedPath, rollbackPath);
      } else {
        rmSync(stagedPath, { force: true });
        rmSync(rollbackPath, { force: true });
      }
      return restoreSwapFailure(drill, error, "restore_staging_failed");
    }

    let databaseClosed = false;
    let liveRenamed = false;
    let reconciliation: SqliteRestoreReconciliation | undefined;
    try {
      this.db.close();
      databaseClosed = true;
      renameSync(this.filePath, rollbackPath);
      liveRenamed = true;
      fsyncDirectory(dirname(this.filePath));
      intent = advanceRestoreIntent(this.filePath, intent, "live_renamed");
      this.options.restoreFaultInjector?.("after_live_renamed");
      renameSync(stagedPath, this.filePath);
      fsyncDirectory(dirname(this.filePath));
      intent = advanceRestoreIntent(
        this.filePath,
        intent,
        "candidate_promoted",
      );
      this.options.restoreFaultInjector?.("after_candidate_promoted");
      this.db = new DatabaseSync(this.filePath);
      databaseClosed = false;
      intent = advanceRestoreIntent(this.filePath, intent, "candidate_opened");
      this.options.restoreFaultInjector?.("after_candidate_open");
      this.migrate();
      intent = advanceRestoreIntent(
        this.filePath,
        intent,
        "candidate_migrated",
      );
      this.options.restoreFaultInjector?.("after_candidate_migrate");
      this.state = this.load();
      intent = advanceRestoreIntent(this.filePath, intent, "candidate_loaded");
      this.options.restoreFaultInjector?.("after_candidate_load");
      if (options.reconcileSecurityPlane !== false) {
        reconciliation = reconcileRestoredState(
          this.state,
          recoveryFence,
          options.recoveryAdminUserId,
        );
        this.save();
        this.flush();
      }
      intent = advanceRestoreIntent(this.filePath, intent, "reconciled");
      this.options.restoreFaultInjector?.("after_reconciliation");
      const operations = this.storageOperations();
      if (!operations.integrity.ok) {
        throw new Error(
          `Restored SQLite integrity check failed: ${operations.integrity.result}`,
        );
      }
      intent = advanceRestoreIntent(this.filePath, intent, "committed");
      const result: SqliteRestoreBackupResult = {
        status: "passed",
        backup: drill.backup,
        checkedAt: new Date().toISOString(),
        restoredAt: new Date().toISOString(),
        recoveryPoint: drill.recoveryPoint,
        actionRequired: drill.actionRequired,
        actionReasons: drill.actionReasons,
        integrity: operations.integrity,
        campaignCount: this.state.campaigns.length,
        recordCount: operations.records.total,
        collections: operations.records.collections,
        reconciliation,
        ...(options.reason ? { reason: options.reason.slice(0, 160) } : {}),
      };
      try {
        this.options.restoreFaultInjector?.("after_commit_recorded");
        cleanupRestoreArtifacts(this.filePath, stagedPath, rollbackPath);
      } catch {
        return {
          ...result,
          actionRequired: true,
          actionReasons: uniqueStrings([
            ...result.actionReasons,
            "restore_commit_cleanup_pending",
          ]),
        };
      }
      return result;
    } catch (error) {
      const original =
        error instanceof Error ? error : new Error(String(error));
      try {
        if (!databaseClosed) {
          try {
            this.db.close();
          } catch {
            // Continue into the file-level rollback even if candidate close reports an error.
          }
          databaseClosed = true;
        }
        if (liveRenamed) {
          restoreOriginalDatabase(this.filePath, stagedPath, rollbackPath);
        }
        this.db = new DatabaseSync(this.filePath);
        databaseClosed = false;
        this.migrate();
        this.state = this.load();
        if (liveRenamed) {
          intent = advanceRestoreIntent(this.filePath, intent, "rolled_back");
        }
      } catch (rollbackError) {
        throw new Error(
          `SQLite restore failed and live rollback could not be reopened: ${original.message}; ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          { cause: original },
        );
      }
      try {
        if (liveRenamed) {
          this.options.restoreFaultInjector?.("after_rollback_recorded");
        }
        cleanupRestoreArtifacts(this.filePath, stagedPath, rollbackPath);
      } catch (cleanupError) {
        return restoreSwapFailure(
          drill,
          new Error(
            `${original.message}; live rollback completed but durable cleanup is pending: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
            { cause: original },
          ),
          "restore_rollback_cleanup_pending",
        );
      }
      return restoreSwapFailure(drill, original, "restore_swap_rolled_back");
    } finally {
      if (!existsSync(restoreIntentPath(this.filePath))) {
        rmSync(stagedPath, { force: true });
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.writer.close();
    } finally {
      this.db.close();
    }
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
    if (!hasInitialMigration) {
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

    const hasCollectionCreatedIndexMigration = this.db
      .prepare("select version from schema_migrations where version = ?")
      .get(2);
    if (!hasCollectionCreatedIndexMigration) {
      this.db.exec(`
        create index if not exists idx_engine_records_collection_created
          on engine_records (collection, created_at);
        insert into schema_migrations (version, name)
          values (2, 'engine_records_collection_created_index');
      `);
    }
  }

  private load(): EngineState {
    const state = emptyState();
    const rows = this.db
      .prepare(
        `
      select collection, id, campaign_id, created_at, updated_at, data
      from engine_records
      order by collection, id
    `,
      )
      .all() as StoredEngineRecordRow[];
    for (const row of rows) {
      if (!isStateCollection(row.collection)) continue;
      (state[row.collection] as unknown[]).push(JSON.parse(row.data));
    }
    const normalizedState = normalizeEngineState(state);
    this.persistedRecords = new Map(
      rows.map((row) => [
        engineRecordKey(row.collection, row.id),
        {
          collection: row.collection,
          id: row.id,
          campaignId: row.campaign_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          data: row.data,
        },
      ]),
    );
    this.initializeRecordTracking(normalizedState);
    return normalizedState;
  }

  private isEmpty(): boolean {
    return stateCollections.every(
      (collection) => this.state[collection].length === 0,
    );
  }

  private campaignIdForRecord(
    collection: StateCollection,
    record: IdentifiedRecord,
  ): string | null {
    if (record.campaignId) return record.campaignId;
    if (collection === "tokens" && record.sceneId) {
      return (
        this.state.scenes.find((scene) => scene.id === record.sceneId)
          ?.campaignId ?? null
      );
    }
    if (collection === "aiToolCalls" && record.threadId) {
      const thread = this.state.aiThreads.find(
        (item) => item.id === record.threadId,
      );
      return thread?.campaignId ?? null;
    }
    return null;
  }

  private recordsForState(): DesiredEngineRecord[] {
    const records: DesiredEngineRecord[] = [];
    for (const collection of stateCollections) {
      for (const record of this.state[collection] as IdentifiedRecord[]) {
        if (!record || typeof record !== "object") {
          throw new Error(`State record is not an object: ${collection}`);
        }
        const id = stateRecordId(collection, record);
        const persisted = this.persistedRecords.get(
          engineRecordKey(collection, id),
        );
        const tracker = this.trackerForRecord(
          record,
          persisted?.source !== record,
        );
        this.reconcileTrackedValue(record, tracker, true);
        const data =
          !persisted || persisted.source !== record || tracker.dirty
            ? JSON.stringify(record)
            : persisted.data;
        records.push({
          collection,
          id,
          campaignId: this.campaignIdForRecord(collection, record),
          createdAt: record.createdAt ?? null,
          updatedAt: record.updatedAt ?? null,
          data,
          source: record,
          tracker,
        });
      }
    }
    return records;
  }

  private initializeRecordTracking(state: EngineState): void {
    for (const collection of stateCollections) {
      for (const record of state[collection] as IdentifiedRecord[]) {
        if (!record || typeof record !== "object") continue;
        const tracker = this.trackerForRecord(record, false);
        const key = engineRecordKey(
          collection,
          stateRecordId(collection, record),
        );
        const persisted = this.persistedRecords.get(key);
        if (!persisted) {
          tracker.dirty = true;
          continue;
        }
        persisted.source = record;
        tracker.dirty = JSON.stringify(record) !== persisted.data;
      }
    }
  }

  private trackerForRecord(
    record: IdentifiedRecord,
    dirty: boolean,
  ): RecordMutationTracker {
    const existing = this.trackerByRoot.get(record);
    if (existing) {
      if (dirty) existing.dirty = true;
      return existing;
    }
    const tracker: RecordMutationTracker = { root: record, dirty };
    this.trackerByRoot.set(record, tracker);
    this.reconcileTrackedValue(record, tracker, false);
    return tracker;
  }

  /**
   * State records intentionally remain ordinary cloneable objects. Configurable
   * enumerable fields are wrapped with accessors so direct in-memory edits mark
   * only their owning record dirty. The reconciliation pass also notices array
   * length changes and added, deleted, or redefined properties that cannot be
   * observed at assignment time without exposing Proxy instances to callers.
   */
  private reconcileTrackedValue(
    value: unknown,
    tracker: RecordMutationTracker,
    detectChanges: boolean,
    visited: WeakSet<object> = new WeakSet(),
  ): void {
    if (!isTrackableStateValue(value) || visited.has(value)) return;
    visited.add(value);

    let metadata = this.trackedObjects.get(value);
    const existingMetadata = Boolean(metadata);
    if (!metadata) {
      metadata = {
        listeners: new Set(),
        accessors: new Map(),
        ...(Array.isArray(value) ? { arrayLength: value.length } : {}),
      };
      this.trackedObjects.set(value, metadata);
    }
    const wasListening = metadata.listeners.has(tracker);
    metadata.listeners.add(tracker);

    if (
      detectChanges &&
      wasListening &&
      Array.isArray(value) &&
      metadata.arrayLength !== value.length
    ) {
      markTrackedListenersDirty(metadata);
    }
    if (Array.isArray(value)) metadata.arrayLength = value.length;

    const keys = Object.keys(value);
    const keySet = new Set(keys);
    if (detectChanges && wasListening) {
      for (const [key, accessor] of metadata.accessors) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          !keySet.has(key) ||
          descriptor?.get !== accessor.get ||
          descriptor?.set !== accessor.set
        ) {
          markTrackedListenersDirty(metadata);
          metadata.accessors.delete(key);
        }
      }
    }

    for (const key of keys) {
      let descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      const trackedAccessor = metadata.accessors.get(key);
      const stillTracked = Boolean(
        trackedAccessor &&
        descriptor.get === trackedAccessor.get &&
        descriptor.set === trackedAccessor.set,
      );
      if (!stillTracked) {
        if (detectChanges && wasListening && existingMetadata) {
          markTrackedListenersDirty(metadata);
        }
        const installed = this.installTrackedAccessor(
          value,
          key,
          descriptor,
          metadata,
        );
        if (installed)
          descriptor =
            Object.getOwnPropertyDescriptor(value, key) ?? descriptor;
      }
      const nestedValue = descriptor.get
        ? descriptor.get.call(value)
        : "value" in descriptor
          ? descriptor.value
          : undefined;
      this.reconcileTrackedValue(nestedValue, tracker, detectChanges, visited);
    }
  }

  private installTrackedAccessor(
    target: object,
    key: string,
    descriptor: PropertyDescriptor,
    metadata: TrackedObjectMetadata,
  ): boolean {
    if (!descriptor.configurable) return false;

    if ("value" in descriptor) {
      let current = descriptor.value;
      const get = (): unknown => current;
      const set =
        descriptor.writable === false
          ? undefined
          : (next: unknown): void => {
              if (Object.is(current, next)) return;
              current = next;
              markTrackedListenersDirty(metadata);
              for (const listener of metadata.listeners) {
                this.reconcileTrackedValue(next, listener, false);
              }
            };
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get,
        ...(set ? { set } : {}),
      });
      metadata.accessors.set(key, { get, set });
      return true;
    }

    const originalGet = descriptor.get;
    const originalSet = descriptor.set;
    const store = this;
    const get = originalGet
      ? function (this: object): unknown {
          return originalGet.call(this);
        }
      : undefined;
    const set = originalSet
      ? function (this: object, next: unknown): void {
          const previous = originalGet?.call(this);
          originalSet.call(this, next);
          const current = originalGet?.call(this);
          if (Object.is(previous, current)) return;
          markTrackedListenersDirty(metadata);
          for (const listener of metadata.listeners) {
            store.reconcileTrackedValue(current, listener, false);
          }
        }
      : undefined;
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: descriptor.enumerable,
      ...(get ? { get } : {}),
      ...(set ? { set } : {}),
    });
    metadata.accessors.set(key, { get, set });
    return true;
  }

  private backupDir(): string {
    return resolve(dirname(this.filePath), "backups");
  }

  private latestBackup(): SqliteBackupSummary | undefined {
    return this.managedBackupSummaries()[0];
  }

  private managedBackupSummaries(): SqliteBackupSummary[] {
    return this.backupSummaries().filter((backup) =>
      managedBackupFileName(backup.fileName),
    );
  }

  private backupSummaries(): SqliteBackupSummary[] {
    const backupDir = this.backupDir();
    if (!existsSync(backupDir)) return [];
    return readdirSync(backupDir)
      .filter((fileName) => fileName.endsWith(".sqlite"))
      .map((fileName) => this.backupSummary(fileName))
      .filter((summary): summary is SqliteBackupSummary => Boolean(summary))
      .sort((left, right) => right.fileName.localeCompare(left.fileName));
  }

  private backupRetentionCount(): number {
    const environmentValue =
      process.env.OTTE_SQLITE_BACKUP_RETENTION_COUNT?.trim();
    const configured =
      this.options.backupRetentionCount ??
      (environmentValue ? Number(environmentValue) : undefined);
    if (configured === undefined || !Number.isFinite(configured)) return 30;
    return Math.max(1, Math.min(365, Math.floor(configured)));
  }

  private pruneBackups(): string[] {
    const expired = this.managedBackupSummaries().slice(
      this.backupRetentionCount(),
    );
    for (const backup of expired) {
      rmSync(join(this.backupDir(), backup.fileName), { force: true });
      rmSync(this.recoveryManifestPath(backup.fileName), { force: true });
    }
    return expired.map((backup) => backup.fileName);
  }

  private backupByFileName(fileName: string): SqliteBackupSummary | undefined {
    const safeFileName = basename(fileName);
    if (safeFileName !== fileName || !safeFileName.endsWith(".sqlite"))
      return undefined;
    return this.backupSummary(safeFileName);
  }

  private backupSummary(fileName: string): SqliteBackupSummary | undefined {
    const path = join(this.backupDir(), fileName);
    if (!existsSync(path)) return undefined;
    const stats = statSync(path);
    const manifestRead = this.readRecoveryManifest(fileName);
    return {
      fileName,
      sizeBytes: stats.size,
      createdAt:
        manifestRead.status === "present"
          ? manifestRead.envelope.recoveryPoint.createdAt
          : stats.birthtime.toISOString(),
      recoveryPoint: recoveryPointSummary(fileName, manifestRead),
    };
  }

  private recoveryManifestPath(fileName: string): string {
    return join(this.backupDir(), `${fileName}.recovery.json`);
  }

  private readRecoveryManifest(fileName: string): RecoveryManifestReadResult {
    const path = this.recoveryManifestPath(fileName);
    if (!existsSync(path)) return { status: "missing" };
    try {
      if (statSync(path).size > 1024 * 1024)
        return {
          status: "invalid",
          error: "Recovery manifest exceeds the 1 MiB limit",
        };
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const envelope = parseRecoveryManifestEnvelope(parsed);
      if (!envelope)
        return {
          status: "invalid",
          error: "Recovery manifest is not a supported versioned manifest",
        };
      if (
        sha256Text(JSON.stringify(envelope.recoveryPoint)) !==
        envelope.manifestChecksum
      ) {
        return {
          status: "invalid",
          error: "Recovery manifest checksum does not match its recovery point",
        };
      }
      return { status: "present", envelope };
    } catch (error) {
      return {
        status: "invalid",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

type RecoveryManifestReadResult =
  | { status: "missing" }
  | { status: "invalid"; error: string }
  | { status: "present"; envelope: SqliteRecoveryManifestEnvelope };

function isStateCollection(value: string): value is StateCollection {
  return (stateCollections as readonly string[]).includes(value);
}

function managedBackupFileName(fileName: string): boolean {
  return /^opentabletop-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.sqlite$/.test(
    fileName,
  );
}

function assertAssetSnapshotOptions(options: SqliteBackupOptions): void {
  if (options.requireAssetSnapshot && !options.assetSnapshot) {
    throw new Error(
      "An operator-created asset snapshot identity is required for strict recovery-point backup",
    );
  }
  if (options.assetSnapshot && !options.assetProvider) {
    throw new Error(
      "The active asset provider is required when recording an asset snapshot identity",
    );
  }
  if (
    options.assetSnapshot &&
    options.assetProvider !== options.assetSnapshot.provider
  ) {
    throw new Error(
      "Asset snapshot provider must exactly match the active asset provider",
    );
  }
  if (
    options.assetSnapshot &&
    !validAssetSnapshotIdentity(options.assetSnapshot)
  ) {
    throw new Error("Asset snapshot identity is invalid");
  }
}

export function assetMetadataInventory(
  state: EngineState,
  provider: SqliteAssetMetadataInventory["provider"],
): SqliteAssetMetadataInventory {
  return assetMetadataInventoryForAssets(state.assets, provider);
}

export function assetMetadataInventoryForAssets(
  sourceAssets: readonly MapAsset[],
  provider: SqliteAssetMetadataInventory["provider"],
): SqliteAssetMetadataInventory {
  const assets = [...sourceAssets]
    .sort(
      (left, right) =>
        left.campaignId.localeCompare(right.campaignId) ||
        left.id.localeCompare(right.id),
    )
    .map((asset) => ({
      id: asset.id,
      campaignId: asset.campaignId,
      url: asset.url,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksum: asset.checksum ?? null,
      storage: asset.storage
        ? {
            provider: asset.storage.provider,
            bucket: asset.storage.bucket ?? null,
            key: asset.storage.key,
          }
        : null,
      lifecycle: asset.lifecycle
        ? {
            status: asset.lifecycle.status,
            expiresAt: asset.lifecycle.expiresAt ?? null,
            storageDeletedAt: asset.lifecycle.storageDeletedAt ?? null,
          }
        : null,
      renditions: [...(asset.renditions ?? [])]
        .sort(
          (left, right) =>
            left.kind.localeCompare(right.kind) ||
            left.checksum.localeCompare(right.checksum),
        )
        .map((rendition) => ({
          kind: rendition.kind,
          mimeType: rendition.mimeType,
          sizeBytes: rendition.sizeBytes,
          checksum: rendition.checksum,
          width: rendition.width,
          height: rendition.height,
          storage: {
            provider: rendition.storage.provider,
            bucket: rendition.storage.bucket ?? null,
            key: rendition.storage.key,
          },
        })),
    }));
  return {
    provider,
    assetCount: assets.length,
    objectCount: assets.reduce(
      (total, asset) => total + 1 + asset.renditions.length,
      0,
    ),
    sizeBytes: assets.reduce(
      (total, asset) =>
        total +
        asset.sizeBytes +
        asset.renditions.reduce(
          (subtotal, rendition) => subtotal + rendition.sizeBytes,
          0,
        ),
      0,
    ),
    digestAlgorithm: "sha256",
    digest: sha256Text(JSON.stringify(assets)),
  };
}

function configuredAssetProvider(): SqliteAssetMetadataInventory["provider"] {
  const configured = process.env.OTTE_ASSET_STORAGE?.trim().toLowerCase();
  if (!configured || configured === "local") return "local";
  if (configured === "s3" || configured === "minio") return "s3";
  return "unknown";
}

function recoveryPointSummary(
  fileName: string,
  read: RecoveryManifestReadResult,
): SqliteRecoveryPointSummary {
  const manifestFileName = `${fileName}.recovery.json`;
  if (read.status === "missing") {
    return {
      manifestFileName,
      manifestStatus: "missing",
      paired: false,
      actionRequired: true,
      actionReasons: ["recovery_manifest_missing", "asset_snapshot_unpaired"],
    };
  }
  if (read.status === "invalid") {
    return {
      manifestFileName,
      manifestStatus: "invalid",
      paired: false,
      actionRequired: true,
      actionReasons: ["recovery_manifest_invalid", "asset_snapshot_unpaired"],
    };
  }
  const manifest = read.envelope.recoveryPoint;
  const paired = Boolean(
    manifest.assetSnapshot &&
    manifest.assetSnapshot.provider === manifest.assetInventory.provider,
  );
  const actionReasons = paired ? [] : ["asset_snapshot_unpaired"];
  return {
    manifestFileName,
    manifestStatus: "present",
    paired,
    actionRequired: actionReasons.length > 0,
    actionReasons,
    manifest,
  };
}

function withRecoveryFailure(
  summary: SqliteRecoveryPointSummary,
  reason: string,
): SqliteRecoveryPointSummary {
  return {
    ...summary,
    actionRequired: true,
    actionReasons: uniqueStrings([...summary.actionReasons, reason]),
  };
}

function validateRecoveryManifestForDrill(
  backup: SqliteBackupSummary,
  backupPath: string,
  read: RecoveryManifestReadResult,
  options: SqliteRestoreDrillOptions,
): { reason: string; error: string } | undefined {
  if (read.status === "invalid") {
    return { reason: "recovery_manifest_invalid", error: read.error };
  }
  if (read.status === "missing") {
    if (options.requireAssetSnapshot || options.expectedAssetSnapshot) {
      return {
        reason: "asset_snapshot_required",
        error:
          "Strict recovery-point validation requires a versioned manifest and paired asset snapshot identity",
      };
    }
    return undefined;
  }

  const manifest = read.envelope.recoveryPoint;
  if (
    manifest.database.fileName !== backup.fileName ||
    manifest.database.sizeBytes !== backup.sizeBytes ||
    manifest.database.checksum !== sha256File(backupPath)
  ) {
    return {
      reason: "database_backup_checksum_mismatch",
      error:
        "SQLite backup identity, size, or SHA-256 checksum does not match the recovery manifest",
    };
  }
  if (options.requireAssetSnapshot && !manifest.assetSnapshot) {
    return {
      reason: "asset_snapshot_required",
      error:
        "Strict recovery-point validation requires an operator-created asset snapshot identity",
    };
  }
  if (
    options.expectedAssetSnapshot &&
    !sameAssetSnapshotIdentity(
      options.expectedAssetSnapshot,
      manifest.assetSnapshot,
    )
  ) {
    return {
      reason: "asset_snapshot_identity_mismatch",
      error:
        "Expected asset snapshot identity does not exactly match the recovery manifest",
    };
  }
  if (
    options.expectedAssetInventory &&
    compareAssetInventories(options.expectedAssetInventory, manifest.assetInventory)
  ) {
    return {
      reason: "asset_snapshot_inventory_mismatch",
      error: "Paired asset snapshot inventory does not exactly match the SQLite recovery manifest",
    };
  }
  return undefined;
}

function compareAssetInventories(
  expected: SqliteAssetMetadataInventory,
  actual: SqliteAssetMetadataInventory,
): string | undefined {
  if (
    expected.provider !== actual.provider ||
    expected.assetCount !== actual.assetCount ||
    expected.objectCount !== actual.objectCount ||
    expected.sizeBytes !== actual.sizeBytes ||
    expected.digest !== actual.digest
  ) {
    return "Restored SQLite asset metadata inventory does not match the recovery manifest count, bytes, or digest";
  }
  return undefined;
}

function parseRecoveryManifestEnvelope(
  value: unknown,
): SqliteRecoveryManifestEnvelope | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.schemaVersion !== 1 ||
    value.checksumAlgorithm !== "sha256" ||
    !isSha256(value.manifestChecksum)
  )
    return undefined;
  const recoveryPoint = parseRecoveryPoint(value.recoveryPoint);
  if (!recoveryPoint) return undefined;
  return {
    schemaVersion: 1,
    checksumAlgorithm: "sha256",
    manifestChecksum: value.manifestChecksum,
    recoveryPoint,
  };
}

function parseRecoveryPoint(
  value: unknown,
): SqliteRecoveryPointManifest | undefined {
  if (
    !isRecord(value) ||
    value.kind !== "open-tabletop-recovery-point" ||
    value.version !== 1 ||
    !isIsoTimestamp(value.createdAt)
  )
    return undefined;
  if (
    !isRecord(value.database) ||
    typeof value.database.fileName !== "string" ||
    value.database.fileName.length > 255
  )
    return undefined;
  if (
    !nonnegativeSafeInteger(value.database.sizeBytes) ||
    value.database.checksumAlgorithm !== "sha256" ||
    !isSha256(value.database.checksum)
  )
    return undefined;
  const assetInventory = parseAssetInventory(value.assetInventory);
  if (!assetInventory) return undefined;
  const assetSnapshot =
    value.assetSnapshot === undefined
      ? undefined
      : parseAssetSnapshotIdentity(value.assetSnapshot);
  if (value.assetSnapshot !== undefined && !assetSnapshot) return undefined;
  if (assetSnapshot && assetInventory.provider !== assetSnapshot.provider)
    return undefined;
  return {
    kind: "open-tabletop-recovery-point",
    version: 1,
    createdAt: value.createdAt,
    database: {
      fileName: value.database.fileName,
      sizeBytes: value.database.sizeBytes,
      checksumAlgorithm: "sha256",
      checksum: value.database.checksum,
    },
    assetInventory,
    ...(assetSnapshot ? { assetSnapshot } : {}),
  };
}

function parseAssetInventory(
  value: unknown,
): SqliteAssetMetadataInventory | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.provider !== "local" &&
    value.provider !== "s3" &&
    value.provider !== "unknown"
  )
    return undefined;
  if (
    !nonnegativeSafeInteger(value.assetCount) ||
    !nonnegativeSafeInteger(value.objectCount) ||
    !nonnegativeSafeInteger(value.sizeBytes)
  )
    return undefined;
  if (value.digestAlgorithm !== "sha256" || !isSha256(value.digest))
    return undefined;
  return {
    provider: value.provider,
    assetCount: value.assetCount,
    objectCount: value.objectCount,
    sizeBytes: value.sizeBytes,
    digestAlgorithm: "sha256",
    digest: value.digest,
  };
}

function parseAssetSnapshotIdentity(
  value: unknown,
): AssetSnapshotIdentity | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = {
    provider: value.provider,
    snapshotId: value.snapshotId,
    createdAt: value.createdAt,
  };
  return validAssetSnapshotIdentity(candidate)
    ? (candidate as AssetSnapshotIdentity)
    : undefined;
}

function validAssetSnapshotIdentity(value: {
  provider?: unknown;
  snapshotId?: unknown;
  createdAt?: unknown;
}): boolean {
  return (
    (value.provider === "local" || value.provider === "s3") &&
    typeof value.snapshotId === "string" &&
    value.snapshotId.length >= 1 &&
    value.snapshotId.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value.snapshotId) &&
    isIsoTimestamp(value.createdAt)
  );
}

function sameAssetSnapshotIdentity(
  expected: AssetSnapshotIdentity,
  actual: AssetSnapshotIdentity | undefined,
): boolean {
  return Boolean(
    actual &&
    expected.provider === actual.provider &&
    expected.snapshotId === actual.snapshotId &&
    expected.createdAt === actual.createdAt,
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function sqliteTimestampToIso(value: string): string {
  const directTimestamp = Date.parse(value);
  if (
    Number.isFinite(directTimestamp) &&
    new Date(directTimestamp).toISOString() === value
  )
    return value;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    value,
  )
    ? `${value.replace(" ", "T")}Z`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
}

type SqliteRestoreRecoveryFence = Pick<
  EngineState,
  | "users"
  | "sessions"
  | "identities"
  | "scimGroups"
  | "scimGroupRoleMappings"
  | "organizations"
  | "organizationMembers"
  | "invites"
  | "members"
  | "permissionGrants"
  | "systemInstallations"
  | "pluginReviews"
  | "emailOutbox"
  | "campaignWebhooks"
  | "campaignWebhookDeliveries"
  | "jobs"
  | "auditLogs"
> & {
  campaignSecurity: Array<
    Pick<
      EngineState["campaigns"][number],
      "id" | "ownerUserId" | "organizationId" | "visibility"
    >
  >;
};

function captureRestoreRecoveryFence(
  state: EngineState,
): SqliteRestoreRecoveryFence {
  return structuredClone({
    users: state.users,
    sessions: state.sessions,
    identities: state.identities,
    scimGroups: state.scimGroups,
    scimGroupRoleMappings: state.scimGroupRoleMappings,
    organizations: state.organizations,
    organizationMembers: state.organizationMembers,
    invites: state.invites,
    members: state.members,
    permissionGrants: state.permissionGrants,
    systemInstallations: state.systemInstallations,
    pluginReviews: state.pluginReviews,
    emailOutbox: state.emailOutbox,
    campaignWebhooks: state.campaignWebhooks,
    campaignWebhookDeliveries: state.campaignWebhookDeliveries,
    jobs: state.jobs,
    auditLogs: state.auditLogs,
    campaignSecurity: state.campaigns.map((campaign) => ({
      id: campaign.id,
      ownerUserId: campaign.ownerUserId,
      ...(campaign.organizationId
        ? { organizationId: campaign.organizationId }
        : {}),
      visibility: campaign.visibility,
    })),
  });
}

function reconcileRestoredState(
  state: EngineState,
  fence: SqliteRestoreRecoveryFence,
  recoveryAdminUserId: string | undefined,
): SqliteRestoreReconciliation {
  const reconciledAt = new Date().toISOString();
  const restoredCampaignIds = new Set(
    state.campaigns.map((campaign) => campaign.id),
  );
  const liveCampaignSecurity = new Map(
    fence.campaignSecurity.map((campaign) => [campaign.id, campaign]),
  );
  const recoveryOrganizationId = recoveryAdminUserId
    ? (fence.organizations.find(
        (organization) => organization.ownerUserId === recoveryAdminUserId,
      )?.id ??
      fence.organizationMembers.find(
        (member) =>
          member.userId === recoveryAdminUserId &&
          (member.role === "owner" || member.role === "admin"),
      )?.organizationId)
    : undefined;
  const backupOnlyCampaignIds = new Set<string>();
  for (const campaign of state.campaigns) {
    const live = liveCampaignSecurity.get(campaign.id);
    if (live) {
      campaign.ownerUserId = live.ownerUserId;
      campaign.visibility = live.visibility;
      if (live.organizationId) campaign.organizationId = live.organizationId;
      else delete campaign.organizationId;
      continue;
    }
    if (!recoveryAdminUserId) continue;
    backupOnlyCampaignIds.add(campaign.id);
    campaign.ownerUserId = recoveryAdminUserId;
    campaign.visibility = "private";
    if (recoveryOrganizationId)
      campaign.organizationId = recoveryOrganizationId;
    else delete campaign.organizationId;
  }

  const backupPendingEmailIds = state.emailOutbox
    .filter((message) => message.status === "pending")
    .map((message) => message.id);
  const backupEnabledWebhookIds = state.campaignWebhooks
    .filter((webhook) => webhook.enabled)
    .map((webhook) => webhook.id);
  const backupQueuedDeliveryIds = state.campaignWebhookDeliveries
    .filter((delivery) => delivery.status === "queued")
    .map((delivery) => delivery.id);
  const backupActiveJobIds = state.jobs
    .filter((job) => job.status === "queued" || job.status === "running")
    .map((job) => job.id);
  const oauthStatesCleared = state.oauthStates.length;
  const passwordResetTokensCleared = state.passwordResetTokens.length;
  const idempotencyRecordsCleared = state.idempotencyRecords.length;

  state.users = structuredClone(fence.users);
  state.sessions = structuredClone(fence.sessions);
  state.identities = structuredClone(fence.identities);
  state.oauthStates = [];
  state.passwordResetTokens = [];
  state.scimGroups = structuredClone(fence.scimGroups);
  state.scimGroupRoleMappings = structuredClone(fence.scimGroupRoleMappings);
  state.organizations = structuredClone(fence.organizations);
  state.organizationMembers = structuredClone(fence.organizationMembers);
  state.invites = structuredClone(fence.invites).filter((invite) =>
    restoredCampaignIds.has(invite.campaignId),
  );
  state.members = structuredClone(fence.members).filter((member) =>
    restoredCampaignIds.has(member.campaignId),
  );
  if (recoveryAdminUserId) {
    for (const campaignId of backupOnlyCampaignIds) {
      if (
        state.members.some(
          (member) =>
            member.campaignId === campaignId &&
            member.userId === recoveryAdminUserId,
        )
      )
        continue;
      state.members.push({
        id: `mem_recovery_${sha256Text(`${campaignId}\n${recoveryAdminUserId}`).slice(0, 24)}`,
        campaignId,
        userId: recoveryAdminUserId,
        role: "owner",
        createdAt: reconciledAt,
        updatedAt: reconciledAt,
      });
    }
  }
  state.permissionGrants = structuredClone(fence.permissionGrants).filter(
    (grant) => restoredCampaignIds.has(grant.campaignId),
  );
  state.systemInstallations = structuredClone(fence.systemInstallations);
  state.pluginReviews = structuredClone(fence.pluginReviews);
  state.auditLogs = structuredClone(fence.auditLogs);
  state.emailOutbox = structuredClone(fence.emailOutbox).map((message) =>
    message.status === "pending"
      ? {
          ...message,
          status: "failed" as const,
          error: "quarantined_by_storage_restore",
          updatedAt: reconciledAt,
        }
      : message,
  );
  state.campaignWebhooks = structuredClone(fence.campaignWebhooks)
    .filter((webhook) => restoredCampaignIds.has(webhook.campaignId))
    .map((webhook) =>
      webhook.enabled
        ? { ...webhook, enabled: false, updatedAt: reconciledAt }
        : webhook,
    );
  state.campaignWebhookDeliveries = structuredClone(
    fence.campaignWebhookDeliveries,
  )
    .filter((delivery) => restoredCampaignIds.has(delivery.campaignId))
    .map((delivery) =>
      delivery.status === "queued"
        ? {
            ...delivery,
            status: "failed" as const,
            failedAt: reconciledAt,
            errorCode: "quarantined_by_storage_restore",
            updatedAt: reconciledAt,
          }
        : delivery,
    );
  state.jobs = structuredClone(fence.jobs).map((job) => {
    if (job.status !== "queued" && job.status !== "running") return job;
    const {
      leasedBy: _leasedBy,
      leaseExpiresAt: _leaseExpiresAt,
      lastHeartbeatAt: _lastHeartbeatAt,
      dispatchStartedAt: _dispatchStartedAt,
      ...rest
    } = job;
    return {
      ...rest,
      status: "cancelled" as const,
      cancelledAt: reconciledAt,
      cancelledByUserId: recoveryAdminUserId,
      completedAt: reconciledAt,
      error: "quarantined_by_storage_restore",
      updatedAt: reconciledAt,
      logs: [
        ...job.logs,
        {
          at: reconciledAt,
          level: "warning" as const,
          message:
            "Job cancelled by destructive storage restore recovery fence",
        },
      ],
    };
  });
  state.idempotencyRecords = [];

  return {
    policy: "preserve-live-security-plane",
    usersPreserved: state.users.length,
    sessionsPreserved: state.sessions.length,
    oauthStatesCleared,
    passwordResetTokensCleared,
    invitesPreserved: state.invites.length,
    pendingEmailsQuarantined: new Set([
      ...backupPendingEmailIds,
      ...fence.emailOutbox
        .filter((message) => message.status === "pending")
        .map((message) => message.id),
    ]).size,
    webhooksDisabled: new Set([
      ...backupEnabledWebhookIds,
      ...fence.campaignWebhooks
        .filter((webhook) => webhook.enabled)
        .map((webhook) => webhook.id),
    ]).size,
    pendingWebhookDeliveriesQuarantined: new Set([
      ...backupQueuedDeliveryIds,
      ...fence.campaignWebhookDeliveries
        .filter((delivery) => delivery.status === "queued")
        .map((delivery) => delivery.id),
    ]).size,
    jobsCancelled: new Set([
      ...backupActiveJobIds,
      ...fence.jobs
        .filter((job) => job.status === "queued" || job.status === "running")
        .map((job) => job.id),
    ]).size,
    idempotencyRecordsCleared,
    backupOnlyCampaignsAssignedToRecoveryAdmin: backupOnlyCampaignIds.size,
  };
}

export function restoreStateRevision(state: EngineState): string {
  const normalized = normalizeEngineState(
    JSON.parse(JSON.stringify(state)) as EngineState,
  );
  const { auditLogs: _auditLogs, sessions, ...primaryState } = normalized;
  const canonicalSessions = sessions.map(
    ({ lastSeenAt: _lastSeenAt, updatedAt: _updatedAt, ...securityFields }) =>
      securityFields,
  );
  const canonicalState = Object.fromEntries(
    Object.entries({ ...primaryState, sessions: canonicalSessions }).map(
      ([collection, records]) => [
        collection,
        [...records].sort((left, right) =>
          stableJson(left).localeCompare(stableJson(right)),
        ),
      ],
    ),
  );
  return `sha256:${sha256Text(stableJson(canonicalState))}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => (entry === undefined ? "null" : stableJson(entry)))
      .join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const forwardRestoreIntentPhases = [
  "preparing",
  "staged",
  "live_renamed",
  "candidate_promoted",
  "candidate_opened",
  "candidate_migrated",
  "candidate_loaded",
  "reconciled",
  "committed",
] as const satisfies ReadonlyArray<SqliteRestoreIntentPhase>;
const restoreIntentPhases = new Set<SqliteRestoreIntentPhase>([
  ...forwardRestoreIntentPhases,
  "rolled_back",
]);

function restoreIntentPath(filePath: string): string {
  return `${filePath}.restore-intent.jsonl`;
}

function appendRestoreIntent(
  filePath: string,
  intent: SqliteRestoreIntent,
  create: boolean,
): void {
  const path = restoreIntentPath(filePath);
  writeFileSync(path, `${JSON.stringify(intent)}\n`, {
    encoding: "utf8",
    flag: create ? "wx" : "a",
  });
  fsyncFile(path);
  fsyncDirectory(dirname(filePath));
}

function advanceRestoreIntent(
  filePath: string,
  intent: SqliteRestoreIntent,
  phase: SqliteRestoreIntentPhase,
): SqliteRestoreIntent {
  const next = { ...intent, phase, updatedAt: new Date().toISOString() };
  appendRestoreIntent(filePath, next, false);
  return next;
}

function readRestoreIntent(filePath: string): SqliteRestoreIntent | undefined {
  const path = restoreIntentPath(filePath);
  if (!existsSync(path)) return undefined;
  if (statSync(path).size > 256 * 1024)
    throw new Error(
      "SQLite restore intent journal exceeds the 256 KiB safety limit",
    );
  const content = readFileSync(path, "utf8");
  const lines = content.split("\n");
  let intent: SqliteRestoreIntent | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const trailingPartialWrite =
        index === lines.length - 1 && !content.endsWith("\n");
      if (trailingPartialWrite && intent) break;
      throw new Error(
        `SQLite restore intent journal is invalid at entry ${index + 1}`,
        { cause: error },
      );
    }
    const next = parseRestoreIntent(parsed, filePath);
    if (!next)
      throw new Error(
        `SQLite restore intent journal has an unsupported entry at line ${index + 1}`,
      );
    if (!intent && next.phase !== "preparing") {
      throw new Error(
        "SQLite restore intent journal must begin at the preparing phase",
      );
    }
    if (
      intent &&
      (next.nonce !== intent.nonce ||
        next.createdAt !== intent.createdAt ||
        next.backupFileName !== intent.backupFileName ||
        next.expectedStateRevision !== intent.expectedStateRevision)
    ) {
      throw new Error(
        "SQLite restore intent journal changes immutable restore identity fields",
      );
    }
    if (intent && !validRestoreIntentTransition(intent.phase, next.phase)) {
      throw new Error(
        `SQLite restore intent journal has an invalid ${intent.phase} -> ${next.phase} transition`,
      );
    }
    intent = next;
  }
  if (!intent)
    throw new Error("SQLite restore intent journal contains no durable entry");
  return intent;
}

function parseRestoreIntent(
  value: unknown,
  filePath: string,
): SqliteRestoreIntent | undefined {
  if (!isRecord(value)) return undefined;
  const phase =
    typeof value.phase === "string" &&
    restoreIntentPhases.has(value.phase as SqliteRestoreIntentPhase)
      ? (value.phase as SqliteRestoreIntentPhase)
      : undefined;
  if (
    value.schemaVersion !== 1 ||
    value.databaseFileName !== basename(filePath) ||
    typeof value.backupFileName !== "string" ||
    basename(value.backupFileName) !== value.backupFileName ||
    !value.backupFileName.endsWith(".sqlite") ||
    typeof value.nonce !== "string" ||
    !/^[a-f0-9]{16}$/.test(value.nonce) ||
    !phase ||
    typeof value.expectedStateRevision !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.expectedStateRevision) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt)
  )
    return undefined;
  return {
    schemaVersion: 1,
    databaseFileName: value.databaseFileName,
    backupFileName: value.backupFileName,
    nonce: value.nonce,
    phase,
    expectedStateRevision: value.expectedStateRevision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function validRestoreIntentTransition(
  current: SqliteRestoreIntentPhase,
  next: SqliteRestoreIntentPhase,
): boolean {
  if (current === "rolled_back") return false;
  // A commit-line write whose fsync reports failure is not a confirmed commit.
  // If the process remains alive, its durable rollback entry is authoritative.
  if (next === "rolled_back") return true;
  if (current === "committed") return false;
  const currentIndex = forwardRestoreIntentPhases.indexOf(
    current as (typeof forwardRestoreIntentPhases)[number],
  );
  const nextIndex = forwardRestoreIntentPhases.indexOf(
    next as (typeof forwardRestoreIntentPhases)[number],
  );
  return currentIndex >= 0 && nextIndex === currentIndex + 1;
}

function recoverInterruptedRestore(filePath: string): void {
  let intent = readRestoreIntent(filePath);
  if (!intent) return;
  const stagedPath = `${filePath}.restore-${intent.nonce}.stage`;
  const rollbackPath = `${filePath}.restore-${intent.nonce}.rollback`;
  const liveExists = existsSync(filePath);
  const rollbackExists = existsSync(rollbackPath);

  if (intent.phase === "committed") {
    if (!liveExists && rollbackExists) {
      restoreOriginalDatabase(filePath, stagedPath, rollbackPath);
    } else if (!liveExists) {
      throw new Error(
        "Committed SQLite restore recovery found neither the restored database nor its rollback file",
      );
    }
    cleanupRestoreArtifacts(filePath, stagedPath, rollbackPath);
    return;
  }

  if (intent.phase === "rolled_back") {
    if (!liveExists && rollbackExists) {
      restoreOriginalDatabase(filePath, stagedPath, rollbackPath);
    } else if (!liveExists) {
      throw new Error(
        "Rolled-back SQLite restore recovery found neither the live database nor its rollback file",
      );
    }
    cleanupRestoreArtifacts(filePath, stagedPath, rollbackPath);
    return;
  }

  if (rollbackExists) {
    restoreOriginalDatabase(filePath, stagedPath, rollbackPath);
    intent = advanceRestoreIntent(filePath, intent, "rolled_back");
  } else if (
    !liveExists ||
    (intent.phase !== "preparing" && intent.phase !== "staged")
  ) {
    throw new Error(
      `Incomplete SQLite restore at phase ${intent.phase} cannot be rolled back safely`,
    );
  }
  cleanupRestoreArtifacts(filePath, stagedPath, rollbackPath);
}

function restoreOriginalDatabase(
  filePath: string,
  stagedPath: string,
  rollbackPath: string,
): void {
  if (!existsSync(rollbackPath)) {
    throw new Error("SQLite restore rollback file is missing");
  }
  rmSync(stagedPath, { force: true });
  copyFileSync(rollbackPath, stagedPath);
  fsyncFile(stagedPath);
  rmSync(filePath, { force: true });
  renameSync(stagedPath, filePath);
  fsyncDirectory(dirname(filePath));
}

function cleanupRestoreArtifacts(
  filePath: string,
  stagedPath: string,
  rollbackPath: string,
): void {
  rmSync(stagedPath, { force: true });
  rmSync(rollbackPath, { force: true });
  clearRestoreIntent(filePath);
}

function clearRestoreIntent(filePath: string): void {
  rmSync(restoreIntentPath(filePath), { force: true });
  fsyncDirectory(dirname(filePath));
}

function fsyncFile(path: string): void {
  // Windows rejects fsync on a descriptor opened read-only. r+ keeps the
  // descriptor non-mutating while providing the writable handle fsync needs.
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    const code =
      isRecord(error) && typeof error.code === "string" ? error.code : "";
    if (
      !["EPERM", "EACCES", "EINVAL", "EISDIR", "ENOTSUP", "ENOSYS"].includes(
        code,
      )
    )
      throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function restoreSwapFailure(
  drill: SqliteRestoreDrillResult,
  error: unknown,
  reason: string,
): SqliteRestoreBackupResult {
  return {
    status: "failed",
    backup: drill.backup,
    checkedAt: new Date().toISOString(),
    recoveryPoint: drill.recoveryPoint,
    actionRequired: true,
    actionReasons: uniqueStrings([...drill.actionReasons, reason]),
    error: error instanceof Error ? error.message : String(error),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function engineRecordKey(collection: string, id: string): string {
  return JSON.stringify([collection, id]);
}

function isTrackableStateValue(value: unknown): value is object {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    Array.isArray(value) || prototype === Object.prototype || prototype === null
  );
}

function markTrackedListenersDirty(metadata: TrackedObjectMetadata): void {
  for (const listener of metadata.listeners) listener.dirty = true;
}

function stateRecordId(
  collection: StateCollection,
  record: IdentifiedRecord,
): string {
  if (record.id) return record.id;
  if (collection === "idempotencyRecords" && record.key && record.method) {
    return JSON.stringify([record.userId ?? null, record.method, record.key]);
  }
  throw new Error(`State record is missing an id: ${collection}`);
}
