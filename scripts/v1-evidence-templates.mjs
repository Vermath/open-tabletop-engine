import { execSync } from "node:child_process";
import { releaseEvidenceGateById } from "./v1-release-gates.mjs";

const commit = process.env.OTTE_RELEASE_COMMIT ?? git("rev-parse HEAD");
const today = new Date().toISOString().slice(0, 10);

if (!/^[0-9a-f]{40}$/i.test(commit.trim())) {
  console.error(`OTTE_RELEASE_COMMIT must be a full 40-character commit SHA; received ${commit}.`);
  process.exit(1);
}

console.log(`# v1 Evidence Templates for ${commit}`);
console.log("");
console.log("These are ready-to-fill blocks only. Do not mark Result as pass until the matching evidence has actually been collected.");
console.log("");

section(gate("identity-provider"), `Identity Provider Smoke: <provider and sandbox>`, [
  ["Date", today],
  ["Operator", ""],
  ["App build or commit", commit],
  ["API base URL host", ""],
  ["Provider", ""],
  ["Provider sandbox or tenant label", ""],
  ["Smoke target", "deployed API / local sandbox"],
  ["Command", "pnpm identity:smoke"],
  ["Result", "pass / fail / skipped"],
  ["Exit code", ""],
  ["OIDC discovery/test result", ""],
  ["SCIM ServiceProviderConfig result", ""],
  ["SCIM Users/Groups provisioning check, if performed", ""],
  ["Redacted output attached", ""],
  ["Audit export attached, if performed", ""],
  ["Issues filed", ""],
  ["Blockers", ""],
  ["Notes", ""]
]);

for (const environment of ["Windows NVDA", "Windows Narrator", "macOS VoiceOver", "iOS/iPadOS VoiceOver", "Android TalkBack"]) {
  section(gate("assistive-technology"), `Assistive Technology Pass: ${environment}`, [
    ["Date", today],
    ["Tester", ""],
    ["App build or commit", commit],
    ["API URL", ""],
    ["Web URL", ""],
    ["Browser", ""],
    ["Assistive technology", environment],
    ["Input method", ""],
    ["Scenario data", ""],
    ["Result", "pass / pass with issues / fail"],
    ["Issues filed", ""],
    ["Workflows completed", ""],
    ["Blockers", ""],
    ["Owner-approved descope", "<explicit owner approval summary>"],
    ["Notes", ""]
  ]);
}

section(gate("external-gm"), "External GM Validation: <tester/session label>", [
  ["Date", today],
  ["Tester role", ""],
  ["Relationship to project", ""],
  ["App build or commit", commit],
  ["Setup path", "clean local install / self-hosted deployment / hosted preview / owner-approved substitute"],
  ["API URL, if deployed", ""],
  ["Web URL, if deployed", ""],
  ["Scenario data", ""],
  ["Workflows completed", ""],
  ["Result", "pass / pass with issues / fail"],
  ["Issues filed", ""],
  ["Blockers", ""],
  ["Owner acceptance notes", ""],
  ["Owner-approved substitution", "<explicit owner approval summary>"],
  ["Redacted screenshots/logs attached", ""],
  ["Notes", ""]
]);

section(gate("hosted-release-smoke"), "Hosted Workflow Evidence: Release Smoke Final", [
  ["Date", today],
  ["Operator", ""],
  ["Workflow file", ".github/workflows/release-smoke.yml"],
  ["Trigger", "pull_request / push to main / workflow_dispatch / equivalent hosted CI"],
  ["Branch or ref", ""],
  ["Commit SHA", commit],
  ["Run URL", "https://"],
  ["Result", "pass / fail / skipped"],
  ["Release command or build command", "pnpm release:smoke"],
  ["Duration", ""],
  ["Artifact URL, if any", ""],
  ["Published URL, if docs-site deploy", "https://"],
  ["Required checks observed", ""],
  ["Issues filed", ""],
  ["Blockers", ""],
  ["Notes", ""]
]);

section(gate("docs-publication"), "Hosted Workflow Evidence: Docs Site Publication Final", [
  ["Date", today],
  ["Operator", ""],
  ["Workflow file", ".github/workflows/docs-site.yml"],
  ["Trigger", "push to main / workflow_dispatch / equivalent hosted CI"],
  ["Branch or ref", ""],
  ["Commit SHA", commit],
  ["Run URL", "https://"],
  ["Result", "pass / fail / skipped"],
  ["Release command or build command", "pnpm docs:site:check"],
  ["Duration", ""],
  ["Artifact URL, if any", ""],
  ["Published URL, if docs-site deploy", "https://"],
  ["Required checks observed", ""],
  ["Issues filed", ""],
  ["Blockers", ""],
  ["Notes", ""]
]);

function section(gate, title, fields) {
  console.log(`## ${title}`);
  console.log("");
  console.log(`Evidence file: ${gate.evidence}`);
  console.log("");
  for (const [name, value] of fields) {
    console.log(`- ${name}: ${value}`);
  }
  console.log("");
}

function gate(id) {
  return releaseEvidenceGateById(id);
}

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
