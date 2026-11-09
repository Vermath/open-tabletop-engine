import assert from "node:assert/strict";
import { it as check } from "vitest";
import { validateSystemManifest, SystemManifestValidationError } from "./index.js";
import {
  validateDeclarativeSystemManifest as validate,
  validateDeclarativeSystemSchema,
  validateDeclarativeSystemData,
  declarativeSystemCapabilities,
  declarativeSystemSchemaAtPath,
  getDeclarativeSystemValue,
} from "./declarative-system.js";

const fixture: any = {
  "id": "lantern-survey",
  "name": "Lantern Survey",
  "version": "1.0.0",
  "compatibleCore": ">=0.3.0 <0.4.0",
  "entrypoints": {},
  "schemas": {
    "actor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "wits",
        "grit",
        "stamina"
      ],
      "properties": {
        "wits": {
          "type": "integer",
          "minimum": 0,
          "maximum": 4
        },
        "grit": {
          "type": "integer",
          "minimum": 0,
          "maximum": 4
        },
        "stamina": {
          "type": "integer",
          "minimum": 0,
          "maximum": 6
        }
      }
    },
    "item": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "weight",
        "quality"
      ],
      "properties": {
        "weight": {
          "type": "integer",
          "minimum": 0,
          "maximum": 20
        },
        "quality": {
          "type": "string",
          "enum": [
            "basic",
            "refined"
          ],
          "maxLength": 16
        }
      }
    }
  },
  "permissions": [
    "actor.read",
    "actor.updateOwned",
    "dice.roll",
    "chat.write"
  ],
  "capabilities": [
    "data-model",
    "actor-sheet",
    "quick-rolls",
    "actions"
  ],
  "definition": {
    "kind": "declarative-v1",
    "actorTypes": [
      "surveyor"
    ],
    "itemTypes": [
      "gear"
    ],
    "actorDefaults": {
      "wits": 2,
      "grit": 1,
      "stamina": 6
    },
    "itemDefaults": {
      "weight": 1,
      "quality": "basic"
    },
    "sheet": {
      "fields": [
        {
          "path": [
            "wits"
          ],
          "label": "Wits",
          "editable": true
        },
        {
          "path": [
            "grit"
          ],
          "label": "Grit",
          "editable": true
        },
        {
          "path": [
            "stamina"
          ],
          "label": "Stamina",
          "editable": true
        }
      ]
    },
    "quickRolls": [
      {
        "id": "survey",
        "label": "Survey",
        "dice": {
          "count": 2,
          "sides": 6,
          "bonus": 0,
          "addFields": [
            [
              "wits"
            ]
          ]
        }
      },
      {
        "id": "push",
        "label": "Push forward",
        "dice": {
          "count": 2,
          "sides": 6,
          "bonus": 0,
          "addFields": [
            [
              "grit"
            ]
          ]
        },
        "cost": {
          "path": [
            "stamina"
          ],
          "amount": 1
        }
      }
    ]
  }
};
function invalid(name: string, change: (manifest: any) => void) {
  check(name, () => {
    const candidate = structuredClone(fixture);
    change(candidate);
    const first = validate(candidate);
    assert.ok(first.length > 0, "Malformed manifest was accepted");
    assert.ok(first.length <= 32);
    assert.deepEqual(validate(candidate), first);
    assert.deepEqual(declarativeSystemCapabilities(candidate), []);
  });
}

check("ordinary public validation accepts the original playable manifest", () => validateSystemManifest(fixture));
check("execution capabilities derive from valid fields and resource actions", () => {
  assert.deepEqual(validate(fixture), []);
  assert.deepEqual(declarativeSystemCapabilities(fixture), ["data-model", "actor-sheet", "quick-rolls", "actions"]);
});
check("an unrelated system ID follows the identical public path", () => {
  const alternate = { ...structuredClone(fixture), id: "independent-nebula-rules", name: "Independent Nebula Rules" };
  validateSystemManifest(alternate);
  assert.deepEqual(validate(alternate), []);
});
check("legacy schema paths retain metadata validation and gain no execution", () => {
  const legacy = { ...structuredClone(fixture), schemas: { actor: "schemas/actor.json", item: "schemas/item.json" }, capabilities: ["data-model"] };
  delete legacy.definition;
  validateSystemManifest(legacy);
  assert.deepEqual(declarativeSystemCapabilities(legacy), []);
});

