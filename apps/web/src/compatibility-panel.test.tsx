import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CompatibilityPanel,
  campaignCompatibilityPath,
  compatibilityStatusLabel,
  compatibilityRepairValue,
  compatibilityVersionSummary,
} from "./compatibility-panel.js";

describe("CompatibilityPanel", () => {
  it("renders a permission-oriented, accessible loading surface", () => {
    const html = renderToStaticMarkup(<CompatibilityPanel campaignId="campaign/one" />);
    expect(html).toContain("GM / editor review");
    expect(html).toContain("Campaign compatibility");
    expect(html).toContain("Loading compatibility report...");
    expect(html).toContain('role="status"');
    expect(html).toContain("Refresh report");
  });

  it("formats status, version counts, and encoded API paths deterministically", () => {
    expect(compatibilityStatusLabel("compatible")).toBe("Compatible");
    expect(compatibilityStatusLabel("warning")).toBe("Review recommended");
    expect(compatibilityStatusLabel("blocking")).toBe("Blocking issues");
    expect(compatibilityVersionSummary({ "5.2.1": 2, "5.2.0": 1 })).toBe("5.2.0 (1), 5.2.1 (2)");
    expect(compatibilityVersionSummary({})).toBe("None");
    expect(compatibilityRepairValue(undefined)).toBe("missing");
    expect(compatibilityRepairValue(12)).toBe("12");
    expect(compatibilityRepairValue({ preserved: true })).toBe("structured value");
    expect(campaignCompatibilityPath("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/compatibility");
  });

  it("keeps read-only, retry, grouped issue, and permission-gated integration states explicit", () => {
    const source = readFileSync(resolve(__dirname, "compatibility-panel.tsx"), "utf8");
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8");
    expect(source).toContain("Retry report");
    expect(source).toContain("Nothing changed automatically");
    expect(source).toContain("Reversible repair preview");
    expect(source).toContain("candidate.inverse.operation");
    expect(source).toContain("report.systems.map");
    expect(source).toContain("groupedIssues.map");
    expect(source).toContain("Next step:");
    expect(source).toContain("<details");
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("console.");
    expect(appSource).toContain('hasPermission("campaign.update") && (');
    expect(appSource).toContain("<LazyCompatibilityPanel");
    expect(actorPanelSource).toContain("<CalculationExplanationPanel");
  });
});
