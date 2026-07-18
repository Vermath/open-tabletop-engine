import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENTRY_CHUNK_BUDGET_BYTES,
  apiSourceFingerprintInputChanged,
  checkDevApiCompatibility,
  devApiSourceFingerprint,
  devApiProxyTarget,
  diceAssetFingerprint,
  diceAssetLockOwnerIsAbandoned,
  entryChunkBudgetFailures,
  restartDevServerOnApiSourceChange,
  syncDiceBoxAssets,
  syncDiceBoxAssetsOnce,
  webManualChunk
} from "../vite.config.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Dice Box build assets", () => {
  it("replaces stale copied support files when the dependency changes", () => {
    const root = mkdtempSync(join(tmpdir(), "otte-dice-assets-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "target");
    mkdirSync(source, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(source, "texture.webp"), "new-version");
    writeFileSync(join(target, "texture.webp"), "old-version");
    writeFileSync(join(target, "removed-by-upgrade.webp"), "stale");

    syncDiceBoxAssets(source, target);

    expect(readFileSync(join(target, "texture.webp"), "utf8")).toBe("new-version");
    expect(existsSync(join(target, "removed-by-upgrade.webp"))).toBe(false);
  });

  it("reuses one completed dice asset copy across concurrent server startup", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-dice-assets-once-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "target");
    mkdirSync(join(source, "sounds"), { recursive: true });
    writeFileSync(join(source, "sounds", "roll.mp3"), "dice");

    await Promise.all([
      syncDiceBoxAssetsOnce(source, target),
      syncDiceBoxAssetsOnce(source, target),
      syncDiceBoxAssetsOnce(source, target),
    ]);

    expect(readFileSync(join(target, "sounds", "roll.mp3"), "utf8")).toBe("dice");
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it("invalidates the marker when nested asset bytes change", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-dice-assets-nested-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "target");
    const nestedSource = join(source, "textures", "die.webp");
    mkdirSync(join(source, "textures"), { recursive: true });
    writeFileSync(nestedSource, "version-one");

    await syncDiceBoxAssetsOnce(source, target);
    const firstFingerprint = diceAssetFingerprint(source);
    writeFileSync(nestedSource, "version-two");
    const secondFingerprint = diceAssetFingerprint(source);
    await syncDiceBoxAssetsOnce(source, target);

    expect(secondFingerprint).not.toBe(firstFingerprint);
    expect(readFileSync(join(target, "textures", "die.webp"), "utf8")).toBe("version-two");
  });

  it("classifies dead and stale lock owners without reclaiming a live fresh owner", () => {
    const nowMs = Date.parse("2026-07-17T12:00:00.000Z");
    const owner = { token: "owner", pid: 1234, createdAt: nowMs - 1_000 };

    expect(diceAssetLockOwnerIsAbandoned(owner, nowMs - 1_000, nowMs, () => false)).toBe(true);
    expect(diceAssetLockOwnerIsAbandoned({ ...owner, createdAt: nowMs - 10 * 60_000 }, nowMs, nowMs, () => true)).toBe(true);
    expect(diceAssetLockOwnerIsAbandoned(owner, nowMs - 1_000, nowMs, () => true)).toBe(false);
  });

  it("reclaims a stale lock instead of timing out startup", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-dice-assets-stale-lock-"));
    temporaryRoots.push(root);
    const source = join(root, "source");
    const target = join(root, "target");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "die.webp"), "dice");
    writeFileSync(`${target}.lock`, JSON.stringify({
      token: "abandoned",
      pid: process.pid,
      createdAt: Date.now() - 10 * 60_000
    }));

    await syncDiceBoxAssetsOnce(source, target);

    expect(readFileSync(join(target, "die.webp"), "utf8")).toBe("dice");
    expect(existsSync(`${target}.lock`)).toBe(false);
  });
});

describe("web bundle boundaries", () => {
  it("fails an oversized initial entry but ignores deferred chunks", () => {
    expect(entryChunkBudgetFailures([
      { type: "chunk", fileName: "index.js", isEntry: true, code: "x", imports: ["react-vendor.js"] },
      { type: "chunk", fileName: "react-vendor.js", isEntry: false, code: "x".repeat(ENTRY_CHUNK_BUDGET_BYTES) },
      { type: "chunk", fileName: "compendium.js", isEntry: false, code: "x".repeat(ENTRY_CHUNK_BUDGET_BYTES + 1) }
    ])).toEqual([expect.stringContaining("index.js")]);
  });

  it("keeps expensive vendor runtimes out of the application entry", () => {
    expect(webManualChunk("D:/repo/node_modules/react-dom/client.js")).toBe("react-vendor");
    expect(webManualChunk("D:/repo/node_modules/html-to-image/es/index.js")).toBe("image-export");
    expect(webManualChunk("D:/repo/node_modules/@3d-dice/dice-box-threejs/dist/index.js")).toBe("dice-runtime");
  });
});

