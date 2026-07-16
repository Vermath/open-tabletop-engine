import type { Actor, CombatAction, DndControlledCreatureActionHandoff, DndRulesMutationUndoDescriptor, RulesSupportBoundary } from "@open-tabletop/core";
import type { ConsequenceReviewItem, ConsequenceReviewRequest, ConsequenceReviewSection } from "./consequence-review.js";
import { rulesBoundaryFromAction } from "./rules-support-boundary.js";
import { formatNumber } from "./sheet-format.js";

export interface ActorActionResolutionPreview {
  commitMode: "commit" | "preview";
  action?: {
    label: string;
    kind: "action" | "bonusAction" | "reaction" | "free";
    ledger?: { actionsUsed: number; actionSurgeGrants: number };
  };
  blocked?: { reason: string; code: string; supportStatus?: "automated" | "manual" | "unsupported" };
  rolls?: Array<{ rollId: string; label: string; formula: string; d20Mode?: string; targetActorId?: string; advantageSources?: string[]; disadvantageSources?: string[] }>;
  resourceConsumption?: Array<{ label: string; amount: number; remaining: number }>;
  effects?: Array<{ type: "damage" | "healing" | "condition" | "utility"; targetActorId: string; targetActorName?: string; pool?: string; amount?: number; before?: number | string[]; after?: number | string[]; max?: number; damageType?: string; damageTypes?: string[]; effectChoice?: string; duration?: string; conditionId?: string; conditionName?: string }>;
  actorUpdates?: Array<{ actorId: string; reason: string }>;
  conditions?: Array<{ actorId: string; operation: string; conditionName?: string; reason: string }>;
  pendingSaves?: Array<{ actorId: string; ability: string; dc?: number; reason: string; requiredForCommit?: boolean }>;
  pendingReactions?: Array<{ actorId: string; reason: string }>;
  warnings?: string[];
  pendingChoice?: { kind?: "effect" | "damageType" | "resistance" | "manual"; reason: string; options: string[] };
  manualResolutionRequired?: { reason: string; supportStatus?: "manual" | "unsupported" };
  attunement?: { limit: number; attunedItemIds: string[]; overLimitBy: number };
  deathSave?: { outcome: "success" | "failure" | "critical-success" | "critical-failure"; successes: number; failures: number; result?: "revived" | "stable" | "dead"; hitPointsRestored?: number };
  weaponMastery?: {
    property: string;
    capability: "automatic" | "choice" | "manual";
    status: "awaiting-roll" | "applied" | "not-triggered" | "choice-required" | "manual-step";
    message: string;
    source: string;
    sourcePage: number;
    sourceUrl: string;
    targetActorId?: string;
    secondaryTargetActorId?: string;
    geometry?: { inferred: false; confirmedByUser: boolean; instruction: string; distanceFeet?: number };
  };
}

