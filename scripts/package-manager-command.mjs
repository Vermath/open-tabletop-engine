import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspacePackage = JSON.parse(
  readFileSync(join(workspaceRoot, "package.json"), "utf8"),
);
const packageManager = String(workspacePackage.packageManager ?? "").trim();
const packageManagerMatch = packageManager.match(
  /^(pnpm)@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/,
);

if (!packageManagerMatch)
  throw new Error(
    `Unsupported or missing packageManager declaration: ${packageManager || "<empty>"}`,
  );

export function packageManagerCommand(args) {
  const [, name, version] = packageManagerMatch;
  const invokingEntrypoint = process.env.npm_execpath?.trim();
  const invokingAgent = process.env.npm_config_user_agent
    ?.trim()
    .split(/\s+/, 1)[0];
  if (invokingEntrypoint && invokingAgent === `${name}/${version}`) {
    return {
      executable: process.execPath,
      args: [invokingEntrypoint, ...args],
    };
  }

  const corepackCandidates = [
    process.env.COREPACK_ROOT
      ? join(process.env.COREPACK_ROOT, "dist", "corepack.js")
      : undefined,
    join(
      dirname(process.execPath),
      "node_modules",
      "corepack",
      "dist",
      "corepack.js",
    ),
  ].filter(Boolean);
  const corepackEntrypoint = corepackCandidates.find((candidate) =>
    existsSync(candidate),
  );
  if (corepackEntrypoint) {
    return {
      executable: process.execPath,
      args: [corepackEntrypoint, packageManager, ...args],
    };
  }

  throw new Error(
    `Cannot locate ${packageManager}. Run the command through Corepack or install the repository package manager.`,
  );
}

export function packageManagerEnvironment() {
  const existingShimDirectory =
    process.env.OTTE_PACKAGE_MANAGER_SHIM_DIR?.trim();
  if (existingShimDirectory && existsSync(existingShimDirectory)) {
    return {
      env: withShimPath(process.env, existingShimDirectory),
      cleanup() {},
    };
  }

  const temporaryPrefix = resolve(tmpdir(), "otte-package-manager-");
  const shimDirectory = mkdtempSync(temporaryPrefix);
  const runner = join(workspaceRoot, "scripts", "run-package-manager.mjs");
  writeFileSync(
    join(shimDirectory, "pnpm.cmd"),
    `@echo off\r\n"${cmdValue(process.execPath)}" "${cmdValue(runner)}" %*\r\n`,
  );
  const posixShim = join(shimDirectory, "pnpm");
  writeFileSync(
    posixShim,
    `#!/bin/sh\nexec ${shellValue(process.execPath)} ${shellValue(runner)} "$@"\n`,
  );
  chmodSync(posixShim, 0o700);

  return {
    env: withShimPath(
      { ...process.env, OTTE_PACKAGE_MANAGER_SHIM_DIR: shimDirectory },
      shimDirectory,
    ),
    cleanup() {
      if (shimDirectory.startsWith(temporaryPrefix))
        rmSync(shimDirectory, { recursive: true, force: true });
    },
  };
}

function withShimPath(environment, shimDirectory) {
  const currentPath = environment.PATH ?? environment.Path ?? "";
  return { ...environment, PATH: `${shimDirectory}${delimiter}${currentPath}` };
}

function cmdValue(value) {
  if (/["\r\n]/.test(value))
    throw new Error(
      "Package-manager shim paths cannot contain quotes or newlines.",
    );
  return value;
}

function shellValue(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
