import { describe, expect, it } from "vitest";
import {
  actionPreviewContinuationMetadata,
  actionPreviewContinuationSelection,
  actionPreviewContinuationTickets,
  actorActionDraftForScope,
  actorActionDraftScopeKey,
  actorActionTargetLabel,
  actionPreviewForFingerprint,
  actionPreviewIsReady,
  actionPreviewStatusMessage,
  createActionPreviewFingerprint,
  initialActorActionDraft,
  initialActionPreviewState,
  reduceActionPreviewState,
  scopedActorActionTargetIds
} from "./action-preview-state.js";

function fingerprint(overrides: Partial<Parameters<typeof createActionPreviewFingerprint>[0]> = {}): string {
  return createActionPreviewFingerprint({
    campaignId: "camp-1",
    actorId: "actor-1",
    actorUpdatedAt: "2026-07-17T10:00:00.000Z",
    systemId: "dnd-5e-srd",
    rollId: "longsword-damage",
    targetActorId: "actor-2",
    targetActorUpdatedAt: "2026-07-17T10:00:01.000Z",
    applyEffect: true,
    consumeResources: true,
    saveOutcomes: { "actor-3": "failure", "actor-2": "success" },
    itemRevisions: [{ id: "item-2", updatedAt: "2" }, { id: "item-1", updatedAt: "1" }],
    combat: { id: "combat-1", updatedAt: "3", round: 2, turnIndex: 1, activeCombatantId: "combatant-1" },
    ...overrides
  });
}

describe("action preview identity", () => {
  it("is stable across record key order but changes with authoritative revisions and selections", () => {
    const first = fingerprint();
    const same = fingerprint({ saveOutcomes: { "actor-2": "success", "actor-3": "failure" } });

    expect(same).toBe(first);
    expect(fingerprint({ targetActorId: "actor-4" })).not.toBe(first);
    expect(fingerprint({ actorUpdatedAt: "2026-07-17T10:00:02.000Z" })).not.toBe(first);
    expect(fingerprint({ continuationId: "combat-1:2:1:actor-1:2" })).not.toBe(first);
    expect(fingerprint({ actorRevisions: [{ id: "actor-cleave", updatedAt: "2026-07-17T10:00:03.000Z" }] })).not.toBe(first);
    expect(fingerprint({ combat: { id: "combat-1", updatedAt: "4", round: 2, turnIndex: 1, activeCombatantId: "combatant-1" } })).not.toBe(first);
  });

  it("accepts only the latest matching request and never exposes a stale preview as ready", () => {
    const oldFingerprint = fingerprint();
    const nextFingerprint = fingerprint({ targetActorId: "actor-4" });
    let state = initialActionPreviewState<{ id: string }>();

    state = reduceActionPreviewState(state, { type: "request", requestId: 1, fingerprint: oldFingerprint });
    state = reduceActionPreviewState(state, { type: "invalidate" });
    state = reduceActionPreviewState(state, { type: "request", requestId: 3, fingerprint: nextFingerprint });
    state = reduceActionPreviewState(state, { type: "resolve", requestId: 1, fingerprint: oldFingerprint, preview: { id: "stale" } });

    expect(actionPreviewForFingerprint(state, nextFingerprint)).toBeUndefined();
    expect(actionPreviewIsReady(state, nextFingerprint)).toBe(false);

    state = reduceActionPreviewState(state, { type: "resolve", requestId: 3, fingerprint: nextFingerprint, preview: { id: "current" } });
    expect(actionPreviewForFingerprint(state, nextFingerprint)).toEqual({ id: "current" });
    expect(actionPreviewIsReady(state, nextFingerprint)).toBe(true);
    expect(actionPreviewForFingerprint(state, oldFingerprint)).toBeUndefined();
    expect(actionPreviewStatusMessage(state, oldFingerprint)).toBe("Preview changed; refreshing");
  });

  it("ignores a delayed failure after a newer preview is ready", () => {
    const currentFingerprint = fingerprint();
    let state = initialActionPreviewState<{ id: string }>();
    state = reduceActionPreviewState(state, { type: "request", requestId: 2, fingerprint: currentFingerprint });
    state = reduceActionPreviewState(state, { type: "resolve", requestId: 2, fingerprint: currentFingerprint, preview: { id: "ready" } });
    const afterDelayedFailure = reduceActionPreviewState(state, { type: "reject", requestId: 1, fingerprint: currentFingerprint, message: "old failure" });

    expect(afterDelayedFailure).toBe(state);
    expect(actionPreviewForFingerprint(afterDelayedFailure, currentFingerprint)).toEqual({ id: "ready" });
  });
});

