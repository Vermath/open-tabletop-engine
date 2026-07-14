import { createHash, createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { Script, createContext, type Context } from "node:vm";
import { Worker } from "node:worker_threads";
import type { PermissionName, ProposalChange } from "@open-tabletop/core";
import {
  comparePluginVersions,
  validatePluginManifest,
  type PluginEventEnvelope,
  type PluginEventType,
  type PluginManifest,
  type PluginProposalChange,
} from "@open-tabletop/plugin-sdk";

const PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS = 1000;
const PLUGIN_COMMAND_WORKER_TIMEOUT_GRACE_MS = 100;
export const PLUGIN_RUNTIME_API_VERSION = "0.1";
export const PLUGIN_COMMAND_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 32,
  maxYoungGenerationSizeMb: 8,
  codeRangeSizeMb: 8,
  stackSizeMb: 2,
});
const PLUGIN_REGISTRY_CATALOG_MAX_BYTES = 1024 * 1024;
const PLUGIN_REGISTRY_PACKAGE_MAX_BYTES = 12 * 1024 * 1024;
const PLUGIN_REGISTRY_MAX_REDIRECTS = 3;

export interface PluginRegistryNetworkOptions {
  fetch?: typeof fetch;
  resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  allowPrivateNetwork?: boolean;
}

interface ResolvedRegistryAddress {
  address: string;
  family: 4 | 6;
}

interface RegistryHttpResponse {
  status: number;
  location?: string;
  cancel(): Promise<void>;
  readText(): Promise<string>;
}

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

export function pluginPackageIdentityChecksum(plugin: LoadedPlugin): string {
  return sha256(
    Buffer.from(
      [plugin.source.manifestChecksum, plugin.source.checksum ?? "", plugin.source.packageChecksum ?? ""].join("\n"),
      "utf8",
    ),
  );
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
  bridgeRequests?: PluginBridgeRequest[];
}

export type PluginBridgeRequest =
  | {
      kind: "proposal.create";
      requestId: string;
      input: { title: string; summary: string; changes: PluginProposalChange[] };
    }
  | {
      kind: "chat.post";
      requestId: string;
      input: { body: string; visibility: "public" | "gm_only" };
    };

export interface PluginEventInput {
  campaignId: string;
  pluginId: string;
  permissions: PermissionName[];
  event: PluginEventEnvelope;
}

export interface PluginEventResult {
  bridgeRequests: PluginBridgeRequest[];
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
    readonly loadErrors: string[],
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

  constructor(
    pluginRoot = defaultPluginRoot(),
    trustPolicy = pluginTrustPolicyFromEnv(),
    private readonly network: PluginRegistryNetworkOptions = {},
  ) {
    this.pluginRoot = resolve(pluginRoot);
    this.trustPolicy = trustPolicy;
  }

