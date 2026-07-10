import { nowIso } from "./ids.js";
import type {
  Combatant,
  EngineState,
  Proposal,
  ProposalChange,
  ProposalHistoryEntry,
  ProposalRevertGuard,
} from "./types.js";

type ProposalCollectionKey =
  | "campaigns"
  | "worlds"
  | "scenes"
  | "tokens"
  | "actors"
  | "items"
  | "journals"
  | "handouts"
  | "chat"
  | "rolls"
  | "diceMacros"
  | "encounters"
  | "campaignSessions"
  | "combats"
  | "assets"
  | "fogPresets"
  | "pluginStorage"
  | "aiMemory";

type CopyOnWriteCollectionKey = ProposalCollectionKey | "proposals";

const campaignProposalMutableFields = new Set([
  "name",
  "description",
  "defaultSystemId",
  "visibility",
]);

export function proposalHistoryEntry(
  input: Omit<ProposalHistoryEntry, "at"> & { at?: string },
): ProposalHistoryEntry {
  return {
    ...input,
    at: input.at ?? nowIso(),
  };
}

export function approveProposal(proposal: Proposal, userId: string): Proposal {
  if (proposal.status !== "pending") {
    throw new Error("Proposal must be pending before approval");
  }
  const at = nowIso();
  return {
    ...proposal,
    status: "approved",
    approvedByUserId: userId,
    updatedAt: at,
    history: [
      ...(proposal.history ?? []),
      proposalHistoryEntry({
        action: "approved",
        status: "approved",
        previousStatus: proposal.status,
        at,
        actorUserId: userId,
        actorType: "user",
        auditAction: "proposal.approved",
      }),
    ],
  };
}

export function rejectProposal(
  proposal: Proposal,
  userId?: string,
  actorType: ProposalHistoryEntry["actorType"] = "user",
): Proposal {
  if (proposal.status !== "pending" && proposal.status !== "approved") {
    throw new Error("Proposal must be pending or approved before rejection");
  }
  const at = nowIso();
  return {
    ...proposal,
    status: "rejected",
    updatedAt: at,
    history: [
      ...(proposal.history ?? []),
      proposalHistoryEntry({
        action: "rejected",
        status: "rejected",
        previousStatus: proposal.status,
        at,
        actorUserId: userId,
        actorType,
        auditAction:
          actorType === "server_admin"
            ? "admin.aiProposals.rejectStale"
            : "ai.proposal.rejected",
      }),
    ],
  };
}

export function applyProposal(
  state: EngineState,
  proposal: Proposal,
  userId?: string,
): EngineState {
  if (proposal.status !== "approved") {
    throw new Error("Proposal must be approved before applying");
  }

  const appliedAt = nowIso();
  const next: EngineState = { ...state };
  const copiedCollections = new Set<CopyOnWriteCollectionKey>();
  let inverseChanges: ProposalChange[] = [];
  for (const change of proposal.changesJson) {
    const inverse = applyProposalChange(
      next,
      change,
      proposal.campaignId,
      appliedAt,
      copiedCollections,
      true,
    );
    inverseChanges = [...inverse, ...inverseChanges];
  }
  const revertGuards = proposalRevertGuards(
    next,
    inverseChanges,
    proposal.campaignId,
  );

  const proposalIndex = next.proposals.findIndex(
    (item) => item.id === proposal.id,
  );
  if (proposalIndex >= 0) {
    const proposals = writableCollection(next, "proposals", copiedCollections);
    proposals[proposalIndex] = {
      ...proposal,
      status: "applied",
      appliedByUserId: userId,
      appliedAt,
      inverseChangesJson: inverseChanges,
      revertGuardsJson: revertGuards,
      updatedAt: appliedAt,
      history: [
        ...(proposal.history ?? []),
        proposalHistoryEntry({
          action: "applied",
          status: "applied",
          previousStatus: proposal.status,
          at: appliedAt,
          actorUserId: userId,
          actorType: "user",
          auditAction: "proposal.applied",
        }),
      ],
    };
  }
  return next;
}

export function revertProposal(
  state: EngineState,
  proposal: Proposal,
  userId?: string,
): EngineState {
  if (proposal.status !== "applied")
    throw new Error("Proposal must be applied before reverting");
  if (!proposal.inverseChangesJson)
    throw new Error("Proposal does not contain reversible change data");
  if (!proposal.revertGuardsJson)
    throw new Error("Proposal does not contain revert guard data");
  assertProposalRevertGuards(
    state,
    proposal.inverseChangesJson,
    proposal.revertGuardsJson,
    proposal.campaignId,
  );
  const revertedAt = nowIso();
  const next: EngineState = { ...state };
  const copiedCollections = new Set<CopyOnWriteCollectionKey>();
  for (const change of proposal.inverseChangesJson) {
    applyProposalChange(
      next,
      change,
      proposal.campaignId,
      revertedAt,
      copiedCollections,
      false,
    );
  }
  const proposalIndex = next.proposals.findIndex(
    (item) => item.id === proposal.id,
  );
  if (proposalIndex >= 0) {
    const proposals = writableCollection(next, "proposals", copiedCollections);
    proposals[proposalIndex] = {
      ...proposal,
      status: "reverted",
      revertedByUserId: userId,
      revertedAt,
      updatedAt: revertedAt,
      history: [
        ...(proposal.history ?? []),
        proposalHistoryEntry({
          action: "reverted",
          status: "reverted",
          previousStatus: proposal.status,
          at: revertedAt,
          actorUserId: userId,
          actorType: "user",
          auditAction: "proposal.reverted",
        }),
      ],
    };
  }
  return next;
}

