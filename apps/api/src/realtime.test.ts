import { createEvent } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { RealtimeHub, type RealtimeClient } from "./realtime.js";

describe("RealtimeHub", () => {
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
