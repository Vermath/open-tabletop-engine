import type { Actor, Item } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActorLoadoutPanel, actorLoadoutOperationError, filterActorLoadoutItems } from "./actor-loadout-panel.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function actorFixture(data: Record<string, unknown> = {}): Actor {
  return {
    id: "actor-1",
    campaignId: "campaign-1",
    systemId: "dnd-5e-srd",
    name: "Nyx",
    type: "character",
    data,
    createdAt: timestamp,
    updatedAt: timestamp
  } as Actor;
}

function itemFixture(id: string, name: string, type: string, data: Record<string, unknown>, actorId = "actor-1"): Item {
  return {
    id,
    campaignId: "campaign-1",
    actorId,
    name,
    type,
    data,
    createdAt: timestamp,
    updatedAt: timestamp
  } as Item;
}

describe("ActorLoadoutPanel", () => {
  it("filters loadout items by inventory state, magic kind, and searchable metadata", () => {
    const sword = itemFixture("sword", "Longsword", "weapon", { equipped: true, category: "martial" });
    const potion = itemFixture("potion", "Potion", "consumable", { equipped: false, quantity: 2 });
    const spell = itemFixture("spell", "Fire Bolt", "spell", { prepared: true, category: "evocation" });
    const clue = itemFixture("clue", "Cipher", "clue", {});
    const items = [sword, potion, spell, clue];

    expect(filterActorLoadoutItems(items, "", "equipped")).toEqual([sword]);
    expect(filterActorLoadoutItems(items, "", "consumable")).toEqual([potion]);
    expect(filterActorLoadoutItems(items, "", "magic")).toEqual([spell]);
    expect(filterActorLoadoutItems(items, "EVOCATION", "all")).toEqual([spell]);
  });

  it("renders permission-gated preparation and attunement controls with explicit status", () => {
    const actor = actorFixture({ attunedItemIds: ["wand"] });
    const items = [
      itemFixture("blessing", "Ancestral Blessing", "spell", { prepared: true, alwaysPrepared: true }),
      itemFixture("wand", "Wand of Sparks", "equipment", { equipped: true, requiresAttunement: true })
    ];
    const html = renderToStaticMarkup(
      <ActorLoadoutPanel
        actor={actor}
        actors={[actor]}
        items={items}
        search=""
        filter="all"
        canUpdateActor={false}
        onSearchChange={vi.fn()}
        onFilterChange={vi.fn()}
        updateItemData={vi.fn(async () => undefined)}
        changeActorAttunement={vi.fn(async () => undefined)}
        assignItemToActor={vi.fn(async () => undefined)}
        onSpellPreparationApplied={vi.fn()}
      />
    );

    expect(html).toContain("Actor loadout sheet");
    expect(html).toContain("Always available");
    expect(html).toContain("Attuned");
    expect(html).toContain("Unattune");
    expect(html).toContain("D&amp;D spell preparation");
    expect(html).not.toContain('aria-label="Ancestral Blessing prepared"');
    expect(html).toContain('aria-label="Wand of Sparks equipped"');
    expect(html).toContain("Unattune</button>");
  });

  it("formats actionable mutation failures", () => {
    expect(actorLoadoutOperationError("Attune Wand of Sparks", new Error("limit reached"))).toBe("Attune Wand of Sparks failed: limit reached");
  });

  it("renders a manager-only documented curse-break transaction", () => {
    const actor = actorFixture({ rulesEngine: { attunedItemIds: ["cursed-ring"] } });
    const cursedRing = itemFixture("cursed-ring", "Cursed Ring", "equipment", {
      equipped: true,
      requiresAttunement: true,
      cursed: true
    });
    const html = renderToStaticMarkup(
      <ActorLoadoutPanel
        actor={actor}
        actors={[actor]}
        items={[cursedRing]}
        search=""
        filter="all"
        canUpdateActor
        canManageActorRules
        onSearchChange={vi.fn()}
        onFilterChange={vi.fn()}
        updateItemData={vi.fn(async () => undefined)}
        changeActorAttunement={vi.fn(async () => undefined)}
        assignItemToActor={vi.fn(async () => undefined)}
        onSpellPreparationApplied={vi.fn()}
      />
    );

    expect(html).toContain("Curse-break ruling");
    expect(html).toContain('aria-label="Cursed Ring curse-break reason"');
    expect(html).toContain("Break curse &amp; unattune");
    expect(html).toContain("disabled");
  });

  it("uses a visible retryable alert instead of console-only mutation failures", () => {
    const source = readFileSync(resolve(__dirname, "actor-loadout-panel.tsx"), "utf8");

    expect(source).toContain('role={operation.kind === "error" ? "alert" : "status"}');
    expect(source).toContain("retryOperation");
    expect(source).toContain("Retry");
    expect(source).not.toContain("console.error");
  });
});
