export interface DesktopDataPaths {
  root: string;
  dataDir: string;
  sqlitePath: string;
  uploadDir: string;
  pluginDir: string;
  logsDir: string;
  backupsDir: string;
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
  return [normalizeDesktopPath(root).replace(/\/+$/, ""), ...parts.map((part) => normalizeDesktopPath(part).replace(/^\/+|\/+$/g, ""))].filter(Boolean).join("/");
}

function normalizeDesktopPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}