export interface PreparedActorActionResponse {
  status: "ready";
  actor: Actor;
  controlledCreatureHandoff?: DndControlledCreatureActionHandoff;
  rolls?: Array<{ label?: string; formula: string; total: number; targetActorId?: string }>;
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

export function actorActionPreviewRequiresInput(
  resolution: ActorActionResolutionPreview | undefined,
  options: { applyEffect: boolean; missingRequiredSaveOutcomes: boolean; effectChoice?: string }
): boolean {
  return Boolean(
    options.missingRequiredSaveOutcomes
    || (resolution?.pendingChoice && !options.effectChoice)
    || resolution?.weaponMastery?.status === "choice-required"
    || (options.applyEffect && resolution?.manualResolutionRequired?.supportStatus === "unsupported")
  );
}

export interface PreparedTypedDamageResponse {
  status: "ready" | "blocked";
  blockers: Array<{ message: string }>;
  batch: { targets: Array<{ actorId: string; actorName: string; preview: { blockers?: Array<{ code?: string; message: string }>; changes?: Array<{ path: string; operation: "add" | "remove" | "replace"; before?: unknown; after?: unknown }>; details?: Record<string, unknown> } }> };
  preparation?: {
    preparedPreviewKey: string;
    actorUpdatedAt: Record<string, string>;
    itemUpdatedAt: Record<string, string>;
    combatId?: string;
    combatUpdatedAt?: string;
    damageRoll?: { formula: string; total: number };
  };
}

export function actorActionConsequenceReview(
  actorName: string,
  prepared: Pick<PreparedActorActionResponse, "rolls" | "resolution">,
  options: { actorNames?: ReadonlyMap<string, string>; boundary?: RulesSupportBoundary; applyEffect?: boolean; supportsEffect?: boolean } = {}
): ConsequenceReviewRequest {
  const resolution = prepared.resolution;
  const actorNameFor = (actorId: string) => options.actorNames?.get(actorId) ?? resolution.effects?.find((effect) => effect.targetActorId === actorId)?.targetActorName ?? actorId;
  const actionItems: ConsequenceReviewItem[] = resolution.action ? [
    { label: "Action", value: resolution.action.label },
    { label: "Economy", value: resolution.action.kind },
    ...(resolution.action.ledger ? [{ label: "Turn ledger", value: `${resolution.action.ledger.actionsUsed} used; ${resolution.action.ledger.actionSurgeGrants} Action Surge grant${resolution.action.ledger.actionSurgeGrants === 1 ? "" : "s"}` }] : [])
  ] : [];
  const rollItems = (prepared.rolls ?? []).map((roll, index) => ({
    label: roll.label ?? resolution.rolls?.[index]?.label ?? `Roll ${index + 1}`,
    value: `${roll.formula} = ${formatNumber(roll.total)}`,
    detail: roll.targetActorId ? `Target: ${actorNameFor(roll.targetActorId)}` : undefined
  }));
  const targetIds = unique([
    ...(resolution.rolls ?? []).flatMap((roll) => roll.targetActorId ? [roll.targetActorId] : []),
    ...(resolution.effects ?? []).map((effect) => effect.targetActorId),
    ...(resolution.conditions ?? []).map((condition) => condition.actorId),
    ...(resolution.pendingSaves ?? []).map((save) => save.actorId),
    ...(resolution.pendingReactions ?? []).map((reaction) => reaction.actorId),
    ...(resolution.weaponMastery?.targetActorId ? [resolution.weaponMastery.targetActorId] : []),
    ...(resolution.weaponMastery?.secondaryTargetActorId ? [resolution.weaponMastery.secondaryTargetActorId] : [])
  ]);
  const targetItems = targetIds.map((actorId) => ({ label: "Target", value: actorNameFor(actorId) }));
  const effectItems = (resolution.effects ?? []).map((effect) => ({
    label: `${effect.type} - ${actorNameFor(effect.targetActorId)}`,
    value: effect.amount !== undefined ? `${formatNumber(effect.amount)}${effect.damageType ? ` ${effect.damageType}` : ""}` : effect.conditionName ?? effect.effectChoice ?? "Structured effect",
    detail: effect.before !== undefined || effect.after !== undefined ? `${displayValue(effect.before)} to ${displayValue(effect.after)}${effect.duration ? `; ${effect.duration}` : ""}` : effect.duration
  }));
  const conditionItems = (resolution.conditions ?? []).map((condition) => ({
    label: actorNameFor(condition.actorId),
    value: `${condition.operation}: ${condition.conditionName ?? "condition"}`,
    detail: condition.reason
  }));
  const saveChoiceItems: ConsequenceReviewItem[] = [
    ...(resolution.pendingSaves ?? []).map((save) => ({ label: `${actorNameFor(save.actorId)} save`, value: `${save.ability}${save.dc !== undefined ? ` DC ${formatNumber(save.dc)}` : ""}`, detail: save.reason })),
    ...(resolution.pendingChoice ? [{ label: "Choice", value: resolution.pendingChoice.reason, detail: resolution.pendingChoice.options.join(", ") }] : []),
    ...(resolution.pendingReactions ?? []).map((reaction) => ({ label: `${actorNameFor(reaction.actorId)} reaction`, value: reaction.reason }))
  ];
  const resourceItems = (resolution.resourceConsumption ?? []).map((resource) => ({ label: resource.label, value: `Spend ${formatNumber(resource.amount)}; ${formatNumber(resource.remaining)} remaining` }));
  const weaponMasteryItems: ConsequenceReviewItem[] = resolution.weaponMastery ? [{
    label: `${titleCase(resolution.weaponMastery.property)} - ${titleCase(resolution.weaponMastery.status)}`,
    value: resolution.weaponMastery.message,
    detail: `${titleCase(resolution.weaponMastery.capability)} capability; ${resolution.weaponMastery.source}, page ${formatNumber(resolution.weaponMastery.sourcePage)}${resolution.weaponMastery.geometry ? `; geometry inferred: no; reviewed: ${resolution.weaponMastery.geometry.confirmedByUser ? "yes" : "no"}` : ""}`
  }] : [];
  const reviewItems: ConsequenceReviewItem[] = [
    ...(resolution.blocked ? [{ label: "Blocked", value: resolution.blocked.reason }] : []),
    ...(resolution.manualResolutionRequired ? [{ label: resolution.manualResolutionRequired.supportStatus === "unsupported" ? "Unsupported" : "DM decision", value: resolution.manualResolutionRequired.reason }] : []),
    ...(resolution.warnings ?? []).map((warning) => ({ label: "Warning", value: warning })),
    ...(resolution.attunement && resolution.attunement.overLimitBy > 0 ? [{ label: "Attunement", value: `${formatNumber(resolution.attunement.overLimitBy)} over the limit` }] : [])
  ];
  const stateItems: ConsequenceReviewItem[] = [
    ...(resolution.actorUpdates ?? []).map((update) => ({ label: actorNameFor(update.actorId), value: update.reason })),
    ...(resolution.deathSave ? [{ label: "Death save", value: `${resolution.deathSave.outcome}; ${resolution.deathSave.successes} successes, ${resolution.deathSave.failures} failures${resolution.deathSave.result ? `; ${resolution.deathSave.result}` : ""}` }] : [])
  ];
  const sections = [
    section("action", "Action and economy", actionItems),
    section("rolls", "Rolls", rollItems),
    section("targets", "Targets", targetItems),
    section("weapon-mastery", "Weapon Mastery", weaponMasteryItems),
    section("effects", "Damage, healing and effects", effectItems),
    section("saves", "Saves, choices and reactions", saveChoiceItems),
    section("conditions", "Conditions and durations", conditionItems),
    section("resources", "Resources", resourceItems),
    section("state", "Other state changes", stateItems),
    section("review", "Manual boundaries and warnings", reviewItems)
  ].filter((value): value is ConsequenceReviewSection => Boolean(value));
  const blockingIssues = unique([
    ...(resolution.blocked ? [resolution.blocked.reason] : []),
    ...(resolution.manualResolutionRequired?.supportStatus === "unsupported" ? [resolution.manualResolutionRequired.reason] : []),
    ...(resolution.pendingChoice ? [resolution.pendingChoice.reason] : []),
    ...(resolution.pendingSaves ?? []).filter((save) => save.requiredForCommit).map((save) => save.reason),
    ...(resolution.weaponMastery?.status === "choice-required" ? [resolution.weaponMastery.message] : [])
  ]);
  return {
    title: `Review ${actorName}'s action`,
    summary: "The server prepared these exact consequences. Commit applies this prepared revision once; cancel preserves current state.",
    source: "D&D 5e SRD server resolver",
    sections,
    boundary: options.boundary ?? rulesBoundaryFromAction(resolution, options.supportsEffect ?? true, options.applyEffect ?? false),
    ...(blockingIssues.length > 0 ? { blockingIssues } : {}),
    confirmLabel: "Commit exact action"
  };
}

export function typedDamageConsequenceReview(input: {
  label: string;
  damageType: string;
  amount: number;
  prepared: PreparedTypedDamageResponse;
  targetAmounts?: ReadonlyMap<string, number>;
}): ConsequenceReviewRequest {
  const damageItems: ConsequenceReviewItem[] = [
    { label: "Damage", value: `${formatNumber(input.amount)} ${input.damageType}` },
    ...(input.prepared.preparation?.damageRoll ? [{ label: "Server roll", value: `${input.prepared.preparation.damageRoll.formula} = ${formatNumber(input.prepared.preparation.damageRoll.total)}` }] : [])
  ];
  const targetItems = input.prepared.batch.targets.flatMap((target) => {
    const changes = target.preview.changes ?? [];
    const heading: ConsequenceReviewItem = { label: target.actorName, value: input.targetAmounts?.has(target.actorId) ? `${formatNumber(input.targetAmounts.get(target.actorId)!)} ${input.damageType}` : `${formatNumber(input.amount)} ${input.damageType}` };
    return [heading, ...changes.map((change) => ({ label: `${target.actorName} ${change.path}`, value: `${displayValue(change.before)} to ${displayValue(change.after)}`, detail: change.operation }))];
  });
  const blockingIssues = input.prepared.batch.targets.flatMap((target) => (target.preview.blockers ?? []).map((blocker) => `${target.actorName}: ${blocker.message}`));
  return {
    title: input.label,
    summary: "Every visible target was validated together. Commit applies all prepared hit point and rules changes atomically; cancel applies none.",
    source: "D&D 5e SRD typed-damage resolver",
    boundary: { status: "automated", label: "Automated", explanation: "The server calculated each target's typed damage and defenses.", sources: ["D&D 5e SRD typed-damage resolver"] },
    sections: [section("damage", "Damage", damageItems), section("targets", "Targets and exact changes", targetItems)].filter((value): value is ConsequenceReviewSection => Boolean(value)),
    ...(blockingIssues.length > 0 ? { blockingIssues } : {}),
    confirmLabel: "Apply every target atomically"
  };
}

function section(id: string, label: string, items: ConsequenceReviewItem[]): ConsequenceReviewSection | undefined {
  return items.length > 0 ? { id, label, items } : undefined;
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "not set";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ") || "none";
  if (typeof value === "object") return "structured server state";
  return String(value);
}

function unique(values: string[]): string[] {
  return values.filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

function titleCase(value: string): string {
  return value.split(/[-_\s]+/).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}
