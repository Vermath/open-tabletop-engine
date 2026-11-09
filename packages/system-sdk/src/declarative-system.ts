import type {
  DeclarativeSystemManifest,
  DeclarativeSystemObjectSchema,
  DeclarativeSystemSchema,
  DeclarativeValidationIssue,
  SystemCapability
} from "@open-tabletop/api-contracts";

export type {
  DeclarativeActionRequest,
  DeclarativeActorSheet,
  DeclarativeQuickRoll,
  DeclarativeResourceCost,
  DeclarativeScalarSchema,
  DeclarativeSheetField,
  SystemManifestIdentity,
  DeclarativeSystemDefinition,
  DeclarativeSystemField,
  DeclarativeSystemManifest,
  DeclarativeSystemObjectSchema,
  DeclarativeSystemPath,
  DeclarativeSystemRoll,
  DeclarativeSystemSchema,
  DeclarativeValidationIssue,
  SystemManifestSchemas
} from "@open-tabletop/api-contracts";

export const DECLARATIVE_SYSTEM_LIMITS = Object.freeze({
  bytes: 65_536,
  objectLevels: 4,
  properties: 64,
  fields: 32,
  rolls: 32,
  enumValues: 16,
  textLength: 1_000,
  labelLength: 128,
  pathSegments: 4,
  addFields: 4,
  diceCount: 20,
  types: 32,
  identifierLength: 64,
  issues: 32
});

export const DECLARATIVE_SYSTEM_DICE_SIDES = Object.freeze([4, 6, 8, 10, 12, 20, 100] as const);
const forbiddenNames = new Set([...Object.getOwnPropertyNames(Object.prototype), "prototype"]);
const executionCapabilities = ["data-model", "actor-sheet", "quick-rolls", "actions"] as const;
type JsonObject = Record<string, unknown>;

class Issues {
  readonly values: DeclarativeValidationIssue[] = [];
  get full(): boolean { return this.values.length >= DECLARATIVE_SYSTEM_LIMITS.issues; }
  add(path: string[], code: string, message: string): void {
    if (!this.full) this.values.push({ path: path.slice(0, 20).map((part) => part.slice(0, 128)), code, message });
  }
}

function isObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function owns(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function own(value: JsonObject, key: string): unknown {
  return owns(value, key) ? value[key] : undefined;
}

/** Verify inert JSON first: never invoke a getter, toJSON, or a coercion hook. */
function inspectJson(value: unknown, issues: Issues, root: string[]): boolean {
  const before = issues.values.length;
  const ancestors = new Set<object>();
  let bytes = 0;
  let nodes = 0;
  const addBytes = (amount: number, path: string[]) => {
    bytes += amount;
    if (bytes > DECLARATIVE_SYSTEM_LIMITS.bytes) issues.add(path, "size_limit", "Executable manifest or record must be at most 64 KiB of JSON.");
  };
  const stringBytes = (text: string): number => text.length > DECLARATIVE_SYSTEM_LIMITS.bytes
    ? DECLARATIVE_SYSTEM_LIMITS.bytes + 1
    : new TextEncoder().encode(JSON.stringify(text)).length;
  const visit = (current: unknown, path: string[], depth: number): void => {
    if (issues.full || bytes > DECLARATIVE_SYSTEM_LIMITS.bytes) return;
    if (++nodes > 8_192 || depth > 20) {
      issues.add(path, "structure_limit", "JSON structure exceeds the supported inspection limit.");
      return;
    }
    if (current === null) { addBytes(4, path); return; }
    if (typeof current === "string") { addBytes(stringBytes(current), path); return; }
    if (typeof current === "boolean") { addBytes(current ? 4 : 5, path); return; }
    if (typeof current === "number" && Number.isFinite(current)) { addBytes(String(current).length, path); return; }
    if (!current || typeof current !== "object") {
      issues.add(path, "json_value", "Only finite JSON values are supported.");
      return;
    }
    if (ancestors.has(current)) { issues.add(path, "cycle", "JSON values must not contain cycles."); return; }
    const array = Array.isArray(current);
    if ((!array && !isObject(current)) || (array && Object.getPrototypeOf(current) !== Array.prototype)) {
      issues.add(path, "json_object", "Objects must be plain JSON objects or arrays.");
      return;
    }
    const keys = Reflect.ownKeys(current);
    if (keys.length > 8_192) { issues.add(path, "structure_limit", "JSON object has too many members."); return; }
    if (keys.some((key) => typeof key !== "string")) { issues.add(path, "json_key", "Symbol keys are unsupported."); return; }
    const names = (keys as string[]).filter((key) => !(array && key === "length")).sort();
    if (array && (current.length > 8_192 || names.length !== current.length || names.some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= current.length))) {
      issues.add(path, "json_array", "Arrays must be dense and contain no named properties.");
      return;
    }
    ancestors.add(current);
    addBytes(2 + Math.max(0, names.length - 1), path);
    for (const key of names) {
      if (issues.full || bytes > DECLARATIVE_SYSTEM_LIMITS.bytes) break;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !owns(descriptor, "value") || !descriptor.enumerable) {
        issues.add([...path, key], "json_property", "Properties must be enumerable data properties; accessors are unsupported.");
        continue;
      }
      if (forbiddenNames.has(key)) { issues.add([...path, key], "unsafe_key", "Prototype-related property names are forbidden."); continue; }
      if (!array) addBytes(stringBytes(key) + 1, path);
      visit(descriptor.value, [...path, key], depth + 1);
    }
    ancestors.delete(current);
  };
  try { visit(value, root, 0); }
  catch { issues.add(root, "json_inspection", "Value could not be inspected as plain JSON."); }
  return issues.values.length === before;
}

