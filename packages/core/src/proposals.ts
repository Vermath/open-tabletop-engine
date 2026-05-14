import { nowIso } from "./ids.js";
import type { EngineState, Proposal, ProposalHistoryEntry } from "./types.js";

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
  const next: EngineState = structuredClone(state) as EngineState;
  for (const change of proposal.changesJson) {
    const bucket = bucketForEntity(next, change.entity);
    if (change.action === "create") {
      bucket.push(change.data as never);
    } else if (change.action === "update") {
      const index = bucket.findIndex((item: { id?: string }) => item.id === change.id);
      if (index >= 0) {
        bucket[index] = { ...bucket[index], ...change.data, updatedAt: appliedAt };
      }
    } else if (change.action === "delete") {
      const index = bucket.findIndex((item: { id?: string }) => item.id === change.id);
      if (index >= 0) bucket.splice(index, 1);
    }
  }

  const proposalIndex = next.proposals.findIndex((item) => item.id === proposal.id);
  if (proposalIndex >= 0) {
    next.proposals[proposalIndex] = {
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

function bucketForEntity(state: EngineState, entity: string): any[] {
  switch (entity) {
    case "campaign":
      return state.campaigns;
    case "scene":
      return state.scenes;
    case "token":
      return state.tokens;
    case "actor":
      return state.actors;
    case "item":
      return state.items;
    case "journal":
      return state.journals;
    case "chat":
      return state.chat;
    case "encounter":
      return state.encounters;
    case "combat":
      return state.combats;
    default:
      throw new Error(`Unsupported proposal entity: ${entity}`);
  }
}
