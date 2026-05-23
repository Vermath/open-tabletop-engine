import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat layout", () => {
  it("keeps the chat command composer first inside the Chat panel instead of the global console dock", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const chatPanelIndex = source.indexOf("function ChatPanel");
    const composerIndex = source.indexOf('className="chat-command-panel chat-composer"');
    const roomIndex = source.indexOf('className="operator-section chat-room"');

    expect(source).not.toContain('<footer className="console">');
    expect(source).not.toContain('className="chat-command-bar"');
    expect(source).not.toContain('aria-label="Chat summary"');
    expect(source).toContain('className="operator-section chat-room"');
    expect(composerIndex).toBeGreaterThan(chatPanelIndex);
    expect(roomIndex).toBeGreaterThan(composerIndex);
  });
});