describe("actor action draft boundaries", () => {
  it("synchronously resets destructive choices when actor, scene, or combat changes", () => {
    const firstScope = actorActionDraftScopeKey({ campaignId: "camp-1", actorId: "hero-1", sceneId: "scene-1", combatId: "combat-1" });
    const nextSceneScope = actorActionDraftScopeKey({ campaignId: "camp-1", actorId: "hero-1", sceneId: "scene-2", combatId: "combat-1" });
    const dirty = { ...initialActorActionDraft(firstScope, "hero-1"), targetActorId: "old-cultist", applyEffect: true, consumeResources: false };

    expect(actorActionDraftForScope(dirty, firstScope, "hero-1")).toBe(dirty);
    expect(actorActionDraftForScope(dirty, nextSceneScope, "hero-1")).toEqual({
      scopeKey: nextSceneScope,
      targetActorId: "hero-1",
      applyEffect: false,
      consumeResources: true
    });
    expect(actorActionDraftForScope(dirty, actorActionDraftScopeKey({ campaignId: "camp-1", actorId: "hero-1", sceneId: "scene-1", combatId: "combat-2" }), "hero-1"))
      .toMatchObject({ targetActorId: "hero-1", applyEffect: false, consumeResources: true });
    expect(actorActionDraftForScope(dirty, actorActionDraftScopeKey({ campaignId: "camp-1", actorId: "hero-2", sceneId: "scene-1", combatId: "combat-2" }), "hero-2"))
      .toMatchObject({ targetActorId: "hero-2", applyEffect: false, consumeResources: true });
  });

  it("keeps targets on the selected scene when the source has no scene token and disambiguates duplicate names", () => {
    const actors = [
      { id: "hero", name: "Aric" },
      { id: "old-cultist", name: "Cultist" },
      { id: "new-cultist", name: "Cultist" }
    ];
    const ids = scopedActorActionTargetIds({
      actorIds: actors.map((actor) => actor.id),
      tokens: [
        { actorId: "old-cultist", sceneId: "market" },
        { actorId: "new-cultist", sceneId: "sanctum" }
      ],
      sourceActorId: "hero",
      sceneId: "sanctum",
      combatActorIds: ["hero", "old-cultist", "new-cultist"]
    });

    expect(ids).toContain("hero");
    expect(ids).toEqual(["hero", "new-cultist"]);
    expect(ids).not.toContain("old-cultist");
    expect(actorActionTargetLabel(actors[2]!, actors.slice(1), "Sanctum token 2")).toBe("Cultist (Sanctum token 2)");
    expect(scopedActorActionTargetIds({ actorIds: actors.map((actor) => actor.id), tokens: [], sourceActorId: "hero" })).toEqual(["hero"]);
  });
});

describe("action continuation metadata", () => {
  it("normalizes the exact server continuation and authoritative critical outcome", () => {
    expect(actionPreviewContinuationMetadata({
      action: {
        metadata: {
          continuationId: "combat-1:2:1:actor-1:4",
          criticalHitTargetActorIds: ["actor-2", "actor-2"],
          criticalOutcomes: [{
            targetActorId: "actor-2",
            naturalD20: 19,
            criticalMinimum: 19,
            outcome: "critical-hit",
            criticalNegated: false,
            finalCritical: true
          }]
        }
      }
    })).toEqual({
      continuationId: "combat-1:2:1:actor-1:4",
      criticalHitTargetActorIds: ["actor-2"],
      criticalOutcomes: [{
        targetActorId: "actor-2",
        naturalD20: 19,
        criticalMinimum: 19,
        outcome: "critical-hit",
        criticalNegated: false,
        finalCritical: true
      }]
    });
  });

  it("drops malformed metadata rather than enabling an untrusted continuation", () => {
    expect(actionPreviewContinuationMetadata({ action: { metadata: { continuationId: " ", criticalOutcomes: [{ outcome: "critical-hit" }] } } })).toEqual({
      criticalOutcomes: [],
      criticalHitTargetActorIds: []
    });
  });

  it("keeps every same-weapon Extra Attack ticket distinct with its own critical lineage", () => {
    const actorData = {
      rulesEngine: {
        actionEconomy: {
          continuations: {
            "combat-1": {
              round: 2,
              turnIndex: 1,
              actorId: "actor-1",
              tickets: [
                {
                  continuationId: "combat-1:2:1:actor-1:1",
                  sourceRollId: "item-sword-attack",
                  targetActorIds: ["actor-2"],
                  allowances: [{ rollId: "item-sword-damage" }],
                  criticalHitTargetActorIds: ["actor-2"],
                  criticalOutcomes: [{ targetActorId: "actor-2", naturalD20: 20, criticalMinimum: 20, outcome: "critical-hit", criticalNegated: false, finalCritical: true }]
                },
                {
                  continuationId: "combat-1:2:1:actor-1:2",
                  sourceRollId: "item-sword-attack",
                  targetActorIds: ["actor-2"],
                  allowances: [{ rollId: "item-sword-damage" }],
                  criticalOutcomes: [{ targetActorId: "actor-2", naturalD20: 14, criticalMinimum: 20, outcome: "hit", criticalNegated: false, finalCritical: false }]
                }
              ]
            }
          }
        }
      }
    };

    const tickets = actionPreviewContinuationTickets(actorData, "actor-1", { id: "combat-1", round: 2, turnIndex: 1 }, "item-sword-damage", ["actor-2"]);
    expect(tickets).toEqual([
      expect.objectContaining({ continuationId: "combat-1:2:1:actor-1:1", criticalHitTargetActorIds: ["actor-2"], criticalOutcomes: [expect.objectContaining({ naturalD20: 20, finalCritical: true })] }),
      expect.objectContaining({ continuationId: "combat-1:2:1:actor-1:2", criticalHitTargetActorIds: [], criticalOutcomes: [expect.objectContaining({ naturalD20: 14, finalCritical: false })] })
    ]);
    expect(actionPreviewContinuationSelection(tickets, undefined)).toBeUndefined();
    expect(actionPreviewContinuationSelection(tickets, "combat-1:2:1:actor-1:1")?.criticalOutcomes[0]).toMatchObject({ naturalD20: 20, finalCritical: true });
  });
});
