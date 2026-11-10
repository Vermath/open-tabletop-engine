import assert from "node:assert/strict";
import { it as check } from "vitest";
import { parseFormula, probabilityRange, rollFormula } from "@open-tabletop/dice-engine";
import type { DeclarativeSystemManifest } from "@open-tabletop/core";
import {
  createDeclarativeSystemRuntime,
  declarativeSystemManifestChecksum,
  DeclarativeRuntimeError,
  type DeclarativeActorSnapshot,
  type DeclarativeSystemBinding,
  type DeclarativeRuntimeErrorCode,
} from "./declarative-system-runtime.js";

const fixture: DeclarativeSystemManifest = {
  "id": "runtime-adapter-probe",
  "name": "Runtime Adapter Probe",
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

function expectError(run: () => unknown, code: DeclarativeRuntimeErrorCode, issueCode?: string): void {
  assert.throws(run, (error: unknown) => error instanceof DeclarativeRuntimeError && error.code === code && error.issues.length > 0 && error.issues.length <= 32 && (!issueCode || error.issues.some((issue) => issue.code === issueCode)));
}
function binding(manifest = fixture): DeclarativeSystemBinding {
  return { campaignId: "campaign-probe", systemId: manifest.id, version: manifest.version, checksum: declarativeSystemManifestChecksum(manifest) };
}
function actor(manifest = fixture): DeclarativeActorSnapshot {
  return { id: "actor-probe", campaignId: "campaign-probe", systemId: manifest.id, type: manifest.definition.actorTypes[0]!, updatedAt: "2026-09-06T00:00:00.000Z", data: structuredClone(manifest.definition.actorDefaults) };
}
function request(manifest = fixture, record = actor(manifest), rollId = "push") {
  const { campaignId: _, ...expectedSystem } = binding(manifest);
  return { rollId, expectedActorUpdatedAt: record.updatedAt, expectedSystem };
}
function runtime(manifest = fixture) { return createDeclarativeSystemRuntime(manifest, binding(manifest)); }
function numericManifest(count: number, sides: 4 | 6 | 8 | 10 | 12 | 20 | 100, bonus: number, values: number[] = []): DeclarativeSystemManifest {
  const manifest = structuredClone(fixture);
  manifest.schemas.actor = { type: "object", additionalProperties: false, required: values.map((_, index) => `stat${index}`), properties: Object.fromEntries(values.map((value, index) => [`stat${index}`, { type: "integer", minimum: value, maximum: value }])) };
  manifest.definition.actorDefaults = Object.fromEntries(values.map((value, index) => [`stat${index}`, value]));
  manifest.definition.sheet.fields = [];
  manifest.definition.quickRolls = [{ id: "check", label: "Declared check", dice: { count, sides, bonus, addFields: values.map((_, index) => [`stat${index}`]) } }];
  manifest.capabilities = ["data-model", "quick-rolls"];
  return manifest;
}

check("sheet projects exact fields, constraints, values, revision and pin", () => {
  const sheet = runtime().sheet(actor());
  assert.equal(sheet.kind, "declarative-v1");
  assert.equal(sheet.actorId, "actor-probe");
  assert.equal(sheet.actorUpdatedAt, actor().updatedAt);
  assert.deepEqual(sheet.system, request().expectedSystem);
  assert.deepEqual(sheet.fields.map((field) => [field.path, field.label, field.value, field.required, field.present, field.editable]), [ [["wits"], "Wits", 2, true, true, true], [["grit"], "Grit", 1, true, true, true], [["stamina"], "Stamina", 6, true, true, true] ]);
  assert.deepEqual(sheet.fields[0]!.schema, { type: "integer", minimum: 0, maximum: 4 });
  assert.deepEqual(sheet.quickRolls.map((roll) => [roll.id, roll.formula, roll.available]), [["survey", "2d6+2", true], ["push", "2d6+1", true]]);
});
check("resource action returns a detached complete candidate and exact cost", () => {
  const record = actor();
  const before = structuredClone(record);
  const plan = runtime().prepareAction(record, request(fixture, record));
  assert.deepEqual(plan.cost, { path: ["stamina"], amount: 1, before: 6, after: 5 });
  assert.deepEqual(plan.actorData, { wits: 2, grit: 1, stamina: 5 });
  assert.equal(plan.actorChanged, true);
  assert.deepEqual(record, before);
  assert.notEqual(plan.actorData, record.data);
  assert.deepEqual(plan.system, request().expectedSystem);
});
check("free declared roll clones data without requesting an actor revision write", () => {
  const record = actor();
  const plan = runtime().prepareAction(record, request(fixture, record, "survey"));
  assert.equal(plan.actorChanged, false);
  assert.equal(plan.cost, undefined);
  assert.deepEqual(plan.actorData, record.data);
  assert.notEqual(plan.actorData, record.data);
});
check("exhausted resource blocks action but remains explainable on sheet", () => {
  const record = actor(); record.data.stamina = 0;
  const before = structuredClone(record);
  const roll = runtime().sheet(record).quickRolls.find((entry) => entry.id === "push")!;
  assert.equal(roll.available, false);
  assert.equal(roll.formula, "2d6+1");
  assert.ok(roll.issues.some((issue) => issue.code === "insufficient_resource"));
  expectError(() => runtime().prepareAction(record, request(fixture, record)), "roll_unavailable", "insufficient_resource");
  assert.deepEqual(record, before);
});
check("resource remainder must satisfy enum and minimum constraints", () => {
  for (const constraint of [{ minimum: 6, maximum: 6 }, { minimum: 0, maximum: 6, enum: [0, 2, 4, 6] }]) {
    const manifest = structuredClone(fixture);
    manifest.schemas.actor.properties.stamina = { type: "integer", ...constraint };
    const record = actor(manifest);
    assert.equal(runtime(manifest).quickRolls(record).find((entry) => entry.id === "push")!.available, false);
    expectError(() => runtime(manifest).prepareAction(record, request(manifest, record)), "roll_unavailable");
    assert.equal(record.data.stamina, 6);
  }
});
check("nested resource paths and scalar DTOs preserve unrelated data", () => {
  const manifest = structuredClone(fixture);
  manifest.schemas.actor = { type: "object", additionalProperties: false, required: ["stats", "pools", "ready"], properties: {
    stats: { type: "object", additionalProperties: false, required: ["skill"], properties: { skill: { type: "integer", minimum: 0, maximum: 4 } } },
    pools: { type: "object", additionalProperties: false, required: ["energy"], properties: { energy: { type: "integer", minimum: 0, maximum: 6 } } },
    ready: { type: "boolean", enum: [true, false] },
    optional: { type: "object", additionalProperties: false, required: ["note"], properties: { note: { type: "string", maxLength: 20 } } },
  } };
  manifest.definition.actorDefaults = { stats: { skill: 2 }, pools: { energy: 6 }, ready: true };
  manifest.definition.sheet.fields = [{ path: ["stats", "skill"], label: "Skill", editable: true }, { path: ["ready"], label: "Ready", editable: false }, { path: ["optional", "note"], label: "Note", editable: true }];
  manifest.definition.quickRolls = [{ id: "push", label: "Push", dice: { count: 2, sides: 6, bonus: 0, addFields: [["stats", "skill"]] }, cost: { path: ["pools", "energy"], amount: 2 } }];
  const record = actor(manifest), adapter = runtime(manifest);
  const sheet = adapter.sheet(record);
  assert.equal(sheet.fields[2]!.present, false);
  assert.equal(sheet.fields[2]!.required, false);
  assert.equal(sheet.fields[1]!.value, true);
  assert.equal(sheet.fields[1]!.editable, false);
  const plan = adapter.prepareAction(record, request(manifest, record));
  assert.deepEqual(plan.actorData, { stats: { skill: 2 }, pools: { energy: 4 }, ready: true });
  assert.deepEqual(record.data.pools, { energy: 6 });
});

for (const sides of [4, 6, 8, 10, 12, 20, 100] as const) for (const count of [1, 2, 20]) {
  check(`real dice parser/evaluator/range agree for ${count}d${sides}`, () => {
    const manifest = numericManifest(count, sides, 0, [3, -1]);
    const plan = runtime(manifest).prepareAction(actor(manifest), request(manifest, actor(manifest), "check"));
    assert.equal(plan.roll.formula, `${count}d${sides}+2`);
    assert.equal(parseFormula(plan.roll.formula).length, 2);
    assert.deepEqual(probabilityRange(plan.roll.formula), { min: count + 2, max: count * sides + 2 });
    assert.equal(rollFormula(plan.roll.formula, { rng: () => 0 }).total, count + 2);
    assert.equal(rollFormula(plan.roll.formula, { rng: () => 1 - Number.EPSILON }).total, count * sides + 2);
  });
}
for (const bonus of [-3, 0, 3, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 2_000]) {
  check(`real dice arithmetic stays exact at modifier ${bonus}`, () => {
    const manifest = numericManifest(20, 100, bonus);
    const formula = runtime(manifest).quickRolls(actor(manifest))[0]!.formula!;
    assert.equal(formula, `20d100${bonus === 0 ? "" : bonus > 0 ? `+${bonus}` : bonus}`);
    assert.deepEqual(probabilityRange(formula), { min: Number(BigInt(bonus) + 20n), max: Number(BigInt(bonus) + 2_000n) });
    assert.equal(rollFormula(formula, { rng: () => 0 }).total, Number(BigInt(bonus) + 20n));
    assert.equal(rollFormula(formula, { rng: () => 1 - Number.EPSILON }).total, Number(BigInt(bonus) + 2_000n));
  });
}
check("aggregation does not lose the small term between cancelling huge terms", () => {
  const manifest = numericManifest(1, 4, 0, [Number.MAX_SAFE_INTEGER, 1, -Number.MAX_SAFE_INTEGER]);
  assert.equal(runtime(manifest).quickRolls(actor(manifest))[0]!.formula, "1d4+1");
});
for (const bonus of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1_999]) {
  check(`reject definition whose possible total exceeds safe integer (${bonus})`, () => expectError(() => runtime(numericManifest(20, 100, bonus)), "invalid_definition", "roll_range"));
}
check("fractional current numeric field remains editable but is not rollable", () => {
  const manifest = structuredClone(fixture);
  manifest.schemas.actor.properties.wits = { type: "number", minimum: 0, maximum: 4 };
  const record = actor(manifest); record.data.wits = 2.5;
  const sheet = runtime(manifest).sheet(record);
  assert.equal(sheet.fields[0]!.value, 2.5);
  assert.equal(sheet.quickRolls[0]!.available, false);
  assert.equal(sheet.quickRolls[0]!.formula, undefined);
  expectError(() => runtime(manifest).prepareAction(record, request(manifest, record, "survey")), "roll_unavailable", "roll_integer");
});
check("missing optional additive and resource paths fail without invented defaults", () => {
  const manifest = structuredClone(fixture);
  manifest.schemas.actor.required = ["grit"];
  const record = actor(manifest); delete record.data.wits; delete record.data.stamina;
  const sheet = runtime(manifest).sheet(record);
  assert.equal(sheet.fields[0]!.present, false);
  assert.equal(sheet.fields[0]!.required, false);
  assert.deepEqual(sheet.quickRolls.map((roll) => roll.available), [false, false]);
  expectError(() => runtime(manifest).prepareAction(record, request(manifest, record)), "roll_unavailable", "resource_integer");
});

