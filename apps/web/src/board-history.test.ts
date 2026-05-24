import type { Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyLocalBoardHistoryAction, createTokenCopies } from "./board-history";

function token(input: Partial<Token> & Pick<Token, "id" | "sceneId" | "name" | "x" | "y">): Token {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    actorId: undefined,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player",
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 160,
    disposition: "neutral",
    metadata: {},
    ...input
  };
}

describe("board history", () => {
  it("applies token move undo locally without waiting for server state", () => {
    const tokens = [token({ id: "tok_a", sceneId: "scn_1", name: "A", x: 120, y: 160 })];

    const result = applyLocalBoardHistoryAction(tokens, {
      kind: "tokens.move",
      changes: [{ tokenId: "tok_a", before: { x: 80, y: 90 }, after: { x: 120, y: 160 } }]
    }, "undo");

    expect(result.tokens[0]).toMatchObject({ id: "tok_a", x: 80, y: 90 });
    expect(result.selectedTokenIds).toEqual(["tok_a"]);
  });

  it("applies token resize redo locally with frame changes", () => {
    const tokens = [token({ id: "tok_map", sceneId: "scn_1", name: "Map", x: 50, y: 50, width: 100, height: 100 })];

    const result = applyLocalBoardHistoryAction(tokens, {
      kind: "tokens.resize",
      changes: [{ tokenId: "tok_map", before: { x: 50, y: 50, width: 100, height: 100 }, after: { x: 50, y: 50, width: 200, height: 150 } }]
    }, "redo");

    expect(result.tokens[0]).toMatchObject({ id: "tok_map", x: 50, y: 50, width: 200, height: 150 });
    expect(result.selectedTokenIds).toEqual(["tok_map"]);
  });

  it("applies token delete undo locally with original ids preserved", () => {
    const deleted = token({ id: "tok_deleted", sceneId: "scn_1", name: "Deleted", x: 40, y: 40 });

    const result = applyLocalBoardHistoryAction([], { kind: "tokens.delete", tokens: [deleted] }, "undo");

    expect(result.tokens).toEqual([deleted]);
    expect(result.selectedTokenIds).toEqual(["tok_deleted"]);
  });

  it("creates copied tokens with new ids and a visible offset", () => {
    const source = token({ id: "tok_source", sceneId: "scn_1", name: "Source", x: 40, y: 50 });

    const [copy] = createTokenCopies([source], { idFactory: () => "tok_copy", offset: 25, now: () => "2026-01-02T00:00:00.000Z" });

    expect(copy).toMatchObject({ id: "tok_copy", sceneId: "scn_1", name: "Source Copy", x: 65, y: 75 });
    expect(copy?.createdAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
