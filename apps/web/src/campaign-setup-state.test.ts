import { describe, expect, it } from "vitest";
import { campaignSetupDraftLifetimeMs, campaignSetupDraftStorageKey, clearCampaignSetupDraft, defaultCampaignSetupDraft, loadCampaignSetupDraft, moveCampaignSetupRoute, saveCampaignSetupDraft, type CampaignSetupDraftScope } from "./campaign-setup-state.js";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    raw: values
  };
}

const scope: CampaignSetupDraftScope = { organizationId: "org-one", userId: "user-one", campaignId: "campaign-one" };

describe("campaign setup draft persistence", () => {
  it("round-trips safe input and route state within the exact campaign and user scope", () => {
    const storage = memoryStorage();
    const draft = { ...defaultCampaignSetupDraft(), name: "Resumable table", inviteEmail: "player@example.test", route: { step: "scene" as const, skipped: ["invitation" as const] } };
    saveCampaignSetupDraft(storage, scope, { ...draft, inviteToken: "must-not-persist" } as typeof draft, 1_000);

    expect(loadCampaignSetupDraft(storage, scope, 2_000)).toMatchObject({ status: "ready", draft });
    expect(storage.raw.get(campaignSetupDraftStorageKey(scope))).not.toContain("must-not-persist");
    expect(loadCampaignSetupDraft(storage, { ...scope, userId: "user-two" }, 2_000)).toEqual({ status: "missing" });
    expect(loadCampaignSetupDraft(storage, { ...scope, campaignId: "campaign-two" }, 2_000)).toEqual({ status: "missing" });
  });

  it("explains expired and incompatible drafts without silently applying them", () => {
    const storage = memoryStorage();
    saveCampaignSetupDraft(storage, scope, defaultCampaignSetupDraft(), 1_000);
    expect(loadCampaignSetupDraft(storage, scope, 1_000 + campaignSetupDraftLifetimeMs)).toMatchObject({ status: "expired" });

    const key = campaignSetupDraftStorageKey(scope);
    storage.setItem(key, JSON.stringify({ version: 99, scope, savedAt: 1_000, expiresAt: 9_999, draft: defaultCampaignSetupDraft() }));
    expect(loadCampaignSetupDraft(storage, scope, 2_000)).toMatchObject({ status: "incompatible" });
    clearCampaignSetupDraft(storage, scope);
    expect(loadCampaignSetupDraft(storage, scope, 2_000)).toEqual({ status: "missing" });
  });

  it("restores forward, back, skip, and direct revisit routes", () => {
    const start = defaultCampaignSetupDraft().route;
    const scene = moveCampaignSetupRoute(start, "next");
    const invitation = moveCampaignSetupRoute(scene, "skip");
    expect(invitation).toEqual({ step: "invitation", skipped: ["scene"] });
    expect(moveCampaignSetupRoute(invitation, "back").step).toBe("scene");
    expect(moveCampaignSetupRoute(invitation, "campaign").step).toBe("campaign");
  });
});
