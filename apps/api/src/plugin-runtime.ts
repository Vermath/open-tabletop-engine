import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { Script, createContext, type Context } from "node:vm";
import { Worker } from "node:worker_threads";
import type { PermissionName } from "@open-tabletop/core";
import { validatePluginManifest, type PluginManifest } from "@open-tabletop/plugin-sdk";

const PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS = 1000;
const PLUGIN_COMMAND_WORKER_TIMEOUT_GRACE_MS = 100;

export interface LoadedPlugin extends PluginManifest {
  source: {
    type: "local" | "registry";
    packageId: string;
    manifestPath: string;
    manifestChecksum: string;
    clientEntrypoint?: string;
    serverEntrypoint?: string;
    sandbox: "vm" | "manifest-only";
    checksum?: string;
    registryUrl?: string;
    packageUrl?: string;
    packageChecksum?: string;
    syncedAt?: string;
  };
  distribution: {
    availableVersions: string[];
    latestVersion: string;
  };
  permissionReview: {
    requestedPermissions: PermissionName[];
    grantRequired: boolean;
  };
  trust: PluginTrustInfo;
}

export type PluginTrustPolicy = "allow_unsigned" | "require_trusted";
export type PluginTrustStatus = "trusted" | "unsigned" | "untrusted";

export interface PluginTrustInfo {
  status: PluginTrustStatus;
  policy: PluginTrustPolicy;
  required: boolean;
  installable: boolean;
  errors: string[];
  signature?: {
    keyId?: string;
    algorithm?: string;
    verified: boolean;
    signaturePath?: string;
  };
}

export interface PluginTrustPolicyConfig {
  policy: PluginTrustPolicy;
  keys?: Record<string, string>;
}

export interface PluginLoadError {
  packagePath: string;
  errors: string[];
}

export interface PluginInventoryWarning {
  code: "duplicate_plugin_package_version";
  pluginId: string;
  name: string;
  version: string;
  packageIds: string[];
  sourceTypes: Array<LoadedPlugin["source"]["type"]>;
  registryUrls: string[];
}

export interface PluginRegistrySyncResult {
  registryUrl: string;
  imported: LoadedPlugin[];
  errors: PluginLoadError[];
}

export interface PluginCommandTokenContext {
  id: string;
  name: string;
  sceneId: string;
}

export interface PluginCommandStorageEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface PluginChatCommandInput {
  campaignId: string;
  pluginId: string;
  userId: string;
  command: string;
  args: string;
  permissions: PermissionName[];
  tokens: PluginCommandTokenContext[];
  storage?: {
    entries: PluginCommandStorageEntry[];
  };
}

export interface PluginChatCommandStorageMutation {
  set?: Record<string, unknown>;
  delete?: string[];
}

export interface PluginChatCommandResult {
  body: string;
  visibility: "public" | "gm_only";
  storage?: PluginChatCommandStorageMutation;
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

interface PluginSignatureFile {
  keyId?: string;
  algorithm?: string;
  signature?: string;
}

interface PluginRegistryEntry {
  packageId: string;
  packageUrl: string;
  checksum?: string;
}

interface PluginRegistryPackageMetadata {
  registryUrl?: string;
  packageUrl?: string;
  packageChecksum?: string;
  syncedAt?: string;
}

interface SandboxGlobals {
  __ottePayloadJson?: string;
  __otteResult?: unknown;
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
  readonly trustPolicy: PluginTrustPolicyConfig;
  readonly errors: PluginLoadError[] = [];
  readonly inventoryWarnings: PluginInventoryWarning[] = [];
  private readonly plugins = new Map<string, RuntimePlugin[]>();
  private readonly runtimes = new Map<string, SandboxedPluginRuntime>();

  constructor(pluginRoot = defaultPluginRoot(), trustPolicy = pluginTrustPolicyFromEnv()) {
    this.pluginRoot = resolve(pluginRoot);
    this.trustPolicy = trustPolicy;
  }

  loadAll(): void {
    if (!existsSync(this.pluginRoot)) return;
    for (const entry of readdirSync(this.pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(resolve(this.pluginRoot, entry.name, "plugin.manifest.json"))) continue;
      const result = loadPluginPackage(this.pluginRoot, resolve(this.pluginRoot, entry.name), this.trustPolicy);
      if (result.plugin) this.upsertPlugin(result.plugin);
      if (result.error) this.errors.push(result.error);
    }
  }

  list(): LoadedPlugin[] {
    return [...this.plugins.values()].map((versions) => publicPlugin(latestPluginVersion(versions), versions));
  }

  listPackages(): LoadedPlugin[] {
    return [...this.plugins.values()].flatMap((versions) => versions.map((plugin) => publicPlugin(plugin, versions)));
  }

  find(pluginId: string, version?: string): LoadedPlugin | undefined {
    const versions = this.plugins.get(pluginId);
    if (!versions?.length) return undefined;
    const plugin = version ? versions.find((item) => item.version === version) : latestPluginVersion(versions);
    return plugin ? publicPlugin(plugin, versions) : undefined;
  }

