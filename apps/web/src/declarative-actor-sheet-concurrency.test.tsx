import type { Actor, DeclarativeActorSheet as Sheet } from "@open-tabletop/core";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, changed: false, effects: [] as (() => void)[], apiPatch: vi.fn(), apiPost: vi.fn() }));
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
  useRef: <T,>(initial: T) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index]; },
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.cursor++;
    const previous = hooks.values[index] as { deps: unknown[]; cleanup?: () => void } | undefined;
    if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
      hooks.values[index] = { deps };
      hooks.effects.push(() => { previous?.cleanup?.(); hooks.values[index] = { deps, cleanup: effect() }; });
    }
  }
}));
vi.mock("./api.js", async () => ({ ...await vi.importActual<typeof import("./api.js")>("./api.js"), apiPatch: hooks.apiPatch, apiPost: hooks.apiPost }));
import { DeclarativeActorSheet } from "./declarative-actor-sheet.js";
import { RetryableActionNotice } from "./retryable-action.js";

interface Element { type: unknown; props: Record<string, unknown> & { children?: ReactNode } }
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  const element = node as Element;
  return [element, ...nodes(element.props?.children)];
}
function find(node: ReactNode, predicate: (element: Element) => boolean): Element {
  const found = nodes(node).find(predicate);
  if (!found) throw new Error("Control not found");
  return found;
}
function call(node: Element, handler: string, event?: unknown) { return (node.props[handler] as (event: unknown) => unknown)(event); }
function render(props: ComponentProps<typeof DeclarativeActorSheet>) {
  for (let attempt = 0; attempt < 20; attempt++) {
    hooks.cursor = 0; hooks.changed = false; hooks.effects = [];
    const node = DeclarativeActorSheet(props);
    for (const effect of hooks.effects) effect();
    if (!hooks.changed) return node;
  }
  throw new Error("Effects did not settle");
}
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const actor = { id: "actor", campaignId: "campaign", systemId: "custom", type: "hero", name: "Hero", data: { focus: 3, untouched: { name: "original" } }, permissions: {}, createdAt: "r1", updatedAt: "r1" } as Actor;
const sheet: Sheet = { kind: "declarative-v1", actorId: actor.id, actorUpdatedAt: actor.updatedAt, system: { systemId: actor.systemId, version: "1.0.0", checksum: "a".repeat(64) }, fields: [{ path: ["focus"], label: "Focus", editable: true, required: true, present: true, value: 3, schema: { type: "integer", minimum: 0, maximum: 10 } }], quickRolls: [{ id: "act", label: "Act", available: true, formula: "2d6+3", issues: [] }] };
const props = (): ComponentProps<typeof DeclarativeActorSheet> => ({ campaignId: "campaign", currentUserId: "user", actor, sheet, canEdit: true, canRoll: true, onUpdated: vi.fn(), onRefresh: vi.fn() });

beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.changed = false; hooks.effects = []; hooks.apiPatch.mockReset(); hooks.apiPost.mockReset(); });

describe("declarative sheet mutation lifecycle", () => {
  it("keeps the failed draft and retries the original payload after a newer actor revision arrives", async () => {
    const input = props();
    let node = render(input);
    call(find(node, (item) => item.props["aria-label"] === "Focus"), "onChange", { currentTarget: { value: "4" } });
    node = render(input);
    hooks.apiPatch.mockRejectedValue(new Error("Connection lost"));
    call(find(node, (item) => item.type === "form"), "onSubmit", { preventDefault() {} });
    await settle();
    node = render({ ...input, actor: { ...actor, updatedAt: "r2", data: { focus: 8 } } });
    expect(find(node, (item) => item.props["aria-label"] === "Focus").props.value).toBe("4");
    call(find(node, (item) => item.type === RetryableActionNotice), "onRetry");
    await settle();
    expect(hooks.apiPatch).toHaveBeenCalledTimes(2);
    const first = hooks.apiPatch.mock.calls[0]!;
    const retry = hooks.apiPatch.mock.calls[1]!;
    expect(retry[1]).toBe(first[1]);
    expect(retry[1]).toEqual({ expectedUpdatedAt: "r1", data: { focus: 4, untouched: { name: "original" } } });
    expect(retry[2].idempotencyKey).toBe(first[2].idempotencyKey);
    expect(input.onUpdated).not.toHaveBeenCalled();
  });

  it.each(["user", "campaign", "actor", "unmount"])("aborts a pending roll and ignores its delayed result after a %s scope change", async (change) => {
    const input = props();
    let resolve!: (value: unknown) => void;
    hooks.apiPost.mockImplementation(() => new Promise((complete) => { resolve = complete; }));
    const node = render(input);
    call(find(node, (item) => item.props["aria-label"] === "Roll Act"), "onClick");
    const signal = hooks.apiPost.mock.calls[0]![2].signal as AbortSignal;
    if (change === "unmount") {
      for (const value of hooks.values) (value as { cleanup?: () => void } | undefined)?.cleanup?.();
    } else render({ ...input, ...(change === "user" ? { currentUserId: "other" } : change === "campaign" ? { campaignId: "other" } : { actor: { ...actor, id: "other" } }) });
    expect(signal.aborted).toBe(true);
    resolve({ actor: { ...actor, updatedAt: "r2" }, sheet, quickRoll: sheet.quickRolls[0], roll: { total: 9 } });
    await settle();
    expect(input.onUpdated).not.toHaveBeenCalled();
  });
});
