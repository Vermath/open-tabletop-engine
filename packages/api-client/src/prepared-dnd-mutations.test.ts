import type {
  Dnd5eSrdPendingAdvancementCancelResult,
  Dnd5eSrdTypedDamageApplyResult,
  DndRulesMutationUndoResult,
} from "@open-tabletop/core";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  OpenTabletopClient,
  type CombatEffectScheduleAdvanceResult,
  type Dnd5eSrdRulesPreviewResult,
  type SystemActorRollResult,
} from "./index.js";

const campaignId = "camp_prepared";
const actorId = "actor_source";
const targetActorId = "actor_target";
const revision = "2026-07-13T00:00:00.000Z";

function captureClient() {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const client = new OpenTabletopClient("https://api.test", {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: new URL(input.toString()), init });
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  return { client, requests };
}

describe("prepared D&D mutation client", () => {
  it("prepares multi-target typed damage and exposes the batch revision envelope", async () => {
    let captured: { url: URL; init?: RequestInit } | undefined;
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: new URL(input.toString()), init };
        return new Response(JSON.stringify({
          operation: "typed-damage",
          actorId,
          status: "ready",
          blockers: [],
          serverRolls: [],
          validation: { actor: {}, items: [] },
          changes: [],
          previewVersion: "1",
          rulesVersion: "2024",
          actorSchemaVersion: "1",
          itemSchemaVersion: "1",
          batch: { targets: [{ actorId, actorName: "Source", preview: {} }, { actorId: targetActorId, actorName: "Target", preview: {} }] },
          preparation: {
            preparedPreviewKey: "damage-preview-1",
            actorUpdatedAt: { [actorId]: revision, [targetActorId]: revision },
            itemUpdatedAt: {},
            combatId: "combat-1",
            combatUpdatedAt: revision,
            request: { operation: "typed-damage", amount: 7, damageType: "fire", criticalHit: true, targetActorIds: [targetActorId] },
            resolutionHash: "sha256:reviewed",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    const result = await client.systemActorRulesPreview(campaignId, "dnd-5e-srd", actorId, {
      operation: "typed-damage",
      amount: 7,
      damageType: "fire",
      criticalHit: true,
      targetActorIds: [targetActorId],
      prepare: true,
    }, "damage-preview-1");

    expectTypeOf(result).toEqualTypeOf<Dnd5eSrdRulesPreviewResult>();
    expect(captured?.url.pathname).toBe(`/api/v1/campaigns/${campaignId}/systems/dnd-5e-srd/actors/${actorId}/rules-preview`);
    expect(new Headers(captured?.init?.headers).get("Idempotency-Key")).toBe("damage-preview-1");
    expect(result.batch?.targets.map((target) => target.actorId)).toEqual([actorId, targetActorId]);
    expect(result.preparation?.actorUpdatedAt).toEqual({ [actorId]: revision, [targetActorId]: revision });
    expect(result.preparation).toEqual(expect.objectContaining({ combatId: "combat-1", combatUpdatedAt: revision }));
  });

  it("sends exact typed-damage, pending-advancement, and undo commits with separate replay keys", async () => {
    const { client, requests } = captureClient();

    const damage = client.applyDnd5eSrdTypedDamage(campaignId, "dnd-5e-srd", actorId, {
      preparedPreviewKey: "damage-preview-1",
      expectedActorUpdatedAt: { [actorId]: revision, [targetActorId]: revision },
      expectedItemUpdatedAt: { item_1: revision },
      expectedCombatUpdatedAt: revision,
    }, { idempotencyKey: "damage-commit-1" });
    const cancellation = client.cancelDnd5eSrdPendingAdvancement(campaignId, "dnd-5e-srd", actorId, {
      pendingAdvancementId: "padv_1",
      expectedUpdatedAt: revision,
    }, { idempotencyKey: "advancement-cancel-1" });
    const undo = client.undoDndRulesMutation(campaignId, "drmut_1", {
      expectedActorUpdatedAt: { [actorId]: "2026-07-13T00:00:01.000Z" },
      expectedItemUpdatedAt: {},
      expectedCombatUpdatedAt: "2026-07-13T00:00:01.000Z",
    }, { idempotencyKey: "mutation-undo-1" });

    expectTypeOf(damage).toEqualTypeOf<Promise<Dnd5eSrdTypedDamageApplyResult>>();
    expectTypeOf(cancellation).toEqualTypeOf<Promise<Dnd5eSrdPendingAdvancementCancelResult>>();
    expectTypeOf(undo).toEqualTypeOf<Promise<DndRulesMutationUndoResult>>();
    await Promise.all([damage, cancellation, undo]);

    expect(requests.map(({ url, init }) => [init?.method, url.pathname, new Headers(init?.headers).get("Idempotency-Key")])).toEqual([
      ["POST", `/api/v1/campaigns/${campaignId}/systems/dnd-5e-srd/actors/${actorId}/typed-damage/apply`, "damage-commit-1"],
      ["DELETE", `/api/v1/campaigns/${campaignId}/systems/dnd-5e-srd/actors/${actorId}/advancement/pending`, "advancement-cancel-1"],
      ["POST", `/api/v1/campaigns/${campaignId}/dnd/rules-mutations/drmut_1/undo`, "mutation-undo-1"],
    ]);
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      preparedPreviewKey: "damage-preview-1",
      expectedActorUpdatedAt: { [actorId]: revision, [targetActorId]: revision },
      expectedItemUpdatedAt: { item_1: revision },
      expectedCombatUpdatedAt: revision,
    });
  });

  it("keeps preview keys in bodies and commit retry keys in headers for advancement, rest, and actions", async () => {
    const { client, requests } = captureClient();

    await client.commitDnd5eSrdAdvancement(campaignId, actorId, {
      optionId: "level-up",
      preparedPreviewKey: "advancement-preview-1",
      expectedUpdatedAt: revision,
    }, { idempotencyKey: "advancement-commit-1" });
    await client.commitDnd5eSrdRest(campaignId, actorId, {
      restType: "long",
      preparedPreviewKey: "rest-preview-1",
      expectedUpdatedAt: revision,
    }, { idempotencyKey: "rest-commit-1" });
    const preparedAction = client.prepareDnd5eSrdAction(campaignId, actorId, {
      rollId: "longsword",
      targetActorIds: [targetActorId],
      applyEffect: true,
      prepare: true,
    }, { idempotencyKey: "action-preview-1" });
    const committedAction = client.commitDnd5eSrdAction(campaignId, actorId, {
      preparedPreviewKey: "action-preview-1",
      expectedUpdatedAt: revision,
    }, { idempotencyKey: "action-commit-1" });

    expectTypeOf(preparedAction).toMatchTypeOf<Promise<SystemActorRollResult>>();
    expectTypeOf(committedAction).toEqualTypeOf<Promise<SystemActorRollResult>>();
    await Promise.all([preparedAction, committedAction]);

    expect(requests.map(({ init }) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([
      "advancement-commit-1",
      "rest-commit-1",
      "action-preview-1",
      "action-commit-1",
    ]);
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({ preparedPreviewKey: "advancement-preview-1", expectedUpdatedAt: revision });
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ preparedPreviewKey: "rest-preview-1", expectedUpdatedAt: revision });
    expect(JSON.parse(String(requests[3]?.init?.body))).toEqual({ preparedPreviewKey: "action-preview-1", expectedUpdatedAt: revision });
  });

  it("rejects unprepared consequential D&D commits but leaves other systems compatible", async () => {
    const { client, requests } = captureClient();

    await expect(client.rollSystemActor(campaignId, "dnd-5e-srd", actorId, {
      rollId: "longsword",
      applyEffect: true,
    })).rejects.toThrow("must be prepared before commit");
    await expect(client.advanceSystemActor(campaignId, "dnd-5e-srd", actorId, {
      optionId: "level-up",
    })).rejects.toThrow("preparedPreviewKey and expectedUpdatedAt");
    await client.advanceSystemActor(campaignId, "custom-system", actorId, { optionId: "advance" });
    await client.restSystemActor(campaignId, "custom-system", actorId, { restType: "short" });
    await client.rollSystemActor(campaignId, "custom-system", actorId, { actionId: "strike", applyEffect: true });

    expect(requests).toHaveLength(3);
  });

  it("prepares and advances scheduled effects from the exact reviewed token", async () => {
    const { client, requests } = captureClient();

    await client.previewCombatEffectSchedule("combat_1", {
      phase: "end_turn",
      saveOutcomes: { effect_1: "success" },
      prepare: true,
    }, { idempotencyKey: "effects-preview-1" });
    const result = client.advanceCombatEffectSchedule("combat_1", {
      preparedPreviewKey: "effects-preview-1",
      expectedUpdatedAt: revision,
    }, { idempotencyKey: "effects-commit-1" });

    expectTypeOf(result).toEqualTypeOf<Promise<CombatEffectScheduleAdvanceResult>>();
    await result;
    expect(requests.map(({ init }) => new Headers(init?.headers).get("Idempotency-Key"))).toEqual([
      "effects-preview-1",
      "effects-commit-1",
    ]);
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      preparedPreviewKey: "effects-preview-1",
      expectedUpdatedAt: revision,
    });
  });
});