  registerPackage(packagePath: string): LoadedPlugin {
    const resolvedPackagePath = resolvePackageDirectory(this.pluginRoot, packagePath);
    const result = loadPluginPackage(this.pluginRoot, resolvedPackagePath, this.trustPolicy);
    if (result.error) {
      throw new PluginPackageError(`Invalid plugin package: ${packagePath}`, result.error.errors);
    }
    const plugin = result.plugin!;
    this.upsertPlugin(plugin);
    this.runtimes.delete(runtimeKey(plugin.id, plugin.version));
    return publicPlugin(plugin, this.plugins.get(plugin.id) ?? [plugin]);
  }

  async syncRemoteRegistry(registryUrl: string): Promise<PluginRegistrySyncResult> {
    const resolvedRegistryUrl = normalizeHttpUrl(registryUrl, "Plugin registry URL");
    const catalog = normalizePluginRegistryCatalog(await fetchJson(resolvedRegistryUrl), resolvedRegistryUrl);
    const imported: LoadedPlugin[] = [];
    const errors: PluginLoadError[] = [];

    for (const entry of catalog) {
      try {
        imported.push(await this.importRegistryEntry(resolvedRegistryUrl, entry));
      } catch (error) {
        errors.push({
          packagePath: entry.packageId,
          errors: pluginErrorMessages(error)
        });
      }
    }

    return {
      registryUrl: resolvedRegistryUrl.toString(),
      imported,
      errors
    };
  }

  executeChatCommand(pluginId: string, input: PluginChatCommandInput, version?: string): PluginChatCommandResult {
    const plugin = this.runtimePlugin(pluginId, version);
    if (!plugin.resolvedServerEntrypoint) {
      return {
        body: `${plugin.name} ran ${input.command}.`,
        visibility: "public"
      };
    }
    const runtime = this.runtimeFor(plugin);
    return runtime.execute(input.command, input);
  }

  async executeChatCommandAsync(pluginId: string, input: PluginChatCommandInput, version?: string): Promise<PluginChatCommandResult> {
    const plugin = this.runtimePlugin(pluginId, version);
    if (!plugin.resolvedServerEntrypoint) {
      return {
        body: `${plugin.name} ran ${input.command}.`,
        visibility: "public"
      };
    }
    await yieldToEventLoop();
    return executeChatCommandInWorker(plugin, input.command, input);
  }

  private runtimePlugin(pluginId: string, version?: string): RuntimePlugin {
    const versions = this.plugins.get(pluginId);
    const plugin = version ? versions?.find((item) => item.version === version) : versions ? latestPluginVersion(versions) : undefined;
    if (!plugin) throw new PluginPackageError("Plugin not found", ["Plugin not found"]);
    return plugin;
  }

  private upsertPlugin(plugin: RuntimePlugin): void {
    const versions = this.plugins.get(plugin.id) ?? [];
    const existingIndex = versions.findIndex((item) => item.version === plugin.version);
    if (existingIndex >= 0) {
      const existing = versions[existingIndex];
      if (existing) this.recordDuplicatePackageVersion(existing, plugin);
      versions[existingIndex] = plugin;
    } else {
      versions.push(plugin);
    }
    versions.sort(comparePluginsByVersion);
    this.plugins.set(plugin.id, versions);
  }

  private recordDuplicatePackageVersion(existing: RuntimePlugin, incoming: RuntimePlugin): void {
    const existingIndex = this.inventoryWarnings.findIndex((warning) => warning.pluginId === incoming.id && warning.version === incoming.version);
    const existingWarning = existingIndex >= 0 ? this.inventoryWarnings[existingIndex] : undefined;
    const packageIds = [...new Set([...(existingWarning?.packageIds ?? [existing.source.packageId]), incoming.source.packageId])].sort((left, right) => left.localeCompare(right));
    const sourceTypes = [...new Set([...(existingWarning?.sourceTypes ?? [existing.source.type]), incoming.source.type])].sort((left, right) => left.localeCompare(right));
    const registryUrls = [
      ...new Set(
        [
          ...(existingWarning?.registryUrls ?? [existing.source.registryUrl]),
          incoming.source.registryUrl
        ].filter((registryUrl): registryUrl is string => typeof registryUrl === "string" && registryUrl.length > 0)
      )
    ].sort((left, right) => left.localeCompare(right));
    const warning: PluginInventoryWarning = {
      code: "duplicate_plugin_package_version",
      pluginId: incoming.id,
      name: incoming.name,
      version: incoming.version,
      packageIds,
      sourceTypes,
      registryUrls
    };
    if (existingWarning) this.inventoryWarnings[existingIndex] = warning;
    else this.inventoryWarnings.push(warning);
  }

