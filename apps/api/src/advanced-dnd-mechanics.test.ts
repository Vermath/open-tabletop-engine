import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
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
