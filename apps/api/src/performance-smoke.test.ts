import { performance } from "node:perf_hooks";
import { createTimestamped, type CampaignMember, type ChatMessage, type JournalEntry, type Token, type User } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

describe("performance smoke", () => {
  it("keeps large tabletop reads, exports, compendium lookup, and realtime fanout within smoke budgets", async () => {
    type RealtimeTestSocket = {
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onerror: ((event: unknown) => void) | null;
      close(): void;
    };

    const store = new MemoryStateStore();
    seedLargeCampaignSurface(store);
    const app = await buildApp({ store });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Performance smoke API did not bind to a TCP port");

    const maybeWebSocket = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string[]) => RealtimeTestSocket }).WebSocket;
    if (!maybeWebSocket) throw new Error("WebSocket is not available in this Node runtime");
    const TestWebSocket = maybeWebSocket;
    const clients: Array<Awaited<ReturnType<typeof openRealtimeClient>>> = [];

    try {
      const tokens = await timeRequest("scene token read", 800, () =>
        app.inject({
          method: "GET",
          url: "/api/v1/scenes/scn_vault_entry/tokens",
          headers: gmHeaders
        })
      );
      expect((tokens.json() as unknown[]).length).toBeGreaterThanOrEqual(250);

      const chatExport = await timeRequest("chat history export", 1200, () =>
        app.inject({
          method: "GET",
          url: "/api/v1/campaigns/camp_demo/chat/export",
          headers: gmHeaders
        })
      );
      const chatExportBody = chatExport.json() as { count: number };
      expect(chatExportBody.count).toBeGreaterThanOrEqual(400);

      const compendium = await timeRequest("rules compendium lookup", 800, () =>
        app.inject({
          method: "GET",
          url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium",
          headers: gmHeaders
        })
      );
      const compendiumBody = compendium.json() as { entries: unknown[] };
      expect(compendiumBody.entries.length).toBeGreaterThan(50);

      const campaignExport = await timeRequest("campaign archive export", 1500, () =>
        app.inject({
          method: "GET",
          url: "/api/v1/campaigns/camp_demo/export",
          headers: gmHeaders
        })
      );
      const campaignExportBody = campaignExport.json() as { data: { tokens: unknown[]; chat: unknown[] } };
      expect(campaignExportBody.data.tokens.length).toBeGreaterThanOrEqual(250);
      expect(campaignExportBody.data.chat.length).toBeGreaterThanOrEqual(400);

      for (const userId of ["usr_demo_gm", "usr_demo_player", "usr_perf_player_2", "usr_perf_player_3"]) {
        clients.push(await openRealtimeClient(TestWebSocket, address.port, app, userId));
      }

      const fanoutStarted = performance.now();
      const message = await app.inject({
        method: "POST",
        url: "/api/v1/chat/messages",
        headers: gmHeaders,
        payload: { campaignId: "camp_demo", sceneId: "scn_vault_entry", body: "Performance smoke fanout", visibility: "public" }
      });
      expect(message.statusCode).toBe(200);
      await Promise.all(clients.map((client) => client.waitFor("chat.message.created", message.json().id)));
      expect(performance.now() - fanoutStarted).toBeLessThan(2500);
    } finally {
      clients.forEach((client) => client.close());
      await app.close();
    }
  });
});

describe("performance soak", () => {
  it("keeps repeated large tabletop reads and exports inside soak budgets", async () => {
    const store = new MemoryStateStore();
    seedLargeCampaignSurface(store, { tokenCount: 400, chatCount: 700, journalCount: 120 });
    const app = await buildApp({ store });
    const samples = {
      tokenRead: [] as number[],
      chatExport: [] as number[],
      compendiumLookup: [] as number[],
      campaignExport: [] as number[],
      cycleTotal: [] as number[]
    };

    try {
      for (let cycle = 0; cycle < 6; cycle += 1) {
        const cycleStarted = performance.now();
        const tokenRead = await measureRequest("soak scene token read", () =>
          app.inject({
            method: "GET",
            url: "/api/v1/scenes/scn_vault_entry/tokens",
            headers: gmHeaders
          })
        );
        samples.tokenRead.push(tokenRead.durationMs);
        expect((tokenRead.response.json() as unknown[]).length).toBeGreaterThanOrEqual(400);

        const chatExport = await measureRequest("soak chat history export", () =>
          app.inject({
            method: "GET",
            url: "/api/v1/campaigns/camp_demo/chat/export",
            headers: gmHeaders
          })
        );
        samples.chatExport.push(chatExport.durationMs);
        expect((chatExport.response.json() as { count: number }).count).toBeGreaterThanOrEqual(700);

        const compendium = await measureRequest("soak rules compendium lookup", () =>
          app.inject({
            method: "GET",
            url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium",
            headers: gmHeaders
          })
        );
        samples.compendiumLookup.push(compendium.durationMs);
        expect((compendium.response.json() as { entries: unknown[] }).entries.length).toBeGreaterThan(50);

        const campaignExport = await measureRequest("soak campaign archive export", () =>
          app.inject({
            method: "GET",
            url: "/api/v1/campaigns/camp_demo/export",
            headers: gmHeaders
          })
        );
        samples.campaignExport.push(campaignExport.durationMs);
        const campaignExportBody = campaignExport.response.json() as { data: { tokens: unknown[]; chat: unknown[]; journals: unknown[] } };
        expect(campaignExportBody.data.tokens.length).toBeGreaterThanOrEqual(400);
        expect(campaignExportBody.data.chat.length).toBeGreaterThanOrEqual(700);
        expect(campaignExportBody.data.journals.length).toBeGreaterThanOrEqual(120);

        samples.cycleTotal.push(performance.now() - cycleStarted);
      }

      expect(percentile(samples.tokenRead, 0.95), "soak token read p95").toBeLessThan(1200);
      expect(percentile(samples.chatExport, 0.95), "soak chat export p95").toBeLessThan(1800);
      expect(percentile(samples.compendiumLookup, 0.95), "soak compendium lookup p95").toBeLessThan(1200);
      expect(percentile(samples.campaignExport, 0.95), "soak campaign export p95").toBeLessThan(3000);
      expect(percentile(samples.cycleTotal, 0.95), "soak full cycle p95").toBeLessThan(4500);
    } finally {
      await app.close();
    }
  });
});

