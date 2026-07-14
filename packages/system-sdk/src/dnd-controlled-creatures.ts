import type {
  Actor,
  Combat,
  DndControlledCreatureCreateRequest,
  DndControlledCreatureManualReview,
  DndControlledCreatureRecord,
  DndControlledCreatureRevisionSet,
  Item,
  Scene,
  Token,
} from "@open-tabletop/core";

export const DND_CONTROLLED_CREATURE_DATA_KEY = "dnd5eControlledCreature";

export interface DndControlledCreatureContext {
  campaignId: string;
  actors: Actor[];
  items: Item[];
  tokens: Token[];
  combats: Combat[];
  scenes: Scene[];
  now?: string;
}

export interface DndControlledCreatureAnalysis {
  errors: string[];
  manualReview: DndControlledCreatureManualReview[];
  warnings: string[];
  requiredRevisions: DndControlledCreatureRevisionSet;
  affected: {
    actorIds: string[];
    itemIds: string[];
    tokenIds: string[];
    combatIds: string[];
    sceneIds: string[];
  };
}

/**
 * A deterministic, mutation-free description of an active controlled creature
 * whose reviewed duration has elapsed.  The API can use this at any combat or
 * wall-clock progression boundary and then execute its normal, revision-checked
 * lifecycle command; the SDK never deletes campaign records directly.
 */
export interface DndControlledCreatureExpiryCandidate {
  actor: Actor;
  record: DndControlledCreatureRecord;
  reason: "expired";
  trigger: "round" | "time";
  affected: {
    actorIds: string[];
    tokenIds: string[];
    combatIds: string[];
  };
}

