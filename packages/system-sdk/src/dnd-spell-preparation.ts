import type {
  Actor,
  Dnd5eSrdSpellPreparationBlocker,
  Dnd5eSrdSpellPreparationPlan,
  Dnd5eSrdSpellPreparationTiming,
  Item
} from "@open-tabletop/core";

interface SpellPreparationInput {
  selectedSpellIds: string[];
  timing: Dnd5eSrdSpellPreparationTiming;
}

interface SpellcastingClassRule {
  className: string;
  capacities: readonly number[];
  timing: Dnd5eSrdSpellPreparationTiming;
  replacementsPerChange: number | "any";
  maxSpellLevel: (classLevel: number) => number;
}

export type Dnd5eSrdSpellReplacementLimit = number | "any";

interface ActorSpellcastingClass {
  className: string;
  level: number;
  rule: SpellcastingClassRule;
}

interface SpellEligibility {
  item: Item;
  candidates: ActorSpellcastingClass[];
  assignedClass?: ActorSpellcastingClass;
  blocker?: Dnd5eSrdSpellPreparationBlocker;
}

const FULL_CASTER_CAPACITY = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22] as const;
const HALF_CASTER_CAPACITY = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15] as const;
const WARLOCK_CAPACITY = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15] as const;
const SORCERER_CAPACITY = [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22] as const;
const WIZARD_CAPACITY = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25] as const;

const fullCasterSpellLevel = (level: number): number => Math.min(9, Math.ceil(level / 2));
const halfCasterSpellLevel = (level: number): number => Math.min(5, Math.ceil(level / 4));
const pactSpellLevel = (level: number): number => Math.min(5, Math.ceil(level / 2));

/** Fixed D&D 5.5e prepared-spell progressions, indexed by class level 1-20. */
export const DND_5E_SRD_PREPARED_SPELL_CAPACITY: Readonly<Record<string, readonly number[]>> = Object.freeze({
  Bard: FULL_CASTER_CAPACITY,
  Cleric: FULL_CASTER_CAPACITY,
  Druid: FULL_CASTER_CAPACITY,
  Paladin: HALF_CASTER_CAPACITY,
  Ranger: HALF_CASTER_CAPACITY,
  Sorcerer: SORCERER_CAPACITY,
  Warlock: WARLOCK_CAPACITY,
  Wizard: WIZARD_CAPACITY
});

const CLASS_RULES: Record<string, SpellcastingClassRule> = {
  bard: { className: "Bard", capacities: FULL_CASTER_CAPACITY, timing: "class-level", replacementsPerChange: 1, maxSpellLevel: fullCasterSpellLevel },
  cleric: { className: "Cleric", capacities: FULL_CASTER_CAPACITY, timing: "long-rest", replacementsPerChange: "any", maxSpellLevel: fullCasterSpellLevel },
  druid: { className: "Druid", capacities: FULL_CASTER_CAPACITY, timing: "long-rest", replacementsPerChange: "any", maxSpellLevel: fullCasterSpellLevel },
  paladin: { className: "Paladin", capacities: HALF_CASTER_CAPACITY, timing: "long-rest", replacementsPerChange: 1, maxSpellLevel: halfCasterSpellLevel },
  ranger: { className: "Ranger", capacities: HALF_CASTER_CAPACITY, timing: "long-rest", replacementsPerChange: 1, maxSpellLevel: halfCasterSpellLevel },
  sorcerer: { className: "Sorcerer", capacities: SORCERER_CAPACITY, timing: "class-level", replacementsPerChange: 1, maxSpellLevel: fullCasterSpellLevel },
  warlock: { className: "Warlock", capacities: WARLOCK_CAPACITY, timing: "class-level", replacementsPerChange: 1, maxSpellLevel: pactSpellLevel },
  wizard: { className: "Wizard", capacities: WIZARD_CAPACITY, timing: "long-rest", replacementsPerChange: "any", maxSpellLevel: fullCasterSpellLevel }
};

/** Shared replacement rule used by both level-up and rest preparation previews. */
export function dnd5eSrdSpellReplacementLimit(className: string): Dnd5eSrdSpellReplacementLimit | undefined {
  return CLASS_RULES[className.trim().toLocaleLowerCase()]?.replacementsPerChange;
}

/**
 * Counts replacements after allowing additions that merely fill newly opened
 * capacity. Removing an old spell and adding another is one replacement, not
 * two independent changes.
 */
