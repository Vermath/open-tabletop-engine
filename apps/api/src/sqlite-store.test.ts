import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyState,
  type Campaign,
  type EngineState,
} from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    installWriteAudit(store);
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("does not rewrite engine records when save is unchanged", () => {
    store.save();

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

  it("updates only the changed engine record", () => {
    const updatedAlpha = {
      ...alphaCampaign,
      name: "Alpha Revised",
      updatedAt: "2026-06-11T00:01:00.000Z",
    };
    store.state.campaigns = [updatedAlpha, betaCampaign];

    store.save();

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

  it("deletes removed engine records without rewriting survivors", () => {
    store.state.campaigns = [alphaCampaign];

    store.save();

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
