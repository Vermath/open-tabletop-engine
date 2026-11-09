import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { validateSystemManifest, validateDeclarativeSystemData, type DeclarativeSystemManifest } from "./index.js";

it("keeps the documented Lantern Road package installable with valid actor and item defaults", () => {
  const manifest = JSON.parse(readFileSync(new URL("../examples/lantern-road/system.json", import.meta.url), "utf8")) as DeclarativeSystemManifest;
  expect(() => validateSystemManifest(manifest)).not.toThrow();
  expect(validateDeclarativeSystemData(manifest.schemas.actor, manifest.definition.actorDefaults)).toEqual([]);
  expect(validateDeclarativeSystemData(manifest.schemas.item, manifest.definition.itemDefaults)).toEqual([]);
});
