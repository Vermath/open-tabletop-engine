import { nowIso } from "./ids.js";
import type { EngineState, Proposal } from "./types.js";

export function approveProposal(proposal: Proposal, userId: string): Proposal {
  if (proposal.status !== "pending") {
    throw new Error("Proposal must be pending before approval");
  }
  return {
    ...proposal,
    status: "approved",
    approvedByUserId: userId,
    updatedAt: nowIso()
  };
}

export function rejectProposal(proposal: Proposal): Proposal {
  if (proposal.status !== "pending" && proposal.status !== "approved") {
    throw new Error("Proposal must be pending or approved before rejection");
  }
  return {
    ...proposal,
    status: "rejected",
    updatedAt: nowIso()
  };
}

export function applyProposal(state: EngineState, proposal: Proposal): EngineState {
  if (proposal.status !== "approved") {
    throw new Error("Proposal must be approved before applying");
  }

  const next: EngineState = structuredClone(state) as EngineState;
  for (const change of proposal.changesJson) {
    const bucket = bucketForEntity(next, change.entity);
    if (change.action === "create") {
      bucket.push(change.data as never);
    } else if (change.action === "update") {
      const index = bucket.findIndex((item: { id?: string }) => item.id === change.id);
      if (index >= 0) {
        bucket[index] = { ...bucket[index], ...change.data, updatedAt: nowIso() };
      }
    } else if (change.action === "delete") {
      const index = bucket.findIndex((item: { id?: string }) => item.id === change.id);
      if (index >= 0) bucket.splice(index, 1);
    }
  }

  const proposalIndex = next.proposals.findIndex((item) => item.id === proposal.id);
  if (proposalIndex >= 0) {
    next.proposals[proposalIndex] = { ...proposal, status: "applied", updatedAt: nowIso() };
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
