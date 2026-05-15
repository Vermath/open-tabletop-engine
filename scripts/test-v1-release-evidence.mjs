import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const commit = "1234567890abcdef1234567890abcdef12345678";
const checker = join(repoRoot, "scripts", "check-v1-release-evidence.mjs");
const templates = join(repoRoot, "scripts", "v1-evidence-templates.mjs");
const handoff = join(repoRoot, "scripts", "v1-release-handoff.mjs");

runFailsWhenEvidenceIsMissing();
runPassesWhenEvidenceIsComplete();
runPassesWhenIdentityEvidenceMentionsNoSkippedChecks();
runFailsWhenIdentityEvidenceOmitsReadinessResults();
runFailsWhenIdentityEvidenceUsesWrongCommand();
runPassesWithShortCommitEvidence();
runPassesWithOwnerApprovedManualOverrides();
runFailsWithTemplateOwnerOverrides();
runFailsWithPlaceholderOwnerOverrides();
runFailsWhenIosVoiceOverIsOnlyVoiceOverEvidence();
runFailsWhenEvidenceTargetsAnotherCommit();
runFailsWhenExternalGmEvidenceOmitsScenarioDetails();
runFailsWhenExternalGmEvidenceUsesTemplateChoices();
runFailsWithTooShortCommitEvidence();
runFailsWithProseOnlyDocsPublicationOverride();
runFailsWithHostedEvidenceMissingRunUrl();
runFailsWithWrongReleaseSmokeCommand();
runFailsWithNegativeDocsPublicationResult();
runFailsWithWrongDocsPublicationCommand();
runFailsWithPlaceholderHostedUrls();
runPassesWithPublicationTitledDocsEvidence();
runEvidenceTemplatesIncludeVerifierFields();
runHandoffReportsIncompleteVerifierStatus();
runHandoffReportsCompleteVerifierStatus();

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
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS VoiceOver, Android TalkBack"), "fenced AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "fenced GM override should leave external validation incomplete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithPlaceholderOwnerOverrides() {
  const files = completeEvidence(commit);
  files.assistive = `# Assistive Technology Pass Plan

- Owner-approved descope: none
`;
  files.externalGm = `# External GM Validation Evidence

- Owner-approved substitution: <approval summary>
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "placeholder owner overrides should not satisfy manual gates");
    assert(result.stdout.includes("Missing pass evidence for: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS VoiceOver, Android TalkBack"), "placeholder AT override should leave the manual matrix incomplete");
    assert(result.stdout.includes("Add a non-template external GM validation block"), "placeholder GM override should leave external validation incomplete");
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
- Result: pass

## Assistive Technology Pass: Windows Narrator

- App build or commit: ${commit}
- Assistive technology: Narrator
- Browser: Edge on Windows
- Result: pass

## Assistive Technology Pass: iOS VoiceOver

- App build or commit: ${commit}
- Assistive technology: VoiceOver
- Browser: Safari on iOS
- Result: pass

## Assistive Technology Pass: Android TalkBack

- App build or commit: ${commit}
- Assistive technology: TalkBack
- Browser: Chrome on Android
- Result: pass
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "iOS VoiceOver evidence should not satisfy macOS VoiceOver");
    assert(result.stdout.includes("Missing pass evidence for: macOS VoiceOver"), "missing macOS VoiceOver should be reported distinctly");
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
    assert(result.stdout.includes("setup path, and workflows completed"), "external GM failure should name missing scenario details");
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
    assert(result.stdout.includes("setup path, and workflows completed"), "external GM template-choice failure should name scenario details");
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

function runFailsWithProseOnlyDocsPublicationOverride() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = `# Release Workflow Evidence

This release has an owner-approved equivalent hosted publication.
Published URL, if docs-site deploy: https://docs.example.test/open-tabletop

## Hosted Workflow Evidence: Release Smoke

