import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const apiSource = readFileSync(resolve(__dirname, "api.ts"), "utf8").replace(/\r\n/g, "\n");
const adminSource = readFileSync(resolve(__dirname, "admin-panel.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("workspace-bound async operations", () => {
  it("aborts registered work and drops results from an old campaign or user", () => {
    expect(appSource).toContain("async function runWorkspaceBoundAction<T>(");
    expect(appSource).toContain("const request = beginWorkspaceBoundRequest();");
    expect(appSource).toContain("if (!workspaceBoundRequestIsCurrent(request)) return;");
    expect(appSource).toContain("if (workspaceBoundRequestIsCurrent(request)) throw error;");
    expect(appSource).toContain("for (const controller of workspaceAbortControllersRef.current) controller.abort();");
  });

  it("clears workspace-specific operation state during identity changes", () => {
    expect(appSource).toContain("setAiAgentReferenceAssetId(undefined);");
    expect(appSource).toContain('setAdminStatus("Admin idle");');
    expect(appSource).toContain("setAdminSnapshot(undefined);");
    expect(appSource).toContain("setFailedAssetUpload(undefined);");
    expect(appSource).toContain('setAssetStatus("No asset action this session");');
    expect(appSource).toContain("setAudioSoundboardOpen(false);");
  });

  it("guards admin, asset, audio, and plugin completion paths", () => {
    expect(appSource).toContain("async function runWorkspaceAdminAction<T>(");
    expect(appSource).toContain("loadAdminSnapshot({ signal: request.controller.signal })");
    expect(appSource).toContain("apiUploadAsset({");
    expect(appSource).toContain("}, { signal: request.controller.signal })");
    expect(appSource).toContain("`/api/v1/audio/${track.id}`, { playing: !track.playing }, { signal: request.controller.signal }");
    expect(appSource).toContain("`/api/v1/campaigns/${request.campaignId}/plugins/${plugin.id}/install`");
    expect(appSource).toContain('"/api/v1/plugins/registry/sync", { campaignId: request.campaignId }, { signal: request.controller.signal }');
  });

  it("supports AbortSignal on every low-level API method used by these paths", () => {
    expect(apiSource).toContain("export async function apiGet<T>(path: string, options: ApiRequestOptions = {})");
    expect(apiSource).toContain("export async function apiPatch<T>(path: string, body: unknown, options: ApiRequestOptions = {})");
    expect(apiSource).toContain("export async function apiDelete<T>(path: string, options: ApiRequestOptions = {})");
    expect(apiSource).toContain("signal: options.signal");
    expect(apiSource).toContain("export async function loadAdminSnapshot(options: ApiRequestOptions = {})");
  });

  it("guards admin-panel-owned requests and local form state with a workspace epoch", () => {
    expect(appSource).toContain('workspaceKey={`${campaignId}:${currentUserId}`}');
    expect(adminSource).toContain("const workspaceEpochRef = useRef(0);");
    expect(adminSource).toContain("for (const controller of workspaceControllersRef.current) controller.abort();");
    expect(adminSource).toContain("async function runAdminWorkspaceRequest<T>(");
    expect(adminSource).toContain("if (!adminWorkspaceRequestIsCurrent(request)) return;");
    expect(adminSource).toContain("{ signal: request.controller.signal }");
    expect(adminSource).toContain('setStorageBackupStatus("No storage backup run");');
    expect(adminSource).toContain('setAuditExportStatus("No audit export run");');
  });

  it("guards actor actions and non-abortable board rendering across workspace switches", () => {
    expect(appSource).toContain("async function rollSystemCheck()");
    expect(appSource).toContain("async function useActorAction(rollId: string");
    expect(appSource).toContain("`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/roll`");
    expect(appSource).toContain("}, { signal: request.controller.signal })");
    expect(appSource).toContain("const dataUrl = await toPng(board");
    expect(appSource).toContain('if (!workspaceBoundRequestIsCurrent(request)) return "stale" as const;');
    expect(appSource).toContain("setAiAgentStatus(\"Agent ready\");");
    expect(appSource).toContain("if (result === \"sent\") setAiAgentStatus(\"Board capture sent\");");
  });

  it("clears and guards side-loaded lore state across campaign and user switches", () => {
    expect(appSource).toContain("function clearLoreWorkspaceState()");
    expect(appSource).toContain("loreRealtimeRefreshPendingRef.current = false;");
    expect(appSource).toContain('key={`worlds:${campaignId}:${currentUserId}`}');
    expect(appSource).toContain('key={`handouts:${campaignId}:${currentUserId}`}');
    expect(appSource).toContain('key={`sessions:${campaignId}:${currentUserId}`}');
    expect(appSource).toContain('key={`memory:${campaignId}:${currentUserId}`}');
    expect(appSource).toContain("const loreRequest = { campaignId, userId: currentUserId };");
    expect(appSource).toContain("workspaceRequestIsCurrent(loreRequest.campaignId, loreRequest.userId)");
    expect(appSource).toContain("if (workspaceRequestIsCurrent(campaignId, currentUserId)) setWorlds(nextWorlds);");
    expect(appSource).toContain("if (workspaceRequestIsCurrent(campaignId, currentUserId)) setHandouts(items);");
  });

  it("coalesces realtime world and handout events into a side-collection reload", () => {
    expect(appSource).toContain('event.type.startsWith("world.") || event.type.startsWith("handout.")');
    expect(appSource).toContain("if (loreRealtimeRefreshPendingRef.current)");
    expect(appSource).toContain("setLoreReloadVersion((version) => version + 1);");
  });
});
