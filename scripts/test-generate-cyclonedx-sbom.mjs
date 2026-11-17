import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const generator = join(repoRoot, "scripts", "generate-cyclonedx-sbom.mjs");
const root = mkdtempSync(join(tmpdir(), "otte-sbom-"));
const appPath = join(root, "app");
const sharedPath = join(root, "shared");
const outputPath = join(root, "output", "desktop.cdx.json");

try {
  writeManifest(appPath, {
    name: "@example/desktop",
    version: "2.0.0",
    license: "AGPL-3.0-only",
  });
  writeManifest(sharedPath, {
    name: "@example/shared",
    version: "1.2.3",
    license: "MIT",
  });

  const inventory = [
    {
      name: "@example/desktop",
      version: "2.0.0",
      path: appPath,
      dependencies: {
        "@example/shared": {
          from: "@example/shared",
          version: "link:../shared",
          path: sharedPath,
        },
      },
      optionalDependencies: {
        "@example/other-platform": {
          name: "@example/other-platform",
          version: "9.0.0",
          path: join(root, "not-installed"),
        },
      },
    },
  ];
  const result = spawnSync(
    process.execPath,
    [generator, "--output", outputPath, "--platform", "test-platform"],
    {
      cwd: repoRoot,
      input: JSON.stringify(inventory),
      encoding: "utf8",
    },
  );
  assert(result.status === 0, `SBOM generator failed: ${result.stderr}`);

  const document = JSON.parse(readFileSync(outputPath, "utf8"));
  const shared = document.components.find(
    (component) => component.name === "@example/shared",
  );
  assert(shared, "linked workspace dependency should be included");
  assert(
    shared.version === "1.2.3",
    "linked workspace dependency should use its package manifest version",
  );
  assert(
    shared.purl === "pkg:npm/%40example/shared@1.2.3",
    "linked workspace dependency should have a portable npm package URL",
  );
  assert(
    !JSON.stringify(document).includes("link%3A"),
    "SBOM must not encode machine-local link: dependency specs as versions",
  );
  assert(
    !document.components.some(
      (component) => component.name === "@example/other-platform",
    ),
    "SBOM should omit optional packages that are not installed on the build platform",
  );
  const rootDependency = document.dependencies.find(
    (dependency) => dependency.ref === document.metadata.component["bom-ref"],
  );
  assert(
    rootDependency?.dependsOn.includes(shared["bom-ref"]),
    "root dependency graph should reference the linked workspace component",
  );
  assert(
    document.metadata.properties.some(
      (property) =>
        property.name === "open-tabletop.build.platform" &&
        property.value === "test-platform",
    ),
    "SBOM should record the requested build platform",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("CycloneDX SBOM generator tests passed.");

function writeManifest(path, manifest) {
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
