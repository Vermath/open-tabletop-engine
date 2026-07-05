import { describe, expect, it } from "vitest";
import { parseTunnelFrame, tunnelFrameSchemaVersion, type TunnelFrame } from "./index.js";

describe("tunnel protocol", () => {
  it("accepts the explicit desktop relay frame set", () => {
    const frames: TunnelFrame[] = [
      { type: "host.hello", protocolVersion: tunnelFrameSchemaVersion, tableSlug: "tbl_abc", hostToken: "ott_host_secret" },
      { type: "http.request", requestId: "req_1", method: "POST", path: "/api/v1/auth/bootstrap", headers: { "content-type": "application/json" } },
      { type: "http.body", requestId: "req_1", bodyBase64: "e30=" },
      { type: "http.end", requestId: "req_1" },
      { type: "http.response", requestId: "req_1", status: 200, headers: { "content-type": "application/json" } },
      { type: "ws.open", socketId: "ws_1", path: "/api/v1/realtime?campaignId=camp_demo", headers: {} },
      { type: "ws.message", socketId: "ws_1", bodyBase64: "eyJ0eXBlIjoicGluZyJ9" },
      { type: "ws.close", socketId: "ws_1", code: 1000, reason: "done" },
      { type: "control.ping", sentAt: "2026-07-05T00:00:00.000Z" }
    ];

    for (const frame of frames) {
      expect(parseTunnelFrame(frame)).toEqual(frame);
    }
  });

  it("rejects unknown frame types and unsafe paths", () => {
    expect(() => parseTunnelFrame({ type: "campaign.dump", requestId: "req_1" })).toThrow("Unsupported tunnel frame type");
    expect(() => parseTunnelFrame({ type: "http.request", requestId: "req_1", method: "GET", path: "https://evil.test/", headers: {} })).toThrow("path must start with /");
  });
}
);
