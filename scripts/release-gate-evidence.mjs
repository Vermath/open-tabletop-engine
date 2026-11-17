import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { releaseEvidenceOutputDigestScope } from "./release-evidence-diagnostics.mjs";

export const releaseGateEvidenceKind = "open-tabletop.release-gate-evidence";
export const releaseGateEvidenceSchemaVersion = 1;

const checkCommand = "pnpm check";
const checkStepCommands = [
  "pnpm lint",
  "pnpm typecheck",
  "pnpm e2e:typecheck",
  "pnpm test",
  "pnpm build",
];
const canonicalCommand =
  "pnpm exec playwright test -c playwright.canonical.config.ts --reporter=json";

export const releaseGateStepTimeoutsMs = {
  "pnpm lint": 5 * 60_000,
  "pnpm typecheck": 5 * 60_000,
  "pnpm e2e:typecheck": 2 * 60_000,
  "pnpm test": 15 * 60_000,
  "pnpm build": 5 * 60_000,
  [canonicalCommand]: 5 * 60_000,
};

export const releaseGatePresets = {
  check: {
    command: checkCommand,
    stepCommands: checkStepCommands,
    maxDurationMs: checkStepCommands.reduce(
      (total, command) => total + releaseGateStepTimeoutsMs[command],
      0,
    ),
  },
  canonical: {
    command: canonicalCommand,
    stepCommands: [canonicalCommand],
    maxDurationMs: releaseGateStepTimeoutsMs[canonicalCommand],
  },
};

export function discoverWorkspacePackages(repoRoot) {
  const packages = [];
  for (const parent of ["apps", "packages", "plugins"]) {
    const parentPath = join(repoRoot, parent);
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(parentPath, entry.name, "package.json");
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        continue;
      }
      if (typeof manifest.name !== "string") continue;
      packages.push({
        name: manifest.name,
        directory: `${parent}/${entry.name}`,
        scripts: manifest.scripts ?? {},
      });
    }
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function currentWorkspaceState(repoRoot) {
  const evidencePrefix = "artifacts/release-evidence/";
  const statusEntries = git(repoRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ])
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(
      (entry) =>
        !entry.slice(3).replaceAll("\\", "/").startsWith(evidencePrefix),
    );
  const hash = createHash("sha256");
  hash.update(git(repoRoot, ["diff", "--binary", "HEAD", "--", "."]));
  const untrackedPaths = git(repoRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(evidencePrefix))
    .sort();
  for (const path of untrackedPaths) {
    hash.update(`\0${path}\0`);
    hash.update(readFileSync(join(repoRoot, path)));
  }
  return {
    dirty: statusEntries.length > 0,
    statusEntries,
    fingerprint: hash.digest("hex"),
  };
}

export function expectedCheckTasks(repoRoot) {
  const tasks = [];
  for (const workspacePackage of discoverWorkspacePackages(repoRoot)) {
    for (const task of ["lint", "typecheck", "test", "build"]) {
      const command = workspacePackage.scripts[task];
      if (typeof command !== "string") continue;
      tasks.push({
        package: workspacePackage.name,
        task,
        command,
      });
    }
  }

  const rootManifest = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  tasks.push({
    package: rootManifest.name,
    task: "e2e:typecheck",
    command: rootManifest.scripts?.["e2e:typecheck"],
  });
  return tasks.sort((left, right) =>
    taskKey(left).localeCompare(taskKey(right)),
  );
}

export function parseVitestTaskSummaries(output) {
  const summaries = new Map();
  let groupedPackageName;
  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (/^::endgroup::$/.test(trimmedLine)) {
      groupedPackageName = undefined;
      continue;
    }
    if (trimmedLine.startsWith("::group::")) {
      groupedPackageName = trimmedLine.match(
        /^::group::(@?[^:\s]+):test$/,
      )?.[1];
      continue;
    }

    const prefixedLine = rawLine.match(/^(@?[^:\s]+):test:\s*(.*)$/);
    const packageName = prefixedLine?.[1] ?? groupedPackageName;
    if (!packageName) continue;
    const content = (prefixedLine?.[2] ?? trimmedLine).trim();
    const summary = summaries.get(packageName) ?? {};
    let recognizedSummary = false;
    if (/^No test files found/i.test(content)) {
      summary.testFiles = emptyCounts();
      summary.tests = emptyCounts();
      recognizedSummary = true;
    }
    const testFiles = parseCountSummary(content, "Test Files");
    if (testFiles) {
      summary.testFiles = testFiles;
      recognizedSummary = true;
    }
    const tests = parseCountSummary(content, "Tests");
    if (tests) {
      summary.tests = tests;
      recognizedSummary = true;
    }
    if (prefixedLine || recognizedSummary) {
      summaries.set(packageName, summary);
    }
  }
  return summaries;
}

