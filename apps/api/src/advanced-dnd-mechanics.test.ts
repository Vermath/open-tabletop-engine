import { createTimestamped, type Actor, type Combat, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function addAdvancedMechanicsFixtures(store: MemoryStateStore) {
  const actor = createTimestamped("act", {
    id: "act_advanced_caster",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_player",
    type: "character" as const,
    name: "Advanced Caster",
    data: {
      conditions: [{ id: "restrained" }],
      rulesEngine: {
        activeEffects: [{
          id: "effect_vines",
          label: "Clinging vines",
          ownedConditionIds: ["restrained"],
          schedule: {
            timing: "end_turn",
            anchorActorId: "act_advanced_caster",
            nextRound: 1,
            repeatSave: { ability: "strength", dc: 14, endsOn: "success" },
          },
        }],
      },
    },
    permissions: {},
  }) satisfies Actor;
  const target = createTimestamped("act", {
    id: "act_advanced_target",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "npc" as const,
    name: "Advanced Target",
    data: { conditions: [] },
    permissions: {},
  }) satisfies Actor;
  const combat = createTimestamped("cmb", {
    id: "cmb_advanced_mechanics",
    campaignId: "camp_demo",
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [
      { id: "cmbt_advanced_caster", tokenId: "tok_advanced_caster", actorId: actor.id, name: actor.name, initiative: 20, defeated: false, conditions: ["restrained:99"] },
      { id: "cmbt_advanced_target", tokenId: "tok_advanced_target", actorId: target.id, name: target.name, initiative: 10, defeated: false, conditions: [] },
    ],
  }) satisfies Combat;
  store.state.actors.push(actor, target);
  store.state.combats.push(combat);
  return { actor, target, combat };
}

describe("advanced D&D combat mechanics API", () => {
  it("authors and triggers regional/lair prompts with permission, revision, replay, and visibility boundaries", async () => {
    const store = new MemoryStateStore();
    const { combat } = addAdvancedMechanicsFixtures(store);
    const app = await buildApp({ store });
    const route = `/api/v1/combats/${combat.id}/environment-mechanics`;
    const mechanicInput = {
      kind: "lair_action",
      name: "Vault pulse",
      description: "At initiative count 20, choose one visible vault reaction.",
      visibility: "gm_only",
      schedule: { timing: "initiative_count", initiativeCount: 20, startsAtRound: 1, intervalRounds: 1 },
      options: [{ name: "Arc flash", description: "Resolve the arc flash manually." }],
      expectedUpdatedAt: combat.updatedAt,
    };

    try {
      const forbidden = await app.inject({ method: "POST", url: route, headers: playerHeaders, payload: mechanicInput });
      expect(forbidden.statusCode).toBe(403);

      const missingKey = await app.inject({ method: "POST", url: route, headers: { ...gmHeaders, "idempotency-key": "" }, payload: mechanicInput });
      expect(missingKey.statusCode).toBe(400);
      expect(missingKey.json().message.toLowerCase()).toContain("idempotency-key");

      const stale = await app.inject({
        method: "POST", url: route,
        headers: { ...gmHeaders, "idempotency-key": "advanced-mechanic-stale" },
        payload: { ...mechanicInput, expectedUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);

      const headers = { ...gmHeaders, "idempotency-key": "advanced-mechanic-create" };
      const created = await app.inject({ method: "POST", url: route, headers, payload: mechanicInput });
      expect(created.statusCode).toBe(200);
      const createdCombat = created.json() as Combat;
      const mechanic = createdCombat.environmentMechanics?.[0];
      expect(mechanic).toMatchObject({ kind: "lair_action", name: "Vault pulse", triggerCount: 0, visibility: "gm_only" });

      const replay = await app.inject({ method: "POST", url: route, headers, payload: mechanicInput });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.combats.find((item) => item.id === combat.id)?.environmentMechanics).toHaveLength(1);

      const playerList = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/combats", headers: playerHeaders });
      expect(playerList.statusCode).toBe(200);
      expect((playerList.json() as Combat[]).find((item) => item.id === combat.id)?.environmentMechanics).toEqual([]);

      const trigger = await app.inject({
        method: "POST",
        url: `${route}/${mechanic!.id}/trigger`,
        headers: { ...gmHeaders, "idempotency-key": "advanced-mechanic-trigger" },
        payload: { optionId: mechanic!.options[0]!.id, expectedUpdatedAt: createdCombat.updatedAt },
      });
      expect(trigger.statusCode).toBe(200);
      expect(trigger.json()).toMatchObject({
        environmentMechanics: [expect.objectContaining({ triggerCount: 1, lastOptionId: mechanic!.options[0]!.id })],
        environmentMechanicTriggers: [expect.objectContaining({ mechanicId: mechanic!.id, optionName: "Arc flash", triggeredByUserId: "usr_demo_gm" })],
      });
      expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining([
        "combat.environmentMechanicCreated", "combat.environmentMechanicTriggered",
      ]));

      const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(exported.statusCode).toBe(200);
      expect(exported.json().data.combats.find((item: { id: string }) => item.id === combat.id)).toMatchObject({
        environmentMechanics: [expect.objectContaining({ id: mechanic!.id, triggerCount: 1 })],
        environmentMechanicTriggers: [expect.objectContaining({ mechanicId: mechanic!.id, optionName: "Arc flash" })],
      });

      const updated = await app.inject({
        method: "PATCH",
        url: `${route}/${mechanic!.id}`,
        headers: { ...gmHeaders, "idempotency-key": "advanced-mechanic-update" },
        payload: { visibility: "public", expectedUpdatedAt: trigger.json().updatedAt },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().environmentMechanics[0]).toMatchObject({ visibility: "public" });

      const removed = await app.inject({
        method: "DELETE",
        url: `${route}/${mechanic!.id}`,
        headers: { ...gmHeaders, "idempotency-key": "advanced-mechanic-delete" },
        payload: { expectedUpdatedAt: updated.json().updatedAt },
      });
      expect(removed.statusCode, removed.body).toBe(200);
      expect(removed.json().environmentMechanics).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("previews required saves and applies only reviewed deterministic effect outcomes", async () => {
    const store = new MemoryStateStore();
    const { actor, combat } = addAdvancedMechanicsFixtures(store);
    const app = await buildApp({ store });
    const previewRoute = `/api/v1/combats/${combat.id}/effects/preview`;
    const advanceRoute = `/api/v1/combats/${combat.id}/effects/advance`;

    try {
      const preview = await app.inject({
        method: "POST",
        url: previewRoute,
        headers: { ...gmHeaders, "idempotency-key": "advanced-effects-unresolved-preview" },
        payload: { phase: "end_turn", now: "2026-07-13T12:00:00.000Z", prepare: true },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ canApply: false, unresolvedEventIds: [expect.any(String)] });
      expect(preview.json().events).toEqual([expect.objectContaining({ effectId: "effect_vines", status: "save_required", saveAbility: "strength", saveDc: 14 })]);
      const eventId = preview.json().unresolvedEventIds[0] as string;
      expect(preview.json().preparation).toBeUndefined();
      expect((store.state.actors.find((item) => item.id === actor.id)!.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toHaveLength(1);

      const prepared = await app.inject({
        method: "POST",
        url: previewRoute,
        headers: { ...gmHeaders, "idempotency-key": "advanced-effects-preview" },
        payload: {
          phase: "end_turn",
          now: "2026-07-13T12:00:00.000Z",
          saveOutcomes: { [eventId]: "success" },
          prepare: true,
        },
      });
      expect(prepared.statusCode).toBe(200);
      expect(prepared.json().preparation).toMatchObject({
        preparedPreviewKey: "advanced-effects-preview",
        revisions: { combatUpdatedAt: combat.updatedAt },
      });

      const applyHeaders = { ...gmHeaders, "idempotency-key": "advanced-effects-apply" };
      const applyPayload = {
        preparedPreviewKey: prepared.json().preparation.preparedPreviewKey,
        expectedUpdatedAt: prepared.json().preparation.revisions.combatUpdatedAt,
      };
      const applied = await app.inject({ method: "POST", url: advanceRoute, headers: applyHeaders, payload: applyPayload });
      expect(applied.statusCode).toBe(200);
      expect(applied.json().evaluation).toMatchObject({ canApply: true, unresolvedEventIds: [] });
      expect(applied.json().evaluation.events).toEqual([expect.objectContaining({ effectId: "effect_vines", status: "save_succeeded", outcome: "success" })]);
      expect(store.state.actors.find((item) => item.id === actor.id)!.data.conditions).toEqual([]);
      expect((store.state.actors.find((item) => item.id === actor.id)!.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toEqual([]);
      expect(store.state.combats.find((item) => item.id === combat.id)?.combatants[0]?.conditions).toEqual([]);

      const replay = await app.inject({ method: "POST", url: advanceRoute, headers: applyHeaders, payload: applyPayload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.auditLogs.filter((entry) => entry.action === "combat.effectScheduleAdvanced")).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("carries a real Wand repeat save through archive, restart, reviewed resolution, replay, and undo", async () => {
    const caster = createTimestamped("act", {
      id: "act_managed_effect_caster",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_demo_gm",
      type: "character" as const,
      name: "Managed Effect Caster",
      data: {
        class: "Fighter",
        level: 1,
        hp: { current: 12, max: 12 },
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        conditions: [],
        rulesEngine: {},
      },
      permissions: {},
    }) satisfies Actor;
    const target = createTimestamped("act", {
      id: "act_managed_effect_target",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_demo_gm",
      type: "npc" as const,
      name: "Managed Effect Target",
      data: {
        hp: { current: 24, max: 24 },
        attributes: { strength: 14, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
        conditions: [],
        rulesEngine: {},
      },
      permissions: {},
    }) satisfies Actor;
    const wand = createTimestamped("item", {
      id: "itm_managed_effect_wand",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: caster.id,
      type: "item" as const,
      name: "Wand of Paralysis",
      data: {
        action: "magic action",
        condition: "Paralyzed",
        conditionDuration: "1 minute",
        save: { ability: "constitution", dc: 15 },
        repeatSave: "end of each turn",
      },
    }) satisfies Item;
    const combat = createTimestamped("cmb", {
      id: "cmb_managed_effect",
      campaignId: "camp_demo",
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        { id: "cmbt_managed_effect_caster", tokenId: "tok_managed_effect_caster", actorId: caster.id, name: caster.name, initiative: 20, defeated: false, conditions: [] },
        { id: "cmbt_managed_effect_target", tokenId: "tok_managed_effect_target", actorId: target.id, name: target.name, initiative: 10, defeated: false, conditions: [] },
      ],
    }) satisfies Combat;
    const firstStore = new MemoryStateStore();
    firstStore.state.actors.push(caster, target);
    firstStore.state.items.push(wand);
    firstStore.state.combats.push(combat);
    const firstApp = await buildApp({ store: firstStore });
    let effectId = "";

    try {
      const actionUrl = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${caster.id}/roll`;
      const actionPreview = await firstApp.inject({
        method: "POST",
        url: actionUrl,
        headers: { ...gmHeaders, "idempotency-key": "managed-effect-action-preview" },
        payload: {
          rollId: `item-${wand.id}-effect`,
          applyEffect: true,
          targetActorId: target.id,
          saveOutcomes: { [target.id]: "failure" },
          prepare: true,
        },
      });
      expect(actionPreview.statusCode, actionPreview.body).toBe(200);
      expect(actionPreview.json().preparation).toMatchObject({
        preparedPreviewKey: "managed-effect-action-preview",
        sourceActorId: caster.id,
      });

      const actionCommit = await firstApp.inject({
        method: "POST",
        url: actionUrl,
        headers: { ...gmHeaders, "idempotency-key": "managed-effect-action-commit" },
        payload: {
          preparedPreviewKey: actionPreview.json().preparation.preparedPreviewKey,
          expectedUpdatedAt: actionPreview.json().preparation.revisions.actorUpdatedAt[caster.id],
        },
      });
      expect(actionCommit.statusCode, actionCommit.body).toBe(200);
      const storedTarget = firstStore.state.actors.find((actor) => actor.id === target.id)!;
      const activeEffects = (storedTarget.data.rulesEngine as { activeEffects: Array<Record<string, unknown>> }).activeEffects;
      expect(activeEffects).toHaveLength(1);
      effectId = activeEffects[0]!.id as string;
      expect(activeEffects[0]).toMatchObject({
        id: effectId,
        conditionIds: ["paralyzed"],
        ownedConditionIds: ["paralyzed"],
        managedLifecycle: "end-turn-repeat-save-v1",
        schedule: {
          timing: "end_turn",
          anchorActorId: target.id,
          nextRound: 1,
          intervalRounds: 1,
          expiresAtRound: 11,
          repeatSave: { ability: "constitution", dc: 15, endsOn: "success" },
        },
      });
      expect(firstStore.state.combats.find((candidate) => candidate.id === combat.id)?.combatants[1]?.conditions).toEqual(["paralyzed:10"]);

      const archive = await firstApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(archive.statusCode, archive.body).toBe(200);
      expect(archive.json().data.actors.find((actor: { id: string }) => actor.id === target.id)?.data.rulesEngine.activeEffects).toContainEqual(
        expect.objectContaining({ id: effectId, managedLifecycle: "end-turn-repeat-save-v1", schedule: expect.objectContaining({ timing: "end_turn", anchorActorId: target.id }) }),
      );

      const storedCombat = firstStore.state.combats.find((candidate) => candidate.id === combat.id)!;
      storedCombat.turnIndex = 1;
      storedCombat.updatedAt = new Date(Date.parse(storedCombat.updatedAt) + 1).toISOString();
    } finally {
      await firstApp.close();
    }

    const restartedStore = new MemoryStateStore(structuredClone(firstStore.state));
    const restartedTarget = restartedStore.state.actors.find((actor) => actor.id === target.id)!;
    expect((restartedTarget.data.rulesEngine as { activeEffects: Array<Record<string, unknown>> }).activeEffects).toContainEqual(
      expect.objectContaining({ id: effectId, schedule: expect.objectContaining({ timing: "end_turn", anchorActorId: target.id, nextRound: 1 }) }),
    );
    const restartedApp = await buildApp({ store: restartedStore });
    const previewUrl = `/api/v1/combats/${combat.id}/effects/preview`;
    const advanceUrl = `/api/v1/combats/${combat.id}/effects/advance`;
    const reviewedAt = "2026-07-17T12:00:00.000Z";

    try {
      const forbidden = await restartedApp.inject({
        method: "POST",
        url: previewUrl,
        headers: { ...playerHeaders, "idempotency-key": "managed-effect-forbidden-preview" },
        payload: { phase: "end_turn", now: reviewedAt, prepare: true },
      });
      expect(forbidden.statusCode).toBe(403);

      const unresolved = await restartedApp.inject({
        method: "POST",
        url: previewUrl,
        headers: { ...gmHeaders, "idempotency-key": "managed-effect-unresolved-preview" },
        payload: { phase: "end_turn", now: reviewedAt, prepare: true },
      });
      expect(unresolved.statusCode, unresolved.body).toBe(200);
      expect(unresolved.json()).toMatchObject({ canApply: false });
      expect(unresolved.json()).not.toHaveProperty("preparation");
      expect(unresolved.json().events).toEqual([
        expect.objectContaining({ effectId, actorId: target.id, status: "save_required", saveAbility: "constitution", saveDc: 15 }),
      ]);
      const eventId = unresolved.json().unresolvedEventIds[0] as string;

      const prepared = await restartedApp.inject({
        method: "POST",
        url: previewUrl,
        headers: { ...gmHeaders, "idempotency-key": "managed-effect-reviewed-preview" },
        payload: { phase: "end_turn", now: reviewedAt, saveOutcomes: { [eventId]: "success" }, prepare: true },
      });
      expect(prepared.statusCode, prepared.body).toBe(200);
      expect(prepared.json().preparation).toMatchObject({
        preparedPreviewKey: "managed-effect-reviewed-preview",
        combatId: combat.id,
        revisions: { combatUpdatedAt: restartedStore.state.combats.find((candidate) => candidate.id === combat.id)!.updatedAt },
      });

      const staleApply = await restartedApp.inject({
        method: "POST",
        url: advanceUrl,
        headers: { ...gmHeaders, "idempotency-key": "managed-effect-stale-apply" },
        payload: { preparedPreviewKey: prepared.json().preparation.preparedPreviewKey, expectedUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(staleApply.statusCode).toBe(409);

      const applyHeaders = { ...gmHeaders, "idempotency-key": "managed-effect-reviewed-apply" };
      const applyPayload = {
        preparedPreviewKey: prepared.json().preparation.preparedPreviewKey,
        expectedUpdatedAt: prepared.json().preparation.revisions.combatUpdatedAt,
      };
      const applied = await restartedApp.inject({ method: "POST", url: advanceUrl, headers: applyHeaders, payload: applyPayload });
      expect(applied.statusCode, applied.body).toBe(200);
      expect(applied.json()).toMatchObject({
        evaluation: { canApply: true, events: [expect.objectContaining({ effectId, status: "save_succeeded", outcome: "success" })] },
        undo: { mutationId: expect.any(String) },
      });
      expect(restartedStore.state.dndRulesMutations.find((mutation) => mutation.id === applied.json().rulesMutationId)).toMatchObject({ kind: "effect_schedule", status: "applied" });
      expect(restartedStore.state.actors.find((actor) => actor.id === target.id)?.data.conditions).toEqual([]);
      expect((restartedStore.state.actors.find((actor) => actor.id === target.id)?.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toEqual([]);
      expect(restartedStore.state.combats.find((candidate) => candidate.id === combat.id)?.combatants[1]?.conditions).toEqual([]);

      const replay = await restartedApp.inject({ method: "POST", url: advanceUrl, headers: applyHeaders, payload: applyPayload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(restartedStore.state.auditLogs.filter((entry) => entry.action === "combat.effectScheduleAdvanced")).toHaveLength(1);

      const turnStore = new MemoryStateStore(structuredClone(restartedStore.state));
      const turnApp = await buildApp({ store: turnStore });
      try {
        const nextTurn = await turnApp.inject({
          method: "PATCH",
          url: `/api/v1/combats/${combat.id}`,
          headers: gmHeaders,
          payload: { round: 2, turnIndex: 0 },
        });
        expect(nextTurn.statusCode, nextTurn.body).toBe(200);
        expect(nextTurn.json()).toMatchObject({ round: 2, turnIndex: 0 });
      } finally {
        await turnApp.close();
      }

      const { mutationId, ...undoPayload } = applied.json().undo;
      const undone = await restartedApp.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/rules-mutations/${mutationId}/undo`,
        headers: { ...gmHeaders, "idempotency-key": "managed-effect-reviewed-undo" },
        payload: undoPayload,
      });
      expect(undone.statusCode, undone.body).toBe(200);
      expect(undone.json()).toMatchObject({ undone: true, mutation: { id: mutationId, kind: "effect_schedule", status: "undone" } });
      const restoredTarget = restartedStore.state.actors.find((actor) => actor.id === target.id)!;
      expect(restoredTarget.data.conditions).toEqual([expect.objectContaining({ id: "paralyzed" })]);
      expect((restoredTarget.data.rulesEngine as { activeEffects: Array<Record<string, unknown>> }).activeEffects).toContainEqual(
        expect.objectContaining({ id: effectId, schedule: expect.objectContaining({ timing: "end_turn", anchorActorId: target.id }) }),
      );
      expect(restartedStore.state.combats.find((candidate) => candidate.id === combat.id)?.combatants[1]?.conditions).toEqual(["paralyzed:10"]);
    } finally {
      await restartedApp.close();
    }
  }, 15_000);

  it("returns source-backed specialized spell previews without committing spell state", async () => {
    const store = new MemoryStateStore();
    const { actor, target } = addAdvancedMechanicsFixtures(store);
    const app = await buildApp({ store });
    const route = "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/spell-helper/preview";

    try {
      const before = structuredClone(store.state.actors);
      const magicMissile = await app.inject({
        method: "POST", url: route, headers: playerHeaders,
        payload: { casterActorId: actor.id, spellId: "magic-missile", targetActorIds: [target.id], slotLevel: 1, options: { dartAssignments: { [target.id]: 3 } } },
      });
      expect(magicMissile.statusCode).toBe(200);
      expect(magicMissile.json()).toMatchObject({
        preview: { spellId: "magic-missile", supported: true, automation: "preview_only" },
        source: { id: "compendium:dnd-5e-srd:magic-missile", provenance: expect.any(Object) },
      });
      expect(magicMissile.json().preview.rolls).toEqual([expect.objectContaining({ formula: "3d4+3", targetActorId: target.id })]);

      const moonbeam = await app.inject({
        method: "POST", url: route, headers: gmHeaders,
        payload: { casterActorId: actor.id, spellId: "moonbeam", targetActorIds: [target.id], slotLevel: 3 },
      });
      expect(moonbeam.statusCode).toBe(200);
      expect(moonbeam.json().preview).toMatchObject({ spellId: "moonbeam", supported: true, automation: "schedule_template" });
      expect(moonbeam.json().preview.manualSteps).toEqual(expect.arrayContaining([expect.stringContaining("geometry")]));
      expect(store.state.actors).toEqual(before);
    } finally {
      await app.close();
    }
  });
});
