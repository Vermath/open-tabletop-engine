import type { Actor, CampaignSearchResult, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };

describe("actionable campaign search", () => {
  it("ranks exact, normalized, fuzzy and duplicate names deterministically with typed targets", async () => {
    const store = new MemoryStateStore();
    const baseActor = store.state.actors.find((actor) => actor.id === "act_valen")!;
    const makeActor = (id: string, name: string): Actor => ({ ...structuredClone(baseActor), id, name });
    store.state.actors.push(
      makeActor("act_search_named", "Sir O'Brien"),
      makeActor("act_search_twin_a", "Search Twin"),
      makeActor("act_search_twin_b", "Search Twin"),
    );
    const item: Item = {
      id: "itm_search_exact",
      campaignId: baseActor.campaignId,
      systemId: baseActor.systemId,
      actorId: baseActor.id,
      type: "equipment",
      name: "Navigator's Compass",
      data: { category: "tool" },
      createdAt: baseActor.createdAt,
      updatedAt: baseActor.updatedAt,
    };
    store.state.items.push(item);
    const app = await buildApp({ store });

    const search = async (query: string, types: string, extra = "") => {
      const response = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/search?q=${encodeURIComponent(query)}&types=${types}${extra}`, headers });
      expect(response.statusCode).toBe(200);
      return response.json() as CampaignSearchResult[];
    };

    try {
      const exactId = await search("act_search_named", "actor");
      expect(exactId[0]).toMatchObject({ id: "act_search_named", matchKind: "exact_id", target: { type: "actor", id: "act_search_named", sourceKind: "campaign" } });

      const normalized = await search("sir obrien", "actor");
      expect(normalized[0]).toMatchObject({ id: "act_search_named", matchKind: "normalized_name" });

      const fuzzy = await search("sir obrin", "actor");
      expect(fuzzy[0]).toMatchObject({ id: "act_search_named", matchKind: "fuzzy" });

      const firstTwin = await search("Search Twin", "actor", "&limit=1");
      const secondTwin = await search("Search Twin", "actor", "&limit=1&offset=1");
      expect(firstTwin[0]?.id).toBe("act_search_twin_a");
      expect(secondTwin[0]?.id).toBe("act_search_twin_b");

      const exactItem = await search(item.id, "item");
      expect(exactItem[0]).toMatchObject({
        id: item.id,
        matchKind: "exact_id",
        target: { type: "item", id: item.id, actorId: baseActor.id, sourceKind: "actor_instance" },
      });

      const rules = await search("longsword", "compendium");
      expect(rules[0]).toMatchObject({
        id: "longsword",
        matchKind: "exact_id",
        target: { type: "compendium", id: "longsword", systemId: "dnd-5e-srd", sourceKind: "srd" },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid pagination without leaking search details", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/search?q=Valen&offset=-1", headers });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "Bad Request", message: "querystring/offset must be >= 0" });
    } finally {
      await app.close();
    }
  });
});
