import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  boundedWebSocketCloseReason,
  chunkBufferForTunnel,
  localHttpRequestOptions,
  localRequestHeaders,
  localWebSocketClientOptions,
  localWebSocketMessageBuffer,
  localWebSocketProtocols,
  readResponseBodyChunks,
  RelayTunnelSession,
  relayBufferedHttpRequestMaxBytes,
  relayHostFrameMaxBytes,
  relayHostWebSocketOptions,
  relayWebSocketMessageMaxBytes,
  streamResponseBodyChunks
} from "./tunnel-client.js";

describe("desktop relay tunnel client", () => {
  it("keeps an explicitly stopped session stopped when an in-flight start aborts", async () => {
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestStarted();
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(new Error("request aborted"));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    }));
    const session = new RelayTunnelSession({ relayBaseUrl: "https://relay.test", localWebBaseUrl: "http://127.0.0.1:3000" });
    try {
      const starting = session.start();
      await started;
      await session.stop();

      await expect(starting).rejects.toThrow("request aborted");
      expect(session.status().state).toBe("stopped");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a concurrent start without cancelling the active attempt", async () => {
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestStarted();
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(new Error("request aborted"));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    }));
    const session = new RelayTunnelSession({ relayBaseUrl: "https://relay.test", localWebBaseUrl: "http://127.0.0.1:3000" });
    try {
      const firstStart = session.start();
      await started;

      await expect(session.start()).rejects.toThrow("Desktop sharing is already starting");
      await session.stop();
      await expect(firstStart).rejects.toThrow("request aborted");
      expect(session.status().state).toBe("stopped");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("attaches the relay message handler before the socket open continuation", async () => {
    class FakeSocket extends EventEmitter {
      readyState = 0;
      readonly sent: string[] = [];

      send(data: string, callback?: (error?: Error) => void): void {
        this.sent.push(data);
        callback?.();
      }

      close(): void {
        this.readyState = 3;
        this.emit("close", 1000, Buffer.alloc(0));
      }

      terminate(): void {
        this.close();
      }
    }
    const socket = new FakeSocket();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      slug: "tbl_test",
      hostToken: "ott_host_test",
      publicUrl: "https://relay.test/t/tbl_test",
      expiresAt: "2030-01-01T00:00:00.000Z"
    }), { status: 201, headers: { "content-type": "application/json" } })));
    const session = new RelayTunnelSession({
      relayBaseUrl: "https://relay.test",
      localWebBaseUrl: "http://127.0.0.1:3000",
      relayWebSocketFactory: () => {
        queueMicrotask(() => {
          socket.readyState = 1;
          socket.emit("open");
          socket.emit("message", Buffer.from(JSON.stringify({ type: "control.ping", sentAt: "2026-07-11T00:00:00.000Z" })));
        });
        return socket as never;
      }
    });
    try {
      await session.start();
      expect(socket.sent.map((value) => JSON.parse(value) as { type: string }).map((frame) => frame.type)).toEqual([
        "control.ping",
        "host.hello"
      ]);
    } finally {
      await session.stop();
      vi.unstubAllGlobals();
    }
  });

  it("marks a stopping session immediately and terminates a relay socket that never closes", async () => {
    vi.useFakeTimers();
    try {
      class StuckSocket extends EventEmitter {
        readyState = 1;
        readonly close = vi.fn(() => { this.readyState = 2; });
        readonly terminate = vi.fn(() => { this.readyState = 3; });
      }
      const socket = new StuckSocket();
      const session = new RelayTunnelSession({ relayBaseUrl: "https://relay.test", localWebBaseUrl: "http://127.0.0.1:3000" });
      (session as unknown as { relaySocket: StuckSocket }).relaySocket = socket;

      const stopping = session.stop();
      expect(session.status().state).toBe("stopped");
      await vi.advanceTimersByTimeAsync(500);
      await stopping;

      expect(socket.close).toHaveBeenCalledWith(1000, "Desktop sharing stopped");
      expect(socket.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("splits local HTTP response bodies into bounded tunnel frames", () => {
    const body = Buffer.from("abcdefghij");

    expect(chunkBufferForTunnel(body, 4).map((chunk) => chunk.toString("utf8"))).toEqual(["abcd", "efgh", "ij"]);
    expect(() => chunkBufferForTunnel(body, Number.NaN)).toThrow("positive safe integer");
  });

  it("rejects responses that exceed the configured relay response cap", async () => {
    const response = new Response("abcdef");

    await expect(readResponseBodyChunks(response, 5)).rejects.toThrow("Relay response exceeds 5 bytes");
    await expect(readResponseBodyChunks(response, Number.NaN)).rejects.toThrow("non-negative finite number");
  });

  it("cancels a streamed local response after it crosses the relay cap", async () => {
    let cancelReason: unknown;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(6));
      },
      cancel(reason) {
        cancelReason = reason;
      }
    }));

    await expect(readResponseBodyChunks(response, 5)).rejects.toThrow("Relay response exceeds 5 bytes");
    expect(cancelReason).toEqual(expect.objectContaining({ message: "Relay response exceeds 5 bytes" }));
  });

  it("rejects declared oversize responses before reading the body", async () => {
    const response = new Response("ok", { headers: { "content-length": "999" } });

    await expect(readResponseBodyChunks(response, 5)).rejects.toThrow("Relay response exceeds 5 bytes");
  });

  it("forwards response chunks incrementally instead of collecting the whole response", async () => {
    const forwarded: string[] = [];
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("first"));
        controller.enqueue(Buffer.from("second"));
        controller.close();
      }
    }));

    await streamResponseBodyChunks(response, async (chunk) => {
      forwarded.push(chunk.toString("utf8"));
    });

    expect(forwarded).toEqual(["first", "second"]);
  });

  it("keeps request-body capacity reserved while the local fetch is active", async () => {
    let closeResponse!: () => void;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        closeResponse = () => controller.close();
      }
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const session = new RelayTunnelSession({ relayBaseUrl: "https://relay.test", localWebBaseUrl: "http://127.0.0.1:3000" });
    (session as unknown as { relaySocket: { readyState: number; send(value: string, callback?: (error?: Error) => void): void } }).relaySocket = {
      readyState: 1,
      send: (_value, callback) => callback?.()
    };
    (session as unknown as { bufferedHttpRequestBytes: number }).bufferedHttpRequestBytes = 1;
    (session as unknown as { pendingHttpRequests: Map<string, unknown> }).pendingHttpRequests.set("req_active", {
      method: "POST",
      path: "/upload",
      headers: {},
      chunks: [Buffer.from("a")],
      bytes: 1
    });

    const forwarding = (session as unknown as { forwardHttpRequest(requestId: string): Promise<void> }).forwardHttpRequest("req_active");
    await vi.waitFor(() => expect((session as unknown as { activeHttpForwards: Map<string, unknown> }).activeHttpForwards.size).toBe(1));
    expect((session as unknown as { bufferedHttpRequestBytes: number }).bufferedHttpRequestBytes).toBe(1);
    closeResponse();
    await forwarding;
    expect((session as unknown as { bufferedHttpRequestBytes: number }).bufferedHttpRequestBytes).toBe(0);
    vi.unstubAllGlobals();
  });

  it("caps aggregate buffered request bodies before accepting another chunk", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const session = new RelayTunnelSession({ relayBaseUrl: "https://relay.test", localWebBaseUrl: "http://127.0.0.1:3000" });
    (session as unknown as { relaySocket: { readyState: number; send(value: string): void } }).relaySocket = {
      readyState: 1,
      send: (value) => sent.push(JSON.parse(value) as Record<string, unknown>)
    };
    (session as unknown as { bufferedHttpRequestBytes: number }).bufferedHttpRequestBytes = relayBufferedHttpRequestMaxBytes;
    (session as unknown as { pendingHttpRequests: Map<string, unknown> }).pendingHttpRequests.set("req_full", {
      method: "POST",
      path: "/upload",
      headers: {},
      chunks: [],
      bytes: 0
    });

    await (session as unknown as { handleRelayMessage(data: Buffer): Promise<void> }).handleRelayMessage(
      Buffer.from(JSON.stringify({ type: "http.body", requestId: "req_full", bodyBase64: "YQ==" }))
    );

    expect(sent).toEqual([expect.objectContaining({
      type: "http.error",
      requestId: "req_full",
      status: 429,
      code: "desktop_tunnel_request_buffer_full"
    })]);
  });

  it("forwards websocket protocols through the constructor instead of spoofing handshake headers", () => {
    const headers = {
      authorization: "Bearer legacy",
      "sec-websocket-key": "relay-generated-key",
      "sec-websocket-protocol": "otte.v1, otte.auth.ots_test, invalid protocol",
      "sec-websocket-version": "13"
    };

    expect(localWebSocketProtocols(headers)).toEqual(["otte.v1", "otte.auth.ots_test"]);
    expect(localRequestHeaders(headers)).toEqual({ authorization: "Bearer legacy" });
    expect(localWebSocketClientOptions({ authorization: "Bearer legacy" })).toEqual({
      headers: { authorization: "Bearer legacy" },
      maxPayload: relayWebSocketMessageMaxBytes
    });
    expect(() => localWebSocketMessageBuffer(Buffer.alloc(relayWebSocketMessageMaxBytes + 1))).toThrow("message exceeds");
    const multibyteReason = boundedWebSocketCloseReason("🙂".repeat(100));
    expect(new TextEncoder().encode(multibyteReason).byteLength).toBeLessThanOrEqual(123);
    expect(multibyteReason).toBe("🙂".repeat(30));
  });

  it("keeps the relay host token out of the websocket URL", () => {
    expect(relayHostWebSocketOptions("ott_host_secret")).toEqual({
      headers: { authorization: "Bearer ott_host_secret" },
      maxPayload: relayHostFrameMaxBytes
    });
  });

  it("returns local redirects to the browser instead of following them off origin", () => {
    expect(localHttpRequestOptions("GET", { accept: "text/html" }, "ignored")).toEqual({
      method: "GET",
      headers: { accept: "text/html" },
      body: undefined,
      redirect: "manual"
    });
  });
});
