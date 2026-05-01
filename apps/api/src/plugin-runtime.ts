import { createHash, createHmac } from "node:crypto";
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
    manifestChecksum: string;
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

interface PluginSignatureFile {
  keyId?: string;
  algorithm?: string;
  signature?: string;
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
  readonly trustPolicy: PluginTrustPolicyConfig;
  readonly errors: PluginLoadError[] = [];
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
      type: "local",
      packageId: basename(resolvedPackagePath),
      manifestPath: normalizePublicPath(pluginRoot, manifestPath),
      manifestChecksum,
      clientEntrypoint: clientEntrypoint ? normalizePublicPath(pluginRoot, clientEntrypoint) : undefined,
      serverEntrypoint: serverEntrypoint ? normalizePublicPath(pluginRoot, serverEntrypoint) : undefined,
      sandbox: serverEntrypoint ? "vm" : "manifest-only",
      checksum: sourceChecksum
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
