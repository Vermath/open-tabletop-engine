import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const builder = join(repoRoot, "scripts", "build-docs-site.mjs");

runPassesWithRequiredDocsAndExcludedInternalLogs();
runFailsWhenRequiredReleasePageLeaksLocalPath();

console.log("docs site publication guard tests passed.");

function runPassesWithRequiredDocsAndExcludedInternalLogs() {
  const root = fixtureRoot();
  writeRequiredDocs(root);
  writeFileSync(join(root, "docs", "verification", "mvp-progress.md"), "# Internal MVP Progress\n\nLocal run: D:\\internal\\repo\n");

  try {
    const result = runBuilder(root);
    assert(result.status === 0, "docs check should pass with required docs and excluded internal logs");
    assert(!existsSync(join(root, "dist", "docs-site", "docs", "verification", "mvp-progress.html")), "excluded internal log should not render");
    const manifest = JSON.parse(readFileSync(join(root, "dist", "docs-site", "site-manifest.json"), "utf8"));
    assert(!manifest.sources.includes("docs/verification/mvp-progress.md"), "excluded internal log should not appear in manifest");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenRequiredReleasePageLeaksLocalPath() {
  const root = fixtureRoot();
  writeRequiredDocs(root);
  writeFileSync(join(root, "docs", "verification", "release-workflow-evidence.md"), "# Release Workflow Evidence\n\nLocal path: D:\\internal\\repo\n");

  try {
    const result = runBuilder(root);
    assert(result.status === 1, "docs check should fail when a required release page leaks a local path");
    assert(result.stderr.includes("Docs site build found local filesystem paths in public docs"), "docs check should explain local path leak");
    assert(result.stderr.includes("docs/verification/release-workflow-evidence.md:3"), "docs check should name the leaking release page");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "otte-docs-site-"));
  mkdirSync(join(root, "docs", "deployment"), { recursive: true });
  mkdirSync(join(root, "docs", "release"), { recursive: true });
  mkdirSync(join(root, "docs", "site"), { recursive: true });
  mkdirSync(join(root, "docs", "verification"), { recursive: true });
  return root;
}

function writeRequiredDocs(root) {
  writeFileSync(join(root, "README.md"), "# README\n\nSee [release notes](docs/release/v1.0.md).\n");
  writeFileSync(join(root, "CHANGELOG.md"), "# Changelog\n");
  writeFileSync(join(root, "docs", "site", "index.md"), "# Public Docs\n\n- [Release notes](../release/v1.0.md)\n");
  writeFileSync(join(root, "docs", "release", "v1.0.md"), "# v1.0\n");
  writeFileSync(join(root, "docs", "deployment", "hosted-deployment-recipes.md"), "# Hosted Deployment Recipes\n");
  writeFileSync(join(root, "docs", "prd-v1-gap-closure.md"), "# v1 Gap Closure PRD\n");
  writeFileSync(join(root, "docs", "verification", "v1-gap-closure-completion-audit.md"), "# v1 Gap Closure Completion Audit\n");
  writeFileSync(join(root, "docs", "verification", "v1-release-owner-handoff.md"), "# v1 Release Owner Handoff\n");
  writeFileSync(join(root, "docs", "verification", "release-workflow-evidence.md"), "# Release Workflow Evidence\n");
}

function runBuilder(root) {
  return spawnSync(process.execPath, [builder, "--check"], {
    cwd: root,
    encoding: "utf8"
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