  loadAll(): void {
    if (!existsSync(this.pluginRoot)) return;
    for (const entry of readdirSync(this.pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = resolve(this.pluginRoot, entry.name);
      if (!existsSync(resolve(packagePath, "plugin.manifest.json"))) continue;
      try {
        const result = loadPluginPackage(
          this.pluginRoot,
          packagePath,
          this.trustPolicy,
        );
        if (result.plugin) this.upsertPlugin(result.plugin);
        if (result.error) this.errors.push(result.error);
      } catch (error) {
        this.errors.push({ packagePath, errors: pluginErrorMessages(error) });
      }
    }
  }

  list(): LoadedPlugin[] {
    return [...this.plugins.values()].map((versions) =>
      publicPlugin(latestPluginVersion(versions), versions),
    );
  }

  listPackages(): LoadedPlugin[] {
    return [...this.plugins.values()].flatMap((versions) =>
      versions.map((plugin) => publicPlugin(plugin, versions)),
    );
  }

  find(pluginId: string, version?: string): LoadedPlugin | undefined {
    const versions = this.plugins.get(pluginId);
    if (!versions?.length) return undefined;
    const plugin = version
      ? versions.find((item) => item.version === version)
      : latestPluginVersion(versions);
    return plugin ? publicPlugin(plugin, versions) : undefined;
  }

  registerPackage(packagePath: string): LoadedPlugin {
    const resolvedPackagePath = resolvePackageDirectory(
      this.pluginRoot,
      packagePath,
    );
    const result = loadPluginPackage(
      this.pluginRoot,
      resolvedPackagePath,
      this.trustPolicy,
    );
    if (result.error) {
      throw new PluginPackageError(
        `Invalid plugin package: ${packagePath}`,
        result.error.errors,
      );
    }
    const plugin = result.plugin!;
    this.upsertPlugin(plugin);
    return publicPlugin(plugin, this.plugins.get(plugin.id) ?? [plugin]);
  }

  async syncRemoteRegistry(
    registryUrl: string,
  ): Promise<PluginRegistrySyncResult> {
    const resolvedRegistryUrl = normalizeHttpUrl(
      registryUrl,
      "Plugin registry URL",
    );
    const catalog = normalizePluginRegistryCatalog(
      await fetchJson(
        resolvedRegistryUrl,
        PLUGIN_REGISTRY_CATALOG_MAX_BYTES,
        this.network,
      ),
      resolvedRegistryUrl,
    );
    const imported: LoadedPlugin[] = [];
    const errors: PluginLoadError[] = [];

    for (const entry of catalog) {
      try {
        imported.push(
          await this.importRegistryEntry(resolvedRegistryUrl, entry),
        );
      } catch (error) {
        errors.push({
          packagePath: entry.packageId,
          errors: pluginErrorMessages(error),
        });
      }
    }

    return {
      registryUrl: resolvedRegistryUrl.toString(),
      imported,
      errors,
    };
  }

  executeChatCommand(
    pluginId: string,
    input: PluginChatCommandInput,
    version?: string,
  ): PluginChatCommandResult {
    const plugin = this.runtimePlugin(pluginId, version);
    if (!plugin.resolvedServerEntrypoint) {
      return {
        body: `${plugin.name} ran ${input.command}.`,
        visibility: "public",
      };
    }
    return new SandboxedPluginRuntime(plugin).execute(input.command, input);
  }

  async executeChatCommandAsync(
    pluginId: string,
    input: PluginChatCommandInput,
    version?: string,
  ): Promise<PluginChatCommandResult> {
    const plugin = this.runtimePlugin(pluginId, version);
    if (!plugin.resolvedServerEntrypoint) {
      return {
        body: `${plugin.name} ran ${input.command}.`,
        visibility: "public",
      };
    }
    await yieldToEventLoop();
    return executeChatCommandInWorker(plugin, input.command, input);
  }

  async executeEventAsync(
    pluginId: string,
    input: PluginEventInput,
    version?: string,
  ): Promise<PluginEventResult> {
    const plugin = this.runtimePlugin(pluginId, version);
    if (
      !plugin.eventSubscriptions?.some(
        (subscription) => subscription.type === input.event.type,
      )
    ) {
      throw new PluginPackageError("Plugin event is not declared", [
        `Event is not declared in plugin manifest: ${input.event.type}`,
      ]);
    }
    if (!plugin.resolvedServerEntrypoint)
      throw new PluginPackageError("Plugin event runtime is unavailable", [
        "Event subscriptions require a server entrypoint",
      ]);
    await yieldToEventLoop();
    return executePluginEventInWorker(plugin, input);
  }

  private runtimePlugin(pluginId: string, version?: string): RuntimePlugin {
    const versions = this.plugins.get(pluginId);
    const plugin = version
      ? versions?.find((item) => item.version === version)
      : versions
        ? latestPluginVersion(versions)
        : undefined;
    if (!plugin)
      throw new PluginPackageError("Plugin not found", ["Plugin not found"]);
    return plugin;
  }

  private upsertPlugin(plugin: RuntimePlugin): void {
    const versions = this.plugins.get(plugin.id) ?? [];
    const existingIndex = versions.findIndex(
      (item) => item.version === plugin.version,
    );
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

  private recordDuplicatePackageVersion(
    existing: RuntimePlugin,
    incoming: RuntimePlugin,
  ): void {
    const existingIndex = this.inventoryWarnings.findIndex(
      (warning) =>
        warning.pluginId === incoming.id &&
        warning.version === incoming.version,
    );
    const existingWarning =
      existingIndex >= 0 ? this.inventoryWarnings[existingIndex] : undefined;
    const packageIds = [
      ...new Set([
        ...(existingWarning?.packageIds ?? [existing.source.packageId]),
        incoming.source.packageId,
      ]),
    ].sort((left, right) => left.localeCompare(right));
    const sourceTypes = [
      ...new Set([
        ...(existingWarning?.sourceTypes ?? [existing.source.type]),
        incoming.source.type,
      ]),
    ].sort((left, right) => left.localeCompare(right));
    const registryUrls = [
      ...new Set(
        [
          ...(existingWarning?.registryUrls ?? [existing.source.registryUrl]),
          incoming.source.registryUrl,
        ].filter(
          (registryUrl): registryUrl is string =>
            typeof registryUrl === "string" && registryUrl.length > 0,
        ),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const warning: PluginInventoryWarning = {
      code: "duplicate_plugin_package_version",
      pluginId: incoming.id,
      name: incoming.name,
      version: incoming.version,
      packageIds,
      sourceTypes,
      registryUrls,
    };
    if (existingWarning) this.inventoryWarnings[existingIndex] = warning;
    else this.inventoryWarnings.push(warning);
  }

  private async importRegistryEntry(
    registryUrl: URL,
    entry: PluginRegistryEntry,
  ): Promise<LoadedPlugin> {
    const packageId = validateRegistryPackageId(entry.packageId);
    const packageUrl = normalizeHttpUrl(
      entry.packageUrl,
      "Plugin package URL",
      registryUrl,
    );
    const packageText = await fetchText(
      packageUrl,
      PLUGIN_REGISTRY_PACKAGE_MAX_BYTES,
      this.network,
    );
    const packageChecksum = sha256(Buffer.from(packageText, "utf8"));
    if (entry.checksum && entry.checksum !== packageChecksum)
      throw new PluginPackageError(
        `Invalid plugin package checksum: ${packageId}`,
        [`Expected ${entry.checksum} but received ${packageChecksum}`],
      );
    const packageDocument = JSON.parse(stripBom(packageText)) as unknown;
    const files = normalizeRegistryPackageFiles(packageDocument);
    const metadata = {
      registryUrl: registryUrl.toString(),
      packageUrl: packageUrl.toString(),
      packageChecksum,
      syncedAt: new Date().toISOString(),
    };
    const stagingPackageId = registryStagingPackageId(packageId);
    try {
      writeRegistryPackage(this.pluginRoot, stagingPackageId, files, metadata);
      this.ensureNoRegistryManifestCollision(stagingPackageId, packageId);
      commitStagedRegistryPackage(
        this.pluginRoot,
        stagingPackageId,
        packageId,
        metadata,
      );
    } catch (error) {
      rmSync(resolvePackageDirectory(this.pluginRoot, stagingPackageId), {
        recursive: true,
        force: true,
      });
      throw error;
    }
    return this.registerPackage(packageId);
  }

  private ensureNoRegistryManifestCollision(
    stagedPackageId: string,
    packageId: string,
  ): void {
    const loaded = loadPluginPackage(
      this.pluginRoot,
      resolvePackageDirectory(this.pluginRoot, stagedPackageId),
      this.trustPolicy,
    );
    if (loaded.error || !loaded.plugin)
      throw new PluginPackageError(
        `Invalid plugin package: ${packageId}`,
        loaded.error?.errors ?? ["Plugin package is invalid"],
      );
    const versions = this.plugins.get(loaded.plugin.id) ?? [];
    const existing = versions.find(
      (plugin) => plugin.version === loaded.plugin!.version,
    );
    if (!existing) return;
    if (
      existing.source.packageId === packageId &&
      existing.source.checksum === loaded.plugin.source.checksum
    )
      return;
    throw new PluginPackageError(
      `Refusing to import colliding plugin version: ${packageId}`,
      [
        `Plugin ${loaded.plugin.id}@${loaded.plugin.version} is already provided by package ${existing.source.packageId}`,
      ],
    );
  }
}

export function loadPluginRegistry(
  options: {
    pluginRoot?: string;
    trustPolicy?: PluginTrustPolicyConfig;
    network?: PluginRegistryNetworkOptions;
  } = {},
): PluginRuntimeRegistry {
  const registry = new PluginRuntimeRegistry(
    options.pluginRoot,
    normalizePluginTrustPolicy(
      options.trustPolicy ?? pluginTrustPolicyFromEnv(),
    ),
    options.network,
  );
  registry.loadAll();
  return registry;
}

function loadPluginPackage(
  pluginRoot: string,
  packagePath: string,
  trustPolicy: PluginTrustPolicyConfig,
): PluginPackageResult {
  const errors: string[] = [];
  const resolvedPackagePath = resolve(packagePath);
  const manifestPath = resolve(resolvedPackagePath, "plugin.manifest.json");
  if (!isPathInside(pluginRoot, resolvedPackagePath))
    errors.push("Plugin package must be inside the configured plugin root");
  if (!existsSync(manifestPath))
    errors.push("plugin.manifest.json is required");
  if (errors.length)
    return { error: { packagePath: resolvedPackagePath, errors } };

  let manifestValue: unknown;
  let manifestSource: string;
  try {
    manifestSource = readFileSync(manifestPath, "utf8");
    manifestValue = JSON.parse(stripBom(manifestSource)) as unknown;
  } catch {
    return {
      error: {
        packagePath: resolvedPackagePath,
        errors: ["plugin.manifest.json must be valid JSON"],
      },
    };
  }

  errors.push(...validatePluginManifest(manifestValue));
  if (errors.length)
    return { error: { packagePath: resolvedPackagePath, errors } };
  const manifest = manifestValue as PluginManifest;
  const runtimeApiVersion = manifest.runtime?.apiVersion?.trim();
  if (
    runtimeApiVersion &&
    runtimeApiVersion !== PLUGIN_RUNTIME_API_VERSION
  ) {
    errors.push(
      `Unsupported plugin runtime apiVersion: ${runtimeApiVersion}; supported version is ${PLUGIN_RUNTIME_API_VERSION}`,
    );
  }
  const clientEntrypoint = validateEntrypoint(
    pluginRoot,
    resolvedPackagePath,
    manifest.entrypoints?.client,
    "client",
    errors,
  );
  const serverEntrypoint = validateEntrypoint(
    pluginRoot,
    resolvedPackagePath,
    manifest.entrypoints?.server,
    "server",
    errors,
  );
  if (manifest.chatCommands?.length && !serverEntrypoint)
    errors.push("Plugins with chat commands require a server entrypoint");
  if (manifest.eventSubscriptions?.length && !serverEntrypoint)
    errors.push("Plugins with event subscriptions require a server entrypoint");
  if (serverEntrypoint && !/\.(cjs|js|mjs)$/.test(serverEntrypoint))
    errors.push("Server entrypoint must be a JavaScript file");
  if (errors.length)
    return { error: { packagePath: resolvedPackagePath, errors } };

  const source = serverEntrypoint ? readFileSync(serverEntrypoint) : undefined;
  const manifestChecksum = sha256(Buffer.from(manifestSource, "utf8"));
  const sourceChecksum = source ? sha256(source) : undefined;
  const registryMetadata = readPluginRegistryMetadata(
    pluginRoot,
    resolvedPackagePath,
  );
  const trust = evaluatePluginTrust({
    pluginRoot,
    packagePath: resolvedPackagePath,
    manifest,
    manifestChecksum,
    sourceChecksum,
    trustPolicy,
  });
  const plugin: RuntimePlugin = {
    ...manifest,
    source: {
      type: registryMetadata?.registryUrl ? "registry" : "local",
      packageId: basename(resolvedPackagePath),
      manifestPath: normalizePublicPath(pluginRoot, manifestPath),
      manifestChecksum,
      clientEntrypoint: clientEntrypoint
        ? normalizePublicPath(pluginRoot, clientEntrypoint)
        : undefined,
      serverEntrypoint: serverEntrypoint
        ? normalizePublicPath(pluginRoot, serverEntrypoint)
        : undefined,
      sandbox: serverEntrypoint ? "vm" : "manifest-only",
      checksum: sourceChecksum,
      ...registryMetadata,
    },
    distribution: {
      availableVersions: [manifest.version],
      latestVersion: manifest.version,
    },
    permissionReview: {
      requestedPermissions: [...manifest.permissions],
      grantRequired: manifest.permissions.length > 0,
    },
    trust,
    resolvedManifestPath: manifestPath,
    resolvedPackagePath,
    resolvedServerEntrypoint: serverEntrypoint,
  };
  return { plugin };
}

class SandboxedPluginRuntime {
  private static readonly executionTimeoutMs =
    PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS;
  private readonly context: Context;
  private readonly sandbox: SandboxGlobals;

  constructor(private readonly plugin: RuntimePlugin) {
    this.sandbox = {};
    this.context = createContext(this.sandbox, {
      name: `plugin:${plugin.id}`,
      codeGeneration: { strings: false, wasm: false },
    });
    this.sandbox.__ottePayloadJson = JSON.stringify({
      declaredCommands: plugin.chatCommands?.map((item) => item.command) ?? [],
      declaredEvents: plugin.eventSubscriptions?.map((item) => item.type) ?? [],
    });
    const source = readFileSync(plugin.resolvedServerEntrypoint!, "utf8");
    const bootstrap = `(() => {
      const __otteDeclaredCommands = new Set(JSON.parse(__ottePayloadJson).declaredCommands);
      const __otteDeclaredEvents = new Set(JSON.parse(__ottePayloadJson).declaredEvents);
      const __otteHandlers = Object.create(null);
      const __otteEventHandlers = Object.create(null);
      globalThis.registerCommand = (command, handler) => {
        if (!__otteDeclaredCommands.has(command)) throw new Error(\`Command is not declared in plugin manifest: \${command}\`);
        if (typeof handler !== "function") throw new Error(\`Plugin command handler must be a function: \${command}\`);
        __otteHandlers[command] = handler;
      };
      globalThis.onEvent = (type, handler) => {
        if (!__otteDeclaredEvents.has(type)) throw new Error(\`Event is not declared in plugin manifest: \${type}\`);
        if (typeof handler !== "function") throw new Error(\`Plugin event handler must be a function: \${type}\`);
        __otteEventHandlers[type] = handler;
      };
      globalThis.__otteDeclaredCommands = __otteDeclaredCommands;
      globalThis.__otteDeclaredEvents = __otteDeclaredEvents;
      globalThis.__otteHandlers = __otteHandlers;
      globalThis.__otteEventHandlers = __otteEventHandlers;
    })();`;
    const validate = `(() => {
      const __otteDeclaredCommandsRef = globalThis.__otteDeclaredCommands;
      const __otteDeclaredEventsRef = globalThis.__otteDeclaredEvents;
      const __otteHandlersRef = globalThis.__otteHandlers;
      const __otteEventHandlersRef = globalThis.__otteEventHandlers;
      const __otteMissingCommands = [...__otteDeclaredCommandsRef].filter((command) => !__otteHandlersRef[command]);
      const __otteMissingEvents = [...__otteDeclaredEventsRef].filter((type) => !__otteEventHandlersRef[type]);
      if (__otteMissingCommands.length) throw new Error(\`Plugin did not register command handlers: \${__otteMissingCommands.join(", ")}\`);
      if (__otteMissingEvents.length) throw new Error(\`Plugin did not register event handlers: \${__otteMissingEvents.join(", ")}\`);
      globalThis.__otteRunCommand = (command, input, context) => __otteHandlersRef[command](input, context);
      globalThis.__otteRunEvent = (type, event, context) => __otteEventHandlersRef[type](event, context);
      delete globalThis.registerCommand;
      delete globalThis.onEvent;
      delete globalThis.__otteDeclaredCommands;
      delete globalThis.__otteDeclaredEvents;
      delete globalThis.__otteHandlers;
      delete globalThis.__otteEventHandlers;
    })();`;
    try {
      new Script(bootstrap, {
        filename: plugin.resolvedServerEntrypoint,
      }).runInContext(this.context, {
        timeout: SandboxedPluginRuntime.executionTimeoutMs,
      });
      new Script(source, {
        filename: plugin.resolvedServerEntrypoint,
      }).runInContext(this.context, {
        timeout: SandboxedPluginRuntime.executionTimeoutMs,
      });
      new Script(validate, {
        filename: plugin.resolvedServerEntrypoint,
      }).runInContext(this.context, {
        timeout: SandboxedPluginRuntime.executionTimeoutMs,
      });
    } finally {
      this.sandbox.__ottePayloadJson = undefined;
    }
  }

  execute(
    command: string,
    input: PluginChatCommandInput,
  ): PluginChatCommandResult {
    this.sandbox.__ottePayloadJson = JSON.stringify({ command, input });
    this.sandbox.__otteResult = undefined;
    try {
      new Script(`(() => {
        const __ottePayload = JSON.parse(__ottePayloadJson);
        if (typeof __otteRunCommand !== "function") throw new Error("Plugin runtime is not initialized");
        const __otteBridgeRequests = [];
        let __otteBridgeSequence = 0;
        const __otteClone = (value) => JSON.parse(JSON.stringify(value));
        const __otteContext = Object.freeze({
          pluginId: __ottePayload.input.pluginId,
          campaignId: __ottePayload.input.campaignId,
          permissions: Object.freeze([...__ottePayload.input.permissions]),
          createProposal(input) {
            const requestId = "proposal_" + (++__otteBridgeSequence);
            __otteBridgeRequests.push({ kind: "proposal.create", requestId, input: __otteClone(input) });
            return Promise.resolve(requestId);
          },
          postChatMessage(input) {
            const requestId = "chat_" + (++__otteBridgeSequence);
            __otteBridgeRequests.push({ kind: "chat.post", requestId, input: __otteClone(input) });
            return Promise.resolve(requestId);
          }
        });
        __otteResult = { handlerResult: __otteRunCommand(__ottePayload.command, __ottePayload.input, __otteContext), bridgeRequests: __otteBridgeRequests };
      })();`).runInContext(this.context, {
        timeout: SandboxedPluginRuntime.executionTimeoutMs,
      });
      return normalizeCommandExecutionResult(this.sandbox.__otteResult);
    } finally {
      this.sandbox.__ottePayloadJson = undefined;
      this.sandbox.__otteResult = undefined;
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolveYield) => setImmediate(resolveYield));
}

function executeChatCommandInWorker(
  plugin: RuntimePlugin,
  command: string,
  input: PluginChatCommandInput,
): Promise<PluginChatCommandResult> {
  return executePluginHandlerInWorker(
    plugin,
    { kind: "command", command, input },
    normalizeCommandExecutionResult,
  );
}

function executePluginEventInWorker(
  plugin: RuntimePlugin,
  input: PluginEventInput,
): Promise<PluginEventResult> {
  return executePluginHandlerInWorker(
    plugin,
    { kind: "event", input },
    normalizeEventExecutionResult,
  );
}

function executePluginHandlerInWorker<T>(
  plugin: RuntimePlugin,
  invocation:
    | { kind: "command"; command: string; input: PluginChatCommandInput }
    | { kind: "event"; input: PluginEventInput },
  normalizeResult: (value: unknown) => T,
): Promise<T> {
  return new Promise((resolveExecution, rejectExecution) => {
    const executionLabel =
      invocation.kind === "command" ? "Plugin command" : "Plugin event";
    const worker = new Worker(pluginCommandWorkerSource(), {
      eval: true,
      resourceLimits: PLUGIN_COMMAND_WORKER_RESOURCE_LIMITS,
      workerData: {
        pluginId: plugin.id,
        filename: plugin.resolvedServerEntrypoint,
        declaredCommands:
          plugin.chatCommands?.map((item) => item.command) ?? [],
        declaredEvents:
          plugin.eventSubscriptions?.map((item) => item.type) ?? [],
        invocation,
        timeoutMs: PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS,
      },
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
      finish(() => rejectExecution(new Error(`${executionLabel} timed out`)));
    }, PLUGIN_COMMAND_EXECUTION_TIMEOUT_MS + PLUGIN_COMMAND_WORKER_TIMEOUT_GRACE_MS);

    worker.once("message", (message: unknown) => {
      finish(() => {
        if (!isRecord(message)) {
          rejectExecution(new Error(`${executionLabel} failed`));
          return;
        }
        if (message.ok === true) {
          try {
            resolveExecution(normalizeResult(message.result));
          } catch (error) {
            rejectExecution(error);
          }
          return;
        }
        rejectExecution(
          new Error(
            typeof message.message === "string"
              ? message.message
              : `${executionLabel} failed`,
          ),
        );
      });
    });
    worker.once("error", (error) => finish(() => rejectExecution(error)));
    worker.once("exit", (code) => {
      if (code !== 0)
        finish(() =>
          rejectExecution(
            new Error(`${executionLabel} worker exited with code ${code}`),
          ),
        );
    });
  });
}

function pluginCommandWorkerSource(): string {
  return `
const { readFileSync } = require("node:fs");
const { Script, createContext } = require("node:vm");
const { parentPort, workerData } = require("node:worker_threads");

function timeoutAwareMessage(error) {
  const label = workerData.invocation.kind === "command" ? "Plugin command" : "Plugin event";
  const message = error && typeof error.message === "string" ? error.message : label + " failed";
  return message.includes("Script execution timed out") ? label + " timed out" : message;
}

async function main() {
  const sandbox = {};
  const context = createContext(sandbox, {
    name: "plugin:" + workerData.pluginId,
    codeGeneration: { strings: false, wasm: false }
  });
  const bootstrap = "(() => {" +
    "const __otteDeclaredCommands = new Set(JSON.parse(__ottePayloadJson).declaredCommands);" +
    "const __otteDeclaredEvents = new Set(JSON.parse(__ottePayloadJson).declaredEvents);" +
    "const __otteHandlers = Object.create(null);" +
    "const __otteEventHandlers = Object.create(null);" +
    "globalThis.registerCommand = (command, handler) => {" +
    "if (!__otteDeclaredCommands.has(command)) throw new Error('Command is not declared in plugin manifest: ' + command);" +
    "if (typeof handler !== 'function') throw new Error('Plugin command handler must be a function: ' + command);" +
    "__otteHandlers[command] = handler;" +
    "};" +
    "globalThis.onEvent = (type, handler) => {" +
    "if (!__otteDeclaredEvents.has(type)) throw new Error('Event is not declared in plugin manifest: ' + type);" +
    "if (typeof handler !== 'function') throw new Error('Plugin event handler must be a function: ' + type);" +
    "__otteEventHandlers[type] = handler;" +
    "};" +
    "globalThis.__otteDeclaredCommands = __otteDeclaredCommands;" +
    "globalThis.__otteDeclaredEvents = __otteDeclaredEvents;" +
    "globalThis.__otteHandlers = __otteHandlers;" +
    "globalThis.__otteEventHandlers = __otteEventHandlers;" +
    "})();";
  const validate = "(() => {" +
    "const __otteDeclaredCommandsRef = globalThis.__otteDeclaredCommands;" +
    "const __otteDeclaredEventsRef = globalThis.__otteDeclaredEvents;" +
    "const __otteHandlersRef = globalThis.__otteHandlers;" +
    "const __otteEventHandlersRef = globalThis.__otteEventHandlers;" +
    "const __otteMissingCommands = [...__otteDeclaredCommandsRef].filter((command) => !__otteHandlersRef[command]);" +
    "const __otteMissingEvents = [...__otteDeclaredEventsRef].filter((type) => !__otteEventHandlersRef[type]);" +
    "if (__otteMissingCommands.length) throw new Error('Plugin did not register command handlers: ' + __otteMissingCommands.join(', '));" +
    "if (__otteMissingEvents.length) throw new Error('Plugin did not register event handlers: ' + __otteMissingEvents.join(', '));" +
    "globalThis.__otteRunCommand = (command, input, context) => __otteHandlersRef[command](input, context);" +
    "globalThis.__otteRunEvent = (type, event, context) => __otteEventHandlersRef[type](event, context);" +
    "delete globalThis.registerCommand;" +
    "delete globalThis.onEvent;" +
    "delete globalThis.__otteDeclaredCommands;" +
    "delete globalThis.__otteDeclaredEvents;" +
    "delete globalThis.__otteHandlers;" +
    "delete globalThis.__otteEventHandlers;" +
    "})();";
  sandbox.__ottePayloadJson = JSON.stringify({ declaredCommands: workerData.declaredCommands, declaredEvents: workerData.declaredEvents });
  new Script(bootstrap, { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  new Script(readFileSync(workerData.filename, "utf8"), { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  new Script(validate, { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  sandbox.__ottePayloadJson = JSON.stringify(workerData.invocation);
  sandbox.__otteResult = undefined;
  new Script("(() => {" +
    "const __otteInvocation = JSON.parse(__ottePayloadJson);" +
    "const __otteInput = __otteInvocation.input;" +
    "const __otteBridgeRequests = [];" +
    "let __otteBridgeSequence = 0;" +
    "const __otteClone = (value) => JSON.parse(JSON.stringify(value));" +
    "const __otteContext = Object.freeze({" +
      "pluginId: __otteInput.pluginId," +
      "campaignId: __otteInput.campaignId," +
      "permissions: Object.freeze([...__otteInput.permissions])," +
      "createProposal(input) { const requestId = 'proposal_' + (++__otteBridgeSequence); __otteBridgeRequests.push({ kind: 'proposal.create', requestId, input: __otteClone(input) }); return Promise.resolve(requestId); }," +
      "postChatMessage(input) { const requestId = 'chat_' + (++__otteBridgeSequence); __otteBridgeRequests.push({ kind: 'chat.post', requestId, input: __otteClone(input) }); return Promise.resolve(requestId); }" +
    "});" +
    "let __otteHandlerResult;" +
    "if (__otteInvocation.kind === 'command') {" +
      "if (typeof __otteRunCommand !== 'function') throw new Error('Plugin runtime is not initialized');" +
      "__otteHandlerResult = __otteRunCommand(__otteInvocation.command, __otteInput, __otteContext);" +
    "} else {" +
      "if (typeof __otteRunEvent !== 'function') throw new Error('Plugin event runtime is not initialized');" +
      "__otteHandlerResult = __otteRunEvent(__otteInput.event.type, __otteInput.event, __otteContext);" +
    "}" +
    "__otteResult = { handlerResult: __otteHandlerResult, bridgeRequests: __otteBridgeRequests };" +
  "})();", { filename: workerData.filename }).runInContext(context, { timeout: workerData.timeoutMs });
  const handlerResult = await Promise.resolve(sandbox.__otteResult.handlerResult);
  parentPort.postMessage({ ok: true, result: { handlerResult, bridgeRequests: sandbox.__otteResult.bridgeRequests } });
}

main().catch((error) => parentPort.postMessage({ ok: false, message: timeoutAwareMessage(error) }));
`;
}

function normalizeCommandExecutionResult(
  value: unknown,
): PluginChatCommandResult {
  const execution = normalizePluginExecutionResult(value, "command");
  return normalizeCommandResult(
    execution.handlerResult,
    execution.bridgeRequests,
  );
}

function normalizeEventExecutionResult(value: unknown): PluginEventResult {
  const execution = normalizePluginExecutionResult(value, "event");
  return { bridgeRequests: execution.bridgeRequests };
}

function normalizePluginExecutionResult(
  value: unknown,
  kind: "command" | "event",
): { handlerResult: unknown; bridgeRequests: PluginBridgeRequest[] } {
  if (!isRecord(value))
    throw new Error(`Plugin ${kind} returned an invalid execution envelope`);
  if (isRecord(value.handlerResult) && "then" in value.handlerResult) {
    throw new Error(
      `Async plugin ${kind} handlers are not supported in synchronous VM execution`,
    );
  }
  return {
    handlerResult: value.handlerResult,
    bridgeRequests: normalizePluginBridgeRequests(value.bridgeRequests),
  };
}

function normalizePluginBridgeRequests(value: unknown): PluginBridgeRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error("Plugin bridge requests must be an array");
  if (value.length > 10)
    throw new Error("Plugin execution is limited to 10 bridge requests");
  const encoded = JSON.stringify(value);
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > 128 * 1024)
    throw new Error("Plugin bridge requests are limited to 128 KiB of JSON");
  const requestIds = new Set<string>();
  return value.map((request, index) => {
    if (!isRecord(request))
      throw new Error(`Plugin bridge request ${index + 1} must be an object`);
    const requestId =
      typeof request.requestId === "string" ? request.requestId : "";
    if (!/^(?:proposal|chat)_\d+$/.test(requestId))
      throw new Error(
        `Plugin bridge request ${index + 1} has an invalid requestId`,
      );
    if (requestIds.has(requestId))
      throw new Error(`Plugin bridge request id is duplicated: ${requestId}`);
    requestIds.add(requestId);
    if (!isRecord(request.input))
      throw new Error(
        `Plugin bridge request ${requestId} input must be an object`,
      );
    if (request.kind === "chat.post") {
      const body =
        typeof request.input.body === "string" ? request.input.body.trim() : "";
      if (!body)
        throw new Error(
          `Plugin bridge request ${requestId} chat body is required`,
        );
      if (body.length > 2000)
        throw new Error(
          `Plugin bridge request ${requestId} chat body must be 2000 characters or fewer`,
        );
      if (
        request.input.visibility !== undefined &&
        request.input.visibility !== "public" &&
        request.input.visibility !== "gm_only"
      ) {
        throw new Error(
          `Plugin bridge request ${requestId} chat visibility must be public or gm_only`,
        );
      }
      return {
        kind: "chat.post" as const,
        requestId,
        input: {
          body,
          visibility:
            request.input.visibility === "gm_only"
              ? ("gm_only" as const)
              : ("public" as const),
        },
      };
    }
    if (request.kind === "proposal.create") {
      const title =
        typeof request.input.title === "string"
          ? request.input.title.trim()
          : "";
      const summary =
        typeof request.input.summary === "string"
          ? request.input.summary.trim()
          : "";
      if (!title || title.length > 160)
        throw new Error(
          `Plugin bridge request ${requestId} proposal title must be 1-160 characters`,
        );
      if (!summary || summary.length > 2000)
        throw new Error(
          `Plugin bridge request ${requestId} proposal summary must be 1-2000 characters`,
        );
      if (
        !Array.isArray(request.input.changes) ||
        request.input.changes.length === 0 ||
        request.input.changes.length > 50
      ) {
        throw new Error(
          `Plugin bridge request ${requestId} proposal changes must contain 1-50 entries`,
        );
      }
      return {
        kind: "proposal.create" as const,
        requestId,
        input: {
          title,
          summary,
          changes: request.input.changes.map((change, changeIndex) =>
            normalizePluginBridgeProposalChange(change, requestId, changeIndex),
          ),
        },
      };
    }
    throw new Error(
      `Plugin bridge request ${requestId} has an unsupported kind`,
    );
  });
}

const PLUGIN_BRIDGE_PROPOSAL_ENTITIES = new Set<PluginProposalChange["entity"]>([
  "campaign",
  "world",
  "scene",
  "token",
  "actor",
  "item",
  "journal",
  "handout",
  "chat",
  "roll",
  "diceMacro",
  "encounter",
  "combat",
  "asset",
  "fogPreset",
  "pluginStorage",
]);

function normalizePluginBridgeProposalChange(
  value: unknown,
  requestId: string,
  index: number,
): PluginProposalChange {
  if (!isRecord(value))
    throw new Error(
      `Plugin bridge request ${requestId} proposal change ${index + 1} must be an object`,
    );
  const entity = value.entity as PluginProposalChange["entity"];
  const action = value.action as ProposalChange["action"];
  if (!PLUGIN_BRIDGE_PROPOSAL_ENTITIES.has(entity))
    throw new Error(
      `Plugin bridge request ${requestId} proposal change ${index + 1} has an unsupported entity`,
    );
  if (action !== "create" && action !== "update" && action !== "delete")
    throw new Error(
      `Plugin bridge request ${requestId} proposal change ${index + 1} has an unsupported action`,
    );
  const id =
    typeof value.id === "string" && value.id.trim()
      ? value.id.trim()
      : undefined;
  if (action !== "create" && !id)
    throw new Error(
      `Plugin bridge request ${requestId} proposal change ${index + 1} requires an id`,
    );
  if (!isRecord(value.data))
    throw new Error(
      `Plugin bridge request ${requestId} proposal change ${index + 1} data must be an object`,
    );
  const data = normalizePluginBridgeJson(
    value.data,
    `Plugin bridge request ${requestId} proposal change ${index + 1} data`,
  );
  if (entity === "actor" || entity === "item") {
    if (action !== "update" || !id) {
      throw new Error(
        `Plugin bridge request ${requestId} proposal change ${index + 1} must use a typed system transaction to create or delete ${entity} records`,
      );
    }
    if (
      Object.keys(data).length !== 1 ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.trim().length > 160
    ) {
      throw new Error(
        `Plugin bridge request ${requestId} proposal change ${index + 1} may only rename ${entity} records; rules-managed fields require a typed system transaction`,
      );
    }
    return {
      entity,
      action: "update",
      id,
      data: { name: data.name.trim() },
    };
  }
  return id ? { entity, action, id, data } : { entity, action, data };
}

function normalizePluginBridgeJson(
  value: Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (encoded === undefined)
    throw new Error(`${label} must be JSON serializable`);
  if (Buffer.byteLength(encoded, "utf8") > 64 * 1024)
    throw new Error(`${label} is limited to 64 KiB of JSON`);
  return JSON.parse(encoded) as Record<string, unknown>;
}

function normalizeCommandResult(
  result: unknown,
  bridgeRequests: PluginBridgeRequest[] = [],
): PluginChatCommandResult {
  if (!isRecord(result))
    throw new Error("Plugin command must return an object");
  if ("then" in result)
    throw new Error(
      "Async plugin command handlers are not supported in the VM sandbox",
    );
  const body = typeof result.body === "string" ? result.body.trim() : "";
  if (!body) throw new Error("Plugin command must return a non-empty body");
  const visibility = result.visibility === "gm_only" ? "gm_only" : "public";
  const storage = normalizeCommandStorageMutation(result.storage);
  return {
    body: body.slice(0, 2000),
    visibility,
    ...(storage ? { storage } : {}),
    ...(bridgeRequests.length ? { bridgeRequests } : {}),
  };
}

function normalizeCommandStorageMutation(
  value: unknown,
): PluginChatCommandStorageMutation | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value))
    throw new Error("Plugin storage mutation must be an object");
  const mutation: PluginChatCommandStorageMutation = {};
  if (value.set !== undefined) {
    if (!isRecord(value.set))
      throw new Error("Plugin storage set mutation must be an object");
    const setEntries = Object.entries(value.set);
    if (setEntries.length > 10)
      throw new Error("Plugin storage set mutation is limited to 10 keys");
    mutation.set = Object.fromEntries(
      setEntries.map(([key, storedValue]) => [
        normalizePluginStorageMutationKey(key),
        normalizePluginStorageMutationValue(storedValue),
      ]),
    );
  }
  if (value.delete !== undefined) {
    if (
      !Array.isArray(value.delete) ||
      !value.delete.every((item) => typeof item === "string")
    )
      throw new Error("Plugin storage delete mutation must be a string array");
    if (value.delete.length > 10)
      throw new Error("Plugin storage delete mutation is limited to 10 keys");
    mutation.delete = [
      ...new Set(
        value.delete.map((key) => normalizePluginStorageMutationKey(key)),
      ),
    ];
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
  if (text === undefined)
    throw new Error("Plugin storage value must be JSON serializable");
  if (Buffer.byteLength(text, "utf8") > 16 * 1024)
    throw new Error("Plugin storage value is limited to 16 KiB of JSON");
  return JSON.parse(text) as unknown;
}

