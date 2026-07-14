import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PLUGIN_COMMAND_WORKER_RESOURCE_LIMITS,
  PLUGIN_RUNTIME_API_VERSION,
  loadPluginRegistry,
  pluginSignatureForPackage,
  type PluginChatCommandInput,
} from "./plugin-runtime.js";

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
          checksum: expect.stringMatching(/^sha256:/),
        }),
      }),
    );

    const result = registry.executeChatCommand("example-macro-plugin", {
      campaignId: "camp_demo",
      pluginId: "example-macro-plugin",
      userId: "usr_demo_gm",
      command: "/spark",
      args: "test flare",
      permissions: ["chat.write", "token.read"],
      tokens: [
        { id: "tok_valen", name: "Valen Ash", sceneId: "scn_vault_entry" },
      ],
    });

    expect(result).toEqual({
      body: "Spark macro: test flare near Valen Ash.",
      visibility: "public",
    });
  });

  it("rejects packages that target an unsupported plugin runtime API", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "future-runtime-probe",
        'registerCommand("/probe", () => ({ body: "should not run", visibility: "public" }));',
        { runtimeApiVersion: "999.0" },
      );
      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.find("future-runtime-probe")).toBeUndefined();
      expect(registry.errors).toEqual([
        expect.objectContaining({
          packagePath: expect.stringContaining("future-runtime-probe"),
          errors: [
            `Unsupported plugin runtime apiVersion: 999.0; supported version is ${PLUGIN_RUNTIME_API_VERSION}`,
          ],
        }),
      ]);
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
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
`,
      );
      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.errors).toEqual([]);
      expect(
        registry.executeChatCommand("sandbox-probe", sandboxInput()).body,
      ).toBe("process hidden, eval blocked");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("does not expose host function constructors through registerCommand", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "host-function-probe",
        `
let body = "host escape blocked";
try {
  registerCommand.constructor.constructor("return process.version")();
  body = "host process leaked";
} catch {}
registerCommand("/probe", () => ({ body, visibility: "public" }));
`,
      );
      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.errors).toEqual([]);
      expect(
        registry.executeChatCommand("host-function-probe", sandboxInput()).body,
      ).toBe("host escape blocked");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("does not expose host object constructors to sandboxed command handlers", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "host-object-probe",
        `
registerCommand("/probe", (input) => {
  try {
    input.constructor.constructor("return process.version")();
    return { body: "host process leaked", visibility: "public" };
  } catch {
    return { body: "host escape blocked", visibility: "public" };
  }
});
`,
      );
      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.errors).toEqual([]);
      expect(
        registry.executeChatCommand("host-object-probe", sandboxInput()).body,
      ).toBe("host escape blocked");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("does not retain synchronous plugin globals across campaign executions", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "campaign-isolation-probe",
        `
let previousCampaign;
registerCommand("/probe", (input) => {
  const previous = previousCampaign ?? "none";
  previousCampaign = input.campaignId;
  return { body: previous, visibility: "public" };
});
`,
      );
      const registry = loadPluginRegistry({ pluginRoot });
      expect(
        registry.executeChatCommand("campaign-isolation-probe", {
          ...sandboxInput(),
          pluginId: "campaign-isolation-probe",
          campaignId: "camp_alpha",
        }).body,
      ).toBe("none");
      expect(
        registry.executeChatCommand("campaign-isolation-probe", {
          ...sandboxInput(),
          pluginId: "campaign-isolation-probe",
          campaignId: "camp_beta",
        }).body,
      ).toBe("none");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe plugin storage mutations inside sandboxed command handlers", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "bad-storage-key-plugin",
        `
registerCommand("/probe", () => ({
  body: "bad storage key",
  visibility: "public",
  storage: { set: { "../escape": true } }
}));
`,
      );
      writePluginPackage(
        pluginRoot,
        "large-storage-plugin",
        `
registerCommand("/probe", () => ({
  body: "large storage value",
  visibility: "public",
  storage: { set: { counter: "x".repeat(17 * 1024) } }
}));
`,
      );
      writePluginPackage(
        pluginRoot,
        "bad-delete-key-plugin",
        `
