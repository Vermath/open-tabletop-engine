import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseEvidenceGates, requiredAssistiveTechnologyEnvironments } from "./v1-release-gates.mjs";

const repoRoot = process.cwd();
const commit = "1234567890abcdef1234567890abcdef12345678";
const checker = join(repoRoot, "scripts", "check-v1-release-evidence.mjs");
const templates = join(repoRoot, "scripts", "v1-evidence-templates.mjs");
const handoff = join(repoRoot, "scripts", "v1-release-handoff.mjs");
const completionAudit = join(repoRoot, "scripts", "v1-completion-audit.mjs");

runFailsWhenEvidenceIsMissing();
runPassesWhenEvidenceIsComplete();
runPassesWhenIdentityEvidenceMentionsNoSkippedChecks();
runFailsWhenIdentityEvidenceOmitsReadinessResults();
runFailsWhenIdentityEvidenceUsesWrongCommand();
runFailsWhenIdentityReadinessUsesTemplateChoices();
runFailsWhenIdentityReadinessUsesCompactTemplateChoices();
runFailsWhenIdentityEvidenceOmitsProviderDetails();
runPassesWithShortCommitEvidence();
runPassesWithOwnerApprovedManualOverrides();
runFailsWithTemplateOwnerOverrides();
runFailsWithPlaceholderOwnerOverrides();
runFailsWithTemplateChoiceOwnerOverrides();
runFailsWithCompactTemplateChoiceOwnerOverrides();
runFailsWithAmbiguousOwnerOverrides();
runFailsWithNegativeOwnerApprovalOverrides();
runFailsWhenIosVoiceOverIsOnlyVoiceOverEvidence();
runFailsWhenOneAssistiveSectionMentionsMultipleEnvironments();
runFailsWhenAssistiveEvidenceOmitsWorkflowDetails();
runFailsWhenEvidenceTargetsAnotherCommit();
runFailsWithShortReleaseTargetCommit();
runFailsWhenExternalGmEvidenceOmitsScenarioDetails();
runFailsWhenExternalGmEvidenceOmitsTesterContext();
runFailsWhenExternalGmEvidenceUsesTemplateChoices();
runFailsWhenExternalGmEvidenceUsesCompactTemplateChoices();
runFailsWithTooShortCommitEvidence();
runFailsWithPlaceholderHostedReleaseSmokeTitle();
runFailsWithProseOnlyDocsPublicationOverride();
runFailsWithHostedEvidenceMissingRunUrl();
runFailsWithBareHostedRunUrls();
runFailsWithWrongReleaseSmokeCommand();
runFailsWithNegativeDocsPublicationResult();
runFailsWithWrongDocsPublicationCommand();
runFailsWithPlaceholderHostedUrls();
runFailsWithExampleHostedUrls();
runFailsWithLocalHostedUrls();
runFailsWithPrivateHostedUrls();
runFailsWithLocalNetworkHostedUrls();
runFailsWithReservedHostedUrls();
runFailsWithCredentialHostedUrls();
runFailsWithSensitiveParamHostedUrls();
runFailsWithHttpHostedUrls();
runPassesWithPublicationTitledDocsEvidence();
runEvidenceTemplatesIncludeVerifierFields();
runEvidenceTemplatesRejectShortReleaseTargetCommit();
runHandoffReportsIncompleteVerifierStatus();
runHandoffReportsCompleteVerifierStatus();
runHandoffRejectsShortReleaseTargetCommit();
runHandoffGateMetadataMatchesVerifier();
runCompletionAuditReportsFailedEvidenceAndContinues();
runCompletionAuditPassesWhenAllGatesPass();

console.log("v1 release evidence verifier tests passed.");