  private async importRegistryEntry(registryUrl: URL, entry: PluginRegistryEntry): Promise<LoadedPlugin> {
    const packageId = validateRegistryPackageId(entry.packageId);
    const packageUrl = normalizeHttpUrl(entry.packageUrl, "Plugin package URL", registryUrl);
    const packageText = await fetchText(packageUrl);
    const packageChecksum = sha256(Buffer.from(packageText, "utf8"));
    if (entry.checksum && entry.checksum !== packageChecksum) throw new PluginPackageError(`Invalid plugin package checksum: ${packageId}`, [`Expected ${entry.checksum} but received ${packageChecksum}`]);
    const packageDocument = JSON.parse(stripBom(packageText)) as unknown;
    const files = normalizeRegistryPackageFiles(packageDocument);
    const metadata = {
      registryUrl: registryUrl.toString(),
      packageUrl: packageUrl.toString(),
      packageChecksum,
      syncedAt: new Date().toISOString()
    };
    const stagingPackageId = registryStagingPackageId(packageId);
    try {
      writeRegistryPackage(this.pluginRoot, stagingPackageId, files, metadata);
      this.ensureNoRegistryManifestCollision(stagingPackageId, packageId);
      commitStagedRegistryPackage(this.pluginRoot, stagingPackageId, packageId, metadata);
    } catch (error) {
      rmSync(resolvePackageDirectory(this.pluginRoot, stagingPackageId), { recursive: true, force: true });
      throw error;
    }
    return this.registerPackage(packageId);
  }

