import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

async function createFighter(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
    headers: { ...authHeaders, "idempotency-key": "p0-rules-create-fighter" },
    payload: { templateId: "fighter", name: "P0 Rules Fighter", ownerUserId: "usr_demo_gm" }
  });
  expect(response.statusCode).toBe(200);
  return response.json().actor as { id: string; updatedAt: string; data: Record<string, any> };
}

describe("D&D P0 API rule choices", () => {
  it("keeps advancement atomic and requires explicit HP and ASI choices", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createFighter(app);
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const initialData = structuredClone(store.state.actors.find((actor) => actor.id === fighter.id)!.data);

      const initialAdvancement = await app.inject({ method: "GET", url: `${route}/advancement`, headers: authHeaders });
      expect(initialAdvancement.statusCode).toBe(200);
      expect(initialAdvancement.json().weaponMastery).toEqual(expect.objectContaining({
        className: "Fighter",
        nextClassLevel: 2,
        requiredCount: 3,
        requiresSelection: true,
        selectedWeaponIds: [],
        options: expect.arrayContaining([expect.objectContaining({ id: "greatsword", name: "Greatsword", mastery: "graze" })])
      }));

      const malformedMastery = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: authHeaders,
        payload: { operation: "advancement", hitPointMode: "fixed", weaponMasteryChoices: [" "] }
      });
      expect(malformedMastery.statusCode).toBe(400);
      expect(malformedMastery.json().message).toContain("non-empty weapon IDs");

      const missingHpChoice = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...authHeaders, "idempotency-key": "p0-advancement-draft:hp" },
        payload: { operation: "advancement", optionId: "level-up", prepare: true }
      });
      expect(missingHpChoice.statusCode).toBe(200);
      expect(missingHpChoice.json()).toEqual(expect.objectContaining({ status: "blocked", draft: expect.objectContaining({ pendingAdvancement: expect.objectContaining({ status: "draft" }) }) }));
      expect(store.state.actors.find((actor) => actor.id === fighter.id)!.data).toEqual(initialData);

      for (const nextLevel of [2, 3]) {
        const actor = store.state.actors.find((candidate) => candidate.id === fighter.id)!;
        const advance = await preparedAdvancement(app, fighter.id, actor.updatedAt, {
          optionId: "level-up",
          hitPointMode: "fixed",
          ...(nextLevel === 2 ? { weaponMasteryChoices: ["greatsword", "longbow", "flail"] } : {}),
          ...(nextLevel === 3 ? { subclassId: "champion" } : {})
        }, `p0-advance:${nextLevel}`);
        expect(advance.statusCode).toBe(200);
        expect(advance.json().actor.data.level).toBe(nextLevel);
      }

      const advancement = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}/advancement`,
        headers: authHeaders
      });
      expect(advancement.statusCode).toBe(200);
      expect(advancement.json()).toEqual(expect.objectContaining({ nextClassLevel: 4, grantsFeat: true }));
      expect(advancement.json().feats).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "ability-score-improvement",
          abilityPoints: 2,
          abilityChoices: expect.arrayContaining(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
          maximumScore: 20
        })
      ]));

      const beforeAsi = structuredClone(store.state.actors.find((actor) => actor.id === fighter.id)!.data);
      const missingAsi = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...authHeaders, "idempotency-key": "p0-advancement-draft:asi" },
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "fixed", prepare: true }
      });
      expect(missingAsi.statusCode).toBe(200);
      expect(missingAsi.json().status).toBe("blocked");
      expect(store.state.actors.find((actor) => actor.id === fighter.id)!.data).toEqual(beforeAsi);

      const strengthBefore = Number((beforeAsi.attributes as Record<string, unknown>).strength);
      const actorBeforeAsi = store.state.actors.find((candidate) => candidate.id === fighter.id)!;
      const withAsi = await preparedAdvancement(app, fighter.id, actorBeforeAsi.updatedAt, {
          optionId: "level-up",
          hitPointMode: "fixed",
          featId: "ability-score-improvement",
          abilityChoices: { strength: 2 },
          weaponMasteryChoices: ["greatsword", "longbow", "flail", "longsword"]
        }, "p0-advance:asi");
      expect(withAsi.statusCode).toBe(200);
      expect(withAsi.json().actor.data.level).toBe(4);
      expect(withAsi.json().actor.data.attributes.strength).toBe(strengthBefore + 2);
    } finally {
      await app.close();
    }
  }, 15_000);

  it("validates short-rest Hit Dice before server-owned rolls and permits zero-die rests", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    try {
      const fighter = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === fighter.id)!;
      actor.data = {
        ...actor.data,
        hp: { current: 1, max: (actor.data.hp as { max: number }).max },
        hitDice: { current: 1, max: 1, size: "d10" },
        resources: {
          ...(actor.data.resources as Record<string, unknown>),
          secondWind: { current: 0, max: 2, recovery: "short" }
        }
      };
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const beforeOverspend = structuredClone(actor.data);

      const overspend = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...authHeaders, "idempotency-key": "p0-rest:overspend" },
        payload: { operation: "rest", prepare: true, restType: "short", hitDice: [{}, {}] }
      });
      expect(overspend.statusCode).toBe(400);
      expect(actor.data).toEqual(beforeOverspend);

      const spend = await preparedRest(app, fighter.id, actor.updatedAt, { restType: "short", hitDice: [{ roll: 10 }] }, "p0-rest:spend");
      expect(spend.statusCode).toBe(200);
      expect(spend.json().actor.data.hitDice).toEqual({ current: 0, max: 1, size: "d10" });
      expect(spend.json().actor.data.hp.current).toBe(4);
      expect(spend.json().actor.data.resources.secondWind.current).toBe(1);

      actor.data = {
        ...actor.data,
        resources: {
          ...(actor.data.resources as Record<string, unknown>),
          secondWind: { current: 0, max: 2, recovery: "short" }
        }
      };
      const resourceOnly = await preparedRest(app, fighter.id, actor.updatedAt, { restType: "short", hitDice: [] }, "p0-rest:resource-only");
      expect(resourceOnly.statusCode).toBe(200);
      expect(resourceOnly.json().actor.data.hitDice.current).toBe(0);
      expect(resourceOnly.json().actor.data.resources.secondWind.current).toBe(1);
    } finally {
      random.mockRestore();
      await app.close();
    }
  });
});

async function preparedAdvancement(app: Awaited<ReturnType<typeof buildApp>>, actorId: string, expectedUpdatedAt: string, request: Record<string, unknown>, key: string) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}`;
  const preview = await app.inject({ method: "POST", url: `${route}/rules-preview`, headers: { ...authHeaders, "idempotency-key": `${key}:preview` }, payload: { operation: "advancement", prepare: true, ...request } });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status, JSON.stringify(preview.json().blockers)).toBe("ready");
  return app.inject({ method: "POST", url: `${route}/advance`, headers: { ...authHeaders, "idempotency-key": `${key}:commit` }, payload: { preparedPreviewKey: preview.json().preparation.preparedPreviewKey, expectedUpdatedAt } });
}

async function preparedRest(app: Awaited<ReturnType<typeof buildApp>>, actorId: string, expectedUpdatedAt: string, request: Record<string, unknown>, key: string) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}`;
  const preview = await app.inject({ method: "POST", url: `${route}/rules-preview`, headers: { ...authHeaders, "idempotency-key": `${key}:preview` }, payload: { operation: "rest", prepare: true, ...request } });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({ method: "POST", url: `${route}/rest`, headers: { ...authHeaders, "idempotency-key": `${key}:commit` }, payload: { preparedPreviewKey: preview.json().preparation.preparedPreviewKey, expectedUpdatedAt } });
}
