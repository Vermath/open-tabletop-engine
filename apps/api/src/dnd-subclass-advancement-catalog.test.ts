import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };
const timestamp = "2026-07-17T00:00:00.000Z";

function fighter(id: string, data: Record<string, unknown> = {}): Actor {
  return {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_player",
    type: "character",
    name: id,
    data: {
      class: "Fighter",
      level: 2,
      classes: [{ className: "Fighter", level: 2 }],
      attributes: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 20, max: 20 },
      ...data
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("D&D advancement subclass catalog", () => {
  it("returns typed standard and actor-attached subclass choices at the selection level", async () => {
    const store = new MemoryStateStore();
    const actor = fighter("act_subclass_catalog", {
      dnd5eCustomSubclasses: [{
        id: "guardian",
        type: "subclass",
        name: "Guardian",
        data: {
          customContentKind: "subclass",
          builderSchemaVersion: "1.0.0",
          parentClass: "Fighter",
          selectionLevel: 3,
          summary: "Protect allies through disciplined battlefield control.",
          alwaysPreparedSpells: ["shield", "heroism"],
          features: [{ level: 3, name: "Guardian Stance" }, { level: 7, name: "Hold the Line" }]
        },
        provenance: { sourceKind: "user", systemId: "dnd-5e-srd" }
      }]
    });
    store.state.actors.push(actor);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/advancement`, headers });
      expect(response.statusCode, response.body).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({ advancementClassName: "Fighter", nextClassLevel: 3, requiresSubclass: true });
      expect(body.subclassOptions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "champion", name: "Champion", className: "Fighter", selectionLevel: 3, featureNames: expect.arrayContaining(["Improved Critical", "Survivor"]) }),
        expect.objectContaining({ id: "guardian", name: "Guardian", className: "Fighter", selectionLevel: 3, summary: "Protect allies through disciplined battlefield control.", featureNames: ["Guardian Stance", "Hold the Line"], alwaysPreparedSpells: ["shield", "heroism"] })
      ]));
      expect(body.multiclassOptions).toEqual(expect.arrayContaining([expect.objectContaining({ className: "Barbarian", requiresSubclass: false })]));
    } finally {
      await app.close();
    }
  });

  it("does not require a second subclass choice once the class has one", async () => {
    const store = new MemoryStateStore();
    const actor = fighter("act_existing_subclass", { subclasses: { Fighter: "champion" }, subclass: "Champion" });
    store.state.actors.push(actor);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/advancement`, headers });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ requiresSubclass: false, subclassOptions: expect.arrayContaining([expect.objectContaining({ id: "champion" })]) });
    } finally {
      await app.close();
    }
  });
});