  private ensureNoRegistryManifestCollision(stagedPackageId: string, packageId: string): void {
    const loaded = loadPluginPackage(this.pluginRoot, resolvePackageDirectory(this.pluginRoot, stagedPackageId), this.trustPolicy);
    if (loaded.error || !loaded.plugin) throw new PluginPackageError(`Invalid plugin package: ${packageId}`, loaded.error?.errors ?? ["Plugin package is invalid"]);
    const versions = this.plugins.get(loaded.plugin.id) ?? [];
    const existing = versions.find((plugin) => plugin.version === loaded.plugin!.version);
    if (!existing) return;
    if (existing.source.packageId === packageId && existing.source.checksum === loaded.plugin.source.checksum) return;
    throw new PluginPackageError(`Refusing to import colliding plugin version: ${packageId}`, [
      `Plugin ${loaded.plugin.id}@${loaded.plugin.version} is already provided by package ${existing.source.packageId}`
    ]);
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

export function loadPluginRegistry(options: { pluginRoot?: string; trustPolicy?: PluginTrustPolicyConfig } = {}): PluginRuntimeRegistry {
  const registry = new PluginRuntimeRegistry(options.pluginRoot, normalizePluginTrustPolicy(options.trustPolicy ?? pluginTrustPolicyFromEnv()));
  registry.loadAll();
  return registry;
}

function loadPluginPackage(pluginRoot: string, packagePath: string, trustPolicy: PluginTrustPolicyConfig): PluginPackageResult {
  const errors: string[] = [];
  const resolvedPackagePath = resolve(packagePath);
  const manifestPath = resolve(resolvedPackagePath, "plugin.manifest.json");
  if (!isPathInside(pluginRoot, resolvedPackagePath)) errors.push("Plugin package must be inside the configured plugin root");
  if (!existsSync(manifestPath)) errors.push("plugin.manifest.json is required");
  if (errors.length) return { error: { packagePath: resolvedPackagePath, errors } };

  let manifest: PluginManifest;
  let manifestSource: string;
  try {
    manifestSource = readFileSync(manifestPath, "utf8");
    manifest = JSON.parse(stripBom(manifestSource)) as PluginManifest;
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
  const manifestChecksum = sha256(Buffer.from(manifestSource, "utf8"));
  const sourceChecksum = source ? sha256(source) : undefined;
  const registryMetadata = readPluginRegistryMetadata(pluginRoot, resolvedPackagePath);
  const trust = evaluatePluginTrust({
    pluginRoot,
    packagePath: resolvedPackagePath,
    manifest,
    manifestChecksum,
    sourceChecksum,
    trustPolicy
  });
  const plugin: RuntimePlugin = {
    ...manifest,
    source: {
      type: registryMetadata?.registryUrl ? "registry" : "local",
      packageId: basename(resolvedPackagePath),
      manifestPath: normalizePublicPath(pluginRoot, manifestPath),
      manifestChecksum,
      clientEntrypoint: clientEntrypoint ? normalizePublicPath(pluginRoot, clientEntrypoint) : undefined,
      serverEntrypoint: serverEntrypoint ? normalizePublicPath(pluginRoot, serverEntrypoint) : undefined,
      sandbox: serverEntrypoint ? "vm" : "manifest-only",
      checksum: sourceChecksum,
      ...registryMetadata
    },
    distribution: {
      availableVersions: [manifest.version],
      latestVersion: manifest.version
    },
    permissionReview: {
      requestedPermissions: [...manifest.permissions],
      grantRequired: manifest.permissions.length > 0
    },
    trust,
    resolvedManifestPath: manifestPath,
    resolvedPackagePath,
    resolvedServerEntrypoint: serverEntrypoint
  };
  return { plugin };
}

class SandboxedPluginRuntime {
  private static readonly executionTimeoutMs = PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS;
  private readonly context: Context;
  private readonly sandbox: SandboxGlobals;

  constructor(private readonly plugin: RuntimePlugin) {
    this.sandbox = {};
    this.context = createContext(this.sandbox, {
      name: `plugin:${plugin.id}`,
      codeGeneration: { strings: false, wasm: false }
    });
    this.sandbox.__ottePayloadJson = JSON.stringify({ declaredCommands: plugin.chatCommands?.map((item) => item.command) ?? [] });
    const source = readFileSync(plugin.resolvedServerEntrypoint!, "utf8");
    const bootstrap = `(() => {
      const __otteDeclaredCommands = new Set(JSON.parse(__ottePayloadJson).declaredCommands);
      const __otteHandlers = Object.create(null);
      globalThis.registerCommand = (command, handler) => {
        if (!__otteDeclaredCommands.has(command)) throw new Error(\`Command is not declared in plugin manifest: \${command}\`);
        if (typeof handler !== "function") throw new Error(\`Plugin command handler must be a function: \${command}\`);
        __otteHandlers[command] = handler;
      };
      globalThis.__otteDeclaredCommands = __otteDeclaredCommands;
      globalThis.__otteHandlers = __otteHandlers;
    })();`;
    const validate = `(() => {
      const __otteDeclaredCommandsRef = globalThis.__otteDeclaredCommands;
      const __otteHandlersRef = globalThis.__otteHandlers;
      const __otteMissingCommands = [...__otteDeclaredCommandsRef].filter((command) => !__otteHandlersRef[command]);
      if (__otteMissingCommands.length) throw new Error(\`Plugin did not register command handlers: \${__otteMissingCommands.join(", ")}\`);
      globalThis.__otteRunCommand = (command, input) => __otteHandlersRef[command](input);
      delete globalThis.registerCommand;
      delete globalThis.__otteDeclaredCommands;
      delete globalThis.__otteHandlers;
    })();`;
    try {
      new Script(bootstrap, { filename: plugin.resolvedServerEntrypoint }).runInContext(this.context, { timeout: SandboxedPluginRuntime.executionTimeoutMs });
      new Script(source, { filename: plugin.resolvedServerEntrypoint }).runInContext(this.context, { timeout: SandboxedPluginRuntime.executionTimeoutMs });
      new Script(validate, { filename: plugin.resolvedServerEntrypoint }).runInContext(this.context, { timeout: SandboxedPluginRuntime.executionTimeoutMs });
    } finally {
      this.sandbox.__ottePayloadJson = undefined;
    }
  }

  execute(command: string, input: PluginChatCommandInput): PluginChatCommandResult {
    this.sandbox.__ottePayloadJson = JSON.stringify({ command, input });
    this.sandbox.__otteResult = undefined;
    try {
      new Script('(() => { const __ottePayload = JSON.parse(__ottePayloadJson); if (typeof __otteRunCommand !== "function") throw new Error("Plugin runtime is not initialized"); __otteResult = __otteRunCommand(__ottePayload.command, __ottePayload.input); })();').runInContext(this.context, { timeout: SandboxedPluginRuntime.executionTimeoutMs });
      return normalizeCommandResult(this.sandbox.__otteResult);
    } finally {
      this.sandbox.__ottePayloadJson = undefined;
      this.sandbox.__otteResult = undefined;
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolveYield) => setImmediate(resolveYield));
}

function executeChatCommandInWorker(plugin: RuntimePlugin, command: string, input: PluginChatCommandInput): Promise<PluginChatCommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const worker = new Worker(pluginCommandWorkerSource(), {
      eval: true,
      workerData: {
        pluginId: plugin.id,
        filename: plugin.resolvedServerEntrypoint,
        declaredCommands: plugin.chatCommands?.map((item) => item.command) ?? [],
        command,
        input,
        timeoutMs: PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS
      }
    });
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      worker.removeAllListeners();
      void worker.terminate().catch(() => undefined);
      action();
    };

    watchdog = setTimeout(() => {
      finish(() => rejectCommand(new Error("Plugin command timed out")));
    }, PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS + PLUGIN_COMMAND_WORKER_TIMEOUT_GRACE_MS);

    worker.once("message", (message: unknown) => {
      finish(() => {
        if (!isRecord(message)) {
          rejectCommand(new Error("Plugin command failed"));
          return;
        }
        if (message.ok === true) {
          try {
            resolveCommand(normalizeCommandResult(message.result));
          } catch (error) {
            rejectCommand(error);
          }
          return;
        }
        rejectCommand(new Error(typeof message.message === "string" ? message.message : "Plugin command failed"));
      });
    });
    worker.once("error", (error) => finish(() => rejectCommand(error)));
    worker.once("exit", (code) => {
      if (code !== 0) finish(() => rejectCommand(new Error(`Plugin command worker exited with code ${code}`)));
    });
  });
}

