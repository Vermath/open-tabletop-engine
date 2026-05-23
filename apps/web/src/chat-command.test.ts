import { describe, expect, it } from "vitest";
import { parseChatCommand } from "./chat-command.js";

describe("parseChatCommand", () => {
  it("treats a slash-prefixed dice expression as a roll command", () => {
    expect(parseChatCommand("/1d20 + 2")).toEqual({ kind: "roll", formula: "1d20 + 2", visibility: "public" });
  });

  it("supports roll aliases", () => {
    expect(parseChatCommand("/roll 2d6+3")).toEqual({ kind: "roll", formula: "2d6+3", visibility: "public" });
    expect(parseChatCommand("/r 1d8")).toEqual({ kind: "roll", formula: "1d8", visibility: "public" });
  });

  it("parses Roll20-style chat commands", () => {
    expect(parseChatCommand("/gm keep this private")).toEqual({ kind: "chat", body: "keep this private", messageType: "gm", visibility: "gm_only" });
    expect(parseChatCommand("/me draws steel")).toEqual({ kind: "chat", body: "draws steel", messageType: "emote", visibility: "public" });
    expect(parseChatCommand("/ooc back in 5")).toEqual({ kind: "chat", body: "back in 5", messageType: "ooc", visibility: "public" });
    expect(parseChatCommand("/w Valen Ash hello there")).toEqual({ kind: "chat", body: "hello there", messageType: "whisper", visibility: "whisper", recipientQuery: "Valen Ash" });
  });

  it("sends non-command text as plain public chat", () => {
    expect(parseChatCommand("hello table")).toEqual({ kind: "chat", body: "hello table", messageType: "plain", visibility: "public" });
  });
});
