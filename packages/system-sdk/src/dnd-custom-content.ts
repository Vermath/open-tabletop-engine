import type { CompendiumCatalogEntry, ContentImportLicense } from "@open-tabletop/core";

import { DND_5E_SRD_SYSTEM_ID, DND_5E_SRD_VERSION } from "./index.js";

export const DND_CUSTOM_CONTENT_KINDS = [
  "monster",
  "spell",
  "item",
  "feat",
  "species",
  "background",
  "class",
  "subclass",
  "condition"
] as const;

export type DndCustomContentKind = (typeof DND_CUSTOM_CONTENT_KINDS)[number];

/** Actor-data registries consumed by the D&D advancement engine. */
export const DND_CUSTOM_CLASSES_DATA_KEY = "dnd5eCustomClasses";
export const DND_CUSTOM_SUBCLASSES_DATA_KEY = "dnd5eCustomSubclasses";

export interface DndCustomContentDraft {
  id: string;
  kind: DndCustomContentKind;
  name: string;
  summary: string;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  license: ContentImportLicense;
  data: Record<string, unknown>;
}

export interface DndCustomContentIssue {
  path: string;
  code: string;
  message: string;
}

export type DndCustomContentBuildResult =
  | { ok: true; entry: CompendiumCatalogEntry; warnings: DndCustomContentIssue[] }
  | { ok: false; errors: DndCustomContentIssue[]; warnings: DndCustomContentIssue[] };

/**
 * Attaches reviewed class/subclass catalog entries to an actor rules record.
 * Keeping the full entry preserves user provenance and makes advancement
 * deterministic without treating unrelated campaign content as a class.
 */
export function dataWithDndCustomAdvancementContent(
  data: Record<string, unknown>,
  entries: CompendiumCatalogEntry[],
): Record<string, unknown> {
  const classes = entries.filter(isDndCustomAdvancementEntry("class"));
  const subclasses = entries.filter(isDndCustomAdvancementEntry("subclass"));
  return {
    ...structuredClone(data),
    ...(classes.length > 0 ? { [DND_CUSTOM_CLASSES_DATA_KEY]: structuredClone(classes) } : {}),
    ...(subclasses.length > 0 ? { [DND_CUSTOM_SUBCLASSES_DATA_KEY]: structuredClone(subclasses) } : {}),
  };
}

function isDndCustomAdvancementEntry(kind: "class" | "subclass") {
  return (entry: CompendiumCatalogEntry): boolean =>
    entry.type === kind
    && entry.data.customContentKind === kind
    && entry.data.builderSchemaVersion === "1.0.0"
    && entry.provenance.sourceKind === "user"
    && entry.provenance.systemId === DND_5E_SRD_SYSTEM_ID;
}

const abilityIds = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const spellSchools = new Set(["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"]);
const sizes = new Set(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
const featCategories = new Set(["origin", "general", "fighting-style", "epic-boon"]);
const itemCategories = new Set(["weapon", "armor", "adventuring-gear", "tool", "consumable", "treasure"]);

export function buildDndCustomContent(draft: DndCustomContentDraft): DndCustomContentBuildResult {
  const errors: DndCustomContentIssue[] = [];
  const warnings: DndCustomContentIssue[] = [];
  const id = boundedText(draft.id, "id", 160, errors);
  const name = boundedText(draft.name, "name", 120, errors);
  const summary = boundedText(draft.summary, "summary", 600, errors);
  const sourceName = boundedText(draft.sourceName, "sourceName", 160, errors);
  const sourceVersion = boundedText(draft.sourceVersion, "sourceVersion", 64, errors);
  const contentVersion = boundedText(draft.contentVersion, "contentVersion", 64, errors);
  const license = validateCustomLicense(draft.license, errors);

  if (!DND_CUSTOM_CONTENT_KINDS.includes(draft.kind)) {
    errors.push({ path: "kind", code: "unsupported_kind", message: "Choose a supported D&D custom content builder." });
  }

  const data = validateKindData(draft.kind, draft.data, errors, warnings);
  if (errors.length > 0 || !id || !name || !summary || !sourceName || !sourceVersion || !contentVersion || !license) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    entry: {
      id,
      type: draft.kind,
      name,
      summary,
      data: { ...data, summary, customContentKind: draft.kind, builderSchemaVersion: "1.0.0" },
      provenance: {
        sourceKind: "user",
        sourceName,
        sourceVersion,
        contentVersion,
        systemId: DND_5E_SRD_SYSTEM_ID,
        systemVersion: "5.2.1",
        rulesVersion: DND_5E_SRD_VERSION,
        license
      }
    }
  };
}

