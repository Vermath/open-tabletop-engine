import type { Proposal, ProposalChange } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";

export type ProposalReviewStep = "approve" | "apply";
export type AiAgentProposalMessageRef = { proposalIds?: string[] };

export function proposalReviewSteps(proposal: Pick<Proposal, "status">): ProposalReviewStep[] {
  if (proposal.status === "pending") return ["approve", "apply"];
  if (proposal.status === "approved") return ["apply"];
  return [];
}

export function proposalReviewActionLabel(proposal: Pick<Proposal, "status">): string {
  if (proposal.status === "pending") return "Approve and apply";
  if (proposal.status === "approved") return "Apply";
  if (proposal.status === "applied") return "Applied";
  return "Rejected";
}

export function visibleAiAgentProposals(proposals: Proposal[], messages: AiAgentProposalMessageRef[], hiddenProposalIds: ReadonlySet<string> = new Set()): Proposal[] {
  const proposalIds = new Set(messages.flatMap((message) => message.proposalIds ?? []));
  return proposals
    .filter((proposal) => !hiddenProposalIds.has(proposal.id))
    .filter((proposal) => proposal.status === "pending" || proposal.status === "approved")
    .filter((proposal) => proposalIds.has(proposal.id) || proposal.createdByType === "ai")
    .sort((left, right) => proposalStatusSort(left.status) - proposalStatusSort(right.status) || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4);
}

export function applyProposalChangesToSnapshot(snapshot: Snapshot, proposal: Proposal): Snapshot {
  return proposal.changesJson.reduce(
    (current, change) => applyProposalChangeToSnapshot(current, change, proposal.updatedAt),
    { ...snapshot, proposals: upsertProposal(snapshot.proposals, proposal) }
  );
}

function proposalStatusSort(status: Proposal["status"]): number {
  if (status === "pending") return 0;
  if (status === "approved") return 1;
  if (status === "rejected") return 2;
  return 3;
}

function upsertProposal(proposals: Proposal[], proposal: Proposal): Proposal[] {
  const index = proposals.findIndex((item) => item.id === proposal.id);
  if (index < 0) return [...proposals, proposal];
  return proposals.map((item) => (item.id === proposal.id ? proposal : item));
}

function applyProposalChangeToSnapshot(snapshot: Snapshot, change: ProposalChange, updatedAt: string): Snapshot {
  switch (change.entity) {
    case "campaign":
      return { ...snapshot, campaigns: applyRecordChange(snapshot.campaigns, change, updatedAt) };
    case "scene":
      return { ...snapshot, scenes: applyRecordChange(snapshot.scenes, change, updatedAt) };
    case "token":
      return { ...snapshot, tokens: applyRecordChange(snapshot.tokens, change, updatedAt) };
    case "actor":
      return { ...snapshot, actors: applyRecordChange(snapshot.actors, change, updatedAt) };
    case "item":
      return { ...snapshot, items: applyRecordChange(snapshot.items, change, updatedAt) };
    case "journal":
      return { ...snapshot, journals: applyRecordChange(snapshot.journals, change, updatedAt) };
    case "chat":
      return { ...snapshot, chat: applyRecordChange(snapshot.chat, change, updatedAt) };
    case "roll":
      return { ...snapshot, rolls: applyRecordChange(snapshot.rolls, change, updatedAt) };
    case "diceMacro":
      return { ...snapshot, diceMacros: applyRecordChange(snapshot.diceMacros, change, updatedAt) };
    case "encounter":
      return { ...snapshot, encounters: applyRecordChange(snapshot.encounters, change, updatedAt) };
    case "combat":
      return { ...snapshot, combats: applyRecordChange(snapshot.combats, change, updatedAt) };
    case "asset":
      return { ...snapshot, assets: applyRecordChange(snapshot.assets, change, updatedAt) };
    case "fogPreset":
      return { ...snapshot, fogPresets: applyRecordChange(snapshot.fogPresets, change, updatedAt) };
  }
}

function applyRecordChange<T extends { id?: string; updatedAt?: string }>(records: T[], change: ProposalChange, updatedAt: string): T[] {
  if (change.action === "create") return [...records, change.data as T];
  if (change.action === "delete") return records.filter((record) => record.id !== change.id);
  return records.map((record) => (record.id === change.id ? ({ ...record, ...change.data, updatedAt } as T) : record));
}
