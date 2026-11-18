import type { ChatMessage, RollableTable, RollableTableInput } from "@open-tabletop/core";
import { apiDelete, apiPatch, apiPost, type Snapshot } from "./api.js";
import type { AppendMutationAttempt } from "./append-mutation-idempotency.js";
import { removeRealtimeRecord, upsertBoundedRealtimeRecord, upsertNewestRealtimeRecord } from "./realtime-snapshot-delta.js";
import type { WorkspaceBoundRequest } from "./workspace-bound-action.js";

export type TableMutation =
  | { kind: "create"; input: RollableTableInput }
  | { kind: "update"; tableId: string; expectedUpdatedAt: string; input: RollableTableInput }
  | { kind: "delete"; tableId: string; expectedUpdatedAt: string }
  | { kind: "draw"; tableId: string; visibility: RollableTable["visibility"] };

export async function submitTableMutation(
  request: WorkspaceBoundRequest, mutation: TableMutation,
  begin: (scope: string, intent: unknown) => AppendMutationAttempt,
  complete: (scope: string, attempt: AppendMutationAttempt) => void,
): Promise<(current: Snapshot) => Snapshot> {
  const collection = `/api/v1/campaigns/${encodeURIComponent(request.campaignId)}/rollable-tables`;
  const resource = mutation.kind === "create" ? collection : `${collection}/${encodeURIComponent(mutation.tableId)}`;
  const path = mutation.kind === "draw" ? resource + "/draw" : resource;
  const scope = `rollable-table:${mutation.kind}:${path}`;
  const attempt = begin(scope, { userId: request.userId, mutation });
  const options = { idempotencyKey: attempt.idempotencyKey, signal: request.controller.signal };
  if (mutation.kind === "draw") {
    const message = await apiPost<ChatMessage>(path, { visibility: mutation.visibility }, options);
    complete(scope, attempt);
    return (current) => ({ ...current, chat: upsertBoundedRealtimeRecord(current.chat, message) });
  }
  let table: RollableTable;
  if (mutation.kind === "delete") table = await apiDelete(`${path}?${new URLSearchParams({ expectedUpdatedAt: mutation.expectedUpdatedAt })}`, options);
  else if (mutation.kind === "update") table = await apiPatch(path, { ...mutation.input, expectedUpdatedAt: mutation.expectedUpdatedAt }, options);
  else table = await apiPost(path, mutation.input, options);
  complete(scope, attempt);
  return (current) => {
    const tables = current.rollableTables ?? [];
    return { ...current, rollableTables: mutation.kind === "delete" ? removeRealtimeRecord(tables, table.id) : upsertNewestRealtimeRecord(tables, table) };
  };
}
