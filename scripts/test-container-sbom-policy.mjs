import { readFileSync } from "node:fs";

const dockerfiles = ["infra/docker/api.Dockerfile", "infra/docker/worker.Dockerfile", "infra/docker/web.Dockerfile"];
for (const file of dockerfiles) {
  const source = readFileSync(file, "utf8");
  for (const line of source.split(/\r?\n/).filter((candidate) => candidate.startsWith("FROM ") && !candidate.includes("FROM base") && !candidate.includes("FROM deps"))) {
    if (!/@sha256:[a-f0-9]{64}(?:\s|$)/.test(line)) throw new Error(`${file} contains an unpinned external base: ${line}`);
  }
}

const generator = readFileSync("scripts/generate-container-sbom.mjs", "utf8");
if (!/anchore\/syft:[^"\s]+@sha256:[a-f0-9]{64}/.test(generator)) throw new Error("container SBOM scanner image must be digest pinned");
if (!generator.includes('"open-tabletop.scan.target", value: "built-container-image"')) throw new Error("container SBOM must identify the built image scan target");

const workflow = readFileSync(".github/workflows/release-smoke.yml", "utf8");
const packageJson = readFileSync("package.json", "utf8");
if (!packageJson.includes("pnpm sbom:image:api")) throw new Error("release smoke must generate the built API image SBOM");
if (!workflow.includes("open-tabletop-api-image.cdx.json")) throw new Error("release smoke must upload the built API image SBOM");

process.stdout.write("Container digest pinning and built-image SBOM policy passed.\n");
