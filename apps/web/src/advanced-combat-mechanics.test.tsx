import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdvancedCombatMechanics, scheduledEffectConsequenceReview } from "./advanced-combat-mechanics.js";

function expectExplicitLabel(html: string, label: string, control: "input" | "select" | "textarea") {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelMatch = html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*><span>${escapedLabel}</span>`));
  expect(labelMatch, `${label} should be associated with a form control`).not.toBeNull();
  expect(html).toMatch(new RegExp(`<${control}[^>]*id="${labelMatch?.[1]}"`));
}

describe("AdvancedCombatMechanics", () => {
  it("renders accessible reviewed controls for environment, effect, and spell workflows", () => {
    const actor = createTimestamped("act", {
      id: "act_ui_caster",
      campaignId: "camp_ui",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_ui",
      type: "character" as const,
      name: "UI Caster",
      data: {
        rulesEngine: {
          activeEffects: [{ id: "effect_ui", label: "Lingering frost", schedule: { timing: "end_turn" } }],
        },
      },
      permissions: {},
    }) satisfies Actor;
    const combat = createTimestamped("cmb", {
      id: "cmb_ui",
      campaignId: "camp_ui",
      active: true,
      round: 2,
      turnIndex: 0,
      combatants: [{ id: "cmbt_ui", tokenId: "tok_ui", actorId: actor.id, name: actor.name, initiative: 18, defeated: false }],
      environmentMechanics: [createTimestamped("cmech", {
        id: "cmech_ui",
        kind: "lair_action" as const,
        name: "Icy pulse",
        description: "Resolve the pulse manually.",
        visibility: "gm_only" as const,
        enabled: true,
        schedule: { timing: "initiative_count" as const, initiativeCount: 20, startsAtRound: 1, intervalRounds: 1 },
        options: [],
        triggerCount: 0,
      })],
    }) satisfies Combat;

    const html = renderToStaticMarkup(
      <AdvancedCombatMechanics
        campaignId="camp_ui"
        combat={combat}
        actors={[actor]}
        canManage
        canManageEffects
        canPreviewEffects
        onCombatUpdated={() => undefined}
        onRefresh={async () => undefined}
        onStatus={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Advanced D&amp;D combat mechanics"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Lair &amp; regional mechanics");
    expect(html).toContain("Icy pulse");
    expect(html).toContain("Scheduled effects");
    expect(html).toContain("Lingering frost");
    expect(html).toContain("Apply reviewed outcomes");
    expect(html).toContain("Specialized spell helpers");
    expect(html).toContain('aria-label="Spell helper targets"');
    expect(html).toContain("Damage, movement, and map geometry remain manual");
    expectExplicitLabel(html, "Kind", "select");
    expectExplicitLabel(html, "Name", "input");
    expectExplicitLabel(html, "Description", "textarea");
    expectExplicitLabel(html, "Visibility", "select");
    expectExplicitLabel(html, "Timing", "select");
    expectExplicitLabel(html, "Initiative", "input");
    expectExplicitLabel(html, "Evaluate phase", "select");
    expectExplicitLabel(html, "Caster", "select");
    expectExplicitLabel(html, "Spell", "select");
    expectExplicitLabel(html, "Slot level", "input");
    expectExplicitLabel(html, "Targets", "select");
  });

  it("hides direct mutation controls when the caller lacks manage permissions", () => {
    const combat = createTimestamped("cmb", {
      id: "cmb_ui_readonly",
      campaignId: "camp_ui",
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [],
    }) satisfies Combat;
    const html = renderToStaticMarkup(
      <AdvancedCombatMechanics
        campaignId="camp_ui"
        combat={combat}
        actors={[]}
        canManage={false}
        canManageEffects={false}
        canPreviewEffects={false}
        onCombatUpdated={() => undefined}
        onRefresh={async () => undefined}
        onStatus={() => undefined}
      />,
    );

    expect(html).not.toContain("Add mechanic");
    expect(html).not.toContain("Apply reviewed outcomes");
    expect(html).toContain("No environment prompts authored");
  });

  it("maps server-produced scheduled effects into labeled review sections", () => {
    const review = scheduledEffectConsequenceReview({
      phase: "end_turn", round: 2, turnIndex: 0, canApply: true, unresolvedEventIds: [], combatUpdatedAt: "2026-07-15T00:00:00.000Z",
      events: [{ id: "evt", effectId: "effect", actorId: "actor", label: "Burning", phase: "end_turn", round: 2, turnIndex: 0, status: "triggered", createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z" }],
      actorChanges: [{ actorId: "actor", reason: "Apply 4 fire damage" }]
    }, [{ id: "actor", campaignId: "camp", systemId: "dnd-5e-srd", type: "character", name: "Ari", data: {}, permissions: {}, createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z" }]);

    expect(review.sections.map((section) => section.label)).toEqual(["Effect events", "Actor changes"]);
    expect(review.sections[0]?.items[0]?.value).toContain("Ari");
  });
});
