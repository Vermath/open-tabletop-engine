import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const evidenceRoot = process.env.OTTE_EVIDENCE_ROOT ?? repoRoot;
const currentCommit = process.env.OTTE_RELEASE_COMMIT ?? git("rev-parse HEAD");
const commitSource = process.env.OTTE_RELEASE_COMMIT ? "OTTE_RELEASE_COMMIT" : "git rev-parse HEAD";

if (!fullSha(currentCommit)) {
  console.error(`OTTE_RELEASE_COMMIT must be a full 40-character commit SHA; received ${currentCommit}.`);
  process.exit(1);
}

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
      commandEquals(field(section.body, "Command"), "pnpm identity:smoke") &&
      meaningfulField(field(section.body, "API base URL host")) &&
      meaningfulField(field(section.body, "Provider")) &&
      meaningfulField(field(section.body, "Provider sandbox or tenant label")) &&
      meaningfulChoiceField(field(section.body, "Smoke target")) &&
      passField(field(section.body, "OIDC discovery/test result")) &&
      passField(field(section.body, "SCIM ServiceProviderConfig result"))
  );

  return result("Live OIDC/SCIM provider smoke", pass, [
    "Add a non-template identity-provider evidence block with Result: pass.",
    "Record Exit code: 0 from a non-skipped `pnpm identity:smoke` run against a real provider sandbox.",
    "Record non-placeholder API base URL host, provider, provider sandbox or tenant label, and smoke target.",
    "Record passing OIDC discovery/test and SCIM ServiceProviderConfig results.",
    `Record App build or commit for the checked release commit ${currentCommit}.`
  ]);
}

function checkAssistiveTechnologyPass() {
  const doc = evidence("accessibility-assistive-tech-pass.md");
  const required = [
    { label: "Windows NVDA", pattern: /\bwindows\b[\s\S]*\bnvda\b|\bnvda\b[\s\S]*\bwindows\b/i },
    { label: "Windows Narrator", pattern: /\bwindows\b[\s\S]*\bnarrator\b|\bnarrator\b[\s\S]*\bwindows\b/i },
    { label: "macOS VoiceOver", pattern: /\bmacos\b[\s\S]*\bvoiceover\b|\bvoiceover\b[\s\S]*\bmacos\b/i },
    { label: "iOS/iPadOS VoiceOver", pattern: /\bios\b[\s\S]*\bvoiceover\b|\bipados\b[\s\S]*\bvoiceover\b|\bvoiceover\b[\s\S]*\bios\b|\bvoiceover\b[\s\S]*\bipados\b/i },
    { label: "Android TalkBack", pattern: /\bandroid\b[\s\S]*\btalkback\b|\btalkback\b[\s\S]*\bandroid\b/i }
  ];
  const sections = sectionsFor(doc, "Assistive Technology Pass").filter((section) => !placeholder(section.title));
  const accepted = new Set();

  for (const section of sections) {
    const resultText = field(section.body, "Result").toLowerCase();
    if (!["pass", "pass with issues"].includes(resultText)) continue;
    if (!evidenceCommitMatches(section.body)) continue;
    if (!meaningfulField(field(section.body, "Browser"))) continue;
    if (!meaningfulField(field(section.body, "Assistive technology"))) continue;
    if (!meaningfulField(field(section.body, "Input method"))) continue;
    if (!meaningfulField(field(section.body, "Scenario data"))) continue;
    if (!meaningfulField(field(section.body, "Workflows completed"))) continue;
    const haystack = `${section.title}\n${section.body}`.toLowerCase();
    const matched = required.filter((environment) => environment.pattern.test(haystack));
    if (matched.length !== 1) continue;
    accepted.add(matched[0].label);
  }

  const hasOwnerSubstitution = explicitOwnerOverride(doc);
  const missing = required.map((environment) => environment.label).filter((environment) => !accepted.has(environment));
  return result("Manual assistive-technology matrix", missing.length === 0 || hasOwnerSubstitution, [
    `Missing pass evidence for: ${missing.join(", ") || "none"}.`,
    "Add one non-template pass or pass-with-issues evidence block per required environment, tied to the checked release commit, with browser, assistive technology, input method, scenario data, and workflows completed; or record an owner-approved substitution/descope."
  ]);
}

