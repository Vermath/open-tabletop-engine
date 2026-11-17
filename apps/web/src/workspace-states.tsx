import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { assetBlobUrl, type Snapshot } from "./api.js";
import "./workspace-states.css";

export function EmptyState({ icon, text, action }: {
  icon: ReactNode;
  text: string;
  action?: { label: string; disabled?: boolean; run(): void };
}) {
  return <div className="table-empty-state">
    <span className="table-empty-icon" aria-hidden="true">{icon}</span>
    <p>{text}</p>
    {action && <button className="primary-button small" type="button" disabled={action.disabled} onClick={action.run}>{action.label}</button>}
  </div>;
}

export function WorkspaceLoading({ status }: { status: string }) {
  const offline = status.startsWith("API offline");
  const failed = offline || status.startsWith("Campaign load failed");
  if (failed) return (
    <main className="auth-shell">
      <section className="reset-panel auth-panel" aria-labelledby="snapshot-loading-title">
        <div className="reset-mark"><RefreshCw size={22} /></div>
        <div><div className="eyebrow">Connection</div><h1 id="snapshot-loading-title">{offline ? "API connection required" : "Campaign load failed"}</h1></div>
        <div className="status reset-status connection-status" role="status" aria-live="polite">{status}</div>
        <button className="ghost-button wide" type="button" onClick={() => window.location.reload()}><RefreshCw size={16} /> Retry campaign load</button>
      </section>
    </main>
  );

  return (
    <main className="shell workspace-loading" aria-busy="true" aria-labelledby="snapshot-loading-title">
      <aside className="rail" aria-hidden="true"><div className="brand">OpenTabletop</div><span /><span /><span /></aside>
      <section className="workspace">
        <header className="topbar"><h1 id="snapshot-loading-title">Loading campaign</h1></header>
        <p className="workspace-loading-status" role="status">{status}</p>
        <div className="workspace-loading-table" aria-hidden="true"><div className="workspace-loading-map" /><div className="workspace-loading-inspector"><span /><span /><span /></div></div>
      </section>
    </main>
  );
}

export function preloadWorkspaceScene(snapshot: Pick<Snapshot, "scenes" | "assets">, sceneId: string): Promise<void> {
  const scene = snapshot.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error("This scene is no longer available.");
  const background = snapshot.assets.find((asset) => asset.id === scene.backgroundAssetId);
  return preloadSceneImage(background ? assetBlobUrl(background) : undefined);
}

async function preloadSceneImage(url: string | undefined): Promise<void> {
  if (!url) return;
  const image = new Image();
  image.src = url;
  let timeout: number | undefined;
  try {
    await Promise.race([image.decode().catch(() => undefined), new Promise<void>((resolve) => { timeout = window.setTimeout(resolve, 2500); })]);
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Retry when a realtime update supersedes the snapshot while navigation is pending. */
export async function retrySceneSwitch(canSelect: () => boolean, load: () => Promise<unknown>): Promise<void> {
  while (canSelect()) await load();
}

export function canCommitSceneSwitch(current: boolean, draftDirty: boolean): boolean {
  if (!current) return false;
  if (draftDirty) throw new Error("Save or discard scene changes before switching scenes");
  return true;
}
