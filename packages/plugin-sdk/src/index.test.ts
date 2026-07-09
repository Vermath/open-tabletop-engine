import { describe, expect, it } from "vitest";
import {
  comparePluginVersions,
  parsePluginVersion,
  validatePluginManifest,
} from "./index.js";

const validManifest = {
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.2.3+build.7",
  compatibleCore: ">=0.3.0",
  entrypoints: { server: "./server.js" },
  runtime: { apiVersion: "0.3", sandbox: "vm" },
  permissions: ["chat.write"],
  ui: { panels: [{ id: "test-panel", title: "Test panel" }] },
  chatCommands: [{ command: "/test", description: "Run the test command" }],
};

describe("plugin manifest validation", () => {
  it("accepts SemVer build metadata and validates all nested manifest fields", () => {
    expect(validatePluginManifest(validManifest)).toEqual([]);
  });

  it("returns validation errors instead of throwing for malformed nested values", () => {
    const malformed = {
      ...validManifest,
      package: "publisher",
      entrypoints: [],
      runtime: "vm",
      permissions: ["chat.write", 7],
      ui: { panels: [null, { id: "", title: 3 }] },
      chatCommands: [
        null,
        { command: 4 },
        { command: "/duplicate", description: "first" },
        { command: "/duplicate", description: "second" },
      ],
    };

    expect(() => validatePluginManifest(malformed)).not.toThrow();
    expect(validatePluginManifest(malformed)).toEqual(
      expect.arrayContaining([
        "Plugin package must be an object",
        "Plugin entrypoints must be an object",
        "Plugin runtime must be an object",
        "Unsupported plugin permissions: 7",
        "Plugin ui panel 1 must be an object",
        "Plugin chat command 1 must be an object",
        "Plugin command is duplicated: /duplicate",
      ]),
    );
  });

  it("rejects malformed SemVer prereleases", () => {
    for (const version of [
      "1.0.0-.",
      "1.0.0-beta..1",
      "1.0.0-01",
      "01.0.0",
      "1.0",
    ]) {
      expect(parsePluginVersion(version)).toBeUndefined();
      expect(validatePluginManifest({ ...validManifest, version })).toContain(
        "Plugin version must be valid semver",
      );
    }
  });
});

describe("plugin version precedence", () => {
  it("implements the SemVer prerelease precedence sequence", () => {
    const versions = [
      "1.0.0",
      "1.0.0-beta.11",
      "1.0.0-alpha.beta",
      "1.0.0-rc.1",
      "1.0.0-alpha",
      "1.0.0-beta",
      "1.0.0-alpha.1",
      "1.0.0-beta.2",
    ];
    expect(versions.sort(comparePluginVersions)).toEqual([
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ]);
  });

  it("ignores build metadata for precedence and compares large numeric identifiers exactly", () => {
    expect(comparePluginVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
    expect(
      comparePluginVersions(
        "1.0.0-beta.9007199254740992",
        "1.0.0-beta.9007199254740993",
      ),
    ).toBeLessThan(0);
  });

  it("uses SemVer ASCII ordering instead of locale-dependent prerelease ordering", () => {
    expect(comparePluginVersions("1.0.0-A", "1.0.0-a")).toBeLessThan(0);
    expect(comparePluginVersions("1.0.0-a", "1.0.0-A")).toBeGreaterThan(0);
  });
});
