import { spawnSync } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("pnpm did not expose its CLI path through npm_execpath");
  process.exit(1);
}

const listed = spawnSync(process.execPath, [pnpmCli, "-r", "list", "--prod", "--json", "--depth", "Infinity"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024
});

if (listed.status !== 0) {
  if (listed.stderr) process.stderr.write(listed.stderr);
  if (listed.error) console.error(listed.error.message);
  process.exit(listed.status ?? 1);
}

const workspaces = JSON.parse(listed.stdout);
const packages = new Map();

function collect(dependencies) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    if (typeof dependency.version === "string" && !dependency.version.startsWith("link:")) {
      const versions = packages.get(name) ?? new Set();
      versions.add(dependency.version);
      packages.set(name, versions);
    }
    collect(dependency.dependencies);
  }
}

for (const workspace of workspaces) collect(workspace.dependencies);

const payload = Object.fromEntries(
  [...packages.entries()].map(([name, versions]) => [name, [...versions].sort()])
);
const response = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json"
  },
  body: JSON.stringify(payload)
});

if (!response.ok) {
  console.error(`npm bulk advisory request failed (${response.status} ${response.statusText})`);
  process.exit(1);
}

const advisories = Object.values(await response.json()).flat();
const blocking = advisories.filter((advisory) => advisory.severity === "high" || advisory.severity === "critical");

if (blocking.length > 0) {
  for (const advisory of blocking) {
    console.error(`${advisory.severity}: ${advisory.name ?? "dependency"} - ${advisory.title} (${advisory.url})`);
  }
  console.error(`${blocking.length} high or critical production dependency advisory(s) found.`);
  process.exit(1);
}

console.log(`Audited ${packages.size} production packages through npm's bulk advisory endpoint; no high or critical advisories found.`);
