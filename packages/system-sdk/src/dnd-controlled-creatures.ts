import type {
  Actor,
  Combat,
  DndControlledCreatureActionHandoff,
  DndControlledCreatureCreateRequest,
  DndControlledCreatureCreatePrefill,
  DndControlledCreatureHandoffManualChoice,
  DndControlledCreatureOriginatingAction,
  DndControlledCreatureManualReview,
  DndControlledCreatureRecord,
  DndControlledCreatureRevisionSet,
  Item,
  Scene,
  Token,
} from "@open-tabletop/core";
import { DND_5E_SRD_VERSION } from "./dnd-static-content.js";

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

export interface DndControlledCreatureActionHandoffInput {
  actor: Actor;
  items: Item[];
  roll: { id: string; label: string; metadata?: Record<string, unknown> };
  now?: string;
  combat?: Combat;
  sceneId?: string;
  token?: DndControlledCreatureCreatePrefill["token"];
  controllerUserId?: string;
  spellSlotLevel?: number;
}

/**
 * Maps only explicit structured action metadata into a lifecycle handoff. It
 * deliberately does not parse spell names, summaries, or duration prose.
 */
export function dndControlledCreatureActionHandoff(
  input: DndControlledCreatureActionHandoffInput,
): DndControlledCreatureActionHandoff | undefined {
  const item = actionItem(input.actor, input.items, input.roll.id);
  const itemData = recordValue(item?.data);
  const metadata = recordValue(input.roll.metadata);
  const descriptor = recordValue(Object.keys(recordValue(metadata.controlledCreature)).length > 0
    ? metadata.controlledCreature
    : itemData.controlledCreature);
  const legacySummonCandidate = itemData.summon !== undefined || metadata.summon !== undefined;
  if (Object.keys(descriptor).length === 0 && !legacySummonCandidate) return undefined;

  const manualChoices: DndControlledCreatureHandoffManualChoice[] = [];
  const descriptorKind = stringValue(descriptor.kind);
  const kind = descriptorKind === "transformation" || descriptorKind === "persistent_companion" || descriptorKind === "summon"
    ? descriptorKind
    : "summon";
  const supported = descriptorKind === kind;
  if (!supported) {
    manualChoices.push(
      choice("duration", "This action has summon metadata but no typed controlled-creature contract; review its duration manually."),
      choice("initiative", "Review how this creature enters initiative."),
      choice("command", "Review whether and how the creature is commanded."),
    );
  }

  const sourceKind = item?.type.toLowerCase().includes("spell") ? "spell" as const : "feature" as const;
  const rulesVersion = stringValue(descriptor.rulesVersion)
    ?? stringValue(itemData.rulesVersion)
    ?? stringValue(itemData.source)
    ?? stringValue(input.actor.data.rulesVersion)
    ?? DND_5E_SRD_VERSION;
  const source = {
    kind: sourceKind,
    actorId: input.actor.id,
    ...(item ? { itemId: item.id } : {}),
    name: item?.name ?? input.roll.label,
    systemId: "dnd-5e-srd" as const,
    rulesVersion,
  };
  const prefill: DndControlledCreatureCreatePrefill = {
    kind,
    source,
    controllerActorId: input.actor.id,
    ...(input.controllerUserId ? { controllerUserId: input.controllerUserId, ownerUserId: input.controllerUserId } : {}),
    ...(input.sceneId && kind !== "transformation" ? { sceneId: input.sceneId } : {}),
    ...(input.combat ? { combatId: input.combat.id } : {}),
    ...(input.token && kind !== "transformation" ? { token: structuredClone(input.token) } : {}),
  };
  const sourcedFields = ["kind", "source", "controllerActorId"];
  if (prefill.controllerUserId) sourcedFields.push("controllerUserId", "ownerUserId");
  if (prefill.sceneId) sourcedFields.push("sceneId");
  if (prefill.combatId) sourcedFields.push("combatId");

  const duration = controlledDuration(recordValue(descriptor.duration), input.now, input.combat);
  if (duration) {
    prefill.duration = duration;
    sourcedFields.push("duration");
  } else if (supported) {
    manualChoices.push(choice("duration", "The action does not provide an exact machine-readable duration."));
  }

  if (descriptor.concentration === true) {
    prefill.concentration = { sourceActorId: input.actor.id, groupId: input.roll.id };
    sourcedFields.push("concentration");
  } else if (descriptor.concentration === false) {
    sourcedFields.push("concentration");
  } else if (supported && kind !== "persistent_companion") {
    manualChoices.push(choice("concentration", "The action does not declare whether this lifecycle uses concentration."));
  }

  const initiative = controlledInitiative(recordValue(descriptor.initiative), input.actor.id, input.combat);
  if (initiative) {
    prefill.initiative = initiative;
    sourcedFields.push("initiative");
  } else if (supported) {
    manualChoices.push(choice("initiative", "The action does not provide a complete initiative relationship."));
  }

  const command = controlledCommand(recordValue(descriptor.command));
  if (command) {
    prefill.command = command;
    sourcedFields.push("command");
  } else if (supported) {
    manualChoices.push(choice("command", "The action does not provide an explicit command cost."));
  }

  const actorPrefill = controlledActorPrefill(descriptor, input, rulesVersion, item);
  if (Object.keys(actorPrefill).length > 0) prefill.actor = actorPrefill;
  if (actorPrefill.name) sourcedFields.push("actor.name");
  if (actorPrefill.type) sourcedFields.push("actor.type");
  if (actorPrefill.imageAssetId) sourcedFields.push("actor.imageAssetId");
  if (descriptor.statBlockComplete === true) {
    sourcedFields.push("actor.data");
  } else {
    if (actorPrefill.data?.hp !== undefined) sourcedFields.push("actor.data.hp");
    if (actorPrefill.data?.temporaryHitPoints !== undefined) sourcedFields.push("actor.data.temporaryHitPoints");
    if (actorPrefill.data?.rulesVersion !== undefined) sourcedFields.push("actor.data.rulesVersion");
    if (actorPrefill.data?.compendiumProvenance !== undefined) sourcedFields.push("actor.data.compendiumProvenance");
  }
  if (!actorPrefill.name) manualChoices.push(choice("actor.name", kind === "transformation" ? "Choose the reviewed form." : "Name the reviewed creature."));
  if (!actorPrefill.type) manualChoices.push(choice("actor.type", "Choose the reviewed creature type."));
  const hp = recordValue(actorPrefill.data?.hp);
  if (!Number.isFinite(hp.current) || !Number.isFinite(hp.max)) manualChoices.push(choice("actor.hitPoints", "Enter explicit current and maximum hit points."));
  if (descriptor.statBlockComplete !== true) manualChoices.push(choice("actor.statBlock", "Review the full stat block; the handoff never invents missing rules data."));

  if (kind === "transformation") {
    prefill.targetActorId = input.actor.id;
    sourcedFields.push("targetActorId");
    const transformation = recordValue(descriptor.transformation);
    const hpCarryover = stringValue(transformation.hpCarryover);
    const equipmentCarryover = stringValue(transformation.equipmentCarryover);
    prefill.transformation = {
      ...(hpCarryover === "preserve" || hpCarryover === "replace" ? { hpCarryover } : {}),
      ...(equipmentCarryover === "preserve" || equipmentCarryover === "suppress" ? { equipmentCarryover } : {}),
    };
    if (prefill.transformation.hpCarryover) sourcedFields.push("transformation.hpCarryover");
    if (prefill.transformation.equipmentCarryover) sourcedFields.push("transformation.equipmentCarryover");
    else manualChoices.push(choice("transformation.equipmentCarryover", "Choose how equipment behaves in the reviewed form."));
    manualChoices.push(choice("transformation.form", "Choose a legal form and review its statistics."));
  } else {
    if (!prefill.sceneId) manualChoices.push(choice("sceneId", "Choose the scene where the creature will appear."));
    if (completeToken(prefill.token)) sourcedFields.push("token");
    else manualChoices.push(choice("token", "Choose explicit token position, size, and disposition; placement is never guessed."));
  }

  return {
    version: 1,
    status: supported ? "supported" : "manual_required",
    action: { actorId: input.actor.id, rollId: input.roll.id, label: input.roll.label },
    prefill,
    sourcedFields: [...new Set(sourcedFields)],
    manualChoices: uniqueChoices(manualChoices),
  };
}

