import { contextBridge, ipcRenderer } from "electron";
import type { DesktopPreloadApi, DesktopStatus, StartInternetShareInput } from "./desktop-api.js";

const desktopApi: DesktopPreloadApi = {
  getDesktopStatus: () => ipcRenderer.invoke("desktop:getStatus") as Promise<DesktopStatus>,
  startInternetShare: (input?: StartInternetShareInput) => ipcRenderer.invoke("desktop:startInternetShare", input) as Promise<DesktopStatus>,
  stopInternetShare: () => ipcRenderer.invoke("desktop:stopInternetShare") as Promise<DesktopStatus>,
  copyInviteLink: () => ipcRenderer.invoke("desktop:copyInviteLink") as Promise<string>,
  openDataFolder: () => ipcRenderer.invoke("desktop:openDataFolder") as Promise<string>,
  exportLogs: () => ipcRenderer.invoke("desktop:exportLogs") as Promise<string>
};

contextBridge.exposeInMainWorld("otteDesktop", desktopApi);
