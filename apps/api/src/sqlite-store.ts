import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { emptyState, seedState, type EngineState } from "@open-tabletop/core";
import type { StateStore } from "./store.js";

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
  "encounters",
  "combats",
  "compendia",
  "proposals",
  "aiThreads",
  "aiMemory",
  "aiToolCalls",
  "auditLogs",
  "permissionGrants",
  "pluginStorage",
  "pluginReviews"
] as const satisfies ReadonlyArray<keyof EngineState>;

type StateCollection = (typeof stateCollections)[number];

interface EngineRecordRow {
  collection: StateCollection;
  data: string;
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
  readonly db: SqliteDatabase;
  state: EngineState;

  constructor(private readonly filePath = resolve(process.cwd(), "storage", "opentabletop.sqlite")) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.migrate();
    this.state = this.load();
    if (this.state.campaigns.length === 0) {
      this.state = seedState();
      this.save();
    }
  }

  save(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("delete from engine_records").run();
      const insert = this.db.prepare(`
        insert into engine_records (collection, id, campaign_id, created_at, updated_at, data)
        values (?, ?, ?, ?, ?, ?)
      `);

      for (const collection of stateCollections) {
        const records = this.state[collection] as IdentifiedRecord[];
        for (const record of records) {
          insert.run(
            collection,
            record.id,
            this.campaignIdForRecord(collection, record),
            record.createdAt ?? null,
            record.updatedAt ?? null,
            JSON.stringify(record)
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
}

function isStateCollection(value: string): value is StateCollection {
  return (stateCollections as readonly string[]).includes(value);
}
