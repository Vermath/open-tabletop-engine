import { createTimestamped, type Actor, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };

const characterData = {
  ruleset: "SRD 5.2.1",
  class: "Fighter",
  level: 1,
  attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  hp: { current: 12, max: 12 },
  hitDice: { current: 1, max: 1, size: "d10" },
  conditions: [],
  homebrew: { preserved: true },
};

describe("typed D&D managed-data API boundaries", () => {
  it("rejects malformed managed roots on create while accepting unknown homebrew data", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const malformedActor = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: { ...gm, "idempotency-key": "managed-subroot-malformed-actor" },
        payload: { expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt, systemId: "dnd-5e-srd", name: "Malformed", data: { hp: { current: "many", max: 12 } } },
      });
      expect(malformedActor.statusCode).toBe(400);
      expect(malformedActor.json().message).toContain("/data/hp/current (schema.integer)");

      const homebrewActor = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: { ...gm, "idempotency-key": "managed-subroot-homebrew-actor" },
        payload: { expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt, systemId: "dnd-5e-srd", name: "Homebrew Hero", data: characterData },
      });
      expect(homebrewActor.statusCode, homebrewActor.body).toBe(200);
      expect(homebrewActor.json().data.homebrew).toEqual({ preserved: true });

      const malformedItem = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/items",
        headers: { ...gm, "idempotency-key": "managed-subroot-malformed-item" },
        payload: { expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt, systemId: "dnd-5e-srd", type: "weapon", name: "Broken Blade", data: { quantity: -1 } },
      });
      expect(malformedItem.statusCode).toBe(400);
      expect(malformedItem.json().message).toContain("/data/quantity (schema.minimum)");

      const homebrewItem = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/items",
        headers: { ...gm, "idempotency-key": "managed-subroot-homebrew-item" },
        payload: { expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt, systemId: "dnd-5e-srd", type: "weapon", name: "Moon Blade", data: { quantity: 1, damageType: "moonlight", customRune: { preserved: true } } },
      });
      expect(homebrewItem.statusCode, homebrewItem.body).toBe(200);
      expect(homebrewItem.json().data.customRune).toEqual({ preserved: true });
      const createdItem = homebrewItem.json() as Item;
      const malformedItemPatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/items/${createdItem.id}`,
        headers: { ...gm, "idempotency-key": "managed-subroot-malformed-item-patch" },
        payload: { expectedUpdatedAt: createdItem.updatedAt, data: { ...createdItem.data, mastery: 42 } },
      });
      expect(malformedItemPatch.statusCode).toBe(400);
      expect(malformedItemPatch.json().message).toContain("/data/mastery (schema.string)");
    } finally {
      await app.close();
    }
  });

  it("allows a reasoned rules override but never a structurally invalid managed patch", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: { ...gm, "idempotency-key": "managed-subroot-patch-actor" },
        payload: { expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt, systemId: "dnd-5e-srd", name: "Override Hero", data: characterData },
      });
      expect(created.statusCode, created.body).toBe(200);
      let actor = created.json() as Actor;

      const reviewedRuleOverride = await app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: { ...gm, "idempotency-key": "managed-subroot-rule-override" },
        payload: { expectedUpdatedAt: actor.updatedAt, manualOverrideReason: "Temporary table ruling", data: { ...actor.data, hp: { current: 13, max: 12 } } },
      });
      expect(reviewedRuleOverride.statusCode, reviewedRuleOverride.body).toBe(200);
      actor = reviewedRuleOverride.json() as Actor;
      expect(actor.data.hp).toEqual({ current: 13, max: 12 });

      const malformedOverride = await app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: { ...gm, "idempotency-key": "managed-subroot-structural-override" },
        payload: { expectedUpdatedAt: actor.updatedAt, manualOverrideReason: "This cannot make a string into Hit Points", data: { ...actor.data, hp: { current: "many", max: 12 } } },
      });
      expect(malformedOverride.statusCode).toBe(400);
      expect(malformedOverride.json().message).toContain("/data/hp/current (schema.integer)");
    } finally {
      await app.close();
    }
  });

  it("fails a D&D action before resolution when a managed source or item root is malformed", async () => {
    const store = new MemoryStateStore();
    const source = createTimestamped("act", {
      id: "act_managed_action_invalid",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_demo_gm",
      type: "character",
      name: "Invalid Action Source",
      permissions: {},
      data: { ...characterData, hp: { current: "many", max: 12 } },
    }) as unknown as Actor;
    const item = createTimestamped("itm", {
      id: "itm_managed_action",
      campaignId: source.campaignId,
      systemId: source.systemId,
      actorId: source.id,
      type: "weapon",
      name: "Practice Sword",
      data: { quantity: 1, equipped: true, category: "weapon", ability: "strength", damage: "1d8", damageType: "slashing" },
    }) satisfies Item;
    store.state.actors.push(source);
    store.state.items.push(item);

    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${source.id}/roll`,
        headers: { ...gm, "idempotency-key": "managed-subroot-action-reject" },
        payload: { ability: "strength", commit: false },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("/data/hp/current (schema.integer)");
      expect(store.state.rolls.some((roll) => roll.actorId === source.id)).toBe(false);
    } finally {
      await app.close();
    }
  });
});