registerCommand("/probe", () => ({
  body: "bad delete key",
  visibility: "public",
  storage: { delete: ["../escape"] }
}));
`,
      );

      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.errors).toEqual([]);
      expect(() =>
        registry.executeChatCommand("bad-storage-key-plugin", sandboxInput()),
      ).toThrow("Invalid plugin storage key: ../escape");
      expect(() =>
        registry.executeChatCommand("large-storage-plugin", sandboxInput()),
      ).toThrow("Plugin storage value is limited to 16 KiB of JSON");
      expect(() =>
        registry.executeChatCommand("bad-delete-key-plugin", sandboxInput()),
      ).toThrow("Invalid plugin storage key: ../escape");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("bounds CPU-heavy async command execution without blocking later commands", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "bounded-command-plugin",
        `
registerCommand("/spin", () => {
  while (true) {}
});
registerCommand("/probe", () => ({ body: "Probe still works", visibility: "public" }));
`,
        {
          commands: [
            { command: "/spin", description: "Spin until bounded" },
            {
              command: "/probe",
              description: "Prove later commands still work",
            },
          ],
        },
      );
      const registry = loadPluginRegistry({ pluginRoot });

      const startedAt = Date.now();
      const slowCommand = registry.executeChatCommandAsync(
        "bounded-command-plugin",
        {
          ...sandboxInput(),
          pluginId: "bounded-command-plugin",
          command: "/spin",
        },
      );

      const timerStartedAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(Date.now() - timerStartedAt).toBeLessThan(250);

      await expect(slowCommand).rejects.toThrow("Plugin command timed out");
      expect(Date.now() - startedAt).toBeLessThan(1500);
      await expect(
        registry.executeChatCommandAsync("bounded-command-plugin", {
          ...sandboxInput(),
          pluginId: "bounded-command-plugin",
          command: "/probe",
        }),
      ).resolves.toEqual({ body: "Probe still works", visibility: "public" });
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("collects permission-gated proposal and chat bridge requests from async command handlers", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "command-bridge-plugin",
        `
registerCommand("/probe", async (input, context) => {
  const chatReceipt = await context.postChatMessage({ body: "Bridge chat", visibility: "gm_only" });
  const proposalReceipt = await context.createProposal({
    title: "Bridge proposal",
    summary: "Create a reviewable journal entry",
    changes: [{ entity: "journal", action: "create", data: { campaignId: input.campaignId, title: "Bridge journal", body: "Review me" } }]
  });
  return { body: chatReceipt + ":" + proposalReceipt, visibility: "public" };
});
`,
        { permissions: ["chat.write", "ai.proposeChanges"] },
      );
      const registry = loadPluginRegistry({ pluginRoot });

      await expect(
        registry.executeChatCommandAsync("command-bridge-plugin", {
          ...sandboxInput(),
          pluginId: "command-bridge-plugin",
        }),
      ).resolves.toEqual({
        body: "chat_1:proposal_2",
        visibility: "public",
        bridgeRequests: [
          {
            kind: "chat.post",
            requestId: "chat_1",
            input: { body: "Bridge chat", visibility: "gm_only" },
          },
          {
            kind: "proposal.create",
            requestId: "proposal_2",
            input: {
              title: "Bridge proposal",
              summary: "Create a reviewable journal entry",
              changes: [
                {
                  entity: "journal",
                  action: "create",
                  data: {
                    campaignId: "camp_demo",
                    title: "Bridge journal",
                    body: "Review me",
                  },
                },
              ],
            },
          },
        ],
      });
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("rejects raw actor and item rules patches from the plugin proposal bridge", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "unsafe-rules-patch-plugin",
        `
