import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const apiSource = readFileSync(resolve(__dirname, "api.ts"), "utf8").replace(/\r\n/g, "\n");
const adminSource = readFileSync(resolve(__dirname, "admin-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const workspaceBoundActionSource = readFileSync(resolve(__dirname, "workspace-bound-action.ts"), "utf8").replace(/\r\n/g, "\n");

describe("workspace-bound async operations", () => {
  it("aborts registered work and drops results from an old campaign or user", () => {
    expect(appSource).toContain("async function runWorkspaceBoundAction<T>(");
    expect(appSource).toContain("const request = beginWorkspaceBoundRequest();");
    expect(appSource).toContain("await settleWorkspaceBoundAction(request, workspaceBoundRequestIsCurrent, task, onCurrentResult, finishWorkspaceBoundRequest);");
    expect(workspaceBoundActionSource).toContain("if (!isCurrent(request)) return;");
    expect(workspaceBoundActionSource).toContain("if (isCurrent(request)) throw error;");
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

  it("reports committed plugin, character-import, and proposal actions separately from reconciliation failures", () => {
    expect(appSource).toContain("Reload to reconcile plugin state.");
    expect(appSource).toContain("applyActorToSnapshot(imported.actor);");
    expect(appSource).toContain("Proposal changes reverted; background refresh failed:");
    expect(appSource).toContain('key={`encounter-builder:${selectedCampaign.id}:${currentUserId}:${encounterBuilderSystem.id}`}');
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

  it("drops token-vision mutation responses after the campaign or user changes", () => {
    expect(appSource).toContain("const tokenId = selectedToken.id;");
    expect(appSource).toContain("`/api/v1/tokens/${tokenId}`, patch, { signal: request.controller.signal }");
    expect(appSource).toContain("if (updated.id !== tokenId) return;");
    expect(appSource).toContain("return applied;");
  });

  it("routes item mutations through abortable workspace-bound requests", () => {
    const updateItemBody = appSource.slice(appSource.indexOf("async function updateItemData"), appSource.indexOf("async function assignItemToActor"));
    const assignItemBody = appSource.slice(appSource.indexOf("async function assignItemToActor"), appSource.indexOf("function canAssignItemFromSheet"));
    for (const body of [updateItemBody, assignItemBody]) {
      expect(body).toContain("await runWorkspaceBoundAction(");
      expect(body).toContain("{ signal: request.controller.signal }");
      expect(body).toContain("applyItemToSnapshot(updated);");
    }
  });

  it("guards item-producing compendium imports and purchases across identity changes", () => {
    const importBody = appSource.slice(appSource.indexOf("async function importCompendiumEntry"), appSource.indexOf("async function purchaseCompendiumEntry"));
    const purchaseBody = appSource.slice(appSource.indexOf("async function purchaseCompendiumEntry"), appSource.indexOf("async function createCharacterFromTemplate"));
    for (const body of [importBody, purchaseBody]) {
      expect(body).toContain("await runWorkspaceBoundAction(");
      expect(body).toContain("request.campaignId");
      expect(body).toContain("{ signal: request.controller.signal }");
      expect(body).toContain("await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);");
    }
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
    expect(appSource).toContain("if (workspaceRequestIsCurrent(campaignId, currentUserId)) setHandouts(update);");
  });

  it("coalesces realtime world and handout events into a side-collection reload", () => {
    expect(appSource).toContain('event.type.startsWith("world.") || event.type.startsWith("handout.")');
    expect(appSource).toContain("if (loreRealtimeRefreshPendingRef.current)");
    expect(appSource).toContain("setLoreReloadVersion((version) => version + 1);");
  });

  it("drops stale demo-session login completions before they can overwrite credentials", () => {
    expect(appSource).toContain("const sessionSwitchSeqRef = useRef(0);");
    expect(appSource).toContain("const requestId = beginSessionSwitch(sessionSwitchSeqRef, realtimeSelectionRef.current.userId, userId);");
    expect(appSource).toContain("if (requestId === undefined) return;");
    expect(appSource).toContain("const requestIsCurrent = () => {");
    expect(appSource).toContain("const login = await loginSession(userId, { persist: false, signal: controller.signal }).catch");
    expect(appSource).toContain("if (!requestIsCurrent()) return undefined;");
    expect(appSource).toContain("if (!login || !requestIsCurrent()) return;");
    expect(appSource.indexOf("if (!login || !requestIsCurrent()) return;")).toBeLessThan(appSource.indexOf("storeSession(login);"));
  });

  it("invalidates pending credential work on logout and identity changes", () => {
    expect(appSource).toContain("function invalidatePendingSessionSwitch()");
    expect(appSource).toContain("sessionSwitchAbortRef.current?.abort();");
    const logoutBody = appSource.slice(appSource.indexOf("async function submitLogout()"), appSource.indexOf("async function submitPasswordChange()"));
    expect(logoutBody.indexOf("invalidatePendingSessionSwitch();")).toBeLessThan(logoutBody.indexOf("await logoutSession();"));
    expect(appSource).toContain("loginSession(userId, { persist: false, signal: controller.signal })");
    expect(appSource).toContain("changePasswordSession({");
    expect(appSource).toContain("}, { persist: false, signal: request.controller.signal })");
  });

  it("cancels delayed invite acceptance before every authenticated credential or workspace rotation", () => {
    for (const [start, end] of ([
      ["async function switchSession(userId: string)", "async function switchActiveOrganization"],
      ["async function switchActiveOrganization", "async function createWorkspace"],
      ["async function createWorkspace", "function nextBlankCanvasDemoId"],
      ["async function submitPasswordChange", "async function startMfaEnrollment"]
    ] as const)) {
      const body = appSource.slice(appSource.indexOf(start), appSource.indexOf(end));
      expect(body).toContain("cancelInviteAcceptance();");
    }
  });

  it("clears account secrets and scopes MFA completions to the active session", () => {
    expect(appSource).toContain("function clearAccountSecurityState()");
    expect(appSource).toContain('setMfaSecret("");');
    expect(appSource).toContain("setMfaRecoveryCodes([]);");
    expect(appSource).toContain("loadMfaStatus({ signal: request.controller.signal })");
    expect(appSource).toContain("enrollTotpMfa({ currentPassword: mfaPassword }, { signal: request.controller.signal })");
    expect(appSource).toContain("confirmTotpMfa({ code: mfaCode.trim() }, { signal: request.controller.signal })");
    expect(apiSource).toContain("export async function loadMfaStatus(options: ApiRequestOptions = {})");
  });

  it("protects unsaved Scene Manager drafts from indirect workspace changes", () => {
    expect(appSource).toContain("const hasUnsavedSceneDraft = workspaceMode === \"manage\" && manageCategory === \"scenes\" && sceneEditDirty;");
    expect(appSource).toContain('blockUnsavedSceneDraft("switching sessions")');
    expect(appSource).toContain('blockUnsavedSceneDraft("switching workspaces")');
    expect(appSource).toContain('blockUnsavedSceneDraft("applying a scene proposal")');
    expect(appSource).toContain('window.addEventListener("beforeunload", warnBeforeUnload);');
  });
});