for (const value of [null, 1, "string", [], undefined, BigInt(1), () => 1, new Date(), new Map()]) {
  check(`reject non-manifest ${typeof value}:${Object.prototype.toString.call(value)}`, () => assert.ok(validate(value).length));
}
for (const key of ["__proto__", "constructor", "prototype", "toString"]) {
  invalid(`reject own unsafe key ${key}`, (m) => Object.defineProperty(m.definition.actorDefaults, key, { value: 1, enumerable: true }));
}
invalid("reject inherited fields", (m) => { m.schemas.actor = Object.create(m.schemas.actor); });
invalid("reject cyclic schemas", (m) => { m.schemas.actor.properties.loop = m.schemas.actor; });
invalid("reject symbolic keys", (m) => { m[Symbol("hidden")] = true; });
invalid("reject nonenumerable extra fields", (m) => Object.defineProperty(m, "hidden", { value: true }));
invalid("reject sparse roll arrays", (m) => { delete m.definition.quickRolls[0]; });
invalid("reject array named properties", (m) => { m.definition.quickRolls.extra = true; });
check("reject getters without invoking them", () => {
  let invoked = 0;
  const candidate = structuredClone(fixture);
  Object.defineProperty(candidate.definition.actorDefaults, "stamina", { enumerable: true, get() { invoked += 1; throw new Error("getter ran"); } });
  assert.ok(validate(candidate).length);
  assert.equal(invoked, 0);
});
check("inspection exceptions yield bounded diagnostics", () => {
  const hostile = new Proxy({}, { ownKeys() { throw new Error("no inspection"); } });
  assert.ok(validate(hostile).length);
});
check("frozen valid input is not mutated", () => {
  const candidate = structuredClone(fixture);
  const freeze = (value: any) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(candidate);
  assert.deepEqual(validate(candidate), []);
  assert.deepEqual(candidate, fixture);
});
check("shared acyclic schema children remain valid", () => {
  const candidate = structuredClone(fixture);
  candidate.schemas.actor.properties.grit = candidate.schemas.actor.properties.wits;
  assert.deepEqual(validate(candidate), []);
});