function validateEntrypoint(
  pluginRoot: string,
  packagePath: string,
  entrypoint: string | undefined,
  label: string,
  errors: string[],
): string | undefined {
  if (!entrypoint) return undefined;
  if (isAbsolute(entrypoint)) {
    errors.push(`${label} entrypoint must be relative`);
    return undefined;
  }
  const resolved = resolve(packagePath, entrypoint);
  if (
    !isPathInside(packagePath, resolved) ||
    !isPathInside(pluginRoot, resolved)
  ) {
    errors.push(`${label} entrypoint must stay inside the plugin package`);
    return undefined;
  }
  if (!existsSync(resolved) || !statSync(resolved).isFile())
    errors.push(`${label} entrypoint file does not exist`);
  return resolved;
}

function resolvePackageDirectory(
  pluginRoot: string,
  packagePath: string,
): string {
  const resolved = resolve(pluginRoot, packagePath);
  if (!isPathInside(pluginRoot, resolved))
    throw new PluginPackageError(
      `Invalid plugin package path: ${packagePath}`,
      ["Plugin package must stay inside the configured plugin root"],
    );
  return resolved;
}

function defaultPluginRoot(): string {
  return process.env.OTTE_PLUGIN_DIR
    ? resolve(process.env.OTTE_PLUGIN_DIR)
    : resolve(findWorkspaceRoot(), "plugins");
}

function findWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (
      existsSync(resolve(current, "pnpm-workspace.yaml")) &&
      existsSync(resolve(current, "plugins"))
    )
      return current;
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
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function publicPlugin(
  plugin: RuntimePlugin,
  versions: RuntimePlugin[],
): LoadedPlugin {
  const availableVersions = versions
    .map((item) => item.version)
    .sort(compareSemverDescending);
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
    eventSubscriptions: plugin.eventSubscriptions?.map((subscription) => ({
      ...subscription,
    })),
    source: { ...plugin.source },
    distribution: {
      availableVersions,
      latestVersion: availableVersions[0] ?? plugin.version,
    },
    permissionReview: {
      requestedPermissions: [...plugin.permissionReview.requestedPermissions],
      grantRequired: plugin.permissionReview.grantRequired,
    },
    trust: {
      ...plugin.trust,
      errors: [...plugin.trust.errors],
      signature: plugin.trust.signature
        ? { ...plugin.trust.signature }
        : undefined,
    },
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
      errors: required
        ? [
            "Plugin package is unsigned and the current trust policy requires a verified signature",
          ]
        : [],
    };
  }

  let signature: PluginSignatureFile;
  try {
    signature = JSON.parse(
      stripBom(readFileSync(signaturePath, "utf8")),
    ) as PluginSignatureFile;
  } catch {
    return untrustedPlugin(
      policy,
      normalizePublicPath(input.pluginRoot, signaturePath),
      "plugin.signature.json must be valid JSON",
    );
  }

  const signatureInfo = {
    keyId: signature.keyId,
    algorithm: signature.algorithm,
    verified: false,
    signaturePath: normalizePublicPath(input.pluginRoot, signaturePath),
  };
  if (signature.algorithm !== "hmac-sha256")
    return {
      ...untrustedPlugin(
        policy,
        signatureInfo.signaturePath,
        "Unsupported plugin signature algorithm",
      ),
      signature: signatureInfo,
    };
  if (!signature.keyId)
    return {
      ...untrustedPlugin(
        policy,
        signatureInfo.signaturePath,
        "Plugin signature keyId is required",
      ),
      signature: signatureInfo,
    };
  if (!/^[a-f0-9]{64}$/i.test(signature.signature ?? ""))
    return {
      ...untrustedPlugin(
        policy,
        signatureInfo.signaturePath,
        "Plugin signature must be a hex SHA-256 HMAC",
      ),
      signature: signatureInfo,
    };
  const secret = policy.keys?.[signature.keyId];
  if (!secret)
    return {
      ...untrustedPlugin(
        policy,
        signatureInfo.signaturePath,
        `Plugin signature key is not trusted: ${signature.keyId}`,
      ),
      signature: signatureInfo,
    };

  const expected = pluginSignatureForPackage(
    input.manifest,
    input.manifestChecksum,
    input.sourceChecksum,
    secret,
  );
  if (!safeEqualHex(expected, signature.signature))
    return {
      ...untrustedPlugin(
        policy,
        signatureInfo.signaturePath,
        "Plugin signature does not match package contents",
      ),
      signature: signatureInfo,
    };

  return {
    status: "trusted",
    policy: policy.policy,
    required,
    installable: true,
    errors: [],
    signature: {
      ...signatureInfo,
      verified: true,
    },
  };
}

