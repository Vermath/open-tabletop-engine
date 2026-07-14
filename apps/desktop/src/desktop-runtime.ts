import { win32 } from "node:path";

export interface DesktopDataPaths {
  root: string;
  dataDir: string;
  sqlitePath: string;
  uploadDir: string;
  pluginDir: string;
  logsDir: string;
  backupsDir: string;
}

export interface DesktopShutdownFailure {
  resource: "relay" | "web" | "api";
  message: string;
}

export interface DesktopShutdownResources {
  relay?: { stop(): void | Promise<void> };
  web?: { close(): void | Promise<void> };
  api?: { close(): void | Promise<void> };
}

export function desktopDataPaths(userDataRoot: string): DesktopDataPaths {
  const root = normalizeDesktopPath(userDataRoot);
  return {
    root,
    dataDir: joinDesktopPath(root, "data"),
    sqlitePath: joinDesktopPath(root, "data", "opentabletop.sqlite"),
    uploadDir: joinDesktopPath(root, "uploads"),
    pluginDir: joinDesktopPath(root, "plugins"),
    logsDir: joinDesktopPath(root, "logs"),
    backupsDir: joinDesktopPath(root, "backups")
  };
}

export function desktopRuntimeEnv(paths: DesktopDataPaths, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { PORT: _port, HOST: _host, OTTE_SQLITE_PATH: _sqlite, OTTE_UPLOAD_DIR: _uploads, OTTE_PLUGIN_DIR: _plugins, ...rest } = baseEnv;
  return {
    ...rest,
    HOST: "127.0.0.1",
    NODE_ENV: "production",
    OTTE_SQLITE_PATH: paths.sqlitePath,
    OTTE_UPLOAD_DIR: paths.uploadDir,
    OTTE_PLUGIN_DIR: paths.pluginDir,
    OTTE_ASSET_STORAGE: "local",
    OTTE_AI_PROVIDER: "disabled",
    OTTE_DEMO_SEED: "false",
    OTTE_SQLITE_BACKUP_RUN_ON_START: baseEnv.OTTE_SQLITE_BACKUP_RUN_ON_START ?? "true"
  };
}

export function joinDesktopPath(root: string, ...parts: string[]): string {
  return normalizeDesktopPath(win32.join(root, ...parts));
}

export function desktopRendererUrlAllowed(senderUrl: string, webRuntimeUrl: string): boolean {
  try {
    const sender = new URL(senderUrl);
    const runtime = new URL(webRuntimeUrl);
    return sender.origin === runtime.origin;
  } catch {
    return false;
  }
}

function normalizeDesktopPath(value: string): string {
  return value ? win32.normalize(value).replaceAll("\\", "/") : value;
}

export async function shutdownDesktopResources(resources: DesktopShutdownResources): Promise<DesktopShutdownFailure[]> {
  const failures: DesktopShutdownFailure[] = [];
  if (resources.relay) {
    try {
      await resources.relay.stop();
    } catch (error) {
      failures.push({ resource: "relay", message: error instanceof Error ? error.message : String(error) });
    }
  }
  const operations = [
    resources.web ? (["web", () => resources.web!.close()] as const) : undefined,
    resources.api ? (["api", () => resources.api!.close()] as const) : undefined,
  ].filter((operation): operation is readonly ["web" | "api", () => void | Promise<void>] => Boolean(operation));
  const settled = await Promise.allSettled(operations.map(([, close]) => Promise.resolve().then(close)));
  for (const [index, result] of settled.entries()) {
    if (result.status === "rejected") failures.push({ resource: operations[index]![0], message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  }
  return failures;
}