async function timeRequest(name: string, maxMs: number, action: () => Promise<{ statusCode: number; json(): unknown }>) {
  const { response, durationMs } = await measureRequest(name, action);
  expect(durationMs, `${name} duration`).toBeLessThan(maxMs);
  return response;
}

async function measureRequest(name: string, action: () => Promise<{ statusCode: number; json(): unknown }>) {
  const started = performance.now();
  const response = await action();
  const durationMs = performance.now() - started;
  expect(response.statusCode, name).toBe(200);
  return { response, durationMs };
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function seedLargeCampaignSurface(
  store: MemoryStateStore,
  options: { tokenCount?: number; chatCount?: number; journalCount?: number } = {}
): void {
  const tokenCount = options.tokenCount ?? 250;
  const chatCount = options.chatCount ?? 400;
  const journalCount = options.journalCount ?? 80;
  const users = [2, 3].map((index) =>
    createTimestamped("usr_perf", {
      id: `usr_perf_player_${index}`,
      displayName: `Performance Player ${index}`,
      email: `performance.player.${index}@example.test`
    }) satisfies User
  );
  const members = users.map((user) =>
    createTimestamped("mem_perf", {
      id: `mem_${user.id}`,
      campaignId: "camp_demo",
      userId: user.id,
      role: "player"
    }) satisfies CampaignMember
  );
  const tokens = Array.from({ length: tokenCount }, (_, index) =>
    createTimestamped("tok_perf", {
      id: `tok_perf_${index}`,
      sceneId: "scn_vault_entry",
      actorId: index % 2 === 0 ? "act_valen" : undefined,
      name: `Perf Token ${index}`,
      x: 80 + (index % 25) * 28,
      y: 120 + Math.floor(index / 25) * 28,
      width: 1,
      height: 1,
      rotation: 0,
      hidden: false,
      locked: false,
      visionEnabled: index % 3 === 0,
      visionRadius: 60,
      disposition: index % 5 === 0 ? "hostile" : "neutral",
      metadata: { smoke: true, index }
    }) satisfies Token
  );

  const chat = Array.from({ length: chatCount }, (_, index) =>
    createTimestamped("msg_perf", {
      id: `msg_perf_${index}`,
      campaignId: "camp_demo",
      sceneId: "scn_vault_entry",
      userId: index % 2 === 0 ? "usr_demo_gm" : "usr_demo_player",
      type: index % 7 === 0 ? "ooc" : "plain",
      body: `Performance smoke chat row ${index}`,
      visibility: "public",
      recipientUserIds: []
    }) satisfies ChatMessage
  );

  const journals = Array.from({ length: journalCount }, (_, index) =>
    createTimestamped("jnl_perf", {
      id: `jnl_perf_${index}`,
      campaignId: "camp_demo",
      title: `Performance Journal ${index}`,
      body: `Performance smoke journal body ${index}`,
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["performance", `batch-${index % 8}`],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm"
    }) satisfies JournalEntry
  );

  store.state.users.push(...users);
  store.state.members.push(...members);
  store.state.tokens.push(...tokens);
  store.state.chat.push(...chat);
  store.state.journals.push(...journals);
  store.save();
}

async function openRealtimeClient(
  TestWebSocket: new (url: string, protocols?: string[]) => {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    close(): void;
  },
  port: number,
  app: Awaited<ReturnType<typeof buildApp>>,
  userId: string
) {
  type RealtimeEventMessage = { type?: string; targetId?: string; payload?: unknown; error?: string };
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { userId }
  });
  expect(login.statusCode).toBe(200);

  const token = login.json().token as string;
  const socket = new TestWebSocket(`ws://127.0.0.1:${port}/api/v1/realtime?campaignId=camp_demo`, ["otte.v1", `otte.auth.${token}`]);
  const messages: RealtimeEventMessage[] = [];
  const waiters: Array<{ predicate: (message: RealtimeEventMessage) => boolean; resolve: (message: RealtimeEventMessage) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = [];

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as RealtimeEventMessage;
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  };

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out opening realtime socket for ${userId}`)), 1500);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Realtime socket error for ${userId}: ${String(event)}`));
    };
  });

  return {
    userId,
    waitFor(type: string, targetId?: string) {
      const existing = messages.find((message) => message.type === type && (!targetId || message.targetId === targetId));
      if (existing) return Promise.resolve(existing);
      return new Promise<RealtimeEventMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}:${targetId ?? ""} for ${userId}`)), 2000);
        waiters.push({
          predicate: (message) => message.type === type && (!targetId || message.targetId === targetId),
          resolve,
          reject,
          timer
        });
      });
    },
    close() {
      socket.close();
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`Realtime client closed for ${userId}`));
      }
    }
  };
}
