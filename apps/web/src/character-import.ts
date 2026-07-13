export interface CharacterImportPayload {
  name: string;
  data: Record<string, unknown>;
  items?: unknown[];
  conditions?: unknown[];
}

export interface CharacterImportReview {
  payload: CharacterImportPayload;
  dataFieldCount: number;
  itemCount: number;
  conditionCount: number;
  ignoredFields: string[];
  unsupportedFields: string[];
  normalizedFields: string[];
}

const acceptedCharacterFields = new Set(["name", "data", "items", "conditions"]);
const acceptedWrapperFields = new Set(["actor", "items", "conditions"]);
const serverOwnedCharacterFields = new Set(["id", "campaignId", "systemId", "ownerUserId", "permissions", "createdAt", "updatedAt"]);
const unsafeFlattenedCharacterFields = new Set(["__proto__", "constructor", "prototype"]);

export function parseCharacterImportJson(input: string): CharacterImportReview {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new Error("Character JSON is not valid JSON.");
  }

  if (!isRecord(value)) throw new Error("Character JSON must contain one object.");
  const wrappedActor = value.actor;
  if (wrappedActor !== undefined && !isRecord(wrappedActor)) throw new Error("The actor field must be an object when provided.");
  const hasActorWrapper = isRecord(wrappedActor);
  const source = hasActorWrapper ? wrappedActor : value;
  const rawData = source.data;
  if (rawData !== undefined && !isRecord(rawData)) throw new Error("Character data must be an object.");

  const extraData = Object.fromEntries(Object.entries(source).filter(([key]) =>
    !acceptedCharacterFields.has(key)
    && !serverOwnedCharacterFields.has(key)
    && !unsafeFlattenedCharacterFields.has(key)
  ));
  const data = { ...extraData, ...(isRecord(rawData) ? rawData : {}) };
  const nameSource = source.name ?? data.name;
  if (typeof nameSource !== "string" || !nameSource.trim()) throw new Error("Character JSON needs a non-empty name.");

  const rawItems = value.items ?? source.items ?? data.items;
  if (rawItems !== undefined && !Array.isArray(rawItems)) throw new Error("Character items must be an array.");
  const rawConditions = value.conditions ?? source.conditions ?? data.conditions;
  if (rawConditions !== undefined && !Array.isArray(rawConditions)) throw new Error("Character conditions must be an array.");

  const payload: CharacterImportPayload = {
    name: nameSource.trim(),
    data: { ...data }
  };
  delete payload.data.name;
  delete payload.data.items;
  delete payload.data.conditions;
  if (rawItems) payload.items = rawItems;
  if (rawConditions) payload.conditions = rawConditions;

  const ignoredFields = Object.keys(source)
    .filter((key) => serverOwnedCharacterFields.has(key))
    .sort();
  const unsupportedFields = [
    ...Object.keys(source)
      .filter((key) => unsafeFlattenedCharacterFields.has(key))
      .map((key) => hasActorWrapper ? `actor.${key}` : key),
    ...(hasActorWrapper
      ? Object.keys(value)
          .filter((key) => !acceptedWrapperFields.has(key))
          .map((key) => `root.${key}`)
      : [])
  ].sort();

  return {
    payload,
    dataFieldCount: Object.keys(payload.data).length,
    itemCount: payload.items?.length ?? 0,
    conditionCount: payload.conditions?.length ?? 0,
    ignoredFields,
    unsupportedFields,
    normalizedFields: Object.keys(extraData).sort()
  };
}

export function characterImportHasDuplicateName(name: string, actorNames: string[]): boolean {
  const normalizedName = name.trim().toLocaleLowerCase();
  return actorNames.some((candidate) => candidate.trim().toLocaleLowerCase() === normalizedName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
