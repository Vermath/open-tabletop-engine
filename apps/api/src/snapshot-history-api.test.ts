import type { ChatMessage } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("bounded campaign snapshot history", () => {
  it("bounds history after applying the caller's permission filters", async () => {
    const store = new MemoryStateStore();
    const messages: ChatMessage[] = Array.from({ length: 6 }, (_, index) => {
      const timestamp = `2026-07-13T12:00:0${index}.000Z`;
      return {
        id: `msg_snapshot_${index}`,
        campaignId: "camp_demo",
        userId: "usr_demo_gm",
        type: "plain",
        body: `message ${index}`,
        visibility: index === 5 ? "gm_only" : "public",
        recipientUserIds: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });
    store.state.chat.push(...messages);
    const app = await buildApp({ store });

    try {
      const gm = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot?historyLimit=3", headers: gmHeaders });
      const player = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot?historyLimit=3", headers: playerHeaders });

      expect(gm.statusCode).toBe(200);
      expect(gm.json().chat.map((message: ChatMessage) => message.id)).toEqual(["msg_snapshot_3", "msg_snapshot_4", "msg_snapshot_5"]);
      expect(gm.json().history.collections.chat).toEqual({ total: 6, returned: 3, truncated: true });
      expect(player.statusCode).toBe(200);
      expect(player.json().chat.map((message: ChatMessage) => message.id)).toEqual(["msg_snapshot_2", "msg_snapshot_3", "msg_snapshot_4"]);
      expect(player.json().chat).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "msg_snapshot_5" })]));
      expect(player.json().history.collections.chat).toEqual({ total: 5, returned: 3, truncated: true });
    } finally {
      await app.close();
    }
  });
});
