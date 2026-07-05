import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuildAppOptions } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";

export interface ApiRuntimeOptions {
  host?: string;
  port?: number;
  sqlitePath?: string;
  uploadDir?: string;
  pluginRoot?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ApiRuntime {
  app: FastifyInstance;
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startApiRuntime(options: ApiRuntimeOptions = {}): Promise<ApiRuntime> {
  applyApiRuntimeEnv(options);
  if (options.sqlitePath) mkdirSync(dirname(options.sqlitePath), { recursive: true });
  if (options.uploadDir) mkdirSync(options.uploadDir, { recursive: true });
  if (options.pluginRoot) mkdirSync(options.pluginRoot, { recursive: true });

  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const port = options.port ?? Number(process.env.PORT ?? 4000);
  const appOptions: BuildAppOptions = {
    store: new SqliteStateStore(options.sqlitePath ?? process.env.OTTE_SQLITE_PATH),
    uploadDir: options.uploadDir,
    pluginRoot: options.pluginRoot
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
