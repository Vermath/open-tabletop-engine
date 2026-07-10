import { describe, expect, it } from "vitest";
import type { SystemManifest } from "./index.js";
import { createSystemRegistry, registerSystem, systemCoreCompatibility, validateSystemManifest } from "./index.js";

const validManifest: SystemManifest = {
  id: "test-system",
  name: "Test System",
  version: "1.0.0",
  compatibleCore: "^0.3.0",
  entrypoints: {},
  schemas: { actor: "schemas/actor.json", item: "schemas/item.json" },
  permissions: [],
  capabilities: ["data-model"]
};

describe("system manifest validation", () => {
  it("accepts a complete manifest", () => {
    expect(() => validateSystemManifest(validManifest)).not.toThrow();
  });

  it("rejects missing nested manifest objects with stable validation errors", () => {
    expect(() => validateSystemManifest({ ...validManifest, schemas: undefined } as unknown as SystemManifest)).toThrow("actor and item schemas");
    expect(() => validateSystemManifest({ ...validManifest, entrypoints: undefined } as unknown as SystemManifest)).toThrow("requires entrypoints");
  });

  it("rejects incomplete compatibility and permission declarations", () => {
    expect(() => validateSystemManifest({ ...validManifest, compatibleCore: "" })).toThrow("compatible core version range");
    expect(() => validateSystemManifest({ ...validManifest, permissions: undefined } as unknown as SystemManifest)).toThrow("permissions must be an array");
  });

  it("enforces semantic ids, versions, compatible core, least-privilege permissions, paths, and capabilities", () => {
    expect(() => validateSystemManifest({ ...validManifest, id: "Unsafe ID" })).toThrow("lowercase kebab-case");
    expect(() => validateSystemManifest({ ...validManifest, version: "latest" })).toThrow("semantic version");
    expect(() => validateSystemManifest({ ...validManifest, compatibleCore: ">=9.0.0" })).toThrow("incompatible with OpenTabletop core");
    expect(() => validateSystemManifest({ ...validManifest, permissions: ["campaign.delete"] })).toThrow("unsupported permissions");
    expect(() => validateSystemManifest({ ...validManifest, schemas: { actor: "../actor.json", item: "schemas/item.json" } })).toThrow("safe relative package paths");
    expect(() => validateSystemManifest({ ...validManifest, capabilities: [] })).toThrow("non-empty array");
    expect(() => validateSystemManifest({ ...validManifest, arbitraryRuntimeConfig: true } as unknown as SystemManifest)).toThrow("unknown fields");
    expect(systemCoreCompatibility(">=0.1.0 <1.0.0")).toEqual({ valid: true, satisfied: true });
  });

  it("rejects duplicate ids and names in the in-memory SDK registry", () => {
    const registry = registerSystem(createSystemRegistry(), validManifest);
    expect(() => registerSystem(registry, validManifest)).toThrow("id is already registered");
    expect(() => registerSystem(registry, { ...validManifest, id: "other-system" })).toThrow("name is already registered");
  });
});
