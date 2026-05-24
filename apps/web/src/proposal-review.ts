import type { Proposal } from "@open-tabletop/core";

export type ProposalReviewStep = "approve" | "apply";

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
