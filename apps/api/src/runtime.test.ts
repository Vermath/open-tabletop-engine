import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { startLocalCodexAppServer, stopLocalCodexAppServers, type CodexAppServerStartDependencies } from "@open-tabletop/codex-app-server-provider";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerApiRuntimeShutdown, seedBundledPluginPackages, startApiRuntime } from "./runtime.js";

describe("api runtime entrypoint", () => {
  it("starts on an ephemeral local port and answers health checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-api-runtime-"));
    const bundledPluginRoot = join(root, "bundled-plugins");
    const pluginRoot = join(root, "plugins");
    writePluginPackage(bundledPluginRoot, "bundled-probe", "bundled-probe", "Bundled probe");
    const runtime = await startApiRuntime({
      host: "127.0.0.1",
      port: 0,
      sqlitePath: join(root, "data", "opentabletop.sqlite"),
      uploadDir: join(root, "uploads"),
      pluginRoot,
      bundledPluginRoot
    });

    try {
      expect(runtime.port).toBeGreaterThan(0);
      const response = await fetch(`${runtime.url}/api/v1/health`);
      expect(response.status).toBe(200);
      expect(existsSync(join(pluginRoot, "bundled-probe", "plugin.manifest.json"))).toBe(true);
      const catalog = await runtime.app.inject({ method: "GET", url: "/api/v1/plugins", headers: { "x-user-id": "usr_demo_gm" } });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "bundled-probe" })]));
    } finally {
      await runtime.close();
    }
  });

  it("never overwrites an existing persisted plugin package", () => {
    const root = mkdtempSync(join(tmpdir(), "otte-api-plugin-seed-"));
    const bundledPluginRoot = join(root, "bundled-plugins");
    const pluginRoot = join(root, "plugins");
    try {
      writePluginPackage(bundledPluginRoot, "shared-package", "shared-plugin", "Bundled implementation");
      writePluginPackage(pluginRoot, "shared-package", "shared-plugin", "Persisted implementation");
      writePluginPackage(bundledPluginRoot, "new-package", "new-plugin", "New bundled implementation");
      mkdirSync(join(bundledPluginRoot, "system-only"), { recursive: true });
      writeFileSync(join(bundledPluginRoot, "system-only", "system.manifest.json"), "{}");

      expect(seedBundledPluginPackages(bundledPluginRoot, pluginRoot)).toEqual(["new-package"]);
      expect(readFileSync(join(pluginRoot, "shared-package", "server.js"), "utf8")).toContain("Persisted implementation");
      expect(readFileSync(join(pluginRoot, "new-package", "server.js"), "utf8")).toContain("New bundled implementation");
      expect(existsSync(join(pluginRoot, "system-only"))).toBe(false);
      expect(seedBundledPluginPackages(bundledPluginRoot, pluginRoot)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("drains the runtime once when Railway sends termination signals", async () => {
    const signals = new EventEmitter();
    const close = vi.fn(async () => undefined);
    const shutdown = registerApiRuntimeShutdown(
      { close },
      { signalSource: signals }
    );

    signals.emit("SIGTERM");
    signals.emit("SIGINT");
    await shutdown.shutdown();

    expect(close).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("reports shutdown failures without leaving signal handlers registered", async () => {
    const signals = new EventEmitter();
    const failure = new Error("close failed");
    const onError = vi.fn();
    const shutdown = registerApiRuntimeShutdown(
      { close: vi.fn(async () => { throw failure; }) },
      { signalSource: signals, onError }
    );

    await shutdown.shutdown("SIGTERM");

    expect(onError).toHaveBeenCalledWith(failure, "SIGTERM");
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("stops a managed Codex app-server child when the API runtime closes", async () => {
    const previousProvider = process.env.OTTE_AI_PROVIDER;
    const root = mkdtempSync(join(tmpdir(), "otte-api-runtime-codex-close-"));
    const child = new FakeManagedCodexChild();
    let spawned = false;
    let runtime: Awaited<ReturnType<typeof startApiRuntime>> | undefined;
    try {
      await startLocalCodexAppServer(
        { url: "ws://127.0.0.1:45991", command: "C:\\fake\\codex.exe", timeoutMs: 100 },
        {
          fetch: async () => new Response(null, { status: spawned ? 200 : 503 }),
          spawn: (() => {
            spawned = true;
            return child;
          }) as unknown as CodexAppServerStartDependencies["spawn"]
        }
      );
      process.env.OTTE_AI_PROVIDER = "disabled";
      runtime = await startApiRuntime({
        host: "127.0.0.1",
        port: 0,
        sqlitePath: join(root, "opentabletop.sqlite"),
        uploadDir: join(root, "uploads")
      });

      await runtime.close();

      expect(child.killed).toBe(true);
    } finally {
      await runtime?.close();
      await stopLocalCodexAppServers({ timeoutMs: 20, forceKillTimeoutMs: 20 });
      if (previousProvider === undefined) delete process.env.OTTE_AI_PROVIDER;
      else process.env.OTTE_AI_PROVIDER = previousProvider;
    }
  });
});

class FakeManagedCodexChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  readonly stdout = undefined;
  readonly stderr = undefined;

  kill(_signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.exitCode = 0;
    this.emit("exit", 0, null);
    return true;
  }
}

function writePluginPackage(root: string, packageId: string, pluginId: string, responseBody: string): void {
  const packagePath = join(root, packageId);
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(join(packagePath, "plugin.manifest.json"), JSON.stringify({
    id: pluginId,
    name: pluginId,
    version: "1.0.0",
    compatibleCore: ">=0.1.0",
    entrypoints: { server: "./server.js" },
    runtime: { apiVersion: "0.1", sandbox: "vm" },
    permissions: ["chat.write"],
    chatCommands: [{ command: `/${pluginId}`, description: "Runtime seed probe" }]
  }));
  writeFileSync(join(packagePath, "server.js"), `registerCommand("/${pluginId}", () => ({ body: ${JSON.stringify(responseBody)}, visibility: "public" }));`);
}