export function parsePlaywrightSummary(output) {
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    const reportStart = Math.max(
      output.lastIndexOf('{\n  "config"'),
      output.lastIndexOf('{"config"'),
    );
    const reportJson = jsonObjectAt(output, reportStart);
    if (!reportJson) return undefined;
    try {
      report = JSON.parse(reportJson);
    } catch {
      return undefined;
    }
  }
  const stats = report?.stats;
  if (!stats || !integer(stats.expected) || !integer(stats.unexpected)) {
    return undefined;
  }
  return {
    total:
      stats.expected +
      stats.unexpected +
      (integer(stats.skipped) ? stats.skipped : 0) +
      (integer(stats.flaky) ? stats.flaky : 0),
    passed: stats.expected + (integer(stats.flaky) ? stats.flaky : 0),
    failed: stats.unexpected,
    skipped: integer(stats.skipped) ? stats.skipped : 0,
    flaky: integer(stats.flaky) ? stats.flaky : 0,
  };
}

export function validateReleaseGateEvidence(
  document,
  {
    expectedCommit,
    repoRoot,
    expectedGate,
    allowDirty = false,
    expectedWorkspaceFingerprint,
  },
) {
  const errors = [];
  if (document?.kind !== releaseGateEvidenceKind) {
    errors.push(`kind must be ${releaseGateEvidenceKind}`);
  }
  if (document?.schemaVersion !== releaseGateEvidenceSchemaVersion) {
    errors.push(`schemaVersion must be ${releaseGateEvidenceSchemaVersion}`);
  }
  if (!releaseGatePresets[document?.gate]) {
    errors.push("gate must be check or canonical");
  }
  if (expectedGate && document?.gate !== expectedGate) {
    errors.push(`gate must be ${expectedGate}`);
  }
  if (!fullSha(document?.commitSha)) {
    errors.push("commitSha must be a full 40-character Git SHA");
  } else if (
    fullSha(expectedCommit) &&
    document.commitSha.toLowerCase() !== expectedCommit.toLowerCase()
  ) {
    errors.push(
      `commitSha ${document.commitSha} does not match checked commit ${expectedCommit}`,
    );
  }
  if (document?.workspace?.dirty !== false) {
    if (!allowDirty) {
      errors.push("workspace.dirty must be false for release evidence");
    } else if (
      !/^[0-9a-f]{64}$/i.test(document?.workspace?.fingerprint ?? "") ||
      document.workspace.fingerprint !== expectedWorkspaceFingerprint
    ) {
      errors.push(
        "dirty-worktree evidence fingerprint does not match the current workspace",
      );
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(document?.workspace?.fingerprint ?? "")) {
    errors.push("workspace.fingerprint must be a SHA-256 digest");
  }
  if (!Array.isArray(document?.workspace?.statusEntries)) {
    errors.push("workspace.statusEntries must be an array");
  }
  if (document?.workspace?.changedDuringRun !== false) {
    errors.push("workspace.changedDuringRun must be false");
  }
  if (
    expectedWorkspaceFingerprint &&
    document?.workspace?.fingerprint !== expectedWorkspaceFingerprint
  ) {
    errors.push("workspace fingerprint does not match the current workspace");
  }
  if (document?.result !== "pass" || document?.exitCode !== 0) {
    errors.push("result must be pass with exitCode 0");
  }
  validateTiming(document, "evidence", errors);

  const preset = releaseGatePresets[document?.gate];
  if (preset && document.command !== preset.command) {
    errors.push(`command must be exactly: ${preset.command}`);
  }
  if (preset && document.durationMs > preset.maxDurationMs) {
    errors.push(
      `evidence.durationMs exceeds the ${preset.maxDurationMs}ms gate bound`,
    );
  }

  const steps = Array.isArray(document?.steps) ? document.steps : [];
  if (preset) {
    const commands = steps.map((step) => step.command);
    if (JSON.stringify(commands) !== JSON.stringify(preset.stepCommands)) {
      errors.push(
        `steps must record the exact commands: ${preset.stepCommands.join(
          " -> ",
        )}`,
      );
    }
  }
  const evidenceStartedAt = Date.parse(document?.startedAt);
  const evidenceCompletedAt = Date.parse(document?.completedAt);
  let previousStepCompletedAt;
  for (const [index, step] of steps.entries()) {
    if (step.result !== "pass" || step.exitCode !== 0) {
      errors.push(`steps[${index}] must pass with exitCode 0`);
    }
    if (!/^[0-9a-f]{64}$/i.test(step.outputSha256 ?? "")) {
      errors.push(`steps[${index}].outputSha256 must be a SHA-256 digest`);
    }
    if (step.outputDigestScope !== releaseEvidenceOutputDigestScope) {
      errors.push(
        `steps[${index}].outputDigestScope must be ${releaseEvidenceOutputDigestScope}`,
      );
    }
    validateTiming(step, `steps[${index}]`, errors);
    const stepStartedAt = Date.parse(step.startedAt);
    const stepCompletedAt = Date.parse(step.completedAt);
    if (
      Number.isFinite(evidenceStartedAt) &&
      Number.isFinite(evidenceCompletedAt) &&
      Number.isFinite(stepStartedAt) &&
      Number.isFinite(stepCompletedAt) &&
      (stepStartedAt < evidenceStartedAt ||
        stepCompletedAt > evidenceCompletedAt)
    ) {
      errors.push(`steps[${index}] must be contained within evidence timing`);
    }
    if (
      Number.isFinite(previousStepCompletedAt) &&
      Number.isFinite(stepStartedAt) &&
      stepStartedAt < previousStepCompletedAt
    ) {
      errors.push(`steps[${index}] must not overlap the previous step`);
    }
    if (Number.isFinite(stepCompletedAt)) {
      previousStepCompletedAt = stepCompletedAt;
    }
    const expectedTimeoutMs = releaseGateStepTimeoutsMs[step.command];
    if (step.timeoutMs !== expectedTimeoutMs) {
      errors.push(`steps[${index}].timeoutMs must be ${expectedTimeoutMs}`);
    }
    if (step.timedOut !== false) {
      errors.push(`steps[${index}].timedOut must be false`);
    }
    if (expectedTimeoutMs && step.durationMs > expectedTimeoutMs) {
      errors.push(`steps[${index}].durationMs exceeds its command bound`);
    }
  }

  const tasks = Array.isArray(document?.tasks) ? document.tasks : [];
  const uniqueTaskKeys = new Set();
  for (const [index, task] of tasks.entries()) {
    const key = taskKey(task);
    if (uniqueTaskKeys.has(key)) {
      errors.push(`duplicate task result ${key}`);
    }
    uniqueTaskKeys.add(key);
    if (task.result !== "pass") {
      errors.push(`tasks[${index}] ${key} did not pass`);
    }
  }

  if (document?.gate === "check") {
    if (
      !integer(document?.environment?.apiTestSeed) ||
      document.environment.apiTestSeed <= 0
    ) {
      errors.push(
        "environment.apiTestSeed must record the deterministic API file-order seed",
      );
    }
    const expectedTasks = expectedCheckTasks(repoRoot);
    const actualByKey = new Map(tasks.map((task) => [taskKey(task), task]));
    for (const expected of expectedTasks) {
      const key = taskKey(expected);
      const actual = actualByKey.get(key);
      if (!actual) {
        errors.push(`missing per-package task result ${key}`);
        continue;
      }
      if (actual.command !== expected.command) {
        errors.push(`${key} command does not match its package.json script`);
      }
      if (expected.task === "test") {
        validateCounts(actual.testFiles, `${key}.testFiles`, errors);
        validateCounts(actual.tests, `${key}.tests`, errors);
      }
    }
    if (tasks.length !== expectedTasks.length) {
      errors.push(
        `expected ${expectedTasks.length} per-package task results, received ${tasks.length}`,
      );
    }
    validateCounts(document?.totals?.testFiles, "totals.testFiles", errors);
    validateCounts(document?.totals?.tests, "totals.tests", errors);
    compareCounts(
      document?.totals?.testFiles,
      sumCountSummaries(tasks.map((task) => task.testFiles)),
      "totals.testFiles",
      errors,
    );
    compareCounts(
      document?.totals?.tests,
      sumCountSummaries(tasks.map((task) => task.tests)),
      "totals.tests",
      errors,
    );
  }

  if (document?.gate === "canonical") {
    if (tasks.length !== 1 || tasks[0]?.task !== "canonical") {
      errors.push("canonical evidence must contain one canonical task result");
    }
    if (tasks[0]?.command !== releaseGatePresets.canonical.command) {
      errors.push("canonical task command does not match the canonical gate");
    }
    validateCounts(document?.totals?.tests, "totals.tests", errors);
    compareCounts(
      document?.totals?.tests,
      tasks[0]?.tests,
      "totals.tests",
      errors,
    );
    if ((document?.totals?.tests?.total ?? 0) < 1) {
      errors.push("canonical evidence must record at least one test");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateReleaseGateEvidenceSet(
  documents,
  { requiredCheckPasses = 2 } = {},
) {
  const errors = [];
  const checks = documents
    .filter((document) => document?.gate === "check")
    .sort(
      (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
    );
  if (checks.length < requiredCheckPasses) {
    errors.push(
      `expected at least ${requiredCheckPasses} check artifacts, received ${checks.length}`,
    );
    return { ok: false, errors };
  }
  const selected = checks.slice(-requiredCheckPasses);
  if (new Set(selected.map((document) => document.commitSha)).size !== 1) {
    errors.push("check artifacts must target one commit");
  }
  if (
    new Set(selected.map((document) => document.workspace?.fingerprint))
      .size !== 1
  ) {
    errors.push("check artifacts must target one workspace fingerprint");
  }
  if (
    new Set(selected.map((document) => document.startedAt)).size !==
    selected.length
  ) {
    errors.push("check artifacts must record distinct runs");
  }
  if (selected.some((document) => document.environment?.turboForce !== true)) {
    errors.push("check artifacts must record TURBO_FORCE=true cold execution");
  }
  if (
    new Set(selected.map((document) => document.environment?.apiTestSeed))
      .size !== selected.length
  ) {
    errors.push(
      "check artifacts must use distinct recorded API file-order seeds",
    );
  }
  for (let index = 1; index < selected.length; index += 1) {
    if (
      Date.parse(selected[index].startedAt) <
      Date.parse(selected[index - 1].completedAt)
    ) {
      errors.push("check artifacts must be sequential, not overlapping");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function sumCountSummaries(values) {
  const total = emptyCounts();
  for (const value of values) {
    if (!value) continue;
    for (const field of ["total", "passed", "failed", "skipped"]) {
      total[field] += value[field] ?? 0;
    }
  }
  return total;
}

function taskKey(task) {
  return `${task.package}#${task.task}`;
}

function parseCountSummary(content, label) {
  const match = content.match(
    new RegExp(`^${label}\\s+(.+?)\\s+\\((\\d+)\\)`, "i"),
  );
  if (!match) return undefined;
  const counts = { ...emptyCounts(), total: Number(match[2]) };
  for (const part of match[1].matchAll(
    /(\d+)\s+(passed|failed|skipped|todo)/gi,
  )) {
    const field =
      part[2].toLowerCase() === "todo" ? "skipped" : part[2].toLowerCase();
    counts[field] += Number(part[1]);
  }
  return counts;
}

function validateTiming(value, label, errors) {
  const started = Date.parse(value?.startedAt);
  const completed = Date.parse(value?.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    errors.push(
      `${label} must have valid startedAt and completedAt timestamps`,
    );
    return;
  }
  if (!integer(value?.durationMs) || value.durationMs < 0) {
    errors.push(`${label}.durationMs must be a non-negative integer`);
    return;
  }
  if (
    completed < started ||
    Math.abs(completed - started - value.durationMs) > 5
  ) {
    errors.push(`${label}.durationMs must match its timestamps`);
  }
}

function validateCounts(value, label, errors) {
  if (
    !value ||
    !["total", "passed", "failed", "skipped"].every(
      (field) => integer(value[field]) && value[field] >= 0,
    )
  ) {
    errors.push(`${label} must contain non-negative integer counts`);
    return;
  }
  if (value.total !== value.passed + value.failed + value.skipped) {
    errors.push(`${label}.total must equal passed + failed + skipped`);
  }
  if (value.failed !== 0) {
    errors.push(`${label}.failed must be 0 for passing evidence`);
  }
}

function compareCounts(actual, expected, label, errors) {
  if (!actual || !expected) return;
  for (const field of ["total", "passed", "failed", "skipped"]) {
    if (actual[field] !== expected[field]) {
      errors.push(`${label}.${field} does not match per-task results`);
    }
  }
}

function emptyCounts() {
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function jsonObjectAt(value, start) {
  if (start < 0 || value[start] !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return undefined;
}

function integer(value) {
  return Number.isInteger(value);
}

function fullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 100 * 1024 * 1024,
  });
}
