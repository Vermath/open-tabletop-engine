import { createEvent } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { RealtimeHub, type RealtimeClient } from "./realtime.js";

describe("RealtimeHub", () => {
  it("emits bounded lifecycle outcomes without client identity", () => {
    const events: string[] = [];
    const hub = new RealtimeHub((event) => events.push(event));
    const client: RealtimeClient = { campaignId: "camp_secret", sessionId: "sess_secret", send: () => { throw new Error("closed"); } };
    hub.add(client);
    hub.broadcast(createEvent({ campaignId: "camp_secret", type: "scene.updated", targetId: "scene_secret", payload: {} }));
    expect(events).toEqual(["connected", "send_failure"]);
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("removes a failed client without aborting delivery to healthy clients", () => {
    const hub = new RealtimeHub();
    const failedClient: RealtimeClient = {
      campaignId: "camp_test",
      userId: "usr_failed",
      send: () => {
        throw new Error("socket closed");
      }
    };
    const healthySend = vi.fn();
    hub.add(failedClient);
    hub.add({
      campaignId: "camp_test",
      userId: "usr_healthy",
      send: healthySend
    });
    const event = createEvent({
      campaignId: "camp_test",
      type: "chat.message.created",
      targetId: "msg_test",
      payload: { id: "msg_test" }
    });

    expect(() => hub.broadcast(event)).not.toThrow();
    expect(healthySend).toHaveBeenCalledOnce();
    expect(hub.countMatching({ campaignId: "camp_test" })).toBe(1);
  });

  it("disconnects every client that no longer passes the current authorization predicate", () => {
    const events: string[] = [];
    const revokedClose = vi.fn();
    const retainedClose = vi.fn();
    const hub = new RealtimeHub((event) => events.push(event));
    hub.add({ campaignId: "camp_test", sessionId: "sess_revoked", send: vi.fn(), close: revokedClose });
    hub.add({ campaignId: "camp_test", sessionId: "sess_current", send: vi.fn(), close: retainedClose });

    expect(hub.disconnectWhere((client) => client.sessionId === "sess_revoked")).toHaveLength(1);
    expect(revokedClose).toHaveBeenCalledOnce();
    expect(retainedClose).not.toHaveBeenCalled();
    expect(hub.countMatching({ campaignId: "camp_test" })).toBe(1);
    expect(events).toEqual(["connected", "connected", "revoked"]);
  });

  it("propagates serialization defects without evicting healthy clients", () => {
    const hub = new RealtimeHub();
    const send = vi.fn();
    hub.add({ campaignId: "camp_test", userId: "usr_healthy", send });
    const cyclicPayload: Record<string, unknown> = {};
    cyclicPayload.self = cyclicPayload;
    const event = createEvent({
      campaignId: "camp_test",
      type: "chat.message.created",
      targetId: "msg_cyclic",
      payload: cyclicPayload
    });

    expect(() => hub.broadcast(event)).toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(hub.countMatching({ campaignId: "camp_test" })).toBe(1);
  });
});
