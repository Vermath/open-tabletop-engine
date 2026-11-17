import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const fingerprintFormat = "otte-api-source-fingerprint-v1";
const ignoredDirectoryNames = new Set([".turbo", "artifacts", "dist", "node_modules"]);
const sourceInputs = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "turbo.json",
  "apps/api/package.json",
  "apps/api/src",
  "infra/docker/api.Dockerfile",
  "packages",
  "plugins"
] as const;
let cachedDefaultRuntimeFingerprint: string | undefined;

export function findWorkspaceRoot(start = process.cwd()): string {
  let candidate = resolve(start);
  while (true) {
    if (existsSync(resolve(candidate, "pnpm-workspace.yaml")) && existsSync(resolve(candidate, "apps/api/package.json"))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`Could not find the OpenTabletop workspace above ${start}`);
    candidate = parent;
  }
}

export function computeApiSourceFingerprint(workspaceRoot = findWorkspaceRoot()): string {
  const root = resolve(workspaceRoot);
  const hash = createHash("sha256");
  hash.update(`${fingerprintFormat}\0`);

  const visit = (path: string): void => {
    const entry = lstatSync(path);
    const relativePath = relative(root, path).replaceAll("\\", "/") || ".";
    if (entry.isDirectory()) {
      if (path !== root && ignoredDirectoryNames.has(relativePath.split("/").at(-1) ?? "")) return;
      hash.update(`directory\0${relativePath}\0`);
      for (const child of readdirSync(path).sort()) visit(resolve(path, child));
      return;
    }
    if (entry.isSymbolicLink()) {
      hash.update(`symlink\0${relativePath}\0${readlinkSync(path)}\0`);
      return;
    }
    if (!entry.isFile()) throw new Error(`Unsupported API fingerprint input at ${relativePath}`);
    hash.update(`file\0${relativePath}\0${entry.size}\0`);
    hash.update(readFileSync(path));
    hash.update("\0");
  };

  for (const input of sourceInputs) {
    const path = resolve(root, input);
    if (!existsSync(path)) throw new Error(`Missing API fingerprint input ${input}`);
    visit(path);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function runtimeApiBuildFingerprint(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const defaultInput = input.cwd === undefined && input.env === undefined;
  if (defaultInput && cachedDefaultRuntimeFingerprint) return cachedDefaultRuntimeFingerprint;
  const env = input.env ?? process.env;
  const explicit = env.OTTE_BUILD_FINGERPRINT?.trim();
  if (explicit) {
    if (defaultInput) cachedDefaultRuntimeFingerprint = explicit;
    return explicit;
  }

  const cwd = resolve(input.cwd ?? process.cwd());
  const fingerprintFile = env.OTTE_BUILD_FINGERPRINT_FILE?.trim() || resolve(cwd, "api-build-fingerprint");
  if (existsSync(fingerprintFile)) {
    const persisted = readFileSync(fingerprintFile, "utf8").trim();
    if (persisted) {
      if (defaultInput) cachedDefaultRuntimeFingerprint = persisted;
      return persisted;
    }
  }

  try {
    const fingerprint = computeApiSourceFingerprint(findWorkspaceRoot(cwd));
    if (defaultInput) cachedDefaultRuntimeFingerprint = fingerprint;
    return fingerprint;
  } catch {
    if (defaultInput) cachedDefaultRuntimeFingerprint = "unavailable";
    return "unavailable";
  }
}
