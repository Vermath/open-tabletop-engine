import { describe, expect, it, vi } from "vitest";
import { forwardingHandlers, stableBySignature, type SignatureCache } from "./board-render-stability.js";

const json = (value: unknown) => JSON.stringify(value) ?? "undefined";

describe("keeping references stable across reconciled snapshots", () => {
  it("returns the first value and computes its signature once", () => {
    const cache: SignatureCache<{ id: string }[]> = { filled: false };
    const signature = vi.fn(json);
    const walls = [{ id: "a" }];
    expect(stableBySignature(cache, walls, signature)).toBe(walls);
    expect(stableBySignature(cache, walls, signature)).toBe(walls);
    expect(stableBySignature(cache, walls, signature)).toBe(walls);
    expect(signature).toHaveBeenCalledTimes(1);
  });

  it("keeps the old reference when a new object has the same content", () => {
    const cache: SignatureCache<{ id: string; x: number }[]> = { filled: false };
    const first = [{ id: "a", x: 1 }];
    stableBySignature(cache, first, json);
    const reloaded = [{ id: "a", x: 1 }];
    expect(stableBySignature(cache, reloaded, json)).toBe(first);
    // The reloaded object is remembered, so the next render with it does no work.
    const signature = vi.fn(json);
    expect(stableBySignature(cache, reloaded, signature)).toBe(first);
    expect(signature).not.toHaveBeenCalled();
  });

  it("adopts a new object whose content differs, and then holds that one", () => {
    const cache: SignatureCache<{ id: string; x: number }[]> = { filled: false };
    const first = [{ id: "a", x: 1 }];
    stableBySignature(cache, first, json);
    const moved = [{ id: "a", x: 2 }];
    expect(stableBySignature(cache, moved, json)).toBe(moved);
    expect(stableBySignature(cache, [{ id: "a", x: 2 }], json)).toBe(moved);
    // Going back to the earlier content is a change too: only the latest value is held.
    const back = [{ id: "a", x: 1 }];
    expect(stableBySignature(cache, back, json)).toBe(back);
  });

  it("treats undefined as a value like any other", () => {
    const cache: SignatureCache<{ id: string } | undefined> = { filled: false };
    expect(stableBySignature(cache, undefined, json)).toBeUndefined();
    const vision = { id: "v" };
    expect(stableBySignature(cache, vision, json)).toBe(vision);
    expect(stableBySignature(cache, undefined, json)).toBeUndefined();
    expect(stableBySignature(cache, { id: "v" }, json)).toEqual(vision);
  });

  it("does not confuse an empty list with a missing one", () => {
    const cache: SignatureCache<unknown> = { filled: false };
    const empty: unknown[] = [];
    expect(stableBySignature(cache, empty, json)).toBe(empty);
    expect(stableBySignature(cache, undefined, json)).toBeUndefined();
    expect(stableBySignature(cache, null, json)).toBeNull();
  });
});

describe("stable handler objects", () => {
  it("keeps one identity while always running the current implementation", () => {
    let current = { select: (id: string) => `first:${id}`, clear: () => "first" };
    const handlers = forwardingHandlers<typeof current>(["select", "clear"], () => current);
    const select = handlers.select;
    expect(handlers.select("a")).toBe("first:a");
    current = { select: (id: string) => `second:${id}`, clear: () => "second" };
    expect(handlers.select).toBe(select);
    expect(handlers.select("a")).toBe("second:a");
    expect(handlers.clear()).toBe("second");
  });

  it("passes every argument through and returns the result", () => {
    const implementation = { move: vi.fn((id: string, x: number, y: number) => x + y + id.length) };
    const handlers = forwardingHandlers<typeof implementation>(["move"], () => implementation);
    expect(handlers.move("tok", 2, 3)).toBe(8);
    expect(implementation.move).toHaveBeenCalledWith("tok", 2, 3);
  });

  it("exposes exactly the named handlers", () => {
    const implementation = { a: () => 1, b: () => 2 };
    expect(Object.keys(forwardingHandlers<typeof implementation>(["a", "b"], () => implementation)).sort()).toEqual(["a", "b"]);
  });
});
