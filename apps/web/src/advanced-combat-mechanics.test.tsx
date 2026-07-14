import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdvancedCombatMechanics } from "./advanced-combat-mechanics.js";

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
});
