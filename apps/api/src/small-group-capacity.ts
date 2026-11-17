import { scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createTimestamped,
  type CampaignMember,
  type ChatMessage,
  type JournalEntry,
  type Token,
  type User,
} from "@open-tabletop/core";
import { buildApp } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";

export interface SmallGroupCapacityEnvelope {
  schemaVersion: "1.0.0";
  id: "single-node-sqlite-small-group";
  claimBoundary: string;
  topology: {
    apiNodes: 1;
    apiWriters: 1;
    stateStore: "sqlite";
    activeCampaigns: 1;
  };
  group: {
    gameMasters: 1;
    players: number;
    realtimeConnections: number;
  };
  campaignSurface: {
    sceneTokens: number;
    chatMessages: number;
    journalEntries: number;
  };
  workload: {
    cycles: number;
    parallelReadsPerCycle: 3;
    sequentialMutationsPerCycle: 2;
    reconnectsPerCycle: 1;
  };
  thresholdsMs: {
    initialConnectP95: number;
    readP95: number;
    mutationP95: number;
    eventFanoutP95: number;
    reconnectP95: number;
    workloadTotal: number;
  };
}

export interface SmallGroupCapacityTimingCheck {
  name:
    | "initial_connect_p95"
    | "read_p95"
    | "mutation_p95"
    | "event_fanout_p95"
    | "reconnect_p95"
    | "workload_total";
  actualMs: number;
  maximumMs: number;
  passed: boolean;
}

export interface SmallGroupCapacityResult {
  schema: "https://open-tabletop-engine.local/schemas/small-group-capacity-result-v1";
  schemaVersion: "1.0.0";
  kind: "small-group-capacity-gate";
  generatedAt: string;
  envelope: SmallGroupCapacityEnvelope;
  transport: {
    rest: "tcp-http";
    realtime: "tcp-websocket";
    bindHost: "127.0.0.1";
  };
  measurements: {
    samples: {
      initialConnections: number;
      reads: number;
      mutations: number;
      eventFanouts: number;
      reconnects: number;
    };
    initialConnectP95Ms: number;
    readP95Ms: number;
    mutationP95Ms: number;
    eventFanoutP95Ms: number;
    reconnectP95Ms: number;
    workloadTotalMs: number;
    sqliteBytes: number;
  };
  verification: {
    observed: {
      sceneTokens: number;
      chatMessages: number;
      journalEntries: number;
    };
    expectedMinimum: {
      sceneTokens: number;
      chatMessages: number;
      journalEntries: number;
    };
    persistedAfterReopen: boolean;
  };
  checks: SmallGroupCapacityTimingCheck[];
  passed: boolean;
  caveat: string;
}

type JsonRequestResult<T> = {
  body: T;
  durationMs: number;
};

type RealtimeMessage = {
  type?: string;
  targetId?: string;
  payload?: unknown;
  error?: string;
};

