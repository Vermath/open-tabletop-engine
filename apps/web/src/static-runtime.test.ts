import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { configuredAssetCdnOrigin, configuredCallEmbedOrigin, createWebContentSecurityPolicy, createWebPermissionsPolicy, createWebSecurityHeaders, startWebStaticRuntime } from "./static-runtime.js";

describe("web static runtime", () => {
  it("adds only the configured CDN origin to production fetch permissions", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-cdn-"));
    const dist = join(root, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<main>CDN map</main>");
    const web = await startWebStaticRuntime({
      host: "127.0.0.1",
      port: 0,
      root: dist,
      assetCdnBaseUrl: "https://assets.example.test/otte/maps",
    });

    try {
      const response = await fetch(web.url);
      const policy = response.headers.get("content-security-policy") ?? "";
      expect(policy).toContain("connect-src 'self' https://assets.example.test");
      expect(policy).not.toMatch(/connect-src[^;]*\bhttps:\s*(?:;|$)/);
      expect(policy).not.toContain("https://unconfigured.example.test");
    } finally {
      await web.close();
    }
  });

  it("normalizes the CDN base to an origin and rejects unsafe connect sources", () => {
    expect(configuredAssetCdnOrigin("https://assets.example.test:8443/otte?version=1")).toBe("https://assets.example.test:8443");
    expect(configuredAssetCdnOrigin("http://127.0.0.1:9000/assets")).toBe("http://127.0.0.1:9000");
    expect(() => configuredAssetCdnOrigin("http://assets.example.test/otte")).toThrow("must use HTTPS");
    expect(() => configuredAssetCdnOrigin("https://user:secret@assets.example.test/otte")).toThrow("credential-free");
    expect(() => configuredAssetCdnOrigin("https://*.example.test/otte")).toThrow("non-wildcard");
    expect(createWebContentSecurityPolicy()).toContain("connect-src 'self';");
  });

  it("allows no third-party frame and no camera or microphone unless a call provider is configured", () => {
    for (const unset of [undefined, "", "   "]) {
      expect(createWebContentSecurityPolicy(undefined, unset)).not.toContain("frame-src");
      expect(createWebContentSecurityPolicy(undefined, unset)).toBe(createWebContentSecurityPolicy());
      expect(createWebPermissionsPolicy(unset)).toBe("camera=(), geolocation=(), microphone=()");
    }
    expect(createWebSecurityHeaders()).toMatchObject({ "permissions-policy": "camera=(), geolocation=(), microphone=()", "x-frame-options": "DENY" });
  });

  it("frames and delegates devices to the configured call provider's origin only", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-call-"));
    const dist = join(root, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<main>Call</main>");
    const web = await startWebStaticRuntime({ host: "127.0.0.1", port: 0, root: dist, callEmbedUrl: "https://meet.example.test:8443/otte-{room}#config.prejoinPageEnabled=true" });
    try {
      const response = await fetch(web.url);
      const policy = response.headers.get("content-security-policy") ?? "";
      expect(policy).toMatch(/(?:^|; )frame-src 'self' https:\/\/meet\.example\.test:8443(?:;|$)/);
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("frame-ancestors 'none'");
      // The provider is framed, never scripted or fetched from the page.
      expect(policy).toContain("script-src 'self';");
      expect(policy).toContain("connect-src 'self';");
      expect(policy.match(/meet\.example\.test/g)).toHaveLength(1);
      expect(response.headers.get("permissions-policy")).toBe('camera=(self "https://meet.example.test:8443"), geolocation=(), microphone=(self "https://meet.example.test:8443"), display-capture=(self "https://meet.example.test:8443")');
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    } finally {
      await web.close();
    }
  });

  it("normalizes the call room URL to one fixed origin and rejects anything unsafe", () => {
    expect(configuredCallEmbedOrigin("https://meet.example.test/otte-{room}?lang=en")).toBe("https://meet.example.test");
    expect(configuredCallEmbedOrigin("https://meet.example.test/our-table")).toBe("https://meet.example.test");
    expect(configuredCallEmbedOrigin("http://127.0.0.1:8443/{room}")).toBe("http://127.0.0.1:8443");
    expect(() => configuredCallEmbedOrigin("http://meet.example.test/{room}")).toThrow("must use HTTPS");
    expect(() => configuredCallEmbedOrigin("javascript:alert(1)//{room}")).toThrow("must use HTTPS");
    expect(() => configuredCallEmbedOrigin("/call/{room}")).toThrow("absolute HTTPS URL");
    expect(() => configuredCallEmbedOrigin("https://user:secret@meet.example.test/{room}")).toThrow("credential-free");
    expect(() => configuredCallEmbedOrigin("https://*.example.test/{room}")).toThrow("non-wildcard");
    expect(() => configuredCallEmbedOrigin("https://{room}.example.test/")).toThrow("not in the host");
    expect(() => configuredCallEmbedOrigin("https://meet.example.test/{campaignId}")).toThrow("only the {room} placeholder");
    expect(() => createWebSecurityHeaders(undefined, "http://meet.example.test/{room}")).toThrow("must use HTTPS");
  });

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
      join(dist, "assets", "figtree-latin-wght-normal-ABCDEFGH.woff2"),
      "test-font",
    );
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
      const indexResponse = await fetch(`${web.url}/`);
      expect(await indexResponse.text()).toContain("OpenTabletop Desktop");
      expect(indexResponse.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(indexResponse.headers.get("content-security-policy")).toContain("object-src 'none'");
      expect(indexResponse.headers.get("content-security-policy")).toContain("connect-src 'self'");
      expect(indexResponse.headers.get("content-security-policy")).not.toMatch(/connect-src[^;]*(?:https:|wss:|localhost|127\.0\.0\.1)/);
      expect(indexResponse.headers.get("x-content-type-options")).toBe("nosniff");
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
      const bundledFont = await fetch(
        `${web.url}/assets/figtree-latin-wght-normal-ABCDEFGH.woff2`,
      );
      expect(bundledFont.headers.get("content-type")).toBe("font/woff2");
    } finally {
      await web.close();
      await api.close();
    }
  });

  it("reuses proxy sockets without accumulating close listeners", async () => {
    const { createServer } = await import("node:http");
    const root = mkdtempSync(join(tmpdir(), "otte-web-runtime-keepalive-"));
    writeFileSync(join(root, "index.html"), "<main>Keep alive</main>");
    let connections = 0;
    let requests = 0;
    const api = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    api.on("connection", () => { connections += 1; });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const address = api.address();
    if (!address || typeof address === "string") throw new Error("Keep-alive fixture did not bind");
    const web = await startWebStaticRuntime({ host: "127.0.0.1", port: 0, root, apiBaseUrl: `http://127.0.0.1:${address.port}` });
    const warnings: Error[] = [];
    const captureWarning = (warning: Error) => {
      if (warning.name === "MaxListenersExceededWarning" && warning.message.includes("close")) warnings.push(warning);
    };
    process.on("warning", captureWarning);
    try {
      for (let index = 0; index < 24; index += 1) {
        expect(await (await fetch(`${web.url}/api/v1/health`)).json()).toEqual({ ok: true });
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(requests).toBe(24);
      expect(connections).toBe(1);
      expect(warnings).toEqual([]);
    } finally {
      process.off("warning", captureWarning);
      await web.close();
      await new Promise<void>((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
      unlinkSync(join(root, "index.html"));
      rmdirSync(root);
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