function untrustedPlugin(
  policy: PluginTrustPolicyConfig,
  signaturePath: string,
  error: string,
): PluginTrustInfo {
  const normalizedPolicy = normalizePluginTrustPolicy(policy);
  return {
    status: "untrusted",
    policy: normalizedPolicy.policy,
    required: normalizedPolicy.policy === "require_trusted",
    // A missing signature may be allowed by local policy, but a present invalid
    // signature is positive evidence of tampering or broken provenance.
    installable: false,
    errors: [error],
    signature: {
      verified: false,
      signaturePath,
    },
  };
}

export function pluginSignaturePayload(
  manifest: Pick<PluginManifest, "id" | "version">,
  manifestChecksum: string,
  sourceChecksum?: string,
): string {
  return [
    manifest.id,
    manifest.version,
    manifestChecksum,
    sourceChecksum ?? "",
  ].join("\n");
}

export function pluginSignatureForPackage(
  manifest: Pick<PluginManifest, "id" | "version">,
  manifestChecksum: string,
  sourceChecksum: string | undefined,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(pluginSignaturePayload(manifest, manifestChecksum, sourceChecksum))
    .digest("hex");
}

function pluginTrustPolicyFromEnv(): PluginTrustPolicyConfig {
  const requireTrusted = process.env.NODE_ENV === "production" || process.env.OTTE_PLUGIN_TRUST_POLICY === "require_trusted";
  return normalizePluginTrustPolicy({
    policy: requireTrusted ? "require_trusted" : "allow_unsigned",
    keys: parsePluginTrustKeys(process.env.OTTE_PLUGIN_TRUST_KEYS),
  });
}

