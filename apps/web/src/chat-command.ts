import type { ChatMessage, MessageType } from "@open-tabletop/core";

export type ParsedChatCommand =
  | { kind: "roll"; formula: string; visibility: DiceVisibility }
  | { kind: "chat"; body: string; messageType: MessageType; visibility: ChatMessage["visibility"]; recipientQuery?: string }
  | { kind: "error"; message: string };

type DiceVisibility = "public" | "gm_only" | "whisper";

const diceExpressionPattern = /^(?:\d*)d\d+/i;

export function parseChatCommand(input: string): ParsedChatCommand | undefined {
  const text = input.trim();
  if (!text) return undefined;
  if (!text.startsWith("/")) return { kind: "chat", body: text, messageType: "plain", visibility: "public" };

  const commandLine = text.slice(1).trim();
  if (!commandLine) return undefined;
  const [command = "", ...restParts] = commandLine.split(/\s+/);
  const rest = restParts.join(" ").trim();
  const normalizedCommand = command.toLocaleLowerCase();

  if (normalizedCommand === "roll" || normalizedCommand === "r") {
    return rest ? { kind: "roll", formula: rest, visibility: "public" } : undefined;
  }
  if (normalizedCommand === "gmroll" || normalizedCommand === "gr") {
    return rest ? { kind: "roll", formula: rest, visibility: "gm_only" } : undefined;
  }
  if (diceExpressionPattern.test(commandLine)) {
    return { kind: "roll", formula: commandLine, visibility: "public" };
  }
  if (normalizedCommand === "gm") {
    return rest ? { kind: "chat", body: rest, messageType: "gm", visibility: "gm_only" } : undefined;
  }
  if (normalizedCommand === "me" || normalizedCommand === "em") {
    return rest ? { kind: "chat", body: rest, messageType: "emote", visibility: "public" } : undefined;
  }
  if (normalizedCommand === "ooc") {
    return rest ? { kind: "chat", body: rest, messageType: "ooc", visibility: "public" } : undefined;
  }
  if (normalizedCommand === "w" || normalizedCommand === "whisper") {
    const whisper = parseWhisper(rest);
    if (!whisper) return undefined;
    return { kind: "chat", body: whisper.body, messageType: "whisper", visibility: "whisper", recipientQuery: whisper.recipientQuery };
  }

  return { kind: "error", message: `Unknown chat command "/${command}". Remove the leading slash to send public chat.` };
}

function parseWhisper(value: string): { recipientQuery: string; body: string } | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const quoted = text.match(/^"([^"]+)"\s+(.+)$/);
  if (quoted?.[1] && quoted[2]) return { recipientQuery: quoted[1].trim(), body: quoted[2].trim() };

  const parts = text.split(/\s+/);
  if (parts.length < 2) return undefined;
  return { recipientQuery: parts[0]!, body: parts.slice(1).join(" ") };
}