type RealtimeWaiter = {
  startIndex: number;
  predicate: (message: RealtimeMessage) => boolean;
  resolve: (message: RealtimeMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type CapacityRealtimeClient = {
  userId: string;
  messages: RealtimeMessage[];
  mark(): number;
  waitFor(
    type: string,
    targetId: string,
    startIndex: number,
  ): Promise<RealtimeMessage>;
  close(): Promise<void>;
};

const envelopeUrl = new URL(
  "../../../docs/verification/small-group-capacity-envelope.json",
  import.meta.url,
);
const capacityPassword = "capacity-gate-password-2026";

export function loadSmallGroupCapacityEnvelope(): SmallGroupCapacityEnvelope {
  // Keep the supported boundary machine-readable and outside executable code so
  // release tooling and documentation consume the same fixed workload.
  const raw = JSON.parse(readTextFile(envelopeUrl)) as unknown;
  assertSmallGroupCapacityEnvelope(raw);
  return raw;
}

export async function runSmallGroupCapacityGate(
  envelope = loadSmallGroupCapacityEnvelope(),
): Promise<SmallGroupCapacityResult> {
  assertSmallGroupCapacityEnvelope(envelope);
  const directory = mkdtempSync(join(tmpdir(), "otte-small-group-capacity-"));
  const databasePath = join(directory, "capacity.sqlite");
  const store = new SqliteStateStore(databasePath, { seedDemo: true });
  const clients: CapacityRealtimeClient[] = [];
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let storeClosed = false;

  try {
    seedCapacitySurface(store, envelope);
    store.flush();
    app = await buildApp({ store, requestLogStream: { write() {} } });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Small-group capacity API did not bind to a TCP port");
    }
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
    const userIds = capacityUserIds(envelope);
    const sessionTokens = new Map<string, string>();
    for (const userId of userIds) {
      const user = store.state.users.find(
        (candidate) => candidate.id === userId,
      );
      if (!user?.email)
        throw new Error(`Capacity user ${userId} has no login email`);
      const login = await requestJson<{ token?: string }>(
        baseUrl,
        "/api/v1/auth/login",
        {
          method: "POST",
          body: { email: user.email, password: capacityPassword },
        },
      );
      if (!login.body.token)
        throw new Error(`Capacity login did not return a token for ${userId}`);
      sessionTokens.set(userId, login.body.token);
    }

    const initialConnectionSamples: number[] = [];
    for (const userId of userIds) {
      const token = requiredMapValue(sessionTokens, userId);
      const started = performance.now();
      clients.push(await openRealtimeClient(baseUrl, userId, token));
      initialConnectionSamples.push(performance.now() - started);
    }

    const gmToken = requiredMapValue(sessionTokens, "usr_demo_gm");
    const readSamples: number[] = [];
    const mutationSamples: number[] = [];
    const fanoutSamples: number[] = [];
    const reconnectSamples: number[] = [];
    const workloadStarted = performance.now();
    let observedTokens = 0;
    let observedChat = 0;
    let observedJournals = 0;
    let capacityTokenUpdatedAt = requiredCapacityTokenRevision(store);

    for (let cycle = 0; cycle < envelope.workload.cycles; cycle += 1) {
      const reads = await Promise.all([
        requestJson<unknown[]>(
          baseUrl,
          "/api/v1/scenes/scn_vault_entry/tokens",
          {
            token: gmToken,
          },
        ),
        requestJson<{ count?: number }>(
          baseUrl,
          "/api/v1/campaigns/camp_demo/chat/export",
          {
            token: gmToken,
          },
        ),
        requestJson<{ entries?: unknown[] }>(
          baseUrl,
          "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium",
          { token: gmToken },
        ),
      ]);
      readSamples.push(...reads.map((sample) => sample.durationMs));
      observedTokens = Array.isArray(reads[0].body) ? reads[0].body.length : 0;
      observedChat =
        typeof reads[1].body.count === "number" ? reads[1].body.count : 0;
      if (
        !Array.isArray(reads[2].body.entries) ||
        reads[2].body.entries.length === 0
      ) {
        throw new Error("Capacity compendium read returned no entries");
      }

      const reconnectIndex = 1 + (cycle % envelope.group.players);
      const reconnectUserId = userIds[reconnectIndex];
      if (!reconnectUserId)
        throw new Error(
          `Capacity reconnect user is missing at index ${reconnectIndex}`,
        );
      await clients[reconnectIndex]?.close();
      const reconnectStarted = performance.now();
      clients[reconnectIndex] = await openRealtimeClient(
        baseUrl,
        reconnectUserId,
        requiredMapValue(sessionTokens, reconnectUserId),
      );
      reconnectSamples.push(performance.now() - reconnectStarted);

      const tokenMarks = clients.map((client) => client.mark());
      const tokenFanoutStarted = performance.now();
      const moved = await requestJson<{ id?: string; x?: number; y?: number; updatedAt?: string }>(
        baseUrl,
        "/api/v1/tokens/tok_capacity_0",
        {
          method: "PATCH",
          token: gmToken,
          idempotencyKey: `capacity-token-move-${cycle}`,
          body: { x: 300 + cycle, y: 400 + cycle, expectedUpdatedAt: capacityTokenUpdatedAt },
        },
      );
      mutationSamples.push(moved.durationMs);
      if (moved.body.id !== "tok_capacity_0" || moved.body.x !== 300 + cycle) {
        throw new Error(
          `Capacity token mutation returned an unexpected body in cycle ${cycle}`,
        );
      }
      if (!moved.body.updatedAt) throw new Error(`Capacity token mutation returned no revision in cycle ${cycle}`);
      capacityTokenUpdatedAt = moved.body.updatedAt;
      await Promise.all(
        clients.map((client, index) =>
          client.waitFor(
            "token.moved",
            "tok_capacity_0",
            tokenMarks[index] ?? 0,
          ),
        ),
      );
      fanoutSamples.push(performance.now() - tokenFanoutStarted);

      const chatMarks = clients.map((client) => client.mark());
      const chatFanoutStarted = performance.now();
      const chat = await requestJson<{ id?: string }>(
        baseUrl,
        "/api/v1/chat/messages",
        {
          method: "POST",
          token: gmToken,
          idempotencyKey: `capacity-chat-${cycle}`,
          body: {
            campaignId: "camp_demo",
            sceneId: "scn_vault_entry",
            body: `Capacity gate cycle ${cycle}`,
            visibility: "public",
          },
        },
      );
      mutationSamples.push(chat.durationMs);
      if (!chat.body.id)
        throw new Error(
          `Capacity chat mutation returned no id in cycle ${cycle}`,
        );
      await Promise.all(
        clients.map((client, index) =>
          client.waitFor(
            "chat.message.created",
            chat.body.id!,
            chatMarks[index] ?? 0,
          ),
        ),
      );
      fanoutSamples.push(performance.now() - chatFanoutStarted);
    }

    const workloadTotalMs = performance.now() - workloadStarted;
    const journals = await requestJson<unknown[]>(
      baseUrl,
      "/api/v1/campaigns/camp_demo/journal",
      { token: gmToken },
    );
    observedJournals = Array.isArray(journals.body) ? journals.body.length : 0;

    await closeClients(clients);
    clients.length = 0;
    await app.close();
    app = undefined;
    store.flush();
    store.close();
    storeClosed = true;

    const reopened = new SqliteStateStore(databasePath, { seedDemo: false });
    let persistedAfterReopen = false;
    try {
      const persistedToken = reopened.state.tokens.find(
        (token) => token.id === "tok_capacity_0",
      );
      const persistedChatCount = reopened.state.chat.filter(
        (message) => message.campaignId === "camp_demo",
      ).length;
      persistedAfterReopen =
        persistedToken?.x === 300 + envelope.workload.cycles - 1 &&
        persistedChatCount >=
          envelope.campaignSurface.chatMessages + envelope.workload.cycles;
    } finally {
      reopened.close();
    }

    const measurements = {
      samples: {
        initialConnections: initialConnectionSamples.length,
        reads: readSamples.length,
        mutations: mutationSamples.length,
        eventFanouts: fanoutSamples.length,
        reconnects: reconnectSamples.length,
      },
      initialConnectP95Ms: roundedPercentile(initialConnectionSamples, 0.95),
      readP95Ms: roundedPercentile(readSamples, 0.95),
      mutationP95Ms: roundedPercentile(mutationSamples, 0.95),
      eventFanoutP95Ms: roundedPercentile(fanoutSamples, 0.95),
      reconnectP95Ms: roundedPercentile(reconnectSamples, 0.95),
      workloadTotalMs: roundMs(workloadTotalMs),
      sqliteBytes: statSync(databasePath).size,
    };
    const checks: SmallGroupCapacityTimingCheck[] = [
      timingCheck(
        "initial_connect_p95",
        measurements.initialConnectP95Ms,
        envelope.thresholdsMs.initialConnectP95,
      ),
      timingCheck(
        "read_p95",
        measurements.readP95Ms,
        envelope.thresholdsMs.readP95,
      ),
      timingCheck(
        "mutation_p95",
        measurements.mutationP95Ms,
        envelope.thresholdsMs.mutationP95,
      ),
      timingCheck(
        "event_fanout_p95",
        measurements.eventFanoutP95Ms,
        envelope.thresholdsMs.eventFanoutP95,
      ),
      timingCheck(
        "reconnect_p95",
        measurements.reconnectP95Ms,
        envelope.thresholdsMs.reconnectP95,
      ),
      timingCheck(
        "workload_total",
        measurements.workloadTotalMs,
        envelope.thresholdsMs.workloadTotal,
      ),
    ];
    const dataShapePassed =
      observedTokens >= envelope.campaignSurface.sceneTokens &&
      observedChat >= envelope.campaignSurface.chatMessages &&
      observedJournals >= envelope.campaignSurface.journalEntries;

    return {
      schema:
        "https://open-tabletop-engine.local/schemas/small-group-capacity-result-v1",
      schemaVersion: "1.0.0",
      kind: "small-group-capacity-gate",
      generatedAt: new Date().toISOString(),
      envelope,
      transport: {
        rest: "tcp-http",
        realtime: "tcp-websocket",
        bindHost: "127.0.0.1",
      },
      measurements,
      verification: {
        observed: {
          sceneTokens: observedTokens,
          chatMessages: observedChat,
          journalEntries: observedJournals,
        },
        expectedMinimum: {
          sceneTokens: envelope.campaignSurface.sceneTokens,
          chatMessages: envelope.campaignSurface.chatMessages,
          journalEntries: envelope.campaignSurface.journalEntries,
        },
        persistedAfterReopen,
      },
      checks,
      passed:
        checks.every((check) => check.passed) &&
        dataShapePassed &&
        persistedAfterReopen,
      caveat:
        "This is a deterministic local compatibility gate for the declared single-node/single-writer small-group envelope. It is not a production load observation, hosted-service SLO, or multi-node capacity claim.",
    };
  } finally {
    await closeClients(clients);
    try {
      await app?.close();
    } finally {
      try {
        if (!storeClosed) {
          try {
            store.flush();
          } finally {
            store.close();
          }
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
}

function seedCapacitySurface(
  store: SqliteStateStore,
  envelope: SmallGroupCapacityEnvelope,
): void {
  const extraPlayerCount = Math.max(0, envelope.group.players - 1);
  const users = Array.from({ length: extraPlayerCount }, (_, index) => {
    const number = index + 2;
    return createTimestamped("usr_capacity", {
      id: `usr_capacity_player_${number}`,
      displayName: `Capacity Player ${number}`,
      email: `capacity.player.${number}@example.test`,
    }) satisfies User;
  });
  const members = users.map(
    (user) =>
      createTimestamped("mem_capacity", {
        id: `mem_${user.id}`,
        campaignId: "camp_demo",
        userId: user.id,
        role: "player",
      }) satisfies CampaignMember,
  );
  const tokens = Array.from(
    { length: envelope.campaignSurface.sceneTokens },
    (_, index) =>
      createTimestamped("tok_capacity", {
        id: `tok_capacity_${index}`,
        sceneId: "scn_vault_entry",
        name: `Capacity Token ${index}`,
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
        ...(index === 0 ? { ownerUserIds: capacityUserIds(envelope) } : {}),
        metadata: { capacityGate: true, index },
      }) satisfies Token,
  );
  const chat = Array.from(
    { length: envelope.campaignSurface.chatMessages },
    (_, index) =>
      createTimestamped("msg_capacity", {
        id: `msg_capacity_${index}`,
        campaignId: "camp_demo",
        sceneId: "scn_vault_entry",
        userId: index % 2 === 0 ? "usr_demo_gm" : "usr_demo_player",
        type: index % 7 === 0 ? "ooc" : "plain",
        body: `Capacity gate chat row ${index}`,
        visibility: "public",
        recipientUserIds: [],
      }) satisfies ChatMessage,
  );
  const journals = Array.from(
    { length: envelope.campaignSurface.journalEntries },
    (_, index) =>
      createTimestamped("jnl_capacity", {
        id: `jnl_capacity_${index}`,
        campaignId: "camp_demo",
        title: `Capacity Journal ${index}`,
        body: `Capacity gate journal body ${index}`,
        visibility: "public",
        visibleToUserIds: [],
        visibleToActorIds: [],
        tags: ["capacity", `batch-${index % 8}`],
        createdBy: "usr_demo_gm",
        updatedBy: "usr_demo_gm",
      }) satisfies JournalEntry,
  );

  store.state.users.push(...users);
  store.state.members.push(...members);
  for (const userId of capacityUserIds(envelope)) {
    const user = store.state.users.find((candidate) => candidate.id === userId);
    if (!user) throw new Error(`Seeded capacity user ${userId} is missing`);
    if (!user.email) user.email = `${userId}@example.test`;
    const salt = `capacity-salt-${userId}`;
    user.passwordHash = `scrypt:${salt}:${scryptSync(capacityPassword, salt, 32).toString("base64url")}`;
    user.passwordResetRequired = false;
    user.disabledAt = undefined;
    user.mfa = undefined;
  }
  store.state.tokens = [
    ...store.state.tokens.filter(
      (token) => token.sceneId !== "scn_vault_entry",
    ),
    ...tokens,
  ];
  store.state.chat = [
    ...store.state.chat.filter((message) => message.campaignId !== "camp_demo"),
    ...chat,
  ];
  store.state.journals = [
    ...store.state.journals.filter(
      (journal) => journal.campaignId !== "camp_demo",
    ),
    ...journals,
  ];
  store.save();
}

function capacityUserIds(envelope: SmallGroupCapacityEnvelope): string[] {
  return [
    "usr_demo_gm",
    "usr_demo_player",
    ...Array.from(
      { length: Math.max(0, envelope.group.players - 1) },
      (_, index) => `usr_capacity_player_${index + 2}`,
    ),
  ];
}

function requiredCapacityTokenRevision(store: SqliteStateStore): string {
  const token = store.state.tokens.find((candidate) => candidate.id === "tok_capacity_0");
  if (!token) throw new Error("Capacity token tok_capacity_0 is missing");
  return token.updatedAt;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<JsonRequestResult<T>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(
      `${options.method ?? "GET"} ${path} returned non-JSON ${response.status}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  const durationMs = performance.now() - started;
  return { body: body as T, durationMs };
}

async function openRealtimeClient(
  baseUrl: string,
  userId: string,
  token: string,
): Promise<CapacityRealtimeClient> {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("WebSocket is not available in this Node runtime");
  }
  const socket = new WebSocket(
    `${baseUrl.replace(/^http/, "ws")}/api/v1/realtime?campaignId=camp_demo`,
    ["otte.v1", `otte.auth.${token}`],
  );
  const messages: RealtimeMessage[] = [];
  const waiters: RealtimeWaiter[] = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as RealtimeMessage;
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (messages.length - 1 < waiter.startIndex || !waiter.predicate(message))
        continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  });
  socket.addEventListener("close", () => {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new Error(`Realtime socket closed while waiting for ${userId}`),
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Timed out opening realtime socket for ${userId}`)),
      5_000,
    );
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error(`Realtime socket failed for ${userId}`));
      },
      { once: true },
    );
  });

  return {
    userId,
    messages,
    mark: () => messages.length,
    waitFor(type, targetId, startIndex) {
      const existing = messages
        .slice(startIndex)
        .find(
          (message) => message.type === type && message.targetId === targetId,
        );
      if (existing) return Promise.resolve(existing);
      return new Promise<RealtimeMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          const seen = messages
            .slice(startIndex)
            .map(
              (message) =>
                `${message.type ?? "unknown"}:${message.targetId ?? ""}`,
            )
            .join(", ");
          reject(
            new Error(
              `Timed out waiting for ${type}:${targetId} for ${userId}. Seen: ${seen || "none"}`,
            ),
          );
        }, 6_000);
        waiters.push({
          startIndex,
          predicate: (message) =>
            message.type === type && message.targetId === targetId,
          resolve,
          reject,
          timer,
        });
      });
    },
    async close() {
      if (socket.readyState >= WebSocket.CLOSING) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        socket.addEventListener(
          "close",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        socket.close();
      });
    },
  };
}

