import type { CalculationFieldExplanation } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RulesSupportBoundaryNotice, rulesBoundaryFromAction, rulesBoundaryFromCalculation, rulesBoundaryFromSpell } from "./rules-support-boundary.js";

const field = (flags: CalculationFieldExplanation["flags"]): CalculationFieldExplanation => ({
  id: "armor-class", group: "defenses", label: "Armor Class", result: 17, flags,
  terms: [{ label: "Base armor", signedValue: 15, source: { kind: "item", id: "itm_armor", name: "Chain Shirt", version: "5.2.1" } }],
});

describe("shared rules support boundary", () => {
  it("maps sourced calculations without hiding manual or unsupported state", () => {
    expect(rulesBoundaryFromCalculation(field({ manual: false, override: false, unsupported: false, ambiguous: false, reasons: [] }))).toMatchObject({ status: "automated", sources: ["Chain Shirt 5.2.1"] });
    expect(rulesBoundaryFromCalculation(field({ manual: true, override: true, unsupported: false, ambiguous: false, reasons: ["GM override is active."] }))).toMatchObject({ status: "manual", label: "DM decision", explanation: "GM override is active." });
    expect(rulesBoundaryFromCalculation(field({ manual: false, override: false, unsupported: true, ambiguous: true, reasons: ["Unknown homebrew field."] }))).toMatchObject({ status: "unsupported", explanation: "Unknown homebrew field." });
  });

  it("maps automated, pending/manual, and unsupported action consequences", () => {
    expect(rulesBoundaryFromAction(undefined, true, true).status).toBe("automated");
    expect(rulesBoundaryFromAction({ pendingChoice: { reason: "Choose a damage type." } }, true, true)).toMatchObject({ status: "manual", explanation: "Choose a damage type." });
    expect(rulesBoundaryFromAction({ manualResolutionRequired: { reason: "Custom shadow damage.", supportStatus: "unsupported" } }, true, true).status).toBe("unsupported");
    expect(rulesBoundaryFromAction(undefined, false, true).status).toBe("unsupported");
  });

  it("maps spell helper automation and renders text plus an accessible name", () => {
    const automated = rulesBoundaryFromSpell({ supported: true, automation: "schedule_template", manualSteps: [], warnings: [], source: "compendium:dnd:fireball" });
    const manual = rulesBoundaryFromSpell({ supported: true, automation: "preview_only", manualSteps: ["GM places the template."], warnings: [], source: "compendium:dnd:wall" });
    const unsupported = rulesBoundaryFromSpell({ supported: false, automation: "manual", manualSteps: [], warnings: ["No helper is registered."], source: "homebrew:spell" });
    expect(automated.status).toBe("automated");
    expect(manual.status).toBe("manual");
    expect(unsupported).toMatchObject({ status: "unsupported", explanation: "No helper is registered." });
    const html = renderToStaticMarkup(<RulesSupportBoundaryNotice boundary={manual} />);
    expect(html).toContain('aria-label="Rules support: DM decision"');
    expect(html).toContain("GM places the template");
    expect(html).not.toContain("No automatic mutation");
  });
});
