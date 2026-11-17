import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  currentWorkspaceState,
  validateReleaseGateEvidence,
  validateReleaseGateEvidenceSet,
} from "./release-gate-evidence.mjs";

const repoRoot = process.cwd();
const paths = process.argv.slice(2).filter((argument) => argument !== "--" && argument !== "--require-check-pair");
const requireCheckPair = process.argv.includes("--require-check-pair");
if (paths.length === 0) {
  console.error(
    "Usage: node scripts/check-release-gate-evidence.mjs <artifact.json> [artifact.json ...]",
  );
  process.exit(1);
}

const expectedCommit =
  process.env.OTTE_RELEASE_COMMIT ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
  console.error(
    `OTTE_RELEASE_COMMIT must be a full 40-character SHA; received ${expectedCommit}.`,
  );
  process.exit(1);
}
let failed = 0;
const workspace = currentWorkspaceState(repoRoot);
const documents = [];

for (const path of paths) {
  const absolutePath = resolve(repoRoot, path);
  let document;
  try {
    document = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${path}`);
    console.error(`  - ${error.message}`);
    continue;
  }
  documents.push(document);
  const validation = validateReleaseGateEvidence(document, {
    expectedCommit,
    repoRoot,
    allowDirty: true,
    expectedWorkspaceFingerprint: workspace.fingerprint,
  });
  console.log(`${validation.ok ? "PASS" : "FAIL"}: ${path}`);
  for (const error of validation.errors) console.log(`  - ${error}`);
  if (!validation.ok) failed += 1;
}

if (requireCheckPair) {
  const validation = validateReleaseGateEvidenceSet(documents, { requiredCheckPasses: 2 });
  console.log(`${validation.ok ? "PASS" : "FAIL"}: sequential cold check pair`);
  for (const error of validation.errors) console.log(`  - ${error}`);
  if (!validation.ok) failed += 1;
}

if (failed > 0) {
  console.error(
    `\nRelease-gate evidence failed validation: ${failed} artifact(s).`,
  );
  process.exit(1);
}

console.log(`\nRelease-gate evidence matches commit ${expectedCommit}.`);
