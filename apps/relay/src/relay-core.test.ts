import { describe, expect, it, vi } from "vitest";
import { createRelayTable, hostTokenHash, MemoryRateLimiter, relayLimits, relayTableStatus, verifyHostToken, verifyHostTokenHash } from "./relay-core.js";
import { safeRelayPath, selectRelayWebSocketProtocol, TableTunnel, type RelayEnv } from "./index.js";

describe("relay core", () => {
  it("creates high-entropy table credentials with a 12 hour ttl", () => {
    const now = Date.parse("2026-07-05T12:00:00.000Z");
    const table = createRelayTable({ nowMs: now, publicBaseUrl: "https://share.open-tabletop.org" });

    expect(table.slug).toMatch(/^tbl_[a-z0-9_-]{22,}$/);
    expect(table.hostToken).toMatch(/^ott_host_[a-z0-9_-]{43,}$/);
    expect(table.publicUrl).toBe(`https://share.open-tabletop.org/t/${table.slug}`);
    expect(Date.parse(table.expiresAt) - now).toBe(12 * 60 * 60 * 1000);
  });

  it("uses constant-time host token verification and reports expiry", async () => {
    const table = createRelayTable({ nowMs: 1000, publicBaseUrl: "https://share.open-tabletop.org" });
    await expect(verifyHostToken(table.hostToken, table.hostToken)).resolves.toBe(true);
    await expect(verifyHostToken(`${table.hostToken}x`, table.hostToken)).resolves.toBe(false);
    await expect(verifyHostTokenHash(table.hostToken, await hostTokenHash(table.hostToken))).resolves.toBe(true);
    await expect(verifyHostTokenHash(`${table.hostToken}x`, await hostTokenHash(table.hostToken))).resolves.toBe(false);

    expect(relayTableStatus({ slug: table.slug, expiresAt: new Date(500).toISOString(), hostConnected: false }, 1000)).toEqual({
      slug: table.slug,
      hostConnected: false,
      expired: true,
      expiresAt: new Date(500).toISOString()
    });
  });

  it("bounds relay request sizes and connection counts", () => {
    expect(relayLimits.maxRequestBodyBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(relayLimits.maxBufferedHttpRequestBytesPerTable).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(relayLimits.maxHttpResponseBodyBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(relayLimits.maxPendingHttpRequestsPerTable).toBeLessThanOrEqual(64);
    expect(relayLimits.maxClientWebSocketMessageBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(relayLimits.maxClientWebSocketsPerTable).toBeGreaterThanOrEqual(16);
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("rate-limits noisy relay callers by bounded time window", () => {
    const limiter = new MemoryRateLimiter({ windowMs: 1000, maxRequests: 2 });
    expect(limiter.check("ip:1", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip:1", 100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("ip:1", 200)).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 800 });
    expect(limiter.check("ip:1", 1000)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("bounds rate-limit buckets when callers continually rotate keys", () => {
    const limiter = new MemoryRateLimiter({ windowMs: 1000, maxRequests: 2, maxBuckets: 2 });
    expect(limiter.check("ip:1", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip:2", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip:3", 100)).toMatchObject({ allowed: true, remaining: 1 });

    expect(limiter.check("ip:1", 200)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("selects the stable realtime protocol from the player's offered protocols", () => {
    expect(selectRelayWebSocketProtocol("otte.v1, otte.auth.ots_test")).toBe("otte.v1");
    expect(selectRelayWebSocketProtocol("custom.v2, otte.auth.ots_test")).toBe("custom.v2");
    expect(selectRelayWebSocketProtocol("otte.auth.ots_test")).toBeUndefined();
    expect(selectRelayWebSocketProtocol(null)).toBeUndefined();
  });

  it("rejects tunnel paths that WHATWG URL parsing could redirect off the desktop origin", () => {
    expect(() => safeRelayPath("/\\\\evil.test/")).toThrow("backslashes");
    expect(() => safeRelayPath("//evil.test/")).toThrow("shared table origin");
    expect(safeRelayPath("/api/v1/health?check=1")).toBe("/api/v1/health?check=1");
  });

  it("accepts host credentials only from the Bearer authorization header", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const storedTable = {
      slug: table.slug,
      hostTokenHash: await hostTokenHash(table.hostToken),
      publicUrl: table.publicUrl,
      expiresAt: table.expiresAt
    };
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue(storedTable)
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);

    const queryOnly = await tunnel.fetch(new Request(`https://table.internal/host?token=${encodeURIComponent(table.hostToken)}`));
    expect(queryOnly.status).toBe(401);
    await expect(queryOnly.json()).resolves.toEqual({ error: "bad_host_token" });

    const bearer = await tunnel.fetch(
      new Request("https://table.internal/host", {
        headers: { authorization: `Bearer ${table.hostToken}` }
      })
    );
    expect(bearer.status).toBe(426);
    await expect(bearer.json()).resolves.toEqual({ error: "websocket_required" });
  });

  it("reports closed host sockets as offline before attempting to proxy", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = { readyState: 3 } as WebSocket;

    const status = await tunnel.fetch(new Request("https://table.internal/status"));
    await expect(status.json()).resolves.toMatchObject({ hostConnected: false });
    const proxied = await tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
    expect(proxied.status).toBe(503);
    await expect(proxied.json()).resolves.toEqual({ error: "host_offline" });
  });

  it("cleans up pending HTTP state when a host send fails synchronously", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    const close = vi.fn();
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: () => {
        throw new Error("socket closed during send");
      },
      close
    } as unknown as WebSocket;

    const response = await tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "host_offline" });
    expect(close).toHaveBeenCalledWith(1011, "Host socket send failed");
    expect((tunnel as unknown as { pendingHttp: Map<string, unknown> }).pendingHttp.size).toBe(0);
  });

  it("returns a controlled gateway timeout and releases request capacity for a silent host", async () => {
    vi.useFakeTimers();
    try {
      const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
      const state = {
        storage: {
          get: vi.fn().mockResolvedValue({
            slug: table.slug,
            hostTokenHash: await hostTokenHash(table.hostToken),
            publicUrl: table.publicUrl,
            expiresAt: table.expiresAt
          })
        }
      } as unknown as DurableObjectState;
      const tunnel = new TableTunnel(state, {} as RelayEnv);
      (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;

      const responsePromise = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
      await vi.advanceTimersByTimeAsync(0);
      expect((tunnel as unknown as { activeHttpRequests: number }).activeHttpRequests).toBe(1);

      await vi.advanceTimersByTimeAsync(relayLimits.maxHttpWaitMs);
      const response = await responsePromise;
      expect(response.status).toBe(504);
      await expect(response.json()).resolves.toEqual({ error: "host_response_timeout" });
      expect((tunnel as unknown as { activeHttpRequests: number }).activeHttpRequests).toBe(0);
      expect((tunnel as unknown as { pendingHttp: Map<string, unknown> }).pendingHttp.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects work owned by a replaced host before accepting the new connection", () => {
    const tunnel = new TableTunnel({} as DurableObjectState, {} as RelayEnv);
    const oldHost = { readyState: 1, close: vi.fn() } as unknown as WebSocket;
    const newHost = { readyState: 1, close: vi.fn() } as unknown as WebSocket;
    const reject = vi.fn();
    const timer = setTimeout(() => undefined, 60_000);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = oldHost;
    (tunnel as unknown as { pendingHttp: Map<string, unknown> }).pendingHttp.set("request-old", {
      chunks: [],
      bytes: 0,
      method: "GET",
      resolve: vi.fn(),
      reject,
      timer
    });

    (tunnel as unknown as { replaceHostSocket(socket: WebSocket): void }).replaceHostSocket(newHost);

    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: "Host replaced by a newer tunnel connection" }));
    expect(oldHost.close).toHaveBeenCalledWith(1012, "Host replaced by a newer tunnel connection");
    expect((tunnel as unknown as { hostSocket: WebSocket }).hostSocket).toBe(newHost);
    expect((tunnel as unknown as { pendingHttp: Map<string, unknown> }).pendingHttp.size).toBe(0);
  });

  it("rejects new HTTP work when a table already has the maximum pending requests", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: () => {
        throw new Error("should not send while saturated");
      }
    } as unknown as WebSocket;
    const pending = (tunnel as unknown as { pendingHttp: Map<string, unknown> }).pendingHttp;
    for (let index = 0; index < relayLimits.maxPendingHttpRequestsPerTable; index += 1) {
      pending.set(`request-${index}`, { chunks: [], bytes: 0, method: "GET", resolve: () => undefined, reject: () => undefined, timer: 0 });
    }

    const response = await tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "too_many_http_requests" });
  });

  it("reserves HTTP capacity while streaming request bodies are still arriving", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: () => { throw new Error("release test request"); },
      close: vi.fn()
    } as unknown as WebSocket;
    let releaseBodies!: () => void;
    const bodyGate = new Promise<void>((resolve) => { releaseBodies = resolve; });
    const blockedRequest = () => new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fupload", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        async pull(controller) {
          await bodyGate;
          controller.close();
        }
      }),
      duplex: "half"
    } as RequestInit & { duplex: "half" });
    const mutableLimits = relayLimits as unknown as { maxPendingHttpRequestsPerTable: number };
    const originalLimit = mutableLimits.maxPendingHttpRequestsPerTable;
    mutableLimits.maxPendingHttpRequestsPerTable = 2;
    try {
      const first = tunnel.fetch(blockedRequest());
      const second = tunnel.fetch(blockedRequest());
      await vi.waitFor(() => expect((tunnel as unknown as { activeHttpRequests: number }).activeHttpRequests).toBe(2));

      const saturated = await tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
      expect(saturated.status).toBe(429);
      await expect(saturated.json()).resolves.toEqual({ error: "too_many_http_requests" });

      releaseBodies();
      await expect(first).resolves.toMatchObject({ status: 503 });
      await expect(second).resolves.toMatchObject({ status: 503 });
    } finally {
      releaseBodies();
      mutableLimits.maxPendingHttpRequestsPerTable = originalLimit;
    }
  });

  it("caps aggregate request-body buffering across concurrent streams", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: () => { throw new Error("release aggregate test request"); },
      close: vi.fn()
    } as unknown as WebSocket;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstChunkSent = false;
    const firstBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!firstChunkSent) {
          firstChunkSent = true;
          controller.enqueue(new Uint8Array(4));
          return;
        }
        await firstGate;
        controller.close();
      }
    });
    const mutableLimits = relayLimits as unknown as { maxBufferedHttpRequestBytesPerTable: number };
    const originalLimit = mutableLimits.maxBufferedHttpRequestBytesPerTable;
    mutableLimits.maxBufferedHttpRequestBytesPerTable = 6;
    try {
      const first = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fupload", {
        method: "POST",
        body: firstBody,
        duplex: "half"
      } as RequestInit & { duplex: "half" }));
      await vi.waitFor(() => expect((tunnel as unknown as { bufferedHttpRequestBytes: number }).bufferedHttpRequestBytes).toBe(4));

      const second = await tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fupload", {
        method: "POST",
        body: new Uint8Array(3),
        duplex: "half"
      } as RequestInit & { duplex: "half" }));
      expect(second.status).toBe(429);
      await expect(second.json()).resolves.toEqual({ error: "request_buffer_full" });

      releaseFirst();
      await expect(first).resolves.toMatchObject({ status: 503 });
      expect((tunnel as unknown as { bufferedHttpRequestBytes: number }).bufferedHttpRequestBytes).toBe(0);
    } finally {
      releaseFirst();
      mutableLimits.maxBufferedHttpRequestBytesPerTable = originalLimit;
    }
  });

  it("stops reading an oversized streaming request as soon as the limit is crossed", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          if (pulls === 1) controller.enqueue(new Uint8Array(relayLimits.maxRequestBodyBytes + 1));
          else controller.error(new Error("relay read beyond its configured request limit"));
        }
      },
      { highWaterMark: 0 }
    );
    const request = new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fupload", {
      method: "POST",
      body,
      duplex: "half"
    } as RequestInit & { duplex: "half" });

    const response = await tunnel.fetch(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "request_too_large" });
    expect(pulls).toBe(1);
  });

  it("bounds host response buffering and returns a gateway error", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const sentFrames: Array<Record<string, unknown>> = [];
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: (text: string) => sentFrames.push(JSON.parse(text) as Record<string, unknown>)
    } as unknown as WebSocket;
    const mutableLimits = relayLimits as unknown as { maxHttpResponseBodyBytes: number; maxBufferedHttpResponseBytesPerTable: number };
    const originalResponseLimit = mutableLimits.maxHttpResponseBodyBytes;
    const originalTableLimit = mutableLimits.maxBufferedHttpResponseBytesPerTable;
    mutableLimits.maxHttpResponseBodyBytes = 4;
    mutableLimits.maxBufferedHttpResponseBytesPerTable = 4;
    try {
      const responsePromise = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
      await vi.waitFor(() => expect(sentFrames.some((frame) => frame.type === "http.request")).toBe(true));
      const requestId = sentFrames.find((frame) => frame.type === "http.request")?.requestId;
      expect(typeof requestId).toBe("string");
      const handleHostMessage = (tunnel as unknown as { handleHostMessage(text: string): Promise<void> }).handleHostMessage.bind(tunnel);
      await handleHostMessage(JSON.stringify({ type: "http.response", requestId, status: 200, headers: {} }));
      await handleHostMessage(JSON.stringify({ type: "http.body", requestId, bodyBase64: btoa("12345") }));

      const response = await responsePromise;
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: "host_response_too_large" });
    } finally {
      mutableLimits.maxHttpResponseBodyBytes = originalResponseLimit;
      mutableLimits.maxBufferedHttpResponseBytesPerTable = originalTableLimit;
    }
  });

  it("forwards bodyless host responses without constructing a forbidden body", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const sentFrames: Array<Record<string, unknown>> = [];
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: (text: string) => sentFrames.push(JSON.parse(text) as Record<string, unknown>)
    } as unknown as WebSocket;

    const responsePromise = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fempty"));
    await vi.waitFor(() => expect(sentFrames.some((frame) => frame.type === "http.request")).toBe(true));
    const requestId = sentFrames.find((frame) => frame.type === "http.request")?.requestId;
    expect(typeof requestId).toBe("string");
    const handleHostMessage = (tunnel as unknown as { handleHostMessage(text: string): Promise<void> }).handleHostMessage.bind(tunnel);
    await handleHostMessage(JSON.stringify({ type: "http.response", requestId, status: 204, headers: {} }));
    await handleHostMessage(JSON.stringify({ type: "http.end", requestId }));

    const response = await responsePromise;
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("holds aggregate response capacity until the browser consumes the streamed body", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const sentFrames: Array<Record<string, unknown>> = [];
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: (text: string) => sentFrames.push(JSON.parse(text) as Record<string, unknown>)
    } as unknown as WebSocket;

    const responsePromise = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
    await vi.waitFor(() => expect(sentFrames.some((frame) => frame.type === "http.request")).toBe(true));
    const requestId = sentFrames.find((frame) => frame.type === "http.request")?.requestId;
    const handleHostMessage = (tunnel as unknown as { handleHostMessage(text: string): Promise<void> }).handleHostMessage.bind(tunnel);
    await handleHostMessage(JSON.stringify({ type: "http.response", requestId, status: 200, headers: {} }));
    await handleHostMessage(JSON.stringify({ type: "http.body", requestId, bodyBase64: btoa("abc") }));
    await handleHostMessage(JSON.stringify({ type: "http.body", requestId, bodyBase64: btoa("def") }));
    const bufferedChunks = (tunnel as unknown as { pendingHttp: Map<string, { chunks: Uint8Array[] }> }).pendingHttp.get(String(requestId))!.chunks;
    await handleHostMessage(JSON.stringify({ type: "http.end", requestId }));

    const response = await responsePromise;
    expect((tunnel as unknown as { bufferedHttpResponseBytes: number }).bufferedHttpResponseBytes).toBe(6);
    const reader = response.body!.getReader();
    await expect(reader.read()).resolves.toEqual({ done: false, value: new TextEncoder().encode("abc") });
    expect(bufferedChunks[0]?.byteLength).toBe(0);
    expect((tunnel as unknown as { bufferedHttpResponseBytes: number }).bufferedHttpResponseBytes).toBe(3);
    await expect(reader.read()).resolves.toEqual({ done: false, value: new TextEncoder().encode("def") });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    expect(bufferedChunks).toHaveLength(0);
    expect((tunnel as unknown as { bufferedHttpResponseBytes: number }).bufferedHttpResponseBytes).toBe(0);
  });

  it("turns an explicit host stream failure into one controlled gateway response", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const sentFrames: Array<Record<string, unknown>> = [];
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: (text: string) => sentFrames.push(JSON.parse(text) as Record<string, unknown>)
    } as unknown as WebSocket;

    const responsePromise = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fstream"));
    await vi.waitFor(() => expect(sentFrames.some((frame) => frame.type === "http.request")).toBe(true));
    const requestId = sentFrames.find((frame) => frame.type === "http.request")?.requestId;
    const handleHostMessage = (tunnel as unknown as { handleHostMessage(text: string): Promise<void> }).handleHostMessage.bind(tunnel);
    await handleHostMessage(JSON.stringify({ type: "http.response", requestId, status: 200, headers: {} }));
    await handleHostMessage(JSON.stringify({ type: "http.body", requestId, bodyBase64: btoa("partial") }));
    await handleHostMessage(JSON.stringify({ type: "http.error", requestId, status: 502, code: "desktop_tunnel_bad_gateway", message: "Local stream failed" }));

    const response = await responsePromise;
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "desktop_tunnel_bad_gateway", message: "Local stream failed" });
    expect((tunnel as unknown as { bufferedHttpResponseBytes: number }).bufferedHttpResponseBytes).toBe(0);
  });

  it("resolves invalid final host response metadata as a gateway error", async () => {
    const table = createRelayTable({ publicBaseUrl: "https://share.open-tabletop.org" });
    const state = {
      storage: {
        get: vi.fn().mockResolvedValue({
          slug: table.slug,
          hostTokenHash: await hostTokenHash(table.hostToken),
          publicUrl: table.publicUrl,
          expiresAt: table.expiresAt
        })
      }
    } as unknown as DurableObjectState;
    const sentFrames: Array<Record<string, unknown>> = [];
    const tunnel = new TableTunnel(state, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: (text: string) => sentFrames.push(JSON.parse(text) as Record<string, unknown>)
    } as unknown as WebSocket;

    const responsePromise = tunnel.fetch(new Request("https://table.internal/http?path=%2Fapi%2Fv1%2Fhealth"));
    await vi.waitFor(() => expect(sentFrames.some((frame) => frame.type === "http.request")).toBe(true));
    const requestId = sentFrames.find((frame) => frame.type === "http.request")?.requestId;
    const handleHostMessage = (tunnel as unknown as { handleHostMessage(text: string): Promise<void> }).handleHostMessage.bind(tunnel);
    await handleHostMessage(JSON.stringify({ type: "http.response", requestId, status: 101, headers: {} }));
    await handleHostMessage(JSON.stringify({ type: "http.end", requestId }));

    const response = await responsePromise;
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "invalid_host_response" });
  });

  it("closes only the oversized player websocket before forwarding its frame to the host", () => {
    const sentFrames: Array<Record<string, unknown>> = [];
    const tunnel = new TableTunnel({} as DurableObjectState, {} as RelayEnv);
    (tunnel as unknown as { hostSocket: WebSocket }).hostSocket = {
      readyState: 1,
      send: (text: string) => sentFrames.push(JSON.parse(text) as Record<string, unknown>)
    } as unknown as WebSocket;
    const playerSocket = { close: vi.fn() } as unknown as WebSocket;
    const playerSockets = (tunnel as unknown as { playerSockets: Map<string, WebSocket> }).playerSockets;
    playerSockets.set("socket-1", playerSocket);

    const handlePlayerMessage = (
      tunnel as unknown as { handlePlayerWebSocketMessage(socketId: string, socket: WebSocket, data: string | ArrayBuffer): void }
    ).handlePlayerWebSocketMessage.bind(tunnel);
    handlePlayerMessage("socket-1", playerSocket, new Uint8Array(relayLimits.maxClientWebSocketMessageBytes + 1).buffer);

    expect(playerSocket.close).toHaveBeenCalledWith(1009, "Relay client message is too large");
    expect(playerSockets.has("socket-1")).toBe(false);
    expect(sentFrames).toEqual([
      { type: "ws.close", socketId: "socket-1", code: 1009, reason: "Relay client message is too large" }
    ]);
  });
});
