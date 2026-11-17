import type { Actor, DeclarativeActorSheet, DeclarativeScalarSchema, DeclarativeSheetField } from "@open-tabletop/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));
vi.mock("./api.js", async () => ({
  ...await vi.importActual<typeof import("./api.js")>("./api.js"),
  apiPatch: api.patch,
  apiPost: api.post
}));

import {
  declarativeFieldKey,
  parseDeclarativeScalar,
  prepareDeclarativeActorSave,
  prepareDeclarativeRoll,
  rollDeclarativeActor,
  saveDeclarativeActor
} from "./declarative-system-client.js";

const revision = "2026-09-06T10:00:00.123Z";
const laterRevision = "2026-09-06T10:00:01.456Z";
const numberSchema: DeclarativeScalarSchema = { type: "number", minimum: -10, maximum: 10 };

function field(path: string[], schema: DeclarativeScalarSchema, value: string | number | boolean): DeclarativeSheetField {
  return { path, label: path.join(" "), schema, value, editable: true, required: true, present: true };
}

function fixture(): { actor: Actor; sheet: DeclarativeActorSheet } {
  const actor: Actor = {
    id: "actor/one", campaignId: "campaign/one", systemId: "custom/fantasy", name: "Mira", type: "character",
    permissions: {}, createdAt: revision, updatedAt: revision,
    data: {
      attributes: { might: 3, focus: 7 }, ready: true, title: "Scout",
      inventory: [{ id: "rope", quantity: 2 }], notes: { private: "Keep this entire branch" }
    }
  };
  return {
    actor,
    sheet: {
      kind: "declarative-v1", actorId: actor.id, actorUpdatedAt: revision,
      system: { systemId: actor.systemId, version: "1.0.0", checksum: "a".repeat(64) },
      fields: [
        field(["attributes", "might"], { type: "integer", minimum: 0, maximum: 10 }, 3),
        field(["ready"], { type: "boolean" }, true),
        field(["title"], { type: "string", maxLength: 30 }, "Scout")
      ],
      quickRolls: [{ id: "might-check", label: "Might check", formula: "1d20+3", available: true, issues: [] }]
    }
  };
}

beforeEach(() => {
  api.patch.mockReset();
  api.post.mockReset();
});

