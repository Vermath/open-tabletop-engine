import { describe, expect, it } from "vitest";

import {
  emptyState,
  makeArchive,
  normalizeEngineState,
  seedState,
} from "./state.js";
import type { Combat, DndRulesMutation, Item } from "./types.js";

const beforeRevision = "2026-07-13T16:00:00.000Z";
const afterRevision = "2026-07-13T16:01:00.000Z";

function mutation(
  kind: DndRulesMutation["kind"],
  id: string,
  campaignId = "camp_demo",
): DndRulesMutation {
  return {
    id,
    campaignId,
    kind,
    preparedPreviewKey: `preview_${id}`,
    committedByUserId: "usr_demo_gm",
    status: "applied",
    roots: {
      actors: [
        {
          actorId: "act_valen",
          before: {
            data: {
              hp: { current: 12, max: 12 },
              resources: { secondWind: 1 },
            },
            revision: beforeRevision,
          },
          afterRevision,
        },
      ],
      items: [
        {
          itemId: "item_longsword",
          before: {
            data: { quantity: 1, uses: { current: 1, max: 1 } },
            revision: beforeRevision,
          },
          afterRevision,
        },
      ],
    },
    createdAt: afterRevision,
    updatedAt: afterRevision,
  };
}

function combat(): Combat {
  return {
    id: "combat_demo",
    campaignId: "camp_demo",
    active: true,
    round: 2,
    turnIndex: 0,
    combatants: [
      {
        id: "combatant_valen",
        tokenId: "tok_valen",
        actorId: "act_valen",
        name: "Valen",
        initiative: 15,
        defeated: false,
        conditions: ["restrained:effect_web"],
      },
    ],
    effectScheduleEvents: [],
    createdAt: beforeRevision,
    updatedAt: beforeRevision,
  };
}

describe("durable D&D rules mutation state", () => {
  it("defaults the collection for new, legacy, and malformed persisted state", () => {
    expect(emptyState().dndRulesMutations).toEqual([]);

    const { dndRulesMutations: _dndRulesMutations, ...legacy } = seedState();
    expect(normalizeEngineState(legacy).dndRulesMutations).toEqual([]);
    expect(
      normalizeEngineState({ ...legacy, dndRulesMutations: null as never })
        .dndRulesMutations,
    ).toEqual([]);
  });

  it("preserves exact actor, item, and full combat roots for every supported prepared commit kind", () => {
    const typedDamage = mutation("typed_damage", "rules_mutation_damage");
    const action = mutation("action", "rules_mutation_action");
    const effectSchedule = mutation(
      "effect_schedule",
      "rules_mutation_effect_schedule",
    );
    effectSchedule.roots.combat = {
      combatId: "combat_demo",
      before: combat(),
      afterRevision,
    };
    effectSchedule.status = "undone";
    effectSchedule.undoneAt = "2026-07-13T16:02:00.000Z";
    effectSchedule.undoneByUserId = "usr_demo_gm";

    const state = seedState();
    state.dndRulesMutations.push(typedDamage, action, effectSchedule);

    expect(normalizeEngineState(state).dndRulesMutations).toEqual([
      typedDamage,
      action,
      effectSchedule,
    ]);
  });

  it("archives only the campaign ledger as a detached, normalization-safe snapshot", () => {
    const state = seedState();
    const sourceItem: Item = {
      id: "item_longsword",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: "act_valen",
      type: "weapon",
      name: "Longsword",
      data: { quantity: 1 },
      createdAt: beforeRevision,
      updatedAt: beforeRevision,
    };
    state.items.push(sourceItem);

    const campaignMutation = mutation("action", "rules_mutation_action");
    campaignMutation.roots.combat = {
      combatId: "combat_demo",
      before: combat(),
      afterRevision,
    };
    state.dndRulesMutations.push(
      campaignMutation,
      mutation("typed_damage", "rules_mutation_other", "camp_other"),
    );

    const archive = makeArchive(state, "camp_demo");

    expect(archive.data.dndRulesMutations).toEqual([campaignMutation]);
    archive.data.dndRulesMutations[0]!.roots.actors[0]!.before.data.hp = {
      current: 1,
    };
    archive.data.dndRulesMutations[0]!.roots.combat!.before.round = 99;
    expect(state.dndRulesMutations[0]!.roots.actors[0]!.before.data.hp).toEqual(
      {
        current: 12,
        max: 12,
      },
    );
    expect(state.dndRulesMutations[0]!.roots.combat!.before.round).toBe(2);

    expect(normalizeEngineState(archive.data).dndRulesMutations).toEqual(
      archive.data.dndRulesMutations,
    );
  });
});
