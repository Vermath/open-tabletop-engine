import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActorActionResolutionPreview } from "./actor-action-review.js";
import { ActionPreviewCommitButton } from "./action-preview-binding.js";
import {
  createActionPreviewFingerprint,
  initialActionPreviewState,
  reduceActionPreviewState,
  type ActionPreviewState
} from "./action-preview-state.js";
import { upsertNewestRealtimeRecord } from "./realtime-snapshot-delta.js";

type RevisionRecord = { id: string; updatedAt: string; revision: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function preview(continuationId: string): ActorActionResolutionPreview {
  return {
    commitMode: "preview",
    action: {
      label: "Longsword",
      kind: "action",
      metadata: {
        continuationId,
        criticalHitTargetActorIds: [],
        criticalOutcomes: []
      }
    }
  } as ActorActionResolutionPreview;
}

describe("action preview HTTP and realtime ordering", () => {
  it("renders only the continuation bound to the newest actor, item, and combat revisions", async () => {
    const actorOld: RevisionRecord = { id: "actor-1", updatedAt: "2026-07-17T10:00:00.000Z", revision: "actor-old" };
    const itemOld: RevisionRecord = { id: "item-1", updatedAt: "2026-07-17T10:00:00.000Z", revision: "item-old" };
    const combatOld: RevisionRecord = { id: "combat-1", updatedAt: "2026-07-17T10:00:00.000Z", revision: "combat-old" };
    const actorNew: RevisionRecord = { ...actorOld, updatedAt: "2026-07-17T10:00:03.000Z", revision: "actor-new" };
    const itemNew: RevisionRecord = { ...itemOld, updatedAt: "2026-07-17T10:00:02.000Z", revision: "item-new" };
    const combatNew: RevisionRecord = { ...combatOld, updatedAt: "2026-07-17T10:00:04.000Z", revision: "combat-new" };

    let actors = [actorOld];
    let items = [itemOld];
    let combats = [combatOld];
    let state: ActionPreviewState<ActorActionResolutionPreview> = initialActionPreviewState();
    const fingerprint = () => createActionPreviewFingerprint({
      campaignId: "campaign-1",
      actorId: actors[0]!.id,
      actorUpdatedAt: actors[0]!.updatedAt,
      systemId: "dnd-5e-srd",
      rollId: "longsword-attack",
      targetActorId: "actor-2",
      applyEffect: true,
      consumeResources: true,
      itemRevisions: items.map(({ id, updatedAt }) => ({ id, updatedAt })),
      combat: {
        id: combats[0]!.id,
        updatedAt: combats[0]!.updatedAt,
        round: 2,
        turnIndex: 0,
        activeCombatantId: "combatant-1"
      }
    });

    const staleFingerprint = fingerprint();
    const staleHttp = deferred<{ preview: ActorActionResolutionPreview; actor: RevisionRecord; item: RevisionRecord; combat: RevisionRecord }>();
    state = reduceActionPreviewState(state, { type: "request", requestId: 1, fingerprint: staleFingerprint });
    const applyHttp = async (
      requestId: number,
      requestFingerprint: string,
      response: Promise<{ preview: ActorActionResolutionPreview; actor: RevisionRecord; item: RevisionRecord; combat: RevisionRecord }>
    ) => {
      const result = await response;
      actors = upsertNewestRealtimeRecord(actors, result.actor);
      items = upsertNewestRealtimeRecord(items, result.item);
      combats = upsertNewestRealtimeRecord(combats, result.combat);
      state = reduceActionPreviewState(state, { type: "resolve", requestId, fingerprint: requestFingerprint, preview: result.preview });
    };
    const staleCompletion = applyHttp(1, staleFingerprint, staleHttp.promise);

    // Realtime advances every revision while the first HTTP preview is still pending.
    actors = upsertNewestRealtimeRecord(actors, actorNew);
    items = upsertNewestRealtimeRecord(items, itemNew);
    combats = upsertNewestRealtimeRecord(combats, combatNew);
    state = reduceActionPreviewState(state, { type: "invalidate", message: "Authoritative state changed" });

    const currentFingerprint = fingerprint();
    const currentHttp = deferred<{ preview: ActorActionResolutionPreview; actor: RevisionRecord; item: RevisionRecord; combat: RevisionRecord }>();
    state = reduceActionPreviewState(state, { type: "request", requestId: 2, fingerprint: currentFingerprint });
    const currentCompletion = applyHttp(2, currentFingerprint, currentHttp.promise);

    currentHttp.resolve({ preview: preview("continuation-current"), actor: actorNew, item: itemNew, combat: combatNew });
    await currentCompletion;
    staleHttp.resolve({ preview: preview("continuation-stale"), actor: actorOld, item: itemOld, combat: combatOld });
    await staleCompletion;

    expect(actors[0]).toEqual(actorNew);
    expect(items[0]).toEqual(itemNew);
    expect(combats[0]).toEqual(combatNew);

    const currentControl = renderToStaticMarkup(
      <ActionPreviewCommitButton state={state} fingerprint={currentFingerprint} canCommit onCommit={() => undefined} />
    );
    expect(currentControl).toContain("Continue to final review for previewed action");
    expect(currentControl).toContain("Continue to final review");
    expect(currentControl).toContain('aria-haspopup="dialog"');
    expect(currentControl).toContain('data-continuation-id="continuation-current"');
    expect(currentControl).not.toContain("disabled");
    expect(currentControl).not.toContain("continuation-stale");

    const staleControl = renderToStaticMarkup(
      <ActionPreviewCommitButton state={state} fingerprint={staleFingerprint} canCommit onCommit={() => undefined} />
    );
    expect(staleControl).toContain("disabled");
    expect(staleControl).not.toContain("data-continuation-id");
  });
});