- Commit SHA: ${commit}
- Result: pass
- Release command or build command: pnpm release:smoke
`;
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "prose-only docs publication override should fail");
    assert(result.stdout.includes(`No successful docs-site publication with a published URL is recorded for commit ${commit}`), "prose-only docs publication should not satisfy publication gate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithHostedEvidenceMissingRunUrl() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("- Run URL: https://github.example.test/run/1\n", "").replace("- Run URL: https://github.example.test/run/2\n", "");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "hosted evidence without run URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "missing release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with a published URL is recorded for commit ${commit}`), "missing docs run URL should fail the docs publication gate");
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
    assert(result.stdout.includes(`No successful docs-site publication with a published URL is recorded for commit ${commit}`), "negative docs publication result should not satisfy publication gate");
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
    assert(result.stdout.includes("including `pnpm docs:site:check` command parity"), "docs command-parity failure should name required command");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWithPlaceholderHostedUrls() {
  const files = completeEvidence(commit);
  files.releaseWorkflow = files.releaseWorkflow.replace("https://github.example.test/run/1", "https://").replace("https://github.example.test/run/2", "https://").replace("https://docs.example.test/open-tabletop", "https://");
  const root = fixtureRoot(files);

  try {
    const result = runChecker(root);
    assert(result.status === 1, "placeholder hosted URLs should fail");
    assert(result.stdout.includes(`No hosted release-smoke pass is recorded for commit ${commit}`), "placeholder release-smoke run URL should fail the hosted smoke gate");
    assert(result.stdout.includes(`No successful docs-site publication with a published URL is recorded for commit ${commit}`), "placeholder docs URLs should fail the docs publication gate");
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
  for (const environment of ["Windows NVDA", "Windows Narrator", "macOS VoiceOver", "iOS VoiceOver", "Android TalkBack"]) {
    assert(result.stdout.includes(`## Assistive Technology Pass: ${environment}`), `templates should include ${environment}`);
  }
  assert(result.stdout.includes("Do not mark Result as pass until the matching evidence has actually been collected."), "templates should warn against treating placeholders as pass evidence");
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
    assert(result.stdout.includes("OTTE_RELEASE_COMMIT=<hosted-run-commit-sha> pnpm v1:evidence:check"), "handoff should not imply the current docs commit is the hosted run target");
    assert(result.stdout.includes("pnpm v1:evidence:templates"), "handoff should point to the evidence template generator");
    assert(result.stdout.includes("OTTE_RELEASE_COMMIT=<hosted-run-commit-sha> pnpm v1:evidence:templates"), "handoff should show hosted-run template generation");
    assert(result.stdout.includes("passing OIDC discovery/test result"), "handoff should mention identity readiness fields");
    assert(result.stdout.includes("distinct Windows NVDA"), "handoff should mention distinct AT environments");
    assert(result.stdout.includes("setup path, workflows completed"), "handoff should mention external GM scenario fields");
    assert(result.stdout.includes("hosted `pnpm release:smoke` pass for the checked commit"), "handoff should mention hosted release-smoke verifier target");
    assert(result.stdout.includes("`pnpm docs:site:check` command parity"), "handoff should mention docs publication command parity");
    assert(result.stdout.includes("v1 release evidence is incomplete: 5 blocker(s) remain."), "handoff should include incomplete verifier output");
    assert(result.stdout.includes("Handoff command exits 0; run `pnpm v1:evidence:check` for the enforced release gate."), "handoff should distinguish guidance from enforcement");
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
- Result: pass
- Blockers: none

## Assistive Technology Pass: Windows Narrator

- App build or commit: ${evidenceCommit}
- Browser: Edge
- Assistive technology: Narrator
- Result: pass
- Blockers: none

## Assistive Technology Pass: macOS VoiceOver

- App build or commit: ${evidenceCommit}
- Browser: Safari
- Assistive technology: VoiceOver
- Result: pass
- Blockers: none

## Assistive Technology Pass: iOS VoiceOver

- App build or commit: ${evidenceCommit}
- Browser: Safari
- Assistive technology: iOS VoiceOver
- Result: pass
- Blockers: none

## Assistive Technology Pass: Android TalkBack

- App build or commit: ${evidenceCommit}
- Browser: Chrome
- Assistive technology: TalkBack
- Result: pass
- Blockers: none
`,
    externalGm: `# External GM Validation Evidence

## External GM Validation: release candidate session

- App build or commit: ${evidenceCommit}
- Setup path: hosted preview
- Workflows completed: campaign prep and play loop
- Result: pass
- Blockers: none
`,
    releaseWorkflow: `# Release Workflow Evidence

## Hosted Workflow Evidence: Release Smoke

- Commit SHA: ${evidenceCommit}
- Result: pass
- Release command or build command: pnpm release:smoke
- Run URL: https://github.example.test/run/1
- Blockers: none

## Hosted Workflow Evidence: Docs Site Deploy

- Commit SHA: ${evidenceCommit}
- Result: pass
- Release command or build command: pnpm docs:site:check
- Published URL, if docs-site deploy: https://docs.example.test/open-tabletop
- Run URL: https://github.example.test/run/2
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

function runChecker(root) {
  return spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_EVIDENCE_ROOT: root,
      OTTE_RELEASE_COMMIT: commit
    },
    encoding: "utf8"
  });
}

function runHandoff(root) {
  return spawnSync(process.execPath, [handoff], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_EVIDENCE_ROOT: root,
      OTTE_RELEASE_COMMIT: commit
    },
    encoding: "utf8"
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