async function closeClients(clients: CapacityRealtimeClient[]): Promise<void> {
  await Promise.allSettled(clients.map((client) => client.close()));
}

function timingCheck(
  name: SmallGroupCapacityTimingCheck["name"],
  actualMs: number,
  maximumMs: number,
): SmallGroupCapacityTimingCheck {
  return { name, actualMs, maximumMs, passed: actualMs <= maximumMs };
}

function roundedPercentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return roundMs(sorted[index] ?? 0);
}

function roundMs(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function requiredMapValue(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) throw new Error(`Missing capacity session token for ${key}`);
  return value;
}

function assertSmallGroupCapacityEnvelope(
  value: unknown,
): asserts value is SmallGroupCapacityEnvelope {
  if (!isRecord(value)) throw new Error("Capacity envelope must be an object");
  if (
    value.schemaVersion !== "1.0.0" ||
    value.id !== "single-node-sqlite-small-group"
  ) {
    throw new Error("Capacity envelope schemaVersion or id is unsupported");
  }
  if (
    typeof value.claimBoundary !== "string" ||
    value.claimBoundary.length < 20
  ) {
    throw new Error("Capacity envelope must declare its claim boundary");
  }
  if (
    !isRecord(value.topology) ||
    value.topology.apiNodes !== 1 ||
    value.topology.apiWriters !== 1
  ) {
    throw new Error(
      "Capacity envelope must remain single-node and single-writer",
    );
  }
  if (
    value.topology.stateStore !== "sqlite" ||
    value.topology.activeCampaigns !== 1
  ) {
    throw new Error("Capacity envelope must use one active SQLite campaign");
  }
  if (!isRecord(value.group) || !isPositiveInteger(value.group.players)) {
    throw new Error("Capacity envelope players must be a positive integer");
  }
  if (
    value.group.gameMasters !== 1 ||
    value.group.realtimeConnections !== value.group.players + 1
  ) {
    throw new Error(
      "Capacity envelope realtime connections must equal one GM plus players",
    );
  }
  if (
    !isRecord(value.campaignSurface) ||
    !isPositiveInteger(value.campaignSurface.sceneTokens) ||
    !isPositiveInteger(value.campaignSurface.chatMessages) ||
    !isPositiveInteger(value.campaignSurface.journalEntries)
  ) {
    throw new Error(
      "Capacity envelope campaign surface counts must be positive integers",
    );
  }
  if (
    !isRecord(value.workload) ||
    !isPositiveInteger(value.workload.cycles) ||
    value.workload.parallelReadsPerCycle !== 3 ||
    value.workload.sequentialMutationsPerCycle !== 2 ||
    value.workload.reconnectsPerCycle !== 1
  ) {
    throw new Error("Capacity envelope workload shape is unsupported");
  }
  if (!isRecord(value.thresholdsMs))
    throw new Error("Capacity envelope thresholds are missing");
  for (const key of [
    "initialConnectP95",
    "readP95",
    "mutationP95",
    "eventFanoutP95",
    "reconnectP95",
    "workloadTotal",
  ] as const) {
    if (!isPositiveNumber(value.thresholdsMs[key])) {
      throw new Error(`Capacity envelope threshold ${key} must be positive`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function readTextFile(url: URL): string {
  return readFileSync(url, "utf8");
}
