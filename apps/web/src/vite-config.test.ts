import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncDiceBoxAssets } from "../vite.config.js";

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