check("unrelated system IDs execute the same manifest-driven rules", () => {
  for (const id of ["independent-nebula-rules", "harbor-expedition-custom"]) {
    const manifest = { ...structuredClone(fixture), id, name: id };
    const plan = runtime(manifest).prepareAction(actor(manifest), request(manifest));
    assert.equal(plan.system.systemId, id);
    assert.equal(plan.roll.formula, "2d6+1");
    assert.equal(plan.actorData.stamina, 5);
  }
});
check("canonical checksum ignores recursive object order but preserves array order", () => {
  const reverse = (value: any): any => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)])) : value;
  assert.equal(declarativeSystemManifestChecksum(reverse(fixture)), binding().checksum);
  const changed = structuredClone(fixture); changed.definition.quickRolls.reverse();
  assert.notEqual(declarativeSystemManifestChecksum(changed), binding().checksum);
});
check("old checksum remains verifiable while current-host construction rejects compatibility", () => {
  const manifest = structuredClone(fixture); manifest.compatibleCore = ">=0.2.0 <0.3.0";
  const selected = binding(manifest);
  assert.equal(selected.checksum, declarativeSystemManifestChecksum(manifest));
  expectError(() => createDeclarativeSystemRuntime(manifest, selected), "invalid_definition", "manifest");
  assert.equal(createDeclarativeSystemRuntime(manifest, selected, { coreVersion: "0.2.0" }).binding.checksum, selected.checksum);
});
check("same-version tampering cannot reuse the existing checksum", () => {
  const manifest = structuredClone(fixture); manifest.definition.quickRolls[1]!.label = "Changed action";
  expectError(() => createDeclarativeSystemRuntime(manifest, binding()), "invalid_binding", "binding_mismatch");
});
check("captured definition/pin and later projections are detached from callers", () => {
  const manifest = structuredClone(fixture), selected = binding(manifest), record = actor(manifest);
  const adapter = createDeclarativeSystemRuntime(manifest, selected);
  manifest.definition.quickRolls[1]!.cost!.amount = 4;
  selected.version = "tampered";
  const sheet = adapter.sheet(record);
  sheet.system.version = "tampered";
  sheet.fields[0]!.path[0] = "tampered";
  const schema = sheet.fields[0]!.schema; if (schema.type === "integer") schema.maximum = 999;
  const plan = adapter.prepareAction(record, request()); plan.actorData.stamina = 999;
  assert.equal(adapter.prepareAction(record, request()).actorData.stamina, 5);
  assert.equal(adapter.sheet(record).fields[0]!.path[0], "wits");
  assert.equal(adapter.binding.version, fixture.version);
});

