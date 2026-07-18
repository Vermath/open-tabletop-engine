import { createTimestamped, type Actor, type Combat, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };

type PreparedAction = {
  preparation: {
    preparedPreviewKey: string;
    sourceActorId: string;
    revisions: { actorUpdatedAt: Record<string, string> };
  };
};

function fixtures(store: MemoryStateStore) {
  const actor = createTimestamped("act", {
    id: "act_rage_api",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Kara Stoneheart",
    permissions: {},
    data: {
      class: "Barbarian",
      level: 9,
      attributes: { strength: 18, dexterity: 14, constitution: 16, intelligence: 8, wisdom: 12, charisma: 10 },
      hp: { current: 40, max: 40 },
      hitDice: { current: 9, max: 9 },
      resources: { rage: { current: 2, max: 4, recovery: "long" } },
      conditions: [{ id: "concentration" }],
      rulesEngine: {
        concentration: {
          sourceActorId: "act_rage_api",
          rollId: "spell-itm_rage_spell-effect",
          label: "Dancing Lights Effect",
          targetActorIds: [],
        },
        activeEffects: [{ id: "concentration:act_rage_api", concentration: true, label: "Dancing Lights Effect" }],
      },
    },
  }) satisfies Actor;
  const spell = createTimestamped("itm", {
    id: "itm_rage_spell",
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "spell" as const,
    name: "Dancing Lights",
    data: { level: 0, prepared: true, concentration: true, effectFormula: "1" },
  }) satisfies Item;
  const combat = createTimestamped("cmb", {
    id: "cmb_rage_api",
    campaignId: actor.campaignId,
    active: true,
    round: 4,
    turnIndex: 0,
    combatants: [{ id: "cmbt_rage_api", tokenId: "tok_rage_api", actorId: actor.id, name: actor.name, initiative: 18, defeated: false, conditions: [] }],
  }) satisfies Combat;
  store.state.combats = store.state.combats.map((candidate) => candidate.campaignId === actor.campaignId ? { ...candidate, active: false } : candidate);
  store.state.actors.push(actor);
  store.state.items.push(spell);
  store.state.combats.push(combat);
  return { actor, spell, combat };
}

async function prepareAction(app: Awaited<ReturnType<typeof buildApp>>, route: string, key: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: route,
    headers: { ...gm, "idempotency-key": `${key}:prepare` },
    payload: { ...payload, consumeResources: true, prepare: true, commit: false },
  });
}

async function commitAction(app: Awaited<ReturnType<typeof buildApp>>, route: string, key: string, prepared: PreparedAction) {
  return app.inject({
    method: "POST",
    url: route,
    headers: { ...gm, "idempotency-key": `${key}:commit` },
    payload: {
      preparedPreviewKey: prepared.preparation.preparedPreviewKey,
      expectedUpdatedAt: prepared.preparation.revisions.actorUpdatedAt[prepared.preparation.sourceActorId],
    },
  });
}

