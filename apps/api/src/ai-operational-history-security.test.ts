import {
  createTimestamped,
  type AiEvaluationRun,
  type AiThread,
  type AiToolCall,
  type PermissionGrant,
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const CAMPAIGN_ID = "camp_demo";
const GM_USER_ID = "usr_demo_gm";
const PLAYER_USER_ID = "usr_demo_player";

const GM_SECRET_PROMPT = "gm-prompt-secret: the obsidian regent is the traitor";
const GM_SECRET_TOOL_INPUT = "gm-tool-input-secret: open the regent dossier";
const GM_SECRET_TOOL_OUTPUT = "gm-tool-output-secret: dossier backend unavailable";
const GM_SECRET_EVALUATION = "gm-evaluation-secret: prompt containment review";

function seedOperationalHistory() {
  const store = new MemoryStateStore();
  store.state.permissionGrants.push(
    createTimestamped("grant", {
      id: "grant_player_ai_operations",
      campaignId: CAMPAIGN_ID,
      subjectType: "user" as const,
      subjectId: PLAYER_USER_ID,
      permissions: ["ai.proposeChanges" as const],
    }) satisfies PermissionGrant,
  );

  const gmThread = createTimestamped("thr", {
    id: "thr_gm_private_history",
    campaignId: CAMPAIGN_ID,
    userId: GM_USER_ID,
    provider: "history-security-test",
    title: GM_SECRET_PROMPT,
    prompt: GM_SECRET_PROMPT,
    assistantMessage: "gm-response-secret: the regent dossier was consulted",
    status: "completed" as const,
    contextScopes: ["gm_private" as const],
    sources: [
      {
        id: "source_gm_regent_dossier",
        kind: "campaign_note" as const,
        title: "gm-source-secret: regent dossier",
        visibility: "gm_private" as const,
        trust: "reviewed_canon" as const,
      },
    ],
    usage: { inputTokens: 900, outputTokens: 100, totalTokens: 1_000 },
  }) satisfies AiThread;
  const playerThread = createTimestamped("thr", {
    id: "thr_player_public_history",
    campaignId: CAMPAIGN_ID,
    userId: PLAYER_USER_ID,
    provider: "history-security-test",
    title: "Player public tavern question",
    prompt: "What is visible in the public tavern?",
    assistantMessage: "The public tavern is busy.",
    status: "completed" as const,
    contextScopes: ["public" as const],
    usage: { inputTokens: 9, outputTokens: 3, totalTokens: 12 },
  }) satisfies AiThread;
  store.state.aiThreads.push(gmThread, playerThread);

  const gmToolCall = createTimestamped("tool", {
    id: "tool_gm_private_failure",
    threadId: gmThread.id,
    toolName: "search_memory",
    input: { query: GM_SECRET_TOOL_INPUT, visibility: "gm_only" },
    output: { error: "tool_failed", message: GM_SECRET_TOOL_OUTPUT },
    status: "failed" as const,
    durationMs: 11,
  }) satisfies AiToolCall;
  const playerToolCall = createTimestamped("tool", {
    id: "tool_player_public_failure",
    threadId: playerThread.id,
    toolName: "search_memory",
    input: { query: "vault", visibility: "gm_only" },
    output: { error: "tool_failed", message: "Temporary public-history retry fixture" },
    status: "failed" as const,
    durationMs: 7,
  }) satisfies AiToolCall;
  store.state.aiToolCalls.push(gmToolCall, playerToolCall);

  const gmEvaluation = createTimestamped("eval", {
    id: "eval_gm_private_history",
    campaignId: CAMPAIGN_ID,
    userId: GM_USER_ID,
    threadId: gmThread.id,
    provider: gmThread.provider,
    name: GM_SECRET_EVALUATION,
    status: "failed" as const,
    score: 0,
    summary: GM_SECRET_EVALUATION,
    checks: [{ name: "gm-secret-check", status: "failed" as const, expected: GM_SECRET_PROMPT, actual: GM_SECRET_TOOL_OUTPUT }],
  }) satisfies AiEvaluationRun;
  const playerEvaluation = createTimestamped("eval", {
    id: "eval_player_public_history",
    campaignId: CAMPAIGN_ID,
    userId: PLAYER_USER_ID,
    threadId: playerThread.id,
    provider: playerThread.provider,
    name: "Player public history evaluation",
    status: "passed" as const,
    score: 1,
    summary: "Public history is available to its creator.",
    checks: [{ name: "public-check", status: "passed" as const, expected: true, actual: true }],
  }) satisfies AiEvaluationRun;
  store.state.aiEvaluations.push(gmEvaluation, playerEvaluation);

  return { store, gmThread, playerThread, gmToolCall, playerToolCall, gmEvaluation, playerEvaluation };
}

describe("AI operational-history authorization", () => {
  it("keeps GM-private prompts, raw tool data, evaluations, and usage out of assisted-player surfaces", async () => {
    const { store, gmThread, playerThread, gmToolCall, playerToolCall, gmEvaluation, playerEvaluation } = seedOperationalHistory();
    const app = await buildApp({ store });
    const playerHeaders = { "x-user-id": PLAYER_USER_ID };
    const gmHeaders = { "x-user-id": GM_USER_ID };

    try {
      const [playerThreads, playerToolCalls, playerUsage, playerEvaluations, playerSnapshot] = await Promise.all([
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/threads`, headers: playerHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/tool-calls`, headers: playerHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/usage`, headers: playerHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/evaluations`, headers: playerHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/snapshot`, headers: playerHeaders }),
      ]);

      for (const response of [playerThreads, playerToolCalls, playerUsage, playerEvaluations, playerSnapshot]) {
        expect(response.statusCode, response.body).toBe(200);
        const serialized = JSON.stringify(response.json());
        expect(serialized).not.toContain(GM_SECRET_PROMPT);
        expect(serialized).not.toContain(GM_SECRET_TOOL_INPUT);
        expect(serialized).not.toContain(GM_SECRET_TOOL_OUTPUT);
        expect(serialized).not.toContain(GM_SECRET_EVALUATION);
      }
      expect(playerThreads.json().map((thread: AiThread) => thread.id)).toEqual([playerThread.id]);
      expect(playerToolCalls.json().map((call: AiToolCall) => call.id)).toEqual([playerToolCall.id]);
      expect(playerUsage.json()).toMatchObject({ threadCount: 1, usage: { inputTokens: 9, outputTokens: 3, totalTokens: 12 } });
      expect(playerEvaluations.json()).toMatchObject({
        evaluationCount: 1,
        evaluations: [expect.objectContaining({ id: playerEvaluation.id, threadId: playerThread.id })],
      });
      expect(playerSnapshot.json().bundled).toMatchObject({
        aiThreads: [expect.objectContaining({ id: playerThread.id })],
        aiUsage: { threadCount: 1, usage: { totalTokens: 12 } },
        aiToolCalls: [expect.objectContaining({ id: playerToolCall.id })],
      });

      const [gmThreads, gmToolCalls, gmEvaluations, gmSnapshot] = await Promise.all([
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/threads`, headers: gmHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/tool-calls`, headers: gmHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/evaluations`, headers: gmHeaders }),
        app.inject({ method: "GET", url: `/api/v1/campaigns/${CAMPAIGN_ID}/snapshot`, headers: gmHeaders }),
      ]);
      for (const response of [gmThreads, gmToolCalls, gmEvaluations, gmSnapshot]) expect(response.statusCode, response.body).toBe(200);
      expect(gmThreads.json().map((thread: AiThread) => thread.id)).toEqual(expect.arrayContaining([gmThread.id, playerThread.id]));
      expect(gmToolCalls.json().map((call: AiToolCall) => call.id)).toEqual(expect.arrayContaining([gmToolCall.id, playerToolCall.id]));
      expect(gmEvaluations.json().evaluations).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: gmEvaluation.id }), expect.objectContaining({ id: playerEvaluation.id })]),
      );
      expect(JSON.stringify(gmSnapshot.json())).toContain(GM_SECRET_PROMPT);
      expect(JSON.stringify(gmSnapshot.json())).toContain(GM_SECRET_TOOL_INPUT);
    } finally {
      await app.close();
    }
  });

  it("hides GM retries and replays a visible failure with the current player's authority", async () => {
    const { store, gmToolCall, playerToolCall } = seedOperationalHistory();
    const app = await buildApp({ store });
    const playerHeaders = { "x-user-id": PLAYER_USER_ID };

    try {
      const hiddenRetry = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/tool-calls/${gmToolCall.id}/retry`,
        headers: { ...playerHeaders, "idempotency-key": "hidden-gm-tool-retry" },
        payload: { expectedUpdatedAt: gmToolCall.updatedAt },
      });
      expect(hiddenRetry.statusCode).toBe(404);
      expect(hiddenRetry.json()).toMatchObject({ error: "not_found" });
      expect(store.state.aiToolCalls.find((call) => call.id === gmToolCall.id)?.retry).toBeUndefined();

      const ownRetry = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${CAMPAIGN_ID}/ai/tool-calls/${playerToolCall.id}/retry`,
        headers: { ...playerHeaders, "idempotency-key": "player-tool-retry-current-authority" },
        payload: { expectedUpdatedAt: playerToolCall.updatedAt },
      });
      expect(ownRetry.statusCode, ownRetry.body).toBe(200);
      expect(ownRetry.json()).toMatchObject({
        matched: 1,
        retried: 1,
        completed: 0,
        failed: 1,
        toolCalls: [
          expect.objectContaining({
            id: playerToolCall.id,
            status: "failed",
            error: "missing_permission",
            resultCallId: expect.any(String),
          }),
        ],
      });

      const resultCallId = ownRetry.json().toolCalls[0].resultCallId as string;
      expect(store.state.aiToolCalls.find((call) => call.id === resultCallId)).toMatchObject({
        threadId: playerToolCall.threadId,
        toolName: "search_memory",
        input: { query: "vault", visibility: "gm_only" },
        status: "failed",
        output: { error: "missing_permission", permission: "ai.readGmMemory" },
      });
      expect(store.state.aiToolCalls.find((call) => call.id === playerToolCall.id)?.retry).toMatchObject({
        resultCallId,
        resultStatus: "failed",
      });
    } finally {
      await app.close();
    }
  });
});
