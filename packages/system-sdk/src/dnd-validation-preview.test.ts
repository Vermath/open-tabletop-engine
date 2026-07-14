import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  DND_5E_SRD_ACTOR_SCHEMA_VERSION,
  DND_5E_SRD_ITEM_SCHEMA_VERSION,
  DND_5E_SRD_REPAIR_PREVIEW_VERSION,
  DND_5E_SRD_RULES_PREVIEW_VERSION,
  DND_5E_SRD_VERSION,
  previewDnd5eSrdRules,
  previewDnd5eSrdActorRepairs,
  previewDnd5eSrdItemRepairs,
  validateDnd5eSrdActor,
  validateDnd5eSrdItem
} from "./index.js";

const actor: Actor = {
  id: "act_preview",
  campaignId: "camp_preview",
  systemId: "dnd-5e-srd",
  ownerUserId: "usr_player",
  type: "character",
  name: "Preview Fighter",
  data: {
    ruleset: "SRD 5.2.1",
    class: "Fighter",
    level: 1,
    attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: { current: 12, max: 12 },
    hitDice: { current: 1, max: 1, size: "d10" },
    conditions: [],
    homebrew: { untouched: true }
  },
  permissions: {},
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

describe("versioned D&D validation", () => {
  it("reports precise paths and versions without repairing or rejecting unknown fields", () => {
    const invalid = deepFreeze({
      ...actor,
      data: {
        ...actor.data,
        ruleset: "Homebrew 1",
        hp: { current: 15, max: 12 },
        mysterySubsystem: { mode: "keep-me" }
      }
    });
    const before = JSON.stringify(invalid);
    const report = validateDnd5eSrdActor(invalid);

    expect(report).toEqual(expect.objectContaining({
      entityKind: "actor",
      entityId: actor.id,
      rulesVersion: DND_5E_SRD_VERSION,
      schemaVersion: DND_5E_SRD_ACTOR_SCHEMA_VERSION,
      valid: false
    }));
    expect(report.issues).toContainEqual(expect.objectContaining({ path: "/data/hp/current", severity: "error", code: "rules.pool_above_maximum" }));
    expect(report.issues).toContainEqual(expect.objectContaining({ path: "/data/ruleset", severity: "warning", code: "rules.version_mismatch" }));
    expect(report.issues.some((entry) => entry.path.includes("mysterySubsystem"))).toBe(false);
    expect(JSON.stringify(invalid)).toBe(before);
  });

  it("validates known item fields but preserves homebrew item data", () => {
    const item: Item = deepFreeze({
      id: "itm_preview",
      campaignId: actor.campaignId,
      actorId: actor.id,
      systemId: actor.systemId,
      type: "weapon",
      name: "Odd Blade",
      data: { quantity: 1, equipped: true, damageType: "moonlight", homebrewRule: { keep: true } },
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt
    });
    const report = validateDnd5eSrdItem(item);
    expect(report).toEqual(expect.objectContaining({ schemaVersion: DND_5E_SRD_ITEM_SCHEMA_VERSION, valid: true }));
    expect(report.issues).toEqual([expect.objectContaining({ path: "/data/damageType", severity: "warning", code: "rules.homebrew_damage_type" })]);
    expect(item.data.homebrewRule).toEqual({ keep: true });
  });
});

describe("reversible D&D repair previews", () => {
  it("proposes only deterministic actor repairs and preserves every unknown field", () => {
    const { ruleset: _ruleset, ...dataWithoutRuleset } = actor.data;
    const invalid = deepFreeze({
      ...actor,
      data: {
        ...dataWithoutRuleset,
        hp: { current: 15, max: 12 },
        hitDice: { current: 3, max: 1, size: "d10" },
        mysterySubsystem: { mode: "keep-me", nested: [1, 2, 3] }
      }
    });
    const before = JSON.stringify(invalid);
    const first = previewDnd5eSrdActorRepairs(invalid);
    const second = previewDnd5eSrdActorRepairs(invalid);

    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({
      previewVersion: DND_5E_SRD_REPAIR_PREVIEW_VERSION,
      entityKind: "actor",
      status: "changes_available",
      readOnly: true,
      manualIssues: []
    }));
    expect(first.candidates.map((candidate) => candidate.path)).toEqual([
      "/data/hitDice/current",
      "/data/hp/current",
      "/data/ruleset"
    ]);
    expect(first.candidates).toContainEqual(expect.objectContaining({
      path: "/data/hp/current",
      operation: "replace",
      before: 15,
      after: 12,
      application: "confirmation_required",
      inverse: { operation: "replace", path: "/data/hp/current", before: 12, after: 15 }
    }));
    expect(first.candidates).toContainEqual(expect.objectContaining({
      path: "/data/ruleset",
      operation: "add",
      after: DND_5E_SRD_VERSION,
      inverse: { operation: "remove", path: "/data/ruleset", before: DND_5E_SRD_VERSION }
    }));
    expect(first.proposedEntity?.data).toEqual(expect.objectContaining({
      ruleset: DND_5E_SRD_VERSION,
      hp: { current: 12, max: 12 },
      hitDice: { current: 1, max: 1, size: "d10" },
      mysterySubsystem: { mode: "keep-me", nested: [1, 2, 3] }
    }));
    expect(JSON.stringify(invalid)).toBe(before);
  });

  it("repairs an always-prepared contradiction but leaves intent-sensitive values manual", () => {
    const item = deepFreeze({
      id: "itm_spell",
      campaignId: actor.campaignId,
      actorId: actor.id,
      systemId: actor.systemId,
      type: "spell",
      name: "Blessing",
      data: { prepared: false, alwaysPrepared: true, homebrewCasting: { keep: true } },
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt
    } satisfies Item);
    const preview = previewDnd5eSrdItemRepairs(item);
    expect(preview.candidates).toEqual([
      expect.objectContaining({ path: "/data/prepared", before: false, after: true })
    ]);
    expect(preview.proposedEntity?.data).toEqual({ prepared: true, alwaysPrepared: true, homebrewCasting: { keep: true } });
    expect(preview.manualIssues).toEqual([]);

    const ambiguous = deepFreeze({
      ...actor,
      data: { ...actor.data, ruleset: "Homebrew 1", attributes: { ...actor.data.attributes as Record<string, unknown>, strength: 31 } }
    });
    const ambiguousPreview = previewDnd5eSrdActorRepairs(ambiguous);
    expect(ambiguousPreview.status).toBe("no_changes");
    expect(ambiguousPreview.candidates).toEqual([]);
    expect(ambiguousPreview.manualIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/data/ruleset", code: "rules.version_mismatch" }),
      expect.objectContaining({ path: "/data/attributes/strength", code: "schema.maximum" })
    ]));
  });
});