describe("D&D Rage prepared-action API lifecycle", () => {
  it("permission-checks, reviews, persists, replays, archives, restarts, and ends Rage at exact revisions", async () => {
    const store = new MemoryStateStore();
    const { actor, spell } = fixtures(store);
    let app = await buildApp({ store });
    const route = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/roll`;

    try {
      const denied = await app.inject({
        method: "POST",
        url: route,
        headers: { ...player, "idempotency-key": "rage:denied" },
        payload: { rollId: "feature-rage", expectedUpdatedAt: actor.updatedAt, consumeResources: true, prepare: true, commit: false },
      });
      expect(denied.statusCode).toBe(403);

      const prepared = await prepareAction(app, route, "rage:start", { rollId: "feature-rage", expectedUpdatedAt: actor.updatedAt });
      expect(prepared.statusCode, prepared.body).toBe(200);
      expect(prepared.json()).toMatchObject({
        status: "ready",
        resolution: {
          action: { kind: "bonusAction" },
          effects: expect.arrayContaining([expect.objectContaining({ type: "utility", resistance: ["bludgeoning", "piercing", "slashing"] })]),
          conditions: expect.arrayContaining([expect.objectContaining({ operation: "breakConcentration", reason: expect.stringContaining("Starting Rage ends Concentration") })]),
          auditEvents: expect.arrayContaining([expect.objectContaining({ code: "rage.started" })]),
        },
      });

      const committed = await commitAction(app, route, "rage:start", prepared.json() as PreparedAction);
      expect(committed.statusCode, committed.body).toBe(200);
      expect(committed.json()).toMatchObject({
        actor: { id: actor.id, data: { resources: { rage: { current: 1 } } } },
        usage: { consumed: [expect.objectContaining({ key: "rage", amount: 1, remaining: 1 })] },
        rulesMutationId: expect.any(String),
        undo: expect.any(Object),
      });
      const committedActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const effects = ((committedActor.data.rulesEngine as Record<string, unknown>).activeEffects as Array<Record<string, unknown>>);
      expect(effects).toContainEqual(expect.objectContaining({ kind: "rage", damageBonus: 3, expiresAtRound: 5, maximumExpiresAtRound: 104 }));
      expect((committedActor.data.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
      expect(committedActor.data.conditions).not.toContainEqual(expect.objectContaining({ id: "concentration" }));
      expect(store.state.dndRulesMutations).toContainEqual(expect.objectContaining({ id: committed.json().rulesMutationId, status: "applied" }));
      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "system.actor.roll", targetId: actor.id }));

      const committedRevision = committedActor.updatedAt;
      const replay = await commitAction(app, route, "rage:start", prepared.json() as PreparedAction);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)!.updatedAt).toBe(committedRevision);

      const duplicate = await prepareAction(app, route, "rage:duplicate", { rollId: "feature-rage", expectedUpdatedAt: committedRevision });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().message).toContain("already active");

      const spellBlocked = await prepareAction(app, route, "rage:spell-blocked", { rollId: `spell-${spell.id}-effect`, expectedUpdatedAt: committedRevision });
      expect(spellBlocked.statusCode).toBe(409);
      expect(spellBlocked.json().message).toContain("End Rage");

      const strengthRoll = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "ability-strength" } });
      expect(strengthRoll.statusCode).toBe(200);
      expect(strengthRoll.json().roll.formula).toBe("2d20kh1+4");
      expect(strengthRoll.json().quickRoll.metadata).toMatchObject({ d20Mode: "advantage", advantageSources: expect.arrayContaining(["Rage"]) });

      const damagePreview = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/rules-preview`,
        headers: { ...gm, "idempotency-key": "rage:damage-preview" },
        payload: { operation: "typed-damage", prepare: true, amount: 9, damageType: "slashing" },
      });
      expect(damagePreview.statusCode, damagePreview.body).toBe(200);
      expect(damagePreview.json().batch.targets[0].preview).toMatchObject({ proposedData: { hp: { current: 36, max: 40 } } });

      const exported = await app.inject({ method: "GET", url: `/api/v1/campaigns/${actor.campaignId}/export`, headers: gm });
      expect(exported.statusCode, exported.body).toBe(200);
      const archivedActor = exported.json().data.actors.find((candidate: Actor) => candidate.id === actor.id);
      expect((archivedActor.data.rulesEngine.activeEffects as Array<Record<string, unknown>>)).toContainEqual(expect.objectContaining({ kind: "rage" }));

      await app.close();
      const restartedStore = new MemoryStateStore(structuredClone(store.state));
      app = await buildApp({ store: restartedStore });
      const sheet = await app.inject({ method: "GET", url: `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/sheet`, headers: gm });
      expect(sheet.statusCode, sheet.body).toBe(200);
      expect(sheet.json().data.rulesEngine.activeEffects).toContainEqual(expect.objectContaining({ kind: "rage", damageBonus: 3 }));

      const restartedActor = restartedStore.state.actors.find((candidate) => candidate.id === actor.id)!;
      const endPrepared = await prepareAction(app, route, "rage:end", { rollId: "feature-rage-end", expectedUpdatedAt: restartedActor.updatedAt });
      expect(endPrepared.statusCode, endPrepared.body).toBe(200);
      const revisionBeforeStale = restartedActor.updatedAt;
      restartedActor.updatedAt = new Date(Date.parse(revisionBeforeStale) + 1).toISOString();
      const stale = await commitAction(app, route, "rage:end-stale", endPrepared.json() as PreparedAction);
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe("stale_write");
      restartedActor.updatedAt = revisionBeforeStale;

      const ended = await commitAction(app, route, "rage:end", endPrepared.json() as PreparedAction);
      expect(ended.statusCode, ended.body).toBe(200);
      expect(ended.json().resolution.auditEvents).toContainEqual(expect.objectContaining({ code: "rage.ended" }));
      expect(ended.json().actor.data.rulesEngine.activeEffects).not.toContainEqual(expect.objectContaining({ kind: "rage" }));
      expect(ended.json().actor.data.resources.rage.current).toBe(1);
    } finally {
      await app.close();
    }
  }, 20_000);
});
