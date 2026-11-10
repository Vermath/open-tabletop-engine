import type { AddressInfo } from "node:net";
import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import { createTimestamped, type EngineEvent, type EngineState } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { CampaignWebhookTransport, CampaignWebhookTransportInput } from "./campaign-webhooks.js";
import { RealtimeHub } from "./realtime.js";
import { MemoryStateStore } from "./store.js";

const campaignId = "camp_demo";
const gmHeaders = { "x-user-id": "usr_demo_gm" };

class AtomicFinalizationStore extends MemoryStateStore {
  persisted: EngineState = structuredClone(this.state);
  accepted: EngineState[] = [];
  rejected: EngineState[] = [];
  rejectOnceWhen?: (state: EngineState) => boolean;
  private writePending = false;

  override save(): void {
    this.writePending = true;
  }

  override flush(): void {
    if (!this.writePending) return;
    if (this.rejectOnceWhen?.(this.state)) {
      this.rejectOnceWhen = undefined;
      this.rejected.push(structuredClone(this.state));
      throw new Error("Injected finalization validation failure");
    }
    this.persisted = structuredClone(this.state);
    this.accepted.push(this.persisted);
    this.writePending = false;
  }

  override restoreDurableState(): void {
    this.state = structuredClone(this.persisted);
    this.writePending = false;
  }
}

class AtomicWebhookTransport implements CampaignWebhookTransport {
  readonly sent: Array<{ input: CampaignWebhookTransportInput; persisted: EngineState }> = [];
  constructor(private readonly store: AtomicFinalizationStore) {}
  async validateTarget(url: string) {
    return { ok: true as const, normalizedUrl: url, resolvedAddresses: ["203.0.113.10"] };
  }
  async send(input: CampaignWebhookTransportInput) {
    this.sent.push({ input: structuredClone(input), persisted: structuredClone(this.store.persisted) });
    return { ok: true as const, responseStatus: 204, responseBytes: 0 };
  }
}

function addWebhook(store: AtomicFinalizationStore): void {
  store.state.campaignWebhooks.push(createTimestamped("cwh", {
    id: "cwh_atomic_finalization",
    campaignId,
    name: "Atomic finalization witness",
    url: "https://hooks.example.test/atomic",
    eventTypes: ["campaign.updated"],
    enabled: true,
    signingSecret: "otte_whsec_atomic_finalization",
    secretHint: "ization",
    createdByUserId: "usr_demo_gm",
    updatedByUserId: "usr_demo_gm",
  }));
  store.save();
  store.flush();
}

function campaign(state: EngineState) {
  return state.campaigns.find((candidate) => candidate.id === campaignId)!;
}

function observePublications(store: AtomicFinalizationStore) {
  const sent: Array<{ event: EngineEvent; persisted: EngineState }> = [];
  const broadcast = RealtimeHub.prototype.broadcast;
  const spy = vi.spyOn(RealtimeHub.prototype, "broadcast").mockImplementation(function (this: RealtimeHub, event, filter) {
    sent.push({ event: structuredClone(event), persisted: structuredClone(store.persisted) });
    broadcast.call(this, event, filter);
  });
  return { sent, restore: () => spy.mockRestore() };
}

interface TestSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

async function openSocket(app: Awaited<ReturnType<typeof buildApp>>) {
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { userId: "usr_demo_gm" } });
  expect(login.statusCode).toBe(200);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address() as AddressInfo;
  const Socket = (globalThis as unknown as { WebSocket: new (url: string, protocols: string[]) => TestSocket }).WebSocket;
  const socket = new Socket(`ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=${campaignId}`, ["otte.v1", `otte.auth.${login.json().token as string}`]);
  const received: EngineEvent[] = [];
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(String(data)) as EngineEvent & { channel?: string };
    if (event.channel !== "presence") received.push(event);
  };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening finalization witness socket")), 2_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = (event) => { clearTimeout(timer); reject(new Error(String(event))); };
  });
  return { socket, received };
}

