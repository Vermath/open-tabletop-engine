import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { Script, createContext, type Context } from "node:vm";
import type { PermissionName } from "@open-tabletop/core";
import { validatePluginManifest, type PluginManifest } from "@open-tabletop/plugin-sdk";

export interface LoadedPlugin extends PluginManifest {
  source: {
    type: "local";
    packageId: string;
    manifestPath: string;
    clientEntrypoint?: string;
    serverEntrypoint?: string;
    sandbox: "vm" | "manifest-only";
    checksum?: string;
  };
  distribution: {
    availableVersions: string[];
    latestVersion: string;
  };
  permissionReview: {
    requestedPermissions: PermissionName[];
    grantRequired: boolean;
  };
}

export interface PluginLoadError {
  packagePath: string;
  errors: string[];
}

export interface PluginCommandTokenContext {
  id: string;
  name: string;
  sceneId: string;
}

export interface PluginChatCommandInput {
  campaignId: string;
  pluginId: string;
  userId: string;
  command: string;
  args: string;
  permissions: PermissionName[];
  tokens: PluginCommandTokenContext[];
}

export interface PluginChatCommandResult {
  body: string;
  visibility: "public" | "gm_only";
}

interface RuntimePlugin extends LoadedPlugin {
  resolvedManifestPath: string;
  resolvedPackagePath: string;
  resolvedServerEntrypoint?: string;
}

interface PluginPackageResult {
  plugin?: RuntimePlugin;
  error?: PluginLoadError;
}

interface SandboxGlobals {
  registerCommand(command: string, handler: (input: PluginChatCommandInput) => unknown): void;
  __otteCommand?: string;
  __otteInput?: PluginChatCommandInput;
  __otteResult?: unknown;
  __otteHandlers: Record<string, (input: PluginChatCommandInput) => unknown>;
}

export class PluginPackageError extends Error {
  constructor(
    message: string,
    readonly loadErrors: string[]
  ) {
    super(message);
    this.name = "PluginPackageError";
  }
}

export class PluginRuntimeRegistry {
  readonly pluginRoot: string;
  readonly errors: PluginLoadError[] = [];
  private readonly plugins = new Map<string, RuntimePlugin[]>();
  private readonly runtimes = new Map<string, SandboxedPluginRuntime>();

  constructor(pluginRoot = defaultPluginRoot()) {
    this.pluginRoot = resolve(pluginRoot);
  }

  loadAll(): void {
    if (!existsSync(this.pluginRoot)) return;
    for (const entry of readdirSync(this.pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(resolve(this.pluginRoot, entry.name, "plugin.manifest.json"))) continue;
      const result = loadPluginPackage(this.pluginRoot, resolve(this.pluginRoot, entry.name));
      if (result.plugin) this.upsertPlugin(result.plugin);
      if (result.error) this.errors.push(result.error);
    }
  }

  list(): LoadedPlugin[] {
    return [...this.plugins.values()].map((versions) => publicPlugin(latestPluginVersion(versions), versions));
  }

  find(pluginId: string, version?: string): LoadedPlugin | undefined {
    const versions = this.plugins.get(pluginId);
    if (!versions?.length) return undefined;
    const plugin = version ? versions.find((item) => item.version === version) : latestPluginVersion(versions);
    return plugin ? publicPlugin(plugin, versions) : undefined;
  }

  registerPackage(packagePath: string): LoadedPlugin {
    const resolvedPackagePath = resolvePackageDirectory(this.pluginRoot, packagePath);
    const result = loadPluginPackage(this.pluginRoot, resolvedPackagePath);
    if (result.error) {
      throw new PluginPackageError(`Invalid plugin package: ${packagePath}`, result.error.errors);
    }
    const plugin = result.plugin!;
    this.upsertPlugin(plugin);
    this.runtimes.delete(runtimeKey(plugin.id, plugin.version));
    return publicPlugin(plugin, this.plugins.get(plugin.id) ?? [plugin]);
  }

  executeChatCommand(pluginId: string, input: PluginChatCommandInput, version?: string): PluginChatCommandResult {
    const versions = this.plugins.get(pluginId);
    const plugin = version ? versions?.find((item) => item.version === version) : versions ? latestPluginVersion(versions) : undefined;
    if (!plugin) throw new PluginPackageError("Plugin not found", ["Plugin not found"]);
    if (!plugin.resolvedServerEntrypoint) {
      return {
        body: `${plugin.name} ran ${input.command}.`,
        visibility: "public"
      };
    }
    const runtime = this.runtimeFor(plugin);
    return runtime.execute(input.command, input);
  }

