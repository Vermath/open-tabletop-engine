import type { Actor, CombatAction, DndRulesMutationUndoDescriptor } from "@open-tabletop/core";
import { formatNumber } from "./sheet-format.js";

export interface ActorActionResolutionPreview {
  commitMode: "commit" | "preview";
  blocked?: { reason: string; code: string };
  rolls?: Array<{ rollId: string; label: string; formula: string; d20Mode?: string; targetActorId?: string; advantageSources?: string[]; disadvantageSources?: string[] }>;
  resourceConsumption?: Array<{ label: string; amount: number; remaining: number }>;
  conditions?: Array<{ actorId: string; operation: string; conditionName?: string; reason: string }>;
  pendingSaves?: Array<{ actorId: string; ability: string; dc?: number; reason: string; requiredForCommit?: boolean }>;
  pendingReactions?: Array<{ actorId: string; reason: string }>;
  warnings?: string[];
  pendingChoice?: { kind?: "effect" | "damageType" | "resistance" | "manual"; reason: string; options: string[] };
  manualResolutionRequired?: { reason: string };
  attunement?: { limit: number; attunedItemIds: string[]; overLimitBy: number };
}

export interface PreparedActorActionResponse {
  status: "ready";
  actor: Actor;
  rolls?: Array<{ formula: string; total: number; targetActorId?: string }>;
  resolution: ActorActionResolutionPreview & Record<string, unknown>;
  preparation: {
    preparedPreviewKey: string;
    sourceActorId: string;
    request: Record<string, unknown>;
    revisions: {
      actorUpdatedAt: Record<string, string>;
      itemUpdatedAt: Record<string, string>;
      combatUpdatedAt?: string;
    };
    resolutionHash: string;
  };
}

export interface CommittedActorActionResponse {
  actor?: Actor;
  updatedActors?: Actor[];
  usage?: { consumed?: Array<{ label: string; remaining: number }> };
  effect?: { type: string; targetActorId: string; amount?: number };
  resolution?: ActorActionResolutionPreview;
  combatAction?: CombatAction;
  rulesMutationId?: string;
  undo?: DndRulesMutationUndoDescriptor;
}

export interface PreparedTypedDamageResponse {
  status: "ready" | "blocked";
  blockers: Array<{ message: string }>;
  batch: { targets: Array<{ actorId: string; actorName: string; preview: Record<string, unknown> }> };
  preparation?: {
    preparedPreviewKey: string;
    actorUpdatedAt: Record<string, string>;
    itemUpdatedAt: Record<string, string>;
    combatId?: string;
    combatUpdatedAt?: string;
    damageRoll?: { formula: string; total: number };
  };
}

export function preparedActorActionReviewText(actorName: string, prepared: Pick<PreparedActorActionResponse, "rolls" | "resolution">): string {
  const rolls = (prepared.rolls ?? []).map((roll) => `${roll.formula} = ${formatNumber(roll.total)}${roll.targetActorId ? ` (${roll.targetActorId})` : ""}`);
  const exactResolution = JSON.stringify(prepared.resolution, null, 2);
  return [
    `Review ${actorName}'s exact server-prepared action`,
    rolls.length > 0 ? `Rolls:\n${rolls.join("\n")}` : "Rolls: none",
    `Consequences:\n${exactResolution}`,
    "Commit these exact results?"
  ].join("\n\n");
}