function runFailsWhenEvidenceIsMissing() {
  const root = fixtureRoot({
    identity: "# Identity Provider Smoke Evidence\n\n## Evidence Template\n\n```md\n## Identity Provider Smoke: <provider and sandbox>\n- Result: pass\n```\n",
    assistive: "# Assistive Technology Pass Plan\n",
    externalGm: "# External GM Validation Evidence\n",
    releaseWorkflow: "# Release Workflow Evidence\n"
  });

  try {
    const result = runChecker(root);
    assert(result.status === 1, "missing evidence should fail");
    assert(result.stderr.includes("v1 release evidence is incomplete"), "missing evidence should report incomplete gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runPassesWhenEvidenceIsComplete() {
  const root = fixtureRoot(completeEvidence(commit));

  try {
    const result = runChecker(root);
    assert(result.status === 0, "complete evidence should pass");
    assert(result.stdout.includes("v1 release evidence is complete"), "complete evidence should report success");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runPassesWhenIdentityEvidenceMentionsNoSkippedChecks() {
  const files = completeEvidence(commit);
  files.identity = files.identity.replace("- Blockers: none", "- Skipped checks: none\n- Blockers: none");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 0, "identity pass evidence should allow notes that no checks were skipped");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenIdentityEvidenceOmitsReadinessResults() {
  const files = completeEvidence(commit);
  files.identity = files.identity
    .replace("- Command: pnpm identity:smoke\n", "")
    .replace("- OIDC discovery/test result: pass\n", "")
    .replace("- SCIM ServiceProviderConfig result: pass\n", "");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "identity evidence without command/readiness results should fail");
    assert(result.stdout.includes("Record passing OIDC discovery/test and SCIM ServiceProviderConfig results."), "identity failure should name missing readiness results");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenIdentityEvidenceUsesWrongCommand() {
  const files = completeEvidence(commit);
  files.identity = files.identity.replace("pnpm identity:smoke", "not pnpm identity:smoke");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "identity evidence without exact command parity should fail");
    assert(result.stdout.includes("Record Exit code: 0 from a non-skipped `pnpm identity:smoke` run against a real provider sandbox."), "identity failure should name required smoke command");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenIdentityReadinessUsesTemplateChoices() {
  const files = completeEvidence(commit);
  files.identity = files.identity
    .replace("- OIDC discovery/test result: pass\n", "- OIDC discovery/test result: pass / fail / skipped\n")
    .replace("- SCIM ServiceProviderConfig result: pass\n", "- SCIM ServiceProviderConfig result: pass / fail / skipped\n");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "identity readiness template-choice values should fail");
    assert(result.stdout.includes("Record passing OIDC discovery/test and SCIM ServiceProviderConfig results."), "identity readiness template-choice failure should name required readiness results");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenIdentityReadinessUsesCompactTemplateChoices() {
  const files = completeEvidence(commit);
  files.identity = files.identity
    .replace("- OIDC discovery/test result: pass\n", "- OIDC discovery/test result: pass/fail/skipped\n")
    .replace("- SCIM ServiceProviderConfig result: pass\n", "- SCIM ServiceProviderConfig result: pass/fail/skipped\n");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "identity readiness compact template-choice values should fail");
    assert(result.stdout.includes("Record passing OIDC discovery/test and SCIM ServiceProviderConfig results."), "identity compact template-choice failure should name required readiness results");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenIdentityEvidenceOmitsProviderDetails() {
  const files = completeEvidence(commit);
  files.identity = files.identity
    .replace("- API base URL host: api.example.test\n", "- API base URL host: \n")
    .replace("- Provider: Okta\n", "- Provider: <provider>\n")
    .replace("- Provider sandbox or tenant label: sandbox\n", "- Provider sandbox or tenant label: <sandbox>\n")
    .replace("- Smoke target: deployed API\n", "- Smoke target: deployed API / local sandbox\n");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "identity evidence without provider details should fail");
    assert(result.stdout.includes("Record non-placeholder API base URL host, provider, provider sandbox or tenant label, and smoke target."), "identity detail failure should name provider detail fields");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenEvidenceTargetsAnotherCommit() {
  const root = fixtureRoot(completeEvidence("abcdef0123456789abcdef0123456789abcdef01"));

  try {
    const result = runChecker(root);
    assert(result.status === 1, "evidence for a different commit should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "stale evidence should name missing hosted commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithShortReleaseTargetCommit() {
  const root = fixtureRoot(completeEvidence(commit));

  try {
    const result = runChecker(root, { releaseCommit: commit.slice(0, 12) });
    assert(result.status === 1, "short release target commit should fail");
    assert(result.stderr.includes("OTTE_RELEASE_COMMIT must be a full 40-character commit SHA"), "short release target failure should name full-SHA requirement");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runPassesWithShortCommitEvidence() {
  const root = fixtureRoot(completeEvidence(commit.slice(0, 12)));

  try {
    const result = runChecker(root);
    assert(result.status === 0, "short commit evidence should pass when it prefixes the checked commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runPassesWithOwnerApprovedManualOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: Release owner accepted a temporary reduced matrix for the release candidate.
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: Release owner accepted an internal GM substitute for the release candidate.
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 0, "owner-approved manual overrides should satisfy manual gates");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithTemplateOwnerOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

\`\`\`md
- Owner-approved descope: Release owner accepted a temporary reduced matrix for the release candidate.
\`\`\`
`;
  files.externalGm = `# External GM Validation Evidence

\`\`\`md
- Owner-approved substitution: Release owner accepted an internal GM substitute for the release candidate.
\`\`\`
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "template owner overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "fenced AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "fenced GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithPlaceholderOwnerOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: <explicit owner approval summary>
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: <explicit owner approval summary>
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "placeholder owner overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "placeholder AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "placeholder GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithTemplateChoiceOwnerOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: approved / not approved
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: external GM validation / owner-approved substitute
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "template-choice owner overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "template-choice AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "template-choice GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithCompactTemplateChoiceOwnerOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: approved/not approved
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: external GM validation/owner-approved substitute
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "compact template-choice owner overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "compact template-choice AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "compact template-choice GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithAmbiguousOwnerOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: Temporary reduced matrix for the release candidate.
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: Internal GM substitute for the release candidate.
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "ambiguous owner overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "ambiguous AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "ambiguous GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithNegativeOwnerApprovalOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: Release owner did not approve reducing the matrix.
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: Release owner has not accepted an internal GM substitute.
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "negative owner approval overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "negative AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "negative GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenIosVoiceOverIsOnlyVoiceOverEvidence() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

## Assistive Technology Pass: Windows NVDA

- App build or commit: ${commit}
- Assistive technology: NVDA
- Browser: Chrome on Windows
- Input method: keyboard
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass

## Assistive Technology Pass: Windows Narrator

- App build or commit: ${commit}
- Assistive technology: Narrator
- Browser: Edge on Windows
- Input method: keyboard
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass

## Assistive Technology Pass: iOS/iPadOS VoiceOver

- App build or commit: ${commit}
- Assistive technology: VoiceOver
- Browser: Safari on iOS
- Input method: touch
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass

## Assistive Technology Pass: Android TalkBack

- App build or commit: ${commit}
- Assistive technology: TalkBack
- Browser: Chrome on Android
- Input method: touch
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "iOS/iPadOS VoiceOver evidence should not satisfy macOS VoiceOver");
    assert(result.stdout.includes("Missing pass evidence for: macOS VoiceOver"), "missing macOS VoiceOver should be reported distinctly");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenOneAssistiveSectionMentionsMultipleEnvironments() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

## Assistive Technology Pass: Combined matrix

- App build or commit: ${commit}
- Assistive technology: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack
- Browser: Chrome on Windows, Edge on Windows, Safari on macOS, Safari on iOS, Chrome on Android
- Result: pass
- Notes: Combined summary, not one evidence block per required environment.
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "one assistive section should not satisfy multiple required environments");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, Android TalkBack"), "combined assistive section should leave the full matrix incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenAssistiveEvidenceOmitsWorkflowDetails() {
  const files = completeEvidence(commit);
  files.assistive = files.assistive
    .replace(/- Input method: [^\n]+\n/g, "")
    .replace(/- Scenario data: [^\n]+\n/g, "")
    .replace(/- Workflows completed: [^\n]+\n/g, "");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "assistive evidence without workflow details should fail");
    assert(result.stdout.includes("with browser, assistive technology, input method, scenario data, and workflows completed"), "assistive workflow-detail failure should name required details");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenExternalGmEvidenceOmitsScenarioDetails() {
  const files = completeEvidence(commit);
  files.externalGm = files.externalGm.replace("- Setup path: hosted preview\n", "").replace("- Workflows completed: campaign prep and play loop\n", "");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "external GM evidence without setup path and workflows should fail");
    assert(result.stdout.includes("tester role, relationship to project, setup path, scenario data, and workflows completed"), "external GM failure should name missing scenario details");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenExternalGmEvidenceOmitsTesterContext() {
  const files = completeEvidence(commit);
  files.externalGm = files.externalGm
    .replace("- Tester role: external GM\n", "")
    .replace("- Relationship to project: unaffiliated tester\n", "")
    .replace("- Scenario data: sample campaign\n", "");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "external GM evidence without tester context should fail");
    assert(result.stdout.includes("tester role, relationship to project, setup path, scenario data, and workflows completed"), "external GM tester-context failure should name missing context fields");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenExternalGmEvidenceUsesTemplateChoices() {
  const files = completeEvidence(commit);
  files.externalGm = files.externalGm.replace("- Setup path: hosted preview\n", "- Setup path: clean local install / self-hosted deployment / hosted preview / owner-approved substitute\n");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "external GM evidence with template-choice setup path should fail");
    assert(result.stdout.includes("tester role, relationship to project, setup path, scenario data, and workflows completed"), "external GM template-choice failure should name scenario details");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenExternalGmEvidenceUsesCompactTemplateChoices() {
  const files = completeEvidence(commit);
  files.externalGm = files.externalGm.replace("- Setup path: hosted preview\n", "- Setup path: clean local install/self-hosted deployment/hosted preview/owner-approved substitute\n");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "external GM evidence with compact template-choice setup path should fail");
    assert(result.stdout.includes("tester role, relationship to project, setup path, scenario data, and workflows completed"), "external GM compact template-choice failure should name scenario details");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithTooShortCommitEvidence() {
  const root = fixtureRoot(completeEvidence(commit.slice(0, 6)));

  try {
    const result = runChecker(root);
    assert(result.status === 1, "too-short commit evidence should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "too-short commit should not satisfy hosted release-smoke");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithPlaceholderHostedReleaseSmokeTitle() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("## Hosted Workflow Evidence: Release Smoke", "## Hosted Workflow Evidence: Release Smoke <workflow run>");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "placeholder release-smoke evidence title should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "placeholder release-smoke title should leave hosted smoke incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithProseOnlyDocsPublicationOverride() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = `# Release Workflow Evidence

This release has an owner-approved equivalent hosted publication.
Published URL, if docs-site deploy: https://vermath.github.io/open-tabletop-engine

## Hosted Workflow Evidence: Release Smoke

- Commit SHA: ${commit}
- Result: pass
- Release command or build command: pnpm release:smoke
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "prose-only docs publication override should fail");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "prose-only docs publication should not satisfy publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithHostedEvidenceMissingRunUrl() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/1\n", "").replace("- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/2\n", "");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "hosted evidence without run URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "missing release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "missing docs run URL should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithBareHostedRunUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "https://github.com")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "https://github.com/");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "bare hosted run URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "bare release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "bare docs run URL should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithWrongReleaseSmokeCommand() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("pnpm release:smoke", "not pnpm release:smoke");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "release-smoke evidence without exact command parity should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "wrong release-smoke command should fail the hosted smoke gate");
    assert(result.stdout.includes("concrete HTTPS hosted run URL"), "release-smoke failure should name required HTTPS run URL evidence");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithNegativeDocsPublicationResult() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("- Result: pass\n- Release command or build command: pnpm docs:site:check", "- Result: not pass\n- Release command or build command: pnpm docs:site:check");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "negative docs publication result should fail");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "negative docs publication result should not satisfy publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithWrongDocsPublicationCommand() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("pnpm docs:site:check", "not pnpm docs:site:check");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "docs publication evidence without command parity should fail");
    assert(result.stdout.includes("including HTTPS URLs and `pnpm docs:site:check` command parity"), "docs command-parity failure should name required command and HTTPS URLs");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithPlaceholderHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "https://").replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "https://").replace("https://vermath.github.io/open-tabletop-engine", "https://");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "placeholder hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "placeholder release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "placeholder docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithExampleHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "https://github.example.test/run/1")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "https://github.example.test/run/2")
    .replace("https://vermath.github.io/open-tabletop-engine", "https://docs.example.test/open-tabletop");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "example hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "example release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "example docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithLocalHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "http://localhost:3000/release-smoke")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "http://127.0.0.1:3000/docs-site")
    .replace("https://vermath.github.io/open-tabletop-engine", "http://[::1]:3000/open-tabletop");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "local hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "local release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "local docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithPrivateHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "http://10.0.0.4/release-smoke")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "http://172.16.0.9/docs-site")
    .replace("https://vermath.github.io/open-tabletop-engine", "http://192.168.1.20/open-tabletop");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "private hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "private release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "private docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithLocalNetworkHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "http://buildbox/release-smoke")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "http://runner.local/docs-site")
    .replace("https://vermath.github.io/open-tabletop-engine", "http://docs.localhost/open-tabletop");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "local-network hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "local-network release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "local-network docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithReservedHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "https://runner.test/release-smoke")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "https://198.51.100.9/docs-site")
    .replace("https://vermath.github.io/open-tabletop-engine", "https://docs.invalid/open-tabletop");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "reserved hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "reserved release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "reserved docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithCredentialHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "https://user:token@github.com/Vermath/open-tabletop-engine/actions/runs/1")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "https://user:token@github.com/Vermath/open-tabletop-engine/actions/runs/2")
    .replace("https://vermath.github.io/open-tabletop-engine", "https://user:token@vermath.github.io/open-tabletop-engine");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "credential-bearing hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "credential-bearing release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "credential-bearing docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithSensitiveParamHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "https://github.com/Vermath/open-tabletop-engine/actions/runs/1?access_token=redacted")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "https://github.com/Vermath/open-tabletop-engine/actions/runs/2#id_token=redacted")
    .replace("https://vermath.github.io/open-tabletop-engine", "https://vermath.github.io/open-tabletop-engine?api_key=redacted");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "sensitive-param hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "sensitive-param release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "sensitive-param docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithHttpHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/1", "http://github.com/Vermath/open-tabletop-engine/actions/runs/1")
    .replace("https://github.com/Vermath/open-tabletop-engine/actions/runs/2", "http://github.com/Vermath/open-tabletop-engine/actions/runs/2")
    .replace("https://vermath.github.io/open-tabletop-engine", "http://vermath.github.io/open-tabletop-engine");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "non-HTTPS hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "HTTP release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with an HTTPS published URL is recorded for commit ${commit}`), "HTTP docs URLs should fail the docs publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runPassesWithPublicationTitledDocsEvidence() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("## Hosted Workflow Evidence: Docs Site Deploy", "## Hosted Workflow Evidence: Docs Site Publication Final");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 0, "docs publication evidence should pass with publication title and required fields");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runEvidenceTemplatesIncludeVerifierFields() {
  const result = spawnSync(process.execPath, [templates], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_RELEASE_COMMIT: commit
    },
    encoding: "utf8"
  });

  assert(result.status === 0, "evidence template generator should exit successfully");
  assert(result.stdout.includes(`# v1 Evidence Templates for ${commit}`), "templates should include the checked commit header");
  assert(result.stdout.includes("- App build or commit: 1234567890abcdef1234567890abcdef12345678"), "manual evidence templates should prefill App build or commit");
  assert(result.stdout.includes("- Commit SHA: 1234567890abcdef1234567890abcdef12345678"), "hosted evidence templates should prefill Commit SHA");
  assert(result.stdout.includes("- Command: pnpm identity:smoke"), "identity template should preserve the verifier command field");
  assert(result.stdout.includes("- Release command or build command: pnpm release:smoke"), "release-smoke template should preserve command parity");
  assert(result.stdout.includes("- Release command or build command: pnpm docs:site:check"), "docs publication template should preserve command parity");
  assert(result.stdout.includes("- Run URL: https://"), "hosted evidence templates should prompt for HTTPS run URLs");
  assert(result.stdout.includes("- Published URL, if docs-site deploy: https://"), "docs publication template should prompt for an HTTPS published URL");
  assert(result.stdout.includes("- Owner-approved descope: <explicit owner approval summary>"), "manual templates should use a non-evidence owner-approval placeholder");
  assert(result.stdout.includes("- Owner-approved substitution: <explicit owner approval summary>"), "GM template should use a non-evidence owner-approval placeholder");
  assert(!result.stdout.includes("Release owner accepted/approved ..."), "templates should not include approval-like placeholder text");
  for (const environment of requiredAssistiveTechnologyEnvironments) {
    assert(result.stdout.includes(`## Assistive Technology Pass: ${environment.label}`), `templates should include ${environment.label}`);
  }
  for (const gate of releaseEvidenceGates) {
    assert(result.stdout.includes(`Evidence file: ${gate.evidence}`), `templates should include destination for ${gate.name}`);
    if (gate.command) {
      assert(result.stdout.includes(gate.command), `templates should include command for ${gate.name}`);
    }
  }
  assert(result.stdout.includes("Do not mark Result as pass until the matching evidence has actually been collected."), "templates should warn against treating placeholders as pass evidence");
}

function runEvidenceTemplatesRejectShortReleaseTargetCommit() {
  const result = spawnSync(process.execPath, [templates], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_RELEASE_COMMIT: commit.slice(0, 12)
    },
    encoding: "utf8"
  });

  assert(result.status === 1, "evidence template generator should reject short release target commits");
  assert(result.stderr.includes("OTTE_RELEASE_COMMIT must be a full 40-character commit SHA"), "template generator short-target failure should name full-SHA requirement");
}

function runHandoffReportsIncompleteVerifierStatus() {
  const root = fixtureRoot({
    identity: "# Identity Provider Smoke Evidence\n",
    assistive: "# Assistive Technology Pass Plan\n",
    externalGm: "# External GM Validation Evidence\n",
    releaseWorkflow: "# Release Workflow Evidence\n"
  });

  try {
    const result = runHandoff(root);
    assert(result.status === 0, "handoff should exit successfully even when evidence is incomplete");
    assert(result.stdout.includes("Current evidence verifier status:"), "handoff should print verifier status");
    assert(result.stdout.includes("Aggregate completion audit:"), "handoff should mention the aggregate completion audit");
    assert(result.stdout.includes("pnpm v1:completion:audit"), "handoff should point to the aggregate completion audit");
    assert(result.stdout.includes("Open issue gate:"), "handoff should mention the open issue gate");
    assert(result.stdout.includes("pnpm v1:issues:check"), "handoff should point to the open issue audit");
    assert(result.stdout.includes("OTTE_RELEASE_COMMIT=<full-40-character-hosted-run-commit-sha> pnpm v1:completion:audit"), "handoff should show hosted-run aggregate audit");
    assert(result.stdout.includes("OTTE_RELEASE_COMMIT=<full-40-character-hosted-run-commit-sha> pnpm v1:evidence:check"), "handoff should not imply the current docs commit is the hosted run target");
    assert(result.stdout.includes("Checklist: docs/release/v1-release-checklist.md"), "handoff should point to the release checklist");
    assert(result.stdout.includes("Handoff: docs/verification/v1-release-owner-handoff.md"), "handoff should point to the owner handoff");
    assert(result.stdout.includes("pnpm v1:evidence:templates"), "handoff should point to the evidence template generator");
    assert(result.stdout.includes("OTTE_RELEASE_COMMIT=<full-40-character-hosted-run-commit-sha> pnpm v1:evidence:templates"), "handoff should show hosted-run template generation");
    assert(result.stdout.includes("non-placeholder API host/provider/sandbox/smoke-target details"), "handoff should mention identity provider detail fields");
    assert(result.stdout.includes("one pass or pass-with-issues evidence section for each required environment with browser, assistive technology, input method, scenario data, and workflows completed"), "handoff should mention distinct AT evidence details");
    assert(result.stdout.includes("tester role, relationship to project, setup path, scenario data, workflows completed"), "handoff should mention external GM scenario fields");
    assert(result.stdout.includes("concrete HTTPS hosted run URL"), "handoff should mention concrete HTTPS hosted run URLs");
    assert(result.stdout.includes("HTTPS published URL"), "handoff should mention HTTPS docs publication URLs");
    assert(result.stdout.includes("`pnpm docs:site:check` command parity"), "handoff should mention docs publication command parity");
    assert(result.stdout.includes("v1 release evidence is incomplete: 5 blocker(s) remain."), "handoff should include incomplete verifier output");
    assert(result.stdout.includes("Handoff command exits 0; run `pnpm v1:completion:audit` for the aggregate release gate and `pnpm v1:evidence:check` for the enforced evidence gate."), "handoff should distinguish guidance from enforcement");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runHandoffReportsCompleteVerifierStatus() {
  const root = fixtureRoot(completeEvidence(commit));

  try {
    const result = runHandoff(root);
    assert(result.status === 0, "handoff should exit successfully when evidence is complete");
    assert(result.stdout.includes("v1 release evidence is complete for the checked gates."), "handoff should include complete verifier output");
    assert(result.stdout.includes("Evidence verifier is complete for the checked commit."), "handoff should summarize complete status");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runHandoffRejectsShortReleaseTargetCommit() {
  const root = fixtureRoot(completeEvidence(commit));

  try {
    const result = runHandoff(root, { releaseCommit: commit.slice(0, 12) });
    assert(result.status === 1, "handoff should reject short release target commits");
    assert(result.stderr.includes("OTTE_RELEASE_COMMIT must be a full 40-character commit SHA"), "handoff short-target failure should name full-SHA requirement");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runHandoffGateMetadataMatchesVerifier() {
  const root = fixtureRoot({
    identity: "# Identity Provider Smoke Evidence\n",
    assistive: "# Assistive Technology Pass Plan\n",
    externalGm: "# External GM Validation Evidence\n",
    releaseWorkflow: "# Release Workflow Evidence\n"
  });

  try {
    const handoffResult = runHandoff(root);
    const verifierResult = runChecker(root);
    assert(handoffResult.status === 0, "handoff should run for gate metadata check");
    assert(verifierResult.status === 1, "verifier should report incomplete fixture for gate metadata check");
    assert(new Set(releaseEvidenceGates.map((gate) => gate.id)).size === releaseEvidenceGates.length, "release evidence gate ids should be unique");
    assert(requiredAssistiveTechnologyEnvironments.length === 5, "assistive-technology matrix should require five environments");
    for (const gate of releaseEvidenceGates) {
      assert(gate.id, `gate ${gate.name} should define a stable id`);
      assert(handoffResult.stdout.includes(gate.name), `handoff should list gate ${gate.name}`);
      assert(handoffResult.stdout.includes(gate.ownerAction), `handoff should list action for ${gate.name}`);
      assert(handoffResult.stdout.includes(gate.evidence), `handoff should list evidence path for ${gate.name}`);
      assert(verifierResult.stdout.includes(`FAIL: ${gate.verifierName}`), `verifier should report gate ${gate.verifierName}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runCompletionAuditReportsFailedEvidenceAndContinues() {
  const root = fixtureRoot({
    identity: "# Identity Provider Smoke Evidence\n",
    assistive: "# Assistive Technology Pass Plan\n",
    externalGm: "# External GM Validation Evidence\n",
    releaseWorkflow: "# Release Workflow Evidence\n"
  });

  try {
    const result = runCompletionAudit(root);
    assert(result.status === 1, "completion audit should fail when release evidence is incomplete");
    assert(result.stdout.includes("FAIL: Final release evidence"), "completion audit should summarize failed evidence");
    assert(result.stdout.includes("PASS: Open P0/P1 issue audit"), "completion audit should continue through issue gate");
    assert(result.stdout.includes("PASS: Public docs site guard"), "completion audit should continue through docs gate");
    assert(result.stderr.includes("v1 completion audit failed: 1 required gate(s) did not pass."), "completion audit should report failed gate count");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runCompletionAuditPassesWhenAllGatesPass() {
  const root = fixtureRoot(completeEvidence(commit));

  try {
    const result = runCompletionAudit(root);
    assert(result.status === 0, "completion audit should pass when evidence, issues, and docs gates pass");
    assert(result.stdout.includes("PASS: Final release evidence"), "completion audit should summarize evidence pass");
    assert(result.stdout.includes("PASS: Open P0/P1 issue audit"), "completion audit should summarize issue pass");
    assert(result.stdout.includes("PASS: Public docs site guard"), "completion audit should summarize docs pass");
    assert(result.stdout.includes("v1 completion audit passed."), "completion audit should report success");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function completeEvidence(evidenceCommit) {
  return {
    identity: `# Identity Provider Smoke Evidence

## Identity Provider Smoke: Okta sandbox

- Date: 2026-05-15
- Operator: Release owner
- App build or commit: ${evidenceCommit}
- API base URL host: api.example.test
- Provider: Okta
- Provider sandbox or tenant label: sandbox
- Smoke target: deployed API
- Command: pnpm identity:smoke
- Result: pass
- Exit code: 0
- OIDC discovery/test result: pass
- SCIM ServiceProviderConfig result: pass
- Blockers: none
`,
    assistive: `# Assistive Technology Pass Plan

## Assistive Technology Pass: Windows NVDA

- App build or commit: ${evidenceCommit}
- Browser: Chrome
- Assistive technology: NVDA
- Input method: keyboard
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass
- Blockers: none

## Assistive Technology Pass: Windows Narrator

- App build or commit: ${evidenceCommit}
- Browser: Edge
- Assistive technology: Narrator
- Input method: keyboard
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass
- Blockers: none

## Assistive Technology Pass: macOS VoiceOver

- App build or commit: ${evidenceCommit}
- Browser: Safari
- Assistive technology: VoiceOver
- Input method: keyboard
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass
- Blockers: none

## Assistive Technology Pass: iOS/iPadOS VoiceOver

- App build or commit: ${evidenceCommit}
- Browser: Safari
- Assistive technology: iOS/iPadOS VoiceOver
- Input method: touch
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass
- Blockers: none

## Assistive Technology Pass: Android TalkBack

- App build or commit: ${evidenceCommit}
- Browser: Chrome
- Assistive technology: TalkBack
- Input method: touch
- Scenario data: sample campaign
- Workflows completed: sign in, campaign navigation, scene controls, chat, dice, actor sheet, content, AI, SDK, admin
- Result: pass
- Blockers: none
`,
    externalGm: `# External GM Validation Evidence

## External GM Validation: release candidate session

- Tester role: external GM
- Relationship to project: unaffiliated tester
- App build or commit: ${evidenceCommit}
- Setup path: hosted preview
- Scenario data: sample campaign
- Workflows completed: campaign prep and play loop
- Result: pass
- Blockers: none
`,
    releaseWorkflow: `# Release Workflow Evidence

## Hosted Workflow Evidence: Release Smoke

- Commit SHA: ${evidenceCommit}
- Result: pass
- Release command or build command: pnpm release:smoke
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/1
- Blockers: none

## Hosted Workflow Evidence: Docs Site Deploy

- Commit SHA: ${evidenceCommit}
- Result: pass
- Release command or build command: pnpm docs:site:check
- Published URL, if docs-site deploy: https://vermath.github.io/open-tabletop-engine
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/2
- Blockers: none
`
  };
}

function fixtureRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "otte-v1-evidence-"));
  const verificationDir = join(root, "docs", "verification");
  mkdirSync(verificationDir, { recursive: true });
  writeFileSync(join(verificationDir, "identity-provider-smoke-evidence.md"), files.identity);
  writeFileSync(join(verificationDir, "accessibility-assistive-tech-pass.md"), files.assistive);
  writeFileSync(join(verificationDir, "external-gm-validation.md"), files.externalGm);
  writeFileSync(join(verificationDir, "release-workflow-evidence.md"), files.releaseWorkflow);
  return root;
}

function runChecker(root, options = {}) {
  return spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_EVIDENCE_ROOT: root,
      OTTE_RELEASE_COMMIT: options.releaseCommit ?? commit
    },
    encoding: "utf8"
  });
}

function runHandoff(root, options = {}) {
  return spawnSync(process.execPath, [handoff], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_EVIDENCE_ROOT: root,
      OTTE_RELEASE_COMMIT: options.releaseCommit ?? commit
    },
    encoding: "utf8"
  });
}

function runCompletionAudit(root) {
  return spawnSync(process.execPath, [completionAudit], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_EVIDENCE_ROOT: root,
      OTTE_RELEASE_COMMIT: commit,
      OTTE_OPEN_ISSUES_JSON: "[]"
    },
    encoding: "utf8"
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