export function dnd5eSrdSpellReplacementCount(
  currentSpellIds: readonly string[],
  selectedSpellIds: readonly string[],
  selectedCapacity: number
): number {
  const current = new Set(currentSpellIds);
  const selected = new Set(selectedSpellIds);
  const additions = [...selected].filter((spellId) => !current.has(spellId)).length;
  const removals = [...current].filter((spellId) => !selected.has(spellId)).length;
  const freeAdditions = Math.max(0, selectedCapacity - current.size);
  return Math.max(Math.max(0, additions - freeAdditions), removals);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const integer = nonNegativeInteger(value);
  return integer !== undefined && integer > 0 ? integer : undefined;
}

function compendiumEntryId(item: Item): string | undefined {
  return normalizedString(item.data.compendiumId)
    ?? normalizedString(item.data.compendiumEntryId)
    ?? normalizedString(item.data.customContentId);
}

function classSources(item: Item): Record<string, unknown>[] {
  if (!Array.isArray(item.data.spellSources)) return [];
  return item.data.spellSources.filter((source): source is Record<string, unknown> =>
    source !== null && typeof source === "object" && !Array.isArray(source) && source.kind === "class"
  );
}

function sourceForClass(item: Item, className: string): Record<string, unknown> | undefined {
  return classSources(item).find((source) => normalizedString(source.className)?.toLocaleLowerCase() === className.toLocaleLowerCase());
}

function actorSpellcastingClasses(actor: Actor): ActorSpellcastingClass[] {
  const byClass = new Map<string, { className: string; level: number }>();
  const append = (classNameValue: unknown, levelValue: unknown): void => {
    const className = normalizedString(classNameValue);
    const level = positiveInteger(levelValue);
    const rule = className ? CLASS_RULES[className.toLocaleLowerCase()] : undefined;
    if (!className || !level || !rule) return;
    const key = rule.className.toLocaleLowerCase();
    const previous = byClass.get(key);
    byClass.set(key, { className: rule.className, level: (previous?.level ?? 0) + level });
  };

  if (Array.isArray(actor.data.classes)) {
    for (const entry of actor.data.classes) {
      const record = recordValue(entry);
      append(record.className ?? record.class, record.level);
    }
  }

  const spellcasting = recordValue(actor.data.spellcasting);
  if (byClass.size === 0 && Array.isArray(spellcasting.classes)) {
    for (const entry of spellcasting.classes) {
      const record = recordValue(entry);
      append(record.className ?? record.class, record.level);
    }
  }

  if (byClass.size === 0) {
    append(actor.data.class ?? spellcasting.className, actor.data.level ?? spellcasting.classLevel);
  }

  return [...byClass.values()]
    .map(({ className, level }) => ({ className, level: Math.min(20, level), rule: CLASS_RULES[className.toLocaleLowerCase()]! }))
    .sort((left, right) => left.className.localeCompare(right.className));
}

function spellbookIds(actor: Actor): Set<string> {
  const spellcasting = recordValue(actor.data.spellcasting);
  const values = Array.isArray(spellcasting.spellbookSpells)
    ? spellcasting.spellbookSpells
    : Array.isArray(actor.data.spellbookSpells)
      ? actor.data.spellbookSpells
      : [];
  return new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0));
}

function storedCapacity(
  spellcasting: Record<string, unknown>,
  actorClasses: ActorSpellcastingClass[],
  actorClass: ActorSpellcastingClass
): number | undefined {
  const byClass = recordValue(spellcasting.preparedSpellCapacityByClass);
  const byClassEntry = Object.entries(byClass).find(([key]) => key.toLocaleLowerCase() === actorClass.className.toLocaleLowerCase())?.[1];
  if (typeof byClassEntry === "number") return nonNegativeInteger(byClassEntry);
  const byClassRecord = recordValue(byClassEntry);
  const byClassLevel = nonNegativeInteger(byClassRecord.level ?? byClassRecord.classLevel);
  const byClassLimit = nonNegativeInteger(byClassRecord.limit ?? byClassRecord.capacity);
  if (byClassLimit !== undefined && (byClassLevel === undefined || byClassLevel === actorClass.level)) return byClassLimit;

  if (actorClasses.length === 1) {
    const limit = nonNegativeInteger(spellcasting.preparedSpellCapacity);
    const level = nonNegativeInteger(spellcasting.preparedSpellCapacityLevel);
    if (limit !== undefined && (level === undefined || level === actorClass.level)) return limit;
  }
  return undefined;
}

function addBlocker(
  blockers: Dnd5eSrdSpellPreparationBlocker[],
  blocker: Dnd5eSrdSpellPreparationBlocker
): void {
  if (blockers.some((candidate) => candidate.code === blocker.code && candidate.itemId === blocker.itemId && candidate.message === blocker.message)) return;
  blockers.push(blocker);
}

