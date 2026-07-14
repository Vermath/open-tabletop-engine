import type {
  CampaignArchiveVersion,
  CampaignCompatibilityIssue,
  CampaignCompatibilityReport,
  CampaignCompatibilityStatus
} from "./types.js";

export const CURRENT_CAMPAIGN_ARCHIVE_VERSION: CampaignArchiveVersion = "0.2.0";
export const SUPPORTED_CAMPAIGN_ARCHIVE_VERSIONS: CampaignArchiveVersion[] = ["0.1.0", "0.2.0"];

const severityRank: Record<CampaignCompatibilityIssue["severity"], number> = {
  blocking: 0,
  warning: 1
};

export function orderCampaignCompatibilityIssues(issues: CampaignCompatibilityIssue[]): CampaignCompatibilityIssue[] {
  return [...issues].sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity] ||
    left.group.localeCompare(right.group) ||
    left.code.localeCompare(right.code) ||
    (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
    left.id.localeCompare(right.id)
  );
}

export function summarizeCampaignCompatibility(
  issues: CampaignCompatibilityIssue[],
  compatibleChecks = 0
): CampaignCompatibilityReport["summary"] & { status: CampaignCompatibilityStatus } {
  const blocking = issues.filter((issue) => issue.severity === "blocking").length;
  const warning = issues.filter((issue) => issue.severity === "warning").length;
  return {
    status: blocking > 0 ? "blocking" : warning > 0 ? "warning" : "compatible",
    compatible: Math.max(0, Math.floor(compatibleChecks)),
    warning,
    blocking,
    totalIssues: warning + blocking
  };
}
