import { execSync, spawnSync } from "node:child_process";
import {
  packageManagerCommand,
  packageManagerEnvironment,
} from "./package-manager-command.mjs";

const headCommit = git("rev-parse HEAD");
const auditCommit = process.env.OTTE_RELEASE_COMMIT ?? headCommit;
const auditCommitSource = process.env.OTTE_RELEASE_COMMIT
  ? "OTTE_RELEASE_COMMIT"
  : "git rev-parse HEAD";

if (!fullSha(auditCommit)) {
  console.error(
    `OTTE_RELEASE_COMMIT must be a full 40-character commit SHA; received ${auditCommit}.`,
  );
  process.exit(1);
}

if (
  process.env.OTTE_RELEASE_COMMIT &&
  auditCommit.toLowerCase() !== headCommit.toLowerCase()
) {
  console.error(
    `OTTE_RELEASE_COMMIT must match checked-out HEAD ${headCommit}; received ${auditCommit}.`,
  );
  process.exit(1);
}

const checks = [
  {
    name: "Release worktree cleanliness",
    command: ["pnpm", "v1:worktree:check"],
  },
  {
    name: "Final release evidence",
    command: ["pnpm", "v1:evidence:check"],
  },
  {
    name: "Open P0/P1 issue audit",
    command: ["pnpm", "v1:issues:check"],
  },
  {
    name: "Public docs site guard",
    command: ["pnpm", "docs:site:check"],
  },
];

console.log(
  `v1 completion audit target: ${auditCommit} (${auditCommitSource})`,
);

const results = checks.map(runCheck);
const failed = results.filter((result) => result.status !== 0);

console.log("");
console.log("v1 completion audit summary:");
for (const result of results) {
  console.log(
    `- ${result.status === 0 ? "PASS" : "FAIL"}: ${result.name} (${result.command.join(" ")})`,
  );
}

if (failed.length > 0) {
  console.error("");
  console.error(
    `v1 completion audit failed: ${failed.length} required gate(s) did not pass.`,
  );
  process.exit(1);
}

console.log("");
console.log("v1 completion audit passed.");

function runCheck(check) {
  console.log("");
  console.log(`## ${check.name}`);
  console.log(`$ ${check.command.join(" ")}`);

  const command = packageManagerCommand(check.command.slice(1));
  const environment = packageManagerEnvironment();
  const result = spawnSync(command.executable, command.args, {
    encoding: "utf8",
    env: environment.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  environment.cleanup();

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return {
    ...check,
    status: result.status ?? 1,
  };
}

function git(args) {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function fullSha(value) {
  return /^[0-9a-f]{40}$/i.test(value.trim());
}
