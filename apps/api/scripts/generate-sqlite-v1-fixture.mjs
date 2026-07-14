import { existsSync, mkdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = fileURLToPath(new URL("../src/fixtures/sqlite-schema-v1.sqlite", import.meta.url));
const createdAt = "2026-06-01T12:00:00.000Z";

const records = [
  {
    collection: "users",
    id: "usr_sqlite_v1_fixture",
    campaignId: null,
    data: {
      id: "usr_sqlite_v1_fixture",
      displayName: "SQLite V1 Fixture GM",
      email: "sqlite-v1-fixture@example.test",
      serverAdmin: true,
      createdAt,
      updatedAt: createdAt
    }
  },
  {
    collection: "campaigns",
    id: "camp_sqlite_v1_fixture",
    campaignId: "camp_sqlite_v1_fixture",
    data: {
      id: "camp_sqlite_v1_fixture",
      ownerUserId: "usr_sqlite_v1_fixture",
      name: "SQLite schema v1 fixture",
      description: "Checked-in N-1 migration fixture.",
      defaultSystemId: "dnd-5e-srd",
      visibility: "private",
      createdAt,
      updatedAt: createdAt
    }
  },
  {
    collection: "members",
    id: "mem_sqlite_v1_fixture",
    campaignId: "camp_sqlite_v1_fixture",
    data: {
      id: "mem_sqlite_v1_fixture",
      campaignId: "camp_sqlite_v1_fixture",
      userId: "usr_sqlite_v1_fixture",
      role: "owner",
      createdAt,
      updatedAt: createdAt
    }
  },
  {
    collection: "scenes",
    id: "scn_sqlite_v1_fixture",
    campaignId: "camp_sqlite_v1_fixture",
    data: {
      id: "scn_sqlite_v1_fixture",
      campaignId: "camp_sqlite_v1_fixture",
      name: "V1 migration room",
      width: 960,
      height: 640,
      gridType: "square",
      gridSize: 40,
      active: true,
      sortOrder: 0,
      fog: [],
      walls: [],
      lights: [],
      annotations: [],
      metadata: { fixtureSchemaVersion: 1 },
      createdAt,
      updatedAt: createdAt
    }
  }
];

mkdirSync(dirname(fixturePath), { recursive: true });
if (existsSync(fixturePath)) rmSync(fixturePath);

const database = new DatabaseSync(fixturePath);
try {
  database.exec(`
    pragma page_size = 4096;
    pragma journal_mode = delete;
    create table schema_migrations (
      version integer primary key,
      name text not null,
      applied_at text not null default current_timestamp
    );
    create table engine_records (
      collection text not null,
      id text not null,
      campaign_id text,
      created_at text,
      updated_at text,
      data text not null,
      primary key (collection, id)
    );
    create index idx_engine_records_campaign
      on engine_records (campaign_id, collection);
    create index idx_engine_records_updated
      on engine_records (updated_at);
  `);
  database
    .prepare("insert into schema_migrations (version, name, applied_at) values (?, ?, ?)")
    .run(1, "engine_records", createdAt);
  const insertRecord = database.prepare(`
    insert into engine_records (collection, id, campaign_id, created_at, updated_at, data)
    values (?, ?, ?, ?, ?, ?)
  `);
  for (const record of records) {
    insertRecord.run(
      record.collection,
      record.id,
      record.campaignId,
      createdAt,
      createdAt,
      JSON.stringify(record.data)
    );
  }
  database.exec("vacuum;");
} finally {
  database.close();
}

console.log(fixturePath);
