import type { Actor, CalculationFlags, CalculationTerm } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CalculationExplanationPanel,
  calculationExplanationPath,
  calculationFlagLabels,
  calculationOverrideLedger,
  calculationTermText,
} from "./calculation-explanation-panel.js";

const actor = {
  id: "actor/one",
  campaignId: "campaign/one",
  systemId: "dnd-5e-srd",
  ownerUserId: "user-one",
  type: "character",
  name: "Nyx",
  data: {},
  permissions: {},
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
} as Actor;

describe("CalculationExplanationPanel", () => {
  it("renders an accessible progressive loading surface for D&D actors", () => {
    const html = renderToStaticMarkup(<CalculationExplanationPanel campaignId="campaign/one" actor={actor} />);
    expect(html).toContain("How the numbers work");
    expect(html).toContain("Loading calculation sources...");
    expect(html).toContain('role="status"');
    expect(html).toContain("Server-computed results, ordered terms, and source provenance.");
  });

  it("formats review flags, signed terms, formulas, and encoded API paths", () => {
    const flags = {
      manual: true,
      override: false,
      unsupported: true,
      ambiguous: true,
      reasons: ["Review this field."],
    } satisfies CalculationFlags;
    expect(calculationFlagLabels(flags)).toEqual(["Manual", "Unsupported", "Ambiguous"]);
    expect(calculationTermText({ label: "Bonus", signedValue: 2, source: { kind: "actor", id: "actor", name: "Nyx" } })).toBe("+2");
    expect(calculationTermText({ label: "Penalty", signedValue: -1, source: { kind: "condition", id: "condition", name: "Exhaustion" } })).toBe("-1");
    expect(calculationTermText({ label: "Die", formula: "+1d4", source: { kind: "condition", id: "blessed", name: "Blessed" } } satisfies CalculationTerm)).toBe("+1d4");
    expect(calculationExplanationPath("campaign/one", "dnd 5.5e", "actor/one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%205.5e/actors/actor%2Fone/calculation-explanation",
    );
  });

  it("builds a dedicated ledger from manual and overridden fields", () => {
    const field = (id: string, flags: CalculationFlags) => ({ id, label: id, group: "defenses" as const, result: 10, terms: [], flags });
    const baseFlags = { manual: false, override: false, unsupported: false, ambiguous: false, reasons: [] } satisfies CalculationFlags;
    expect(calculationOverrideLedger([
      field("computed", baseFlags),
      field("manual", { ...baseFlags, manual: true, reasons: ["Entered by the GM."] }),
      field("override", { ...baseFlags, override: true }),
    ]).map((entry) => entry.id)).toEqual(["manual", "override"]);
  });

  it("keeps retry, ordered-term, source-link, and explicit-reason states in the implementation", () => {
    const source = readFileSync(resolve(__dirname, "calculation-explanation-panel.tsx"), "utf8");
    expect(source).toContain("Retry explanation");
    expect(source).toContain("field.terms.map");
    expect(source).toContain("field.flags.reasons.map");
    expect(source).toContain("term.source.url");
    expect(source).toContain('aria-label="Manual and override ledger"');
    expect(source).toContain("<details");
    expect(source).not.toContain("JSON.stringify");
    expect(source).not.toContain("console.");
  });
});
