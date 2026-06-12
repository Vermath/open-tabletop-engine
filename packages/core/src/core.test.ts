import { describe, expect, it } from "vitest";
import { approveProposal, applyProposal, buildSmoothFogBrushPolygon, computeFogRevealPolygon, computeLightVisionPolygon, computeLightVisionPolygons, computeTokenVisionPolygon, computeTokenVisionPolygons, hasPermission, isPointInsideVisionPolygon, rejectProposal, seedState, tokenCenter } from "./index.js";

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

  it("applies campaign role grants without exposing plugin grants to users", () => {
    const state = seedState();
    const baseInput = {
      userId: "usr_demo_player",
      campaignId: "camp_demo",
      members: state.members,
      grants: state.permissionGrants
    };
    expect(hasPermission({ ...baseInput, permission: "journal.create" })).toBe(false);
    state.permissionGrants.push({
      id: "grant_role_player_journal",
      subjectType: "role",
      subjectId: "player",
      campaignId: "camp_demo",
      permissions: ["journal.create"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    state.permissionGrants.push({
      id: "grant_plugin_journal",
      subjectType: "plugin",
      subjectId: "example-macro-plugin",
      campaignId: "camp_demo",
      permissions: ["journal.delete"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(hasPermission({ ...baseInput, permission: "journal.create" })).toBe(true);
    expect(hasPermission({ ...baseInput, permission: "journal.delete" })).toBe(false);
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
    expect(approved.history).toEqual([expect.objectContaining({ action: "approved", status: "approved", previousStatus: "pending", actorUserId: "usr_demo_gm", auditAction: "proposal.approved" })]);
    expect(() => approveProposal(approved, "usr_demo_gm")).toThrow("pending");
    expect(applyProposal({ ...state, proposals: [approved] }, approved, "usr_demo_gm").journals).toHaveLength(2);
    const applied = applyProposal({ ...state, proposals: [approved] }, approved, "usr_demo_gm").proposals[0]!;
    expect(applied.history).toEqual(expect.arrayContaining([expect.objectContaining({ action: "applied", status: "applied", previousStatus: "approved", actorUserId: "usr_demo_gm", auditAction: "proposal.applied" })]));
    expect(() => applyProposal({ ...state, proposals: [applied] }, applied)).toThrow("approved");
    const rejected = rejectProposal(proposal, "usr_demo_gm");
    expect(rejected.status).toBe("rejected");
    expect(rejected.history).toEqual([expect.objectContaining({ action: "rejected", status: "rejected", previousStatus: "pending", actorUserId: "usr_demo_gm", auditAction: "ai.proposal.rejected" })]);
    expect(() => applyProposal({ ...state, proposals: [rejected] }, rejected)).toThrow("approved");
    expect(() => rejectProposal(applied)).toThrow("pending or approved");
  });

  it("copies only collections touched by proposal application", () => {
    const state = seedState();
    const originalToken = state.tokens.find((item) => item.id === "tok_valen")!;
    const proposal = {
      id: "prop_copy_scope",
      campaignId: "camp_demo",
      createdByType: "ai" as const,
      title: "Move token and add note",
      summary: "Move a token and add a journal entry",
      status: "approved" as const,
      approvalRequired: true,
      changesJson: [
        {
          entity: "token" as const,
          action: "update" as const,
          id: "tok_valen",
          data: { x: originalToken.x + 50 }
        },
        {
          entity: "journal" as const,
          action: "create" as const,
          data: {
            id: "jnl_copy_scope",
            campaignId: "camp_demo",
            title: "Copy scope",
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
    state.proposals = [proposal];

    const next = applyProposal(state, proposal, "usr_demo_gm");

    expect(state.tokens[0]).toBe(originalToken);
    expect(state.tokens[0]!.x).toBe(originalToken.x);
    expect(state.journals).toHaveLength(1);
    expect(state.proposals[0]!.status).toBe("approved");

    expect(next.tokens).not.toBe(state.tokens);
    expect(next.tokens[0]).not.toBe(originalToken);
    expect(next.tokens[0]!.x).toBe(originalToken.x + 50);
    expect(next.journals).not.toBe(state.journals);
    expect(next.journals).toHaveLength(2);
    expect(next.proposals).not.toBe(state.proposals);
    expect(next.proposals[0]!.status).toBe("applied");

    expect(next.users).toBe(state.users);
    expect(next.campaigns).toBe(state.campaigns);
    expect(next.scenes).toBe(state.scenes);
    expect(next.actors).toBe(state.actors);
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

  it("ignores degenerate vision wall segments when computing polygons", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const token = state.tokens.find((item) => item.id === "tok_valen")!;
    token.visionRadius = 220;
    scene.walls = [{ id: "wall_degenerate", x1: 325, y1: 375, x2: 325, y2: 375, blocksVision: true }];

    const polygon = computeTokenVisionPolygon(scene, token)!;

    expect(polygon.points.length).toBeGreaterThan(32);
    expect(isPointInsideVisionPolygon({ x: 325, y: 375 }, polygon)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 475, y: 375 }, polygon)).toBe(true);
  });

  it("generates separate bright and dim token vision polygons when zone radii are configured", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const token = state.tokens.find((item) => item.id === "tok_valen")!;
    token.visionRadius = 240;
    token.brightVisionRadius = 80;
    token.dimVisionRadius = 240;
    scene.walls = [{ id: "wall_token_screen", x1: 200, y1: 300, x2: 600, y2: 300, blocksVision: true }];

    const polygons = computeTokenVisionPolygons(scene, token);

    expect(polygons.map((polygon) => polygon.lightLevel)).toEqual(["dim", "bright"]);
    expect(polygons.map((polygon) => polygon.radius)).toEqual([240, 80]);
    expect(isPointInsideVisionPolygon({ x: 325, y: 225 }, polygons[0]!)).toBe(false);
    expect(isPointInsideVisionPolygon({ x: 360, y: 375 }, polygons[1]!)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 500, y: 375 }, polygons[0]!)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 500, y: 375 }, polygons[1]!)).toBe(false);
  });

  it("uses the largest configured token vision zone as the outer radius", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const baseToken = state.tokens.find((item) => item.id === "tok_valen")!;
    scene.walls = [];
    const cases = [
      {
        name: "bright exceeds base",
        token: { ...baseToken, visionRadius: 30, brightVisionRadius: 60, dimVisionRadius: undefined },
        expectedRadii: [60]
      },
      {
        name: "bright exceeds dim",
        token: { ...baseToken, visionRadius: 30, brightVisionRadius: 60, dimVisionRadius: 30 },
        expectedRadii: [60]
      },
      {
        name: "dim exceeds bright",
        token: { ...baseToken, visionRadius: 30, brightVisionRadius: 30, dimVisionRadius: 90 },
        expectedRadii: [90, 30]
      },
      {
        name: "bright equals dim",
        token: { ...baseToken, visionRadius: 30, brightVisionRadius: 60, dimVisionRadius: 60 },
        expectedRadii: [60]
      },
      {
        name: "zero bright falls back to dim",
        token: { ...baseToken, visionRadius: 30, brightVisionRadius: 0, dimVisionRadius: 50 },
        expectedRadii: [50]
      },
      {
        name: "bright works without dim or base",
        token: { ...baseToken, visionRadius: 0, brightVisionRadius: 40, dimVisionRadius: 0 },
        expectedRadii: [40]
      }
    ];

    for (const testCase of cases) {
      const polygons = computeTokenVisionPolygons(scene, testCase.token);
      const expectedOuterRadius = testCase.expectedRadii[0]!;
      const center = tokenCenter(testCase.token);

      expect(polygons.map((polygon) => polygon.radius), testCase.name).toEqual(testCase.expectedRadii);
      expect(isPointInsideVisionPolygon({ x: center.x + expectedOuterRadius - 5, y: center.y }, polygons[0]!), testCase.name).toBe(true);
      expect(isPointInsideVisionPolygon({ x: center.x + expectedOuterRadius + 5, y: center.y }, polygons[0]!), testCase.name).toBe(false);
    }
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

  it("generates separate bright and dim light polygons when zone radii are configured", () => {
    const state = seedState();
    const scene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.walls = [{ id: "wall_light_screen", x1: 200, y1: 300, x2: 600, y2: 300, blocksVision: true, kind: "terrain", blocksMovement: false }];

    const polygons = computeLightVisionPolygons(scene, { id: "light_dual", x: 325, y: 375, radius: 240, brightRadius: 80, dimRadius: 240, color: "#a78bfa", intensity: 0.5 });

    expect(polygons.map((polygon) => polygon.lightLevel)).toEqual(["dim", "bright"]);
    expect(polygons.map((polygon) => polygon.radius)).toEqual([240, 80]);
    expect(polygons.every((polygon) => polygon.color === "#a78bfa")).toBe(true);
    expect(polygons[0]!.opacity).toBeLessThan(polygons[1]!.opacity!);
    expect(isPointInsideVisionPolygon({ x: 325, y: 225 }, polygons[0]!)).toBe(false);
    expect(isPointInsideVisionPolygon({ x: 360, y: 375 }, polygons[1]!)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 500, y: 375 }, polygons[0]!)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 500, y: 375 }, polygons[1]!)).toBe(false);
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