function pluginCommandWorkerSource(): string {
  return `
const { readFileSync } = require("node:fs");
const { Script, createContext } = require("node:vm");
const { parentPort, workerData } = require("node:worker_threads");

function timeoutAwareMessage(error) {
  const message = error && typeof error.message === "string" ? error.message : "Plugin command failed";
  return message.includes("Script execution timed out") ? "Plugin command timed out" : message;
}

try {
  const sandbox = {};
  const context = createContext(sandbox, {
    name: "plugin:" + workerData.pluginId,
    codeGeneration: { strings: false, wasm: false }
  });
  const bootstrap = "(() => {" +
    "const __otteDeclaredCommands = new Set(JSON.parse(__ottePayloadJson).declaredCommands);" +
    "const __otteHandlers = Object.create(null);" +
    "globalThis.registerCommand = (command, handler) => {" +
    "if (!__otteDeclaredCommands.has(command)) throw new Error('Command is not declared in plugin manifest: ' + command);" +
    "if (typeof handler !== 'function') throw new Error('Plugin command handler must be a function: ' + command);" +
    "__otteHandlers[command] = handler;" +
    "};" +
    "globalThis.__otteDeclaredCommands = __otteDeclaredCommands;" +
    "globalThis.__otteHandlers = __otteHandlers;" +
    "})();";
  const validate = "(() => {" +
    "const __otteDeclaredCommandsRef = globalThis.__otteDeclaredCommands;" +
    "const __otteHandlersRef = globalThis.__otteHandlers;" +
    "const __otteMissingCommands = [...__otteDeclaredCommandsRef].filter((command) => !__otteHandlersRef[command]);" +
    "if (__otteMissingCommands.length) throw new Error('Plugin did not register command handlers: ' + __otteMissingCommands.join(', '));" +
    "globalThis.__otteRunCommand = (command, input) => __otteHandlersRef[command](input);" +
    "delete globalThis.registerCommand;" +
    "delete globalThis.__otteDeclaredCommands;" +
    "delete globalThis.__otteHandlers;" +
    "})();";
  sandbox.__ottePayloadJson = JSON.stringify({ declaredCommands: workerData.declaredCommands });
  new Script(bootstrap, { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  new Script(readFileSync(workerData.filename, "utf8"), { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  new Script(validate, { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  sandbox.__ottePayloadJson = JSON.stringify({ command: workerData.command, input: workerData.input });
  sandbox.__otteResult = undefined;
  new Script("(() => { const __ottePayload = JSON.parse(__ottePayloadJson); if (typeof __otteRunCommand !== 'function') throw new Error('Plugin runtime is not initialized'); __otteResult = __otteRunCommand(__ottePayload.command, __ottePayload.input); })();", { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  if (sandbox.__otteResult && typeof sandbox.__otteResult === "object" && "then" in sandbox.__otteResult) {
    throw new Error("Async plugin command handlers are not supported in the VM sandbox");
  }
  parentPort.postMessage({ ok: true, result: sandbox.__otteResult });
} catch (error) {
  parentPort.postMessage({ ok: false, message: timeoutAwareMessage(error) });
}
`;
}

function normalizeCommandResult(result: unknown): PluginChatCommandResult {
  if (!isRecord(result)) throw new Error("Plugin command must return an object");
  if ("then" in result) throw new Error("Async plugin command handlers are not supported in the VM sandbox");
  const body = typeof result.body === "string" ? result.body.trim() : "";
  if (!body) throw new Error("Plugin command must return a non-empty body");
  const visibility = result.visibility === "gm_only" ? "gm_only" : "public";
  const storage = normalizeCommandStorageMutation(result.storage);
  return { body: body.slice(0, 2000), visibility, ...(storage ? { storage } : {}) };
}

function normalizeCommandStorageMutation(value: unknown): PluginChatCommandStorageMutation | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Plugin storage mutation must be an object");
  const mutation: PluginChatCommandStorageMutation = {};
  if (value.set !== undefined) {
    if (!isRecord(value.set)) throw new Error("Plugin storage set mutation must be an object");
    const setEntries = Object.entries(value.set);
    if (setEntries.length > 10) throw new Error("Plugin storage set mutation is limited to 10 keys");
    mutation.set = Object.fromEntries(setEntries.map(([key, storedValue]) => [normalizePluginStorageMutationKey(key), normalizePluginStorageMutationValue(storedValue)]));
  }
  if (value.delete !== undefined) {
    if (!Array.isArray(value.delete) || !value.delete.every((item) => typeof item === "string")) throw new Error("Plugin storage delete mutation must be a string array");
    if (value.delete.length > 10) throw new Error("Plugin storage delete mutation is limited to 10 keys");
    mutation.delete = [...new Set(value.delete.map((key) => normalizePluginStorageMutationKey(key)))];
  }
  return mutation.set || mutation.delete ? mutation : undefined;
}

function normalizePluginStorageMutationKey(value: string): string {
  const key = value.trim();
  if (/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(key)) return key;
  throw new Error(`Invalid plugin storage key: ${value}`);
}

