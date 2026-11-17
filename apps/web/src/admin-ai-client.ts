import { apiPost } from "./api.js";
import { operatorMutationKey } from "./admin-identity-client.js";

export interface AdminAiStaleMutationResult {
  matched: number;
  updated: number;
}

export interface AdminAiToolRetryResult {
  matched: number;
  retried: number;
  skipped: number;
  completed: number;
  failed: number;
}

interface PreparedAdminAiResult {
  targetSetHash: string;
}

async function preparedAdminAiOperation<TResult extends PreparedAdminAiResult>(
  path: string,
  operation: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<TResult> {
  const preview = await apiPost<TResult>(
    path,
    { ...input, dryRun: true },
    {
      signal,
      idempotencyKey: operatorMutationKey(`${operation}-preview`, "all"),
    },
  );
  if (!/^sha256:[a-f0-9]{64}$/.test(preview.targetSetHash)) {
    throw new Error(`AI operation ${operation} preview did not return a valid target-set hash`);
  }
  return apiPost<TResult>(
    path,
    { ...input, dryRun: false, expectedTargetSetHash: preview.targetSetHash },
    {
      signal,
      idempotencyKey: operatorMutationKey(`${operation}-execute`, preview.targetSetHash),
    },
  );
}

export function retryAdminAiToolCall(toolCallId: string, signal?: AbortSignal): Promise<AdminAiToolRetryResult & PreparedAdminAiResult> {
  return preparedAdminAiOperation("/api/v1/admin/ai/tool-calls/retry", "admin-ai-tool-call-retry", { toolCallId }, signal);
}

export function failStaleAdminAiThreads(signal?: AbortSignal): Promise<AdminAiStaleMutationResult & PreparedAdminAiResult> {
  return preparedAdminAiOperation("/api/v1/admin/ai/threads/stale/fail", "admin-ai-stale-threads-fail", {}, signal);
}

export function failStaleAdminAiToolCalls(signal?: AbortSignal): Promise<AdminAiStaleMutationResult & PreparedAdminAiResult> {
  return preparedAdminAiOperation("/api/v1/admin/ai/tool-calls/stale/fail", "admin-ai-stale-tool-calls-fail", {}, signal);
}

export function rejectStaleAdminAiProposals(includeApproved: boolean, signal?: AbortSignal): Promise<AdminAiStaleMutationResult & PreparedAdminAiResult> {
  return preparedAdminAiOperation(
    "/api/v1/admin/ai/proposals/stale/reject",
    "admin-ai-stale-proposals-reject",
    { includeApproved },
    signal,
  );
}
