import type { Combat, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  consumeDnd5eSrdContinuation,
  dnd5eSrdContinuationGrantForRoll,
  dnd5eSrdCriticalDamageFormula,
  grantDnd5eSrdContinuations
} from "./index.js";

const combat: Combat = {
  id: "cmb_continuations",
  campaignId: "camp_continuations",
  active: true,
  round: 3,
  turnIndex: 0,
  combatants: [
    { id: "cmbt_attacker", tokenId: "tok_attacker", actorId: "act_attacker", name: "Attacker", initiative: 20, defeated: false },
    { id: "cmbt_target", tokenId: "tok_target", actorId: "act_target", name: "Target", initiative: 10, defeated: false }
  ],
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z"
};

const damageAllowance = [{ rollId: "item-sword-damage", exclusiveGroup: "sword-primary" }];

describe("D&D critical-hit continuations", () => {
  it("captures the natural die, threshold, negation, and final verdict for every target", () => {
    const grant = dnd5eSrdContinuationGrantForRoll({
      roll: { id: "item-sword-attack", label: "Sword Attack", formula: "1d20+7", metadata: { effectKind: "attack", continuation: { role: "attack", family: "item:sword" }, attackType: "weapon", criticalHitOn: "19-20" } },
      available: [{ id: "item-sword-damage", label: "Sword Damage", formula: "1d8+4", metadata: { effectKind: "damage", continuation: { role: "primary", family: "item:sword", activation: "on-hit" } } }],
      targets: [
        { actorId: "act_target", rollTotal: 25, naturalD20: 19, armorClass: 17, criticalHitsBecomeNormalHits: true },
        { actorId: "act_target_2", rollTotal: 24, naturalD20: 18, armorClass: 17 }
      ]
    });

    expect(grant).toMatchObject({
      targetActorIds: ["act_target", "act_target_2"],
      criticalOutcomes: [
        { targetActorId: "act_target", naturalD20: 19, criticalMinimum: 19, outcome: "critical-hit", criticalNegated: true, finalCritical: false },
        { targetActorId: "act_target_2", naturalD20: 18, criticalMinimum: 19, outcome: "hit", criticalNegated: false, finalCritical: false }
      ]
    });
    expect(grant?.criticalHitTargetActorIds).toBeUndefined();
  });

  it("uses typed structural metadata for spell attacks and ignores misleading ids and labels", () => {
    const critical = dnd5eSrdContinuationGrantForRoll({
      roll: {
        id: "totally-not-an-attack",
        label: "Misleading Healing Display",
        formula: "1d20+8",
        metadata: { effectKind: "attack", attackType: "spell", continuation: { role: "attack", family: "spell:fire-bolt" } }
      },
      available: [{
        id: "arbitrary-followup",
        label: "Looks Like Healing",
        formula: "2d10",
        metadata: { effectKind: "damage", continuation: { role: "primary", family: "spell:fire-bolt", activation: "on-hit" } }
      }],
      targets: [{ actorId: "act_target", rollTotal: 28, naturalD20: 20, armorClass: 18 }]
    });
    expect(critical).toMatchObject({
      allowances: [{ rollId: "arbitrary-followup", exclusiveGroup: "spell:fire-bolt-primary" }],
      criticalHitTargetActorIds: ["act_target"],
      criticalOutcomes: [{ targetActorId: "act_target", naturalD20: 20, criticalMinimum: 20, outcome: "critical-hit", finalCritical: true }]
    });

    const untyped = dnd5eSrdContinuationGrantForRoll({
      roll: { id: "fake-attack", label: "Attack", formula: "1d20+8" },
      available: [{ id: "fake-damage", label: "Damage", formula: "2d10", metadata: { activation: "on-hit" } }],
      targets: [{ actorId: "act_target", rollTotal: 28, naturalD20: 20, armorClass: 18 }]
    });
    expect(untyped).toBeUndefined();
  });

  it("propagates a weapon critical to primary and eligible Sneak Attack dice without changing normal hits", () => {
    const dagger = {
      id: "dagger",
      campaignId: "camp_continuations",
      systemId: "dnd-5e-srd",
      actorId: "act_attacker",
      type: "item",
      name: "Dagger",
      data: { weaponKind: "melee", properties: ["finesse"], damageType: "piercing" },
      createdAt: combat.createdAt,
      updatedAt: combat.updatedAt
    } satisfies Item;
    const roll = {
      id: "opaque-source",
      label: "Opaque source",
      formula: "1d20+7",
      metadata: { effectKind: "attack", attackType: "weapon", d20Mode: "normal", continuation: { role: "attack", family: "item:dagger" } }
    };
    const available = [
      { id: "opaque-primary", label: "Primary", formula: "1d4+4", metadata: { effectKind: "damage", continuation: { role: "primary", family: "item:dagger", activation: "on-hit" } } },
      { id: "opaque-extra", label: "Extra", formula: "3d6", metadata: { effectKind: "damage", continuation: { role: "feature", activation: "on-hit", oncePerTurn: true, requiresSneakAttackEligibility: true } } }
    ];
    const critical = dnd5eSrdContinuationGrantForRoll({ roll, available, requestedItem: dagger, sneakAttackEligible: true, targets: [{ actorId: "act_target", rollTotal: 27, naturalD20: 20, armorClass: 16 }] });
    expect(critical).toMatchObject({
      sourceDamageType: "piercing",
      allowances: [
        { rollId: "opaque-primary", exclusiveGroup: "item:dagger-primary" },
        { rollId: "opaque-extra", oncePerTurn: true }
      ],
      criticalHitTargetActorIds: ["act_target"]
    });
    expect(dnd5eSrdCriticalDamageFormula(available[0]!.formula)).toBe("2d4+4");
    expect(dnd5eSrdCriticalDamageFormula(available[1]!.formula)).toBe("6d6");

    const normal = dnd5eSrdContinuationGrantForRoll({ roll, available, requestedItem: dagger, sneakAttackEligible: true, targets: [{ actorId: "act_target", rollTotal: 24, naturalD20: 19, armorClass: 16 }] });
    expect(normal).toMatchObject({
      allowances: critical?.allowances,
      criticalOutcomes: [{ targetActorId: "act_target", naturalD20: 19, criticalMinimum: 20, outcome: "hit", criticalNegated: false, finalCritical: false }]
    });
    expect(normal?.criticalHitTargetActorIds).toBeUndefined();
    expect(available.map((candidate) => candidate.formula)).toEqual(["1d4+4", "3d6"]);
  });

  it("uses stable ticket ids, rejects ambiguous legacy consumption, and returns exact critical evidence", () => {
    const first = grantDnd5eSrdContinuations({}, "act_attacker", {
      sourceRollId: "item-sword-attack",
      allowances: damageAllowance,
      targetActorIds: ["act_target"],
      criticalOutcomes: [{ targetActorId: "act_target", naturalD20: 20, criticalMinimum: 20, outcome: "critical-hit", criticalNegated: false, finalCritical: true }],
      criticalHitTargetActorIds: ["act_target"]
    }, combat, "2026-07-17T00:00:01.000Z");
    const second = grantDnd5eSrdContinuations(first.data, "act_attacker", {
      sourceRollId: "item-sword-attack",
      allowances: damageAllowance,
      targetActorIds: ["act_target"],
      criticalOutcomes: [{ targetActorId: "act_target", naturalD20: 14, criticalMinimum: 20, outcome: "hit", criticalNegated: false, finalCritical: false }]
    }, combat, "2026-07-17T00:00:02.000Z");

    expect(first.continuationId).toBe("cmb_continuations:3:0:act_attacker:1");
    expect(second.continuationId).toBe("cmb_continuations:3:0:act_attacker:2");
    expect(consumeDnd5eSrdContinuation(second.data, "act_attacker", "item-sword-damage", ["act_target"], combat).blocked)
      .toMatchObject({ code: "continuation_ambiguous" });

    const consumed = consumeDnd5eSrdContinuation(second.data, "act_attacker", "item-sword-damage", ["act_target"], combat, undefined, first.continuationId);
    expect(consumed.blocked).toBeUndefined();
    expect(consumed).toMatchObject({
      continuationId: first.continuationId,
      criticalHitTargetActorIds: ["act_target"],
      criticalOutcomes: [{ targetActorId: "act_target", naturalD20: 20, criticalMinimum: 20, outcome: "critical-hit", criticalNegated: false, finalCritical: true }]
    });
  });

  it("retains every same-turn ticket instead of silently dropping older attacks", () => {
    let data: Record<string, unknown> = {};
    const ids: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const granted = grantDnd5eSrdContinuations(data, "act_attacker", {
        sourceRollId: `item-sword-attack-${index}`,
        allowances: damageAllowance,
        targetActorIds: ["act_target"]
      }, combat, `2026-07-17T00:00:${String(index).padStart(2, "0")}.000Z`);
      data = granted.data;
      ids.push(granted.continuationId!);
    }

    expect(ids).toHaveLength(10);
    const oldest = consumeDnd5eSrdContinuation(data, "act_attacker", "item-sword-damage", ["act_target"], combat, undefined, ids[0]);
    expect(oldest.blocked).toBeUndefined();
    expect(oldest.continuationId).toBe(ids[0]);
  });
});

describe("D&D critical formula safety", () => {
  it("doubles only complete dice tokens and preserves supported dice modifiers", () => {
    expect(dnd5eSrdCriticalDamageFormula("d8+2d6kh1+1d4!+7")).toBe("2d8+4d6kh1+2d4!+7");
    expect(dnd5eSrdCriticalDamageFormula("damage1d8+@mod+d6")).toBe("damage1d8+@mod+2d6");
  });

  it("bounds hostile dice counts, die sizes, and output length", () => {
    expect(() => dnd5eSrdCriticalDamageFormula("501d6")).toThrow("between 1 and 1000 per term");
    expect(() => dnd5eSrdCriticalDamageFormula("1d1")).toThrow("at least 2");
    expect(() => dnd5eSrdCriticalDamageFormula(Array.from({ length: 11 }, () => "500d6").join("+"))).toThrow("cannot exceed 10000 dice");
    expect(() => dnd5eSrdCriticalDamageFormula(`1d6${"+1".repeat(2_050)}`)).toThrow("cannot exceed 4096 characters");
  });
});
