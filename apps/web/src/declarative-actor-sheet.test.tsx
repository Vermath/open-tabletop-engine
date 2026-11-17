import type { Actor, DeclarativeActorSheet as Sheet } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeclarativeActorSheet } from "./declarative-actor-sheet.js";

const actor = { id: "hero", campaignId: "campaign", systemId: "external-rules", name: "Hero", type: "traveler", data: { focus: 3, ready: false }, permissions: {}, createdAt: "r1", updatedAt: "r1" } as Actor;
const sheet: Sheet = {
  kind: "declarative-v1", actorId: actor.id, actorUpdatedAt: actor.updatedAt,
  system: { systemId: actor.systemId, version: "1.2.0", checksum: "a".repeat(64) },
  fields: [
    { path: ["focus"], label: "Focus", editable: true, required: true, present: true, value: 3, schema: { type: "integer", minimum: 0, maximum: 6 } },
    { path: ["ready"], label: "Ready", editable: true, required: true, present: true, value: false, schema: { type: "boolean" } },
    { path: ["missing"], label: "Missing field", editable: true, required: false, present: false, schema: { type: "string", maxLength: 20 } }
  ],
  quickRolls: [
    { id: "cast", label: "Cast", formula: "2d6+7", available: true, cost: { path: ["focus"], amount: 2, before: 3, after: 1 }, issues: [] },
    { id: "sealed", label: "Sealed power", available: false, issues: [{ path: ["focus"], code: "insufficient_resource", message: "Requires five Focus." }] }
  ]
};

function html(canEdit = true, canRoll = true, revision = "r1") {
  return renderToStaticMarkup(<DeclarativeActorSheet campaignId="campaign" currentUserId="user" actor={{ ...actor, updatedAt: revision }} sheet={sheet} canEdit={canEdit} canRoll={canRoll} onUpdated={vi.fn()} onRefresh={vi.fn()} />);
}

describe("declarative character sheet", () => {
  it("renders native fields and the host's exact roll formula, cost and availability diagnostics", () => {
    const result = html();
    expect(result).toContain('aria-label="Focus" type="number"');
    expect(result).toContain('aria-label="Ready" type="checkbox"');
    expect(result).toMatch(/aria-label="Missing field"[^>]*disabled=""/);
    expect(result).toContain("2d6+7");
    expect(result).toContain("Cost: 2 focus (3 → 1)");
    expect(result).toContain("Requires five Focus.");
    expect(result).toMatch(/aria-label="Roll Sealed power"[^>]*disabled=""/);
    expect(result).not.toContain("1d20");
    expect(result).not.toContain("Set HP");
  });

  it("combines host availability with current user edit and roll permissions", () => {
    const result = html(false, false);
    expect(result).toMatch(/aria-label="Focus"[^>]*disabled=""/);
    expect(result).toMatch(/aria-label="Roll Cast"[^>]*disabled=""/);
    expect(result).not.toContain("Save fields");
  });

  it("disables fields and rolls when the displayed sheet and actor revisions differ", () => {
    const result = html(true, true, "r2");
    expect(result).toContain("Refreshing the character revision");
    expect(result).toMatch(/aria-label="Focus"[^>]*disabled=""/);
    expect(result).toMatch(/aria-label="Roll Cast"[^>]*disabled=""/);
  });
});
