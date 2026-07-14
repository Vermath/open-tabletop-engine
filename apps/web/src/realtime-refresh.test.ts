import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardCaptureRequestDecision, createRealtimeHandlers, realtimeRefreshDebounceMs, workspaceSelectionMatches } from "./realtime-refresh";

describe("workspaceSelectionMatches", () => {
  it("rejects results from a previously selected campaign or user", () => {
    const current = { campaignId: "campaign_b", userId: "user_b" };

    expect(workspaceSelectionMatches({ campaignId: "campaign_b", userId: "user_b" }, current)).toBe(true);
    expect(workspaceSelectionMatches({ campaignId: "campaign_a", userId: "user_b" }, current)).toBe(false);
    expect(workspaceSelectionMatches({ campaignId: "campaign_b", userId: "user_a" }, current)).toBe(false);
  });
});

describe("createRealtimeHandlers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces realtime message bursts into one debounced refresh", async () => {
    const refresh = vi.fn(async () => undefined);
    const handleBoardCaptureEvent = vi.fn(() => false);
    const setStatus = vi.fn();
    const handlers = createRealtimeHandlers({
      refresh,
      handleBoardCaptureEvent,
      setStatus,
      onRefreshError: () => setStatus("Realtime refresh failed")
    });

    handlers.onMessage("event-1");
    handlers.onMessage("event-2");
    handlers.onMessage("event-3");

    expect(handleBoardCaptureEvent).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(realtimeRefreshDebounceMs - 1);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    handlers.dispose();
  });

  it("does not schedule a refresh when board capture handles the realtime event", async () => {
    const refresh = vi.fn(async () => undefined);
    const handleBoardCaptureEvent = vi.fn(() => true);
    const applyRealtimeEvent = vi.fn(() => "applied" as const);
    const handlers = createRealtimeHandlers({
      refresh,
      handleBoardCaptureEvent,
      applyRealtimeEvent,
      setStatus: vi.fn(),
      onRefreshError: vi.fn()
    });

    handlers.onMessage(JSON.stringify({ type: "agent.boardCaptureRequested", payload: { requestId: "capture_1" } }));

    await vi.advanceTimersByTimeAsync(realtimeRefreshDebounceMs);
    expect(handleBoardCaptureEvent).toHaveBeenCalledTimes(1);
    expect(applyRealtimeEvent).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    handlers.dispose();
  });

  it("does not reload a snapshot after an event was applied authoritatively", async () => {
    const refresh = vi.fn(async () => undefined);
    const handleBoardCaptureEvent = vi.fn(() => false);
    const applyRealtimeEvent = vi.fn(() => "applied" as const);
    const handlers = createRealtimeHandlers({
      refresh,
      handleBoardCaptureEvent,
      applyRealtimeEvent,
      setStatus: vi.fn(),
      onRefreshError: vi.fn()
    });

    handlers.onMessage("raw-event");

    expect(handleBoardCaptureEvent).toHaveBeenCalledWith("raw-event");
    expect(applyRealtimeEvent).toHaveBeenCalledWith("raw-event");
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(realtimeRefreshDebounceMs);
    expect(refresh).not.toHaveBeenCalled();

    handlers.dispose();
  });

  it("coalesces targeted reconciliation scopes and lets a snapshot supersede them", async () => {
    const refresh = vi.fn(async () => undefined);
    const reconcile = vi.fn(async () => undefined);
    const results = ["vision", "lore", "vision", "snapshot", "lore"] as const;
    const applyRealtimeEvent = vi.fn(() => results[applyRealtimeEvent.mock.calls.length - 1] ?? "ignored");
    const handlers = createRealtimeHandlers({
      refresh,
      reconcile,
      handleBoardCaptureEvent: vi.fn(() => false),
      applyRealtimeEvent,
      setStatus: vi.fn(),
      onRefreshError: vi.fn()
    });

    for (let index = 0; index < results.length; index += 1) handlers.onMessage({ index });
    await vi.advanceTimersByTimeAsync(realtimeRefreshDebounceMs);

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(["snapshot"]);
    expect(refresh).not.toHaveBeenCalled();

    handlers.dispose();
  });

  it("keeps the existing debounced refresh behavior when no realtime fast path is provided", async () => {
    const refresh = vi.fn(async () => undefined);
    const handlers = createRealtimeHandlers({
      refresh,
      handleBoardCaptureEvent: vi.fn(() => false),
      setStatus: vi.fn(),
      onRefreshError: vi.fn()
    });

    handlers.onMessage({ type: "actor.updated" });

    await vi.advanceTimersByTimeAsync(realtimeRefreshDebounceMs);
    expect(refresh).toHaveBeenCalledTimes(1);

    handlers.dispose();
  });

  it("preserves realtime status transitions", async () => {
    const setStatus = vi.fn();
    const handlers = createRealtimeHandlers({
      refresh: vi.fn(async () => undefined),
      handleBoardCaptureEvent: vi.fn(() => false),
      setStatus,
      onRefreshError: vi.fn()
    });

    await handlers.onOpen();
    const updateStatus = setStatus.mock.calls[0]?.[0] as (current: string) => string;
    expect(updateStatus("Loading campaign")).toBe("Realtime connected");
    expect(updateStatus("API offline at http://127.0.0.1:4000")).toBe("Realtime connected");
    expect(updateStatus("Synced")).toBe("Synced");

    handlers.onError();
    expect(setStatus).toHaveBeenLastCalledWith("Realtime unavailable");

    handlers.dispose();
  });

  it("authoritatively refreshes every successful reconnect before reporting ready", async () => {
    const refresh = vi.fn(async () => undefined);
    const handlers = createRealtimeHandlers({
      refresh,
      handleBoardCaptureEvent: vi.fn(() => false),
      setStatus: vi.fn(),
      onRefreshError: vi.fn()
    });

    await handlers.onOpen(true);
    await handlers.onOpen(true);

    expect(refresh).toHaveBeenCalledTimes(2);
    handlers.dispose();
  });
});

