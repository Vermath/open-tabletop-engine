import { execSync, spawnSync } from "node:child_process";

const commit = process.env.OTTE_RELEASE_COMMIT ?? git("rev-parse HEAD");
const commitSource = process.env.OTTE_RELEASE_COMMIT ? "OTTE_RELEASE_COMMIT" : "git rev-parse HEAD";

const gates = [
  {
    name: "Live OIDC/SCIM provider readiness",
    ownerAction: "Run `pnpm identity:smoke` against a real provider sandbox without skipped tests.",
    evidence: "docs/verification/identity-provider-smoke-evidence.md"
  },
  {
    name: "Manual assistive-technology matrix",
    ownerAction: "Record NVDA, Narrator, macOS VoiceOver, iOS/iPadOS VoiceOver, and TalkBack pass evidence or an explicit owner-approved descope.",
    evidence: "docs/verification/accessibility-assistive-tech-pass.md"
  },
  {
    name: "External GM validation",
    ownerAction: "Have an unaffiliated or owner-approved GM run the release-candidate flow, or record the explicit owner-approved substitution.",
    evidence: "docs/verification/external-gm-validation.md"
  },
  {
    name: "Hosted release smoke",
    ownerAction: "Push the final release candidate and record a hosted `pnpm release:smoke` pass for that commit.",
    evidence: "docs/verification/release-workflow-evidence.md"
  },
  {
    name: "Public docs publication",
    ownerAction: "Publish the docs site from the release commit through GitHub Pages or an owner-approved equivalent hosted publication.",
    evidence: "docs/verification/release-workflow-evidence.md"
  }
];

console.log(`v1 release-owner handoff for ${commit} (${commitSource})`);
console.log("");
console.log("Final evidence verifier:");
console.log("  pnpm v1:evidence:check");
console.log("");
console.log("If evidence docs are committed after the hosted workflow run:");
console.log(`  OTTE_RELEASE_COMMIT=${commit} pnpm v1:evidence:check`);
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
