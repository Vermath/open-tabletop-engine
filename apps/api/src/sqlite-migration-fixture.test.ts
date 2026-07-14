import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteStateStore } from "./sqlite-store.js";

const fixturePath = fileURLToPath(new URL("./fixtures/sqlite-schema-v1.sqlite", import.meta.url));

describe("SQLite N-1 migration fixture", () => {
  let directory = "";

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  it("migrates the checked-in schema-v1 database to schema v2 without losing data", () => {
    directory = mkdtempSync(join(tmpdir(), "otte-sqlite-v1-fixture-"));
    const databasePath = join(directory, "opentabletop.sqlite");
    copyFileSync(fixturePath, databasePath);

    const store = new SqliteStateStore(databasePath, { seedDemo: false });
    try {
      expect(store.state.campaigns).toEqual([
        expect.objectContaining({
          id: "camp_sqlite_v1_fixture",
          name: "SQLite schema v1 fixture"
        })
      ]);
      expect(store.state.scenes).toEqual([
        expect.objectContaining({
          id: "scn_sqlite_v1_fixture",
          difficultTerrain: [],
          coverOverrides: []
        })
      ]);
      expect(store.storageOperations()).toMatchObject({
        migrations: {
          expectedVersions: [1, 2],
          latestAppliedVersion: 2,
          missingVersions: [],
          applied: [
            expect.objectContaining({ version: 1, name: "engine_records" }),
            expect.objectContaining({ version: 2, name: "engine_records_collection_created_index" })
          ]
        },
        indexes: {
          required: expect.arrayContaining(["idx_engine_records_collection_created"]),
          missing: []
        },
        integrity: { ok: true }
      });

      const campaign = store.state.campaigns[0]!;
      campaign.name = "Migrated and persisted";
      campaign.updatedAt = "2026-07-13T12:00:00.000Z";
      store.save();
      store.flush();
    } finally {
      store.close();
    }

    const reopened = new SqliteStateStore(databasePath, { seedDemo: false });
    try {
      expect(reopened.state.campaigns[0]).toMatchObject({
        id: "camp_sqlite_v1_fixture",
        name: "Migrated and persisted"
      });
      expect(reopened.storageOperations().migrations).toMatchObject({
        latestAppliedVersion: 2,
        missingVersions: []
      });
    } finally {
      reopened.close();
    }
  });
});