function checkExternalGmValidation() {
  const doc = evidence("external-gm-validation.md");
  const sections = sectionsFor(doc, "External GM Validation").filter((section) => !placeholder(section.title));
  const pass = sections.find(
    (section) =>
      ["pass", "pass with issues"].includes(field(section.body, "Result").toLowerCase()) &&
      evidenceCommitMatches(section.body) &&
      meaningfulField(field(section.body, "Tester role")) &&
      meaningfulField(field(section.body, "Relationship to project")) &&
      meaningfulChoiceField(field(section.body, "Setup path")) &&
      meaningfulField(field(section.body, "Scenario data")) &&
      meaningfulField(field(section.body, "Workflows completed"))
  );
  const hasOwnerSubstitution = explicitOwnerOverride(doc);

  return result("External GM validation", pass || hasOwnerSubstitution, [
    "Add a non-template external GM validation block with Result: pass or pass with issues, App build or commit matching the checked release commit, tester role, relationship to project, setup path, scenario data, and workflows completed.",
    "Alternatively record the explicit owner-approved substitution called out by the release handoff."
  ]);
}

function checkHostedReleaseSmoke() {
  const doc = evidence("release-workflow-evidence.md");
  const sections = sectionsFor(doc, "Hosted Workflow Evidence").filter((section) => /release smoke/i.test(section.title) && !placeholder(section.title));
  const pass = sections.find(
    (section) =>
      field(section.body, "Result").toLowerCase() === "pass" &&
      shaMatches(field(section.body, "Commit SHA"), currentCommit) &&
      commandEquals(field(section.body, "Release command or build command"), "pnpm release:smoke") &&
      validHostedRunUrl(field(section.body, "Run URL"))
  );

  return result("Hosted release-smoke on checked commit", pass, [
    `No hosted release-smoke pass is recorded for commit ${currentCommit}.`,
    "Record a GitHub Actions or owner-approved equivalent run where `pnpm release:smoke` passes on the checked release commit, with a concrete HTTPS hosted run URL."
  ]);
}

function checkDocsPublication() {
  const doc = evidence("release-workflow-evidence.md");
  const sections = sectionsFor(doc, "Hosted Workflow Evidence").filter((section) => /docs site/i.test(section.title) && !placeholder(section.title));
  const pass = sections.find((section) => {
    const body = section.body;
    const resultText = field(body, "Result").toLowerCase();
    const commitSha = field(body, "Commit SHA");
    const runUrl = field(body, "Run URL");
    const publishedUrl = field(body, "Published URL, if docs-site deploy");
    const command = field(body, "Release command or build command");
    return (
      resultText === "pass" &&
      shaMatches(commitSha, currentCommit) &&
      commandEquals(command, "pnpm docs:site:check") &&
      validHostedRunUrl(runUrl) &&
      validHttpsUrl(publishedUrl) &&
      !/not published|skipped|blocked/i.test(body) &&
      (/deploy|publication/i.test(section.title) || /owner-approved equivalent hosted publication/i.test(body))
    );
  });

  return result("Public docs publication", pass, [
    `No successful docs-site publication with an HTTPS published URL is recorded for commit ${currentCommit}.`,
    "Record a successful Pages deployment or owner-approved equivalent hosted publication evidence block for the checked release commit, including HTTPS URLs and `pnpm docs:site:check` command parity."
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
  if (!/^[0-9a-f]{7,40}$/.test(recordedSha) || !fullSha(expectedSha)) return false;
  return recordedSha === expectedSha || (recordedSha.length >= 7 && expectedSha.startsWith(recordedSha));
}

function normalizeSha(value) {
  return value.replace(/`/g, "").trim().toLowerCase();
}

function fullSha(value) {
  return /^[0-9a-f]{40}$/.test(normalizeSha(value));
}

function commandEquals(value, expected) {
  return value.replace(/`/g, "").trim() === expected;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !sensitiveUrlParams(url) &&
      !placeholderHost(url.hostname) &&
      !localHost(url.hostname) &&
      !localNetworkName(url.hostname) &&
      !privateHost(url.hostname) &&
      !reservedHost(url.hostname)
    );
  } catch {
    return false;
  }
}