export function dndControlledCreatureHandoffWithPreparation(
  handoff: DndControlledCreatureActionHandoff,
  preparation: DndControlledCreatureOriginatingAction,
): DndControlledCreatureActionHandoff {
  if (preparation.actorId !== handoff.action.actorId || preparation.rollId !== handoff.action.rollId) {
    throw new Error("Controlled-creature action preparation does not match its handoff.");
  }
  return {
    ...structuredClone(handoff),
    action: { ...handoff.action, preparedPreviewKey: preparation.preparedPreviewKey, resolutionHash: preparation.resolutionHash },
    prefill: {
      ...structuredClone(handoff.prefill),
      ...(handoff.prefill.concentration ? { concentration: { ...handoff.prefill.concentration, groupId: preparation.preparedPreviewKey } } : {}),
      originatingAction: structuredClone(preparation),
    },
    sourcedFields: [...new Set([...handoff.sourcedFields, "originatingAction"])],
  };
}

/** Returns every source-derived field a caller tried to alter after action review. */
export function dndControlledCreatureHandoffRequestErrors(
  handoff: DndControlledCreatureActionHandoff,
  request: DndControlledCreatureCreateRequest,
): string[] {
  const errors: string[] = [];
  for (const field of handoff.sourcedFields) {
    if (!sameJson(handoffField(handoff.prefill, field), handoffField(request, field))) {
      errors.push(`Source-derived controlled-creature field changed after action review: ${field}.`);
    }
  }
  return errors;
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

  const sourceItem = request.source?.itemId
    ? context.items.find((item) => item.id === request.source.itemId && item.campaignId === context.campaignId)
    : undefined;
  if (request.source?.itemId) {
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
  } else if (request.source?.kind !== "feature" || !request.originatingAction) {
    errors.push("A source item is required unless a reviewed feature action originated this lifecycle.");
  }
  if (request.originatingAction) {
    if (request.originatingAction.actorId !== request.source?.actorId) errors.push("Originating action actor must match the controlled-creature source actor.");
    if (!request.originatingAction.rollId.trim() || !request.originatingAction.preparedPreviewKey.trim() || !request.originatingAction.resolutionHash.trim()) {
      errors.push("Originating action review metadata is incomplete.");
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

function actionItem(actor: Actor, items: Item[], rollId: string): Item | undefined {
  return items.find((item) => {
    if (item.actorId !== actor.id || item.campaignId !== actor.campaignId || item.systemId !== actor.systemId) return false;
    const prefix = item.type.toLowerCase().includes("spell") ? "spell" : "item";
    return rollId.startsWith(`${prefix}-${item.id}-`);
  });
}

function controlledDuration(value: Record<string, unknown>, now: string | undefined, combat: Combat | undefined): DndControlledCreatureCreateRequest["duration"] | undefined {
  const mode = stringValue(value.mode);
  if (mode === "until_dismissed") return { mode };
  if (mode === "persistent") return { mode };
  if (mode === "until_time") {
    const expiresAt = stringValue(value.expiresAt);
    return expiresAt && Number.isFinite(Date.parse(expiresAt)) ? { mode, expiresAt: new Date(expiresAt).toISOString() } : undefined;
  }
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (mode === "rounds") {
    return combat && Number.isInteger(amount) ? { mode, combatId: combat.id, expiresAtRound: combat.round + amount } : undefined;
  }
  if (mode !== "minutes" && mode !== "hours") return undefined;
  const start = Date.parse(now ?? new Date().toISOString());
  if (!Number.isFinite(start)) return undefined;
  const milliseconds = amount * (mode === "hours" ? 60 * 60 * 1000 : 60 * 1000);
  return { mode: "until_time", expiresAt: new Date(start + milliseconds).toISOString() };
}

function controlledInitiative(value: Record<string, unknown>, actorId: string, combat: Combat | undefined): DndControlledCreatureCreateRequest["initiative"] | undefined {
  const mode = stringValue(value.mode);
  if (mode === "shared") return { mode, sourceActorId: actorId };
  if (mode !== "independent") return undefined;
  const initiative = Number(value.value);
  if (!combat) return { mode };
  return Number.isFinite(initiative) ? { mode, value: initiative } : undefined;
}

function controlledCommand(value: Record<string, unknown>): DndControlledCreatureCreateRequest["command"] | undefined {
  if (typeof value.required !== "boolean") return undefined;
  const action = stringValue(value.action);
  if (!action || !["action", "bonus_action", "reaction", "free", "none"].includes(action)) return undefined;
  if (value.required && action === "none") return undefined;
  const note = stringValue(value.note);
  return { required: value.required, action: action as DndControlledCreatureCreateRequest["command"]["action"], ...(note ? { note } : {}) };
}

function controlledActorPrefill(
  descriptor: Record<string, unknown>,
  input: DndControlledCreatureActionHandoffInput,
  rulesVersion: string,
  item: Item | undefined,
): NonNullable<DndControlledCreatureCreatePrefill["actor"]> {
  const configured = recordValue(descriptor.actor);
  const data = structuredClone(recordValue(configured.data));
  data.rulesVersion = rulesVersion;
  if (item) data.compendiumProvenance = { sourceItemId: item.id, rulesVersion };
  const hp = recordValue(configured.hp);
  const directCurrent = Number(hp.current);
  const directMaximum = Number(hp.max);
  if (Number.isFinite(directCurrent) && Number.isFinite(directMaximum)) {
    data.hp = { current: directCurrent, max: directMaximum };
  } else {
    const base = Number(hp.base);
    const perSlotAbove = Number(hp.perSlotAbove);
    const baseSlotLevel = Number(hp.baseSlotLevel);
    const slotLevel = input.spellSlotLevel;
    if (Number.isFinite(base) && slotLevel !== undefined) {
      const maximum = base + (Number.isFinite(perSlotAbove) && Number.isFinite(baseSlotLevel) ? Math.max(0, slotLevel - baseSlotLevel) * perSlotAbove : 0);
      data.hp = { current: maximum, max: maximum };
    }
  }
  const transformation = recordValue(descriptor.transformation);
  if (stringValue(descriptor.kind) === "transformation" && stringValue(transformation.hpCarryover) === "preserve") {
    const sourceHp = recordValue(input.actor.data.hp);
    if (Number.isFinite(sourceHp.current) && Number.isFinite(sourceHp.max)) data.hp = structuredClone(sourceHp);
  }
  const temporaryHitPoints = Number(descriptor.temporaryHitPoints);
  if (Number.isFinite(temporaryHitPoints) && temporaryHitPoints >= 0) data.temporaryHitPoints = temporaryHitPoints;
  return {
    ...(stringValue(configured.name) ? { name: stringValue(configured.name) } : {}),
    ...(stringValue(configured.type) ? { type: stringValue(configured.type) } : {}),
    ...(stringValue(configured.imageAssetId) ? { imageAssetId: stringValue(configured.imageAssetId) } : {}),
    data,
  };
}

function completeToken(token: DndControlledCreatureCreatePrefill["token"]): boolean {
  return Boolean(token
    && Number.isFinite(token.x)
    && Number.isFinite(token.y)
    && Number.isFinite(token.width)
    && Number.isFinite(token.height)
    && (token.disposition === "friendly" || token.disposition === "neutral" || token.disposition === "hostile"));
}

function choice(field: DndControlledCreatureHandoffManualChoice["field"], reason: string): DndControlledCreatureHandoffManualChoice {
  return { field, reason };
}

function uniqueChoices(choices: DndControlledCreatureHandoffManualChoice[]): DndControlledCreatureHandoffManualChoice[] {
  return [...new Map(choices.map((candidate) => [candidate.field, candidate])).values()];
}

function handoffField(value: DndControlledCreatureCreatePrefill | DndControlledCreatureCreateRequest, field: string): unknown {
  return field.split(".").reduce<unknown>((current, segment) => isRecord(current) ? current[segment] : undefined, value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
