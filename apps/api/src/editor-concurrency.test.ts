import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

describe("editor optimistic concurrency", () => {
  it("rejects a stale journal save without overwriting the newer entry", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const original = store.state.journals.find((entry) => entry.id === "jnl_hook")!;
      const openedAt = original.updatedAt;
      const first = await app.inject({
        method: "PATCH",
        url: "/api/v1/journal/jnl_hook",
        headers: { ...gmHeaders, "idempotency-key": "editor-journal-first" },
        payload: { expectedUpdatedAt: openedAt, title: "First editor won" }
      });

      expect(first.statusCode).toBe(200);
      expect(first.json().updatedAt).not.toBe(openedAt);

      const stale = await app.inject({
        method: "PATCH",
        url: "/api/v1/journal/jnl_hook",
        headers: { ...gmHeaders, "idempotency-key": "editor-journal-stale" },
        payload: { expectedUpdatedAt: openedAt, title: "Stale overwrite" }
      });

      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ error: "conflict", code: "stale_write" });
      expect(store.state.journals.find((entry) => entry.id === "jnl_hook")?.title).toBe("First editor won");
    } finally {
      await app.close();
    }
  });

  it("rejects stale handout content but does not treat a read receipt as a content edit", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/handouts",
        headers: { ...gmHeaders, "idempotency-key": "editor-handout-create" },
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt,
          title: "Shared clue",
          body: "Original",
          visibility: "public"
        }
      });
      expect(created.statusCode).toBe(200);
      const handout = created.json() as { id: string; updatedAt: string };

      const read = await app.inject({
        method: "POST",
        url: `/api/v1/handouts/${handout.id}/read`,
        headers: { "x-user-id": "usr_demo_player" }
      });
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({ updatedAt: handout.updatedAt, readByUserIds: ["usr_demo_player"] });

      const first = await app.inject({
        method: "PATCH",
        url: `/api/v1/handouts/${handout.id}`,
        headers: { ...gmHeaders, "idempotency-key": "editor-handout-first" },
        payload: { expectedUpdatedAt: handout.updatedAt, body: "Current content" }
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().updatedAt).not.toBe(handout.updatedAt);

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/handouts/${handout.id}`,
        headers: { ...gmHeaders, "idempotency-key": "editor-handout-stale" },
        payload: { expectedUpdatedAt: handout.updatedAt, body: "Stale content" }
      });

      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ error: "conflict" });
      expect(store.state.handouts.find((entry) => entry.id === handout.id)?.body).toBe("Current content");
    } finally {
      await app.close();
    }
  });
});
