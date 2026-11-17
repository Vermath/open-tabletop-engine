import type {
  CampaignCompatibilityIssue,
  CampaignCompatibilityIssueGroup,
  CampaignCompatibilityReport,
  CampaignCompatibilityStatus,
} from "@open-tabletop/core";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api.js";

interface CompatibilityPanelProps {
  campaignId: string;
}

const compatibilityGroups: CampaignCompatibilityIssueGroup[] = [
  "core",
  "archive",
  "system",
  "reference",
  "validation",
  "compendium",
  "manual",
];

const compatibilityGroupLabels: Record<CampaignCompatibilityIssueGroup, string> = {
  core: "Platform core",
  archive: "Archive format",
  system: "Rules systems",
  reference: "Record references",
  validation: "Schema validation",
  compendium: "Compendium provenance",
  manual: "Manual calculations",
};

export function campaignCompatibilityPath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/compatibility`;
}

export function compatibilityStatusLabel(status: CampaignCompatibilityStatus): string {
  if (status === "blocking") return "Blocking issues";
  if (status === "warning") return "Review recommended";
  return "Compatible";
}

export function compatibilityVersionSummary(versions: Record<string, number>): string {
  const entries = Object.entries(versions).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([version, count]) => `${version} (${count})`).join(", ") : "None";
}

export function compatibilityRepairValue(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} values`;
  return "structured value";
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The compatibility report could not be loaded.";
}

export function CompatibilityPanel({ campaignId }: CompatibilityPanelProps) {
  const [report, setReport] = useState<CampaignCompatibilityReport>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setReport(undefined);
    setLoadError("");
    setLoadState("loading");
    void apiGet<CampaignCompatibilityReport>(campaignCompatibilityPath(campaignId), { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setReport(response);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorText(error));
        setLoadState("error");
      });
    return () => controller.abort();
  }, [campaignId, reloadVersion]);

  const groupedIssues = useMemo(() => compatibilityGroups.map((group) => ({
    group,
    issues: report?.issues.filter((issue) => issue.group === group) ?? [],
  })).filter((entry) => entry.issues.length > 0), [report]);

  return (
    <section className="compatibility-panel" aria-labelledby={`compatibility-title-${campaignId}`}>
      <div className="compatibility-heading">
        <div>
          <span className="section-title">GM / editor review</span>
          <h2 id={`compatibility-title-${campaignId}`}>Campaign compatibility</h2>
        </div>
        <button className="ghost-button small" type="button" disabled={loadState === "loading"} onClick={() => setReloadVersion((version) => version + 1)}>
          Refresh report
        </button>
      </div>
      <p className="compatibility-intro">
        Checks platform versions, installed systems, D&amp;D schemas, record references, compendium provenance, and calculation review flags.
      </p>

      {loadState === "loading" && <p className="panel-status" role="status">Loading compatibility report...</p>}
      {loadState === "error" && (
        <div className="inline-error" role="alert">
          <strong>Compatibility report unavailable.</strong>
          <span>{loadError}</span>
          <button className="ghost-button small" type="button" onClick={() => setReloadVersion((version) => version + 1)}>
            Retry report
          </button>
        </div>
      )}
      {loadState === "ready" && report && (
        <div className="compatibility-report" aria-live="polite">
          <div className={`compatibility-status compatibility-status-${report.status}`}>
            <strong>{compatibilityStatusLabel(report.status)}</strong>
            <span>{report.summary.blocking} blocking · {report.summary.warning} warnings · {report.summary.compatible} compatible checks</span>
          </div>
          <p className="compatibility-read-only">
            Read-only preview. Nothing changed automatically; unknown and homebrew fields remain preserved.
          </p>

          <dl className="compatibility-version-grid">
            <div><dt>Platform core</dt><dd>{report.platform.coreVersion}</dd></div>
            <div><dt>Archive format</dt><dd>{report.platform.currentArchiveVersion}</dd></div>
            <div><dt>D&amp;D rules</dt><dd>{report.platform.dndRulesVersion}</dd></div>
            <div><dt>Repair candidates</dt><dd>{report.validation.repairPreview.automaticChanges}</dd></div>
          </dl>

          {report.validation.repairPreview.candidates.length > 0 && (
            <details className="compatibility-section" open>
              <summary><span>Reversible repair preview</span><span>{report.validation.repairPreview.candidates.length}</span></summary>
              <ol className="compatibility-issues">
                {report.validation.repairPreview.candidates.map((candidate) => (
                  <li className="compatibility-issue compatibility-issue-warning" key={candidate.id}>
                    <div>
                      <span>{candidate.entityKind} {candidate.entityId}</span>
                      <strong>{candidate.path}</strong>
                    </div>
                    <p>{compatibilityRepairValue(candidate.before)} to {compatibilityRepairValue(candidate.after)}</p>
                    <p>{candidate.rationale}</p>
                    <p><strong>Undo:</strong> {candidate.inverse.operation} {candidate.inverse.path}{candidate.inverse.after === undefined ? "" : ` to ${compatibilityRepairValue(candidate.inverse.after)}`}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}

          <details className="compatibility-section" open>
            <summary><span>Rules-system coverage</span><span>{report.systems.length}</span></summary>
            <div className="compatibility-systems">
              {report.systems.map((system) => (
                <article key={system.systemId} className={system.coreCompatible ? "compatibility-system" : "compatibility-system compatibility-system-blocking"}>
                  <div>
                    <strong>{system.name ?? system.systemId}</strong>
                    <span>{system.installedVersion ? `v${system.installedVersion}` : "Not installed"}{system.default ? " · campaign default" : ""}</span>
                  </div>
                  <dl>
                    <div><dt>Actors</dt><dd>{system.actorCount}</dd></div>
                    <div><dt>Items</dt><dd>{system.itemCount}</dd></div>
                    <div><dt>Actor rules</dt><dd>{compatibilityVersionSummary(system.actorRulesVersions)}</dd></div>
                    <div><dt>Item content</dt><dd>{compatibilityVersionSummary(system.itemContentVersions)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </details>

          {groupedIssues.length === 0 ? (
            <p className="empty-state compact">No compatibility issues need review.</p>
          ) : (
            <div className="compatibility-issues">
              {groupedIssues.map(({ group, issues }) => (
                <details className="compatibility-section" key={group} open={issues.some((issue) => issue.severity === "blocking")}>
                  <summary>
                    <span>{compatibilityGroupLabels[group]}</span>
                    <span>{issues.length}</span>
                  </summary>
                  <ol>
                    {issues.map((issue: CampaignCompatibilityIssue) => (
                      <li key={issue.id} className={`compatibility-issue compatibility-issue-${issue.severity}`}>
                        <div>
                          <span>{issue.severity === "blocking" ? "Blocking" : "Review"}</span>
                          <strong>{issue.title}</strong>
                        </div>
                        <p>{issue.detail}</p>
                        <p><strong>Next step:</strong> {issue.action}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          )}
          <small className="compatibility-repair-note">{report.validation.repairPreview.note}</small>
        </div>
      )}
    </section>
  );
}
