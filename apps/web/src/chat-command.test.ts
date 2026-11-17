import { describe, expect, it } from "vitest";
import { parseChatCommand } from "./chat-command.js";

describe("parseChatCommand", () => {
  it("treats a slash-prefixed dice expression as a roll command", () => {
    expect(parseChatCommand("/1d20 + 2")).toEqual({ kind: "roll", formula: "1d20 + 2", visibility: "public" });
  });

  it("supports roll aliases", () => {
    expect(parseChatCommand("/roll 2d6+3")).toEqual({ kind: "roll", formula: "2d6+3", visibility: "public" });
    expect(parseChatCommand("/r 1d8")).toEqual({ kind: "roll", formula: "1d8", visibility: "public" });
    expect(parseChatCommand("/gmroll 1d20+5")).toEqual({ kind: "roll", formula: "1d20+5", visibility: "gm_only" });
    expect(parseChatCommand("/gr 2d10")).toEqual({ kind: "roll", formula: "2d10", visibility: "gm_only" });
  });

  it("parses Roll20-style chat commands", () => {
    expect(parseChatCommand("/gm keep this private")).toEqual({ kind: "chat", body: "keep this private", messageType: "gm", visibility: "gm_only" });
    expect(parseChatCommand("/me draws steel")).toEqual({ kind: "chat", body: "draws steel", messageType: "emote", visibility: "public" });
    expect(parseChatCommand("/ooc back in 5")).toEqual({ kind: "chat", body: "back in 5", messageType: "ooc", visibility: "public" });
  });

  it("parses whispers with a one-word recipient", () => {
    expect(parseChatCommand("/w Alice hello there")).toEqual({ kind: "chat", body: "hello there", messageType: "whisper", visibility: "whisper", recipientQuery: "Alice" });
  });

  it("parses whispers with a quoted multi-word recipient", () => {
    expect(parseChatCommand('/w "Valen Ash" hello there')).toEqual({ kind: "chat", body: "hello there", messageType: "whisper", visibility: "whisper", recipientQuery: "Valen Ash" });
  });

  it("keeps a four-or-more-word whisper body with the first unquoted recipient word", () => {
    expect(parseChatCommand("/w Alice how are you today")).toEqual({ kind: "chat", body: "how are you today", messageType: "whisper", visibility: "whisper", recipientQuery: "Alice" });
  });

  it("sends non-command text as plain public chat", () => {
    expect(parseChatCommand("hello table")).toEqual({ kind: "chat", body: "hello table", messageType: "plain", visibility: "public" });
  });

  it("reports unknown slash commands locally instead of public chat", () => {
    expect(parseChatCommand("/g secret plan")).toEqual({
      kind: "error",
      message: 'Unknown chat command "/g". Remove the leading slash to send public chat.'
    });
    expect(parseChatCommand("/g 1d20 secret plan")).toEqual({
      kind: "error",
      message: 'Unknown chat command "/g". Remove the leading slash to send public chat.'
    });
  });
});
