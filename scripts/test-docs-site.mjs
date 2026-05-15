import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const builder = join(repoRoot, "scripts", "build-docs-site.mjs");

runPassesWithRequiredDocsAndExcludedInternalLogs();
runFailsWhenRequiredReleasePageLeaksLocalPath();
runFailsWhenPublicDocsLinkIsBroken();
runFailsWhenReleaseGateCommandsAreMissing();

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

function runFailsWhenPublicDocsLinkIsBroken() {
  const root = fixtureRoot();
  writeRequiredDocs(root);
  writeFileSync(join(root, "docs", "site", "index.md"), "# Public Docs\n\n- [Missing](../missing-page.md)\n");

  try {
    const result = runBuilder(root);
    assert(result.status === 1, "docs check should fail when a public docs link is broken");
    assert(result.stderr.includes("Docs site build found broken markdown links"), "docs check should explain broken markdown links");
    assert(result.stderr.includes("docs/site/index.md -> ../missing-page.md"), "docs check should name the broken source and target");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runFailsWhenReleaseGateCommandsAreMissing() {
  const root = fixtureRoot();
  writeRequiredDocs(root);
  writeFileSync(join(root, "docs", "release", "v1.0.md"), "# v1.0\n\n## Release Gate\n\n```bash\npnpm release:smoke\npnpm v1:evidence:check\n```\n");

  try {
    const result = runBuilder(root);
    assert(result.status === 1, "docs check should fail when release gate commands are missing");
    assert(result.stderr.includes("Docs site build found missing release-gate references"), "docs check should explain missing release gate references");
    assert(result.stderr.includes("docs/release/v1.0.md missing pnpm v1:issues:check"), "docs check should name missing release note issue gate");
    assert(result.stderr.includes("docs/release/v1.0.md missing final evidence gate: external GM"), "docs check should name missing final evidence gate");
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
  writeFileSync(join(root, "docs", "site", "index.md"), "# Public Docs\n\n- [Release notes](../release/v1.0.md)\n\nRun `pnpm release:smoke`, `pnpm v1:evidence:check`, and `pnpm v1:issues:check`.\n");
  writeFileSync(
    join(root, "docs", "release", "v1.0.md"),
    "# v1.0\n\n## Release Gate\n\n```bash\npnpm release:smoke\npnpm v1:evidence:check\npnpm v1:issues:check\n```\n\nRecord final OIDC/SCIM, assistive-technology, external GM, hosted release-smoke, and docs-publication evidence before publishing.\n"
  );
  writeFileSync(
    join(root, "docs", "release", "v1-release-checklist.md"),
    "# v1 Release Checklist\n\nFinal evidence gates: OIDC/SCIM, assistive-technology, external GM, hosted release-smoke, and docs-publication.\n"
  );
  writeFileSync(join(root, "docs", "deployment", "hosted-deployment-recipes.md"), "# Hosted Deployment Recipes\n");
  writeFileSync(
    join(root, "docs", "prd-v1-gap-closure.md"),
    "# v1 Gap Closure PRD\n\nRemaining final evidence gates: OIDC/SCIM, assistive-technology, external GM, hosted release-smoke, and docs-publication.\n"
  );
  writeFileSync(
    join(root, "docs", "verification", "v1-gap-closure-completion-audit.md"),
    "# v1 Gap Closure Completion Audit\n\nRemaining final evidence gates: OIDC/SCIM, assistive-technology, external GM, hosted release-smoke, and docs-publication.\n"
  );
  writeFileSync(
    join(root, "docs", "verification", "v1-release-owner-handoff.md"),
    "# v1 Release Owner Handoff\n\nRemaining final evidence gates: OIDC/SCIM, assistive-technology, external GM, hosted release-smoke, and docs-publication.\n"
  );
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
