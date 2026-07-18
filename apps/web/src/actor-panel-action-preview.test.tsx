import type { Actor, Item } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActionContinuationTicketPicker, actorActionPreviewRevisions } from "./actor-panel.js";
import { createActionPreviewFingerprint, type ActionPreviewContinuationTicket } from "./action-preview-state.js";

const timestamp = "2026-07-17T10:00:00.000Z";

function actor(id: string, updatedAt = timestamp): Actor {
  return { id, campaignId: "campaign-1", systemId: "dnd-5e-srd", name: id, type: "character", data: {}, createdAt: timestamp, updatedAt } as Actor;
}

function item(id: string, actorId: string, updatedAt = timestamp): Item {
  return { id, actorId, campaignId: "campaign-1", systemId: "dnd-5e-srd", name: id, type: "item", data: {}, createdAt: timestamp, updatedAt } as Item;
}

describe("ActorPanel authoritative action preview inputs", () => {
  it("renders distinct same-weapon Extra Attack tickets with exact critical lineage", () => {
    const tickets: ActionPreviewContinuationTicket[] = [
      {
        continuationId: "combat-1:2:1:actor-1:1",
        sourceRollId: "item-sword-attack",
        targetActorIds: ["target-1"],
        criticalHitTargetActorIds: ["target-1"],
        criticalOutcomes: [{ targetActorId: "target-1", naturalD20: 20, criticalMinimum: 20, outcome: "critical-hit", criticalNegated: false, finalCritical: true }]
      },
      {
        continuationId: "combat-1:2:1:actor-1:2",
        sourceRollId: "item-sword-attack",
        targetActorIds: ["target-1"],
        criticalHitTargetActorIds: [],
        criticalOutcomes: [{ targetActorId: "target-1", naturalD20: 14, criticalMinimum: 20, outcome: "hit", criticalNegated: false, finalCritical: false }]
      }
    ];

    const html = renderToStaticMarkup(
      <ActionContinuationTicketPicker
        tickets={tickets}
        selectedContinuationId={tickets[1]!.continuationId}
        disabled={false}
        actorName={() => "Ogre"}
        onSelect={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Attack continuation ticket"');
    expect(html).toContain('value="combat-1:2:1:actor-1:1"');
    expect(html).toContain('value="combat-1:2:1:actor-1:2"');
    expect(html).toContain("Committed attack 1 - Ogre critical hit (d20 20, threshold 20)");
    expect(html).toContain("Committed attack 2 - Ogre hit (d20 14, threshold 20)");
    expect(html).toContain('value="combat-1:2:1:actor-1:2" title="combat-1:2:1:actor-1:2" selected=""');

    const unselected = renderToStaticMarkup(
      <ActionContinuationTicketPicker tickets={tickets} disabled={false} actorName={() => "Ogre"} onSelect={vi.fn()} />
    );
    expect(unselected).toContain("Choose the exact committed attack");
  });

  it("includes a Cleave secondary target and its items in the fingerprint revisions", () => {
    const actors = [actor("source"), actor("primary"), actor("secondary")];
    const items = [item("source-item", "source"), item("primary-item", "primary"), item("secondary-item", "secondary")];
    const firstRevisions = actorActionPreviewRevisions(actors, items, ["source", "primary", "secondary"]);
    expect(firstRevisions.actorRevisions.map(({ id }) => id)).toEqual(["primary", "secondary", "source"]);
    expect(firstRevisions.itemRevisions.map(({ id }) => id)).toEqual(["primary-item", "secondary-item", "source-item"]);

    const fingerprint = (revisions: ReturnType<typeof actorActionPreviewRevisions>) => createActionPreviewFingerprint({
      campaignId: "campaign-1",
      actorId: "source",
      actorUpdatedAt: timestamp,
      systemId: "dnd-5e-srd",
      rollId: "item-greataxe-attack",
      targetActorId: "primary",
      targetActorUpdatedAt: timestamp,
      applyEffect: false,
      consumeResources: false,
      weaponMastery: { use: true, secondaryTargetActorId: "secondary", geometryConfirmed: true },
      ...revisions
    });
    const changedRevisions = actorActionPreviewRevisions(
      actors.map((candidate) => candidate.id === "secondary" ? { ...candidate, updatedAt: "2026-07-17T10:00:02.000Z" } : candidate),
      items.map((candidate) => candidate.id === "secondary-item" ? { ...candidate, updatedAt: "2026-07-17T10:00:03.000Z" } : candidate),
      ["source", "primary", "secondary"]
    );

    expect(fingerprint(changedRevisions)).not.toBe(fingerprint(firstRevisions));
  });
});
