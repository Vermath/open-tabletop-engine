import type { Actor, AiMemoryFact, Campaign, ChatMessage, Combat, JournalEntry, MapAsset, PermissionName, Proposal, Scene, Token, UserRole } from "@open-tabletop/core";
import { Bot, Boxes, BrickWall, Check, ChevronRight, Download, Eye, FileText, Hand, Lightbulb, MessageSquare, Plus, ScrollText, Send, Shield, Swords, Upload, UserPlus, Users, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { acceptInviteSession, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, consumeSsoRedirect, getSessionToken, getSessionUserId, loadOidcConfig, loadSnapshot, loginSession, setSessionUserId, startOidcLogin, type InviteCreateInfo, type PluginRuntimeInfo, type Snapshot, type SystemRuntimeInfo } from "./api.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    campaigns: [],
    members: [],
    scenes: [],
    assets: [],
    tokens: [],
    actors: [],
    journals: [],
    chat: [],
    encounters: [],
    combats: [],
    proposals: [],
    memory: [],
    plugins: [],
    systems: []
  });
  const [currentUserId, setCurrentUserId] = useState(getSessionUserId());
  const [sessionToken, setSessionToken] = useState(getSessionToken());
  const [campaignId, setCampaignId] = useState("camp_demo");
  const [sceneId, setSceneId] = useState("scn_vault_entry");
  const [selectedTokenId, setSelectedTokenId] = useState("tok_valen");
  const [tab, setTab] = useState<"actors" | "journal" | "combat" | "ai" | "plugins">("actors");
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

  const selectedCampaign = snapshot.campaigns.find((campaign) => campaign.id === campaignId);
  const selectedScene = snapshot.scenes.find((scene) => scene.id === sceneId);
  const selectedMapAsset = snapshot.assets.find((asset) => asset.id === selectedScene?.backgroundAssetId);
  const selectedToken = snapshot.tokens.find((token) => token.id === selectedTokenId);
  const selectedActor = snapshot.actors.find((actor) => actor.id === selectedToken?.actorId) ?? snapshot.actors[0];
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

  useEffect(() => {
    const ssoUserId = consumeSsoRedirect();
    if (ssoUserId) {
      setCurrentUserId(ssoUserId);
      setSessionToken(getSessionToken());
    }
    loadOidcConfig()
      .then((config) => setSsoEnabled(config.enabled))
      .catch(() => setSsoEnabled(false));
    refresh().catch((error) => setStatus(`API offline: ${error instanceof Error ? error.message : String(error)}`));
  }, []);

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
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      x: selectedToken?.x ?? selectedScene.width / 2,
      y: selectedToken?.y ?? selectedScene.height / 2,
      radius: 160,
      hidden: false
    });
    setStatus("Fog updated");
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
      color: "#facc15"
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
      rollId: "ability-charisma"
    });
    setStatus("System roll posted");
    await refresh();
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
            <Toolbar onCreateToken={createToken} onStartCombat={startCombat} onRevealFog={revealFog} onAddWall={addWall} onAddLight={addLight} canCreateToken={hasPermission("token.create")} canManageCombat={hasPermission("combat.manage")} canRevealFog={hasPermission("token.reveal")} canUpdateScene={hasPermission("scene.update")} />
            {selectedScene ? <SceneCanvas scene={selectedScene} backgroundAsset={selectedMapAsset} tokens={snapshot.tokens} selectedTokenId={selectedTokenId} onSelect={setSelectedTokenId} onMoved={refresh} /> : <div className="empty-state">Create a scene to open the tabletop.</div>}
          </section>

          <aside className="inspector">
            <div className="tabs">
              <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" onClick={() => setTab("actors")} />
              <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" onClick={() => setTab("journal")} />
              <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" onClick={() => setTab("combat")} />
              <TabButton active={tab === "ai"} icon={<Bot size={15} />} label="AI" onClick={() => setTab("ai")} />
              <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="SDK" onClick={() => setTab("plugins")} />
            </div>
            {tab === "actors" && <ActorPanel actor={selectedActor} token={selectedToken} updateActorHp={updateActorHp} canUpdateActor={canUpdateSelectedActor} />}
            {tab === "journal" && <JournalPanel journals={snapshot.journals} onCreate={createJournal} canCreate={hasPermission("journal.create")} />}
            {tab === "combat" && <CombatPanel combat={activeCombat} onStart={startCombat} canManage={hasPermission("combat.manage")} />}
            {tab === "ai" && <AiPanel prompt={aiPrompt} setPrompt={setAiPrompt} askAi={askAi} recapSession={recapSession} extractMemory={extractMemory} proposals={snapshot.proposals} memory={snapshot.memory} approveAndApply={approveAndApply} approveMemory={approveMemory} canPropose={hasPermission("ai.proposeChanges")} canApply={hasPermission("ai.applyChanges")} />}
            {tab === "plugins" && <SdkPanel plugins={snapshot.plugins} systems={snapshot.systems} actor={selectedActor} onInstallPlugin={installPlugin} onRunCommand={runPluginCommand} onSystemRoll={rollSystemCheck} canInstall={hasPermission("plugin.install")} canRollSystem={hasPermission("dice.roll")} />}
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

