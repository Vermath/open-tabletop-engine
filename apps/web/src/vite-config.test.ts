import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENTRY_CHUNK_BUDGET_BYTES, entryChunkBudgetFailures, syncDiceBoxAssets, webManualChunk } from "../vite.config.js";

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
