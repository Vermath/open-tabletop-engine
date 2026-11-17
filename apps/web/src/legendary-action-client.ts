import type { Combat, CombatLegendaryActionPrompt, Dnd5eSrdLegendaryActionSpendResult } from "@open-tabletop/core";
import { apiPost, type Snapshot } from "./api.js";
import { formatNumber } from "./sheet-format.js";

export interface LegendaryActionSpendInput {
  snapshot: Pick<Snapshot, "actors" | "combats">;
  combat: Combat;
  prompt: CombatLegendaryActionPrompt;
  optionName: string;
  cost: number;
  isCurrent(): boolean;
  onApplied(result: Dnd5eSrdLegendaryActionSpendResult, status: string): void;
  onError(error: unknown): void;
}

export async function recordLegendaryActionSpend(input: LegendaryActionSpendInput): Promise<void> {
  const latestCombat = input.snapshot.combats.find((candidate) => candidate.id === input.combat.id && candidate.active) ?? input.combat;
  const latestPrompt = latestCombat.legendaryActionPrompts?.find((candidate) => candidate.id === input.prompt.id);
  const latestActor = input.snapshot.actors.find((candidate) => candidate.id === input.prompt.actorId);
  if (!latestPrompt || !latestActor) throw new Error("This legendary-action opportunity is no longer available. Refresh combat and try again.");
  try {
    const result = await apiPost<Dnd5eSrdLegendaryActionSpendResult>(
      `/api/v1/combats/${latestCombat.id}/legendary-actions/${latestActor.id}/spend`,
      { promptId: latestPrompt.id, optionName: input.optionName, cost: input.cost, expectedActorUpdatedAt: latestActor.updatedAt, expectedCombatUpdatedAt: latestCombat.updatedAt },
      { idempotencyKey: `legendary-action:${latestPrompt.id}:${window.crypto.randomUUID()}` }
    );
    if (!input.isCurrent()) return;
    input.onApplied(result, `${result.use.optionName} recorded for ${latestPrompt.actorName}; ${formatNumber(result.use.remainingUses)}/${formatNumber(result.use.maximumUses)} legendary actions remain`);
  } catch (error) {
    if (input.isCurrent()) input.onError(error);
    throw error;
  }
}