export function analyzeDndControlledCreatureRequest(
  request: DndControlledCreatureCreateRequest,
  context: DndControlledCreatureContext,
): DndControlledCreatureAnalysis {
  const errors: string[] = [];
  const manualReview: DndControlledCreatureManualReview[] = [];
  const warnings: string[] = [];
  const actorIds = new Set<string>();
  const itemIds = new Set<string>();
  const tokenIds = new Set<string>();
  const combatIds = new Set<string>();
  const sceneIds = new Set<string>();
  const now = Date.parse(context.now ?? new Date().toISOString());

  if (!["summon", "transformation", "persistent_companion"].includes(request.kind)) {
    errors.push("Controlled creature kind must be summon, transformation, or persistent_companion.");
  }
  if (!request.actor || typeof request.actor.name !== "string" || !request.actor.name.trim()) errors.push("Actor name is required.");
  if (!request.actor || typeof request.actor.type !== "string" || !request.actor.type.trim()) errors.push("Actor type is required.");
  if (!isRecord(request.actor?.data)) errors.push("Actor data must be an object.");

  const sourceActor = context.actors.find((actor) => actor.id === request.source?.actorId && actor.campaignId === context.campaignId);
  if (!sourceActor || sourceActor.systemId !== "dnd-5e-srd") errors.push("Source actor must be a D&D actor in this campaign.");
  else actorIds.add(sourceActor.id);

  const controllerActor = context.actors.find((actor) => actor.id === request.controllerActorId && actor.campaignId === context.campaignId);
  if (!controllerActor || controllerActor.systemId !== "dnd-5e-srd") errors.push("Controller actor must be a D&D actor in this campaign.");
  else actorIds.add(controllerActor.id);
  if (request.source?.actorId && request.controllerActorId && request.source.actorId !== request.controllerActorId) {
    warnings.push("The spell or feature source differs from the controller actor; the DM should verify the control relationship.");
  }

  const sourceItem = context.items.find((item) => item.id === request.source?.itemId && item.campaignId === context.campaignId);
  if (!sourceItem || sourceItem.systemId !== "dnd-5e-srd" || sourceItem.actorId !== request.source?.actorId) {
    errors.push("Source item must belong to the source actor in this D&D campaign.");
  } else {
    itemIds.add(sourceItem.id);
    const itemType = sourceItem.type.toLowerCase();
    const expectedType = request.source.kind === "spell" ? "spell" : "feature";
    if (!itemType.includes(expectedType) && !(request.source.kind === "feature" && itemType.includes("feat"))) {
      errors.push(`Source item is not typed as a ${expectedType}.`);
    }
  }
  if (request.source?.systemId !== "dnd-5e-srd") errors.push("Controlled creature sources must use dnd-5e-srd.");
  if (!request.source?.rulesVersion?.trim()) errors.push("Source rulesVersion is required.");
  if (!request.source?.name?.trim()) errors.push("Source name is required.");

  const scene = request.sceneId ? context.scenes.find((candidate) => candidate.id === request.sceneId && candidate.campaignId === context.campaignId) : undefined;
  if (request.kind !== "transformation") {
    if (!scene) errors.push("Summons and persistent companions require a scene in this campaign.");
    else sceneIds.add(scene.id);
    if (!request.token) {
      errors.push("Summons and persistent companions require explicit token placement.");
    } else {
      if (![request.token.x, request.token.y, request.token.width, request.token.height].every(Number.isFinite)) errors.push("Token position and size must be finite numbers.");
      if (request.token.width <= 0 || request.token.height <= 0) errors.push("Token width and height must be positive.");
      if (!["friendly", "neutral", "hostile"].includes(request.token.disposition)) errors.push("Token disposition is invalid.");
    }
  } else if (scene) {
    sceneIds.add(scene.id);
  }

  const combat = request.combatId ? context.combats.find((candidate) => candidate.id === request.combatId && candidate.campaignId === context.campaignId) : undefined;
  if (request.combatId && !combat) errors.push("Combat must belong to this campaign.");
  if (combat) combatIds.add(combat.id);

  let targetActor: Actor | undefined;
  const targetItems: Item[] = [];
  if (request.kind === "transformation") {
    targetActor = context.actors.find((actor) => actor.id === request.targetActorId && actor.campaignId === context.campaignId);
    if (!targetActor || targetActor.systemId !== "dnd-5e-srd") errors.push("Transformation target must be a D&D actor in this campaign.");
    else {
      actorIds.add(targetActor.id);
      if (readDndControlledCreature(targetActor)?.status === "active") errors.push("Transformation target already has an active controlled-creature lifecycle.");
      for (const token of context.tokens.filter((candidate) => candidate.actorId === targetActor?.id)) tokenIds.add(token.id);
      targetItems.push(...context.items.filter((item) => item.actorId === targetActor?.id));
    }
    if (!request.transformation?.hpCarryover) {
      manualReview.push(review("transformation-hit-points", "hit_points", "Choose whether the transformed form preserves or replaces current hit points.", "Select Preserve or Replace before confirming."));
      errors.push("Transformation hpCarryover must be selected.");
    }
    if (!request.transformation?.equipmentCarryover) {
      manualReview.push(review("transformation-equipment", "equipment", "Equipment behavior during this transformation is ambiguous.", "Select Preserve or Suppress before confirming."));
      errors.push("Transformation equipmentCarryover must be selected.");
    }
    if (request.transformation?.equipmentCarryover === "suppress") {
      for (const item of targetItems) itemIds.add(item.id);
    }
  } else if (request.targetActorId) {
    errors.push("targetActorId is only valid for transformations.");
  }

  if (request.kind === "persistent_companion" && request.duration?.mode !== "persistent") {
    errors.push("Persistent companions must use persistent duration.");
  }
  if (request.kind !== "persistent_companion" && request.duration?.mode === "persistent") {
    errors.push("Only persistent companions may use persistent duration.");
  }
  if (request.duration?.mode === "rounds") {
    const duration = request.duration;
    const durationCombat = context.combats.find((candidate) => candidate.id === duration.combatId && candidate.campaignId === context.campaignId);
    if (!durationCombat) errors.push("Round-based duration requires a campaign combat.");
    else {
      combatIds.add(durationCombat.id);
      if (!Number.isInteger(duration.expiresAtRound) || duration.expiresAtRound <= durationCombat.round) {
        errors.push("expiresAtRound must be an integer after the combat's current round.");
      }
    }
  }
  if (request.duration?.mode === "until_time") {
    const expiresAt = Date.parse(request.duration.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) errors.push("expiresAt must be a future date-time.");
  }

  if (request.concentration) {
    if (request.kind === "persistent_companion") errors.push("Persistent companions cannot be concentration-bound.");
    if (request.concentration.sourceActorId !== request.source.actorId) errors.push("Concentration source must match the spell or feature source actor.");
    if (!request.concentration.groupId.trim()) errors.push("Concentration groupId is required.");
    const concentration = recordValue(recordValue(sourceActor?.data.rulesEngine).concentration);
    const activeGroup = stringValue(concentration.rollId);
    if (!activeGroup || activeGroup !== request.concentration.groupId) {
      manualReview.push(review(
        "concentration-link",
        "concentration",
        "The source actor does not currently expose a matching concentration group.",
        "Verify the source and group with the DM, then explicitly confirm manual review.",
      ));
    }
  }

  if (request.initiative?.mode === "shared") {
    const initiative = request.initiative;
    if (initiative.sourceActorId !== request.controllerActorId) errors.push("Shared initiative must reference the controller actor.");
    if (combat && !combat.combatants.some((combatant) => combatant.actorId === initiative.sourceActorId)) {
      manualReview.push(review("shared-initiative", "initiative", "The shared-initiative actor is not in the selected combat.", "Add the controller to combat or choose independent initiative."));
      errors.push("Shared initiative source is not in the selected combat.");
    }
  } else if (request.initiative?.mode === "independent" && combat && !Number.isFinite(request.initiative.value)) {
    manualReview.push(review("independent-initiative", "initiative", "Independent initiative has no reviewed value.", "Enter an initiative value before confirming."));
    errors.push("Independent initiative value is required when adding the creature to combat.");
  }

  if (request.command?.required && request.command.action === "none") errors.push("A required command must declare its action cost.");
  if (!request.command?.required && request.command?.action !== "none") warnings.push("A command action is recorded even though commands are not required.");

  const data = isRecord(request.actor?.data) ? request.actor.data : {};
  if (!hasStatBlockProvenance(data)) {
    manualReview.push(review("stat-block-provenance", "stat_block", "The supplied stat block has no verifiable D&D rules or compendium provenance.", "Review the full stat block and confirm it is licensed or user-authored."));
  }
  if (!hasHitPoints(data)) {
    manualReview.push(review("hit-point-shape", "hit_points", "The supplied form has no unambiguous current and maximum hit points.", "Review hit points manually; the engine will not invent them."));
  }
  if (request.kind === "transformation" && targetItems.length > 0 && request.transformation?.equipmentCarryover === "preserve") {
    warnings.push(`${targetItems.length} attached item${targetItems.length === 1 ? "" : "s"} will remain active during the transformation.`);
  }

  const requiredRevisions = revisionSet(context, { actorIds, itemIds, tokenIds, combatIds, sceneIds });
  return {
    errors: unique(errors),
    manualReview: uniqueById(manualReview),
    warnings: unique(warnings),
    requiredRevisions,
    affected: {
      actorIds: sorted(actorIds),
      itemIds: sorted(itemIds),
      tokenIds: sorted(tokenIds),
      combatIds: sorted(combatIds),
      sceneIds: sorted(sceneIds),
    },
  };
}

