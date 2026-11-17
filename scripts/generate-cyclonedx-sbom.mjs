import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined)
    throw new Error(
      "Usage: generate-cyclonedx-sbom.mjs --output <path> --platform <name>",
    );
  args.set(key.slice(2), value);
}

const outputPath = args.get("output");
const platform = args.get("platform") ?? process.platform;
if (!outputPath) throw new Error("--output is required");

const input = readFileSync(0, "utf8").trim();
if (!input) throw new Error("Expected pnpm list --json output on stdin");
const parsed = JSON.parse(input);
const roots = Array.isArray(parsed) ? parsed : [parsed];
if (roots.length === 0)
  throw new Error("Dependency inventory did not contain a root package");

const components = new Map();
const dependencyGraph = new Map();
const rootRefs = new Set();

function packageManifest(node) {
  if (typeof node?.path !== "string") return {};
  try {
    return JSON.parse(readFileSync(join(node.path, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

function packageUrl(name, version) {
  const encodedName = name.startsWith("@")
    ? `${encodeURIComponent(name.split("/")[0])}/${encodeURIComponent(name.split("/").slice(1).join("/"))}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function licenseEntry(license) {
  if (typeof license !== "string" || !license.trim()) return undefined;
  const value = license.trim();
  return /^[A-Za-z0-9.+-]+$/.test(value)
    ? { license: { id: value } }
    : { license: { name: value } };
}

function visit(node, nameHint, isRoot = false) {
  if (!node || typeof node !== "object") return undefined;
  if (typeof node.path === "string" && !existsSync(node.path)) return undefined;
  const manifest = packageManifest(node);
  const name =
    typeof manifest.name === "string"
      ? manifest.name
      : typeof node.name === "string"
        ? node.name
        : nameHint;
  const version =
    typeof manifest.version === "string"
      ? manifest.version
      : typeof node.version === "string" &&
          !/^(?:file|link|portal|workspace):/i.test(node.version)
        ? node.version
        : undefined;
  if (!name || !version) return undefined;

  const purl = packageUrl(name, version);
  const license = licenseEntry(node.license ?? manifest.license);
  if (!components.has(purl)) {
    components.set(purl, {
      type: isRoot ? "application" : "library",
      "bom-ref": purl,
      name,
      version,
      purl,
      ...(license ? { licenses: [license] } : {}),
    });
  } else if (isRoot) {
    components.get(purl).type = "application";
  }
  if (isRoot) rootRefs.add(purl);

  const childRefs = new Set();
  for (const collectionName of ["dependencies", "optionalDependencies"]) {
    const collection = node[collectionName];
    if (
      !collection ||
      typeof collection !== "object" ||
      Array.isArray(collection)
    )
      continue;
    for (const [childName, child] of Object.entries(collection)) {
      const childRef = visit(child, childName);
      if (childRef) childRefs.add(childRef);
    }
  }
  const existing = dependencyGraph.get(purl) ?? new Set();
  for (const childRef of childRefs) existing.add(childRef);
  dependencyGraph.set(purl, existing);
  return purl;
}

for (const root of roots) visit(root, undefined, true);
const rootComponent = components.get([...rootRefs][0]);
if (!rootComponent)
  throw new Error(
    "Dependency inventory root package is missing a name or version",
  );

const timestamp = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString();
const properties = [
  ["open-tabletop.build.platform", platform],
  ["open-tabletop.build.commit", process.env.GITHUB_SHA],
  ["open-tabletop.build.ref", process.env.GITHUB_REF],
]
  .filter(([, value]) => value)
  .map(([name, value]) => ({ name, value }));

const document = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp,
    tools: {
      components: [
        {
          type: "application",
          name: "open-tabletop-cyclonedx-generator",
          version: "1",
        },
      ],
    },
    component: rootComponent,
    ...(properties.length ? { properties } : {}),
  },
  components: [...components.entries()]
    .filter(([reference]) => !rootRefs.has(reference))
    .map(([, component]) => component)
    .sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"])),
  dependencies: [...dependencyGraph.entries()]
    .map(([reference, dependsOn]) => ({
      ref: reference,
      dependsOn: [...dependsOn].sort(),
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref)),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
