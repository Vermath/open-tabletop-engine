import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTimestamped, type EngineState, type Token, type TokenMoveBatchResult } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadPluginRegistry } from "./plugin-runtime.js";
import { MemoryStateStore } from "./store.js";

const sceneId = "scn_vault_entry";
const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

class OneShotFlushFailureStore extends MemoryStateStore {
  private failNextFlush = true;
  private pending = false;
  persisted: EngineState;

  constructor() {
    super();
    this.persisted = structuredClone(this.state);
  }

  override save(): void {
    this.pending = true;
  }

  override flush(): void {
    if (!this.pending) return;
    if (this.failNextFlush) {
      this.failNextFlush = false;
      throw new Error("simulated atomic token move persistence failure");
    }
    this.persisted = structuredClone(this.state);
    this.pending = false;
  }
}

function addToken(store: MemoryStateStore, input: { id: string; ownerUserIds: string[]; x: number; y: number }): Token {
  const token = createTimestamped("tok", {
    id: input.id,
    sceneId,
    name: input.id,
    x: input.x,
    y: input.y,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player" as const,
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 120,
    disposition: "friendly" as const,
    ownerUserIds: input.ownerUserIds,
    notes: "",
    conditions: [],
    auras: [],
    targetedByUserIds: [],
    metadata: {},
  }) satisfies Token;
  store.state.tokens.push(token);
  return token;
}

function move(token: Token, x: number, y: number) {
  return { tokenId: token.id, x, y, expectedUpdatedAt: token.updatedAt };
}

function batch(store: MemoryStateStore, changes: ReturnType<typeof move>[]) {
  const scene = store.state.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error("Atomic token move test scene is missing");
  return { expectedSceneUpdatedAt: scene.updatedAt, changes };
}