function applyProposalChange(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copiedCollections: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  assertCampaignProposalChange(change);
  if (change.action === "delete") {
    if (change.entity === "scene")
      return deleteSceneWithDomainSemantics(
        state,
        change,
        campaignId,
        changedAt,
        copiedCollections,
        captureInverse,
      );
    if (change.entity === "world")
      return deleteWorldWithDomainSemantics(
        state,
        change,
        campaignId,
        changedAt,
        copiedCollections,
        captureInverse,
      );
    if (change.entity === "actor")
      return deleteActorWithDomainSemantics(
        state,
        change,
        campaignId,
        changedAt,
        copiedCollections,
        captureInverse,
      );
    if (change.entity === "token")
      return deleteTokenWithDomainSemantics(
        state,
        change,
        campaignId,
        changedAt,
        copiedCollections,
        captureInverse,
      );
    if (change.entity === "encounter")
      return deleteEncounterWithDomainSemantics(
        state,
        change,
        campaignId,
        changedAt,
        copiedCollections,
        captureInverse,
      );
    if (change.entity === "journal")
      return deleteJournalWithDomainSemantics(
        state,
        change,
        campaignId,
        changedAt,
        copiedCollections,
        captureInverse,
      );
  }

  const bucketKey = collectionKeyForEntity(change.entity);
  const bucket = readCollection(state, bucketKey);
  if (change.action === "create") {
    const created = structuredClone(change.data) as Record<string, unknown>;
    const createdId = entityId(created);
    if (bucket.some((item) => item.id === createdId))
      throw new Error(
        `Proposal create target already exists: ${change.entity}:${createdId}`,
      );
    assertEntityInProposalCampaign(state, bucketKey, created, campaignId);
    writableCollection(state, bucketKey, copiedCollections).push(
      created as never,
    );
    return captureInverse
      ? [{ entity: change.entity, action: "delete", id: createdId, data: {} }]
      : [];
  }
  if (change.action === "update") {
    const index = bucket.findIndex(
      (item: { id?: string }) => item.id === change.id,
    );
    if (index < 0)
      throw new Error(
        `Proposal target not found: ${change.entity}:${change.id ?? ""}`,
      );
    const replacementId = change.data.id;
    if (
      Object.prototype.hasOwnProperty.call(change.data, "id") &&
      replacementId !== change.id
    ) {
      throw new Error(
        `Proposal update cannot change entity id: ${change.entity}:${change.id ?? ""}`,
      );
    }
    const before = structuredClone(bucket[index]) as Record<string, unknown>;
    assertEntityInProposalCampaign(state, bucketKey, before, campaignId);
    const writableBucket = writableCollection(
      state,
      bucketKey,
      copiedCollections,
    );
    const updated = {
      ...(structuredClone(writableBucket[index]) as Record<string, unknown>),
      ...(structuredClone(change.data) as Record<string, unknown>),
      updatedAt: changedAt,
    };
    assertEntityInProposalCampaign(state, bucketKey, updated, campaignId);
    writableBucket[index] = updated;
    const inverseData =
      bucketKey === "campaigns"
        ? campaignProposalInverseData(before, change.data)
        : before;
    return captureInverse
      ? [
          {
            entity: change.entity,
            action: "update",
            id: change.id,
            data: inverseData,
          },
        ]
      : [];
  }
  const index = bucket.findIndex(
    (item: { id?: string }) => item.id === change.id,
  );
  if (index < 0)
    throw new Error(
      `Proposal target not found: ${change.entity}:${change.id ?? ""}`,
    );
  const deleted = structuredClone(bucket[index]) as Record<string, unknown>;
  assertEntityInProposalCampaign(state, bucketKey, deleted, campaignId);
  writableCollection(state, bucketKey, copiedCollections).splice(index, 1);
  return captureInverse
    ? [{ entity: change.entity, action: "create", data: deleted }]
    : [];
}

function assertCampaignProposalChange(change: ProposalChange): void {
  if (change.entity !== "campaign") return;
  if (change.action === "delete")
    throw new Error("Campaign deletion must use the campaign lifecycle API");
  if (change.action === "create")
    throw new Error("Campaign creation must use the campaign lifecycle API");
  const immutableField = Object.keys(change.data).find(
    (field) => !campaignProposalMutableFields.has(field),
  );
  if (immutableField)
    throw new Error(
      `Campaign field is not editable through proposals: ${immutableField}`,
    );
}

