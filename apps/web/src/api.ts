import type {
  Actor,
  AiMemoryFact,
  Campaign,
  ChatMessage,
  Combat,
  Encounter,
  JournalEntry,
  MapAsset,
  Proposal,
  Scene,
  Token
} from "@open-tabletop/core";

export const baseUrl = import.meta.env.VITE_API_URL ?? "";
export const sessionUserId = localStorage.getItem("otte:userId") ?? "usr_demo_gm";

const sessionHeaders = {
  "x-user-id": sessionUserId
};

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { headers: sessionHeaders });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...sessionHeaders },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...sessionHeaders },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export interface Snapshot {
  campaigns: Campaign[];
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
  return `${baseUrl}${asset.url}${separator}userId=${encodeURIComponent(sessionUserId)}`;
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
      ...sessionHeaders
    },
    body: input.file
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ asset: MapAsset; scene?: Scene }>;
}

export async function loadSnapshot(campaignId?: string, sceneId?: string): Promise<Snapshot> {
  const campaigns = await apiGet<Campaign[]>("/api/v1/campaigns");
  const selectedCampaignId = campaignId ?? campaigns[0]?.id;
  if (!selectedCampaignId) {
    return { campaigns, scenes: [], assets: [], tokens: [], actors: [], journals: [], chat: [], encounters: [], combats: [], proposals: [], memory: [], plugins: [], systems: [] };
  }
  const scenes = await apiGet<Scene[]>(`/api/v1/campaigns/${selectedCampaignId}/scenes`);
  const selectedSceneId = sceneId ?? scenes.find((scene) => scene.active)?.id ?? scenes[0]?.id;
  const [assets, tokens, actors, journals, chat, encounters, combats, proposals, memory, plugins, systems] = await Promise.all([
    apiGet<MapAsset[]>(`/api/v1/campaigns/${selectedCampaignId}/assets`),
    selectedSceneId ? apiGet<Token[]>(`/api/v1/scenes/${selectedSceneId}/tokens`) : Promise.resolve([]),
    apiGet<Actor[]>(`/api/v1/campaigns/${selectedCampaignId}/actors`),
    apiGet<JournalEntry[]>(`/api/v1/campaigns/${selectedCampaignId}/journal`),
    apiGet<ChatMessage[]>(`/api/v1/chat/messages?campaignId=${selectedCampaignId}`),
    apiGet<Encounter[]>(`/api/v1/campaigns/${selectedCampaignId}/encounters`),
    apiGet<Combat[]>(`/api/v1/campaigns/${selectedCampaignId}/combats`),
    apiGet<Proposal[]>(`/api/v1/campaigns/${selectedCampaignId}/proposals`),
    apiGet<AiMemoryFact[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/memory`),
    apiGet<PluginRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/plugins`),
    apiGet<SystemRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems`)
  ]);
  return { campaigns, scenes, assets, tokens, actors, journals, chat, encounters, combats, proposals, memory, plugins, systems };
}
