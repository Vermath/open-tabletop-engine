import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { AiProvider } from "@open-tabletop/ai-core";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuildAppOptions } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";

export interface ApiRuntimeOptions {
  host?: string;
  port?: number;
  sqlitePath?: string;
  uploadDir?: string;
  pluginRoot?: string;
  bundledPluginRoot?: string;
  aiProvider?: AiProvider;
  env?: NodeJS.ProcessEnv;
}

export interface ApiRuntime {
  app: FastifyInstance;
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export type ApiRuntimeShutdownSignal = "SIGINT" | "SIGTERM";

export interface ApiRuntimeSignalSource {
  once(signal: ApiRuntimeShutdownSignal, listener: () => void): unknown;
  off(signal: ApiRuntimeShutdownSignal, listener: () => void): unknown;
}

export interface ApiRuntimeShutdownController {
  shutdown(signal?: ApiRuntimeShutdownSignal): Promise<void>;
  dispose(): void;
}

export interface ApiRuntimeShutdownOptions {
  signalSource?: ApiRuntimeSignalSource;
  onError?: (error: unknown, signal?: ApiRuntimeShutdownSignal) => void;
}

/**
 * Drain the HTTP server on container shutdown so Fastify's onClose hooks can
 * flush durable state before Railway terminates the process.
 */
export function registerApiRuntimeShutdown(
  runtime: Pick<ApiRuntime, "close">,
  options: ApiRuntimeShutdownOptions = {}
): ApiRuntimeShutdownController {
  const signalSource = options.signalSource ?? process;
  let closePromise: Promise<void> | undefined;

  const dispose = () => {
    signalSource.off("SIGINT", onSigint);
    signalSource.off("SIGTERM", onSigterm);
  };
  const shutdown = (signal?: ApiRuntimeShutdownSignal): Promise<void> => {
    closePromise ??= runtime.close()
      .catch((error: unknown) => {
        options.onError?.(error, signal);
      })
      .finally(dispose);
    return closePromise;
  };
  const onSigint = () => {
    void shutdown("SIGINT");
  };
  const onSigterm = () => {
    void shutdown("SIGTERM");
  };

  signalSource.once("SIGINT", onSigint);
  signalSource.once("SIGTERM", onSigterm);
  return { shutdown, dispose };
}

export function seedBundledPluginPackages(bundledPluginRoot: string, pluginRoot: string): string[] {
  const sourceRoot = resolve(bundledPluginRoot);
  const destinationRoot = resolve(pluginRoot);
  if (sourceRoot === destinationRoot) return [];

  mkdirSync(destinationRoot, { recursive: true });
  const seededPackages: string[] = [];
  const entries = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const sourcePackage = join(sourceRoot, entry.name);
    if (!existsSync(join(sourcePackage, "plugin.manifest.json"))) continue;
    const destinationPackage = join(destinationRoot, entry.name);
    // A persisted package may have been installed, upgraded, or repaired by an
    // operator. Bundled defaults are only a first-start seed and must never
    // replace that durable package, even when the bundled version changes.
    if (existsSync(destinationPackage)) continue;
    cpSync(sourcePackage, destinationPackage, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (source) => !relative(sourcePackage, source).split(sep).includes("node_modules")
    });
    seededPackages.push(entry.name);
  }

  return seededPackages;
}

export async function startApiRuntime(options: ApiRuntimeOptions = {}): Promise<ApiRuntime> {
  applyApiRuntimeEnv(options);
  validateApiRuntimeEnvironment(options);
  const pluginRoot = options.pluginRoot ?? process.env.OTTE_PLUGIN_DIR;
  const bundledPluginRoot = options.bundledPluginRoot ?? process.env.OTTE_BUNDLED_PLUGIN_DIR;
  if (options.sqlitePath) mkdirSync(dirname(options.sqlitePath), { recursive: true });
  if (options.uploadDir) mkdirSync(options.uploadDir, { recursive: true });
  if (pluginRoot) mkdirSync(pluginRoot, { recursive: true });
  if (pluginRoot && bundledPluginRoot) {
    const seededPackages = seedBundledPluginPackages(bundledPluginRoot, pluginRoot);
    if (seededPackages.length > 0) console.info(`Seeded bundled plugin packages: ${seededPackages.join(", ")}`);
  }

  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const port = options.port ?? Number(process.env.PORT ?? 4000);
  const appOptions: BuildAppOptions = {
    store: new SqliteStateStore(options.sqlitePath ?? process.env.OTTE_SQLITE_PATH),
    uploadDir: options.uploadDir,
    pluginRoot,
    ...(options.aiProvider ? { aiProvider: options.aiProvider } : {})
  };
  const app = await buildApp(appOptions);
  await app.listen({ host, port });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("API runtime did not bind to a TCP port");
  const boundHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    app,
    host: boundHost,
    port: address.port,
    url: `http://${boundHost}:${address.port}`,
    close: () => app.close()
  };
}

export function validateApiRuntimeEnvironment(options: Pick<ApiRuntimeOptions, "sqlitePath"> = {}): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!(options.sqlitePath ?? process.env.OTTE_SQLITE_PATH)?.trim()) missing.push("OTTE_SQLITE_PATH");
  if (!process.env.OTTE_ASSET_URL_SIGNING_SECRET?.trim()) missing.push("OTTE_ASSET_URL_SIGNING_SECRET");
  const assetProvider = process.env.OTTE_ASSET_STORAGE?.trim().toLowerCase() ?? "local";
  if (assetProvider === "s3" || assetProvider === "minio") {
    if (!process.env.OTTE_S3_BUCKET?.trim()) missing.push("OTTE_S3_BUCKET");
    if (!process.env.OTTE_S3_REGION?.trim()) missing.push("OTTE_S3_REGION");
    const hasAccessKey = Boolean(process.env.OTTE_S3_ACCESS_KEY_ID?.trim());
    const hasSecretKey = Boolean(process.env.OTTE_S3_SECRET_ACCESS_KEY?.trim());
    if (hasAccessKey !== hasSecretKey) missing.push(hasAccessKey ? "OTTE_S3_SECRET_ACCESS_KEY" : "OTTE_S3_ACCESS_KEY_ID");
    const endpoint = process.env.OTTE_S3_ENDPOINT?.trim();
    if (endpoint && !endpoint.startsWith("https://") && !insecureLocalS3EndpointAllowed(endpoint)) missing.push("OTTE_S3_ENDPOINT(https)");
  }
  if ((process.env.OTTE_PLUGIN_TRUST_POLICY?.trim().toLowerCase() ?? "require_trusted") !== "require_trusted") {
    missing.push("OTTE_PLUGIN_TRUST_POLICY=require_trusted");
  }
  if ((process.env.OTTE_PLUGIN_REVIEW_POLICY?.trim().toLowerCase() ?? "require_approved") !== "require_approved") {
    missing.push("OTTE_PLUGIN_REVIEW_POLICY=require_approved");
  }
  if (missing.length > 0) {
    throw new Error(`Production runtime configuration is incomplete: ${[...new Set(missing)].sort().join(", ")}`);
  }
}

export function insecureLocalS3EndpointAllowed(
  endpoint: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OTTE_S3_ALLOW_INSECURE_LOCAL_ENDPOINT?.trim().toLowerCase() !== "true") return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return hostname === "minio" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}
function applyApiRuntimeEnv(options: ApiRuntimeOptions): void {
  const env = options.env;
  if (!env) return;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
