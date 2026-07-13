import type { EngineEvent } from "@open-tabletop/core";

export interface RealtimeClient {
  campaignId?: string;
  userId?: string;
  sessionId?: string;
  send(data: string): void;
  close?(): void;
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

  countMatching(input: { campaignId: string; userId?: string }): number {
    let count = 0;
    for (const client of this.clients) {
      if (client.campaignId !== input.campaignId) continue;
      if (input.userId && client.userId !== input.userId) continue;
      count += 1;
    }
    return count;
  }

  disconnectSession(sessionId: string): void {
    for (const client of this.clients) {
      if (client.sessionId !== sessionId) continue;
      this.clients.delete(client);
      try {
        client.close?.();
      } catch {
        // The socket may already be closing. It has still been removed from
        // the hub, so later broadcasts cannot cross the changed auth scope.
      }
    }
  }

  broadcast(event: EngineEvent, filter?: RealtimeEventFilter): void {
    for (const client of this.clients) {
      if (client.campaignId === event.campaignId) {
        const filtered = filter ? filter(event, client) : event;
        if (!filtered) continue;
        const serialized = JSON.stringify(filtered);
        try {
          client.send(serialized);
        } catch {
          // A socket can close between route dispatch and broadcast. Do not let
          // one stale connection abort delivery to the rest of the campaign.
          this.clients.delete(client);
        }
      }
    }
  }
}
