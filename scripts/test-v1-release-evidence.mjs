import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const commit = "1234567890abcdef1234567890abcdef12345678";
const checker = join(repoRoot, "scripts", "check-v1-release-evidence.mjs");

runFailsWhenEvidenceIsMissing();
runPassesWhenEvidenceIsComplete();
runPassesWithShortCommitEvidence();
runPassesWithOwnerApprovedManualOverrides();
runFailsWhenEvidenceTargetsAnotherCommit();
runFailsWithTooShortCommitEvidence();
runFailsWithProseOnlyDocsPublicationOverride();

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
