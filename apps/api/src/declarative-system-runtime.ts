import { createHash } from "node:crypto";
import type { Actor, DeclarativeActionRequest, DeclarativeActorSheet, DeclarativeQuickRoll, DeclarativeResourceCost, DeclarativeSheetField, DeclarativeSystemManifest, DeclarativeSystemRoll, DeclarativeSystemSchema, DeclarativeValidationIssue, SystemManifestIdentity } from "@open-tabletop/core";
import { declarativeSystemSchemaAtPath, getDeclarativeSystemValue, SystemManifestValidationError, validateDeclarativeSystemData, validateDeclarativeSystemManifest, validateSystemManifest } from "@open-tabletop/system-sdk";

export type { DeclarativeActionRequest, DeclarativeActorSheet, DeclarativeQuickRoll, DeclarativeResourceCost, DeclarativeScalarSchema, DeclarativeSheetField } from "@open-tabletop/core";

export type DeclarativeSystemIdentity = SystemManifestIdentity;

export interface DeclarativeSystemBinding extends SystemManifestIdentity {
  campaignId: string;
}

export type DeclarativeActorSnapshot = Pick<Actor, "id" | "campaignId" | "systemId" | "type" | "updatedAt" | "data">;

export interface DeclarativeActionPlan {
  kind: "declarative-v1";
  campaignId: string;
  actorId: string;
  expectedActorUpdatedAt: string;
  system: DeclarativeSystemIdentity;
  roll: { id: string; label: string; formula: string };
  actorData: Record<string, unknown>;
  actorChanged: boolean;
  cost?: DeclarativeResourceCost;
}

export type DeclarativeRuntimeErrorCode = "invalid_definition" | "invalid_binding" | "invalid_actor" | "invalid_request" | "stale_actor" | "stale_system" | "unknown_roll" | "roll_unavailable";

export class DeclarativeRuntimeError extends Error {
  constructor(readonly code: DeclarativeRuntimeErrorCode, readonly issues: DeclarativeValidationIssue[]) {
    super(issues[0]?.message ?? "Declarative system operation failed.");
    this.name = "DeclarativeRuntimeError";
  }
}

export interface DeclarativeSystemRuntime {
  readonly binding: Readonly<DeclarativeSystemBinding>;
  sheet(actor: DeclarativeActorSnapshot): DeclarativeActorSheet;
  quickRolls(actor: DeclarativeActorSnapshot): DeclarativeQuickRoll[];
  prepareAction(actor: DeclarativeActorSnapshot, request: unknown): DeclarativeActionPlan;
}

const minimumSafe = BigInt(Number.MIN_SAFE_INTEGER);
const maximumSafe = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Registration and pinned resolution must share these complete-manifest bytes.
 * This validates bounded inert executable JSON, not current host eligibility:
 * unchanged old definitions remain hashable after a host version upgrade.
 */
export function declarativeSystemManifestChecksum(manifest: unknown): string {
  assertExecutableManifest(manifest);
  return createHash("sha256").update(canonicalJson(manifest), "utf8").digest("hex");
}

/**
 * Pure projection/candidate calculation. The host owns permissions, fresh pin
 * resolution, idempotency, fair dice, durable writes and events. Cache using the
 * campaign + system + version + checksum, never a system ID alone. coreVersion
 * is server-owned configuration, not a client/manifest execution override.
 * Inputs must be detached plain snapshots; SQLite model accessors are not JSON.
 */
