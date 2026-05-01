import type { Actor, AiMemoryFact, AiThread, AiToolCall, Campaign, ChatMessage, Combat, Item, JournalEntry, MapAsset, PermissionName, Proposal, Scene, Token, UserRole, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";
import { Activity, Bot, Boxes, BrickWall, Check, ChevronRight, Download, Eraser, Eye, FileText, Hand, KeyRound, Lightbulb, LockKeyhole, Mail, MessageSquare, Pentagon, Plus, RefreshCw, ScrollText, Send, Shield, Swords, Timer, Upload, UserCog, UserPlus, Users, UserX, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { acceptInviteSession, apiDelete, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, confirmPasswordResetSession, consumeSsoRedirect, getSessionToken, getSessionUserId, loadAdminSnapshot, loadOidcConfig, loadSnapshot, loginSession, requestPasswordReset, setSessionUserId, startOidcLogin, type AdminPasswordResetInfo, type AdminSessionInfo, type AdminSnapshot, type AdminUserInfo, type AiUsageSummary, type CharacterTemplateInfo, type InviteCreateInfo, type PluginRuntimeInfo, type Snapshot, type SystemRuntimeInfo } from "./api.js";

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

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    campaigns: [],
    members: [],
    scenes: [],
    assets: [],
    tokens: [],
    actors: [],
    items: [],
    journals: [],
    chat: [],
    encounters: [],
    combats: [],
    proposals: [],
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
  const [tab, setTab] = useState<"actors" | "journal" | "combat" | "ai" | "plugins" | "admin">("actors");
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

  async function addLight() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/lights`, {
      x: selectedToken ? selectedToken.x + selectedToken.width / 2 : selectedScene.width / 2,
      y: selectedToken ? selectedToken.y + selectedToken.height / 2 : selectedScene.height / 2,
      radius: 210,
      color: "#38bdf8",
      intensity: 0.32
    });
    setStatus("Light added");
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
      rollId: selectedActor.systemId === "stellar-frontiers" ? "aptitude-tech" : "ability-charisma"
    });
    setStatus("System roll posted");
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

  async function advanceSelectedActor() {
    if (!selectedActor) return;
    const optionId = selectedActor.systemId === "stellar-frontiers" ? "rank-up" : "level-up";
    const advanced = await apiPost<{ advancement: { name: string } }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/advance`, {
      optionId
    });
    setStatus(`${selectedActor.name} advanced to ${advanced.advancement.name}`);
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

  async function exportCampaign() {
    const archive = await apiGet<object>(`/api/v1/campaigns/${campaignId}/export`);
    const blob = new Blob([JSON.stringify(archive, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedCampaign?.name ?? "campaign"}.ottx.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
            <input aria-label="Invite email" value={inviteEmail} placeholder="player@example.com" onChange={(event) => setInviteEmail(event.target.value)} />
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
          <input aria-label="Join email" value={joinEmail} placeholder="player@example.com" onChange={(event) => setJoinEmail(event.target.value)} />
          <input aria-label="Display name" value={joinName} placeholder="Display name" onChange={(event) => setJoinName(event.target.value)} />
          <input aria-label="Password" type="password" value={joinPassword} placeholder="Password" onChange={(event) => setJoinPassword(event.target.value)} />
          <button className="ghost-button wide" type="submit" disabled={!joinToken.trim() || !joinEmail.trim() || !joinPassword}>
            <ChevronRight size={16} /> Join
          </button>
        </form>
        <button className="ghost-button" onClick={createScene} disabled={!hasPermission("scene.create")}>
          <Plus size={16} /> Scene
        </button>
        <button className="ghost-button" onClick={exportCampaign}>
          <Download size={16} /> Export
        </button>
        <button className="ghost-button" onClick={() => document.getElementById("import-file")?.click()}>
          <Upload size={16} /> Import
        </button>
        <button className="ghost-button" onClick={() => document.getElementById("map-upload-file")?.click()} disabled={!hasPermission("scene.create") || !hasPermission("scene.update")}>
          <Upload size={16} /> Map
        </button>
        <input
          id="import-file"
          type="file"
          accept="application/json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await apiPost("/api/v1/import/campaign", JSON.parse(await file.text()));
            await refresh();
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
        <div className="status">{status}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{selectedCampaign?.defaultSystemId ?? "No system"}</div>
            <h1>{selectedCampaign?.name ?? "No campaign"}</h1>
          </div>
          <div className="scene-tabs">
            {snapshot.scenes.map((scene) => (
              <button key={scene.id} className={scene.id === sceneId ? "scene-tab active" : "scene-tab"} onClick={() => setSceneId(scene.id)}>
                {scene.active ? <Eye size={14} /> : <FileText size={14} />}
                {scene.name}
              </button>
            ))}
          </div>
          <button className="primary-button" onClick={createToken} disabled={!hasPermission("token.create")}>
            <Plus size={16} /> Token
          </button>
        </header>

        <div className="table-grid">
          <section className="table-area">
            <Toolbar onCreateToken={createToken} onStartCombat={startCombat} onRevealFog={revealFog} onHideFog={hideFog} onRevealFogPolygon={revealFogPolygon} onAddWall={addWall} onAddLight={addLight} canCreateToken={hasPermission("token.create")} canManageCombat={hasPermission("combat.manage")} canRevealFog={hasPermission("token.reveal")} canUpdateScene={hasPermission("scene.update")} />
            {selectedScene ? <SceneCanvas scene={selectedScene} backgroundAsset={selectedMapAsset} tokens={snapshot.tokens} vision={snapshot.vision} selectedTokenId={selectedTokenId} onSelect={setSelectedTokenId} onMoved={refresh} /> : <div className="empty-state">Create a scene to open the tabletop.</div>}
          </section>

          <aside className="inspector">
            <div className="tabs">
              <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" onClick={() => setTab("actors")} />
              <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" onClick={() => setTab("journal")} />
              <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" onClick={() => setTab("combat")} />
              <TabButton active={tab === "ai"} icon={<Bot size={15} />} label="AI" onClick={() => setTab("ai")} />
              <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="SDK" onClick={() => setTab("plugins")} />
              {snapshot.session?.serverAdmin && <TabButton active={tab === "admin"} icon={<UserCog size={15} />} label="Admin" onClick={() => setTab("admin")} />}
            </div>
            {tab === "actors" && <ActorPanel actor={selectedActor} token={selectedToken} items={selectedActorItems} updateActorHp={updateActorHp} canUpdateActor={canUpdateSelectedActor} />}
            {tab === "journal" && <JournalPanel journals={snapshot.journals} onCreate={createJournal} canCreate={hasPermission("journal.create")} />}
            {tab === "combat" && <CombatPanel combat={activeCombat} onStart={startCombat} canManage={hasPermission("combat.manage")} />}
            {tab === "ai" && <AiPanel prompt={aiPrompt} setPrompt={setAiPrompt} askAi={askAi} recapSession={recapSession} extractMemory={extractMemory} proposals={snapshot.proposals} memory={snapshot.memory} aiThreads={snapshot.aiThreads} aiUsage={snapshot.aiUsage} aiToolCalls={snapshot.aiToolCalls} approveAndApply={approveAndApply} approveMemory={approveMemory} canPropose={hasPermission("ai.proposeChanges")} canApply={hasPermission("ai.applyChanges")} />}
            {tab === "plugins" && <SdkPanel plugins={snapshot.plugins} systems={snapshot.systems} characterTemplates={snapshot.characterTemplates} actor={selectedActor} onInstallPlugin={installPlugin} onInstallSystem={installSystem} onCreateCharacter={createCharacterFromTemplate} onAdvanceActor={advanceSelectedActor} onRunCommand={runPluginCommand} onSystemRoll={rollSystemCheck} canInstall={hasPermission("plugin.install")} canInstallSystem={hasPermission("campaign.update")} canCreateActor={hasPermission("actor.create")} canAdvanceActor={canUpdateSelectedActor} canRollSystem={hasPermission("dice.roll")} />}
            {tab === "admin" && snapshot.session?.serverAdmin && <AdminPanel admin={adminSnapshot} currentUserId={currentUserId} status={adminStatus} onRefresh={refreshAdmin} onDisableUser={disableAdminUser} onEnableUser={enableAdminUser} onRequireReset={requireAdminPasswordReset} onIssueReset={issueAdminPasswordReset} onRevokeUserSessions={revokeAdminUserSessions} onRevokeSession={revokeAdminSession} />}
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

function SceneCanvas(props: { scene: Scene; backgroundAsset?: MapAsset; tokens: Token[]; vision?: VisionSnapshot; selectedTokenId: string; onSelect(id: string): void; onMoved(): Promise<void> }) {
  const [dragging, setDragging] = useState<string | null>(null);
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

  return (
    <div
      ref={boardRef}
      className="scene-board"
      style={{ aspectRatio: `${props.scene.width} / ${props.scene.height}` }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const token = tokens.find((item) => item.id === dragging);
        if (token) moveToken(token, event.clientX, event.clientY).catch(console.error);
      }}
      onPointerUp={() => setDragging(null)}
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
            <polygon key={polygon.id} points={polygonPoints(polygon)} style={{ fill: polygon.color ?? "#facc15", opacity: polygon.opacity ?? 0.22 }} />
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
            <polygon key={`${polygon.id}-outline`} className={`vision-outline ${polygon.source}`} points={polygonPoints(polygon)} />
          ))}
          {hiddenPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className="vision-outline hide" points={polygonPoints(polygon)} />
          ))}
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

