import type { Actor, AiMemoryFact, Campaign, CampaignMember, ChatMessage, Combat, Encounter, JournalEntry, MapAsset, PermissionName, Proposal, Scene, Token, User } from "@open-tabletop/core";

export const baseUrl = import.meta.env.VITE_API_URL ?? "";

export function getSessionUserId(): string {
  return localStorage.getItem("otte:userId") ?? "usr_demo_gm";
}

export function setSessionUserId(userId: string): void {
  localStorage.setItem("otte:userId", userId);
}

function sessionHeaders(): Record<string, string> {
  return { "x-user-id": getSessionUserId() };
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: sessionHeaders()
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export interface Snapshot {
  session?: SessionInfo;
  campaigns: Campaign[];
  members: CampaignMemberInfo[];
  scenes: Scene[];
  assets: MapAsset[];
  tokens: Token[];
  actors: Actor[];
  journals: JournalEntry[];
  chat: ChatMessage[];
  encounters: Encounter[];
  combats: Combat[];
  proposals: Proposal[];
  memory: AiMemoryFact[];
  plugins: PluginRuntimeInfo[];
  systems: SystemRuntimeInfo[];
}

export interface SessionInfo {
  user: User;
  memberships: CampaignMember[];
}

export interface CampaignMemberInfo extends CampaignMember {
  user: Pick<User, "id" | "displayName" | "email">;
  permissions: PermissionName[];
}

export interface PluginRuntimeInfo {
  id: string;
  name: string;
  version: string;
  permissions: string[];
  installed: boolean;
  grantedPermissions: string[];
  missingPermissions: string[];
  chatCommands?: Array<{ command: string; description: string }>;
}

export interface SystemRuntimeInfo {
  id: string;
  name: string;
  version: string;
  active: boolean;
}

export function assetBlobUrl(asset: MapAsset): string {
  if (/^(https?:|data:|blob:)/.test(asset.url)) return asset.url;
  const separator = asset.url.includes("?") ? "&" : "?";
  return `${baseUrl}${asset.url}${separator}userId=${encodeURIComponent(getSessionUserId())}`;
}

export async function apiUploadAsset(input: { campaignId: string; sceneId?: string; file: File; setAsBackground?: boolean }): Promise<{ asset: MapAsset; scene?: Scene }> {
  const params = new URLSearchParams();
  if (input.sceneId) params.set("sceneId", input.sceneId);
  if (input.setAsBackground) params.set("setAsBackground", "true");
  const response = await fetch(`${baseUrl}/api/v1/campaigns/${input.campaignId}/assets/upload?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": input.file.type || "application/octet-stream",
      "x-asset-name": encodeURIComponent(input.file.name),
      ...sessionHeaders()
    },
    body: input.file
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ asset: MapAsset; scene?: Scene }>;
}

export async function loadSnapshot(campaignId?: string, sceneId?: string): Promise<Snapshot> {
  const [session, campaigns] = await Promise.all([apiGet<SessionInfo>("/api/v1/auth/session"), apiGet<Campaign[]>("/api/v1/campaigns")]);
  const selectedCampaignId = campaignId ?? campaigns[0]?.id;
  if (!selectedCampaignId) {
    return {
      session,
      campaigns,
      members: [],
      scenes: [],
      assets: [],
      tokens: [],
      actors: [],
      journals: [],
      chat: [],
      encounters: [],
      combats: [],
      proposals: [],
      memory: [],
      plugins: [],
      systems: []
    };
  }
  const scenes = await apiGet<Scene[]>(`/api/v1/campaigns/${selectedCampaignId}/scenes`);
  const selectedSceneId = sceneId ?? scenes.find((scene) => scene.active)?.id ?? scenes[0]?.id;
  const [members, assets, tokens, actors, journals, chat, encounters, combats, proposals, memory, plugins, systems] = await Promise.all([apiGet<CampaignMemberInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/members`), apiGet<MapAsset[]>(`/api/v1/campaigns/${selectedCampaignId}/assets`), selectedSceneId ? apiGet<Token[]>(`/api/v1/scenes/${selectedSceneId}/tokens`) : Promise.resolve([]), apiGet<Actor[]>(`/api/v1/campaigns/${selectedCampaignId}/actors`), apiGet<JournalEntry[]>(`/api/v1/campaigns/${selectedCampaignId}/journal`), apiGet<ChatMessage[]>(`/api/v1/chat/messages?campaignId=${selectedCampaignId}`), apiGet<Encounter[]>(`/api/v1/campaigns/${selectedCampaignId}/encounters`), apiGet<Combat[]>(`/api/v1/campaigns/${selectedCampaignId}/combats`), apiGet<Proposal[]>(`/api/v1/campaigns/${selectedCampaignId}/proposals`), apiGet<AiMemoryFact[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/memory`), apiGet<PluginRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/plugins`), apiGet<SystemRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems`)]);
  return {
    session,
    campaigns,
    members,
    scenes,
    assets,
    tokens,
    actors,
    journals,
    chat,
    encounters,
    combats,
    proposals,
    memory,
    plugins,
    systems
  };
}