function object(value: unknown, keys: readonly string[], path: string[], issues: Issues): value is JsonObject {
  if (!isObject(value)) { issues.add(path, "object", "Expected a plain object."); return false; }
  for (const key of Object.keys(value).sort()) {
    if (!keys.includes(key)) issues.add([...path, key], "unknown_key", "Unsupported field or schema keyword.");
  }
  return true;
}

function boundedArray(value: unknown, maximum: number, path: string[], issues: Issues, minimum = 0): value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    issues.add(path, "array_limit", `Expected an array containing ${minimum} to ${maximum} entries.`);
    return false;
  }
  return true;
}

function safeSegment(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !forbiddenNames.has(value);
}

function copyPath(value: unknown): string[] | undefined {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !owns(lengthDescriptor, "value")) return undefined;
    const length: unknown = lengthDescriptor.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 1 || length > DECLARATIVE_SYSTEM_LIMITS.pathSegments) return undefined;
    if (Reflect.ownKeys(value).length !== length + 1) return undefined;
    const segments: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !owns(descriptor, "value") || !descriptor.enumerable || !safeSegment(descriptor.value)) return undefined;
      segments.push(descriptor.value);
    }
    return segments;
  } catch {
    // Proxy inspection can execute traps; thrown failures reject the path.
    return undefined;
  }
}

