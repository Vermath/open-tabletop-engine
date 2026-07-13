import { describe, expect, it } from "vitest";
import { CodexAppServerWebSocketTransport, LoopbackCodexTransport } from "@open-tabletop/codex-app-server-provider";
import { createCodexTransport } from "./index.js";

describe("ai gateway provider configuration", () => {
  it("defaults to Codex app-server transport", () => {
    expect(createCodexTransport({})).toBeInstanceOf(CodexAppServerWebSocketTransport);
  });

  it("requires loopback transport to be explicitly selected", () => {
    expect(createCodexTransport({ OTTE_AI_PROVIDER: "codex-loopback" })).toBeInstanceOf(LoopbackCodexTransport);
  });

  it("rejects unsupported provider names instead of silently using loopback", () => {
    expect(() => createCodexTransport({ OTTE_AI_PROVIDER: "typo-provider" })).toThrow('Unsupported OTTE_AI_PROVIDER "typo-provider"');
  });

  it("treats blank compose-style app-server settings as unset", () => {
    const transport = createCodexTransport({
      OTTE_CODEX_APP_SERVER_URL: "   ",
      OTTE_CODEX_APP_SERVER_CWD: "   ",
      OTTE_CODEX_MODEL: "   ",
      OTTE_CODEX_MODEL_PROVIDER: "   ",
      OTTE_AI_PROVIDER_TIMEOUT_MS: "   "
    }) as CodexAppServerWebSocketTransport;

    expect((transport as unknown as { url: string }).url).toBe("ws://127.0.0.1:4500");
    expect((transport as unknown as { requestTimeoutMs: number }).requestTimeoutMs).toBe(15 * 60_000);
  });

  it("preserves an explicit zero timeout for request and turn timers", () => {
    const transport = createCodexTransport({ OTTE_AI_PROVIDER_TIMEOUT_MS: "0" }) as CodexAppServerWebSocketTransport;

    expect((transport as unknown as { requestTimeoutMs: number }).requestTimeoutMs).toBe(0);
    expect((transport as unknown as { turnTimeoutMs: number }).turnTimeoutMs).toBe(0);
  });
});