export function readDndControlledCreature(actor: Actor): DndControlledCreatureRecord | undefined {
  const value = actor.data[DND_CONTROLLED_CREATURE_DATA_KEY];
  if (!isRecord(value) || value.version !== 1 || typeof value.id !== "string" || typeof value.linkedActorId !== "string") return undefined;
  return value as unknown as DndControlledCreatureRecord;
}

export function dataWithDndControlledCreature(data: Record<string, unknown>, record: DndControlledCreatureRecord): Record<string, unknown> {
  return { ...structuredClone(data), [DND_CONTROLLED_CREATURE_DATA_KEY]: structuredClone(record) };
}

export function dataWithoutDndControlledCreature(data: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(data);
  delete next[DND_CONTROLLED_CREATURE_DATA_KEY];
  return next;
}

export function dndControlledCreatureIsExpired(record: DndControlledCreatureRecord, combats: Combat[], now = new Date().toISOString()): boolean {
  if (record.status !== "active") return false;
  if (record.duration.mode === "until_time") {
    const expiresAt = Date.parse(record.duration.expiresAt);
    const currentTime = Date.parse(now);
    return Number.isFinite(expiresAt) && Number.isFinite(currentTime) && expiresAt <= currentTime;
  }
  if (record.duration.mode === "rounds") {
    const duration = record.duration;
    const combat = combats.find((candidate) => candidate.id === duration.combatId);
    return Boolean(combat && combat.round >= duration.expiresAtRound);
  }
  return false;
}