describe("boardCaptureRequestDecision", () => {
  it("ignores non-board-capture realtime messages", () => {
    expect(boardCaptureRequestDecision(JSON.stringify({ type: "actor.updated", payload: { requestId: "capture_1" } }), "scene_live")).toEqual({ handled: false });
    expect(boardCaptureRequestDecision("not-json", "scene_live")).toEqual({ handled: false });
  });

  it("accepts a live request for the mounted scene", () => {
    const decision = boardCaptureRequestDecision(
      JSON.stringify({
        type: "agent.boardCaptureRequested",
        payload: { requestId: "capture_1", sceneId: "scene_live", expiresAt: "2026-07-05T12:00:00.000Z" }
      }),
      "scene_live",
      Date.parse("2026-07-05T11:59:00.000Z")
    );

    expect(decision).toEqual({ handled: true, requestId: "capture_1", sceneId: "scene_live" });
  });

  it("rejects a request for a different scene", () => {
    const decision = boardCaptureRequestDecision(
      { type: "agent.boardCaptureRequested", payload: { requestId: "capture_1", sceneId: "scene_requested" } },
      "scene_live"
    );

    expect(decision).toEqual({
      handled: true,
      requestId: "capture_1",
      sceneId: "scene_live",
      error: "Requested board scene is not open in this web client."
    });
  });

  it("rejects expired board capture requests", () => {
    const decision = boardCaptureRequestDecision(
      JSON.stringify({
        type: "agent.boardCaptureRequested",
        payload: { requestId: "capture_1", sceneId: "scene_live", expiresAt: "2026-07-05T12:00:00.000Z" }
      }),
      "scene_live",
      Date.parse("2026-07-05T12:00:00.000Z")
    );

    expect(decision).toEqual({
      handled: true,
      requestId: "capture_1",
      sceneId: "scene_live",
      error: "Board capture request expired before this web client could process it."
    });
  });
});