export function createDeclarativeSystemRuntime(manifest: DeclarativeSystemManifest, binding: DeclarativeSystemBinding, options: { coreVersion?: string } = {}): DeclarativeSystemRuntime {
  // Inspect inert JSON first so the ordinary validator never reads accessors.
  assertExecutableManifest(manifest);
  try {
    validateSystemManifest(manifest, options);
  } catch (error) {
    if (!(error instanceof SystemManifestValidationError)) throw error;
    throw new DeclarativeRuntimeError("invalid_definition", error.issues.slice(0, 32).map((message) => ({ path: ["manifest"], code: "manifest", message: message.slice(0, 512) })));
  }
  assertStringRecord(binding, ["campaignId", "systemId", "version", "checksum"], "invalid_binding", ["binding"]);
  const canonical = canonicalJson(manifest);
  const checksum = createHash("sha256").update(canonical, "utf8").digest("hex");
  if (binding.systemId !== manifest.id || binding.version !== manifest.version || binding.checksum !== checksum) {
    fail("invalid_binding", ["binding"], "binding_mismatch", "Selected system ID, version and checksum must match the registered definition exactly.");
  }
  // Detach validated JSON: caller mutation cannot change the captured rules.
  const definition = JSON.parse(canonical) as DeclarativeSystemManifest;
  const pinned = Object.freeze({ campaignId: binding.campaignId, systemId: binding.systemId, version: binding.version, checksum });
  const identity = (): DeclarativeSystemIdentity => ({ systemId: pinned.systemId, version: pinned.version, checksum: pinned.checksum });
  const rollsFor = (actor: DeclarativeActorSnapshot): DeclarativeQuickRoll[] => definition.definition.quickRolls.map((roll) => resolveRoll(definition, actor.data, roll).roll);

  const checkActor = (actor: DeclarativeActorSnapshot): void => {
    if (actor.campaignId !== pinned.campaignId || actor.systemId !== pinned.systemId) {
      fail("invalid_actor", ["actor"], "actor_binding", "Actor must belong to the selected campaign and system.");
    }
    if (!definition.definition.actorTypes.includes(actor.type)) fail("invalid_actor", ["actor", "type"], "actor_type", "Actor type is not declared by the selected system version.");
    if (typeof actor.id !== "string" || !actor.id || typeof actor.updatedAt !== "string" || !actor.updatedAt) fail("invalid_actor", ["actor"], "actor_identity", "Actor ID and current revision are required.");
    const issues = validateDeclarativeSystemData(definition.schemas.actor, actor.data, ["actor", "data"]);
    if (issues.length) throw new DeclarativeRuntimeError("invalid_actor", issues);
  };

  return {
    binding: pinned,
    sheet(actor) {
      checkActor(actor);
      const fields: DeclarativeSheetField[] = definition.definition.sheet.fields.map((field) => {
        const schema = declarativeSystemSchemaAtPath(definition.schemas.actor, field.path);
        if (!schema || schema.type === "object") fail("invalid_definition", ["definition", "sheet", "fields"], "field_schema", "Sheet fields must reference declared scalar data.");
        let required = true;
        let parent: DeclarativeSystemSchema = definition.schemas.actor;
        for (const segment of field.path) {
          if (parent.type !== "object") { required = false; break; }
          required = required && parent.required.includes(segment);
          parent = parent.properties[segment]!;
        }
        const value = getDeclarativeSystemValue(actor.data, field.path) as string | number | boolean | undefined;
        return {
          path: [...field.path], label: field.label, editable: field.editable,
          required, present: value !== undefined, ...(value === undefined ? {} : { value }),
          schema: structuredClone(schema)
        };
      });
      return { kind: "declarative-v1", actorId: actor.id, actorUpdatedAt: actor.updatedAt, system: identity(), fields, quickRolls: rollsFor(actor) };
    },
    quickRolls(actor) {
      checkActor(actor);
      return rollsFor(actor);
    },
    prepareAction(actor, request) {
      const parsed = parseRequest(request);
      checkActor(actor);
      if (parsed.expectedActorUpdatedAt !== actor.updatedAt) fail("stale_actor", ["expectedActorUpdatedAt"], "stale_actor", "Actor changed; load the current sheet before using this action.");
      if (parsed.expectedSystem.systemId !== pinned.systemId || parsed.expectedSystem.version !== pinned.version || parsed.expectedSystem.checksum !== pinned.checksum) {
        fail("stale_system", ["expectedSystem"], "stale_system", "Selected system version changed; load the current sheet before using this action.");
      }
      const declared = definition.definition.quickRolls.find((roll) => roll.id === parsed.rollId);
      if (!declared) fail("unknown_roll", ["rollId"], "unknown_roll", "This roll ID is not declared by the selected system version.");
      const resolved = resolveRoll(definition, actor.data, declared);
      if (!resolved.roll.available || resolved.roll.formula === undefined) throw new DeclarativeRuntimeError("roll_unavailable", resolved.roll.issues);
      return {
        kind: "declarative-v1", campaignId: actor.campaignId, actorId: actor.id,
        expectedActorUpdatedAt: actor.updatedAt, system: identity(),
        roll: { id: declared.id, label: declared.label, formula: resolved.roll.formula },
        actorData: resolved.candidateData ?? structuredClone(actor.data), actorChanged: Boolean(declared.cost),
        ...(resolved.roll.cost ? { cost: resolved.roll.cost } : {})
      };
    }
  };
}

function assertExecutableManifest(manifest: unknown): void {
  const issues = validateDeclarativeSystemManifest(manifest);
  if (issues.length) throw new DeclarativeRuntimeError("invalid_definition", issues);
}

