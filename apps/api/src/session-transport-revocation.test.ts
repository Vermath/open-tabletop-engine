import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { OperationsObservability } from "./operations-observability.js";
import { MemoryStateStore } from "./store.js";

interface TestSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

describe("session transport revocation", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("closes an authenticated realtime socket on logout and rejects reconnect with that token", async () => {
    const WebSocketConstructor = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string[]) => TestSocket }).WebSocket;
    if (!WebSocketConstructor) throw new Error("WebSocket is unavailable in this Node runtime");
    const store = new MemoryStateStore();
    const operationsObservability = new OperationsObservability();
    const app = await buildApp({ store, operationsObservability });
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { userId: "usr_demo_gm" } });
    expect(login.statusCode).toBe(200);
    const token = login.json().token as string;
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as AddressInfo;
    const realtimeUrl = `ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo`;
    const protocols = ["otte.v1", `otte.auth.${token}`];

    const socket = new WebSocketConstructor(realtimeUrl, protocols);
    await opened(socket);
    socket.send(JSON.stringify({ type: "presence.heartbeat" }));
    await until(() => operationsObservability.snapshot().realtime.heartbeatGapMs.count === 1, "Timed out waiting for realtime heartbeat metric");
    const socketClosed = closed(socket, "Timed out waiting for logout to close the realtime socket");
    const logout = await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { authorization: `Bearer ${token}` } });
    expect(logout.statusCode).toBe(200);
    await socketClosed;
    expect(operationsObservability.snapshot().realtime).toMatchObject({ connectionsOpened: 1, revokedConnections: 1, activeConnections: 0, heartbeatGapMs: { count: 1 } });

    const reconnect = new WebSocketConstructor(realtimeUrl, protocols);
    await expect(message(reconnect)).resolves.toEqual({ error: "unauthorized" });
    reconnect.close();
  });
});

function opened(socket: TestSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening realtime socket")), 1_000);
    socket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Realtime socket failed to open: ${String(event)}`));
    };
  });
}

async function until(predicate: () => boolean, timeoutMessage: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(timeoutMessage);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function closed(socket: TestSocket, timeoutMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), 1_000);
    socket.onclose = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function message(socket: TestSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for rejected realtime reconnect")), 1_000);
    socket.onmessage = (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(event.data)) as unknown);
    };
    socket.onerror = (event) => {
      clearTimeout(timer);
      reject(new Error(`Rejected realtime reconnect failed before its error envelope: ${String(event)}`));
    };
  });
}
