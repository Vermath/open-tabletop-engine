import type { EngineEvent, RealtimePresenceEnvelope } from "@open-tabletop/core";

export interface RealtimeClient {
  campaignId?: string;
  userId?: string;
  sessionId?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  activeSceneId?: string;
  send(data: string): void;
  close?(): void;
}

export type RealtimeEventFilter = (event: EngineEvent, client: RealtimeClient) => EngineEvent | undefined;

export type RealtimeHubLifecycleEvent = "connected" | "disconnected" | "revoked" | "send_failure";

export class RealtimeHub {
  private readonly clients = new Set<RealtimeClient>();

  constructor(private readonly observeLifecycle?: (event: RealtimeHubLifecycleEvent) => void) {}

  add(client: RealtimeClient): void {
    const size = this.clients.size;
    this.clients.add(client);
    if (this.clients.size !== size) this.observeLifecycle?.("connected");
  }

  remove(client: RealtimeClient): boolean {
    const removed = this.clients.delete(client);
    if (removed) this.observeLifecycle?.("disconnected");
    return removed;
  }

  clientsMatching(input: { campaignId: string; userId?: string }): RealtimeClient[] {
    return [...this.clients].filter((client) => client.campaignId === input.campaignId && (!input.userId || client.userId === input.userId));
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

  disconnectSession(sessionId: string): RealtimeClient[] {
    return this.disconnectWhere((client) => client.sessionId === sessionId);
  }

  disconnectWhere(predicate: (client: RealtimeClient) => boolean): RealtimeClient[] {
    const removed: RealtimeClient[] = [];
    for (const client of this.clients) {
      if (!predicate(client)) continue;
      this.clients.delete(client);
      this.observeLifecycle?.("revoked");
      removed.push(client);
      try {
        client.close?.();
      } catch {
        // The socket may already be closing. It has still been removed from
        // the hub, so later broadcasts cannot cross the changed auth scope.
      }
    }
    return removed;
  }

  broadcastPresence(envelope: RealtimePresenceEnvelope, filter?: (client: RealtimeClient) => boolean): void {
    const serialized = JSON.stringify(envelope);
    for (const client of this.clients) {
      if (client.campaignId !== envelope.campaignId || (filter && !filter(client))) continue;
      try {
        client.send(serialized);
      } catch {
        if (this.clients.delete(client)) this.observeLifecycle?.("send_failure");
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
          if (this.clients.delete(client)) this.observeLifecycle?.("send_failure");
        }
      }
    }
  }
}
