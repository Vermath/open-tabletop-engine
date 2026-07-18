import { describe, expect, it } from "vitest";
import {
  comparePluginVersions,
  parsePluginVersion,
  PLUGIN_PERMISSION_ALLOWLIST,
  pluginCoreCompatibility,
  pluginEventPermission,
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

  it("accepts the typed atomic token movement permission", () => {
    expect(PLUGIN_PERMISSION_ALLOWLIST).toContain("token.move");
    expect(
      validatePluginManifest({
        ...validManifest,
        permissions: ["chat.write", "token.move"],
      }),
    ).toEqual([]);
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

  it("rejects unsafe entrypoints and duplicate permission or panel identities", () => {
    const errors = validatePluginManifest({
      ...validManifest,
      entrypoints: {
        client: "../outside.js",
        server: ".",
      },
      permissions: ["chat.write", "chat.write"],
      ui: {
        panels: [
          { id: "same-panel", title: "First" },
          { id: "same-panel", title: "Second" },
        ],
      },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "Client entrypoint must be a safe package-relative path",
        "Server entrypoint must be a safe package-relative path",
        "Plugin permissions must not contain duplicates",
        "Plugin ui panel id is duplicated: same-panel",
      ]),
    );
  });

  it("validates core range syntax while reporting compatibility separately", () => {
    expect(pluginCoreCompatibility(">=0.2.0 <0.4.0")).toEqual({
      valid: true,
      satisfied: true,
    });
    expect(pluginCoreCompatibility("^0.0.3", "0.0.4")).toEqual({
      valid: true,
      satisfied: false,
    });
    expect(pluginCoreCompatibility("any")).toEqual({
      valid: true,
      satisfied: true,
    });
    expect(pluginCoreCompatibility("^0", "0.9.0")).toEqual({
      valid: true,
      satisfied: true,
    });
    expect(pluginCoreCompatibility("~0", "0.9.0")).toEqual({
      valid: true,
      satisfied: true,
    });
    expect(pluginCoreCompatibility(">=not-a-version")).toEqual({
      valid: false,
      satisfied: false,
    });
    expect(pluginCoreCompatibility("x")).toEqual({
      valid: false,
      satisfied: false,
    });
    expect(pluginCoreCompatibility(">9.0.0 not-a-version")).toEqual({
      valid: false,
      satisfied: false,
    });
    expect(pluginCoreCompatibility(">=9.0.0")).toEqual({
      valid: true,
      satisfied: false,
    });
    expect(
      validatePluginManifest({ ...validManifest, compatibleCore: ">=9.0.0" }),
    ).toEqual([]);
    expect(
      validatePluginManifest({ ...validManifest, compatibleCore: "latest" }),
    ).toContain("Compatible core range must be a valid version range");
  });

  it("validates event subscriptions against the supported event and permission surface", () => {
    expect(
      validatePluginManifest({
        ...validManifest,
        permissions: ["chat.write", "token.read", "ai.proposeChanges"],
        eventSubscriptions: [
          {
            type: "token.moved",
            description: "Offer follow-up chat when a token moves",
          },
          { type: "proposal.applied" },
        ],
      }),
    ).toEqual([]);

    expect(
      validatePluginManifest({
        ...validManifest,
        eventSubscriptions: [
          null,
          { type: "token.moved" },
          { type: "token.moved" },
          { type: "ai.message.delta" },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Plugin event subscription 1 must be an object",
        "Plugin event token.moved requires permission: token.read",
        "Plugin event subscription is duplicated: token.moved",
        "Unsupported plugin event type: ai.message.delta",
      ]),
    );
  });

  it("requires a server entrypoint for event subscriptions", () => {
    expect(
      validatePluginManifest({
        ...validManifest,
        entrypoints: { client: "./client.js" },
        permissions: ["token.read"],
        chatCommands: [],
        eventSubscriptions: [{ type: "token.moved" }],
      }),
    ).toContain("Plugins with event subscriptions require a server entrypoint");
  });

  it("requires the dedicated world and handout read permissions for their events", () => {
    expect(pluginEventPermission("world.updated")).toBe("world.read");
    expect(pluginEventPermission("handout.updated")).toBe("handout.read");
    expect(
      validatePluginManifest({
        ...validManifest,
        permissions: ["world.read", "handout.read"],
        eventSubscriptions: [
          { type: "world.updated" },
          { type: "handout.updated" },
        ],
      }),
    ).toEqual([]);
    expect(
      validatePluginManifest({
        ...validManifest,
        permissions: ["campaign.read", "journal.read"],
        eventSubscriptions: [
          { type: "world.updated" },
          { type: "handout.updated" },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Plugin event world.updated requires permission: world.read",
        "Plugin event handout.updated requires permission: handout.read",
      ]),
    );
  });

  it("allows explicitly reviewed read-only grants for private record event visibility", () => {
    expect(
      validatePluginManifest({
        ...validManifest,
        permissions: [
          "actor.read",
          "actor.readPrivate",
          "journal.read",
          "journal.readSecret",
          "handout.read",
          "handout.readSecret",
          "ai.readPublicMemory",
          "ai.readGmMemory",
          "ai.proposeChanges",
        ],
        eventSubscriptions: [
          { type: "item.updated" },
          { type: "journal.updated" },
          { type: "handout.updated" },
          { type: "ai.memory.updated" },
        ],
      }),
    ).toEqual([]);
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

  it("bounds version and compatibility inputs before parsing numeric identifiers", () => {
    const oversizedVersion = `${"1".repeat(257)}.0.0`;
    const oversizedRange = `>=${"1".repeat(513)}.0.0`;
    const oversizedRangeComponent = `>=${"1".repeat(500)}`;

    expect(parsePluginVersion(oversizedVersion)).toBeUndefined();
    expect(() => comparePluginVersions(oversizedVersion, "1.0.0")).toThrow(
      "Plugin versions must be valid semantic versions",
    );
    expect(pluginCoreCompatibility(oversizedRange)).toEqual({
      valid: false,
      satisfied: false,
    });
    expect(pluginCoreCompatibility(oversizedRangeComponent)).toEqual({
      valid: false,
      satisfied: false,
    });
    expect(pluginCoreCompatibility(">=0.3.0", oversizedVersion)).toEqual({
      valid: false,
      satisfied: false,
    });
    expect(
      validatePluginManifest({ ...validManifest, version: oversizedVersion }),
    ).toContain("Plugin version must be valid semver");
    expect(
      validatePluginManifest({
        ...validManifest,
        compatibleCore: oversizedRange,
      }),
    ).toContain("Compatible core range must be a valid version range");
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