function normalizePluginStorageMutationValue(value: unknown): unknown {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new Error("Plugin storage value must be JSON serializable");
  }
  if (text === undefined) throw new Error("Plugin storage value must be JSON serializable");
  if (Buffer.byteLength(text, "utf8") > 16 * 1024) throw new Error("Plugin storage value is limited to 16 KiB of JSON");
  return JSON.parse(text) as unknown;
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
    },
    trust: {
      ...plugin.trust,
      errors: [...plugin.trust.errors],
      signature: plugin.trust.signature ? { ...plugin.trust.signature } : undefined
    }
  };
}

function evaluatePluginTrust(input: {
  pluginRoot: string;
  packagePath: string;
  manifest: PluginManifest;
  manifestChecksum: string;
  sourceChecksum?: string;
  trustPolicy: PluginTrustPolicyConfig;
}): PluginTrustInfo {
  const policy = normalizePluginTrustPolicy(input.trustPolicy);
  const required = policy.policy === "require_trusted";
  const signaturePath = resolve(input.packagePath, "plugin.signature.json");
  if (!existsSync(signaturePath)) {
    return {
      status: "unsigned",
      policy: policy.policy,
      required,
      installable: !required,
      errors: required ? ["Plugin package is unsigned and the current trust policy requires a verified signature"] : []
    };
  }

  let signature: PluginSignatureFile;
  try {
    signature = JSON.parse(stripBom(readFileSync(signaturePath, "utf8"))) as PluginSignatureFile;
  } catch {
    return untrustedPlugin(policy, normalizePublicPath(input.pluginRoot, signaturePath), "plugin.signature.json must be valid JSON");
  }

  const signatureInfo = {
    keyId: signature.keyId,
    algorithm: signature.algorithm,
    verified: false,
    signaturePath: normalizePublicPath(input.pluginRoot, signaturePath)
  };
  if (signature.algorithm !== "hmac-sha256") return { ...untrustedPlugin(policy, signatureInfo.signaturePath, "Unsupported plugin signature algorithm"), signature: signatureInfo };
  if (!signature.keyId) return { ...untrustedPlugin(policy, signatureInfo.signaturePath, "Plugin signature keyId is required"), signature: signatureInfo };
  if (!/^[a-f0-9]{64}$/i.test(signature.signature ?? "")) return { ...untrustedPlugin(policy, signatureInfo.signaturePath, "Plugin signature must be a hex SHA-256 HMAC"), signature: signatureInfo };
  const secret = policy.keys?.[signature.keyId];
  if (!secret) return { ...untrustedPlugin(policy, signatureInfo.signaturePath, `Plugin signature key is not trusted: ${signature.keyId}`), signature: signatureInfo };

  const expected = pluginSignatureForPackage(input.manifest, input.manifestChecksum, input.sourceChecksum, secret);
  if (!safeEqualHex(expected, signature.signature)) return { ...untrustedPlugin(policy, signatureInfo.signaturePath, "Plugin signature does not match package contents"), signature: signatureInfo };

  return {
    status: "trusted",
    policy: policy.policy,
    required,
    installable: true,
    errors: [],
    signature: {
      ...signatureInfo,
      verified: true
    }
  };
}

function untrustedPlugin(policy: PluginTrustPolicyConfig, signaturePath: string, error: string): PluginTrustInfo {
  const normalizedPolicy = normalizePluginTrustPolicy(policy);
  return {
    status: "untrusted",
    policy: normalizedPolicy.policy,
    required: normalizedPolicy.policy === "require_trusted",
    installable: normalizedPolicy.policy !== "require_trusted",
    errors: [error],
    signature: {
      verified: false,
      signaturePath
    }
  };
}

export function pluginSignaturePayload(manifest: Pick<PluginManifest, "id" | "version">, manifestChecksum: string, sourceChecksum?: string): string {
  return [manifest.id, manifest.version, manifestChecksum, sourceChecksum ?? ""].join("\n");
}

export function pluginSignatureForPackage(manifest: Pick<PluginManifest, "id" | "version">, manifestChecksum: string, sourceChecksum: string | undefined, secret: string): string {
  return createHmac("sha256", secret).update(pluginSignaturePayload(manifest, manifestChecksum, sourceChecksum)).digest("hex");
}

function pluginTrustPolicyFromEnv(): PluginTrustPolicyConfig {
  return normalizePluginTrustPolicy({
    policy: process.env.OTTE_PLUGIN_TRUST_POLICY === "require_trusted" ? "require_trusted" : "allow_unsigned",
    keys: parsePluginTrustKeys(process.env.OTTE_PLUGIN_TRUST_KEYS)
  });
}

function normalizePluginTrustPolicy(policy: PluginTrustPolicyConfig): PluginTrustPolicyConfig {
  return {
    policy: policy.policy === "require_trusted" ? "require_trusted" : "allow_unsigned",
    keys: policy.keys ?? {}
  };
}

function parsePluginTrustKeys(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0));
    }
  } catch {
    // Fall through to comma-separated key=secret parsing for simple env files.
  }
  return Object.fromEntries(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.includes("=") ? "=" : ":";
        const [keyId, ...secretParts] = entry.split(separator);
        return [keyId?.trim() ?? "", secretParts.join(separator).trim()] as const;
      })
      .filter(([keyId, secret]) => keyId && secret)
  );
}

