import type { PluginReview } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import type { LoadedPlugin } from "./plugin-runtime.js";
import {
  PluginOperatorMutationError,
  assertPluginRegistryRevision,
  assertPluginReviewRevision,
  pluginInstallAuditSummary,
  pluginRegistryRevision,
} from "./plugin-system-operator.js";

function plugin(
  id: string,
  overrides: Partial<LoadedPlugin["source"]> = {},
): LoadedPlugin {
  return {
    id,
    name: id,
    version: "1.0.0",
    compatibleCore: "*",
    entrypoints: {},
    runtime: { apiVersion: "0.1", sandbox: "vm" },
    permissions: ["chat.write"],
    source: {
      type: "registry",
      packageId: `${id}-package`,
      manifestPath: `${id}/manifest.json`,
      manifestChecksum: `${id}-manifest-checksum`,
      packageChecksum: `${id}-package-checksum`,
      sandbox: "vm",
      registryUrl: "https://plugins.example.test/catalog.json",
      syncedAt: "2026-07-13T00:00:00.000Z",
      ...overrides,
    },
    distribution: {
      availableVersions: ["1.0.0"],
      latestVersion: "1.0.0",
    },
    permissionReview: {
      requestedPermissions: ["chat.write"],
      grantRequired: true,
    },
    trust: {
      status: "trusted",
      policy: "require_trusted",
      required: true,
      installable: true,
      errors: [],
    },
  };
}

function review(updatedAt = "2026-07-13T00:00:00.000Z"): PluginReview {
  return {
    id: "review_01",
    reviewKey: "review-key-01",
    pluginId: "plugin-one",
    packageId: "plugin-one-package",
    version: "1.0.0",
    checksum: "checksum",
    sourceType: "registry",
    status: "pending",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt,
  };
}

describe("plugin and system operator mutation safety", () => {
  it("uses an order-independent exact plugin-registry generation", () => {
    const one = plugin("plugin-one");
    const two = plugin("plugin-two");
    const revision = pluginRegistryRevision([one, two]);

    expect(pluginRegistryRevision([two, one])).toBe(revision);
    expect(
      pluginRegistryRevision([
        one,
        plugin("plugin-two", { syncedAt: "2026-07-13T00:01:00.000Z" }),
      ]),
    ).not.toBe(revision);
    expect(assertPluginRegistryRevision([one, two], revision)).toBe(revision);
  });

  it("returns the current registry generation for missing and stale preconditions", () => {
    const packages = [plugin("plugin-one")];
    const currentRegistryRevision = pluginRegistryRevision(packages);

    expect(() => assertPluginRegistryRevision(packages, undefined)).toThrow(
      PluginOperatorMutationError,
    );
    try {
      assertPluginRegistryRevision(packages, "sha256:stale");
      throw new Error("expected stale registry revision to fail");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 409,
        code: "stale_write",
        details: { currentRegistryRevision },
      });
    }
  });

  it("requires the exact plugin-review timestamp", () => {
    const current = review();
    expect(() =>
      assertPluginReviewRevision(current, current.updatedAt),
    ).not.toThrow();
    expect(() =>
      assertPluginReviewRevision(current, "2026-07-12T23:59:00.000Z"),
    ).toThrow(PluginOperatorMutationError);
    expect(() => assertPluginReviewRevision(current, undefined)).toThrow(
      PluginOperatorMutationError,
    );
  });

  it("redacts caller-controlled package paths from install audit evidence", () => {
    const loaded = plugin("plugin-one", {
      manifestPath:
        "C:/Users/operator/private/plugins/plugin-one/plugin.manifest.json",
      packageUrl:
        "https://registry.example.test/private/plugin-one.tgz?token=secret",
    });

    const summary = pluginInstallAuditSummary(loaded);
    const serialized = JSON.stringify(summary);

    expect(summary).toMatchObject({
      pluginId: "plugin-one",
      version: "1.0.0",
      source: {
        type: "registry",
        packageId: "plugin-one-package",
        manifestChecksum: "plugin-one-manifest-checksum",
      },
      trust: { status: "trusted", installable: true },
    });
    expect(serialized).not.toContain("C:/Users/operator/private");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("packageUrl");
    expect(serialized).not.toContain("manifestPath");
  });
});
