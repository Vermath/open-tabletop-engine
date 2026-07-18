import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const setupSource = readFileSync(resolve(__dirname, "campaign-setup-steps.tsx"), "utf8");
const backgroundCalibrationSource = readFileSync(resolve(__dirname, "scene-background-calibration.ts"), "utf8");
const journalPanelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("first-session onboarding", () => {
  it("opts the setup wizard into API starter content by default", () => {
    expect(appSource).toContain("setupStarterContent");
    expect(setupSource).toContain('aria-label="Include starter content"');
    expect(appSource).toContain("starterContent: setupStarterContent");
    expect(appSource).toContain('scene.name === "First Session"');
  });

  it("keeps setup wizard scene and handout controls on the bare campaign path", () => {
    expect(appSource).toContain("if (!setupStarterContent && !progress.scene)");
    expect(appSource).toContain("if (!setupStarterContent && !progress.onboardingCreated)");
    expect(setupSource).toContain("Setup initial scene name");
    expect(setupSource).toContain("Setup onboarding title");
  });

  it("makes empty states actionable without new flows", () => {
    expect(appSource).toContain("Create a scene to open the tabletop.");
    expect(appSource).toContain('aria-label="Create scene from empty board"');
    expect(appSource).toContain("createScene().catch");
    expect(appSource).toContain("No party actors yet.");
    expect(appSource).toContain('aria-label="Open character creator from party rail"');
    expect(journalPanelSource).toContain("Recap is ready after play.");
    expect(stylesSource).toContain("First-session onboarding empty-state CTAs");
  });

  it("hands completed setup to the next useful workspace without duplicate submissions", () => {
    expect(appSource).toContain("campaignSetupBusyRef.current");
    expect(appSource).toContain("campaignSetupProgressRef.current");
    expect(appSource).toContain("organizationId: activeOrganizationId");
    expect(appSource).toContain("userId: currentUserId");
    expect(setupSource).toContain('className="campaign-setup-fieldset" disabled={props.busy || props.recoveryPending}');
    expect(appSource).toContain("campaignSetupGenerationRef.current");
    expect(appSource).toContain("campaignSetupAbortRef.current");
    expect(appSource).toContain("campaignSetupIdempotencyRef.current");
    expect(appSource).toContain("idempotencyKey: setupIdempotencyKeys.campaign");
    expect(appSource).toContain("idempotencyKey: setupIdempotencyKeys.scene");
    expect(appSource).toContain("idempotencyKey: setupIdempotencyKeys.journal");
    expect(appSource).toContain("setupRequestIsCurrent()");
    expect(appSource).toContain('selectWorkspaceContext(campaign.id, progress.scene?.id ?? "", currentUserId, { preserveCampaignSetup: true });');
    expect(appSource).toContain("campaignSetupProgressRef.current = progress;");
    expect(appSource).toContain('resetWorkspaceNavigation("prep", setupStarterContent ? "sessions" : "content")');
    expect(appSource).toContain('setManageCategory("people")');
    expect(setupSource).toContain("Creating campaign...");
    expect(setupSource).toContain("Retry Campaign Setup");
    expect(setupSource).toContain("Cancel setup");
    expect(setupSource).toContain("Keep campaign as-is");
  });

  it("surfaces a shareable invite link instead of only a raw token", () => {
    expect(appSource).toContain("setInviteAcceptUrl(absoluteInviteUrl(");
    expect(appSource).toContain('aria-label="Invite link"');
    expect(appSource).toContain("copyInviteLink()");
    expect(appSource).toContain('setInviteAcceptUrl("")');
    expect(appSource).toContain("progress.inviteEmail");
    expect(appSource).toContain("progress.inviteRole");
    expect(appSource).toContain("focusInviteLinkAfterSetupRef.current = true");
    expect(appSource).toContain('workspaceMode !== "manage" || manageCategory !== "people" || !inviteAcceptUrl');
    expect(appSource).toContain("inviteLink.focus()");
  });

  it("makes map upload a recoverable background-to-calibration workflow", () => {
    expect(appSource).toContain('throw new Error("Select a scene before uploading a map.")');
    expect(appSource).toContain('setAsBackground: true');
    expect(appSource).toContain("selected: realtimeSelectionRef.current.sceneId === scene.id");
    expect(appSource).toContain("setGridCalibrationOpen(plan.calibrationOpen)");
    expect(backgroundCalibrationSource).toContain('if (scene.gridType === "gridless")');
    expect(appSource).toContain("resetSceneMapCalibration(uploaded.scene");
    expect(backgroundCalibrationSource).toContain('mapCalibrationComplete: scene.gridType === "gridless" && Boolean(scene.backgroundAssetId)');
    expect(appSource).toContain('mapCalibrationComplete: Boolean(targetScene.backgroundAssetId)');
    expect(appSource).toContain('Map upload failed: ${errorMessage(error)}');
    expect(appSource).toContain('finally(() => { input.value = ""; })');
    expect(appSource).toContain('disabled={!selectedScene || !hasPermission("scene.create") || !hasPermission("scene.update")}');
  });
});