/**
 * Finds every controlled-creature lifecycle that must be ended now. Results
 * are stable and de-duplicated by lifecycle id so callers can safely prepare a
 * batch of ordinary permission/revision-checked `expired` commands.
 */
export function findExpiredDndControlledCreatures(
  actors: Actor[],
  combats: Combat[],
  now = new Date().toISOString(),
): DndControlledCreatureExpiryCandidate[] {
  const byRecordId = new Map<string, DndControlledCreatureExpiryCandidate>();
  for (const actor of actors) {
    const record = readDndControlledCreature(actor);
    if (!record || !dndControlledCreatureIsExpired(record, combats, now)) continue;
    const combatIds = new Set<string>();
    if (record.duration.mode === "rounds") combatIds.add(record.duration.combatId);
    for (const combat of combats) {
      if (combat.campaignId !== actor.campaignId) continue;
      if (combat.combatants.some((combatant) => combatant.actorId === actor.id || record.linkedTokenIds.includes(combatant.tokenId))) {
        combatIds.add(combat.id);
      }
    }
    byRecordId.set(record.id, {
      actor,
      record,
      reason: "expired",
      trigger: record.duration.mode === "rounds" ? "round" : "time",
      affected: {
        actorIds: [actor.id],
        tokenIds: [...new Set(record.linkedTokenIds)].sort((left, right) => left.localeCompare(right)),
        combatIds: [...combatIds].sort((left, right) => left.localeCompare(right)),
      },
    });
  }
  return [...byRecordId.values()].sort((left, right) =>
    left.record.createdAt.localeCompare(right.record.createdAt)
    || left.record.id.localeCompare(right.record.id));
}

function revisionSet(
  context: DndControlledCreatureContext,
  ids: { actorIds: Set<string>; itemIds: Set<string>; tokenIds: Set<string>; combatIds: Set<string>; sceneIds: Set<string> },
): DndControlledCreatureRevisionSet {
  return {
    actors: revisions(context.actors, ids.actorIds),
    items: revisions(context.items, ids.itemIds),
    tokens: revisions(context.tokens, ids.tokenIds),
    combats: revisions(context.combats, ids.combatIds),
    scenes: revisions(context.scenes, ids.sceneIds),
    encounters: {},
  };
}

function revisions<T extends { id: string; updatedAt: string }>(records: T[], ids: Set<string>): Record<string, string> {
  return Object.fromEntries(records.filter((record) => ids.has(record.id)).sort((left, right) => left.id.localeCompare(right.id)).map((record) => [record.id, record.updatedAt]));
}

function hasHitPoints(data: Record<string, unknown>): boolean {
  const hp = recordValue(data.hp);
  return Number.isFinite(hp.current) && Number.isFinite(hp.max);
}

function hasStatBlockProvenance(data: Record<string, unknown>): boolean {
  return typeof data.rulesVersion === "string" || isRecord(data.compendiumProvenance) || typeof data.source === "string";
}

function review(id: string, category: DndControlledCreatureManualReview["category"], message: string, resolution: string): DndControlledCreatureManualReview {
  return { id, category, message, resolution };
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sorted(values: Set<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueById(values: DndControlledCreatureManualReview[]): DndControlledCreatureManualReview[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
