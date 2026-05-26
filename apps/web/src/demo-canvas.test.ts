import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blankCanvasDemoCampaignId, blankCanvasDemoNotice, blankCanvasDemoSceneId, blankCanvasDemoUserId, createBlankCanvasDemoSnapshot } from "./blank-canvas-demo.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("blank canvas demo", () => {
  it("builds a blank campaign snapshot for the normal tabletop shell", () => {
    const snapshot = createBlankCanvasDemoSnapshot("2026-05-26T12:00:00.000Z");
    const permissions = snapshot.members[0]?.permissions ?? [];

    expect(snapshot.session?.user.id).toBe(blankCanvasDemoUserId);
    expect(snapshot.campaigns[0]).toMatchObject({
      id: blankCanvasDemoCampaignId,
      name: "Blank Canvas Demo",
      ownerUserId: blankCanvasDemoUserId
    });
    expect(snapshot.scenes[0]).toMatchObject({
      id: blankCanvasDemoSceneId,
      campaignId: blankCanvasDemoCampaignId,
      name: "Blank Canvas",
      active: true,
      width: 1200,
      height: 800,
      gridType: "square",
      gridSize: 50
    });
    expect(snapshot.tokens).toEqual([]);
    expect(permissions).toEqual(
      expect.arrayContaining([
        "campaign.read",
        "campaign.update",
        "scene.read",
        "scene.create",
        "scene.update",
        "scene.delete",
        "scene.activate",
        "token.read",
        "token.create",
        "token.update",
        "token.move",
        "token.delete",
        "token.reveal",
        "actor.read",
        "actor.create",
        "actor.update",
        "actor.delete",
        "actor.readPrivate",
        "journal.readSecret",
        "journal.create",
        "journal.update",
        "chat.moderate",
        "combat.manage",
        "plugin.install",
        "plugin.configure",
        "dice.roll",
        "ai.use",
        "ai.readGmMemory",
        "ai.proposeChanges",
        "ai.applyChanges"
      ])
    );

    expect(blankCanvasDemoNotice).toContain("reset");
    expect(blankCanvasDemoNotice).toContain("refresh");
  });

  it("enters stateless demo mode through the existing app experience", () => {
    expect(appSource).toContain("startBlankCanvasDemo");
    expect(appSource).toContain("Try Blank Canvas");
    expect(appSource).toContain("createBlankCanvasDemoSnapshot()");
    expect(appSource).toContain("blankCanvasDemoOpen");
    expect(appSource).toContain("demo-mode-banner");
    expect(appSource).toContain("persistSceneCanvasTokenMove");
    expect(appSource).toContain("persistSceneCanvasTokenResize");
    expect(appSource).toContain("submitBlankCanvasDemoAiAgentTurn");
    expect(appSource).toContain("applyBlankCanvasDemoProposal");
    expect(appSource).toContain("setStatelessDemoApiMode(true)");
    expect(appSource).not.toContain("!blankCanvasDemoOpen && aiAgentOpen");
    expect(appSource).not.toContain("{!blankCanvasDemoOpen && (");
    expect(appSource).not.toContain("<DemoCanvas");
    expect(appSource).not.toContain('from "./DemoCanvas.js"');
  });
});
