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
});
