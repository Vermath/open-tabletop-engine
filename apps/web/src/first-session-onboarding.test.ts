import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const journalPanelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("first-session onboarding", () => {
  it("opts the setup wizard into API starter content by default", () => {
    expect(appSource).toContain("setupStarterContent");
    expect(appSource).toContain('aria-label="Include starter content"');
    expect(appSource).toContain("starterContent: setupStarterContent");
    expect(appSource).toContain('scene.name === "First Session"');
  });

  it("keeps setup wizard scene and handout controls on the bare campaign path", () => {
    expect(appSource).toContain("if (!setupStarterContent && !progress.scene)");
    expect(appSource).toContain("if (!setupStarterContent && !progress.onboardingCreated)");
    expect(appSource).toContain("Setup initial scene name");
    expect(appSource).toContain("Setup onboarding title");
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
    expect(appSource).toContain('className="campaign-setup-fieldset" disabled={isCreatingCampaignSetup || campaignSetupRecoveryPending}');
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
    expect(appSource).toContain("Creating campaign...");
    expect(appSource).toContain("Retry Campaign Setup");
    expect(appSource).toContain("Cancel setup");
    expect(appSource).toContain("Keep campaign as-is");
  });

  it("surfaces a shareable invite link instead of only a raw token", () => {
    expect(appSource).toContain("setInviteAcceptUrl(absoluteInviteUrl(");
    expect(appSource).toContain('aria-label="Invite link"');
    expect(appSource).toContain("copyInviteLink()");
    expect(appSource).toContain('setInviteAcceptUrl("")');
    expect(appSource).toContain("progress.inviteEmail");
    expect(appSource).toContain("progress.inviteRole");
    expect(appSource).toContain("inviteLinkRef.current?.focus()");
  });
});