describe("pure D&D rules previews", () => {
  it("returns a deterministic fixed advancement diff and declares rolled HP needs", () => {
    const input = deepFreeze({ operation: "advancement" as const, actor, hitPointMode: "fixed" as const, weaponMasteryChoices: ["longsword", "longbow", "maul"] });
    const first = previewDnd5eSrdRules(input);
    const second = previewDnd5eSrdRules(input);

    expect(first).toEqual(second);
    expect(first).toEqual(expect.objectContaining({
      previewVersion: DND_5E_SRD_RULES_PREVIEW_VERSION,
      status: "ready",
      serverRolls: []
    }));
    expect(first.proposedData).toEqual(expect.objectContaining({ level: 2, hp: { current: 20, max: 20 }, homebrew: { untouched: true } }));
    expect(first.changes).toContainEqual(expect.objectContaining({
      path: "/level",
      operation: "replace",
      before: 1,
      after: 2,
      source: { systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1", schemaVersion: "1.0.0", rule: "advancement" }
    }));
    expect(first.changes).toContainEqual(expect.objectContaining({ path: "/hp/current", operation: "replace", before: 12, after: 20 }));

    const rollNeeded = previewDnd5eSrdRules({ operation: "advancement", actor, hitPointMode: "roll", weaponMasteryChoices: ["longsword", "longbow", "maul"] });
    expect(rollNeeded.status).toBe("blocked");
    expect(rollNeeded.serverRolls).toEqual([{ id: "advancement.hit-points", path: "/hitPointRoll", formula: "1d10", reason: "Roll Fighter Hit Points on the server." }]);
    expect(rollNeeded.proposedData).toBeUndefined();

    const explicitPrimary = previewDnd5eSrdRules({ operation: "advancement", actor, hitPointMode: "fixed", className: "fighter", weaponMasteryChoices: ["longsword", "longbow", "maul"] });
    expect(explicitPrimary.status).toBe("ready");
    expect(explicitPrimary.proposedData?.level).toBe(2);
  });

  it("blocks a missing advancement choice and previews an explicit ASI", () => {
    const levelThree: Actor = {
      ...actor,
      data: {
        ...actor.data,
        level: 3,
        subclass: "Champion",
        subclasses: { Fighter: "champion" },
        hp: { current: 28, max: 28 },
        hitDice: { current: 3, max: 3, size: "d10" }
      }
    };
    const missing = previewDnd5eSrdRules({ operation: "advancement", actor: levelThree, hitPointMode: "fixed" });
    expect(missing.status).toBe("blocked");
    expect(missing.blockers).toContainEqual(expect.objectContaining({ path: "/featId", code: "rules.choice_required" }));
    expect(missing.blockers).toContainEqual(expect.objectContaining({ path: "/weaponMasteryChoices", code: "rules.choice_required" }));

    const chosen = previewDnd5eSrdRules({
      operation: "advancement",
      actor: levelThree,
      hitPointMode: "fixed",
      featId: "ability-score-improvement",
      abilityChoices: { strength: 2 },
      weaponMasteryChoices: ["longsword", "longbow", "maul", "rapier"]
    });
    expect(chosen.status).toBe("ready");
    expect(chosen.proposedData?.attributes).toEqual(expect.objectContaining({ strength: 18 }));
    expect(chosen.proposedData?.feats).toContain("ability-score-improvement");
  });

  it("declares Short Rest rolls and previews only explicit server results", () => {
    const wounded = deepFreeze({ ...actor, data: { ...actor.data, hp: { current: 3, max: 12 } } });
    const before = JSON.stringify(wounded);
    const rollNeeded = previewDnd5eSrdRules({ operation: "rest", actor: wounded, restType: "short", hitDice: [{}] });
    expect(rollNeeded.status).toBe("blocked");
    expect(rollNeeded.serverRolls).toEqual([{ id: "rest.hit-die.0", path: "/hitDice/0/roll", formula: "1d10", reason: "Roll the selected Fighter Hit Point Die on the server." }]);

    const preview = previewDnd5eSrdRules({ operation: "rest", actor: wounded, restType: "short", hitDice: [{ roll: 6 }] });
    expect(preview.status).toBe("ready");
    expect(preview.proposedData).toEqual(expect.objectContaining({ hp: { current: 11, max: 12 }, hitDice: { current: 0, max: 1, size: "d10" }, homebrew: { untouched: true } }));
    expect(preview.details?.recovered).toEqual(expect.objectContaining({ hp: 8, hitDiceSpent: 1 }));
    expect(JSON.stringify(wounded)).toBe(before);
  });

  it("previews one typed component with defenses and blocks manual or unresolved rolls", () => {
    const target = deepFreeze({ ...actor, data: { ...actor.data, hp: { current: 20, max: 20 }, temporaryHitPoints: 3, resistances: ["fire"] } });
    const request = { operation: "typed-damage" as const, actor: target, amount: 10, damageType: "fire" };
    const preview = previewDnd5eSrdRules(request);
    expect(preview).toEqual(previewDnd5eSrdRules(request));
    expect(preview.status).toBe("ready");
    expect(preview.details?.effects).toEqual([expect.objectContaining({ type: "damage", damageType: "fire", amount: 5, resistance: ["fire"] })]);
    expect(preview.proposedData).toEqual(expect.objectContaining({ hp: { current: 18, max: 20 }, temporaryHitPoints: 0 }));

    const multi = previewDnd5eSrdRules({ operation: "typed-damage", actor: target, amount: 10, damageType: ["fire", "cold"] });
    expect(multi.status).toBe("blocked");
    expect(multi.blockers).toContainEqual(expect.objectContaining({ path: "/damageType", code: "rules.manual_resolution_required" }));
    expect(multi.proposedData).toBeUndefined();

    const roll = previewDnd5eSrdRules({ operation: "typed-damage", actor: target, formula: "2d6", damageType: "fire" });
    expect(roll.status).toBe("blocked");
    expect(roll.serverRolls).toEqual([{ id: "damage.total", path: "/amount", formula: "2d6", reason: "Roll the damage total on the server before previewing its effects." }]);
  });

  it("applies two failed Death Saves when reviewed damage is a critical hit against a character at 0 HP", () => {
    const unconscious = deepFreeze({
      ...actor,
      data: {
        ...actor.data,
        hp: { current: 0, max: 12 },
        conditions: [{ id: "unconscious" }],
        deathSaves: { successes: 1, failures: 0 },
        lifeState: "unconscious"
      }
    });

    for (const damage of [
      { amount: 1, damageType: "slashing" },
      { components: [{ amount: 1, damageType: "slashing" }] }
    ]) {
      const preview = previewDnd5eSrdRules({ operation: "typed-damage", actor: unconscious, criticalHit: true, ...damage });
      expect(preview.status, JSON.stringify(preview.blockers)).toBe("ready");
      expect(preview.proposedData).toEqual(expect.objectContaining({
        hp: { current: 0, max: 12 },
        deathSaves: { successes: 1, failures: 2 },
        lifeState: "unconscious"
      }));
      expect(preview.details).toEqual(expect.objectContaining({ criticalHit: true }));
    }

    const ordinary = previewDnd5eSrdRules({ operation: "typed-damage", actor: unconscious, amount: 1, damageType: "slashing" });
    expect(ordinary.proposedData?.deathSaves).toEqual({ successes: 1, failures: 1 });
  });

  it("marks an unresolved concentration save as blocking while retaining the proposed diff", () => {
    const concentrating: Actor = {
      ...actor,
      data: {
        ...actor.data,
        hp: { current: 20, max: 20 },
        rulesEngine: { concentration: { rollId: "spell-bless", label: "Bless", sourceActorId: actor.id, targetActorIds: [] } }
      }
    };
    const preview = previewDnd5eSrdRules({ operation: "typed-damage", actor: concentrating, amount: 8, damageType: "slashing" });
    expect(preview.status).toBe("blocked");
    expect(preview.blockers).toContainEqual(expect.objectContaining({ code: "rules.save_required" }));
    expect(preview.proposedData).toEqual(expect.objectContaining({ hp: { current: 12, max: 20 } }));
  });

  it("bounds malformed runtime inputs as blockers instead of throwing", () => {
    const malformed = [
      { operation: "advancement", actor, hitPointMode: "fixed", className: 42 },
      { operation: "rest", actor, restType: "short", hitDice: { className: "Fighter" } },
      { operation: "typed-damage", actor, amount: 4, damageType: 42 },
      { operation: "typed-damage", actor, amount: 4, damageType: "fire", criticalHit: "yes" }
    ];
    for (const request of malformed) {
      const preview = previewDnd5eSrdRules(request as never);
      expect(preview.status).toBe("blocked");
      expect(preview.blockers).not.toEqual([]);
    }
  });
});
