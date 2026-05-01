import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPluginRegistry, type PluginChatCommandInput } from "./plugin-runtime.js";

describe("plugin runtime registry", () => {
  it("loads packaged plugins and executes manifest-declared commands in the VM sandbox", () => {
    const registry = loadPluginRegistry();
    expect(registry.errors).toEqual([]);
    const plugin = registry.find("example-macro-plugin");

    expect(plugin).toEqual(
      expect.objectContaining({
        id: "example-macro-plugin",
        version: "0.1.0",
        source: expect.objectContaining({
          packageId: "example-macro-plugin",
          sandbox: "vm",
          serverEntrypoint: "example-macro-plugin/server.sandbox.js",
          checksum: expect.stringMatching(/^sha256:/)
        })
      })
    );

    const result = registry.executeChatCommand("example-macro-plugin", {
      campaignId: "camp_demo",
      pluginId: "example-macro-plugin",
      userId: "usr_demo_gm",
      command: "/spark",
      args: "test flare",
      permissions: ["chat.write", "token.read"],
      tokens: [{ id: "tok_valen", name: "Valen Ash", sceneId: "scn_vault_entry" }]
    });

    expect(result).toEqual({
      body: "Spark macro: test flare near Valen Ash.",
      visibility: "public"
    });
  });

  it("blocks unsafe globals and string code generation inside sandboxed command handlers", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "sandbox-probe",
        `
registerCommand("/probe", () => {
  let evalBlocked = false;
  try {
    eval("1 + 1");
  } catch {
    evalBlocked = true;
  }
  return {
    body: \`\${typeof process === "undefined" ? "process hidden" : "process leaked"}, \${evalBlocked ? "eval blocked" : "eval allowed"}\`,
    visibility: "public"
  };
});
`
      );
      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.errors).toEqual([]);
      expect(registry.executeChatCommand("sandbox-probe", sandboxInput()).body).toBe("process hidden, eval blocked");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("tracks multiple package versions and executes the requested installed version", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(pluginRoot, "versioned-plugin-1", `registerCommand("/version", () => ({ body: "Version 1", visibility: "public" }));`, {
        manifestId: "versioned-plugin",
        version: "1.0.0",
        command: "/version"
      });
      writePluginPackage(pluginRoot, "versioned-plugin-2", `registerCommand("/version", () => ({ body: "Version 2", visibility: "public" }));`, {
        manifestId: "versioned-plugin",
        version: "2.0.0",
        command: "/version"
      });

      const registry = loadPluginRegistry({ pluginRoot });
      const latest = registry.find("versioned-plugin");
      const older = registry.find("versioned-plugin", "1.0.0");

      expect(registry.errors).toEqual([]);
      expect(registry.list().map((plugin) => plugin.id)).toEqual(["versioned-plugin"]);
      expect(latest).toEqual(
        expect.objectContaining({
          id: "versioned-plugin",
          version: "2.0.0",
          source: expect.objectContaining({ packageId: "versioned-plugin-2" }),
          distribution: { availableVersions: ["2.0.0", "1.0.0"], latestVersion: "2.0.0" }
        })
      );
      expect(older).toEqual(expect.objectContaining({ version: "1.0.0", source: expect.objectContaining({ packageId: "versioned-plugin-1" }) }));
      expect(registry.executeChatCommand("versioned-plugin", { ...sandboxInput(), pluginId: "versioned-plugin", command: "/version" }, "1.0.0").body).toBe("Version 1");
      expect(registry.executeChatCommand("versioned-plugin", { ...sandboxInput(), pluginId: "versioned-plugin", command: "/version" }, "2.0.0").body).toBe("Version 2");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("rejects server entrypoints that escape the plugin package", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      const packagePath = resolve(pluginRoot, "bad-plugin");
      mkdirSync(packagePath);
      writeFileSync(
        join(packagePath, "plugin.manifest.json"),
        JSON.stringify({
          id: "bad-plugin",
          name: "Bad Plugin",
          version: "1.0.0",
          compatibleCore: ">=0.1.0",
          entrypoints: { server: "../escape.js" },
          runtime: { apiVersion: "0.1", sandbox: "vm" },
          permissions: ["chat.write"],
          chatCommands: [{ command: "/bad", description: "Bad command" }]
        })
      );
      writeFileSync(join(pluginRoot, "escape.js"), "registerCommand('/bad', () => ({ body: 'bad' }));");

      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.list()).toEqual([]);
      expect(registry.errors).toHaveLength(1);
      expect(registry.errors.at(0)!.errors).toContain("server entrypoint must stay inside the plugin package");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });
});

function writePluginPackage(
  pluginRoot: string,
  packageId: string,
  serverSource: string,
  options: { manifestId?: string; version?: string; command?: string } = {}
): void {
  const packagePath = resolve(pluginRoot, packageId);
  const command = options.command ?? "/probe";
  mkdirSync(packagePath);
  writeFileSync(
    join(packagePath, "plugin.manifest.json"),
    JSON.stringify({
      id: options.manifestId ?? packageId,
      name: "Sandbox Probe",
      version: options.version ?? "1.0.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { server: "./server.js" },
      runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: ["chat.write"],
      chatCommands: [{ command, description: "Probe sandbox behavior" }]
    })
  );
  writeFileSync(join(packagePath, "server.js"), serverSource);
}

function sandboxInput(): PluginChatCommandInput {
  return {
    campaignId: "camp_demo",
    pluginId: "sandbox-probe",
    userId: "usr_demo_gm",
    command: "/probe",
    args: "",
    permissions: ["chat.write"],
    tokens: []
  };
}
