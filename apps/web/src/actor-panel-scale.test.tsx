import type { Actor } from "@open-tabletop/core";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ActorPanel } from "./actor-panel.js";

const timestamp = "2026-07-17T00:00:00.000Z";

function actorFixture(index: number): Actor {
  return {
    id: `actor-${index}`,
    campaignId: "campaign-1",
    systemId: "campaign-scale-test",
    name: `Sentinel ${String(index).padStart(2, "0")}`,
    type: index % 2 === 0 ? "character" : "npc",
    data: {},
    createdAt: timestamp,
    updatedAt: timestamp
  } as Actor;
}

describe("ActorPanel campaign-scale actor placement", () => {
  const actors = Array.from({ length: 48 }, (_, index) => actorFixture(index + 1));
  const browserWindow = globalThis.window;

  beforeAll(() => {
    vi.stubGlobal("window", { innerWidth: 1440, innerHeight: 900 });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    if (browserWindow) vi.stubGlobal("window", browserWindow);
  });

  function props(initialPlacementSearch = ""): ComponentProps<typeof ActorPanel> {
    return {
      campaignId: "campaign-1",
      actor: actors[0],
      currentUserId: "user-1",
      actors,
      tokens: [],
      members: [],
      assets: [],
      items: [],
      initialPlacementSearch,
      compendiumEntries: [],
      compendiumSearch: "",
      setCompendiumSearch: vi.fn(),
      compendiumStatus: "",
      updateActorHp: vi.fn(),
      adjustActorHp: vi.fn(),
      awardActorXp: vi.fn(async () => undefined),
      advancementReady: false,
      onLevelUp: vi.fn(),
      onPreviewRestActor: vi.fn(async () => ({}) as never),
      onRestActor: vi.fn(),
      onTypedDamageApplied: vi.fn(),
      updateActorData: vi.fn(),
      toggleActorCondition: vi.fn(),
      updateItemData: vi.fn(async () => undefined),
      changeActorAttunement: vi.fn(async () => undefined),
      assignItemToActor: vi.fn(async () => undefined),
      onSpellPreparationApplied: vi.fn(),
      updateToken: vi.fn(),
      onUploadTokenImage: vi.fn(async () => undefined),
      targetToken: vi.fn(),
      targetTokens: vi.fn(),
      deleteToken: vi.fn(),
      deleteActor: vi.fn(async () => undefined),
      updateTokenVision: vi.fn(async () => true),
      useActorAction: vi.fn(),
      onImportCompendiumEntry: vi.fn(async () => undefined),
      onPurchaseCompendiumEntry: vi.fn(async () => undefined),
      onPlaceActor: vi.fn(async () => undefined),
      canCreateToken: true,
      canUpdateActor: false,
      canAwardActorXp: false,
      canRestActor: false,
      canUpdateToken: false,
      canDeleteToken: false,
      canDeleteActor: false,
      canUseAction: false
    };
  }

  it("renders all actors above sixteen through the real panel", () => {
    const html = renderToStaticMarkup(<ActorPanel {...props()} />);

    expect(html).toContain("Showing 48 of 48 actors.");
    expect(html).toContain("Sentinel 48");
    expect(html.match(/aria-label="Place Sentinel/g)).toHaveLength(48);
  });

  it("searches the complete roster through the real panel without losing late records", () => {
    const html = renderToStaticMarkup(<ActorPanel {...props("sentinel 48")} />);

    expect(html).toContain('value="sentinel 48"');
    expect(html).toContain("Showing 1 of 48 actors.");
    expect(html).toContain("Sentinel 48");
    expect(html).not.toContain("Sentinel 47");
  });
});
