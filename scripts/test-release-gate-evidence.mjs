import { deepStrictEqual, doesNotMatch, match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join, parse } from "node:path";
import {
  currentWorkspaceState,
  expectedCheckTasks,
  parsePlaywrightSummary,
  parseVitestTaskSummaries,
  releaseGateEvidenceKind,
  releaseGateEvidenceSchemaVersion,
  releaseGatePresets,
  releaseGateStepTimeoutsMs,
  sumCountSummaries,
  validateReleaseGateEvidence,
  validateReleaseGateEvidenceSet,
} from "./release-gate-evidence.mjs";
import {
  appendBoundedOutput,
  boundedRedactedDiagnostic,
  releaseEvidenceDiagnosticMaxBytes,
  releaseEvidenceOutputDigestScope,
  summarizeReleaseEvidenceOutput,
} from "./release-evidence-diagnostics.mjs";
import { ensureReleaseEvidenceOutputDirectory } from "./release-evidence-output.mjs";
import "./test-release-evidence-process.mjs";

const repoRoot = process.cwd();
match(currentWorkspaceState(repoRoot).fingerprint, /^[0-9a-f]{64}$/);
const recorderSource = readFileSync(
  join(repoRoot, "scripts", "record-release-evidence.mjs"),
  "utf8",
);
match(recorderSource, /args\[index\] === "--"/);
match(recorderSource, /OTTE_GATE_TIMEOUT_DIAGNOSTIC/);
match(recorderSource, /appendBoundedOutput/);
match(recorderSource, /terminateGateProcessTree/);
match(recorderSource, /summarizeReleaseEvidenceOutput/);
let existingDirectoryCreationAttempted = false;
const existingFilesystemRoot = parse(repoRoot).root;
ensureReleaseEvidenceOutputDirectory(
  join(existingFilesystemRoot, "release-evidence.json"),
  {
    createDirectory() {
      existingDirectoryCreationAttempted = true;
      throw Object.assign(new Error("simulated Windows drive-root failure"), {
        code: "EPERM",
      });
    },
  },
);
strictEqual(existingDirectoryCreationAttempted, false);
let missingDirectoryCreation;
const missingDirectory = join(repoRoot, "missing-release-evidence-directory");
ensureReleaseEvidenceOutputDirectory(join(missingDirectory, "evidence.json"), {
  pathExists: () => false,
  createDirectory(directory, options) {
    missingDirectoryCreation = { directory, options };
  },
});
deepStrictEqual(missingDirectoryCreation, {
  directory: missingDirectory,
  options: { recursive: true },
});
const diagnostic = boundedRedactedDiagnostic(
  `${"build output\n".repeat(2_000)}Authorization: Bearer release-token-value\nOTTE_ASSET_URL_SIGNING_SECRET=signing secret with spaces\nhttps://operator:password@example.com/path?X-Amz-Credential=query-credential&X-Amz-Signature=query-signature\n{"password":"json-secret","safe":"retained"}\ngithub_pat_abcdefghijklmnopqrstuvwxyz1234567890\n-----BEGIN PRIVATE KEY-----\nprivate-key-value\n-----END PRIVATE KEY-----\nuseful compiler failure`,
  { maximumBytes: 1_024, sourceTruncatedBytes: 5 },
);
strictEqual(diagnostic.capturedBytes <= 1_024, true);
strictEqual(diagnostic.maximumBytes, 1_024);
strictEqual(diagnostic.truncated, true);
strictEqual(diagnostic.redactionApplied, true);
match(diagnostic.text, /useful compiler failure/);
match(diagnostic.text, /\[REDACTED/);
doesNotMatch(
  diagnostic.text,
  /release-token-value|signing secret with spaces|query-credential|query-signature|json-secret|private-key-value|github_pat_/,
);
strictEqual(releaseEvidenceDiagnosticMaxBytes, 16 * 1_024);
for (const [secret, output] of [
  [
    "super-secret words",
    String.raw`{"password":"super-secret words with an escaped \" quote"}`,
  ],
  ["secret words", 'tool --password "secret words"'],
  ["horse-battery", "curl -u alice:horse-battery https://example.com"],
  ["fragment-secret", "https://example.com/#access_token=fragment-secret"],
  [
    "unterminated-private-key-value",
    "-----BEGIN PRIVATE KEY-----\nunterminated-private-key-value",
  ],
]) {
  const redacted = boundedRedactedDiagnostic(output, { maximumBytes: 512 });
  strictEqual(redacted.redactionApplied, true);
  match(redacted.text, /\[REDACTED/);
  doesNotMatch(redacted.text, new RegExp(secret));
}
const emoji = String.fromCodePoint(0x1f600);
const multibyteTail = appendBoundedOutput("", `a${emoji}b`, 5);
deepStrictEqual(multibyteTail, { output: `${emoji}b`, truncatedBytes: 1 });
strictEqual(Buffer.byteLength(multibyteTail.output, "utf8") <= 5, true);
const firstSecretSummary = summarizeReleaseEvidenceOutput(
  "password=first low entropy secret",
);
const secondSecretSummary = summarizeReleaseEvidenceOutput(
  "password=second low entropy secret",
);
strictEqual(firstSecretSummary.outputSha256, secondSecretSummary.outputSha256);
strictEqual(
  firstSecretSummary.outputDigestScope,
  releaseEvidenceOutputDigestScope,
);
doesNotMatch(JSON.stringify(firstSecretSummary), /first low entropy secret/);

const releaseWorkflow = readFileSync(
  join(repoRoot, ".github", "workflows", "release-smoke.yml"),
  "utf8",
);
match(
  releaseWorkflow,
  /- name: Upload release gate evidence\s+if: always\(\)\s+uses: actions\/upload-artifact@[0-9a-f]+[\s\S]*?name: open-tabletop-release-gate-evidence[\s\S]*?path: artifacts\/release-evidence\/\*\.json[\s\S]*?if-no-files-found: error/,
);
match(releaseWorkflow, /timeout-minutes: 120/);
match(
  releaseWorkflow,
  /- name: Run release smoke\s+run: pnpm release:smoke:offline/,
);
match(
  releaseWorkflow,
  /- name: Audit open release issues\s+if: github\.event_name == 'push'\s+env:\s+GH_TOKEN: \$\{\{ github\.token \}\}\s+run: pnpm v1:issues:check/,
);
doesNotMatch(
  releaseWorkflow,
  /- name: Run release smoke\s+env:[\s\S]*?GH_TOKEN/,
);
match(
  releaseWorkflow,
  /name: open-tabletop-api-sbom[\s\S]*?\.codex-artifacts\/sbom\/open-tabletop-api\.cdx\.json[\s\S]*?include-hidden-files: true[\s\S]*?if-no-files-found: error/,
);
const commitSha = "a".repeat(40);
const expectedTasks = expectedCheckTasks(repoRoot);
const vitestOutput = [
  "@open-tabletop/core:test: Test Files  2 passed (2)",
  "@open-tabletop/core:test: Tests  4 passed | 1 skipped (5)",
  "@open-tabletop/api:test: Test Files  1 failed | 3 passed (4)",
  "@open-tabletop/api:test: Tests  1 failed | 8 passed | 1 skipped (10)",
].join("\n");
const parsed = parseVitestTaskSummaries(vitestOutput);
deepStrictEqual(parsed.get("@open-tabletop/core"), {
  testFiles: { total: 2, passed: 2, failed: 0, skipped: 0 },
  tests: { total: 5, passed: 4, failed: 0, skipped: 1 },
});
deepStrictEqual(parsed.get("@open-tabletop/api"), {
  testFiles: { total: 4, passed: 3, failed: 1, skipped: 0 },
  tests: { total: 10, passed: 8, failed: 1, skipped: 1 },
});
const groupedVitestOutput = [
  "\u001b[36m::group::@open-tabletop/web:test\u001b[0m",
  "\u001b[32m Test Files  3 passed (3)\u001b[0m",
  "      Tests  10 passed | 2 skipped (12)",
  "::endgroup::",
  "Tests  99 passed (99)",
  "::group::@open-tabletop/plugin:test",
  "No test files found, exiting with code 0",
  "::endgroup::",
].join("\r\n");
const groupedParsed = parseVitestTaskSummaries(groupedVitestOutput);
deepStrictEqual(groupedParsed.get("@open-tabletop/web"), {
  testFiles: { total: 3, passed: 3, failed: 0, skipped: 0 },
  tests: { total: 12, passed: 10, failed: 0, skipped: 2 },
});
deepStrictEqual(groupedParsed.get("@open-tabletop/plugin"), {
  testFiles: { total: 0, passed: 0, failed: 0, skipped: 0 },
  tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
});

const unrelatedGroupParsed = parseVitestTaskSummaries(
  [
    "::group::@open-tabletop/core:test",
    "Test Files  1 passed (1)",
    "Tests  2 passed (2)",
    "::group::@open-tabletop/web:build",
    "Test Files  99 passed (99)",
    "Tests  99 passed (99)",
    "::endgroup::",
  ].join("\n"),
);
deepStrictEqual(unrelatedGroupParsed.get("@open-tabletop/core"), {
  testFiles: { total: 1, passed: 1, failed: 0, skipped: 0 },
  tests: { total: 2, passed: 2, failed: 0, skipped: 0 },
});
strictEqual(unrelatedGroupParsed.has("@open-tabletop/web"), false);

const mixedParsed = parseVitestTaskSummaries(
  [
    "::group::@open-tabletop/core:test",
    "Test Files  2 passed (2)",
    "@open-tabletop/api:test: Test Files  3 passed (3)",
    "@open-tabletop/api:test: Tests  6 passed (6)",
    "Tests  4 passed (4)",
    "::endgroup::",
    "@open-tabletop/web:test: No test files found",
  ].join("\n"),
);
deepStrictEqual(mixedParsed.get("@open-tabletop/core"), {
  testFiles: { total: 2, passed: 2, failed: 0, skipped: 0 },
  tests: { total: 4, passed: 4, failed: 0, skipped: 0 },
});
deepStrictEqual(mixedParsed.get("@open-tabletop/api"), {
  testFiles: { total: 3, passed: 3, failed: 0, skipped: 0 },
  tests: { total: 6, passed: 6, failed: 0, skipped: 0 },
});
deepStrictEqual(mixedParsed.get("@open-tabletop/web"), {
  testFiles: { total: 0, passed: 0, failed: 0, skipped: 0 },
  tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
});
deepStrictEqual(
  parsePlaywrightSummary(
    `[WebServer] started\n${JSON.stringify({
      config: {},
      stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
    })}\n[WebServer] stopped {status: 0}`,
  ),
  { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
);

const now = "2026-07-16T12:00:00.000Z";
const later = "2026-07-16T12:00:01.000Z";
const checkCompleted = "2026-07-16T12:00:05.000Z";
const tasks = expectedTasks.map((task) => ({
  ...task,
  result: "pass",
  ...(task.task === "test"
    ? {
        testFiles: { total: 1, passed: 1, failed: 0, skipped: 0 },
        tests: { total: 2, passed: 2, failed: 0, skipped: 0 },
      }
    : {}),
}));
const testFiles = sumCountSummaries(tasks.map((task) => task.testFiles));
const tests = sumCountSummaries(tasks.map((task) => task.tests));
const artifact = {
  kind: releaseGateEvidenceKind,
  schemaVersion: releaseGateEvidenceSchemaVersion,
  gate: "check",
  command: releaseGatePresets.check.command,
  commitSha,
  workspace: {
    dirty: false,
    statusEntries: [],
    fingerprint: "f".repeat(64),
    changedDuringRun: false,
  },
  environment: { turboForce: true, apiTestSeed: 20_260_717 },
  startedAt: now,
  completedAt: checkCompleted,
  durationMs: 5_000,
  result: "pass",
  exitCode: 0,
  steps: releaseGatePresets.check.stepCommands.map((command, index) => ({
    command,
    startedAt: new Date(Date.parse(now) + index * 1_000).toISOString(),
    completedAt: new Date(Date.parse(now) + (index + 1) * 1_000).toISOString(),
    durationMs: 1_000,
    timeoutMs: releaseGateStepTimeoutsMs[command],
    timedOut: false,
    result: "pass",
    exitCode: 0,
    outputSha256: "b".repeat(64),
    outputDigestScope: releaseEvidenceOutputDigestScope,
  })),
  tasks,
  totals: { testFiles, tests },
};

strictEqual(
  validateReleaseGateEvidence(artifact, {
    expectedCommit: commitSha,
    repoRoot,
  }).ok,
  true,
);

const secondArtifact = {
  ...artifact,
  environment: { ...artifact.environment, apiTestSeed: 20_260_718 },
  startedAt: "2026-07-16T12:00:06.000Z",
  completedAt: "2026-07-16T12:00:11.000Z",
  steps: artifact.steps.map((step) => ({
    ...step,
    startedAt: new Date(Date.parse(step.startedAt) + 6_000).toISOString(),
    completedAt: new Date(Date.parse(step.completedAt) + 6_000).toISOString(),
  })),
};
strictEqual(
  validateReleaseGateEvidenceSet([artifact, secondArtifact]).ok,
  true,
);
const overlappingPair = validateReleaseGateEvidenceSet([
  artifact,
  { ...secondArtifact, startedAt: "2026-07-16T12:00:04.500Z" },
]);
strictEqual(overlappingPair.ok, false);
match(overlappingPair.errors.join("\n"), /sequential, not overlapping/);
const repeatedSeedPair = validateReleaseGateEvidenceSet([
  artifact,
  { ...secondArtifact, environment: artifact.environment },
]);
strictEqual(repeatedSeedPair.ok, false);
match(
  repeatedSeedPair.errors.join("\n"),
  /distinct recorded API file-order seeds/,
);

const timedOutStep = validateReleaseGateEvidence(
  {
    ...artifact,
    steps: artifact.steps.map((step, index) =>
      index === 0 ? { ...step, timedOut: true } : step,
    ),
  },
  { expectedCommit: commitSha, repoRoot },
);
strictEqual(timedOutStep.ok, false);
match(timedOutStep.errors.join("\n"), /timedOut must be false/);

const overlappingSteps = validateReleaseGateEvidence(
  {
    ...artifact,
    steps: artifact.steps.map((step, index) =>
      index === 1
        ? {
            ...step,
            startedAt: now,
            completedAt: later,
            durationMs: 1_000,
          }
        : step,
    ),
  },
  { expectedCommit: commitSha, repoRoot },
);
strictEqual(overlappingSteps.ok, false);
match(overlappingSteps.errors.join("\n"), /must not overlap the previous step/);

const firstTestTaskIndex = artifact.tasks.findIndex(
  (task) => task.task === "test",
);
const failedCount = validateReleaseGateEvidence(
  {
    ...artifact,
    tasks: artifact.tasks.map((task, index) =>
      index === firstTestTaskIndex
        ? {
            ...task,
            tests: { total: 2, passed: 1, failed: 1, skipped: 0 },
          }
        : task,
    ),
  },
  { expectedCommit: commitSha, repoRoot },
);
strictEqual(failedCount.ok, false);
match(failedCount.errors.join("\n"), /failed must be 0 for passing evidence/);

const stale = validateReleaseGateEvidence(artifact, {
  expectedCommit: "c".repeat(40),
  repoRoot,
});
strictEqual(stale.ok, false);
match(stale.errors.join("\n"), /does not match checked commit/);

const dirty = validateReleaseGateEvidence(
  {
    ...artifact,
    workspace: {
      dirty: true,
      statusEntries: [" M package.json"],
      fingerprint: "e".repeat(64),
      changedDuringRun: false,
    },
  },
  { expectedCommit: commitSha, repoRoot },
);
strictEqual(dirty.ok, false);
match(dirty.errors.join("\n"), /workspace\.dirty must be false/);
strictEqual(
  validateReleaseGateEvidence(
    {
      ...artifact,
      workspace: {
        dirty: true,
        statusEntries: [" M package.json"],
        fingerprint: "e".repeat(64),
        changedDuringRun: false,
      },
    },
    {
      expectedCommit: commitSha,
      repoRoot,
      allowDirty: true,
      expectedWorkspaceFingerprint: "e".repeat(64),
    },
  ).ok,
  true,
);

const missingTask = validateReleaseGateEvidence(
  { ...artifact, tasks: artifact.tasks.slice(1) },
  { expectedCommit: commitSha, repoRoot },
);
strictEqual(missingTask.ok, false);
match(missingTask.errors.join("\n"), /missing per-package task result/);

const canonicalArtifact = {
  ...artifact,
  gate: "canonical",
  command: releaseGatePresets.canonical.command,
  steps: [
    {
      command: releaseGatePresets.canonical.command,
      startedAt: now,
      completedAt: later,
      durationMs: 1000,
      timeoutMs:
        releaseGateStepTimeoutsMs[releaseGatePresets.canonical.command],
      timedOut: false,
      result: "pass",
      exitCode: 0,
      outputSha256: "d".repeat(64),
      outputDigestScope: releaseEvidenceOutputDigestScope,
    },
  ],
  tasks: [
    {
      package: "open-tabletop-engine",
      task: "canonical",
      command: releaseGatePresets.canonical.command,
      result: "pass",
      tests: { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
    },
  ],
  totals: {
    tests: { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
  },
};
strictEqual(
  validateReleaseGateEvidence(canonicalArtifact, {
    expectedCommit: commitSha,
    repoRoot,
  }).ok,
  true,
);

const v1Checker = readFileSync(
  join(repoRoot, "scripts", "check-v1-release-evidence.mjs"),
  "utf8",
);
match(v1Checker, /--gate-artifact/);
match(v1Checker, /validateReleaseGateEvidence/);

console.log(
  `Release-gate evidence tests passed (${expectedTasks.length} package task results checked).`,
);
