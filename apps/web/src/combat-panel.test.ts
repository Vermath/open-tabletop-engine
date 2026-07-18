import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Actor, Combat, CombatLegendaryActionPrompt } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { boundedCombatCounter, combatRosterPatch, CombatVitalsControls, LegendaryActionPromptCard, parseCombatantConditions } from "./combat-panel.js";

const source = readFileSync(resolve(__dirname, "combat-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const legendaryClientSource = readFileSync(resolve(__dirname, "legendary-action-client.ts"), "utf8").replace(/\r\n/g, "\n");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8").replace(/\r\n/g, "\n");

describe("combatant draft editing", () => {
  it("normalizes committed combat fields", () => {
    expect(parseCombatantConditions(" prone, stunned,  ")).toEqual(["prone", "stunned"]);
    expect(boundedCombatCounter("9")).toBe(3);
    expect(boundedCombatCounter("-1")).toBe(0);
  });

  it("keeps keystrokes local and commits once on blur", () => {
    expect(source).toContain("function CombatantDraftInput(props:");
    expect(source).toContain("if (pendingRef.current || draft === props.value) return;");
    expect(source).toContain("onChange={(event) => setDraft(event.target.value)}");
    expect(source).toContain("if (skipBlurCommitRef.current)");
    expect(source).toContain("void commit();");
    expect(source).not.toContain("onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { initiative:");
  });

  it("synchronously guards combat toggles, turn changes, and GM actions", () => {
    expect(source).toContain("const pendingControlsRef = useRef<Set<string>>(new Set());");
    expect(source).toContain("if (pendingControlsRef.current.has(key)) return;");
    expect(source).toContain("pendingControlsRef.current.add(key);");
    expect(source).toContain("pendingControlsRef.current.delete(key);");
    expect(source).toContain("runPendingControl(`action:${action.id}`");
    expect(source).toContain("runPendingControl(`turn:${props.combat!.id}`");
    expect(source).toContain("runPendingControl(`combatant:${combatant.id}:readiness`");
    expect(source).toContain("runPendingControl(`combatant:${combatant.id}:defeated`");
    expect(source).toContain("runPendingControl(`combatant:${combatant.id}:resource`");
    expect(source).toContain('runPendingControl("combat:start", "Start combat", props.onStart)');
    expect(source).toContain("<RetryableActionNotice");
    expect(source).not.toContain("console.error");
  });

  it("preserves the active combatant when initiative sorting changes around a roster update", () => {
    const combat = testCombat();
    const added = { id: "c", tokenId: "token-c", name: "C", initiative: 20, defeated: false };
    expect(combatRosterPatch(combat, [...combat.combatants, added])).toEqual({
      combatants: [...combat.combatants, added],
      turnIndex: 1
    });
    expect(combatRosterPatch(combat, combat.combatants.filter((combatant) => combatant.id !== "a"))).toEqual({
      combatants: [combat.combatants[1]],
      turnIndex: 0
    });
  });

  it("renders keyboard-reachable disabled vitals controls with a permission reason", () => {
    const html = renderToStaticMarkup(createElement(CombatVitalsControls, {
      actor: testActor(),
      combat: testCombat(),
      canAdjust: false,
      disabledReason: "Requires actor.update permission",
      onAdjust: async () => undefined
    }));
    expect(html).toContain('aria-label="Hero healing amount"');
    expect(html).toContain('aria-label="Hero temporary hit points"');
    expect(html).toContain('title="Requires actor.update permission"');
    expect(html).toContain("disabled");
  });

  it("connects damage, healing, temporary HP, and roster changes to authoritative App handlers", () => {
    expect(source).toContain("<TypedDamageCard");
    expect(source).toContain('onAdjust(props.actor, kind, amount, props.combat)');
    expect(source).toContain("Keep the selected token and initiative available for explicit retry.");
    expect(source).toContain("Preserve both drafts so correcting a conflict or retrying never loses input.");
    expect(appSource).toContain("/combat-vitals`");
    expect(appSource).toContain("applyActorToSnapshot(result.actor)");
    expect(appSource).toContain("if (result.combat) applyCombatToSnapshot(result.combat)");
    expect(appSource).toContain("onAddCombatant={addCombatantToActiveCombat}");
    expect(appSource).toContain("onRemoveCombatant={removeCombatantFromActiveCombat}");
    expect(stylesSource).toContain("@media (max-width: 640px)");
    expect(stylesSource).toContain(".combat-vitals-controls");
  });

  it("renders the full reviewed legendary-action opportunity and permission state", () => {
    const prompt = testLegendaryActionPrompt();
    const allowedHtml = renderToStaticMarkup(createElement(LegendaryActionPromptCard, {
      combat: testCombat(),
      prompt,
      canSpend: true,
      disabledReason: "Requires combat.manage permission",
      onSpend: async () => undefined
    }));
    expect(allowedHtml).toContain("Legendary action available (2/3)");
    expect(allowedHtml).toContain('aria-label="Ancient Dragon legendary action option"');
    expect(allowedHtml).toContain('<option value="Detect" selected="">Detect</option>');
    expect(allowedHtml).toContain('<option value="Tail Attack">Tail Attack</option>');
    expect(allowedHtml).toContain('aria-label="Ancient Dragon legendary action cost"');
    expect(allowedHtml).toContain("Reviewed/manual: choose targets and resolve the option at the table.");

    const deniedHtml = renderToStaticMarkup(createElement(LegendaryActionPromptCard, {
      combat: testCombat(),
      prompt,
      canSpend: false,
      disabledReason: "Requires actor.update permission",
      onSpend: async () => undefined
    }));
    expect(deniedHtml).toContain('title="Requires actor.update permission"');
    expect(deniedHtml).toContain("Requires actor.update permission");
    expect(deniedHtml).toContain("disabled");
  });

  it("posts an exact revision-guarded legendary-action spend and keeps failed drafts retryable", () => {
    expect(source).toContain("Keep the option and cost so the GM can resolve a stale revision and retry.");
    expect(source).toContain("parsedCost > props.prompt.remainingUses");
    expect(source).toContain("await props.onSpend(props.combat, props.prompt, selectedOption, parsedCost)");
    expect(legendaryClientSource).toContain("/legendary-actions/${latestActor.id}/spend");
    expect(legendaryClientSource).toContain("expectedActorUpdatedAt: latestActor.updatedAt");
    expect(legendaryClientSource).toContain("expectedCombatUpdatedAt: latestCombat.updatedAt");
    expect(legendaryClientSource).toContain("legendary-action:${latestPrompt.id}:${window.crypto.randomUUID()}");
    expect(appSource).toContain("applyActorToSnapshot(result.actor)");
    expect(appSource).toContain("applyCombatToSnapshot(result.combat)");
  });
});

function testActor(): Actor {
  return {
    id: "actor-a",
    campaignId: "campaign-a",
    systemId: "dnd-5e-srd",
    ownerUserId: "user-a",
    type: "character",
    name: "Hero",
    data: { hp: { current: 0, max: 10 } },
    permissions: {},
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function testCombat(): Combat {
  return {
    id: "combat-a",
    campaignId: "campaign-a",
    active: true,
    round: 1,
    turnIndex: 0,
    manualTurnOrder: false,
    combatants: [
      { id: "a", tokenId: "token-a", actorId: "actor-a", name: "A", initiative: 10, defeated: false },
      { id: "b", tokenId: "token-b", name: "B", initiative: 5, defeated: false }
    ],
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function testLegendaryActionPrompt(): CombatLegendaryActionPrompt {
  return {
    id: "legendary-prompt-a",
    actorId: "dragon-a",
    combatantId: "combatant-dragon-a",
    actorName: "Ancient Dragon",
    round: 2,
    afterTurnIndex: 1,
    remainingUses: 2,
    maximumUses: 3,
    options: ["Detect", "Tail Attack"],
    resolution: "reviewed-manual",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}