function polygonPoints(polygon: VisionPolygon): string {
  return polygon.points.map((point) => `${point.x},${point.y}`).join(" ");
}

function tokenCenter(token: Token): { x: number; y: number } {
  return { x: token.x + token.width / 2, y: token.y + token.height / 2 };
}

function Toolbar(props: { onCreateToken(): void; onStartCombat(): void; onRevealFog(): void; onHideFog(): void; onRevealFogPolygon(): void; onAddWall(): void; onAddLight(): void; canCreateToken: boolean; canManageCombat: boolean; canRevealFog: boolean; canUpdateScene: boolean }) {
  return (
    <div className="toolbar">
      <button className="tool active" title="Select">
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
      <button className="tool" title="Add wall" onClick={props.onAddWall} disabled={!props.canUpdateScene}>
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

function ActorPanel(props: { actor?: Actor; token?: Token; items: Item[]; updateActorHp(actor: Actor, current: number): void; canUpdateActor: boolean }) {
  if (!props.actor) return <div className="panel-empty">No actor selected.</div>;
  const hp = props.actor.data.hp as { current?: number; max?: number } | undefined;
  const conditions = actorConditionLabels(props.actor);
  const inventory = props.items.filter((item) => item.type !== "spell" && item.type !== "talent");
  const spells = props.items.filter((item) => item.type === "spell");
  const talents = props.items.filter((item) => item.type === "talent");
  return (
    <div className="panel-stack">
      <div className="section-title">Selected Actor</div>
      <h2>{props.actor.name}</h2>
      <div className="metric-row">
        <span>Token</span>
        <strong>{props.token?.name ?? "Unlinked"}</strong>
      </div>
      <div className="metric-row">
        <span>HP</span>
        <strong>
          {hp?.current ?? "?"}/{hp?.max ?? "?"}
        </strong>
      </div>
      {conditions.length > 0 && (
        <div className="metric-row">
          <span>Conditions</span>
          <strong>{conditions.join(", ")}</strong>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="metric-row">
          <span>Inventory</span>
          <strong>{inventory.map((item) => item.name).join(", ")}</strong>
        </div>
      )}
      {spells.length > 0 && (
        <div className="metric-row">
          <span>Spells</span>
          <strong>{spells.map((item) => item.name).join(", ")}</strong>
        </div>
      )}
      {talents.length > 0 && (
        <div className="metric-row">
          <span>Talents</span>
          <strong>{talents.map((item) => item.name).join(", ")}</strong>
        </div>
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
    "vacuum-exposed": "Vacuum Exposed"
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

function AdminPanel(props: { admin?: AdminSnapshot; currentUserId: string; status: string; onRefresh(): Promise<void>; onDisableUser(user: AdminUserInfo): Promise<void>; onEnableUser(user: AdminUserInfo): Promise<void>; onRequireReset(user: AdminUserInfo): Promise<void>; onIssueReset(user: AdminUserInfo): Promise<void>; onRevokeUserSessions(user: AdminUserInfo): Promise<void>; onRevokeSession(session: AdminSessionInfo): Promise<void> }) {
  const users = props.admin?.users ?? [];
  const sessions = props.admin?.sessions ?? [];
  const emails = props.admin?.emailOutbox.slice().reverse() ?? [];
  const auditLogs = props.admin?.audit.auditLogs ?? [];
  const aiOperations = props.admin?.aiOperations;
  return (
    <div className="panel-stack admin-panel">
      <div className="panel-heading">
        <div className="section-title">Server Admin</div>
        <button className="icon-button" title="Refresh admin operations" onClick={() => props.onRefresh().catch(console.error)}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="admin-status">{props.status}</div>

      <section className="admin-section" aria-label="Admin users">
        <div className="operator-heading">
          <div className="section-title">Users</div>
          <strong>{users.length}</strong>
        </div>
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
                <span>{aiOperations.provider.label}</span>
                <strong>{aiOperations.runtime.selectedProvider}</strong>
              </div>
              <p>active {aiOperations.runtime.activeProvider} - retry budget {aiOperations.runtime.retryAttempts}</p>
              <div className="admin-meta">
                {aiOperations.runtime.codex && <span>{aiOperations.runtime.codex.transport} Codex transport</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.apiKeyConfigured ? "OpenAI key configured" : "OpenAI key missing"}</span>}
                <span>{aiOperations.runtime.costRatesConfigured.inputTokens && aiOperations.runtime.costRatesConfigured.outputTokens ? "cost rates configured" : "cost rates not configured"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Threads" value={formatNumber(aiOperations.totals.threadCount)} />
              <MetricTile label="Failures" value={formatNumber(aiOperations.totals.failedThreadCount)} />
              <MetricTile label="Retries" value={formatNumber(aiOperations.totals.retryAttempts)} />
              <MetricTile label="Tokens" value={formatNumber(aiOperations.totals.usage.totalTokens)} />
              <MetricTile label="Cost" value={formatCost(aiOperations.totals.usage.estimatedCostUsd)} />
              <MetricTile label="Tools" value={formatNumber(aiOperations.totals.toolCallCount)} />
            </div>
            {aiOperations.campaigns.slice(0, 4).map((campaign) => (
              <article className="operator-item admin-item" key={campaign.campaignId}>
                <div className="operator-row">
                  <span>{campaign.campaignName}</span>
                  <strong>{formatNumber(campaign.threadCount)} threads</strong>
                </div>
                <p>{formatNumber(campaign.failedThreadCount)} failures - {formatNumber(campaign.toolCallCount)} tool calls - {formatDuration(campaign.durationMs)}</p>
              </article>
            ))}
            {aiOperations.recentToolCalls.slice(0, 5).map((toolCall) => (
              <div className="operator-row tool-call-row" key={toolCall.id}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.status} - {toolCall.campaignName ?? "unknown"}</strong>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Active sessions">
        <div className="operator-heading">
          <div className="section-title">Sessions</div>
          <strong>{sessions.length}</strong>
        </div>
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
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Audit log">
        <div className="operator-heading">
          <div className="section-title">Audit</div>
          <strong>{props.admin?.audit.count ?? 0}</strong>
        </div>
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

function AiPanel(props: { prompt: string; setPrompt(value: string): void; askAi(): void; recapSession(): void; extractMemory(): void; proposals: Proposal[]; memory: AiMemoryFact[]; aiThreads: AiThread[]; aiUsage?: AiUsageSummary; aiToolCalls: AiToolCall[]; approveAndApply(proposal: Proposal): void; approveMemory(fact: AiMemoryFact): void; canPropose: boolean; canApply: boolean }) {
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
          {proposal.status !== "applied" && (
            <button className="ghost-button" onClick={() => props.approveAndApply(proposal)} disabled={!props.canApply}>
              <Check size={15} /> Approve and apply
            </button>
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

function formatDuration(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
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

function SdkPanel(props: { plugins: PluginRuntimeInfo[]; systems: SystemRuntimeInfo[]; characterTemplates: CharacterTemplateInfo[]; actor?: Actor; onInstallPlugin(plugin: PluginRuntimeInfo): void; onInstallSystem(system: SystemRuntimeInfo): void; onCreateCharacter(template: CharacterTemplateInfo): void; onAdvanceActor(): void; onRunCommand(plugin: PluginRuntimeInfo, command: string): void; onSystemRoll(): void; canInstall: boolean; canInstallSystem: boolean; canCreateActor: boolean; canAdvanceActor: boolean; canRollSystem: boolean }) {
  const activeSystem = props.systems.find((system) => system.active) ?? props.systems[0];
  const rollLabel = props.actor?.systemId === "stellar-frontiers" ? "Tech Check" : "Charisma Check";
  const advancementLabel = props.actor?.systemId === "stellar-frontiers" ? "Advance Rank" : "Level Up";
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
      <button className="ghost-button wide" onClick={props.onAdvanceActor} disabled={!props.actor || !props.canAdvanceActor}>
        <RefreshCw size={16} /> {advancementLabel}
      </button>
      <button className="primary-button wide" onClick={props.onSystemRoll} disabled={!props.actor || !props.canRollSystem}>
        <ChevronRight size={16} /> {rollLabel}
      </button>
    </div>
  );
}
