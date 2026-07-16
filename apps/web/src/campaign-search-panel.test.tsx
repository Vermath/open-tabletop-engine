import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignSearchPanel, campaignSearchAnchorId, campaignSearchDestination, campaignSearchItemActorId, campaignSearchMatchLabel, campaignSearchPath, campaignSearchSourceLabel, campaignSearchTypeHasRenderedAnchor, campaignSearchTypeLabel } from "./campaign-search-panel.js";

describe("campaign search panel", () => {
  it("builds a bounded, encoded permission-safe search request", () => {
    expect(campaignSearchPath("camp one", { query: "  ancient vault  ", type: "handout", worldId: "world/one" })).toBe(
      "/api/v1/campaigns/camp%20one/search?q=ancient+vault&limit=50&types=handout&worldId=world%2Fone"
    );
    expect(campaignSearchPath("camp", { query: "17", type: "roll", worldId: "", limit: 12 })).toContain("types=roll");
    expect(campaignSearchPath("camp", { query: "goblin", type: "encounter", worldId: "", offset: 50 })).toContain("offset=50");
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
