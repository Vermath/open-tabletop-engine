import type { Actor } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActorPlacementTray, filterActorPlacementActors } from "./actor-placement-tray.js";

const timestamp = "2026-07-17T00:00:00.000Z";

function actorFixture(index: number): Actor {
  return {
    id: `actor-${index}`,
    campaignId: "campaign-1",
    systemId: "dnd-5e-srd",
    name: `Sentinel ${String(index).padStart(2, "0")}`,
    type: index % 2 === 0 ? "character" : "npc",
    data: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  } as Actor;
}

describe("actor placement tray", () => {
  const actors = Array.from({ length: 48 }, (_, index) => actorFixture(index + 1));

  it("renders every actor in a campaign-scale roster above the former eight-record cap", () => {
    const html = renderToStaticMarkup(
      <ActorPlacementTray actors={actors} search="" canCreateToken onSearchChange={vi.fn()} onPlaceActor={vi.fn()} />
    );

    expect(html).toContain("Showing 48 of 48 actors.");
    expect(html).toContain("Sentinel 48");
    expect(html.match(/aria-label="Place Sentinel/g)).toHaveLength(48);
  });

  it("filters the complete roster without truncating later matches", () => {
    expect(filterActorPlacementActors(actors, "sentinel 48").map((actor) => actor.id)).toEqual(["actor-48"]);
    const html = renderToStaticMarkup(
      <ActorPlacementTray actors={actors} search="sentinel 48" canCreateToken onSearchChange={vi.fn()} onPlaceActor={vi.fn()} />
    );

    expect(html).toContain("Showing 1 of 48 actors.");
    expect(html).toContain("Sentinel 48");
    expect(html).not.toContain("Sentinel 47");
  });

  it("renders an explicit no-match state and permission-disabled controls", () => {
    const empty = renderToStaticMarkup(
      <ActorPlacementTray actors={actors} search="missing actor" canCreateToken onSearchChange={vi.fn()} onPlaceActor={vi.fn()} />
    );
    const readOnly = renderToStaticMarkup(
      <ActorPlacementTray actors={[actors[0]!]} search="" canCreateToken={false} onSearchChange={vi.fn()} onPlaceActor={vi.fn()} />
    );

    expect(empty).toContain("No actors match this search.");
    expect(readOnly).toContain("Requires token.create");
    expect(readOnly).toContain("disabled");
  });
});