function candidateClasses(
  item: Item,
  actorClasses: ActorSpellcastingClass[],
  wizardBook: Set<string>
): { candidates: ActorSpellcastingClass[]; failure?: Dnd5eSrdSpellPreparationBlocker } {
  const entryId = compendiumEntryId(item);
  if (!entryId || item.data.classSpell !== true || classSources(item).length === 0) {
    return {
      candidates: [],
      failure: {
        code: "class_spell_unverified",
        itemId: item.id,
        message: `${item.name} does not have complete matching class-spell provenance. Review this legacy or unvalidated homebrew spell manually.`
      }
    };
  }

  const spellLevel = nonNegativeInteger(item.data.level);
  if (spellLevel === undefined || spellLevel < 1) {
    return {
      candidates: [],
      failure: { code: "class_spell_unverified", itemId: item.id, message: `${item.name} does not have a valid level 1+ spell level.` }
    };
  }

  const matching = actorClasses.filter((actorClass) => {
    const source = sourceForClass(item, actorClass.className);
    if (!source) return false;
    const selectedAtLevel = nonNegativeInteger(source.selectedAtLevel);
    if (selectedAtLevel !== undefined && selectedAtLevel > actorClass.level) return false;
    if (spellLevel > actorClass.rule.maxSpellLevel(actorClass.level)) return false;
    if (actorClass.className === "Wizard" && (item.data.inSpellbook !== true || !wizardBook.has(entryId))) return false;
    return true;
  });

  if (matching.length > 0) return { candidates: matching };

  const wizardSource = sourceForClass(item, "Wizard");
  if (wizardSource && actorClasses.some((actorClass) => actorClass.className === "Wizard") && (item.data.inSpellbook !== true || !wizardBook.has(entryId))) {
    return {
      candidates: [],
      failure: { code: "wizard_spellbook_unverified", itemId: item.id, message: `${item.name} is not proven to be in this Wizard's stored spellbook.` }
    };
  }
  return {
    candidates: [],
    failure: {
      code: "spell_level_unavailable",
      itemId: item.id,
      message: `${item.name} is not available at the stored level of any matching spellcasting class.`
    }
  };
}

function assignSpellClass(item: Item, candidates: ActorSpellcastingClass[]): ActorSpellcastingClass | undefined {
  const explicitClass = normalizedString(item.data.preparedForClass) ?? normalizedString(item.data.spellcastingClass);
  if (explicitClass) return candidates.find((candidate) => candidate.className.toLocaleLowerCase() === explicitClass.toLocaleLowerCase());
  return candidates.length === 1 ? candidates[0] : undefined;
}

function eligibilityForSpell(
  item: Item,
  actorClasses: ActorSpellcastingClass[],
  wizardBook: Set<string>
): SpellEligibility {
  const result = candidateClasses(item, actorClasses, wizardBook);
  if (result.candidates.length === 0) return { item, candidates: [], ...(result.failure ? { blocker: result.failure } : {}) };
  const assignedClass = assignSpellClass(item, result.candidates);
  if (!assignedClass) {
    return {
      item,
      candidates: result.candidates,
      blocker: {
        code: "class_source_ambiguous",
        itemId: item.id,
        message: `${item.name} is available from multiple stored classes. Set preparedForClass to the class whose prepared-spell capacity it uses.`
      }
    };
  }
  return { item, candidates: result.candidates, assignedClass };
}

/** True when Wizard Ritual Adept can cast this actor-owned spell without preparing it. */
export function dnd5eSrdWizardRitualSpellAvailable(actor: Actor, item: Item): boolean {
  if (
    actor.systemId !== "dnd-5e-srd" ||
    actor.type.toLocaleLowerCase() !== "character" ||
    item.type !== "spell" ||
    item.actorId !== actor.id ||
    item.campaignId !== actor.campaignId ||
    item.systemId !== actor.systemId ||
    item.data.ritual !== true ||
    item.data.inSpellbook !== true
  ) return false;
  const wizard = actorSpellcastingClasses(actor).find((actorClass) => actorClass.className === "Wizard");
  const entryId = compendiumEntryId(item);
  const spellLevel = nonNegativeInteger(item.data.level);
  return Boolean(
    wizard &&
    entryId &&
    spellbookIds(actor).has(entryId) &&
    spellLevel !== undefined &&
    spellLevel >= 1 &&
    spellLevel <= wizard.rule.maxSpellLevel(wizard.level) &&
    sourceForClass(item, "Wizard")
  );
}

