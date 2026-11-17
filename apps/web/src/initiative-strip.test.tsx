import type { Combat } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InitiativeStrip, initiativeStripEntries, initiativeStripEntryLabel } from "./initiative-strip.js";

function combat(): Combat {
  const combatant = (id: string, name: string, initiative: number, defeated = false) => ({ id, tokenId: `tok_${id}`, name, initiative, defeated });
  return {
    id: "cmb", campaignId: "camp", active: true, round: 3, turnIndex: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    combatants: [combatant("a", "Valen Ash", 18), combatant("b", "Goblin Boss", 15), combatant("c", "Goblin", 9, true), combatant("d", "Mira Vale", 4)]
  } as Combat;
}

describe("initiative strip", () => {
  it("marks the current, next and defeated combatants in initiative order", () => {
    const entries = initiativeStripEntries(combat(), "b", "d");
    expect(entries.map((entry) => [entry.combatant.name, entry.state])).toEqual([
      ["Valen Ash", "waiting"], ["Goblin Boss", "current"], ["Goblin", "defeated"], ["Mira Vale", "next"]
    ]);
    expect(initiativeStripEntryLabel(entries[1]!)).toBe("Goblin Boss, initiative 15, taking their turn");
    expect(initiativeStripEntryLabel(entries[2]!)).toBe("Goblin, initiative 9, defeated");
  });

  it("does not guess a turn when the caller cannot see who is acting", () => {
    expect(initiativeStripEntries(combat(), undefined, undefined).some((entry) => entry.state === "current" || entry.state === "next")).toBe(false);
  });

  const render = (canAdvance: boolean) => renderToStaticMarkup(
    <InitiativeStrip combat={combat()} currentCombatantId="b" nextCombatantId="d" canAdvance={canAdvance} onFocusCombatant={() => undefined} onNextTurn={async () => undefined} onOpenTracker={() => undefined} onError={() => undefined} />
  );

  it("shows the round and order to everyone but the turn control only to combat managers", () => {
    const player = render(false);
    expect(player).toContain("Round 3");
    expect(player).toContain('aria-current="step"');
    expect(player).not.toContain("Next turn");
    expect(render(true)).toContain("Next turn");
  });
});
