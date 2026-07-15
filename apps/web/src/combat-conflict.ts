import type { Combat } from "@open-tabletop/core";
import { ApiError } from "./api.js";
import { recordValue } from "./sheet-format.js";

/**
 * Extracts the authoritative combat carried by a structured stale-write
 * conflict response, when the conflict is about the requested combat.
 */
export function staleWriteCurrentCombat(error: unknown, combatId: string): Combat | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  const body = recordValue(error.body);
  if (body.code !== "stale_write" || body.resourceType !== "combat") return undefined;
  const current = recordValue(body.current);
  if (current.id !== combatId || typeof current.campaignId !== "string" || typeof current.updatedAt !== "string" || !Array.isArray(current.combatants)) return undefined;
  return current as unknown as Combat;
}

/**
 * A turn/round advance may be retried against refreshed combat state only when
 * the concurrent write left the turn position exactly where the user saw it;
 * anything else (someone already advanced, combatants changed order length)
 * requires explicit review so a retry can never double-advance the round.
 */
export function combatTurnAdvanceRetryIsSafe(
  attempted: Pick<Combat, "round" | "turnIndex" | "combatants">,
  refreshed: Pick<Combat, "round" | "turnIndex" | "combatants">
): boolean {
  return (
    refreshed.round === attempted.round &&
    refreshed.turnIndex === attempted.turnIndex &&
    refreshed.combatants.length === attempted.combatants.length
  );
}
