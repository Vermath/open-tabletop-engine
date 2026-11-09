import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { Script } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import type { DesktopPreloadApi } from "./desktop-api.js";
import { desktopDataPaths, ensureDesktopAssetSigningSecret } from "./desktop-runtime.js";

const temporaryRoots: string[] = [];
function installation() {
  const root = mkdtempSync(join(tmpdir(), "otte-desktop-startup-"));
  temporaryRoots.push(root);
  const paths = desktopDataPaths(root);
  mkdirSync(paths.dataDir, { recursive: true });
  return { paths, keyPath: join(paths.dataDir, "asset-url-signing.key") };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !basename(root).startsWith("otte-desktop-startup-")) throw new Error("Refusing to clean an unowned test directory");
    rmSync(root, { recursive: true, force: true });
  }
});

describe("desktop first-start signing key", () => {
  it("creates a random persisted key and reuses it on restart", async () => {
    const { paths, keyPath } = installation();
    const first = await ensureDesktopAssetSigningSecret(paths, {});
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(keyPath, "utf8").trim()).toBe(first);
    expect(await ensureDesktopAssetSigningSecret(paths, {})).toBe(first);
    if (process.platform !== "win32") expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  it("uses different keys for separate installations", async () => {
    const first = installation();
    const second = installation();
    expect(await ensureDesktopAssetSigningSecret(first.paths, {})).not.toBe(await ensureDesktopAssetSigningSecret(second.paths, {}));
  });

  it("honors an explicit configured key without creating a local key file", async () => {
    const { paths, keyPath } = installation();
    const configured = "explicit-test-only-signing-key";
    expect(await ensureDesktopAssetSigningSecret(paths, { OTTE_ASSET_URL_SIGNING_SECRET: configured })).toBe(configured);
    expect(existsSync(keyPath)).toBe(false);
  });

  it("does not read or replace a local key when an explicit key is configured", async () => {
    const { paths, keyPath } = installation();
    writeFileSync(keyPath, "invalid old fixture");
    expect(await ensureDesktopAssetSigningSecret(paths, { OTTE_ASSET_URL_SIGNING_SECRET: "explicit-test-key" })).toBe("explicit-test-key");
    expect(readFileSync(keyPath, "utf8")).toBe("invalid old fixture");
  });

  it("fails closed on an invalid persisted key instead of rotating it", async () => {
    const { paths, keyPath } = installation();
    writeFileSync(keyPath, "invalid fixture");
    await expect(ensureDesktopAssetSigningSecret(paths, {})).rejects.toThrow("persisted desktop asset signing key is invalid");
    expect(readFileSync(keyPath, "utf8")).toBe("invalid fixture");
  });

  it("treats a blank environment override as unconfigured", async () => {
    const { paths } = installation();
    expect(await ensureDesktopAssetSigningSecret(paths, { OTTE_ASSET_URL_SIGNING_SECRET: "  " })).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("sandbox preload build format", () => {
  it("runs the compiled preload as classic JavaScript with Electron's allowed require", async () => {
    const packageRoot = resolve(__dirname, "..");
    const config = ts.readConfigFile(join(packageRoot, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot);
    const source = readFileSync(join(__dirname, "preload.ts"), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: parsed.options, fileName: "preload.ts" });
    let exposed: DesktopPreloadApi | undefined;
    const calls: unknown[][] = [];
    new Script(compiled.outputText, { filename: "preload.js" }).runInNewContext({
      require: (name: string) => {
        expect(name).toBe("electron");
        return {
          contextBridge: { exposeInMainWorld: (key: string, api: DesktopPreloadApi) => { expect(key).toBe("otteDesktop"); exposed = api; } },
          ipcRenderer: { invoke: (...args: unknown[]) => { calls.push(args); return Promise.resolve({ dataRoot: "fixture" }); } },
        };
      },
    });
    expect(exposed).toBeDefined();
    expect(await exposed!.getDesktopStatus()).toEqual({ dataRoot: "fixture" });
    expect(calls).toEqual([["desktop:getStatus"]]);
  });
});
