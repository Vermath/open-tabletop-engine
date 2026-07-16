import { createTimestamped, type Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };

function dangerSenseBarbarian(store: MemoryStateStore): Actor {
  const actor = createTimestamped("act", {
    id: "act_danger_sense_api",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Danger Sense Barbarian",
    permissions: {},
    data: {
      class: "Barbarian",
      level: 2,
      attributes: { strength: 16, dexterity: 12, constitution: 16, intelligence: 8, wisdom: 10, charisma: 8 },
      hp: { current: 25, max: 25 },
      saveProficiencies: ["strength", "constitution"],
      conditions: [],
    },
  }) satisfies Actor;
  store.state.actors.push(actor);
  return actor;
}

describe("D&D save feature Advantage API", () => {
  it("keeps the sheet, resolved dice, source metadata, roll history, stale writes, and permissions aligned", async () => {
    const store = new MemoryStateStore();
    const actor = dangerSenseBarbarian(store);
    const app = await buildApp({ store });
    const actorRoute = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}`;

    try {
      const sheet = await app.inject({ method: "GET", url: `${actorRoute}/sheet`, headers: gm });
      expect(sheet.statusCode).toBe(200);
      expect(sheet.json().quickRolls).toContainEqual(expect.objectContaining({
        id: "save-dexterity",
        formula: "2d20kh1+1",
        metadata: expect.objectContaining({
          d20Mode: "advantage",
          advantageSources: ["Danger Sense"],
          disadvantageSources: [],
        }),
      }));

      const forbidden = await app.inject({
        method: "POST",
        url: `${actorRoute}/roll`,
        headers: player,
        payload: { rollId: "save-dexterity", expectedUpdatedAt: actor.updatedAt },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(store.state.rolls).toHaveLength(0);

      const stale = await app.inject({
        method: "POST",
        url: `${actorRoute}/roll`,
        headers: gm,
        payload: { rollId: "save-dexterity", expectedUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);
      expect(store.state.rolls).toHaveLength(0);

      const resolved = await app.inject({
        method: "POST",
        url: `${actorRoute}/roll`,
        headers: gm,
        payload: { rollId: "save-dexterity", visibility: "public", expectedUpdatedAt: actor.updatedAt },
      });
      expect(resolved.statusCode).toBe(200);
      const body = resolved.json();
      expect(body.quickRoll).toMatchObject({ id: "save-dexterity", formula: "2d20kh1+1" });
      expect(body.resolution.rolls[0]).toMatchObject({
        formula: "2d20kh1+1",
        d20Mode: "advantage",
        advantageSources: ["Danger Sense"],
        disadvantageSources: [],
      });
      expect(body.roll).toMatchObject({
        formula: "2d20kh1+1",
        label: "Dexterity Save [Advantage: Danger Sense]",
        visibility: "public",
      });
      expect(body.roll.terms[0]).toMatchObject({ type: "die", count: 2, sides: 20, keep: "highest", keepCount: 1 });
      expect(body.roll.terms[0].results).toHaveLength(2);
      expect(body.roll.terms[0].kept).toHaveLength(1);

      const stored = store.state.rolls.at(-1)!;
      expect(stored).toMatchObject({
        formula: "2d20kh1+1",
        label: "Dexterity Save [Advantage: Danger Sense]",
        terms: body.roll.terms,
      });
      expect(store.state.chat.at(-1)?.body).toContain("Advantage: Danger Sense");
    } finally {
      await app.close();
    }
  });
});
