import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("Archive UI authority", () => {
  it("requires campaign.update instead of organization owner or admin status", () => {
    const authority = appSource.match(/const canManageArchives = ([^;]+);/)?.[1];

    expect(authority).toBe('hasPermission("campaign.update")');
    expect(authority).not.toContain("canManageActiveOrganization");
  });

  it("uses the exact archive authority for visibility, stale selection, and recovery loading", () => {
    expect(appSource).toContain('visible: canManageArchives');
    expect(appSource).toContain('if (manageCategory === "archives" && !canManageArchives) setManageCategory("account");');
    expect(appSource).toContain('if (!snapshotReady || blankCanvasDemoOpen || !campaignId || !canManageArchives)');
    expect(appSource).toContain('{activeManageCategory === "archives" && (');
  });
});
