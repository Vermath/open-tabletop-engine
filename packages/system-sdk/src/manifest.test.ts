import { describe, expect, it } from "vitest";
import type { SystemManifest } from "./index.js";
import { validateSystemManifest } from "./index.js";

const validManifest: SystemManifest = {
  id: "test-system",
  name: "Test System",
  version: "1.0.0",
  compatibleCore: "^0.3.0",
  entrypoints: {},
  schemas: { actor: "schemas/actor.json", item: "schemas/item.json" },
  permissions: []
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
});