describe("atomic request event finalization", () => {
  it.each(["handler", "flush"] as const)("does not flush a later request while sending a finalized %s error", async (failureAt) => {
    const store = new AtomicFinalizationStore();
    const app = await buildApp({ store });
    let beginErrorResponse!: () => void;
    let finishLaterHandler!: () => void;
    let firstErrorEntered!: () => void;
    let laterHandlerEntered!: () => void;
    const errorResponseAllowed = new Promise<void>((resolve) => { beginErrorResponse = resolve; });
    const laterHandlerAllowed = new Promise<void>((resolve) => { finishLaterHandler = resolve; });
    const firstErrorReady = new Promise<void>((resolve) => { firstErrorEntered = resolve; });
    const laterHandlerReady = new Promise<void>((resolve) => { laterHandlerEntered = resolve; });
    const before = structuredClone(campaign(store.persisted));
    app.addHook("onError", async (request) => {
      if (request.url !== "/atomic-finalization/first") return;
      firstErrorEntered();
      await errorResponseAllowed;
    });
    app.post("/atomic-finalization/first", async () => {
      campaign(store.state).name = "Rejected first candidate";
      store.save();
      if (failureAt === "handler") throw new Error("Injected handler failure");
      return { ok: true };
    });
    app.post("/atomic-finalization/later", async () => {
      campaign(store.state).name = "Uncommitted later candidate";
      store.save();
      laterHandlerEntered();
      await laterHandlerAllowed;
      throw new Error("Injected later handler failure");
    });
    if (failureAt === "flush") store.rejectOnceWhen = (state) => campaign(state).name === "Rejected first candidate";
    const first = app.inject({ method: "POST", url: "/atomic-finalization/first" }).then((response) => response);
    let later: Promise<Awaited<typeof first>> | undefined;
    try {
      await firstErrorReady;
      later = app.inject({ method: "POST", url: "/atomic-finalization/later" }).then((response) => response);
      await laterHandlerReady;
      beginErrorResponse();
      expect((await first).statusCode).toBe(500);
      expect.soft(campaign(store.persisted)).toEqual(before);
      finishLaterHandler();
      expect((await later).statusCode).toBe(500);
      expect(campaign(store.state)).toEqual(before);
      expect(campaign(store.persisted)).toEqual(before);
    } finally {
      beginErrorResponse();
      finishLaterHandler();
      await first;
      await later;
      await app.close();
    }
  });

  it.each([false, true])("rejects the complete mutation and its effects when final preparation fails (webhook=%s)", async (withWebhook) => {
    const store = new AtomicFinalizationStore();
    if (withWebhook) addWebhook(store);
    const transport = new AtomicWebhookTransport(store);
    const app = await buildApp({ store, webhookTransport: transport });
    const publications = observePublications(store);
    let socket: TestSocket | undefined;
    try {
      const realtime = await openSocket(app);
      socket = realtime.socket;
      const before = structuredClone(campaign(store.persisted));
      const key = `atomic-finalization-retry-${withWebhook}`;
      const body = { name: "Must commit with its cursor", expectedUpdatedAt: before.updatedAt };
      store.rejectOnceWhen = (state) => campaign(state).name === body.name && (campaign(state).eventSequence ?? 0) > (before.eventSequence ?? 0);
      const request = { method: "PATCH" as const, url: `/api/v1/campaigns/${campaignId}`, headers: { ...gmHeaders, "idempotency-key": key }, payload: body };

      const failed = await app.inject(request);
      expect(failed.statusCode).toBe(500);
      expect(store.rejected).toHaveLength(1);
      expect.soft(campaign(store.state)).toEqual(before);
      expect.soft(campaign(store.persisted)).toEqual(before);
      expect.soft(store.state.idempotencyRecords.some((record) => record.key === key)).toBe(false);
      expect.soft(store.state.campaignWebhookDeliveries).toHaveLength(0);
      expect.soft(transport.sent).toHaveLength(0);
      expect.soft(publications.sent.filter(({ event }) => event.type === "campaign.updated")).toHaveLength(0);

      const retry = await app.inject(request);
      expect(retry.statusCode).toBe(200);
      expect(retry.headers["idempotency-replayed"]).toBeUndefined();
      await expect.poll(() => realtime.received.filter((event) => event.type === "campaign.updated").length).toBe(1);
      if (withWebhook) await expect.poll(() => transport.sent.length).toBe(1);
      const replay = await app.inject(request);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(publications.sent.filter(({ event }) => event.type === "campaign.updated")).toHaveLength(1);
      expect(transport.sent).toHaveLength(withWebhook ? 1 : 0);
    } finally {
      socket?.close();
      publications.restore();
      await app.close();
    }
  });

  it("commits the replay record, event sequence, and webhook ledger before publishing exactly once", async () => {
    const store = new AtomicFinalizationStore();
    addWebhook(store);
    const transport = new AtomicWebhookTransport(store);
    const app = await buildApp({ store, webhookTransport: transport });
    const publications = observePublications(store);
    const before = structuredClone(campaign(store.state));
    const key = "atomic-finalization-success";
    const request = { method: "PATCH" as const, url: `/api/v1/campaigns/${campaignId}`, headers: { ...gmHeaders, "idempotency-key": key }, payload: { name: "Committed atomically", expectedUpdatedAt: before.updatedAt } };
    const acceptedBefore = store.accepted.length;
    try {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(200);
      await expect.poll(() => transport.sent.length).toBe(1);
      const witness = publications.sent.filter(({ event }) => event.type === "campaign.updated");
      expect(witness).toHaveLength(1);
      for (const state of [witness[0]!.persisted, transport.sent[0]!.persisted]) {
        expect(campaign(state).name).toBe(request.payload.name);
        expect(campaign(state).eventSequence).toBe(witness[0]!.event.sequence);
        expect(state.idempotencyRecords.some((record) => record.key === key)).toBe(true);
        expect(state.campaignWebhookDeliveries).toHaveLength(1);
      }
      const firstAcceptedMutation = store.accepted.slice(acceptedBefore).find((state) => campaign(state).name === request.payload.name)!;
      expect.soft(campaign(firstAcceptedMutation).eventSequence).toBe(witness[0]!.event.sequence);
      expect.soft(firstAcceptedMutation.campaignWebhookDeliveries).toHaveLength(1);
      const replay = await app.inject(request);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(publications.sent.filter(({ event }) => event.type === "campaign.updated")).toHaveLength(1);
      expect(transport.sent).toHaveLength(1);
    } finally {
      publications.restore();
      await app.close();
    }
  });

  it("retains the committed mutation and replay when realtime publication fails", async () => {
    const store = new AtomicFinalizationStore();
    const app = await buildApp({ store });
    const before = structuredClone(campaign(store.state));
    const key = "atomic-finalization-publication-failure";
    const request = { method: "PATCH" as const, url: `/api/v1/campaigns/${campaignId}`, headers: { ...gmHeaders, "idempotency-key": key }, payload: { name: "Persisted despite transport failure", expectedUpdatedAt: before.updatedAt } };
    const broadcast = RealtimeHub.prototype.broadcast;
    let publicationAttempts = 0;
    const spy = vi.spyOn(RealtimeHub.prototype, "broadcast").mockImplementation(function (this: RealtimeHub, event, filter) {
      if (event.type !== "campaign.updated") return broadcast.call(this, event, filter);
      publicationAttempts += 1;
      expect(campaign(store.persisted).eventSequence).toBe(event.sequence);
      throw new Error("Injected realtime publication failure");
    });
    try {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(200);
      expect(campaign(store.persisted).name).toBe(request.payload.name);
      expect(store.persisted.idempotencyRecords.some((record) => record.key === key)).toBe(true);
      const replay = await app.inject(request);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(response.body);
      expect(publicationAttempts).toBe(1);
    } finally {
      spy.mockRestore();
      await app.close();
    }
  });
});

