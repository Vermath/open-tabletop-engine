import { afterEach, describe, expect, it, vi } from "vitest";

import { realtimeConnectionIdentity, startRealtimeConnection } from "./realtime-connection.js";

interface RealtimeSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}

class FakeRealtimeSocket implements RealtimeSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly close = vi.fn(() => {
    this.onclose?.();
  });
}

describe("realtime connection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnects after socket errors using exponential backoff", async () => {
    vi.useFakeTimers();
    const sockets: FakeRealtimeSocket[] = [];
    const reconnectDelays: number[] = [];
    const socketFactory = vi.fn(() => {
      const socket = new FakeRealtimeSocket();
      sockets.push(socket);
      return socket;
    });

    const stop = startRealtimeConnection({
      apiBase: "",
      origin: "http://table.example.test",
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      socketFactory,
      onMessage: vi.fn(),
      onReconnectScheduled: (delayMs) => reconnectDelays.push(delayMs)
    });

    expect(socketFactory).toHaveBeenCalledTimes(1);
    sockets[0]!.onerror?.();

    expect(reconnectDelays).toEqual([1_000]);
    expect(socketFactory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(socketFactory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(socketFactory).toHaveBeenCalledTimes(2);

    sockets[1]!.onerror?.();
    expect(reconnectDelays).toEqual([1_000, 2_000]);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(socketFactory).toHaveBeenCalledTimes(3);

    stop();
  });

  it("resets reconnect backoff after a successful open", async () => {
    vi.useFakeTimers();
    const sockets: FakeRealtimeSocket[] = [];
    const reconnectDelays: number[] = [];
    const socketFactory = vi.fn(() => {
      const socket = new FakeRealtimeSocket();
      sockets.push(socket);
      return socket;
    });

    const stop = startRealtimeConnection({
      apiBase: "",
      origin: "http://table.example.test",
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      socketFactory,
      onMessage: vi.fn(),
      onReconnectScheduled: (delayMs) => reconnectDelays.push(delayMs)
    });

    sockets[0]!.onerror?.();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.onopen?.();
    sockets[1]!.onerror?.();

    expect(reconnectDelays).toEqual([1_000, 1_000]);

    stop();
  });

  it("keeps realtime identity scoped to the campaign instead of scene selection", () => {
    const firstScene = realtimeConnectionIdentity({
      blankCanvasDemoOpen: false,
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      sceneId: "scn_vault"
    });
    const secondScene = realtimeConnectionIdentity({
      blankCanvasDemoOpen: false,
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      sceneId: "scn_cavern"
    });

    expect(secondScene).toBe(firstScene);
    expect(realtimeConnectionIdentity({ blankCanvasDemoOpen: false, campaignId: "camp_other", sessionToken: "ots_test", sceneId: "scn_cavern" })).not.toBe(firstScene);
    expect(realtimeConnectionIdentity({ blankCanvasDemoOpen: true, campaignId: "camp_demo", sessionToken: "ots_test", sceneId: "scn_vault" })).toBeNull();
  });
});
