import type { Proposal } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api.js";
import { activityTracesFromEvents, aiAgentToolProgressText, appendReasoningDelta, codexAuthPromptFromError, isProposalNotFoundError, isSessionAuthError, reasoningTracesFromEvents, sceneIdToOpenAfterProposalApply, upsertAiAgentMessage } from "./ai-agent-event-utils.js";

describe("AI agent event utilities", () => {
  it("keeps authentication and error classification behavior at the extracted boundary", () => {
    expect(isSessionAuthError(new ApiError("Unauthorized", 401, {}, ""))).toBe(true);
    expect(isProposalNotFoundError(new ApiError("Proposal not found", 404, {}, ""))).toBe(true);
    expect(codexAuthPromptFromError(new ApiError("Sign in", 401, { error: "codex_auth_required", codexAuth: { type: "chatgptDeviceCode", verificationUrl: "https://example.test/sign-in", userCode: "ABCD" } }, "")))
      .toEqual({ type: "chatgptDeviceCode", verificationUrl: "https://example.test/sign-in", userCode: "ABCD", loginId: undefined, authUrl: undefined });
  });

  it("preserves ordered reasoning, activity, and streamed message merges", () => {
    expect(reasoningTracesFromEvents([{ type: "reasoning.delta", summaryIndex: 1, delta: "second" }, { type: "reasoning.delta", summaryIndex: 0, delta: "first" }])).toEqual(["first", "second"]);
    expect(appendReasoningDelta(["one"], 1, "two")).toEqual(["one", "two"]);
    expect(activityTracesFromEvents([{ type: "tool.started", toolName: "read_scene" }, { type: "tool.completed", toolName: "read_scene" }])).toEqual(["Reading scene...", "Reading scene complete."]);
    expect(aiAgentToolProgressText({ type: "ai.tool.completed", payload: { toolName: "use_actor_action", status: "failed" } })).toBe("Resolving actor action failed; continuing.");
    expect(upsertAiAgentMessage([{ id: "one", role: "assistant", content: "old", createdAt: "now", proposalIds: ["proposal"] }], { id: "one", role: "assistant", content: "new", createdAt: "now" })[0])
      .toMatchObject({ content: "new", proposalIds: ["proposal"] });
  });

  it("prefers an updated scene over a created scene after proposal application", () => {
    const proposal = { changesJson: [
      { entity: "scene", action: "create", data: { id: "created" } },
      { entity: "scene", action: "update", id: "updated", data: {} }
    ] } as Proposal;
    expect(sceneIdToOpenAfterProposalApply(proposal)).toBe("updated");
  });
});
