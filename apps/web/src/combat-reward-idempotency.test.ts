import { describe, expect, it } from "vitest";
import { combatRewardAttemptForIntent, combatRewardIntentFingerprint } from "./combat-reward-idempotency.js";

describe("combat reward idempotency", () => {
  it("reuses one key and original request for the same submit intent until success clears it", () => {
    const fingerprint = combatRewardIntentFingerprint({
      combatId: "cmb_one",
      recipientActorIds: ["act_two", "act_one"],
      totalXp: 100
    });
    let created = 0;
    const first = combatRewardAttemptForIntent(null, fingerprint, () => String(++created), () => ({ expectedUpdatedAt: "revision-one" }));
    const retry = combatRewardAttemptForIntent(first, combatRewardIntentFingerprint({
      combatId: "cmb_one",
      recipientActorIds: ["act_one", "act_two"],
      totalXp: 100
    }), () => String(++created), () => ({ expectedUpdatedAt: "revision-two" }));

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe("combat-reward:1");
    expect(retry.request).toEqual({ expectedUpdatedAt: "revision-one" });
    expect(created).toBe(1);

    const nextIntent = combatRewardAttemptForIntent(null, fingerprint, () => String(++created), () => ({ expectedUpdatedAt: "revision-two" }));
    expect(nextIntent.idempotencyKey).toBe("combat-reward:2");
  });
});
