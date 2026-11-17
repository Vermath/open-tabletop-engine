import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveImportRollbackConfirmationReady, recoverDeletedArchiveImportWorkspace } from "./archive-import-recovery.js";

const componentSource = readFileSync(resolve(__dirname, "archive-import-recovery.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("archive import recovery UI", () => {
  it("requires the exact selected operation id before rollback", () => {
    expect(archiveImportRollbackConfirmationReady("arcimp_a", "arcimp_a")).toBe(true);
    expect(archiveImportRollbackConfirmationReady("arcimp_a", "arcimp_b")).toBe(false);
    expect(archiveImportRollbackConfirmationReady("arcimp_a", "")).toBe(false);
  });

  it("clears an imported-only campaign selection before loading the authoritative empty workspace", async () => {
    const events: string[] = [];
    const state = {
      campaignId: "camp_imported",
      sceneId: "scn_imported",
      operationIds: ["arcimp_a"],
      campaignIds: ["camp_imported"]
    };
    const authoritative = { campaignIds: [] as string[] };

    const result = await recoverDeletedArchiveImportWorkspace({
      clearRecoveryState: () => {
        events.push("clear-recovery");
        state.operationIds = [];
      },
      selectWorkspaceContext: (campaignId, sceneId) => {
        events.push(`select:${campaignId}:${sceneId}`);
        state.campaignId = campaignId;
        state.sceneId = sceneId;
      },
      refreshWorkspace: async (campaignId, sceneId) => {
        events.push(`refresh:${campaignId}:${sceneId}`);
        expect(state).toMatchObject({ campaignId: "", sceneId: "", operationIds: [] });
        state.campaignIds = authoritative.campaignIds;
        return authoritative;
      }
    });

    expect(events).toEqual(["clear-recovery", "select::", "refresh::"]);
    expect(state).toEqual({ campaignId: "", sceneId: "", operationIds: [], campaignIds: [] });
    expect(result).toBe(authoritative);
  });

  it("selects a surviving campaign before refreshing after rollback deletes the current campaign", async () => {
    const events: string[] = [];

    await recoverDeletedArchiveImportWorkspace({
      fallbackCampaignId: "camp_existing",
      clearRecoveryState: () => events.push("clear-recovery"),
      selectWorkspaceContext: (campaignId, sceneId) => events.push(`select:${campaignId}:${sceneId}`),
      refreshWorkspace: async (campaignId, sceneId) => events.push(`refresh:${campaignId}:${sceneId}`)
    });

    expect(events).toEqual(["clear-recovery", "select:camp_existing:", "refresh:camp_existing:"]);
  });

  it("keeps operation selection and impact confirmation in an extracted surface", () => {
    expect(componentSource).toContain('aria-label="Archive import rollback operations"');
    expect(componentSource).toContain("Review rollback impact");
    expect(componentSource).toContain("Type operation id to confirm rollback");
    expect(componentSource).toContain("changed or referenced records will be preserved");
    expect(appSource).toContain("<ArchiveImportRecovery");
    expect(appSource).toContain("archive-import-operations/${operationId}/preview");
    expect(appSource).toContain("archive-import-operations/${operationId}/rollback");
    expect(appSource).toContain("recoverDeletedArchiveImportWorkspace({ fallbackCampaignId");
    expect(appSource).not.toContain("rollback-before-${file.name}");
  });
});
