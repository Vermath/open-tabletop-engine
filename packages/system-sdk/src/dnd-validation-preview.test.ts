import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  DND_5E_SRD_ACTOR_SCHEMA_VERSION,
  DND_5E_SRD_ITEM_SCHEMA_VERSION,
  DND_5E_SRD_REPAIR_PREVIEW_VERSION,
  DND_5E_SRD_RULES_PREVIEW_VERSION,
  DND_5E_SRD_VERSION,
  dnd5eSrdManagedDataRecord,
  dnd5eSrdCompendium,
  formatDnd5eSrdManagedDataError,
  parseDnd5eSrdActorManagedData,
  parseDnd5eSrdItemManagedData,
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

describe("typed managed D&D subroot views", () => {
  it("migrates a legacy flat actor into a deterministic current view without dropping homebrew fields", () => {
    const legacy = deepFreeze({
      ...actor,
      data: {
        ...actor.data,
        classes: [{ class: "Fighter", level: 1, homebrewProgression: "keep" }],
        temporaryHitPoints: { current: 3, source: "ancestral ward" },
        resources: { secondWind: { current: 1, max: 1, recovery: "short" }, homebrewClock: { segments: 6 } },
        mysterySubsystem: { mode: "keep-me" }
      }
    });

    const first = parseDnd5eSrdActorManagedData(legacy);
    const second = parseDnd5eSrdActorManagedData(legacy);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(formatDnd5eSrdManagedDataError(first));
    expect(first.value).toEqual(expect.objectContaining({
      source: expect.objectContaining({ sourceSchemaVersion: "legacy-unversioned", schemaVersion: DND_5E_SRD_ACTOR_SCHEMA_VERSION }),
      migration: { from: "legacy-unversioned", to: DND_5E_SRD_ACTOR_SCHEMA_VERSION, lossless: true }
    }));
    expect(first.value.data.classes).toEqual([{ class: "Fighter", level: 1, homebrewProgression: "keep" }]);
    expect(first.value.data.mysterySubsystem).toEqual({ mode: "keep-me" });
    expect(dnd5eSrdManagedDataRecord(first.value)).toEqual(legacy.data);
    expect(dnd5eSrdManagedDataRecord(first.value)).not.toBe(legacy.data);
  });

  it("returns sourced structural errors while preserving valid custom item values", () => {
    const malformed = deepFreeze({
      ...actor,
      data: { hp: { current: "many", max: 12 }, resources: { rage: { current: 3, max: 2 } }, homebrew: { untouched: true } }
    });
    const actorResult = parseDnd5eSrdActorManagedData(malformed as unknown as Actor);
    expect(actorResult.ok).toBe(false);
    if (actorResult.ok) throw new Error("Expected malformed managed actor data to fail");
    expect(actorResult.source).toEqual(expect.objectContaining({ entityKind: "actor", entityId: actor.id, rulesVersion: DND_5E_SRD_VERSION }));
    expect(actorResult.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/data/hp/current", code: "schema.integer" }),
      expect.objectContaining({ path: "/data/resources/rage/current", code: "rules.pool_above_maximum" })
    ]));
    expect(formatDnd5eSrdManagedDataError(actorResult)).toContain("/data/hp/current (schema.integer)");

    const customItem = deepFreeze({
      id: "itm_homebrew",
      campaignId: actor.campaignId,
      actorId: actor.id,
      systemId: actor.systemId,
      type: "weapon",
      name: "Moon Blade",
      data: { quantity: 1, mastery: "orbit", damageType: "moonlight", homebrewRule: { preserved: true } },
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt
    } satisfies Item);
    const itemResult = parseDnd5eSrdItemManagedData(customItem);
    expect(itemResult.ok).toBe(true);
    if (!itemResult.ok) throw new Error(formatDnd5eSrdManagedDataError(itemResult));
    expect(itemResult.value.data.homebrewRule).toEqual({ preserved: true });
    expect(itemResult.value.warnings).toContainEqual(expect.objectContaining({ code: "rules.homebrew_damage_type" }));
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

  it("requires complete spell choices for every supported spellcasting advancement", () => {
    const castingClasses = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"] as const;
    for (const className of castingClasses) {
      const caster: Actor = {
        ...actor,
        id: `act_preview_required_${className.toLowerCase()}`,
        data: { ...actor.data, class: className, level: 1 }
      };
      const preview = previewDnd5eSrdRules({
        operation: "advancement",
        actor: caster,
        hitPointMode: "fixed",
        ...(["Paladin", "Ranger"].includes(className) ? { weaponMasteryChoices: ["longsword", "shortsword"] } : {})
      });
      expect(preview.status, className).toBe("blocked");
      expect(preview.blockers, className).toContainEqual(expect.objectContaining({
        path: "/classPreparedSpellChoices",
        code: "rules.choice_required"
      }));
      if (className === "Wizard") {
        expect(preview.blockers).toContainEqual(expect.objectContaining({ path: "/wizardSpellbookAdditions", code: "rules.choice_required" }));
      }
      expect(preview.proposedData).toBeUndefined();
    }
  });

  it("requires six spellbook spells and four prepared spells on a first Wizard level, including multiclass entry", () => {
    const wizardSpellIds = dnd5eSrdCompendium().flatMap((entry) => {
      const classes = Array.isArray(entry.data.classes) ? entry.data.classes : [];
      return entry.type === "spell" && entry.data.level === 1 && classes.some((value) => typeof value === "string" && value.toLowerCase() === "wizard") ? [entry.id] : [];
    });
    const fighter: Actor = {
      ...actor,
      id: "act_preview_fighter_wizard",
      data: {
        ...actor.data,
        attributes: { ...(actor.data.attributes as Record<string, unknown>), intelligence: 14 }
      }
    };
    const selectedSpellbook = wizardSpellIds.slice(0, 6);
    const preview = previewDnd5eSrdRules({
      operation: "advancement",
      actor: fighter,
      className: "Wizard",
      hitPointMode: "fixed",
      wizardSpellbookAdditions: selectedSpellbook,
      classPreparedSpellChoices: selectedSpellbook.slice(0, 4)
    });

    expect(preview.status, JSON.stringify(preview.blockers)).toBe("ready");
    expect(preview.details?.spellAdvancement).toEqual(expect.objectContaining({
      className: "Wizard",
      classLevel: 1,
      preparedSpellCapacity: 4,
      wizardSpellbookAdditions: selectedSpellbook,
      resultingSpellbookSpellIds: selectedSpellbook
    }));
    expect(preview.proposedData).toEqual(expect.objectContaining({
      level: 2,
      classes: expect.arrayContaining([
        expect.objectContaining({ className: "Fighter", level: 1 }),
        expect.objectContaining({ className: "Wizard", level: 1 })
      ]),
      spellcasting: expect.objectContaining({
        spellbookSpells: selectedSpellbook,
        preparedSpellsByClass: expect.objectContaining({ Wizard: selectedSpellbook.slice(0, 4) })
      })
    }));

    const shortSpellbook = previewDnd5eSrdRules({
      operation: "advancement",
      actor: fighter,
      className: "Wizard",
      hitPointMode: "fixed",
      wizardSpellbookAdditions: selectedSpellbook.slice(0, 2),
      classPreparedSpellChoices: selectedSpellbook.slice(0, 4)
    });
    expect(shortSpellbook.status).toBe("blocked");
    expect(shortSpellbook.blockers).toContainEqual(expect.objectContaining({ path: "/wizardSpellbookAdditions", code: "rules.invalid_count" }));
  });

  it("allows capacity growth plus one known-spell replacement but blocks wholesale Bard, Sorcerer, and Warlock replacement", () => {
    const capacities = {
      Bard: { current: 4, next: 5 },
      Sorcerer: { current: 2, next: 4 },
      Warlock: { current: 2, next: 3 }
    } as const;

    for (const [className, capacity] of Object.entries(capacities) as Array<[keyof typeof capacities, typeof capacities[keyof typeof capacities]]>) {
      const classSpellIds = dnd5eSrdCompendium().flatMap((entry) => {
        const classes = Array.isArray(entry.data.classes) ? entry.data.classes : [];
        return entry.type === "spell" && entry.data.level === 1 && classes.some((value) => typeof value === "string" && value.toLowerCase() === className.toLowerCase()) ? [entry.id] : [];
      });
      const currentSpellIds = classSpellIds.slice(0, capacity.current);
      const newSpellIds = classSpellIds.slice(capacity.current);
      const growth = capacity.next - capacity.current;
      const allowedSpellIds = [...currentSpellIds.slice(1), ...newSpellIds.slice(0, growth + 1)];
      const wholesaleSpellIds = newSpellIds.slice(0, capacity.next);
      const caster: Actor = {
        ...actor,
        id: `act_preview_replacement_${className.toLowerCase()}`,
        data: {
          ...actor.data,
          class: className,
          level: 1,
          spellcasting: { className, preparedSpells: currentSpellIds }
        }
      };

      const allowed = previewDnd5eSrdRules({
        operation: "advancement",
        actor: caster,
        hitPointMode: "fixed",
        classPreparedSpellChoices: allowedSpellIds
      });
      expect(allowed.status, `${className}: ${JSON.stringify(allowed.blockers)}`).toBe("ready");

      const wholesale = previewDnd5eSrdRules({
        operation: "advancement",
        actor: caster,
        hitPointMode: "fixed",
        classPreparedSpellChoices: wholesaleSpellIds
      });
      expect(wholesale.status, className).toBe("blocked");
      expect(wholesale.blockers, className).toContainEqual(expect.objectContaining({
        path: "/classPreparedSpellChoices",
        code: "rules.spell_replacement_limit"
      }));
    }
  });

  it("reviews canonical Wizard spellbook learning and complete prepared lists at each level", () => {
    const wizard: Actor = {
      ...actor,
      id: "act_preview_wizard",
      name: "Preview Wizard",
      data: {
        ...actor.data,
        class: "Wizard",
        level: 1,
        attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
        hp: { current: 8, max: 8 },
        hitDice: { current: 1, max: 1, size: "d6" },
        spellcasting: {
          className: "Wizard",
          preparedSpellCapacity: 4,
          preparedSpellCapacityLevel: 1,
          preparedSpells: ["burning-hands", "detect-magic", "magic-missile", "shield"],
          spellbookSpells: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield"],
          changeTiming: "long-rest"
        }
      }
    };
    const levelTwo = previewDnd5eSrdRules({
      operation: "advancement",
      actor: wizard,
      hitPointMode: "fixed",
      wizardSpellbookAdditions: ["disguise-self", "find-familiar"],
      classPreparedSpellChoices: ["alarm", "burning-hands", "charm-person", "magic-missile", "shield"],
      serverAlwaysPreparedSpellIds: ["detect-magic"]
    });

    expect(levelTwo.status, JSON.stringify(levelTwo.blockers)).toBe("ready");
    expect(levelTwo.proposedData?.spellcasting).toEqual(expect.objectContaining({
      preparedSpellCapacity: 5,
      preparedSpellCapacityLevel: 2,
      preparedSpells: ["alarm", "burning-hands", "charm-person", "magic-missile", "shield"],
      spellbookSpells: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield", "disguise-self", "find-familiar"]
    }));
    expect(levelTwo.details?.spellAdvancement).toEqual(expect.objectContaining({
      className: "Wizard",
      classLevel: 2,
      maxSpellLevel: 1,
      preparedSpellCapacity: 5,
      wizardSpellbookAdditions: ["disguise-self", "find-familiar"]
    }));

    const levelThreeActor: Actor = { ...wizard, data: levelTwo.proposedData! };
    const levelThree = previewDnd5eSrdRules({
      operation: "advancement",
      actor: levelThreeActor,
      hitPointMode: "fixed",
      subclassId: "evoker",
      wizardSpellbookAdditions: ["scorching-ray", "web"],
      classPreparedSpellChoices: ["burning-hands", "magic-missile", "shield", "disguise-self", "scorching-ray", "web"],
      serverAlwaysPreparedSpellIds: ["detect-magic"]
    });
    expect(levelThree.status, JSON.stringify(levelThree.blockers)).toBe("ready");
    expect(levelThree.proposedData?.spellcasting).toEqual(expect.objectContaining({ preparedSpellCapacity: 6, preparedSpellCapacityLevel: 3 }));
    expect((levelThree.details?.spellAdvancement as Record<string, unknown>).maxSpellLevel).toBe(2);

    const forged = previewDnd5eSrdRules({
      operation: "advancement",
      actor: wizard,
      hitPointMode: "fixed",
      wizardSpellbookAdditions: ["alarm", "web"],
      classPreparedSpellChoices: ["detect-magic", "guiding-bolt", "alarm", "alarm", "shield"],
      serverAlwaysPreparedSpellIds: ["detect-magic"]
    });
    expect(forged.status).toBe("blocked");
    expect(forged.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/wizardSpellbookAdditions/0", code: "rules.spell_already_known" }),
      expect.objectContaining({ path: "/wizardSpellbookAdditions/1", code: "rules.spell_level_unavailable" }),
      expect.objectContaining({ path: "/classPreparedSpellChoices", code: "rules.duplicate_spell" }),
      expect.objectContaining({ path: "/classPreparedSpellChoices/0", code: "rules.always_prepared_excluded" }),
      expect.objectContaining({ path: "/classPreparedSpellChoices/1", code: "rules.outside_class_list" })
    ]));
    expect(forged.proposedData).toBeUndefined();
  });

  it("fills a Cleric's reviewed class preparation capacity from canonical accessible spells", () => {
    const cleric: Actor = {
      ...actor,
      id: "act_preview_cleric",
      name: "Preview Cleric",
      data: {
        ...actor.data,
        class: "Cleric",
        level: 1,
        attributes: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 },
        hp: { current: 10, max: 10 },
        hitDice: { current: 1, max: 1, size: "d8" },
        spellcasting: { className: "Cleric", preparedSpellCapacity: 4, preparedSpellCapacityLevel: 1, preparedSpells: ["bless", "command", "cure-wounds", "healing-word"], changeTiming: "long-rest" }
      }
    };
    const preview = previewDnd5eSrdRules({
      operation: "advancement",
      actor: cleric,
      hitPointMode: "fixed",
      classPreparedSpellChoices: ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt"]
    });
    expect(preview.status, JSON.stringify(preview.blockers)).toBe("ready");
    expect(preview.proposedData?.spellcasting).toEqual(expect.objectContaining({ preparedSpellCapacity: 5, preparedSpellCapacityLevel: 2, preparedSpells: ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt"] }));
    expect(preview.details?.spellAdvancement).toEqual(expect.objectContaining({ className: "Cleric", materializedSpellIds: ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt"] }));
  });

  it("validates attributed spell advancement for every SRD spellcasting class", () => {
    const abilities = {
      Bard: "charisma",
      Cleric: "wisdom",
      Druid: "wisdom",
      Paladin: "charisma",
      Ranger: "wisdom",
      Sorcerer: "charisma",
      Warlock: "charisma",
      Wizard: "intelligence"
    } as const;
    const capacities = { Bard: 5, Cleric: 5, Druid: 5, Paladin: 3, Ranger: 3, Sorcerer: 4, Warlock: 3, Wizard: 5 } as const;
    const spells = dnd5eSrdCompendium().filter((entry) => entry.type === "spell" && entry.data.level === 1);

    for (const [className, ability] of Object.entries(abilities) as Array<[keyof typeof abilities, typeof abilities[keyof typeof abilities]]>) {
      const classSpells = spells.filter((entry) => Array.isArray(entry.data.classes) && entry.data.classes.some((candidate) => typeof candidate === "string" && candidate.toLowerCase() === className.toLowerCase()));
      expect(classSpells.length, className).toBeGreaterThanOrEqual(className === "Wizard" ? 8 : capacities[className]);
      const existingBook = className === "Wizard" ? classSpells.slice(0, 6).map((entry) => entry.id) : [];
      const additions = className === "Wizard" ? classSpells.slice(6, 8).map((entry) => entry.id) : undefined;
      const available = className === "Wizard" ? [...existingBook, ...additions!] : classSpells.map((entry) => entry.id);
      const prepared = available.slice(0, capacities[className]);
      const caster: Actor = {
        ...actor,
        id: `act_preview_${className.toLowerCase()}`,
        name: `Preview ${className}`,
        data: {
          ...actor.data,
          class: className,
          level: 1,
          spellcasting: { className, spellbookSpells: existingBook, preparedSpells: prepared.slice(0, Math.max(0, prepared.length - 1)) }
        }
      };
      const preview = previewDnd5eSrdRules({
        operation: "advancement",
        actor: caster,
        hitPointMode: "fixed",
        classPreparedSpellChoices: prepared,
        ...(["Paladin", "Ranger"].includes(className) ? { weaponMasteryChoices: ["longsword", "shortsword"] } : {}),
        ...(additions ? { wizardSpellbookAdditions: additions } : {})
      });
      expect(preview.status, `${className}: ${JSON.stringify(preview.blockers)}`).toBe("ready");
      expect(preview.details?.spellAdvancement).toEqual(expect.objectContaining({
        className,
        classLevel: 2,
        spellcastingAbility: ability,
        preparedSpellCapacity: capacities[className]
      }));
      const plan = preview.details!.spellAdvancement as { spellGrants: Array<{ itemData: Record<string, unknown> }> };
      expect(plan.spellGrants.length, className).toBe(className === "Wizard" ? 8 : capacities[className]);
      expect(plan.spellGrants).toEqual(expect.arrayContaining([
        expect.objectContaining({ itemData: expect.objectContaining({ spellcastingClass: className, spellcastingAbility: ability, preparedForClass: className }) })
      ]));
    }
  });

  it("keeps multiclass prepared lists and casting abilities partitioned by granting class", () => {
    const wizardSpells = dnd5eSrdCompendium().filter((entry) => entry.type === "spell" && entry.data.level === 1 && Array.isArray(entry.data.classes) && entry.data.classes.includes("wizard"));
    const existingBook = wizardSpells.slice(0, 6).map((entry) => entry.id);
    const additions = wizardSpells.slice(6, 8).map((entry) => entry.id);
    const multiclass: Actor = {
      ...actor,
      id: "act_preview_multiclass_spells",
      data: {
        ...actor.data,
        class: "Bard",
        level: 2,
        attributes: { strength: 10, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 10, charisma: 16 },
        classes: [{ className: "Bard", level: 1 }, { className: "Wizard", level: 1 }],
        spellcasting: {
          preparedSpellsByClass: { Bard: ["healing-word"] },
          spellcastingAbilityByClass: { Bard: "charisma" },
          spellbookSpells: existingBook
        }
      }
    };
    const preview = previewDnd5eSrdRules({
      operation: "advancement",
      actor: multiclass,
      className: "Wizard",
      hitPointMode: "fixed",
      wizardSpellbookAdditions: additions,
      classPreparedSpellChoices: [...existingBook, ...additions].slice(0, 5)
    });
    expect(preview.status, JSON.stringify(preview.blockers)).toBe("ready");
    expect(preview.proposedData?.spellcasting).toEqual(expect.objectContaining({
      preparedSpellsByClass: expect.objectContaining({ Bard: ["healing-word"], Wizard: [...existingBook, ...additions].slice(0, 5) }),
      spellcastingAbilityByClass: expect.objectContaining({ Bard: "charisma", Wizard: "intelligence" }),
      preparedSpellCapacityByClass: expect.objectContaining({ Wizard: { classLevel: 2, capacity: 5 } })
    }));
    expect((preview.proposedData?.spellcasting as Record<string, unknown>).preparedSpells).toBeUndefined();
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
