import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CampaignArchive, ChatMessage, RollableTable } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { drawTableEntry, validTableEntries } from "./rollable-tables.js";
import { SqliteStateStore } from "./sqlite-store.js";

const collection = "/api/v1/campaigns/camp_demo/rollable-tables";
const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };
const keyed = (key: string, who = gm) => ({ ...who, "idempotency-key": "tables-" + key });

describe("campaign rollable tables", () => {
  it("assigns every integer ticket exactly once and rejects invalid weights", () => {
    const entries = [{ text: "Common", weight: 3 }, { text: "Rare", weight: 1 }, { text: "Unusual", weight: 2 }];
    const results = Array.from({ length: 6 }, (_, ticket) => drawTableEntry(entries, (total) => { expect(total).toBe(6); return ticket; }).text);
    expect(results).toEqual(["Common", "Common", "Common", "Rare", "Unusual", "Unusual"]);
    for (const weight of [0, -1, 0.5, "2", 10001, Infinity]) expect(validTableEntries([{ text: "item", weight }])).toBe(false);
    expect(validTableEntries([])).toBe(false);
  });

  it("persists exactly one draw across retries and restart, scopes visibility, and round-trips archive references", async () => {
    const dir = mkdtempSync(join(tmpdir(), "otte-tables-"));
    const path = join(dir, "state.sqlite");
    let store = new SqliteStateStore(path, { seedDemo: true });
    let app = await buildApp({ store });
    try {
      const input = { name: "Treasury", category: "loot", visibility: "gm_only", entries: [{ text: "Silver crown", weight: 7 }] };
      expect((await app.inject({ method: "POST", url: collection, headers: gm, payload: input })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url: collection, headers: keyed("player-create", player), payload: input })).statusCode).toBe(403);
      const created = await app.inject({ method: "POST", url: collection, headers: keyed("table-create"), payload: input });
      expect(created.statusCode, created.body).toBe(200);
      const table = created.json<RollableTable>();
      const url = collection + "/" + table.id;
      const draw = (key: string, visibility: string, who = gm) => app.inject({ method: "POST", url: url + "/draw", headers: keyed(key, who), payload: { visibility } });
      expect((await app.inject({ method: "GET", url: collection, headers: player })).json()).toEqual([]);
      expect((await draw("player-hidden", "gm_only", player)).statusCode).toBe(404);
      expect((await draw("public-hidden", "public")).statusCode).toBe(400);
      const responses = await Promise.all([draw("private-draw", "gm_only"), draw("private-draw", "gm_only")]);
      for (const response of responses) expect(response.statusCode, response.body).toBe(200);
      const privateResult = responses[0]!.json<ChatMessage>();
      expect(responses[1]!.json()).toEqual(privateResult);
      expect(privateResult).toMatchObject({ rollableTableId: table.id, body: "Treasury: Silver crown", visibility: "gm_only" });
      const snapshot = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot", headers: player });
      expect(snapshot.json().rollableTables).toEqual([]);
      expect(snapshot.body).not.toContain(privateResult.body);

      await app.close();
      store.close();
      store = new SqliteStateStore(path, { seedDemo: false });
      app = await buildApp({ store });
      expect((await draw("private-draw", "gm_only")).json()).toEqual(privateResult);
      expect(store.state.chat.filter((message) => message.rollableTableId === table.id)).toHaveLength(1);
      store.state.idempotencyRecords = store.state.idempotencyRecords.filter((record) => record.key !== "tables-private-draw");
      const recovered = await draw("private-draw", "gm_only");
      expect(recovered.headers["idempotency-replayed"]).toBe("true");
      expect(recovered.json()).toEqual(privateResult);
      expect(store.state.chat.filter((message) => message.rollableTableId === table.id)).toHaveLength(1);
      const edit = await app.inject({ method: "PATCH", url, headers: keyed("publish"), payload: { visibility: "public", expectedUpdatedAt: table.updatedAt } });
      expect(edit.statusCode, edit.body).toBe(200);
      expect((await app.inject({ method: "PATCH", url, headers: keyed("stale"), payload: { name: "Other", expectedUpdatedAt: table.updatedAt } })).statusCode).toBe(409);
      expect((await draw("player-private", "gm_only", player)).statusCode).toBe(403);
      const publicDraw = await draw("player-public", "public", player);
      expect(publicDraw.statusCode, publicDraw.body).toBe(200);
      expect((await draw("player-public", "gm_only", player)).statusCode).toBe(409);
      const visible = (await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot", headers: player })).json();
      expect(visible.rollableTables).toEqual([edit.json()]);
      expect(visible.chat.map((entry: ChatMessage) => entry.id)).toContain(publicDraw.json().id);
      expect(visible.chat.map((entry: ChatMessage) => entry.id)).not.toContain(privateResult.id);

      const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export?scope=selected_collections&collections=chat", headers: gm });
      expect(exported.statusCode, exported.body).toBe(200);
      const archive = exported.json<CampaignArchive>();
      expect(archive.data.rollableTables).toEqual([edit.json()]);
      const imported = await app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: keyed("table-import"), payload: { archive, regenerateIds: true } });
      expect(imported.statusCode, imported.body).toBe(200);
      const [newCampaign] = imported.json().importedCampaignIds;
      const copy = store.state.rollableTables.find((entry) => entry.campaignId === newCampaign)!;
      expect(copy).toMatchObject({ name: input.name, entries: input.entries, visibility: "public" });
      expect(copy.id).not.toBe(table.id);
      expect(store.state.chat.filter((message) => message.campaignId === newCampaign && message.rollableTableId === copy.id)).toHaveLength(2);
      expect((await app.inject({ method: "POST", url: `/api/v1/campaigns/${newCampaign}/rollable-tables/${table.id}/draw`, headers: keyed("cross-campaign"), payload: { visibility: "public" } })).statusCode).toBe(404);
      const deleted = await app.inject({ method: "DELETE", url: url + "?expectedUpdatedAt=" + encodeURIComponent(edit.json().updatedAt), headers: keyed("table-delete") });
      expect(deleted.statusCode, deleted.body).toBe(200);
      expect((await draw("after-delete", "public", player)).statusCode).toBe(404);
      expect(store.state.chat.find((entry) => entry.id === privateResult.id)).toEqual(privateResult);
      const restoreInput = {
        archive, scope: "selected_collections", collections: ["rollableTables"],
        expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === table.campaignId)!.updatedAt,
      };
      const invalid = structuredClone(restoreInput);
      invalid.archive.data.rollableTables[0]!.entries[0]!.weight = 0;
      expect((await app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: keyed("bad-table-import"), payload: invalid })).statusCode).toBe(400);
      const restored = await app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: keyed("restore-original"), payload: restoreInput });
      expect(restored.statusCode, restored.body).toBe(200);
      expect((await draw("restored-slot", "public", player)).json()).toMatchObject({ rollableTableId: table.id, body: privateResult.body });
    } finally {
      await app.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
