import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };

async function createFighter(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
    headers: { ...headers, "idempotency-key": "feat-create-fighter" },
    payload: { templateId: "fighter", name: "Feat Eligibility Fighter", ownerUserId: "usr_demo_gm" }
  });
  expect(response.statusCode).toBe(200);
  return response.json().actor.id as string;
}

describe("D&D advancement feat API eligibility", () => {
  it("exposes the extra Fighter and Rogue class feat levels", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actorId = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === actorId)!;
      const advancementUrl = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/advancement`;
      const cases = [
        { className: "Fighter", currentLevel: 5, nextClassLevel: 6, subclass: "champion" },
        { className: "Fighter", currentLevel: 13, nextClassLevel: 14, subclass: "champion" },
        { className: "Rogue", currentLevel: 9, nextClassLevel: 10, subclass: "thief" }
      ];

      for (const entry of cases) {
        actor.data = {
          ...actor.data,
          class: entry.className,
          level: entry.currentLevel,
          classes: [{ className: entry.className, level: entry.currentLevel }],
          subclass: entry.subclass,
          subclasses: { [entry.className]: entry.subclass },
          feats: []
        };
        const response = await app.inject({ method: "GET", url: advancementUrl, headers });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(expect.objectContaining({
          advancementClassName: entry.className,
          nextClassLevel: entry.nextClassLevel,
          grantsFeat: true
        }));
        expect(response.json().feats).toContainEqual(expect.objectContaining({ id: "ability-score-improvement" }));
      }
    } finally {
      await app.close();
    }
  });

  it("filters level-4 choices and rejects Epic Boons and duplicate feats atomically", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actorId = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === actorId)!;
      actor.data = {
        ...actor.data,
        level: 3,
        hp: { current: 28, max: 28 },
        hitDice: { current: 3, max: 3, size: "d10" },
        feats: []
      };
      const advancementUrl = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/advancement`;
      const previewUrl = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/rules-preview`;

      const choices = await app.inject({ method: "GET", url: advancementUrl, headers });
      expect(choices.statusCode).toBe(200);
      expect(choices.json().feats.map((feat: { id: string }) => feat.id)).toEqual(expect.arrayContaining(["ability-score-improvement", "grappler"]));
      expect(choices.json().feats.some((feat: { category: string }) => feat.category === "epic-boon" || feat.category === "fighting-style")).toBe(false);

      const beforeEpicBoon = structuredClone(actor.data);
      const epicBoon = await app.inject({
        method: "POST",
        url: previewUrl,
        headers,
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "fixed", featId: "boon-of-fortitude", abilityChoices: { strength: 1 } }
      });
      expect(epicBoon.statusCode).toBe(200);
      expect(epicBoon.json().blockers[0].message).toContain("class level 19");
      expect(actor.data).toEqual(beforeEpicBoon);

      const epicBoonPreview = await app.inject({
        method: "POST",
        url: previewUrl,
        headers,
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "fixed", featId: "boon-of-fortitude", abilityChoices: { strength: 1 } }
      });
      expect(epicBoonPreview.statusCode).toBe(200);
      expect(epicBoonPreview.json()).toEqual(expect.objectContaining({
        status: "blocked",
        blockers: expect.arrayContaining([expect.objectContaining({ path: "/featId", code: "rules.feat_ineligible" })])
      }));
      expect(actor.data).toEqual(beforeEpicBoon);

      const fightingStyle = await app.inject({
        method: "POST",
        url: previewUrl,
        headers,
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "fixed", featId: "fighting-style-archery" }
      });
      expect(fightingStyle.statusCode).toBe(200);
      expect(fightingStyle.json().blockers[0].message).toContain("cannot be selected through Ability Score Improvement advancement");
      expect(actor.data).toEqual(beforeEpicBoon);

      actor.data = {
        ...actor.data,
        feats: ["grappler"],
        features: [...new Set([...(actor.data.features as string[]), "Grappler"])]
      };
      const beforeDuplicate = structuredClone(actor.data);
      const duplicate = await app.inject({
        method: "POST",
        url: previewUrl,
        headers,
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "fixed", featId: "grappler", abilityChoices: { strength: 1 } }
      });
      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json().blockers[0].message).toContain("not repeatable");
      expect(actor.data).toEqual(beforeDuplicate);
    } finally {
      await app.close();
    }
  });

  it("offers and applies an Epic Boon at level 19", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actorId = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === actorId)!;
      actor.data = {
        ...actor.data,
        level: 18,
        hp: { current: 140, max: 140 },
        hitDice: { current: 18, max: 18, size: "d10" },
        classes: [{ className: "Fighter", level: 18 }],
        subclass: "Champion",
        subclasses: { Fighter: "champion" },
        feats: []
      };
      const advancementUrl = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/advancement`;
      const choices = await app.inject({ method: "GET", url: advancementUrl, headers });
      expect(choices.statusCode).toBe(200);
      expect(choices.json()).toEqual(expect.objectContaining({ nextClassLevel: 19, grantsFeat: true }));
      expect(choices.json().feats).toContainEqual(expect.objectContaining({ id: "boon-of-fortitude", category: "epic-boon" }));
      expect(choices.json().feats.some((feat: { category: string }) => feat.category === "fighting-style")).toBe(false);

      const advance = await preparedAdvancement(app, actorId, actor.updatedAt, {
        optionId: "level-up",
        hitPointMode: "fixed",
        featId: "boon-of-fortitude",
        abilityChoices: { strength: 1 },
        weaponMasteryChoices: ["greatsword", "longbow", "flail", "longsword", "shortsword", "dagger"]
      }, "epic-boon-19");
      expect(advance.statusCode).toBe(200);
      expect(advance.json().actor.data).toEqual(expect.objectContaining({ level: 19, feats: expect.arrayContaining(["boon-of-fortitude"]) }));
      expect(advance.json().actor.data.hp.max).toBeGreaterThan(180);
    } finally {
      await app.close();
    }
  });
});

async function preparedAdvancement(app: Awaited<ReturnType<typeof buildApp>>, actorId: string, expectedUpdatedAt: string, request: Record<string, unknown>, key: string) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}`;
  const preview = await app.inject({ method: "POST", url: `${route}/rules-preview`, headers: { ...headers, "idempotency-key": `${key}:preview` }, payload: { operation: "advancement", prepare: true, ...request } });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({ method: "POST", url: `${route}/advance`, headers: { ...headers, "idempotency-key": `${key}:commit` }, payload: { preparedPreviewKey: preview.json().preparation.preparedPreviewKey, expectedUpdatedAt } });
}
