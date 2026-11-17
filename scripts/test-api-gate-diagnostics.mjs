import { spawnSync } from "node:child_process";

const diagnosticMarker = "OTTE_TEST_TIMEOUT_DIAGNOSTIC";

const pnpmArgs = [
  "--filter",
  "@open-tabletop/api",
  "exec",
  "vitest",
  "run",
  "--config",
  "vitest.diagnostics.config.ts",
];
const command = process.platform === "win32"
  ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")
  : "pnpm";
const commandArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", `pnpm.cmd ${pnpmArgs.join(" ")}`]
  : pnpmArgs;
const result = spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 30_000,
  maxBuffer: 10 * 1024 * 1024,
});

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
if (result.error) fail(`Unable to run intentional timeout fixture: ${result.error.message}`, output);
if (result.status === 0) fail("Intentional timeout fixture unexpectedly passed", output);

const parsed = parseDiagnostics(output);
if (parsed.parseErrors.length > 0) fail(`Malformed timeout diagnostics: ${parsed.parseErrors.join("; ")}`, output);
if (parsed.diagnostics.length !== 1) fail(`Expected one timeout diagnostic, received ${parsed.diagnostics.length}`, output);

const [diagnostic] = parsed.diagnostics;
if (!diagnostic.signalAborted || diagnostic.timeoutMs !== 3_000 || diagnostic.kind !== "test_timeout") {
  fail(`Unexpected timeout diagnostic: ${JSON.stringify(diagnostic)}`, output);
}
if (!diagnostic.file.endsWith("src/fixtures/intentional-timeout.fixture.test.ts")) {
  fail(`Timeout diagnostic did not identify the fixture file: ${diagnostic.file}`, output);
}
if ((diagnostic.activeResources.TCPServerWrap ?? 0) < 1) {
  fail(`Timeout diagnostic did not retain the listening fixture resource: ${JSON.stringify(diagnostic.activeResources)}`, output);
}
if (!output.includes("OTTE_TEST_FIXTURE_CLEANUP")) {
  fail("Intentional timeout fixture did not report bounded automatic cleanup", output);
}

console.log("API timeout diagnostic fixture passed:");
console.log(JSON.stringify(diagnostic, null, 2));

function fail(message, details = "") {
  console.error(message);
  if (details) console.error(details);
  process.exit(1);
}

function parseDiagnostics(value) {
  const diagnostics = [];
  const parseErrors = [];
  for (const rawLine of value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").split(/\r?\n/)) {
    const markerIndex = rawLine.indexOf(`${diagnosticMarker} `);
    if (markerIndex < 0) continue;
    try {
      diagnostics.push(JSON.parse(rawLine.slice(markerIndex + diagnosticMarker.length + 1).trim()));
    } catch (error) {
      parseErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { diagnostics, parseErrors };
}
