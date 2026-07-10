import { describe, expect, it } from "vitest";
import {
  normalizeWebSocketCloseCode,
  parseTunnelFrame,
  tunnelFrameSchemaVersion,
  validateTunnelPath,
  type TunnelFrame,
} from "./index.js";

describe("tunnel protocol", () => {
  it("accepts the explicit desktop relay frame set", () => {
    const frames: TunnelFrame[] = [
      {
        type: "host.hello",
        protocolVersion: tunnelFrameSchemaVersion,
        tableSlug: "tbl_abc",
        hostToken: "ott_host_secret",
      },
      {
        type: "http.request",
        requestId: "req_1",
        method: "POST",
        path: "/api/v1/auth/bootstrap",
        headers: { "content-type": "application/json" },
      },
      { type: "http.body", requestId: "req_1", bodyBase64: "e30=" },
      { type: "http.end", requestId: "req_1" },
      {
        type: "http.response",
        requestId: "req_1",
        status: 200,
        headers: { "content-type": "application/json" },
      },
      {
        type: "ws.open",
        socketId: "ws_1",
        path: "/api/v1/realtime?campaignId=camp_demo",
        headers: {},
      },
      {
        type: "ws.message",
        socketId: "ws_1",
        bodyBase64: "eyJ0eXBlIjoicGluZyJ9",
      },
      { type: "ws.close", socketId: "ws_1", code: 1000, reason: "done" },
      { type: "control.ping", sentAt: "2026-07-05T00:00:00.000Z" },
    ];

    for (const frame of frames) {
      expect(parseTunnelFrame(frame)).toEqual(frame);
    }
  });

  it("rejects unknown frame types and unsafe paths", () => {
    expect(() =>
      parseTunnelFrame({ type: "campaign.dump", requestId: "req_1" }),
    ).toThrow("Unsupported tunnel frame type");
    expect(() =>
      parseTunnelFrame({
        type: "http.request",
        requestId: "req_1",
        method: "GET",
        path: "https://evil.test/",
        headers: {},
      }),
    ).toThrow("path must start with /");
    expect(() => validateTunnelPath("/\\\\evil.test/")).toThrow("backslashes");
    expect(() =>
      parseTunnelFrame({
        type: "ws.open",
        socketId: "ws_1",
        path: "/\\\\evil.test/",
        headers: {},
      }),
    ).toThrow("backslashes");
    expect(() => validateTunnelPath("/safe\npath")).toThrow(
      "control characters",
    );
    expect(
      new URL(
        validateTunnelPath("/api/v1/health?check=1"),
        "http://127.0.0.1:4000",
      ).origin,
    ).toBe("http://127.0.0.1:4000");
  });

  it("rejects reserved close codes and normalizes abnormal closures before forwarding", () => {
    for (const code of [1004, 1005, 1006, 1015]) {
      expect(() =>
        parseTunnelFrame({
          type: "ws.close",
          socketId: "ws_1",
          code,
          reason: "abnormal",
        }),
      ).toThrow("sendable WebSocket close code");
      expect(normalizeWebSocketCloseCode(code)).toBe(1011);
    }
    expect(normalizeWebSocketCloseCode(1000)).toBe(1000);
    expect(normalizeWebSocketCloseCode(4001)).toBe(4001);
    expect(() =>
      parseTunnelFrame({ type: "ws.close", socketId: "ws_1", code: 2000 }),
    ).toThrow("sendable WebSocket close code");
  });
});
