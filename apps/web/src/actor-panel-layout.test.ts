import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("actor panel layout", () => {
  it("keeps dense actor and token details collapsed in the inspector and exposes a wide sheet surface", () => {
    expect(appSource).toContain("actor-sidebar-summary");
    expect(appSource).toContain("actor-detail-disclosure");
    expect(appSource).toContain("actor-token-editor");
    expect(stylesSource).toContain(".actor-sheet-dialog");
    expect(stylesSource).toContain(".actor-sidebar-summary");
  });

  it("keeps party and adversary rails separate and scrollable", () => {
    expect(appSource).toContain('aria-label="Adversaries"');
    expect(appSource).toContain("isAdversaryActor");
    expect(stylesSource).toContain(".party-rail.adversary-rail");
    expect(stylesSource).toContain("max-height: min(34svh, 320px);");
    expect(stylesSource).toContain("overflow: auto;");
  });

  it("lets users stop a running AI agent turn and removes the old AI edit-layer control", () => {
    expect(appSource).toContain("stopAiAgentTurn");
    expect(appSource).toContain("ai-agent-stop-button");
    expect(appSource).toContain("Agent turn stopped.");
    expect(appSource).not.toContain('aria-label="AI edit layer controls"');
  });

  it("keeps board tokens readable inside a full grid square", () => {
    expect(appSource).toContain("const tokenVisualScale = 0.92;");
    expect(appSource).toContain("const largeTokenVisualScale = 0.96;");
    expect(appSource).toContain("tokenCoordinatesFromCenter");
  });

  it("exposes token resize handles and selectable map backgrounds on the board", () => {
    expect(appSource).toContain("tokenResizeHandles");
    expect(appSource).toContain("onTokenResizeCommit");
    expect(appSource).toContain("scene-map-hitbox");
    expect(appSource).toContain("tokenResizeHandleAtPoint");
    expect(stylesSource).toContain(".token-resize-handle");
    expect(stylesSource).toContain("pointer-events: none");
    expect(stylesSource).toContain(".scene-map-hitbox.selected");
  });

  it("opens the real sign-in surface when agent calls lose the session token", () => {
    expect(appSource).toContain("function requireInteractiveSignIn");
    expect(appSource).toContain("clearSession();");
    expect(appSource).toContain("isSessionAuthError(error)");
    expect(appSource).toContain("Sign in required.");
  });

  it("removes stale missing proposals from the agent panel instead of keeping dead actions", () => {
    expect(appSource).toContain("isProposalNotFoundError(error)");
    expect(appSource).toContain("Proposal no longer exists");
    expect(appSource).toContain("proposals: current.proposals.filter((item) => item.id !== proposal.id)");
  });
});
