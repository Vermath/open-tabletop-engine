import type { ChatMessage } from "@open-tabletop/core";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, changed: false, effects: [] as (() => void)[] }));

// Match the repository's editor rerender harness: preserve hook state and flush
// effects after attaching the stream ref, without introducing a DOM dependency.
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [hooks.values[index], (next: T | ((value: T) => T)) => {
      const value = typeof next === "function" ? (next as (value: T) => T)(hooks.values[index] as T) : next;
      if (!Object.is(value, hooks.values[index])) { hooks.values[index] = value; hooks.changed = true; }
    }];
  },
  useRef: <T,>(initial: T) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect: (effect: () => void, deps?: unknown[]) => {
    const index = hooks.cursor++;
    const previous = hooks.values[index] as unknown[] | undefined;
    if (!deps || !previous || deps.length !== previous.length || deps.some((value, position) => !Object.is(value, previous[position]))) {
      hooks.effects.push(effect);
      hooks.values[index] = deps;
    }
  }
}));

import { ChatRail, type ChatRailProps } from "./chat-rail.js";

interface ElementNode { type?: unknown; props: Record<string, unknown> & { children?: ReactNode } }
function nodes(node: ReactNode): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  const element = node as ElementNode;
  return [element, ...nodes(element.props?.children)];
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" ? text((node as ElementNode).props?.children) : "";
}
function messages(start: number, count = 200): ChatMessage[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    const timestamp = new Date(Date.UTC(2026, 8, 6, 0, 0, index)).toISOString();
    return { id: `message-${index}`, campaignId: "campaign", userId: "sender", type: "plain", body: `Message ${index}`, visibility: "public", recipientUserIds: [], createdAt: timestamp, updatedAt: timestamp };
  });
}
function harness(initialMessages = messages(0)) {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  const props: ChatRailProps = {
    campaignId: "campaign", currentUserId: "reader", command: "", setCommand: noop,
    messages: initialMessages, rolls: [], concealedRollIds: new Set(), members: [], presences: [], scenes: [],
    diceFormula: "1d20", setDiceFormula: noop, diceVisibility: "public", setDiceVisibility: noop,
    savedDiceFormulas: [], diceMacros: [], onRollDice: asyncNoop, onSaveDiceFormula: asyncNoop,
    onSubmitCommand: asyncNoop, onClearReply: noop, onReplyToMessage: noop, onEditMessage: asyncNoop,
    onDeleteMessage: asyncNoop, onModerateMessage: asyncNoop, canModerate: false, canRollDice: true,
    dice3dEnabled: false, onToggleDice3d: noop, notificationPreference: "all", connectionState: "connected"
  };
  const stream = { clientHeight: 400, scrollHeight: 4000, scrollTop: 3600, scrollTo: vi.fn() };
  let view: ReactNode;
  const streamNode = () => nodes(view).find((node) => node.props["aria-label"] === "Chat messages")!;
  const render = (nextMessages = props.messages) => {
    props.messages = nextMessages;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      hooks.cursor = 0;
      hooks.changed = false;
      hooks.effects = [];
      const component = ChatRail(props);
      view = (component.type as (input: ChatRailProps) => ReactNode)(component.props);
      (streamNode().props.ref as { current: unknown }).current = stream;
      for (const effect of hooks.effects) effect();
      if (!hooks.changed) return view;
    }
    throw new Error("Chat effects did not settle");
  };
  const readOlder = () => {
    stream.scrollTop = 100;
    (streamNode().props.onScroll as (event: unknown) => void)({ currentTarget: stream });
    render();
    stream.scrollTo.mockClear();
  };
  const unread = () => {
    const button = nodes(view).find((node) => node.props.className === "ghost-button chat-jump-latest");
    return button ? text(button as ReactNode).trim() : "";
  };
  const jumpToLatest = () => {
    const button = nodes(view).find((node) => node.props.className === "ghost-button chat-jump-latest")!;
    (button.props.onClick as () => void)();
    render();
  };
  render();
  stream.scrollTo.mockClear();
  return { render, readOlder, unread, jumpToLatest, stream };
}

beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.changed = false; });

describe("chat scrolling across message window updates", () => {
  it("follows the appended tail when a full 200-message window shifts without growing", () => {
    const chat = harness();
    chat.render(messages(1));
    expect(chat.stream.scrollTo).toHaveBeenCalledOnce();
    expect(chat.stream.scrollTo).toHaveBeenCalledWith({ top: 4000 });
    expect(chat.unread()).toBe("");
  });

  it("keeps the reader in older chat and counts each append in successive fixed-size windows", () => {
    const chat = harness();
    chat.readOlder();
    chat.render(messages(1));
    expect(chat.unread()).toBe("1 new message - jump to latest");
    chat.render(messages(3));
    expect(chat.unread()).toBe("3 new messages - jump to latest");
    expect(chat.stream.scrollTo).not.toHaveBeenCalled();
    expect(chat.stream.scrollTop).toBe(100);
  });

  it("does not count edits, prepended history, tail deletion, or reloaded known history as unread", () => {
    const chat = harness();
    chat.readOlder();
    chat.render(messages(0).map((message, index) => index === 199 ? { ...message, body: "Edited tail", editedAt: "2026-09-06T00:20:00.000Z" } : message));
    expect(chat.unread()).toBe("");
    chat.render(messages(-10, 210));
    expect(chat.unread()).toBe("");
    chat.render(messages(-10, 209));
    expect(chat.unread()).toBe("");
    chat.render(messages(-400));
    expect(chat.unread()).toBe("");
    chat.render(messages(0));
    expect(chat.unread()).toBe("");
    expect(chat.stream.scrollTo).not.toHaveBeenCalled();
    chat.render(messages(1));
    expect(chat.unread()).toBe("1 new message - jump to latest");
  });

  it("counts a full newer window after reconnect even when no prior IDs remain", () => {
    const chat = harness();
    chat.readOlder();
    chat.render(messages(250));
    expect(chat.unread()).toBe("200 new messages - jump to latest");
    expect(chat.stream.scrollTo).not.toHaveBeenCalled();
  });

  it("uses tail identity when appended messages share the prior tail timestamp", () => {
    const initial = messages(0);
    const chat = harness(initial);
    chat.readOlder();
    chat.render([...initial.slice(1), { ...messages(200, 1)[0]!, createdAt: initial.at(-1)!.createdAt }]);
    expect(chat.unread()).toBe("1 new message - jump to latest");
  });

  it("clears unread and resumes following only when the reader jumps to latest", () => {
    const chat = harness();
    chat.readOlder();
    chat.render(messages(1));
    chat.jumpToLatest();
    expect(chat.unread()).toBe("");
    expect(chat.stream.scrollTo).toHaveBeenCalledWith({ top: 4000, behavior: "smooth" });
    chat.stream.scrollTo.mockClear();
    chat.render(messages(2));
    expect(chat.stream.scrollTo).toHaveBeenCalledWith({ top: 4000 });
    expect(chat.unread()).toBe("");
  });
});
