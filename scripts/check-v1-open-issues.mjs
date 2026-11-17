import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const repo = process.env.OTTE_ISSUE_REPO ?? "Vermath/open-tabletop-engine";
const p0p1Pattern = /^(?:p[01]|priority\s*[: -]\s*p[01]|sev(?:erity)?\s*[: -]\s*[01])$/i;

let issues;

try {
  issues = loadIssues();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!Array.isArray(issues)) {
  console.error("Open issue audit input must be a JSON array.");
  process.exit(1);
}

const blockingIssues = issues.filter((issue) => {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return labels.some((label) => {
    const name = typeof label === "string" ? label : label?.name;
    return typeof name === "string" && p0p1Pattern.test(name.trim());
  });
});

if (blockingIssues.length > 0) {
  console.error(`Open P0/P1 issue audit failed: ${blockingIssues.length} blocking issue(s) found.`);
  for (const issue of blockingIssues) {
    const labels = (issue.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean)
      .join(", ");
    console.error(`- #${issue.number ?? "?"} ${issue.title ?? "(untitled)"}${labels ? ` [${labels}]` : ""}${issue.url ? ` ${issue.url}` : ""}`);
  }
  process.exit(1);
}

console.log(`Open P0/P1 issue audit passed for ${repo}: ${issues.length} open issue(s), 0 P0/P1.`);

function loadIssues() {
  if (process.env.OTTE_OPEN_ISSUES_JSON) {
    return JSON.parse(process.env.OTTE_OPEN_ISSUES_JSON);
  }

  if (process.env.OTTE_OPEN_ISSUES_JSON_FILE) {
    return JSON.parse(readFileSync(process.env.OTTE_OPEN_ISSUES_JSON_FILE, "utf8"));
  }

  const output = execFileSync(
    ghBinary(),
    [...ghBinaryArgs(), "issue", "list", "--repo", repo, "--state", "open", "--limit", "1000", "--json", "number,title,labels,url"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(output);
}

function ghBinary() {
  return process.env.OTTE_GH_BIN ?? "gh";
}

function ghBinaryArgs() {
  if (!process.env.OTTE_GH_BIN_ARGS_JSON) return [];
  const args = JSON.parse(process.env.OTTE_GH_BIN_ARGS_JSON);
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) {
    throw new Error("OTTE_GH_BIN_ARGS_JSON must be a JSON array of strings.");
  }
  return args;
}
