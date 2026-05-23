import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat layout", () => {
  it("uses a dedicated live chat rail with a bottom composer and roll hydration", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const chatRailIndex = source.indexOf("function ChatRail");
    const streamIndex = source.indexOf('className="chat-rail-stream"');
    const composerIndex = source.indexOf('className="chat-composer-dock"');

    expect(source).not.toContain('<footer className="console">');
    expect(source).not.toContain('className="chat-command-bar"');
    expect(source).not.toContain('aria-label="Chat summary"');
    expect(source).not.toContain('className="operator-section chat-room"');
    expect(source).toContain("function ChatMessageItem");
    expect(source).toContain("function RollMessageCard");
    expect(source).toContain("function ChatComposer");
    expect(source).toContain("rolls={snapshot.rolls}");
    expect(source).toContain("rollById");
    expect(streamIndex).toBeGreaterThan(chatRailIndex);
    expect(composerIndex).toBeGreaterThan(streamIndex);
  });
});
