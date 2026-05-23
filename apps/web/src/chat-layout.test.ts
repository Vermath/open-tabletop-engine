import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat layout", () => {
  it("keeps the chat command composer inside the Chat panel instead of the global console dock", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('<footer className="console">');
    expect(source).not.toContain('className="chat-command-bar"');
    expect(source).toContain('className="operator-section chat-room"');
    expect(source.indexOf('className="operator-section chat-room"')).toBeGreaterThan(source.indexOf("function ChatPanel"));
    expect(source.indexOf('className="operator-section chat-room"')).toBeLessThan(source.indexOf('aria-label="Chat summary"'));
  });
});