function validateCustomLicense(value: ContentImportLicense, errors: DndCustomContentIssue[]): ContentImportLicense | undefined {
  if (!value || typeof value !== "object") {
    errors.push({ path: "license", code: "required", message: "Custom content requires an explicit license or private-use declaration." });
    return undefined;
  }
  if (value.usage === "srd") {
    errors.push({ path: "license.usage", code: "reserved_usage", message: "The SRD label is reserved for bundled, verified SRD content." });
  } else if (value.usage !== "open" && value.usage !== "user_provided" && value.usage !== "private_home_game") {
    errors.push({ path: "license.usage", code: "invalid_usage", message: "Choose open, user-provided, or private home-game usage." });
  }
  const name = boundedText(value.name, "license.name", 160, errors);
  const url = optionalUrl(value.url, "license.url", errors);
  const attribution = optionalText(value.attribution, "license.attribution", 500, errors);
  if (!name || value.usage === "srd" || !["open", "user_provided", "private_home_game"].includes(value.usage)) return undefined;
  return { name, usage: value.usage, ...(url ? { url } : {}), ...(attribution ? { attribution } : {}) };
}

function validateKindData(
  kind: DndCustomContentKind,
  value: Record<string, unknown>,
  errors: DndCustomContentIssue[],
  warnings: DndCustomContentIssue[]
): Record<string, unknown> {
  const data = record(value);
  switch (kind) {
    case "monster":
      return validateMonster(data, errors, warnings);
    case "spell":
      return validateSpell(data, errors, warnings);
    case "item":
      return validateItem(data, errors, warnings);
    case "feat":
      return validateFeat(data, errors, warnings);
    case "species":
      return validateSpecies(data, errors, warnings);
    case "background":
      return validateBackground(data, errors, warnings);
    case "class":
      return validateClass(data, errors, warnings);
    case "subclass":
      return validateSubclass(data, errors, warnings);
    case "condition":
      return validateCondition(data, errors, warnings);
    default:
      return {};
  }
}

