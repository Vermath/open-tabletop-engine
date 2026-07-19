import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import { createTimestamped, type AssetStorageRef, type EngineState, type MapAsset } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp, type ImageAssetGenerationInput, type ImageAssetGenerator } from "./app.js";
import type { AssetStorage } from "./asset-storage.js";
import { MemoryStateStore } from "./store.js";

class DurableAiTestStore extends MemoryStateStore {
  persisted: EngineState = structuredClone(this.state);
  private pending = false;

  override save(): void {
    this.pending = true;
  }

  override flush(): void {
    if (!this.pending) return;
    this.persisted = structuredClone(this.state);
    this.pending = false;
  }

  restoreDurableState(): void {
    this.pending = false;
    this.state = structuredClone(this.persisted);
  }
}

class DelayedAiProvider implements AiProvider {
  readonly id = "delayed-test-provider";
  readonly label = "Delayed test provider";
  calls = 0;
  private releaseProvider!: () => void;
  private providerEntered!: () => void;
  private readonly hold = new Promise<void>((resolve) => {
    this.releaseProvider = resolve;
  });
  readonly entered = new Promise<void>((resolve) => {
    this.providerEntered = resolve;
  });

  release(): void {
    this.releaseProvider();
  }

  async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    this.calls += 1;
    this.providerEntered();
    await this.hold;
    yield { type: "message.completed", content: "The delayed turn completed." };
  }
}

class AbortAwareAiProvider implements AiProvider {
  readonly id = "abort-aware-test-provider";
  readonly label = "Abort-aware test provider";
  private providerEntered!: () => void;
  readonly entered = new Promise<void>((resolve) => {
    this.providerEntered = resolve;
  });

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    this.providerEntered();
    await new Promise<void>((_resolve, reject) => {
      const abort = () => reject(new Error("Provider observed client cancellation"));
      if (input.signal?.aborted) abort();
      else input.signal?.addEventListener("abort", abort, { once: true });
    });
    yield { type: "message.completed", content: "unreachable" };
  }
}

class FailingAiProvider implements AiProvider {
  readonly id = "failing-test-provider";
  readonly label = "Failing test provider";

  async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    yield { type: "message.delta", delta: "Partial provider response" };
    throw new Error("Simulated provider failure");
  }
}

class DuplicateCompletionAiProvider implements AiProvider {
  readonly id = "duplicate-completion-test-provider";
  readonly label = "Duplicate completion test provider";
  readonly executesToolsInTurn = true;
  calls = 0;

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    this.calls += 1;
    if (!input.executeTool) throw new Error("executeTool unavailable");
    const toolInput = {
      title: "Exactly Once Journal",
      body: "This journal must be created exactly once.",
      visibility: "gm_only",
    };
    yield { type: "tool.started", toolName: "draft_journal_entry", input: toolInput };
    const output = await input.executeTool("draft_journal_entry", toolInput);
    yield { type: "tool.completed", toolName: "draft_journal_entry", output };
    yield { type: "tool.completed", toolName: "draft_journal_entry", output };
    yield { type: "message.completed", content: "The journal was created." };
  }
}

class RouteDelayedAiProvider implements AiProvider {
  readonly id = "route-delayed-test-provider";
  readonly label = "Route delayed test provider";
  private releaseProvider!: () => void;
  private providerEntered!: () => void;
  private readonly hold = new Promise<void>((resolve) => {
    this.releaseProvider = resolve;
  });
  readonly entered = new Promise<void>((resolve) => {
    this.providerEntered = resolve;
  });

  constructor(private readonly output: string) {}

  release(): void {
    this.releaseProvider();
  }

  async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    this.providerEntered();
    await this.hold;
    yield { type: "message.completed", content: this.output };
  }
}

