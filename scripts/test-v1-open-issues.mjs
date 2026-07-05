import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const checker = join(repoRoot, "scripts", "check-v1-open-issues.mjs");

runPassesWithNoOpenIssues();
runPassesWithUnlabeledTrackingIssue();
runFailsWithP0Issue();
runFailsWithPriorityP1Issue();
runRejectsInvalidJsonShape();
runUsesExpandedGitHubIssueLimit();

console.log("v1 open issue audit tests passed.");

function runPassesWithNoOpenIssues() {
  const result = runChecker([]);
  assert(result.status === 0, "empty open issue list should pass");
  assert(result.stdout.includes("0 open issue(s), 0 P0/P1"), "empty issue pass should report counts");
}

function runPassesWithUnlabeledTrackingIssue() {
  const result = runChecker([
    {
      number: 2,
      title: "Track remaining v1 external evidence blockers",
      labels: [],
      url: "https://github.com/Vermath/open-tabletop-engine/issues/2"
    }
  ]);
  assert(result.status === 0, "unlabeled tracking issue should pass");
  assert(result.stdout.includes("1 open issue(s), 0 P0/P1"), "tracking issue pass should report one open issue");
}

function runFailsWithP0Issue() {
  const result = runChecker([
    {
      number: 10,
      title: "Data loss on import",
      labels: [{ name: "P0" }],
      url: "https://github.com/Vermath/open-tabletop-engine/issues/10"
    }
  ]);
  assert(result.status === 1, "P0 issue should fail");
  assert(result.stderr.includes("Open P0/P1 issue audit failed: 1 blocking issue(s) found."), "P0 failure should report blocking count");
  assert(result.stderr.includes("#10 Data loss on import [P0]"), "P0 failure should list issue details");
}

function runFailsWithPriorityP1Issue() {
  const result = runChecker([
    {
      number: 11,
      title: "External GM cannot complete setup",
      labels: [{ name: "priority: p1" }],
      url: "https://github.com/Vermath/open-tabletop-engine/issues/11"
    }
  ]);
  assert(result.status === 1, "priority p1 issue should fail");
  assert(result.stderr.includes("#11 External GM cannot complete setup [priority: p1]"), "priority p1 failure should list issue details");
}

function runRejectsInvalidJsonShape() {
  const result = spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_OPEN_ISSUES_JSON: JSON.stringify({ number: 1 })
    },
    encoding: "utf8"
  });
  assert(result.status === 1, "non-array issue JSON should fail");
  assert(result.stderr.includes("Open issue audit input must be a JSON array."), "invalid JSON shape should be reported");
}

function runUsesExpandedGitHubIssueLimit() {
  const root = mkdtempSync(join(tmpdir(), "otte-gh-issues-"));
  const argsPath = join(root, "gh-args.json");
  const fakeGh = join(root, "fake-gh.mjs");
  writeFileSync(fakeGh, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));\nconsole.log("[]");\n`);
  try {
    const result = spawnSync(process.execPath, [checker], {
      cwd: repoRoot,
      env: {
        ...process.env,
        OTTE_OPEN_ISSUES_JSON: undefined,
        OTTE_OPEN_ISSUES_JSON_FILE: undefined,
        OTTE_GH_BIN: process.execPath,
        OTTE_GH_BIN_ARGS_JSON: JSON.stringify([fakeGh])
      },
      encoding: "utf8"
    });
    assert(result.status === 0, "live gh issue query should pass with no open issues");
    const args = JSON.parse(readFileSync(argsPath, "utf8"));
    assert(args.includes("--limit"), "gh issue query should include an explicit limit");
    assert(args[args.indexOf("--limit") + 1] === "1000", "gh issue query should fetch beyond the first 100 issues");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runChecker(issues) {
  return spawnSync(process.execPath, [checker], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OTTE_OPEN_ISSUES_JSON: JSON.stringify(issues)
    },
    encoding: "utf8"
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
