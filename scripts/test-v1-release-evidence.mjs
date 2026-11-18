import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { requiredAssistiveTechnologyEnvironments } from "./v1-release-gates.mjs";

test("v1 release evidence requires four gates and no external GM report", () => {
  const root = mkdtempSync(join(tmpdir(), "otte-release-fixture-"));
  const dir = join(root, "docs", "verification");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const identity = `## Identity Provider Smoke: Fixture tenant
- App build or commit: ${commit}
- Result: pass
- Exit code: 0
- Command: pnpm identity:smoke
- API base URL host: fixture API
- Provider: Fixture identity provider
- Provider sandbox or tenant label: QA tenant
- Smoke target: deployed API
- OIDC discovery/test result: pass
- SCIM ServiceProviderConfig result: pass
`;
  const accessibility = requiredAssistiveTechnologyEnvironments.map(({ label }) =>
    `## Assistive Technology Pass: ${label}
- App build or commit: ${commit}
- Result: pass
- Browser: fixture browser
- Assistive technology: ${label}
- Input method: keyboard
- Scenario data: seeded campaign
- Workflows completed: open the sheet and roll
`).join("\n");
  const smoke = `## Hosted Workflow Evidence: Release Smoke
- Commit SHA: ${commit}
- Result: pass
- Release command or build command: pnpm release:smoke
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/1
`;
  const docs = `## Hosted Workflow Evidence: Docs Site Publication
- Commit SHA: ${commit}
- Result: pass
- Release command or build command: pnpm docs:site:check
- Run URL: https://github.com/Vermath/open-tabletop-engine/actions/runs/2
- Published URL, if docs-site deploy: https://vermath.github.io/open-tabletop-engine/
`;
  function verify() {
    return spawnSync(process.execPath, ["scripts/check-v1-release-evidence.mjs"], {
      encoding: "utf8",
      env: { ...process.env, OTTE_EVIDENCE_ROOT: root, OTTE_RELEASE_COMMIT: commit, OTTE_ALLOW_DIRTY_RELEASE_AUDIT: "true" }
    });
  }

  function checkFixture(file, content, gate, shouldPass) {
    writeFileSync(join(dir, file), content);
    const run = verify();
    const diagnostic = [content, run.stdout, run.stderr].join("\n");
    assert.equal(run.status, shouldPass ? 0 : 1, diagnostic);
    assert.ok(run.stdout.includes(`${shouldPass ? "PASS" : "FAIL"}: ${gate}`), diagnostic);
    if (!shouldPass) assert.match(run.stderr, /1 blocker\(s\) remain/, diagnostic);
  }

  try {
    mkdirSync(dir, { recursive: true });
    const fixtures = {
      "identity-provider-smoke-evidence.md": identity,
      "accessibility-assistive-tech-pass.md": accessibility,
      "release-workflow-evidence.md": smoke + "\n" + docs
    };
    for (const [file, content] of Object.entries(fixtures)) writeFileSync(join(dir, file), content);
    const complete = verify();
    assert.equal(complete.status, 0, complete.stdout + complete.stderr);
    assert.doesNotMatch(complete.stdout, /external GM/i);

    const hostedEvidenceFile = "release-workflow-evidence.md";
    const ipv6Smoke = smoke.replace("github.com", "[2606:4700:4700::1111]");
    checkFixture(hostedEvidenceFile, ipv6Smoke + "\n" + docs, "Hosted release-smoke on checked commit", true);
    writeFileSync(join(dir, hostedEvidenceFile), fixtures[hostedEvidenceFile]);

    for (const [file, incomplete, expected] of [
      ["identity-provider-smoke-evidence.md", "", "Live OIDC/SCIM provider smoke"],
      ["accessibility-assistive-tech-pass.md", "", "Manual assistive-technology matrix"],
      ["release-workflow-evidence.md", docs, "Hosted release-smoke on checked commit"],
      ["release-workflow-evidence.md", smoke, "Public docs publication"]
    ]) {
      checkFixture(file, incomplete, expected, false);
      writeFileSync(join(dir, file), fixtures[file]);
    }

    const identityFile = "identity-provider-smoke-evidence.md";
    for (const [note, shouldPass] of [
      ["- Skipped checks: none", true],
      ["- Notes: No checks were skipped.", true],
      ["- Notes: The smoke was not skipped.", true],
      ["- SCIM Users/Groups provisioning check, if performed: not run", true],
      ["~~~text\nTests 1 passed | 0 skipped\n~~~", true],
      ["- Notes: Smoke skipped: missing provider credentials", false],
      ["- Notes: Tests 1 skipped", false],
      ["- Notes: No checks were skipped yesterday. Smoke skipped: missing credentials today.", false],
      ["- Notes: Required smoke not run", false],
      ["```text\n## Console output\npnpm identity:smoke was skipped due to missing provider credentials\n```", false]
    ]) {
      checkFixture(identityFile, identity + note, "Live OIDC/SCIM provider smoke", shouldPass);
    }
    checkFixture(identityFile, "~~~md\n" + identity + "~~~", "Live OIDC/SCIM provider smoke", false);
    writeFileSync(join(dir, identityFile), identity);

    const override = [
      "## Assistive Technology Owner-Approved Descope: Windows matrix",
      "- App build or commit: " + commit,
      "- Owner-approved descope: Release owner accepted the documented matrix change for this release candidate.",
      "- Required environments replaced or removed: NVDA with Firefox",
      "- Reason: The Windows test machine was unavailable"
    ].join("\n");
    const substitution = override.replaceAll(/descope/gi, "substitution");
    const accessibilityFile = "accessibility-assistive-tech-pass.md";
    for (const [content, shouldPass] of [
      [override, true],
      [substitution, true],
      [substitution.replace("Owner-approved substitution:", "Owner-approved substitute:"), true],
      [override.replace("NVDA with Firefox", "-"), false],
      [override.replace("The Windows test machine was unavailable", "..."), false],
      [override.replace("NVDA with Firefox", ""), false],
      [substitution.replace(commit, "0".repeat(40)), false],
      [substitution.replace("owner accepted", "owner did not accept"), false],
      ["~~~md\n" + substitution + "\n~~~", false],
      [accessibility + "\n- Owner-approved substitution:\n- Notes: current release", false]
    ]) {
      checkFixture(accessibilityFile, content, "Manual assistive-technology matrix", shouldPass);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
