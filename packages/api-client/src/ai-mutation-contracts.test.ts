import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  OpenTabletopClient,
  type AiEvaluationCreateInput,
  type PreparedMutationRequestOptions,
  type ProposalCreateInput,
} from "./index.js";

const campaignId = "camp_ai_contract";
const campaignRevision = "2026-07-17T12:00:00.000Z";
const threadRevision = "2026-07-17T12:01:00.000Z";

describe("hardened AI mutation contracts", () => {
  it("requires precise revision inputs and idempotency options at compile time", () => {
    expectTypeOf<Parameters<OpenTabletopClient["createProposal"]>>().toEqualTypeOf<[
      campaignId: string,
      input: ProposalCreateInput,
      options: PreparedMutationRequestOptions,
    ]>();
    expectTypeOf<Parameters<OpenTabletopClient["createAiEvaluation"]>>().toEqualTypeOf<[
      campaignId: string,
      input: AiEvaluationCreateInput,
      options: PreparedMutationRequestOptions,
    ]>();
    expectTypeOf<Parameters<OpenTabletopClient["extractAiMemory"]>[2]>()
      .toEqualTypeOf<PreparedMutationRequestOptions>();
    expectTypeOf<Parameters<OpenTabletopClient["aiSessionRecap"]>[2]>()
      .toEqualTypeOf<PreparedMutationRequestOptions>();
    expectTypeOf<Parameters<OpenTabletopClient["aiEncounterDesign"]>[2]>()
      .toEqualTypeOf<PreparedMutationRequestOptions>();
    expectTypeOf<Parameters<OpenTabletopClient["aiGenerateMapAsset"]>[2]>()
      .toEqualTypeOf<PreparedMutationRequestOptions>();
    expectTypeOf<Parameters<OpenTabletopClient["aiGenerateTokenAsset"]>[2]>()
      .toEqualTypeOf<PreparedMutationRequestOptions>();
  });

  it("sends every required revision and idempotency key", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: new URL(input.toString()), init });
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.createProposal(
      campaignId,
      { title: "Guarded proposal", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "proposal-create" },
    );
    await client.createAiEvaluation(
      campaignId,
      {
        threadId: "ait_contract",
        expectedThreadUpdatedAt: threadRevision,
        name: "Contract evaluation",
        expectedStatus: "completed",
      },
      { idempotencyKey: "evaluation-create" },
    );
    await client.extractAiMemory(
      campaignId,
      { sourceText: "Session transcript", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "memory-extract" },
    );
    await client.aiSessionRecap(
      campaignId,
      { transcript: "Session transcript", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "session-recap" },
    );
    await client.aiEncounterDesign(
      campaignId,
      { prompt: "A guarded bridge", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "encounter-design" },
    );
    await client.aiGenerateMapAsset(
      campaignId,
      { prompt: "A guarded bridge map", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "map-generate" },
    );
    await client.aiGenerateTokenAsset(
      campaignId,
      { prompt: "A guarded bridge token", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "token-generate" },
    );

    expect(requests.map(({ url, init }) => ({
      method: init?.method,
      path: url.pathname,
      idempotencyKey: new Headers(init?.headers).get("idempotency-key"),
      body: JSON.parse(String(init?.body)),
    }))).toEqual([
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/proposals`,
        idempotencyKey: "proposal-create",
        body: { title: "Guarded proposal", expectedUpdatedAt: campaignRevision },
      },
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/ai/evaluations`,
        idempotencyKey: "evaluation-create",
        body: {
          threadId: "ait_contract",
          expectedThreadUpdatedAt: threadRevision,
          name: "Contract evaluation",
          expectedStatus: "completed",
        },
      },
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/ai/memory/extract`,
        idempotencyKey: "memory-extract",
        body: { sourceText: "Session transcript", expectedUpdatedAt: campaignRevision },
      },
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/ai/session-recap`,
        idempotencyKey: "session-recap",
        body: { transcript: "Session transcript", expectedUpdatedAt: campaignRevision },
      },
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/ai/encounter-design`,
        idempotencyKey: "encounter-design",
        body: { prompt: "A guarded bridge", expectedUpdatedAt: campaignRevision },
      },
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/ai/generate-map-asset`,
        idempotencyKey: "map-generate",
        body: { prompt: "A guarded bridge map", expectedUpdatedAt: campaignRevision },
      },
      {
        method: "POST",
        path: `/api/v1/campaigns/${campaignId}/ai/generate-token-asset`,
        idempotencyKey: "token-generate",
        body: { prompt: "A guarded bridge token", expectedUpdatedAt: campaignRevision },
      },
    ]);
  });

  it("rejects blank idempotency keys before sending a mutation", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new OpenTabletopClient("https://api.test", {
      fetch: fetchImpl,
    });

    await expect(client.aiSessionRecap(
      campaignId,
      { transcript: "Session transcript", expectedUpdatedAt: campaignRevision },
      { idempotencyKey: "  " },
    )).rejects.toThrow("AI session recap creation requires an Idempotency-Key");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("cookie session migration failures", () => {
  it("keeps the configured bearer until confirmation succeeds", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      token: "ots_legacy",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        requests.push({ url, init });
        if (url.pathname.endsWith("/confirm")) {
          return new Response("confirmation failed", { status: 409 });
        }
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await expect(client.confirmSessionCookieUpgrade("usr_expected"))
      .rejects.toThrow("confirmation failed");
    await client.session();

    const sessionRequest = requests.at(-1)?.init;
    expect(new Headers(sessionRequest?.headers).get("authorization"))
      .toBe("Bearer ots_legacy");
    expect(sessionRequest?.credentials).toBeUndefined();
  });

  it("does not activate a cookie session confirmed for another user", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      token: "ots_legacy",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        requests.push({ url, init });
        const payload = url.pathname.endsWith("/confirm")
          ? {
              ok: true,
              upgradeConfirmed: true,
              session: { userId: "usr_other" },
            }
          : {};
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await expect(client.confirmSessionCookieUpgrade("usr_expected"))
      .rejects.toThrow("Session cookie confirmation did not match the expected user.");
    await client.session();

    const sessionRequest = requests.at(-1)?.init;
    expect(new Headers(sessionRequest?.headers).get("authorization"))
      .toBe("Bearer ots_legacy");
    expect(sessionRequest?.credentials).toBeUndefined();
  });
});