function normalizePluginRegistryCatalog(value: unknown, registryUrl: URL): PluginRegistryEntry[] {
  if (!isRecord(value)) throw new Error("Plugin registry catalog must be a JSON object");
  const items = Array.isArray(value.plugins) ? value.plugins : Array.isArray(value.packages) ? value.packages : undefined;
  if (!items) throw new Error("Plugin registry catalog must include a plugins array");
  return items.slice(0, 50).map((item, index) => normalizePluginRegistryEntry(item, registryUrl, index));
}

function normalizePluginRegistryEntry(value: unknown, registryUrl: URL, index: number): PluginRegistryEntry {
  if (!isRecord(value)) throw new Error(`Plugin registry entry ${index + 1} must be an object`);
  const packageId = typeof value.packageId === "string" ? validateRegistryPackageId(value.packageId) : "";
  const packageUrl = typeof value.packageUrl === "string" ? value.packageUrl : typeof value.downloadUrl === "string" ? value.downloadUrl : "";
  if (!packageId) throw new Error(`Plugin registry entry ${index + 1} packageId is required`);
  if (!packageUrl.trim()) throw new Error(`Plugin registry entry ${index + 1} packageUrl is required`);
  const resolvedPackageUrl = normalizeHttpUrl(packageUrl, `Plugin registry entry ${index + 1} packageUrl`, registryUrl).toString();
  const checksum = typeof value.checksum === "string" && value.checksum.trim() ? value.checksum.trim() : undefined;
  if (checksum && !/^sha256:[a-f0-9]{64}$/i.test(checksum)) throw new Error(`Plugin registry entry ${index + 1} checksum must be a sha256 digest`);
  return {
    packageId,
    packageUrl: resolvedPackageUrl,
    checksum
  };
}

function validateRegistryPackageId(value: string): string {
  const packageId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(packageId)) throw new Error("Plugin registry packageId must be 1-80 characters of letters, numbers, dot, underscore, or dash");
  return packageId;
}

function normalizeRegistryPackageFiles(value: unknown): Record<string, string> {
  if (!isRecord(value) || !isRecord(value.files)) throw new Error("Plugin registry package must include a files object");
  const entries = Object.entries(value.files);
  if (entries.length === 0 || entries.length > 20) throw new Error("Plugin registry package must include 1-20 files");
  const files: Record<string, string> = {};
  for (const [path, content] of entries) {
    const normalizedPath = normalizeRegistryFilePath(path);
    if (typeof content !== "string") throw new Error(`Plugin registry package file must be a string: ${normalizedPath}`);
    if (Buffer.byteLength(content, "utf8") > 512 * 1024) throw new Error(`Plugin registry package file is too large: ${normalizedPath}`);
    files[normalizedPath] = content;
  }
  if (!files["plugin.manifest.json"]) throw new Error("Plugin registry package must include plugin.manifest.json");
  return files;
}

function normalizeRegistryFilePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  const parts = normalized.split("/");
  if (!normalized || isAbsolute(normalized) || normalized === "plugin.registry.json" || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid plugin registry package file path: ${value}`);
  }
  if (parts.length > 5 || normalized.length > 160) throw new Error(`Plugin registry package file path is too deep or long: ${value}`);
  return normalized;
}

function writeRegistryPackage(pluginRoot: string, packageId: string, files: Record<string, string>, metadata: PluginRegistryPackageMetadata): void {
  const packagePath = resolve(pluginRoot, packageId);
  if (!isPathInside(pluginRoot, packagePath)) throw new PluginPackageError(`Invalid plugin package path: ${packageId}`, ["Plugin package must stay inside the configured plugin root"]);
  if (existsSync(packagePath)) {
    const existingMetadata = readPluginRegistryMetadata(pluginRoot, packagePath);
    if (existingMetadata?.registryUrl !== metadata.registryUrl) {
      throw new PluginPackageError(`Refusing to overwrite plugin package: ${packageId}`, [
        existingMetadata?.registryUrl ? "Plugin package was synced from a different registry" : "Plugin package already exists without registry provenance"
      ]);
    }
  }
  rmSync(packagePath, { recursive: true, force: true });
  mkdirSync(packagePath, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const filePath = resolve(packagePath, path);
    if (!isPathInside(packagePath, filePath)) throw new Error(`Plugin registry file must stay inside the plugin package: ${path}`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  writeFileSync(resolve(packagePath, "plugin.registry.json"), JSON.stringify(metadata, null, 2));
}

function commitStagedRegistryPackage(pluginRoot: string, stagingPackageId: string, packageId: string, metadata: PluginRegistryPackageMetadata): void {
  const stagingPath = resolve(pluginRoot, stagingPackageId);
  const packagePath = resolve(pluginRoot, packageId);
  if (!isPathInside(pluginRoot, stagingPath) || !isPathInside(pluginRoot, packagePath)) throw new PluginPackageError(`Invalid plugin package path: ${packageId}`, ["Plugin package must stay inside the configured plugin root"]);
  if (existsSync(packagePath)) {
    const existingMetadata = readPluginRegistryMetadata(pluginRoot, packagePath);
    if (existingMetadata?.registryUrl !== metadata.registryUrl) {
      throw new PluginPackageError(`Refusing to overwrite plugin package: ${packageId}`, [
        existingMetadata?.registryUrl ? "Plugin package was synced from a different registry" : "Plugin package already exists without registry provenance"
      ]);
    }
  }
  rmSync(packagePath, { recursive: true, force: true });
  renameSync(stagingPath, packagePath);
}

function registryStagingPackageId(packageId: string): string {
  return validateRegistryPackageId(`registry-stage-${process.pid}-${Date.now().toString(36)}-${packageId}`.slice(0, 80));
}

function readPluginRegistryMetadata(pluginRoot: string, packagePath: string): PluginRegistryPackageMetadata | undefined {
  const metadataPath = resolve(packagePath, "plugin.registry.json");
  if (!existsSync(metadataPath)) return undefined;
  try {
    const parsed = JSON.parse(stripBom(readFileSync(metadataPath, "utf8"))) as unknown;
    if (!isRecord(parsed)) return undefined;
    const metadata: PluginRegistryPackageMetadata = {};
    if (typeof parsed.registryUrl === "string") metadata.registryUrl = parsed.registryUrl;
    if (typeof parsed.packageUrl === "string") metadata.packageUrl = parsed.packageUrl;
    if (typeof parsed.packageChecksum === "string") metadata.packageChecksum = parsed.packageChecksum;
    if (typeof parsed.syncedAt === "string") metadata.syncedAt = parsed.syncedAt;
    return metadata.registryUrl && isPathInside(pluginRoot, metadataPath) ? metadata : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson(url: URL): Promise<unknown> {
  return JSON.parse(stripBom(await fetchText(url))) as unknown;
}

async function fetchText(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pluginRegistryFetchTimeoutMs());
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`registry_http_${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHttpUrl(value: string, label: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(value.trim(), base);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${label} must use http or https`);
  return url;
}

function pluginRegistryFetchTimeoutMs(): number {
  const configured = Number(process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(Math.floor(configured), 30_000) : 5_000;
}

function pluginErrorMessages(error: unknown): string[] {
  if (error instanceof PluginPackageError) return error.loadErrors;
  if (error instanceof Error) return [error.message];
  return ["Unknown plugin registry error"];
}

function sha256(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function safeEqualHex(expected: string, actual: string | undefined): boolean {
  if (!actual || expected.length !== actual.length) return false;
  const normalizedActual = actual.toLowerCase();
  let diff = 0;
  for (let index = 0; index < expected.length; index++) diff |= expected.charCodeAt(index) ^ normalizedActual.charCodeAt(index);
  return diff === 0;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function latestPluginVersion(versions: RuntimePlugin[]): RuntimePlugin {
  return versions[0]!;
}

function comparePluginsByVersion(left: RuntimePlugin, right: RuntimePlugin): number {
  return compareSemverDescending(left.version, right.version);
}

function compareSemverDescending(left: string, right: string): number {
  return compareSemverAscending(right, left);
}

function compareSemverAscending(left: string, right: string): number {
  const leftParsed = parseSemver(left);
  const rightParsed = parseSemver(right);
  for (let index = 0; index < 3; index++) {
    const diff = leftParsed.release[index]! - rightParsed.release[index]!;
    if (diff !== 0) return diff;
  }
  return comparePrerelease(leftParsed.prerelease, rightParsed.prerelease, left, right);
}

function comparePrerelease(left: string[], right: string[], leftRaw: string, rightRaw: string): number {
  // Per semver, a version with a prerelease tag has lower precedence than the same release without one.
  if (left.length === 0 && right.length === 0) return leftRaw.localeCompare(rightRaw);
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index++) {
    const leftId = left[index];
    const rightId = right[index];
    if (leftId === undefined) return -1;
    if (rightId === undefined) return 1;
    const diff = comparePrereleaseIdentifier(leftId, rightId);
    if (diff !== 0) return diff;
  }
  return 0;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left.localeCompare(right);
}

function parseSemver(version: string): { release: [number, number, number]; prerelease: string[] } {
  const withoutBuild = version.split("+", 1)[0] ?? version;
  const dashIndex = withoutBuild.indexOf("-");
  const mainPart = dashIndex === -1 ? withoutBuild : withoutBuild.slice(0, dashIndex);
  const prereleasePart = dashIndex === -1 ? "" : withoutBuild.slice(dashIndex + 1);
  const [major = "0", minor = "0", patch = "0"] = mainPart.split(".", 3);
  return {
    release: [Number.parseInt(major, 10) || 0, Number.parseInt(minor, 10) || 0, Number.parseInt(patch, 10) || 0],
    prerelease: prereleasePart ? prereleasePart.split(".") : []
  };
}

function runtimeKey(pluginId: string, version: string): string {
  return `${pluginId}@${version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
