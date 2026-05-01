import type { EngineEvent } from "@open-tabletop/core";

export interface RealtimeClient {
  campaignId?: string;
  userId?: string;
  send(data: string): void;
}

export type RealtimeEventFilter = (event: EngineEvent, client: RealtimeClient) => EngineEvent | undefined;

export class RealtimeHub {
  private readonly clients = new Set<RealtimeClient>();

  add(client: RealtimeClient): void {
    this.clients.add(client);
  }

  remove(client: RealtimeClient): void {
    this.clients.delete(client);
  }

  broadcast(event: EngineEvent, filter?: RealtimeEventFilter): void {
    for (const client of this.clients) {
      if (!client.campaignId || client.campaignId === event.campaignId) {
        const filtered = filter ? filter(event, client) : event;
        if (filtered) client.send(JSON.stringify(filtered));
      }
    }
  }
}
