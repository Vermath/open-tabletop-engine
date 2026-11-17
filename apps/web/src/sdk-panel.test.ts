import { describe, expect, it } from "vitest";
import type { PluginRuntimeInfo } from "./api.js";
import { initialPluginInstallPermissions, pluginInstallActionLabel, pluginVersionReview } from "./sdk-panel.js";

function plugin(input: Partial<PluginRuntimeInfo> = {}): PluginRuntimeInfo {
  return {
    id: "example-plugin",
    name: "Example Plugin",
    version: "1.0.0",
    permissions: ["chat.write", "token.read"],
    grantedPermissions: [],
    installed: false,
    distribution: {
      latestVersion: "2.0.0",
      availableVersions: ["2.0.0", "1.0.0"]
    },
    ...input
  } as PluginRuntimeInfo;
}

describe("plugin permission review", () => {
  it("starts a first install with every requested permission visible and selected", () => {
    expect(initialPluginInstallPermissions(plugin())).toEqual(["chat.write", "token.read"]);
  });

  it("preserves least-privilege grants during upgrades instead of silently adding new access", () => {
    expect(initialPluginInstallPermissions(plugin({ installed: true, grantedPermissions: ["chat.write"] }))).toEqual(["chat.write"]);
  });

  it("reviews the exact upgrade version instead of the installed manifest", () => {
    const installed = plugin({
      installed: true,
      version: "1.0.0",
      installedVersion: "1.0.0",
      grantedPermissions: ["chat.write"],
      versionCompatibility: [{
        version: "2.0.0",
        compatibleCore: { range: ">=0.1.0", coreVersion: "0.3.0", satisfied: true },
        permissions: ["chat.write", "token.read"],
        permissionReview: { requestedPermissions: ["chat.write", "token.read"], grantRequired: true },
        trust: { status: "trusted", policy: "require_trusted", required: true, installable: true, errors: [] },
        source: { type: "registry", packageId: "example-plugin-2", sandbox: "vm" }
      }]
    });
    const target = pluginVersionReview(installed, "2.0.0");
    expect(target?.permissionReview.requestedPermissions).toEqual(["chat.write", "token.read"]);
    expect(initialPluginInstallPermissions(installed, target?.permissionReview.requestedPermissions)).toEqual(["chat.write"]);
  });

  it("labels install, upgrade, and rollback decisions explicitly", () => {
    expect(pluginInstallActionLabel(plugin())).toBe("Install 2.0.0");
    const installed = plugin({ installed: true, installedVersion: "1.0.0" });
    expect(pluginInstallActionLabel(installed)).toBe("Upgrade to 2.0.0");
    expect(pluginInstallActionLabel(installed, "1.0.0")).toBe("Roll back to 1.0.0");
  });
});
