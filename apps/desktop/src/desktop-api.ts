export interface DesktopShareStatus {
  state: "stopped" | "starting" | "connected" | "error";
  relayBaseUrl: string;
  tableSlug?: string;
  publicUrl?: string;
  inviteUrl?: string;
  lastError?: string;
}

export interface DesktopStatus {
  apiUrl?: string;
  webUrl?: string;
  dataRoot: string;
  uploadDir: string;
  logsDir: string;
  relay: DesktopShareStatus;
}

export interface StartInternetShareInput {
  inviteToken?: string;
}

export interface DesktopPreloadApi {
  getDesktopStatus(): Promise<DesktopStatus>;
  startInternetShare(input?: StartInternetShareInput): Promise<DesktopStatus>;
  stopInternetShare(): Promise<DesktopStatus>;
  copyInviteLink(): Promise<string>;
  openDataFolder(): Promise<string>;
  exportLogs(): Promise<string>;
}