describe("declarative actor scalar edits", () => {
  it("parses native scalar values without treating an empty number field as zero", () => {
    expect(parseDeclarativeScalar(numberSchema, "0")).toBe(0);
    expect(parseDeclarativeScalar(numberSchema, " -2.5e0 ")).toBe(-2.5);
    expect(parseDeclarativeScalar({ type: "boolean" }, false)).toBe(false);
    expect(parseDeclarativeScalar({ type: "string", maxLength: 10 }, "0")).toBe("0");
    expect(parseDeclarativeScalar({ type: "string", maxLength: 10 }, "")).toBe("");
    for (const input of ["", " ", "NaN", "Infinity", "0x10", "3 apples", false]) {
      expect(() => parseDeclarativeScalar(numberSchema, input)).toThrow();
    }
    expect(() => parseDeclarativeScalar({ type: "boolean" }, "false")).toThrow();
  });

  it("enforces numeric bounds, integer precision, string length, and native enum values", () => {
    expect(() => parseDeclarativeScalar(numberSchema, "11")).toThrow();
    expect(() => parseDeclarativeScalar({ type: "integer", minimum: -10, maximum: 10 }, "1.5")).toThrow();
    expect(() => parseDeclarativeScalar({ type: "integer", minimum: 0, maximum: 1e20 }, "9007199254740992")).toThrow();
    expect(() => parseDeclarativeScalar({ type: "string", maxLength: 3 }, "four")).toThrow();
    expect(parseDeclarativeScalar({ ...numberSchema, enum: [0, 2] }, "2")).toBe(2);
    expect(() => parseDeclarativeScalar({ ...numberSchema, enum: [0, 2] }, "1")).toThrow();
    expect(() => parseDeclarativeScalar({ type: "boolean", enum: [true] }, false)).toThrow();
    expect(() => parseDeclarativeScalar({ type: "string", maxLength: 10, enum: ["Scout"] }, "scout")).toThrow();
  });

  it("changes only declared scalars in a complete cloned baseline and keeps the exact sheet revision", () => {
    const { actor, sheet } = fixture();
    const baseline = structuredClone(actor.data);
    const request = prepareDeclarativeActorSave(actor, sheet, {
      [declarativeFieldKey(["attributes", "might"])]: "0",
      [declarativeFieldKey(["ready"])]: false,
      [declarativeFieldKey(["title"])]: "Ranger"
    });

    expect(request.path).toBe("/api/v1/actors/actor%2Fone");
    expect(request.payload).toEqual({
      expectedUpdatedAt: sheet.actorUpdatedAt,
      data: { ...baseline, attributes: { might: 0, focus: 7 }, ready: false, title: "Ranger" }
    });
    expect(actor.data).toEqual(baseline);
    expect(request.payload.data.inventory).not.toBe(actor.data.inventory);
    expect(declarativeFieldKey(["attributes.might"])).not.toBe(declarativeFieldKey(["attributes", "might"]));
  });

  it("rejects a baseline from a different actor, system, or revision", () => {
    const { actor, sheet } = fixture();
    const inputs = { [declarativeFieldKey(["title"])]: "Ranger" };
    for (const changed of [{ ...actor, id: "another-actor" }, { ...actor, systemId: "another-system" }, { ...actor, updatedAt: laterRevision }]) {
      expect(() => prepareDeclarativeActorSave(changed, sheet, inputs)).toThrow("Actor and sheet revisions differ");
    }
    expect(actor.data.title).toBe("Scout");
  });

  it("rejects undeclared, readonly, absent, prototype, array, and nonscalar paths without mutating data", () => {
    const { actor, sheet } = fixture();
    const baseline = structuredClone(actor.data);
    for (const path of [[], ["__proto__", "polluted"], ["attributes", "constructor"], ["prototype"], ["attributes", "missing"], ["inventory", "0"], ["attributes"]]) {
      const candidate = { ...sheet, fields: [field(path, numberSchema, 3)] };
      expect(() => prepareDeclarativeActorSave(actor, candidate, { [declarativeFieldKey(path)]: "4" })).toThrow();
    }
    for (const flags of [{ editable: false }, { present: false }]) {
      const candidate = { ...sheet, fields: [{ ...sheet.fields[0]!, ...flags }] };
      expect(() => prepareDeclarativeActorSave(actor, candidate, { [declarativeFieldKey(["attributes", "might"])]: "4" })).toThrow("not editable");
    }
    expect(() => prepareDeclarativeActorSave(actor, sheet, { [declarativeFieldKey(["notes", "private"])]: "Replace" })).toThrow("not editable");
    expect(actor.data).toEqual(baseline);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });

  it("retries a prepared save with the captured body, revision, key, and abort signal", async () => {
    const { actor, sheet } = fixture();
    const inputs = { [declarativeFieldKey(["title"])]: "Ranger" };
    const request = prepareDeclarativeActorSave(actor, sheet, inputs);
    expect(prepareDeclarativeActorSave(actor, sheet, inputs).idempotencyKey).toBe(request.idempotencyKey);
    expect(prepareDeclarativeActorSave(actor, sheet, { [declarativeFieldKey(["title"])]: "Bard" }).idempotencyKey).not.toBe(request.idempotencyKey);
    const controller = new AbortController();
    api.patch.mockRejectedValueOnce(new Error("Response lost")).mockResolvedValueOnce(actor);

    await expect(saveDeclarativeActor(request, controller.signal)).rejects.toThrow("Response lost");
    actor.updatedAt = laterRevision;
    actor.data.title = "Other GM's edit";
    sheet.actorUpdatedAt = laterRevision;
    await saveDeclarativeActor(request, controller.signal);

    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch.mock.calls[1]).toEqual(api.patch.mock.calls[0]);
    expect(api.patch).toHaveBeenLastCalledWith(request.path, expect.objectContaining({ expectedUpdatedAt: revision, data: expect.objectContaining({ title: "Ranger" }) }), {
      signal: controller.signal, idempotencyKey: request.idempotencyKey
    });
  });
});

describe("declarative quick-roll requests", () => {
  it("retains captured campaign, actor, system identity, revision, and attempt on an uncertain retry", async () => {
    const { sheet } = fixture();
    const expectedSystem = { ...sheet.system };
    const request = prepareDeclarativeRoll("campaign/one", sheet, "might-check", "attempt-one");
    const controller = new AbortController();
    api.post.mockRejectedValueOnce(new Error("Response lost")).mockResolvedValueOnce({});
    await expect(rollDeclarativeActor(request, controller.signal)).rejects.toThrow("Response lost");

    sheet.actorId = "another-actor";
    sheet.actorUpdatedAt = laterRevision;
    sheet.system.checksum = "b".repeat(64);
    sheet.system.version = "2.0.0";
    await rollDeclarativeActor(request, controller.signal);

    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
    expect(api.post).toHaveBeenLastCalledWith(
      "/api/v1/campaigns/campaign%2Fone/systems/custom%2Ffantasy/actors/actor%2Fone/roll",
      { rollId: "might-check", expectedActorUpdatedAt: revision, expectedSystem },
      { signal: controller.signal, idempotencyKey: request.idempotencyKey }
    );
  });

  it("separates new roll intents and rejects unavailable or unknown rolls", () => {
    const { sheet } = fixture();
    const first = prepareDeclarativeRoll("campaign/one", sheet, "might-check", "attempt-one");
    expect(prepareDeclarativeRoll("campaign/one", sheet, "might-check", "attempt-one").idempotencyKey).toBe(first.idempotencyKey);
    expect(prepareDeclarativeRoll("campaign/one", sheet, "might-check", "attempt-two").idempotencyKey).not.toBe(first.idempotencyKey);
    expect(() => prepareDeclarativeRoll("campaign/one", sheet, "unknown", "attempt-one")).toThrow("unavailable");
    sheet.quickRolls[0]!.available = false;
    expect(() => prepareDeclarativeRoll("campaign/one", sheet, "might-check", "attempt-one")).toThrow("unavailable");
    expect(api.post).not.toHaveBeenCalled();
  });
});