class DurablePhaseAssetStorage implements AssetStorage {
  readonly provider = "s3" as const;
  readonly objects = new Map<string, Buffer>();

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const key = asset.storage?.provider === "s3" ? asset.storage.key : asset.id;
    this.objects.set(key, Buffer.from(body));
    return { provider: "s3", bucket: "durable-phase-assets", key };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    const key = asset.storage?.provider === "s3" ? asset.storage.key : asset.id;
    const body = this.objects.get(key);
    return body ? Buffer.from(body) : undefined;
  }

  async delete(asset: MapAsset): Promise<boolean> {
    const key = asset.storage?.provider === "s3" ? asset.storage.key : asset.id;
    return this.objects.delete(key);
  }
}

class DelayedAfterWriteAssetStorage extends DurablePhaseAssetStorage {
  private releaseWrite!: () => void;
  private writeEntered!: () => void;
  private readonly hold = new Promise<void>((resolve) => {
    this.releaseWrite = resolve;
  });
  readonly entered = new Promise<void>((resolve) => {
    this.writeEntered = resolve;
  });

  release(): void {
    this.releaseWrite();
  }

  override async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const storage = await super.put(asset, body);
    this.writeEntered();
    await this.hold;
    return storage;
  }
}

class DelayedImageAssetGenerator implements ImageAssetGenerator {
  readonly id = "delayed-image-generator";
  readonly label = "Delayed image generator";
  observedSignal: AbortSignal | undefined;
  private releaseGenerator!: () => void;
  private generatorEntered!: () => void;
  private readonly hold = new Promise<void>((resolve) => {
    this.releaseGenerator = resolve;
  });
  readonly entered = new Promise<void>((resolve) => {
    this.generatorEntered = resolve;
  });

  release(): void {
    this.releaseGenerator();
  }

  async generate(input: ImageAssetGenerationInput) {
    this.observedSignal = input.signal;
    this.generatorEntered();
    await this.hold;
    return {
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axpRz8AAAAASUVORK5CYII=", "base64"),
      mimeType: "image/png",
      provider: this.id,
      sourcePrompt: input.prompt,
    };
  }
}

function campaignRevision(store: MemoryStateStore): string {
  return store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt;
}