for (const keyword of ["$ref", "$defs", "items", "allOf", "anyOf", "oneOf", "pattern", "format", "default", "if"]) {
  invalid(`reject unsupported schema keyword ${keyword}`, (m) => { m.schemas.actor.properties.wits[keyword] = "unsupported"; });
}
invalid("reject inline/path schema mix", (m) => { m.schemas.item = "schemas/item.json"; });
invalid("reject entrypoint code", (m) => { m.entrypoints.server = "server.js"; });
invalid("reject unknown definition member", (m) => { m.definition.execute = "process.exit()"; });
invalid("reject missing actor required property", (m) => { delete m.definition.actorDefaults.wits; });
invalid("reject wrong item value type", (m) => { m.definition.itemDefaults.weight = "1"; });
invalid("reject undeclared item default property", (m) => { m.definition.itemDefaults.damage = 99; });
invalid("reject undeclared required name", (m) => { m.schemas.item.required.push("damage"); });
invalid("reject duplicate required names", (m) => { m.schemas.item.required.push("weight"); });
invalid("reject additionalProperties true", (m) => { m.schemas.item.additionalProperties = true; });
invalid("reject inverted numeric bounds", (m) => { m.schemas.actor.properties.wits.minimum = 5; });
invalid("reject nonfinite numeric bounds", (m) => { m.schemas.actor.properties.wits.maximum = Infinity; });
invalid("reject unsafe integer bounds", (m) => { m.schemas.actor.properties.wits.maximum = Number.MAX_SAFE_INTEGER + 1; });
invalid("reject excessive enum values", (m) => { m.schemas.item.properties.quality.enum = Array.from({ length: 17 }, (_, i) => String(i)); });
invalid("reject enum values outside type", (m) => { m.schemas.item.properties.quality.enum = [1]; });
invalid("reject duplicate enum values", (m) => { m.schemas.item.properties.quality.enum = ["basic", "basic"]; });
invalid("reject empty sheet field path", (m) => { m.definition.sheet.fields[0].path = []; });
invalid("reject object-valued sheet field", (m) => {
  m.schemas.actor.properties.profile = { type: "object", properties: {}, required: [], additionalProperties: false };
  m.definition.actorDefaults.profile = {};
  m.definition.sheet.fields[0].path = ["profile"];
});
invalid("reject metadata-style path escape", (m) => { m.definition.sheet.fields[0].path = ["data", "wits"]; });
invalid("reject undeclared path", (m) => { m.definition.sheet.fields[0].path = ["missing"]; });
invalid("reject string path", (m) => { m.definition.sheet.fields[0].path = "wits"; });
invalid("reject duplicate sheet fields", (m) => { m.definition.sheet.fields.push(m.definition.sheet.fields[0]); });
invalid("reject oversized label", (m) => { m.definition.sheet.fields[0].label = "x".repeat(129); });
invalid("reject too many sheet fields", (m) => { m.definition.sheet.fields = Array(33).fill(m.definition.sheet.fields[0]); });
invalid("reject too many rolls", (m) => { m.definition.quickRolls = Array(33).fill(m.definition.quickRolls[0]); });
invalid("reject duplicate roll IDs", (m) => { m.definition.quickRolls[1].id = "survey"; });
for (const count of [0, 21, 1.5, "2", NaN, Infinity]) invalid(`reject dice count ${String(count)}`, (m) => { m.definition.quickRolls[0].dice.count = count; });
for (const sides of [1, 3, 30, "6"]) invalid(`reject dice sides ${String(sides)}`, (m) => { m.definition.quickRolls[0].dice.sides = sides; });
invalid("reject formula injection", (m) => { m.definition.quickRolls[0].formula = "20d100"; });
invalid("reject unsafe bonus", (m) => { m.definition.quickRolls[0].dice.bonus = Number.MAX_SAFE_INTEGER + 1; });
invalid("reject aggregate roll overflow", (m) => { m.definition.quickRolls[0].dice.bonus = Number.MAX_SAFE_INTEGER; });
invalid("reject more than four additive fields", (m) => { m.definition.quickRolls[0].dice.addFields = Array(5).fill(["wits"]); });
invalid("reject missing roll input default", (m) => { m.schemas.actor.required = ["grit", "stamina"]; delete m.definition.actorDefaults.wits; });
for (const amount of [0, -1, 1.5, "1", Infinity]) invalid(`reject cost amount ${String(amount)}`, (m) => { m.definition.quickRolls[1].cost.amount = amount; });
invalid("reject cost exceeding resource maximum", (m) => { m.definition.quickRolls[1].cost.amount = 7; });
invalid("reject fractional resource schema", (m) => { m.schemas.actor.properties.stamina.type = "number"; });
invalid("reject resource schema permitting negative values", (m) => { m.schemas.actor.properties.stamina.minimum = -1; });
invalid("reject unsupported capability", (m) => { m.capabilities.push("rest"); });
invalid("reject capability without matching behavior", (m) => { delete m.definition.quickRolls[1].cost; });
check("enforce complete-manifest UTF-8 byte budget", () => {
  const candidate = structuredClone(fixture);
  candidate.definition.extra = "界".repeat(22_000);
  assert.ok(validate(candidate).some((issue) => issue.code === "size_limit"));
});
check("actor and item schemas share one property budget", () => {
  const candidate = structuredClone(fixture);
  const current = Object.keys(candidate.schemas.actor.properties).length + Object.keys(candidate.schemas.item.properties).length;
  for (let index = current; index < 64; index += 1) {
    candidate.schemas.item.properties[`extra${index}`] = { type: "boolean" };
  }
  assert.deepEqual(validate(candidate), []);
  candidate.schemas.actor.properties.oneTooMany = { type: "boolean" };
  assert.ok(validate(candidate).some((issue) => issue.code === "property_limit"));
});

