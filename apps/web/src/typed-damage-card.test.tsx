import type { Actor } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TypedDamageCard, normalizedMixedDamageComponents, resolvedMixedDamageComponents } from "./typed-damage-card.js";

const actor = {
  id: "actor-1",
  campaignId: "campaign-1",
  systemId: "dnd-5e-srd",
  ownerUserId: "user-1",
  type: "character",
  name: "Nyx",
  data: { hp: { current: 10, max: 10 } },
  permissions: {},
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
} as Actor;

describe("TypedDamageCard", () => {
  it("keeps the backward-compatible single amount and formula modes", () => {
    const html = renderToStaticMarkup(<TypedDamageCard campaignId="campaign-1" actor={actor} actors={[actor]} canApply onApplied={vi.fn()} />);
    expect(html).toContain("Fixed amount");
    expect(html).toContain("Server roll formula");
    expect(html).toContain("Damage type");
    expect(html).toContain("Critical hit");
    expect(html).toContain("two failed Death Saves");
  });

  it("blocks empty, fractional, negative, and over-limit mixed rows", () => {
    expect(normalizedMixedDamageComponents([])).toBeUndefined();
    expect(normalizedMixedDamageComponents([{ id: "one", amount: "", damageType: "fire" }])).toBeUndefined();
    expect(normalizedMixedDamageComponents([{ id: "one", amount: "1.5", damageType: "fire" }])).toBeUndefined();
    expect(normalizedMixedDamageComponents([{ id: "one", amount: "-1", damageType: "fire" }])).toBeUndefined();
    expect(normalizedMixedDamageComponents([{ id: "one", amount: "2", damageType: " " }])).toBeUndefined();
    expect(normalizedMixedDamageComponents(Array.from({ length: 9 }, (_, index) => ({ id: String(index), amount: "1", damageType: "fire" })))).toBeUndefined();
    expect(normalizedMixedDamageComponents([{ id: "one", amount: "3", damageType: " Fire " }])).toEqual([{ amount: 3, damageType: "fire" }]);
  });

  it("reads authoritative per-component defense results without flattening them", () => {
    expect(resolvedMixedDamageComponents({ components: [
      { amount: 5, damageType: "slashing", adjustedAmount: 2, defense: "resistance" },
      { amount: 4, damageType: "fire", adjustedAmount: 8, defense: "vulnerability" }
    ] })).toEqual([
      { amount: 5, damageType: "slashing", adjustedAmount: 2, defense: "resistance" },
      { amount: 4, damageType: "fire", adjustedAmount: 8, defense: "vulnerability" }
    ]);
    expect(resolvedMixedDamageComponents({ components: [{ amount: "5", damageType: "fire", adjustedAmount: 5, defense: "normal" }] })).toEqual([]);
  });
});
