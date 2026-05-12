import type { Actor, AiMemoryFact, AiThread, AiToolCall, Campaign, ChatMessage, Combat, ContentImportBatch, ContentImportEntityKind, EmailOutboxMessage, Encounter, FogHistoryEntry, FogMode, FogPreset, Item, JournalEntry, MapAsset, PermissionName, Proposal, Scene, ScimAssignableRole, Token, UserRole, VisionPoint, VisionPointSample, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";
import { Activity, Bot, Boxes, BrickWall, Check, ChevronRight, Download, Eraser, Eye, FileText, Hand, KeyRound, Lightbulb, LockKeyhole, Mail, MessageSquare, Paintbrush, Pentagon, Plus, RefreshCw, RotateCcw, ScrollText, Send, Shield, Swords, Timer, Upload, UserCog, UserPlus, Users, UserX, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { acceptInviteSession, apiDelete, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, confirmPasswordResetSession, consumeSsoRedirect, getSessionToken, getSessionUserId, loadAdminSnapshot, loadOidcConfig, loadSnapshot, loginSession, requestPasswordReset, setSessionUserId, startOidcLogin, type AdminAssetIntegrityQuarantineResult, type AdminEmailOutboxRetryAllResult, type AdminPasswordResetInfo, type AdminPluginReviewInfo, type AdminScimGroupRoleMapping, type AdminScimGroupRoleMappingInput, type AdminScimGroupRoleMappingResult, type AdminSessionInfo, type AdminSnapshot, type AdminUserInfo, type AiUsageSummary, type CharacterTemplateInfo, type EncounterPlanInfo, type InviteCreateInfo, type PluginReviewStatus, type PluginRuntimeInfo, type Snapshot, type SystemRuntimeInfo } from "./api.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";

function initialResetToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

function initialResetMode(): boolean {
  return window.location.pathname.endsWith("/reset-password") || initialResetToken().startsWith("opr_");
}

function clearResetUrl(): void {
  const nextPath = window.location.pathname.endsWith("/reset-password") ? "/" : window.location.pathname;
  window.history.replaceState(null, "", nextPath || "/");
}

type CampaignImportResult = {
  importedCampaignIds: string[];
  counts: Record<string, number>;
  conflicts: Array<{ collection: string; id: string }>;
  assetFiles: number;
};

function summarizeImport(result: CampaignImportResult): string {
  const collections = ["campaigns", "members", "scenes", "tokens", "actors", "journals", "handouts", "chat", "rolls", "combats", "contentImports"];
  const changed = collections.map((collection) => [collection, result.counts[collection] ?? 0] as const).filter(([, count]) => count > 0);
  const summary = changed.slice(0, 5).map(([collection, count]) => `${count} ${collection}`).join(", ");
  const suffix = result.assetFiles > 0 ? `; restored ${result.assetFiles} asset files` : "";
  return summary ? `${summary}${suffix}` : `No campaign records changed${suffix}`;
}

function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function contentImportEntityData(kind: ContentImportEntityKind, body: string): Record<string, unknown> {
  const trimmedBody = body.trim();
  if (kind === "actor") {
    return {
      type: "npc",
      data: {
        notes: trimmedBody,
        hp: { current: 1, max: 1 }
      }
    };
  }
  if (kind === "item") {
    return {
      type: "loot",
      data: {
        notes: trimmedBody,
        quantity: 1
      }
    };
  }
  return {
    body: trimmedBody,
    visibility: "gm_only",
    tags: ["content-import"]
  };
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    campaigns: [],
    members: [],
    scenes: [],
    fogPresets: [],
    assets: [],
    tokens: [],
    actors: [],
    items: [],
    journals: [],
    chat: [],
    encounters: [],
    combats: [],
    proposals: [],
    contentImports: [],
    memory: [],
    aiThreads: [],
    aiToolCalls: [],
    plugins: [],
    systems: [],
    characterTemplates: []
  });
  const [currentUserId, setCurrentUserId] = useState(getSessionUserId());
  const [sessionToken, setSessionToken] = useState(getSessionToken());
  const [campaignId, setCampaignId] = useState("camp_demo");
  const [sceneId, setSceneId] = useState("scn_vault_entry");
  const [selectedTokenId, setSelectedTokenId] = useState("tok_valen");
  const [fogBrushMode, setFogBrushMode] = useState<FogMode | null>(null);
  const [tab, setTab] = useState<"actors" | "journal" | "combat" | "content" | "ai" | "plugins" | "admin">("actors");
  const [status, setStatus] = useState("Loading campaign");
  const [diceFormula, setDiceFormula] = useState("1d20+5");
  const [chatBody, setChatBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState("Draft a balanced vault guardian encounter for this party.");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("player");
  const [inviteToken, setInviteToken] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [resetMode, setResetMode] = useState(initialResetMode());
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState(initialResetToken());
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetStatus, setResetStatus] = useState("Ready");
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot>();
  const [adminStatus, setAdminStatus] = useState("Admin idle");
  const [encounterPlan, setEncounterPlan] = useState<EncounterPlanInfo>();
  const [importedActor, setImportedActor] = useState<Actor>();
  const [importStatus, setImportStatus] = useState("No archive imported this session");
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [contentImportKind, setContentImportKind] = useState<ContentImportEntityKind>("journal");
  const [contentImportName, setContentImportName] = useState("");
  const [contentImportBody, setContentImportBody] = useState("");
  const [contentImportStatus, setContentImportStatus] = useState("No content import previewed this session");

  const selectedCampaign = snapshot.campaigns.find((campaign) => campaign.id === campaignId);
  const selectedScene = snapshot.scenes.find((scene) => scene.id === sceneId);
  const selectedMapAsset = snapshot.assets.find((asset) => asset.id === selectedScene?.backgroundAssetId);
  const selectedToken = snapshot.tokens.find((token) => token.id === selectedTokenId);
  const activeSystemId = snapshot.systems.find((system) => system.active)?.id ?? selectedCampaign?.defaultSystemId;
  const selectedActor = snapshot.actors.find((actor) => actor.id === selectedToken?.actorId) ?? snapshot.actors.find((actor) => actor.systemId === activeSystemId) ?? snapshot.actors[0];
  const selectedActorItems = snapshot.items.filter((item) => item.actorId === selectedActor?.id);
  const activeCombat = snapshot.combats.find((combat) => combat.active);
  const currentMember = snapshot.members.find((member) => member.user.id === currentUserId);
  const hasPermission = (permission: PermissionName) => currentMember?.permissions.includes(permission) ?? false;
  const canUpdateSelectedActor = hasPermission("actor.update") || (selectedActor?.ownerUserId === currentUserId && hasPermission("actor.updateOwned"));

  async function refresh(nextCampaignId = campaignId, nextSceneId = sceneId) {
    const next = await loadSnapshot(nextCampaignId, nextSceneId);
    setSnapshot(next);
    setSessionToken(getSessionToken());
    const campaign = next.campaigns.find((item) => item.id === nextCampaignId) ?? next.campaigns[0];
    const scene = next.scenes.find((item) => item.id === nextSceneId) ?? next.scenes.find((item) => item.active) ?? next.scenes[0];
    if (campaign) setCampaignId(campaign.id);
    if (scene) setSceneId(scene.id);
    const token = next.tokens.find((item) => item.id === selectedTokenId) ?? next.tokens[0];
    setSelectedTokenId(token?.id ?? "");
    setStatus("Synced");
  }

  async function refreshAdmin() {
    setAdminStatus("Loading admin operations");
    const next = await loadAdminSnapshot();
    setAdminSnapshot(next);
    setAdminStatus("Admin operations synced");
  }

  useEffect(() => {
    if (resetMode) return;
    const ssoUserId = consumeSsoRedirect();
    if (ssoUserId) {
      setCurrentUserId(ssoUserId);
      setSessionToken(getSessionToken());
    }
    loadOidcConfig()
      .then((config) => setSsoEnabled(config.enabled))
      .catch(() => setSsoEnabled(false));
    refresh().catch((error) => setStatus(`API offline: ${error instanceof Error ? error.message : String(error)}`));
  }, [resetMode]);

  useEffect(() => {
    if (!campaignId || !sessionToken) return;
    const wsUrl = `${apiBase || window.location.origin}`.replace(/^http/, "ws") + `/api/v1/realtime?campaignId=${campaignId}&sessionToken=${encodeURIComponent(sessionToken)}`;
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => setStatus("Realtime connected");
    socket.onmessage = () => {
      refresh().catch(() => setStatus("Realtime refresh failed"));
    };
    socket.onerror = () => setStatus("Realtime unavailable");
    return () => socket.close();
  }, [campaignId, sceneId, sessionToken]);

  useEffect(() => {
    if (tab !== "admin" || !snapshot.session?.serverAdmin) return;
    refreshAdmin().catch((error) => setAdminStatus(error instanceof Error ? error.message : String(error)));
  }, [tab, snapshot.session?.serverAdmin]);

  useEffect(() => {
    if (tab === "admin" && snapshot.session && !snapshot.session.serverAdmin) setTab("ai");
  }, [tab, snapshot.session?.serverAdmin, snapshot.session?.user.id]);

  async function switchSession(userId: string) {
    setSessionUserId(userId);
    const login = await loginSession(userId);
    setSessionToken(login.token);
    setCurrentUserId(userId);
    setStatus("Switching session");
    await refresh(campaignId, sceneId);
  }

  async function startSso() {
    const login = await startOidcLogin();
    window.location.href = login.authorizationUrl;
  }

  async function submitResetRequest() {
    await requestPasswordReset(resetEmail.trim());
    setResetStatus("Reset email queued");
  }

  async function submitResetConfirm() {
    if (resetPassword !== resetPasswordConfirm) {
      setResetStatus("Passwords do not match");
      return;
    }
    const login = await confirmPasswordResetSession({
      token: resetToken.trim(),
      password: resetPassword
    });
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setResetToken("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetMode(false);
    clearResetUrl();
    setStatus("Password reset complete");
    await refresh();
  }

  async function createInvite() {
    const result = await apiPost<InviteCreateInfo>(`/api/v1/campaigns/${campaignId}/invites`, {
      email: inviteEmail.trim() || undefined,
      role: inviteRole
    });
    setInviteToken(result.token);
    setStatus("Invite created");
  }

  async function acceptInvite() {
    const result = await acceptInviteSession({
      token: joinToken.trim(),
      email: joinEmail.trim(),
      displayName: joinName.trim(),
      password: joinPassword
    });
    setCurrentUserId(result.user.id);
    setSessionToken(result.token);
    setCampaignId(result.campaign.id);
    setJoinToken("");
    setJoinEmail("");
    setJoinName("");
    setJoinPassword("");
    setStatus("Invite accepted");
    await refresh(result.campaign.id);
  }

  async function createScene() {
    const scene = await apiPost<Scene>(`/api/v1/campaigns/${campaignId}/scenes`, {
      name: `Scene ${snapshot.scenes.length + 1}`,
      active: snapshot.scenes.length === 0
    });
    setSceneId(scene.id);
    await refresh(campaignId, scene.id);
  }

  async function createToken() {
    if (!selectedScene) return;
    const token = await apiPost<Token>(`/api/v1/scenes/${selectedScene.id}/tokens`, {
      name: "New Token",
      x: 180,
      y: 180,
      disposition: "neutral"
    });
    setSelectedTokenId(token.id);
    await refresh();
  }

  async function importCampaignArchive(file: File, input: HTMLInputElement) {
    setIsImportingArchive(true);
    setImportStatus(`Importing ${file.name}`);
    setStatus("Importing archive");
    try {
      const archive = JSON.parse(await file.text()) as unknown;
      const result = await apiPost<CampaignImportResult>("/api/v1/import/campaign", archive);
      const nextCampaignId = result.importedCampaignIds[0] ?? campaignId;
      setImportStatus(`${file.name}: ${summarizeImport(result)}`);
      setStatus(result.conflicts.length > 0 ? `Imported with ${result.conflicts.length} conflicts` : "Archive imported");
      await refresh(nextCampaignId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportStatus(`${file.name}: ${message}`);
      setStatus("Archive import failed");
    } finally {
      setIsImportingArchive(false);
      input.value = "";
    }
  }

  async function updateSelectedTokenVision(patch: Partial<Pick<Token, "visionEnabled" | "visionRadius" | "brightVisionRadius" | "dimVisionRadius">>) {
    if (!selectedToken) return;
    await apiPatch<Token>(`/api/v1/tokens/${selectedToken.id}`, patch);
    await refresh();
  }

  async function uploadMap(file: File) {
    if (!selectedScene) return;
    await apiUploadAsset({
      campaignId,
      sceneId: selectedScene.id,
      file,
      setAsBackground: true
    });
    setStatus("Map uploaded");
    await refresh(campaignId, selectedScene.id);
  }

  async function revealFog() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      x: center.x,
      y: center.y,
      radius: 160,
      mode: "reveal",
      hidden: false
    });
    setStatus("Fog updated");
    await refresh();
  }

  async function hideFog() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      x: center.x,
      y: center.y,
      radius: 95,
      mode: "hide",
      hidden: false
    });
    setStatus("Fog hidden");
    await refresh();
  }

  async function revealFogPolygon() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const radius = selectedScene.gridSize * 3;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "polygon",
      mode: "reveal",
      points: [
        { x: center.x, y: center.y - radius },
        { x: center.x + radius, y: center.y },
        { x: center.x, y: center.y + radius },
        { x: center.x - radius, y: center.y }
      ]
    });
    setStatus("Fog polygon revealed");
    await refresh();
  }

  function toggleFogBrush(mode: FogMode) {
    setFogBrushMode((current) => {
      const next = current === mode ? null : mode;
      setStatus(next ? `${next === "hide" ? "Hide" : "Reveal"} smooth fog brush active` : "Fog brush inactive");
      return next;
    });
  }

  function selectCanvasTool() {
    setFogBrushMode(null);
    setStatus("Select tool active");
  }

  async function paintFogStroke(mode: FogMode, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "brush",
      mode,
      brushRadius: Math.max(28, Math.min(110, selectedScene.gridSize * 1.35)),
      points
    });
    setStatus(`${mode === "hide" ? "Hide" : "Reveal"} fog brush applied`);
    await refresh();
  }

  async function undoFog() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog/undo`, {});
    setStatus("Fog change undone");
    await refresh();
  }

  async function showFogHistory() {
    if (!selectedScene) return;
    const history = await apiGet<FogHistoryEntry[]>(`/api/v1/scenes/${selectedScene.id}/fog/history`);
    const recent = history.slice(-8).reverse();
    window.alert(
      recent.length
        ? `Recent fog history:\n${recent.map(formatFogHistoryEntry).join("\n")}`
        : "No fog history for this scene."
    );
  }

  async function sampleVisionPoint() {
    if (!selectedScene) return;
    const fallbackPoint = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const point = chooseVisionSamplePoint(selectedScene, fallbackPoint);
    if (!point) return;
    const sample = await apiGet<VisionPointSample>(`/api/v1/scenes/${selectedScene.id}/vision/sample?x=${Math.round(point.x)}&y=${Math.round(point.y)}`);
    window.alert(formatVisionPointSample(sample));
  }

  async function saveFogPreset() {
    if (!selectedScene) return;
    const name = window.prompt("Preset name", `${selectedScene.name} fog preset`)?.trim();
    if (!name) return;
    await apiPost(`/api/v1/campaigns/${campaignId}/fog-presets`, {
      name,
      sceneId: selectedScene.id
    });
    setStatus("Fog preset saved");
    await refresh();
  }

  async function applyFogPreset() {
    if (!selectedScene) return;
    const preset = snapshot.fogPresets.length === 1 ? snapshot.fogPresets[0] : chooseFogPreset(snapshot.fogPresets);
    if (!preset) return;
    const mode = chooseFogPresetApplyMode();
    if (!mode) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog/apply-preset`, {
      presetId: preset.id,
      mode
    });
    setStatus(`${mode === "append" ? "Appended" : "Applied"} ${preset.name}`);
    await refresh();
  }

  async function deleteFogPreset() {
    const preset = snapshot.fogPresets.length === 1 ? snapshot.fogPresets[0] : chooseFogPreset(snapshot.fogPresets);
    if (!preset) return;
    const confirmed = window.confirm(`Delete fog preset "${preset.name}"?`);
    if (!confirmed) return;
    await apiDelete(`/api/v1/campaigns/${campaignId}/fog-presets/${preset.id}`);
    setStatus(`Deleted ${preset.name}`);
    await refresh();
  }

  async function addWall() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.25),
      y1: Math.round(selectedScene.height * 0.28),
      x2: Math.round(selectedScene.width * 0.75),
      y2: Math.round(selectedScene.height * 0.28),
      blocksVision: true
    });
    setStatus("Wall added");
    await refresh();
  }

  async function addTerrainWall() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.28),
      y1: Math.round(selectedScene.height * 0.42),
      x2: Math.round(selectedScene.width * 0.72),
      y2: Math.round(selectedScene.height * 0.42),
      blocksVision: true,
      blocksMovement: false,
      kind: "terrain"
    });
    setStatus("Terrain wall added");
    await refresh();
  }

  async function addLight() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/lights`, {
      x: selectedToken ? selectedToken.x + selectedToken.width / 2 : selectedScene.width / 2,
      y: selectedToken ? selectedToken.y + selectedToken.height / 2 : selectedScene.height / 2,
      radius: 210,
      brightRadius: 80,
      dimRadius: 210,
      color: "#38bdf8",
      intensity: 0.32
    });
    setStatus("Dual-zone light added");
    await refresh();
  }

  async function updateActorHp(actor: Actor, current: number) {
    const hp = actor.data.hp as { current?: number; max?: number } | undefined;
    await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, {
      data: { ...actor.data, hp: { current, max: hp?.max ?? current } }
    });
    await refresh();
  }

  async function rollDice() {
    const roll = await apiPost<{ total: number }>("/api/v1/dice/roll", {
      campaignId,
      formula: diceFormula,
      visibility: "public",
      label: "Table roll"
    });
    setStatus(`Rolled ${roll.total}`);
    await refresh();
  }

  async function sendChat() {
    if (!chatBody.trim()) return;
    await apiPost<ChatMessage>("/api/v1/chat/messages", {
      campaignId,
      body: chatBody,
      type: "plain"
    });
    setChatBody("");
    await refresh();
  }

  async function createJournal() {
    await apiPost<JournalEntry>(`/api/v1/campaigns/${campaignId}/journal`, {
      title: "New Secret",
      body: "A new GM-only note.",
      visibility: "gm_only",
      tags: ["prep"]
    });
    await refresh();
  }

  async function startCombat() {
    const combatants = snapshot.tokens.map((token, index) => ({
      id: `cmbt_${token.id}`,
      tokenId: token.id,
      actorId: token.actorId,
      name: token.name,
      initiative: 20 - index,
      defeated: false
    }));
    await apiPost<Combat>(`/api/v1/campaigns/${campaignId}/combats`, {
      combatants
    });
    setTab("combat");
    await refresh();
  }

  async function askAi() {
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/encounter-design`, {
      prompt: aiPrompt,
      difficulty: "standard"
    });
    setStatus("Encounter proposal drafted");
    await refresh();
  }

  async function recapSession() {
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/session-recap`, {});
    setStatus("Session recap queued for approval");
    await refresh();
  }

  async function extractMemory() {
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/memory/extract`, {
      sourceText: aiPrompt.trim() || undefined
    });
    setStatus("Memory extraction queued");
    await refresh();
  }

  async function approveAndApply(proposal: Proposal) {
    await apiPost(`/api/v1/proposals/${proposal.id}/approve`, {});
    await apiPost(`/api/v1/proposals/${proposal.id}/apply`, {});
    setStatus("Proposal applied");
    await refresh();
  }

  async function rejectProposalReview(proposal: Proposal) {
    await apiPost(`/api/v1/proposals/${proposal.id}/reject`, {});
    setStatus("Proposal rejected");
    await refresh();
  }

  async function approveMemory(fact: AiMemoryFact) {
    await apiPost(`/api/v1/ai/memory/${fact.id}/approve`, {});
    setStatus("Memory approved");
    await refresh();
  }

  async function installPlugin(plugin: PluginRuntimeInfo) {
    await apiPost(`/api/v1/campaigns/${campaignId}/plugins/${plugin.id}/install`, {});
    setStatus(`${plugin.name} installed`);
    await refresh();
  }

  async function installSystem(system: SystemRuntimeInfo) {
    await apiPost(`/api/v1/campaigns/${campaignId}/systems/${system.id}/install`, {});
    setStatus(`${system.name} activated`);
    await refresh();
  }

  async function runPluginCommand(plugin: PluginRuntimeInfo, command: string) {
    await apiPost(`/api/v1/campaigns/${campaignId}/plugins/${plugin.id}/chat-command`, {
      command,
      args: "from the browser tabletop"
    });
    setStatus(`${plugin.name} command ran`);
    await refresh();
  }

  async function rollSystemCheck() {
    if (!selectedActor) return;
    await apiPost(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/roll`, {
      rollId: systemRollId(selectedActor.systemId)
    });
    setStatus("System roll posted");
    await refresh();
  }

  async function useActorAction(rollId: string) {
    if (!selectedActor) return;
    const used = await apiPost<{ usage?: { consumed?: Array<{ label: string; remaining: number }> } }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/roll`, {
      rollId,
      consumeResources: true
    });
    const spent = used.usage?.consumed?.map((item) => `${item.label} ${item.remaining}`).join(", ");
    setStatus(spent ? `${selectedActor.name} used action: ${spent}` : `${selectedActor.name} action posted`);
    await refresh();
  }

  async function createCharacterFromTemplate(template: CharacterTemplateInfo) {
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${template.systemId}/characters`, {
      templateId: template.id,
      name: template.name,
      ownerUserId: currentUserId
    });
    setStatus(`${created.actor.name} created`);
    await refresh();
  }

  async function importSystemCharacter() {
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (!system) return;
    const payload = systemImportPayload(system.id, currentUserId);
    const imported = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/characters/import`, payload);
    setImportedActor(imported.actor);
    setStatus(`${imported.actor.name} imported`);
    await refresh();
  }

  async function advanceSelectedActor() {
    if (!selectedActor) return;
    const optionId = systemAdvancementOptionId(selectedActor.systemId);
    const advanced = await apiPost<{ advancement: { name: string } }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/advance`, {
      optionId
    });
    setStatus(`${selectedActor.name} advanced to ${advanced.advancement.name}`);
    await refresh();
  }

  async function restSelectedActor(restType: "short" | "long", options: { arcaneRecovery?: Record<string, number> } = {}) {
    if (!selectedActor) return;
    const rested = await apiPost<{ rest: { summary: string } }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/rest`, {
      restType,
      ...options
    });
    setStatus(rested.rest.summary);
    await refresh();
  }

  async function planSystemEncounter() {
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (!system) return;
    const threatId = systemEncounterThreatId(system.id);
    const planned = await apiPost<{ plan: EncounterPlanInfo; encounter?: Encounter }>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/encounter-plan`, {
      threats: [{ id: threatId, count: 2 }],
      createEncounter: true
    });
    setEncounterPlan(planned.plan);
    setStatus(planned.encounter ? `${planned.encounter.name} planned` : `${planned.plan.difficulty} encounter planned`);
    await refresh();
  }

  async function disableAdminUser(user: AdminUserInfo) {
    await apiPatch<AdminUserInfo>(`/api/v1/admin/users/${user.id}`, {
      disabled: true,
      disabledReason: "Disabled from admin console"
    });
    setAdminStatus(`${user.displayName} disabled`);
    await refreshAdmin();
  }

  async function enableAdminUser(user: AdminUserInfo) {
    await apiPatch<AdminUserInfo>(`/api/v1/admin/users/${user.id}`, {
      disabled: false
    });
    setAdminStatus(`${user.displayName} enabled`);
    await refreshAdmin();
  }

  async function requireAdminPasswordReset(user: AdminUserInfo) {
    await apiPatch<AdminUserInfo>(`/api/v1/admin/users/${user.id}`, {
      passwordResetRequired: true
    });
    setAdminStatus(`${user.displayName} must reset password`);
    await refreshAdmin();
  }

  async function issueAdminPasswordReset(user: AdminUserInfo) {
    const reset = await apiPost<AdminPasswordResetInfo>(`/api/v1/admin/users/${user.id}/password-reset`, {
      returnTo: `${window.location.origin}/reset-password`
    });
    setAdminStatus(`Queued ${reset.email.status} reset email for ${reset.email.to}`);
    await refreshAdmin();
  }

  async function revokeAdminUserSessions(user: AdminUserInfo) {
    const result = await apiDelete<{ revoked: number }>(`/api/v1/admin/users/${user.id}/sessions`);
    setAdminStatus(`Revoked ${result.revoked} sessions for ${user.displayName}`);
    await refreshAdmin();
  }

  async function revokeAdminSession(session: AdminSessionInfo) {
    await apiDelete<{ ok: boolean }>(`/api/v1/admin/sessions/${session.id}`);
    setAdminStatus(`Revoked session for ${session.user.displayName}`);
    await refreshAdmin();
  }

  async function revokeAdminRiskSessions() {
    const staleDays = adminSnapshot?.authOperations.sessions.staleDays ?? 30;
    const result = await apiPost<{ matched: number; revoked: number; remainingRiskSessionCount: number }>("/api/v1/admin/sessions/risk/revoke", {
      staleDays,
      reasons: ["expired", "stale", "disabled_user", "unknown_user"],
      dryRun: false
    });
    setAdminStatus(`Revoked ${result.revoked} of ${result.matched} risk sessions; ${result.remainingRiskSessionCount} remain`);
    await refreshAdmin();
  }

  async function pruneExpiredPasswordResets() {
    const result = await apiPost<{ matched: number; pruned: number; expiredRemaining: number }>("/api/v1/admin/password-resets/prune", {
      includeExpired: true,
      includeUsed: false,
      dryRun: false
    });
    setAdminStatus(`Pruned ${result.pruned} of ${result.matched} expired password resets; ${result.expiredRemaining} remain`);
    await refreshAdmin();
  }

  async function retryAdminEmail(email: EmailOutboxMessage) {
    const retried = await apiPost<EmailOutboxMessage>(`/api/v1/admin/email-outbox/${email.id}/retry`, {});
    setAdminStatus(`Email to ${retried.to} is ${retried.status}`);
    await refreshAdmin();
  }

  async function retryAllAdminEmails() {
    const result = await apiPost<AdminEmailOutboxRetryAllResult>("/api/v1/admin/email-outbox/retry-all", {
      status: "retryable",
      dryRun: false
    });
    setAdminStatus(`Retried ${result.retried} emails; ${result.delivered} delivered, ${result.failed} failed, ${result.skipped} skipped`);
    await refreshAdmin();
  }

  async function retryAdminAiToolCall(toolCallId: string, toolName: string) {
    const result = await apiPost<{ matched: number; retried: number; skipped: number; completed: number; failed: number }>("/api/v1/admin/ai/tool-calls/retry", {
      toolCallId,
      dryRun: false
    });
    setAdminStatus(`Retried ${result.retried} ${toolName} call; ${result.completed} completed, ${result.failed} failed, ${result.skipped} skipped`);
    await refreshAdmin();
  }

  async function failStaleAiThreads() {
    const result = await apiPost<{ matched: number; updated: number }>("/api/v1/admin/ai/threads/stale/fail", {
      dryRun: false
    });
    setAdminStatus(`Marked ${result.updated} of ${result.matched} stale AI threads failed`);
    await refreshAdmin();
  }

  async function failStaleAiToolCalls() {
    const result = await apiPost<{ matched: number; updated: number }>("/api/v1/admin/ai/tool-calls/stale/fail", {
      dryRun: false
    });
    setAdminStatus(`Marked ${result.updated} of ${result.matched} stale AI tool calls failed`);
    await refreshAdmin();
  }

  async function rejectStaleAiProposals(includeApproved = false) {
    const result = await apiPost<{ matched: number; updated: number }>("/api/v1/admin/ai/proposals/stale/reject", {
      dryRun: false,
      includeApproved
    });
    setAdminStatus(`Rejected ${result.updated} of ${result.matched} stale ${includeApproved ? "approved" : "pending"} AI proposals`);
    await refreshAdmin();
  }

  async function cleanupStoredAssetBytes() {
    const result = await apiPost<{ deleted: number; missingMarked: number; skipped: number; failed: number }>("/api/v1/admin/assets/cleanup", {
      includeDeleted: true,
      includeExpired: true,
      dryRun: false
    });
    setAdminStatus(`Cleaned ${result.deleted} asset objects, marked ${result.missingMarked} missing, skipped ${result.skipped}, failed ${result.failed}`);
    await refreshAdmin();
  }

  async function migrateStoredAssetBytes() {
    const result = await apiPost<{ migrated: number; skipped: number; failed: number; targetProvider: string }>("/api/v1/admin/assets/migrate", {
      includeDeleted: false,
      dryRun: false
    });
    setAdminStatus(`Migrated ${result.migrated} assets to ${result.targetProvider}, skipped ${result.skipped}, failed ${result.failed}`);
    await refreshAdmin();
  }

  async function purgeAssetCdnCache(assetId: string, assetName: string) {
    const result = await apiPost<{ status: string }>(`/api/v1/admin/assets/${assetId}/purge-cache`, {
      reason: "Purged from admin console"
    });
    setAdminStatus(`${assetName} CDN purge ${result.status}`);
    await refreshAdmin();
  }

  async function quarantineAssetIntegrityFailures() {
    const result = await apiPost<AdminAssetIntegrityQuarantineResult>("/api/v1/admin/assets/integrity/quarantine", {
      dryRun: false,
      reason: "Archived from admin integrity console"
    });
    setAdminStatus(`Archived ${result.archived} broken assets, skipped ${result.skipped}, failed ${result.failed}`);
    await refreshAdmin();
    await refresh();
  }

  async function updatePluginReview(review: AdminPluginReviewInfo, status: PluginReviewStatus) {
    await apiPatch<AdminPluginReviewInfo>(`/api/v1/admin/plugins/reviews/${encodeURIComponent(review.review.reviewKey)}`, {
      status,
      notes: status === "approved" ? "Approved from admin console" : status === "rejected" ? "Rejected from admin console" : undefined
    });
    setAdminStatus(`${review.plugin.name} ${status}`);
    await refreshAdmin();
    await refresh();
  }

  async function syncAdminPluginRegistries() {
    const result = await apiPost<{ registries: unknown[]; plugins: unknown[] }>("/api/v1/admin/plugins/registry/sync", {});
    setAdminStatus(`Synced ${result.registries.length} registries and imported ${result.plugins.length} plugin packages`);
    await refreshAdmin();
    await refresh();
  }

  async function createScimGroupRoleMapping(input: AdminScimGroupRoleMappingInput) {
    const result = await apiPost<AdminScimGroupRoleMappingResult>("/api/v1/admin/scim/group-role-mappings", input);
    setAdminStatus(`Mapped ${scimMappingLabel(result.mapping)} with ${result.sync.createdMemberships} created, ${result.sync.updatedMemberships} updated`);
    await refreshAdmin();
    await refresh(input.campaignId);
  }

  async function deleteScimGroupRoleMapping(mapping: AdminScimGroupRoleMapping) {
    const result = await apiDelete<{ removedMemberships: number }>(`/api/v1/admin/scim/group-role-mappings/${mapping.id}`);
    setAdminStatus(`Removed ${scimMappingLabel(mapping)} and ${result.removedMemberships} sourced memberships`);
    await refreshAdmin();
    await refresh(mapping.campaignId);
  }

  async function exportCampaign() {
    const archive = await apiGet<object>(`/api/v1/campaigns/${campaignId}/export`);
    downloadJson(`${selectedCampaign?.name ?? "campaign"}.ottx.json`, archive);
  }

  async function exportDogfoodReportBundle() {
    const report = await apiGet<object>(`/api/v1/campaigns/${campaignId}/dogfood-report-bundle`);
    downloadJson(`${selectedCampaign?.name ?? "campaign"}-dogfood-report-bundle.json`, report);
    setStatus("Dogfood report bundle exported");
  }

  async function previewContentImport() {
    const trimmedName = contentImportName.trim();
    if (!trimmedName) return;
    const batch = await apiPost<ContentImportBatch>(`/api/v1/campaigns/${campaignId}/content-imports/preview`, {
      source: {
        sourceType: "manual",
        sourceName: "Web manual content import",
        license: {
          name: "User-provided private table content",
          usage: "private_home_game"
        }
      },
      entities: [
        {
          kind: contentImportKind,
          name: trimmedName,
          selectedByDefault: true,
          data: contentImportEntityData(contentImportKind, contentImportBody)
        }
      ]
    });
    setContentImportStatus(`Previewed ${batch.entities.length} ${batch.entities.length === 1 ? "record" : "records"}`);
    setStatus("Content import previewed");
    await refresh(campaignId, sceneId);
  }

  async function applyContentImport(batch: ContentImportBatch) {
    const selectedEntityIds = batch.selectedEntityIds.length > 0 ? batch.selectedEntityIds : batch.entities.filter((entity) => entity.selectedByDefault).map((entity) => entity.id);
    const updated = await apiPost<ContentImportBatch>(`/api/v1/content-imports/${batch.id}/apply`, { selectedEntityIds });
    setContentImportStatus(`Applied ${updated.appliedRecords.length} ${updated.appliedRecords.length === 1 ? "record" : "records"}`);
    setStatus("Content import applied");
    await refresh(campaignId, sceneId);
  }

  async function rollbackContentImport(batch: ContentImportBatch) {
    await apiPost<ContentImportBatch>(`/api/v1/content-imports/${batch.id}/rollback`, {});
    setContentImportStatus(`Rolled back ${batch.source.sourceName}`);
    setStatus("Content import rolled back");
    await refresh(campaignId, sceneId);
  }

  async function deleteContentImport(batch: ContentImportBatch) {
    await apiDelete<ContentImportBatch>(`/api/v1/content-imports/${batch.id}`);
    setContentImportStatus(`Deleted ${batch.source.sourceName}`);
    setStatus("Content import deleted");
    await refresh(campaignId, sceneId);
  }

  if (resetMode) {
    return (
      <main className="auth-shell">
        <section className="reset-panel" aria-labelledby="reset-title">
          <div className="reset-mark">
            <LockKeyhole size={22} />
          </div>
          <div>
            <div className="eyebrow">Account</div>
            <h1 id="reset-title">Reset Password</h1>
          </div>
          <form
            className="reset-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitResetRequest().catch((error) => setResetStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <label>
              <span>Email</span>
              <input aria-label="Reset email" type="email" autoComplete="email" required value={resetEmail} placeholder="player@example.com" onChange={(event) => setResetEmail(event.target.value)} />
            </label>
            <button className="ghost-button wide" type="submit" disabled={!resetEmail.trim()}>
              <Send size={16} /> Send
            </button>
          </form>
          <form
            className="reset-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitResetConfirm().catch((error) => setResetStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <label>
              <span>Token</span>
              <input aria-label="Reset token" autoComplete="one-time-code" required value={resetToken} placeholder="opr_..." onChange={(event) => setResetToken(event.target.value)} />
            </label>
            <label>
              <span>New Password</span>
              <input aria-label="New password" type="password" autoComplete="new-password" minLength={8} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
            </label>
            <label>
              <span>Confirm Password</span>
              <input aria-label="Confirm password" type="password" autoComplete="new-password" minLength={8} required value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} />
            </label>
            <button className="primary-button wide" type="submit" disabled={!resetToken.trim() || resetPassword.length < 8 || !resetPasswordConfirm}>
              <Check size={16} /> Reset
            </button>
          </form>
          <div className="status reset-status">{resetStatus}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <aside className="rail">
        <div>
          <div className="brand">OpenTabletop</div>
          <div className="subtle">API-first VTT engine</div>
        </div>
        <nav className="campaign-list">
          {snapshot.campaigns.map((campaign) => (
            <button
              className={campaign.id === campaignId ? "nav-item active" : "nav-item"}
              key={campaign.id}
              onClick={() => {
                setCampaignId(campaign.id);
                refresh(campaign.id).catch(console.error);
              }}
            >
              <Shield size={16} />
              <span>{campaign.name}</span>
            </button>
          ))}
        </nav>
        <label className="session-switcher">
          <span>Session</span>
          <select aria-label="Session user" value={currentUserId} onChange={(event) => switchSession(event.target.value).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
            {snapshot.members.length === 0 ? (
              <option value={currentUserId}>{currentUserId}</option>
            ) : (
              snapshot.members.map((member) => (
                <option key={member.id} value={member.user.id}>
                  {member.user.displayName} - {member.role}
                </option>
              ))
            )}
          </select>
        </label>
        {ssoEnabled && (
          <button className="ghost-button" onClick={() => startSso().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
            <Shield size={16} /> SSO
          </button>
        )}
        {hasPermission("campaign.update") && (
          <form
            className="account-box"
            onSubmit={(event) => {
              event.preventDefault();
              createInvite().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <div className="section-title">Invites</div>
            <input aria-label="Invite email" type="email" autoComplete="email" value={inviteEmail} placeholder="player@example.com" onChange={(event) => setInviteEmail(event.target.value)} />
            <select aria-label="Invite role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as UserRole)}>
              <option value="player">Player</option>
              <option value="observer">Observer</option>
              <option value="assistant_gm">Assistant GM</option>
              <option value="gm">GM</option>
            </select>
            <button className="ghost-button wide" type="submit">
              <UserPlus size={16} /> Invite
            </button>
            {inviteToken && <input aria-label="Invite token" readOnly value={inviteToken} onFocus={(event) => event.currentTarget.select()} />}
          </form>
        )}
        <form
          className="account-box"
          onSubmit={(event) => {
            event.preventDefault();
            acceptInvite().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="section-title">Join</div>
          <input aria-label="Invite token" value={joinToken} placeholder="oti_..." onChange={(event) => setJoinToken(event.target.value)} />
          <input aria-label="Join email" type="email" autoComplete="email" value={joinEmail} placeholder="player@example.com" onChange={(event) => setJoinEmail(event.target.value)} />
          <input aria-label="Display name" autoComplete="name" value={joinName} placeholder="Display name" onChange={(event) => setJoinName(event.target.value)} />
          <input aria-label="Password" type="password" autoComplete="new-password" value={joinPassword} placeholder="Password" onChange={(event) => setJoinPassword(event.target.value)} />
          <button className="ghost-button wide" type="submit" disabled={!joinToken.trim() || !joinEmail.trim() || !joinPassword}>
            <ChevronRight size={16} /> Join
          </button>
        </form>
        <button className="ghost-button" onClick={createScene} disabled={!hasPermission("scene.create")} title={hasPermission("scene.create") ? "Create scene" : "Requires scene.create"}>
          <Plus size={16} /> Scene
        </button>
        <button className="ghost-button" onClick={exportCampaign}>
          <Download size={16} /> Export
        </button>
        <button className="ghost-button" onClick={() => exportDogfoodReportBundle().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))} title="Download a redacted issue report bundle">
          <Download size={16} /> Report Bundle
        </button>
        <button className="ghost-button" onClick={() => document.getElementById("import-file")?.click()} disabled={isImportingArchive} aria-describedby="import-status" title="Import .ottx JSON archive">
          {isImportingArchive ? <RefreshCw size={16} /> : <Upload size={16} />} Import
        </button>
        <button className="ghost-button" onClick={() => document.getElementById("map-upload-file")?.click()} disabled={!hasPermission("scene.create") || !hasPermission("scene.update")} title={hasPermission("scene.create") && hasPermission("scene.update") ? "Upload map" : "Requires scene.create and scene.update"}>
          <Upload size={16} /> Map
        </button>
        <input
          id="import-file"
          type="file"
          accept="application/json"
          aria-label="Import campaign archive"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await importCampaignArchive(file, event.currentTarget);
          }}
        />
        <input
          id="map-upload-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await uploadMap(file);
            event.target.value = "";
          }}
        />
        <div id="import-status" className="import-status" role="status" aria-live="polite">
          <strong>Import</strong>
          <span>{importStatus}</span>
        </div>
        <div className="status" role="status" aria-live="polite">{status}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{selectedCampaign?.defaultSystemId ?? "No system"}</div>
            <h1>{selectedCampaign?.name ?? "No campaign"}</h1>
          </div>
          <div className="scene-tabs">
            {snapshot.scenes.map((scene) => (
              <button key={scene.id} className={scene.id === sceneId ? "scene-tab active" : "scene-tab"} onClick={() => setSceneId(scene.id)} aria-pressed={scene.id === sceneId}>
                {scene.active ? <Eye size={14} /> : <FileText size={14} />}
                {scene.name}
              </button>
            ))}
          </div>
          <button className="primary-button" onClick={createToken} disabled={!hasPermission("token.create")} title={hasPermission("token.create") ? "Create token" : "Requires token.create"}>
            <Plus size={16} /> Token
          </button>
        </header>

        <div className="table-grid">
          <section className="table-area">
            <Toolbar onSelectTool={selectCanvasTool} onCreateToken={createToken} onStartCombat={startCombat} onRevealFog={revealFog} onHideFog={hideFog} onRevealFogPolygon={revealFogPolygon} onToggleFogBrush={toggleFogBrush} onUndoFog={undoFog} onShowFogHistory={showFogHistory} onSampleVisionPoint={sampleVisionPoint} onSaveFogPreset={saveFogPreset} onApplyFogPreset={applyFogPreset} onDeleteFogPreset={deleteFogPreset} onAddWall={addWall} onAddTerrainWall={addTerrainWall} onAddLight={addLight} canCreateToken={hasPermission("token.create")} canManageCombat={hasPermission("combat.manage")} canRevealFog={hasPermission("token.reveal")} activeFogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} hasFogPresets={snapshot.fogPresets.length > 0} canUpdateScene={hasPermission("scene.update")} />
            {selectedScene ? <SceneCanvas scene={selectedScene} backgroundAsset={selectedMapAsset} tokens={snapshot.tokens} vision={snapshot.vision} selectedTokenId={selectedTokenId} fogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} onSelect={setSelectedTokenId} onMoved={refresh} onFogStroke={paintFogStroke} /> : <div className="empty-state">Create a scene to open the tabletop.</div>}
          </section>

          <aside className="inspector">
            <div className="tabs">
              <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" onClick={() => setTab("actors")} />
              <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" onClick={() => setTab("journal")} />
              <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" onClick={() => setTab("combat")} />
              <TabButton active={tab === "content"} icon={<Upload size={15} />} label="Content" onClick={() => setTab("content")} />
              <TabButton active={tab === "ai"} icon={<Bot size={15} />} label="AI" onClick={() => setTab("ai")} />
              <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="SDK" onClick={() => setTab("plugins")} />
              {snapshot.session?.serverAdmin && <TabButton active={tab === "admin"} icon={<UserCog size={15} />} label="Admin" onClick={() => setTab("admin")} />}
            </div>
            {tab === "actors" && <ActorPanel actor={selectedActor} token={selectedToken} items={selectedActorItems} updateActorHp={updateActorHp} updateTokenVision={updateSelectedTokenVision} useActorAction={useActorAction} canUpdateActor={canUpdateSelectedActor} canUpdateToken={hasPermission("token.update")} canUseAction={canUpdateSelectedActor && hasPermission("dice.roll")} />}
            {tab === "journal" && <JournalPanel journals={snapshot.journals} onCreate={createJournal} canCreate={hasPermission("journal.create")} />}
            {tab === "combat" && <CombatPanel combat={activeCombat} onStart={startCombat} canManage={hasPermission("combat.manage")} />}
            {tab === "content" && <ContentImportPanel imports={snapshot.contentImports} kind={contentImportKind} setKind={setContentImportKind} name={contentImportName} setName={setContentImportName} body={contentImportBody} setBody={setContentImportBody} status={contentImportStatus} onPreview={previewContentImport} onApply={applyContentImport} onRollback={rollbackContentImport} onDelete={deleteContentImport} canManage={hasPermission("campaign.update")} />}
            {tab === "ai" && <AiPanel prompt={aiPrompt} setPrompt={setAiPrompt} askAi={askAi} recapSession={recapSession} extractMemory={extractMemory} proposals={snapshot.proposals} memory={snapshot.memory} aiThreads={snapshot.aiThreads} aiUsage={snapshot.aiUsage} aiToolCalls={snapshot.aiToolCalls} approveAndApply={approveAndApply} rejectProposal={rejectProposalReview} approveMemory={approveMemory} canPropose={hasPermission("ai.proposeChanges")} canApply={hasPermission("ai.applyChanges")} />}
            {tab === "plugins" && <SdkPanel plugins={snapshot.plugins} systems={snapshot.systems} characterTemplates={snapshot.characterTemplates} actor={selectedActor} importedActor={importedActor} encounterPlan={encounterPlan} onInstallPlugin={installPlugin} onInstallSystem={installSystem} onCreateCharacter={createCharacterFromTemplate} onImportCharacter={importSystemCharacter} onAdvanceActor={advanceSelectedActor} onRestActor={restSelectedActor} onPlanEncounter={planSystemEncounter} onRunCommand={runPluginCommand} onSystemRoll={rollSystemCheck} canInstall={hasPermission("plugin.install")} canInstallSystem={hasPermission("campaign.update")} canCreateActor={hasPermission("actor.create")} canImportActor={hasPermission("actor.create")} canAdvanceActor={canUpdateSelectedActor} canRestActor={canUpdateSelectedActor} canPlanEncounter={hasPermission("combat.manage")} canRollSystem={hasPermission("dice.roll")} />}
            {tab === "admin" && snapshot.session?.serverAdmin && <AdminPanel admin={adminSnapshot} campaigns={snapshot.campaigns} currentUserId={currentUserId} status={adminStatus} onRefresh={refreshAdmin} onDisableUser={disableAdminUser} onEnableUser={enableAdminUser} onRequireReset={requireAdminPasswordReset} onIssueReset={issueAdminPasswordReset} onRevokeUserSessions={revokeAdminUserSessions} onRevokeSession={revokeAdminSession} onRevokeRiskSessions={revokeAdminRiskSessions} onPruneExpiredPasswordResets={pruneExpiredPasswordResets} onRetryEmail={retryAdminEmail} onRetryAllEmails={retryAllAdminEmails} onRetryAiToolCall={retryAdminAiToolCall} onFailStaleAiThreads={failStaleAiThreads} onFailStaleAiToolCalls={failStaleAiToolCalls} onRejectStaleAiProposals={rejectStaleAiProposals} onCleanupStoredAssetBytes={cleanupStoredAssetBytes} onMigrateStoredAssetBytes={migrateStoredAssetBytes} onQuarantineAssetIntegrityFailures={quarantineAssetIntegrityFailures} onPurgeAssetCdnCache={purgeAssetCdnCache} onUpdatePluginReview={updatePluginReview} onSyncPluginRegistries={syncAdminPluginRegistries} onCreateScimMapping={createScimGroupRoleMapping} onDeleteScimMapping={deleteScimGroupRoleMapping} />}
          </aside>
        </div>

        <footer className="console">
          <div className="dice-box">
            <WandSparkles size={17} />
            <input value={diceFormula} onChange={(event) => setDiceFormula(event.target.value)} aria-label="Dice formula" />
            <button className="icon-button" title="Roll dice" onClick={rollDice}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="chat-log">
            {snapshot.chat.slice(-5).map((message) => (
              <div key={message.id} className={`chat-line ${message.type}`}>
                <span>{message.type}</span>
                {message.body}
              </div>
            ))}
          </div>
          <div className="chat-box">
            <MessageSquare size={17} />
            <input value={chatBody} onChange={(event) => setChatBody(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChat()} aria-label="Chat message" />
            <button className="icon-button" title="Send chat message" onClick={sendChat}>
              <Send size={17} />
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

interface FogStrokeDraft {
  pointerId: number;
  mode: FogMode;
  points: VisionPoint[];
}

function SceneCanvas(props: { scene: Scene; backgroundAsset?: MapAsset; tokens: Token[]; vision?: VisionSnapshot; selectedTokenId: string; fogBrushMode: FogMode | null; onSelect(id: string): void; onMoved(): Promise<void>; onFogStroke(mode: FogMode, points: VisionPoint[]): Promise<void> }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [fogStroke, setFogStroke] = useState<FogStrokeDraft | null>(null);
  const fogStrokeRef = useRef<FogStrokeDraft | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => props.tokens.filter((token) => token.sceneId === props.scene.id), [props.tokens, props.scene.id]);
  const vision = props.vision?.sceneId === props.scene.id ? props.vision : undefined;
  const lightPolygons = useMemo(() => vision?.polygons.filter((polygon) => polygon.source === "light" && polygon.points.length > 2) ?? [], [vision]);
  const revealedPolygons = useMemo(() => (vision?.fogActive ? vision.polygons.filter((polygon) => polygon.source !== "light" && polygon.mode !== "hide" && polygon.points.length > 2) : []), [vision]);
  const hiddenPolygons = useMemo(() => (vision?.fogActive ? vision.polygons.filter((polygon) => polygon.source === "fog" && polygon.mode === "hide" && polygon.points.length > 2) : []), [vision]);
  const maskId = `vision-mask-${props.scene.id}`;

  async function moveToken(token: Token, clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.round(((clientX - rect.left) / rect.width) * props.scene.width - token.width / 2));
    const y = Math.max(0, Math.round(((clientY - rect.top) / rect.height) * props.scene.height - token.height / 2));
    await apiPatch(`/api/v1/tokens/${token.id}`, { x, y });
    await props.onMoved();
  }

  function boardPoint(clientX: number, clientY: number): VisionPoint | undefined {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return {
      x: Math.max(0, Math.min(props.scene.width, Math.round(((clientX - rect.left) / rect.width) * props.scene.width))),
      y: Math.max(0, Math.min(props.scene.height, Math.round(((clientY - rect.top) / rect.height) * props.scene.height)))
    };
  }

  function appendFogStrokePoint(clientX: number, clientY: number, pointerId: number) {
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const current = fogStrokeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const next = { ...current, points: appendStrokePoint(current.points, point, props.scene.gridSize) };
    fogStrokeRef.current = next;
    setFogStroke(next);
  }

  function finishFogStroke(pointerId: number, clientX: number, clientY: number) {
    const current = fogStrokeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = boardPoint(clientX, clientY);
    const points = point ? appendStrokePoint(current.points, point, props.scene.gridSize) : current.points;
    fogStrokeRef.current = null;
    setFogStroke(null);
    props.onFogStroke(current.mode, points).catch(console.error);
  }

  return (
    <div
      ref={boardRef}
      className={`scene-board ${props.fogBrushMode ? "brush-mode" : ""}`}
      style={{ aspectRatio: `${props.scene.width} / ${props.scene.height}` }}
      onPointerDown={(event) => {
        if (!props.fogBrushMode) return;
        const point = boardPoint(event.clientX, event.clientY);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(null);
        const next = { pointerId: event.pointerId, mode: props.fogBrushMode, points: [point] };
        fogStrokeRef.current = next;
        setFogStroke(next);
      }}
      onPointerMove={(event) => {
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          appendFogStrokePoint(event.clientX, event.clientY, event.pointerId);
          return;
        }
        if (!dragging) return;
        const token = tokens.find((item) => item.id === dragging);
        if (token) moveToken(token, event.clientX, event.clientY).catch(console.error);
      }}
      onPointerUp={(event) => {
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          finishFogStroke(event.pointerId, event.clientX, event.clientY);
          return;
        }
        setDragging(null);
      }}
      onPointerCancel={(event) => {
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          fogStrokeRef.current = null;
          setFogStroke(null);
        }
        setDragging(null);
      }}
    >
      {props.backgroundAsset && <img className="scene-map" src={assetBlobUrl(props.backgroundAsset)} alt="" draggable={false} />}
      <div
        className="grid-lines"
        style={{
          backgroundSize: `${(props.scene.gridSize / props.scene.width) * 100}% ${(props.scene.gridSize / props.scene.height) * 100}%`
        }}
      />
      {props.scene.lights.map((light) => (
        <div
          className="light-source"
          key={light.id}
          style={{
            left: `${(light.x / props.scene.width) * 100}%`,
            top: `${(light.y / props.scene.height) * 100}%`,
            width: `${(light.radius / props.scene.width) * 200}%`,
            background: `radial-gradient(circle, ${light.color} 0%, ${light.color} 22%, transparent 72%)`,
            opacity: light.intensity ?? 0.18
          }}
        />
      ))}
      {lightPolygons.length > 0 && (
        <svg className="lighting-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          {lightPolygons.map((polygon) => (
            <polygon key={polygon.id} className={lightPolygonClassName(polygon)} points={polygonPoints(polygon)} style={{ fill: polygon.color ?? "#facc15", opacity: polygon.opacity ?? 0.22 }} />
          ))}
        </svg>
      )}
      {props.scene.walls.map((wall) => (
        <svg className={`wall-layer ${wall.kind ?? "wall"}`} key={wall.id} viewBox={`0 0 ${props.scene.width} ${props.scene.height}`}>
          <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
        </svg>
      ))}
      {vision?.fogActive && (
        <svg className="vision-mask-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width={props.scene.width} height={props.scene.height} fill="white" />
              {revealedPolygons.map((polygon) => (
                <polygon key={polygon.id} points={polygonPoints(polygon)} fill="black" />
              ))}
              {hiddenPolygons.map((polygon) => (
                <polygon key={polygon.id} points={polygonPoints(polygon)} fill="white" />
              ))}
            </mask>
          </defs>
          <rect className="vision-dim" width={props.scene.width} height={props.scene.height} mask={`url(#${maskId})`} />
          {revealedPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className={visionPolygonClassName(polygon)} points={polygonPoints(polygon)} />
          ))}
          {hiddenPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className="vision-outline hide" points={polygonPoints(polygon)} />
          ))}
        </svg>
      )}
      {fogStroke && (
        <svg className="fog-brush-preview" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <polyline className={fogStroke.mode} points={fogStroke.points.map((point) => `${point.x},${point.y}`).join(" ")} />
        </svg>
      )}
      {tokens.map((token) => (
        <button
          key={token.id}
          className={`token ${token.disposition} ${props.selectedTokenId === token.id ? "selected" : ""}`}
          style={{
            left: `${(token.x / props.scene.width) * 100}%`,
            top: `${(token.y / props.scene.height) * 100}%`,
            width: `${(token.width / props.scene.width) * 100}%`,
            aspectRatio: `${token.width} / ${token.height}`
          }}
          onPointerDown={(event) => {
            if (props.fogBrushMode) return;
            props.onSelect(token.id);
            setDragging(token.id);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
        >
          <span>{token.name.slice(0, 2).toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

function appendStrokePoint(points: VisionPoint[], point: VisionPoint, gridSize: number): VisionPoint[] {
  const previous = points.at(-1);
  if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < Math.max(6, gridSize / 8)) return points;
  return [...points, point];
}

function polygonPoints(polygon: VisionPolygon): string {
  return polygon.points.map((point) => `${point.x},${point.y}`).join(" ");
}

function visionPolygonClassName(polygon: VisionPolygon): string {
  return ["vision-outline", polygon.source, polygon.lightLevel].filter(Boolean).join(" ");
}

function lightPolygonClassName(polygon: VisionPolygon): string {
  return ["light-polygon", polygon.lightLevel].filter(Boolean).join(" ");
}

function tokenCenter(token: Token): { x: number; y: number } {
  return { x: token.x + token.width / 2, y: token.y + token.height / 2 };
}

function Toolbar(props: { onSelectTool(): void; onCreateToken(): void; onStartCombat(): void; onRevealFog(): void; onHideFog(): void; onRevealFogPolygon(): void; onToggleFogBrush(mode: FogMode): void; onUndoFog(): void; onShowFogHistory(): void; onSampleVisionPoint(): void; onSaveFogPreset(): void; onApplyFogPreset(): void; onDeleteFogPreset(): void; onAddWall(): void; onAddTerrainWall(): void; onAddLight(): void; canCreateToken: boolean; canManageCombat: boolean; canRevealFog: boolean; activeFogBrushMode: FogMode | null; hasFogPresets: boolean; canUpdateScene: boolean }) {
  return (
    <div className="toolbar">
      <button className={`tool ${props.activeFogBrushMode ? "" : "active"}`} title="Select" onClick={props.onSelectTool}>
        <Hand size={17} />
      </button>
      <button className="tool" title="Add token" onClick={props.onCreateToken} disabled={!props.canCreateToken}>
        <Plus size={17} />
      </button>
      <button className="tool" title="Start combat" onClick={props.onStartCombat} disabled={!props.canManageCombat}>
        <Swords size={17} />
      </button>
      <button className="tool" title="Reveal fog" onClick={props.onRevealFog} disabled={!props.canRevealFog}>
        <Eye size={17} />
      </button>
      <button className="tool" title="Hide fog" onClick={props.onHideFog} disabled={!props.canRevealFog}>
        <Eraser size={17} />
      </button>
      <button className="tool" title="Reveal polygon fog" onClick={props.onRevealFogPolygon} disabled={!props.canRevealFog}>
        <Pentagon size={17} />
      </button>
      <button className={`tool ${props.activeFogBrushMode === "reveal" ? "active" : ""}`} title="Smooth reveal brush" onClick={() => props.onToggleFogBrush("reveal")} disabled={!props.canRevealFog}>
        <Paintbrush size={17} />
      </button>
      <button className={`tool ${props.activeFogBrushMode === "hide" ? "active" : ""}`} title="Smooth hide brush" onClick={() => props.onToggleFogBrush("hide")} disabled={!props.canRevealFog}>
        <Eraser size={17} />
      </button>
      <button className="tool" title="Undo fog change" onClick={props.onUndoFog} disabled={!props.canRevealFog}>
        <RotateCcw size={17} />
      </button>
      <button className="tool" title="Fog history" onClick={props.onShowFogHistory} disabled={!props.canRevealFog}>
        <ScrollText size={17} />
      </button>
      <button className="tool" title="Sample vision at selected token" onClick={props.onSampleVisionPoint} disabled={!props.canRevealFog}>
        <Eye size={17} />
      </button>
      <button className="tool" title="Save fog preset" onClick={props.onSaveFogPreset} disabled={!props.canRevealFog}>
        <Download size={17} />
      </button>
      <button className="tool" title="Apply latest fog preset" onClick={props.onApplyFogPreset} disabled={!props.canRevealFog || !props.hasFogPresets}>
        <Upload size={17} />
      </button>
      <button className="tool" title="Delete fog preset" onClick={props.onDeleteFogPreset} disabled={!props.canRevealFog || !props.hasFogPresets}>
        <UserX size={17} />
      </button>
      <button className="tool" title="Add wall" onClick={props.onAddWall} disabled={!props.canUpdateScene}>
        <BrickWall size={17} />
      </button>
      <button className="tool" title="Add terrain wall" onClick={props.onAddTerrainWall} disabled={!props.canUpdateScene}>
        <BrickWall size={17} />
      </button>
      <button className="tool" title="Add light" onClick={props.onAddLight} disabled={!props.canUpdateScene}>
        <Lightbulb size={17} />
      </button>
    </div>
  );
}

function TabButton(props: { active: boolean; icon: React.ReactNode; label: string; onClick(): void }) {
  return (
    <button className={props.active ? "tab active" : "tab"} onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

function systemRollId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "aptitude-tech";
  if (systemId === "mystic-noir") return "skill-investigation";
  if (systemId === "dnd-5e-srd") return "ability-strength";
  return "ability-charisma";
}

function systemRollLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Tech Check";
  if (systemId === "mystic-noir") return "Investigation Check";
  if (systemId === "dnd-5e-srd") return "Strength Check";
  return "Charisma Check";
}

function systemAdvancementOptionId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "rank-up";
  if (systemId === "mystic-noir") return "case-breakthrough";
  return "level-up";
}

function systemAdvancementLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Advance Rank";
  if (systemId === "mystic-noir") return "Case Breakthrough";
  return "Level Up";
}

function systemEncounterThreatId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "void-raider";
  if (systemId === "mystic-noir") return "masked-agent";
  if (systemId === "dnd-5e-srd") return "goblin-minion";
  return "skeletal-guard";
}

function systemImportPayload(systemId: string, ownerUserId: string): Record<string, unknown> {
  if (systemId === "dnd-5e-srd") {
    return {
      name: "Imported Cleric",
      ownerUserId,
      data: {
        level: 3,
        class: "Cleric",
        species: "Human",
        background: "Sage",
        hp: { current: 16, max: 21 },
        attributes: { strength: 10, dexterity: 12, constitution: 14, intelligence: 12, wisdom: 16, charisma: 10 },
        features: ["Spellcasting"],
        conditions: ["blessed"],
        items: ["healing-word", "cure-wounds", "longsword"]
      }
    };
  }
  if (systemId === "stellar-frontiers") {
    return {
      name: "Imported Ace",
      ownerUserId,
      data: {
        rank: 4,
        background: "Corsair Defector",
        aptitudes: { combat: 3, tech: 2, pilot: 4, science: 1, charm: 1 },
        strain: { current: 5, max: 8 },
        milestones: ["Defected at Dawn"],
        conditions: ["locked-in"],
        items: ["laser-carbine", "overclock"]
      }
    };
  }
  if (systemId === "mystic-noir") {
    return {
      name: "Imported Investigator",
      ownerUserId,
      data: {
        rank: 3,
        archetype: "Occult Scholar",
        skills: { investigation: 2, resolve: 3, influence: 1, stealth: 1, occult: 4 },
        composure: { current: 4, max: 7 },
        breakthroughs: ["Solved the First Case"],
        conditions: ["focused"],
        items: ["case-notebook", "warding-rite", "marked"]
      }
    };
  }
  return {
    name: "Imported Mender",
    ownerUserId,
    data: {
      level: 3,
      class: "Mender",
      hp: { current: 14, max: 18 },
      attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
      features: ["Field Prayer"],
      conditions: ["blessed"],
      items: ["healing-word", "longsword"]
    }
  };
}

function ActorPanel(props: { actor?: Actor; token?: Token; items: Item[]; updateActorHp(actor: Actor, current: number): void; updateTokenVision(patch: Partial<Pick<Token, "visionEnabled" | "visionRadius" | "brightVisionRadius" | "dimVisionRadius">>): void; useActorAction(rollId: string): void; canUpdateActor: boolean; canUpdateToken: boolean; canUseAction: boolean }) {
  if (!props.actor) return <div className="panel-empty">No actor selected.</div>;
  const hp = props.actor.data.hp as { current?: number; max?: number } | undefined;
  const conditions = actorConditionLabels(props.actor);
  const inventory = props.items.filter((item) => item.type !== "spell" && item.type !== "talent" && item.type !== "clue" && item.type !== "ritual");
  const spells = props.items.filter((item) => item.type === "spell");
  const talents = props.items.filter((item) => item.type === "talent");
  const clues = props.items.filter((item) => item.type === "clue");
  const rituals = props.items.filter((item) => item.type === "ritual");
  const resources = actorResourceLabels(props.actor);
  const actionLabels = actorActionLabels(props.actor, props.items);
  const firstAction = actorActionOptions(props.actor, props.items)[0];
  const armorClass = actorArmorClass(props.actor, props.items);
  return (
    <div className="panel-stack">
      <div className="section-title">Selected Actor</div>
      <h2>{props.actor.name}</h2>
      <div className="metric-row">
        <span>Token</span>
        <strong>{props.token?.name ?? "Unlinked"}</strong>
      </div>
      {props.token && (
        <>
          <div className="metric-row">
            <span>Vision</span>
            <strong>{props.token.visionEnabled ? `${formatNumber(props.token.brightVisionRadius ?? 0)} bright / ${formatNumber(props.token.dimVisionRadius ?? props.token.visionRadius)} dim` : "disabled"}</strong>
          </div>
          <div className="sheet-row">
            <label htmlFor="token-vision-enabled">Token vision</label>
            <input id="token-vision-enabled" type="checkbox" checked={props.token.visionEnabled} disabled={!props.canUpdateToken} onChange={(event) => props.updateTokenVision({ visionEnabled: event.target.checked })} />
          </div>
          <div className="sheet-row">
            <label htmlFor="token-dim-vision">Dim vision radius</label>
            <input id="token-dim-vision" type="number" min={0} value={props.token.dimVisionRadius ?? props.token.visionRadius} disabled={!props.canUpdateToken || !props.token.visionEnabled} onChange={(event) => props.updateTokenVision({ visionRadius: Number(event.target.value), dimVisionRadius: Number(event.target.value) })} />
          </div>
          <div className="sheet-row">
            <label htmlFor="token-bright-vision">Bright vision radius</label>
            <input id="token-bright-vision" type="number" min={0} value={props.token.brightVisionRadius ?? 0} disabled={!props.canUpdateToken || !props.token.visionEnabled} onChange={(event) => props.updateTokenVision(tokenBrightVisionPatch(event.target.value))} />
          </div>
        </>
      )}
      <div className="metric-row">
        <span>HP</span>
        <strong>
          {hp?.current ?? "?"}/{hp?.max ?? "?"}
        </strong>
      </div>
      {armorClass && (
        <div className="metric-row">
          <span>AC</span>
          <strong>{armorClass.label ? `${armorClass.value} (${armorClass.label})` : armorClass.value}</strong>
        </div>
      )}
      {conditions.length > 0 && (
        <div className="metric-row">
          <span>Conditions</span>
          <strong>{conditions.join(", ")}</strong>
        </div>
      )}
      {resources.length > 0 && (
        <div className="metric-row">
          <span>Resources</span>
          <strong>{resources.join(", ")}</strong>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="metric-row">
          <span>Inventory</span>
          <strong>{inventory.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {spells.length > 0 && (
        <div className="metric-row">
          <span>Spells</span>
          <strong>{spells.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {talents.length > 0 && (
        <div className="metric-row">
          <span>Talents</span>
          <strong>{talents.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {clues.length > 0 && (
        <div className="metric-row">
          <span>Clues</span>
          <strong>{clues.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {rituals.length > 0 && (
        <div className="metric-row">
          <span>Rituals</span>
          <strong>{rituals.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {actionLabels.length > 0 && (
        <div className="metric-row">
          <span>Actions</span>
          <strong>{actionLabels.join(", ")}</strong>
        </div>
      )}
      {firstAction && (
        <button className="ghost-button wide" onClick={() => props.useActorAction(firstAction.rollId)} disabled={!props.canUseAction}>
          <WandSparkles size={16} /> Use {firstAction.label}
        </button>
      )}
      <div className="sheet-row">
        <label htmlFor="actor-hp">Current HP</label>
        <input id="actor-hp" type="number" value={hp?.current ?? 0} disabled={!props.canUpdateActor} onChange={(event) => props.updateActorHp(props.actor!, Number(event.target.value))} />
      </div>
      <pre>{JSON.stringify(props.actor.data, null, 2)}</pre>
    </div>
  );
}

function actorConditionLabels(actor: Actor): string[] {
  const names: Record<string, string> = {
    blessed: "Blessed",
    poisoned: "Poisoned",
    restrained: "Restrained",
    "locked-in": "Locked In",
    jammed: "Jammed",
    "vacuum-exposed": "Vacuum Exposed",
    focused: "Focused",
    shaken: "Shaken",
    marked: "Marked"
  };
  const value = actor.data.conditions;
  if (!Array.isArray(value)) return [];
  return value
    .map((condition) => {
      if (typeof condition === "string") return names[condition] ?? condition;
      if (condition && typeof condition === "object" && "id" in condition && typeof condition.id === "string") return names[condition.id] ?? condition.id;
      return undefined;
    })
    .filter((condition): condition is string => Boolean(condition));
}

function actorResourceLabels(actor: Actor): string[] {
  return Object.entries(recordValue(actor.data.resources)).flatMap(([key, value]) => {
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    const max = numericValue(pool.max, NaN);
    if (!Number.isFinite(current) || !Number.isFinite(max)) return [];
    return `${titleCaseLabel(key)} ${current}/${max}`;
  });
}

function itemDisplayLabel(item: Item): string {
  const quantity = numericValue(recordValue(item.data).quantity, NaN);
  return Number.isFinite(quantity) ? `${item.name} x${quantity}` : item.name;
}

function actorActionLabels(actor: Actor, items: Item[]): string[] {
  return actorActionOptions(actor, items).map((option) => option.description);
}

function actorArmorClass(actor: Actor, items: Item[]): { value: number; label?: string } | undefined {
  const storedArmorClass = numericValue(actor.data.armorClass, NaN);
  if (Number.isFinite(storedArmorClass)) return { value: storedArmorClass };
  if (actor.systemId !== "dnd-5e-srd") return undefined;
  const dexModifier = genericFantasyAttributeModifier(actor, "dexterity");
  const actorItems = items.filter((item) => item.actorId === actor.id && itemQuantity(recordValue(item.data)) > 0);
  const armorOptions = [
    { value: 10 + dexModifier, label: "Unarmored" },
    ...actorItems.flatMap((item) => {
      const data = recordValue(item.data);
      if (data.equipped === false) return [];
      const armorBase = numericValue(data.armorBase, NaN);
      if (!Number.isFinite(armorBase)) return [];
      const dexContribution = data.dexBonus === false ? 0 : Math.min(dexModifier, numericValue(data.dexCap, dexModifier));
      return [{ value: armorBase + dexContribution, label: item.name }];
    })
  ];
  const armor = armorOptions.sort((left, right) => right.value - left.value)[0]!;
  const shieldBonus = actorItems.reduce((max, item) => {
    const data = recordValue(item.data);
    if (data.equipped === false) return max;
    return Math.max(max, numericValue(data.armorBonus, 0));
  }, 0);
  return { value: armor.value + shieldBonus, label: shieldBonus > 0 ? `${armor.label} + Shield` : armor.label };
}

function itemQuantity(data: Record<string, unknown>): number {
  return Math.max(0, numericValue(data.quantity, 1));
}

type ActorActionOption = { rollId: string; label: string; description: string };

function actorActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  if (actor.systemId === "stellar-frontiers") return stellarFrontiersActionOptions(actor, items);
  if (actor.systemId === "mystic-noir") return mysticNoirActionOptions(actor, items);
  if (actor.systemId === "dnd-5e-srd") return dnd5eSrdActionOptions(actor, items);
  return genericFantasyActionOptions(actor, items);
}

function dnd5eSrdActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return [...dnd5eSrdClassFeatureActionOptions(actor), ...dnd5eSrdSpeciesTraitActionOptions(actor), ...dnd5eSrdItemActionOptions(actor, items)];
}

function dnd5eSrdClassFeatureActionOptions(actor: Actor): ActorActionOption[] {
  const options: ActorActionOption[] = [];
  if (dnd5eSrdHasSecondWind(actor)) {
    const tacticalShift = dnd5eSrdHasTacticalShift(actor) ? `; Tactical Shift ${dnd5eSrdTacticalShiftMovement(actor)} ft without opportunity attacks` : "";
    options.push({
      rollId: "feature-second-wind-healing",
      label: "Second Wind",
      description: `Second Wind Healing: ${dnd5eSrdSecondWindFormula(actor)}${tacticalShift}`
    });
  }
  if (dnd5eSrdHasActionSurge(actor)) {
    options.push({ rollId: "feature-action-surge", label: "Action Surge", description: "Action Surge: spend one use" });
  }
  if (dnd5eSrdHasTacticalMind(actor)) {
    options.push({ rollId: "feature-tactical-mind-bonus", label: "Tactical Mind", description: "Tactical Mind Bonus: 1d10; spends Second Wind" });
  }
  if (dnd5eSrdHasChampionCritical(actor)) {
    options.push({ rollId: "feature-champion-critical-range", label: dnd5eSrdChampionCriticalLabel(actor), description: `${dnd5eSrdChampionCriticalLabel(actor)}: weapon and Unarmed Strike attacks score Critical Hits on ${dnd5eSrdChampionCriticalRange(actor)}` });
  }
  if (dnd5eSrdHasChampionRemarkableAthlete(actor)) {
    options.push({ rollId: "feature-champion-remarkable-athlete", label: "Remarkable Athlete", description: `Remarkable Athlete: advantage on Initiative and Athletics; critical hit movement ${dnd5eSrdTacticalShiftMovement(actor)} ft` });
  }
  if (dnd5eSrdHasChampionHeroicWarrior(actor)) {
    options.push({ rollId: "feature-champion-heroic-warrior", label: "Heroic Warrior", description: "Heroic Warrior: gain Heroic Inspiration at the start of combat turns without it" });
  }
  if (dnd5eSrdHasChampionSurvivor(actor)) {
    options.push({ rollId: "feature-champion-survivor", label: "Survivor", description: `Survivor Rally: regain ${dnd5eSrdChampionSurvivorFormula(actor)} HP at turn start when Bloodied` });
  }
  if (dnd5eSrdHasRage(actor)) {
    const rageDamageBonus = dnd5eSrdRageDamageBonus(actor);
    options.push(
      { rollId: "feature-rage", label: "Rage", description: `Rage: spends one use; +${rageDamageBonus} Strength damage; resists bludgeoning, piercing, and slashing` },
      { rollId: "feature-rage-damage-bonus", label: "Rage Damage", description: `Rage Damage Bonus: ${rageDamageBonus}` }
    );
  }
  if (dnd5eSrdHasRecklessAttack(actor)) {
    options.push({ rollId: "feature-reckless-attack", label: "Reckless Attack", description: "Reckless Attack: Strength attacks gain advantage; attacks against you gain advantage" });
  }
  if (dnd5eSrdHasBerserkerFrenzy(actor)) {
    options.push({ rollId: "feature-berserker-frenzy-damage", label: "Frenzy", description: `Berserker Frenzy Damage: ${dnd5eSrdBerserkerFrenzyFormula(actor)} after Reckless Attack while raging` });
  }
  if (dnd5eSrdHasBerserkerMindlessRage(actor)) {
    options.push({ rollId: "feature-berserker-mindless-rage", label: "Mindless Rage", description: "Mindless Rage: immune to Charmed and Frightened while raging" });
  }
  if (dnd5eSrdHasBerserkerRetaliation(actor)) {
    options.push({ rollId: "feature-berserker-retaliation", label: "Retaliation", description: "Retaliation: reaction melee attack after nearby damage" });
  }
  if (dnd5eSrdHasBerserkerIntimidatingPresence(actor)) {
    options.push({ rollId: "feature-berserker-intimidating-presence", label: "Intimidating Presence", description: `Intimidating Presence: DC ${dnd5eSrdBerserkerSaveDc(actor)} Wisdom; 30 ft emanation` });
  }
  if (dnd5eSrdHasBardicInspiration(actor)) {
    options.push({ rollId: "feature-bardic-inspiration", label: "Bardic Inspiration", description: `Bardic Inspiration: ${dnd5eSrdBardicInspirationFormula(actor)}; spends one use` });
  }
  if (dnd5eSrdHasFontOfInspiration(actor)) {
    options.push({ rollId: "feature-font-of-inspiration", label: "Font of Inspiration", description: "Font of Inspiration: spend a spell slot to regain one Bardic Inspiration use" });
  }
  if (dnd5eSrdHasLoreCuttingWords(actor)) {
    options.push({ rollId: "feature-lore-cutting-words", label: "Cutting Words", description: `Cutting Words: subtract ${dnd5eSrdBardicInspirationFormula(actor)} from a visible creature's roll; spends one use` });
  }
  if (dnd5eSrdHasLoreMagicalDiscoveries(actor)) {
    options.push({ rollId: "feature-lore-magical-discoveries", label: "Magical Discoveries", description: "Magical Discoveries: prepare two Cleric, Druid, or Wizard spells" });
  }
  if (dnd5eSrdHasLorePeerlessSkill(actor)) {
    options.push({ rollId: "feature-lore-peerless-skill", label: "Peerless Skill", description: `Peerless Skill: add ${dnd5eSrdBardicInspirationFormula(actor)} after failing an ability check or attack roll` });
  }
  if (dnd5eSrdHasLayOnHands(actor)) {
    options.push({ rollId: "feature-lay-on-hands-healing", label: "Lay On Hands", description: `Lay On Hands Healing: ${dnd5eSrdLayOnHandsFormula(actor)}; spends healing pool points` });
  }
  if (dnd5eSrdHasPaladinsSmite(actor)) {
    options.push({ rollId: "feature-divine-smite-damage", label: "Divine Smite", description: `Divine Smite Damage: ${dnd5eSrdDivineSmiteFormula(actor)} radiant; can spend a spell slot or Paladin's Smite` });
  }
  if (dnd5eSrdHasFaithfulSteed(actor)) {
    options.push({ rollId: "feature-faithful-steed", label: "Faithful Steed", description: "Faithful Steed: free Find Steed casting; recovers on Long Rest" });
  }
  if (dnd5eSrdHasDevotionSacredWeapon(actor)) {
    options.push({ rollId: "feature-devotion-sacred-weapon", label: "Sacred Weapon", description: `Sacred Weapon: add +${dnd5eSrdDevotionSacredWeaponBonus(actor)} to a melee weapon attack; spends Channel Divinity` });
  }
  if (dnd5eSrdHasDevotionAura(actor)) {
    options.push({ rollId: "feature-devotion-aura", label: "Aura of Devotion", description: "Aura of Devotion: allies in Aura of Protection are immune to Charmed" });
  }
  if (dnd5eSrdHasDevotionSmiteProtection(actor)) {
    options.push({ rollId: "feature-devotion-smite-of-protection", label: "Smite Protection", description: "Smite of Protection: Divine Smite grants Half Cover in your aura" });
  }
  if (dnd5eSrdHasDevotionHolyNimbus(actor)) {
    options.push({ rollId: "feature-devotion-holy-nimbus-damage", label: "Holy Nimbus", description: `Holy Nimbus Radiant Damage: ${dnd5eSrdDevotionHolyNimbusFormula(actor)} in your aura` });
  }
  if (dnd5eSrdHasHuntersMark(actor)) {
    options.push({ rollId: "feature-hunters-mark-damage", label: "Hunter's Mark", description: `Hunter's Mark Damage: ${dnd5eSrdHuntersMarkFormula(actor)} force; spends a spell slot or Favored Enemy` });
  }
  if (dnd5eSrdHasHunterLore(actor)) {
    options.push({ rollId: "feature-hunter-lore", label: "Hunter Lore", description: "Hunter's Lore: reveal immunities, resistances, and vulnerabilities on a Hunter's Mark target" });
  }
  if (dnd5eSrdHasHunterPrey(actor)) {
    options.push({ rollId: "feature-hunter-prey", label: "Hunter Prey", description: "Hunter's Prey: 1d8 Colossus Slayer damage or Horde Breaker extra attack option" });
  }
  if (dnd5eSrdHasHunterDefensiveTactics(actor)) {
    options.push({ rollId: "feature-hunter-defensive-tactics", label: "Defensive Tactics", description: "Defensive Tactics: Escape the Horde or Multiattack Defense option" });
  }
  if (dnd5eSrdHasHunterSuperiorPrey(actor)) {
    options.push({ rollId: "feature-hunter-superior-prey", label: "Superior Prey", description: `Superior Hunter's Prey: ${dnd5eSrdHuntersMarkFormula(actor)} force to a second target within 30 feet` });
  }
  if (dnd5eSrdHasHunterSuperiorDefense(actor)) {
    options.push({ rollId: "feature-hunter-superior-defense", label: "Superior Defense", description: "Superior Hunter's Defense: Reaction for Resistance to incoming damage type" });
  }
  if (dnd5eSrdHasMartialArts(actor)) {
    options.push({ rollId: "feature-martial-arts-damage", label: "Martial Arts", description: `Martial Arts Damage: ${dnd5eSrdMartialArtsFormula(actor)} bludgeoning` });
  }
  if (dnd5eSrdHasMonkFocus(actor)) {
    options.push(
      { rollId: "feature-flurry-of-blows", label: "Flurry", description: `Flurry of Blows: spend 1 Focus for ${numericValue(actor.data.level, 1) >= 10 ? 3 : 2} Unarmed Strikes` },
      { rollId: "feature-patient-defense", label: "Patient Defense", description: "Patient Defense: spend 1 Focus for Disengage and Dodge" },
      { rollId: "feature-step-of-the-wind", label: "Step of the Wind", description: "Step of the Wind: spend 1 Focus for Disengage, Dash, and doubled jump distance" },
      { rollId: "feature-uncanny-metabolism-healing", label: "Metabolism", description: `Uncanny Metabolism Healing: ${dnd5eSrdUncannyMetabolismFormula(actor)}; restores Focus on Initiative` }
    );
  }
  if (dnd5eSrdHasDeflectAttacks(actor)) {
    options.push({ rollId: "feature-deflect-attacks-damage", label: "Deflect", description: `Deflect Attacks Damage: ${dnd5eSrdDeflectAttacksDamageFormula(actor)} after reducing damage to 0` });
  }
  if (dnd5eSrdHasStunningStrike(actor)) {
    options.push({ rollId: "feature-stunning-strike", label: "Stunning Strike", description: `Stunning Strike: spend 1 Focus; DC ${dnd5eSrdMonkSaveDc(actor)} Constitution` });
  }
  if (dnd5eSrdHasOpenHandTechnique(actor)) {
    options.push({ rollId: "feature-open-hand-technique", label: "Open Hand", description: `Open Hand Technique: Flurry rider; Addle, Push DC ${dnd5eSrdMonkSaveDc(actor)} Strength, or Topple DC ${dnd5eSrdMonkSaveDc(actor)} Dexterity` });
  }
  if (dnd5eSrdHasOpenHandWholeness(actor)) {
    options.push({ rollId: "feature-open-hand-wholeness-of-body", label: "Wholeness", description: `Wholeness of Body: ${dnd5eSrdOpenHandWholenessFormula(actor)} healing; spend one Long Rest use` });
  }
  if (dnd5eSrdHasOpenHandFleetStep(actor)) {
    options.push({ rollId: "feature-open-hand-fleet-step", label: "Fleet Step", description: "Fleet Step: use Step of the Wind after another Bonus Action" });
  }
  if (dnd5eSrdHasOpenHandQuiveringPalm(actor)) {
    options.push({ rollId: "feature-open-hand-quivering-palm-damage", label: "Quivering Palm", description: `Quivering Palm: spend 4 Focus; 10d12 force, DC ${dnd5eSrdMonkSaveDc(actor)} Constitution half` });
  }
  if (dnd5eSrdHasInnateSorcery(actor)) {
    options.push({ rollId: "feature-innate-sorcery", label: "Innate Sorcery", description: `Innate Sorcery: spend one use for +1 spell DC (${dnd5eSrdSpellSaveDc(actor) + 1}) and spell attack advantage` });
  }
  if (dnd5eSrdHasFontOfMagic(actor)) {
    options.push(
      { rollId: "feature-convert-spell-slot-to-sorcery-points", label: "Convert Slot", description: "Font of Magic: convert a spell slot into Sorcery Points equal to its level" },
      { rollId: "feature-create-spell-slot", label: "Create Slot", description: "Font of Magic: spend Sorcery Points to restore a spell slot" }
    );
  }
  if (dnd5eSrdHasMetamagic(actor)) {
    options.push(
      { rollId: "feature-metamagic-empowered-spell", label: "Empowered Spell", description: `Metamagic: spend 1 Sorcery Point to reroll up to ${Math.max(1, genericFantasyAttributeModifier(actor, "charisma"))} damage dice` },
      { rollId: "feature-metamagic-quickened-spell", label: "Quickened Spell", description: "Metamagic: spend 2 Sorcery Points to cast an action spell as a Bonus Action" }
    );
  }
  if (dnd5eSrdHasDraconicResilience(actor)) {
    options.push({ rollId: "feature-draconic-resilience", label: "Draconic Resilience", description: `Draconic Resilience: AC ${10 + genericFantasyAttributeModifier(actor, "dexterity") + genericFantasyAttributeModifier(actor, "charisma")} while unarmored` });
  }
  if (dnd5eSrdHasDraconicElementalAffinity(actor)) {
    options.push({ rollId: "feature-draconic-elemental-affinity", label: "Elemental Affinity", description: `Elemental Affinity: +${genericFantasyAttributeModifier(actor, "charisma")} damage and resistance for a chosen dragon damage type` });
  }
  if (dnd5eSrdHasDraconicWings(actor)) {
    options.push({ rollId: "feature-draconic-wings", label: "Dragon Wings", description: "Dragon Wings: Bonus Action, fly speed 60 ft for 1 hour; spend 3 Sorcery Points to restore a use" });
  }
  if (dnd5eSrdHasDraconicCompanion(actor)) {
    options.push({ rollId: "feature-draconic-companion", label: "Dragon Companion", description: "Dragon Companion: cast Summon Dragon without material components; one free cast per Long Rest" });
  }
  if (dnd5eSrdHasEvokerPotentCantrip(actor)) {
    options.push({ rollId: "feature-evoker-potent-cantrip", label: "Potent Cantrip", description: `Potent Cantrip: save cantrips use DC ${dnd5eSrdSpellSaveDc(actor)} and deal half damage when a target would avoid damage` });
  }
  if (dnd5eSrdHasEvokerSculptSpells(actor)) {
    options.push({ rollId: "feature-evoker-sculpt-spells", label: "Sculpt Spells", description: "Sculpt Spells: protect 1 + spell level creatures from your Evocation spell damage" });
  }
  if (dnd5eSrdHasEvokerEmpoweredEvocation(actor)) {
    options.push({ rollId: "feature-evoker-empowered-evocation", label: "Empowered Evocation", description: `Empowered Evocation: add +${dnd5eSrdEvokerEmpoweredEvocationBonus(actor)} to one Wizard Evocation spell damage roll` });
  }
  if (dnd5eSrdHasEvokerOverchannel(actor)) {
    options.push({ rollId: "feature-evoker-overchannel", label: "Overchannel", description: "Overchannel: spend one long-rest use to maximize a level 1-5 Wizard damage spell" });
  }
  if (dnd5eSrdHasEldritchInvocations(actor)) {
    options.push({ rollId: "feature-eldritch-invocations", label: "Invocations", description: `Eldritch Invocations: ${dnd5eSrdEldritchInvocationsKnown(actor)} known; includes pact options such as Blade, Chain, and Tome` });
  }
  if (dnd5eSrdHasMagicalCunning(actor)) {
    options.push({ rollId: "feature-magical-cunning", label: "Magical Cunning", description: `Magical Cunning: spend one use to regain ${dnd5eSrdMagicalCunningLimit(actor)} Pact Magic slot` });
  }
  if (dnd5eSrdHasFiendDarkBlessing(actor)) {
    options.push({ rollId: "feature-fiend-dark-ones-blessing", label: "Dark Blessing", description: `Dark One's Blessing: ${Math.max(1, genericFantasyAttributeModifier(actor, "charisma") + numericValue(actor.data.level, 1))} temp HP when an enemy drops nearby` });
  }
  if (dnd5eSrdHasFiendDarkLuck(actor)) {
    options.push({ rollId: "feature-fiend-dark-ones-own-luck", label: "Dark Luck", description: "Dark One's Own Luck: spend one use to add 1d10 to an ability check or saving throw" });
  }
  if (dnd5eSrdHasFiendResilience(actor)) {
    options.push({ rollId: "feature-fiendish-resilience", label: "Fiendish Resilience", description: "Fiendish Resilience: choose a non-Force damage resistance after a Short or Long Rest" });
  }
  if (dnd5eSrdHasFiendHurlThroughHell(actor)) {
    options.push({ rollId: "feature-fiend-hurl-through-hell-damage", label: "Hurl Through Hell", description: `Hurl Through Hell: 8d10 psychic; DC ${dnd5eSrdSpellSaveDc(actor)} Charisma` });
  }
  if (dnd5eSrdHasWildShape(actor)) {
    options.push({ rollId: "feature-wild-shape", label: "Wild Shape", description: `Wild Shape: spend one use; ${dnd5eSrdWildShapeDurationHours(actor)} hour form; regain one use on Short Rest` });
  }
  if (dnd5eSrdHasWildCompanion(actor)) {
    options.push({ rollId: "feature-wild-companion", label: "Wild Companion", description: "Wild Companion: cast Find Familiar by spending a spell slot or Wild Shape" });
  }
  if (dnd5eSrdHasWildResurgence(actor)) {
    options.push(
      { rollId: "feature-wild-resurgence-wild-shape", label: "Wild Resurgence", description: "Wild Resurgence: spend a spell slot to regain one Wild Shape use when none remain" },
      { rollId: "feature-wild-resurgence-spell-slot", label: "Wild Slot", description: "Wild Resurgence: spend Wild Shape to regain a level 1 spell slot once per Long Rest" }
    );
  }
  if (dnd5eSrdHasMoonCircleForms(actor)) {
    options.push({ rollId: "feature-moon-circle-forms", label: "Circle Forms", description: `Circle Forms: CR ${dnd5eSrdMoonWildShapeMaxChallengeRating(actor)}, AC floor ${13 + genericFantasyAttributeModifier(actor, "wisdom")}, ${numericValue(actor.data.level, 1) * 3} temp HP` });
  }
  if (dnd5eSrdHasMoonImprovedCircleForms(actor)) {
    options.push({ rollId: "feature-moon-improved-circle-forms", label: "Improved Forms", description: "Improved Circle Forms: Radiant Wild Shape damage option and Wisdom bonus to Concentration saves" });
  }
  if (dnd5eSrdHasMoonlightStep(actor)) {
    options.push({ rollId: "feature-moon-moonlight-step", label: "Moonlight Step", description: "Moonlight Step: Bonus Action teleport 30 ft and gain Advantage on your next attack this turn" });
  }
  if (dnd5eSrdHasMoonLunarForm(actor)) {
    options.push({ rollId: "feature-moon-lunar-form-damage", label: "Lunar Form", description: "Lunar Form Radiant Damage: 2d10 once per turn with a Wild Shape form attack" });
  }
  if (dnd5eSrdHasClericChannelDivinity(actor)) {
    const saveDc = dnd5eSrdSpellSaveDc(actor);
    const searUndead = dnd5eSrdHasSearUndead(actor) ? `; Sear ${dnd5eSrdSearUndeadFormula(actor)} radiant` : "";
    options.push(
      { rollId: "feature-divine-spark-healing", label: "Divine Spark Healing", description: `Divine Spark Healing: ${dnd5eSrdDivineSparkFormula(actor)}; spends Channel Divinity` },
      { rollId: "feature-divine-spark-damage", label: "Divine Spark Damage", description: `Divine Spark Damage: ${dnd5eSrdDivineSparkFormula(actor)}; DC ${saveDc} Constitution; spends Channel Divinity` },
      { rollId: "feature-turn-undead", label: "Turn Undead", description: `Turn Undead: DC ${saveDc} Wisdom; 30 ft; spends Channel Divinity${searUndead}` }
    );
  }
  if (dnd5eSrdHasSearUndead(actor)) {
    options.push({ rollId: "feature-sear-undead-damage", label: "Sear Undead", description: `Sear Undead Damage: ${dnd5eSrdSearUndeadFormula(actor)} radiant` });
  }
  if (dnd5eSrdHasLifeDisciple(actor)) {
    options.push({ rollId: "feature-life-disciple-of-life", label: "Disciple of Life", description: "Disciple of Life: healing spells add 2 + spell slot level" });
  }
  if (dnd5eSrdHasLifePreserveLife(actor)) {
    options.push({ rollId: "feature-life-preserve-life", label: "Preserve Life", description: `Preserve Life: restore ${dnd5eSrdPreserveLifeFormula(actor)} HP among Bloodied creatures; spends Channel Divinity` });
  }
  if (dnd5eSrdHasLifeBlessedHealer(actor)) {
    options.push({ rollId: "feature-life-blessed-healer", label: "Blessed Healer", description: "Blessed Healer: heal yourself for 2 + spell slot level after healing another creature with a spell slot" });
  }
  if (dnd5eSrdHasLifeSupremeHealing(actor)) {
    options.push({ rollId: "feature-life-supreme-healing", label: "Supreme Healing", description: "Supreme Healing: use the highest possible number for each healing die" });
  }
  if (dnd5eSrdHasSneakAttack(actor)) {
    const cunningStrike = dnd5eSrdHasCunningStrike(actor) ? `; Cunning Strike DC ${dnd5eSrdRogueSaveDc(actor)}` : "";
    options.push({ rollId: "feature-sneak-attack-damage", label: "Sneak Attack", description: `Sneak Attack Damage: ${dnd5eSrdSneakAttackFormula(actor)}${cunningStrike}` });
  }
  if (dnd5eSrdHasCunningStrike(actor)) {
    options.push({ rollId: "feature-cunning-strike", label: "Cunning Strike", description: `Cunning Strike: spend Sneak Attack dice for Poison, Trip, or Withdraw; DC ${dnd5eSrdRogueSaveDc(actor)}` });
  }
  if (dnd5eSrdHasThiefFastHands(actor)) {
    options.push({ rollId: "feature-thief-fast-hands", label: "Fast Hands", description: "Fast Hands: use Cunning Action for Sleight of Hand, Thieves' Tools, or Utilize" });
  }
  if (dnd5eSrdHasThiefSecondStoryWork(actor)) {
    options.push({ rollId: "feature-thief-second-story-work", label: "Second-Story Work", description: `Second-Story Work: climb ${numericValue(actor.data.speed, 30)} ft; jump +${Math.max(0, genericFantasyAttributeModifier(actor, "dexterity"))} ft` });
  }
  if (dnd5eSrdHasThiefSupremeSneak(actor)) {
    options.push({ rollId: "feature-thief-supreme-sneak", label: "Supreme Sneak", description: `Supreme Sneak: advantage on Stealth after moving ${Math.floor(numericValue(actor.data.speed, 30) / 2)} ft or less` });
  }
  if (dnd5eSrdHasThiefUseMagicDevice(actor)) {
    options.push({ rollId: "feature-thief-use-magic-device", label: "Use Magic Device", description: "Use Magic Device: 1d6 charge check; 6 spends no charges; four attunements; Int scroll checks" });
  }
  if (dnd5eSrdHasThiefReflexes(actor)) {
    options.push({ rollId: "feature-thief-reflexes", label: "Thief's Reflexes", description: "Thief's Reflexes: two turns in first combat round at Initiative and Initiative - 10" });
  }
  return options;
}

function dnd5eSrdSpeciesTraitActionOptions(actor: Actor): ActorActionOption[] {
  const options: ActorActionOption[] = [];
  if (dnd5eSrdHasDragonbornBreathWeapon(actor)) {
    const dc = 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "constitution");
    options.push({ rollId: "species-dragonborn-breath-weapon", label: "Breath Weapon", description: `Breath Weapon: ${dnd5eSrdDragonbornBreathWeaponFormula(actor)}; DC ${dc} Dexterity; spends one use` });
  }
  if (dnd5eSrdHasDraconicFlight(actor)) {
    options.push({ rollId: "species-draconic-flight", label: "Draconic Flight", description: `Draconic Flight: spend one use for ${numericValue(actor.data.speed, 30)} ft fly speed for 10 minutes` });
  }
  if (dnd5eSrdHasDwarfStonecunning(actor)) {
    options.push({ rollId: "species-dwarf-stonecunning", label: "Stonecunning", description: "Stonecunning: spend one use for 60 ft Tremorsense for 10 minutes on stone" });
  }
  if (dnd5eSrdHasGoliathGiantAncestry(actor)) {
    options.push({ rollId: "species-goliath-giant-ancestry", label: "Giant Ancestry", description: "Giant Ancestry: spend one use for your chosen Giant boon" });
  }
  if (dnd5eSrdHasGoliathLargeForm(actor)) {
    options.push({ rollId: "species-goliath-large-form", label: "Large Form", description: `Large Form: spend one use to become Large, gain Strength check advantage, and move ${numericValue(actor.data.speed, 35) + 10} ft` });
  }
  if (dnd5eSrdHasHumanResourceful(actor)) {
    options.push({ rollId: "species-human-resourceful", label: "Resourceful", description: "Resourceful: gain Heroic Inspiration when you finish a Long Rest" });
  }
  if (dnd5eSrdHasHumanSkillful(actor)) {
    const skill = stringValue(recordValue(actor.data.origin).humanSkillProficiency) ?? "chosen skill";
    options.push({ rollId: "species-human-skillful", label: "Skillful", description: `Skillful: proficiency in ${skill}` });
  }
  if (dnd5eSrdHasHumanVersatile(actor)) {
    const feat = stringValue(recordValue(actor.data.origin).humanOriginFeat) ?? "Skilled";
    options.push({ rollId: "species-human-versatile", label: "Versatile", description: `Versatile: origin feat ${feat}` });
  }
  if (dnd5eSrdHasElfElvenLineage(actor)) {
    const origin = recordValue(actor.data.origin);
    const lineage = stringValue(origin.elfLineageName) ?? stringValue(origin.elfLineage) ?? "Elven";
    options.push({ rollId: "species-elf-elven-lineage", label: "Elven Lineage", description: `${lineage}: lineage cantrip and level-gated Long Rest spells` });
  }
  if (dnd5eSrdHasElfFeyAncestry(actor)) {
    options.push({ rollId: "species-elf-fey-ancestry", label: "Fey Ancestry", description: "Fey Ancestry: advantage on saves to avoid or end Charmed" });
  }
  if (dnd5eSrdHasElfTrance(actor)) {
    options.push({ rollId: "species-elf-trance", label: "Trance", description: "Trance: finish a Long Rest in 4 hours while remaining conscious" });
  }
  if (dnd5eSrdHasGnomeGnomishCunning(actor)) {
    options.push({ rollId: "species-gnome-gnomish-cunning", label: "Gnomish Cunning", description: "Gnomish Cunning: advantage on Intelligence, Wisdom, and Charisma saves" });
  }
  if (dnd5eSrdHasGnomeLineage(actor)) {
    const origin = recordValue(actor.data.origin);
    const lineage = stringValue(origin.gnomeLineageName) ?? stringValue(origin.gnomeLineage) ?? "Gnomish";
    options.push({ rollId: "species-gnome-lineage", label: "Gnomish Lineage", description: `${lineage}: lineage cantrips and feature spells/devices` });
  }
  if (dnd5eSrdHasHalflingLuck(actor)) {
    options.push({ rollId: "species-halfling-luck", label: "Luck", description: "Luck: reroll a 1 on a D20 Test" });
  }
  if (dnd5eSrdHasHalflingBrave(actor)) {
    options.push({ rollId: "species-halfling-brave", label: "Brave", description: "Brave: advantage on saves to avoid or end Frightened" });
  }
  if (dnd5eSrdHasHalflingNimbleness(actor)) {
    options.push({ rollId: "species-halfling-nimbleness", label: "Nimbleness", description: "Halfling Nimbleness: move through a larger creature's space" });
  }
  if (dnd5eSrdHasHalflingNaturallyStealthy(actor)) {
    options.push({ rollId: "species-halfling-naturally-stealthy", label: "Naturally Stealthy", description: "Naturally Stealthy: Hide while obscured by a Medium or larger creature" });
  }
  if (dnd5eSrdHasTieflingFiendishLegacy(actor)) {
    const origin = recordValue(actor.data.origin);
    const legacy = stringValue(origin.tieflingLegacyName) ?? stringValue(origin.tieflingLegacy) ?? "Fiendish";
    const resistance = stringValue(origin.tieflingResistance) ?? "chosen";
    options.push({ rollId: "species-tiefling-fiendish-legacy", label: "Fiendish Legacy", description: `${legacy} Legacy: ${resistance} resistance and lineage spells` });
  }
  if (dnd5eSrdHasTieflingOtherworldlyPresence(actor)) {
    options.push({ rollId: "species-tiefling-otherworldly-presence", label: "Presence", description: "Otherworldly Presence: Thaumaturgy uses your Fiendish Legacy spellcasting ability" });
  }
  if (dnd5eSrdHasOrcAdrenalineRush(actor)) {
    options.push({ rollId: "species-orc-adrenaline-rush", label: "Adrenaline Rush", description: `Adrenaline Rush: Dash as a Bonus Action and gain ${dnd5eSrdAdrenalineRushFormula(actor)} temp HP` });
  }
  if (dnd5eSrdHasOrcRelentlessEndurance(actor)) {
    options.push({ rollId: "species-orc-relentless-endurance", label: "Relentless", description: "Relentless Endurance: spend one use to drop to 1 HP instead of 0" });
  }
  return options;
}

function dnd5eSrdHasSpeciesFeature(actor: Actor, featureName: string, resourceKey?: string): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return features.includes(featureName) || Boolean(resourceKey && resourceKey in recordValue(actor.data.resources));
}

function dnd5eSrdHasDragonbornBreathWeapon(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Breath Weapon", "breathWeapon");
}

function dnd5eSrdHasDraconicFlight(actor: Actor): boolean {
  return numericValue(actor.data.level, 1) >= 5 && (stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Draconic Flight", "draconicFlight"));
}

function dnd5eSrdHasDwarfStonecunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dwarf" || dnd5eSrdHasSpeciesFeature(actor, "Stonecunning", "stonecunning");
}

function dnd5eSrdHasGoliathGiantAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Giant Ancestry", "giantAncestry");
}

function dnd5eSrdHasGoliathLargeForm(actor: Actor): boolean {
  return numericValue(actor.data.level, 1) >= 5 && (stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Large Form", "largeForm"));
}

function dnd5eSrdHasHumanResourceful(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Resourceful");
}

function dnd5eSrdHasHumanSkillful(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Skillful");
}

function dnd5eSrdHasHumanVersatile(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Versatile");
}

function dnd5eSrdHasElfElvenLineage(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Elven Lineage");
}

function dnd5eSrdHasElfFeyAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Fey Ancestry");
}

function dnd5eSrdHasElfTrance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Trance");
}

function dnd5eSrdHasGnomeGnomishCunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Gnome" || dnd5eSrdHasSpeciesFeature(actor, "Gnomish Cunning");
}

function dnd5eSrdHasGnomeLineage(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Gnome" || dnd5eSrdHasSpeciesFeature(actor, "Gnomish Lineage");
}

function dnd5eSrdHasHalflingLuck(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Luck");
}

function dnd5eSrdHasHalflingBrave(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Brave");
}

function dnd5eSrdHasHalflingNimbleness(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Halfling Nimbleness");
}

function dnd5eSrdHasHalflingNaturallyStealthy(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Naturally Stealthy");
}

function dnd5eSrdHasTieflingFiendishLegacy(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Tiefling" || dnd5eSrdHasSpeciesFeature(actor, "Fiendish Legacy");
}

function dnd5eSrdHasTieflingOtherworldlyPresence(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Tiefling" || dnd5eSrdHasSpeciesFeature(actor, "Otherworldly Presence");
}

function dnd5eSrdHasOrcAdrenalineRush(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Adrenaline Rush", "adrenalineRush");
}

function dnd5eSrdHasOrcRelentlessEndurance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Relentless Endurance", "relentlessEndurance");
}

function dnd5eSrdHasSecondWind(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Fighter" || features.includes("Second Wind") || "secondWind" in recordValue(actor.data.resources);
}

function dnd5eSrdHasActionSurge(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 2) || features.includes("Action Surge") || "actionSurge" in recordValue(actor.data.resources);
}

function dnd5eSrdHasTacticalMind(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 2) || features.includes("Tactical Mind");
}

function dnd5eSrdHasTacticalShift(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 5) || features.includes("Tactical Shift");
}

function dnd5eSrdHasChampionCritical(actor: Actor): boolean {
  return dnd5eSrdHasChampionImprovedCritical(actor) || dnd5eSrdHasChampionSuperiorCritical(actor);
}

function dnd5eSrdHasChampionImprovedCritical(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 3) || features.includes("Improved Critical");
}

function dnd5eSrdHasChampionRemarkableAthlete(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 3) || features.includes("Remarkable Athlete");
}

function dnd5eSrdHasChampionHeroicWarrior(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 10) || features.includes("Heroic Warrior");
}

function dnd5eSrdHasChampionSuperiorCritical(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 15) || features.includes("Superior Critical");
}

function dnd5eSrdHasChampionSurvivor(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 18) || features.includes("Survivor");
}

function dnd5eSrdHasChannelDivinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 2) || features.includes("Channel Divinity") || "channelDivinity" in recordValue(actor.data.resources);
}

function dnd5eSrdHasClericChannelDivinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 2) || features.includes("Divine Spark") || features.includes("Turn Undead") || features.includes("Sear Undead");
}

function dnd5eSrdHasSearUndead(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 5) || features.includes("Sear Undead");
}

function dnd5eSrdHasLifeDisciple(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 3) || features.includes("Disciple of Life");
}

function dnd5eSrdHasLifePreserveLife(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 3) || features.includes("Preserve Life");
}

function dnd5eSrdHasLifeBlessedHealer(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 6) || features.includes("Blessed Healer");
}

function dnd5eSrdHasLifeSupremeHealing(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 17) || features.includes("Supreme Healing");
}

function dnd5eSrdHasBardicInspiration(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Bard" || features.includes("Bardic Inspiration") || "bardicInspiration" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFontOfInspiration(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 5) || features.includes("Font of Inspiration");
}

function dnd5eSrdHasLoreCuttingWords(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 3) || features.includes("College of Lore") || features.includes("Cutting Words");
}

function dnd5eSrdHasLoreMagicalDiscoveries(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 6) || features.includes("Magical Discoveries");
}

function dnd5eSrdHasLorePeerlessSkill(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 14) || features.includes("Peerless Skill");
}

function dnd5eSrdHasLayOnHands(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Paladin" || features.includes("Lay On Hands") || "layOnHands" in recordValue(actor.data.resources);
}

function dnd5eSrdHasPaladinsSmite(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 2) || features.includes("Paladin's Smite") || "paladinsSmite" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFaithfulSteed(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 5) || features.includes("Faithful Steed") || "faithfulSteed" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDevotionSacredWeapon(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 3) || features.includes("Oath of Devotion") || features.includes("Sacred Weapon");
}

function dnd5eSrdHasDevotionAura(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 7) || features.includes("Aura of Devotion");
}

function dnd5eSrdHasDevotionSmiteProtection(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 15) || features.includes("Smite of Protection");
}

function dnd5eSrdHasDevotionHolyNimbus(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 20) || features.includes("Holy Nimbus") || "holyNimbus" in recordValue(actor.data.resources);
}

function dnd5eSrdHasHuntersMark(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Ranger" || features.includes("Favored Enemy") || features.includes("Hunter's Mark") || "favoredEnemy" in recordValue(actor.data.resources);
}

function dnd5eSrdHasHunterLore(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 3) || features.includes("Hunter") || features.includes("Hunter's Lore");
}

function dnd5eSrdHasHunterPrey(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 3) || features.includes("Hunter's Prey");
}

function dnd5eSrdHasHunterDefensiveTactics(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 7) || features.includes("Defensive Tactics");
}

function dnd5eSrdHasHunterSuperiorPrey(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 11) || features.includes("Superior Hunter's Prey");
}

function dnd5eSrdHasHunterSuperiorDefense(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 15) || features.includes("Superior Hunter's Defense");
}

function dnd5eSrdHasMartialArts(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Monk" || features.includes("Martial Arts");
}

function dnd5eSrdHasMonkFocus(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 2) || features.includes("Monk's Focus") || "focus" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDeflectAttacks(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 3) || features.includes("Deflect Attacks");
}

function dnd5eSrdHasStunningStrike(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 5) || features.includes("Stunning Strike");
}

function dnd5eSrdHasOpenHandTechnique(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 3) || features.includes("Warrior of the Open Hand") || features.includes("Open Hand Technique");
}

function dnd5eSrdHasOpenHandWholeness(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 6) || features.includes("Wholeness of Body") || "wholenessOfBody" in recordValue(actor.data.resources);
}

function dnd5eSrdHasOpenHandFleetStep(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 11) || features.includes("Fleet Step");
}

function dnd5eSrdHasOpenHandQuiveringPalm(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 17) || features.includes("Quivering Palm");
}

function dnd5eSrdHasInnateSorcery(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Sorcerer" || features.includes("Innate Sorcery") || "innateSorcery" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFontOfMagic(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 2) || features.includes("Font of Magic") || "sorceryPoints" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMetamagic(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 2) || features.includes("Metamagic");
}

function dnd5eSrdHasDraconicResilience(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 3) || features.includes("Draconic Sorcery") || features.includes("Draconic Resilience");
}

function dnd5eSrdHasDraconicElementalAffinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 6) || features.includes("Elemental Affinity");
}

function dnd5eSrdHasDraconicWings(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 14) || features.includes("Dragon Wings") || "dragonWings" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDraconicCompanion(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 18) || features.includes("Dragon Companion") || "dragonCompanion" in recordValue(actor.data.resources);
}

function dnd5eSrdHasEvokerPotentCantrip(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 3) || features.includes("Evoker") || features.includes("Potent Cantrip");
}

function dnd5eSrdHasEvokerSculptSpells(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 6) || features.includes("Sculpt Spells");
}

function dnd5eSrdHasEvokerEmpoweredEvocation(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 10) || features.includes("Empowered Evocation");
}

function dnd5eSrdHasEvokerOverchannel(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 14) || features.includes("Overchannel") || "overchannel" in recordValue(actor.data.resources);
}

function dnd5eSrdHasEldritchInvocations(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Warlock" || features.includes("Eldritch Invocations");
}

function dnd5eSrdHasMagicalCunning(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 2) || features.includes("Magical Cunning") || "magicalCunning" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFiendDarkBlessing(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 3) || features.includes("Fiend Patron") || features.includes("Dark One's Blessing");
}

function dnd5eSrdHasFiendDarkLuck(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 6) || features.includes("Dark One's Own Luck") || "fiendLuck" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFiendResilience(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 10) || features.includes("Fiendish Resilience");
}

function dnd5eSrdHasFiendHurlThroughHell(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 14) || features.includes("Hurl Through Hell") || "hurlThroughHell" in recordValue(actor.data.resources);
}

function dnd5eSrdHasWildShape(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 2) || features.includes("Wild Shape") || "wildShape" in recordValue(actor.data.resources);
}

function dnd5eSrdHasWildCompanion(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 2) || features.includes("Wild Companion");
}

function dnd5eSrdHasWildResurgence(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 5) || features.includes("Wild Resurgence") || "wildResurgence" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMoonCircleForms(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 3) || features.includes("Circle of the Moon") || features.includes("Circle Forms");
}

function dnd5eSrdHasMoonImprovedCircleForms(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 6) || features.includes("Improved Circle Forms");
}

function dnd5eSrdHasMoonlightStep(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 10) || features.includes("Moonlight Step") || "moonlightStep" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMoonLunarForm(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 14) || features.includes("Lunar Form");
}

function dnd5eSrdHasSneakAttack(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Rogue" || features.includes("Sneak Attack");
}

function dnd5eSrdHasCunningStrike(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 5) || features.includes("Cunning Strike");
}

function dnd5eSrdHasThiefFastHands(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 3) || features.includes("Fast Hands");
}

function dnd5eSrdHasThiefSecondStoryWork(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 3) || features.includes("Second-Story Work");
}

function dnd5eSrdHasThiefSupremeSneak(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 9) || features.includes("Supreme Sneak");
}

function dnd5eSrdHasThiefUseMagicDevice(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 13) || features.includes("Use Magic Device");
}

function dnd5eSrdHasThiefReflexes(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 17) || features.includes("Thief's Reflexes");
}

function dnd5eSrdHasRage(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Barbarian" || features.includes("Rage") || "rage" in recordValue(actor.data.resources);
}

function dnd5eSrdHasRecklessAttack(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 2) || features.includes("Reckless Attack");
}

function dnd5eSrdHasBerserkerFrenzy(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 3) || features.includes("Frenzy");
}

function dnd5eSrdHasBerserkerMindlessRage(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 6) || features.includes("Mindless Rage");
}

function dnd5eSrdHasBerserkerRetaliation(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 10) || features.includes("Retaliation");
}

function dnd5eSrdHasBerserkerIntimidatingPresence(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 14) || features.includes("Intimidating Presence");
}

function dnd5eSrdSecondWindFormula(actor: Actor): string {
  const fighterLevel = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return `1d10+${fighterLevel}`;
}

function dnd5eSrdDivineSparkFormula(actor: Actor): string {
  return appendActionFormulaBonus(`${dnd5eSrdDivineSparkDice(actor)}d8`, genericFantasyAttributeModifier(actor, "wisdom"));
}

function dnd5eSrdDivineSparkDice(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 18) return 4;
  if (level >= 13) return 3;
  if (level >= 7) return 2;
  return 1;
}

function dnd5eSrdSearUndeadFormula(actor: Actor): string {
  return `${Math.max(1, genericFantasyAttributeModifier(actor, "wisdom"))}d8`;
}

function dnd5eSrdPreserveLifeFormula(actor: Actor): string {
  return String(Math.max(1, Math.floor(numericValue(actor.data.level, 1))) * 5);
}

function dnd5eSrdRageDamageBonus(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

function dnd5eSrdBerserkerFrenzyFormula(actor: Actor): string {
  return `${dnd5eSrdRageDamageBonus(actor)}d6`;
}

function dnd5eSrdBerserkerSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "strength");
}

function dnd5eSrdEvokerEmpoweredEvocationBonus(actor: Actor): number {
  return Math.max(1, genericFantasyAttributeModifier(actor, "intelligence"));
}

function dnd5eSrdBardicInspirationFormula(actor: Actor): string {
  return `1${dnd5eSrdBardicInspirationDie(actor)}`;
}

function dnd5eSrdBardicInspirationDie(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}

function dnd5eSrdLayOnHandsFormula(actor: Actor): string {
  const layOnHands = recordValue(recordValue(actor.data.resources).layOnHands);
  return String(Math.max(1, Math.min(5, numericValue(layOnHands.current, dnd5eSrdLayOnHandsMax(actor)))));
}

function dnd5eSrdLayOnHandsMax(actor: Actor): number {
  return Math.max(1, Math.floor(numericValue(actor.data.level, 1))) * 5;
}

function dnd5eSrdDivineSmiteFormula(actor: Actor): string {
  const slots = recordValue(actor.data.spellSlots);
  const slotLevel = Object.keys(slots).some((key) => key === "level2" && numericValue(recordValue(slots[key]).current, 0) > 0) ? 2 : 1;
  return `${slotLevel + 1}d8`;
}

function dnd5eSrdHuntersMarkFormula(actor: Actor): string {
  return numericValue(actor.data.level, 1) >= 20 ? "1d10" : "1d6";
}

function dnd5eSrdMartialArtsFormula(actor: Actor): string {
  return appendActionFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdMartialArtsDie(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 17) return "d12";
  if (level >= 11) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}

function dnd5eSrdUncannyMetabolismFormula(actor: Actor): string {
  return `1${dnd5eSrdMartialArtsDie(actor)}+${Math.max(1, Math.floor(numericValue(actor.data.level, 1)))}`;
}

function dnd5eSrdOpenHandWholenessFormula(actor: Actor): string {
  return appendActionFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "wisdom"));
}

function dnd5eSrdDeflectAttacksDamageFormula(actor: Actor): string {
  return appendActionFormulaBonus(`2${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdMonkSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "wisdom");
}

function dnd5eSrdDevotionSacredWeaponBonus(actor: Actor): number {
  return Math.max(1, genericFantasyAttributeModifier(actor, "charisma"));
}

function dnd5eSrdDevotionHolyNimbusFormula(actor: Actor): string {
  return String(Math.max(0, genericFantasyAttributeModifier(actor, "charisma")) + dnd5eSrdProficiencyBonus(actor));
}

function dnd5eSrdWildShapeDurationHours(actor: Actor): number {
  return Math.max(1, Math.floor(Math.max(1, numericValue(actor.data.level, 1)) / 2));
}

function dnd5eSrdMoonWildShapeMaxChallengeRating(actor: Actor): string {
  return String(Math.max(1, Math.floor(Math.max(1, numericValue(actor.data.level, 1)) / 3)));
}

function dnd5eSrdEldritchInvocationsKnown(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 18) return 10;
  if (level >= 15) return 9;
  if (level >= 12) return 8;
  if (level >= 9) return 7;
  if (level >= 7) return 6;
  if (level >= 5) return 5;
  if (level >= 2) return 3;
  return 1;
}

function dnd5eSrdMagicalCunningLimit(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const maxSlots = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
  return level >= 20 ? maxSlots : Math.ceil(maxSlots / 2);
}

function dnd5eSrdDragonbornBreathWeaponFormula(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const dice = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  return `${dice}d10`;
}

function dnd5eSrdAdrenalineRushFormula(actor: Actor): string {
  return String(dnd5eSrdProficiencyBonus(actor));
}

function dnd5eSrdSneakAttackFormula(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return `${Math.ceil(level / 2)}d6`;
}

function dnd5eSrdRogueSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "dexterity");
}

function dnd5eSrdArcaneRecoverySelection(actor: Actor): Record<string, number> | undefined {
  if (actor.systemId !== "dnd-5e-srd" || stringValue(actor.data.class) !== "Wizard") return undefined;
  const arcaneRecovery = recordValue(recordValue(actor.data.resources).arcaneRecovery);
  if (numericValue(arcaneRecovery.current, 0) <= 0) return undefined;
  const slots = recordValue(actor.data.spellSlots);
  let remaining = Math.ceil(Math.max(1, numericValue(actor.data.level, 1)) / 2);
  const selection: Record<string, number> = {};
  for (let slotLevel = 1; slotLevel <= 5 && remaining > 0; slotLevel += 1) {
    const key = `level${slotLevel}`;
    const slot = recordValue(slots[key]);
    const expended = Math.max(0, numericValue(slot.max, 0) - numericValue(slot.current, 0));
    const recoverable = Math.min(expended, Math.floor(remaining / slotLevel));
    if (recoverable > 0) {
      selection[key] = recoverable;
      remaining -= recoverable * slotLevel;
    }
  }
  return Object.keys(selection).length > 0 ? selection : undefined;
}

function dnd5eSrdSpellSaveDc(actor: Actor): number {
  const className = stringValue(actor.data.class) ?? "Fighter";
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, dnd5eSrdPrimaryAbility(className));
}

function dnd5eSrdProficiencyBonus(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return Math.max(2, Math.floor(numericValue(actor.data.proficiencyBonus, 2 + Math.floor((level - 1) / 4))));
}

function dnd5eSrdPrimaryAbility(className: string): string {
  if (className === "Bard") return "charisma";
  if (className === "Cleric") return "wisdom";
  if (className === "Druid") return "wisdom";
  if (className === "Paladin") return "charisma";
  if (className === "Ranger") return "wisdom";
  if (className === "Monk") return "dexterity";
  if (className === "Sorcerer") return "charisma";
  if (className === "Warlock") return "charisma";
  if (className === "Wizard") return "intelligence";
  if (className === "Rogue") return "dexterity";
  return "strength";
}

function dnd5eSrdTacticalShiftMovement(actor: Actor): number {
  return Math.floor(numericValue(actor.data.speed, 30) / 2);
}

function dnd5eSrdChampionCriticalLabel(actor: Actor): string {
  return dnd5eSrdHasChampionSuperiorCritical(actor) ? "Superior Critical" : "Improved Critical";
}

function dnd5eSrdChampionCriticalRange(actor: Actor): string {
  return dnd5eSrdHasChampionSuperiorCritical(actor) ? "18-20" : "19-20";
}

function dnd5eSrdChampionSurvivorFormula(actor: Actor): string {
  return String(5 + genericFantasyAttributeModifier(actor, "constitution"));
}

function dnd5eSrdAttacksPerAction(actor: Actor): number {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  const className = stringValue(actor.data.class);
  const hasExtraAttack = className === "Fighter" || ((className === "Barbarian" || className === "Paladin" || className === "Ranger" || className === "Monk") && numericValue(actor.data.level, 1) >= 5) || features.includes("Extra Attack");
  if (!hasExtraAttack) return 1;
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (className === "Barbarian") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (className === "Paladin") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (className === "Ranger") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (className === "Monk") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (level >= 20) return 4;
  if (level >= 11) return 3;
  if (level >= 5 || features.includes("Extra Attack")) return 2;
  return 1;
}

function dnd5eSrdItemActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  const attacksPerAction = dnd5eSrdAttacksPerAction(actor);
  return genericFantasyActionOptions(actor, items).map((option) => {
    const martialArtsFormula = dnd5eSrdMonkWeaponDamageFormulaForRoll(actor, items, option.rollId);
    const nextOption = martialArtsFormula ? { ...option, description: `${option.label}: ${martialArtsFormula}` } : option;
    if (attacksPerAction <= 1 || !dnd5eSrdIsWeaponDamageOption(actor, items, option.rollId)) return nextOption;
    return { ...nextOption, description: `${nextOption.description}; ${attacksPerAction} attacks/action` };
  });
}

function dnd5eSrdIsWeaponDamageOption(actor: Actor, items: Item[], rollId: string): boolean {
  return items.filter((item) => item.actorId === actor.id).some((item) => {
    const data = recordValue(item.data);
    if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
    return rollId === `item-${item.id}-damage` || rollId === `item-${item.id}-versatile-damage`;
  });
}

function dnd5eSrdMonkWeaponDamageFormulaForRoll(actor: Actor, items: Item[], rollId: string): string | undefined {
  if (!dnd5eSrdHasMartialArts(actor)) return undefined;
  const item = items.filter((candidate) => candidate.actorId === actor.id).find((candidate) => rollId.startsWith(`item-${candidate.id}-`));
  if (!item) return undefined;
  const data = recordValue(item.data);
  if (!dnd5eSrdIsMonkWeapon(data)) return undefined;
  const weaponDamage = rollId === `item-${item.id}-versatile-damage` ? stringValue(data.versatileDamage) : stringValue(data.damage);
  const damageDie = dnd5eSrdLargerDamageDie(weaponDamage, `1${dnd5eSrdMartialArtsDie(actor)}`);
  return appendActionFormulaBonus(damageDie, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdIsMonkWeapon(data: Record<string, unknown>): boolean {
  if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
  const properties = Array.isArray(data.properties) ? data.properties.map(String).map((property) => property.toLowerCase()) : [];
  return properties.includes("light") || properties.includes("thrown") || properties.includes("versatile") || stringValue(data.compendiumId) === "spear";
}

function dnd5eSrdLargerDamageDie(left: string | undefined, right: string): string {
  const leftSides = dnd5eSrdDamageDieSides(left);
  const rightSides = dnd5eSrdDamageDieSides(right);
  if (!left || rightSides > leftSides) return right;
  return left;
}

function dnd5eSrdDamageDieSides(value: string | undefined): number {
  const match = /^1d(\d+)$/i.exec(value?.trim() ?? "");
  return match ? Number(match[1]) : 0;
}

function genericFantasyActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "spell" ? "spell" : "item";
    const ability = stringValue(data.ability);
    const damage = stringValue(data.damage);
    if (damage && ability) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${appendActionFormulaBonus(damage, genericFantasyAttributeModifier(actor, ability))}` });
    const damageFormula = stringValue(data.damageFormula);
    if (damageFormula) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${resolveGenericFantasyActionFormula(damageFormula, actor)}` });
    const secondaryDamageFormula = stringValue(data.secondaryDamageFormula);
    if (secondaryDamageFormula) options.push({ rollId: `${prefix}-${item.id}-secondary-damage`, label: `${item.name} Secondary Damage`, description: `${item.name} Secondary Damage: ${resolveGenericFantasyActionFormula(secondaryDamageFormula, actor)}` });
    const versatileDamage = stringValue(data.versatileDamage);
    if (versatileDamage && ability) options.push({ rollId: `${prefix}-${item.id}-versatile-damage`, label: `${item.name} Versatile`, description: `${item.name} Versatile: ${appendActionFormulaBonus(versatileDamage, genericFantasyAttributeModifier(actor, ability))}` });
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) options.push({ rollId: `${prefix}-${item.id}-healing`, label: `${item.name} Healing`, description: `${item.name} Healing: ${resolveGenericFantasyActionFormula(healingFormula, actor)}` });
    const effectFormula = stringValue(data.effectFormula);
    const effectAbility = stringValue(data.saveDcAbility);
    if (effectFormula) options.push({ rollId: `${prefix}-${item.id}-effect`, label: `${item.name} Effect`, description: `${item.name} Effect: ${effectAbility ? appendActionFormulaBonus(effectFormula, genericFantasyAttributeModifier(actor, effectAbility)) : effectFormula}` });
    return options;
  });
}

function stellarFrontiersActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "talent" ? "talent" : "gear";
    const aptitude = stringValue(data.aptitude);
    const damage = stringValue(data.damage);
    if (damage) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${aptitude ? appendActionFormulaBonus(damage, stellarFrontiersAptitudeModifier(actor, aptitude)) : damage}` });
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) options.push({ rollId: `${prefix}-${item.id}-healing`, label: `${item.name} Healing`, description: `${item.name} Healing: ${healingFormula}` });
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) options.push({ rollId: `${prefix}-${item.id}-boost`, label: `${item.name} Boost`, description: `${item.name} Boost: ${aptitude ? appendActionFormulaBonus(bonusFormula, stellarFrontiersAptitudeModifier(actor, aptitude)) : bonusFormula}` });
    return options;
  });
}

function mysticNoirActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "ritual" ? "ritual" : "clue";
    const skill = stringValue(data.skill);
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) options.push({ rollId: `${prefix}-${item.id}-insight`, label: `${item.name} Insight`, description: `${item.name} Insight: ${skill ? appendActionFormulaBonus(bonusFormula, mysticNoirSkillModifier(actor, skill)) : bonusFormula}` });
    const protectionFormula = stringValue(data.protectionFormula);
    if (protectionFormula) options.push({ rollId: `${prefix}-${item.id}-ward`, label: `${item.name} Ward`, description: `${item.name} Ward: ${skill ? appendActionFormulaBonus(protectionFormula, mysticNoirSkillModifier(actor, skill)) : protectionFormula}` });
    return options;
  });
}

function genericFantasyAttributeModifier(actor: Actor, ability: string): number {
  const attributes = recordValue(actor.data.attributes);
  return Math.floor((numericValue(attributes[ability], 10) - 10) / 2);
}

function stellarFrontiersAptitudeModifier(actor: Actor, aptitude: string): number {
  const aptitudes = recordValue(actor.data.aptitudes);
  return numericValue(aptitudes[aptitude], 0);
}

function mysticNoirSkillModifier(actor: Actor, skill: string): number {
  const skills = recordValue(actor.data.skills);
  return numericValue(skills[skill], 1);
}

function resolveGenericFantasyActionFormula(formula: string, actor: Actor): string {
  return formula.replace(/([+-]?)@attributes\.([A-Za-z0-9_-]+)/g, (_match, operator: string, ability: string) => {
    const modifier = genericFantasyAttributeModifier(actor, ability);
    const signedModifier = operator === "-" ? -modifier : modifier;
    return operator ? formatSignedActionNumber(signedModifier) : String(signedModifier);
  });
}

function appendActionFormulaBonus(formula: string, bonus: number): string {
  return `${formula}${formatSignedActionNumber(bonus)}`;
}

function formatSignedActionNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function numericValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function tokenBrightVisionPatch(value: string): Partial<Pick<Token, "brightVisionRadius">> {
  const radius = Number(value);
  return Number.isFinite(radius) && radius > 0 ? { brightVisionRadius: radius } : {};
}

function chooseFogPreset(presets: FogPreset[]): FogPreset | undefined {
  const choice = window.prompt(
    `Apply fog preset:\n${presets.map((preset, index) => `${index + 1}. ${preset.name} (${preset.regions.length} regions)`).join("\n")}`,
    "1"
  )?.trim();
  if (!choice) return undefined;
  const index = Number(choice);
  if (Number.isInteger(index) && index >= 1 && index <= presets.length) return presets[index - 1];
  const normalized = choice.toLowerCase();
  return presets.find((preset) => preset.id === choice || preset.name.toLowerCase() === normalized);
}

function chooseFogPresetApplyMode(): "append" | "replace" | undefined {
  const mode = window.prompt('Fog preset apply mode: "replace" or "append"', "replace")?.trim().toLowerCase();
  if (!mode) return undefined;
  return mode === "append" ? "append" : mode === "replace" ? "replace" : undefined;
}

function chooseVisionSamplePoint(scene: Scene, fallback: VisionPoint): VisionPoint | undefined {
  const input = window.prompt("Vision sample point as x,y", `${Math.round(fallback.x)},${Math.round(fallback.y)}`)?.trim();
  if (!input) return undefined;
  const parts = input.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) {
    window.alert("Enter the sample point as x,y.");
    return undefined;
  }
  const x = parts[0]!;
  const y = parts[1]!;
  if (x < 0 || x > scene.width || y < 0 || y > scene.height) {
    window.alert(`Point must be inside 0,0 to ${scene.width},${scene.height}.`);
    return undefined;
  }
  return { x, y };
}

function formatFogHistoryEntry(entry: FogHistoryEntry): string {
  const shape = entry.region?.shape ?? "circle";
  const mode = entry.region?.mode ?? "reveal";
  const target = entry.targetHistoryId ? ` -> ${entry.targetHistoryId}` : "";
  return `${entry.createdAt}: ${entry.action} ${entry.fogId}${target} (${shape}, ${mode})`;
}

function formatVisionPointSample(sample: VisionPointSample): string {
  const blockers = sample.blockedBy.slice(0, 4).map((blocker) => {
    const intersection = blocker.intersection ? ` at ${formatVisionPoint(blocker.intersection)}` : "";
    const distance = blocker.distanceFromSource !== undefined ? `, ${formatVisionDistance(blocker.distanceFromSource)} from source` : "";
    return `- ${blocker.wallId} blocks ${blocker.source}:${blocker.sourceId}${intersection}${distance}`;
  });
  return [
    `Vision sample ${formatVisionPoint(sample.point)}: ${sample.visible ? "visible" : "blocked"}`,
    `Fog active: ${sample.fogActive ? "yes" : "no"}`,
    `Revealed by: ${sample.revealedBy.length}`,
    `Hidden by: ${sample.hiddenBy.length}`,
    `Illuminated by: ${sample.illuminatedBy.length}`,
    `Blocked by: ${sample.blockedBy.length}`,
    ...blockers
  ].join("\n");
}

function formatVisionPoint(point: VisionPoint): string {
  return `${formatVisionDistance(point.x)},${formatVisionDistance(point.y)}`;
}

function formatVisionDistance(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function titleCaseLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function JournalPanel(props: { journals: JournalEntry[]; onCreate(): void; canCreate: boolean }) {
  return (
    <div className="panel-stack">
      <div className="panel-heading">
        <div className="section-title">Journal</div>
        <button className="icon-button" title="Create journal entry" onClick={props.onCreate} disabled={!props.canCreate}>
          <Plus size={16} />
        </button>
      </div>
      {props.journals.map((journal) => (
        <article className="journal-entry" key={journal.id}>
          <span>{journal.visibility}</span>
          <h3>{journal.title}</h3>
          <p>{journal.body}</p>
        </article>
      ))}
    </div>
  );
}

function CombatPanel(props: { combat?: Combat; onStart(): void; canManage: boolean }) {
  return (
    <div className="panel-stack">
      <div className="panel-heading">
        <div className="section-title">Combat Tracker</div>
        <button className="icon-button" title="Start combat" onClick={props.onStart} disabled={!props.canManage}>
          <Swords size={16} />
        </button>
      </div>
      {props.combat ? (
        <>
          <div className="metric-row">
            <span>Round</span>
            <strong>{props.combat.round}</strong>
          </div>
          {props.combat.combatants.map((combatant, index) => (
            <div className={index === props.combat?.turnIndex ? "combatant active" : "combatant"} key={combatant.id}>
              <span>{combatant.name}</span>
              <strong>{combatant.initiative}</strong>
            </div>
          ))}
        </>
      ) : (
        <button className="primary-button wide" onClick={props.onStart} disabled={!props.canManage}>
          Start from scene tokens
        </button>
      )}
    </div>
  );
}

function ContentImportPanel(props: { imports: ContentImportBatch[]; kind: ContentImportEntityKind; setKind(kind: ContentImportEntityKind): void; name: string; setName(value: string): void; body: string; setBody(value: string): void; status: string; onPreview(): Promise<void>; onApply(batch: ContentImportBatch): Promise<void>; onRollback(batch: ContentImportBatch): Promise<void>; onDelete(batch: ContentImportBatch): Promise<void>; canManage: boolean }) {
  const kinds: ContentImportEntityKind[] = ["journal", "handout", "actor", "item"];
  return (
    <div className="panel-stack">
      <div className="panel-heading">
        <div>
          <div className="section-title">Content Import</div>
        </div>
      </div>
      <form
        className="operator-section content-import-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onPreview().catch(console.error);
        }}
      >
        <div className="admin-form-grid">
          <label>
            <span>Kind</span>
            <select aria-label="Content import kind" value={props.kind} onChange={(event) => props.setKind(event.target.value as ContentImportEntityKind)}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {titleCaseLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Name</span>
            <input aria-label="Content import name" value={props.name} placeholder="Imported note" onChange={(event) => props.setName(event.target.value)} />
          </label>
        </div>
        <label>
          <span>{props.kind === "actor" || props.kind === "item" ? "Notes" : "Body"}</span>
          <textarea aria-label="Content import body" value={props.body} placeholder="Content body" onChange={(event) => props.setBody(event.target.value)} />
        </label>
        <button className="primary-button wide" type="submit" disabled={!props.canManage || !props.name.trim()} title={props.canManage ? "Preview content import" : "Requires campaign.update"}>
          <Upload size={16} /> Preview
        </button>
      </form>
      <div className="admin-status" role="status" aria-live="polite">{props.status}</div>
      <div className="operator-list">
        {props.imports.length === 0 ? (
          <div className="empty-state compact">No content imports for this campaign.</div>
        ) : (
          props.imports.map((batch) => (
            <article className="operator-item" key={batch.id}>
              <div className="operator-heading">
                <div>
                  <h3>{batch.source.sourceName}</h3>
                  <p>{batch.status} - {batch.entities.length} {batch.entities.length === 1 ? "entity" : "entities"} - {batch.source.license.usage}</p>
                </div>
                <span className="status-pill">{batch.status}</span>
              </div>
              <div className="admin-meta">
                {batch.entities.map((entity) => (
                  <span key={entity.id}>{titleCaseLabel(entity.kind)}: {entity.name}</span>
                ))}
              </div>
              {batch.entities.some((entity) => entity.warnings.length > 0) && (
                <div className="admin-meta">
                  {batch.entities.flatMap((entity) => entity.warnings.map((warning) => <span key={`${entity.id}-${warning}`}>{warning}</span>))}
                </div>
              )}
              <div className="admin-actions">
                <button className="ghost-button" onClick={() => props.onApply(batch).catch(console.error)} disabled={!props.canManage || batch.status === "applied"} title={props.canManage ? "Apply selected import entities" : "Requires campaign.update"}>
                  <Check size={16} /> Apply
                </button>
                <button className="ghost-button" onClick={() => props.onRollback(batch).catch(console.error)} disabled={!props.canManage || batch.status !== "applied"} title={props.canManage ? "Rollback applied records" : "Requires campaign.update"}>
                  <RotateCcw size={16} /> Rollback
                </button>
                <button className="ghost-button" onClick={() => props.onDelete(batch).catch(console.error)} disabled={!props.canManage || batch.status === "applied"} title={props.canManage ? "Delete import preview" : "Requires campaign.update"}>
                  <X size={16} /> Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function AdminPanel(props: { admin?: AdminSnapshot; campaigns: Campaign[]; currentUserId: string; status: string; onRefresh(): Promise<void>; onDisableUser(user: AdminUserInfo): Promise<void>; onEnableUser(user: AdminUserInfo): Promise<void>; onRequireReset(user: AdminUserInfo): Promise<void>; onIssueReset(user: AdminUserInfo): Promise<void>; onRevokeUserSessions(user: AdminUserInfo): Promise<void>; onRevokeSession(session: AdminSessionInfo): Promise<void>; onRevokeRiskSessions(): Promise<void>; onPruneExpiredPasswordResets(): Promise<void>; onRetryEmail(email: EmailOutboxMessage): Promise<void>; onRetryAllEmails(): Promise<void>; onRetryAiToolCall(toolCallId: string, toolName: string): Promise<void>; onFailStaleAiThreads(): Promise<void>; onFailStaleAiToolCalls(): Promise<void>; onRejectStaleAiProposals(includeApproved?: boolean): Promise<void>; onCleanupStoredAssetBytes(): Promise<void>; onMigrateStoredAssetBytes(): Promise<void>; onQuarantineAssetIntegrityFailures(): Promise<void>; onPurgeAssetCdnCache(assetId: string, assetName: string): Promise<void>; onUpdatePluginReview(review: AdminPluginReviewInfo, status: PluginReviewStatus): Promise<void>; onSyncPluginRegistries(): Promise<void>; onCreateScimMapping(input: AdminScimGroupRoleMappingInput): Promise<void>; onDeleteScimMapping(mapping: AdminScimGroupRoleMapping): Promise<void> }) {
  const users = props.admin?.users ?? [];
  const sessions = props.admin?.sessions ?? [];
  const emails = props.admin?.emailOutbox.slice().reverse() ?? [];
  const auditLogs = props.admin?.audit.auditLogs ?? [];
  const authOperations = props.admin?.authOperations;
  const assetStorage = props.admin?.assetStorage;
  const assetIntegrity = props.admin?.assetIntegrity;
  const renderingOperations = props.admin?.renderingOperations;
  const systemOperations = props.admin?.systemOperations;
  const aiOperations = props.admin?.aiOperations;
  const pluginReviews = props.admin?.pluginReviews;
  const pluginOperations = props.admin?.pluginOperations;
  const scimMappings = props.admin?.scimGroupRoleMappings ?? [];
  const disabledAdminUserCount = users.filter((user) => user.disabled).length;
  const resetRequiredAdminUserCount = users.filter((user) => user.passwordResetRequired).length;
  const sessionBearingAdminUserCount = users.filter((user) => user.sessionCount > 0).length;
  const identityLinkedAdminUserCount = users.filter((user) => user.identityCount > 0).length;
  const sessionExpirySoonMs = Date.now() + 24 * 60 * 60 * 1000;
  const expiringSoonSessionCount = sessions.filter((session) => Date.parse(session.expiresAt) <= sessionExpirySoonMs).length;
  const oldestSessionLastSeenAt = sessions.reduce<string | undefined>((oldest, session) => (!oldest || Date.parse(session.lastSeenAt) < Date.parse(oldest) ? session.lastSeenAt : oldest), undefined);
  const newestSessionLastSeenAt = sessions.reduce<string | undefined>((newest, session) => (!newest || Date.parse(session.lastSeenAt) > Date.parse(newest) ? session.lastSeenAt : newest), undefined);
  const newestEmailCreatedAt = emails.reduce<string | undefined>((newest, email) => (!newest || Date.parse(email.createdAt) > Date.parse(newest) ? email.createdAt : newest), undefined);
  const matchedScimMappingCount = scimMappings.filter((mapping) => mapping.group).length;
  const scimMappedMemberCount = scimMappings.reduce((total, mapping) => total + (mapping.group?.memberUserIds.length ?? 0), 0);
  const pluginReviewSourceCount = new Set(pluginReviews?.plugins.map((review) => review.source.type) ?? []).size;
  const pluginReviewTrustStatusCount = new Set(pluginReviews?.plugins.map((review) => review.trust.status) ?? []).size;
  const assetCampaignProviderSpread = new Set(assetStorage?.campaigns.flatMap((campaign) => Object.keys(campaign.providerCounts)) ?? []).size;
  const assetCampaignLifecycleSpread = new Set(assetStorage?.campaigns.flatMap((campaign) => Object.keys(campaign.lifecycleCounts)) ?? []).size;
  const assetCampaignLargestSampleCount = assetStorage?.campaigns.reduce((total, campaign) => total + campaign.largestAssets.length, 0) ?? 0;
  const renderingFeatureSampleCount = renderingOperations?.featureCoverage.requiredFeatures.reduce((total, feature) => total + feature.samples.length, 0) ?? 0;
  const renderingCoverageSampleCount = Object.values(renderingOperations?.featureCoverage.samples ?? {}).reduce((total, samples) => total + samples.length, 0);
  const primaryRulesCapabilityEvidenceCount = systemOperations?.systems
    .find((system) => system.id === systemOperations.productionReadiness.primarySystemId)
    ?.productionCapability.capabilities.reduce((total, capability) => total + capability.evidenceCount, 0) ?? 0;
  const retryableAiToolCallIds = new Set(aiOperations?.risk.failedToolRetryPolicy?.recentRetryable.map((call) => call.id) ?? []);
  const systemsNeedingProductionDepth =
    systemOperations?.systems.filter((system) => systemOperations.productionReadiness.systemsNeedingProductionDepth.includes(system.id)) ?? [];
  const systemsWithProductionGaps = systemOperations?.systems.filter((system) => system.productionGaps.length > 0) ?? [];
  const productionGapTotal = systemOperations?.productionGapCounts.reduce((total, gap) => total + gap.count, 0) ?? 0;
  const promotionBlockerTotal = systemOperations?.promotionBlockers.reduce((total, system) => total + system.blockerCount, 0) ?? 0;
  const criticalPromotionBlockerTotal = systemOperations?.promotionBlockers.reduce((total, system) => total + system.criticalBlockerCount, 0) ?? 0;
  const primaryRulesSystem = systemOperations?.systems.find((system) => system.id === systemOperations.productionReadiness.primarySystemId);
  const defaultScimCampaignId = props.campaigns[0]?.id ?? "";
  const [scimCampaignId, setScimCampaignId] = useState(defaultScimCampaignId);
  const [scimRole, setScimRole] = useState<ScimAssignableRole>("player");
  const [scimMatchType, setScimMatchType] = useState<"groupDisplayName" | "groupExternalId" | "groupId">("groupDisplayName");
  const [scimGroupValue, setScimGroupValue] = useState("");
  const selectedScimCampaignId = scimCampaignId || defaultScimCampaignId;

  useEffect(() => {
    if (!scimCampaignId && defaultScimCampaignId) setScimCampaignId(defaultScimCampaignId);
  }, [defaultScimCampaignId, scimCampaignId]);

  return (
    <div className="panel-stack admin-panel">
      <div className="panel-heading">
        <div className="section-title">Server Admin</div>
        <button className="icon-button" title="Refresh admin operations" onClick={() => props.onRefresh().catch(console.error)}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="admin-status">{props.status}</div>

      <section className="admin-section" aria-label="Auth operations">
        <div className="operator-heading">
          <div className="section-title">Auth Operations</div>
          <strong>{authOperations?.runtime.nodeEnv ?? "not loaded"}</strong>
        </div>
        {!authOperations ? (
          <div className="empty-state compact">No auth operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.actionRequired ? "failed" : "completed"}`}>{authOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{authOperations.runtime.legacyUserHeader.mode}</strong>
              </div>
              <p>{authOperations.emailOutbox.webhookConfigured ? "email webhook configured" : "email webhook not configured"} - {formatNumber(authOperations.identities.identityCount)} linked identities</p>
              <div className="admin-meta">
                <span>{authOperations.actionReasons.length > 0 ? authOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(authOperations.users.passwordUserCount)} password users</span>
                <span>{formatNumber(authOperations.users.mfaEnabledUserCount)} MFA enabled</span>
                <span>{formatPercent(authOperations.users.mfaCoverageRate)} MFA coverage</span>
                {authOperations.runtime.authUrls.invalidUrlConfig.length > 0 && <span>invalid auth URLs {authOperations.runtime.authUrls.invalidUrlConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.insecureUrlConfig.length > 0 && <span>insecure auth URLs {authOperations.runtime.authUrls.insecureUrlConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.invalidNumericConfig.length > 0 && <span>invalid auth config {authOperations.runtime.authUrls.invalidNumericConfig.join(", ")}</span>}
                {authOperations.runtime.sessions.invalidNumericConfig.length > 0 && <span>invalid session config {authOperations.runtime.sessions.invalidNumericConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.invalidConfig.length > 0 && <span>invalid OIDC config {authOperations.runtime.oidc.invalidConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.insecureConfig.length > 0 && <span>insecure OIDC config {authOperations.runtime.oidc.insecureConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.passwordReset.linkMissingInProduction && <span>production reset link missing</span>}
                {authOperations.runtime.authUrls.emailWebhook.tokenMissingInProduction && <span>production webhook token missing</span>}
                {authOperations.runtime.oidc.missingInProduction && <span>production OIDC missing</span>}
                <span>{authOperations.runtime.oidc.configured ? "OIDC configured" : "OIDC not configured"}</span>
                {authOperations.runtime.serverAdmins.missingInProduction && <span>production server admins missing</span>}
                <span>{formatNumber(authOperations.runtime.serverAdmins.count)} server admins</span>
                <span>session TTL {formatNumber(authOperations.runtime.sessions.ttlDays)}d</span>
                <span>reset TTL {formatNumber(authOperations.runtime.authUrls.passwordReset.ttlMinutes)}m</span>
                <span>{authOperations.runtime.authUrls.emailWebhook.tokenConfigured ? "webhook token configured" : "webhook token missing"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Users" value={formatNumber(authOperations.users.totalUserCount)} />
              <MetricTile label="Active Users" value={formatNumber(authOperations.users.activeUserCount)} />
              <MetricTile label="Auth Action" value={authOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Auth Reasons" value={formatNumber(authOperations.actionReasons.length)} />
              <MetricTile label="Auth Remediations" value={formatNumber(authOperations.remediationQueue.length)} />
              <MetricTile label="Auth Critical" value={formatNumber(authOperations.remediationQueue.filter((item) => item.severity === "critical").length)} />
              <MetricTile label="Auth Warnings" value={formatNumber(authOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Linked Identities" value={formatNumber(authOperations.identities.identityCount)} />
              <MetricTile label="Identity Providers" value={formatNumber(Object.keys(authOperations.identities.providerCounts).length)} />
              <MetricTile label="Server Admins" value={formatNumber(authOperations.runtime.serverAdmins.count)} />
              <MetricTile label="Admin Configured" value={authOperations.runtime.serverAdmins.configured ? "yes" : "no"} />
              <MetricTile label="Admin Prod Ready" value={authOperations.runtime.serverAdmins.missingInProduction ? "no" : "yes"} />
              <MetricTile label="OIDC Config Errors" value={formatNumber(authOperations.runtime.oidc.invalidConfig.length + authOperations.runtime.oidc.insecureConfig.length)} />
              <MetricTile label="OIDC Invalid Config" value={formatNumber(authOperations.runtime.oidc.invalidConfig.length)} />
              <MetricTile label="OIDC Insecure Config" value={formatNumber(authOperations.runtime.oidc.insecureConfig.length)} />
              <MetricTile label="OIDC Configured" value={authOperations.runtime.oidc.configured ? "yes" : "no"} />
              <MetricTile label="OIDC Prod Ready" value={authOperations.runtime.oidc.missingInProduction ? "no" : "yes"} />
              <MetricTile label="OIDC Complete" value={authOperations.runtime.oidc.issuerConfigured && authOperations.runtime.oidc.clientIdConfigured && authOperations.runtime.oidc.clientSecretConfigured && authOperations.runtime.oidc.redirectUriConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Issuer" value={authOperations.runtime.oidc.issuerConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Client ID" value={authOperations.runtime.oidc.clientIdConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Secret" value={authOperations.runtime.oidc.clientSecretConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Redirect" value={authOperations.runtime.oidc.redirectUriConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Return Origins" value={authOperations.runtime.oidc.allowedReturnOriginsConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Token Auth" value={authOperations.runtime.oidc.tokenAuth} />
              <MetricTile label="OIDC Insecure Issuer" value={authOperations.runtime.oidc.allowInsecureIssuer ? "yes" : "no"} />
              <MetricTile label="Auth URL Errors" value={formatNumber(authOperations.runtime.authUrls.invalidUrlConfig.length + authOperations.runtime.authUrls.insecureUrlConfig.length)} />
              <MetricTile label="Auth Config Errors" value={formatNumber(authOperations.runtime.authUrls.invalidNumericConfig.length)} />
              <MetricTile label="Session TTL" value={`${formatNumber(authOperations.runtime.sessions.ttlDays)} d`} />
              <MetricTile label="Stale Threshold" value={`${formatNumber(authOperations.sessions.staleDays)} d`} />
              <MetricTile label="Session Config Errors" value={formatNumber(authOperations.runtime.sessions.invalidNumericConfig.length)} />
              <MetricTile label="Disabled" value={formatNumber(authOperations.users.disabledUserCount)} />
              <MetricTile label="Disabled User Rate" value={formatPercent(authOperations.users.totalUserCount === 0 ? 0 : authOperations.users.disabledUserCount / authOperations.users.totalUserCount)} />
              <MetricTile label="Recent Disabled Users" value={formatNumber(authOperations.users.disabledUsers.length)} />
              <MetricTile label="Disabled User Sessions" value={formatNumber(authOperations.users.disabledUsers.reduce((total, user) => total + user.sessionCount, 0))} />
              <MetricTile label="Sessions" value={formatNumber(authOperations.sessions.totals.sessionCount)} />
              <MetricTile label="Risk Sessions" value={formatNumber(authOperations.sessions.totals.riskSessionCount)} />
              <MetricTile label="Risk Session Rate" value={formatPercent(authOperations.sessions.totals.sessionCount === 0 ? 0 : authOperations.sessions.totals.riskSessionCount / authOperations.sessions.totals.sessionCount)} />
              <MetricTile label="Risk Session Samples" value={formatNumber(authOperations.sessions.recentRiskSessions.length)} />
              <MetricTile label="Expired Sessions" value={formatNumber(authOperations.sessions.totals.expiredSessionCount)} />
              <MetricTile label="Stale Sessions" value={formatNumber(authOperations.sessions.totals.staleSessionCount)} />
              <MetricTile label="Disabled Sessions" value={formatNumber(authOperations.sessions.totals.disabledUserSessionCount)} />
              <MetricTile label="Unknown Sessions" value={formatNumber(authOperations.sessions.totals.unknownUserSessionCount)} />
              <MetricTile label="Risk Cleanup Runs" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeRunCount)} />
              <MetricTile label="Recent Risk Cleanup" value={formatNumber(authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.length)} />
              <MetricTile label="Recent Risk Revoked" value={formatNumber(authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.reduce((total, run) => total + run.revoked, 0))} />
              <MetricTile label="Latest Risk Cleanup" value={authOperations.sessions.cleanupOperations.latestRiskRevokeAt ? formatDateTime(authOperations.sessions.cleanupOperations.latestRiskRevokeAt) : "none"} />
              <MetricTile label="Risk Dry Runs" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeDryRunCount)} />
              <MetricTile label="Risk Matched" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeMatchedCount)} />
              <MetricTile label="Risk Cleanup" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeMutationCount)} />
              <MetricTile label="Sessions Revoked" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeRevokedCount)} />
              <MetricTile label="Direct Revokes" value={formatNumber(authOperations.sessions.cleanupOperations.singleSessionRevocationCount)} />
              <MetricTile label="User Revokes" value={formatNumber(authOperations.sessions.cleanupOperations.userSessionRevocationRunCount)} />
              <MetricTile label="Reset Required" value={formatNumber(authOperations.users.passwordResetRequiredUserCount)} />
              <MetricTile label="Password Users" value={formatNumber(authOperations.users.passwordUserCount)} />
              <MetricTile label="MFA Enabled" value={formatNumber(authOperations.users.mfaEnabledUserCount)} />
              <MetricTile label="MFA Coverage" value={formatPercent(authOperations.users.mfaCoverageRate)} />
              <MetricTile label="No MFA" value={formatNumber(authOperations.users.activePasswordUserWithoutMfaCount)} />
              <MetricTile label="No MFA Rate" value={formatPercent(authOperations.users.passwordUserCount === 0 ? 0 : authOperations.users.activePasswordUserWithoutMfaCount / authOperations.users.passwordUserCount)} />
              <MetricTile label="No MFA Samples" value={formatNumber(authOperations.users.activePasswordUsersWithoutMfa.length)} />
              <MetricTile label="No MFA Sessions" value={formatNumber(authOperations.users.activePasswordUsersWithoutMfa.reduce((total, user) => total + user.sessionCount, 0))} />
              <MetricTile label="Email Webhook" value={authOperations.emailOutbox.webhookConfigured ? "yes" : "no"} />
              <MetricTile label="Email Messages" value={formatNumber(authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Email Statuses" value={formatNumber(Object.keys(authOperations.emailOutbox.statusCounts).length)} />
              <MetricTile label="Email Providers" value={formatNumber(new Set(emails.map((email) => email.provider ?? "unknown")).size)} />
              <MetricTile label="Pending Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.pending)} />
              <MetricTile label="Retry Emails" value={formatNumber(authOperations.emailOutbox.retryableCount)} />
              <MetricTile label="Retry Email Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : authOperations.emailOutbox.retryableCount / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Recent Retry Emails" value={formatNumber(authOperations.emailOutbox.recentRetryableMessages.length)} />
              <MetricTile label="Delivered Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.delivered)} />
              <MetricTile label="Email Delivery Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 1 : (authOperations.emailOutbox.statusCounts.delivered ?? 0) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Failed Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.failed)} />
              <MetricTile label="Failed Email Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : (authOperations.emailOutbox.statusCounts.failed ?? 0) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Undelivered Emails" value={formatNumber((authOperations.emailOutbox.statusCounts.pending ?? 0) + (authOperations.emailOutbox.statusCounts.failed ?? 0))} />
              <MetricTile label="Undelivered Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : ((authOperations.emailOutbox.statusCounts.pending ?? 0) + (authOperations.emailOutbox.statusCounts.failed ?? 0)) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Oldest Retry Email" value={formatDurationSeconds(authOperations.emailOutbox.oldestRetryableAgeSeconds)} />
              <MetricTile label="Reset Tokens" value={formatNumber(authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount)} />
              <MetricTile label="Active Resets" value={formatNumber(authOperations.passwordResets.activeCount)} />
              <MetricTile label="Expired Resets" value={formatNumber(authOperations.passwordResets.expiredUnusedCount)} />
              <MetricTile label="Expired Reset Rate" value={formatPercent((authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount) === 0 ? 0 : authOperations.passwordResets.expiredUnusedCount / (authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount))} />
              <MetricTile label="Reset URL" value={authOperations.runtime.authUrls.passwordReset.configured ? (authOperations.runtime.authUrls.passwordReset.valid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Reset URL Secure" value={authOperations.runtime.authUrls.passwordReset.insecureInProduction ? "no" : "yes"} />
              <MetricTile label="Reset TTL" value={`${formatNumber(authOperations.runtime.authUrls.passwordReset.ttlMinutes)} m`} />
              <MetricTile label="Web Origin" value={authOperations.runtime.authUrls.passwordReset.webOriginConfigured ? (authOperations.runtime.authUrls.passwordReset.webOriginValid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Web Origin Secure" value={authOperations.runtime.authUrls.passwordReset.webOriginInsecureInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook URL" value={authOperations.runtime.authUrls.emailWebhook.configured ? (authOperations.runtime.authUrls.emailWebhook.valid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Webhook Secure" value={authOperations.runtime.authUrls.emailWebhook.insecureInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook Timeout" value={formatDuration(authOperations.runtime.authUrls.emailWebhook.timeoutMs)} />
              <MetricTile label="Reset Link Ready" value={authOperations.runtime.authUrls.passwordReset.linkMissingInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook Token" value={authOperations.runtime.authUrls.emailWebhook.tokenConfigured ? "yes" : "no"} />
              <MetricTile label="Legacy Enabled" value={authOperations.runtime.legacyUserHeader.enabled ? "yes" : "no"} />
              <MetricTile label="Legacy Mode" value={authOperations.runtime.legacyUserHeader.mode} />
              <MetricTile label="Legacy Hard Fence" value={authOperations.runtime.legacyUserHeader.productionHardFence ? "yes" : "no"} />
              <MetricTile label="Legacy Compat Flag" value={authOperations.runtime.legacyUserHeader.compatibilityFlagSet ? "yes" : "no"} />
              <MetricTile label="Legacy Auth" value={formatNumber(authOperations.legacyUserHeaderUsage.usageCount)} />
              <MetricTile label="Recent Legacy Auth" value={formatNumber(authOperations.legacyUserHeaderUsage.recentSamples.length)} />
              <MetricTile label="Legacy Users" value={formatNumber(authOperations.legacyUserHeaderUsage.distinctUserCount)} />
              <MetricTile label="Blocked Legacy" value={formatNumber(authOperations.legacyUserHeaderUsage.blockedAttemptCount)} />
              <MetricTile label="Legacy Block Rate" value={formatPercent((authOperations.legacyUserHeaderUsage.usageCount + authOperations.legacyUserHeaderUsage.blockedAttemptCount) === 0 ? 0 : authOperations.legacyUserHeaderUsage.blockedAttemptCount / (authOperations.legacyUserHeaderUsage.usageCount + authOperations.legacyUserHeaderUsage.blockedAttemptCount))} />
              <MetricTile label="Recent Blocked Legacy" value={formatNumber(authOperations.legacyUserHeaderUsage.blockedSamples.length)} />
              <MetricTile label="Legacy Last Seen" value={authOperations.legacyUserHeaderUsage.lastSeenAt ? formatDateTime(authOperations.legacyUserHeaderUsage.lastSeenAt) : "none"} />
              <MetricTile label="Legacy Last Blocked" value={authOperations.legacyUserHeaderUsage.lastBlockedAt ? formatDateTime(authOperations.legacyUserHeaderUsage.lastBlockedAt) : "none"} />
              <MetricTile label="Login Failures" value={formatNumber(authOperations.loginFailures.failureCount)} />
              <MetricTile label="Recent Login Failures" value={formatNumber(authOperations.loginFailures.recentFailures.length)} />
              <MetricTile label="Known Login Users" value={formatNumber(authOperations.loginFailures.distinctKnownUserCount)} />
              <MetricTile label="Unknown Logins" value={formatNumber(authOperations.loginFailures.unknownIdentityCount)} />
              <MetricTile label="Unknown Login Rate" value={formatPercent(authOperations.loginFailures.failureCount === 0 ? 0 : authOperations.loginFailures.unknownIdentityCount / authOperations.loginFailures.failureCount)} />
              <MetricTile label="Login Reasons" value={formatNumber(Object.keys(authOperations.loginFailures.reasonCounts).length)} />
              <MetricTile label="Login Statuses" value={formatNumber(Object.keys(authOperations.loginFailures.statusCounts).length)} />
            </div>
            <div className="admin-actions">
              <button className="ghost-button" title="Revoke expired, stale, disabled-user, and unknown-user sessions" onClick={() => props.onRevokeRiskSessions().catch(console.error)} disabled={authOperations.sessions.totals.riskSessionCount === 0}>
                <RefreshCw size={14} /> Revoke risk sessions
              </button>
              <button className="ghost-button" title="Prune expired password reset tokens" onClick={() => props.onPruneExpiredPasswordResets().catch(console.error)} disabled={authOperations.passwordResets.expiredUnusedCount === 0}>
                <RefreshCw size={14} /> Prune expired resets
              </button>
              <button className="ghost-button" title="Retry all pending and failed auth email deliveries" onClick={() => props.onRetryAllEmails().catch(console.error)} disabled={authOperations.emailOutbox.retryableCount === 0 || !authOperations.emailOutbox.webhookConfigured}>
                <Mail size={14} /> Retry emails
              </button>
            </div>
            {authOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`auth-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "critical" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {authOperations.loginFailures.failureCount > 0 && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">review</span>
                  <strong>{formatNumber(authOperations.loginFailures.failureCount)} failed</strong>
                </div>
                <h3>Login failures</h3>
                <p>{formatNumber(authOperations.loginFailures.unknownIdentityCount)} unknown identities - {formatNumber(authOperations.loginFailures.distinctKnownUserCount)} known users</p>
                <div className="admin-meta">
                  {Object.entries(authOperations.loginFailures.reasonCounts).map(([reason, count]) => (
                    <span key={`login-failure-reason-${reason}`}>{reason} {formatNumber(count)}</span>
                  ))}
                </div>
              </article>
            )}
            {authOperations.sessions.recentRiskSessions.slice(0, 3).map((riskSession) => (
              <div className="operator-row tool-call-row" key={riskSession.session.id}>
                <span>{riskSession.user.displayName}</span>
                <strong>{riskSession.reasons.join(", ")} - {riskSession.lastSeenAgeDays ?? 0}d seen - expires {formatDuration(Math.max(0, riskSession.expiresInMs))}</strong>
              </div>
            ))}
            {authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`risk-session-cleanup-${run.auditLogId}`}>
                <span>{run.dryRun ? "dry-run risk cleanup" : "risk cleanup"}</span>
                <strong>{run.reasons.join(", ") || "all reasons"} - {formatNumber(run.revoked)} revoked / {formatNumber(run.matched)} matched - {formatDateTime(run.createdAt)}</strong>
              </div>
            ))}
            {authOperations.users.disabledUsers.slice(0, 3).map((user) => (
              <div className="operator-row tool-call-row" key={`disabled-user-${user.id}`}>
                <span>{user.displayName}</span>
                <strong>{user.email ?? user.id} - {formatNumber(user.sessionCount)} sessions - {user.disabledAt ? formatDateTime(user.disabledAt) : "disabled"}</strong>
              </div>
            ))}
            {authOperations.users.activePasswordUsersWithoutMfa.slice(0, 3).map((user) => (
              <div className="operator-row tool-call-row" key={`no-mfa-${user.id}`}>
                <span>{user.displayName}</span>
                <strong>{user.email ?? user.id} - {formatNumber(user.sessionCount)} sessions - {user.passwordResetRequired ? "reset required" : "password active"}</strong>
              </div>
            ))}
            {authOperations.legacyUserHeaderUsage.recentSamples.slice(0, 3).map((sample) => (
              <div className="operator-row tool-call-row" key={`legacy-auth-${sample.auditLogId}`}>
                <span>{sample.userId}</span>
                <strong>{sample.source} - {sample.mode} - {formatDateTime(sample.createdAt)}</strong>
              </div>
            ))}
            {authOperations.legacyUserHeaderUsage.blockedSamples.slice(0, 3).map((sample) => (
              <div className="operator-row tool-call-row" key={`blocked-legacy-auth-${sample.auditLogId}`}>
                <span>{sample.userId}</span>
                <strong>blocked {sample.source} - {sample.mode} - {formatDateTime(sample.createdAt)}</strong>
              </div>
            ))}
            {authOperations.loginFailures.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`auth-login-failure-${failure.auditLogId}`}>
                <span>{failure.userId ?? "unknown identity"}</span>
                <strong>{failure.reason} - HTTP {failure.statusCode} - {formatDateTime(failure.createdAt)}</strong>
              </div>
            ))}
            {authOperations.emailOutbox.recentRetryableMessages.slice(0, 3).map((message) => (
              <div className="operator-row tool-call-row" key={`retry-email-${message.id}`}>
                <span>{message.subject}</span>
                <strong>{message.to} - {message.status}{message.error ? ` - ${message.error}` : ""}</strong>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Admin users">
        <div className="operator-heading">
          <div className="section-title">Users</div>
          <strong>{users.length}</strong>
        </div>
        {users.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Admin Users" value={formatNumber(users.length)} />
            <MetricTile label="Disabled Users" value={formatNumber(disabledAdminUserCount)} />
            <MetricTile label="Reset Required Users" value={formatNumber(resetRequiredAdminUserCount)} />
            <MetricTile label="Users With Sessions" value={formatNumber(sessionBearingAdminUserCount)} />
            <MetricTile label="Linked Identity Users" value={formatNumber(identityLinkedAdminUserCount)} />
            <MetricTile label="User Sessions" value={formatNumber(users.reduce((total, user) => total + user.sessionCount, 0))} />
            <MetricTile label="User Memberships" value={formatNumber(users.reduce((total, user) => total + user.membershipCount, 0))} />
            <MetricTile label="User Identities" value={formatNumber(users.reduce((total, user) => total + user.identityCount, 0))} />
          </div>
        )}
        {users.length === 0 ? (
          <div className="empty-state compact">No admin user data loaded.</div>
        ) : (
          users.map((user) => (
            <article className="operator-item admin-item" key={user.id}>
              <div className="operator-row">
                <span className={`status-pill ${user.disabled ? "failed" : "completed"}`}>{user.disabled ? "disabled" : "active"}</span>
                <strong>{user.sessionCount} sessions</strong>
              </div>
              <h3>{user.displayName}</h3>
              <p>{user.email ?? "No email"} - {user.id}</p>
              <div className="admin-meta">
                <span>{user.membershipCount} memberships</span>
                <span>{user.identityCount} identities</span>
                <span>{user.passwordResetRequired ? "reset required" : "password current"}</span>
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Issue password reset email" onClick={() => props.onIssueReset(user).catch(console.error)} disabled={!user.email || user.disabled}>
                  <Mail size={14} /> Reset
                </button>
                <button className="ghost-button" title="Require password reset at next login" onClick={() => props.onRequireReset(user).catch(console.error)} disabled={user.disabled}>
                  <KeyRound size={14} /> Require
                </button>
                {user.disabled ? (
                  <button className="ghost-button" title="Enable account" onClick={() => props.onEnableUser(user).catch(console.error)}>
                    <Check size={14} /> Enable
                  </button>
                ) : (
                  <button className="ghost-button" title={user.id === props.currentUserId ? "Admins cannot disable their current account" : "Disable account"} onClick={() => props.onDisableUser(user).catch(console.error)} disabled={user.id === props.currentUserId}>
                    <UserX size={14} /> Disable
                  </button>
                )}
                <button className="ghost-button" title="Revoke all user sessions" onClick={() => props.onRevokeUserSessions(user).catch(console.error)} disabled={user.sessionCount === 0}>
                  <RefreshCw size={14} /> Revoke
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Organization access">
        <div className="operator-heading">
          <div className="section-title">Organization Access</div>
          <strong>{scimMappings.length} mappings</strong>
        </div>
        {scimMappings.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="SCIM Mappings" value={formatNumber(scimMappings.length)} />
            <MetricTile label="Matched Groups" value={formatNumber(matchedScimMappingCount)} />
            <MetricTile label="Pending Groups" value={formatNumber(scimMappings.length - matchedScimMappingCount)} />
            <MetricTile label="Mapped Members" value={formatNumber(scimMappedMemberCount)} />
            <MetricTile label="Mapped Campaigns" value={formatNumber(new Set(scimMappings.map((mapping) => mapping.campaignId)).size)} />
            <MetricTile label="Mapped Roles" value={formatNumber(new Set(scimMappings.map((mapping) => mapping.role)).size)} />
          </div>
        )}
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            const groupValue = scimGroupValue.trim();
            if (!selectedScimCampaignId || !groupValue) return;
            const input: AdminScimGroupRoleMappingInput = { campaignId: selectedScimCampaignId, role: scimRole };
            input[scimMatchType] = groupValue;
            props.onCreateScimMapping(input).then(() => setScimGroupValue("")).catch(console.error);
          }}
        >
          <div className="operator-row">
            <span>SCIM group mapping</span>
            <strong>{props.campaigns.length} campaigns</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Campaign</span>
              <select aria-label="Mapping campaign" value={selectedScimCampaignId} onChange={(event) => setScimCampaignId(event.target.value)}>
                {props.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Role</span>
              <select aria-label="Mapping role" value={scimRole} onChange={(event) => setScimRole(event.target.value as ScimAssignableRole)}>
                <option value="player">Player</option>
                <option value="observer">Observer</option>
                <option value="assistant_gm">Assistant GM</option>
                <option value="gm">GM</option>
              </select>
            </label>
            <label>
              <span>Match</span>
              <select aria-label="SCIM group match" value={scimMatchType} onChange={(event) => setScimMatchType(event.target.value as "groupDisplayName" | "groupExternalId" | "groupId")}>
                <option value="groupDisplayName">Display name</option>
                <option value="groupExternalId">External id</option>
                <option value="groupId">Group id</option>
              </select>
            </label>
            <label>
              <span>Group</span>
              <input aria-label="SCIM group identifier" value={scimGroupValue} placeholder={scimMatchType === "groupId" ? "scimg_..." : "External group name"} onChange={(event) => setScimGroupValue(event.target.value)} />
            </label>
          </div>
          <button className="ghost-button wide" type="submit" disabled={!selectedScimCampaignId || !scimGroupValue.trim()}>
            <UserPlus size={14} /> Add mapping
          </button>
        </form>
        {!props.admin ? (
          <div className="empty-state compact">No organization data loaded.</div>
        ) : scimMappings.length === 0 ? (
          <div className="empty-state compact">No SCIM group role mappings.</div>
        ) : (
          scimMappings.slice(0, 8).map((mapping) => (
            <article className="operator-item admin-item" key={mapping.id}>
              <div className="operator-row">
                <span className={`status-pill ${mapping.group ? "completed" : "running"}`}>{mapping.group ? "matched" : "pending"}</span>
                <strong>{mapping.role}</strong>
              </div>
              <h3>{scimMappingLabel(mapping)}</h3>
              <p>{campaignName(props.campaigns, mapping.campaignId)} - {mapping.id}</p>
              <div className="admin-meta">
                <span>{mapping.group?.memberUserIds.length ?? 0} SCIM members</span>
                <span>{scimMappingIdentity(mapping)}</span>
                <span>{formatDateTime(mapping.updatedAt)}</span>
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Delete SCIM group role mapping" onClick={() => props.onDeleteScimMapping(mapping).catch(console.error)}>
                  <UserX size={14} /> Delete mapping
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Asset storage operations">
        <div className="operator-heading">
          <div className="section-title">Asset Storage</div>
          <strong>{assetStorage?.runtime.provider ?? "not loaded"}</strong>
        </div>
        {!assetStorage ? (
          <div className="empty-state compact">No asset storage data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${assetStorage.operations.actionRequired ? "failed" : "completed"}`}>{assetStorage.operations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{assetStorage.runtime.delivery.mode}</strong>
              </div>
              <p>{assetStorage.runtime.delivery.cdnConfigured ? "CDN configured" : "signed blob delivery"} - {assetStorage.runtime.trustScanner.externalConfigured ? "external scanner configured" : "built-in scanner only"}</p>
              <div className="admin-meta">
                <span>{assetStorage.operations.actionReasons.length > 0 ? assetStorage.operations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{assetStorage.runtime.delivery.purgeWebhookConfigured ? "purge webhook configured" : "purge webhook missing"}</span>
                <span>{assetStorage.runtime.cleanup.enabled ? "cleanup scheduled" : "cleanup manual"}</span>
                {assetStorage.runtime.invalidConfig.length > 0 && <span>invalid config {assetStorage.runtime.invalidConfig.join(", ")}</span>}
                {assetStorage.runtime.invalidUrlConfig.length > 0 && <span>invalid URLs {assetStorage.runtime.invalidUrlConfig.join(", ")}</span>}
                {assetStorage.runtime.insecureUrlConfig.length > 0 && <span>insecure production URLs {assetStorage.runtime.insecureUrlConfig.join(", ")}</span>}
                {assetStorage.runtime.missingTokenConfig.length > 0 && <span>missing webhook tokens {assetStorage.runtime.missingTokenConfig.join(", ")}</span>}
                {assetStorage.runtime.cleanup.riskyConfig.length > 0 && <span>risky cleanup config {assetStorage.runtime.cleanup.riskyConfig.join(", ")}</span>}
                {assetStorage.runtime.quota.quotaPolicyMissingInProduction && <span>production quota policy missing</span>}
                {assetStorage.runtime.lifecycle.retentionPolicyMissingInProduction && <span>production retention policy missing</span>}
                <span>{assetStorage.runtime.delivery.purgeWebhookTokenConfigured ? "purge token configured" : "purge token missing"}</span>
                <span>{assetStorage.runtime.trustScanner.tokenConfigured ? "scanner token configured" : "scanner token missing"}</span>
                {assetStorage.runtime.s3 && <span>S3 {assetStorage.runtime.s3.bucketConfigured ? "bucket configured" : "bucket missing"} / {assetStorage.runtime.s3.endpointConfigured ? (assetStorage.runtime.s3.endpointValid ? "endpoint valid" : "endpoint invalid") : "AWS endpoint default"}</span>}
                {assetStorage.runtime.s3?.endpointInsecureInProduction && <span>S3 endpoint insecure in production</span>}
                {assetStorage.runtime.s3?.partialExplicitCredentials && <span>S3 credentials partial</span>}
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Assets" value={formatNumber(assetStorage.assetCount)} />
              <MetricTile label="Active" value={formatNumber(assetStorage.activeAssetCount)} />
              <MetricTile label="Asset Action" value={assetStorage.operations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Asset Reasons" value={formatNumber(assetStorage.operations.actionReasons.length)} />
              <MetricTile label="Asset Remediations" value={formatNumber(assetStorage.operations.remediationQueue.length)} />
              <MetricTile label="Asset Errors" value={formatNumber(assetStorage.operations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Asset Warnings" value={formatNumber(assetStorage.operations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Archived" value={formatNumber(assetStorage.lifecycleCounts.archived)} />
              <MetricTile label="Deleted" value={formatNumber(assetStorage.lifecycleCounts.deleted)} />
              <MetricTile label="Used" value={formatStorageBytes(assetStorage.usedBytes)} />
              <MetricTile label="Stored Bytes" value={formatStorageBytes(assetStorage.allBytes)} />
              <MetricTile label="Storage Provider" value={assetStorage.runtime.provider} />
              <MetricTile label="Storage Providers" value={formatNumber(Object.keys(assetStorage.providerCounts).length)} />
              <MetricTile label="S3 Active" value={assetStorage.runtime.s3?.active ? "yes" : "no"} />
              <MetricTile label="S3 Bucket" value={assetStorage.runtime.s3?.bucketConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Endpoint" value={assetStorage.runtime.s3?.endpointConfigured ? (assetStorage.runtime.s3.endpointValid ? "valid" : "invalid") : "default"} />
              <MetricTile label="S3 Region" value={assetStorage.runtime.s3?.regionConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Path Style" value={assetStorage.runtime.s3?.forcePathStyle ? "yes" : "no"} />
              <MetricTile label="S3 Explicit Creds" value={assetStorage.runtime.s3?.explicitCredentialsConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Credentials" value={assetStorage.runtime.s3?.partialExplicitCredentials ? "partial" : "ready"} />
              <MetricTile label="Campaigns" value={formatNumber(assetStorage.campaigns.length)} />
              <MetricTile label="Asset Campaign Providers" value={formatNumber(assetCampaignProviderSpread)} />
              <MetricTile label="Asset Campaign Lifecycles" value={formatNumber(assetCampaignLifecycleSpread)} />
              <MetricTile label="Largest Asset Samples" value={formatNumber(assetCampaignLargestSampleCount)} />
              <MetricTile label="Quota Enabled" value={assetStorage.runtime.quota.enabled ? "yes" : "no"} />
              <MetricTile label="Quota Risk" value={formatNumber(assetStorage.operations.quota.atRiskCampaigns.length)} />
              <MetricTile label="Quota Risk Bytes" value={formatStorageBytes(assetStorage.operations.quota.atRiskCampaigns.reduce((total, campaign) => total + campaign.usedBytes, 0))} />
              <MetricTile label="Quota Limit" value={assetStorage.runtime.quota.quotaBytes === undefined ? "none" : formatStorageBytes(assetStorage.runtime.quota.quotaBytes)} />
              <MetricTile label="Quota Policy" value={assetStorage.runtime.quota.quotaPolicyMissingInProduction ? "missing" : "ready"} />
              <MetricTile label="Retention Enabled" value={assetStorage.runtime.lifecycle.retentionDays === undefined ? "no" : "yes"} />
              <MetricTile label="Retention Days" value={assetStorage.runtime.lifecycle.retentionDays === undefined ? "none" : formatNumber(assetStorage.runtime.lifecycle.retentionDays)} />
              <MetricTile label="Retention Policy" value={assetStorage.runtime.lifecycle.retentionPolicyMissingInProduction ? "missing" : "ready"} />
              <MetricTile label="Migration Target" value={assetStorage.runtime.migrationTargetProvider} />
              <MetricTile label="Migration" value={formatNumber(assetStorage.operations.migrationBacklog.assetCount)} />
              <MetricTile label="Migration Samples" value={formatNumber(assetStorage.operations.migrationBacklog.assets.length)} />
              <MetricTile label="Migration Providers" value={formatNumber(Object.keys(assetStorage.operations.migrationBacklog.providerCounts).length)} />
              <MetricTile label="Migration Bytes" value={formatStorageBytes(assetStorage.operations.migrationBacklog.bytes)} />
              <MetricTile label="Cleanup" value={formatNumber(assetStorage.operations.cleanupBacklog.assetCount)} />
              <MetricTile label="Cleanup Samples" value={formatNumber(assetStorage.operations.cleanupBacklog.assets.length)} />
              <MetricTile label="Cleanup Providers" value={formatNumber(new Set(assetStorage.operations.cleanupBacklog.assets.map((asset) => asset.provider)).size)} />
              <MetricTile label="Cleanup Bytes" value={formatStorageBytes(assetStorage.operations.cleanupBacklog.bytes)} />
              <MetricTile label="Oldest Cleanup" value={formatDurationSeconds(assetStorage.operations.cleanupBacklog.oldestEligibleAgeSeconds)} />
              <MetricTile label="Deleted Backlog" value={formatNumber(assetStorage.operations.cleanupBacklog.deletedAssetCount)} />
              <MetricTile label="Expired Backlog" value={formatNumber(assetStorage.operations.cleanupBacklog.expiredAssetCount)} />
              <MetricTile label="Cleanup Enabled" value={assetStorage.runtime.cleanup.enabled ? "yes" : "no"} />
              <MetricTile label="Cleanup Running" value={assetStorage.runtime.cleanup.running ? "yes" : "no"} />
              <MetricTile label="Cleanup Interval" value={assetStorage.runtime.cleanup.enabled ? formatDurationSeconds(assetStorage.runtime.cleanup.intervalSeconds) : "manual"} />
              <MetricTile label="Cleanup Grace" value={assetStorage.runtime.cleanup.graceDays === undefined ? "none" : `${formatNumber(assetStorage.runtime.cleanup.graceDays)} d`} />
              <MetricTile label="Cleanup Dry Run" value={assetStorage.runtime.cleanup.dryRun ? "yes" : "no"} />
              <MetricTile label="Cleanup Startup" value={assetStorage.runtime.cleanup.runOnStart ? "yes" : "no"} />
              <MetricTile label="Cleanup Targets" value={`${assetStorage.runtime.cleanup.includeDeleted ? "D" : "-"}${assetStorage.runtime.cleanup.includeExpired ? "E" : "-"}`} />
              <MetricTile label="Cleanup Risk Config" value={formatNumber(assetStorage.runtime.cleanup.riskyConfig.length)} />
              <MetricTile label="Missing Refs" value={formatNumber(assetStorage.operations.hygiene.missingStorageRefs)} />
              <MetricTile label="Unscanned" value={formatNumber(assetStorage.operations.hygiene.unscannedAssets)} />
              <MetricTile label="Trust Warnings" value={formatNumber(assetStorage.operations.hygiene.trustWarningAssets)} />
              <MetricTile label="Trust Warning Samples" value={formatNumber(assetStorage.operations.hygiene.trustWarningSamples.length)} />
              <MetricTile label="Built-in Scanner" value={assetStorage.runtime.trustScanner.builtinEnabled ? "yes" : "no"} />
              <MetricTile label="External Scanner" value={assetStorage.runtime.trustScanner.externalConfigured ? "yes" : "no"} />
              <MetricTile label="Scanner Token" value={assetStorage.runtime.trustScanner.tokenConfigured ? "yes" : "no"} />
              <MetricTile label="Scanner Fail Closed" value={assetStorage.runtime.trustScanner.failClosed ? "yes" : "no"} />
              <MetricTile label="Scanner Timeout" value={formatDuration(assetStorage.runtime.trustScanner.timeoutMs)} />
              <MetricTile label="Maintenance Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.totalRunCount)} />
              <MetricTile label="Recent Maintenance Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.recentRuns.length)} />
              <MetricTile label="Latest Maintenance" value={assetStorage.operations.maintenanceOperations.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.latestRunAt) : "none"} />
              <MetricTile label="Maintenance Dry Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.dryRunCount)} />
              <MetricTile label="Maintenance Mutations" value={formatNumber(assetStorage.operations.maintenanceOperations.mutationRunCount)} />
              <MetricTile label="Maintenance Changed" value={formatNumber(assetStorage.operations.maintenanceOperations.changedRunCount)} />
              <MetricTile label="Maintenance Failed" value={formatNumber(assetStorage.operations.maintenanceOperations.failedRunCount)} />
              <MetricTile label="Maintenance Assets" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.assetCount + assetStorage.operations.maintenanceOperations.cleanup.assetCount + assetStorage.operations.maintenanceOperations.quarantine.assetCount)} />
              <MetricTile label="Maintenance Matched" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.matched + assetStorage.operations.maintenanceOperations.cleanup.matched + assetStorage.operations.maintenanceOperations.quarantine.matched)} />
              <MetricTile label="Maintenance Planned" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.planned + assetStorage.operations.maintenanceOperations.cleanup.planned + assetStorage.operations.maintenanceOperations.quarantine.planned)} />
              <MetricTile label="Maintenance Skipped" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.skipped + assetStorage.operations.maintenanceOperations.cleanup.skipped + assetStorage.operations.maintenanceOperations.quarantine.skipped)} />
              <MetricTile label="Maintenance Failed Assets" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.failed + assetStorage.operations.maintenanceOperations.cleanup.failed + assetStorage.operations.maintenanceOperations.quarantine.failed)} />
              <MetricTile label="Migration Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.runCount)} />
              <MetricTile label="Latest Migration" value={assetStorage.operations.maintenanceOperations.migration.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.migration.latestRunAt) : "none"} />
              <MetricTile label="Cleanup Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.cleanup.runCount)} />
              <MetricTile label="Latest Cleanup" value={assetStorage.operations.maintenanceOperations.cleanup.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.cleanup.latestRunAt) : "none"} />
              <MetricTile label="Quarantine Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.quarantine.runCount)} />
              <MetricTile label="Latest Quarantine" value={assetStorage.operations.maintenanceOperations.quarantine.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.quarantine.latestRunAt) : "none"} />
              <MetricTile label="Warnings" value={formatNumber(assetStorage.operations.delivery.warnings.length)} />
              <MetricTile label="Delivery Error Warnings" value={formatNumber(assetStorage.operations.delivery.warnings.filter((warning) => warning.severity === "error").length)} />
              <MetricTile label="Delivery Warning Notices" value={formatNumber(assetStorage.operations.delivery.warnings.filter((warning) => warning.severity === "warning").length)} />
              <MetricTile label="Managed Assets" value={formatNumber(assetStorage.operations.delivery.posture.activeManagedAssetCount)} />
              <MetricTile label="Deliverable" value={formatNumber(assetStorage.operations.delivery.posture.deliverableActiveAssetCount)} />
              <MetricTile label="Deliverable Bytes" value={formatStorageBytes(assetStorage.operations.delivery.posture.deliverableActiveBytes)} />
              <MetricTile label="Delivery Coverage" value={formatPercent(assetStorage.operations.delivery.posture.deliverableCoverageRate)} />
              <MetricTile label="Deliverable Samples" value={formatNumber(assetStorage.operations.delivery.posture.deliverableSamples.length)} />
              <MetricTile label="Undeliverable" value={formatNumber(assetStorage.operations.delivery.posture.undeliverableActiveAssetCount)} />
              <MetricTile label="Undeliverable Samples" value={formatNumber(assetStorage.operations.delivery.posture.undeliverableSamples.length)} />
              <MetricTile label="Undeliverable Bytes" value={formatStorageBytes(assetStorage.operations.delivery.posture.undeliverableActiveBytes)} />
              <MetricTile label="Expired Active" value={formatNumber(assetStorage.operations.delivery.posture.expiredActiveAssetCount)} />
              <MetricTile label="Delivery Mode" value={assetStorage.runtime.delivery.mode} />
              <MetricTile label="CDN Configured" value={assetStorage.runtime.delivery.cdnConfigured ? "yes" : "no"} />
              <MetricTile label="CDN Eligible" value={formatNumber(assetStorage.operations.delivery.posture.cdnEligibleAssetCount)} />
              <MetricTile label="Signed Eligible" value={formatNumber(assetStorage.operations.delivery.posture.signedUrlEligibleAssetCount)} />
              <MetricTile label="Signing Required" value={assetStorage.runtime.delivery.signingSecretRequired ? "yes" : "no"} />
              <MetricTile label="Signing Secret" value={assetStorage.runtime.delivery.signingSecretConfigured ? "yes" : "no"} />
              <MetricTile label="Public URL" value={assetStorage.runtime.delivery.publicUrlConfigured ? "yes" : "no"} />
              <MetricTile label="Default URL TTL" value={formatDurationSeconds(assetStorage.runtime.delivery.defaultTtlSeconds)} />
              <MetricTile label="Max URL TTL" value={formatDurationSeconds(assetStorage.runtime.delivery.maxTtlSeconds)} />
              <MetricTile label="Purge Webhook" value={assetStorage.runtime.delivery.purgeWebhookConfigured ? "yes" : "no"} />
              <MetricTile label="Purge Token" value={assetStorage.runtime.delivery.purgeWebhookTokenConfigured ? "yes" : "no"} />
              <MetricTile label="Purge Timeout" value={formatDuration(assetStorage.runtime.delivery.purgeTimeoutMs)} />
              <MetricTile label="Delivery Events" value={formatNumber(assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Recent Delivery Events" value={formatNumber(assetStorage.operations.delivery.runtime.recent.length)} />
              <MetricTile label="Assets Served" value={formatNumber(assetStorage.operations.delivery.runtime.servedCount)} />
              <MetricTile label="Unavailable Assets" value={formatNumber(assetStorage.operations.delivery.runtime.unavailableCount)} />
              <MetricTile label="Unavailable Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.unavailableCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Recent Delivery Failures" value={formatNumber(assetStorage.operations.delivery.runtime.recentFailures.length)} />
              <MetricTile label="Failure Campaigns" value={formatNumber(new Set(assetStorage.operations.delivery.runtime.recentFailures.map((event) => event.campaignId ?? "unknown")).size)} />
              <MetricTile label="Delivery Statuses" value={formatNumber(Object.keys(assetStorage.operations.delivery.runtime.statusCounts).length)} />
              <MetricTile label="Access Modes" value={formatNumber(Object.keys(assetStorage.operations.delivery.runtime.accessModeCounts).length)} />
              <MetricTile label="Signed Delivery" value={formatNumber(assetStorage.operations.delivery.runtime.accessModeCounts.signed)} />
              <MetricTile label="Session Delivery" value={formatNumber(assetStorage.operations.delivery.runtime.accessModeCounts.session)} />
              <MetricTile label="Delivery Failures" value={formatNumber(assetStorage.operations.delivery.runtime.failureCount)} />
              <MetricTile label="Delivery Failure Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.failureCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Delivery Denied" value={formatNumber(assetStorage.operations.delivery.runtime.deniedCount)} />
              <MetricTile label="Delivery Denied Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.deniedCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Missing Bytes" value={formatNumber(assetStorage.operations.delivery.runtime.missingBytesCount)} />
              <MetricTile label="Signing Failures" value={formatNumber(assetStorage.operations.delivery.runtime.signingFailedCount)} />
              <MetricTile label="Signing Failure Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.signingFailedCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Served Bytes" value={formatStorageBytes(assetStorage.operations.delivery.runtime.servedBytes)} />
              <MetricTile label="Failed Bytes" value={formatStorageBytes(assetStorage.operations.delivery.runtime.failedBytes)} />
              <MetricTile label="CDN Purges" value={formatNumber(assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Recent Purges" value={formatNumber(assetStorage.operations.delivery.purgeOperations.recent.length)} />
              <MetricTile label="Recent Purge Campaigns" value={formatNumber(new Set(assetStorage.operations.delivery.purgeOperations.recent.map((purge) => purge.campaignId ?? "unknown")).size)} />
              <MetricTile label="Purged" value={formatNumber(assetStorage.operations.delivery.purgeOperations.purgedCount)} />
              <MetricTile label="Purge Success" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 1 : assetStorage.operations.delivery.purgeOperations.purgedCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Purge Failures" value={formatNumber(assetStorage.operations.delivery.purgeOperations.failedCount)} />
              <MetricTile label="Purge Failure Rate" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 0 : assetStorage.operations.delivery.purgeOperations.failedCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Purge Not Configured" value={formatNumber(assetStorage.operations.delivery.purgeOperations.notConfiguredCount)} />
              <MetricTile label="Purge Config Gap Rate" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 0 : assetStorage.operations.delivery.purgeOperations.notConfiguredCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
            </div>
            {assetStorage.operations.quota.enabled && (
              <p className="admin-status">{assetStorage.operations.quota.atRiskCampaigns.length} quota-risk campaigns out of {formatStorageBytes(assetStorage.operations.quota.quotaBytes)}</p>
            )}
            {assetStorage.operations.delivery.warnings.slice(0, 3).map((warning) => (
              <div className="operator-row tool-call-row" key={warning.code}>
                <span>{warning.message}</span>
                <strong>{warning.severity}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.posture.undeliverableSamples.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`undeliverable-asset-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.reason} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.runtime.recentFailures.slice(0, 3).map((event) => (
              <div className="operator-row tool-call-row" key={`asset-delivery-failure-${event.id}`}>
                <span>{event.assetId ?? "unknown asset"}</span>
                <strong>{event.status} - {event.accessMode} - {event.reason ?? formatDateTime(event.createdAt)}</strong>
              </div>
            ))}
            {assetStorage.operations.hygiene.trustWarningSamples.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`asset-trust-warning-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.highestSeverity} - {asset.findingCodes.join(", ") || "trust finding"} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.maintenanceOperations.recentRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`asset-maintenance-${run.id}`}>
                <span>{run.operation}{run.dryRun ? " dry run" : ""}</span>
                <strong>
                  {formatNumber(run.assetCount)} assets - {run.failed > 0 ? `${formatNumber(run.failed)} failed` : run.changed ? "changed" : "no change"} - {formatDateTime(run.createdAt)}
                </strong>
              </div>
            ))}
            {assetStorage.operations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`asset-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected{item.bytes !== undefined ? ` - ${formatStorageBytes(item.bytes)}` : ""}</strong>
                </div>
                <h3>{item.code}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {assetStorage.operations.quota.atRiskCampaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={campaign.campaignId}>
                <span>{campaignName(props.campaigns, campaign.campaignId)}</span>
                <strong>{formatPercent(campaign.usageRatio)} used - {formatStorageBytes(campaign.remainingBytes)} left</strong>
              </div>
            ))}
            {assetStorage.campaigns.slice(0, 3).map((campaign) => {
              const largestAsset = campaign.largestAssets[0];
              return (
                <div className="operator-row tool-call-row" key={`asset-campaign-${campaign.campaignId}`}>
                  <span>{campaignName(props.campaigns, campaign.campaignId)}</span>
                  <strong>
                    {formatStorageBytes(campaign.usedBytes)} used across {formatNumber(campaign.assetCount)} assets
                    {largestAsset ? ` - largest ${largestAsset.name} ${formatStorageBytes(largestAsset.sizeBytes)}` : ""}
                  </strong>
                </div>
              );
            })}
            {assetStorage.operations.cleanupBacklog.assets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`cleanup-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.reason} - {formatStorageBytes(asset.sizeBytes)} - eligible {formatDurationSeconds(asset.eligibleAgeSeconds)}</strong>
              </div>
            ))}
            {assetStorage.operations.migrationBacklog.assets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`migration-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.fromProvider} to {asset.toProvider} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.purgeOperations.recent.slice(0, 3).map((purge) => (
              <div className="operator-row tool-call-row" key={`asset-purge-${purge.id}`}>
                <span>{purge.assetId ?? "unknown asset"}</span>
                <strong>{purge.status} - {purge.error ?? purge.reason ?? formatDateTime(purge.createdAt)}</strong>
              </div>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Migrate uploaded asset bytes to the active storage provider" onClick={() => props.onMigrateStoredAssetBytes().catch(console.error)} disabled={assetStorage.operations.migrationBacklog.assetCount === 0}>
                <RefreshCw size={14} /> Migrate assets
              </button>
              <button className="ghost-button" title="Delete stored bytes for eligible deleted or expired assets" onClick={() => props.onCleanupStoredAssetBytes().catch(console.error)} disabled={assetStorage.operations.cleanupBacklog.assetCount === 0}>
                <RefreshCw size={14} /> Run cleanup
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Asset integrity operations">
        <div className="operator-heading">
          <div className="section-title">Asset Integrity</div>
          <strong>{assetIntegrity?.provider ?? "not loaded"}</strong>
        </div>
        {!assetIntegrity ? (
          <div className="empty-state compact">No asset integrity data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${assetIntegrity.actionRequired > 0 ? "failed" : "completed"}`}>{assetIntegrity.actionRequired > 0 ? "action required" : "healthy"}</span>
                <strong>{formatNumber(assetIntegrity.actionRequired)} actionable</strong>
              </div>
              <p>{formatNumber(assetIntegrity.verified)} verified - {formatNumber(assetIntegrity.assetCount)} assets scanned</p>
              <div className="admin-meta">
                <span>{assetIntegrity.actionReasons.length > 0 ? assetIntegrity.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{assetIntegrity.healthy ? "byte checks healthy" : "byte checks need attention"}</span>
                <span>{formatNumber(assetIntegrity.skipped)} skipped</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Assets Scanned" value={formatNumber(assetIntegrity.assetCount)} />
              <MetricTile label="Integrity Provider" value={assetIntegrity.provider} />
              <MetricTile label="Actionable" value={formatNumber(assetIntegrity.actionRequired)} />
              <MetricTile label="Integrity Healthy" value={assetIntegrity.healthy ? "yes" : "no"} />
              <MetricTile label="Integrity Reasons" value={formatNumber(assetIntegrity.actionReasons.length)} />
              <MetricTile label="Integrity Remediations" value={formatNumber(assetIntegrity.remediationQueue.length)} />
              <MetricTile label="Integrity Errors" value={formatNumber(assetIntegrity.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Integrity Warnings" value={formatNumber(assetIntegrity.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Integrity Statuses" value={formatNumber(new Set(assetIntegrity.results.map((asset) => asset.status)).size)} />
              <MetricTile label="Integrity Result Rows" value={formatNumber(assetIntegrity.results.filter((asset) => asset.status !== "verified").length)} />
              <MetricTile label="Verified Coverage" value={formatPercent(assetIntegrity.assetCount === 0 ? 1 : assetIntegrity.verified / assetIntegrity.assetCount)} />
              <MetricTile label="Missing" value={formatNumber(assetIntegrity.missing)} />
              <MetricTile label="Mismatched" value={formatNumber(assetIntegrity.mismatched)} />
              <MetricTile label="Cleanup Eligible" value={formatNumber(assetIntegrity.cleanupEligible)} />
              <MetricTile label="Failed Scans" value={formatNumber(assetIntegrity.failed)} />
              <MetricTile label="Verified" value={formatNumber(assetIntegrity.verified)} />
              <MetricTile label="Skipped" value={formatNumber(assetIntegrity.skipped)} />
            </div>
            {assetIntegrity.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`asset-integrity-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Archive active assets whose bytes are missing or mismatched" onClick={() => props.onQuarantineAssetIntegrityFailures().catch(console.error)} disabled={assetIntegrity.missing + assetIntegrity.mismatched === 0}>
                <RefreshCw size={14} /> Archive broken assets
              </button>
            </div>
            {assetIntegrity.results.filter((asset) => asset.status !== "verified").slice(0, 4).map((asset) => (
              <article className="operator-item admin-item" key={asset.assetId}>
                <div className="operator-row">
                  <span className={`status-pill ${asset.status === "skipped" ? "running" : "failed"}`}>{asset.status}</span>
                  <strong>{asset.provider}</strong>
                </div>
                <h3>{asset.name}</h3>
                <p>{asset.reason ?? asset.assetId}</p>
                {(asset.expectedSizeBytes !== undefined || asset.actualSizeBytes !== undefined) && (
                  <div className="admin-meta">
                    <span>expected {formatStorageBytes(asset.expectedSizeBytes)}</span>
                    <span>actual {formatStorageBytes(asset.actualSizeBytes)}</span>
                  </div>
                )}
                <div className="admin-actions">
                  <button className="ghost-button" title="Purge this asset from the configured CDN cache" onClick={() => props.onPurgeAssetCdnCache(asset.assetId, asset.name).catch(console.error)} disabled={!assetStorage?.runtime.delivery.purgeWebhookConfigured}>
                    <RefreshCw size={14} /> Purge CDN
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Rendering operations">
        <div className="operator-heading">
          <div className="section-title">Rendering Operations</div>
          <strong>{renderingOperations ? `${renderingOperations.totals.sceneCount} scenes` : "not loaded"}</strong>
        </div>
        {!renderingOperations ? (
          <div className="empty-state compact">No rendering operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${renderingOperations.actionRequired ? "failed" : "completed"}`}>{renderingOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{formatNumber(renderingOperations.totals.issueCount)} issues</strong>
              </div>
              <p>{formatNumber(renderingOperations.totals.maxPolygonVertexCount)} / {formatNumber(renderingOperations.budget.maxPolygonVertexBudget)} max polygon vertices - {formatNumber(renderingOperations.totals.terrainWallCount)} terrain walls - {formatNumber(renderingOperations.totals.degenerateWallCount)} degenerate walls</p>
              <div className="admin-meta">
                <span>{renderingOperations.actionReasons.length > 0 ? renderingOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(renderingOperations.issueSeverityCounts.error)} errors</span>
                <span>{formatNumber(renderingOperations.issueSeverityCounts.warning)} warnings</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Scenes" value={formatNumber(renderingOperations.totals.sceneCount)} />
              <MetricTile label="Render Campaigns" value={formatNumber(renderingOperations.totals.campaignCount)} />
              <MetricTile label="Render Issues" value={formatNumber(renderingOperations.totals.issueCount)} />
              <MetricTile label="Render Action" value={renderingOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Rendering Reasons" value={formatNumber(renderingOperations.actionReasons.length)} />
              <MetricTile label="Rendering Remediations" value={formatNumber(renderingOperations.remediationQueue.length)} />
              <MetricTile label="Rendering Errors" value={formatNumber(renderingOperations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Rendering Warnings" value={formatNumber(renderingOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Fog" value={formatNumber(renderingOperations.totals.fogRegionCount)} />
              <MetricTile label="Walls" value={formatNumber(renderingOperations.totals.wallCount)} />
              <MetricTile label="Terrain Walls" value={formatNumber(renderingOperations.totals.terrainWallCount)} />
              <MetricTile label="Degenerate Walls" value={formatNumber(renderingOperations.totals.degenerateWallCount)} />
              <MetricTile label="Lights" value={formatNumber(renderingOperations.totals.lightCount)} />
              <MetricTile label="Vision" value={formatNumber(renderingOperations.totals.tokenVisionSourceCount)} />
              <MetricTile label="Render Errors" value={formatNumber(renderingOperations.issueSeverityCounts.error)} />
              <MetricTile label="Render Warnings" value={formatNumber(renderingOperations.issueSeverityCounts.warning)} />
              <MetricTile label="Render Error Rate" value={formatPercent(renderingOperations.totals.issueCount === 0 ? 0 : (renderingOperations.issueSeverityCounts.error ?? 0) / renderingOperations.totals.issueCount)} />
              <MetricTile label="Top Issue Samples" value={formatNumber(renderingOperations.topIssues.length)} />
              <MetricTile label="Issue Codes" value={formatNumber(Object.keys(renderingOperations.issueCodeCounts).length)} />
              <MetricTile label="Vertices" value={formatNumber(renderingOperations.totals.polygonVertexCount)} />
              <MetricTile label="Vertex Budget Limit" value={formatNumber(renderingOperations.budget.totalPolygonVertexBudget)} />
              <MetricTile label="Max Vertex Usage" value={`${formatPercent(renderingOperations.budget.maxPolygonUsageRatio)} used`} />
              <MetricTile label="Vertex Budget" value={`${formatPercent(renderingOperations.budget.totalPolygonUsageRatio)} used`} />
              <MetricTile label="Max Budget Exceeded" value={renderingOperations.budget.maxPolygonExceeded ? "yes" : "no"} />
              <MetricTile label="Total Budget Exceeded" value={renderingOperations.budget.totalPolygonExceeded ? "yes" : "no"} />
              <MetricTile label="Scenes Flagged" value={formatNumber(renderingOperations.totals.sceneActionRequiredCount)} />
              <MetricTile label="Flagged Scene Samples" value={formatNumber(renderingOperations.scenesRequiringAction.length)} />
              <MetricTile label="Max Budget" value={formatNumber(renderingOperations.budget.scenesExceedingMaxPolygonBudget)} />
              <MetricTile label="Total Budget" value={formatNumber(renderingOperations.budget.scenesExceedingTotalPolygonBudget)} />
              <MetricTile label="Feature Coverage Scenes" value={formatNumber(renderingOperations.featureCoverage.sceneCount)} />
              <MetricTile label="Feature Scenes" value={formatNumber(renderingOperations.featureCoverage.productionFeatureSceneCount)} />
              <MetricTile label="Featureless Scenes" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.productionFeatureSceneCount))} />
              <MetricTile label="Required Features" value={formatNumber(renderingOperations.featureCoverage.requiredFeatures.length)} />
              <MetricTile label="Present Features" value={formatNumber(renderingOperations.featureCoverage.requiredFeatures.filter((feature) => feature.present).length)} />
              <MetricTile label="Missing Features" value={formatNumber(renderingOperations.featureCoverage.missingRequiredFeatureCodes.length)} />
              <MetricTile label="Feature Samples" value={formatNumber(renderingFeatureSampleCount)} />
              <MetricTile label="Coverage Samples" value={formatNumber(renderingCoverageSampleCount)} />
              <MetricTile label="Feature Checklist" value={renderingOperations.featureCoverage.complete ? "complete" : "incomplete"} />
              <MetricTile label="Polygon Fog" value={formatNumber(renderingOperations.featureCoverage.scenesWithPolygonFogCount)} />
              <MetricTile label="Polygon Fog Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithPolygonFogCount))} />
              <MetricTile label="Polygon Fog Coverage" value={formatPercent(renderingOperations.featureCoverage.polygonFogCoverageRate)} />
              <MetricTile label="Smooth Fog" value={formatNumber(renderingOperations.featureCoverage.scenesWithSmoothFogCount)} />
              <MetricTile label="Smooth Fog Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithSmoothFogCount))} />
              <MetricTile label="Smooth Fog Coverage" value={formatPercent(renderingOperations.featureCoverage.smoothFogCoverageRate)} />
              <MetricTile label="Colored Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithColoredLightsCount)} />
              <MetricTile label="Colored Light Coverage" value={formatPercent(renderingOperations.featureCoverage.coloredLightCoverageRate)} />
              <MetricTile label="Dimmed Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithDimmedLightsCount)} />
              <MetricTile label="Dimmed Light Coverage" value={formatPercent(renderingOperations.featureCoverage.dimmedLightCoverageRate)} />
              <MetricTile label="Dual-Zone Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithDualZoneLightsCount)} />
              <MetricTile label="Dual-Light Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithDualZoneLightsCount))} />
              <MetricTile label="Dual-Light Coverage" value={formatPercent(renderingOperations.featureCoverage.dualZoneLightCoverageRate)} />
              <MetricTile label="Token Vision Scenes" value={formatNumber(renderingOperations.featureCoverage.scenesWithTokenVisionCount)} />
              <MetricTile label="Token Vision Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithTokenVisionCount))} />
              <MetricTile label="Token Vision Coverage" value={formatPercent(renderingOperations.featureCoverage.tokenVisionCoverageRate)} />
              <MetricTile label="Dual-Zone Vision" value={formatNumber(renderingOperations.featureCoverage.scenesWithDualZoneTokenVisionCount)} />
              <MetricTile label="Dual-Zone Coverage" value={formatPercent(renderingOperations.featureCoverage.dualZoneTokenVisionCoverageRate)} />
              <MetricTile label="Terrain Scenes" value={formatNumber(renderingOperations.featureCoverage.scenesWithTerrainWallsCount)} />
              <MetricTile label="Terrain Coverage" value={formatPercent(renderingOperations.featureCoverage.terrainWallCoverageRate)} />
              <MetricTile label="Rendering Changes" value={formatNumber(renderingOperations.authoringOperations.totalCount)} />
              <MetricTile label="Recent Rendering Changes" value={formatNumber(renderingOperations.authoringOperations.recent.length)} />
              <MetricTile label="Changed Scenes" value={formatNumber(renderingOperations.authoringOperations.sceneCount)} />
              <MetricTile label="Changed Scene Samples" value={formatNumber(renderingOperations.authoringOperations.scenes.length)} />
              <MetricTile label="Changed Campaigns" value={formatNumber(new Set(renderingOperations.authoringOperations.scenes.map((scene) => scene.campaignId ?? "unknown")).size)} />
              <MetricTile label="Authoring Actions" value={formatNumber(Object.keys(renderingOperations.authoringOperations.actionCounts).length)} />
              <MetricTile label="Authoring Targets" value={formatNumber(Object.keys(renderingOperations.authoringOperations.targetTypeCounts).length)} />
              <MetricTile label="Rendering Authors" value={formatNumber(Object.keys(renderingOperations.authoringOperations.actorUserCounts).length)} />
              <MetricTile label="Fog Changes" value={formatNumber(renderingOperations.authoringOperations.fogOperationCount)} />
              <MetricTile label="Wall Changes" value={formatNumber(renderingOperations.authoringOperations.wallOperationCount)} />
              <MetricTile label="Light Changes" value={formatNumber(renderingOperations.authoringOperations.lightOperationCount)} />
              <MetricTile label="Failed Authoring Action" value={renderingOperations.failedAuthoringOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Failed Changes" value={formatNumber(renderingOperations.failedAuthoringOperations.failureCount)} />
              <MetricTile label="Recent Failed Changes" value={formatNumber(renderingOperations.failedAuthoringOperations.recentFailures.length)} />
              <MetricTile label="Failed Change Scenes" value={formatNumber(new Set(renderingOperations.failedAuthoringOperations.recentFailures.map((failure) => failure.sceneId ?? "unknown")).size)} />
              <MetricTile label="Failure Actions" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byAction).length)} />
              <MetricTile label="Failure Reasons" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byReason).length)} />
              <MetricTile label="Failure Targets" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byTargetType).length)} />
              <MetricTile label="Stale Issue Scenes" value={formatNumber(renderingOperations.staleIssueOperations.sceneCount)} />
              <MetricTile label="Stale Issue Samples" value={formatNumber(renderingOperations.staleIssueOperations.scenes.length)} />
              <MetricTile label="Stale Issues" value={formatNumber(renderingOperations.staleIssueOperations.issueCount)} />
              <MetricTile label="Stale Issue Action" value={renderingOperations.staleIssueOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Stale Issue Reasons" value={formatNumber(new Set(renderingOperations.staleIssueOperations.scenes.flatMap((scene) => scene.actionReasons)).size)} />
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${renderingOperations.featureCoverage.complete ? "completed" : "running"}`}>feature coverage</span>
                <strong>{formatPercent(renderingOperations.featureCoverage.tokenVisionCoverageRate)} token vision</strong>
              </div>
              <p>{formatPercent(renderingOperations.featureCoverage.polygonFogCoverageRate)} polygon fog - {formatPercent(renderingOperations.featureCoverage.smoothFogCoverageRate)} smooth fog - {formatPercent(renderingOperations.featureCoverage.coloredLightCoverageRate)} colored lights - {formatPercent(renderingOperations.featureCoverage.dimmedLightCoverageRate)} dimmed lights - {formatPercent(renderingOperations.featureCoverage.dualZoneLightCoverageRate)} dual-zone lights - {formatPercent(renderingOperations.featureCoverage.dualZoneTokenVisionCoverageRate)} dual-zone vision - {formatPercent(renderingOperations.featureCoverage.terrainWallCoverageRate)} terrain walls</p>
              <div className="admin-meta">
                {renderingOperations.featureCoverage.missingRequiredFeatureCodes.length > 0 ? <span>missing {renderingOperations.featureCoverage.missingRequiredFeatureCodes.join(", ")}</span> : <span>all production features evidenced</span>}
              </div>
            </article>
            {renderingOperations.featureCoverage.requiredFeatures.map((feature) => {
              const sample = feature.samples[0];
              return (
                <article className="operator-item admin-item" key={`rendering-feature-${feature.code}`}>
                  <div className="operator-row">
                    <span className={`status-pill ${feature.present ? "completed" : "running"}`}>{feature.present ? "present" : "missing"}</span>
                    <strong>{feature.label}</strong>
                  </div>
                  <p>{formatNumber(feature.sceneCount)} scenes - {formatPercent(feature.coverageRate)} coverage{sample ? ` - ${sample.sceneName} in ${sample.campaignName}` : ""}</p>
                  <div className="admin-meta">
                    <span>{feature.code}</span>
                    <span>{sample ? `${formatNumber(sample.polygonFogCount)} polygon fog` : "no scene sample"}</span>
                    <span>{sample ? `${formatNumber(sample.smoothFogCount)} smooth fog` : "no smooth sample"}</span>
                    <span>{sample ? `${formatNumber(sample.terrainWallCount)} terrain walls` : "no terrain sample"}</span>
                    <span>{sample ? `${formatNumber(sample.coloredLightCount)} colored lights` : "no colored sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dimmedLightCount)} dimmed lights` : "no dimmed sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dualZoneLightCount)} dual-zone lights` : "no dual-zone sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dualZoneTokenVisionCount)} dual-zone vision` : "no dual-zone vision sample"}</span>
                    <span>{sample ? `${formatNumber(sample.tokenVisionSourceCount)} token vision` : "no vision sample"}</span>
                  </div>
                </article>
              );
            })}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className="status-pill completed">authoring activity</span>
                <strong>{formatNumber(renderingOperations.authoringOperations.sceneCount)} scenes changed</strong>
              </div>
              <p>{formatNumber(renderingOperations.authoringOperations.fogOperationCount)} fog edits - {formatNumber(renderingOperations.authoringOperations.wallOperationCount)} wall edits - {formatNumber(renderingOperations.authoringOperations.lightOperationCount)} light edits</p>
              <div className="admin-meta">
                {renderingOperations.authoringOperations.recent.slice(0, 4).map((event) => (
                  <span key={event.id}>{event.action} {event.sceneName ?? event.sceneId ?? "unknown scene"}</span>
                ))}
                {renderingOperations.authoringOperations.recent.length === 0 ? <span>no recent rendering edits</span> : null}
              </div>
            </article>
            {renderingOperations.failedAuthoringOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">failed authoring</span>
                  <strong>{formatNumber(renderingOperations.failedAuthoringOperations.failureCount)} failed</strong>
                </div>
                <p>{Object.entries(renderingOperations.failedAuthoringOperations.byReason).map(([reason, count]) => `${reason} (${formatNumber(count)})`).join(", ")}</p>
              </article>
            )}
            {renderingOperations.failedAuthoringOperations.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`rendering-authoring-failure-${failure.id}`}>
                <span>{failure.attemptedAction}</span>
                <strong>{failure.sceneName ?? failure.sceneId ?? "unknown scene"} - {failure.reason}</strong>
              </div>
            ))}
            {Object.entries(renderingOperations.issueCodeCounts)
              .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
              .slice(0, 4)
              .map(([code, count]) => (
                <div className="operator-row tool-call-row" key={code}>
                  <span>{code}</span>
                  <strong>{formatNumber(count)} issues</strong>
                </div>
              ))}
            {renderingOperations.staleIssueOperations.scenes.slice(0, 3).map((scene) => (
              <div className="operator-row tool-call-row" key={`stale-rendering-scene-${scene.sceneId}`}>
                <span>{scene.sceneName}</span>
                <strong>{formatNumber(scene.issueCount)} issues - no recent rendering edits</strong>
              </div>
            ))}
            {renderingOperations.remediationQueue.slice(0, 4).map((item) => {
              const sample = item.sampleScenes[0];
              return (
                <article className="operator-item admin-item" key={`rendering-remediation-${item.code}`}>
                  <div className="operator-row">
                    <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                    <strong>{formatNumber(item.issueCount)} issues</strong>
                  </div>
                  <h3>{item.action}</h3>
                  <p>{formatNumber(item.affectedSceneCount)} scenes affected{sample ? ` - ${sample.sceneName} in ${sample.campaignName}` : ""}</p>
                  <div className="admin-meta">
                    <span>{item.code}</span>
                    <span>{sample?.topTarget ? `${sample.topTarget.targetType}:${sample.topTarget.targetId}` : "no sample target"}</span>
                  </div>
                </article>
              );
            })}
            {renderingOperations.topIssues.slice(0, 4).map((issue) => (
              <div className="operator-row tool-call-row" key={`rendering-issue-${issue.sceneId}-${issue.targetType}-${issue.targetId}-${issue.code}`}>
                <span>{issue.message}</span>
                <strong>{issue.sceneName ?? issue.sceneId ?? "scene"} - {issue.targetType}:{issue.targetId}</strong>
              </div>
            ))}
            {renderingOperations.scenesRequiringAction.slice(0, 3).map((scene) => {
              const firstIssue = scene.topIssues[0];
              return (
                <article className="operator-item admin-item" key={scene.sceneId}>
                  <div className="operator-row">
                    <span>{scene.sceneName}</span>
                    <strong>{formatNumber(scene.counts.issueCount)} issues</strong>
                  </div>
                  <p>{scene.campaignName} - {scene.actionReasons.join(", ")} - {formatPercent(scene.budget.totalPolygonUsageRatio)} vertex budget</p>
                  <div className="admin-meta">
                    <span>{formatNumber(scene.counts.fogRegionCount)} fog regions</span>
                    <span>{formatNumber(scene.counts.lightCount)} lights</span>
                    <span>{formatNumber(scene.counts.polygonVertexCount)} total vertices</span>
                    <span>{formatNumber(scene.counts.maxPolygonVertexCount)} max polygon vertices</span>
                    <span>{formatNumber(scene.counts.terrainWallCount)} terrain walls</span>
                    <span>{formatNumber(scene.counts.degenerateWallCount)} degenerate walls</span>
                    <span>{scene.topIssueCodes.length > 0 ? scene.topIssueCodes.map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") : "no issue codes"}</span>
                    <span>{firstIssue ? `${firstIssue.targetType}:${firstIssue.targetId}` : "no issue samples"}</span>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Rules operations">
        <div className="operator-heading">
          <div className="section-title">Rules Operations</div>
          <strong>{systemOperations?.productionReadiness.primarySystemId ?? "not loaded"}</strong>
        </div>
        {!systemOperations ? (
          <div className="empty-state compact">No rules operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${systemOperations.actionRequired ? "failed" : "completed"}`}>{systemOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{formatNumber(systemOperations.totals.installedSystemCount)} systems</strong>
              </div>
              <p>{formatNumber(systemOperations.productionReadiness.productionReadySystemCount)} production ready - {formatNumber(systemOperations.productionReadiness.demoSystemCount)} demo runtimes</p>
              <div className="admin-meta">
                <span>{systemOperations.actionReasons.length > 0 ? systemOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(systemOperations.productionReadiness.systemsNeedingProductionDepth.length)} need depth</span>
                <span>{formatNumber(systemOperations.totals.issueCount)} content issues</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Installed Systems" value={formatNumber(systemOperations.totals.installedSystemCount)} />
              <MetricTile label="System Rows" value={formatNumber(systemOperations.systems.length)} />
              <MetricTile label="Production Systems" value={formatNumber(systemOperations.productionReadiness.productionReadySystemCount)} />
              <MetricTile label="Production System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.productionReadySystemCount / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Demo Systems" value={formatNumber(systemOperations.productionReadiness.demoSystemCount)} />
              <MetricTile label="Demo System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.demoSystemCount / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Rules Action" value={systemOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Rules Reasons" value={formatNumber(systemOperations.actionReasons.length)} />
              <MetricTile label="Rules Remediations" value={formatNumber(systemOperations.remediationQueue.length)} />
              <MetricTile label="Rules Critical" value={formatNumber(systemOperations.remediationQueue.filter((item) => item.severity === "critical").length)} />
              <MetricTile label="Rules Warnings" value={formatNumber(systemOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Systems Need Depth" value={formatNumber(systemOperations.productionReadiness.systemsNeedingProductionDepth.length)} />
              <MetricTile label="Depth Gap Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.systemsNeedingProductionDepth.length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Active Systems" value={formatNumber(Object.keys(systemOperations.activeSystemCounts).length)} />
              <MetricTile label="Systems With Actors" value={formatNumber(systemOperations.totals.systemsWithActors)} />
              <MetricTile label="Actor System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.totals.systemsWithActors / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Actor Systems" value={formatNumber(Object.keys(systemOperations.actorSystemCounts).length)} />
              <MetricTile label="Item Systems" value={formatNumber(Object.keys(systemOperations.itemSystemCounts).length)} />
              <MetricTile label="Campaigns" value={formatNumber(systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Actors" value={formatNumber(systemOperations.totals.actorCount)} />
              <MetricTile label="Items" value={formatNumber(systemOperations.totals.itemCount)} />
              <MetricTile label="Non-primary Campaigns" value={formatNumber(systemOperations.productionReadiness.nonPrimaryActiveCampaignCount)} />
              <MetricTile label="Non-primary Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryActiveCampaignCount / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Non-primary Actors" value={formatNumber(systemOperations.productionReadiness.nonPrimaryActorCount)} />
              <MetricTile label="Non-primary Actor Rate" value={formatPercent(systemOperations.totals.actorCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryActorCount / systemOperations.totals.actorCount)} />
              <MetricTile label="Non-primary Items" value={formatNumber(systemOperations.productionReadiness.nonPrimaryItemCount)} />
              <MetricTile label="Non-primary Item Rate" value={formatPercent(systemOperations.totals.itemCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryItemCount / systemOperations.totals.itemCount)} />
              <MetricTile label="Rules Activity" value={formatNumber(systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Recent Rules Activity" value={formatNumber(systemOperations.activityOperations.recentActivity.length)} />
              <MetricTile label="Recent Rules Activity Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : systemOperations.activityOperations.recentActivity.length / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Recent Rule Campaigns" value={formatNumber(new Set(systemOperations.activityOperations.recentActivity.map((activity) => activity.campaignId ?? "unknown")).size)} />
              <MetricTile label="Recent Rule Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : new Set(systemOperations.activityOperations.recentActivity.map((activity) => activity.campaignId ?? "unknown")).size / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Rules Rolls" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.roll"])} />
              <MetricTile label="Rules Roll Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.roll"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Rules Rests" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.rest"])} />
              <MetricTile label="Rules Rest Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.rest"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Rules Advances" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.advance"])} />
              <MetricTile label="Rules Advance Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.advance"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Active Rule Systems" value={formatNumber(systemOperations.activityOperations.systemsWithRecentActivity.length)} />
              <MetricTile label="Active Rule System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.activityOperations.systemsWithRecentActivity.length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Demo Activity" value={formatNumber(systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Recent Demo Activity" value={formatNumber(systemOperations.activityOperations.recentNonPrimaryActivity.length)} />
              <MetricTile label="Recent Demo Activity Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : systemOperations.activityOperations.recentNonPrimaryActivity.length / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Recent Demo Campaigns" value={formatNumber(new Set(systemOperations.activityOperations.recentNonPrimaryActivity.map((activity) => activity.campaignId ?? "unknown")).size)} />
              <MetricTile label="Recent Demo Campaign Rate" value={formatPercent(systemOperations.productionReadiness.nonPrimaryActiveCampaignCount === 0 ? 0 : new Set(systemOperations.activityOperations.recentNonPrimaryActivity.map((activity) => activity.campaignId ?? "unknown")).size / systemOperations.productionReadiness.nonPrimaryActiveCampaignCount)} />
              <MetricTile label="Demo Rolls" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.roll"])} />
              <MetricTile label="Demo Roll Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.roll"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Demo Rests" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.rest"])} />
              <MetricTile label="Demo Rest Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.rest"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Demo Advances" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.advance"])} />
              <MetricTile label="Demo Advance Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.advance"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Active Demo Systems" value={formatNumber(Object.keys(systemOperations.activityOperations.nonPrimarySystemCounts).length)} />
              <MetricTile label="Active Demo System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : Object.keys(systemOperations.activityOperations.nonPrimarySystemCounts).length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Systems With Issues" value={formatNumber(systemOperations.totals.systemsWithContentIssues)} />
              <MetricTile label="Content Issue Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.totals.systemsWithContentIssues / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Readiness Action" value={systemOperations.productionReadiness.actionRequired ? "yes" : "no"} />
              <MetricTile label="Production Gaps" value={formatNumber(productionGapTotal)} />
              <MetricTile label="Production Gap Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : productionGapTotal / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Gap Categories" value={formatNumber(systemOperations.productionGapCounts.length)} />
              <MetricTile label="Promotion Blockers" value={formatNumber(promotionBlockerTotal)} />
              <MetricTile label="Promotion Blocker Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : promotionBlockerTotal / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Critical Blockers" value={formatNumber(criticalPromotionBlockerTotal)} />
              <MetricTile label="Critical Blocker Rate" value={formatPercent(promotionBlockerTotal === 0 ? 0 : criticalPromotionBlockerTotal / promotionBlockerTotal)} />
              <MetricTile label="Primary Capability" value={formatPercent(primaryRulesSystem?.productionCapability.coverageRate ?? 0)} />
              <MetricTile label="Primary Campaigns" value={formatNumber(primaryRulesSystem?.usage.activeCampaignCount)} />
              <MetricTile label="Primary Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : (primaryRulesSystem?.usage.activeCampaignCount ?? 0) / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Primary Actors" value={formatNumber(primaryRulesSystem?.usage.actorCount)} />
              <MetricTile label="Primary Actor Rate" value={formatPercent(systemOperations.totals.actorCount === 0 ? 0 : (primaryRulesSystem?.usage.actorCount ?? 0) / systemOperations.totals.actorCount)} />
              <MetricTile label="Primary System Items" value={formatNumber(primaryRulesSystem?.usage.itemCount)} />
              <MetricTile label="Primary System Item Rate" value={formatPercent(systemOperations.totals.itemCount === 0 ? 0 : (primaryRulesSystem?.usage.itemCount ?? 0) / systemOperations.totals.itemCount)} />
              <MetricTile label="Primary Capabilities" value={formatNumber(primaryRulesSystem?.productionCapability.supportedCapabilityCount)} />
              <MetricTile label="Primary Capability Total" value={formatNumber(primaryRulesSystem?.productionCapability.capabilityCount)} />
              <MetricTile label="Missing Capabilities" value={formatNumber(primaryRulesSystem?.productionCapability.missingCapabilities.length)} />
              <MetricTile label="Missing Capability Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilityCount ?? 0) === 0 ? 0 : primaryRulesSystem!.productionCapability.missingCapabilities.length / primaryRulesSystem!.productionCapability.capabilityCount)} />
              <MetricTile label="Primary Issues" value={formatNumber(primaryRulesSystem?.issues.length)} />
              <MetricTile label="Primary Issue Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : (primaryRulesSystem?.issues.length ?? 0) / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Primary Gaps" value={formatNumber(primaryRulesSystem?.productionGaps.length)} />
              <MetricTile label="Primary Gap Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : (primaryRulesSystem?.productionGaps.length ?? 0) / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Capability Rows" value={formatNumber(primaryRulesSystem?.productionCapability.capabilities.length)} />
              <MetricTile label="Capability Evidence" value={formatNumber(primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Capability Evidence Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : primaryRulesCapabilityEvidenceCount / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Primary Compendium" value={formatNumber(primaryRulesSystem?.coverage.compendiumEntryCount)} />
              <MetricTile label="Primary Templates" value={formatNumber(primaryRulesSystem?.coverage.characterTemplateCount)} />
              <MetricTile label="Primary Template Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.characterTemplateCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Conditions" value={formatNumber(primaryRulesSystem?.coverage.conditionEntryCount)} />
              <MetricTile label="Primary Condition Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.conditionEntryCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Actor Types" value={formatNumber(Object.keys(primaryRulesSystem?.usage.actorTypeCounts ?? {}).length)} />
              <MetricTile label="Primary Client Entry" value={primaryRulesSystem?.manifest.hasClientEntrypoint ? "yes" : "no"} />
              <MetricTile label="Primary Server Entry" value={primaryRulesSystem?.manifest.hasServerEntrypoint ? "yes" : "no"} />
              <MetricTile label="Primary Actor Schema" value={primaryRulesSystem?.manifest.hasActorSchema ? "yes" : "no"} />
              <MetricTile label="Primary Item Schema" value={primaryRulesSystem?.manifest.hasItemSchema ? "yes" : "no"} />
              <MetricTile label="Primary Manifest Coverage" value={formatPercent(primaryRulesSystem ? [primaryRulesSystem.manifest.hasClientEntrypoint, primaryRulesSystem.manifest.hasServerEntrypoint, primaryRulesSystem.manifest.hasActorSchema, primaryRulesSystem.manifest.hasItemSchema].filter(Boolean).length / 4 : 0)} />
              <MetricTile label="Primary Permissions" value={formatNumber(primaryRulesSystem?.manifest.permissionCount)} />
              <MetricTile label="Primary Spells" value={formatNumber(primaryRulesSystem?.coverage.compendiumTypeCounts.spell)} />
              <MetricTile label="Primary Spell Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.compendiumTypeCounts.spell ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Items" value={formatNumber(primaryRulesSystem?.coverage.compendiumTypeCounts.item)} />
              <MetricTile label="Primary Item Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.compendiumTypeCounts.item ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Threats" value={formatNumber(primaryRulesSystem?.coverage.encounterThreatCount)} />
              <MetricTile label="Primary Threat Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.encounterThreatCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Compendium Support" value={primaryRulesSystem?.coverage.supportsCompendium ? "yes" : "no"} />
              <MetricTile label="Origin Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.origins.count)} />
              <MetricTile label="Origin Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.origins.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Monster Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.monsterCreation.count)} />
              <MetricTile label="Monster Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.monsterCreation.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Purchase Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.equipmentPurchase.count)} />
              <MetricTile label="Purchase Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.equipmentPurchase.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Primary Import" value={primaryRulesSystem?.coverage.supportsCharacterImport ? "yes" : "no"} />
              <MetricTile label="Primary Advancement" value={primaryRulesSystem?.coverage.supportsAdvancement ? "yes" : "no"} />
              <MetricTile label="Primary Rest" value={primaryRulesSystem?.coverage.supportsRest ? "yes" : "no"} />
              <MetricTile label="Primary Origins" value={primaryRulesSystem?.coverage.supportsOrigins ? "yes" : "no"} />
              <MetricTile label="Primary Monsters" value={primaryRulesSystem?.coverage.supportsMonsterCreation ? "yes" : "no"} />
              <MetricTile label="Primary Purchase" value={primaryRulesSystem?.coverage.supportsEquipmentPurchase ? "yes" : "no"} />
              <MetricTile label="Primary Encounters" value={primaryRulesSystem?.coverage.supportsEncounterPlanning ? "yes" : "no"} />
              <MetricTile label="Primary Automation Coverage" value={formatPercent(primaryRulesSystem ? [primaryRulesSystem.coverage.supportsCharacterImport, primaryRulesSystem.coverage.supportsAdvancement, primaryRulesSystem.coverage.supportsRest, primaryRulesSystem.coverage.supportsOrigins, primaryRulesSystem.coverage.supportsMonsterCreation, primaryRulesSystem.coverage.supportsEquipmentPurchase, primaryRulesSystem.coverage.supportsEncounterPlanning].filter(Boolean).length / 7 : 0)} />
            </div>
            {systemOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`rules-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "critical" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} systems</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
                <div className="admin-meta">
                  <span>{item.message}</span>
                  <span>{item.samples.map((system) => system.name).join(", ")}</span>
                </div>
              </article>
            ))}
            {systemOperations.productionGapCounts.length > 0 && (
              <div className="operator-list compact-list">
                {systemOperations.productionGapCounts.slice(0, 4).map((gap) => (
                  <article className="operator-item admin-item" key={gap.code}>
                    <div className="operator-row">
                      <span className="status-pill failed">production gap</span>
                      <strong>{formatNumber(gap.count)} systems</strong>
                    </div>
                    <h3>{gap.code}</h3>
                    <p>{gap.message}</p>
                    <div className="admin-meta">
                      <span>{gap.severity}</span>
                      <span>{gap.remediation}</span>
                      <span>{gap.systems.map((system) => system.name).join(", ")}</span>
                      {gap.systems.map((system) => (
                        <span key={system.id}>
                          {system.id}: {formatNumber(system.activeCampaignCount)} campaigns, {formatNumber(system.actorCount)} actors, {formatNumber(system.itemCount)} items
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {systemOperations.promotionBlockers.length > 0 && (
              <div className="operator-list compact-list">
                {systemOperations.promotionBlockers.slice(0, 3).map((system) => (
                  <article className="operator-item admin-item" key={`rules-promotion-${system.systemId}`}>
                    <div className="operator-row">
                      <span className={`status-pill ${system.criticalBlockerCount > 0 ? "failed" : "running"}`}>promotion blockers</span>
                      <strong>{formatNumber(system.blockerCount)} blockers</strong>
                    </div>
                    <h3>{system.name}</h3>
                    <p>{system.blockers[0]?.message ?? "Runtime needs production hardening before promotion."}</p>
                    <div className="admin-meta">
                      <span>{system.systemId}</span>
                      <span>{formatNumber(system.activeCampaignCount)} campaigns, {formatNumber(system.actorCount)} actors, {formatNumber(system.itemCount)} items</span>
                      {system.blockers.slice(0, 3).map((blocker) => (
                        <span key={`${system.systemId}-${blocker.code}`}>{blocker.code}: {blocker.remediation}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {systemOperations.activityOperations.recentNonPrimaryActivity.slice(0, 3).map((activity) => (
              <div className="operator-row tool-call-row" key={`rules-activity-${activity.auditLogId}`}>
                <span>{activity.systemName ?? activity.systemId ?? "Unknown system"}</span>
                <strong>{activity.action.replace("system.actor.", "")} - {activity.label ?? activity.restType ?? activity.optionId ?? activity.actorId ?? "activity"} - {formatDateTime(activity.createdAt)}</strong>
              </div>
            ))}
            {systemsNeedingProductionDepth.length > 0 && (
              <div className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">needs production depth</span>
                  <strong>{formatNumber(systemsNeedingProductionDepth.length)} runtimes</strong>
                </div>
                <p>{systemsNeedingProductionDepth.map((system) => system.name).join(", ")}</p>
                <div className="admin-meta">
                  {systemsNeedingProductionDepth.map((system) => (
                    <span key={system.id}>
                      {system.id}: {formatNumber(system.usage.activeCampaignCount)} campaigns, {formatNumber(system.usage.actorCount)} actors, {formatNumber(system.usage.itemCount)} items
                    </span>
                  ))}
                </div>
              </div>
            )}
            {systemOperations.systems.slice(0, 4).map((system) => (
              <article className="operator-item admin-item" key={system.id}>
                <div className="operator-row">
                  <span className={`status-pill ${system.readiness.actionRequired || system.issues.length > 0 ? "failed" : "completed"}`}>{system.readiness.tier}</span>
                  <strong>{formatNumber(system.productionGaps.length)} production gaps</strong>
                </div>
                <h3>{system.name}</h3>
                <p>{formatNumber(system.coverage.characterTemplateCount)} templates - {formatNumber(system.coverage.conditionEntryCount)} conditions - {formatNumber(system.coverage.encounterThreatCount)} threats - {formatPercent(system.productionCapability.coverageRate)} capability</p>
                <div className="admin-meta">
                  <span>{formatNumber(system.usage.activeCampaignCount)} campaigns</span>
                  <span>{formatNumber(system.usage.actorCount)} actors</span>
                  <span>{formatNumber(system.productionCapability.supportedCapabilityCount)} / {formatNumber(system.productionCapability.capabilityCount)} capabilities</span>
                  <span>{system.issues.length > 0 ? system.issues.join(", ") : "manifest/content clear"}</span>
                  <span>{system.productionGaps.length > 0 ? formatAdminList(system.productionGaps, 3) : "production posture clear"}</span>
                  <span>{system.productionCapability.missingCapabilities.length > 0 ? `missing ${formatAdminList(system.productionCapability.missingCapabilities.map((capability) => capability.label), 3)}` : "capability matrix complete"}</span>
                  {system.coverage.capabilityEvidence.origins.samples.length > 0 && <span>origins {formatAdminList(system.coverage.capabilityEvidence.origins.samples, 2)}</span>}
                  {system.coverage.capabilityEvidence.monsterCreation.samples.length > 0 && <span>monsters {formatAdminList(system.coverage.capabilityEvidence.monsterCreation.samples, 2)}</span>}
                  {system.coverage.capabilityEvidence.equipmentPurchase.samples.length > 0 && <span>purchase {formatAdminList(system.coverage.capabilityEvidence.equipmentPurchase.samples, 2)}</span>}
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Admin AI operations">
        <div className="operator-heading">
          <div className="section-title">AI Operations</div>
          <strong>{aiOperations?.provider.id ?? "not loaded"}</strong>
        </div>
        {!aiOperations ? (
          <div className="empty-state compact">No AI operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.actionRequired ? "failed" : "completed"}`}>{aiOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{aiOperations.runtime.selectedProvider}</strong>
              </div>
              <p>{aiOperations.provider.label} - active {aiOperations.runtime.activeProvider} - retry budget {aiOperations.runtime.retryAttempts}</p>
              <div className="admin-meta">
                <span>{aiOperations.actionReasons.length > 0 ? aiOperations.actionReasons.join(", ") : "no action reasons"}</span>
                {aiOperations.runtime.codex && <span>{aiOperations.runtime.codex.transport} Codex transport</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.apiKeyConfigured ? "OpenAI key configured" : "OpenAI key missing"}</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.timeoutMs > 0 ? `timeout ${aiOperations.runtime.openai.timeoutMs}ms` : "timeout disabled"}</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.baseUrlValid ? `${aiOperations.runtime.openai.baseUrlInsecureInProduction ? "insecure production base" : "base"} ${aiOperations.runtime.openai.baseUrl}` : `invalid base ${aiOperations.runtime.openai.baseUrlIssue ?? aiOperations.runtime.openai.baseUrl}`}</span>}
                <span>{aiOperations.runtime.costRatesComplete ? (aiOperations.runtime.costRatesConfigured.inputTokens ? "cost rates configured" : "cost rates not configured") : "cost rates partial"}</span>
                {aiOperations.runtime.invalidCostConfig.length > 0 && <span>invalid cost config {aiOperations.runtime.invalidCostConfig.join(", ")}</span>}
                {aiOperations.runtime.invalidProviderThresholdConfig.length > 0 && <span>invalid provider thresholds {aiOperations.runtime.invalidProviderThresholdConfig.join(", ")}</span>}
                {aiOperations.runtime.invalidRuntimeControlConfig.length > 0 && <span>invalid runtime controls {aiOperations.runtime.invalidRuntimeControlConfig.join(", ")}</span>}
                <span>{aiOperations.runtime.costBudgetUsd !== undefined ? `budget ${formatCost(aiOperations.runtime.costBudgetUsd)}` : "cost budget not configured"}</span>
              </div>
              <div className="button-row">
                <button className="ghost-button" title="Mark stale running AI threads as failed" onClick={() => props.onFailStaleAiThreads().catch(console.error)} disabled={aiOperations.risk.staleRunningThreadCount === 0}>
                  <RefreshCw size={14} /> Fail stale threads
                </button>
                <button className="ghost-button" title="Mark stale started AI tool calls as failed" onClick={() => props.onFailStaleAiToolCalls().catch(console.error)} disabled={aiOperations.risk.staleStartedToolCallCount === 0}>
                  <RefreshCw size={14} /> Fail stale tools
                </button>
                <button className="ghost-button" title="Reject stale pending AI proposals" onClick={() => props.onRejectStaleAiProposals(false).catch(console.error)} disabled={aiOperations.proposalReview.stalePendingCount === 0}>
                  <RefreshCw size={14} /> Reject stale pending
                </button>
                <button className="ghost-button" title="Reject stale approved AI proposals without applying them" onClick={() => props.onRejectStaleAiProposals(true).catch(console.error)} disabled={aiOperations.proposalReview.staleApprovedCount === 0}>
                  <RefreshCw size={14} /> Reject stale approved
                </button>
              </div>
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.runtimePosture.actionRequired ? "failed" : "completed"}`}>{aiOperations.runtimePosture.actionRequired ? "runtime config" : "runtime ready"}</span>
                <strong>{aiOperations.runtimePosture.selectedProvider}</strong>
              </div>
              <p>{aiOperations.runtimePosture.remediation}</p>
              <div className="admin-meta">
                <span>retry budget {formatNumber(aiOperations.runtimePosture.retryAttempts)}</span>
                <span>{aiOperations.runtimePosture.costRatesComplete ? "cost rate posture complete" : "cost rate posture partial"}</span>
                {aiOperations.runtimePosture.invalidCostConfig.length > 0 && <span>invalid cost env {aiOperations.runtimePosture.invalidCostConfig.join(", ")}</span>}
                {aiOperations.runtimePosture.invalidProviderThresholdConfig.length > 0 && <span>invalid threshold env {aiOperations.runtimePosture.invalidProviderThresholdConfig.join(", ")}</span>}
                {aiOperations.runtimePosture.invalidRuntimeControlConfig.length > 0 && <span>invalid runtime control env {aiOperations.runtimePosture.invalidRuntimeControlConfig.join(", ")}</span>}
                <span>{aiOperations.runtimePosture.actionReasons.length > 0 ? aiOperations.runtimePosture.actionReasons.join(", ") : "no runtime posture warnings"}</span>
                {aiOperations.runtimePosture.providerMismatch && <span>active provider {aiOperations.runtimePosture.activeProvider}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.timeoutMs > 0 ? `OpenAI timeout ${aiOperations.runtimePosture.openai.timeoutMs}ms` : "OpenAI timeout disabled"}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.modelConfigured ? `OpenAI model ${aiOperations.runtimePosture.openai.model}` : `OpenAI model default ${aiOperations.runtimePosture.openai.model}`}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.baseUrlValid ? `${aiOperations.runtimePosture.openai.baseUrlInsecureInProduction ? "OpenAI base insecure in production" : "OpenAI base"} ${aiOperations.runtimePosture.openai.baseUrl}` : `OpenAI base invalid: ${aiOperations.runtimePosture.openai.baseUrlIssue ?? aiOperations.runtimePosture.openai.baseUrl}`}</span>}
              </div>
            </article>
            <div className="metric-grid">
              <MetricTile label="Selected Provider" value={aiOperations.runtimePosture.selectedProvider} />
              <MetricTile label="Active Provider" value={aiOperations.runtimePosture.activeProvider} />
              <MetricTile label="Retry Budget" value={formatNumber(aiOperations.runtimePosture.retryAttempts)} />
              <MetricTile label="AI Action" value={aiOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="AI Reasons" value={formatNumber(aiOperations.actionReasons.length)} />
              <MetricTile label="AI Remediations" value={formatNumber(aiOperations.remediationQueue.length)} />
              <MetricTile label="AI Errors" value={formatNumber(aiOperations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="AI Warnings" value={formatNumber(aiOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Provider Mismatch" value={aiOperations.runtimePosture.providerMismatch ? "yes" : "no"} />
              <MetricTile label="OpenAI Key" value={aiOperations.runtimePosture.openai?.apiKeyConfigured ? "yes" : "no"} />
              <MetricTile label="OpenAI Model" value={aiOperations.runtimePosture.openai?.modelConfigured ? "custom" : "default"} />
              <MetricTile label="OpenAI Model Name" value={aiOperations.runtimePosture.openai?.model ?? "n/a"} />
              <MetricTile label="OpenAI Base URL" value={aiOperations.runtimePosture.openai?.baseUrlValid ? "valid" : "invalid"} />
              <MetricTile label="OpenAI Base Secure" value={aiOperations.runtimePosture.openai?.baseUrlInsecureInProduction ? "no" : "yes"} />
              <MetricTile label="OpenAI Timeout" value={aiOperations.runtimePosture.openai ? formatDuration(aiOperations.runtimePosture.openai.timeoutMs) : "n/a"} />
              <MetricTile label="OpenAI Org" value={aiOperations.runtime.openai?.organizationConfigured ? "yes" : "no"} />
              <MetricTile label="OpenAI Project" value={aiOperations.runtime.openai?.projectConfigured ? "yes" : "no"} />
              <MetricTile label="Codex Adapter" value={aiOperations.runtimePosture.codex?.adapter ?? "n/a"} />
              <MetricTile label="Codex Transport" value={aiOperations.runtimePosture.codex?.transport ?? "n/a"} />
              <MetricTile label="Codex Approval" value={aiOperations.runtimePosture.codex?.approvalMode ?? "n/a"} />
              <MetricTile label="Runtime Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidRuntimeControlConfig.length)} />
              <MetricTile label="Provider Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidProviderThresholdConfig.length)} />
              <MetricTile label="Cost Rates" value={aiOperations.runtimePosture.costRatesComplete ? "complete" : "partial"} />
              <MetricTile label="Input Cost Rate" value={aiOperations.runtimePosture.costRatesConfigured.inputTokens ? "yes" : "no"} />
              <MetricTile label="Output Cost Rate" value={aiOperations.runtimePosture.costRatesConfigured.outputTokens ? "yes" : "no"} />
              <MetricTile label="Cost Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidCostConfig.length)} />
              <MetricTile label="Threads" value={formatNumber(aiOperations.totals.threadCount)} />
              <MetricTile label="Recent Threads" value={formatNumber(aiOperations.recentThreads.length)} />
              <MetricTile label="Failures" value={formatNumber(aiOperations.totals.failedThreadCount)} />
              <MetricTile label="Retries" value={formatNumber(aiOperations.totals.retryAttempts)} />
              <MetricTile label="Tokens" value={formatNumber(aiOperations.totals.usage.totalTokens)} />
              <MetricTile label="Cost" value={formatCost(aiOperations.totals.usage.estimatedCostUsd)} />
              <MetricTile label="Cost Budget" value={aiOperations.runtime.costBudgetUsd === undefined ? "n/a" : formatCost(aiOperations.runtime.costBudgetUsd)} />
              <MetricTile label="Budget Configured" value={aiOperations.runtime.costBudgetUsd === undefined ? "no" : "yes"} />
              <MetricTile label="Budget left" value={aiOperations.risk.costBudget?.remainingUsd === undefined ? "n/a" : formatCost(aiOperations.risk.costBudget.remainingUsd)} />
              <MetricTile label="Budget Used" value={aiOperations.risk.costBudget?.usageRatio === undefined ? "n/a" : formatPercent(aiOperations.risk.costBudget.usageRatio)} />
              <MetricTile label="Budget Exceeded" value={aiOperations.risk.costBudget?.exceeded ? "yes" : "no"} />
              <MetricTile label="Provider Count" value={formatNumber(aiOperations.providerHealth.length)} />
              <MetricTile label="Degraded Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.actionRequired).length)} />
              <MetricTile label="Degraded Provider Rate" value={formatPercent(aiOperations.providerHealth.length === 0 ? 0 : aiOperations.providerHealth.filter((provider) => provider.actionRequired).length / aiOperations.providerHealth.length)} />
              <MetricTile label="Failure-Rate Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.failureRateDegraded).length)} />
              <MetricTile label="P95-Degraded Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.p95DurationDegraded).length)} />
              <MetricTile label="Running-Pressure Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.runningThreadPressure).length)} />
              <MetricTile label="Provider Health Reasons" value={formatNumber(new Set(aiOperations.providerHealth.flatMap((provider) => provider.actionReasons)).size)} />
              <MetricTile label="Provider Error Messages" value={formatNumber(aiOperations.providerHealth.reduce((total, provider) => total + provider.recentErrorMessages.length, 0))} />
              <MetricTile label="Provider Error Groups" value={formatNumber(aiOperations.risk.providerErrors.length)} />
              <MetricTile label="Provider Errors" value={formatNumber(aiOperations.risk.providerErrors.reduce((total, error) => total + error.count, 0))} />
              <MetricTile label="Tools" value={formatNumber(aiOperations.totals.toolCallCount)} />
              <MetricTile label="Recent Tools" value={formatNumber(aiOperations.recentToolCalls.length)} />
              <MetricTile label="AI Risk Action" value={aiOperations.risk.actionRequired ? "yes" : "no"} />
              <MetricTile label="Running Threads" value={formatNumber(aiOperations.risk.runningThreadCount)} />
              <MetricTile label="Failed Tool Calls" value={formatNumber(aiOperations.risk.failedToolCallCount)} />
              <MetricTile label="Risk Failed Evals" value={formatNumber(aiOperations.risk.failedEvaluationCount)} />
              <MetricTile label="Failing Tools" value={formatNumber(aiOperations.risk.failedTools.length)} />
              <MetricTile label="Tool Retries" value={formatNumber(aiOperations.risk.failedToolRetryPolicy?.retryableCount)} />
              <MetricTile label="Retryable Tool Rate" value={formatPercent(((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)) === 0 ? 0 : (aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) / ((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)))} />
              <MetricTile label="Non-Retryable Tools" value={formatNumber(aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount)} />
              <MetricTile label="Non-Retryable Tool Rate" value={formatPercent(((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)) === 0 ? 0 : (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0) / ((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)))} />
              <MetricTile label="Replay Runs" value={formatNumber(aiOperations.replayOperations.recentRuns.length)} />
              <MetricTile label="Replay Dry Runs" value={formatNumber(aiOperations.replayOperations.recentRuns.filter((run) => run.dryRun).length)} />
              <MetricTile label="Recent Replayed Tools" value={formatNumber(aiOperations.replayOperations.recentRetried.length)} />
              <MetricTile label="Replayed Tools" value={formatNumber(aiOperations.replayOperations.replayedToolCallCount)} />
              <MetricTile label="Replay Completed" value={formatNumber(aiOperations.replayOperations.completedReplayCount)} />
              <MetricTile label="Replay Failed" value={formatNumber(aiOperations.replayOperations.failedReplayCount)} />
              <MetricTile label="Replay Failure Rate" value={formatPercent((aiOperations.replayOperations.completedReplayCount + aiOperations.replayOperations.failedReplayCount) === 0 ? 0 : aiOperations.replayOperations.failedReplayCount / (aiOperations.replayOperations.completedReplayCount + aiOperations.replayOperations.failedReplayCount))} />
              <MetricTile label="Replay Action" value={aiOperations.replayOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Latest Replay" value={aiOperations.replayOperations.latestReplayAt ? formatDateTime(aiOperations.replayOperations.latestReplayAt) : "none"} />
              <MetricTile label="Stale Threads" value={formatNumber(aiOperations.risk.staleRunningThreadCount)} />
              <MetricTile label="Stale Tools" value={formatNumber(aiOperations.risk.staleStartedToolCallCount)} />
              <MetricTile label="Thread Completion" value={formatPercent(aiOperations.serviceLevels.threads.completionRate)} />
              <MetricTile label="Thread Fail Rate" value={formatPercent(aiOperations.serviceLevels.threads.failureRate)} />
              <MetricTile label="Tool Fail Rate" value={formatPercent(aiOperations.serviceLevels.tools.failureRate)} />
              <MetricTile label="Eval Coverage" value={formatPercent(aiOperations.evaluationCoverage.evaluationCoverageRate)} />
              <MetricTile label="Eval Thread Scope" value={formatNumber(aiOperations.evaluationCoverage.threadCount)} />
              <MetricTile label="Evaluations" value={formatNumber(aiOperations.evaluations.evaluationCount)} />
              <MetricTile label="Recent Evaluations" value={formatNumber(aiOperations.recentEvaluations.length)} />
              <MetricTile label="Evaluated Threads" value={formatNumber(aiOperations.evaluationCoverage.evaluatedThreadCount)} />
              <MetricTile label="Unevaluated Threads" value={formatNumber(aiOperations.evaluationCoverage.unevaluatedThreadCount)} />
              <MetricTile label="Unevaluated Samples" value={formatNumber(aiOperations.evaluationCoverage.recentUnevaluatedThreads.length)} />
              <MetricTile label="Failed Eval Threads" value={formatNumber(aiOperations.evaluationCoverage.failedEvaluationThreadCount)} />
              <MetricTile label="Eval Campaigns" value={formatNumber(aiOperations.evaluationCoverage.campaigns.length)} />
              <MetricTile label="Recurring Failed Checks" value={formatNumber(aiOperations.evaluationCoverage.recurringFailedChecks.length)} />
              <MetricTile label="Eval Pass Rate" value={formatPercent(aiOperations.serviceLevels.evaluations.passRate)} />
              <MetricTile label="Eval Avg Score" value={formatPercent(aiOperations.evaluations.averageScore)} />
              <MetricTile label="Eval Fail Rate" value={formatPercent(aiOperations.serviceLevels.evaluations.failureRate)} />
              <MetricTile label="Passed Evals" value={formatNumber(aiOperations.evaluations.passedEvaluationCount)} />
              <MetricTile label="Failed Evals" value={formatNumber(aiOperations.evaluations.failedEvaluationCount)} />
              <MetricTile label="Failed Eval Checks" value={formatNumber(aiOperations.evaluations.failedChecks.length)} />
              <MetricTile label="Safety Checks" value={formatNumber(aiOperations.safetyPosture.safetyCheckCount)} />
              <MetricTile label="Safety Coverage" value={formatPercent(aiOperations.safetyPosture.safetyCheckCoverageRate)} />
              <MetricTile label="Safety Eval Runs" value={formatNumber(aiOperations.safetyPosture.evaluationWithSafetyCheckCount)} />
              <MetricTile label="Safety Eval Gaps" value={formatNumber(Math.max(0, aiOperations.safetyPosture.evaluationCount - aiOperations.safetyPosture.evaluationWithSafetyCheckCount))} />
              <MetricTile label="Safety Eval Threads" value={formatNumber(aiOperations.safetyPosture.evaluatedThreadWithSafetyCheckCount)} />
              <MetricTile label="Safety Failures" value={formatNumber(aiOperations.safetyPosture.failedSafetyCheckCount)} />
              <MetricTile label="Safety Failure Rate" value={formatPercent(aiOperations.safetyPosture.safetyCheckCount === 0 ? 0 : aiOperations.safetyPosture.failedSafetyCheckCount / aiOperations.safetyPosture.safetyCheckCount)} />
              <MetricTile label="Recent Safety Failures" value={formatNumber(aiOperations.safetyPosture.recentFailures.length)} />
              <MetricTile label="Recurring Safety Failures" value={formatNumber(aiOperations.safetyPosture.recurringFailures.length)} />
              <MetricTile label="Safety Categories" value={formatNumber(Object.keys(aiOperations.safetyPosture.categoryCounts).length)} />
              <MetricTile label="Failed Safety Categories" value={formatNumber(Object.keys(aiOperations.safetyPosture.failedCategoryCounts).length)} />
              <MetricTile label="Safety Action" value={aiOperations.safetyPosture.actionRequired ? "yes" : "no"} />
              <MetricTile label="Thread P95" value={formatDuration(aiOperations.serviceLevels.threads.durationMs.p95)} />
              <MetricTile label="Tool P95" value={formatDuration(aiOperations.serviceLevels.tools.durationMs.p95)} />
              <MetricTile label="Pending Proposals" value={formatNumber(aiOperations.proposalReview.pendingCount)} />
              <MetricTile label="Pending Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.pendingCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Pending Proposals" value={formatNumber(aiOperations.proposalReview.recentPending.length)} />
              <MetricTile label="Total Proposals" value={formatNumber(aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Approved Proposals" value={formatNumber(aiOperations.proposalReview.approvedCount)} />
              <MetricTile label="Approved Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.approvedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Approved Proposals" value={formatNumber(aiOperations.proposalReview.recentApproved.length)} />
              <MetricTile label="Applied Proposals" value={formatNumber(aiOperations.proposalReview.appliedCount)} />
              <MetricTile label="Applied Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.appliedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Applied Proposals" value={formatNumber(aiOperations.proposalReview.recentApplied.length)} />
              <MetricTile label="Rejected Proposals" value={formatNumber(aiOperations.proposalReview.rejectedCount)} />
              <MetricTile label="Rejected Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.rejectedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Rejected Proposals" value={formatNumber(aiOperations.proposalReview.recentRejected.length)} />
              <MetricTile label="Approval Required" value={formatNumber(aiOperations.proposalReview.approvalRequiredCount)} />
              <MetricTile label="Approval Required Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.approvalRequiredCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Apply Ready" value={formatNumber(aiOperations.proposalReview.applyReadyCount)} />
              <MetricTile label="Apply Ready Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.applyReadyCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Stale Pending" value={formatNumber(aiOperations.proposalReview.stalePendingCount)} />
              <MetricTile label="Stale Pending Rate" value={formatPercent(aiOperations.proposalReview.pendingCount === 0 ? 0 : aiOperations.proposalReview.stalePendingCount / aiOperations.proposalReview.pendingCount)} />
              <MetricTile label="Stale Approved" value={formatNumber(aiOperations.proposalReview.staleApprovedCount)} />
              <MetricTile label="Stale Approved Rate" value={formatPercent(aiOperations.proposalReview.approvedCount === 0 ? 0 : aiOperations.proposalReview.staleApprovedCount / aiOperations.proposalReview.approvedCount)} />
              <MetricTile label="Stale Proposals" value={formatNumber(aiOperations.proposalReview.stalePendingCount + aiOperations.proposalReview.staleApprovedCount)} />
              <MetricTile label="Stale Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.stalePendingCount + aiOperations.proposalReview.staleApprovedCount) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Oldest Pending" value={formatDuration(aiOperations.proposalReview.oldestPendingAgeMs)} />
              <MetricTile label="Oldest Approved" value={formatDuration(aiOperations.proposalReview.oldestApprovedAgeMs)} />
              <MetricTile label="Apply Failures" value={formatNumber(aiOperations.proposalReview.applyFailureCount)} />
              <MetricTile label="Apply Failure Rate" value={formatPercent((aiOperations.proposalReview.appliedCount + aiOperations.proposalReview.applyFailureCount) === 0 ? 0 : aiOperations.proposalReview.applyFailureCount / (aiOperations.proposalReview.appliedCount + aiOperations.proposalReview.applyFailureCount))} />
              <MetricTile label="Recent Apply Failures" value={formatNumber(aiOperations.proposalReview.recentApplyFailures.length)} />
              <MetricTile label="Tool Proposals" value={formatNumber(aiOperations.proposalReview.sourceCounts.tool_or_thread)} />
              <MetricTile label="Tool Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.sourceCounts.tool_or_thread ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Manual Proposals" value={formatNumber(aiOperations.proposalReview.sourceCounts.manual)} />
              <MetricTile label="Manual Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.sourceCounts.manual ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Scene Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.scene)} />
              <MetricTile label="Scene Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.scene ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Token Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.token)} />
              <MetricTile label="Token Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.token ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Actor Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.actor)} />
              <MetricTile label="Actor Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.actor ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="AI Tools" value={formatNumber(aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Tool Catalog Action" value={aiOperations.toolCatalog.actionRequired ? "yes" : "no"} />
              <MetricTile label="Tool Catalog Reasons" value={formatNumber(aiOperations.toolCatalog.actionReasons.length)} />
              <MetricTile label="Safe Tools" value={formatNumber(aiOperations.toolCatalog.permissionSafeToolCount)} />
              <MetricTile label="Safe Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.permissionSafeToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Unsafe Tools" value={formatNumber(aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.permissionSafeToolCount)} />
              <MetricTile label="Unsafe Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : (aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.permissionSafeToolCount) / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Proposal-Gated Tools" value={formatNumber(aiOperations.toolCatalog.proposalGatedToolCount)} />
              <MetricTile label="Proposal-Gated Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.proposalGatedToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Fail-Closed Tools" value={formatNumber(aiOperations.toolCatalog.failClosedToolCount)} />
              <MetricTile label="Fail-Closed Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.failClosedToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Fail-Closed Gaps" value={formatNumber(Math.max(0, aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.failClosedToolCount))} />
              <MetricTile label="Strict Schema Tools" value={formatNumber(aiOperations.toolCatalog.tools.filter((tool) => tool.rejectsAdditionalProperties).length)} />
              <MetricTile label="Strict Schema Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.tools.filter((tool) => tool.rejectsAdditionalProperties).length / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Loose Schema Tools" value={formatNumber(aiOperations.toolCatalog.tools.filter((tool) => !tool.rejectsAdditionalProperties).length)} />
              <MetricTile label="Loose Schema Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.tools.filter((tool) => !tool.rejectsAdditionalProperties).length / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Tool Schema Types" value={formatNumber(new Set(aiOperations.toolCatalog.tools.map((tool) => tool.parameterSchemaType)).size)} />
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.toolCatalog.actionRequired ? "failed" : "completed"}`}>{aiOperations.toolCatalog.actionRequired ? "tool review" : "tool policy"}</span>
                <strong>{formatNumber(aiOperations.toolCatalog.proposalGatedToolCount)} proposal gated</strong>
              </div>
              <p>{aiOperations.toolCatalog.remediation}</p>
              <div className="admin-meta">
                <span>{formatNumber(aiOperations.toolCatalog.failClosedToolCount)} fail-closed tools</span>
                <span>safe allowlist: {aiOperations.toolCatalog.permissionSafeAllowlist.join(", ")}</span>
              </div>
            </article>
            {aiOperations.toolCatalog.tools.filter((tool) => tool.failClosed || tool.permissionSafe).slice(0, 4).map((tool) => (
              <div className="operator-row tool-call-row" key={`ai-tool-catalog-${tool.name}`}>
                <span>{tool.name}</span>
                <strong>{tool.permissionSafe ? "permission-safe" : tool.failClosed ? "fail-closed" : "proposal-gated"} - {tool.requiredPermissions.join(", ")}</strong>
              </div>
            ))}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.safetyPosture.actionRequired ? "failed" : "completed"}`}>{aiOperations.safetyPosture.actionRequired ? "eval failures" : "eval telemetry"}</span>
                <strong>{formatPercent(aiOperations.evaluationCoverage.evaluationCoverageRate)} covered</strong>
              </div>
              <p>{formatNumber(aiOperations.evaluationCoverage.evaluatedThreadCount)} evaluated / {formatNumber(aiOperations.evaluationCoverage.threadCount)} threads - {formatNumber(aiOperations.evaluationCoverage.unevaluatedThreadCount)} unevaluated</p>
              <div className="admin-meta">
                <span>{formatNumber(aiOperations.evaluations.evaluationCount)} evaluations</span>
                <span>{formatNumber(aiOperations.evaluations.failedEvaluationCount)} failed</span>
                <span>avg score {formatPercent(aiOperations.evaluations.averageScore)}</span>
                <span>{formatNumber(aiOperations.safetyPosture.safetyCheckCount)} safety checks</span>
                <span>{formatPercent(aiOperations.safetyPosture.safetyCheckCoverageRate)} safety coverage</span>
                <span>{Object.entries(aiOperations.safetyPosture.failedCategoryCounts).map(([category, count]) => `${category} (${formatNumber(count)})`).join(", ") || "no failed safety categories"}</span>
              </div>
            </article>
            {aiOperations.evaluationCoverage.recurringFailedChecks.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`ai-eval-failed-check-${failure.name}`}>
                <span>{failure.name}</span>
                <strong>{formatNumber(failure.count)} failed checks</strong>
              </div>
            ))}
            {aiOperations.evaluationCoverage.campaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={`ai-eval-campaign-${campaign.campaignId}`}>
                <span>{campaign.campaignName}</span>
                <strong>{formatNumber(campaign.evaluatedThreadCount)} evaluated / {formatNumber(campaign.threadCount)} threads - {formatNumber(campaign.failedEvaluationCount)} failed evals</strong>
              </div>
            ))}
            {aiOperations.safetyPosture.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`ai-safety-failure-${failure.evaluationId}-${failure.name}`}>
                <span>{failure.name}</span>
                <strong>{failure.category ?? "evaluation"} - {failure.evaluationName} - {failure.provider}</strong>
              </div>
            ))}
            {aiOperations.evaluationCoverage.recentUnevaluatedThreads.slice(0, 3).map((thread) => (
              <div className="operator-row tool-call-row" key={`ai-unevaluated-thread-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.status ?? "unknown"} - {thread.provider} - {formatDateTime(thread.updatedAt)}</strong>
              </div>
            ))}
            {aiOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`ai-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {aiOperations.proposalReview.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">proposal review</span>
                  <strong>{formatNumber(aiOperations.proposalReview.pendingCount)} pending</strong>
                </div>
                <p>{aiOperations.proposalReview.actionReasons.join(", ")} - oldest pending {formatDuration(aiOperations.proposalReview.oldestPendingAgeMs)}</p>
                <div className="admin-meta">
                  <span>{formatNumber(aiOperations.proposalReview.approvedCount)} approved</span>
                  <span>{formatNumber(aiOperations.proposalReview.appliedCount)} applied</span>
                  <span>stale after {formatDuration(aiOperations.proposalReview.staleReviewThresholdMs)}</span>
                  <span>{Object.entries(aiOperations.proposalReview.entityCounts).slice(0, 3).map(([entity, count]) => `${entity} (${formatNumber(count)})`).join(", ") || "no entities"}</span>
                </div>
              </article>
            )}
            {aiOperations.proposalReview.stalePending.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`stale-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - pending since {formatDateTime(proposal.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.staleApproved.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`stale-approved-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - approved since {formatDateTime(proposal.updatedAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentApplyFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`failed-ai-proposal-apply-${failure.auditLogId}`}>
                <span>{failure.proposalId ?? "proposal apply failed"}</span>
                <strong>{failure.campaignName ?? failure.campaignId ?? "unknown campaign"} - {failure.reason} - {formatDateTime(failure.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.campaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={`ai-proposal-campaign-${campaign.campaignId}`}>
                <span>{campaign.campaignName}</span>
                <strong>{formatNumber(campaign.pendingCount)} pending - oldest {formatDuration(campaign.oldestPendingAgeMs)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentPending.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - {formatNumber(proposal.changeCount)} changes - {proposal.entities.join(", ") || "no entities"}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentRejected.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`rejected-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - rejected {formatDateTime(proposal.updatedAt)} - {formatNumber(proposal.changeCount)} changes</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentApplied.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`applied-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - applied {formatDateTime(proposal.updatedAt)} - {formatNumber(proposal.changeCount)} changes</strong>
              </div>
            ))}
            {aiOperations.campaigns.slice(0, 4).map((campaign) => (
              <article className="operator-item admin-item" key={campaign.campaignId}>
                <div className="operator-row">
                  <span>{campaign.campaignName}</span>
                  <strong>{formatNumber(campaign.threadCount)} threads</strong>
                </div>
                <p>{formatNumber(campaign.failedThreadCount)} failures - {formatNumber(campaign.toolCallCount)} tool calls - {formatDuration(campaign.durationMs)}</p>
              </article>
            ))}
            {aiOperations.providerHealth.slice(0, 4).map((provider) => (
              <article className="operator-item admin-item" key={`provider-health-${provider.provider}`}>
                <div className="operator-row">
                  <span className={`status-pill ${provider.actionRequired ? "failed" : "completed"}`}>{provider.provider}</span>
                  <strong>{formatPercent(provider.failureRate)} fail rate</strong>
                </div>
                <p>{provider.actionReasons.length > 0 ? provider.actionReasons.join(", ") : "healthy"} - {provider.remediation}</p>
                <div className="admin-meta">
                  <span>{formatNumber(provider.threadCount)} threads</span>
                  <span>{formatNumber(provider.providerErrorCount)} provider errors</span>
                  <span>{provider.failureRateDegraded ? `above ${formatPercent(provider.failureRateThreshold)} threshold` : `threshold ${formatPercent(provider.failureRateThreshold)}`}</span>
                  <span>p95 {formatDuration(provider.durationMsSummary.p95)}</span>
                  <span>{provider.p95DurationThresholdMs ? (provider.p95DurationDegraded ? `p95 above ${formatDuration(provider.p95DurationThresholdMs)}` : `p95 threshold ${formatDuration(provider.p95DurationThresholdMs)}`) : "no p95 threshold"}</span>
                  <span>{formatPercent(provider.completionRate)} completion</span>
                  <span>{formatNumber(provider.staleRunningThreadCount)} stale running</span>
                  <span>{provider.runningThreadPressure ? `${formatNumber(provider.runningThreadCount)} running above threshold` : `running threshold ${formatNumber(provider.runningThreadThreshold)}`}</span>
                  <span>{formatCost(provider.usage.estimatedCostUsd)} estimated cost</span>
                  <span>{provider.recentErrorMessages[0] ?? "no recent provider errors"}</span>
                </div>
              </article>
            ))}
            {aiOperations.risk.providerErrors.slice(0, 3).map((error) => (
              <div className="operator-row tool-call-row" key={error.message}>
                <span>{error.message}</span>
                <strong>{formatNumber(error.count)} provider failures{error.recentThreads[0] ? ` - ${error.recentThreads[0].campaignName ?? error.recentThreads[0].campaignId}` : ""}</strong>
              </div>
            ))}
            {aiOperations.risk.providerErrors.flatMap((error) => error.recentThreads.slice(0, 2).map((thread) => ({ error, thread }))).slice(0, 3).map(({ error, thread }) => (
              <div className="operator-row tool-call-row" key={`provider-error-thread-${error.message}-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.provider} - {thread.failedAt ? formatDateTime(thread.failedAt) : thread.status} - retries {formatNumber(thread.retryAttempts)}</strong>
              </div>
            ))}
            {aiOperations.risk.failedTools.slice(0, 3).map((tool) => (
              <div className="operator-row tool-call-row" key={tool.toolName}>
                <span>{tool.toolName}</span>
                <strong>{formatNumber(tool.count)} failed - {tool.errors[0]?.error ?? "unknown"}</strong>
              </div>
            ))}
            {aiOperations.risk.failedToolRetryPolicy?.byTool.slice(0, 3).map((tool) => (
              <div className="operator-row tool-call-row" key={`retry-policy-${tool.toolName}`}>
                <span>{tool.toolName}</span>
                <strong>{formatNumber(tool.retryable)} retryable / {formatNumber(tool.nonRetryable)} blocked - {tool.reasons[0]?.reason ?? "unknown"}</strong>
              </div>
            ))}
            {aiOperations.risk.failedToolRetryPolicy?.recentRetryable.slice(0, 5).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`retryable-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.threadTitle ?? toolCall.threadId} - {toolCall.campaignName ?? "unknown"} - {toolCall.retryReason}</strong>
                <button className="ghost-button" title="Replay retryable failed AI tool call" onClick={() => props.onRetryAiToolCall(toolCall.id, toolCall.toolName).catch(console.error)}>
                  <RefreshCw size={14} /> Retry tool
                </button>
              </div>
            ))}
            {aiOperations.replayOperations.recentRetried.slice(0, 3).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`replayed-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.resultStatus ?? "unknown"}{toolCall.resultError ? ` - ${toolCall.resultError}` : ""} - {toolCall.campaignName ?? "unknown"} - {toolCall.retriedAt ? formatDateTime(toolCall.retriedAt) : "retry time unknown"}</strong>
              </div>
            ))}
            {aiOperations.replayOperations.recentRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`ai-replay-run-${run.auditLogId}`}>
                <span>{run.dryRun ? "dry-run replay" : "tool replay"}</span>
                <strong>{formatNumber(run.retried)} retried - {formatNumber(run.completed)} completed - {formatNumber(run.failed)} failed - {formatDateTime(run.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.risk.recentStaleRunningThreads.slice(0, 3).map((thread) => (
              <div className="operator-row tool-call-row" key={`stale-thread-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.provider} - stale {formatDuration(thread.ageMs)}</strong>
              </div>
            ))}
            {aiOperations.risk.recentStaleStartedToolCalls.slice(0, 3).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`stale-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.provider ?? "unknown"} - stale {formatDuration(toolCall.ageMs)}</strong>
              </div>
            ))}
            {aiOperations.recentThreads.slice(0, 5).map((thread) => (
              <div className="operator-row tool-call-row" key={thread.id}>
                <span>{thread.title}</span>
                <strong>{thread.status ?? "running"} - {thread.provider} - {formatDuration(thread.durationMs)}</strong>
              </div>
            ))}
            {aiOperations.recentToolCalls.slice(0, 5).map((toolCall) => {
              const retryable = retryableAiToolCallIds.has(toolCall.id);
              const errorCode = aiToolCallErrorCode(toolCall.output);
              return (
                <div className="operator-row tool-call-row" key={toolCall.id}>
                  <span>{toolCall.toolName}</span>
                  <strong>{toolCall.status}{errorCode ? ` - ${errorCode}` : ""} - {toolCall.campaignName ?? "unknown"}</strong>
                  {retryable && (
                    <button className="ghost-button" title="Replay retryable failed AI tool call" onClick={() => props.onRetryAiToolCall(toolCall.id, toolCall.toolName).catch(console.error)}>
                      <RefreshCw size={14} /> Retry tool
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Plugin operations">
        <div className="operator-heading">
          <div className="section-title">Plugin Operations</div>
          <strong>{pluginOperations?.policy.review ?? "not loaded"}</strong>
        </div>
        {!pluginOperations ? (
          <div className="empty-state compact">No plugin operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${pluginOperations.actionRequired ? "failed" : "completed"}`}>{pluginOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{pluginOperations.policy.trust}</strong>
              </div>
              <p>{formatNumber(pluginOperations.totals.packageCount)} packages - {formatNumber(pluginOperations.totals.installedGrantCount)} installs</p>
              <div className="admin-meta">
                <span>{pluginOperations.actionReasons.length > 0 ? pluginOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(pluginOperations.reviewOperations.pendingCount)} pending reviews</span>
                <span>{formatNumber(pluginOperations.registryOperations.configuredRegistryCount)} registries</span>
                <span>core {pluginOperations.compatibilityOperations.coreVersion}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Catalog Plugins" value={formatNumber(pluginOperations.totals.catalogPluginCount)} />
              <MetricTile label="Packages" value={formatNumber(pluginOperations.totals.packageCount)} />
              <MetricTile label="Plugin Review Policy" value={pluginOperations.policy.review} />
              <MetricTile label="Plugin Action" value={pluginOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Plugin Reasons" value={formatNumber(pluginOperations.actionReasons.length)} />
              <MetricTile label="Plugin Remediations" value={formatNumber(pluginOperations.remediationQueue.length)} />
              <MetricTile label="Plugin Errors" value={formatNumber(pluginOperations.remediationQueue.filter((remediation) => remediation.severity === "error").length)} />
              <MetricTile label="Plugin Warnings" value={formatNumber(pluginOperations.remediationQueue.filter((remediation) => remediation.severity === "warning").length)} />
              <MetricTile label="Healthy" value={formatNumber(pluginOperations.totals.healthyInstalledCount)} />
              <MetricTile label="Blocked" value={formatNumber(pluginOperations.totals.blockedInstalledCount)} />
              <MetricTile label="Missing" value={formatNumber(pluginOperations.totals.missingInstalledCount)} />
              <MetricTile label="Drift" value={formatNumber(pluginOperations.totals.permissionDriftCount)} />
              <MetricTile label="Drift Samples" value={formatNumber(pluginOperations.permissionDrift.length)} />
              <MetricTile label="Compat Action" value={pluginOperations.compatibilityOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Core Version" value={pluginOperations.compatibilityOperations.coreVersion} />
              <MetricTile label="Core Drift" value={formatNumber(pluginOperations.totals.incompatibleInstalledCount)} />
              <MetricTile label="Incompat Packages" value={formatNumber(pluginOperations.totals.incompatiblePackageCount)} />
              <MetricTile label="Storage" value={formatNumber(pluginOperations.storage.entryCount)} />
              <MetricTile label="Storage Plugins" value={formatNumber(Object.keys(pluginOperations.storage.byPlugin).length)} />
              <MetricTile label="Storage Campaigns" value={formatNumber(Object.keys(pluginOperations.storage.byCampaign).length)} />
              <MetricTile label="Storage Value Limit" value={formatStorageBytes(pluginOperations.storage.maxValueBytes)} />
              <MetricTile label="Storage Near Limit" value={formatNumber(pluginOperations.storage.nearLimitEntries.length)} />
              <MetricTile label="Storage Near-Limit Rate" value={formatPercent(pluginOperations.storage.entryCount === 0 ? 0 : pluginOperations.storage.nearLimitEntries.length / pluginOperations.storage.entryCount)} />
              <MetricTile label="Largest Storage Entries" value={formatNumber(pluginOperations.storage.largestEntries.length)} />
              <MetricTile label="Near Limit Bytes" value={formatStorageBytes(pluginOperations.storage.nearLimitBytes)} />
              <MetricTile label="Commands" value={formatNumber(pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Recent Commands" value={formatNumber(pluginOperations.commandOperations.recentCommandCount)} />
              <MetricTile label="Command Plugins" value={formatNumber(Object.keys(pluginOperations.commandOperations.byPlugin).length)} />
              <MetricTile label="Command Campaigns" value={formatNumber(Object.keys(pluginOperations.commandOperations.byCampaign).length)} />
              <MetricTile label="Command Action" value={pluginOperations.commandOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Command Failures" value={formatNumber(pluginOperations.commandOperations.failedCommandCount)} />
              <MetricTile label="Command Failure Rate" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 0 : pluginOperations.commandOperations.failedCommandCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Recent Command Failures" value={formatNumber(pluginOperations.commandOperations.recentFailureCount)} />
              <MetricTile label="Failed Command Plugins" value={formatNumber(Object.keys(pluginOperations.commandOperations.failedByPlugin).length)} />
              <MetricTile label="Command Failure Reasons" value={formatNumber(Object.keys(pluginOperations.commandOperations.failedByReason).length)} />
              <MetricTile label="Storage Mutations" value={formatNumber(pluginOperations.commandOperations.storageMutatingCommandCount)} />
              <MetricTile label="Storage Mutation Rate" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 0 : pluginOperations.commandOperations.storageMutatingCommandCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Storage Ops" value={formatNumber(pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Recent Storage Ops" value={formatNumber(pluginOperations.storageOperations.recentOperations.length)} />
              <MetricTile label="Storage Op Plugins" value={formatNumber(Object.keys(pluginOperations.storageOperations.byPlugin).length)} />
              <MetricTile label="Storage Op Campaigns" value={formatNumber(Object.keys(pluginOperations.storageOperations.byCampaign).length)} />
              <MetricTile label="Direct Storage Sets" value={formatNumber(pluginOperations.storageOperations.directSetCount)} />
              <MetricTile label="Direct Set Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.directSetCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Direct Storage Deletes" value={formatNumber(pluginOperations.storageOperations.directDeleteCount)} />
              <MetricTile label="Direct Delete Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.directDeleteCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Command Storage Ops" value={formatNumber(pluginOperations.storageOperations.commandMutationCount)} />
              <MetricTile label="Command Storage Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.commandMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Storage Sets" value={formatNumber(pluginOperations.storageOperations.setMutationCount)} />
              <MetricTile label="Storage Set Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.setMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Storage Deletes" value={formatNumber(pluginOperations.storageOperations.deleteMutationCount)} />
              <MetricTile label="Storage Delete Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.deleteMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Deleted Storage Entries" value={formatNumber(pluginOperations.storageOperations.deletedEntryCount)} />
              <MetricTile label="Deleted Entry Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.deletedEntryCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Installs" value={formatNumber(pluginOperations.installOperations.installCount)} />
              <MetricTile label="Recent Installs" value={formatNumber(pluginOperations.installOperations.recentInstalls.length)} />
              <MetricTile label="Recent Upgrades" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "upgrade").length)} />
              <MetricTile label="Recent Rollbacks" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "rollback").length)} />
              <MetricTile label="Recent Permission Reviews" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "permission_review").length)} />
              <MetricTile label="Installed Grants" value={formatNumber(pluginOperations.totals.installedGrantCount)} />
              <MetricTile label="Install Campaigns" value={formatNumber(Object.keys(pluginOperations.installOperations.byCampaign).length)} />
              <MetricTile label="Installed Plugins" value={formatNumber(Object.keys(pluginOperations.installOperations.byPlugin).length)} />
              <MetricTile label="Install Sandboxes" value={formatNumber(new Set(pluginOperations.installOperations.recentInstalls.map((install) => install.sandbox ?? "unknown")).size)} />
              <MetricTile label="Install Permission Gaps" value={formatNumber(pluginOperations.installOperations.recentInstalls.reduce((total, install) => total + install.missingPermissionCount, 0))} />
              <MetricTile label="Install Gap Installs" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.missingPermissionCount > 0).length)} />
              <MetricTile label="Install Gap Rate" value={formatPercent(pluginOperations.installOperations.recentInstalls.length === 0 ? 0 : pluginOperations.installOperations.recentInstalls.filter((install) => install.missingPermissionCount > 0).length / pluginOperations.installOperations.recentInstalls.length)} />
              <MetricTile label="Version Changes" value={formatNumber(pluginOperations.installOperations.versionChangeCount)} />
              <MetricTile label="Version Change Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.versionChangeCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Rollbacks" value={formatNumber(pluginOperations.installOperations.rollbackCount)} />
              <MetricTile label="Rollback Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.rollbackCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Permission Reviews" value={formatNumber(pluginOperations.installOperations.permissionReviewCount)} />
              <MetricTile label="Permission Review Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.permissionReviewCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Command Audits" value={formatNumber(pluginOperations.totals.commandAuditCount)} />
              <MetricTile label="Command Audit Coverage" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 1 : pluginOperations.totals.commandAuditCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Install Audits" value={formatNumber(pluginOperations.totals.installAuditCount)} />
              <MetricTile label="Install Audit Coverage" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 1 : pluginOperations.totals.installAuditCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Load Errors" value={formatNumber(pluginOperations.totals.loadErrorCount)} />
              <MetricTile label="Load Error Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.totals.loadErrorCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Load Error Samples" value={formatNumber(pluginOperations.loadErrors.length)} />
              <MetricTile label="Configured Registries" value={formatNumber(pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Synced Packages" value={formatNumber(pluginOperations.registryOperations.syncedPackageCount)} />
              <MetricTile label="Synced Registries" value={formatNumber(Object.keys(pluginOperations.registryOperations.packageCountByRegistry).length)} />
              <MetricTile label="Oldest Registry Sync" value={formatDurationSeconds(pluginOperations.registryOperations.oldestSyncAgeSeconds)} />
              <MetricTile label="Registry Stale Threshold" value={formatDurationSeconds(pluginOperations.registryOperations.staleThresholdSeconds)} />
              <MetricTile label="Registry Action" value={pluginOperations.registryOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Registry Reasons" value={formatNumber(pluginOperations.registryOperations.actionReasons.length)} />
              <MetricTile label="Review Coverage" value={formatPercent(pluginOperations.reviewOperations.approvalCoverageRate)} />
              <MetricTile label="Review Action" value={pluginOperations.reviewOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Review Reasons" value={formatNumber(pluginOperations.reviewOperations.actionReasons.length)} />
              <MetricTile label="Approved Reviews" value={formatNumber(pluginOperations.reviewOperations.approvedCount)} />
              <MetricTile label="Approved Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.approvedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Recent Approved Reviews" value={formatNumber(pluginOperations.reviewOperations.approvedSamples.length)} />
              <MetricTile label="Pending Reviews" value={formatNumber(pluginOperations.reviewOperations.pendingCount)} />
              <MetricTile label="Pending Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.pendingCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Pending Review Samples" value={formatNumber(pluginOperations.reviewOperations.pendingSamples.length)} />
              <MetricTile label="Rejected Reviews" value={formatNumber(pluginOperations.reviewOperations.rejectedCount)} />
              <MetricTile label="Rejected Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.rejectedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Recent Rejected Reviews" value={formatNumber(pluginOperations.reviewOperations.rejectedSamples.length)} />
              <MetricTile label="Blocked Reviews" value={formatNumber(pluginOperations.reviewOperations.blockedCount)} />
              <MetricTile label="Blocked Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.blockedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Blocked Review Samples" value={formatNumber(pluginOperations.reviewOperations.blockedSamples.length)} />
              <MetricTile label="Oldest Review" value={`${formatNumber(pluginOperations.reviewOperations.oldestPendingAgeDays)} d`} />
              <MetricTile label="Local Packages" value={formatNumber(pluginOperations.reviewOperations.sourceCounts.local)} />
              <MetricTile label="Registry Packages" value={formatNumber(pluginOperations.reviewOperations.sourceCounts.registry)} />
              <MetricTile label="Registry Drift" value={formatNumber(pluginOperations.registryOperations.unconfiguredRegistryPackageCount)} />
              <MetricTile label="Registry Drift Samples" value={formatNumber(pluginOperations.registryOperations.unconfiguredPackages.length)} />
              <MetricTile label="Stale Registries" value={formatNumber(pluginOperations.registryOperations.staleConfiguredRegistryCount)} />
              <MetricTile label="Registry Entries" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Valid Registries" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.validConfiguredCount)} />
              <MetricTile label="Valid Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 1 : pluginOperations.registryOperations.runtimeConfig.validConfiguredCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Unsynced Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.status === "never_synced").length)} />
              <MetricTile label="Unsynced Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.configured.filter((registry) => registry.status === "never_synced").length / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Failed Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.status === "failed").length)} />
              <MetricTile label="Failed Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.configured.filter((registry) => registry.status === "failed").length / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Registry Imports" value={formatNumber(pluginOperations.registryOperations.configured.reduce((total, registry) => total + registry.lastImported.length, 0))} />
              <MetricTile label="Registry Error Messages" value={formatNumber(pluginOperations.registryOperations.configured.reduce((total, registry) => total + registry.lastErrors.length, 0))} />
              <MetricTile label="Registry Error Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.lastErrors.length > 0).length)} />
              <MetricTile label="Stale Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.staleConfiguredRegistryCount / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Invalid Registry URLs" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount)} />
              <MetricTile label="Invalid Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 0 : pluginOperations.registryOperations.runtimeConfig.invalidUrlCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Insecure Registry URLs" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.insecureUrlCount)} />
              <MetricTile label="Insecure Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 0 : pluginOperations.registryOperations.runtimeConfig.insecureUrlCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Registry Config Errors" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length)} />
              <MetricTile label="Inventory Action" value={pluginOperations.inventoryOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Inventory Reasons" value={formatNumber(pluginOperations.inventoryOperations.actionReasons.length)} />
              <MetricTile label="Duplicate Versions" value={formatNumber(pluginOperations.inventoryOperations.duplicateVersionCount)} />
              <MetricTile label="Duplicate Version Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.inventoryOperations.duplicateVersionCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Duplicate Packages" value={formatNumber(pluginOperations.inventoryOperations.duplicatePackageCount)} />
              <MetricTile label="Duplicate Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.inventoryOperations.duplicatePackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Trusted Packages" value={formatNumber(pluginOperations.securityPosture.trustedPackageCount)} />
              <MetricTile label="Trusted Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 1 : pluginOperations.securityPosture.trustedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Security Action" value={pluginOperations.securityPosture.actionRequired ? "yes" : "no"} />
              <MetricTile label="Security Reasons" value={formatNumber(pluginOperations.securityPosture.actionReasons.length)} />
              <MetricTile label="Unsigned" value={formatNumber(pluginOperations.securityPosture.unsignedPackageCount)} />
              <MetricTile label="Unsigned Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.unsignedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Unsigned Samples" value={formatNumber(pluginOperations.securityPosture.unsignedSamples.length)} />
              <MetricTile label="Untrusted" value={formatNumber(pluginOperations.securityPosture.untrustedPackageCount)} />
              <MetricTile label="Untrusted Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.untrustedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Untrusted Samples" value={formatNumber(pluginOperations.securityPosture.untrustedSamples.length)} />
              <MetricTile label="Trust Blocked" value={formatNumber(pluginOperations.securityPosture.trustBlockedPackageCount)} />
              <MetricTile label="Trust Blocked Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.trustBlockedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Command Packages" value={formatNumber(pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Command Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.commandCapablePackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Manifest-Only Packages" value={formatNumber(pluginOperations.securityPosture.manifestOnlyPackageCount)} />
              <MetricTile label="Manifest-Only Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.manifestOnlyPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Non-VM Commands" value={formatNumber(pluginOperations.securityPosture.manifestOnlyCommandPackageCount)} />
              <MetricTile label="Non-VM Command Rate" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 0 : pluginOperations.securityPosture.manifestOnlyCommandPackageCount / pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Non-VM Command Samples" value={formatNumber(pluginOperations.securityPosture.nonVmCommandSamples.length)} />
              <MetricTile label="Trust Policy" value={pluginOperations.securityPosture.runtimeConfig.trustPolicy} />
              <MetricTile label="Trust Keys" value={formatNumber(pluginOperations.securityPosture.runtimeConfig.trustKeyCount)} />
              <MetricTile label="Trust Keys Ready" value={pluginOperations.securityPosture.runtimeConfig.trustKeysConfigured ? "yes" : "no"} />
              <MetricTile label="Unsigned Prod" value={pluginOperations.securityPosture.runtimeConfig.allowUnsignedInProduction ? "yes" : "no"} />
              <MetricTile label="Trusted No Keys" value={pluginOperations.securityPosture.runtimeConfig.trustedModeWithoutKeys ? "yes" : "no"} />
              <MetricTile label="VM Sandbox" value={formatNumber(pluginOperations.securityPosture.vmSandboxPackageCount)} />
              <MetricTile label="VM Sandbox Coverage" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 1 : pluginOperations.securityPosture.vmSandboxPackageCount / pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Sandbox Gap" value={formatNumber(Math.max(0, pluginOperations.securityPosture.commandCapablePackageCount - pluginOperations.securityPosture.vmSandboxPackageCount))} />
              <MetricTile label="Sandbox Gap Rate" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 0 : Math.max(0, pluginOperations.securityPosture.commandCapablePackageCount - pluginOperations.securityPosture.vmSandboxPackageCount) / pluginOperations.securityPosture.commandCapablePackageCount)} />
            </div>
            {pluginOperations.registryOperations.actionRequired && (
              <p className="admin-status">{pluginOperations.registryOperations.actionReasons.join(", ")}</p>
            )}
            {(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount > 0 || pluginOperations.registryOperations.runtimeConfig.insecureUrlCount > 0 || pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length > 0) && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">registry config</span>
                  <strong>{formatNumber(pluginOperations.registryOperations.runtimeConfig.validConfiguredCount)} valid / {formatNumber(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} configured</strong>
                </div>
                <p>
                  {pluginOperations.registryOperations.runtimeConfig.invalidUrlConfig.concat(pluginOperations.registryOperations.runtimeConfig.insecureUrlConfig, pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig).join(", ")}
                </p>
                <div className="admin-meta">
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount)} invalid URLs</span>
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.insecureUrlCount)} production HTTP URLs</span>
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length)} numeric config errors</span>
                </div>
              </article>
            )}
            {pluginOperations.inventoryOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">inventory hygiene</span>
                  <strong>{formatNumber(pluginOperations.inventoryOperations.duplicatePackageCount)} duplicate packages</strong>
                </div>
                <p>{pluginOperations.inventoryOperations.actionReasons.join(", ")}</p>
              </article>
            )}
            {pluginOperations.inventoryOperations.duplicateVersions.slice(0, 3).map((duplicate) => (
              <div className="operator-row tool-call-row" key={`plugin-inventory-${duplicate.pluginId}-${duplicate.version}`}>
                <span>{duplicate.name} v{duplicate.version}</span>
                <strong>{formatNumber(duplicate.packageCount)} packages - {duplicate.packageIds.slice(0, 3).join(", ")}</strong>
              </div>
            ))}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${pluginOperations.securityPosture.actionRequired ? "failed" : "completed"}`}>{pluginOperations.securityPosture.actionRequired ? "security review" : "security posture"}</span>
                <strong>{formatNumber(pluginOperations.securityPosture.commandCapablePackageCount)} command packages</strong>
              </div>
              <p>{pluginOperations.securityPosture.remediation}</p>
              <div className="admin-meta">
                <span>{pluginOperations.securityPosture.runtimeConfig.trustPolicy}</span>
                <span>{formatNumber(pluginOperations.securityPosture.runtimeConfig.trustKeyCount)} trust keys</span>
                <span>{formatNumber(pluginOperations.securityPosture.vmSandboxPackageCount)} VM sandbox</span>
                <span>{formatNumber(pluginOperations.securityPosture.manifestOnlyPackageCount)} manifest-only</span>
                <span>{formatNumber(pluginOperations.securityPosture.unsignedPackageCount)} unsigned</span>
                <span>{formatNumber(pluginOperations.securityPosture.trustBlockedPackageCount)} trust-blocked</span>
              </div>
            </article>
            {[...pluginOperations.securityPosture.nonVmCommandSamples, ...pluginOperations.securityPosture.untrustedSamples, ...pluginOperations.securityPosture.unsignedSamples].slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={`plugin-security-${plugin.packageId}`}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{plugin.sandbox} - {plugin.trustStatus} - {plugin.packageId}</strong>
              </div>
            ))}
            {pluginOperations.commandOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">command failures</span>
                  <strong>{formatNumber(pluginOperations.commandOperations.failedCommandCount)} failed</strong>
                </div>
                <p>{Object.entries(pluginOperations.commandOperations.failedByReason).map(([reason, count]) => `${reason} (${formatNumber(count)})`).join(", ")}</p>
              </article>
            )}
            {pluginOperations.remediationQueue.slice(0, 4).map((remediation) => (
              <article className="operator-item admin-item" key={`plugin-remediation-${remediation.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${remediation.severity === "error" ? "failed" : "running"}`}>{remediation.severity}</span>
                  <strong>{formatNumber(remediation.affectedCount)} affected</strong>
                </div>
                <h3>{remediation.code.replaceAll("_", " ")}</h3>
                <p>{remediation.action}</p>
              </article>
            ))}
            {pluginOperations.reviewOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">review queue</span>
                  <strong>{formatPercent(pluginOperations.reviewOperations.approvalCoverageRate)} approved</strong>
                </div>
                <h3>{pluginOperations.reviewOperations.actionReasons.join(", ")}</h3>
                <p>{pluginOperations.reviewOperations.remediation}</p>
                <div className="admin-meta">
                  <span>{formatNumber(pluginOperations.reviewOperations.pendingCount)} pending</span>
                  <span>{formatNumber(pluginOperations.reviewOperations.blockedCount)} blocked</span>
                  <span>oldest {formatNumber(pluginOperations.reviewOperations.oldestPendingAgeDays)} days</span>
                </div>
              </article>
            )}
            {pluginOperations.reviewOperations.pendingSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-pending-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - pending {formatNumber(review.ageDays)} days - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.approvedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-approved-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - approved {formatNumber(review.ageDays)} days ago - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.rejectedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-rejected-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - rejected {formatNumber(review.ageDays)} days ago - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.blockedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-blocked-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.installBlock ?? `${review.status} review`} - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.registryOperations.configured.slice(0, 3).map((registry) => (
              <article className="operator-item admin-item" key={registry.registryUrl}>
                <div className="operator-row">
                  <span className={`status-pill ${registry.status === "failed" ? "failed" : registry.stale ? "running" : registry.status === "synced" ? "completed" : "running"}`}>{registry.stale ? "stale" : registry.status}</span>
                  <strong>{formatNumber(registry.syncedPackageCount)} packages</strong>
                </div>
                <h3>{registryHostLabel(registry.registryUrl)}</h3>
                <p>{registry.lastErrors.length > 0 ? registry.lastErrors.join(", ") : registry.lastSyncAt ? `Last sync ${formatDateTime(registry.lastSyncAt)} - age ${formatDurationSeconds(registry.syncAgeSeconds)}` : "No sync recorded"}</p>
              </article>
            ))}
            {pluginOperations.registryOperations.staleConfiguredRegistries.slice(0, 3).map((registry) => (
              <div className="operator-row tool-call-row" key={`plugin-registry-stale-${registry.registryUrl}`}>
                <span>{registryHostLabel(registry.registryUrl)}</span>
                <strong>stale {formatDurationSeconds(registry.syncAgeSeconds)} - threshold {formatDurationSeconds(pluginOperations.registryOperations.staleThresholdSeconds)}</strong>
              </div>
            ))}
            {pluginOperations.registryOperations.unconfiguredPackages.slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={`${plugin.registryUrl}-${plugin.packageId}`}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{registryHostLabel(plugin.registryUrl)} - {plugin.packageId}</strong>
              </div>
            ))}
            {pluginOperations.compatibilityOperations.packages.slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={plugin.packageId}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{plugin.compatibleCore} - {plugin.sourceType}</strong>
              </div>
            ))}
            {pluginOperations.compatibilityOperations.installed.slice(0, 3).map((grant) => (
              <div className="operator-row tool-call-row" key={`${grant.campaignId}-${grant.pluginId}`}>
                <span>{grant.pluginId}</span>
                <strong>{campaignName(props.campaigns, grant.campaignId)} - {grant.installedVersion ?? "unknown version"}</strong>
              </div>
            ))}
            {pluginOperations.permissionDrift.slice(0, 3).map((drift) => (
              <div className="operator-row tool-call-row" key={`${drift.campaignId}-${drift.pluginId}-permission-drift`}>
                <span>{drift.name}</span>
                <strong>{campaignName(props.campaigns, drift.campaignId)} - missing {drift.missingPermissions.slice(0, 2).join(", ")}</strong>
              </div>
            ))}
            {pluginOperations.storage.nearLimitEntries.slice(0, 3).map((entry) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-near-limit-${entry.id}`}>
                <span>{entry.pluginId}:{entry.key}</span>
                <strong>{campaignName(props.campaigns, entry.campaignId)} - {formatStorageBytes(entry.sizeBytes)} / {formatStorageBytes(pluginOperations.storage.maxValueBytes)}</strong>
              </div>
            ))}
            {pluginOperations.storage.largestEntries.slice(0, 3).map((entry) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-largest-${entry.id}`}>
                <span>{entry.pluginId}:{entry.key}</span>
                <strong>{entry.updatedByType} - {formatStorageBytes(entry.sizeBytes)}</strong>
              </div>
            ))}
            {pluginOperations.storageOperations.recentOperations.slice(0, 5).map((operation) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-operation-${operation.id}`}>
                <span>{operation.pluginId ?? "unknown plugin"} {operation.key ?? operation.operation.replace("_", " ")}</span>
                <strong>
                  {operation.campaignId ? campaignName(props.campaigns, operation.campaignId) : "unknown campaign"} - {formatNumber(operation.setCount)} set / {formatNumber(operation.deleteCount)} deleted
                  {typeof operation.sizeBytes === "number" ? ` - ${formatStorageBytes(operation.sizeBytes)}` : ""}
                </strong>
              </div>
            ))}
            {pluginOperations.recentCommands.slice(0, 5).map((command) => (
              <div className="operator-row tool-call-row" key={`plugin-command-${command.id}`}>
                <span>{command.pluginId ?? command.packageId ?? "unknown plugin"} {command.command ?? "command"}</span>
                <strong>
                  {command.campaignId ? campaignName(props.campaigns, command.campaignId) : "unknown campaign"} - {formatDateTime(command.createdAt)}
                  {(command.storageMutation.set > 0 || command.storageMutation.deleted > 0) ? ` - storage ${formatNumber(command.storageMutation.set)} set / ${formatNumber(command.storageMutation.deleted)} deleted` : ""}
                </strong>
              </div>
            ))}
            {pluginOperations.installOperations.recentInstalls.slice(0, 5).map((install) => (
              <div className="operator-row tool-call-row" key={`plugin-install-${install.id}`}>
                <span>{install.pluginId ?? install.packageId ?? "unknown plugin"} {install.operation.replace("_", " ")}</span>
                <strong>
                  {install.campaignId ? campaignName(props.campaigns, install.campaignId) : "unknown campaign"} - v{install.version ?? "unknown"} - {formatNumber(install.grantedPermissionCount)} / {formatNumber(install.requestedPermissionCount)} permissions
                </strong>
              </div>
            ))}
            {pluginOperations.commandOperations.recentFailures.slice(0, 3).map((command) => (
              <div className="operator-row tool-call-row" key={`plugin-command-failure-${command.id}`}>
                <span>{command.pluginId ?? command.packageId ?? "unknown plugin"} {command.command ?? "command"}</span>
                <strong>{command.reason ?? "failed"} - {command.message ?? "no failure message"}</strong>
              </div>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Sync configured plugin registries" onClick={() => props.onSyncPluginRegistries().catch(console.error)} disabled={pluginOperations.registryOperations.configuredRegistryCount === 0}>
                <RefreshCw size={14} /> Sync registries
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Plugin marketplace reviews">
        <div className="operator-heading">
          <div className="section-title">Plugin Reviews</div>
          <strong>{pluginReviews ? `${pluginReviews.totals.pending} pending` : "not loaded"}</strong>
        </div>
        {!pluginReviews ? (
          <div className="empty-state compact">No plugin review data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span>Policy</span>
                <strong>{pluginReviews.policy.mode}</strong>
              </div>
              <div className="admin-meta">
                <span>{pluginReviews.totals.approved} approved</span>
                <span>{pluginReviews.totals.rejected} rejected</span>
                <span>{pluginReviews.totals.blocked} blocked</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Review Packages" value={formatNumber(pluginReviews.plugins.length)} />
              <MetricTile label="Review Policy" value={pluginReviews.policy.mode} />
              <MetricTile label="Pending Reviews" value={formatNumber(pluginReviews.totals.pending)} />
              <MetricTile label="Approved Reviews" value={formatNumber(pluginReviews.totals.approved)} />
              <MetricTile label="Rejected Reviews" value={formatNumber(pluginReviews.totals.rejected)} />
              <MetricTile label="Blocked Reviews" value={formatNumber(pluginReviews.totals.blocked)} />
              <MetricTile label="Review Sources" value={formatNumber(pluginReviewSourceCount)} />
              <MetricTile label="Review Trust States" value={formatNumber(pluginReviewTrustStatusCount)} />
              <MetricTile label="Installable Reviews" value={formatNumber(pluginReviews.plugins.filter((review) => review.installable).length)} />
              <MetricTile label="Blocked Installs" value={formatNumber(pluginReviews.plugins.filter((review) => review.installBlock).length)} />
            </div>
            {pluginReviews.plugins.length === 0 ? (
              <div className="empty-state compact">No plugin packages found.</div>
            ) : (
              pluginReviews.plugins.slice(0, 8).map((review) => (
                <article className="operator-item admin-item" key={review.review.reviewKey}>
                  <div className="operator-row">
                    <span className={`status-pill ${review.review.status === "approved" ? "completed" : review.review.status === "rejected" ? "failed" : "running"}`}>{review.review.status}</span>
                    <strong>{review.source.type} - {review.trust.status}</strong>
                  </div>
                  <h3>{review.plugin.name} v{review.plugin.version}</h3>
                  <p>{review.source.packageId} - {review.review.checksum.slice(0, 19)}</p>
                  <div className="admin-meta">
                    <span>{review.plugin.permissions.length} permissions</span>
                    <span>{review.distribution.availableVersions.length} versions</span>
                    <span>{review.installable ? "installable" : "blocked"}</span>
                  </div>
                  {review.installBlock && <p>{review.installBlock}</p>}
                  <div className="admin-actions">
                    <button className="ghost-button" title="Approve plugin package" onClick={() => props.onUpdatePluginReview(review, "approved").catch(console.error)} disabled={review.review.status === "approved"}>
                      <Check size={14} /> Approve
                    </button>
                    <button className="ghost-button" title="Reject plugin package" onClick={() => props.onUpdatePluginReview(review, "rejected").catch(console.error)} disabled={review.review.status === "rejected"}>
                      <UserX size={14} /> Reject
                    </button>
                    <button className="ghost-button" title="Reset plugin package review" onClick={() => props.onUpdatePluginReview(review, "pending").catch(console.error)} disabled={review.review.status === "pending"}>
                      <RefreshCw size={14} /> Reset
                    </button>
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Active sessions">
        <div className="operator-heading">
          <div className="section-title">Sessions</div>
          <strong>{sessions.length}</strong>
        </div>
        {sessions.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Loaded Sessions" value={formatNumber(sessions.length)} />
            <MetricTile label="Session Users" value={formatNumber(new Set(sessions.map((session) => session.user.id)).size)} />
            <MetricTile label="Expiring Soon" value={formatNumber(expiringSoonSessionCount)} />
            <MetricTile label="Oldest Activity" value={oldestSessionLastSeenAt ? formatDateTime(oldestSessionLastSeenAt) : "none"} />
            <MetricTile label="Newest Activity" value={newestSessionLastSeenAt ? formatDateTime(newestSessionLastSeenAt) : "none"} />
          </div>
        )}
        {sessions.length === 0 ? (
          <div className="empty-state compact">No active sessions.</div>
        ) : (
          sessions.slice(0, 8).map((session) => (
            <article className="operator-item admin-item" key={session.id}>
              <div className="operator-row">
                <span>{session.user.displayName}</span>
                <strong>{formatDateTime(session.lastSeenAt)}</strong>
              </div>
              <p>{session.id} - expires {formatDateTime(session.expiresAt)}</p>
              <button className="ghost-button" title="Revoke session" onClick={() => props.onRevokeSession(session).catch(console.error)}>
                <UserX size={14} /> Revoke session
              </button>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Email outbox">
        <div className="operator-heading">
          <div className="section-title">Email Outbox</div>
          <strong>{emails.length}</strong>
        </div>
        {emails.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Loaded Emails" value={formatNumber(emails.length)} />
            <MetricTile label="Outbox Statuses" value={formatNumber(new Set(emails.map((email) => email.status)).size)} />
            <MetricTile label="Outbox Providers" value={formatNumber(new Set(emails.map((email) => email.provider ?? "unknown")).size)} />
            <MetricTile label="Loaded Pending" value={formatNumber(emails.filter((email) => email.status === "pending").length)} />
            <MetricTile label="Loaded Failed" value={formatNumber(emails.filter((email) => email.status === "failed").length)} />
            <MetricTile label="Loaded Delivered" value={formatNumber(emails.filter((email) => email.status === "delivered").length)} />
            <MetricTile label="Retryable Total" value={formatNumber(authOperations?.emailOutbox.retryableCount)} />
            <MetricTile label="Newest Email" value={newestEmailCreatedAt ? formatDateTime(newestEmailCreatedAt) : "none"} />
          </div>
        )}
        <div className="admin-actions">
          <button className="ghost-button" title="Retry all pending and failed email webhook deliveries" onClick={() => props.onRetryAllEmails().catch(console.error)} disabled={!authOperations?.emailOutbox.retryableCount || !authOperations.emailOutbox.webhookConfigured}>
            <RefreshCw size={14} /> Retry all
          </button>
        </div>
        {emails.length === 0 ? (
          <div className="empty-state compact">No queued emails.</div>
        ) : (
          emails.slice(0, 5).map((email) => (
            <article className="operator-item admin-item" key={email.id}>
              <div className="operator-row">
                <span className={`status-pill ${email.status === "failed" ? "failed" : email.status === "delivered" ? "completed" : "running"}`}>{email.status}</span>
                <strong>{email.provider}</strong>
              </div>
              <h3>{email.subject}</h3>
              <p>{email.to} - {formatDateTime(email.createdAt)}</p>
              <div className="admin-actions">
                <button className="ghost-button" title="Retry email webhook delivery" onClick={() => props.onRetryEmail(email).catch(console.error)} disabled={email.status === "delivered" || !authOperations?.emailOutbox.webhookConfigured}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Audit log">
        <div className="operator-heading">
          <div className="section-title">Audit</div>
          <strong>{props.admin?.audit.count ?? 0}</strong>
        </div>
        {props.admin?.audit.summary && (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${props.admin.audit.summary.actionRequired ? "running" : "completed"}`}>{props.admin.audit.summary.truncated ? "limited" : "complete sample"}</span>
                <strong>{formatNumber(props.admin.audit.summary.adminActionCount)} admin actions</strong>
              </div>
              <p>{props.admin.audit.summary.byAction.slice(0, 3).map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") || "no action rollups"}</p>
              <div className="admin-meta">
                <span>{props.admin.audit.summary.byTargetType.slice(0, 3).map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") || "no target rollups"}</span>
                <span>{props.admin.audit.summary.oldestReturnedAt ? `oldest ${formatDateTime(props.admin.audit.summary.oldestReturnedAt)}` : "no oldest timestamp"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Audit Rows" value={formatNumber(props.admin.audit.count)} />
              <MetricTile label="Audit Action" value={props.admin.audit.summary.actionRequired ? "yes" : "no"} />
              <MetricTile label="Audit Truncated" value={props.admin.audit.summary.truncated ? "yes" : "no"} />
              <MetricTile label="Audit Remediations" value={formatNumber(props.admin.audit.summary.remediationQueue.length)} />
              <MetricTile label="Admin Actions" value={formatNumber(props.admin.audit.summary.adminActionCount)} />
              <MetricTile label="Audit Actions" value={formatNumber(props.admin.audit.summary.byAction.length)} />
              <MetricTile label="Audit Targets" value={formatNumber(props.admin.audit.summary.byTargetType.length)} />
              <MetricTile label="Audit Actors" value={formatNumber(props.admin.audit.summary.byActorType.length)} />
              <MetricTile label="Audit Campaigns" value={formatNumber(props.admin.audit.summary.byCampaign.length)} />
              <MetricTile label="Newest Audit" value={props.admin.audit.summary.newestReturnedAt ? formatDateTime(props.admin.audit.summary.newestReturnedAt) : "none"} />
            </div>
          </>
        )}
        {props.admin?.audit.summary.remediationQueue.slice(0, 2).map((item) => (
          <article className="operator-item admin-item" key={`audit-remediation-${item.code}`}>
            <div className="operator-row">
              <span className="status-pill running">{item.severity}</span>
              <strong>{formatNumber(item.affectedCount)} returned</strong>
            </div>
            <h3>{item.code.replaceAll("_", " ")}</h3>
            <p>{item.action}</p>
          </article>
        ))}
        {auditLogs.length === 0 ? (
          <div className="empty-state compact">No audit entries loaded.</div>
        ) : (
          auditLogs.slice(0, 6).map((entry) => (
            <article className="operator-item admin-item" key={entry.id}>
              <div className="operator-row">
                <span>{entry.action}</span>
                <strong>{formatDateTime(entry.createdAt)}</strong>
              </div>
              <p>{entry.actorUserId ?? entry.actorType} - {entry.targetType}{entry.targetId ? `/${entry.targetId}` : ""}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function campaignName(campaigns: Campaign[], campaignId: string): string {
  return campaigns.find((campaign) => campaign.id === campaignId)?.name ?? campaignId;
}

function scimMappingLabel(mapping: AdminScimGroupRoleMapping): string {
  return mapping.group?.displayName ?? mapping.groupDisplayName ?? mapping.groupExternalId ?? mapping.groupId ?? "Unmatched SCIM group";
}

function scimMappingIdentity(mapping: AdminScimGroupRoleMapping): string {
  if (mapping.groupId) return `group id ${mapping.groupId}`;
  if (mapping.groupExternalId) return `external id ${mapping.groupExternalId}`;
  return `display name ${mapping.groupDisplayName ?? "unknown"}`;
}

function registryHostLabel(registryUrl: string): string {
  try {
    const url = new URL(registryUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return registryUrl;
  }
}

function aiToolCallErrorCode(output: unknown): string | undefined {
  const error = recordValue(output).error;
  return typeof error === "string" && error.trim() ? error.trim() : undefined;
}

function AiPanel(props: { prompt: string; setPrompt(value: string): void; askAi(): void; recapSession(): void; extractMemory(): void; proposals: Proposal[]; memory: AiMemoryFact[]; aiThreads: AiThread[]; aiUsage?: AiUsageSummary; aiToolCalls: AiToolCall[]; approveAndApply(proposal: Proposal): void; rejectProposal(proposal: Proposal): void; approveMemory(fact: AiMemoryFact): void; canPropose: boolean; canApply: boolean }) {
  return (
    <div className="panel-stack">
      <div className="section-title">Permissioned AI</div>
      <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
      <button className="primary-button wide" onClick={props.askAi} disabled={!props.canPropose}>
        <Bot size={16} /> Draft Encounter
      </button>
      <button className="ghost-button wide" onClick={props.recapSession} disabled={!props.canPropose}>
        <ScrollText size={16} /> Recap Session
      </button>
      <button className="ghost-button wide" onClick={props.extractMemory} disabled={!props.canPropose}>
        <FileText size={16} /> Extract Memory
      </button>
      {props.canPropose && <AiOperationsPanel summary={props.aiUsage} threads={props.aiThreads} toolCalls={props.aiToolCalls} />}
      {props.memory.map((fact) => (
        <article className="proposal" key={fact.id}>
          <span>{fact.approvedByUserId ? "approved memory" : "pending memory"}</span>
          <p>{fact.text}</p>
          {!fact.approvedByUserId && (
            <button className="ghost-button" onClick={() => props.approveMemory(fact)} disabled={!props.canApply}>
              <Check size={15} /> Approve memory
            </button>
          )}
        </article>
      ))}
      {props.proposals.map((proposal) => (
        <article className="proposal" key={proposal.id}>
          <span>{proposal.status}</span>
          <h3>{proposal.title}</h3>
          <p>{proposal.summary}</p>
          {proposal.status !== "applied" && proposal.status !== "rejected" && (
            <>
              <button className="ghost-button" onClick={() => props.approveAndApply(proposal)} disabled={!props.canApply}>
                <Check size={15} /> Approve and apply
              </button>
              <button className="ghost-button" onClick={() => props.rejectProposal(proposal)} disabled={!props.canApply}>
                <X size={15} /> Reject
              </button>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function AiOperationsPanel(props: { summary?: AiUsageSummary; threads: AiThread[]; toolCalls: AiToolCall[] }) {
  const summary = props.summary;
  const recentThreads = props.threads.slice(0, 4);
  const recentToolCalls = props.toolCalls.slice(0, 5);
  const usage = summary?.usage;
  return (
    <section className="operator-section" aria-label="AI operations">
      <div className="operator-heading">
        <div className="section-title">Operator Signals</div>
        <Activity size={15} />
      </div>
      <div className="metric-grid">
        <MetricTile label="Threads" value={formatNumber(summary?.threadCount ?? props.threads.length)} />
        <MetricTile label="Failures" value={formatNumber(summary?.failedThreadCount)} />
        <MetricTile label="Retries" value={formatNumber(summary?.retryAttempts)} />
        <MetricTile label="Tokens" value={formatNumber(usage?.totalTokens)} />
        <MetricTile label="Cost" value={formatCost(usage?.estimatedCostUsd)} />
        <MetricTile label="Tools" value={formatNumber(summary?.toolCallCount ?? props.toolCalls.length)} />
      </div>
      {summary && summary.providers.length > 0 && (
        <div className="operator-list">
          {summary.providers.map((provider) => (
            <div className="operator-row" key={provider.provider}>
              <span>{provider.provider}</span>
              <strong>{formatNumber(provider.usage.totalTokens)} tokens</strong>
            </div>
          ))}
        </div>
      )}
      <div className="operator-list">
        <div className="operator-heading">
          <div className="section-title">Recent Threads</div>
          <Timer size={15} />
        </div>
        {recentThreads.length === 0 ? (
          <div className="empty-state compact">No AI threads.</div>
        ) : (
          recentThreads.map((thread) => (
            <article className="operator-item" key={thread.id}>
              <div className="operator-row">
                <span className={`status-pill ${thread.status ?? "running"}`}>{thread.status ?? "running"}</span>
                <strong>{formatDuration(thread.durationMs)}</strong>
              </div>
              <h3>{thread.title}</h3>
              <p>{thread.provider} - {formatTime(thread.startedAt)}</p>
              <div className="operator-row">
                <span>{formatNumber(thread.usage?.totalTokens)} tokens</span>
                <span>{formatCost(thread.usage?.estimatedCostUsd)}</span>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="operator-list">
        <div className="section-title">Tool Calls</div>
        {recentToolCalls.length === 0 ? (
          <div className="empty-state compact">No tool calls.</div>
        ) : (
          recentToolCalls.map((toolCall) => (
            <div className="operator-row tool-call-row" key={toolCall.id}>
              <span>{toolCall.toolName}</span>
              <strong>{toolCall.status} - {formatDuration(toolCall.durationMs)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function formatNumber(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatCost(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "n/a";
}

function formatPercent(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "0%";
}

function formatAdminList(values: string[], limit: number): string {
  const shown = values.slice(0, limit);
  const remaining = values.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
}

function formatStorageBytes(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 B";
  if (value < 1024) return `${value.toLocaleString()} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatDurationSeconds(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 s";
  return formatDuration(value * 1000);
}

function formatTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SdkPanel(props: { plugins: PluginRuntimeInfo[]; systems: SystemRuntimeInfo[]; characterTemplates: CharacterTemplateInfo[]; actor?: Actor; importedActor?: Actor; encounterPlan?: EncounterPlanInfo; onInstallPlugin(plugin: PluginRuntimeInfo): void; onInstallSystem(system: SystemRuntimeInfo): void; onCreateCharacter(template: CharacterTemplateInfo): void; onImportCharacter(): void; onAdvanceActor(): void; onRestActor(restType: "short" | "long", options?: { arcaneRecovery?: Record<string, number> }): void; onPlanEncounter(): void; onRunCommand(plugin: PluginRuntimeInfo, command: string): void; onSystemRoll(): void; canInstall: boolean; canInstallSystem: boolean; canCreateActor: boolean; canImportActor: boolean; canAdvanceActor: boolean; canRestActor: boolean; canPlanEncounter: boolean; canRollSystem: boolean }) {
  const activeSystem = props.systems.find((system) => system.active) ?? props.systems[0];
  const rollLabel = systemRollLabel(props.actor?.systemId);
  const advancementLabel = systemAdvancementLabel(props.actor?.systemId);
  const arcaneRecovery = props.actor ? dnd5eSrdArcaneRecoverySelection(props.actor) : undefined;
  return (
    <div className="panel-stack">
      <div className="section-title">Runtime SDK</div>
      {props.plugins.map((plugin) => (
        <article className="proposal" key={plugin.id}>
          <span>{plugin.installed ? "installed plugin" : "available plugin"}</span>
          <h3>{plugin.name}</h3>
          <p>{plugin.permissions.join(", ")}</p>
          <p>{plugin.source ? `${plugin.source.packageId} - ${plugin.source.sandbox} sandbox - v${plugin.version}` : `v${plugin.version}`}</p>
          {!plugin.installed ? (
            <button className="ghost-button" onClick={() => props.onInstallPlugin(plugin)} disabled={!props.canInstall}>
              <Plus size={15} /> Install
            </button>
          ) : (
            plugin.chatCommands?.map((command) => (
              <button className="ghost-button" key={command.command} onClick={() => props.onRunCommand(plugin, command.command)}>
                <WandSparkles size={15} /> {command.command}
              </button>
            ))
          )}
        </article>
      ))}
      <div className="metric-row">
        <span>Active System</span>
        <strong>{activeSystem?.name ?? "No system"}</strong>
      </div>
      {props.systems.map((system) => (
        <article className="proposal" key={system.id}>
          <span>{system.active ? "active system" : "available system"}</span>
          <h3>{system.name}</h3>
          <p>v{system.version}</p>
          {!system.active && (
            <button className="ghost-button" onClick={() => props.onInstallSystem(system)} disabled={!props.canInstallSystem}>
              <Plus size={15} /> Activate
            </button>
          )}
        </article>
      ))}
      {props.characterTemplates.map((template) => (
        <article className="proposal" key={template.id}>
          <span>character template</span>
          <h3>{template.name}</h3>
          <p>{template.summary}</p>
          <button className="ghost-button" onClick={() => props.onCreateCharacter(template)} disabled={!props.canCreateActor}>
            <Plus size={15} /> Create
          </button>
        </article>
      ))}
      <div className="metric-row">
        <span>Sheet Actor</span>
        <strong>{props.actor?.name ?? "No actor"}</strong>
      </div>
      <button className="ghost-button wide" onClick={props.onImportCharacter} disabled={!activeSystem || !props.canImportActor}>
        <Upload size={16} /> Import Character
      </button>
      {props.importedActor && (
        <div className="metric-row">
          <span>Imported Character</span>
          <strong>{props.importedActor.name}</strong>
        </div>
      )}
      <button className="ghost-button wide" onClick={props.onAdvanceActor} disabled={!props.actor || !props.canAdvanceActor}>
        <RefreshCw size={16} /> {advancementLabel}
      </button>
      <button className="ghost-button wide" onClick={() => props.onRestActor("short")} disabled={!props.actor || !props.canRestActor}>
        <RefreshCw size={16} /> Short Rest
      </button>
      {arcaneRecovery && (
        <button className="ghost-button wide" onClick={() => props.onRestActor("short", { arcaneRecovery })} disabled={!props.actor || !props.canRestActor}>
          <RefreshCw size={16} /> Arcane Recovery
        </button>
      )}
      <button className="ghost-button wide" onClick={() => props.onRestActor("long")} disabled={!props.actor || !props.canRestActor}>
        <RefreshCw size={16} /> Long Rest
      </button>
      <button className="ghost-button wide" onClick={props.onPlanEncounter} disabled={!activeSystem || !props.canPlanEncounter}>
        <Swords size={16} /> Plan Encounter
      </button>
      {props.encounterPlan && (
        <div className="metric-row">
          <span>{props.encounterPlan.difficulty} encounter</span>
          <strong>
            {props.encounterPlan.threatBudget}/{props.encounterPlan.partyRating}
          </strong>
        </div>
      )}
      <button className="primary-button wide" onClick={props.onSystemRoll} disabled={!props.actor || !props.canRollSystem}>
        <ChevronRight size={16} /> {rollLabel}
      </button>
    </div>
  );
}
