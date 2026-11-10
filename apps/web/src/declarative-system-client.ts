import type { Actor, ChatMessage, DeclarativeActionRequest, DeclarativeActorSheet, DeclarativeQuickRoll, DeclarativeResourceCost, DeclarativeScalarSchema, DiceRoll } from "@open-tabletop/core";
import { apiPatch, apiPost } from "./api.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

export type DeclarativeFieldInput = string | boolean;
export type DeclarativeFieldInputs = Record<string, DeclarativeFieldInput>;
export const declarativeFieldKey = (path: readonly string[]): string => JSON.stringify(path);

export function parseDeclarativeScalar(schema: DeclarativeScalarSchema, input: DeclarativeFieldInput): string | number | boolean {
  let value: string | number | boolean;
  if (schema.type === "boolean") {
    if (typeof input !== "boolean") throw new Error("Choose a boolean value.");
    value = input;
  } else if (schema.type === "string") {
    if (typeof input !== "string" || input.length > schema.maxLength) throw new Error(`Enter text of at most ${schema.maxLength} characters.`);
    value = input;
  } else {
    if (typeof input !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input.trim())) throw new Error("Enter a finite number.");
    value = Number(input);
    if (!Number.isFinite(value) || (schema.type === "integer" && !Number.isSafeInteger(value))) throw new Error(`Enter a finite ${schema.type}.`);
    if (value < schema.minimum || value > schema.maximum) throw new Error(`Enter a value from ${schema.minimum} to ${schema.maximum}.`);
  }
  if (schema.enum && !(schema.enum as readonly unknown[]).includes(value)) throw new Error("Choose one of the declared values.");
  return value;
}

function scalarContainer(data: Record<string, unknown>, path: readonly string[]): { parent: Record<string, unknown>; key: string } {
  if (path.length === 0 || path.length > 16 || path.some((part) => !part || part.length > 128 || ["__proto__", "prototype", "constructor"].includes(part))) throw new Error("Invalid field path.");
  let parent = data;
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(parent, key)) throw new Error("Field is missing from this actor revision.");
    const next = parent[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("Field path must address an existing object.");
    parent = next as Record<string, unknown>;
  }
  const key = path[path.length - 1]!;
  if (!Object.hasOwn(parent, key) || !["string", "number", "boolean"].includes(typeof parent[key])) throw new Error("Field is missing or is not a scalar.");
  return { parent, key };
}

export function prepareDeclarativeActorSave(actor: Actor, sheet: DeclarativeActorSheet, inputs: DeclarativeFieldInputs) {
  if (actor.id !== sheet.actorId || actor.systemId !== sheet.system.systemId || actor.updatedAt !== sheet.actorUpdatedAt) throw new Error("Actor and sheet revisions differ. Refresh the sheet before editing.");
  const data = structuredClone(actor.data);
  for (const [key, input] of Object.entries(inputs)) {
    const field = sheet.fields.find((candidate) => declarativeFieldKey(candidate.path) === key);
    if (!field?.editable || !field.present) throw new Error("This field is not editable.");
    const target = scalarContainer(data, field.path);
    target.parent[target.key] = parseDeclarativeScalar(field.schema, input);
  }
  const payload = { data, expectedUpdatedAt: sheet.actorUpdatedAt };
  return { path: `/api/v1/actors/${encodeURIComponent(actor.id)}`, payload, idempotencyKey: sharedMutationIdempotencyKey(`actor:data:${actor.id}`, sheet.actorUpdatedAt, payload) };
}

export function saveDeclarativeActor(request: ReturnType<typeof prepareDeclarativeActorSave>, signal: AbortSignal): Promise<Actor> {
  return apiPatch<Actor>(request.path, request.payload, { signal, idempotencyKey: request.idempotencyKey });
}

export interface DeclarativeRollResult {
  actor: Actor;
  sheet: DeclarativeActorSheet;
  quickRoll: DeclarativeQuickRoll;
  roll: DiceRoll;
  chat: ChatMessage;
  cost?: DeclarativeResourceCost;
}

export function prepareDeclarativeRoll(campaignId: string, sheet: DeclarativeActorSheet, rollId: string, attemptId: string) {
  if (!sheet.quickRolls.find((roll) => roll.id === rollId)?.available) throw new Error("This roll is currently unavailable.");
  const payload: DeclarativeActionRequest = { rollId, expectedActorUpdatedAt: sheet.actorUpdatedAt, expectedSystem: { ...sheet.system } };
  return {
    path: `/api/v1/campaigns/${encodeURIComponent(campaignId)}/systems/${encodeURIComponent(sheet.system.systemId)}/actors/${encodeURIComponent(sheet.actorId)}/roll`,
    payload,
    idempotencyKey: sharedMutationIdempotencyKey(`declarative-roll:${sheet.actorId}:${attemptId}`, sheet.actorUpdatedAt, payload)
  };
}

export function rollDeclarativeActor(request: ReturnType<typeof prepareDeclarativeRoll>, signal: AbortSignal): Promise<DeclarativeRollResult> {
  return apiPost<DeclarativeRollResult>(request.path, request.payload, { signal, idempotencyKey: request.idempotencyKey });
}
