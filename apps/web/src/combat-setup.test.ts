import type { Actor, Token } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initialCombatSetupTokenIds, isNpcInitiativeActor, moveCombatSetupToken, validateCombatSetup } from "./combat-setup.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const dialogSource = readFileSync(resolve(__dirname, "combat-setup-dialog.tsx"), "utf8");

const tokens = [
  { id: "tok_pc", name: "Aria", actorId: "act_pc" },
  { id: "tok_npc", name: "Goblin", actorId: "act_npc", hidden: true },
  { id: "tok_prop", name: "Brazier" }
] as Token[];

const actors = [
  { id: "act_pc", name: "Aria", type: "character" },
  { id: "act_npc", name: "Goblin", type: "monster" }
] as Actor[];

describe("combat setup", () => {
  it("preselects only tokens explicitly selected on the board", () => {
    expect(initialCombatSetupTokenIds(tokens, ["tok_npc", "missing"])).toEqual(["tok_npc"]);
    expect(initialCombatSetupTokenIds(tokens, [])).toEqual([]);
  });

  it("matches the existing server NPC initiative eligibility", () => {
    expect(isNpcInitiativeActor(actors[1])).toBe(true);
    expect(isNpcInitiativeActor(actors[0])).toBe(false);
    expect(isNpcInitiativeActor(undefined)).toBe(false);
  });

  it("requires manual initiative for PCs and unlinked tokens while deferring linked NPCs to the server", () => {
    expect(validateCombatSetup({
      tokens,
      actors,
      selectedTokenIds: ["tok_pc", "tok_npc", "tok_prop"],
      initiativeDrafts: { tok_pc: "17", tok_prop: "8" },
      rollNpcInitiative: true
    })).toEqual({
      submission: {
        tokenIds: ["tok_pc", "tok_npc", "tok_prop"],
        manualInitiatives: { tok_pc: 17, tok_prop: 8 },
        surprisedTokenIds: [],
        surpriseEnabled: true,
        rollNpcInitiative: true,
        manualTurnOrder: false
      }
    });
  });

  it("preserves a reviewed manual order for explicit tie breaking", () => {
    const reviewed = moveCombatSetupToken(["tok_pc", "tok_npc", "tok_prop"], "tok_prop", -1);
    expect(reviewed).toEqual(["tok_pc", "tok_prop", "tok_npc"]);
    expect(moveCombatSetupToken(reviewed, "tok_pc", -1)).toBe(reviewed);
    expect(validateCombatSetup({
      tokens,
      actors,
      selectedTokenIds: reviewed,
      initiativeDrafts: { tok_pc: "17", tok_prop: "17" },
      rollNpcInitiative: true,
      manualTurnOrder: true
    })).toEqual({
      submission: {
        tokenIds: reviewed,
        manualInitiatives: { tok_pc: 17, tok_prop: 17 },
        surprisedTokenIds: [],
        surpriseEnabled: true,
        rollNpcInitiative: true,
        manualTurnOrder: true
      }
    });
  });

  it("never invents an initiative for an unresolved participant", () => {
    expect(validateCombatSetup({
      tokens,
      actors,
      selectedTokenIds: ["tok_pc"],
      initiativeDrafts: {},
      rollNpcInitiative: true
    })).toEqual({ error: "Enter initiative for Aria." });
    expect(validateCombatSetup({
      tokens,
      actors,
      selectedTokenIds: [],
      initiativeDrafts: {},
      rollNpcInitiative: true
    })).toEqual({ error: "Choose at least one scene token." });
  });

  it("persists Surprise only for selected participants", () => {
    expect(validateCombatSetup({
      tokens,
      actors,
      selectedTokenIds: ["tok_pc", "tok_npc"],
      initiativeDrafts: { tok_pc: "17" },
      surprisedTokenIds: ["tok_npc", "tok_prop", "missing"],
      rollNpcInitiative: true
    }).submission?.surprisedTokenIds).toEqual(["tok_npc"]);
    expect(validateCombatSetup({
      tokens,
      actors,
      selectedTokenIds: ["tok_pc", "tok_npc"],
      initiativeDrafts: { tok_pc: "17" },
      surprisedTokenIds: ["tok_npc"],
      surpriseEnabled: false,
      rollNpcInitiative: true
    }).submission).toMatchObject({ surprisedTokenIds: [], surpriseEnabled: false });
    expect(dialogSource).toContain("Surprised");
    expect(dialogSource).toContain("Surprise is disabled by this campaign's saved rules profile");
    expect(appSource).toContain("campaignSurpriseEnabled(selectedCampaign)");
    expect(appSource).toContain("...(input.surpriseEnabled ? { surprised:");
    expect(appSource).toContain("surprised: surprisedTokenIds.has(tokenId)");
  });

  it("wires reviewed participants to one idempotent atomic combat-start API", () => {
    expect(appSource).toContain("const requestedTokenIds = new Set(input.tokenIds)");
    expect(appSource).toContain("/combats/start");
    expect(appSource).toContain("idempotencyKey: input.idempotencyKey");
    expect(appSource).not.toContain("/initiative/roll-npcs");
    expect(appSource).not.toContain("initiative: initiative ?? 0");
    expect(appSource).not.toContain("initiative: 20 - index");
    expect(dialogSource).toContain("combat-start:${globalThis.crypto.randomUUID()}");
    expect(dialogSource).toContain("{ ...validation.submission, idempotencyKey }");
    expect(dialogSource).toContain("Only checked tokens join combat");
    expect(dialogSource).toContain("Board selections are prechecked");
    expect(dialogSource).toContain("Hidden from players");
    expect(dialogSource).toContain("Use the reviewed order instead of automatic initiative sorting");
    expect(appSource).toContain("manualTurnOrder: input.manualTurnOrder");
  });
});