function SceneCanvas(props: { scene: Scene; backgroundAsset?: MapAsset; tokens: Token[]; selectedTokenId: string; onSelect(id: string): void; onMoved(): Promise<void> }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => props.tokens.filter((token) => token.sceneId === props.scene.id), [props.tokens, props.scene.id]);

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
            background: light.color
          }}
        />
      ))}
      {props.scene.walls.map((wall) => (
        <svg className="wall-layer" key={wall.id} viewBox={`0 0 ${props.scene.width} ${props.scene.height}`}>
          <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
        </svg>
      ))}
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
      <div className="fog-band">Fog, walls, and token vision are modeled in scene state.</div>
    </div>
  );
}

function Toolbar(props: { onCreateToken(): void; onStartCombat(): void; onRevealFog(): void; onAddWall(): void; onAddLight(): void; canCreateToken: boolean; canManageCombat: boolean; canRevealFog: boolean; canUpdateScene: boolean }) {
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

function ActorPanel(props: { actor?: Actor; token?: Token; updateActorHp(actor: Actor, current: number): void; canUpdateActor: boolean }) {
  if (!props.actor) return <div className="panel-empty">No actor selected.</div>;
  const hp = props.actor.data.hp as { current?: number; max?: number } | undefined;
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
      <div className="sheet-row">
        <label htmlFor="actor-hp">Current HP</label>
        <input id="actor-hp" type="number" value={hp?.current ?? 0} disabled={!props.canUpdateActor} onChange={(event) => props.updateActorHp(props.actor!, Number(event.target.value))} />
      </div>
      <pre>{JSON.stringify(props.actor.data, null, 2)}</pre>
    </div>
  );
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

function AiPanel(props: { prompt: string; setPrompt(value: string): void; askAi(): void; recapSession(): void; extractMemory(): void; proposals: Proposal[]; memory: AiMemoryFact[]; approveAndApply(proposal: Proposal): void; approveMemory(fact: AiMemoryFact): void; canPropose: boolean; canApply: boolean }) {
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

function SdkPanel(props: { plugins: PluginRuntimeInfo[]; systems: SystemRuntimeInfo[]; actor?: Actor; onInstallPlugin(plugin: PluginRuntimeInfo): void; onRunCommand(plugin: PluginRuntimeInfo, command: string): void; onSystemRoll(): void; canInstall: boolean; canRollSystem: boolean }) {
  const activeSystem = props.systems.find((system) => system.active) ?? props.systems[0];
  return (
    <div className="panel-stack">
      <div className="section-title">Runtime SDK</div>
      {props.plugins.map((plugin) => (
        <article className="proposal" key={plugin.id}>
          <span>{plugin.installed ? "installed plugin" : "available plugin"}</span>
          <h3>{plugin.name}</h3>
          <p>{plugin.permissions.join(", ")}</p>
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
      <div className="metric-row">
        <span>Sheet Actor</span>
        <strong>{props.actor?.name ?? "No actor"}</strong>
      </div>
      <button className="primary-button wide" onClick={props.onSystemRoll} disabled={!props.actor || !props.canRollSystem}>
        <ChevronRight size={16} /> Charisma Check
      </button>
    </div>
  );
}
