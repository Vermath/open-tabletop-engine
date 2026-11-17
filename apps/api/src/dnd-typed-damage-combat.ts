import type { Actor, Combat, Combatant } from "@open-tabletop/core";
import { synchronizeDnd5eSrdActorCombatState } from "@open-tabletop/system-sdk";

export interface DndTypedDamageCombatantChange {
  actorId: string;
  combatantId: string;
  before: Combatant;
  after: Combatant;
}

/** Finds the active combat whose tracker contains at least one reviewed target. */
export function activeCombatForTypedDamage(
  combats: readonly Combat[],
  campaignId: string,
  actorIds: Iterable<string>
): Combat | undefined {
  const targetIds = new Set(actorIds);
  return combats.find((combat) =>
    combat.campaignId === campaignId &&
    combat.active &&
    combat.combatants.some((combatant) => Boolean(combatant.actorId && targetIds.has(combatant.actorId)))
  );
}

/**
 * Produces exact combatant replacements from the already-reviewed actor states.
 * Actor data is deliberately not changed here: typed-damage preview owns that
 * diff, while this bridge keeps the active combat tracker in the same commit.
 */
export function dndTypedDamageCombatantChanges(
  combat: Combat,
  actors: readonly Actor[]
): DndTypedDamageCombatantChange[] {
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
  return combat.combatants.flatMap((combatant) => {
    if (!combatant.actorId) return [];
    const actor = actorsById.get(combatant.actorId);
    if (!actor) return [];
    const update = synchronizeDnd5eSrdActorCombatState(actor, combatant).combatantUpdate;
    if (!update) return [];
    return [{
      actorId: actor.id,
      combatantId: combatant.id,
      before: structuredClone(update.before),
      after: structuredClone(update.after)
    }];
  });
}
