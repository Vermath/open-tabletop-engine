import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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
    pluginRoot
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

function applyApiRuntimeEnv(options: ApiRuntimeOptions): void {
  const env = options.env;
  if (!env) return;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
