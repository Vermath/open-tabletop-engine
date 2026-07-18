import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { realtimeConnectionIdentity, realtimeUiLabel, startRealtimeConnection } from "./realtime-connection.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

interface RealtimeSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
}

class FakeRealtimeSocket implements RealtimeSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.onclose?.();
  });
}

describe("realtime connection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes presence immediately and keeps the active scene current", async () => {
    vi.useFakeTimers();
    const sockets: FakeRealtimeSocket[] = [];
    let activeSceneId = "scene-one";
    const stop = startRealtimeConnection({
      apiBase: "",
      origin: "http://table.example.test",
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      heartbeatIntervalMs: 1_000,
      activeSceneId: () => activeSceneId,
      socketFactory: () => {
        const socket = new FakeRealtimeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage: vi.fn(),
    });

    sockets[0]!.onopen?.();
    expect(sockets[0]!.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "presence.heartbeat", sceneId: "scene-one" }));

    activeSceneId = "scene-two";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets[0]!.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "presence.heartbeat", sceneId: "scene-two" }));

    stop();
    const countAfterStop = sockets[0]!.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sockets[0]!.send).toHaveBeenCalledTimes(countAfterStop);
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

  it("identifies every socket opened after the first attempt as a reconnect", async () => {
    vi.useFakeTimers();
    const sockets: FakeRealtimeSocket[] = [];
    const opens: boolean[] = [];
    const stop = startRealtimeConnection({
      apiBase: "",
      origin: "http://table.example.test",
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      socketFactory: () => {
        const socket = new FakeRealtimeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage: vi.fn(),
      onOpen: ({ reconnected }) => opens.push(reconnected)
    });

    sockets[0]!.onopen?.();
    sockets[0]!.onerror?.();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.onopen?.();

    expect(opens).toEqual([false, true]);
    stop();
  });

  it("ignores a queued message from a socket after that socket errors", () => {
    vi.useFakeTimers();
    const sockets: FakeRealtimeSocket[] = [];
    const onMessage = vi.fn();
    const stop = startRealtimeConnection({
      apiBase: "",
      origin: "http://table.example.test",
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      socketFactory: () => {
        const socket = new FakeRealtimeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage
    });

    sockets[0]!.onopen?.();
    sockets[0]!.onerror?.();
    sockets[0]!.onmessage?.({ data: "late-from-errored-socket" });

    expect(onMessage).not.toHaveBeenCalled();
    stop();
  });

  it("delivers current-socket messages while ignoring a replaced socket", async () => {
    vi.useFakeTimers();
    const sockets: FakeRealtimeSocket[] = [];
    const onMessage = vi.fn();
    const stop = startRealtimeConnection({
      apiBase: "",
      origin: "http://table.example.test",
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      socketFactory: () => {
        const socket = new FakeRealtimeSocket();
        sockets.push(socket);
        return socket;
      },
      onMessage
    });

    sockets[0]!.onerror?.();
    await vi.advanceTimersByTimeAsync(1_000);
    sockets[1]!.onopen?.();
    sockets[0]!.onmessage?.({ data: "stale" });
    sockets[1]!.onmessage?.({ data: "current" });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith("current");
    stop();
  });

  it("keeps realtime identity scoped to the campaign instead of scene selection", () => {
    const firstScene = realtimeConnectionIdentity({
      blankCanvasDemoOpen: false,
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      userId: "usr_demo_gm",
      sessionEpoch: 1,
      sceneId: "scn_vault"
    });
    const secondScene = realtimeConnectionIdentity({
      blankCanvasDemoOpen: false,
      campaignId: "camp_demo",
      sessionToken: "ots_test",
      userId: "usr_demo_gm",
      sessionEpoch: 1,
      sceneId: "scn_cavern"
    });

    expect(secondScene).toBe(firstScene);
    expect(realtimeConnectionIdentity({ blankCanvasDemoOpen: false, campaignId: "camp_other", sessionToken: "ots_test", userId: "usr_demo_gm", sessionEpoch: 1, sceneId: "scn_cavern" })).not.toBe(firstScene);
    expect(realtimeConnectionIdentity({ blankCanvasDemoOpen: false, campaignId: "camp_demo", sessionToken: "ots_test", userId: "usr_other", sessionEpoch: 1 })).not.toBe(firstScene);
    expect(realtimeConnectionIdentity({ blankCanvasDemoOpen: false, campaignId: "camp_demo", sessionToken: "ots_test", userId: "usr_demo_gm", sessionEpoch: 2 })).not.toBe(firstScene);
    expect(realtimeConnectionIdentity({ blankCanvasDemoOpen: true, campaignId: "camp_demo", sessionToken: "ots_test", userId: "usr_demo_gm", sessionEpoch: 1, sceneId: "scn_vault" })).toBeNull();
  });

  it("never presents a reconnecting socket as connected", () => {
    expect(realtimeUiLabel("idle")).toBe("Ready");
    expect(realtimeUiLabel("connecting")).toBe("Connecting");
    expect(realtimeUiLabel("connected")).toBe("Connected");
    expect(realtimeUiLabel("reconnecting")).toBe("Reconnecting");
    expect(realtimeUiLabel("syncing")).toBe("Syncing");
    expect(appSource).toContain('onUnavailable: () => {\n        setRealtimeUiState("reconnecting");');
    expect(appSource).toContain('setRealtimeUiState("syncing")');
    expect(appSource).toContain("await realtimeHandlers.onOpen(true)");
    expect(appSource).toContain('inert={realtimeUiState === "syncing" ? true : undefined}');
    expect(appSource).toContain('data-connection-state={realtimeUiState} role="status" aria-live="polite"');
    expect(appSource).not.toContain('status.toLowerCase().includes("realtime")');
  });
});
