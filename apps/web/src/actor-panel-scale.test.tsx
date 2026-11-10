import type { Actor, Token } from "@open-tabletop/core";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ActorPanel } from "./actor-panel.js";

const timestamp = "2026-07-17T00:00:00.000Z";

function actorFixture(index: number): Actor {
  return {
    id: `actor-${index}`,
    campaignId: "campaign-1",
    systemId: "generic-fantasy",
    name: `Sentinel ${String(index).padStart(2, "0")}`,
    type: index % 2 === 0 ? "character" : "npc",
    data: {},
    createdAt: timestamp,
    updatedAt: timestamp
  } as Actor;
}

function tokenFixture(input: Partial<Token> = {}): Token {
  return {
    id: "token-1",
    sceneId: "scene-1",
    name: "Standalone marker",
    x: 100,
    y: 150,
    width: 50,
    height: 50,
    rotation: 45,
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 60,
    disposition: "neutral",
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input
  };
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

  it("waits for an external sheet without inventing HP or generic actions", () => {
    const panelProps = props();
    const html = renderToStaticMarkup(<ActorPanel {...panelProps} actor={{ ...actors[0]!, systemId: "external-custom-rules" }} canDeleteActor />);
    expect(html).toContain("Loading character sheet...");
    expect(html).toContain("Sentinel 01");
    expect(html).toContain("Token settings");
    expect(html).toContain("Delete actor");
    expect(html).not.toContain('aria-label="Actor at a glance"');
    expect(html).not.toContain('aria-label="Actor sheet current HP"');
    expect(html).not.toContain('aria-label="Actor action sheet"');
    expect(html).not.toContain("1d20");
  });

  it("keeps advanced actor maintenance behind native disclosures", () => {
    const panelProps = props();
    const html = renderToStaticMarkup(<ActorPanel {...panelProps} canDeleteActor />);
    const actorDetailsStart = html.indexOf('<details class="operator-section actor-detail-disclosure actor-advanced-details"');
    const actorDetails = html.slice(actorDetailsStart);

    expect(actorDetailsStart).toBeGreaterThan(0);
    expect(actorDetails.match(/^<details[^>]*>/)?.[0]).not.toContain("open=");
    expect(actorDetails).toContain('<summary>Actor details</summary><div class="actor-detail-body">');
    expect(actorDetails).toContain('aria-label="Actor conditions"');
    expect(actorDetails).toContain('<summary>Raw actor data</summary>');
    expect(actorDetails).toContain('Delete actor');
    expect(html.slice(0, actorDetailsStart)).not.toContain('Delete actor');
    expect(html).toContain('<summary>Token settings</summary><div class="actor-detail-body actor-token-editor-body">');
    expect(html).toContain('<summary>Custom conditions &amp; rulings</summary>');
  });

  it("searches the complete roster through the real panel without losing late records", () => {
    const html = renderToStaticMarkup(<ActorPanel {...props("sentinel 48")} />);

    expect(html).toContain('value="sentinel 48"');
    expect(html).toContain("Showing 1 of 48 actors.");
    expect(html).toContain("Sentinel 48");
    expect(html).not.toContain("Sentinel 47");
  });

  it.each([
    { label: "an unlinked token", actorIndex: undefined, actorId: undefined, status: "No actor linked." },
    { label: "an unlinked token with a stale actor prop", actorIndex: 0, actorId: undefined, status: "No actor linked." },
    { label: "a token whose linked actor is unavailable", actorIndex: undefined, actorId: "missing-actor", status: "Linked actor unavailable." },
    { label: "a token paired with the wrong actor", actorIndex: 0, actorId: "actor-2", status: "Linked actor unavailable." }
  ])("keeps the full token editor available for $label", ({ actorIndex, actorId, status }) => {
    const token = tokenFixture({ actorId });
    const panelProps = props();
    const html = renderToStaticMarkup(<ActorPanel {...panelProps} actor={actorIndex === undefined ? undefined : actors[actorIndex]} token={token} tokens={[token]} canUpdateActor canUseAction canDeleteActor canUpdateToken />);
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
    const tokenSettings = html.match(/<details\b[^>]*\bactor-token-editor\b[^>]*>/)?.[0];

    expect(header).toContain(token.name);
    expect(header).toContain(">Token<");
    expect(html).toContain(status);
    expect(tokenSettings).toContain('open=""');
    for (const label of ["Token inspector name", "Token inspector actor", "Token image asset", "Token layer", "Token rotation", "Token elevation", "Token conditions", "Token auras", "Token notes", "Canvas target manager"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('id="token-vision-enabled"');
    expect(html).toContain('id="token-dim-vision"');
    expect(html).toContain('id="token-bright-vision"');
    expect(html).toContain('id="token-senses"');
    expect(html).toContain(`value="${token.name}"`);
    if (!actorId) expect(html).toMatch(/<option\b[^>]*value=""[^>]*selected=""[^>]*>Unlinked<\/option>/);
    expect(html).not.toContain('title="Linked token"');
    expect(html).not.toContain('aria-label="Actor at a glance"');
    expect(html).not.toContain('aria-label="Actor sheet views"');
    expect(html).not.toContain('aria-label="Actor sheet current HP"');
    expect(html).not.toContain('aria-label="Actor action sheet"');
    expect(html).not.toContain('Delete actor');
  });

  it.each([
    { canUpdateActor: false, canUpdateToken: true, canDeleteToken: false },
    { canUpdateActor: true, canUpdateToken: false, canDeleteToken: true }
  ])("preserves token permissions independently of actor permissions: %j", ({ canUpdateActor, canUpdateToken, canDeleteToken }) => {
    const token = tokenFixture();
    const html = renderToStaticMarkup(<ActorPanel {...props()} actor={undefined} token={token} tokens={[token]} canUpdateActor={canUpdateActor} canUpdateToken={canUpdateToken} canDeleteToken={canDeleteToken} />);

    for (const label of ["Token inspector name", "Token inspector actor", "Token rotation", "Token notes"]) {
      const control = html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*aria-label="${label}"[^>]*>`))?.[0];
      expect(control).toBeDefined();
      expect(control?.includes('disabled=""')).toBe(!canUpdateToken);
    }
    const deleteButton = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Delete Token<\/button>/)?.[0];
    expect(deleteButton).toBeDefined();
    expect(deleteButton?.includes('disabled=""')).toBe(!canDeleteToken);
    expect(html).not.toContain('aria-label="Actor at a glance"');
  });

  it("keeps a matching actor and token linked in the actor header", () => {
    const actor = actors[0]!;
    const token = tokenFixture({ actorId: actor.id, name: "Sentinel on the board" });
    const html = renderToStaticMarkup(<ActorPanel {...props()} actor={actor} token={token} tokens={[token]} />);
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];

    expect(header).toContain(`<h2>${actor.name}</h2>`);
    expect(header).toContain(`<span title="Linked token">${token.name}</span>`);
    expect(html).toContain('aria-label="Actor at a glance"');
    expect(html).toContain('aria-label="Actor sheet views"');
    expect(html).toContain('aria-label="Token inspector name"');
    expect(html).not.toContain("No actor linked.");
    expect(html).not.toContain("Linked actor unavailable.");
  });
});