registerCommand("/probe", async (_input, context) => {
  await context.createProposal({
    title: "Unsafe actor patch",
    summary: "Attempt to bypass the typed rules transaction boundary",
    changes: [{ entity: "actor", action: "update", id: "act_valen", data: { data: { hp: { current: 999 } } } }]
  });
  return { body: "queued", visibility: "public" };
});
`,
        { permissions: ["ai.proposeChanges"] },
      );
      const registry = loadPluginRegistry({ pluginRoot });

      await expect(
        registry.executeChatCommandAsync("unsafe-rules-patch-plugin", {
          ...sandboxInput(),
          pluginId: "unsafe-rules-patch-plugin",
        }),
      ).rejects.toThrow(
        "may only rename actor records; rules-managed fields require a typed system transaction",
      );
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("dispatches declared events through a redacted envelope and collects bridge requests", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "event-bridge-plugin",
        `
onEvent("token.moved", async (event, context) => {
  if ("payload" in event) throw new Error("Event payload leaked");
  await context.postChatMessage({ body: "Token moved: " + event.targetId });
});
`,
        {
          commands: [],
          permissions: ["token.read", "chat.write"],
          eventSubscriptions: [
            {
              type: "token.moved",
              description: "Offer a reviewed chat response",
            },
          ],
        },
      );
      const registry = loadPluginRegistry({ pluginRoot });

      await expect(
        registry.executeEventAsync("event-bridge-plugin", {
          campaignId: "camp_demo",
          pluginId: "event-bridge-plugin",
          permissions: ["token.read", "chat.write"],
          event: {
            id: "evt_move",
            campaignId: "camp_demo",
            type: "token.moved",
            actorUserId: "usr_demo_gm",
            targetId: "tok_valen",
            timestamp: "2026-07-09T00:00:00.000Z",
          },
        }),
      ).resolves.toEqual({
        bridgeRequests: [
          {
            kind: "chat.post",
            requestId: "chat_1",
            input: { body: "Token moved: tok_valen", visibility: "public" },
          },
        ],
      });
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("rejects undeclared event handlers and malformed bridge messages", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "undeclared-event-plugin",
        `onEvent("scene.updated", () => {});`,
        {
          commands: [],
          permissions: ["token.read"],
          eventSubscriptions: [{ type: "token.moved" }],
        },
      );
      writePluginPackage(
        pluginRoot,
        "invalid-event-bridge-plugin",
        `onEvent("token.moved", (_event, context) => context.postChatMessage({ body: "Unsafe", visibility: "whisper" }));`,
        {
          commands: [],
          permissions: ["token.read", "chat.write"],
          eventSubscriptions: [{ type: "token.moved" }],
        },
      );
      const registry = loadPluginRegistry({ pluginRoot });
      const eventInput = {
        campaignId: "camp_demo",
        pluginId: "undeclared-event-plugin",
        permissions: ["token.read", "chat.write"] as const,
        event: {
          id: "evt_move",
          campaignId: "camp_demo",
          type: "token.moved" as const,
          targetId: "tok_valen",
          timestamp: "2026-07-09T00:00:00.000Z",
        },
      };

      await expect(
        registry.executeEventAsync("undeclared-event-plugin", {
          ...eventInput,
          permissions: [...eventInput.permissions],
        }),
      ).rejects.toThrow(
        "Event is not declared in plugin manifest: scene.updated",
      );
      await expect(
        registry.executeEventAsync("invalid-event-bridge-plugin", {
          ...eventInput,
          pluginId: "invalid-event-bridge-plugin",
          permissions: [...eventInput.permissions],
        }),
      ).rejects.toThrow("chat visibility must be public or gm_only");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("starts plugin workers with explicit heap, code, and stack limits", () => {
    expect(PLUGIN_COMMAND_WORKER_RESOURCE_LIMITS).toEqual({
      maxOldGenerationSizeMb: 32,
      maxYoungGenerationSizeMb: 8,
      codeRangeSizeMb: 8,
      stackSizeMb: 2,
    });
  });

  it("tracks multiple package versions and executes the requested installed version", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "versioned-plugin-1",
        `registerCommand("/version", () => ({ body: "Version 1", visibility: "public" }));`,
        {
          manifestId: "versioned-plugin",
          version: "1.0.0",
          command: "/version",
        },
      );
      writePluginPackage(
        pluginRoot,
        "versioned-plugin-2",
        `registerCommand("/version", () => ({ body: "Version 2", visibility: "public" }));`,
        {
          manifestId: "versioned-plugin",
          version: "2.0.0",
          command: "/version",
        },
      );

      const registry = loadPluginRegistry({ pluginRoot });
      const latest = registry.find("versioned-plugin");
      const older = registry.find("versioned-plugin", "1.0.0");

      expect(registry.errors).toEqual([]);
      expect(registry.list().map((plugin) => plugin.id)).toEqual([
        "versioned-plugin",
      ]);
      expect(latest).toEqual(
        expect.objectContaining({
          id: "versioned-plugin",
          version: "2.0.0",
          source: expect.objectContaining({ packageId: "versioned-plugin-2" }),
          distribution: {
            availableVersions: ["2.0.0", "1.0.0"],
            latestVersion: "2.0.0",
          },
        }),
      );
      expect(older).toEqual(
        expect.objectContaining({
          version: "1.0.0",
          source: expect.objectContaining({ packageId: "versioned-plugin-1" }),
        }),
      );
      expect(
        registry.executeChatCommand(
          "versioned-plugin",
          {
            ...sandboxInput(),
            pluginId: "versioned-plugin",
            command: "/version",
          },
          "1.0.0",
        ).body,
      ).toBe("Version 1");
      expect(
        registry.executeChatCommand(
          "versioned-plugin",
          {
            ...sandboxInput(),
            pluginId: "versioned-plugin",
            command: "/version",
          },
          "2.0.0",
        ).body,
      ).toBe("Version 2");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("ranks a stable release ahead of its prerelease builds", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "prerelease-plugin-stable",
        `registerCommand("/version", () => ({ body: "Stable", visibility: "public" }));`,
        {
          manifestId: "prerelease-plugin",
          version: "1.0.0",
          command: "/version",
        },
      );
      writePluginPackage(
        pluginRoot,
        "prerelease-plugin-beta",
        `registerCommand("/version", () => ({ body: "Beta", visibility: "public" }));`,
        {
          manifestId: "prerelease-plugin",
          version: "1.0.0-beta.2",
          command: "/version",
        },
      );

      const registry = loadPluginRegistry({ pluginRoot });
      const latest = registry.find("prerelease-plugin");

      expect(registry.errors).toEqual([]);
      expect(latest).toEqual(
        expect.objectContaining({
          version: "1.0.0",
          source: expect.objectContaining({
            packageId: "prerelease-plugin-stable",
          }),
          distribution: {
            availableVersions: ["1.0.0", "1.0.0-beta.2"],
            latestVersion: "1.0.0",
          },
        }),
      );
      expect(
        registry.executeChatCommand("prerelease-plugin", {
          ...sandboxInput(),
          pluginId: "prerelease-plugin",
          command: "/version",
        }).body,
      ).toBe("Stable");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("loads versions with SemVer build metadata", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "build-metadata-plugin",
        `registerCommand("/version", () => ({ body: "Build 7", visibility: "public" }));`,
        {
          version: "1.0.0+build.7",
          command: "/version",
        },
      );
      const registry = loadPluginRegistry({ pluginRoot });
      expect(registry.errors).toEqual([]);
      expect(registry.find("build-metadata-plugin")?.version).toBe(
        "1.0.0+build.7",
      );
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("reports plugin trust status and verifies signed packages under trusted-only policy", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "unsigned-plugin",
        `registerCommand("/probe", () => ({ body: "Unsigned", visibility: "public" }));`,
      );
      writePluginPackage(
        pluginRoot,
        "signed-plugin",
        `registerCommand("/probe", () => ({ body: "Signed", visibility: "public" }));`,
      );
      writePluginSignature(
        pluginRoot,
        "signed-plugin",
        "trusted-local",
        "shared-secret",
      );

      const registry = loadPluginRegistry({
        pluginRoot,
        trustPolicy: {
          policy: "require_trusted",
          keys: { "trusted-local": "shared-secret" },
        },
      });

      expect(registry.errors).toEqual([]);
      expect(registry.find("signed-plugin")).toEqual(
        expect.objectContaining({
          trust: expect.objectContaining({
            status: "trusted",
            required: true,
            installable: true,
            errors: [],
            signature: expect.objectContaining({
              keyId: "trusted-local",
              algorithm: "hmac-sha256",
              verified: true,
            }),
          }),
        }),
      );
      expect(registry.find("unsigned-plugin")).toEqual(
        expect.objectContaining({
          trust: expect.objectContaining({
            status: "unsigned",
            required: true,
            installable: false,
            errors: [
              "Plugin package is unsigned and the current trust policy requires a verified signature",
            ],
          }),
        }),
      );
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("marks tampered plugin signatures as untrusted", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "tampered-plugin",
        `registerCommand("/probe", () => ({ body: "Tampered", visibility: "public" }));`,
      );
      writePluginSignature(
        pluginRoot,
        "tampered-plugin",
        "trusted-local",
        "shared-secret",
      );
      writeFileSync(
        resolve(pluginRoot, "tampered-plugin", "server.js"),
        `registerCommand("/probe", () => ({ body: "Changed after signing", visibility: "public" }));`,
      );

      const registry = loadPluginRegistry({
        pluginRoot,
        trustPolicy: {
          policy: "require_trusted",
          keys: { "trusted-local": "shared-secret" },
        },
      });

      expect(registry.find("tampered-plugin")).toEqual(
        expect.objectContaining({
          trust: expect.objectContaining({
            status: "untrusted",
            required: true,
            installable: false,
            errors: ["Plugin signature does not match package contents"],
            signature: expect.objectContaining({
              keyId: "trusted-local",
              algorithm: "hmac-sha256",
              verified: false,
            }),
          }),
        }),
      );
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("allows truly unsigned packages by policy but always blocks an invalid present signature", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "unsigned-plugin",
        `registerCommand("/probe", () => ({ body: "Unsigned", visibility: "public" }));`,
      );
      writePluginPackage(
        pluginRoot,
        "tampered-plugin",
        `registerCommand("/probe", () => ({ body: "Signed", visibility: "public" }));`,
      );
      writePluginSignature(
        pluginRoot,
        "tampered-plugin",
        "trusted-local",
        "shared-secret",
      );
      writeFileSync(
        resolve(pluginRoot, "tampered-plugin", "server.js"),
        `registerCommand("/probe", () => ({ body: "Changed after signing", visibility: "public" }));`,
      );

      const registry = loadPluginRegistry({
        pluginRoot,
        trustPolicy: {
          policy: "allow_unsigned",
          keys: { "trusted-local": "shared-secret" },
        },
      });

      expect(registry.find("unsigned-plugin")?.trust).toEqual(
        expect.objectContaining({ status: "unsigned", installable: true }),
      );
      expect(registry.find("tampered-plugin")?.trust).toEqual(
        expect.objectContaining({
          status: "untrusted",
          installable: false,
          errors: ["Plugin signature does not match package contents"],
        }),
      );
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
          chatCommands: [{ command: "/bad", description: "Bad command" }],
        }),
      );
      writeFileSync(
        join(pluginRoot, "escape.js"),
        "registerCommand('/bad', () => ({ body: 'bad' }));",
      );

      const registry = loadPluginRegistry({ pluginRoot });

      expect(registry.list()).toEqual([]);
      expect(registry.errors).toHaveLength(1);
      expect(registry.errors.at(0)!.errors).toContain(
        "Server entrypoint must be a safe package-relative path",
      );
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("isolates malformed nested manifests without aborting registry startup", () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      writePluginPackage(
        pluginRoot,
        "healthy-plugin",
        `registerCommand("/probe", () => ({ body: "healthy", visibility: "public" }));`,
      );
      const malformedPath = resolve(pluginRoot, "malformed-plugin");
      mkdirSync(malformedPath);
      writeFileSync(
        join(malformedPath, "plugin.manifest.json"),
        JSON.stringify({
          id: "malformed-plugin",
          name: "Malformed Plugin",
          version: "1.0.0",
          compatibleCore: ">=0.3.0",
          entrypoints: { server: "./server.js" },
          permissions: [],
          chatCommands: [null],
        }),
      );
      const registry = loadPluginRegistry({ pluginRoot });
      expect(registry.find("healthy-plugin")).toBeDefined();
      expect(registry.find("malformed-plugin")).toBeUndefined();
      expect(registry.errors).toEqual([
        expect.objectContaining({
          packagePath: malformedPath,
          errors: ["Plugin chat command 1 must be an object"],
        }),
      ]);
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("rejects remote registry packages that collide on manifest id and version", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    writePluginPackage(
      pluginRoot,
      "trusted-package",
      `registerCommand("/probe", () => ({ body: "Trusted macro", visibility: "public" }));`,
      {
        manifestId: "shared-plugin",
        version: "1.0.0",
      },
    );
    const packageText = JSON.stringify({
      files: {
        "plugin.manifest.json": JSON.stringify({
          id: "shared-plugin",
          name: "Shared Plugin",
          version: "1.0.0",
          compatibleCore: ">=0.1.0",
          entrypoints: { server: "./server.js" },
          runtime: { apiVersion: "0.1", sandbox: "vm" },
          permissions: ["chat.write"],
          chatCommands: [
            { command: "/probe", description: "Probe collision behavior" },
          ],
        }),
        "server.js":
          "registerCommand('/probe', () => ({ body: 'Colliding macro', visibility: 'public' }));",
      },
    });
    const packageChecksum = sha256(Buffer.from(packageText, "utf8"));
    const server = createServer((request, response) => {
      if (request.url === "/catalog.json") {
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            plugins: [
              {
                packageId: "registry-package",
                packageUrl: "/registry-package.json",
                checksum: packageChecksum,
              },
            ],
          }),
        );
        return;
      }
      if (request.url === "/registry-package.json") {
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(packageText);
        return;
      }
      response
        .writeHead(404, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "not_found" }));
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    try {
      const registry = loadPluginRegistry({
        pluginRoot,
        network: { allowPrivateNetwork: true },
      });
      const registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog.json`;
      const result = await registry.syncRemoteRegistry(registryUrl);

      expect(result.imported).toEqual([]);
      expect(result.errors).toEqual([
        {
          packagePath: "registry-package",
          errors: [
            "Plugin shared-plugin@1.0.0 is already provided by package trusted-package",
          ],
        },
      ]);
      expect(registry.find("shared-plugin", "1.0.0")?.source.packageId).toBe(
        "trusted-package",
      );
      expect(
        registry.executeChatCommand(
          "shared-plugin",
          { ...sandboxInput(), pluginId: "shared-plugin" },
          "1.0.0",
        ).body,
      ).toBe("Trusted macro");
      expect(existsSync(join(pluginRoot, "registry-package"))).toBe(false);
      const reloaded = loadPluginRegistry({ pluginRoot });
      expect(reloaded.find("shared-plugin", "1.0.0")?.source.packageId).toBe(
        "trusted-package",
      );
      expect(
        reloaded.find("shared-plugin", "1.0.0")?.source.packageId,
      ).not.toBe("registry-package");
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("does not let remote registry sync overwrite a local plugin package", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    writePluginPackage(
      pluginRoot,
      "shared-package",
      `registerCommand("/probe", () => ({ body: "Local macro", visibility: "public" }));`,
    );
    const packageText = JSON.stringify({
      files: {
        "plugin.manifest.json": JSON.stringify({
          id: "remote-overwrite",
          name: "Remote Overwrite",
          version: "1.0.0",
          compatibleCore: ">=0.1.0",
          entrypoints: { server: "./server.js" },
          runtime: { apiVersion: "0.1", sandbox: "vm" },
          permissions: ["chat.write"],
          chatCommands: [
            { command: "/probe", description: "Probe overwrite behavior" },
          ],
        }),
        "server.js":
          "registerCommand('/probe', () => ({ body: 'Remote macro', visibility: 'public' }));",
      },
    });
    const packageChecksum = sha256(Buffer.from(packageText, "utf8"));
    const server = createServer((request, response) => {
      if (request.url === "/catalog.json") {
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            plugins: [
              {
                packageId: "shared-package",
                packageUrl: "/shared-package.json",
                checksum: packageChecksum,
              },
            ],
          }),
        );
        return;
      }
      if (request.url === "/shared-package.json") {
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(packageText);
        return;
      }
      response
        .writeHead(404, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "not_found" }));
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    try {
      const registry = loadPluginRegistry({
        pluginRoot,
        network: { allowPrivateNetwork: true },
      });
      const registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog.json`;
      const result = await registry.syncRemoteRegistry(registryUrl);

      expect(result.imported).toEqual([]);
      expect(result.errors).toEqual([
        {
          packagePath: "shared-package",
          errors: ["Plugin package already exists without registry provenance"],
        },
      ]);
      expect(
        registry.executeChatCommand("shared-package", sandboxInput()).body,
      ).toBe("Local macro");
      expect(
        readFileSync(
          resolve(pluginRoot, "shared-package", "server.js"),
          "utf8",
        ),
      ).toContain("Local macro");
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("blocks private DNS results, redirect targets, and package URL pivots", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      const privateDnsFetch = vi.fn(
        async () => new Response(JSON.stringify({ plugins: [] })),
      );
      const privateDnsRegistry = loadPluginRegistry({
        pluginRoot,
        network: {
          fetch: privateDnsFetch as typeof fetch,
          resolveHostname: async () => ["169.254.169.254"],
        },
      });
      await expect(
        privateDnsRegistry.syncRemoteRegistry(
          "https://registry.example.com/catalog.json",
        ),
      ).rejects.toThrow("public network address");
      expect(privateDnsFetch).not.toHaveBeenCalled();

      const redirectFetch = vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/internal/catalog.json" },
          }),
      );
      const redirectRegistry = loadPluginRegistry({
        pluginRoot,
        network: {
          fetch: redirectFetch as typeof fetch,
          resolveHostname: async () => ["93.184.216.34"],
        },
      });
      await expect(
        redirectRegistry.syncRemoteRegistry(
          "https://registry.example.com/catalog.json",
        ),
      ).rejects.toThrow("public network address");
      expect(redirectFetch).toHaveBeenCalledTimes(1);

      const packagePivotFetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              plugins: [
                {
                  packageId: "metadata-probe",
                  packageUrl: "http://169.254.169.254/latest/meta-data/",
                },
              ],
            }),
            { status: 200 },
          ),
      );
      const packagePivotRegistry = loadPluginRegistry({
        pluginRoot,
        network: {
          fetch: packagePivotFetch as typeof fetch,
          resolveHostname: async () => ["93.184.216.34"],
        },
      });
      const packagePivotResult = await packagePivotRegistry.syncRemoteRegistry(
        "https://registry.example.com/catalog.json",
      );
      expect(packagePivotResult.imported).toEqual([]);
      expect(packagePivotResult.errors).toEqual([
        {
          packagePath: "metadata-probe",
          errors: ["Plugin registry URLs must target a public network address"],
        },
      ]);
      expect(packagePivotFetch).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("pins registry connections to the addresses that passed validation", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ plugins: [] }));
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    try {
      const resolveHostname = vi.fn(async () => ["127.0.0.1"]);
      const registry = loadPluginRegistry({
        pluginRoot,
        network: { allowPrivateNetwork: true, resolveHostname },
      });
      const registryUrl = `http://rebind.invalid:${(server.address() as AddressInfo).port}/catalog.json`;

      const result = await registry.syncRemoteRegistry(registryUrl);

      expect(result).toEqual({ registryUrl, imported: [], errors: [] });
      expect(resolveHostname).toHaveBeenCalledTimes(1);
      expect(resolveHostname).toHaveBeenCalledWith("rebind.invalid");
      expect(requestCount).toBe(1);
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("blocks encoded IPv4 and IPv6 forms that can reach private addresses", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ plugins: [] })),
      );
      const registry = loadPluginRegistry({
        pluginRoot,
        network: { fetch: fetchImpl as typeof fetch },
      });
      for (const registryUrl of [
        "http://0x7f000001/catalog.json",
        "http://2130706433/catalog.json",
        "http://[::ffff:127.0.0.1]/catalog.json",
        "http://[::7f00:1]/catalog.json",
        "http://[::ffff:0:7f00:1]/catalog.json",
        "http://[64:ff9b:1::7f00:1]/catalog.json",
        "http://[2002:7f00:1::]/catalog.json",
      ]) {
        await expect(registry.syncRemoteRegistry(registryUrl)).rejects.toThrow(
          "public network address",
        );
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("bounds registry response bodies even without a content-length header", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    try {
      const oversizedFetch = vi.fn(
        async () => new Response("x".repeat(1024 * 1024 + 1), { status: 200 }),
      );
      const registry = loadPluginRegistry({
        pluginRoot,
        network: {
          fetch: oversizedFetch as typeof fetch,
          resolveHostname: async () => ["93.184.216.34"],
        },
      });
      await expect(
        registry.syncRemoteRegistry(
          "https://registry.example.com/catalog.json",
        ),
      ).rejects.toThrow("Plugin registry response exceeds 1048576 bytes");
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("bounds response bodies on the pinned production transport", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-runtime-"));
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
      });
      response.end("x".repeat(1024 * 1024 + 1));
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    try {
      const registry = loadPluginRegistry({
        pluginRoot,
        network: {
          allowPrivateNetwork: true,
          resolveHostname: async () => ["127.0.0.1"],
        },
      });
      const registryUrl = `http://bounded.invalid:${(server.address() as AddressInfo).port}/catalog.json`;
      await expect(registry.syncRemoteRegistry(registryUrl)).rejects.toThrow(
        "Plugin registry response exceeds 1048576 bytes",
      );
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });
});