function campaignProposalInverseData(
  before: Record<string, unknown>,
  changeData: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(changeData)
      .filter((field) => campaignProposalMutableFields.has(field))
      .map((field) => [field, structuredClone(before[field])]),
  );
}

function proposalRevertGuards(
  state: EngineState,
  inverseChanges: ProposalChange[],
  campaignId: string,
): ProposalRevertGuard[] {
  const guards = new Map<string, ProposalRevertGuard>();
  for (const change of inverseChanges) {
    const id = proposalChangeId(change);
    const bucketKey = collectionKeyForEntity(change.entity);
    const current = readCollection(state, bucketKey).find(
      (item) => item.id === id,
    );
    if (current)
      assertEntityInProposalCampaign(
        state,
        bucketKey,
        current as Record<string, unknown>,
        campaignId,
      );
    guards.set(`${change.entity}:${id}`, {
      entity: change.entity,
      id,
      expected: current
        ? (structuredClone(current) as Record<string, unknown>)
        : null,
    });
  }
  return [...guards.values()];
}

function assertProposalRevertGuards(
  state: EngineState,
  inverseChanges: ProposalChange[],
  guards: ProposalRevertGuard[],
  campaignId: string,
): void {
  const requiredKeys = new Set(
    inverseChanges.map(
      (change) => `${change.entity}:${proposalChangeId(change)}`,
    ),
  );
  const guardKeys = new Set<string>();
  for (const guard of guards) {
    const key = `${guard.entity}:${guard.id}`;
    if (guardKeys.has(key))
      throw new Error(`Proposal revert guard is duplicated: ${key}`);
    guardKeys.add(key);
    const bucketKey = collectionKeyForEntity(guard.entity);
    const current = readCollection(state, bucketKey).find(
      (item) => item.id === guard.id,
    );
    if (current)
      assertEntityInProposalCampaign(
        state,
        bucketKey,
        current as Record<string, unknown>,
        campaignId,
      );
    if (guard.expected) {
      if (guard.expected.id !== guard.id)
        throw new Error(
          `Proposal revert guard id does not match its snapshot: ${key}`,
        );
      assertEntityInProposalCampaign(
        state,
        bucketKey,
        guard.expected,
        campaignId,
      );
    }
    const expected = guard.expected;
    if (
      (expected === null && current) ||
      (expected !== null &&
        (!current || !proposalValuesEqual(current, expected)))
    ) {
      throw new Error(
        `Proposal revert conflict: ${key} changed after the proposal was applied`,
      );
    }
  }
  for (const requiredKey of requiredKeys) {
    if (!guardKeys.has(requiredKey))
      throw new Error(`Proposal revert guard is missing: ${requiredKey}`);
  }
  assertProposalRevertDeleteDependencies(
    state,
    inverseChanges,
    requiredKeys,
    campaignId,
  );
}

function assertProposalRevertDeleteDependencies(
  state: EngineState,
  inverseChanges: ProposalChange[],
  affectedKeys: Set<string>,
  campaignId: string,
): void {
  for (const change of inverseChanges) {
    if (change.action !== "delete") continue;
    const id = proposalChangeId(change);
    for (const dependencyKey of proposalDeleteDependencyKeys(
      state,
      change.entity,
      id,
      campaignId,
    )) {
      if (affectedKeys.has(dependencyKey)) continue;
      throw new Error(
        `Proposal revert conflict: ${change.entity}:${id} has dependent record ${dependencyKey} created or linked after the proposal was applied`,
      );
    }
  }
}