function validHostedRunUrl(value) {
  if (!validHttpsUrl(value)) return false;
  const url = new URL(value);
  return url.pathname.replace(/\/+$/, "") !== "";
}

function sensitiveUrlParams(url) {
  const sensitiveNames = /^(?:access[_-]?token|api[_-]?key|auth|auth[_-]?code|client[_-]?secret|code|credential|id[_-]?token|key|password|refresh[_-]?token|secret|sig|signature|token)$/i;
  const hasSensitiveParam = (value) => {
    const params = new URLSearchParams(value.replace(/^#/, ""));
    for (const key of params.keys()) {
      if (sensitiveNames.test(key)) return true;
    }
    return false;
  };
  return hasSensitiveParam(url.search) || hasSensitiveParam(url.hash);
}

function placeholderHost(hostname) {
  return /(^|\.)example(?:\.com|\.org|\.net|\.test)$/i.test(hostname);
}

function localHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function localNetworkName(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized.startsWith("[") && normalized.endsWith("]")) return false;
  return !normalized.includes(".") || normalized.endsWith(".local") || normalized.endsWith(".localhost");
}

function privateHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const octets = normalized.split(".").map((part) => Number(part));
  if (
    octets.length === 4 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) ||
      (octets[0] === 169 && octets[1] === 254)
    );
  }
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function reservedHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const octets = normalized.split(".").map((part) => Number(part));
  if (
    octets.length === 4 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    return (
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
      (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
    );
  }
  return normalized.endsWith(".test") || normalized.endsWith(".example") || normalized.endsWith(".invalid") || normalized.startsWith("2001:db8:");
}

function passField(value) {
  const normalized = value.trim();
  return !templateChoice(normalized.toLowerCase()) && !normalized.includes("/") && /^pass(?:\b|:|-|$)/i.test(normalized);
}

function meaningfulField(value) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && !["none", "n/a", "na", "no", "pending", "tbd", "<approval summary>"].includes(normalized) && !placeholder(normalized) && !templateChoice(normalized);
}

function meaningfulChoiceField(value) {
  const normalized = value.trim().toLowerCase();
  return meaningfulField(value) && !normalized.includes("/");
}

function templateChoice(value) {
  return value.includes(" / ");
}

function negativeOwnerApproval(value) {
  return (
    /\b(?:did|does|do|has|have)\s+not\s+(?:accept|accepted|approve|approved)\b/.test(value) ||
    /\bnot\s+(?:accepted|approved)\b/.test(value) ||
    /\bowner\b[\s\S]{0,80}\bnot\s+(?:accept|accepted|approve|approved)\b/.test(value)
  );
}

function explicitOwnerOverride(markdown) {
  const evidenceText = stripCodeFences(markdown);
  const matches = evidenceText.matchAll(/^-\s*Owner-approved (?:substitution|descope|substitute):\s*(.+)$/gim);
  for (const match of matches) {
    const value = match[1].trim().toLowerCase();
    if (
      value &&
      !["none", "n/a", "na", "no", "not approved", "pending", "tbd", "<approval summary>"].includes(value) &&
      !placeholder(value) &&
      !templateChoice(value) &&
      !value.includes("/") &&
      !negativeOwnerApproval(value) &&
      /\bowner\b[\s\S]*\b(?:accepted|approved)\b|\b(?:accepted|approved)\b[\s\S]*\bowner\b/.test(value)
    ) {
      return true;
    }
  }
  return false;
}

function git(args) {
  return execSync(`git ${args}`, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