  private upsertPlugin(plugin: RuntimePlugin): void {
    const versions = this.plugins.get(plugin.id) ?? [];
    const existingIndex = versions.findIndex((item) => item.version === plugin.version);
    if (existingIndex >= 0) versions[existingIndex] = plugin;
    else versions.push(plugin);
    versions.sort(comparePluginsByVersion);
    this.plugins.set(plugin.id, versions);
  }

  private runtimeFor(plugin: RuntimePlugin): SandboxedPluginRuntime {
    const key = runtimeKey(plugin.id, plugin.version);
    const existing = this.runtimes.get(key);
    if (existing) return existing;
    const runtime = new SandboxedPluginRuntime(plugin);
    this.runtimes.set(key, runtime);
    return runtime;
  }
}

export function loadPluginRegistry(options: { pluginRoot?: string } = {}): PluginRuntimeRegistry {
  const registry = new PluginRuntimeRegistry(options.pluginRoot);
  registry.loadAll();
  return registry;
}

function loadPluginPackage(pluginRoot: string, packagePath: string): PluginPackageResult {
  const errors: string[] = [];
  const resolvedPackagePath = resolve(packagePath);
  const manifestPath = resolve(resolvedPackagePath, "plugin.manifest.json");
  if (!isPathInside(pluginRoot, resolvedPackagePath)) errors.push("Plugin package must be inside the configured plugin root");
  if (!existsSync(manifestPath)) errors.push("plugin.manifest.json is required");
  if (errors.length) return { error: { packagePath: resolvedPackagePath, errors } };

  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PluginManifest;
  } catch {
    return { error: { packagePath: resolvedPackagePath, errors: ["plugin.manifest.json must be valid JSON"] } };
  }

  errors.push(...validatePluginManifest(manifest));
  const clientEntrypoint = validateEntrypoint(pluginRoot, resolvedPackagePath, manifest.entrypoints?.client, "client", errors);
  const serverEntrypoint = validateEntrypoint(pluginRoot, resolvedPackagePath, manifest.entrypoints?.server, "server", errors);
  if (manifest.chatCommands?.length && !serverEntrypoint) errors.push("Plugins with chat commands require a server entrypoint");
  if (serverEntrypoint && !/\.(cjs|js|mjs)$/.test(serverEntrypoint)) errors.push("Server entrypoint must be a JavaScript file");
  if (errors.length) return { error: { packagePath: resolvedPackagePath, errors } };

  const source = serverEntrypoint ? readFileSync(serverEntrypoint) : undefined;
  const plugin: RuntimePlugin = {
    ...manifest,
    source: {
      type: "local",
      packageId: basename(resolvedPackagePath),
      manifestPath: normalizePublicPath(pluginRoot, manifestPath),
      clientEntrypoint: clientEntrypoint ? normalizePublicPath(pluginRoot, clientEntrypoint) : undefined,
      serverEntrypoint: serverEntrypoint ? normalizePublicPath(pluginRoot, serverEntrypoint) : undefined,
      sandbox: serverEntrypoint ? "vm" : "manifest-only",
      checksum: source ? `sha256:${createHash("sha256").update(source).digest("hex")}` : undefined
    },
    distribution: {
      availableVersions: [manifest.version],
      latestVersion: manifest.version
    },
    permissionReview: {
      requestedPermissions: [...manifest.permissions],
      grantRequired: manifest.permissions.length > 0
    },
    resolvedManifestPath: manifestPath,
    resolvedPackagePath,
    resolvedServerEntrypoint: serverEntrypoint
  };
  return { plugin };
}

class SandboxedPluginRuntime {
  private readonly context: Context;
  private readonly sandbox: SandboxGlobals;

  constructor(private readonly plugin: RuntimePlugin) {
    const declaredCommands = new Set(plugin.chatCommands?.map((item) => item.command) ?? []);
    const handlers: SandboxGlobals["__otteHandlers"] = Object.create(null);
    this.sandbox = {
      __otteHandlers: handlers,
      registerCommand(command, handler) {
        if (!declaredCommands.has(command)) throw new Error(`Command is not declared in plugin manifest: ${command}`);
        if (typeof handler !== "function") throw new Error(`Plugin command handler must be a function: ${command}`);
        handlers[command] = handler;
      }
    };
    this.context = createContext(this.sandbox, {
      name: `plugin:${plugin.id}`,
      codeGeneration: { strings: false, wasm: false }
    });
    const source = readFileSync(plugin.resolvedServerEntrypoint!, "utf8");
    new Script(source, { filename: plugin.resolvedServerEntrypoint }).runInContext(this.context, { timeout: 100 });
    const missingCommands = [...declaredCommands].filter((command) => !handlers[command]);
    if (missingCommands.length) throw new Error(`Plugin did not register command handlers: ${missingCommands.join(", ")}`);
  }

