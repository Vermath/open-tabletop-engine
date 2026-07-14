import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { combatRewardRemainderLabel, combatRewardSummary } from "./combat-panel.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const panelSource = readFileSync(resolve(__dirname, "combat-panel.tsx"), "utf8");

const reward: NonNullable<Combat["rewards"]>[number] = {
  id: "rwrd_test",
  campaignId: "camp_test",
  combatId: "cmb_test",
  awardedByUserId: "usr_gm",
  recipientActorIds: ["act_one", "act_two"],
  totalXp: 101,
  xpPerActor: 50,
  unallocatedXp: 1,
  totalGp: 11,
  gpPerActor: 5,
  unallocatedGp: 1,
  loot: ["Potion of Healing"],
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

describe("combat reward history UI", () => {
  it("summarizes distributed totals and visible remainders", () => {
    expect(combatRewardSummary(reward)).toBe("101 XP (50 each) + 11 gp (5 each) + 1 loot item");
    expect(combatRewardRemainderLabel(reward)).toBe("1 XP + 1 gp unallocated");
  });

  it("wires atomic award responses into actors, combat, and the durable ledger", () => {
    expect(appSource).toContain("async function awardCombatRewards");
    expect(appSource).toContain("combatRewardAttemptForIntent(combatRewardAttemptRef.current");
    expect(appSource).toContain("idempotencyKey: attempt.idempotencyKey");
    expect(appSource).toContain("expectedActorUpdatedAt: Object.fromEntries(actorRevisions)");
    expect(appSource).toContain("combats: snapshot.combats.map");
    expect(panelSource).toContain('aria-label="Combat reward history"');
    expect(panelSource).toContain('aria-label="Combat loot award"');
    expect(panelSource).toContain("reward.unallocatedXp");
  });
});
