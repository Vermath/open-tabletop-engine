import { nowIso } from "./ids.js";
import type { EngineState, Proposal, ProposalChange, ProposalHistoryEntry } from "./types.js";

type ProposalCollectionKey =
  | "campaigns"
  | "scenes"
  | "tokens"
  | "actors"
  | "items"
  | "journals"
  | "chat"
  | "rolls"
  | "diceMacros"
  | "encounters"
  | "combats"
  | "assets"
  | "fogPresets";

type CopyOnWriteCollectionKey = ProposalCollectionKey | "proposals";

export function proposalHistoryEntry(input: Omit<ProposalHistoryEntry, "at"> & { at?: string }): ProposalHistoryEntry {
  return {
    ...input,
    at: input.at ?? nowIso()
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
        auditAction: "proposal.approved"
      })
    ]
  };
}

export function rejectProposal(proposal: Proposal, userId?: string, actorType: ProposalHistoryEntry["actorType"] = "user"): Proposal {
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
        auditAction: actorType === "server_admin" ? "admin.aiProposals.rejectStale" : "ai.proposal.rejected"
      })
    ]
  };
}

export function applyProposal(state: EngineState, proposal: Proposal, userId?: string): EngineState {
  if (proposal.status !== "approved") {
    throw new Error("Proposal must be approved before applying");
  }

  const appliedAt = nowIso();
  const next: EngineState = { ...state };
  const copiedCollections = new Set<CopyOnWriteCollectionKey>();
  for (const change of proposal.changesJson) {
    const bucketKey = collectionKeyForEntity(change.entity);
    const bucket = readCollection(next, bucketKey);
    if (change.action === "create") {
      const created = structuredClone(change.data) as Record<string, unknown>;
      const createdId = entityId(created);
      if (bucket.some((item) => item.id === createdId)) {
        throw new Error(`Proposal create target already exists: ${change.entity}:${createdId}`);
      }
      assertEntityInProposalCampaign(next, bucketKey, created, proposal.campaignId);
      writableCollection(next, bucketKey, copiedCollections).push(created as never);
    } else if (change.action === "update") {
      const index = bucket.findIndex((item: { id?: string }) => item.id === change.id);
      if (index < 0) throw new Error(`Proposal target not found: ${change.entity}:${change.id ?? ""}`);
      const replacementId = change.data.id;
      if (Object.prototype.hasOwnProperty.call(change.data, "id") && replacementId !== change.id) {
        throw new Error(`Proposal update cannot change entity id: ${change.entity}:${change.id ?? ""}`);
      }
      assertEntityInProposalCampaign(next, bucketKey, bucket[index] as Record<string, unknown>, proposal.campaignId);
      const writableBucket = writableCollection(next, bucketKey, copiedCollections);
      const updated = {
        ...(structuredClone(writableBucket[index]) as Record<string, unknown>),
        ...(structuredClone(change.data) as Record<string, unknown>),
        updatedAt: appliedAt
      };
      assertEntityInProposalCampaign(next, bucketKey, updated, proposal.campaignId);
      writableBucket[index] = updated;
    } else if (change.action === "delete") {
      const index = bucket.findIndex((item: { id?: string }) => item.id === change.id);
      if (index < 0) throw new Error(`Proposal target not found: ${change.entity}:${change.id ?? ""}`);
      assertEntityInProposalCampaign(next, bucketKey, bucket[index] as Record<string, unknown>, proposal.campaignId);
      writableCollection(next, bucketKey, copiedCollections).splice(index, 1);
    }
  }

  const proposalIndex = next.proposals.findIndex((item) => item.id === proposal.id);
  if (proposalIndex >= 0) {
    const proposals = writableCollection(next, "proposals", copiedCollections);
    proposals[proposalIndex] = {
      ...proposal,
      status: "applied",
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
          auditAction: "proposal.applied"
        })
      ]
    };
  }
  return next;
}

function entityId(entity: Record<string, unknown>): string {
  if (typeof entity.id !== "string" || !entity.id.trim()) {
    throw new Error("Proposal create requires a non-empty entity id");
  }
  return entity.id;
}

function readCollection(state: EngineState, key: ProposalCollectionKey): Array<{ id?: string }>;
function readCollection(state: EngineState, key: "proposals"): Proposal[];
function readCollection(state: EngineState, key: CopyOnWriteCollectionKey): any[];
function readCollection(state: EngineState, key: CopyOnWriteCollectionKey): any[] {
  return state[key] as any[];
}

function writableCollection(state: EngineState, key: ProposalCollectionKey, copiedCollections: Set<CopyOnWriteCollectionKey>): any[];
function writableCollection(state: EngineState, key: "proposals", copiedCollections: Set<CopyOnWriteCollectionKey>): Proposal[];
function writableCollection(state: EngineState, key: CopyOnWriteCollectionKey, copiedCollections: Set<CopyOnWriteCollectionKey>): any[];
function writableCollection(state: EngineState, key: CopyOnWriteCollectionKey, copiedCollections: Set<CopyOnWriteCollectionKey>): any[] {
  if (!copiedCollections.has(key)) {
    state[key] = [...readCollection(state, key)] as never;
    copiedCollections.add(key);
  }
  return readCollection(state, key);
}

function collectionKeyForEntity(entity: ProposalChange["entity"]): ProposalCollectionKey {
  switch (entity) {
    case "campaign":
      return "campaigns";
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
    case "chat":
      return "chat";
    case "roll":
      return "rolls";
    case "diceMacro":
      return "diceMacros";
    case "encounter":
      return "encounters";
    case "combat":
      return "combats";
    case "asset":
      return "assets";
    case "fogPreset":
      return "fogPresets";
    default:
      throw new Error(`Unsupported proposal entity: ${entity}`);
  }
}

function assertEntityInProposalCampaign(state: EngineState, key: ProposalCollectionKey, entity: Record<string, unknown>, campaignId: string): void {
  const entityCampaignId = campaignIdForEntity(state, key, entity);
  if (entityCampaignId !== campaignId) {
    throw new Error(`Proposal change targets entity outside proposal campaign: expected ${campaignId}, received ${entityCampaignId ?? "unknown"}`);
  }
}

function campaignIdForEntity(state: EngineState, key: ProposalCollectionKey, entity: Record<string, unknown>): string | undefined {
  if (key === "campaigns") return typeof entity.id === "string" ? entity.id : undefined;
  if (key === "tokens") {
    const sceneId = typeof entity.sceneId === "string" ? entity.sceneId : undefined;
    return sceneId ? state.scenes.find((scene) => scene.id === sceneId)?.campaignId : undefined;
  }
  return typeof entity.campaignId === "string" ? entity.campaignId : undefined;
}