function validateClass(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const hitDie = enumText(data.hitDie, "data.hitDie", new Set(["d6", "d8", "d10", "d12"]), errors);
  const primaryAbilities = enumList(data.primaryAbilities, "data.primaryAbilities", new Set(abilityIds), 3, errors);
  if (primaryAbilities.length === 0) errors.push({ path: "data.primaryAbilities", code: "minimum_items", message: "A class must define at least one primary ability." });
  const savingThrows = enumList(data.savingThrows, "data.savingThrows", new Set(abilityIds), 2, errors);
  if (savingThrows.length !== 2) errors.push({ path: "data.savingThrows", code: "exact_count", message: "A class must grant exactly two saving throw proficiencies." });
  const skillProficiencies = textList(data.skillProficiencies, "data.skillProficiencies", 30, 80, errors);
  const skillChoiceCount = integer(data.skillChoiceCount, "data.skillChoiceCount", 0, 30, errors);
  if (skillChoiceCount !== undefined && skillChoiceCount > skillProficiencies.length) {
    errors.push({ path: "data.skillChoiceCount", code: "choice_count", message: "Skill choices cannot exceed the available skill proficiency list." });
  }
  const features = levelFeatures(data.features, "data.features", errors);
  if (features.length === 0) warnings.push({ path: "data.features", code: "manual_only", message: "A class without structured features will advance hit points and proficiency only." });
  const featLevels = integerList(data.featLevels ?? [4, 8, 12, 16, 19], "data.featLevels", 1, 20, 20, errors);
  const subclassSelectionLevel = integer(data.subclassSelectionLevel ?? 3, "data.subclassSelectionLevel", 1, 20, errors);
  const multiclassPrerequisites = abilityRequirements(data.multiclassPrerequisites, "data.multiclassPrerequisites", errors);
  if (multiclassPrerequisites.length === 0) warnings.push({ path: "data.multiclassPrerequisites", code: "manual_multiclass", message: "Multiclassing into or out of this class remains unavailable until prerequisites are authored." });
  return {
    description,
    hitDie,
    primaryAbilities,
    savingThrows,
    skillProficiencies,
    skillChoiceCount,
    features,
    featLevels,
    subclassSelectionLevel,
    multiclassPrerequisiteMode: optionalEnum(data.multiclassPrerequisiteMode, "data.multiclassPrerequisiteMode", new Set(["all", "any"]), errors) ?? "all",
    multiclassPrerequisites,
    spellcastingProgression: optionalEnum(data.spellcastingProgression, "data.spellcastingProgression", new Set(["none", "full", "half", "third", "pact"]), errors) ?? "none",
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateMonster(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const size = enumText(data.size, "data.size", sizes, errors);
  const creatureType = boundedText(data.creatureType, "data.creatureType", 80, errors);
  const armorClass = integer(data.armorClass, "data.armorClass", 1, 40, errors);
  const hitPoints = integer(data.hitPoints, "data.hitPoints", 1, 1_000_000, errors);
  const hitDice = boundedText(data.hitDice, "data.hitDice", 80, errors);
  const challengeRating = boundedText(data.challengeRating, "data.challengeRating", 16, errors);
  const proficiencyBonus = integer(data.proficiencyBonus, "data.proficiencyBonus", 2, 9, errors);
  const speed = movement(data.speed, "data.speed", errors);
  const abilities = abilityScores(data.abilities, "data.abilities", errors);
  const actions = monsterActions(data.actions, "data.actions", errors);
  if (actions.length === 0) warnings.push({ path: "data.actions", code: "manual_only", message: "A monster without actions can still be used, but all offense remains manual." });
  return {
    size,
    creatureType,
    alignment: optionalText(data.alignment, "data.alignment", 80, errors),
    armorClass,
    initiative: optionalInteger(data.initiative, "data.initiative", -20, 30, errors),
    hitPoints,
    hitDice,
    challengeRating,
    xp: optionalInteger(data.xp, "data.xp", 0, 100_000_000, errors),
    proficiencyBonus,
    speed,
    abilities,
    actions,
    savingThrows: numericMap(data.savingThrows, "data.savingThrows", -20, 30, errors),
    skills: numericMap(data.skills, "data.skills", -20, 30, errors),
    senses: textList(data.senses, "data.senses", 12, 120, errors),
    languages: textList(data.languages, "data.languages", 12, 80, errors),
    gear: textList(data.gear, "data.gear", 40, 160, errors),
    traits: namedDescriptions(data.traits, "data.traits", 0, errors),
    reactions: namedDescriptions(data.reactions, "data.reactions", 0, errors),
    legendaryActions: namedDescriptions(data.legendaryActions, "data.legendaryActions", 0, errors),
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function monsterActions(value: unknown, path: string, errors: DndCustomContentIssue[]): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, code: "invalid_list", message: `${path} must be a list.` });
    return [];
  }
  if (value.length > 100) errors.push({ path, code: "too_many", message: `${path} must contain at most 100 entries.` });
  return value.slice(0, 100).flatMap((item, index) => {
    const entry = record(item);
    const name = boundedText(entry.name, `${path}.${index}.name`, 120, errors);
    const description = boundedText(entry.description ?? entry.summary, `${path}.${index}.description`, 4_000, errors);
    const kind = optionalEnum(entry.kind, `${path}.${index}.kind`, new Set(["action", "bonusAction", "reaction"]), errors);
    const attackBonus = optionalInteger(entry.attackBonus, `${path}.${index}.attackBonus`, -20, 40, errors);
    const range = optionalText(entry.range, `${path}.${index}.range`, 160, errors);
    const damageFormula = optionalFormula(entry.damageFormula, `${path}.${index}.damageFormula`, errors);
    const damageType = optionalText(entry.damageType, `${path}.${index}.damageType`, 80, errors);
    const saveInput = record(entry.save);
    const saveAbility = optionalAbility(saveInput.ability, `${path}.${index}.save.ability`, errors);
    const saveDc = optionalInteger(saveInput.dc, `${path}.${index}.save.dc`, 1, 40, errors);
    if ((saveAbility && saveDc === undefined) || (!saveAbility && saveDc !== undefined)) {
      errors.push({ path: `${path}.${index}.save`, code: "incomplete_save", message: "A monster action save requires both an ability and DC." });
    }
    const saveSuccess = optionalText(saveInput.success, `${path}.${index}.save.success`, 160, errors);
    const condition = optionalText(entry.condition, `${path}.${index}.condition`, 160, errors);
    const effects = textList(entry.effects, `${path}.${index}.effects`, 20, 500, errors);
    const recharge = optionalText(entry.recharge, `${path}.${index}.recharge`, 80, errors);
    if (!name || !description) return [];
    return [{
      name,
      description,
      ...(kind ? { kind } : {}),
      ...(attackBonus !== undefined ? { attackBonus } : {}),
      ...(range ? { range } : {}),
      ...(damageFormula ? { damageFormula } : {}),
      ...(damageType ? { damageType } : {}),
      ...(saveAbility && saveDc !== undefined ? { save: { ability: saveAbility, dc: saveDc, ...(saveSuccess ? { success: saveSuccess } : {}) } } : {}),
      ...(condition ? { condition } : {}),
      ...(effects.length > 0 ? { effects } : {}),
      ...(recharge ? { recharge } : {}),
    }];
  });
}

