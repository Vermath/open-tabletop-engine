import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseSqliteMaintenanceArgs,
  runSqliteMaintenance
} from "./sqlite-maintenance.js";
import { SqliteStateStore } from "./sqlite-store.js";

const fixturePath = fileURLToPath(new URL("./fixtures/sqlite-schema-v1.sqlite", import.meta.url));

describe("offline SQLite maintenance", () => {
  let directory = "";

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  it("drills and restores a backup without constructing the API application", () => {
    directory = mkdtempSync(join(tmpdir(), "otte-offline-restore-"));
    const databasePath = join(directory, "opentabletop.sqlite");
    copyFileSync(fixturePath, databasePath);

    const store = new SqliteStateStore(databasePath, { seedDemo: false });
    const backup = store.createBackup({ reason: "offline maintenance test" });
    store.state.campaigns[0]!.name = "State written after recovery point";
    store.save();
    store.flush();
    store.close();

    const drill = runSqliteMaintenance(parseSqliteMaintenanceArgs([
      "drill",
      "--database",
      databasePath,
      "--backup",
      backup.fileName
    ]));
    expect(drill).toMatchObject({
      command: "drill",
      databasePath,
      drill: {
        status: "passed",
        campaignCount: 1,
        recoveryPoint: { manifestStatus: "present" }
      }
    });

    expect(() => runSqliteMaintenance(parseSqliteMaintenanceArgs([
      "restore",
      "--database",
      databasePath,
      "--backup",
      backup.fileName,
      "--confirm-file-name",
      "some-other-backup.sqlite"
    ]))).toThrow("exactly match");

    const restored = runSqliteMaintenance(parseSqliteMaintenanceArgs([
      "restore",
      "--database",
      databasePath,
      "--backup",
      backup.fileName,
      "--confirm-file-name",
      backup.fileName,
      "--reason",
      "verified offline restore"
    ]));
    expect(restored).toMatchObject({
      command: "restore",
      restore: { status: "passed", reason: "verified offline restore", campaignCount: 1 }
    });

    const reopened = new SqliteStateStore(databasePath, { seedDemo: false });
    try {
      expect(reopened.state.campaigns[0]!.name).toBe("SQLite schema v1 fixture");
      expect(reopened.storageOperations().migrations).toMatchObject({
        latestAppliedVersion: 2,
        missingVersions: []
      });
    } finally {
      reopened.close();
    }
  });

  it("requires an explicit database and a complete strict snapshot identity", () => {
    expect(() => parseSqliteMaintenanceArgs(["status"])).toThrow("--database is required");
    expect(() => parseSqliteMaintenanceArgs([
      "drill",
      "--database",
      "storage/opentabletop.sqlite",
      "--require-asset-snapshot",
      "--asset-provider",
      "s3"
    ])).not.toThrow();

    const incomplete = parseSqliteMaintenanceArgs([
      "drill",
      "--database",
      "storage/opentabletop.sqlite",
      "--require-asset-snapshot",
      "--asset-provider",
      "s3"
    ]);
    expect(() => runSqliteMaintenance(incomplete)).toThrow("provider, snapshot id, and created-at together");
  });
});
