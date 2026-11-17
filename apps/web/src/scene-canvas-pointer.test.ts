import type { Token, VisionPoint } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { editedAnnotationPoints, finishedTokenDragChanges, type AnnotationMoveDraft, type TokenDragDraft } from "./scene-canvas.js";

const scene = { width: 300, height: 200, gridSize: 50, gridType: "square" as const };

function token(id: string, x: number, y: number): Token {
  return {
    id, x, y, sceneId: "scene", name: id, width: 50, height: 50, rotation: 0,
    layer: "player", hidden: false, locked: false, visionEnabled: true,
    visionRadius: 160, disposition: "neutral", metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function drag(tokens: Token[], x = tokens[0]!.x, y = tokens[0]!.y): TokenDragDraft {
  const first = tokens[0]!;
  return {
    tokenId: first.id, pointerId: 1, offsetX: 25, offsetY: 25,
    startX: first.x, startY: first.y, x, y,
    origins: Object.fromEntries(tokens.map((item) => [item.id, { x: item.x, y: item.y, width: item.width, height: item.height }]))
  };
}

function annotation(points: VisionPoint[]): AnnotationMoveDraft {
  return { annotationId: "annotation", pointerId: 1, mode: "move", start: { x: 100, y: 100 }, current: { x: 100, y: 100 }, points, originalPoints: points };
}

describe("pointer token drag completion", () => {
  it("selects a precisely placed token without moving it or producing a history change", () => {
    const tokens = [token("fine", 101, 100)];
    expect(finishedTokenDragChanges(scene, tokens, drag(tokens))).toEqual([]);
    expect(tokens[0]).toMatchObject({ x: 101, y: 100 });
  });

  it("does not snap any member of a selected group on click", () => {
    const tokens = [token("a", 101, 100), token("b", 161, 102)];
    expect(finishedTokenDragChanges(scene, tokens, drag(tokens))).toEqual([]);
  });

  it("snaps a real drag and reports the changed position", () => {
    const tokens = [token("a", 101, 100)];
    expect(finishedTokenDragChanges(scene, tokens, drag(tokens, 142, 127))).toEqual([
      { token: tokens[0], position: { x: 150, y: 150 } }
    ]);
  });

  it("preserves group spacing when snapping would push a follower over the edge", () => {
    const tokens = [token("a", 151, 100), token("b", 211, 102)];
    const changes = finishedTokenDragChanges(scene, tokens, drag(tokens, 190, 125));
    expect(changes.map((change) => change.position)).toEqual([{ x: 190, y: 148 }, { x: 250, y: 150 }]);
  });

  it("preserves exact movement on gridless scenes and treats returning to the origin as no change", () => {
    const tokens = [token("a", 101, 100)];
    expect(finishedTokenDragChanges({ ...scene, gridType: "gridless" }, tokens, drag(tokens, 142, 127))[0]?.position).toEqual({ x: 142, y: 127 });
    expect(finishedTokenDragChanges(scene, tokens, { ...drag(tokens, 150, 100), x: 101 })).toEqual([]);
  });
});

describe("annotation translation", () => {
  it.each([
    [{ x: 500, y: 500 }, [{ x: 180, y: 120 }, { x: 300, y: 200 }]],
    [{ x: -500, y: -500 }, [{ x: 0, y: 0 }, { x: 120, y: 80 }]]
  ])("stops a line at the scene boundary without shortening it", (point, expected) => {
    const draft = annotation([{ x: 30, y: 40 }, { x: 150, y: 120 }]);
    expect(editedAnnotationPoints(scene, draft, point as VisionPoint)).toEqual(expected);
  });

  it("preserves every vertex of a shape, including fractional spacing", () => {
    const points = [{ x: 10.5, y: 20 }, { x: 40.75, y: 20 }, { x: 40.75, y: 60.25 }, { x: 10.5, y: 60.25 }];
    const moved = editedAnnotationPoints(scene, annotation(points), { x: 500, y: -100 });
    expect(moved).toEqual([{ x: 269.75, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 40.25 }, { x: 269.75, y: 40.25 }]);
    expect(points[0]).toEqual({ x: 10.5, y: 20 });
  });

  it("uses a shared grid delta and produces idempotent boundary coordinates for the API", () => {
    const edgeScene = { ...scene, width: 325 };
    const draft = { ...annotation([{ x: 200, y: 100 }, { x: 300, y: 100 }]), snapToGrid: true };
    const points = editedAnnotationPoints(edgeScene, draft, { x: 180, y: 100 });
    expect(points).toEqual([{ x: 225, y: 100 }, { x: 325, y: 100 }]);
    expect(editedAnnotationPoints(edgeScene, draft, { x: 125, y: 100 })).toEqual(points);
    expect(editedAnnotationPoints(edgeScene, draft, { x: 110, y: 100 })).toEqual(draft.originalPoints);
    expect(editedAnnotationPoints({ ...edgeScene, gridType: "gridless" }, draft, { x: 110, y: 100 })).toEqual([{ x: 210, y: 100 }, { x: 310, y: 100 }]);
  });

  it("keeps non-grid originating geometry when a small boundary delta is re-applied", () => {
    const draft = { ...annotation([{ x: 20, y: 100 }, { x: 120, y: 100 }]), snapToGrid: true };
    expect(editedAnnotationPoints(scene, draft, { x: 0, y: 100 })).toEqual([{ x: 0, y: 100 }, { x: 100, y: 100 }]);
    expect(editedAnnotationPoints(scene, draft, { x: 80, y: 100 })).toEqual([{ x: 0, y: 100 }, { x: 100, y: 100 }]);
  });

  it("still permits bounded editing of an individual endpoint", () => {
    const draft = { ...annotation([{ x: 30, y: 40 }, { x: 150, y: 120 }]), mode: "point" as const, pointIndex: 1 };
    expect(editedAnnotationPoints(scene, draft, { x: 400, y: -50 })).toEqual([{ x: 30, y: 40 }, { x: 300, y: 0 }]);
  });
});