check("actor and item candidate validation rejects scalar coercion and extras", () => {
  assert.deepEqual(validateDeclarativeSystemData(fixture.schemas.actor, fixture.definition.actorDefaults), []);
  assert.ok(validateDeclarativeSystemData(fixture.schemas.actor, { ...fixture.definition.actorDefaults, wits: "2" }).length);
  assert.ok(validateDeclarativeSystemData(fixture.schemas.item, { weight: 1, quality: "invalid" }).length);
  assert.ok(validateDeclarativeSystemData(fixture.schemas.item, { ...fixture.definition.itemDefaults, extra: true }).length);
});
check("path helpers do not read inherited values or accessors", () => {
  assert.equal(getDeclarativeSystemValue(Object.create({ wits: 2 }), ["wits"]), undefined);
  assert.equal(getDeclarativeSystemValue(fixture.definition.actorDefaults, ["wits"]), 2);
  assert.equal(getDeclarativeSystemValue(fixture.definition.actorDefaults, ["__proto__"]), undefined);
  let calls = 0;
  const getter = { get wits() { calls += 1; return 2; } };
  assert.equal(getDeclarativeSystemValue(getter, ["wits"]), undefined);
  assert.equal(calls, 0);
  assert.equal(declarativeSystemSchemaAtPath(fixture.schemas.actor, ["wits"])?.type, "integer");
  assert.equal(declarativeSystemSchemaAtPath(fixture.schemas.actor, ["constructor"]), undefined);
});
check("property and object-depth limits apply to nested schemas", () => {
  const scalar = { type: "integer", minimum: 0, maximum: 4 };
  const object = (properties: any) => ({ type: "object", properties, required: [], additionalProperties: false });
  assert.deepEqual(validateDeclarativeSystemSchema(object(objectEntries(64, scalar))), []);
  assert.ok(validateDeclarativeSystemSchema(object(objectEntries(65, scalar))).length);
  const fourth = object({ nested: object({ nested: object({ nested: object({ value: scalar }) }) }) });
  assert.deepEqual(validateDeclarativeSystemSchema(fourth), []);
  assert.ok(validateDeclarativeSystemSchema(object({ nested: fourth })).length);
});
function objectEntries(count: number, value: unknown) { return Object.fromEntries(Array.from({ length: count }, (_, i) => [`field${i}`, value])); }

check("public helpers reject sparse path indexes", () => {
  const schema = structuredClone(fixture.schemas.actor);
  schema.properties.undefined = { type: "integer", minimum: 0, maximum: 7 };
  const path = Array(1);
  assert.equal(getDeclarativeSystemValue({ undefined: 7 }, path), undefined);
  assert.equal(declarativeSystemSchemaAtPath(schema, path), undefined);
});

check("public helpers reject accessor path indexes without invoking them", () => {
  let calls = 0;
  const path = ["wits"];
  Object.defineProperty(path, "0", {
    enumerable: true,
    get() { calls += 1; throw new Error("path getter ran"); },
  });
  assert.equal(getDeclarativeSystemValue(fixture.definition.actorDefaults, path), undefined);
  assert.equal(declarativeSystemSchemaAtPath(fixture.schemas.actor, path), undefined);
  assert.equal(calls, 0);
});