  execute(command: string, input: PluginChatCommandInput): PluginChatCommandResult {
    if (!this.sandbox.__otteHandlers[command]) throw new Error(`Plugin command handler is not registered: ${command}`);
    this.sandbox.__otteCommand = command;
    this.sandbox.__otteInput = input;
    this.sandbox.__otteResult = undefined;
    try {
      new Script("__otteResult = __otteHandlers[__otteCommand](__otteInput);").runInContext(this.context, { timeout: 100 });
      return normalizeCommandResult(this.sandbox.__otteResult);
    } finally {
      this.sandbox.__otteCommand = undefined;
      this.sandbox.__otteInput = undefined;
      this.sandbox.__otteResult = undefined;
    }
  }
}

function normalizeCommandResult(result: unknown): PluginChatCommandResult {
  if (!isRecord(result)) throw new Error("Plugin command must return an object");
  if ("then" in result) throw new Error("Async plugin command handlers are not supported in the VM sandbox");
  const body = typeof result.body === "string" ? result.body.trim() : "";
  if (!body) throw new Error("Plugin command must return a non-empty body");
  const visibility = result.visibility === "gm_only" ? "gm_only" : "public";
  return { body: body.slice(0, 2000), visibility };
}

function validateEntrypoint(pluginRoot: string, packagePath: string, entrypoint: string | undefined, label: string, errors: string[]): string | undefined {
  if (!entrypoint) return undefined;
  if (isAbsolute(entrypoint)) {
    errors.push(`${label} entrypoint must be relative`);
    return undefined;
  }
  const resolved = resolve(packagePath, entrypoint);
  if (!isPathInside(packagePath, resolved) || !isPathInside(pluginRoot, resolved)) {
    errors.push(`${label} entrypoint must stay inside the plugin package`);
    return undefined;
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile()) errors.push(`${label} entrypoint file does not exist`);
  return resolved;
}

function resolvePackageDirectory(pluginRoot: string, packagePath: string): string {
  const resolved = resolve(pluginRoot, packagePath);
  if (!isPathInside(pluginRoot, resolved)) throw new PluginPackageError(`Invalid plugin package path: ${packagePath}`, ["Plugin package must stay inside the configured plugin root"]);
  return resolved;
}

function defaultPluginRoot(): string {
  return process.env.OTTE_PLUGIN_DIR ? resolve(process.env.OTTE_PLUGIN_DIR) : resolve(findWorkspaceRoot(), "plugins");
}

function findWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml")) && existsSync(resolve(current, "plugins"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) return resolve(start);
    current = parent;
  }
}

function normalizePublicPath(root: string, path: string): string {
  return relative(root, path).replace(/\\/g, "/");
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function publicPlugin(plugin: RuntimePlugin, versions: RuntimePlugin[]): LoadedPlugin {
  const availableVersions = versions.map((item) => item.version).sort(compareSemverDescending);
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    compatibleCore: plugin.compatibleCore,
    package: plugin.package,
    entrypoints: plugin.entrypoints,
    runtime: plugin.runtime,
    permissions: [...plugin.permissions],
    ui: plugin.ui,
    chatCommands: plugin.chatCommands,
    source: { ...plugin.source },
    distribution: {
      availableVersions,
      latestVersion: availableVersions[0] ?? plugin.version
    },
    permissionReview: {
      requestedPermissions: [...plugin.permissionReview.requestedPermissions],
      grantRequired: plugin.permissionReview.grantRequired
    }
  };
}

function latestPluginVersion(versions: RuntimePlugin[]): RuntimePlugin {
  return versions[0]!;
}

function comparePluginsByVersion(left: RuntimePlugin, right: RuntimePlugin): number {
  return compareSemverDescending(left.version, right.version);
}

function compareSemverDescending(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index++) {
    const diff = rightParts[index]! - leftParts[index]!;
    if (diff !== 0) return diff;
  }
  return right.localeCompare(left);
}

function semverParts(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version.split(".", 3);
  return [Number.parseInt(major, 10) || 0, Number.parseInt(minor, 10) || 0, Number.parseInt(patch, 10) || 0];
}

function runtimeKey(pluginId: string, version: string): string {
  return `${pluginId}@${version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
