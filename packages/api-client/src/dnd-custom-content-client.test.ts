import { describe, expect, it } from "vitest";

import { OpenTabletopClient, type DndCustomContentDraft, type DndMonsterVariantDraft } from "./index.js";

const campaignId = "campaign/custom";
const itemId = "item/custom";
const revision = "2026-07-13T00:00:00.000Z";
const draft: DndCustomContentDraft = {
  kind: "condition",
  name: "Ash Marked",
  summary: "A private campaign condition.",
  sourceName: "Home campaign",
  sourceVersion: "1",
  contentVersion: "1.0.0",
  license: { name: "Private home game", usage: "private_home_game" },
  data: { description: "Leaves a visible ash trail." }
};

describe("OpenTabletopClient D&D custom content", () => {
  it("sends typed preview and replay-safe revisioned writes", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "token",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    });

    await client.dndCustomContent(campaignId);
    await client.previewDndCustomContent(campaignId, draft);
    await client.createDndCustomContent(campaignId, { ...draft, expectedUpdatedAt: revision }, "custom-create-1");
    await client.updateDndCustomContent(campaignId, itemId, { ...draft, contentVersion: "1.1.0", expectedUpdatedAt: revision }, "custom-update-1");
    await client.deleteDndCustomContent(campaignId, itemId, revision, "custom-delete-1");

    expect(captured.map((request) => [request.init?.method, request.url])).toEqual([
      ["GET", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/custom-content"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/custom-content/preview"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/custom-content"],
      ["PATCH", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/custom-content/item%2Fcustom"],
      ["DELETE", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/custom-content/item%2Fcustom"]
    ]);
    expect(captured.map((request) => new Headers(request.init?.headers).get("Idempotency-Key"))).toEqual([
      null,
      null,
      "custom-create-1",
      "custom-update-1",
      "custom-delete-1"
    ]);
    expect(captured[1]?.init?.body).toBe(JSON.stringify(draft));
    expect(captured[2]?.init?.body).toBe(JSON.stringify({ ...draft, expectedUpdatedAt: revision }));
    expect(captured[4]?.init?.body).toBe(JSON.stringify({ expectedUpdatedAt: revision }));
  });

  it("sends typed template and immutable variant workflows with replay and revision inputs", async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "token",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured.push({ url: input.toString(), init });
        return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    });
    const template = { name: "Elite defender", description: "Raises defensive staying power.", overrides: { armorClass: 18, challengeRating: "1", xp: 200 } };
    const variant: DndMonsterVariantDraft = {
      name: "Veteran Guard",
      summary: "A reviewed campaign variant.",
      sourceName: "Home campaign",
      sourceVersion: "1",
      contentVersion: "1.0.0",
      license: { name: "Private home game", usage: "private_home_game" },
      base: { kind: "bundled", id: "guard", version: "5.2.1" },
      template: { id: "template/custom", version: revision },
      overrides: { hitPoints: 44, challengeRating: "2", xp: 450 }
    };

    await client.dndMonsterTemplates(campaignId);
    await client.previewDndMonsterTemplate(campaignId, template);
    await client.createDndMonsterTemplate(campaignId, { ...template, expectedCampaignUpdatedAt: revision }, "template-create-1");
    await client.updateDndMonsterTemplate(campaignId, "template/custom", { ...template, expectedUpdatedAt: revision }, "template-update-1");
    await client.deleteDndMonsterTemplate(campaignId, "template/custom", revision, "template-delete-1");
    await client.dndMonsterBases(campaignId);
    await client.previewDndMonsterVariant(campaignId, variant);
    await client.createDndMonsterVariant(campaignId, { ...variant, expectedCampaignUpdatedAt: revision }, "variant-create-1");
    await client.createSystemMonster(campaignId, "dnd-5e-srd", { customMonsterItemId: itemId }, "monster-create-1");

    expect(captured.map((request) => [request.init?.method, request.url])).toEqual([
      ["GET", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-templates"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-templates/preview"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-templates"],
      ["PATCH", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-templates/template%2Fcustom"],
      ["DELETE", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-templates/template%2Fcustom"],
      ["GET", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-bases"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-variants/preview"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/dnd/monster-variants"],
      ["POST", "http://api.test/api/v1/campaigns/campaign%2Fcustom/systems/dnd-5e-srd/monsters"]
    ]);
    expect(captured.map((request) => new Headers(request.init?.headers).get("Idempotency-Key"))).toEqual([
      null,
      null,
      "template-create-1",
      "template-update-1",
      "template-delete-1",
      null,
      null,
      "variant-create-1",
      "monster-create-1"
    ]);
    expect(captured[4]?.init?.body).toBe(JSON.stringify({ expectedUpdatedAt: revision }));
    expect(captured[8]?.init?.body).toBe(JSON.stringify({ customMonsterItemId: itemId }));
  });
});
