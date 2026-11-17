import { useEffect, useRef, useState } from "react";
import type { Campaign, Combat, Handout } from "@open-tabletop/core";
import { apiGet, getSessionTransportEpoch, type Snapshot } from "./api.js";

export interface PlayerPreviewSnapshot extends Pick<Snapshot, "scenes" | "tokens" | "actors" | "assets" | "vision" | "chat"> {
  campaign: Pick<Campaign, "id" | "name">;
  selectedSceneId?: string;
  generatedAt: string;
  handouts: Handout[];
  combats: Array<Pick<Combat, "id" | "active" | "turnPresentation"> & { combatants: Array<Pick<Combat["combatants"][number], "id" | "tokenId">> }>;
}
export interface PlayerPreviewResponse {
  readOnly: true;
  player: { id: string; displayName: string };
  snapshot: PlayerPreviewSnapshot;
}
export interface PlayerPreviewContext { campaignId: string; sceneId: string; userId: string; viewerId: string; sessionEpoch: number }
export interface PlayerPreviewState { key: string; loading: boolean; data?: PlayerPreviewResponse; error?: string }
export function playerPreviewKey(context: PlayerPreviewContext): string { return JSON.stringify(context); }

/** Keep a validated board during same-context refreshes; identity changes and failures clear it. */
export function createPlayerPreviewLoader(publish: (state: PlayerPreviewState) => void) {
  let generation = 0;
  let current: PlayerPreviewState | undefined;
  function update(state: PlayerPreviewState) { current = state; publish(state); }
  return {
    invalidate() { generation += 1; current = undefined; },
    async load(context: PlayerPreviewContext, fetchPreview: () => Promise<PlayerPreviewResponse>) {
      const ticket = ++generation;
      const key = playerPreviewKey(context);
      update({ key, loading: true, ...(current?.key === key && current.data ? { data: current.data } : {}) });
      try {
        const data = await fetchPreview();
        if (ticket !== generation) return;
        if (data.readOnly !== true || data.player.id !== context.userId || data.snapshot.campaign.id !== context.campaignId || data.snapshot.selectedSceneId !== context.sceneId || !data.snapshot.scenes.some((scene) => scene.id === context.sceneId)) throw new Error("Player preview no longer matches this table. Refresh to try again.");
        update({ key, loading: false, data });
      } catch (error) {
        if (ticket === generation) update({ key, loading: false, error: error instanceof Error ? error.message : "Player preview is unavailable" });
      }
    },
  };
}

/** Coalesce table revisions during a request, then poll five seconds after it settles. */
export function createPlayerPreviewRefresh(load: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let disposed = false;
  function refresh() {
    if (disposed) return;
    if (running) { queued = true; return; }
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    running = true;
    void load().finally(() => {
      running = false;
      if (disposed) return;
      if (queued) { queued = false; refresh(); }
      else timer = setTimeout(refresh, 5000);
    });
  }
  return { refresh, dispose() { disposed = true; queued = false; if (timer !== undefined) clearTimeout(timer); } };
}

export function usePlayerPreview(input: { campaignId: string; sceneId?: string; viewerId: string; canPreview: boolean; members: Snapshot["members"]; revision: unknown }) {
  const [selection, setSelection] = useState<{ campaignId: string; sceneId: string; viewerId: string; userId: string }>();
  const [state, setState] = useState<PlayerPreviewState>();
  const refresher = useRef<ReturnType<typeof createPlayerPreviewRefresh>>(undefined);
  const lastRevision = useRef(input.revision);
  const loader = useRef<ReturnType<typeof createPlayerPreviewLoader>>(undefined);
  if (!loader.current) loader.current = createPlayerPreviewLoader(setState);
  const players = input.members.filter((member) => member.role === "player" && member.active !== false && member.user.id !== input.viewerId);
  const eligible = input.canPreview && input.sceneId && selection?.campaignId === input.campaignId && selection?.sceneId === input.sceneId && selection?.viewerId === input.viewerId && players.some((member) => member.user.id === selection.userId);
  const context = eligible && selection ? { ...selection, sessionEpoch: getSessionTransportEpoch() } : undefined;
  const key = context ? playerPreviewKey(context) : "";
  useEffect(() => {
    if (!context) { loader.current!.invalidate(); setState(undefined); return; }
    const refresh = createPlayerPreviewRefresh(() => loader.current!.load(context, () => apiGet<PlayerPreviewResponse>(`/api/v1/scenes/${encodeURIComponent(context.sceneId)}/player-preview?userId=${encodeURIComponent(context.userId)}`)));
    refresher.current = refresh;
    lastRevision.current = input.revision;
    refresh.refresh();
    return () => { refresh.dispose(); loader.current!.invalidate(); };
  }, [key]);
  useEffect(() => {
    if (lastRevision.current === input.revision) return;
    lastRevision.current = input.revision;
    refresher.current?.refresh();
  }, [input.revision]);
  function close() { refresher.current?.dispose(); loader.current!.invalidate(); setSelection(undefined); setState(undefined); }
  function select(userId: string) {
    if (context?.userId === userId) { refresher.current?.refresh(); return; }
    refresher.current?.dispose();
    loader.current!.invalidate();
    setState(undefined);
    if (!input.canPreview || !input.sceneId || !players.some((member) => member.user.id === userId)) { setSelection(undefined); return; }
    setSelection({ campaignId: input.campaignId, sceneId: input.sceneId, viewerId: input.viewerId, userId });
  }
  return {
    open: Boolean(context), players, userId: context?.userId ?? "",
    playerName: players.find((member) => member.user.id === context?.userId)?.user.displayName,
    state: state?.key === key ? state : undefined,
    show: () => { const player = players[0]; if (player) select(player.user.id); }, select, close,
    refresh: () => refresher.current?.refresh(),
  };
}

