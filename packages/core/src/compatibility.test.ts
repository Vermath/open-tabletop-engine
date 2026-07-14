import { describe, expect, it } from "vitest";
import { orderCampaignCompatibilityIssues, summarizeCampaignCompatibility } from "./compatibility.js";
import type { CampaignCompatibilityIssue } from "./types.js";

const warning: CampaignCompatibilityIssue = {
  id: "warning-z",
  group: "manual",
  severity: "warning",
  code: "manual.review",
  title: "Review",
  detail: "Manual review required.",
  action: "Review the preserved field."
};

describe("campaign compatibility helpers", () => {
  it("produces deterministic blocking-first issue order and summaries", () => {
    const blocking: CampaignCompatibilityIssue = {
      ...warning,
      id: "blocking-a",
      group: "system",
      severity: "blocking",
      code: "system.missing"
    };
    expect(orderCampaignCompatibilityIssues([warning, blocking]).map((issue) => issue.id)).toEqual(["blocking-a", "warning-z"]);
    expect(summarizeCampaignCompatibility([warning, blocking], 4)).toEqual({
      status: "blocking",
      compatible: 4,
      warning: 1,
      blocking: 1,
      totalIssues: 2
    });
    expect(summarizeCampaignCompatibility([], 3).status).toBe("compatible");
  });
});