describe("AI durable phases", () => {
  it.each([
    {
      name: "PDF import",
      url: "/api/v1/campaigns/camp_demo/content-imports/pdf/ai",
      headers: { "content-type": "application/pdf", "x-source-name": "durable-phase.pdf" },
      payload: Buffer.from("%PDF-1.7\n%durable-phase"),
      output: JSON.stringify({ entities: [{ kind: "encounter", name: "Durable Gate Encounter", summary: "A test encounter.", difficulty: "medium" }] }),
      pdf: true,
    },
    {
      name: "memory extraction",
      url: "/api/v1/campaigns/camp_demo/ai/memory/extract",
      headers: { "content-type": "application/json" },
      payload: { sourceText: "The gate test vault opens under moonlight." },
      output: "The gate test vault opens under moonlight.",
      pdf: false,
    },
    {
      name: "session recap",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      headers: { "content-type": "application/json" },
      payload: { transcript: "The party crossed the durable gate." },
      output: JSON.stringify({ playerRecap: "The party crossed the durable gate.", gmSummary: "Gate crossed.", timelineEvents: [], npcChanges: [], factionChanges: [], lootAndResources: [], unresolvedHooks: [], prepSuggestions: [], memoryCandidates: [] }),
      pdf: false,
    },
    {
      name: "encounter design",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      headers: { "content-type": "application/json" },
      payload: { prompt: "Design a gate guardian", difficulty: "medium" },
      output: JSON.stringify({ name: "Durable Gate Guardian", summary: "A guardian blocks the gate.", difficulty: "medium", sceneName: "Durable Gate", objectives: [], complications: [] }),
      pdf: false,
    },
  ])("keeps unrelated writes responsive while $name waits on its provider", async ({ name, url, headers, payload, output, pdf }) => {
    const store = new DurableAiTestStore();
    const provider = new RouteDelayedAiProvider(output);
    const app = await buildApp({
      store,
      aiProvider: provider,
      ...(pdf ? { pdfTextExtractor: async () => [{ pageNumber: 1, text: "Durable phase PDF content" }] } : {}),
    });

    try {
      const expectedUpdatedAt = campaignRevision(store);
      const providerRequest = app.inject({
        method: "POST",
        url: pdf ? `${url}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}` : url,
        headers: { ...headers, "x-user-id": "usr_demo_gm", "idempotency-key": `ai-route-${name.replaceAll(" ", "-").toLowerCase()}` },
        payload: pdf ? payload : { ...(payload as Record<string, unknown>), expectedUpdatedAt },
      });
      await provider.entered;
      expect(store.persisted.aiThreads.at(-1)).toMatchObject({ status: "running", provider: provider.id });

      const unrelatedMutation = app.inject({
        method: "POST",
        url: "/api/v1/chat/messages",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": `ai-route-chat-${name.replaceAll(" ", "-").toLowerCase()}` },
        payload: { campaignId: "camp_demo", body: `${name} did not block the table.` },
      });
      const unrelatedCompletedPromptly = await Promise.race([
        unrelatedMutation,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 500)),
      ]);
      expect(unrelatedCompletedPromptly?.statusCode).toBe(200);

      provider.release();
      const response = await providerRequest;
      expect(response.statusCode).toBe(200);
      expect(store.persisted.aiThreads.at(-1)).toMatchObject({ status: "completed", provider: provider.id });
    } finally {
      provider.release();
      await app.close();
    }
  });

  it.each([
    {
      name: "PDF import",
      url: "/api/v1/campaigns/camp_demo/content-imports/pdf/ai",
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.7\n%cancellation"),
      pdf: true,
    },
    {
      name: "memory extraction",
      url: "/api/v1/campaigns/camp_demo/ai/memory/extract",
      contentType: "application/json",
      body: JSON.stringify({ sourceText: "Cancel this memory extraction." }),
      pdf: false,
    },
    {
      name: "session recap",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      contentType: "application/json",
      body: JSON.stringify({ transcript: "Cancel this session recap." }),
      pdf: false,
    },
    {
      name: "encounter design",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      contentType: "application/json",
      body: JSON.stringify({ prompt: "Cancel this encounter design." }),
      pdf: false,
    },
  ])("cancels and durably terminates $name when the client disconnects", async ({ name, url, contentType, body, pdf }) => {
    const store = new DurableAiTestStore();
    const provider = new AbortAwareAiProvider();
    const app = await buildApp({
      store,
      aiProvider: provider,
      ...(pdf ? { pdfTextExtractor: async () => [{ pageNumber: 1, text: "Cancellation test PDF content" }] } : {}),
    });

    try {
      const expectedUpdatedAt = campaignRevision(store);
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const controller = new AbortController();
      const response = fetch(`${address}${pdf ? `${url}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}` : url}`, {
        method: "POST",
        headers: {
          "content-type": contentType,
          "x-user-id": "usr_demo_gm",
          "idempotency-key": `ai-cancel-${name.replaceAll(" ", "-").toLowerCase()}`,
        },
        body: pdf ? body : JSON.stringify({ ...(JSON.parse(body.toString()) as Record<string, unknown>), expectedUpdatedAt }),
        signal: controller.signal,
      });
      await provider.entered;
      expect(store.persisted.aiThreads.at(-1)).toMatchObject({ status: "running", provider: provider.id });

      controller.abort();
      await expect(response).rejects.toThrow();
      await expect.poll(
        () => store.persisted.aiThreads.at(-1)?.status,
        { timeout: 2_000, interval: 10 },
      ).toBe("cancelled");
      expect(store.persisted.aiThreads.at(-1)).toMatchObject({
        status: "cancelled",
        providerError: "Agent turn stopped by the user.",
      });
    } finally {
      await app.close();
    }
  });

  it("keeps unrelated writes responsive while an external image tool waits", async () => {
    const store = new DurableAiTestStore();
    const imageAssetGenerator = new DelayedImageAssetGenerator();
    const app = await buildApp({
      store,
      assetStorage: new DurablePhaseAssetStorage(),
      imageAssetGenerator,
    });

    try {
      const imageRequest = app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/generate-map-asset",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-delayed-image-1" },
        payload: { prompt: "A moonlit gate battlemap", name: "Moonlit Gate", outputFormat: "png", expectedUpdatedAt: campaignRevision(store) },
      });
      await imageAssetGenerator.entered;

      const unrelatedMutation = app.inject({
        method: "POST",
        url: "/api/v1/chat/messages",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-delayed-image-chat-1" },
        payload: { campaignId: "camp_demo", body: "Image generation did not block the table." },
      });
      const unrelatedCompletedPromptly = await Promise.race([
        unrelatedMutation,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 500)),
      ]);
      expect(unrelatedCompletedPromptly?.statusCode).toBe(200);

      imageAssetGenerator.release();
      const response = await imageRequest;
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ proposalId: expect.any(String), assetId: expect.any(String) });
      expect(store.persisted.proposals.filter((proposal) => proposal.title === "Generated map: Moonlit Gate")).toHaveLength(1);
    } finally {
      imageAssetGenerator.release();
      await app.close();
    }
  });

  it("retains gm-only output visibility when GM-memory permission is revoked during the provider call", async () => {
    const store = new DurableAiTestStore();
    const provider = new DelayedAiProvider();
    const aiUseGrant = createTimestamped("grant", {
      campaignId: "camp_demo",
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      permissions: ["ai.use" as const],
    });
    const grant = createTimestamped("grant", {
      campaignId: "camp_demo",
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      permissions: ["ai.readGmMemory" as const],
    });
    store.state.permissionGrants.push(aiUseGrant, grant);
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const aiRequest = app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "ai-gm-visibility-race-1" },
        payload: {
          prompt: "Use the GM-only vault notes",
          contextScopes: ["gm_private"],
          expectedUpdatedAt: campaignRevision(store),
        },
      });
      await provider.entered;
      expect(store.persisted.aiThreads.at(-1)).toMatchObject({ contextScopes: ["gm_private"], status: "running" });

      store.state.permissionGrants = store.state.permissionGrants.filter((candidate) => candidate.id !== grant.id);
      store.save();
      store.flush();

      provider.release();
      const response = await aiRequest;
      expect(response.statusCode).toBe(200);
      expect(store.persisted.chat.filter((message) => message.body === "The delayed turn completed.")).toEqual([
        expect.objectContaining({ type: "ai", visibility: "gm_only" }),
      ]);
      expect(store.persisted.chat.some((message) => message.body === "The delayed turn completed." && message.visibility === "public")).toBe(false);
    } finally {
      provider.release();
      await app.close();
    }
  });

  it("deletes generated bytes when policy changes before the asset proposal commits", async () => {
    const store = new DurableAiTestStore();
    const storage = new DurablePhaseAssetStorage();
    const imageAssetGenerator = new DelayedImageAssetGenerator();
    const app = await buildApp({ store, assetStorage: storage, imageAssetGenerator });

    try {
      const imageRequest = app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/generate-map-asset",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-image-policy-cleanup-1" },
        payload: { prompt: "A forbidden moonlit vault", name: "Forbidden Vault", outputFormat: "png", expectedUpdatedAt: campaignRevision(store) },
      });
      await imageAssetGenerator.entered;

      const policyUpdate = await app.inject({
        method: "PATCH",
        url: "/api/v1/campaigns/camp_demo/ai/policy",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-image-policy-cleanup-disable-1" },
        payload: {
          expectedRevision: 0,
          enabled: false,
          contextScopes: ["public", "gm_private"],
          providerTransmissionDisclosure: "AI provider transmission is disabled for this campaign.",
          retentionDays: 30,
        },
      });
      expect(policyUpdate.statusCode).toBe(200);

      imageAssetGenerator.release();
      const response = await imageRequest;
      expect(response.statusCode).toBe(403);
      expect(storage.objects.size).toBe(0);
      expect(store.persisted.proposals.some((proposal) => proposal.title === "Generated map: Forbidden Vault")).toBe(false);
    } finally {
      imageAssetGenerator.release();
      await app.close();
    }
  });

  it("deletes generated bytes when proposal permission is revoked during image generation", async () => {
    const store = new DurableAiTestStore();
    const storage = new DurablePhaseAssetStorage();
    const imageAssetGenerator = new DelayedImageAssetGenerator();
    const grant = createTimestamped("grant", {
      campaignId: "camp_demo",
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      permissions: ["ai.proposeChanges" as const, "scene.update" as const],
    });
    store.state.permissionGrants.push(grant);
    const app = await buildApp({ store, assetStorage: storage, imageAssetGenerator });

    try {
      const imageRequest = app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/generate-map-asset",
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "ai-image-permission-cleanup-1" },
        payload: { prompt: "A revoked moonlit vault", name: "Revoked Vault", outputFormat: "png", expectedUpdatedAt: campaignRevision(store) },
      });
      await imageAssetGenerator.entered;

      store.state.permissionGrants = store.state.permissionGrants.filter((candidate) => candidate.id !== grant.id);
      store.save();
      store.flush();
      imageAssetGenerator.release();

      const response = await imageRequest;
      expect(response.statusCode).not.toBe(200);
      expect(storage.objects.size).toBe(0);
      expect(store.persisted.proposals.some((proposal) => proposal.title === "Generated map: Revoked Vault")).toBe(false);
    } finally {
      imageAssetGenerator.release();
      await app.close();
    }
  });

  it("deletes already-written generated bytes when the client aborts", async () => {
    const store = new DurableAiTestStore();
    const storage = new DelayedAfterWriteAssetStorage();
    const imageAssetGenerator = new DelayedImageAssetGenerator();
    const app = await buildApp({ store, assetStorage: storage, imageAssetGenerator });

    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const controller = new AbortController();
      const response = fetch(`${address}/api/v1/campaigns/camp_demo/ai/generate-map-asset`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "usr_demo_gm",
          "idempotency-key": "ai-image-abort-cleanup-1",
        },
        body: JSON.stringify({ prompt: "An interrupted moonlit vault", name: "Interrupted Vault", outputFormat: "png", expectedUpdatedAt: campaignRevision(store) }),
        signal: controller.signal,
      });
      const responseOutcome = response.then(
        (completedResponse) => ({ completedResponse }),
        (error: unknown) => ({ error }),
      );
      await imageAssetGenerator.entered;
      imageAssetGenerator.release();
      await storage.entered;
      expect(storage.objects.size).toBe(1);

      controller.abort();
      await expect.poll(() => imageAssetGenerator.observedSignal?.aborted, { timeout: 2_000, interval: 10 }).toBe(true);
      storage.release();
      expect(await responseOutcome).toMatchObject({ error: { name: "AbortError" } });
      await expect.poll(() => storage.objects.size, { timeout: 2_000, interval: 10 }).toBe(0);
      expect(store.persisted.proposals.some((proposal) => proposal.title === "Generated map: Interrupted Vault")).toBe(false);
    } finally {
      imageAssetGenerator.release();
      storage.release();
      await app.close();
    }
  });

  it("persists a pending turn, releases the global mutation gate during provider work, and replays completion idempotently", async () => {
    const store = new DurableAiTestStore();
    const provider = new DelayedAiProvider();
    const app = await buildApp({ store, aiProvider: provider });
    const initialSequence = store.state.campaigns.find((campaign) => campaign.id === "camp_demo")?.eventSequence ?? 0;

    try {
      const aiRequest = app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-phased-turn-1" },
        payload: { prompt: "Wait while the table keeps moving", expectedUpdatedAt: campaignRevision(store) },
      });
      await provider.entered;

      expect(store.persisted.aiThreads).toEqual([
        expect.objectContaining({ status: "running", provider: provider.id }),
      ]);

      const unrelatedMutation = app.inject({
        method: "POST",
        url: "/api/v1/chat/messages",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-phased-chat-1" },
        payload: { campaignId: "camp_demo", body: "The table is still responsive." },
      });
      const unrelatedCompletedPromptly = await Promise.race([
        unrelatedMutation.then((response) => response),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 150)),
      ]);
      expect(unrelatedCompletedPromptly?.statusCode).toBe(200);
      expect(store.persisted.chat.some((message) => message.body === "The table is still responsive.")).toBe(true);
      const sequenceAfterUnrelatedWrite = store.persisted.campaigns.find((campaign) => campaign.id === "camp_demo")?.eventSequence ?? 0;
      expect(sequenceAfterUnrelatedWrite).toBe(initialSequence + 1);

      provider.release();
      const completed = await aiRequest;
      expect(completed.statusCode).toBe(200);
      expect(completed.json().thread).toMatchObject({ status: "completed", provider: provider.id });
      expect(store.persisted.aiThreads).toEqual([
        expect.objectContaining({ status: "completed", assistantMessage: "The delayed turn completed." }),
      ]);
      // The started thread, completed message, persisted AI chat, and completed
      // thread are stable state events and share the campaign reconnect cursor.
      expect(store.persisted.campaigns.find((campaign) => campaign.id === "camp_demo")?.eventSequence).toBe(sequenceAfterUnrelatedWrite + 4);

      const replay = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-phased-turn-1" },
        payload: { prompt: "Wait while the table keeps moving", expectedUpdatedAt: campaignRevision(store) },
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(provider.calls).toBe(1);
      expect(store.state.aiThreads).toHaveLength(1);
      expect(store.state.chat.filter((message) => message.body === "The delayed turn completed.")).toHaveLength(1);
    } finally {
      provider.release();
      await app.close();
    }
  });

  it("fails closed when campaign AI policy changes while the provider is running", async () => {
    const store = new DurableAiTestStore();
    const provider = new DelayedAiProvider();
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const aiRequest = app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-policy-race-turn-1" },
        payload: { prompt: "Do not commit this response after policy changes", expectedUpdatedAt: campaignRevision(store) },
      });
      await provider.entered;
      const runningThread = store.persisted.aiThreads.at(-1);
      expect(runningThread).toMatchObject({ status: "running", policyRevision: 0 });

      const policyUpdate = await app.inject({
        method: "PATCH",
        url: "/api/v1/campaigns/camp_demo/ai/policy",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-policy-race-disable-1" },
        payload: {
          expectedRevision: 0,
          enabled: false,
          contextScopes: ["public", "gm_private"],
          providerTransmissionDisclosure: "AI provider transmission is disabled for this campaign.",
          retentionDays: 30,
        },
      });
      expect(policyUpdate.statusCode).toBe(200);

      provider.release();
      const response = await aiRequest;
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "ai_disabled", thread: { id: runningThread?.id, status: "failed" } });
      expect(store.persisted.aiThreads.at(-1)).toMatchObject({
        id: runningThread?.id,
        status: "failed",
        providerError: "AI is disabled by installation or campaign policy.",
      });
      expect(store.persisted.chat.some((message) => message.type === "ai" && message.body === "The delayed turn completed.")).toBe(false);
    } finally {
      provider.release();
      await app.close();
    }
  });

  it("persists cancellation as a terminal thread state after the client disconnects", async () => {
    const store = new DurableAiTestStore();
    const provider = new AbortAwareAiProvider();
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const controller = new AbortController();
      const response = fetch(`${address}/api/v1/campaigns/camp_demo/ai/threads`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "usr_demo_gm",
          "idempotency-key": "ai-phased-cancel-1",
        },
        body: JSON.stringify({ prompt: "Cancel this provider turn", expectedUpdatedAt: campaignRevision(store) }),
        signal: controller.signal,
      });
      await provider.entered;
      expect(store.persisted.aiThreads[0]).toMatchObject({ status: "running", provider: provider.id });

      controller.abort();
      await expect(response).rejects.toThrow();
      await expect.poll(
        () => store.persisted.aiThreads[0]?.status,
        { timeout: 2_000, interval: 10 },
      ).toBe("cancelled");
      expect(store.persisted.aiThreads[0]).toMatchObject({
        status: "cancelled",
        providerError: "Agent turn stopped by the user.",
      });
      expect(store.persisted.aiThreads[0]?.failedAt).toBeTruthy();
    } finally {
      await app.close();
    }
  });

  it("persists a provider failure as a terminal thread without losing the partial result", async () => {
    const store = new DurableAiTestStore();
    const provider = new FailingAiProvider();
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-phased-failure-1" },
        payload: { prompt: "Fail after returning a partial response", expectedUpdatedAt: campaignRevision(store) },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ error: "ai_provider_failed" });
      expect(store.persisted.aiThreads).toEqual([
        expect.objectContaining({
          status: "failed",
          provider: provider.id,
          providerError: "Simulated provider failure",
          assistantMessage: "Partial provider response",
          failedAt: expect.any(String),
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it("deduplicates provider tool completions and idempotent replay so auto mode applies exactly once", async () => {
    const store = new DurableAiTestStore();
    const provider = new DuplicateCompletionAiProvider();
    const app = await buildApp({ store, aiProvider: provider });
    const request = {
      method: "POST" as const,
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-duplicate-completion-1" },
      payload: { prompt: "Create one journal", approvalMode: "auto", expectedUpdatedAt: campaignRevision(store) },
    };

    try {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(200);
      const responseBody = response.json() as {
        thread: { id: string };
        events: Array<{ type: string; toolName?: string }>;
      };
      expect(responseBody.events.filter((event) => event.type === "tool.completed" && event.toolName === "draft_journal_entry")).toHaveLength(1);
      expect(store.persisted.aiToolCalls.filter((call) => call.threadId === responseBody.thread.id && call.toolName === "draft_journal_entry")).toHaveLength(1);
      expect(store.persisted.journals.filter((journal) => journal.title === "Exactly Once Journal")).toHaveLength(1);
      expect(store.persisted.proposals.filter((proposal) => proposal.title === "Journal: Exactly Once Journal" && proposal.status === "applied")).toHaveLength(1);

      const replay = await app.inject(request);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(provider.calls).toBe(1);
      expect(store.persisted.journals.filter((journal) => journal.title === "Exactly Once Journal")).toHaveLength(1);
      expect(store.persisted.proposals.filter((proposal) => proposal.title === "Journal: Exactly Once Journal")).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("applies the shared idempotency and revision contract to stable AI memory mutations", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/memory",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-memory-create-1" },
        payload: { text: "The vault door bears a silver moon.", visibility: "gm_only", expectedUpdatedAt: campaignRevision(store) },
      });
      expect(created.statusCode).toBe(200);
      const fact = created.json() as { id: string; updatedAt: string };

      const missingKey = await app.inject({
        method: "PATCH",
        url: `/api/v1/ai/memory/${fact.id}`,
        headers: { "x-user-id": "usr_demo_gm" },
        payload: { subject: "Vault door", expectedUpdatedAt: fact.updatedAt },
      });
      expect(missingKey.statusCode).toBe(400);
      expect(missingKey.json().message.toLowerCase()).toContain("idempotency-key");

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/ai/memory/${fact.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-memory-stale-1" },
        payload: { subject: "Vault door", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", resourceType: "ai_memory", resourceId: fact.id, currentUpdatedAt: fact.updatedAt });

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/ai/memory/${fact.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-memory-update-1" },
        payload: { subject: "Vault door", expectedUpdatedAt: fact.updatedAt },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: fact.id, subject: "Vault door" });

      const replay = await app.inject({
        method: "PATCH",
        url: `/api/v1/ai/memory/${fact.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "ai-memory-update-1" },
        payload: { subject: "Vault door", expectedUpdatedAt: fact.updatedAt },
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.auditLogs.filter((entry) => entry.action === "ai.memory.update" && entry.targetId === fact.id)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
