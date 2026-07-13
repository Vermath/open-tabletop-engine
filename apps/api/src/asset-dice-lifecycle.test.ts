import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTimestamped,
  type CampaignMember,
  type OrganizationMember,
  type User,
  type UserSession,
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axpRz8AAAAASUVORK5CYII=",
  "base64",
);

describe("asset and dice-macro lifecycle consistency", () => {
  it("audits asset mutations and broadcasts only assets each client can read", async () => {
    const store = new MemoryStateStore();
    seedObserver(store);
    const gm = seedSession(store, "usr_demo_gm");
    const player = seedSession(store, "usr_demo_player");
    const observer = seedSession(store, "usr_lifecycle_observer");
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-asset-lifecycle-"));
    const app = await buildApp({ store, uploadDir });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const gmRealtime = await openRealtime(app, gm.token);
    const playerRealtime = await openRealtime(app, player.token);
    const observerRealtime = await openRealtime(app, observer.token);

    try {
      const detached = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets",
        headers: gmHeaders,
        payload: {
          name: "Detached GM prep map",
          url: "https://assets.example.test/gm-prep.png",
          mimeType: "image/png",
          sizeBytes: 12,
        },
      });
      expect(detached.statusCode).toBe(200);
      const detachedId = detached.json().id as string;
      await gmRealtime.waitFor("asset.created", detachedId);
      await settleRealtime();
      expect(playerRealtime.has("asset.created", detachedId)).toBe(false);
      expect(observerRealtime.has("asset.created", detachedId)).toBe(false);

      const detachedUpdated = await app.inject({
        method: "PATCH",
        url: `/api/v1/assets/${detachedId}`,
        headers: gmHeaders,
        payload: { name: "Renamed detached GM prep map" },
      });
      expect(detachedUpdated.statusCode).toBe(200);
      await gmRealtime.waitFor("asset.updated", detachedId);
      await settleRealtime();
      expect(playerRealtime.has("asset.updated", detachedId)).toBe(false);
      expect(observerRealtime.has("asset.updated", detachedId)).toBe(false);

      const uploaded = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true",
        headers: {
          ...gmHeaders,
          "content-type": "image/png",
          "x-asset-name": "Shared active map.png",
        },
        payload: tinyPng,
      });
      expect(uploaded.statusCode).toBe(200);
      const uploadedId = uploaded.json().asset.id as string;
      await Promise.all([
        gmRealtime.waitFor("asset.created", uploadedId),
        playerRealtime.waitFor("asset.created", uploadedId),
        observerRealtime.waitFor("asset.created", uploadedId),
      ]);

      const renamed = await app.inject({
        method: "PATCH",
        url: `/api/v1/assets/${uploadedId}`,
        headers: gmHeaders,
        payload: { name: "Shared active battle map", tags: ["shared", "active"] },
      });
      expect(renamed.statusCode).toBe(200);
      await Promise.all([
        gmRealtime.waitFor("asset.updated", uploadedId),
        playerRealtime.waitFor("asset.updated", uploadedId),
        observerRealtime.waitFor("asset.updated", uploadedId),
      ]);

      const archived = await app.inject({
        method: "PATCH",
        url: `/api/v1/assets/${uploadedId}/lifecycle`,
        headers: gmHeaders,
        payload: { status: "archived", reason: "Session complete" },
      });
      expect(archived.statusCode).toBe(200);
      await Promise.all([
        gmRealtime.waitFor("asset.updated", uploadedId, 1),
        playerRealtime.waitFor("asset.updated", uploadedId, 1),
        observerRealtime.waitFor("asset.updated", uploadedId, 1),
      ]);

      const deleted = await app.inject({
        method: "PATCH",
        url: `/api/v1/assets/${uploadedId}/lifecycle`,
        headers: gmHeaders,
        payload: { status: "deleted", reason: "Cleanup" },
      });
      expect(deleted.statusCode).toBe(200);
      await Promise.all([
        gmRealtime.waitFor("asset.deleted", uploadedId),
        playerRealtime.waitFor("asset.deleted", uploadedId),
        observerRealtime.waitFor("asset.deleted", uploadedId),
      ]);

      expect(
        store.state.auditLogs
          .filter((entry) => entry.targetId === detachedId)
          .map((entry) => entry.action),
      ).toEqual(["asset.create", "asset.update"]);
      expect(
        store.state.auditLogs
          .filter((entry) => entry.targetId === uploadedId)
          .map((entry) => entry.action),
      ).toEqual([
        "asset.upload",
        "asset.update",
        "asset.lifecycle.update",
        "asset.delete",
      ]);
    } finally {
      gmRealtime.close();
      playerRealtime.close();
      observerRealtime.close();
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("audits dice macros without leaking GM-only macro data", async () => {
    const store = new MemoryStateStore();
    seedObserver(store);
    const gm = seedSession(store, "usr_demo_gm");
    const player = seedSession(store, "usr_demo_player");
    const observer = seedSession(store, "usr_lifecycle_observer");
    const app = await buildApp({ store });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const gmRealtime = await openRealtime(app, gm.token);
    const playerRealtime = await openRealtime(app, player.token);
    const observerRealtime = await openRealtime(app, observer.token);

    try {
      const gmOnly = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/dice-macros",
        headers: gmHeaders,
        payload: { name: "Secret trap damage", formula: "4d6", visibility: "gm_only" },
      });
      expect(gmOnly.statusCode).toBe(200);
      const gmOnlyId = gmOnly.json().id as string;
      await gmRealtime.waitFor("dice.macro.created", gmOnlyId);
      await settleRealtime();
      expect(playerRealtime.has("dice.macro.created", gmOnlyId)).toBe(false);
      expect(observerRealtime.has("dice.macro.created", gmOnlyId)).toBe(false);

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/dice-macros",
        headers: gmHeaders,
        payload: { name: "Shared initiative", formula: "1d20+2", visibility: "public" },
      });
      expect(created.statusCode).toBe(200);
      const macroId = created.json().id as string;
      await Promise.all([
        gmRealtime.waitFor("dice.macro.created", macroId),
        playerRealtime.waitFor("dice.macro.created", macroId),
      ]);
      await settleRealtime();
      expect(observerRealtime.has("dice.macro.created", macroId)).toBe(false);

      const invalidAuditCount = store.state.auditLogs.filter(
        (entry) => entry.targetId === macroId && entry.action === "diceMacro.update",
      ).length;
      const invalid = await app.inject({
        method: "PATCH",
        url: `/api/v1/dice-macros/${macroId}`,
        headers: gmHeaders,
        payload: { name: "Should not persist", formula: "not a dice formula" },
      });
      expect(invalid.statusCode).toBe(400);
      expect(store.state.diceMacros.find((macro) => macro.id === macroId)?.name).toBe("Shared initiative");
      expect(
        store.state.auditLogs.filter(
          (entry) => entry.targetId === macroId && entry.action === "diceMacro.update",
        ),
      ).toHaveLength(invalidAuditCount);
      await settleRealtime();
      expect(gmRealtime.has("dice.macro.updated", macroId)).toBe(false);

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/dice-macros/${macroId}`,
        headers: gmHeaders,
        payload: { formula: "1d20+4" },
      });
      expect(updated.statusCode).toBe(200);
      await Promise.all([
        gmRealtime.waitFor("dice.macro.updated", macroId),
        playerRealtime.waitFor("dice.macro.updated", macroId),
      ]);

      const hidden = await app.inject({
        method: "PATCH",
        url: `/api/v1/dice-macros/${macroId}`,
        headers: gmHeaders,
        payload: { visibility: "gm_only" },
      });
      expect(hidden.statusCode).toBe(200);
      await gmRealtime.waitFor("dice.macro.updated", macroId, 1);
      const tombstone = await playerRealtime.waitFor("dice.macro.deleted", macroId);
      expect(tombstone.payload).toEqual({ id: macroId, campaignId: "camp_demo", redacted: true });
      expect(JSON.stringify(tombstone)).not.toContain("Shared initiative");
      expect(JSON.stringify(tombstone)).not.toContain("1d20+4");

      const playerMessageCount = playerRealtime.messages.length;
      const renamedWhileHidden = await app.inject({
        method: "PATCH",
        url: `/api/v1/dice-macros/${macroId}`,
        headers: gmHeaders,
        payload: { name: "Secret initiative override" },
      });
      expect(renamedWhileHidden.statusCode).toBe(200);
      await gmRealtime.waitFor("dice.macro.updated", macroId, 2);
      await settleRealtime();
      expect(playerRealtime.messages).toHaveLength(playerMessageCount);

      const revealed = await app.inject({
        method: "PATCH",
        url: `/api/v1/dice-macros/${macroId}`,
        headers: gmHeaders,
        payload: { visibility: "public" },
      });
      expect(revealed.statusCode).toBe(200);
      await Promise.all([
        gmRealtime.waitFor("dice.macro.updated", macroId, 3),
        playerRealtime.waitFor("dice.macro.updated", macroId, 1),
      ]);

      const removed = await app.inject({
        method: "DELETE",
        url: `/api/v1/dice-macros/${macroId}`,
        headers: gmHeaders,
      });
      expect(removed.statusCode).toBe(200);
      await Promise.all([
        gmRealtime.waitFor("dice.macro.deleted", macroId),
        playerRealtime.waitFor("dice.macro.deleted", macroId, 1),
      ]);

      expect(
        store.state.auditLogs
          .filter((entry) => entry.targetId === gmOnlyId)
          .map((entry) => entry.action),
      ).toEqual(["diceMacro.create"]);
      expect(
        store.state.auditLogs
          .filter((entry) => entry.targetId === macroId)
          .map((entry) => entry.action),
      ).toEqual([
        "diceMacro.create",
        "diceMacro.update",
        "diceMacro.update",
        "diceMacro.update",
        "diceMacro.update",
        "diceMacro.delete",
      ]);
      expect(observerRealtime.messages.some((message) => message.targetId === macroId)).toBe(false);
    } finally {
      gmRealtime.close();
      playerRealtime.close();
      observerRealtime.close();
      await app.close();
    }
  });

  it("emits the same privacy-filtered lifecycle events for approved proposal changes", async () => {
    const store = new MemoryStateStore();
    seedObserver(store);
    const gm = seedSession(store, "usr_demo_gm");
    const player = seedSession(store, "usr_demo_player");
    const observer = seedSession(store, "usr_lifecycle_observer");
    const app = await buildApp({ store });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const gmRealtime = await openRealtime(app, gm.token);
    const playerRealtime = await openRealtime(app, player.token);
    const observerRealtime = await openRealtime(app, observer.token);

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/proposals",
        headers: gmHeaders,
        payload: {
          title: "Create a prep asset and shared macro",
          summary: "Exercises proposal lifecycle events.",
          changesJson: [
            {
              entity: "asset",
              action: "create",
              data: {
                name: "Proposed detached prep asset",
                url: "https://assets.example.test/proposed-prep.png",
                mimeType: "image/png",
                sizeBytes: 20,
              },
            },
            {
              entity: "diceMacro",
              action: "create",
              data: {
                name: "Proposed shared check",
                formula: "1d20+3",
                visibility: "public",
              },
            },
          ],
        },
      });
      expect(created.statusCode).toBe(200);
      const proposalId = created.json().id as string;
      const assetId = created.json().changesJson[0].data.id as string;
      const macroId = created.json().changesJson[1].data.id as string;

      const approved = await app.inject({
        method: "POST",
        url: `/api/v1/proposals/${proposalId}/approve`,
        headers: gmHeaders,
      });
      expect(approved.statusCode).toBe(200);
      const applied = await app.inject({
        method: "POST",
        url: `/api/v1/proposals/${proposalId}/apply`,
        headers: gmHeaders,
      });
      expect(applied.statusCode).toBe(200);

      await Promise.all([
        gmRealtime.waitFor("asset.created", assetId),
        gmRealtime.waitFor("dice.macro.created", macroId),
        playerRealtime.waitFor("dice.macro.created", macroId),
      ]);
      await settleRealtime();
      expect(playerRealtime.has("asset.created", assetId)).toBe(false);
      expect(observerRealtime.has("asset.created", assetId)).toBe(false);
      expect(observerRealtime.has("dice.macro.created", macroId)).toBe(false);
      expect(
        store.state.auditLogs
          .filter((entry) => entry.targetId === assetId || entry.targetId === macroId)
          .map((entry) => `${entry.targetType}:${entry.action}`),
      ).toEqual(
        expect.arrayContaining([
          "asset:proposal.entity.create",
          "diceMacro:proposal.entity.create",
        ]),
      );
    } finally {
      gmRealtime.close();
      playerRealtime.close();
      observerRealtime.close();
      await app.close();
    }
  });
});

type RealtimeMessage = {
  type?: string;
  targetId?: string;
  payload?: unknown;
};

type RealtimeSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
};

async function openRealtime(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
): Promise<{
  messages: RealtimeMessage[];
  waitFor(type: string, targetId: string, occurrence?: number): Promise<RealtimeMessage>;
  has(type: string, targetId: string): boolean;
  close(): void;
}> {
  const WebSocketConstructor = (
    globalThis as unknown as {
      WebSocket?: new (url: string, protocols?: string[]) => RealtimeSocket;
    }
  ).WebSocket;
  if (!WebSocketConstructor) throw new Error("WebSocket is unavailable in this Node runtime");
  const address = app.server.address() as AddressInfo;
  const socket = new WebSocketConstructor(
    `ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo`,
    ["otte.v1", `otte.auth.${token}`],
  );
  const messages: RealtimeMessage[] = [];
  const waiters: Array<{
    type: string;
    targetId: string;
    occurrence: number;
    resolve(message: RealtimeMessage): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  }> = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as RealtimeMessage;
    messages.push(message);
    for (const waiter of [...waiters]) {
      const matches = messages.filter(
        (candidate) => candidate.type === waiter.type && candidate.targetId === waiter.targetId,
      );
      if (matches.length <= waiter.occurrence) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(matches[waiter.occurrence]!);
    }
  };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening lifecycle realtime socket")), 1_000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Lifecycle realtime socket failed: ${String(event)}`));
    };
  });

  return {
    messages,
    waitFor(type, targetId, occurrence = 0) {
      const matches = messages.filter(
        (message) => message.type === type && message.targetId === targetId,
      );
      if (matches.length > occurrence) return Promise.resolve(matches[occurrence]!);
      return new Promise<RealtimeMessage>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${type}:${targetId}`)),
          1_000,
        );
        waiters.push({ type, targetId, occurrence, resolve, reject, timer });
      });
    },
    has(type, targetId) {
      return messages.some((message) => message.type === type && message.targetId === targetId);
    },
    close() {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Realtime socket closed before the expected lifecycle event"));
      }
      waiters.length = 0;
      socket.close();
    },
  };
}

function seedSession(store: MemoryStateStore, userId: string): { token: string } {
  const token = `ots_lifecycle_${userId}`;
  store.state.sessions.push(
    createTimestamped("sess", {
      id: `sess_lifecycle_${userId}`,
      userId,
      tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}`,
      activeOrganizationId: "org_demo",
      expiresAt: "2099-01-01T00:00:00.000Z",
      lastSeenAt: new Date().toISOString(),
    }) satisfies UserSession,
  );
  return { token };
}

function seedObserver(store: MemoryStateStore): void {
  store.state.users.push(
    createTimestamped("usr", {
      id: "usr_lifecycle_observer",
      displayName: "Lifecycle Observer",
      email: "lifecycle-observer@example.test",
    }) satisfies User,
  );
  store.state.organizationMembers.push(
    createTimestamped("orgmem", {
      id: "orgmem_lifecycle_observer",
      organizationId: "org_demo",
      userId: "usr_lifecycle_observer",
      role: "member" as const,
    }) satisfies OrganizationMember,
  );
  store.state.members.push(
    createTimestamped("mem", {
      id: "mem_lifecycle_observer",
      campaignId: "camp_demo",
      userId: "usr_lifecycle_observer",
      role: "observer" as const,
    }) satisfies CampaignMember,
  );
}

function settleRealtime(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}
