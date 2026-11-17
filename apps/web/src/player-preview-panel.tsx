import { Eye, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { assetBlobUrl } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { SceneCanvas, clampBattleMapZoom } from "./scene-canvas.js";
import type { usePlayerPreview } from "./player-preview.js";
import "./player-preview.css";

const noop = () => undefined;
const noMutation = async () => undefined;
const annotationLayers = { measurement: true, effects: true, drawings: true, notes: true };

export function PlayerPreviewPanel({ preview }: { preview: ReturnType<typeof usePlayerPreview> }) {
  const dialogRef = useModalAccessibility<HTMLDivElement>(preview.close);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<"table" | "chat" | "handouts">("table");
  const data = preview.state?.data;
  const snapshot = data?.snapshot;
  const scene = snapshot?.scenes.find((candidate) => candidate.id === snapshot.selectedSceneId);
  const sceneTokens = snapshot?.tokens.filter((token) => token.sceneId === scene?.id) ?? [];
  const combat = snapshot?.combats.find((candidate) => candidate.active);
  const turnTokens = (id?: string) => combat?.combatants.filter((combatant) => combatant.id === id).flatMap((combatant) => combatant.tokenId ? [combatant.tokenId] : []) ?? [];
  const zoomBy = (delta: number) => setZoom((value) => clampBattleMapZoom(value + delta));
  return <div className="modal-backdrop player-preview-backdrop">
    <div className="player-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="player-preview-title" ref={dialogRef} tabIndex={-1}>
      <header className="player-preview-header">
        <div><h2 id="player-preview-title"><Eye size={19} aria-hidden="true" /> Player view</h2><p>Read-only view of {preview.playerName}'s table. Your GM workspace is preserved.</p></div>
        <button className="ghost-button" type="button" onClick={preview.close}><X size={16} aria-hidden="true" /> Exit player view</button>
      </header>
      <div className="player-preview-controls">
        <label>View as <select aria-label="Preview player" value={preview.userId} onChange={(event) => preview.select(event.target.value)}>{preview.players.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName}</option>)}</select></label>
        <nav aria-label="Player preview sections">{(["table", "chat", "handouts"] as const).map((value) => <button className={`ghost-button ${tab === value ? "active" : ""}`} aria-pressed={tab === value} key={value} type="button" onClick={() => setTab(value)}>{value === "table" ? "Table" : value === "chat" ? "Chat" : "Handouts"}</button>)}</nav>
        <button className="icon-button" type="button" aria-label="Refresh player preview" onClick={preview.refresh}><RefreshCw size={16} /></button>
      </div>
      {!snapshot && <div className="player-preview-notice" role={preview.state?.error ? "alert" : "status"}>{preview.state?.error ? <><p>Player view is unavailable. {preview.state.error}</p><button className="ghost-button" onClick={preview.refresh}>Try again</button></> : "Loading the player's current view…"}</div>}
      {snapshot && tab === "table" && scene && <div className="player-preview-table" data-player-id={data.player.id}>
        <div className="player-preview-scene-heading"><strong>{scene.name}</strong><span>{sceneTokens.length} visible {sceneTokens.length === 1 ? "token" : "tokens"}</span><button className="icon-button" aria-label="Zoom out player preview" onClick={() => zoomBy(-0.1)}><ZoomOut size={16} /></button><button className="ghost-button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button className="icon-button" aria-label="Zoom in player preview" onClick={() => zoomBy(0.1)}><ZoomIn size={16} /></button></div>
        <div className="player-preview-map"><SceneCanvas readOnly scene={scene} zoom={zoom} backgroundAsset={snapshot.assets.find((asset) => asset.id === scene.backgroundAssetId)} assets={snapshot.assets} tokens={snapshot.tokens} actors={snapshot.actors} boardCurrentUserId={data.player.id} canSeeAllVitals={false} currentTurnTokenIds={turnTokens(combat?.turnPresentation?.currentCombatantId)} nextTurnTokenIds={turnTokens(combat?.turnPresentation?.nextCombatantId)} vision={snapshot.vision} selectedTokenId="" selectedTokenIds={[]} activeTokenLayer="player" fogBrushMode={null} annotationTool={null} templateShape="circle" visibleAnnotationLayers={annotationLayers} canDropToken={false} canMoveToken={false} canUpdateAnnotations={false} canResizeToken={false} canUpdateTokenLayer={false} onSelect={noop} onInspectToken={noop} onSelectMany={noop} onSelectBackgroundAsset={noop} onClearSelection={noop} onMoved={noMutation} onTokenMovePersist={noMutation} onTokenResizePersist={noMutation} onTokenMoveCommit={noop} onTokenResizeCommit={noop} onTokenLayerCycle={noMutation} onTokenDrop={noMutation} onFogStroke={noMutation} onAnnotationCreate={noMutation} onAnnotationMove={noMutation} onTogglePortal={noMutation} selectedOverlay={null} onSelectOverlay={noop} onZoomBy={zoomBy} /></div>
      </div>}
      {snapshot && tab === "chat" && <section className="player-preview-content" aria-label="Preview chat"><p>Private player messages remain private.</p>{snapshot.chat.length ? snapshot.chat.map((message) => <article key={message.id}><small>{preview.players.find((member) => member.user.id === message.userId)?.user.displayName ?? message.userId}</small><p>{message.body}</p></article>) : <p>No messages available in this preview.</p>}</section>}
      {snapshot && tab === "handouts" && <section className="player-preview-content" aria-label="Preview handouts">{snapshot.handouts.length ? snapshot.handouts.map((handout) => <article key={handout.id}><h3>{handout.title}</h3>{handout.assetIds.map((id) => snapshot.assets.find((asset) => asset.id === id)).filter((asset) => asset?.mimeType.startsWith("image/")).map((asset) => <img key={asset!.id} src={assetBlobUrl(asset!)} alt="" />)}<p>{handout.body}</p></article>) : <p>No handouts have been shared with this player.</p>}</section>}
      <footer className="player-preview-footer"><span>Player visibility, ownership, and vitals are applied by the server.</span><span>Updates automatically · No actions can be taken as this player.</span></footer>
    </div>
  </div>;
}
