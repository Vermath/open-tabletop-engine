import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const evidenceRoot = process.env.OTTE_EVIDENCE_ROOT ?? repoRoot;
const currentCommit = process.env.OTTE_RELEASE_COMMIT ?? git("rev-parse HEAD");
const commitSource = process.env.OTTE_RELEASE_COMMIT ? "OTTE_RELEASE_COMMIT" : "git rev-parse HEAD";

const checks = [
  checkIdentityProviderSmoke(),
  checkAssistiveTechnologyPass(),
  checkExternalGmValidation(),
  checkHostedReleaseSmoke(),
  checkDocsPublication()
];

const failed = checks.filter((check) => !check.ok);

console.log(`Checking v1 release evidence for commit ${currentCommit} (${commitSource}).\n`);

for (const check of checks) {
  const marker = check.ok ? "PASS" : "FAIL";
  console.log(`${marker}: ${check.name}`);
  if (!check.ok) {
    for (const reason of check.reasons) {
      console.log(`  - ${reason}`);
    }
  }
}

if (failed.length > 0) {
  console.error(`\nv1 release evidence is incomplete: ${failed.length} blocker(s) remain.`);
  process.exit(1);
}

console.log("\nv1 release evidence is complete for the checked gates.");

function checkIdentityProviderSmoke() {
  const doc = evidence("identity-provider-smoke-evidence.md");
  const sections = sectionsFor(doc, "Identity Provider Smoke").filter((section) => !placeholder(section.title));
  const pass = sections.find(
    (section) =>
      field(section.body, "Result").toLowerCase() === "pass" &&
      evidenceCommitMatches(section.body) &&
      field(section.body, "Exit code") === "0" &&
      !/skipped/i.test(section.body)
  );

  return result("Live OIDC/SCIM provider smoke", pass, [
    "Add a non-template identity-provider evidence block with Result: pass.",
    "Record Exit code: 0 from a non-skipped `pnpm identity:smoke` run against a real provider sandbox.",
    `Record App build or commit for the checked release commit ${currentCommit}.`
  ]);
}

function checkAssistiveTechnologyPass() {
  const doc = evidence("accessibility-assistive-tech-pass.md");
  const required = ["NVDA", "Narrator", "VoiceOver", "iOS", "TalkBack"];
  const sections = sectionsFor(doc, "Assistive Technology Pass").filter((section) => !placeholder(section.title));
  const accepted = new Set();

  for (const section of sections) {
    const resultText = field(section.body, "Result").toLowerCase();
    if (!["pass", "pass with issues"].includes(resultText)) continue;
    if (!evidenceCommitMatches(section.body)) continue;
    const haystack = `${section.title}\n${section.body}`.toLowerCase();
    for (const environment of required) {
      if (haystack.includes(environment.toLowerCase())) {
        accepted.add(environment);
      }
    }
  }

  const hasOwnerSubstitution = explicitOwnerOverride(doc);
  const missing = required.filter((environment) => !accepted.has(environment));
  return result("Manual assistive-technology matrix", missing.length === 0 || hasOwnerSubstitution, [
    `Missing pass evidence for: ${missing.join(", ") || "none"}.`,
    "Add one non-template pass or pass-with-issues evidence block per required environment, tied to the checked release commit, or record an owner-approved substitution/descope."
  ]);
}

function checkExternalGmValidation() {
  const doc = evidence("external-gm-validation.md");
  const sections = sectionsFor(doc, "External GM Validation").filter((section) => !placeholder(section.title));
  const pass = sections.find(
    (section) => ["pass", "pass with issues"].includes(field(section.body, "Result").toLowerCase()) && evidenceCommitMatches(section.body)
  );
  const hasOwnerSubstitution = explicitOwnerOverride(doc);

  return result("External GM validation", pass || hasOwnerSubstitution, [
    "Add a non-template external GM validation block with Result: pass or pass with issues and App build or commit matching the checked release commit.",
    "Alternatively record the explicit owner-approved substitution called out by the release handoff."
  ]);
}

function checkHostedReleaseSmoke() {
  const doc = evidence("release-workflow-evidence.md");
  const sections = sectionsFor(doc, "Hosted Workflow Evidence").filter((section) => /release smoke/i.test(section.title));
  const pass = sections.find(
    (section) =>
      field(section.body, "Result").toLowerCase() === "pass" &&
      shaMatches(field(section.body, "Commit SHA"), currentCommit) &&
      /pnpm release:smoke/.test(field(section.body, "Release command or build command"))
  );

  return result("Hosted release-smoke on final commit", pass, [
    `No hosted release-smoke pass is recorded for commit ${currentCommit}.`,
    "Record a GitHub Actions or owner-approved equivalent run where `pnpm release:smoke` passes on the final release commit."
  ]);
}

function checkDocsPublication() {
  const doc = evidence("release-workflow-evidence.md");
  const sections = sectionsFor(doc, "Hosted Workflow Evidence").filter((section) => /docs site/i.test(section.title) && !placeholder(section.title));
  const pass = sections.find((section) => {
    const body = section.body;
    const resultText = field(body, "Result").toLowerCase();
    const commitSha = field(body, "Commit SHA");
    const publishedUrl = field(body, "Published URL, if docs-site deploy");
    return (
      resultText.includes("pass") &&
      shaMatches(commitSha, currentCommit) &&
      /^https?:\/\//i.test(publishedUrl) &&
      !/not published|skipped|blocked/i.test(body) &&
      (/deploy/i.test(section.title) || /owner-approved equivalent hosted publication/i.test(body))
    );
  });

  return result("Public docs publication", pass, [
    `No successful docs-site publication with a published URL is recorded for commit ${currentCommit}.`,
    "Record a successful Pages deployment or owner-approved equivalent hosted publication evidence block for the checked release commit."
  ]);
}

function evidence(name) {
  return readFileSync(join(evidenceRoot, "docs", "verification", name), "utf8");
}

function sectionsFor(markdown, headingPrefix) {
  const clean = stripCodeFences(markdown);
  const lines = clean.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), body: "" };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) sections.push(current);

  return sections.filter((section) => section.title.toLowerCase().startsWith(headingPrefix.toLowerCase()));
}

function field(body, name) {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(name)}:\\s*(.+)$`, "im");
  return body.match(pattern)?.[1]?.trim().replace(/^`|`$/g, "") ?? "";
}

function stripCodeFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function placeholder(value) {
  return /<[^>]+>/.test(value);
}

function result(name, ok, reasons) {
  return { name, ok: Boolean(ok), reasons: Boolean(ok) ? [] : reasons };
}

function evidenceCommitMatches(body) {
  return shaMatches(field(body, "App build or commit"), currentCommit);
}

function shaMatches(recorded, expected) {
  const recordedSha = normalizeSha(recorded);
  const expectedSha = normalizeSha(expected);
  if (!recordedSha || !expectedSha) return false;
  if (!/^[0-9a-f]{7,40}$/.test(recordedSha) || !/^[0-9a-f]{7,40}$/.test(expectedSha)) return false;
  return recordedSha === expectedSha || (recordedSha.length >= 7 && expectedSha.startsWith(recordedSha));
}

function normalizeSha(value) {
  return value.replace(/`/g, "").trim().toLowerCase();
}

function explicitOwnerOverride(markdown) {
  return /^-\s*Owner-approved (substitution|descope|substitute):\s*(approved|yes|accepted|.+)$/im.test(stripCodeFences(markdown));
}

function git(args) {
  return execSync(`git ${args}`, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