function validateSpell(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const level = integer(data.level, "data.level", 0, 9, errors);
  const school = enumText(data.school, "data.school", spellSchools, errors);
  const castingTime = boundedText(data.castingTime, "data.castingTime", 120, errors);
  const range = boundedText(data.range, "data.range", 120, errors);
  const duration = boundedText(data.duration, "data.duration", 120, errors);
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const classes = textList(data.classes, "data.classes", 20, 80, errors);
  const components = record(data.components);
  const verbal = booleanValue(components.verbal, "data.components.verbal", errors);
  const somatic = booleanValue(components.somatic, "data.components.somatic", errors);
  const material = optionalText(components.material, "data.components.material", 500, errors);
  if (!verbal && !somatic && !material) warnings.push({ path: "data.components", code: "no_components", message: "This spell has no components; verify that is intentional." });
  return {
    level,
    school,
    castingTime,
    range,
    duration,
    description,
    classes,
    ritual: booleanValue(data.ritual, "data.ritual", errors),
    concentration: booleanValue(data.concentration, "data.concentration", errors),
    components: { verbal, somatic, ...(material ? { material } : {}) },
    higherLevels: optionalText(data.higherLevels, "data.higherLevels", 4_000, errors),
    damageFormula: optionalFormula(data.damageFormula, "data.damageFormula", errors),
    saveAbility: optionalAbility(data.saveAbility, "data.saveAbility", errors),
    attackType: optionalEnum(data.attackType, "data.attackType", new Set(["melee", "ranged"]), errors),
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateItem(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const category = enumText(data.category, "data.category", itemCategories, errors);
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const costGp = number(data.costGp, "data.costGp", 0, 1_000_000_000, errors);
  const weightLb = number(data.weightLb, "data.weightLb", 0, 1_000_000, errors);
  const properties = textList(data.properties, "data.properties", 30, 80, errors);
  if (category === "weapon" && !optionalFormula(data.damageFormula, "data.damageFormula", errors)) {
    warnings.push({ path: "data.damageFormula", code: "manual_damage", message: "Weapon damage is not automated until a valid dice formula is provided." });
  }
  return {
    category,
    description,
    costGp,
    weightLb,
    properties,
    rarity: optionalText(data.rarity, "data.rarity", 80, errors),
    requiresAttunement: booleanValue(data.requiresAttunement, "data.requiresAttunement", errors),
    consumable: booleanValue(data.consumable, "data.consumable", errors),
    ammunitionType: optionalText(data.ammunitionType, "data.ammunitionType", 80, errors),
    armorClass: optionalInteger(data.armorClass, "data.armorClass", 1, 30, errors),
    damageFormula: optionalFormula(data.damageFormula, "data.damageFormula", errors),
    damageType: optionalText(data.damageType, "data.damageType", 40, errors),
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateFeat(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const category = enumText(data.category, "data.category", featCategories, errors);
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const benefits = namedDescriptions(data.benefits, "data.benefits", 1, errors);
  if (benefits.length === 0) warnings.push({ path: "data.benefits", code: "manual_only", message: "No structured benefit is available; the feat remains descriptive only." });
  return {
    category,
    description,
    prerequisites: textList(data.prerequisites, "data.prerequisites", 20, 160, errors),
    repeatable: booleanValue(data.repeatable, "data.repeatable", errors),
    benefits,
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateSpecies(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const sizeOptions = enumList(data.sizeOptions, "data.sizeOptions", sizes, 4, errors);
  const speed = movement(data.speed, "data.speed", errors);
  const traits = namedDescriptions(data.traits, "data.traits", 1, errors);
  if (traits.length === 0) warnings.push({ path: "data.traits", code: "no_traits", message: "A species should normally define at least one trait." });
  return {
    description,
    creatureType: optionalText(data.creatureType, "data.creatureType", 80, errors) ?? "Humanoid",
    sizeOptions,
    speed,
    traits,
    languages: textList(data.languages, "data.languages", 12, 80, errors),
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateBackground(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const abilityScoreOptions = enumList(data.abilityScoreOptions, "data.abilityScoreOptions", new Set(abilityIds), 3, errors);
  if (abilityScoreOptions.length !== 3) errors.push({ path: "data.abilityScoreOptions", code: "exact_count", message: "A D&D 5.5e background must offer exactly three ability scores." });
  const skillProficiencies = textList(data.skillProficiencies, "data.skillProficiencies", 2, 80, errors);
  if (skillProficiencies.length !== 2) errors.push({ path: "data.skillProficiencies", code: "exact_count", message: "A D&D 5.5e background must grant exactly two skill proficiencies." });
  const originFeat = boundedText(data.originFeat, "data.originFeat", 120, errors);
  return {
    description,
    abilityScoreOptions,
    skillProficiencies,
    originFeat,
    toolProficiency: optionalText(data.toolProficiency, "data.toolProficiency", 120, errors),
    startingEquipment: textList(data.startingEquipment, "data.startingEquipment", 40, 160, errors),
    startingGp: optionalNumber(data.startingGp, "data.startingGp", 0, 1_000_000, errors),
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateSubclass(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const parentClass = boundedText(data.parentClass, "data.parentClass", 80, errors);
  const selectionLevel = integer(data.selectionLevel, "data.selectionLevel", 1, 20, errors);
  const features = levelFeatures(data.features, "data.features", errors);
  if (!features.some((feature) => feature.level === selectionLevel)) {
    warnings.push({ path: "data.features", code: "missing_selection_feature", message: "No feature is granted at the subclass selection level." });
  }
  return {
    description,
    parentClass,
    selectionLevel,
    features,
    spellcastingProgression: optionalEnum(data.spellcastingProgression, "data.spellcastingProgression", new Set(["none", "full", "half", "third", "pact"]), errors) ?? "none",
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function validateCondition(data: Record<string, unknown>, errors: DndCustomContentIssue[], warnings: DndCustomContentIssue[]): Record<string, unknown> {
  const description = boundedText(data.description, "data.description", 8_000, errors);
  const effects = namedDescriptions(data.effects, "data.effects", 0, errors);
  if (effects.length === 0) warnings.push({ path: "data.effects", code: "manual_only", message: "This condition has no structured effects and will be adjudicated manually." });
  return {
    description,
    effects,
    stacking: optionalEnum(data.stacking, "data.stacking", new Set(["replace", "refresh", "stack", "manual"]), errors) ?? "manual",
    defaultDuration: optionalText(data.defaultDuration, "data.defaultDuration", 120, errors),
    endSaveAbility: optionalAbility(data.endSaveAbility, "data.endSaveAbility", errors),
    manualAdjudication: optionalText(data.manualAdjudication, "data.manualAdjudication", 2_000, errors)
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedText(value: unknown, path: string, max: number, errors: DndCustomContentIssue[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push({ path, code: "required", message: `${path} is required.` });
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > max) errors.push({ path, code: "too_long", message: `${path} must be ${max} characters or fewer.` });
  return normalized.slice(0, max);
}

function optionalText(value: unknown, path: string, max: number, errors: DndCustomContentIssue[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    errors.push({ path, code: "invalid_text", message: `${path} must be text.` });
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > max) errors.push({ path, code: "too_long", message: `${path} must be ${max} characters or fewer.` });
  return normalized.slice(0, max) || undefined;
}

function optionalUrl(value: unknown, path: string, errors: DndCustomContentIssue[]): string | undefined {
  const text = optionalText(value, path, 2_000, errors);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    errors.push({ path, code: "invalid_url", message: `${path} must be an HTTP or HTTPS URL.` });
  }
  return text;
}

function number(value: unknown, path: string, min: number, max: number, errors: DndCustomContentIssue[]): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    errors.push({ path, code: "out_of_range", message: `${path} must be a number from ${min} to ${max}.` });
    return undefined;
  }
  return value;
}

function optionalNumber(value: unknown, path: string, min: number, max: number, errors: DndCustomContentIssue[]): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return number(value, path, min, max, errors);
}

function integer(value: unknown, path: string, min: number, max: number, errors: DndCustomContentIssue[]): number | undefined {
  const parsed = number(value, path, min, max, errors);
  if (parsed !== undefined && !Number.isInteger(parsed)) errors.push({ path, code: "integer_required", message: `${path} must be a whole number.` });
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function optionalInteger(value: unknown, path: string, min: number, max: number, errors: DndCustomContentIssue[]): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return integer(value, path, min, max, errors);
}

function booleanValue(value: unknown, path: string, errors: DndCustomContentIssue[]): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") errors.push({ path, code: "invalid_boolean", message: `${path} must be true or false.` });
  return value === true;
}

function enumText(value: unknown, path: string, allowed: Set<string>, errors: DndCustomContentIssue[]): string | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!allowed.has(normalized)) errors.push({ path, code: "invalid_choice", message: `${path} must be one of: ${[...allowed].join(", ")}.` });
  return allowed.has(normalized) ? normalized : undefined;
}

function optionalEnum(value: unknown, path: string, allowed: Set<string>, errors: DndCustomContentIssue[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return enumText(value, path, allowed, errors);
}

function enumList(value: unknown, path: string, allowed: Set<string>, max: number, errors: DndCustomContentIssue[]): string[] {
  const values = textList(value, path, max, 80, errors).map((item) => item.toLowerCase());
  for (const item of values) if (!allowed.has(item)) errors.push({ path, code: "invalid_choice", message: `${item} is not a supported ${path} choice.` });
  return [...new Set(values.filter((item) => allowed.has(item)))];
}

function textList(value: unknown, path: string, maxItems: number, maxLength: number, errors: DndCustomContentIssue[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, code: "invalid_list", message: `${path} must be a list.` });
    return [];
  }
  if (value.length > maxItems) errors.push({ path, code: "too_many", message: `${path} must contain at most ${maxItems} entries.` });
  const result: string[] = [];
  for (const [index, item] of value.slice(0, maxItems).entries()) {
    const normalized = boundedText(item, `${path}.${index}`, maxLength, errors);
    if (normalized && !result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function integerList(value: unknown, path: string, min: number, max: number, maxItems: number, errors: DndCustomContentIssue[]): number[] {
  if (!Array.isArray(value)) {
    errors.push({ path, code: "invalid_list", message: `${path} must be a list.` });
    return [];
  }
  if (value.length > maxItems) errors.push({ path, code: "too_many", message: `${path} must contain at most ${maxItems} entries.` });
  const values = value.slice(0, maxItems).flatMap((item, index) => {
    const parsed = integer(item, `${path}.${index}`, min, max, errors);
    return parsed === undefined ? [] : [parsed];
  });
  return [...new Set(values)].sort((left, right) => left - right);
}

function namedDescriptions(value: unknown, path: string, minimum: number, errors: DndCustomContentIssue[]): Array<{ name: string; description: string }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, code: "invalid_list", message: `${path} must be a list.` });
    return [];
  }
  if (value.length > 100) errors.push({ path, code: "too_many", message: `${path} must contain at most 100 entries.` });
  const result = value.slice(0, 100).flatMap((item, index) => {
    const entry = record(item);
    const name = boundedText(entry.name, `${path}.${index}.name`, 120, errors);
    const description = boundedText(entry.description, `${path}.${index}.description`, 4_000, errors);
    return name && description ? [{ name, description }] : [];
  });
  if (result.length < minimum) errors.push({ path, code: "minimum_items", message: `${path} must contain at least ${minimum} entry.` });
  return result;
}

function abilityRequirements(value: unknown, path: string, errors: DndCustomContentIssue[]): Array<{ ability: string; minimum: number }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({ path, code: "invalid_list", message: `${path} must be a list.` });
    return [];
  }
  if (value.length > abilityIds.length) errors.push({ path, code: "too_many", message: `${path} must contain at most ${abilityIds.length} entries.` });
  const result = value.slice(0, abilityIds.length).flatMap((item, index) => {
    const entry = record(item);
    const ability = enumText(entry.ability, `${path}.${index}.ability`, new Set(abilityIds), errors);
    const minimum = integer(entry.minimum, `${path}.${index}.minimum`, 1, 30, errors);
    return ability && minimum !== undefined ? [{ ability, minimum }] : [];
  });
  return [...new Map(result.map((entry) => [entry.ability, entry])).values()];
}

function levelFeatures(value: unknown, path: string, errors: DndCustomContentIssue[]): Array<{ level: number; name: string; description: string }> {
  if (!Array.isArray(value)) {
    errors.push({ path, code: "invalid_list", message: `${path} must be a list.` });
    return [];
  }
  if (value.length > 100) errors.push({ path, code: "too_many", message: `${path} must contain at most 100 entries.` });
  return value.slice(0, 100).flatMap((item, index) => {
    const entry = record(item);
    const level = integer(entry.level, `${path}.${index}.level`, 1, 20, errors);
    const name = boundedText(entry.name, `${path}.${index}.name`, 120, errors);
    const description = boundedText(entry.description, `${path}.${index}.description`, 4_000, errors);
    return level && name && description ? [{ level, name, description }] : [];
  }).sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
}

function numericMap(value: unknown, path: string, min: number, max: number, errors: DndCustomContentIssue[]): Record<string, number> {
  const input = record(value);
  const result: Record<string, number> = {};
  if (Object.keys(input).length > 40) errors.push({ path, code: "too_many", message: `${path} must contain at most 40 entries.` });
  for (const [key, raw] of Object.entries(input).slice(0, 40)) {
    const normalized = optionalNumber(raw, `${path}.${key}`, min, max, errors);
    if (normalized !== undefined) result[key.slice(0, 80)] = normalized;
  }
  return result;
}

function movement(value: unknown, path: string, errors: DndCustomContentIssue[]): Record<string, number> {
  const input = record(value);
  const result: Record<string, number> = {};
  for (const key of ["walk", "burrow", "climb", "fly", "swim"]) {
    const speed = optionalInteger(input[key], `${path}.${key}`, 0, 1_000, errors);
    if (speed !== undefined) result[key] = speed;
  }
  if (result.walk === undefined) errors.push({ path: `${path}.walk`, code: "required", message: `${path}.walk is required.` });
  return result;
}

function abilityScores(value: unknown, path: string, errors: DndCustomContentIssue[]): Record<string, number> {
  const input = record(value);
  return Object.fromEntries(abilityIds.map((ability) => [ability, integer(input[ability], `${path}.${ability}`, 1, 30, errors) ?? 10]));
}

function optionalAbility(value: unknown, path: string, errors: DndCustomContentIssue[]): string | undefined {
  return optionalEnum(value, path, new Set(abilityIds), errors);
}

function optionalFormula(value: unknown, path: string, errors: DndCustomContentIssue[]): string | undefined {
  const formula = optionalText(value, path, 160, errors);
  if (!formula) return undefined;
  if (!/^[0-9dD+\-*/() @._a-zA-Z]+$/.test(formula)) errors.push({ path, code: "invalid_formula", message: `${path} contains unsupported formula characters.` });
  return formula;
}