for (const key of ["every", Symbol.iterator]) {
  check(`public helpers reject custom path ${String(key)} without invoking it`, () => {
    let calls = 0;
    const path = ["wits"];
    Object.defineProperty(path, key, {
      enumerable: true,
      value() { calls += 1; throw new Error("custom path method ran"); },
    });
    assert.equal(getDeclarativeSystemValue(fixture.definition.actorDefaults, path), undefined);
    assert.equal(declarativeSystemSchemaAtPath(fixture.schemas.actor, path), undefined);
    assert.equal(calls, 0);
  });
}

for (const trap of ["getPrototypeOf", "getOwnPropertyDescriptor", "ownKeys"] as const) {
  check(`public helpers contain thrown path inspection: ${trap}`, () => {
    const path = new Proxy(["wits"], {
      [trap]() { throw new Error("inspection failed"); },
    });
    assert.equal(getDeclarativeSystemValue(fixture.definition.actorDefaults, path), undefined);
    assert.equal(declarativeSystemSchemaAtPath(fixture.schemas.actor, path), undefined);
  });
}

check("public helpers copy path descriptors without ordinary property reads", () => {
  let reads = 0;
  const path = new Proxy(["wits"], {
    get() { reads += 1; throw new Error("ordinary path read"); },
  });
  assert.equal(getDeclarativeSystemValue(fixture.definition.actorDefaults, path), 2);
  assert.equal(declarativeSystemSchemaAtPath(fixture.schemas.actor, path)?.type, "integer");
  assert.equal(reads, 0);
});

check("manifest validation contains proxy failures after JSON inspection", () => {
  const candidate = new Proxy(structuredClone(fixture), {
    get(target, key, receiver) {
      if (key === "entrypoints") throw new Error("late manifest read");
      return Reflect.get(target, key, receiver);
    },
  });
  assert.ok(validate(candidate).some((issue) => issue.code === "json_inspection"));
  assert.deepEqual(declarativeSystemCapabilities(candidate), []);
});

check("schema validation contains proxy failures after JSON inspection", () => {
  const schema = new Proxy(structuredClone(fixture.schemas.actor), {
    get(target, key, receiver) {
      if (key === "type") throw new Error("late schema read");
      return Reflect.get(target, key, receiver);
    },
  });
  assert.ok(validateDeclarativeSystemSchema(schema).some((issue) => issue.code === "json_inspection"));
});

check("data validation contains proxy failures after JSON inspection", () => {
  const data = new Proxy(structuredClone(fixture.definition.actorDefaults), {
    get(target, key, receiver) {
      if (key === "wits") throw new Error("late data read");
      return Reflect.get(target, key, receiver);
    },
  });
  assert.ok(validateDeclarativeSystemData(fixture.schemas.actor, data).some((issue) => issue.code === "json_inspection"));
});


check("ordinary manifest validation rejects metadata getters before reading them", () => {
  let reads = 0;
  const candidate = structuredClone(fixture);
  Object.defineProperty(candidate, "id", { enumerable: true, get() { reads += 1; return "lantern-survey"; } });
  assert.throws(() => validateSystemManifest(candidate), SystemManifestValidationError);
  assert.equal(reads, 0);
});

check("32 unique sheet fields pass and the 33rd fails the field count limit", () => {
  const candidate = structuredClone(fixture);
  candidate.definition.sheet.fields = [];
  for (let index = 0; index < 33; index += 1) {
    candidate.schemas.actor.properties[`field${index}`] = { type: "boolean" };
    if (index < 32) candidate.definition.sheet.fields.push({ path: [`field${index}`], label: `Field ${index}`, editable: true });
  }
  assert.deepEqual(validate(candidate), []);
  candidate.definition.sheet.fields.push({ path: ["field32"], label: "Last field", editable: true });
  assert.ok(validate(candidate).some((issue) => issue.code === "array_limit" && issue.path.join(".") === "definition.sheet.fields"));
});