/**
 * Builds a side-effect-free D&D 5.5e spell-preparation plan from server-owned
 * actor and item state. Supported class capacity, spell-level access, Wizard
 * spellbooks, multiclass allocation, change timing, and one-spell replacement
 * limits are enforced from stored provenance; genuinely ambiguous legacy or
 * unvalidated custom content fails closed for GM review.
 */
export function previewDnd5eSrdSpellPreparation(
  actor: Actor,
  items: Item[],
  input: SpellPreparationInput
): Dnd5eSrdSpellPreparationPlan {
  const blockers: Dnd5eSrdSpellPreparationBlocker[] = [];
  const warnings: string[] = [];
  const selectedSpellIds = [...input.selectedSpellIds];
  const uniqueSelectedIds = [...new Set(selectedSpellIds)];

  if (uniqueSelectedIds.length !== selectedSpellIds.length) {
    addBlocker(blockers, { code: "duplicate_selection", message: "Each prepared spell may be selected only once." });
  }

  if (actor.systemId !== "dnd-5e-srd" || actor.type.toLocaleLowerCase() !== "character") {
    addBlocker(blockers, {
      code: "unsupported_actor",
      message: "Rules-aware spell preparation is available only for D&D 5.5e SRD character actors."
    });
  }

  const actorClasses = actorSpellcastingClasses(actor);
  if (actorClasses.length === 0) {
    addBlocker(blockers, {
      code: "manual_legacy_spellcasting",
      message: "This character does not have a supported stored spellcasting class. Prepare spells manually after a GM rules review."
    });
  }

  const spellcasting = recordValue(actor.data.spellcasting);
  const wizardBook = spellbookIds(actor);
  const ownedSpells = items.filter((item) =>
    item.actorId === actor.id &&
    item.campaignId === actor.campaignId &&
    item.systemId === actor.systemId &&
    item.type === "spell"
  );
  const ownedSpellById = new Map(ownedSpells.map((item) => [item.id, item]));
  const alwaysPrepared = ownedSpells.filter((item) => item.data.alwaysPrepared === true);
  const alwaysPreparedSpellIds = alwaysPrepared.map((item) => item.id).sort();
  const ritualCastableSpellIds = ownedSpells.filter((item) => dnd5eSrdWizardRitualSpellAvailable(actor, item)).map((item) => item.id).sort();
  const eligibility = new Map(ownedSpells
    .filter((item) => item.data.alwaysPrepared !== true && item.data.cantrip !== true && nonNegativeInteger(item.data.level) !== 0)
    .map((item) => [item.id, eligibilityForSpell(item, actorClasses, wizardBook)]));

  for (const itemId of uniqueSelectedIds) {
    const item = ownedSpellById.get(itemId);
    if (!item) {
      addBlocker(blockers, { code: "spell_not_owned", itemId, message: "The selected spell is not an actor-owned D&D spell." });
      continue;
    }
    if (item.data.alwaysPrepared === true || item.data.cantrip === true || nonNegativeInteger(item.data.level) === 0) {
      addBlocker(blockers, {
        code: "always_prepared_excluded",
        itemId,
        message: `${item.name} is always available and does not count against prepared-spell capacity.`
      });
      continue;
    }
    const entry = eligibility.get(itemId);
    if (entry?.blocker) addBlocker(blockers, entry.blocker);
  }

  for (const item of ownedSpells) {
    if (item.data.prepared === true && item.data.alwaysPrepared !== true && item.data.cantrip !== true) {
      const entry = eligibility.get(item.id);
      if (entry?.blocker) addBlocker(blockers, entry.blocker);
    }
  }

  const eligibleSpellIds = [...eligibility.values()]
    .filter((entry) => entry.assignedClass)
    .map((entry) => entry.item.id)
    .sort();
  const eligibleSelectedIds = uniqueSelectedIds.filter((itemId) => eligibility.get(itemId)?.assignedClass);
  const selectedSet = new Set(eligibleSelectedIds);
  const changes = [...eligibility.values()]
    .filter((entry): entry is SpellEligibility & { assignedClass: ActorSpellcastingClass } => Boolean(entry.assignedClass))
    .flatMap((entry) => {
      const fromPrepared = entry.item.data.prepared === true;
      const toPrepared = selectedSet.has(entry.item.id);
      const entryId = compendiumEntryId(entry.item);
      return fromPrepared === toPrepared || !entryId
        ? []
        : [{ itemId: entry.item.id, name: entry.item.name, compendiumEntryId: entryId, fromPrepared, toPrepared }];
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.itemId.localeCompare(right.itemId));

  const perClassCapacity = actorClasses.map((actorClass) => {
    const stored = storedCapacity(spellcasting, actorClasses, actorClass);
    const limit = stored ?? actorClass.rule.capacities[actorClass.level - 1]!;
    const selected = eligibleSelectedIds.filter((itemId) => eligibility.get(itemId)?.assignedClass?.className === actorClass.className).length;
    return { actorClass, limit, selected, stored: stored !== undefined };
  });

  for (const capacity of perClassCapacity) {
    if (capacity.selected > capacity.limit) {
      addBlocker(blockers, {
        code: "capacity_exceeded",
        message: `${capacity.actorClass.className} can prepare ${capacity.limit} normal spells at class level ${capacity.actorClass.level}; ${capacity.selected} are selected for that class.`
      });
    }
  }

  const changedClasses = new Set<string>();
  for (const change of changes) {
    const className = eligibility.get(change.itemId)?.assignedClass?.className;
    if (className) changedClasses.add(className);
  }
  for (const className of changedClasses) {
    const actorClass = actorClasses.find((candidate) => candidate.className === className)!;
    if (input.timing !== actorClass.rule.timing) {
      addBlocker(blockers, {
        code: "timing_mismatch",
        message: actorClass.rule.timing === "long-rest"
          ? `${className} can make this prepared-spell change when finishing a Long Rest.`
          : `${className} can make this prepared-spell change when gaining a ${className} level.`
      });
    }

    if (actorClass.rule.replacementsPerChange !== "any") {
      const capacity = perClassCapacity.find((candidate) => candidate.actorClass.className === className)!;
      const currentSpellIds = [...eligibility.values()]
        .filter((entry) => entry.assignedClass?.className === className && entry.item.data.prepared === true)
        .map((entry) => entry.item.id);
      const selectedSpellIds = eligibleSelectedIds.filter((itemId) => eligibility.get(itemId)?.assignedClass?.className === className);
      const replacements = dnd5eSrdSpellReplacementCount(currentSpellIds, selectedSpellIds, capacity.limit);
      if (replacements > actorClass.rule.replacementsPerChange) {
        addBlocker(blockers, {
          code: "change_limit_exceeded",
          message: `${className} can replace only one prepared spell at this ${actorClass.rule.timing === "long-rest" ? "Long Rest" : "class level"}; this plan replaces ${replacements}.`
        });
      }
    }
  }

  const requiredTimings = [...new Set(
    actorClasses
      .filter((actorClass) => changedClasses.size === 0 || changedClasses.has(actorClass.className))
      .map((actorClass) => actorClass.rule.timing)
  )];
  if (blockers.length === 0 && changes.length === 0) warnings.push("The selected preparation already matches stored spell state.");

  const totalLimit = perClassCapacity.reduce((sum, capacity) => sum + capacity.limit, 0);
  const totalSelected = perClassCapacity.reduce((sum, capacity) => sum + capacity.selected, 0);
  const primaryClass = actorClasses.find((actorClass) => actorClass.className.toLocaleLowerCase() === normalizedString(actor.data.class)?.toLocaleLowerCase()) ?? actorClasses[0];
  const capacitySource = perClassCapacity.every((capacity) => capacity.stored)
    ? "stored" as const
    : actorClasses.every((actorClass) => actorClass.level === 1)
      ? "level-one-class" as const
      : "class-progression" as const;

  return {
    status: blockers.length === 0 ? "ready" : "blocked",
    actorId: actor.id,
    ...(primaryClass ? { className: primaryClass.className } : {}),
    timing: input.timing,
    ...(requiredTimings.length === 1 ? { requiredTiming: requiredTimings[0] } : {}),
    ...(actorClasses.length > 0 ? {
      capacity: {
        className: primaryClass?.className ?? actorClasses.map((actorClass) => actorClass.className).join("/"),
        limit: totalLimit,
        selected: totalSelected,
        alwaysPrepared: alwaysPrepared.length,
        source: capacitySource,
        classes: perClassCapacity.map((capacity) => ({
          className: capacity.actorClass.className,
          limit: capacity.limit,
          selected: capacity.selected
        }))
      }
    } : {}),
    selectedSpellIds: eligibleSelectedIds.sort(),
    eligibleSpellIds,
    alwaysPreparedSpellIds,
    ritualCastableSpellIds,
    changes,
    blockers,
    warnings
  };
}
