import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeHandlers, realtimeRefreshDebounceMs } from "./realtime-refresh";

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
    const handlers = createRealtimeHandlers({
      refresh,
      handleBoardCaptureEvent,
      setStatus: vi.fn(),
      onRefreshError: vi.fn()
    });

    handlers.onMessage(JSON.stringify({ type: "agent.boardCaptureRequested", payload: { requestId: "capture_1" } }));

    await vi.advanceTimersByTimeAsync(realtimeRefreshDebounceMs);
    expect(handleBoardCaptureEvent).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    handlers.dispose();
  });

  it("preserves realtime status transitions", () => {
    const setStatus = vi.fn();
    const handlers = createRealtimeHandlers({
      refresh: vi.fn(async () => undefined),
      handleBoardCaptureEvent: vi.fn(() => false),
      setStatus,
      onRefreshError: vi.fn()
    });

    handlers.onOpen();
    const updateStatus = setStatus.mock.calls[0]?.[0] as (current: string) => string;
    expect(updateStatus("Loading campaign")).toBe("Realtime connected");
    expect(updateStatus("API offline at http://127.0.0.1:4000")).toBe("Realtime connected");
    expect(updateStatus("Synced")).toBe("Synced");

    handlers.onError();
    expect(setStatus).toHaveBeenLastCalledWith("Realtime unavailable");

    handlers.dispose();
  });
});