check("32 unique rolls pass and the 33rd fails the roll count limit", () => {
  const candidate = structuredClone(fixture);
  for (let index = 2; index < 32; index += 1) candidate.definition.quickRolls.push({ ...structuredClone(candidate.definition.quickRolls[0]), id: `roll-${index}` });
  assert.deepEqual(validate(candidate), []);
  candidate.definition.quickRolls.push({ ...structuredClone(candidate.definition.quickRolls[0]), id: "roll-32" });
  assert.ok(validate(candidate).some((issue) => issue.code === "array_limit" && issue.path.join(".") === "definition.quickRolls"));
});

check("16 enum entries pass with a valid default and the 17th fails the enum count", () => {
  const candidate = structuredClone(fixture);
  candidate.schemas.item.properties.quality.enum = ["basic", ...Array.from({ length: 15 }, (_, index) => `value-${index}`)];
  assert.deepEqual(validate(candidate), []);
  candidate.schemas.item.properties.quality.enum.push("value-15");
  assert.ok(validate(candidate).some((issue) => issue.code === "array_limit" && issue.path.join(".") === "schemas.item.properties.quality.enum"));
});

check("record text and schema maxLength enforce their own 1000-character limits", () => {
  const schema = structuredClone(fixture.schemas.item);
  delete schema.properties.quality.enum;
  schema.properties.quality.maxLength = 1000;
  assert.deepEqual(validateDeclarativeSystemData(schema, { weight: 1, quality: "x".repeat(1000) }), []);
  assert.ok(validateDeclarativeSystemData(schema, { weight: 1, quality: "x".repeat(1001) }).some((issue) => issue.code === "value_length" && issue.path.join(".") === "data.quality"));
  schema.properties.quality.maxLength = 1001;
  assert.ok(validateDeclarativeSystemSchema(schema).some((issue) => issue.code === "text_limit"));
});

check("four own path segments pass and the fifth fails independently of schema depth", () => {
  const candidate = structuredClone(fixture);
  const wrap = (key: string, child: unknown) => ({ type: "object", properties: { [key]: child }, required: [key], additionalProperties: false });
  candidate.schemas.actor.properties.a = wrap("b", wrap("c", wrap("value", { type: "boolean" })));
  candidate.definition.actorDefaults.a = { b: { c: { value: true } } };
  candidate.definition.sheet.fields[0].path = ["a", "b", "c", "value"];
  assert.deepEqual(validate(candidate), []);
  candidate.definition.sheet.fields[0].path.push("extra");
  assert.ok(validate(candidate).some((issue) => issue.code === "path" && issue.path.join(".") === "definition.sheet.fields.0.path"));
});

check("every supported dice size accepts the minimum and maximum count", () => {
  for (const sides of [4, 6, 8, 10, 12, 20, 100]) for (const count of [1, 20]) {
    const candidate = structuredClone(fixture);
    candidate.definition.quickRolls[0].dice.count = count;
    candidate.definition.quickRolls[0].dice.sides = sides;
    assert.deepEqual(validate(candidate), []);
  }
});

check("diagnostic count and paths remain bounded and independent of object insertion order", () => {
  const schema = { type: "object", properties: {}, required: [], additionalProperties: false };
  const data = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`${index}-${"x".repeat(300)}`, true]));
  const issues = validateDeclarativeSystemData(schema, data);
  assert.equal(issues.length, 32);
  assert.ok(issues.every((issue) => issue.path.every((part) => part.length <= 128)));
  assert.deepEqual(validateDeclarativeSystemData(schema, Object.fromEntries(Object.entries(data).reverse())), issues);
});

check("a general number field permits fractions in records but requires integral initial roll inputs", () => {
  const candidate = structuredClone(fixture);
  candidate.schemas.actor.properties.wits.type = "number";
  assert.deepEqual(validate(candidate), []);
  assert.deepEqual(validateDeclarativeSystemData(candidate.schemas.actor, { ...candidate.definition.actorDefaults, wits: 1.5 }), []);
  candidate.definition.actorDefaults.wits = 1.5;
  assert.ok(validate(candidate).some((issue) => issue.code === "roll_default"));
});
