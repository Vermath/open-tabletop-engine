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

    for (const [file, incomplete, expected] of [
      ["identity-provider-smoke-evidence.md", "", "Live OIDC/SCIM provider smoke"],
      ["accessibility-assistive-tech-pass.md", "", "Manual assistive-technology matrix"],
      ["release-workflow-evidence.md", docs, "Hosted release-smoke on checked commit"],
      ["release-workflow-evidence.md", smoke, "Public docs publication"]
    ]) {
      writeFileSync(join(dir, file), incomplete);
      const failed = verify();
      assert.equal(failed.status, 1, failed.stdout + failed.stderr);
      assert.ok(failed.stdout.includes(`FAIL: ${expected}`), failed.stdout);
      assert.match(failed.stderr, /1 blocker\(s\) remain/);
      writeFileSync(join(dir, file), fixtures[file]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
