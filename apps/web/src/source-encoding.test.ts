import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = __dirname;
const sourceFiles = readdirSync(sourceDirectory).filter((name) => /\.(?:ts|tsx|css)$/.test(name));

describe("web source encoding", () => {
  it("keeps every source file valid UTF-8 so interface text never renders a replacement character", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const invalid = sourceFiles.filter((name) => {
      try {
        decoder.decode(readFileSync(resolve(sourceDirectory, name)));
        return false;
      } catch {
        return true;
      }
    });
    expect(sourceFiles.length).toBeGreaterThan(100);
    expect(invalid).toEqual([]);
  });
});
