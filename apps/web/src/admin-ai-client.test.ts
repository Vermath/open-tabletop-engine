import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  failStaleAdminAiThreads,
  failStaleAdminAiToolCalls,
  rejectStaleAdminAiProposals,
  retryAdminAiToolCall,
} from "./admin-ai-client.js";
import { apiPost } from "./api.js";

vi.mock("./api.js", () => ({ apiPost: vi.fn() }));

const targetSetHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("admin AI mutation client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiPost).mockImplementation(async (_path, body) => ({
      targetSetHash,
      dryRun: (body as { dryRun?: boolean }).dryRun,
      matched: 1,
      updated: 1,
      retried: 1,
      skipped: 0,
      completed: 1,
      failed: 0,
    }) as never);
  });

  it("previews and executes every destructive AI operator action with an exact target-set fence", async () => {
    await retryAdminAiToolCall("tool_one");
    await failStaleAdminAiThreads();
    await failStaleAdminAiToolCalls();
    await rejectStaleAdminAiProposals(true);

    expect(apiPost).toHaveBeenCalledTimes(8);
    const calls = vi.mocked(apiPost).mock.calls;
    for (let index = 0; index < calls.length; index += 2) {
      expect(calls[index]?.[1]).toMatchObject({ dryRun: true });
      expect(calls[index + 1]?.[1]).toMatchObject({
        dryRun: false,
        expectedTargetSetHash: targetSetHash,
      });
      expect(calls[index]?.[2]?.idempotencyKey).toBeTruthy();
      expect(calls[index + 1]?.[2]?.idempotencyKey).toBeTruthy();
    }
    expect(calls[0]?.[1]).toMatchObject({ toolCallId: "tool_one" });
    expect(calls[6]?.[1]).toMatchObject({ includeApproved: true });
  });

  it("stops before execution when the preview preparation token is malformed", async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ targetSetHash: "invalid" } as never);

    await expect(failStaleAdminAiThreads()).rejects.toThrow(
      "AI operation admin-ai-stale-threads-fail preview did not return a valid target-set hash",
    );
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});