describe("local API proxy identity", () => {
  it("restarts for compatibility-fingerprint inputs but ignores generated API data", () => {
    const root = "D:/repo";
    expect(apiSourceFingerprintInputChanged("change", "D:/repo/apps/api/src/app.ts", root)).toBe(true);
    expect(apiSourceFingerprintInputChanged("add", "D:/repo/packages/core/src/new-domain.ts", root)).toBe(true);
    expect(apiSourceFingerprintInputChanged("unlink", "D:/repo/plugins/example/index.ts", root)).toBe(true);
    expect(apiSourceFingerprintInputChanged("change", "D:/repo/pnpm-lock.yaml", root)).toBe(true);
    expect(apiSourceFingerprintInputChanged("change", "D:/repo/apps/web/src/App.tsx", root)).toBe(false);
    expect(apiSourceFingerprintInputChanged("change", "D:/repo/apps/api/artifacts/report.json", root)).toBe(false);
    expect(apiSourceFingerprintInputChanged("change", "D:/repo/packages/core/dist/index.js", root)).toBe(false);
    expect(apiSourceFingerprintInputChanged("ready", "D:/repo/apps/api/src/app.ts", root)).toBe(false);
  });

  it("restarts once when a watched API source input changes", async () => {
    const listeners = new Map<string, (...args: string[]) => void>();
    const watcher = {
      add: vi.fn(),
      on: vi.fn((event: string, listener: (...args: string[]) => void) => {
        listeners.set(event, listener);
        return watcher;
      }),
      off: vi.fn((event: string, listener: (...args: string[]) => void) => {
        if (listeners.get(event) === listener) listeners.delete(event);
        return watcher;
      })
    };
    const restart = vi.fn(async () => undefined);
    const plugin = restartDevServerOnApiSourceChange("D:/repo");
    const configureServer = plugin.configureServer as unknown as (server: unknown) => void;
    configureServer({
      watcher,
      restart,
      config: { logger: { info: vi.fn(), error: vi.fn() } }
    });

    const handle = listeners.get("all");
    expect(handle).toBeDefined();
    handle?.("change", "D:/repo/apps/web/src/App.tsx");
    expect(restart).not.toHaveBeenCalled();
    handle?.("change", "D:/repo/apps/api/src/app.ts");
    handle?.("change", "D:/repo/apps/api/src/routes.ts");
    await Promise.resolve();

    expect(restart).toHaveBeenCalledTimes(1);
    expect(watcher.off).toHaveBeenCalledWith("all", handle);
  });

  it("uses an explicit current-source API origin without accepting ambiguous URL components", () => {
    expect(devApiProxyTarget(undefined)).toBe("http://127.0.0.1:4000");
    expect(devApiProxyTarget(" http://127.0.0.1:4010 ")).toBe("http://127.0.0.1:4010");
    expect(() => devApiProxyTarget("http://127.0.0.1:4010/stale")).toThrow("HTTP(S) origin");
    expect(() => devApiProxyTarget("http://user:secret@127.0.0.1:4010")).toThrow("HTTP(S) origin");
  });

  it("accepts the current API identity and blocks retained or unrelated servers", async () => {
    const matchingFetch = async () => Response.json({
      ok: true,
      version: "0.3.0",
      service: "open-tabletop-api",
      apiCompatibility: "1",
      buildFingerprint: devApiSourceFingerprint
    });
    await expect(checkDevApiCompatibility("http://127.0.0.1:4000", matchingFetch)).resolves.toBeUndefined();

    const retainedFetch = async () => Response.json({ ok: true, version: "0.3.0", service: "open-tabletop-api" });
    await expect(checkDevApiCompatibility("http://127.0.0.1:4000", retainedFetch)).rejects.toThrow("API missing");

    const unrelatedFetch = async () => Response.json({ ok: true, service: "another-service", apiCompatibility: "1" });
    await expect(checkDevApiCompatibility("http://127.0.0.1:4000", unrelatedFetch)).rejects.toThrow("Expected open-tabletop-api");

    const otherCheckoutFetch = async () => Response.json({ ok: true, service: "open-tabletop-api", apiCompatibility: "1", buildFingerprint: "sha256:other-checkout" });
    await expect(checkDevApiCompatibility("http://127.0.0.1:4000", otherCheckoutFetch)).rejects.toThrow("source fingerprint mismatch");
  });
});
