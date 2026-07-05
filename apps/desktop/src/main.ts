import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { startApiRuntime, type ApiRuntime } from "@open-tabletop/api/runtime";
import { startWebStaticRuntime, type WebStaticRuntime } from "@open-tabletop/web/static-runtime";
import { desktopDataPaths, desktopRuntimeEnv, type DesktopDataPaths } from "./desktop-runtime.js";
import { RelayTunnelSession } from "./tunnel-client.js";
import type { DesktopStatus, StartInternetShareInput } from "./desktop-api.js";

const desktopDir = dirname(fileURLToPath(import.meta.url));
const relayBaseUrl = process.env.OTTE_RELAY_URL ?? "https://share.open-tabletop.org";

let paths: DesktopDataPaths;
let apiRuntime: ApiRuntime | undefined;
let webRuntime: WebStaticRuntime | undefined;
let mainWindow: BrowserWindow | undefined;
let shareSession: RelayTunnelSession | undefined;

async function main(): Promise<void> {
  await app.whenReady();
  paths = desktopDataPaths(app.getPath("userData"));
  await ensureDataDirs(paths);
  const env = desktopRuntimeEnv(paths);
  apiRuntime = await startApiRuntime({
    host: "127.0.0.1",
    port: 0,
    sqlitePath: paths.sqlitePath,
    uploadDir: paths.uploadDir,
    pluginRoot: paths.pluginDir,
    env
  });
  webRuntime = await startWebStaticRuntime({
    host: "127.0.0.1",
    port: 0,
    root: resolveWebRoot(),
    apiBaseUrl: apiRuntime.url
  });
  registerIpcHandlers();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(desktopDir, "preload.js")
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(webRuntime.url);
}

function registerIpcHandlers(): void {
  ipcMain.handle("desktop:getStatus", () => desktopStatus());
  ipcMain.handle("desktop:startInternetShare", async (_event, input?: StartInternetShareInput) => {
    if (!webRuntime) throw new Error("Desktop web runtime is not ready");
    if (shareSession?.status().state === "connected") return desktopStatus();
    shareSession = new RelayTunnelSession({
      relayBaseUrl,
      localWebBaseUrl: webRuntime.url,
      inviteToken: input?.inviteToken,
      log: (message) => console.warn(`[desktop-relay] ${message}`)
    });
    await shareSession.start();
    return desktopStatus();
  });
  ipcMain.handle("desktop:stopInternetShare", async () => {
    await shareSession?.stop();
    shareSession = undefined;
    return desktopStatus();
  });
  ipcMain.handle("desktop:copyInviteLink", () => {
    const link = shareSession?.status().inviteUrl ?? shareSession?.status().publicUrl ?? "";
    if (link) clipboard.writeText(link);
    return link;
  });
  ipcMain.handle("desktop:openDataFolder", async () => {
    await shell.openPath(paths.root);
    return paths.root;
  });
  ipcMain.handle("desktop:exportLogs", async () => {
    const exportPath = join(paths.backupsDir, `desktop-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(exportPath, JSON.stringify({ exportedAt: new Date().toISOString(), status: desktopStatus() }, null, 2));
    shell.showItemInFolder(exportPath);
    return exportPath;
  });
}

function desktopStatus(): DesktopStatus {
  return {
    apiUrl: apiRuntime?.url,
    webUrl: webRuntime?.url,
    dataRoot: paths.root,
    uploadDir: paths.uploadDir,
    logsDir: paths.logsDir,
    relay: shareSession?.status() ?? { state: "stopped", relayBaseUrl }
  };
}

function resolveWebRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, "web");
  return fileURLToPath(new URL("../../web/dist/", import.meta.url));
}

async function ensureDataDirs(input: DesktopDataPaths): Promise<void> {
  await Promise.all([input.dataDir, input.uploadDir, input.pluginDir, input.logsDir, input.backupsDir].map((path) => mkdir(path, { recursive: true })));
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow && webRuntime) {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 920,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: join(desktopDir, "preload.js") }
    });
    void mainWindow.loadURL(webRuntime.url);
  }
});

app.on("before-quit", () => {
  void shareSession?.stop();
  void webRuntime?.close();
  void apiRuntime?.close();
});

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const crashPath = join(app.getPath("userData"), "logs", "startup-error.log");
  await mkdir(dirname(crashPath), { recursive: true });
  await writeFile(crashPath, message);
  console.error(message);
  app.exit(1);
});