describe("atomic scene token movement", () => {
  it("commits every validated move with one shared revision and audit record", async () => {
    const store = new MemoryStateStore();
    const first = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const second = addToken(store, { id: "tok_atomic_second", ownerUserIds: ["usr_demo_player"], x: 360, y: 350 });
    const initial = [first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }));
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-success" },
        payload: batch(store, [move(first, 425, 450), move(second, 475, 450)]),
      });

      expect(response.statusCode).toBe(200);
      const result = response.json() as TokenMoveBatchResult;
      expect(result.tokens.map((token) => ({ id: token.id, x: token.x, y: token.y }))).toEqual([
        { id: first.id, x: 425, y: 450 },
        { id: second.id, x: 475, y: 450 },
      ]);
      expect(result.tokens.every((token) => token.updatedAt === result.movedAt)).toBe(true);
      expect(result.undo.expectedSceneUpdatedAt).toBe(store.state.scenes.find((scene) => scene.id === sceneId)!.updatedAt);
      expect(result.undo.changes).toEqual([
        { tokenId: first.id, x: beforePosition(first.id).x, y: beforePosition(first.id).y, expectedUpdatedAt: result.movedAt },
        { tokenId: second.id, x: 360, y: 350, expectedUpdatedAt: result.movedAt },
      ]);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(1);

      const replay = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-success" },
        payload: batch(store, [moveFromRevision(first, 425, 450, beforePosition(first.id).updatedAt), moveFromRevision(second, 475, 450, beforePosition(second.id).updatedAt)]),
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(response.json());
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(1);

      const undone = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-undo" },
        payload: result.undo,
      });
      expect(undone.statusCode).toBe(200);
      expect([first, second].map((token) => ({ id: token.id, x: token.x, y: token.y }))).toEqual([
        { id: first.id, x: beforePosition(first.id).x, y: beforePosition(first.id).y },
        { id: second.id, x: 360, y: 350 },
      ]);
    } finally {
      await app.close();
    }

    function beforePosition(tokenId: string) {
      const position = initial.find((candidate) => candidate.id === tokenId);
      if (!position) throw new Error(`Missing initial token position: ${tokenId}`);
      return position;
    }
  });

  it("rejects a stale member before mutating any token in the batch", async () => {
    const store = new MemoryStateStore();
    const first = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const second = addToken(store, { id: "tok_atomic_stale", ownerUserIds: ["usr_demo_player"], x: 360, y: 350 });
    const before = [first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }));
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-stale" },
        payload: {
          expectedSceneUpdatedAt: store.state.scenes.find((scene) => scene.id === sceneId)!.updatedAt,
          changes: [
            move(first, 500, 500),
            { ...move(second, 550, 500), expectedUpdatedAt: "2020-01-01T00:00:00.000Z" },
          ],
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "stale_write", resourceType: "token", resourceId: second.id });
      expect([first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual(before);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects a stale scene revision before mutating any token", async () => {
    const store = new MemoryStateStore();
    const first = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const second = addToken(store, { id: "tok_atomic_stale_scene", ownerUserIds: ["usr_demo_player"], x: 360, y: 350 });
    const before = [first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }));
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-stale-scene" },
        payload: {
          expectedSceneUpdatedAt: "2020-01-01T00:00:00.000Z",
          changes: [move(first, 525, 500), move(second, 575, 500)],
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "stale_write", resourceType: "scene", resourceId: sceneId });
      expect([first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual(before);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects an unowned member before moving an owned token", async () => {
    const store = new MemoryStateStore();
    const owned = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const unowned = addToken(store, { id: "tok_atomic_unowned", ownerUserIds: ["usr_demo_gm"], x: 325, y: 350 });
    const before = { x: owned.x, y: owned.y, updatedAt: owned.updatedAt };
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...playerHeaders, "idempotency-key": "atomic-token-move-unowned" },
        payload: batch(store, [move(owned, 600, 500), move(unowned, 650, 500)]),
      });

      expect([403, 404]).toContain(response.statusCode);
      expect({ x: owned.x, y: owned.y, updatedAt: owned.updatedAt }).toEqual(before);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("executes the same atomic command through a permission-checked plugin bridge", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-token-move-plugin-"));
    const packagePath = join(pluginRoot, "atomic-token-mover");
    mkdirSync(packagePath);
    writeFileSync(join(packagePath, "plugin.manifest.json"), JSON.stringify({
      id: "atomic-token-mover",
      name: "Atomic Token Mover",
      version: "1.0.0",
      compatibleCore: ">=0.3.0",
      entrypoints: { server: "./server.js" },
      runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: ["chat.write", "token.move"],
      chatCommands: [{ command: "/move", description: "Move a reviewed token group atomically" }],
    }));
    writeFileSync(join(packagePath, "server.js"), `
registerCommand("/move", async (input, context) => {
  const command = JSON.parse(input.args);
  const receipt = await context.moveTokens(command.sceneId, command.request);
  return { body: receipt, visibility: "public" };
});
`);
    const store = new MemoryStateStore();
    const first = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const second = addToken(store, { id: "tok_plugin_atomic_second", ownerUserIds: ["usr_demo_player"], x: 360, y: 350 });
    const unowned = addToken(store, { id: "tok_plugin_atomic_unowned", ownerUserIds: ["usr_demo_gm"], x: 410, y: 350 });
    const app = await buildApp({ store, pluginRegistry: loadPluginRegistry({ pluginRoot }) });
    const commandUrl = "/api/v1/campaigns/camp_demo/plugins/atomic-token-mover/chat-command";
    const commandArgs = (changes: ReturnType<typeof move>[], expectedSceneUpdatedAt = store.state.scenes.find((scene) => scene.id === sceneId)!.updatedAt) => JSON.stringify({
      sceneId,
      request: { expectedSceneUpdatedAt, changes },
    });

    try {
      const installed = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/atomic-token-mover/install",
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-install" },
        payload: { permissions: ["chat.write", "token.move"], expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt },
      });
      expect(installed.statusCode).toBe(200);
      expect(installed.json().grant.permissions).toEqual(["chat.write", "token.move"]);

      const response = await app.inject({
        method: "POST",
        url: commandUrl,
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-move" },
        payload: { command: "/move", args: commandArgs([move(first, 425, 450), move(second, 475, 450)]) },
      });

      expect(response.statusCode).toBe(200);
      const receipt = response.json().bridgeReceipts.token_move_1 as string;
      expect(receipt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect([first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual([
        { id: first.id, x: 425, y: 450, updatedAt: receipt },
        { id: second.id, x: 475, y: 450, updatedAt: receipt },
      ]);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toEqual([
        expect.objectContaining({
          actorType: "plugin",
          actorUserId: "atomic-token-mover",
          targetId: sceneId,
          after: expect.objectContaining({ bridgeRequestId: "token_move_1", movedAt: receipt }),
        }),
      ]);

      const replay = await app.inject({
        method: "POST",
        url: commandUrl,
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-move" },
        payload: { command: "/move", args: commandArgs([
          moveFromRevision(first, 425, 450, first.createdAt),
          moveFromRevision(second, 475, 450, second.createdAt),
        ]) },
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(response.json());
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(1);

      const permissionReview = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/atomic-token-mover/install",
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-permission-review" },
        payload: { permissions: ["chat.write"], expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt },
      });
      expect(permissionReview.statusCode).toBe(200);
      const beforeDenied = { x: first.x, y: first.y, updatedAt: first.updatedAt };
      const denied = await app.inject({
        method: "POST",
        url: commandUrl,
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-move-denied" },
        payload: { command: "/move", args: commandArgs([move(first, 600, 500)]) },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().message).toContain("lacks token.move");
      expect({ x: first.x, y: first.y, updatedAt: first.updatedAt }).toEqual(beforeDenied);

      const reinstalled = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/atomic-token-mover/install",
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-reinstall" },
        payload: {
          permissions: ["chat.write", "token.move"],
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
        },
      });
      expect(reinstalled.statusCode).toBe(200);
      const beforeUnowned = [first, unowned].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }));
      const unownedResponse = await app.inject({
        method: "POST",
        url: commandUrl,
        headers: { ...playerHeaders, "idempotency-key": "plugin-atomic-token-move-unowned" },
        payload: { command: "/move", args: commandArgs([move(first, 650, 500), move(unowned, 700, 500)]) },
      });
      expect([403, 404]).toContain(unownedResponse.statusCode);
      expect([first, unowned].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual(beforeUnowned);

      const beforeStale = [first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }));
      const stale = await app.inject({
        method: "POST",
        url: commandUrl,
        headers: { ...gmHeaders, "idempotency-key": "plugin-atomic-token-move-stale" },
        payload: { command: "/move", args: commandArgs([move(first, 725, 500), move(second, 775, 500)], "2020-01-01T00:00:00.000Z") },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", resourceType: "scene", resourceId: sceneId });
      expect([first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual(beforeStale);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(1);
    } finally {
      await app.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("rolls every token and audit row back when the durable flush fails", async () => {
    const store = new OneShotFlushFailureStore();
    const first = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const second = addToken(store, { id: "tok_atomic_durable", ownerUserIds: ["usr_demo_player"], x: 360, y: 350 });
    store.persisted = structuredClone(store.state);
    const before = [first, second].map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }));
    const payload = batch(store, [move(first, 700, 500), move(second, 750, 500)]);
    const app = await buildApp({ store });

    try {
      const failed = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-durable" },
        payload,
      });
      expect(failed.statusCode).toBe(500);
      expect(store.state.tokens.filter((token) => token.id === first.id || token.id === second.id).map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual(before);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(0);
      expect(store.persisted.tokens.filter((token) => token.id === first.id || token.id === second.id).map((token) => ({ id: token.id, x: token.x, y: token.y, updatedAt: token.updatedAt }))).toEqual(before);

      const retry = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-durable" },
        payload,
      });
      expect(retry.statusCode).toBe(200);
      expect(store.state.auditLogs.filter((entry) => entry.action === "token.move.batch")).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("delivers one coherent ordered batch event to another client", async () => {
    const WebSocketConstructor = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string[]) => TestSocket }).WebSocket;
    if (!WebSocketConstructor) throw new Error("WebSocket is unavailable in this Node runtime");
    const store = new MemoryStateStore();
    const first = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const second = addToken(store, { id: "tok_atomic_realtime", ownerUserIds: ["usr_demo_player"], x: 360, y: 350 });
    const app = await buildApp({ store });
    let socket: TestSocket | undefined;

    try {
      const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { userId: "usr_demo_player" } });
      expect(login.statusCode).toBe(200);
      const token = login.json().token as string;
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address() as AddressInfo;
      socket = new WebSocketConstructor(`ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo`, ["otte.v1", `otte.auth.${token}`]);
      await opened(socket);
      const batchEvent = nextMessage(socket, "token.moved.batch");

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${sceneId}/tokens/move`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-token-move-realtime" },
        payload: batch(store, [move(first, 825, 525), move(second, 875, 525)]),
      });
      expect(response.statusCode).toBe(200);
      await expect(batchEvent).resolves.toMatchObject({
        type: "token.moved.batch",
        targetId: sceneId,
        sequence: expect.any(Number),
        payload: {
          sceneId,
          tokens: expect.arrayContaining([
            expect.objectContaining({ id: first.id, x: 825, y: 525 }),
            expect.objectContaining({ id: second.id, x: 875, y: 525 }),
          ]),
        },
      });
    } finally {
      socket?.close();
      await app.close();
    }
  });
});

function moveFromRevision(token: Token, x: number, y: number, expectedUpdatedAt: string) {
  return { tokenId: token.id, x, y, expectedUpdatedAt };
}

interface TestSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

function opened(socket: TestSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening token batch realtime socket")), 2_000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Token batch realtime socket failed: ${String(event)}`));
    };
  });
}

function nextMessage(socket: TestSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2_000);
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (message.type !== type) return;
      clearTimeout(timer);
      resolve(message);
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Token batch realtime socket failed: ${String(event)}`));
    };
  });
}
