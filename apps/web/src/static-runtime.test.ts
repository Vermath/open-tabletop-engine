import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { startWebStaticRuntime } from "./static-runtime.js";

describe("web static runtime", () => {
  it("serves the built SPA and proxies API calls to the local API", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-"));
    const dist = join(root, "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    mkdirSync(join(dist, "assets", "dice-box", "sounds"), { recursive: true });
    writeFileSync(
      join(dist, "index.html"),
      "<main>OpenTabletop Desktop</main>",
    );
    writeFileSync(join(dist, "assets", "index-ABCDEFGH.js"), "export {};");
    writeFileSync(
      join(dist, "assets", "dice-box", "sounds", "roll.mp3"),
      "test-audio",
    );

    const api = await BunlessApiServer.fake({
      "/api/v1/health": Response.json({ ok: true }),
    });
    const web = await startWebStaticRuntime({
      host: "127.0.0.1",
      port: 0,
      root: dist,
      apiBaseUrl: api.url,
    });

    try {
      expect(await (await fetch(`${web.url}/`)).text()).toContain(
        "OpenTabletop Desktop",
      );
      expect(await (await fetch(`${web.url}/api/v1/health`)).json()).toEqual({
        ok: true,
      });
      const fingerprinted = await fetch(`${web.url}/assets/index-ABCDEFGH.js`);
      expect(fingerprinted.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
      const diceSupportAsset = await fetch(
        `${web.url}/assets/dice-box/sounds/roll.mp3`,
      );
      expect(diceSupportAsset.headers.get("cache-control")).toBe("no-cache");
      expect(diceSupportAsset.headers.get("content-type")).toBe("audio/mpeg");
    } finally {
      await web.close();
      await api.close();
    }
  });

  it("bounds shutdown and destroys upgraded API sockets", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-upgrade-"));
    const dist = join(root, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(
      join(dist, "index.html"),
      "<main>OpenTabletop Desktop</main>",
    );
    const api = await BunlessApiServer.upgrade();
    const web = await startWebStaticRuntime({
      host: "127.0.0.1",
      port: 0,
      root: dist,
      apiBaseUrl: api.url,
      closeTimeoutMs: 20,
    });
    const client = await openUpgrade(`${web.url}/api/v1/realtime`);

    try {
      const closed = new Promise<void>((resolve) =>
        client.once("close", () => resolve()),
      );
      await expect(web.close()).resolves.toBeUndefined();
      await expect(closed).resolves.toBeUndefined();
      expect(client.destroyed).toBe(true);
    } finally {
      client.destroy();
      await web.close();
      await api.close();
    }
  });

  it("destroys a hung ordinary API proxy socket during bounded shutdown", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-proxy-"));
    const dist = join(root, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(
      join(dist, "index.html"),
      "<main>OpenTabletop Desktop</main>",
    );
    const api = await BunlessApiServer.hanging();
    const web = await startWebStaticRuntime({
      host: "127.0.0.1",
      port: 0,
      root: dist,
      apiBaseUrl: api.url,
      closeTimeoutMs: 20,
    });
    const pendingRequest = fetch(`${web.url}/api/v1/hang`).catch(
      (error: unknown) => error,
    );

    try {
      await api.requested;
      await expect(web.close()).resolves.toBeUndefined();
      await expect(pendingRequest).resolves.toBeInstanceOf(Error);
      await expect(api.upstreamClosed).resolves.toBeUndefined();
    } finally {
      await web.close();
      await api.close();
    }
  });
});

class BunlessApiServer {
  static async fake(
    routes: Record<string, Response>,
  ): Promise<{ url: string; close(): Promise<void> }> {
    const { createServer } = await import("node:http");
    const server = createServer((request, response) => {
      const route = routes[request.url ?? ""];
      if (!route) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(
        route.status,
        Object.fromEntries(route.headers.entries()),
      );
      route.body
        ?.pipeTo(
          new WritableStream({
            write(chunk) {
              response.write(Buffer.from(chunk));
            },
            close() {
              response.end();
            },
          }),
        )
        .catch((error) => response.destroy(error));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Fake API server did not bind to a TCP port");
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    };
  }

  static async upgrade(): Promise<{ url: string; close(): Promise<void> }> {
    const { createServer } = await import("node:http");
    const sockets = new Set<Socket>();
    const server = createServer();
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("upgrade", (_request, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Fake upgrade API server did not bind to a TCP port");
    return {
      url: `http://127.0.0.1:${address.port}`,
      close: () =>
        new Promise<void>((resolve, reject) => {
          for (const socket of sockets) socket.destroy();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    };
  }

  static async hanging(): Promise<{
    url: string;
    requested: Promise<void>;
    upstreamClosed: Promise<void>;
    close(): Promise<void>;
  }> {
    const { createServer } = await import("node:http");
    const sockets = new Set<Socket>();
    let resolveRequested!: () => void;
    let resolveUpstreamClosed!: () => void;
    const requested = new Promise<void>((resolve) => {
      resolveRequested = resolve;
    });
    const upstreamClosed = new Promise<void>((resolve) => {
      resolveUpstreamClosed = resolve;
    });
    const server = createServer(() => resolveRequested());
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => {
        sockets.delete(socket);
        resolveUpstreamClosed();
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Fake hanging API server did not bind to a TCP port");
    return {
      url: `http://127.0.0.1:${address.port}`,
      requested,
      upstreamClosed,
      close: () =>
        new Promise<void>((resolve, reject) => {
          for (const socket of sockets) socket.destroy();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    };
  }
}

function openUpgrade(urlValue: string): Promise<Socket> {
  const url = new URL(urlValue);
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname);
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(
        `GET ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      );
    });
    socket.once("data", (data) => {
      if (!data.toString("utf8").startsWith("HTTP/1.1 101")) {
        reject(new Error(`Upgrade failed: ${data.toString("utf8")}`));
        return;
      }
      resolve(socket);
    });
  });
}
