import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { startApiRuntime, type ApiRuntime } from "@open-tabletop/api/runtime";
import { startWebStaticRuntime, type WebStaticRuntime } from "@open-tabletop/web/static-runtime";
import { desktopDataPaths, desktopRendererUrlAllowed, desktopRuntimeEnv, shutdownDesktopResources, type DesktopDataPaths } from "./desktop-runtime.js";
import { RelayTunnelSession } from "./tunnel-client.js";
import type { DesktopStatus, StartInternetShareInput } from "./desktop-api.js";

const desktopDir = dirname(fileURLToPath(import.meta.url));
const relayBaseUrl = process.env.OTTE_RELAY_URL ?? "https://share.open-tabletop.org";

let paths: DesktopDataPaths;
let apiRuntime: ApiRuntime | undefined;
let webRuntime: WebStaticRuntime | undefined;
let mainWindow: BrowserWindow | undefined;
let shareSession: RelayTunnelSession | undefined;
let shareStartPromise: Promise<unknown> | undefined;
let shutdownStarted = false;

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
  mainWindow = createMainWindow();
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(webRuntime.url);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(desktopDir, "preload.js")
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (webRuntime && desktopRendererUrlAllowed(url, webRuntime.url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  return window;
}

function registerIpcHandlers(): void {
  ipcMain.handle("desktop:getStatus", (event) => {
    assertTrustedRenderer(event);
    return desktopStatus();
  });
  ipcMain.handle("desktop:startInternetShare", async (event, input?: StartInternetShareInput) => {
    assertTrustedRenderer(event);
    if (!webRuntime) throw new Error("Desktop web runtime is not ready");
    if (shareSession?.status().state === "connected") return desktopStatus();
    if (shareStartPromise) {
      await shareStartPromise;
      return desktopStatus();
    }
    const session = new RelayTunnelSession({
      relayBaseUrl,
      localWebBaseUrl: webRuntime.url,
      inviteToken: input?.inviteToken,
      log: (message) => console.warn(`[desktop-relay] ${message}`)
    });
    shareSession = session;
    const starting = session.start();
    shareStartPromise = starting;
    try {
      await starting;
      return desktopStatus();
    } finally {
      if (shareStartPromise === starting) shareStartPromise = undefined;
    }
  });
  ipcMain.handle("desktop:stopInternetShare", async (event) => {
    assertTrustedRenderer(event);
    const session = shareSession;
    const starting = shareStartPromise;
    await session?.stop();
    await starting?.catch(() => undefined);
    if (shareSession === session) shareSession = undefined;
    if (shareStartPromise === starting) shareStartPromise = undefined;
    return desktopStatus();
  });
  ipcMain.handle("desktop:copyInviteLink", (event) => {
    assertTrustedRenderer(event);
    const link = shareSession?.status().inviteUrl ?? shareSession?.status().publicUrl ?? "";
    if (link) clipboard.writeText(link);
    return link;
  });
  ipcMain.handle("desktop:openDataFolder", async (event) => {
    assertTrustedRenderer(event);
    await shell.openPath(paths.root);
    return paths.root;
  });
  ipcMain.handle("desktop:exportLogs", async (event) => {
    assertTrustedRenderer(event);
    const exportPath = join(paths.backupsDir, `desktop-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(exportPath, JSON.stringify({ exportedAt: new Date().toISOString(), status: desktopStatus() }, null, 2));
    shell.showItemInFolder(exportPath);
    return exportPath;
  });
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? "";
  if (!webRuntime || !desktopRendererUrlAllowed(senderUrl, webRuntime.url)) throw new Error("Desktop API is only available to the local OpenTabletop renderer");
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
    mainWindow = createMainWindow();
    void mainWindow.loadURL(webRuntime.url);
  }
});

app.on("before-quit", (event) => {
  if (shutdownStarted) return;
  event.preventDefault();
  shutdownStarted = true;
  void shutdownDesktopResources({ relay: shareSession, web: webRuntime, api: apiRuntime })
    .then((failures) => {
      for (const failure of failures) console.error(`Failed to close desktop ${failure.resource} runtime: ${failure.message}`);
    })
    .finally(() => app.quit());
});

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const shutdownFailures = await shutdownDesktopResources({ relay: shareSession, web: webRuntime, api: apiRuntime });
  const crashPath = join(app.getPath("userData"), "logs", "startup-error.log");
  await mkdir(dirname(crashPath), { recursive: true });
  const shutdownDetails = shutdownFailures.length > 0 ? `\n\nShutdown failures:\n${shutdownFailures.map((failure) => `- ${failure.resource}: ${failure.message}`).join("\n")}` : "";
  await writeFile(crashPath, `${message}${shutdownDetails}`);
  console.error(message);
  app.exit(1);
});