function proposalDeleteDependencyKeys(
  state: EngineState,
  entity: ProposalChange["entity"],
  id: string,
  campaignId: string,
): Set<string> {
  const keys = new Set<string>();
  const add = (
    dependencyEntity: ProposalChange["entity"],
    dependencyId: string,
  ): void => {
    keys.add(`${dependencyEntity}:${dependencyId}`);
  };
  if (entity === "world") {
    for (const item of state.scenes)
      if (
        item.campaignId === campaignId &&
        (item.worldId === id ||
          item.sceneEditHistory?.some(
            (snapshot) => snapshot.state.worldId === id,
          ))
      )
        add("scene", item.id);
    for (const item of state.actors)
      if (item.campaignId === campaignId && item.worldId === id)
        add("actor", item.id);
    for (const item of state.items)
      if (item.campaignId === campaignId && item.worldId === id)
        add("item", item.id);
    for (const item of state.journals)
      if (item.campaignId === campaignId && item.worldId === id)
        add("journal", item.id);
    for (const item of state.handouts)
      if (item.campaignId === campaignId && item.worldId === id)
        add("handout", item.id);
    for (const item of state.encounters)
      if (item.campaignId === campaignId && item.worldId === id)
        add("encounter", item.id);
    for (const item of state.aiMemory)
      if (item.campaignId === campaignId && item.worldId === id)
        add("aiMemory", item.id);
  } else if (entity === "scene") {
    const tokenIds = new Set(
      state.tokens.filter((item) => item.sceneId === id).map((item) => item.id),
    );
    for (const item of state.tokens)
      if (item.sceneId === id) add("token", item.id);
    for (const item of state.chat)
      if (item.campaignId === campaignId && item.sceneId === id)
        add("chat", item.id);
    for (const item of state.fogPresets)
      if (item.campaignId === campaignId && item.sourceSceneId === id)
        add("fogPreset", item.id);
    for (const item of state.campaignSessions)
      if (item.campaignId === campaignId && item.sceneIds.includes(id))
        add("campaignSession", item.id);
    for (const item of state.scenes)
      if (
        item.campaignId === campaignId &&
        item.activationHistory?.some(
          (entry) =>
            entry.previousActiveSceneId === id ||
            entry.deactivatedSceneIds.includes(id),
        )
      )
        add("scene", item.id);
    for (const item of state.encounters)
      if (
        item.campaignId === campaignId &&
        item.tokenIds.some((tokenId) => tokenIds.has(tokenId))
      )
        add("encounter", item.id);
    for (const item of state.combats)
      if (
        item.campaignId === campaignId &&
        item.combatants.some((combatant) => tokenIds.has(combatant.tokenId))
      )
        add("combat", item.id);
  } else if (entity === "actor") {
    for (const item of state.items)
      if (item.campaignId === campaignId && item.actorId === id)
        add("item", item.id);
    for (const item of state.tokens)
      if (item.actorId === id) add("token", item.id);
    for (const item of state.combats)
      if (
        item.campaignId === campaignId &&
        (item.combatants.some((combatant) => combatant.actorId === id) ||
          item.actions?.some(
            (action) =>
              action.actorId === id ||
              action.targetActorIds.includes(id) ||
              action.rolls.some((roll) => roll.targetActorId === id) ||
              action.actorUpdates.some((update) => update.actorId === id) ||
              action.effects?.some((effect) => effect.targetActorId === id),
          ))
      )
        add("combat", item.id);
    for (const item of state.journals)
      if (item.campaignId === campaignId && item.visibleToActorIds.includes(id))
        add("journal", item.id);
    for (const item of state.handouts)
      if (
        item.campaignId === campaignId &&
        (item.visibleToActorIds ?? []).includes(id)
      )
        add("handout", item.id);
  } else if (entity === "token") {
    for (const item of state.encounters)
      if (item.campaignId === campaignId && item.tokenIds.includes(id))
        add("encounter", item.id);
    for (const item of state.combats)
      if (
        item.campaignId === campaignId &&
        item.combatants.some((combatant) => combatant.tokenId === id)
      )
        add("combat", item.id);
    for (const item of state.scenes)
      if (
        item.campaignId === campaignId &&
        (item.annotations.some((annotation) =>
          annotation.affectedTokenIds?.includes(id),
        ) ||
          item.annotationHistory?.some((entry) =>
            entry.affectedTokenIds?.includes(id),
          ) ||
          item.sceneEditHistory?.some((snapshot) =>
            snapshot.state.annotations.some((annotation) =>
              annotation.affectedTokenIds?.includes(id),
            ),
          ))
      )
        add("scene", item.id);
  } else if (entity === "item") {
    for (const item of state.combats)
      if (
        item.campaignId === campaignId &&
        item.actions?.some((action) =>
          action.itemUpdates?.some((update) => update.itemId === id),
        )
      )
        add("combat", item.id);
  } else if (entity === "chat") {
    for (const item of state.chat)
      if (item.campaignId === campaignId && item.replyToMessageId === id)
        add("chat", item.id);
  } else if (entity === "roll") {
    for (const item of state.chat)
      if (item.campaignId === campaignId && item.rollId === id)
        add("chat", item.id);
  } else if (entity === "encounter") {
    for (const item of state.combats)
      if (item.campaignId === campaignId && item.encounterId === id)
        add("combat", item.id);
    for (const item of state.campaignSessions)
      if (item.campaignId === campaignId && item.encounterIds.includes(id))
        add("campaignSession", item.id);
  } else if (entity === "journal") {
    for (const item of state.journals)
      if (item.campaignId === campaignId && item.parentId === id)
        add("journal", item.id);
    for (const item of state.campaignSessions)
      if (item.campaignId === campaignId && item.recapJournalId === id)
        add("campaignSession", item.id);
  } else if (entity === "asset") {
    const campaignSceneIds = new Set(
      state.scenes
        .filter((item) => item.campaignId === campaignId)
        .map((item) => item.id),
    );
    for (const item of state.scenes)
      if (
        item.campaignId === campaignId &&
        (item.backgroundAssetId === id ||
          item.sceneEditHistory?.some(
            (snapshot) => snapshot.state.backgroundAssetId === id,
          ))
      )
        add("scene", item.id);
    for (const item of state.tokens)
      if (campaignSceneIds.has(item.sceneId) && item.imageAssetId === id)
        add("token", item.id);
    for (const item of state.actors)
      if (item.campaignId === campaignId && item.imageAssetId === id)
        add("actor", item.id);
    for (const item of state.handouts)
      if (item.campaignId === campaignId && item.assetIds.includes(id))
        add("handout", item.id);
  }
  return keys;
}