function validateSchema(schema: unknown, path: string[], issues: Issues, budget: { properties: number }, objectLevel: number): void {
  if (issues.full || !isObject(schema)) { if (!issues.full) issues.add(path, "schema", "Expected an inline schema object."); return; }
  const type = own(schema, "type");
  if (type === "object") {
    object(schema, ["type", "properties", "required", "additionalProperties"], path, issues);
    if (objectLevel > DECLARATIVE_SYSTEM_LIMITS.objectLevels) { issues.add(path, "depth_limit", "Schemas support at most four object levels, including the root."); return; }
    if (schema.additionalProperties !== false) issues.add([...path, "additionalProperties"], "additional_properties", "Object schemas must specify additionalProperties: false.");
    if (!isObject(schema.properties)) { issues.add([...path, "properties"], "properties", "Object schemas require declared properties."); return; }
    const keys = Object.keys(schema.properties).sort();
    budget.properties += keys.length;
    if (budget.properties > DECLARATIVE_SYSTEM_LIMITS.properties) { issues.add(path, "property_limit", "Actor and item schemas support at most 64 declared properties in total."); return; }
    if (boundedArray(schema.required, DECLARATIVE_SYSTEM_LIMITS.properties, [...path, "required"], issues)) {
      const seen = new Set<string>();
      schema.required.forEach((key, index) => {
        if (!safeSegment(key) || !owns(schema.properties as object, key)) issues.add([...path, "required", String(index)], "required_property", "Required names must refer to safe declared properties.");
        else if (seen.has(key)) issues.add([...path, "required", String(index)], "duplicate", "Required names must be unique.");
        else seen.add(key);
      });
    }
    for (const key of keys) {
      if (!safeSegment(key)) issues.add([...path, "properties", key], "property_name", "Property names must contain 1 to 128 characters and be prototype-safe.");
      validateSchema(schema.properties[key], [...path, "properties", key], issues, budget, objectLevel + 1);
    }
    return;
  }
  if (type === "integer" || type === "number") {
    object(schema, ["type", "minimum", "maximum", "enum"], path, issues);
    for (const bound of ["minimum", "maximum"] as const) {
      const value = own(schema, bound);
      if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isSafeInteger(value))) issues.add([...path, bound], "numeric_bound", "Numeric bounds must be finite numbers; integer bounds must be safe integers.");
    }
    if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum) issues.add(path, "numeric_range", "Minimum must be less than or equal to maximum.");
  } else if (type === "string") {
    object(schema, ["type", "maxLength", "enum"], path, issues);
    if (!Number.isSafeInteger(schema.maxLength) || (schema.maxLength as number) < 0 || (schema.maxLength as number) > DECLARATIVE_SYSTEM_LIMITS.textLength) issues.add([...path, "maxLength"], "text_limit", "String schemas require maxLength from 0 to 1000 UTF-16 code units.");
  } else if (type === "boolean") {
    object(schema, ["type", "enum"], path, issues);
  } else {
    issues.add([...path, "type"], "schema_type", "Only object, integer, number, string, and boolean schemas are supported.");
    return;
  }
  if (owns(schema, "enum") && boundedArray(schema.enum, DECLARATIVE_SYSTEM_LIMITS.enumValues, [...path, "enum"], issues, 1)) {
    const seen = new Set<unknown>();
    schema.enum.forEach((value, index) => {
      validateScalar(schema, value, [...path, "enum", String(index)], issues, false);
      if (seen.has(value)) issues.add([...path, "enum", String(index)], "duplicate", "Enum values must be unique.");
      seen.add(value);
    });
  }
}

function validateScalar(schema: JsonObject, value: unknown, path: string[], issues: Issues, checkEnum = true): void {
  const type = schema.type;
  if (type === "number" || type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isSafeInteger(value))) issues.add(path, "value_type", "Expected a finite number or, for integer fields, a safe integer.");
    else if (value < (schema.minimum as number) || value > (schema.maximum as number)) issues.add(path, "value_range", "Number falls outside the declared range.");
  } else if (type === "string") {
    if (typeof value !== "string") issues.add(path, "value_type", "Expected a string.");
    else if (value.length > (schema.maxLength as number)) issues.add(path, "value_length", "Text exceeds the declared maximum length.");
  } else if (type === "boolean" && typeof value !== "boolean") issues.add(path, "value_type", "Expected a boolean.");
  if (checkEnum && Array.isArray(schema.enum) && !schema.enum.includes(value)) issues.add(path, "value_enum", "Value must be one of the declared enum values.");
}

function validateData(schema: DeclarativeSystemSchema, value: unknown, path: string[], issues: Issues): void {
  if (issues.full) return;
  if (schema.type !== "object") { validateScalar(schema, value, path, issues); return; }
  if (!isObject(value)) { issues.add(path, "value_type", "Expected a plain data object."); return; }
  for (const key of schema.required.slice().sort()) {
    if (!owns(value, key)) issues.add([...path, key], "required", "Required property is missing.");
  }
  for (const key of Object.keys(value).sort()) {
    if (!owns(schema.properties, key)) issues.add([...path, key], "additional_property", "Property is not declared by the schema.");
    else validateData(schema.properties[key]!, value[key], [...path, key], issues);
  }
}

/** Validate a standalone schema. Root objects count as level one. */
export function validateDeclarativeSystemSchema(schema: unknown): DeclarativeValidationIssue[] {
  return containInspection(["schema"], () => {
    const issues = new Issues();
    if (inspectJson(schema, issues, ["schema"])) {
      validateSchema(schema, ["schema"], issues, { properties: 0 }, 1);
      if (isObject(schema) && schema.type !== "object") issues.add(["schema", "type"], "root_schema", "Actor and item schemas must have object roots.");
    }
    return issues.values;
  });
}