class TwoJournalProvider implements AiProvider {
  readonly id = "atomic-two-journal-provider";
  readonly label = "Atomic phase witness";
  readonly executesToolsInTurn = true;
  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    if (!input.executeTool) throw new Error("Provider tool runner is unavailable");
    for (const title of ["Prior committed journal", "Rejected journal phase"]) {
      const toolInput = { title, body: title, visibility: "gm_only" };
      yield { type: "tool.started", toolName: "draft_journal_entry", input: toolInput };
      let output: unknown;
      try {
        output = await input.executeTool("draft_journal_entry", toolInput);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      yield { type: "tool.completed", toolName: "draft_journal_entry", output };
    }
    yield { type: "message.completed", content: "The earlier journal remains available." };
  }
}

describe("atomic AI phase effects", () => {
  it("discards a rejected phase's journal event while retaining an earlier committed automatic action", async () => {
    const store = new AtomicFinalizationStore();
    const app = await buildApp({ store, aiProvider: new TwoJournalProvider() });
    const publications = observePublications(store);
    store.rejectOnceWhen = (state) => state.journals.some((journal) => journal.title === "Rejected journal phase");
    try {
      const response = await app.inject({
        method: "POST", url: `/api/v1/campaigns/${campaignId}/ai/threads`,
        headers: { ...gmHeaders, "idempotency-key": "atomic-ai-rejected-phase" },
        payload: { prompt: "Create the two test journals", approvalMode: "auto", expectedUpdatedAt: campaign(store.state).updatedAt },
      });
      expect(response.statusCode).toBe(200);
      expect(store.rejected).toHaveLength(1);
      expect(store.persisted.journals.filter((journal) => journal.title === "Prior committed journal")).toHaveLength(1);
      expect(store.persisted.journals.some((journal) => journal.title === "Rejected journal phase")).toBe(false);
      const journalEvents = publications.sent.filter(({ event }) => event.type === "journal.created");
      expect(journalEvents.filter(({ event }) => (event.payload as { title?: string }).title === "Prior committed journal")).toHaveLength(1);
      expect(journalEvents.some(({ event }) => (event.payload as { title?: string }).title === "Rejected journal phase")).toBe(false);
      const started = publications.sent.findIndex(({ event }) => event.type === "ai.thread.started");
      const completed = publications.sent.findIndex(({ event }) => event.type === "ai.message.completed");
      expect(started).toBeGreaterThanOrEqual(0);
      expect(completed).toBeGreaterThan(started);
    } finally {
      publications.restore();
      await app.close();
    }
  });
});
