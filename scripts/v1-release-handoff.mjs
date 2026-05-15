import { execSync, spawnSync } from "node:child_process";
import { releaseEvidenceGates } from "./v1-release-gates.mjs";

const commit = process.env.OTTE_RELEASE_COMMIT ?? git("rev-parse HEAD");
const commitSource = process.env.OTTE_RELEASE_COMMIT ? "OTTE_RELEASE_COMMIT" : "git rev-parse HEAD";

if (!/^[0-9a-f]{40}$/i.test(commit.trim())) {
  console.error(`OTTE_RELEASE_COMMIT must be a full 40-character commit SHA; received ${commit}.`);
  process.exit(1);
}

console.log(`v1 release-owner handoff for ${commit} (${commitSource})`);
console.log("");
console.log("Aggregate completion audit:");
console.log("  pnpm v1:completion:audit");
console.log("Final evidence verifier:");
console.log("  pnpm v1:evidence:check");
console.log("Open issue gate:");
console.log("  pnpm v1:issues:check");
console.log("");
console.log("If evidence docs are committed after the hosted workflow run:");
console.log("  $env:OTTE_RELEASE_COMMIT = \"<full-40-character-hosted-run-commit-sha>\"");
console.log("  pnpm v1:completion:audit");
console.log("  pnpm v1:evidence:check");
console.log("");

const verifierResult = getVerifierStatus();
const gateStatus = summarizeGateStatus(verifierResult);

printGates("Remaining owner-supplied evidence:", gateStatus.pending);
if (gateStatus.satisfied.length > 0) {
  printGates("Satisfied evidence gates:", gateStatus.satisfied);
}

console.log("");
console.log("Release-owner documents:");
console.log("  Checklist: docs/release/v1-release-checklist.md");
console.log("  Handoff: docs/verification/v1-release-owner-handoff.md");
console.log("Ready-to-fill evidence templates:");
console.log("  pnpm v1:evidence:templates");
console.log("  $env:OTTE_RELEASE_COMMIT = \"<full-40-character-hosted-run-commit-sha>\"");
console.log("  pnpm v1:evidence:templates");
console.log("");
printVerifierStatus(verifierResult);

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function getVerifierStatus() {
  return spawnSync(process.execPath, ["scripts/check-v1-release-evidence.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      OTTE_RELEASE_COMMIT: commit
    }
  });
}

function summarizeGateStatus(result) {
  const output = `${result.stdout}\n${result.stderr}`;
  const pending = [];
  const satisfied = [];

  for (const gate of releaseEvidenceGates) {
    const failed = output.includes(`FAIL: ${gate.verifierName}`);
    const passed = output.includes(`PASS: ${gate.verifierName}`);

    if (failed) {
      pending.push(gate);
    } else if (passed) {
      satisfied.push(gate);
    } else {
      pending.push(gate);
    }
  }

  return { pending, satisfied };
}

function printGates(title, gates) {
  console.log(title);
  if (gates.length === 0) {
    console.log("  None.");
    console.log("");
    return;
  }

  for (const [index, gate] of gates.entries()) {
    console.log(`${index + 1}. ${gate.name}`);
    console.log(`   Action: ${gate.ownerAction}`);
    console.log(`   Evidence: ${gate.evidence}`);
  }
  console.log("");
}

function printVerifierStatus(result) {
  console.log("Current evidence verifier status:");
  if (result.stdout.trim()) {
    console.log(indent(result.stdout.trim()));
  }
  if (result.stderr.trim()) {
    console.log(indent(result.stderr.trim()));
  }
  if (result.status === 0) {
    console.log("Evidence verifier is complete for the checked commit.");
  } else {
    console.log(`Evidence verifier still reports blockers for the checked commit. Handoff command exits 0; run \`pnpm v1:completion:audit\` for the aggregate release gate and \`pnpm v1:evidence:check\` for the enforced evidence gate.`);
  }
}

function indent(value) {
  return value
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}
