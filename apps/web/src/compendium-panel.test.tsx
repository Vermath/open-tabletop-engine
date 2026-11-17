import type { Actor, CompendiumCatalogEntry, Item } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { COMPENDIUM_CATALOG_WINDOW_SIZE, CompendiumPanel, compendiumCatalogPath, compendiumCatalogWindow, compendiumEntryAnchorId, compendiumEntryUpdateState, conflictChoiceDetail, conflictChoiceLabel } from "./compendium-panel.js";

const timestamp = "2026-07-13T00:00:00.000Z";

const actor = {
  id: "actor-1",
  campaignId: "campaign-1",
  systemId: "dnd-5e-srd",
  ownerUserId: "user-1",
  type: "character",
  name: "Nyx",
  data: {},
  permissions: {},
  createdAt: timestamp,
  updatedAt: timestamp
} as Actor;

const entry = {
  id: "bedroll",
  type: "item",
  name: "Bedroll",
  summary: "A portable bedroll.",
  data: { costGp: 1 },
  provenance: {
    sourceKind: "srd",
    sourceName: "Dungeons & Dragons System Reference Document",
    sourceVersion: "5.2.1",
    contentVersion: "5.2.1",
    systemId: "dnd-5e-srd",
    systemVersion: "5.2.1",
    rulesVersion: "SRD 5.2.1",
    license: { name: "CC BY 4.0", usage: "srd" }
  }
} satisfies CompendiumCatalogEntry;

describe("CompendiumPanel", () => {
  it("provides a stable exact-record focus target", () => {
    expect(compendiumEntryAnchorId("srd/longsword")).toBe("campaign-search-compendium-srd%2Flongsword");
  });
  it("renders a standalone, accessible system and actor selection surface", () => {
    const html = renderToStaticMarkup(
      <CompendiumPanel
        campaignId="campaign-1"
        systems={[{ id: "dnd-5e-srd", name: "D&D 5.5e SRD", version: "5.2.1", active: true }]}
        actors={[actor]}
        items={[]}
        canUpdateActor={() => true}
        onMutation={vi.fn()}
        onStatus={vi.fn()}
      />
    );

    expect(html).toContain("Campaign library");
    expect(html).toContain("Browse source-backed rules content without selecting a token or opening an actor sheet.");
    expect(html).toContain("Actor for actions");
    expect(html).toContain("Choose an actor");
    expect(html).toContain("D&amp;D 5.5e SRD v5.2.1");
    expect(html).toContain('role="status"');
  });

  it("reports current, update, and legacy provenance state for the chosen actor", () => {
    const currentItem = {
      id: "item-1",
      campaignId: "campaign-1",
      systemId: "dnd-5e-srd",
      actorId: actor.id,
      type: "item",
      name: "Bedroll",
      data: { compendiumId: entry.id, compendiumProvenance: entry.provenance },
      createdAt: timestamp,
      updatedAt: timestamp
    } as Item;
    expect(compendiumEntryUpdateState(actor, [currentItem], entry).label).toBe("Current v5.2.1");
    expect(compendiumEntryUpdateState(actor, [{ ...currentItem, data: { ...currentItem.data, compendiumProvenance: { ...entry.provenance, contentVersion: "5.2.0" } } }], entry).label).toBe("Update 5.2.0 to 5.2.1");
    expect(compendiumEntryUpdateState(actor, [{ ...currentItem, data: { compendiumId: entry.id } }], entry).label).toBe("Legacy version - review");
  });

  it("makes merge and replace semantics explicit and implements retryable local errors", () => {
    expect(compendiumCatalogPath("campaign/one", "dnd 5e", " healing word ", "spell")).toBe(
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%205e/compendium?q=healing+word&type=spell"
    );
    expect(conflictChoiceLabel("keep_existing", "import")).toBe("Keep existing (no changes)");
    expect(conflictChoiceLabel("merge_existing", "purchase")).toBe("Merge quantity and charge cost");
    expect(conflictChoiceLabel("replace_existing", "purchase")).toBe("Replace in place and reset quantity");
    expect(conflictChoiceDetail(["keep_existing", "merge_existing"], "purchase")).toContain("Merge adds the requested mundane quantity");
    expect(conflictChoiceDetail(["keep_existing", "replace_existing"], "purchase")).toContain("resetting quantity and purchase cost");

    const source = readFileSync(resolve(__dirname, "compendium-panel.tsx"), "utf8");
    expect(source).toContain("Loading compendium entries...");
    expect(source).toContain("Retry loading");
    expect(source).toContain("Retry same action");
    expect(source).toContain("Nothing is charged, stacked, or replaced until you choose.");
    expect(source).toContain("The latest revision is loaded; review and retry.");
    expect(source).toContain("staleActorFromError");
    expect(source).toContain("expectedUpdatedAt");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("Sources and licenses");
    expect(source).toContain("visibleCatalog.items.map");
    expect(source).not.toContain("actorId === undefined");
    expect(source).not.toContain("console.error");
  });

  it("mounts a bounded result window even for very large catalogs", () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => `entry-${index}`);
    const first = compendiumCatalogWindow(entries, 0);
    const middle = compendiumCatalogWindow(entries, 123);
    const last = compendiumCatalogWindow(entries, Number.MAX_SAFE_INTEGER);

    expect(first.items).toHaveLength(COMPENDIUM_CATALOG_WINDOW_SIZE);
    expect(middle.items).toHaveLength(COMPENDIUM_CATALOG_WINDOW_SIZE);
    expect(last.items.length).toBeLessThanOrEqual(COMPENDIUM_CATALOG_WINDOW_SIZE);
    expect(last.items.at(-1)).toBe("entry-9999");
  });
});
