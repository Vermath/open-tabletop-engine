// Sandboxed preloads are classic scripts. Type queries keep tsc from emitting ESM imports or markers.
const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");
type DesktopPreloadApi = import("./desktop-api.js").DesktopPreloadApi;
type DesktopStatus = import("./desktop-api.js").DesktopStatus;
type StartInternetShareInput = import("./desktop-api.js").StartInternetShareInput;

const desktopApi: DesktopPreloadApi = {
  getDesktopStatus: () => ipcRenderer.invoke("desktop:getStatus") as Promise<DesktopStatus>,
  startInternetShare: (input?: StartInternetShareInput) => ipcRenderer.invoke("desktop:startInternetShare", input) as Promise<DesktopStatus>,
  stopInternetShare: () => ipcRenderer.invoke("desktop:stopInternetShare") as Promise<DesktopStatus>,
  copyInviteLink: () => ipcRenderer.invoke("desktop:copyInviteLink") as Promise<string>,
  openDataFolder: () => ipcRenderer.invoke("desktop:openDataFolder") as Promise<string>,
  exportLogs: () => ipcRenderer.invoke("desktop:exportLogs") as Promise<string>
};

contextBridge.exposeInMainWorld("otteDesktop", desktopApi);
