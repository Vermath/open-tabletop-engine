import { describe, expect, it } from "vitest";

import { ApiError } from "./api.js";
import { combatTurnAdvanceRetryIsSafe, staleWriteCurrentCombat } from "./combat-conflict.js";

const combatants = [
  { id: "cmbt_a", tokenId: "tok_a", actorId: "act_a", name: "A", initiative: 20, defeated: false },
  { id: "cmbt_b", tokenId: "tok_b", actorId: "act_b", name: "B", initiative: 10, defeated: false }
];

function staleWriteError(current: Record<string, unknown>, overrides: Record<string, unknown> = {}): ApiError {
  const body = { code: "stale_write", resourceType: "combat", current, ...overrides };
  return new ApiError("Combat was updated by someone else", 409, body, JSON.stringify(body));
}

const currentCombat = {
  id: "combat_1",
  campaignId: "camp_demo",
  active: true,
  round: 2,
  turnIndex: 1,
  combatants,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:05:00.000Z"
};

describe("staleWriteCurrentCombat", () => {
  it("returns the authoritative combat from a structured stale-write conflict", () => {
    expect(staleWriteCurrentCombat(staleWriteError(currentCombat), "combat_1")).toEqual(currentCombat);
  });

  it("rejects non-conflict errors, other resources, other combats, and malformed payloads", () => {
    expect(staleWriteCurrentCombat(new Error("network"), "combat_1")).toBeUndefined();
    expect(staleWriteCurrentCombat(new ApiError("denied", 403, {}, "{}"), "combat_1")).toBeUndefined();
    expect(staleWriteCurrentCombat(staleWriteError(currentCombat, { resourceType: "actor" }), "combat_1")).toBeUndefined();
    expect(staleWriteCurrentCombat(staleWriteError(currentCombat), "combat_other")).toBeUndefined();
    expect(staleWriteCurrentCombat(staleWriteError({ ...currentCombat, combatants: undefined }), "combat_1")).toBeUndefined();
    expect(staleWriteCurrentCombat(staleWriteError({ ...currentCombat, updatedAt: 42 }), "combat_1")).toBeUndefined();
  });
});

describe("combatTurnAdvanceRetryIsSafe", () => {
  const attempted = { round: 2, turnIndex: 1, combatants };

  it("permits one retry when the concurrent write left the turn position unchanged", () => {
    expect(combatTurnAdvanceRetryIsSafe(attempted, { round: 2, turnIndex: 1, combatants: [...combatants] })).toBe(true);
  });

  it("requires review when the turn, round, or combatant count moved", () => {
    expect(combatTurnAdvanceRetryIsSafe(attempted, { round: 2, turnIndex: 0, combatants })).toBe(false);
    expect(combatTurnAdvanceRetryIsSafe(attempted, { round: 3, turnIndex: 1, combatants })).toBe(false);
    expect(combatTurnAdvanceRetryIsSafe(attempted, { round: 2, turnIndex: 1, combatants: combatants.slice(0, 1) })).toBe(false);
  });
});