function proposalChangeId(change: ProposalChange): string {
  const id =
    change.id ??
    (typeof change.data.id === "string" ? change.data.id : undefined);
  if (!id?.trim())
    throw new Error(
      `Proposal change is missing an entity id: ${change.entity}`,
    );
  return id;
}

function proposalValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    )
      return false;
    return left.every((value, index) =>
      proposalValuesEqual(value, right[index]),
    );
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key, index) => key !== rightKeys[index])
  )
    return false;
  return leftKeys.every((key) =>
    proposalValuesEqual(leftRecord[key], rightRecord[key]),
  );
}

function deleteSceneWithDomainSemantics(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copied: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  const scene = state.scenes.find(
    (item) => item.id === change.id && item.campaignId === campaignId,
  );
  if (!scene)
    throw new Error(`Proposal target not found: scene:${change.id ?? ""}`);
  const tokens = state.tokens.filter((item) => item.sceneId === scene.id);
  const tokenIds = new Set(tokens.map((item) => item.id));
  const chat = state.chat.filter((item) => item.sceneId === scene.id);
  const fogPresets = state.fogPresets.filter(
    (item) => item.sourceSceneId === scene.id,
  );
  const sessionsBefore = state.campaignSessions
    .filter(
      (item) =>
        item.campaignId === campaignId && item.sceneIds.includes(scene.id),
    )
    .map((item) => structuredClone(item));
  const encountersBefore = state.encounters
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        item.tokenIds.some((id) => tokenIds.has(id)),
    )
    .map((item) => structuredClone(item));
  const combatsBefore = state.combats
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        item.combatants.some((combatant) => tokenIds.has(combatant.tokenId)),
    )
    .map((item) => structuredClone(item));
  writableCollection(state, "scenes", copied).splice(
    state.scenes.findIndex((item) => item.id === scene.id),
    1,
  );
  state.tokens = writableCollection(state, "tokens", copied).filter(
    (item) => item.sceneId !== scene.id,
  );
  state.chat = writableCollection(state, "chat", copied).filter(
    (item) => item.sceneId !== scene.id,
  );
  state.fogPresets = writableCollection(state, "fogPresets", copied).filter(
    (item) => item.sourceSceneId !== scene.id,
  );
  state.campaignSessions = writableCollection(
    state,
    "campaignSessions",
    copied,
  ).map((session) =>
    session.campaignId === campaignId && session.sceneIds.includes(scene.id)
      ? {
          ...session,
          sceneIds: session.sceneIds.filter((id: string) => id !== scene.id),
          updatedAt: changedAt,
        }
      : session,
  );
  state.encounters = writableCollection(state, "encounters", copied).map(
    (encounter) => {
      const nextTokenIds = encounter.tokenIds.filter(
        (id: string) => !tokenIds.has(id),
      );
      return nextTokenIds.length === encounter.tokenIds.length
        ? encounter
        : { ...encounter, tokenIds: nextTokenIds, updatedAt: changedAt };
    },
  );
  state.combats = writableCollection(state, "combats", copied)
    .map((combat) => {
      const combatants = combat.combatants.filter(
        (combatant: Combatant) => !tokenIds.has(combatant.tokenId),
      );
      return combatants.length === combat.combatants.length
        ? combat
        : { ...combat, combatants, updatedAt: changedAt };
    })
    .filter((combat) => combat.combatants.length > 0);
  const survivingCombatIds = new Set(state.combats.map((combat) => combat.id));
  if (!captureInverse) return [];
  return [
    {
      entity: "scene",
      action: "create",
      data: structuredClone(scene) as unknown as Record<string, unknown>,
    },
    ...tokens.map((item) => ({
      entity: "token" as const,
      action: "create" as const,
      data: structuredClone(item) as unknown as Record<string, unknown>,
    })),
    ...chat.map((item) => ({
      entity: "chat" as const,
      action: "create" as const,
      data: structuredClone(item) as unknown as Record<string, unknown>,
    })),
    ...fogPresets.map((item) => ({
      entity: "fogPreset" as const,
      action: "create" as const,
      data: structuredClone(item) as unknown as Record<string, unknown>,
    })),
    ...sessionsBefore.map((item) => ({
      entity: "campaignSession" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...encountersBefore.map((item) => ({
      entity: "encounter" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...combatsBefore.map((item) =>
      survivingCombatIds.has(item.id)
        ? {
            entity: "combat" as const,
            action: "update" as const,
            id: item.id,
            data: item as unknown as Record<string, unknown>,
          }
        : {
            entity: "combat" as const,
            action: "create" as const,
            data: item as unknown as Record<string, unknown>,
          },
    ),
  ];
}

function deleteWorldWithDomainSemantics(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copied: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  const world = state.worlds.find(
    (item) => item.id === change.id && item.campaignId === campaignId,
  );
  if (!world)
    throw new Error(`Proposal target not found: world:${change.id ?? ""}`);
  const linked: Array<{
    key: ProposalCollectionKey;
    entity: ProposalChange["entity"];
    rows: Array<Record<string, unknown>>;
  }> = [
    {
      key: "scenes",
      entity: "scene",
      rows: state.scenes
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
    {
      key: "actors",
      entity: "actor",
      rows: state.actors
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
    {
      key: "items",
      entity: "item",
      rows: state.items
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
    {
      key: "journals",
      entity: "journal",
      rows: state.journals
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
    {
      key: "handouts",
      entity: "handout",
      rows: state.handouts
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
    {
      key: "encounters",
      entity: "encounter",
      rows: state.encounters
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
    {
      key: "aiMemory",
      entity: "aiMemory",
      rows: state.aiMemory
        .filter((item) => item.worldId === world.id)
        .map(
          (item) => structuredClone(item) as unknown as Record<string, unknown>,
        ),
    },
  ];
  writableCollection(state, "worlds", copied).splice(
    state.worlds.findIndex((item) => item.id === world.id),
    1,
  );
  for (const group of linked) {
    const ids = new Set(group.rows.map((row) => row.id as string));
    const bucket = writableCollection(state, group.key, copied);
    for (let index = 0; index < bucket.length; index += 1) {
      if (!ids.has(bucket[index]?.id)) continue;
      bucket[index] = {
        ...bucket[index],
        worldId: undefined,
        updatedAt: changedAt,
      };
    }
  }
  if (!captureInverse) return [];
  return [
    {
      entity: "world",
      action: "create",
      data: structuredClone(world) as unknown as Record<string, unknown>,
    },
    ...linked.flatMap((group) =>
      group.rows.map((row) => ({
        entity: group.entity,
        action: "update" as const,
        id: row.id as string,
        data: row,
      })),
    ),
  ];
}

function deleteActorWithDomainSemantics(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copied: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  const actor = state.actors.find(
    (item) => item.id === change.id && item.campaignId === campaignId,
  );
  if (!actor)
    throw new Error(`Proposal target not found: actor:${change.id ?? ""}`);
  const items = state.items
    .filter(
      (item) => item.actorId === actor.id && item.campaignId === campaignId,
    )
    .map((item) => structuredClone(item));
  const tokens = state.tokens
    .filter((item) => item.actorId === actor.id)
    .map((item) => structuredClone(item));
  const combats = state.combats
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        item.combatants.some((combatant) => combatant.actorId === actor.id),
    )
    .map((item) => structuredClone(item));
  const journals = state.journals
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        item.visibleToActorIds.includes(actor.id),
    )
    .map((item) => structuredClone(item));
  const handouts = state.handouts
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        (item.visibleToActorIds ?? []).includes(actor.id),
    )
    .map((item) => structuredClone(item));
  writableCollection(state, "actors", copied).splice(
    state.actors.findIndex((item) => item.id === actor.id),
    1,
  );
  state.items = writableCollection(state, "items", copied).map((item) =>
    item.actorId === actor.id
      ? { ...item, actorId: undefined, updatedAt: changedAt }
      : item,
  );
  state.tokens = writableCollection(state, "tokens", copied).map((item) =>
    item.actorId === actor.id
      ? { ...item, actorId: undefined, updatedAt: changedAt }
      : item,
  );
  state.combats = writableCollection(state, "combats", copied).map((combat) =>
    combat.campaignId === campaignId &&
    combat.combatants.some(
      (combatant: Combatant) => combatant.actorId === actor.id,
    )
      ? {
          ...combat,
          combatants: combat.combatants.map((combatant: Combatant) =>
            combatant.actorId === actor.id
              ? { ...combatant, actorId: undefined }
              : combatant,
          ),
          updatedAt: changedAt,
        }
      : combat,
  );
  state.journals = writableCollection(state, "journals", copied).map((item) =>
    item.visibleToActorIds.includes(actor.id)
      ? {
          ...item,
          visibleToActorIds: item.visibleToActorIds.filter(
            (id: string) => id !== actor.id,
          ),
          updatedAt: changedAt,
        }
      : item,
  );
  state.handouts = writableCollection(state, "handouts", copied).map((item) =>
    (item.visibleToActorIds ?? []).includes(actor.id)
      ? {
          ...item,
          visibleToActorIds: (item.visibleToActorIds ?? []).filter(
            (id: string) => id !== actor.id,
          ),
          updatedAt: changedAt,
        }
      : item,
  );
  if (!captureInverse) return [];
  return [
    {
      entity: "actor",
      action: "create",
      data: structuredClone(actor) as unknown as Record<string, unknown>,
    },
    ...items.map((item) => ({
      entity: "item" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...tokens.map((item) => ({
      entity: "token" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...combats.map((item) => ({
      entity: "combat" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...journals.map((item) => ({
      entity: "journal" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...handouts.map((item) => ({
      entity: "handout" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
  ];
}

function deleteTokenWithDomainSemantics(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copied: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  const token = state.tokens.find(
    (item) =>
      item.id === change.id &&
      state.scenes.some(
        (scene) => scene.id === item.sceneId && scene.campaignId === campaignId,
      ),
  );
  if (!token)
    throw new Error(`Proposal target not found: token:${change.id ?? ""}`);
  const encounters = state.encounters
    .filter(
      (item) =>
        item.campaignId === campaignId && item.tokenIds.includes(token.id),
    )
    .map((item) => structuredClone(item));
  const combats = state.combats
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        item.combatants.some((combatant) => combatant.tokenId === token.id),
    )
    .map((item) => structuredClone(item));
  writableCollection(state, "tokens", copied).splice(
    state.tokens.findIndex((item) => item.id === token.id),
    1,
  );
  state.encounters = writableCollection(state, "encounters", copied).map(
    (item) =>
      item.tokenIds.includes(token.id)
        ? {
            ...item,
            tokenIds: item.tokenIds.filter((id: string) => id !== token.id),
            updatedAt: changedAt,
          }
        : item,
  );
  state.combats = writableCollection(state, "combats", copied)
    .map((item) =>
      item.combatants.some(
        (combatant: Combatant) => combatant.tokenId === token.id,
      )
        ? {
            ...item,
            combatants: item.combatants.filter(
              (combatant: Combatant) => combatant.tokenId !== token.id,
            ),
            updatedAt: changedAt,
          }
        : item,
    )
    .filter((item) => item.combatants.length > 0);
  const survivingCombatIds = new Set(state.combats.map((combat) => combat.id));
  if (!captureInverse) return [];
  return [
    {
      entity: "token",
      action: "create",
      data: structuredClone(token) as unknown as Record<string, unknown>,
    },
    ...encounters.map((item) => ({
      entity: "encounter" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...combats.map((item) =>
      survivingCombatIds.has(item.id)
        ? {
            entity: "combat" as const,
            action: "update" as const,
            id: item.id,
            data: item as unknown as Record<string, unknown>,
          }
        : {
            entity: "combat" as const,
            action: "create" as const,
            data: item as unknown as Record<string, unknown>,
          },
    ),
  ];
}

function deleteEncounterWithDomainSemantics(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copied: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  const encounter = state.encounters.find(
    (item) => item.id === change.id && item.campaignId === campaignId,
  );
  if (!encounter)
    throw new Error(`Proposal target not found: encounter:${change.id ?? ""}`);
  const combats = state.combats
    .filter(
      (item) =>
        item.campaignId === campaignId && item.encounterId === encounter.id,
    )
    .map((item) => structuredClone(item));
  const sessions = state.campaignSessions
    .filter(
      (item) =>
        item.campaignId === campaignId &&
        item.encounterIds.includes(encounter.id),
    )
    .map((item) => structuredClone(item));
  writableCollection(state, "encounters", copied).splice(
    state.encounters.findIndex((item) => item.id === encounter.id),
    1,
  );
  state.combats = writableCollection(state, "combats", copied).map((item) =>
    item.encounterId === encounter.id
      ? { ...item, encounterId: undefined, updatedAt: changedAt }
      : item,
  );
  state.campaignSessions = writableCollection(
    state,
    "campaignSessions",
    copied,
  ).map((item) =>
    item.campaignId === campaignId && item.encounterIds.includes(encounter.id)
      ? {
          ...item,
          encounterIds: item.encounterIds.filter(
            (id: string) => id !== encounter.id,
          ),
          updatedAt: changedAt,
        }
      : item,
  );
  if (!captureInverse) return [];
  return [
    {
      entity: "encounter",
      action: "create",
      data: structuredClone(encounter) as unknown as Record<string, unknown>,
    },
    ...combats.map((item) => ({
      entity: "combat" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...sessions.map((item) => ({
      entity: "campaignSession" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
  ];
}

function deleteJournalWithDomainSemantics(
  state: EngineState,
  change: ProposalChange,
  campaignId: string,
  changedAt: string,
  copied: Set<CopyOnWriteCollectionKey>,
  captureInverse: boolean,
): ProposalChange[] {
  const journal = state.journals.find(
    (item) => item.id === change.id && item.campaignId === campaignId,
  );
  if (!journal)
    throw new Error(`Proposal target not found: journal:${change.id ?? ""}`);
  const children = state.journals
    .filter(
      (item) => item.parentId === journal.id && item.campaignId === campaignId,
    )
    .map((item) => structuredClone(item));
  const sessions = state.campaignSessions
    .filter(
      (item) =>
        item.campaignId === campaignId && item.recapJournalId === journal.id,
    )
    .map((item) => structuredClone(item));
  writableCollection(state, "journals", copied).splice(
    state.journals.findIndex((item) => item.id === journal.id),
    1,
  );
  state.journals = writableCollection(state, "journals", copied).map((item) =>
    item.parentId === journal.id
      ? { ...item, parentId: undefined, updatedAt: changedAt }
      : item,
  );
  state.campaignSessions = writableCollection(
    state,
    "campaignSessions",
    copied,
  ).map((item) =>
    item.campaignId === campaignId && item.recapJournalId === journal.id
      ? { ...item, recapJournalId: undefined, updatedAt: changedAt }
      : item,
  );
  if (!captureInverse) return [];
  return [
    {
      entity: "journal",
      action: "create",
      data: structuredClone(journal) as unknown as Record<string, unknown>,
    },
    ...children.map((item) => ({
      entity: "journal" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
    ...sessions.map((item) => ({
      entity: "campaignSession" as const,
      action: "update" as const,
      id: item.id,
      data: item as unknown as Record<string, unknown>,
    })),
  ];
}

function entityId(entity: Record<string, unknown>): string {
  if (typeof entity.id !== "string" || !entity.id.trim()) {
    throw new Error("Proposal create requires a non-empty entity id");
  }
  return entity.id;
}

function readCollection(
  state: EngineState,
  key: ProposalCollectionKey,
): Array<{ id?: string }>;
function readCollection(state: EngineState, key: "proposals"): Proposal[];
function readCollection(
  state: EngineState,
  key: CopyOnWriteCollectionKey,
): any[];
function readCollection(
  state: EngineState,
  key: CopyOnWriteCollectionKey,
): any[] {
  return state[key] as any[];
}

function writableCollection(
  state: EngineState,
  key: ProposalCollectionKey,
  copiedCollections: Set<CopyOnWriteCollectionKey>,
): any[];
function writableCollection(
  state: EngineState,
  key: "proposals",
  copiedCollections: Set<CopyOnWriteCollectionKey>,
): Proposal[];
function writableCollection(
  state: EngineState,
  key: CopyOnWriteCollectionKey,
  copiedCollections: Set<CopyOnWriteCollectionKey>,
): any[];
function writableCollection(
  state: EngineState,
  key: CopyOnWriteCollectionKey,
  copiedCollections: Set<CopyOnWriteCollectionKey>,
): any[] {
  if (!copiedCollections.has(key)) {
    state[key] = [...readCollection(state, key)] as never;
    copiedCollections.add(key);
  }
  return readCollection(state, key);
}

function collectionKeyForEntity(
  entity: ProposalChange["entity"],
): ProposalCollectionKey {
  switch (entity) {
    case "campaign":
      return "campaigns";
    case "world":
      return "worlds";
    case "scene":
      return "scenes";
    case "token":
      return "tokens";
    case "actor":
      return "actors";
    case "item":
      return "items";
    case "journal":
      return "journals";
    case "handout":
      return "handouts";
    case "chat":
      return "chat";
    case "roll":
      return "rolls";
    case "diceMacro":
      return "diceMacros";
    case "encounter":
      return "encounters";
    case "campaignSession":
      return "campaignSessions";
    case "combat":
      return "combats";
    case "asset":
      return "assets";
    case "fogPreset":
      return "fogPresets";
    case "pluginStorage":
      return "pluginStorage";
    case "aiMemory":
      return "aiMemory";
    default:
      throw new Error(`Unsupported proposal entity: ${entity}`);
  }
}

function assertEntityInProposalCampaign(
  state: EngineState,
  key: ProposalCollectionKey,
  entity: Record<string, unknown>,
  campaignId: string,
): void {
  const entityCampaignId = campaignIdForEntity(state, key, entity);
  if (entityCampaignId !== campaignId) {
    throw new Error(
      `Proposal change targets entity outside proposal campaign: expected ${campaignId}, received ${entityCampaignId ?? "unknown"}`,
    );
  }
}

function campaignIdForEntity(
  state: EngineState,
  key: ProposalCollectionKey,
  entity: Record<string, unknown>,
): string | undefined {
  if (key === "campaigns")
    return typeof entity.id === "string" ? entity.id : undefined;
  if (key === "tokens") {
    const sceneId =
      typeof entity.sceneId === "string" ? entity.sceneId : undefined;
    return sceneId
      ? state.scenes.find((scene) => scene.id === sceneId)?.campaignId
      : undefined;
  }
  return typeof entity.campaignId === "string" ? entity.campaignId : undefined;
}