function normalizePluginTrustPolicy(
  policy: PluginTrustPolicyConfig,
): PluginTrustPolicyConfig {
  return {
    policy:
      policy.policy === "require_trusted"
        ? "require_trusted"
        : "allow_unsigned",
    keys: policy.keys ?? {},
  };
}

function parsePluginTrustKeys(
  value: string | undefined,
): Record<string, string> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && entry[1].length > 0,
        ),
      );
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
        return [
          keyId?.trim() ?? "",
          secretParts.join(separator).trim(),
        ] as const;
      })
      .filter(([keyId, secret]) => keyId && secret),
  );
}

function normalizePluginRegistryCatalog(
  value: unknown,
  registryUrl: URL,
): PluginRegistryEntry[] {
  if (!isRecord(value))
    throw new Error("Plugin registry catalog must be a JSON object");
  const items = Array.isArray(value.plugins)
    ? value.plugins
    : Array.isArray(value.packages)
      ? value.packages
      : undefined;
  if (!items)
    throw new Error("Plugin registry catalog must include a plugins array");
  return items
    .slice(0, 50)
    .map((item, index) =>
      normalizePluginRegistryEntry(item, registryUrl, index),
    );
}

function normalizePluginRegistryEntry(
  value: unknown,
  registryUrl: URL,
  index: number,
): PluginRegistryEntry {
  if (!isRecord(value))
    throw new Error(`Plugin registry entry ${index + 1} must be an object`);
  const packageId =
    typeof value.packageId === "string"
      ? validateRegistryPackageId(value.packageId)
      : "";
  const packageUrl =
    typeof value.packageUrl === "string"
      ? value.packageUrl
      : typeof value.downloadUrl === "string"
        ? value.downloadUrl
        : "";
  if (!packageId)
    throw new Error(`Plugin registry entry ${index + 1} packageId is required`);
  if (!packageUrl.trim())
    throw new Error(
      `Plugin registry entry ${index + 1} packageUrl is required`,
    );
  const resolvedPackageUrl = normalizeHttpUrl(
    packageUrl,
    `Plugin registry entry ${index + 1} packageUrl`,
    registryUrl,
  ).toString();
  const checksum =
    typeof value.checksum === "string" && value.checksum.trim()
      ? value.checksum.trim()
      : undefined;
  if (checksum && !/^sha256:[a-f0-9]{64}$/i.test(checksum))
    throw new Error(
      `Plugin registry entry ${index + 1} checksum must be a sha256 digest`,
    );
  return {
    packageId,
    packageUrl: resolvedPackageUrl,
    checksum,
  };
}