function resolveRoll(manifest: DeclarativeSystemManifest, data: Record<string, unknown>, declared: DeclarativeSystemRoll): { roll: DeclarativeQuickRoll; candidateData?: Record<string, unknown> } {
  const issues: DeclarativeValidationIssue[] = [];
  const issue = (path: string[], code: string, message: string): void => { issues.push({ path, code, message }); };
  // Exact aggregation avoids precision loss from intermediate cancellation.
  let modifier = BigInt(declared.dice.bonus);
  for (const path of declared.dice.addFields) {
    const value = getDeclarativeSystemValue(data, path);
    if (typeof value !== "number" || !Number.isSafeInteger(value)) issue(["actor", "data", ...path], "roll_integer", "Roll fields must be present finite safe integers.");
    else modifier += BigInt(value);
  }
  const minimum = modifier + BigInt(declared.dice.count);
  const maximum = modifier + BigInt(declared.dice.count) * BigInt(declared.dice.sides);
  if (modifier < minimumSafe || modifier > maximumSafe || minimum < minimumSafe || maximum > maximumSafe) {
    issue(["definition", "quickRolls", declared.id, "dice"], "roll_range", "Resolved modifier and every possible dice total must remain safe integers.");
  }
  const formula = issues.length ? undefined : `${declared.dice.count}d${declared.dice.sides}${modifier === 0n ? "" : modifier > 0n ? `+${modifier}` : String(modifier)}`;
  let candidateData: Record<string, unknown> | undefined;
  let cost: DeclarativeResourceCost | undefined;
  if (declared.cost) {
    const { path, amount } = declared.cost;
    const before = getDeclarativeSystemValue(data, path);
    if (typeof before !== "number" || !Number.isSafeInteger(before) || before < 0) issue(["actor", "data", ...path], "resource_integer", "Resource must be a present nonnegative safe integer.");
    else {
      const remaining = BigInt(before) - BigInt(amount);
      cost = { path: [...path], amount, before, after: Number(remaining) };
      if (remaining < 0n) issue(["actor", "data", ...path], "insufficient_resource", "This action requires more resource than the actor currently has.");
      else {
        candidateData = structuredClone(data);
        replaceOwnLeaf(candidateData, path, Number(remaining));
        issues.push(...validateDeclarativeSystemData(manifest.schemas.actor, candidateData, ["actor", "data"]));
      }
    }
  }
  return { roll: { id: declared.id, label: declared.label, ...(formula === undefined ? {} : { formula }), available: issues.length === 0, ...(cost ? { cost } : {}), issues: issues.slice(0, 32) }, ...(candidateData ? { candidateData } : {}) };
}

function replaceOwnLeaf(data: Record<string, unknown>, path: string[], value: number): void {
  let current = data;
  for (const part of path.slice(0, -1)) current = current[part] as Record<string, unknown>;
  // Schema path and full inert actor JSON were validated before this helper.
  current[path[path.length - 1]!] = value;
}

function parseRequest(value: unknown): DeclarativeActionRequest {
  if (!isPlainObject(value)) fail("invalid_request", [], "request_object", "Action request must be a plain JSON object.");
  assertKeys(value, ["rollId", "expectedActorUpdatedAt", "expectedSystem"], "invalid_request", []);
  for (const key of ["rollId", "expectedActorUpdatedAt"] as const) {
    if (typeof value[key] !== "string" || !value[key] || value[key].length > 200) fail("invalid_request", [key], "request_string", "Action IDs and actor revisions must be nonempty strings of at most 200 characters.");
  }
  assertStringRecord(value.expectedSystem, ["systemId", "version", "checksum"], "invalid_request", ["expectedSystem"]);
  return value as unknown as DeclarativeActionRequest;
}

function assertStringRecord(value: unknown, keys: string[], code: DeclarativeRuntimeErrorCode, path: string[]): asserts value is Record<string, string> {
  if (!isPlainObject(value)) fail(code, path, "identity_object", "Exact system identity must be a plain JSON object.");
  assertKeys(value, keys, code, path);
  for (const key of keys) {
    if (typeof value[key] !== "string" || !value[key] || value[key].length > 200) fail(code, [...path, key], "identity_string", "Identity fields must be nonempty strings of at most 200 characters.");
  }
  if (!/^[a-f0-9]{64}$/.test(value.checksum as string)) fail(code, [...path, "checksum"], "checksum", "System checksum must be 64 lowercase hexadecimal characters.");
}

function assertKeys(value: Record<string, unknown>, keys: string[], code: DeclarativeRuntimeErrorCode, path: string[]): void {
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable) {
      fail(code, path, "unsupported_field", "Only declared enumerable data fields are accepted; formula, cost, targets and execution overrides are unsupported.");
    }
  }
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) fail(code, [...path, key], "required", "This action identity field is required.");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function fail(code: DeclarativeRuntimeErrorCode, path: string[], issueCode: string, message: string): never {
  throw new DeclarativeRuntimeError(code, [{ path, code: issueCode, message }]);
}

/** Called only after the SDK's inert-JSON and size/depth validation succeeds. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
