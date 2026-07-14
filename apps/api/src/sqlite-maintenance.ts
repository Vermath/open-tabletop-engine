import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  SqliteStateStore,
  type AssetSnapshotIdentity,
  type AssetSnapshotProvider,
  type SqliteBackupResult,
  type SqliteRestoreBackupResult,
  type SqliteRestoreDrillResult,
  type SqliteStorageOperations
} from "./sqlite-store.js";

export type SqliteMaintenanceCommand = "status" | "backup" | "drill" | "restore";

export interface SqliteMaintenanceOptions {
  command: SqliteMaintenanceCommand;
  databasePath: string;
  backupFileName?: string;
  confirmFileName?: string;
  reason?: string;
  requireAssetSnapshot?: boolean;
  assetProvider?: AssetSnapshotProvider;
  assetSnapshotId?: string;
  assetSnapshotCreatedAt?: string;
}

export type SqliteMaintenanceResult =
  | { command: "status"; databasePath: string; operations: SqliteStorageOperations }
  | { command: "backup"; databasePath: string; backup: SqliteBackupResult }
  | { command: "drill"; databasePath: string; drill: SqliteRestoreDrillResult }
  | { command: "restore"; databasePath: string; restore: SqliteRestoreBackupResult };

export const sqliteMaintenanceHelp = `Usage:
  pnpm --filter @open-tabletop/api storage:maintenance -- status --database <sqlite-path>
  pnpm --filter @open-tabletop/api storage:maintenance -- backup --database <sqlite-path> [--reason <text>]
  pnpm --filter @open-tabletop/api storage:maintenance -- drill --database <sqlite-path> [--backup <file>]
  pnpm --filter @open-tabletop/api storage:maintenance -- restore --database <sqlite-path> --backup <file> --confirm-file-name <same-file>

Strict asset-paired backup/drill/restore options:
  --require-asset-snapshot
  --asset-provider <local|s3>
  --asset-snapshot-id <provider-snapshot-id>
  --asset-snapshot-created-at <ISO-8601-time>

The restore command operates directly on SQLite and does not call the API. Stop
the API, workers, and scheduled jobs first. The exact --confirm-file-name match
prevents restoring a different recovery point than the one just drilled.`;

export function parseSqliteMaintenanceArgs(argv: string[]): SqliteMaintenanceOptions {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const command = args.shift();
  if (!isMaintenanceCommand(command)) {
    throw new Error(`Expected one of status, backup, drill, or restore.\n\n${sqliteMaintenanceHelp}`);
  }

  const values = new Map<string, string>();
  let requireAssetSnapshot = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--require-asset-snapshot") {
      requireAssetSnapshot = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    values.set(argument, value);
    index += 1;
  }

  const knownOptions = new Set([
    "--database",
    "--backup",
    "--confirm-file-name",
    "--reason",
    "--asset-provider",
    "--asset-snapshot-id",
    "--asset-snapshot-created-at"
  ]);
  for (const option of values.keys()) {
    if (!knownOptions.has(option)) throw new Error(`Unknown option: ${option}`);
  }

  const databasePath = values.get("--database")?.trim();
  if (!databasePath) throw new Error("--database is required so maintenance cannot target an implicit SQLite file");
  const assetProvider = parseAssetProvider(values.get("--asset-provider"));

  return {
    command,
    databasePath,
    backupFileName: optionalValue(values, "--backup"),
    confirmFileName: optionalValue(values, "--confirm-file-name"),
    reason: optionalValue(values, "--reason"),
    requireAssetSnapshot,
    assetProvider,
    assetSnapshotId: optionalValue(values, "--asset-snapshot-id"),
    assetSnapshotCreatedAt: optionalValue(values, "--asset-snapshot-created-at")
  };
}

export function runSqliteMaintenance(options: SqliteMaintenanceOptions): SqliteMaintenanceResult {
  const databasePath = resolve(options.databasePath);
  validateBackupFileName(options.backupFileName);
  validateStrictSnapshotOptions(options);
  if (!existsSync(databasePath)) {
    throw new Error(`SQLite database does not exist: ${databasePath}`);
  }

  if (options.command === "restore") {
    if (!options.backupFileName) throw new Error("restore requires --backup <file>");
    if (options.confirmFileName !== options.backupFileName) {
      throw new Error("restore requires --confirm-file-name to exactly match --backup");
    }
  }

  const expectedAssetSnapshot = snapshotIdentity(options);
  const store = new SqliteStateStore(databasePath, { seedDemo: false });
  try {
    if (options.command === "status") {
      return { command: "status", databasePath, operations: store.storageOperations() };
    }
    if (options.command === "backup") {
      const backup = store.createBackup({
        reason: options.reason,
        assetProvider: options.assetProvider,
        assetSnapshot: expectedAssetSnapshot,
        requireAssetSnapshot: options.requireAssetSnapshot
      });
      return { command: "backup", databasePath, backup };
    }
    if (options.command === "drill") {
      const drill = store.runRestoreDrill({
        backupFileName: options.backupFileName,
        requireAssetSnapshot: options.requireAssetSnapshot,
        expectedAssetSnapshot
      });
      return { command: "drill", databasePath, drill };
    }
    const restore = store.restoreBackup({
      backupFileName: options.backupFileName!,
      reason: options.reason,
      requireAssetSnapshot: options.requireAssetSnapshot,
      expectedAssetSnapshot,
      expectedStateRevision: store.storageOperations().restoreStateRevision
    });
    return { command: "restore", databasePath, restore };
  } finally {
    store.close();
  }
}

function isMaintenanceCommand(value: string | undefined): value is SqliteMaintenanceCommand {
  return value === "status" || value === "backup" || value === "drill" || value === "restore";
}

function optionalValue(values: Map<string, string>, key: string): string | undefined {
  const value = values.get(key)?.trim();
  return value || undefined;
}

function parseAssetProvider(value: string | undefined): AssetSnapshotProvider | undefined {
  if (value === undefined) return undefined;
  if (value === "local" || value === "s3") return value;
  throw new Error("--asset-provider must be local or s3");
}

function validateBackupFileName(fileName: string | undefined): void {
  if (!fileName) return;
  if (basename(fileName) !== fileName || !fileName.endsWith(".sqlite")) {
    throw new Error("--backup must be a SQLite filename from the database backup directory, not a path");
  }
}

function validateStrictSnapshotOptions(options: SqliteMaintenanceOptions): void {
  const supplied = [options.assetProvider, options.assetSnapshotId, options.assetSnapshotCreatedAt].filter(Boolean).length;
  if (supplied !== 0 && supplied !== 3) {
    throw new Error("asset snapshot confirmation requires provider, snapshot id, and created-at together");
  }
  if (options.requireAssetSnapshot && supplied !== 3) {
    throw new Error("--require-asset-snapshot requires the complete asset snapshot identity");
  }
}

function snapshotIdentity(options: SqliteMaintenanceOptions): AssetSnapshotIdentity | undefined {
  if (!options.assetProvider || !options.assetSnapshotId || !options.assetSnapshotCreatedAt) return undefined;
  return {
    provider: options.assetProvider,
    snapshotId: options.assetSnapshotId,
    createdAt: options.assetSnapshotCreatedAt
  };
}
