import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
} from "./release-gate-evidence.mjs";
import {
  appendBoundedOutput,
  summarizeReleaseEvidenceOutput,
} from "./release-evidence-diagnostics.mjs";
import {
  spawnGateProcess,
  terminateGateProcessTree,
} from "./release-evidence-process.mjs";

const repoRoot = process.cwd();
const { gate, outputPath } = parseArguments(process.argv.slice(2));
const preset = releaseGatePresets[gate];
if (!preset) {
  fail(
    "Usage: node scripts/record-release-evidence.mjs <check|canonical> [--output <path>]",
  );
}

const rootManifest = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);
if (gate === "check") {
  const expectedCheckScript = preset.stepCommands.join(" && ");
  if (rootManifest.scripts?.check !== expectedCheckScript) {
    fail(
      `package.json check script drifted. Expected \`${expectedCheckScript}\`; update the evidence preset deliberately.`,
    );
  }
}

const commitSha = git(["rev-parse", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const workspaceAtStart = currentWorkspaceState(repoRoot);
const startedAtMs = Date.now();
const steps = [];
let exitCode = 0;

for (const command of preset.stepCommands) {
  const step = await run(command, {
    quiet: gate === "canonical",
    timeoutMs: releaseGateStepTimeoutsMs[command],
  });
  steps.push(step);
  if (step.exitCode !== 0) {
    exitCode = step.exitCode;
    break;
  }
}

const completedAtMs = Date.now();
const workspaceAtEnd = currentWorkspaceState(repoRoot);
const workspaceChangedDuringRun =
  workspaceAtStart.fingerprint !== workspaceAtEnd.fingerprint;
if (workspaceChangedDuringRun && exitCode === 0) exitCode = 1;
const tasks =
  gate === "check"
    ? checkTasks(repoRoot, steps)
    : canonicalTasks(preset.command, steps[0]);
const totals =
  gate === "check"
    ? {
        testFiles: sumCountSummaries(tasks.map((task) => task.testFiles)),
        tests: sumCountSummaries(tasks.map((task) => task.tests)),
      }
    : { tests: tasks[0]?.tests ?? emptyCounts() };

const artifact = {
  kind: releaseGateEvidenceKind,
  schemaVersion: releaseGateEvidenceSchemaVersion,
  gate,
  command: preset.command,
  commitSha,
  branch,
  workspace: {
    ...workspaceAtStart,
    changedDuringRun: workspaceChangedDuringRun,
  },
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    packageManager: rootManifest.packageManager,
    turboForce: process.env.TURBO_FORCE === "true",
    apiTestSeed: boundedSeed(process.env.OTTE_API_TEST_SEED) ?? 20_260_717,
  },
  startedAt: new Date(startedAtMs).toISOString(),
  completedAt: new Date(completedAtMs).toISOString(),
  durationMs: completedAtMs - startedAtMs,
  result: exitCode === 0 ? "pass" : "fail",
  exitCode,
  steps: steps.map(({ diagnostic, output, ...step }) => ({
    ...step,
    ...(step.result === "fail" ? { diagnostic } : {}),
  })),
  tasks,
  totals,
};

const destination =
  outputPath ??
  join(
    repoRoot,
    "artifacts",
    "release-evidence",
    `${fileTimestamp(artifact.startedAt)}-${commitSha.slice(0, 12)}-${gate}.json`,
  );
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(`\nRelease-gate evidence: ${relative(repoRoot, destination)}`);
console.log(`Result: ${artifact.result}; commit: ${commitSha}`);
if (artifact.workspace.dirty) {
  console.warn(
    "This run was recorded from a dirty worktree. The standalone checker accepts it only while the exact workspace fingerprint still matches; the v1 release checker requires a clean candidate.",
  );
}
if (artifact.workspace.changedDuringRun) {
  console.error(
    "The workspace changed while the gate ran, so this artifact is not valid evidence.",
  );
}
console.log(
  `Verify after a clean candidate run with: pnpm gate:evidence:check -- "${relative(repoRoot, destination)}"`,
);
process.exit(exitCode);

function checkTasks(root, recordedSteps) {
  const stepByTask = new Map(
    recordedSteps.map((step) => [step.command.replace(/^pnpm\s+/, ""), step]),
  );
  const testStep = stepByTask.get("test");
  const summaries = parseVitestTaskSummaries(testStep?.output ?? "");
  return expectedCheckTasks(root).map((task) => {
    const step = stepByTask.get(task.task);
    const result = !step
      ? "not-run"
      : step.exitCode === 0
        ? "pass"
        : "not-passed";
    const summary =
      task.task === "test" ? summaries.get(task.package) : undefined;
    return {
      ...task,
      result,
      ...(summary?.testFiles ? { testFiles: summary.testFiles } : {}),
      ...(summary?.tests ? { tests: summary.tests } : {}),
    };
  });
}

function canonicalTasks(command, step) {
  const tests = parsePlaywrightSummary(step?.output ?? "");
  return [
    {
      package: "open-tabletop-engine",
      task: "canonical",
      command,
      result: step?.exitCode === 0 ? "pass" : "not-passed",
      ...(tests ? { tests } : {}),
    },
  ];
}

function run(command, { quiet, timeoutMs }) {
  const [program, ...programArgs] = command.split(/\s+/);
  const executable =
    process.platform === "win32"
      ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
      : program;
  const args =
    process.platform === "win32" ? ["/d", "/s", "/c", command] : programArgs;
  const startedAtMs = Date.now();
  let output = "";
  let outputTruncatedBytes = 0;
  let timedOut = false;
  let terminationPromise = Promise.resolve();
  console.log(`\n$ ${command}`);
  return new Promise((resolvePromise) => {
    const child = spawnGateProcess(executable, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        const appended = appendBoundedOutput(output, text);
        output = appended.output;
        outputTruncatedBytes += appended.truncatedBytes;
        if (!quiet) process.stdout.write(chunk);
      });
    }
    child.on("error", (error) => {
      const text = `${error.stack ?? error.message}\n`;
      const appended = appendBoundedOutput(output, text);
      output = appended.output;
      outputTruncatedBytes += appended.truncatedBytes;
      process.stderr.write(text);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      const diagnostic = `OTTE_GATE_TIMEOUT_DIAGNOSTIC ${JSON.stringify({ command, timeoutMs, elapsedMs: Date.now() - startedAtMs, pid: child.pid, platform: process.platform })}\n`;
      const appended = appendBoundedOutput(output, diagnostic);
      output = appended.output;
      outputTruncatedBytes += appended.truncatedBytes;
      process.stderr.write(diagnostic);
      terminationPromise = terminateGateProcessTree(child).catch((error) => {
        const terminationDiagnostic = `OTTE_GATE_TERMINATION_ERROR ${error.stack ?? error.message}\n`;
        const terminationAppend = appendBoundedOutput(
          output,
          terminationDiagnostic,
        );
        output = terminationAppend.output;
        outputTruncatedBytes += terminationAppend.truncatedBytes;
        process.stderr.write(terminationDiagnostic);
      });
    }, timeoutMs);
    timeout.unref?.();
    child.on("close", async (code) => {
      clearTimeout(timeout);
      await terminationPromise;
      const completedAtMs = Date.now();
      if (quiet) {
        const summary = parsePlaywrightSummary(output);
        if (summary) {
          console.log(
            `Playwright: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`,
          );
        } else if (output) {
          process.stdout.write(output);
        }
      }
      const outputSummary = summarizeReleaseEvidenceOutput(output, {
        sourceTruncatedBytes: outputTruncatedBytes,
      });
      resolvePromise({
        command,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date(completedAtMs).toISOString(),
        durationMs: completedAtMs - startedAtMs,
        timeoutMs,
        timedOut,
        result: code === 0 && !timedOut ? "pass" : "fail",
        exitCode: timedOut ? 124 : (code ?? 1),
        outputSha256: outputSummary.outputSha256,
        outputDigestScope: outputSummary.outputDigestScope,
        outputTruncatedBytes,
        output,
        diagnostic: outputSummary.diagnostic,
      });
    });
  });
}

function parseArguments(args) {
  let gate;
  let outputPath;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") {
      continue;
    } else if (args[index] === "--output") {
      if (!args[index + 1]) fail("--output requires a path");
      outputPath = resolve(repoRoot, args[index + 1]);
      index += 1;
    } else if (!gate) {
      gate = args[index];
    } else {
      fail(`Unknown argument: ${args[index]}`);
    }
  }
  return { gate, outputPath };
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0)
    fail(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function fileTimestamp(timestamp) {
  return timestamp.replace(/[-:.]/g, "").replace("Z", "Z");
}

function emptyCounts() {
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

function boundedSeed(value) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647
    ? parsed
    : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
