import { scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTimestamped, type Actor, type WorldRecord, type WorldRelation } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const realtimePassword = "world-graph-realtime-password";

function seedRealtimePassword(store: MemoryStateStore, userId: string): { email: string; password: string } {
  const user = store.state.users.find((candidate) => candidate.id === userId);
  if (!user?.email) throw new Error(`Missing seeded user email for ${userId}`);
  const salt = `world-graph-${userId}`;
  user.passwordHash = `scrypt:${salt}:${scryptSync(realtimePassword, salt, 32).toString("base64url")}`;
  user.passwordResetRequired = false;
  user.mfa = undefined;
  return { email: user.email, password: realtimePassword };
}

function graphRecord(overrides: Partial<WorldRecord> & Pick<WorldRecord, "id">): WorldRecord {
  const now = "2026-07-13T12:00:00.000Z";
  return {
    campaignId: "camp_demo",
    kind: "npc",
    name: overrides.id,
    summary: "",
    description: "",
    lifecycle: "active",
    visibility: "public",
    tags: [],
    metadata: {},
    createdByUserId: "usr_demo_gm",
    updatedByUserId: "usr_demo_gm",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function graphRelation(overrides: Partial<WorldRelation> & Pick<WorldRelation, "id" | "sourceRecordId" | "targetRecordId">): WorldRelation {
  const now = "2026-07-13T12:00:00.000Z";
  return {
    campaignId: "camp_demo",
    type: "related_to",
    visibility: "public",
    createdByUserId: "usr_demo_gm",
    updatedByUserId: "usr_demo_gm",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("world graph security and mutation contracts", () => {
  it("bounds metadata, owns provenance, replays create, and rejects stale updates", async () => {
    const store = new MemoryStateStore();
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const app = await buildApp({ store });
    const route = "/api/v1/campaigns/camp_demo/world-records";

    try {
      const oversized = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "world-record-oversized-metadata" },
        payload: {
          kind: "npc",
          name: "Oversized",
          metadata: { text: "x".repeat(17 * 1024) },
          expectedCampaignUpdatedAt: campaign.updatedAt,
        },
      });
      expect(oversized.statusCode).toBe(400);
      expect(store.state.worldRecords).toHaveLength(0);

      const payload = {
        kind: "npc",
        name: "Ledger Keeper",
        summary: "Tracks the vault records.",
        visibility: "gm_only",
        metadata: { rank: 3, office: "archive" },
        expectedCampaignUpdatedAt: campaign.updatedAt,
        // These are deliberately outside the accepted mutation shape. The
        // server, never the caller, owns attribution and lifecycle evidence.
        createdByUserId: "usr_demo_player",
        updatedByUserId: "usr_demo_player",
        resolvedAt: "2000-01-01T00:00:00.000Z",
      };
      const headers = { ...gmHeaders, "idempotency-key": "world-record-create-ledger-keeper" };
      const forgedProvenance = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "world-record-forged-provenance" },
        payload,
      });
      expect(forgedProvenance.statusCode).toBe(400);
      const { createdByUserId: _createdByUserId, updatedByUserId: _updatedByUserId, resolvedAt: _resolvedAt, ...cleanPayload } = payload;
      const created = await app.inject({ method: "POST", url: route, headers, payload: cleanPayload });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toEqual(expect.objectContaining({
        name: "Ledger Keeper",
        createdByUserId: "usr_demo_gm",
        updatedByUserId: "usr_demo_gm",
      }));
      expect(created.json().resolvedAt).toBeUndefined();

      const replay = await app.inject({ method: "POST", url: route, headers, payload: cleanPayload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(created.json());
      expect(store.state.worldRecords.filter((record) => record.name === "Ledger Keeper")).toHaveLength(1);

      const reviewedAt = created.json().updatedAt as string;
      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/world-records/${created.json().id}`,
        headers: { ...gmHeaders, "idempotency-key": "world-record-update-ledger-keeper" },
        payload: { summary: "First accepted edit", expectedUpdatedAt: reviewedAt },
      });
      expect(updated.statusCode).toBe(200);

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/world-records/${created.json().id}`,
        headers: { ...gmHeaders, "idempotency-key": "world-record-stale-ledger-keeper" },
        payload: { summary: "Stale edit", expectedUpdatedAt: reviewedAt },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({ code: "stale_write", resourceType: "world_record" }));
      expect(store.state.worldRecords.find((record) => record.id === created.json().id)?.summary).toBe("First accepted edit");
    } finally {
      await app.close();
    }
  });

  it("does not disclose public edges whose endpoints include GM-only records", async () => {
    const store = new MemoryStateStore();
    store.state.worldRecords.push(
      graphRecord({ id: "wrec_public_one", name: "Public one" }),
      graphRecord({ id: "wrec_public_two", name: "Public two" }),
      graphRecord({ id: "wrec_secret", name: "Secret patron", visibility: "gm_only" }),
    );
    store.state.worldRelations.push(
      graphRelation({ id: "wrel_public_safe", sourceRecordId: "wrec_public_one", targetRecordId: "wrec_public_two" }),
      graphRelation({ id: "wrel_public_leak", sourceRecordId: "wrec_public_one", targetRecordId: "wrec_secret" }),
    );
    const app = await buildApp({ store });

    try {
      const records = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/world-records", headers: playerHeaders });
      expect(records.statusCode).toBe(200);
      expect(records.json().map((record: WorldRecord) => record.id)).toEqual(["wrec_public_one", "wrec_public_two"]);

      const relations = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/world-relations", headers: playerHeaders });
      expect(relations.statusCode).toBe(200);
      expect(relations.json().map((relation: WorldRelation) => relation.id)).toEqual(["wrel_public_safe"]);

      const snapshot = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot", headers: playerHeaders });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json().worldRecords.map((record: WorldRecord) => record.id)).toEqual(["wrec_public_one", "wrec_public_two"]);
      expect(snapshot.json().worldRelations.map((relation: WorldRelation) => relation.id)).toEqual(["wrel_public_safe"]);
      expect(JSON.stringify(snapshot.json())).not.toContain("wrec_secret");
    } finally {
      await app.close();
    }
  });

  it("prevents duplicate edge updates and detaches graph rows when a world is deleted", async () => {
    const store = new MemoryStateStore();
    const timestamp = "2026-07-13T12:00:00.000Z";
    store.state.worlds.push({ id: "world_graph", campaignId: "camp_demo", name: "Graph world", description: "", createdAt: timestamp, updatedAt: timestamp });
    store.state.worldRecords.push(
      graphRecord({ id: "wrec_a", worldId: "world_graph" }),
      graphRecord({ id: "wrec_b", worldId: "world_graph" }),
      graphRecord({ id: "wrec_c", worldId: "world_graph" }),
    );
    store.state.worldRelations.push(
      graphRelation({ id: "wrel_a_b", worldId: "world_graph", sourceRecordId: "wrec_a", targetRecordId: "wrec_b", type: "allied_with" }),
      graphRelation({ id: "wrel_a_c", worldId: "world_graph", sourceRecordId: "wrec_a", targetRecordId: "wrec_c", type: "allied_with" }),
    );
    const app = await buildApp({ store });

    try {
      const duplicate = await app.inject({
        method: "PATCH",
        url: "/api/v1/world-relations/wrel_a_c",
        headers: { ...gmHeaders, "idempotency-key": "world-relation-duplicate-update" },
        payload: { targetRecordId: "wrec_b", expectedUpdatedAt: timestamp },
      });
      expect(duplicate.statusCode).toBe(409);
      expect(store.state.worldRelations.find((relation) => relation.id === "wrel_a_c")?.targetRecordId).toBe("wrec_c");

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/v1/worlds/world_graph?expectedUpdatedAt=${encodeURIComponent(timestamp)}`,
        headers: { ...gmHeaders, "idempotency-key": "world-delete-detach-graph" },
      });
      expect(deleted.statusCode).toBe(200);
      expect(store.state.worldRecords.filter((record) => record.worldId === "world_graph")).toEqual([]);
      expect(store.state.worldRelations.filter((relation) => relation.worldId === "world_graph")).toEqual([]);
      expect(deleted.json().detachedRecords).toEqual(expect.objectContaining({ worldRecords: 3, worldRelations: 2 }));
    } finally {
      await app.close();
    }
  });

  it("keeps graph rows and actor override history in dependency-closed world exports", async () => {
    const store = new MemoryStateStore();
    const timestamp = "2026-07-13T12:00:00.000Z";
    store.state.worlds.push({ id: "world_export_graph", campaignId: "camp_demo", name: "Export graph", description: "", createdAt: timestamp, updatedAt: timestamp });
    store.state.actors.find((actor) => actor.id === "act_valen")!.worldId = "world_export_graph";
    store.state.worldRecords.push(
      graphRecord({ id: "wrec_export_one", worldId: "world_export_graph" }),
      graphRecord({ id: "wrec_export_two", worldId: "world_export_graph" }),
    );
    store.state.worldRelations.push(graphRelation({
      id: "wrel_export",
      worldId: "world_export_graph",
      sourceRecordId: "wrec_export_one",
      targetRecordId: "wrec_export_two",
    }));
    store.state.calculationOverrides.push({
      id: "calc_override_export",
      campaignId: "camp_demo",
      actorId: "act_valen",
      fieldId: "armor-class",
      source: "migration",
      baseValue: 14,
      effectiveValue: 15,
      reason: "Imported historical ruling",
      createdByUserId: "usr_demo_gm",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const app = await buildApp({ store });

    try {
      const exported = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export?scope=world&scopeId=world_export_graph",
        headers: gmHeaders,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.json().data.worldRecords.map((record: WorldRecord) => record.id).sort()).toEqual(["wrec_export_one", "wrec_export_two"]);
      expect(exported.json().data.worldRelations.map((relation: WorldRelation) => relation.id)).toEqual(["wrel_export"]);
      expect(exported.json().data.calculationOverrides.map((override: { id: string }) => override.id)).toEqual(["calc_override_export"]);
    } finally {
      await app.close();
    }
  });

  it("sends players a safe invalidation when a public record becomes GM-only while GMs receive the full event", async () => {
    type RealtimeMessage = { type?: string; targetId?: string; payload?: unknown };
    type RealtimeSocket = {
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onerror: ((event: unknown) => void) | null;
      close(): void;
    };
    const WebSocketConstructor = (globalThis as unknown as {
      WebSocket?: new (url: string, protocols?: string[]) => RealtimeSocket;
    }).WebSocket;
    if (!WebSocketConstructor) throw new Error("WebSocket is unavailable in this Node runtime");

    const store = new MemoryStateStore();
    const secretName = "The patron nobody outside the GM screen may learn";
    const record = graphRecord({ id: "wrec_realtime_visibility", name: secretName });
    store.state.worldRecords.push(record);
    const app = await buildApp({ store });
    const sockets: RealtimeSocket[] = [];

    try {
      const login = async (userId: string): Promise<string> => {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: seedRealtimePassword(store, userId),
        });
        expect(response.statusCode).toBe(200);
        return response.json().token as string;
      };
      const [gmToken, playerToken] = await Promise.all([
        login("usr_demo_gm"),
        login("usr_demo_player"),
      ]);
      await app.listen({ port: 0, host: "127.0.0.1" });
      const address = app.server.address() as AddressInfo;

      const openRealtime = async (token: string) => {
        const socket = new WebSocketConstructor(
          `ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo`,
          ["otte.v1", `otte.auth.${token}`],
        );
        sockets.push(socket);
        const messages: RealtimeMessage[] = [];
        const waiters: Array<{
          predicate: (message: RealtimeMessage) => boolean;
          resolve: (message: RealtimeMessage) => void;
          timer: NodeJS.Timeout;
        }> = [];
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data)) as RealtimeMessage;
          messages.push(message);
          for (const waiter of [...waiters]) {
            if (!waiter.predicate(message)) continue;
            clearTimeout(waiter.timer);
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(message);
          }
        };
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Timed out opening world graph realtime socket")), 2_000);
          socket.onopen = () => {
            clearTimeout(timer);
            resolve();
          };
          socket.onerror = (event) => {
            clearTimeout(timer);
            reject(new Error(`World graph realtime socket failed: ${String(event)}`));
          };
        });
        return {
          waitFor(predicate: (message: RealtimeMessage) => boolean): Promise<RealtimeMessage> {
            const existing = messages.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error(`Timed out waiting for world graph event. Seen: ${JSON.stringify(messages)}`)), 2_000);
              waiters.push({ predicate, resolve, timer });
            });
          },
        };
      };

      const [gmRealtime, playerRealtime] = await Promise.all([
        openRealtime(gmToken),
        openRealtime(playerToken),
      ]);
      const gmEventPromise = gmRealtime.waitFor((message) => message.type === "world.updated");
      const playerEventPromise = playerRealtime.waitFor((message) => message.type === "world.updated");

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/world-records/${record.id}`,
        headers: { ...gmHeaders, "idempotency-key": "world-record-realtime-hide" },
        payload: { visibility: "gm_only", expectedUpdatedAt: record.updatedAt },
      });
      expect(updated.statusCode).toBe(200);

      const [gmEvent, playerEvent] = await Promise.all([gmEventPromise, playerEventPromise]);
      expect(gmEvent).toEqual(expect.objectContaining({
        type: "world.updated",
        targetId: record.id,
        payload: expect.objectContaining({ id: record.id, name: secretName, visibility: "gm_only" }),
      }));
      expect(playerEvent).toEqual(expect.objectContaining({
        type: "world.updated",
        payload: { refreshRequired: true },
      }));
      expect(playerEvent.targetId).toBeUndefined();
      expect(JSON.stringify(playerEvent)).not.toContain(record.id);
      expect(JSON.stringify(playerEvent)).not.toContain(secretName);
    } finally {
      for (const socket of sockets) socket.close();
      await app.close();
    }
  });

  it("restores remapped graph references and override history from an archive and survives a SQLite reopen", async () => {
    const timestamp = "2026-07-13T12:00:00.000Z";
    const sourceStore = new MemoryStateStore();
    sourceStore.state.worlds.push({
      id: "world_archive_roundtrip",
      campaignId: "camp_demo",
      name: "Archive roundtrip world",
      description: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const sourceActor = sourceStore.state.actors.find((actor) => actor.id === "act_valen")!;
    sourceActor.worldId = "world_archive_roundtrip";
    sourceStore.state.worldRecords.push(
      graphRecord({ id: "wrec_roundtrip_npc", worldId: "world_archive_roundtrip", name: "Roundtrip NPC" }),
      graphRecord({ id: "wrec_roundtrip_quest", worldId: "world_archive_roundtrip", kind: "quest", name: "Roundtrip quest" }),
    );
    sourceStore.state.worldRelations.push(graphRelation({
      id: "wrel_roundtrip",
      worldId: "world_archive_roundtrip",
      sourceRecordId: "wrec_roundtrip_npc",
      targetRecordId: "wrec_roundtrip_quest",
      type: "member_of",
    }));
    sourceStore.state.calculationOverrides.push({
      id: "calc_override_roundtrip",
      campaignId: "camp_demo",
      actorId: sourceActor.id,
      fieldId: "armor-class",
      source: "migration",
      baseValue: 14,
      effectiveValue: 16,
      reason: "Historical imported ruling",
      createdByUserId: "usr_demo_gm",
      clearedAt: "2026-07-13T12:30:00.000Z",
      clearedByUserId: "usr_demo_gm",
      clearReason: "Ruling retired after the session",
      createdAt: timestamp,
      updatedAt: "2026-07-13T12:30:00.000Z",
    });
    const sourceApp = await buildApp({ store: sourceStore });
    let archive: unknown;
    try {
      const exported = await sourceApp.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: gmHeaders,
      });
      expect(exported.statusCode).toBe(200);
      archive = exported.json();
    } finally {
      await sourceApp.close();
    }

    const directory = mkdtempSync(join(tmpdir(), "otte-world-graph-roundtrip-"));
    const databasePath = join(directory, "state.sqlite");
    const sqliteStore = new SqliteStateStore(databasePath);
    const targetApp = await buildApp({ store: sqliteStore });
    let copiedCampaignId = "";
    try {
      const imported = await targetApp.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { ...playerHeaders, "idempotency-key": "world-graph-archive-roundtrip" },
        payload: { archive, regenerateIds: true },
      });
      expect(imported.statusCode).toBe(200);
      copiedCampaignId = imported.json().importedCampaignIds[0] as string;
      expect(copiedCampaignId).toBeTruthy();
      expect(copiedCampaignId).not.toBe("camp_demo");
      sqliteStore.flush();
    } finally {
      await targetApp.close();
      sqliteStore.close();
    }

    const reopened = new SqliteStateStore(databasePath, { seedDemo: false });
    try {
      const copiedRecords = reopened.state.worldRecords.filter((record) => record.campaignId === copiedCampaignId);
      expect(copiedRecords).toHaveLength(2);
      expect(copiedRecords.map((record) => record.id)).not.toContain("wrec_roundtrip_npc");
      const copiedRecordIds = new Set(copiedRecords.map((record) => record.id));
      const copiedRelation = reopened.state.worldRelations.find((relation) => relation.campaignId === copiedCampaignId);
      expect(copiedRelation).toBeDefined();
      expect(copiedRecordIds.has(copiedRelation!.sourceRecordId)).toBe(true);
      expect(copiedRecordIds.has(copiedRelation!.targetRecordId)).toBe(true);
      expect(copiedRelation!.sourceRecordId).not.toBe("wrec_roundtrip_npc");
      expect(copiedRelation!.targetRecordId).not.toBe("wrec_roundtrip_quest");
      const copiedActor = reopened.state.actors.find((actor) => actor.campaignId === copiedCampaignId && actor.name === sourceActor.name);
      expect(copiedActor).toBeDefined();
      const copiedOverride = reopened.state.calculationOverrides.find((override) => override.campaignId === copiedCampaignId);
      expect(copiedOverride).toEqual(expect.objectContaining({
        actorId: copiedActor!.id,
        fieldId: "armor-class",
        baseValue: 14,
        effectiveValue: 16,
        reason: "Historical imported ruling",
        clearedByUserId: "usr_demo_gm",
        clearReason: "Ruling retired after the session",
      }));
      expect(copiedOverride!.id).not.toBe("calc_override_roundtrip");
      const copiedWorld = reopened.state.worlds.find((world) => world.campaignId === copiedCampaignId);
      expect(copiedWorld).toBeDefined();
      expect(copiedRecords.every((record) => record.worldId === copiedWorld!.id)).toBe(true);
      expect(copiedRelation!.worldId).toBe(copiedWorld!.id);
      expect(copiedActor!.worldId).toBe(copiedWorld!.id);
    } finally {
      reopened.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("calculation override ledger security and history", () => {
  it("derives provenance, rejects forged sources, and preserves replayable clear history", async () => {
    const store = new MemoryStateStore();
    const actor = createTimestamped("act", {
      id: "act_override_ledger",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_demo_player",
      type: "character" as const,
      name: "Override Ledger Hero",
      data: {
        attributes: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
        armorClass: 15,
        hp: { current: 12, max: 12 },
      },
      permissions: {},
    }) satisfies Actor;
    store.state.actors.push(actor);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/actors/${actor.id}/calculation-overrides`;

    try {
      const explanation = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/calculation-explanation`,
        headers: gmHeaders,
      });
      expect(explanation.statusCode).toBe(200);
      const armorClass = explanation.json().fields.find((field: { id: string }) => field.id === "armor-class");
      expect(armorClass).toEqual(expect.objectContaining({ result: 15 }));

      const forgedSource = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "calculation-override-forged-source" },
        payload: { fieldId: "armor-class", source: "plugin", effectiveValue: 18, reason: "Not actually a plugin", expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(forgedSource.statusCode).toBe(400);
      expect(store.state.calculationOverrides).toEqual([]);

      const playerAttempt = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "calculation-override-player-forgery" },
        payload: { fieldId: "armor-class", source: "gm_manual", effectiveValue: 18, reason: "Pretending to be the GM", expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(playerAttempt.statusCode).toBe(403);

      const payload = {
        fieldId: "armor-class",
        source: "gm_manual",
        effectiveValue: 18,
        reason: "Blessing from the table's documented house rule",
        expectedActorUpdatedAt: actor.updatedAt,
        baseValue: 999,
        createdByUserId: "usr_demo_player",
        clearedAt: "2000-01-01T00:00:00.000Z",
      };
      const headers = { ...gmHeaders, "idempotency-key": "calculation-override-create" };
      const forgedProvenance = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "calculation-override-forged-provenance" },
        payload,
      });
      expect(forgedProvenance.statusCode).toBe(400);
      const { baseValue: _baseValue, createdByUserId: _createdByUserId, clearedAt: _clearedAt, ...cleanPayload } = payload;
      const created = await app.inject({ method: "POST", url: route, headers, payload: cleanPayload });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toEqual(expect.objectContaining({
        actorId: actor.id,
        fieldId: "armor-class",
        source: "gm_manual",
        baseValue: armorClass.result,
        effectiveValue: 18,
        createdByUserId: "usr_demo_gm",
      }));
      expect(created.json().clearedAt).toBeUndefined();

      const replay = await app.inject({ method: "POST", url: route, headers, payload: cleanPayload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(created.json());
      expect(store.state.calculationOverrides).toHaveLength(1);

      const duplicate = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "calculation-override-active-duplicate" },
        payload: { fieldId: "armor-class", source: "house_rule", effectiveValue: 19, reason: "Second active value", expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(duplicate.statusCode).toBe(409);

      const clearPayload = {
        reason: "The temporary ruling expired",
        expectedUpdatedAt: created.json().updatedAt,
        expectedActorUpdatedAt: actor.updatedAt,
      };
      const clearHeaders = { ...gmHeaders, "idempotency-key": "calculation-override-clear" };
      const cleared = await app.inject({
        method: "POST",
        url: `/api/v1/calculation-overrides/${created.json().id}/clear`,
        headers: clearHeaders,
        payload: clearPayload,
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json()).toEqual(expect.objectContaining({
        id: created.json().id,
        clearedByUserId: "usr_demo_gm",
        clearReason: "The temporary ruling expired",
        clearedAt: expect.any(String),
      }));
      expect(store.state.calculationOverrides).toHaveLength(1);

      const clearReplay = await app.inject({
        method: "POST",
        url: `/api/v1/calculation-overrides/${created.json().id}/clear`,
        headers: clearHeaders,
        payload: clearPayload,
      });
      expect(clearReplay.statusCode).toBe(200);
      expect(clearReplay.headers["idempotency-replayed"]).toBe("true");
      expect(clearReplay.json()).toEqual(cleared.json());

      const history = await app.inject({ method: "GET", url: route, headers: playerHeaders });
      expect(history.statusCode).toBe(200);
      expect(history.json()).toEqual([expect.objectContaining({ id: created.json().id, clearedAt: expect.any(String) })]);
    } finally {
      await app.close();
    }
  });
});