/** Check full candidate data with no defaults, mutation, coercion, or unknown keys. */
export function validateDeclarativeSystemData(schema: unknown, data: unknown, path: string[] = ["data"]): DeclarativeValidationIssue[] {
  return containInspection(["data"], () => {
    const schemaIssues = validateDeclarativeSystemSchema(schema);
    if (schemaIssues.length) return schemaIssues;
    const issues = new Issues();
    if (inspectJson(data, issues, path)) validateData(schema as DeclarativeSystemObjectSchema, data, path, issues);
    return issues.values;
  });
}

/** Resolve only safe own-property schema paths. Call with a validated schema. */
export function declarativeSystemSchemaAtPath(schema: DeclarativeSystemObjectSchema, path: unknown): DeclarativeSystemSchema | undefined {
  const segments = copyPath(path);
  if (!segments) return undefined;
  try {
    let current: DeclarativeSystemSchema = schema;
    for (const segment of segments) {
      if (current.type !== "object" || !owns(current.properties, segment)) return undefined;
      current = current.properties[segment]!;
    }
    return current;
  } catch {
    return undefined;
  }
}

/** Resolve own data properties without reading inherited members or accessors. */
export function getDeclarativeSystemValue(data: unknown, path: unknown): unknown {
  const segments = copyPath(path);
  if (!segments) return undefined;
  try {
    let current: unknown = data;
    for (const segment of segments) {
      if (!isObject(current)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(current, segment);
      if (!descriptor || !owns(descriptor, "value") || !descriptor.enumerable) return undefined;
      current = descriptor.value;
    }
    return current;
  } catch {
    return undefined;
  }
}

function label(value: unknown, path: string[], issues: Issues): void {
  if (typeof value !== "string" || !value.trim() || value.length > DECLARATIVE_SYSTEM_LIMITS.labelLength) issues.add(path, "label", "Labels must contain 1 to 128 UTF-16 code units.");
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= DECLARATIVE_SYSTEM_LIMITS.identifierLength && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !forbiddenNames.has(value);
}

function pathSchema(value: unknown, schema: DeclarativeSystemObjectSchema, path: string[], issues: Issues): DeclarativeSystemSchema | undefined {
  const segments = copyPath(value);
  if (!segments) { issues.add(path, "path", "Paths require one to four safe own-property segments."); return undefined; }
  const leaf = declarativeSystemSchemaAtPath(schema, segments);
  if (!leaf || leaf.type === "object") { issues.add(path, "path_leaf", "Path must resolve to a declared scalar actor-data field."); return undefined; }
  return leaf;
}

function deriveCapabilities(manifest: DeclarativeSystemManifest): SystemCapability[] {
  return [
    "data-model",
    ...(manifest.definition.sheet.fields.length ? ["actor-sheet" as const] : []),
    ...(manifest.definition.quickRolls.length ? ["quick-rolls" as const] : []),
    ...(manifest.definition.quickRolls.some((roll) => roll.cost) ? ["actions" as const] : [])
  ];
}

/**
 * Validate executable fields of a manifest. The ordinary manifest validator also
 * validates package identity, core compatibility, and requested permissions.
 * Legacy manifests do not pass this function and gain no executable capability.
 */
export function validateDeclarativeSystemManifest(value: unknown): DeclarativeValidationIssue[] {
  return containInspection([], () => validateManifest(value));
}

function containInspection(path: string[], run: () => DeclarativeValidationIssue[]): DeclarativeValidationIssue[] {
  try {
    return run();
  } catch {
    // Proxy traps can execute during inspection; contain their thrown failures.
    const issues = new Issues();
    issues.add(path, "json_inspection", "Value could not be inspected as plain JSON.");
    return issues.values;
  }
}

function validateManifest(value: unknown): DeclarativeValidationIssue[] {
  const issues = new Issues();
  if (!inspectJson(value, issues, [])) return issues.values;
  if (!object(value, ["id", "name", "version", "compatibleCore", "entrypoints", "schemas", "permissions", "capabilities", "definition"], [], issues)) return issues.values;
  if (!isObject(value.entrypoints) || Object.keys(value.entrypoints).length !== 0) issues.add(["entrypoints"], "code_entrypoint", "Declarative systems require empty entrypoints and cannot load package code.");
  if (!object(value.schemas, ["actor", "item"], ["schemas"], issues)) return issues.values;
  const schemaBudget = { properties: 0 };
  for (const kind of ["actor", "item"] as const) {
    const schema = own(value.schemas, kind);
    validateSchema(schema, ["schemas", kind], issues, schemaBudget, 1);
    if (isObject(schema) && schema.type !== "object") issues.add(["schemas", kind, "type"], "root_schema", "Actor and item schemas must have inline object roots.");
  }
  if (issues.values.length) return issues.values;
  const schemas = value.schemas as unknown as DeclarativeSystemManifest["schemas"];
  if (!object(value.definition, ["kind", "actorTypes", "itemTypes", "actorDefaults", "itemDefaults", "sheet", "quickRolls"], ["definition"], issues)) return issues.values;
  const definition = value.definition;
  if (definition.kind !== "declarative-v1") issues.add(["definition", "kind"], "definition_kind", "Only declarative-v1 definitions are supported.");
  for (const key of ["actorTypes", "itemTypes"] as const) {
    if (boundedArray(definition[key], DECLARATIVE_SYSTEM_LIMITS.types, ["definition", key], issues, 1)) {
      const seen = new Set<string>();
      definition[key].forEach((type, index) => {
        if (!identifier(type)) issues.add(["definition", key, String(index)], "identifier", "Types must be safe lowercase kebab-case identifiers of at most 64 characters.");
        else if (seen.has(type)) issues.add(["definition", key, String(index)], "duplicate", "Type identifiers must be unique.");
        else seen.add(type);
      });
    }
  }
  validateData(schemas.actor, own(definition, "actorDefaults"), ["definition", "actorDefaults"], issues);
  validateData(schemas.item, own(definition, "itemDefaults"), ["definition", "itemDefaults"], issues);
  if (object(definition.sheet, ["fields"], ["definition", "sheet"], issues)
    && boundedArray(definition.sheet.fields, DECLARATIVE_SYSTEM_LIMITS.fields, ["definition", "sheet", "fields"], issues)) {
    const seen = new Set<string>();
    definition.sheet.fields.forEach((field, index) => {
      const path = ["definition", "sheet", "fields", String(index)];
      if (!object(field, ["path", "label", "editable"], path, issues)) return;
      pathSchema(field.path, schemas.actor, [...path, "path"], issues);
      label(field.label, [...path, "label"], issues);
      if (typeof field.editable !== "boolean") issues.add([...path, "editable"], "boolean", "Editable must be a boolean.");
      const key = JSON.stringify(field.path);
      if (seen.has(key)) issues.add([...path, "path"], "duplicate", "Sheet field paths must be unique.");
      seen.add(key);
    });
  }
  if (boundedArray(definition.quickRolls, DECLARATIVE_SYSTEM_LIMITS.rolls, ["definition", "quickRolls"], issues)) {
    const seen = new Set<string>();
    definition.quickRolls.forEach((roll, index) => {
      const path = ["definition", "quickRolls", String(index)];
      if (!object(roll, ["id", "label", "dice", "cost"], path, issues)) return;
      if (!identifier(roll.id)) issues.add([...path, "id"], "identifier", "Roll IDs must be safe lowercase kebab-case identifiers of at most 64 characters.");
      else if (seen.has(roll.id)) issues.add([...path, "id"], "duplicate", "Roll IDs must be unique.");
      else seen.add(roll.id);
      label(roll.label, [...path, "label"], issues);
      if (object(roll.dice, ["count", "sides", "bonus", "addFields"], [...path, "dice"], issues)) {
        const dice = roll.dice;
        if (!Number.isSafeInteger(dice.count) || (dice.count as number) < 1 || (dice.count as number) > DECLARATIVE_SYSTEM_LIMITS.diceCount) issues.add([...path, "dice", "count"], "dice_count", "Dice count must be an integer from 1 to 20.");
        if (!(DECLARATIVE_SYSTEM_DICE_SIDES as readonly unknown[]).includes(dice.sides)) issues.add([...path, "dice", "sides"], "dice_sides", "Supported dice sides are 4, 6, 8, 10, 12, 20, and 100.");
        if (!Number.isSafeInteger(dice.bonus)) issues.add([...path, "dice", "bonus"], "dice_bonus", "Dice bonus must be a finite safe integer.");
        let minimum = Number.isSafeInteger(dice.bonus) ? BigInt(dice.bonus as number) : 0n;
        let maximum = minimum;
        if (boundedArray(dice.addFields, DECLARATIVE_SYSTEM_LIMITS.addFields, [...path, "dice", "addFields"], issues)) {
          dice.addFields.forEach((fieldPath, fieldIndex) => {
            const at = [...path, "dice", "addFields", String(fieldIndex)];
            const leaf = pathSchema(fieldPath, schemas.actor, at, issues);
            if (!leaf) return;
            if ((leaf.type !== "number" && leaf.type !== "integer") || !Number.isSafeInteger(leaf.minimum) || !Number.isSafeInteger(leaf.maximum)) { issues.add(at, "roll_field", "Additive fields require numeric schemas with safe-integer bounds."); return; }
            minimum += BigInt(leaf.minimum);
            maximum += BigInt(leaf.maximum);
            if (!Number.isSafeInteger(getDeclarativeSystemValue(definition.actorDefaults, fieldPath))) issues.add(at, "roll_default", "Additive field defaults must be present safe integers.");
          });
        }
        const diceMaximum = Number.isSafeInteger(dice.count) && Number.isSafeInteger(dice.sides) ? BigInt(dice.count as number) * BigInt(dice.sides as number) : 0n;
        if (minimum < BigInt(Number.MIN_SAFE_INTEGER) || maximum + diceMaximum > BigInt(Number.MAX_SAFE_INTEGER)) issues.add([...path, "dice"], "roll_range", "The complete roll must remain within the safe integer range.");
      }
      if (owns(roll, "cost") && object(roll.cost, ["path", "amount"], [...path, "cost"], issues)) {
        const leaf = pathSchema(roll.cost.path, schemas.actor, [...path, "cost", "path"], issues);
        if (leaf && (leaf.type !== "integer" || leaf.minimum < 0)) issues.add([...path, "cost", "path"], "cost_field", "Resource costs require a nonnegative integer actor-data field.");
        if (!Number.isSafeInteger(roll.cost.amount) || (roll.cost.amount as number) <= 0) issues.add([...path, "cost", "amount"], "cost_amount", "Resource cost must be a fixed positive safe integer.");
        else if (leaf?.type === "integer" && (roll.cost.amount as number) > leaf.maximum) issues.add([...path, "cost", "amount"], "cost_range", "Resource cost cannot exceed the field's maximum.");
        if (leaf && !Number.isSafeInteger(getDeclarativeSystemValue(definition.actorDefaults, roll.cost.path))) issues.add([...path, "cost", "path"], "cost_default", "Resource field defaults must be present safe integers.");
      }
    });
  }
  if (boundedArray(value.capabilities, executionCapabilities.length, ["capabilities"], issues, 1)) {
    const seen = new Set<unknown>();
    const effective = issues.values.length ? [] : deriveCapabilities(value as unknown as DeclarativeSystemManifest);
    value.capabilities.forEach((capability, index) => {
      if (!(executionCapabilities as readonly unknown[]).includes(capability)) issues.add(["capabilities", String(index)], "unsupported_capability", "Declarative systems support only data-model, actor-sheet, quick-rolls, and actions.");
      else if (!issues.values.length && !effective.includes(capability as SystemCapability)) issues.add(["capabilities", String(index)], "unsupported_capability", "Capability has no corresponding declarative fields or rolls.");
      if (seen.has(capability)) issues.add(["capabilities", String(index)], "duplicate", "Capabilities must be unique.");
      seen.add(capability);
    });
  }
  return issues.values;
}

/** Capabilities come from validated content; author claims never create support. */
export function declarativeSystemCapabilities(value: unknown): SystemCapability[] {
  try {
    return validateDeclarativeSystemManifest(value).length ? [] : deriveCapabilities(value as DeclarativeSystemManifest);
  } catch {
    return [];
  }
}
