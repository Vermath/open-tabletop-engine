import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat layout", () => {
  it("uses a dedicated live chat rail with a bottom composer and roll hydration", () => {
    const source = readFileSync(new URL("./chat-rail.tsx", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const chatRailIndex = source.indexOf("function ChatRail");
    const streamIndex = source.indexOf('className="chat-rail-stream"');
    const composerIndex = source.indexOf('className="chat-composer-dock"');

    expect(source).not.toContain('<footer className="console">');
    expect(source).not.toContain('className="chat-command-bar"');
    expect(source).not.toContain('aria-label="Chat summary"');
    expect(source).not.toContain('className="operator-section chat-room"');
    expect(source).toContain("function ChatMessageItem");
    expect(source).toContain("function RollMessageCard");
    expect(source).toContain("Replay recorded roll");
    expect(source).toContain("no pre-roll host commitment");
    expect(source).not.toContain("Verify fairness");
    expect(source).toContain("function ChatComposer");
    expect(appSource).toContain("rolls={snapshot.rolls}");
    expect(source).toContain("rollById");
    expect(streamIndex).toBeGreaterThan(chatRailIndex);
    expect(composerIndex).toBeGreaterThan(streamIndex);
  });

  it("keeps chat rail sections stacked in one column", () => {
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(styles).toContain(".chat-rail > .chat-dice-box");
    expect(styles).toContain(".chat-rail > .chat-rail-stream");
    expect(styles).toContain(".chat-rail > .chat-composer-dock");
    expect(styles).toContain("grid-column: 1;");
    expect(styles).toContain("grid-area: auto;");
  });
});