function validateRegistryPackageId(value: string): string {
  const packageId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(packageId))
    throw new Error(
      "Plugin registry packageId must be 1-80 characters of letters, numbers, dot, underscore, or dash",
    );
  return packageId;
}

function normalizeRegistryPackageFiles(value: unknown): Record<string, string> {
  if (!isRecord(value) || !isRecord(value.files))
    throw new Error("Plugin registry package must include a files object");
  const entries = Object.entries(value.files);
  if (entries.length === 0 || entries.length > 20)
    throw new Error("Plugin registry package must include 1-20 files");
  const files: Record<string, string> = {};
  for (const [path, content] of entries) {
    const normalizedPath = normalizeRegistryFilePath(path);
    if (typeof content !== "string")
      throw new Error(
        `Plugin registry package file must be a string: ${normalizedPath}`,
      );
    if (Buffer.byteLength(content, "utf8") > 512 * 1024)
      throw new Error(
        `Plugin registry package file is too large: ${normalizedPath}`,
      );
    files[normalizedPath] = content;
  }
  if (!files["plugin.manifest.json"])
    throw new Error(
      "Plugin registry package must include plugin.manifest.json",
    );
  return files;
}

function normalizeRegistryFilePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  const parts = normalized.split("/");
  if (
    !normalized ||
    isAbsolute(normalized) ||
    normalized === "plugin.registry.json" ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid plugin registry package file path: ${value}`);
  }
  if (parts.length > 5 || normalized.length > 160)
    throw new Error(
      `Plugin registry package file path is too deep or long: ${value}`,
    );
  return normalized;
}

function writeRegistryPackage(
  pluginRoot: string,
  packageId: string,
  files: Record<string, string>,
  metadata: PluginRegistryPackageMetadata,
): void {
  const packagePath = resolve(pluginRoot, packageId);
  if (!isPathInside(pluginRoot, packagePath))
    throw new PluginPackageError(`Invalid plugin package path: ${packageId}`, [
      "Plugin package must stay inside the configured plugin root",
    ]);
  if (existsSync(packagePath)) {
    const existingMetadata = readPluginRegistryMetadata(
      pluginRoot,
      packagePath,
    );
    if (existingMetadata?.registryUrl !== metadata.registryUrl) {
      throw new PluginPackageError(
        `Refusing to overwrite plugin package: ${packageId}`,
        [
          existingMetadata?.registryUrl
            ? "Plugin package was synced from a different registry"
            : "Plugin package already exists without registry provenance",
        ],
      );
    }
  }
  rmSync(packagePath, { recursive: true, force: true });
  mkdirSync(packagePath, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const filePath = resolve(packagePath, path);
    if (!isPathInside(packagePath, filePath))
      throw new Error(
        `Plugin registry file must stay inside the plugin package: ${path}`,
      );
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  writeFileSync(
    resolve(packagePath, "plugin.registry.json"),
    JSON.stringify(metadata, null, 2),
  );
}

function commitStagedRegistryPackage(
  pluginRoot: string,
  stagingPackageId: string,
  packageId: string,
  metadata: PluginRegistryPackageMetadata,
): void {
  const stagingPath = resolve(pluginRoot, stagingPackageId);
  const packagePath = resolve(pluginRoot, packageId);
  if (
    !isPathInside(pluginRoot, stagingPath) ||
    !isPathInside(pluginRoot, packagePath)
  )
    throw new PluginPackageError(`Invalid plugin package path: ${packageId}`, [
      "Plugin package must stay inside the configured plugin root",
    ]);
  if (existsSync(packagePath)) {
    const existingMetadata = readPluginRegistryMetadata(
      pluginRoot,
      packagePath,
    );
    if (existingMetadata?.registryUrl !== metadata.registryUrl) {
      throw new PluginPackageError(
        `Refusing to overwrite plugin package: ${packageId}`,
        [
          existingMetadata?.registryUrl
            ? "Plugin package was synced from a different registry"
            : "Plugin package already exists without registry provenance",
        ],
      );
    }
  }
  rmSync(packagePath, { recursive: true, force: true });
  renameSync(stagingPath, packagePath);
}

function registryStagingPackageId(packageId: string): string {
  return validateRegistryPackageId(
    `registry-stage-${process.pid}-${Date.now().toString(36)}-${packageId}`.slice(
      0,
      80,
    ),
  );
}

function readPluginRegistryMetadata(
  pluginRoot: string,
  packagePath: string,
): PluginRegistryPackageMetadata | undefined {
  const metadataPath = resolve(packagePath, "plugin.registry.json");
  if (!existsSync(metadataPath)) return undefined;
  try {
    const parsed = JSON.parse(
      stripBom(readFileSync(metadataPath, "utf8")),
    ) as unknown;
    if (!isRecord(parsed)) return undefined;
    const metadata: PluginRegistryPackageMetadata = {};
    if (typeof parsed.registryUrl === "string")
      metadata.registryUrl = parsed.registryUrl;
    if (typeof parsed.packageUrl === "string")
      metadata.packageUrl = parsed.packageUrl;
    if (typeof parsed.packageChecksum === "string")
      metadata.packageChecksum = parsed.packageChecksum;
    if (typeof parsed.syncedAt === "string")
      metadata.syncedAt = parsed.syncedAt;
    return metadata.registryUrl && isPathInside(pluginRoot, metadataPath)
      ? metadata
      : undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson(
  url: URL,
  maxBytes: number,
  network: PluginRegistryNetworkOptions,
): Promise<unknown> {
  return JSON.parse(
    stripBom(await fetchText(url, maxBytes, network)),
  ) as unknown;
}

async function fetchText(
  url: URL,
  maxBytes: number,
  network: PluginRegistryNetworkOptions,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    pluginRegistryFetchTimeoutMs(),
  );
  let currentUrl = url;
  let redirects = 0;
  try {
    while (true) {
      const addresses = await resolveSafeRegistryAddresses(currentUrl, network);
      const response = network.fetch
        ? await fetchRegistryResponse(
            currentUrl,
            network.fetch,
            maxBytes,
            controller,
          )
        : await requestPinnedRegistryResponse(
            currentUrl,
            addresses,
            maxBytes,
            controller.signal,
          );
      if (isRedirectStatus(response.status)) {
        if (redirects >= PLUGIN_REGISTRY_MAX_REDIRECTS) {
          await response.cancel();
          throw new Error("Plugin registry redirect limit exceeded");
        }
        const location = response.location;
        if (!location) {
          await response.cancel();
          throw new Error("Plugin registry redirect is missing a location");
        }
        await response.cancel();
        currentUrl = normalizeHttpUrl(
          location,
          "Plugin registry redirect URL",
          currentUrl,
        );
        redirects += 1;
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        await response.cancel();
        throw new Error(`registry_http_${response.status}`);
      }
      return await response.readText();
    }
  } finally {
    clearTimeout(timer);
  }
}

async function resolveSafeRegistryAddresses(
  url: URL,
  network: PluginRegistryNetworkOptions,
): Promise<ResolvedRegistryAddress[]> {
  if (url.username || url.password)
    throw new Error("Plugin registry URLs must not include credentials");
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const ipVersion = isIP(hostname);
  if (
    !network.allowPrivateNetwork &&
    (!hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      (!ipVersion && !hostname.includes(".")))
  ) {
    throw new Error(
      "Plugin registry URLs must target a public network address",
    );
  }
  let resolvedAddresses: readonly string[];
  if (ipVersion) {
    resolvedAddresses = [hostname];
  } else {
    try {
      resolvedAddresses = await (
        network.resolveHostname ?? resolveRegistryHostname
      )(hostname);
    } catch {
      throw new Error(
        "Plugin registry hostname could not be resolved to a public network address",
      );
    }
  }
  const addresses = [
    ...new Set(resolvedAddresses.map(normalizeResolvedAddress)),
  ].map((address) => ({ address, family: isIP(address) }));
  if (
    addresses.length === 0 ||
    addresses.some((entry) => entry.family !== 4 && entry.family !== 6)
  )
    throw new Error(
      "Plugin registry hostname could not be resolved to a public network address",
    );
  const validated = addresses as ResolvedRegistryAddress[];
  if (
    !network.allowPrivateNetwork &&
    validated.some((entry) => !isPublicNetworkAddress(entry.address))
  )
    throw new Error(
      "Plugin registry URLs must target a public network address",
    );
  return validated;
}

async function resolveRegistryHostname(
  hostname: string,
): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );
}

function normalizeResolvedAddress(address: string): string {
  return (
    address
      .toLowerCase()
      .trim()
      .replace(/^\[|\]$/g, "")
      .split("%", 1)[0] ?? ""
  );
}

async function fetchRegistryResponse(
  url: URL,
  fetchImpl: typeof fetch,
  maxBytes: number,
  controller: AbortController,
): Promise<RegistryHttpResponse> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json", "accept-encoding": "identity" },
    signal: controller.signal,
    redirect: "manual",
  });
  return {
    status: response.status,
    location: response.headers.get("location") ?? undefined,
    cancel: async () => {
      await response.body?.cancel().catch(() => undefined);
    },
    readText: () => readBoundedResponseText(response, maxBytes, controller),
  };
}

function requestPinnedRegistryResponse(
  url: URL,
  addresses: readonly ResolvedRegistryAddress[],
  maxBytes: number,
  signal: AbortSignal,
): Promise<RegistryHttpResponse> {
  return new Promise((resolveRequest, rejectRequest) => {
    let settled = false;
    const finish = (response: RegistryHttpResponse): void => {
      if (settled) return;
      settled = true;
      resolveRequest(response);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      rejectRequest(error);
    };
    // A fresh agent plus a lookup function that only returns the validated set closes
    // the DNS-rebinding gap without replacing the hostname used for Host/SNI checks.
    const request = (url.protocol === "https:" ? requestHttps : requestHttp)(
      url,
      {
        agent: false,
        headers: { accept: "application/json", "accept-encoding": "identity" },
        lookup: createPinnedLookup(addresses),
        signal,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = headerValue(response.headers.location);
        const cancel = async (): Promise<void> => {
          response.destroy();
        };
        if (isRedirectStatus(status) || status < 200 || status >= 300) {
          finish({ status, location, cancel, readText: async () => "" });
          return;
        }
        const declaredLength = headerValue(response.headers["content-length"]);
        if (
          declaredLength &&
          /^\d+$/.test(declaredLength) &&
          Number(declaredLength) > maxBytes
        ) {
          response.destroy();
          fail(registryResponseTooLargeError(maxBytes));
          return;
        }
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on("data", (chunk: Buffer | Uint8Array | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.byteLength;
          if (totalBytes > maxBytes) {
            response.destroy();
            request.destroy();
            fail(registryResponseTooLargeError(maxBytes));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks, totalBytes).toString("utf8");
          finish({ status, location, cancel, readText: async () => body });
        });
        response.on("error", (error) => fail(error));
      },
    );
    request.on("error", (error) => fail(error));
    request.end();
  });
}

function createPinnedLookup(
  addresses: readonly ResolvedRegistryAddress[],
): LookupFunction {
  return (_hostname, options, callback) => {
    const requestedFamily =
      options.family === 4 || options.family === 6 ? options.family : undefined;
    const candidates = requestedFamily
      ? addresses.filter((entry) => entry.family === requestedFamily)
      : addresses;
    if (candidates.length === 0) {
      const error = new Error(
        "Plugin registry hostname has no address for the requested family",
      ) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", requestedFamily);
      return;
    }
    if (options.all) {
      callback(
        null,
        candidates.map((entry) => ({
          address: entry.address,
          family: entry.family,
        })),
      );
      return;
    }
    const selected = candidates[0]!;
    callback(null, selected.address, selected.family);
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  controller: AbortController,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    controller.abort();
    throw registryResponseTooLargeError(maxBytes);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      controller.abort();
      throw registryResponseTooLargeError(maxBytes);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

function registryResponseTooLargeError(maxBytes: number): Error {
  return new Error(`Plugin registry response exceeds ${maxBytes} bytes`);
}

function isPublicNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0] ?? "";
  const version = isIP(normalized);
  if (version === 4) return isPublicIpv4(normalized);
  if (version !== 6) return false;
  const words = ipv6Words(normalized);
  if (!words) return false;
  const [first = 0, second = 0] = words;
  if (
    words.every((word) => word === 0) ||
    (words.slice(0, 7).every((word) => word === 0) && words[7] === 1)
  )
    return false;
  if (words.slice(0, 6).every((word) => word === 0)) {
    return isPublicIpv4(
      `${words[6]! >> 8}.${words[6]! & 0xff}.${words[7]! >> 8}.${words[7]! & 0xff}`,
    );
  }
  if (
    words.slice(0, 4).every((word) => word === 0) &&
    words[4] === 0xffff &&
    words[5] === 0
  )
    return false;
  if (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00
  )
    return false;
  if (first === 0x0100 && second === 0 && words[2] === 0 && words[3] === 0)
    return false;
  if (
    (first === 0x2001 && (second === 0 || second === 2 || second === 0x0db8)) ||
    first === 0x2002
  )
    return false;
  if (first === 0x3fff && (second & 0xf000) === 0) return false;
  if (first === 0x0064 && second === 0xff9b) return false;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isPublicIpv4(
      `${words[6]! >> 8}.${words[6]! & 0xff}.${words[7]! >> 8}.${words[7]! & 0xff}`,
    );
  }
  return true;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;
  const [first = 0, second = 0, third = 0] = octets;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function ipv6Words(address: string): number[] | undefined {
  let value = address;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (!validIpv4(ipv4)) return undefined;
    const octets = ipv4.split(".").map(Number);
    value = `${value.slice(0, lastColon)}:${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0]
    ? halves[0].split(":").map((part) => Number.parseInt(part, 16))
    : [];
  const right = halves[1]
    ? halves[1].split(":").map((part) => Number.parseInt(part, 16))
    : [];
  const missing = 8 - left.length - right.length;
  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  )
    return undefined;
  const words = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => 0),
    ...right,
  ];
  return words.length === 8 &&
    words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff)
    ? words
    : undefined;
}

function validIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every(
      (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
    )
  );
}

function normalizeHttpUrl(value: string, label: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(value.trim(), base);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`${label} must use http or https`);
  return url;
}

function pluginRegistryFetchTimeoutMs(): number {
  const configured = Number(process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.floor(configured), 30_000)
    : 5_000;
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
  for (let index = 0; index < expected.length; index++)
    diff |= expected.charCodeAt(index) ^ normalizedActual.charCodeAt(index);
  return diff === 0;
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function latestPluginVersion(versions: RuntimePlugin[]): RuntimePlugin {
  return versions[0]!;
}

function comparePluginsByVersion(
  left: RuntimePlugin,
  right: RuntimePlugin,
): number {
  return compareSemverDescending(left.version, right.version);
}

function compareSemverDescending(left: string, right: string): number {
  const precedence = comparePluginVersions(right, left);
  return precedence !== 0 ? precedence : right.localeCompare(left);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
