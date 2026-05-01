import { describe, expect, it } from "vitest";
import { approveProposal, applyProposal, buildSmoothFogBrushPolygon, computeFogRevealPolygon, computeLightVisionPolygon, computeTokenVisionPolygon, hasPermission, isPointInsideVisionPolygon, seedState, tokenCenter } from "./index.js";

describe("core permissions", () => {
  it("gives owners full campaign authority and keeps observers read-only", () => {
    const state = seedState();
    expect(
      hasPermission({
        userId: "usr_demo_gm",
        campaignId: "camp_demo",
        permission: "ai.applyChanges",
        members: state.members,
        grants: state.permissionGrants
      })
    ).toBe(true);
  });
});

describe("proposal application", () => {
  it("requires approval before mutating state", () => {
    const state = seedState();
    const proposal = {
      id: "prop_test",
      campaignId: "camp_demo",
      createdByType: "ai" as const,
      title: "Add note",
      summary: "Draft a note",
      status: "pending" as const,
      approvalRequired: true,
      changesJson: [
        {
          entity: "journal" as const,
          action: "create" as const,
          data: {
            id: "jnl_new",
            campaignId: "camp_demo",
            title: "New note",
            body: "Text",
            visibility: "gm_only",
            visibleToUserIds: [],
            visibleToActorIds: [],
            tags: [],
            createdBy: "usr_demo_gm",
            updatedBy: "usr_demo_gm",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        }
      ],
      diffJson: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    expect(() => applyProposal(state, proposal)).toThrow("approved");
    const approved = approveProposal(proposal, "usr_demo_gm");
    expect(applyProposal({ ...state, proposals: [approved] }, approved).journals).toHaveLength(2);
  });
});

describe("vision polygons", () => {
  it("clips token sight at vision-blocking walls", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const token = state.tokens.find((item) => item.id === "tok_valen")!;
    scene.walls = [{ id: "wall_screen", x1: 200, y1: 300, x2: 600, y2: 300, blocksVision: true }];
    token.visionRadius = 220;

    const polygon = computeTokenVisionPolygon(scene, token)!;

    expect(polygon.points.length).toBeGreaterThan(32);
    expect(isPointInsideVisionPolygon(tokenCenter(token), polygon)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 325, y: 225 }, polygon)).toBe(false);
    expect(isPointInsideVisionPolygon({ x: 475, y: 375 }, polygon)).toBe(true);
  });

  it("clips colored light polygons with the same wall geometry", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.walls = [{ id: "wall_light_screen", x1: 200, y1: 300, x2: 600, y2: 300, blocksVision: true, kind: "terrain", blocksMovement: false }];

    const polygon = computeLightVisionPolygon(scene, { id: "light_blue", x: 325, y: 375, radius: 220, color: "#38bdf8", intensity: 0.42 });

    expect(polygon.color).toBe("#38bdf8");
    expect(polygon.opacity).toBe(0.42);
    expect(isPointInsideVisionPolygon({ x: 325, y: 225 }, polygon)).toBe(false);
    expect(isPointInsideVisionPolygon({ x: 475, y: 375 }, polygon)).toBe(true);
  });

  it("supports polygon fog regions and hide fog modes", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;

    const revealPolygon = computeFogRevealPolygon(scene, {
      id: "fog_polygon",
      x: 0,
      y: 0,
      radius: 0,
      hidden: false,
      shape: "polygon",
      mode: "reveal",
      points: [
        { x: 700, y: 260 },
        { x: 860, y: 260 },
        { x: 860, y: 420 },
        { x: 700, y: 420 }
      ]
    })!;
    const hideBrush = computeFogRevealPolygon(scene, { id: "fog_hide", x: 780, y: 340, radius: 40, hidden: false, mode: "hide" })!;

    expect(revealPolygon.mode).toBe("reveal");
    expect(hideBrush.mode).toBe("hide");
    expect(isPointInsideVisionPolygon({ x: 720, y: 320 }, revealPolygon)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 780, y: 340 }, hideBrush)).toBe(true);
  });

  it("smooths noisy freehand fog brush strokes into bounded polygons", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const rawStroke = Array.from({ length: 90 }, (_, index) => ({
      x: 120 + index * 10,
      y: 250 + Math.sin(index / 2) * 18 + (index % 2 === 0 ? 9 : -9)
    }));

    const brush = buildSmoothFogBrushPolygon(scene, rawStroke, { radius: 42 })!;

    expect(brush.radius).toBe(42);
    expect(brush.points.length).toBeGreaterThan(8);
    expect(brush.points.length).toBeLessThanOrEqual(64);
    expect(brush.points.every((point) => point.x >= 0 && point.x <= scene.width && point.y >= 0 && point.y <= scene.height)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 530, y: 250 }, brush.points)).toBe(true);
  });
});
