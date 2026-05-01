import type { EngineEvent } from "@open-tabletop/core";

export interface RealtimeClient {
  campaignId?: string;
  send(data: string): void;
}

export class RealtimeHub {
  private readonly clients = new Set<RealtimeClient>();

  add(client: RealtimeClient): void {
    this.clients.add(client);
  }

  remove(client: RealtimeClient): void {
    this.clients.delete(client);
  }

  broadcast(event: EngineEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (!client.campaignId || client.campaignId === event.campaignId) {
        client.send(payload);
      }
    }
  }
}
