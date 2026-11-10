import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerPreviewPanel } from "./player-preview-panel.js";
import { createPlayerPreviewLoader, createPlayerPreviewRefresh, type PlayerPreviewContext, type PlayerPreviewResponse, type PlayerPreviewState, type usePlayerPreview } from "./player-preview.js";

const context: PlayerPreviewContext = { campaignId: "campaign", sceneId: "scene", userId: "player", viewerId: "gm", sessionEpoch: 1 };
const timestamps = { createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" };
function response(userId = "player"): PlayerPreviewResponse {
  return { readOnly: true, player: { id: userId, displayName: "Ada" }, snapshot: {
    campaign: { id: "campaign", name: "The Campaign" }, selectedSceneId: "scene", generatedAt: "2026-09-05T00:00:00.000Z",
    scenes: [{ ...timestamps, active: true, sortOrder: 0, id: "scene", campaignId: "campaign", name: "The Keep", width: 800, height: 600, gridSize: 50, gridType: "square", walls: [], lights: [], annotations: [], metadata: {}, fog: [] }],
    tokens: [{ ...timestamps, hidden: false, locked: false, visionEnabled: true, visionRadius: 120, id: "hero", sceneId: "scene", actorId: "hero-actor", name: "Player Hero", x: 100, y: 100, width: 50, height: 50, rotation: 0, disposition: "friendly", ownerUserIds: [userId], metadata: {} }],
    actors: [{ ...timestamps, systemId: "generic-fantasy", type: "character", ownerUserId: userId, id: "hero-actor", campaignId: "campaign", name: "Player Hero", data: { hp: { current: 10, max: 20 } }, permissions: {} }],
    assets: [], handouts: [], chat: [], combats: [],
  } };
}
function responseFor(target: PlayerPreviewContext) {
  const data = response(target.userId);
  data.snapshot.campaign.id = target.campaignId;
  data.snapshot.selectedSceneId = target.sceneId;
  data.snapshot.scenes[0]!.id = target.sceneId;
  data.snapshot.scenes[0]!.campaignId = target.campaignId;
  return data;
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

afterEach(() => vi.useRealTimers());

describe("authoritative player preview lifecycle", () => {
  it.each([
    { campaignId: "next-campaign" }, { sceneId: "next-scene" }, { userId: "next-player" }, { viewerId: "next-gm" }, { sessionEpoch: 2 },
  ])("clears the old board and drops stale responses when context changes: %j", async (changed) => {
    const states: PlayerPreviewState[] = [];
    const loader = createPlayerPreviewLoader((state) => states.push(state));
    await loader.load(context, async () => response());
    const first = deferred<PlayerPreviewResponse>();
    const second = deferred<PlayerPreviewResponse>();
    const older = loader.load(context, () => first.promise);
    const nextContext = { ...context, ...changed };
    const newer = loader.load(nextContext, () => second.promise);
    expect(states.at(-1)?.data).toBeUndefined();
    first.resolve(response()); await older;
    expect(states.at(-1)).toMatchObject({ loading: true });
    expect(states.at(-1)?.data).toBeUndefined();
    const nextResponse = responseFor(nextContext);
    second.resolve(nextResponse); await newer;
    expect(states.at(-1)?.data).toEqual(nextResponse);
  });

  it("drops pending responses after exit or eligibility revocation", async () => {
    const states: PlayerPreviewState[] = [];
    const loader = createPlayerPreviewLoader((state) => states.push(state));
    const pending = deferred<PlayerPreviewResponse>();
    const request = loader.load(context, () => pending.promise);
    loader.invalidate();
    const publicationCount = states.length;
    pending.resolve(response()); await request;
    expect(states).toHaveLength(publicationCount);
    const reopen = deferred<PlayerPreviewResponse>();
    const next = loader.load(context, () => reopen.promise);
    expect(states.at(-1)?.data).toBeUndefined();
    reopen.resolve(response()); await next;
    expect(states.at(-1)?.data).toBeDefined();
  });

  it("preserves the board while refreshing and clears it on request errors or mismatched server identity", async () => {
    const states: PlayerPreviewState[] = [];
    const loader = createPlayerPreviewLoader((state) => states.push(state));
    const initial = response();
    await loader.load(context, async () => initial);
    const pending = deferred<PlayerPreviewResponse>();
    const request = loader.load(context, () => pending.promise);
    expect(states.at(-1)).toMatchObject({ loading: true, data: initial });
    pending.reject(new Error("Permission revoked")); await request;
    expect(states.at(-1)?.error).toBe("Permission revoked");
    expect(states.at(-1)?.data).toBeUndefined();
    await loader.load(context, async () => initial);
    await loader.load(context, async () => response("other-player"));
    expect(states.at(-1)?.error).toContain("no longer matches");
    expect(states.at(-1)?.data).toBeUndefined();
  });

  it("finishes requests slower than the polling period and coalesces revisions without dropping their responses", async () => {
    vi.useFakeTimers();
    const states: PlayerPreviewState[] = [];
    const loader = createPlayerPreviewLoader((state) => states.push(state));
    const requests = [deferred<PlayerPreviewResponse>(), deferred<PlayerPreviewResponse>(), deferred<PlayerPreviewResponse>()];
    let requestIndex = 0;
    const fetchPreview = vi.fn(() => requests[requestIndex++]!.promise);
    const refresher = createPlayerPreviewRefresh(() => loader.load(context, fetchPreview));
    refresher.refresh();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchPreview).toHaveBeenCalledTimes(1);
    refresher.refresh(); refresher.refresh(); refresher.refresh();
    expect(fetchPreview).toHaveBeenCalledTimes(1);
    const initial = response();
    requests[0]!.resolve(initial);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchPreview).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toMatchObject({ loading: true, data: initial });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchPreview).toHaveBeenCalledTimes(2);
    const updated = response();
    updated.snapshot.scenes[0]!.name = "The Open Keep";
    requests[1]!.resolve(updated);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toMatchObject({ loading: false, data: updated });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchPreview).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPreview).toHaveBeenCalledTimes(3);
    expect(states.at(-1)).toMatchObject({ loading: true, data: updated });
    refresher.refresh();
    refresher.dispose(); loader.invalidate();
    const publicationCount = states.length;
    requests[2]!.resolve(response());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchPreview).toHaveBeenCalledTimes(3);
    expect(states).toHaveLength(publicationCount);
  });

  it("renders an identified, read-only player board with owned vitals and a reachable exit", () => {
    const preview = {
      open: true, userId: "player", playerName: "Ada",
      players: [{ id: "member", campaignId: "campaign", userId: "player", role: "player", user: { id: "player", displayName: "Ada" }, active: true, permissions: [], createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }],
      state: { key: "key", loading: false, data: response() }, close() {}, refresh() {}, select() {}, show() {},
    } satisfies ReturnType<typeof usePlayerPreview>;
    const html = renderToStaticMarkup(<PlayerPreviewPanel preview={preview} />);
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Read-only view of Ada");
    expect(html).toContain("Exit player view");
    expect(html).toContain("The Keep read-only player map");
    expect(html).toContain("Player Hero");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain("Token movement requires");
    expect(html).not.toContain("Arrow keys move");
    expect(html).not.toContain('aria-label="Annotation drag handles"');
    expect(html).not.toContain('aria-label="Wall and light handles"');
  });
});

