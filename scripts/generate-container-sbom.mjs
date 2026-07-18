import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scannerImage = "anchore/syft:latest@sha256:b4f1df79f97b817682d8b5ff941eb6bfe74f6172553a5e312c75bbc2eabc405c";
const dockerfile = resolve(valueAfter("--dockerfile") ?? "infra/docker/api.Dockerfile");
const output = resolve(valueAfter("--output") ?? ".codex-artifacts/sbom/open-tabletop-api-image.cdx.json");
const image = valueAfter("--image") ?? "open-tabletop-api:sbom-scan";

run("docker", ["build", "--file", dockerfile, "--tag", image, "."], "container image build");
try {
  const scan = spawnSync("docker", [
    "run", "--rm",
    "--volume", "/var/run/docker.sock:/var/run/docker.sock",
    scannerImage,
    image,
    "--output", "cyclonedx-json",
  ], { cwd: process.cwd(), encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (scan.status !== 0) throw new Error(`container SBOM scan failed (${scan.status ?? "no exit code"}): ${bounded(scan.stderr)}`);
  const document = JSON.parse(scan.stdout);
  if (document.bomFormat !== "CycloneDX" || !Array.isArray(document.components) || document.components.length === 0) {
    throw new Error("container SBOM scanner returned an empty or invalid CycloneDX document");
  }
  document.metadata ??= {};
  document.metadata.properties = [
    ...(Array.isArray(document.metadata.properties) ? document.metadata.properties : []),
    { name: "open-tabletop.scan.target", value: "built-container-image" },
    { name: "open-tabletop.image.name", value: image },
    { name: "open-tabletop.scanner.image", value: scannerImage },
  ];
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Wrote built-image CycloneDX SBOM with ${document.components.length} components to ${output}\n`);
} finally {
  spawnSync("docker", ["image", "rm", "--force", image], { cwd: process.cwd(), stdio: "ignore" });
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
}

function bounded(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(-4_096);
}
