import { execSync, spawnSync } from "node:child_process";

const commit = process.env.OTTE_RELEASE_COMMIT ?? git("rev-parse HEAD");
const commitSource = process.env.OTTE_RELEASE_COMMIT ? "OTTE_RELEASE_COMMIT" : "git rev-parse HEAD";

if (!/^[0-9a-f]{40}$/i.test(commit.trim())) {
  console.error(`OTTE_RELEASE_COMMIT must be a full 40-character commit SHA; received ${commit}.`);
  process.exit(1);
}

const gates = [
  {
    name: "Live OIDC/SCIM provider readiness",
    ownerAction: "Run `pnpm identity:smoke` against a real provider sandbox and record command, matching commit, exit code 0, non-placeholder API host/provider/sandbox/smoke-target details, passing OIDC discovery/test result, and passing SCIM ServiceProviderConfig result.",
    evidence: "docs/verification/identity-provider-smoke-evidence.md"
  },
  {
    name: "Manual assistive-technology matrix",
    ownerAction: "Record one pass or pass-with-issues evidence section for each required environment with browser, assistive technology, input method, scenario data, and workflows completed: Windows NVDA, Windows Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and Android TalkBack; alternatively record an explicit owner-approved descope.",
    evidence: "docs/verification/accessibility-assistive-tech-pass.md"
  },
  {
    name: "External GM validation",
    ownerAction: "Have an unaffiliated or owner-approved GM run the release-candidate flow and record matching commit, tester role, relationship to project, setup path, scenario data, workflows completed, and result, or record the explicit owner-approved substitution.",
    evidence: "docs/verification/external-gm-validation.md"
  },
  {
    name: "Hosted release smoke",
    ownerAction: "Record a hosted `pnpm release:smoke` pass for the checked commit with exact command parity and a concrete HTTPS hosted run URL.",
    evidence: "docs/verification/release-workflow-evidence.md"
  },
  {
    name: "Public docs publication",
    ownerAction: "Publish the docs site from the checked commit and record concrete HTTPS run URL, HTTPS published URL, matching commit, pass result, and `pnpm docs:site:check` command parity.",
    evidence: "docs/verification/release-workflow-evidence.md"
  }
];

console.log(`v1 release-owner handoff for ${commit} (${commitSource})`);
console.log("");
console.log("Final evidence verifier:");
console.log("  pnpm v1:evidence:check");
console.log("");
console.log("If evidence docs are committed after the hosted workflow run:");
console.log("  OTTE_RELEASE_COMMIT=<full-40-character-hosted-run-commit-sha> pnpm v1:evidence:check");
console.log("");
console.log("Remaining owner-supplied evidence:");

for (const [index, gate] of gates.entries()) {
  console.log(`${index + 1}. ${gate.name}`);
  console.log(`   Action: ${gate.ownerAction}`);
  console.log(`   Evidence: ${gate.evidence}`);
}

console.log("");
console.log("Release-owner checklist: docs/verification/v1-release-owner-handoff.md");
console.log("Ready-to-fill evidence templates:");
console.log("  pnpm v1:evidence:templates");
console.log("  OTTE_RELEASE_COMMIT=<full-40-character-hosted-run-commit-sha> pnpm v1:evidence:templates");
console.log("");
printVerifierStatus();

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function printVerifierStatus() {
  const result = spawnSync(process.execPath, ["scripts/check-v1-release-evidence.mjs"], {
    encoding: "utf8",
    env: {
      ...process.env,
      OTTE_RELEASE_COMMIT: commit
    }
  });

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
    console.log(`Evidence verifier still reports blockers for the checked commit. Handoff command exits 0; run \`pnpm v1:evidence:check\` for the enforced release gate.`);
  }
}

function indent(value) {
  return value
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join("\n");
}