for (const key of ["campaignId", "systemId", "type"] as const) {
  check(`reject actor ${key} mismatch`, () => {
    const record = actor(); record[key] = "wrong";
    expectError(() => runtime().sheet(record), "invalid_actor");
  });
}
for (const value of [NaN, Infinity, -Infinity, 9, "2", null, Number.MAX_SAFE_INTEGER + 1]) {
  check(`reject schema-invalid actor value ${String(value)}`, () => {
    const record = actor(); record.data.wits = value;
    expectError(() => runtime().sheet(record), "invalid_actor");
  });
}
check("stale actor and system identity reject without changing the actor", () => {
  const record = actor(), before = structuredClone(record);
  expectError(() => runtime().prepareAction(record, { ...request(), expectedActorUpdatedAt: "old-revision" }), "stale_actor");
  for (const expectedSystem of [{ ...request().expectedSystem, version: "2.0.0" }, { ...request().expectedSystem, systemId: "other-system" }, { ...request().expectedSystem, checksum: "0".repeat(64) }]) {
    expectError(() => runtime().prepareAction(record, { ...request(), expectedSystem }), "stale_system");
  }
  assert.deepEqual(record, before);
});
check("unknown roll and missing reviewed identity are rejected", () => {
  expectError(() => runtime().prepareAction(actor(), { ...request(), rollId: "unknown" }), "unknown_roll");
  expectError(() => runtime().prepareAction(actor(), { rollId: "push" }), "invalid_request", "required");
});
for (const [key, value] of Object.entries({ formula: "100d100", cost: 0, consumeResources: false, useFreeResource: true, resourceAmount: 0, targets: [], effects: [], expectedCampaignUpdatedAt: "injected" })) {
  check(`reject injected action field ${key}`, () => expectError(() => runtime().prepareAction(actor(), { ...request(), [key]: value }), "invalid_request", "unsupported_field"));
}
check("request accessors, inherited fields, symbols and hidden fields are rejected", () => {
  let reads = 0;
  const getter = request(); Object.defineProperty(getter, "rollId", { enumerable: true, get() { reads += 1; return "push"; } });
  expectError(() => runtime().prepareAction(actor(), getter), "invalid_request");
  assert.equal(reads, 0);
  expectError(() => runtime().prepareAction(actor(), Object.create(request())), "invalid_request");
  const symbolic = { ...request(), [Symbol("override")]: true };
  expectError(() => runtime().prepareAction(actor(), symbolic), "invalid_request");
  const hidden = request(); Object.defineProperty(hidden, "hidden", { value: true });
  expectError(() => runtime().prepareAction(actor(), hidden), "invalid_request");
});
check("manifest accessors and sparse/extra-property paths reject before evaluation", () => {
  let reads = 0;
  const manifest = structuredClone(fixture); Object.defineProperty(manifest, "id", { enumerable: true, get() { reads += 1; return "unsafe"; } });
  expectError(() => declarativeSystemManifestChecksum(manifest), "invalid_definition");
  assert.equal(reads, 0);
  for (const path of [new Array(1), Object.assign(["wits"], { extra: true }), ["__proto__"]]) {
    const malformed = structuredClone(fixture); malformed.definition.quickRolls[0]!.dice.addFields = [path];
    expectError(() => declarativeSystemManifestChecksum(malformed), "invalid_definition");
  }
});
for (const [key, value] of Object.entries({ id: "Not an ID", version: "not-semver", name: "", compatibleCore: "not-a-range", permissions: ["server.admin"] })) {
  check(`factory enforces ordinary manifest ${key} validation`, () => {
    const manifest = { ...structuredClone(fixture), [key]: value } as DeclarativeSystemManifest;
    expectError(() => createDeclarativeSystemRuntime(manifest, binding(manifest)), "invalid_definition", "manifest");
  });
}
