import type {
  Actor,
  AiMemoryFact,
  Campaign,
  ChatMessage,
  Combat,
  Encounter,
  JournalEntry,
  Proposal,
  Scene,
  Token
} from "@open-tabletop/core";

const baseUrl = import.meta.env.VITE_API_URL ?? "";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export interface Snapshot {
  campaigns: Campaign[];
  scenes: Scene[];
  tokens: Token[];
  actors: Actor[];
  journals: JournalEntry[];
  chat: ChatMessage[];
  encounters: Encounter[];
  combats: Combat[];
  proposals: Proposal[];
  memory: AiMemoryFact[];
}

export async function loadSnapshot(campaignId?: string, sceneId?: string): Promise<Snapshot> {
  const campaigns = await apiGet<Campaign[]>("/api/v1/campaigns");
  const selectedCampaignId = campaignId ?? campaigns[0]?.id;
  if (!selectedCampaignId) {
    return { campaigns, scenes: [], tokens: [], actors: [], journals: [], chat: [], encounters: [], combats: [], proposals: [], memory: [] };
  }
  const scenes = await apiGet<Scene[]>(`/api/v1/campaigns/${selectedCampaignId}/scenes`);
  const selectedSceneId = sceneId ?? scenes.find((scene) => scene.active)?.id ?? scenes[0]?.id;
  const [tokens, actors, journals, chat, encounters, combats, proposals, memory] = await Promise.all([
    selectedSceneId ? apiGet<Token[]>(`/api/v1/scenes/${selectedSceneId}/tokens`) : Promise.resolve([]),
    apiGet<Actor[]>(`/api/v1/campaigns/${selectedCampaignId}/actors`),
    apiGet<JournalEntry[]>(`/api/v1/campaigns/${selectedCampaignId}/journal`),
    apiGet<ChatMessage[]>(`/api/v1/chat/messages?campaignId=${selectedCampaignId}`),
    apiGet<Encounter[]>(`/api/v1/campaigns/${selectedCampaignId}/encounters`),
    apiGet<Combat[]>(`/api/v1/campaigns/${selectedCampaignId}/combats`),
    apiGet<Proposal[]>(`/api/v1/campaigns/${selectedCampaignId}/proposals`),
    apiGet<AiMemoryFact[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/memory`)
  ]);
  return { campaigns, scenes, tokens, actors, journals, chat, encounters, combats, proposals, memory };
}
