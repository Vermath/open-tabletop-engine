export const releaseEvidenceGates = [
  {
    id: "identity-provider",
    name: "Live OIDC/SCIM provider readiness",
    verifierName: "Live OIDC/SCIM provider smoke",
    publicDocsTerm: "OIDC/SCIM",
    ownerAction:
      "Run `pnpm identity:smoke` against a real provider sandbox and record command, matching commit, exit code 0, non-placeholder API host/provider/sandbox/smoke-target details, passing OIDC discovery/test result, and passing SCIM ServiceProviderConfig result.",
    evidence: "docs/verification/identity-provider-smoke-evidence.md"
  },
  {
    id: "assistive-technology",
    name: "Manual assistive-technology matrix",
    verifierName: "Manual assistive-technology matrix",
    publicDocsTerm: "assistive-technology",
    ownerAction:
      "Record one pass or pass-with-issues evidence section for each required environment with browser, assistive technology, input method, scenario data, and workflows completed: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and Android TalkBack; alternatively record an explicit owner-approved descope.",
    evidence: "docs/verification/accessibility-assistive-tech-pass.md"
  },
  {
    id: "external-gm",
    name: "External GM validation",
    verifierName: "External GM validation",
    publicDocsTerm: "external GM",
    ownerAction:
      "Have an unaffiliated or owner-approved GM run the release-candidate flow and record matching commit, tester role, relationship to project, setup path, scenario data, workflows completed, and result, or record the explicit owner-approved substitution.",
    evidence: "docs/verification/external-gm-validation.md"
  },
  {
    id: "hosted-release-smoke",
    name: "Hosted release smoke",
    verifierName: "Hosted release-smoke on checked commit",
    publicDocsTerm: "hosted release-smoke",
    ownerAction: "Record a hosted `pnpm release:smoke` pass for the checked commit with exact command parity and a concrete HTTPS hosted run URL.",
    evidence: "docs/verification/release-workflow-evidence.md"
  },
  {
    id: "docs-publication",
    name: "Public docs publication",
    verifierName: "Public docs publication",
    publicDocsTerm: "docs-publication",
    ownerAction:
      "Publish the docs site from the checked commit and record concrete HTTPS run URL, HTTPS published URL, matching commit, pass result, and `pnpm docs:site:check` command parity.",
    evidence: "docs/verification/release-workflow-evidence.md"
  }
];

const releaseEvidenceGateByIdMap = new Map(releaseEvidenceGates.map((gate) => [gate.id, gate]));

export function releaseEvidenceGateById(id) {
  const gate = releaseEvidenceGateByIdMap.get(id);
  if (!gate) {
    throw new Error(`Unknown release evidence gate: ${id}`);
  }
  return gate;
}
