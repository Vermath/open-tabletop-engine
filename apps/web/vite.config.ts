import react from "@vitejs/plugin-react";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { computeApiSourceFingerprint, findWorkspaceRoot } from "../api/src/build-fingerprint.js";
import { apiBuildFingerprintIssue, apiCompatibilityIssue, type ApiHealthIdentity } from "./src/api-compatibility.js";

const projectDir = dirname(fileURLToPath(import.meta.url));
export const devApiSourceFingerprint = computeApiSourceFingerprint(findWorkspaceRoot(projectDir));

export function syncDiceBoxAssets(source: string, target: string): void {
  if (!existsSync(source)) return;
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

const diceAssetMarkerName = ".otte-source";
const diceAssetLockStaleMs = 5 * 60_000;

export interface DiceAssetLockOwner {
  token: string;
  pid: number;
  createdAt: number;
}

export function diceAssetFingerprint(source: string): string {
  const sourceRoot = resolve(source);
  const hash = createHash("sha256");
  const visit = (path: string): void => {
    const entry = lstatSync(path);
    const relativePath = relative(sourceRoot, path).replaceAll("\\", "/") || ".";
    if (entry.isDirectory()) {
      hash.update(`directory\0${relativePath}\0`);
      for (const child of readdirSync(path).sort()) visit(resolve(path, child));
      return;
    }
    if (entry.isSymbolicLink()) {
      hash.update(`symlink\0${relativePath}\0${readlinkSync(path)}\0`);
      return;
    }
    if (!entry.isFile()) throw new Error(`Unsupported dice asset entry at ${path}`);
    hash.update(`file\0${relativePath}\0${entry.mode}\0${entry.size}\0`);
    hash.update(readFileSync(path));
    hash.update("\0");
  };
  visit(sourceRoot);
  return `v2:${sourceRoot}:${hash.digest("hex")}`;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export function diceAssetLockOwnerIsAbandoned(
  owner: DiceAssetLockOwner | undefined,
  observedMtimeMs: number,
  nowMs = Date.now(),
  isAlive: (pid: number) => boolean = processIsAlive
): boolean {
  const createdAt = owner?.createdAt ?? observedMtimeMs;
  return nowMs - createdAt >= diceAssetLockStaleMs || Boolean(owner && !isAlive(owner.pid));
}

function readDiceAssetLockOwner(lockPath: string): DiceAssetLockOwner | undefined {
  try {
    const value = JSON.parse(readFileSync(lockPath, "utf8")) as Partial<DiceAssetLockOwner>;
    if (typeof value.token !== "string" || !value.token || !Number.isSafeInteger(value.pid) || typeof value.createdAt !== "number") return undefined;
    return value as DiceAssetLockOwner;
  } catch {
    return undefined;
  }
}

export function reclaimAbandonedDiceAssetLock(lockPath: string, nowMs = Date.now()): boolean {
  let observed: ReturnType<typeof statSync>;
  try {
    observed = statSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  const owner = readDiceAssetLockOwner(lockPath);
  if (!diceAssetLockOwnerIsAbandoned(owner, observed.mtimeMs, nowMs)) return false;

  try {
    const current = statSync(lockPath);
    if (current.dev !== observed.dev || current.ino !== observed.ino) return false;
    unlinkSync(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

function removeOwnedDiceAssetLock(lockPath: string, token: string): void {
  if (readDiceAssetLockOwner(lockPath)?.token !== token) return;
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function syncDiceBoxAssetsOnce(source: string, target: string): Promise<void> {
  if (!existsSync(source)) return;
  const fingerprint = diceAssetFingerprint(source);
  const marker = resolve(target, diceAssetMarkerName);
  if (existsSync(marker) && readFileSync(marker, "utf8") === fingerprint) return;

  mkdirSync(dirname(target), { recursive: true });
  const lockPath = `${target}.lock`;
  let lock: number | undefined;
  let lockOwner: DiceAssetLockOwner | undefined;
  for (let attempt = 0; attempt < 400 && lock === undefined; attempt += 1) {
    try {
      const candidate = openSync(lockPath, "wx");
      const candidateOwner = { token: randomUUID(), pid: process.pid, createdAt: Date.now() };
      try {
        writeFileSync(candidate, JSON.stringify(candidateOwner), "utf8");
      } catch (error) {
        closeSync(candidate);
        unlinkSync(lockPath);
        throw error;
      }
      lock = candidate;
      lockOwner = candidateOwner;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (reclaimAbandonedDiceAssetLock(lockPath)) continue;
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  }
  if (lock === undefined || !lockOwner) throw new Error(`Timed out waiting to synchronize dice assets at ${target}`);

  try {
    if (existsSync(marker) && readFileSync(marker, "utf8") === fingerprint) return;
    syncDiceBoxAssets(source, target);
    writeFileSync(marker, fingerprint, "utf8");
  } finally {
    closeSync(lock);
    removeOwnedDiceAssetLock(lockPath, lockOwner.token);
  }
}

function copyDiceBoxAssets(): Plugin {
  return {
    name: "copy-dice-box-assets",
    // Vitest starts one Vite server per invocation, sometimes concurrently in
    // this workspace. Tests never serve the copied runtime, so do not let
    // parallel test startup race while replacing the shared public directory.
    apply: (_config, environment) => environment.mode !== "test",
    async buildStart() {
      const source = resolve(projectDir, "node_modules/@3d-dice/dice-box-threejs/public");
      const target = resolve(projectDir, "public/assets/dice-box");
      await syncDiceBoxAssetsOnce(source, target);
    }
  };
}

// Minified, uncompressed JS across the entry and every eager static import.
// The final emitted production graph is 1,048,365 bytes after keeping the 3D
// physics vendor behind its existing dynamic import. Keep the ceiling fixed so
// eager dependency growth fails loudly.
export const ENTRY_CHUNK_BUDGET_BYTES = 1_600_000;

export interface BuildChunkBudgetInput {
  fileName: string;
  type: string;
  isEntry?: boolean;
  code?: string;
  imports?: string[];
}

export function entryChunkBudgetFailures(chunks: BuildChunkBudgetInput[], budgetBytes = ENTRY_CHUNK_BUDGET_BYTES): string[] {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  return chunks.filter((chunk) => chunk.type === "chunk" && chunk.isEntry).flatMap((entry) => {
    const visited = new Set<string>();
    const visit = (fileName: string): number => {
      if (visited.has(fileName)) return 0;
      visited.add(fileName);
      const chunk = byFileName.get(fileName);
      if (!chunk || chunk.type !== "chunk") return 0;
      return new TextEncoder().encode(chunk.code ?? "").byteLength
        + (chunk.imports ?? []).reduce((total, importedFileName) => total + visit(importedFileName), 0);
    };
    const size = visit(entry.fileName);
    return size > budgetBytes ? [`${entry.fileName} initial static graph is ${size} bytes (budget ${budgetBytes})`] : [];
  });
}

function enforceEntryChunkBudget(): Plugin {
  return {
    name: "enforce-entry-chunk-budget",
    writeBundle(_options, bundle) {
      const failures = entryChunkBudgetFailures(Object.values(bundle) as BuildChunkBudgetInput[]);
      if (failures.length > 0) throw new Error(`Initial web bundle budget exceeded: ${failures.join(", ")}`);
    }
  };
}

export function webManualChunk(id: string): string | undefined {
  const normalized = id.replaceAll("\\", "/");
  if (normalized.includes("/node_modules/react/") || normalized.includes("/node_modules/react-dom/")) return "react-vendor";
  if (normalized.includes("/node_modules/lucide-react/")) return "icon-vendor";
  if (normalized.includes("/node_modules/@3d-dice/")) return "dice-runtime";
  if (normalized.includes("/node_modules/html-to-image/")) return "image-export";
  return undefined;
}

const allowedHosts = Array.from(
  new Set([
    "open-tabletopweb-production.up.railway.app",
    ...(process.env.VITE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  ])
);

const defaultDevApiProxyTarget = "http://127.0.0.1:4000";
const apiSourceFingerprintWatchFiles = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "turbo.json",
  "apps/api/package.json",
  "infra/docker/api.Dockerfile",
]);
const apiSourceFingerprintWatchDirectories = ["apps/api/src", "packages", "plugins"] as const;
const apiSourceFingerprintIgnoredDirectories = new Set([".turbo", "artifacts", "dist", "node_modules"]);

/** Mirrors the source inputs in apps/api/src/build-fingerprint.ts. */
export function apiSourceFingerprintInputChanged(
  event: string,
  path: string,
  workspaceRoot = findWorkspaceRoot(projectDir)
): boolean {
  if (!["add", "addDir", "change", "unlink", "unlinkDir"].includes(event)) return false;
  const relativePath = relative(resolve(workspaceRoot), resolve(workspaceRoot, path)).replaceAll("\\", "/");
  if (!relativePath || relativePath === ".." || relativePath.startsWith("../")) return false;
  if (relativePath.split("/").some((segment) => apiSourceFingerprintIgnoredDirectories.has(segment))) return false;
  if (apiSourceFingerprintWatchFiles.has(relativePath)) return true;
  return apiSourceFingerprintWatchDirectories.some(
    (directory) => relativePath === directory || relativePath.startsWith(`${directory}/`)
  );
}

export function restartDevServerOnApiSourceChange(workspaceRoot = findWorkspaceRoot(projectDir)): Plugin {
  return {
    name: "restart-on-api-source-change",
    configureServer(server) {
      server.watcher.add([
        ...Array.from(apiSourceFingerprintWatchFiles, (path) => resolve(workspaceRoot, path)),
        ...apiSourceFingerprintWatchDirectories.map((path) => resolve(workspaceRoot, path)),
      ]);
      let restarting = false;
      const handleSourceChange = (event: string, path: string) => {
        if (restarting || !apiSourceFingerprintInputChanged(event, path, workspaceRoot)) return;
        restarting = true;
        server.watcher.off("all", handleSourceChange);
        server.config.logger.info("API source changed; restarting the web dev server to refresh its compatibility fingerprint.");
        void server.restart().catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          server.config.logger.error(`Could not restart the web dev server after an API source change: ${detail}`);
        });
      };
      server.watcher.on("all", handleSourceChange);
    }
  };
}

export function devApiProxyTarget(value = process.env.OTTE_DEV_API_URL): string {
  const candidate = value?.trim() || defaultDevApiProxyTarget;
  const parsed = new URL(candidate);
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash) {
    throw new Error("OTTE_DEV_API_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.");
  }
  return parsed.origin;
}

export async function checkDevApiCompatibility(
  target: string,
  fetchHealth: typeof fetch = fetch
): Promise<void> {
  const response = await fetchHealth(new URL("/api/v1/health", `${target}/`), {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  let health: ApiHealthIdentity | undefined;
  try {
    health = await response.json() as ApiHealthIdentity;
  } catch {
    throw new Error("API health did not return a JSON identity.");
  }
  const issue = apiCompatibilityIssue(health);
  if (issue) throw new Error(issue);
  const buildIssue = apiBuildFingerprintIssue(health, devApiSourceFingerprint);
  if (buildIssue) throw new Error(buildIssue);
}

export function guardCompatibleDevApi(target: string): Plugin {
  return {
    name: "guard-compatible-dev-api",
    configureServer(server) {
      let verifiedUntil = 0;
      let pendingCheck: Promise<void> | undefined;
      let lastReportedError = "";

      const verify = (): Promise<void> => {
        if (Date.now() < verifiedUntil) return Promise.resolve();
        pendingCheck ??= (async () => {
          await checkDevApiCompatibility(target);
          verifiedUntil = Date.now() + 2_000;
          lastReportedError = "";
        })().finally(() => {
          pendingCheck = undefined;
        });
        return pendingCheck;
      };

      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api/")) return next();
        void verify().then(
          () => next(),
          (error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            if (detail !== lastReportedError) {
              server.config.logger.error(`Blocked API proxy request to ${target}: ${detail}`);
              lastReportedError = detail;
            }
            response.statusCode = 502;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.setHeader("cache-control", "no-store");
            response.end(JSON.stringify({
              error: "api_compatibility_check_failed",
              message: `${detail} Start the current API or set OTTE_DEV_API_URL to its origin.`
            }));
          }
        );
      });
    }
  };
}

const apiProxyTarget = devApiProxyTarget();

export default defineConfig({
  plugins: [restartDevServerOnApiSourceChange(), guardCompatibleDevApi(apiProxyTarget), react(), copyDiceBoxAssets(), enforceEntryChunkBudget()],
  define: {
    "import.meta.env.VITE_EXPECTED_API_BUILD_FINGERPRINT": JSON.stringify(devApiSourceFingerprint)
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: { manualChunks: webManualChunk }
    }
  },
  server: {
    allowedHosts,
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        ws: true
      }
    }
  },
  preview: {
    allowedHosts
  }
});
