import { routes } from "@open-tabletop/api-contracts";
import type { Actor, Campaign, ChatMessage, DiceRoll, JournalEntry, Scene, Token } from "@open-tabletop/core";

export class OpenTabletopClient {
  constructor(private readonly baseUrl: string) {}

  async campaigns(): Promise<Campaign[]> {
    return this.get(routes.campaigns);
  }

  async scenes(campaignId: string): Promise<Scene[]> {
    return this.get(routes.scenes(campaignId));
  }

  async tokens(sceneId: string): Promise<Token[]> {
    return this.get(routes.tokens(sceneId));
  }

  async actors(campaignId: string): Promise<Actor[]> {
    return this.get(routes.actors(campaignId));
  }

  async journals(campaignId: string): Promise<JournalEntry[]> {
    return this.get(routes.journals(campaignId));
  }

  async chat(campaignId: string): Promise<ChatMessage[]> {
    return this.get(`${routes.chat}?campaignId=${encodeURIComponent(campaignId)}`);
  }

  async roll(input: { campaignId: string; formula: string; visibility?: string; label?: string }): Promise<DiceRoll> {
    return this.post(routes.dice, input);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
}
