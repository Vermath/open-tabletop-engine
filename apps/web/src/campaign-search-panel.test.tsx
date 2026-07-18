import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignSearchPanel, appendCampaignSearchPage, campaignSearchAnchorId, campaignSearchDestination, campaignSearchItemActorId, campaignSearchMatchLabel, campaignSearchPageSize, campaignSearchPath, campaignSearchSourceLabel, campaignSearchTypeHasRenderedAnchor, campaignSearchTypeLabel, campaignSearchWorldScope, type CampaignSearchResult } from "./campaign-search-panel.js";

function searchResult(id: string): CampaignSearchResult {
  return {
    type: "journal",
    id,
    title: `Result ${id}`,
    snippet: "Search result",
    updatedAt: "2026-07-18T00:00:00.000Z",
    score: 1,
    matchKind: "title",
    target: { type: "journal", id, sourceKind: "campaign" }
  };
}

describe("campaign search panel", () => {
  it("builds a bounded, encoded permission-safe search request", () => {
    expect(campaignSearchPath("camp one", { query: "  ancient vault  ", type: "handout", worldId: "world/one" })).toBe(
      "/api/v1/campaigns/camp%20one/search?q=ancient+vault&limit=50&types=handout&worldId=world%2Fone"
    );
    expect(campaignSearchPath("camp", { query: "17", type: "roll", worldId: "", limit: 12 })).toContain("types=roll");
    expect(campaignSearchPath("camp", { query: "goblin", type: "encounter", worldId: "", offset: 50 })).toContain("offset=50");
  });

  it("clears a deleted or revoked stored world scope", () => {
    const worlds = [{ id: "world-visible" }];
    expect(campaignSearchWorldScope("world-visible", worlds)).toBe("world-visible");
    expect(campaignSearchWorldScope("world-revoked", worlds)).toBe("");
    expect(campaignSearchWorldScope("world-deleted", [])).toBe("");
  });

  it("appends explicit 50-row pages and stops after a short page", () => {
    const first = Array.from({ length: campaignSearchPageSize }, (_, index) => searchResult(`result-${index}`));
    const firstPage = appendCampaignSearchPage([], first);
    expect(firstPage).toMatchObject({ hasMore: true });
    expect(firstPage.results).toHaveLength(50);

    const second = [searchResult("result-49"), searchResult("result-50")];
    const secondPage = appendCampaignSearchPage(firstPage.results, second);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.results).toHaveLength(51);
    expect(campaignSearchPath("camp", { query: "vault", type: "all", worldId: "", offset: 50 })).toContain("offset=50");
  });

  it("renders a discoverable empty search surface without issuing a server request", () => {
    const request = vi.fn();
    const html = renderToStaticMarkup(<CampaignSearchPanel campaignId="camp-1" worlds={[]} onOpenResult={vi.fn()} request={request} />);
    expect(html).toContain("Campaign Search");
    expect(html).toContain("Search this campaign");
    expect(html).toContain("NPC, clue, item, message, or roll");
    expect(html).toContain("Search only returns records this seat is allowed to read.");
    expect(request).not.toHaveBeenCalled();
  });

  it("uses friendly singular result labels", () => {
    expect(campaignSearchTypeLabel("memory")).toBe("Canon");
    expect(campaignSearchTypeLabel("roll")).toBe("Roll");
    expect(campaignSearchTypeLabel("world")).toBe("World");
  });

  it("routes results to the workspace that can operate on them", () => {
    expect(campaignSearchDestination("world")).toEqual({ workspace: "prep", tab: "worlds" });
    expect(campaignSearchDestination("actor")).toEqual({ workspace: "prep", tab: "actors" });
    expect(campaignSearchDestination("roll")).toEqual({ workspace: "live", tab: "chat" });
    expect(campaignSearchDestination("encounter")).toEqual({ workspace: "live", tab: "combat" });
    expect(campaignSearchDestination("compendium")).toEqual({ workspace: "live", tab: "compendium" });
  });

  it("provides stable anchors only for panels that render individual search records", () => {
    expect(campaignSearchAnchorId("journal", "entry/one")).toBe("campaign-search-journal-entry%2Fone");
    expect(campaignSearchTypeHasRenderedAnchor("journal")).toBe(true);
    expect(campaignSearchTypeHasRenderedAnchor("roll")).toBe(true);
    expect(campaignSearchTypeHasRenderedAnchor("encounter")).toBe(false);
  });

  it("does not invent an actor-sheet destination for an unassigned item", () => {
    const items = [{ id: "owned", actorId: "actor-1" }, { id: "unassigned" }];
    expect(campaignSearchItemActorId(items, "owned")).toBe("actor-1");
    expect(campaignSearchItemActorId(items, "unassigned")).toBeUndefined();
    expect(campaignSearchItemActorId(items, "missing")).toBeUndefined();
  });

  it("labels result exactness and provenance", () => {
    expect(campaignSearchMatchLabel("exact_id")).toBe("Exact ID");
    expect(campaignSearchMatchLabel("normalized_name")).toBe("Exact name");
    expect(campaignSearchMatchLabel("fuzzy")).toBe("Close name");
    expect(campaignSearchSourceLabel("actor_instance")).toBe("Actor-owned instance");
    expect(campaignSearchSourceLabel("srd")).toBe("Bundled SRD");
  });
});
