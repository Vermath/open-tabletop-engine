import { describe, expect, it } from "vitest";
import { proposalReviewActionLabel, proposalReviewSteps } from "./proposal-review.js";

describe("proposal review helpers", () => {
  it("approves pending proposals before applying them", () => {
    expect(proposalReviewSteps({ status: "pending" })).toEqual(["approve", "apply"]);
    expect(proposalReviewActionLabel({ status: "pending" })).toBe("Approve and apply");
  });

  it("applies already-approved proposals without trying to approve them again", () => {
    expect(proposalReviewSteps({ status: "approved" })).toEqual(["apply"]);
    expect(proposalReviewActionLabel({ status: "approved" })).toBe("Apply");
  });

  it("does not offer a review action for terminal proposal states", () => {
    expect(proposalReviewSteps({ status: "applied" })).toEqual([]);
    expect(proposalReviewActionLabel({ status: "applied" })).toBe("Applied");
    expect(proposalReviewSteps({ status: "rejected" })).toEqual([]);
    expect(proposalReviewActionLabel({ status: "rejected" })).toBe("Rejected");
  });
});