function writePluginPackage(
  pluginRoot: string,
  packageId: string,
  serverSource: string,
  options: {
    manifestId?: string;
    version?: string;
    command?: string;
    commands?: Array<{ command: string; description: string }>;
    permissions?: string[];
    eventSubscriptions?: Array<{ type: string; description?: string }>;
    runtimeApiVersion?: string;
  } = {},
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
      runtime: {
        apiVersion: options.runtimeApiVersion ?? PLUGIN_RUNTIME_API_VERSION,
        sandbox: "vm",
      },
      permissions: options.permissions ?? ["chat.write"],
      chatCommands: options.commands ?? [
        { command, description: "Probe sandbox behavior" },
      ],
      eventSubscriptions: options.eventSubscriptions,
    }),
  );
  writeFileSync(join(packagePath, "server.js"), serverSource);
}

function writePluginSignature(
  pluginRoot: string,
  packageId: string,
  keyId: string,
  secret: string,
): void {
  const packagePath = resolve(pluginRoot, packageId);
  const manifestPath = join(packagePath, "plugin.manifest.json");
  const serverPath = join(packagePath, "server.js");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    id: string;
    version: string;
  };
  const manifestChecksum = sha256(readFileSync(manifestPath));
  const sourceChecksum = sha256(readFileSync(serverPath));
  writeFileSync(
    join(packagePath, "plugin.signature.json"),
    JSON.stringify({
      keyId,
      algorithm: "hmac-sha256",
      signature: pluginSignatureForPackage(
        manifest,
        manifestChecksum,
        sourceChecksum,
        secret,
      ),
    }),
  );
}

function sha256(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function sandboxInput(): PluginChatCommandInput {
  return {
    campaignId: "camp_demo",
    pluginId: "sandbox-probe",
    userId: "usr_demo_gm",
    command: "/probe",
    args: "",
    permissions: ["chat.write"],
    tokens: [],
  };
}
