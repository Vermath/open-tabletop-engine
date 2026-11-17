import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  review: vi.fn(),
  hookValues: [] as unknown[],
  hookCursor: 0,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initial: T | (() => T)) => {
      const index = harness.hookCursor++;
      if (index >= harness.hookValues.length) {
        harness.hookValues[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setValue = (next: T | ((current: T) => T)) => {
        const current = harness.hookValues[index] as T;
        harness.hookValues[index] = typeof next === "function" ? (next as (value: T) => T)(current) : next;
      };
      return [harness.hookValues[index] as T, setValue] as const;
    },
  };
});

vi.mock("./api.js", () => ({
  apiDelete: harness.apiDelete,
  apiPatch: harness.apiPatch,
  apiPost: harness.apiPost,
}));

vi.mock("./consequence-review.js", () => ({
  useConsequenceReview: () => ({ dialog: null, review: harness.review }),
}));

import { AdvancedCombatMechanics, type AdvancedCombatMechanicsProps } from "./advanced-combat-mechanics.js";

interface ElementNode {
  type?: unknown;
  props?: Record<string, unknown> & { children?: ReactNode };
}

function elementNodes(node: ReactNode): ElementNode[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap(elementNodes);
  if (typeof node !== "object") return [];
  const element = node as ElementNode;
  return [element, ...elementNodes(element.props?.children as ReactNode)];
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (!node || typeof node !== "object") return "";
  return nodeText((node as ElementNode).props?.children as ReactNode);
}

function button(root: ReactNode, label: string): ElementNode {
  const match = elementNodes(root).find((node) => node.type === "button" && nodeText(node as ReactNode).trim() === label);
  if (!match) throw new Error(`Missing ${label} button`);
  return match;
}

function selectByLabel(root: ReactNode, label: string): ElementNode {
  const match = elementNodes(root).find((node) => node.type === "select" && node.props?.["aria-label"] === label);
  if (!match) throw new Error(`Missing ${label} select`);
  return match;
}

function detailsBySummary(root: ReactNode, label: string): ElementNode {
  const match = elementNodes(root).find((node) => node.type === "details" && nodeText(node.props?.children as ReactNode).includes(label));
  if (!match) throw new Error(`Missing ${label} details`);
  return match;
}

function controlByIdSuffix(root: ReactNode, type: "input" | "select", suffix: string): ElementNode {
  const match = elementNodes(root).find((node) => node.type === type && String(node.props?.id ?? "").endsWith(suffix));
  if (!match) throw new Error(`Missing ${suffix} ${type}`);
  return match;
}

function render(props: AdvancedCombatMechanicsProps): ReactNode {
  harness.hookCursor = 0;
  return AdvancedCombatMechanics(props);
}

describe("AdvancedCombatMechanics Wand lifecycle", () => {
  beforeEach(() => {
    harness.apiDelete.mockReset();
    harness.apiPatch.mockReset();
    harness.apiPost.mockReset();
    harness.review.mockReset();
    harness.hookValues = [];
    harness.hookCursor = 0;
  });

  it("records a successful Wand save, reviews and commits it, then refreshes the cleared turn blocker", async () => {
    const target = createTimestamped("act", {
      id: "act_wand_ui_target",
      campaignId: "camp_wand_ui",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_wand_ui",
      type: "character" as const,
      name: "Wand Target",
      data: {
        conditions: [{ id: "paralyzed" }],
        rulesEngine: {
          activeEffects: [{
            id: "effect_wand_ui",
            label: "Wand of Paralysis",
            conditionIds: ["paralyzed"],
            ownedConditionIds: ["paralyzed"],
            managedLifecycle: "end-turn-repeat-save-v1",
            schedule: {
              timing: "end_turn",
              anchorActorId: "act_wand_ui_target",
              nextRound: 1,
              intervalRounds: 1,
              expiresAtRound: 11,
              repeatSave: { ability: "constitution", dc: 15, endsOn: "success" },
            },
          }],
        },
      },
      permissions: {},
    }) satisfies Actor;
    const combat = createTimestamped("cmb", {
      id: "cmb_wand_ui",
      campaignId: "camp_wand_ui",
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [{ id: "cmbt_wand_ui", tokenId: "tok_wand_ui", actorId: target.id, name: target.name, initiative: 12, defeated: false, conditions: ["paralyzed:10"] }],
    }) satisfies Combat;
    const resolvedCombat: Combat = {
      ...combat,
      updatedAt: new Date(Date.parse(combat.updatedAt) + 1).toISOString(),
      combatants: [{ ...combat.combatants[0]!, conditions: [] }],
    };
    const event = {
      id: "effect_wand_ui:end_turn:1:0",
      effectId: "effect_wand_ui",
      actorId: target.id,
      label: "Wand of Paralysis",
      phase: "end_turn" as const,
      round: 1,
      turnIndex: 0,
      status: "save_required" as const,
      saveAbility: "constitution",
      saveDc: 15,
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-17T12:00:00.000Z",
    };
    const unresolved = {
      phase: "end_turn" as const,
      round: 1,
      turnIndex: 0,
      events: [event],
      actorChanges: [],
      unresolvedEventIds: [event.id],
      canApply: false,
      combatUpdatedAt: combat.updatedAt,
    };
    const prepared = {
      ...unresolved,
      events: [{ ...event, status: "save_succeeded" as const, outcome: "success" as const }],
      actorChanges: [{ actorId: target.id, reason: "Remove Wand of Paralysis and its owned Paralyzed condition" }],
      unresolvedEventIds: [],
      canApply: true,
      preparedPreviewKey: "wand-ui-prepared",
      preparation: {
        preparedPreviewKey: "wand-ui-prepared",
        combatId: combat.id,
        revisions: { combatUpdatedAt: combat.updatedAt, actorUpdatedAt: { [target.id]: target.updatedAt } },
        resolutionHash: "sha256:wand-ui",
      },
    };
    const applied = {
      combat: resolvedCombat,
      evaluation: { ...prepared, combatUpdatedAt: resolvedCombat.updatedAt },
      rulesMutationId: "drmut_wand_ui",
      undo: {
        mutationId: "drmut_wand_ui",
        expectedActorUpdatedAt: { [target.id]: resolvedCombat.updatedAt },
        expectedItemUpdatedAt: {},
        expectedCombatUpdatedAt: resolvedCombat.updatedAt,
      },
    };
    harness.apiPost.mockImplementation(async (url: string, payload: Record<string, unknown>) => {
      if (url.endsWith("/effects/preview")) return payload.prepare === true ? prepared : unresolved;
      if (url.endsWith("/effects/advance")) return applied;
      throw new Error(`Unexpected API call ${url}`);
    });
    harness.review.mockResolvedValue(true);
    const onCombatUpdated = vi.fn();
    const onRefresh = vi.fn(async () => undefined);
    const onStatus = vi.fn();
    const onRulesMutationApplied = vi.fn();
    const props: AdvancedCombatMechanicsProps = {
      campaignId: combat.campaignId,
      combat,
      actors: [target],
      canManage: true,
      canManageEffects: true,
      canPreviewEffects: true,
      onCombatUpdated,
      onRefresh,
      onStatus,
      onRulesMutationApplied,
    };

    let tree = render(props);
    expect(nodeText(tree)).toContain("Wand of Paralysis");
    expect(nodeText(tree)).toContain("End Turn");
    expect(button(tree, "Apply reviewed outcomes").props?.disabled).toBe(true);

    (button(tree, "Preview").props?.onClick as () => void)();
    await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith("Scheduled effects need save outcomes"));
    await Promise.resolve();
    tree = render(props);
    const outcome = selectByLabel(tree, "Wand of Paralysis save outcome");
    expect(outcome.props?.value).toBe("");
    (outcome.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "success" } });

    tree = render(props);
    expect(button(tree, "Apply reviewed outcomes").props?.disabled).toBe(false);
    (button(tree, "Apply reviewed outcomes").props?.onClick as () => void)();
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    expect(harness.review).toHaveBeenCalledWith(expect.objectContaining({
      title: "Review scheduled effects",
      confirmLabel: "Commit exact effect outcomes",
      sections: expect.arrayContaining([expect.objectContaining({ label: "Effect events", items: [expect.objectContaining({ label: "Wand of Paralysis", value: "Wand Target - Save Succeeded" })] })]),
    }));
    expect(harness.apiPost).toHaveBeenNthCalledWith(3,
      `/api/v1/combats/${combat.id}/effects/advance`,
      { preparedPreviewKey: "wand-ui-prepared", expectedUpdatedAt: combat.updatedAt },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(onRulesMutationApplied).toHaveBeenCalledWith(applied.undo);
    expect(onCombatUpdated).toHaveBeenCalledWith(resolvedCombat);
    expect(onStatus).toHaveBeenLastCalledWith("Scheduled effects advanced");
    expect(resolvedCombat.combatants[0]?.conditions).toEqual([]);

    const resolvedTarget: Actor = { ...target, data: { ...target.data, conditions: [], rulesEngine: { activeEffects: [] } } };
    tree = render({ ...props, combat: resolvedCombat, actors: [resolvedTarget] });
    expect(nodeText(tree)).toContain("No typed effect schedules are active on D&D combatants.");
  });

  it("keeps the spell-helper disclosure open across controlled field changes", () => {
    const caster = createTimestamped("act", {
      id: "act_spell_disclosure",
      campaignId: "camp_spell_disclosure",
      systemId: "dnd-5e-srd",
      ownerUserId: "usr_spell_disclosure",
      type: "character" as const,
      name: "Spell Caster",
      data: {},
      permissions: {},
    }) satisfies Actor;
    const combat = createTimestamped("cmb", {
      id: "cmb_spell_disclosure",
      campaignId: caster.campaignId,
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [],
    }) satisfies Combat;
    const props: AdvancedCombatMechanicsProps = {
      campaignId: combat.campaignId,
      combat,
      actors: [caster],
      canManage: true,
      canManageEffects: true,
      canPreviewEffects: true,
      onCombatUpdated: vi.fn(),
      onRefresh: vi.fn(async () => undefined),
      onStatus: vi.fn(),
    };

    let tree = render(props);
    let disclosure = detailsBySummary(tree, "Specialized spell helpers");
    expect(disclosure.props?.open).toBe(false);
    (disclosure.props?.onToggle as (event: { currentTarget: { open: boolean } }) => void)({ currentTarget: { open: true } });

    tree = render(props);
    disclosure = detailsBySummary(tree, "Specialized spell helpers");
    expect(disclosure.props?.open).toBe(true);
    (controlByIdSuffix(tree, "select", "-spell-id").props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "delayed-blast-fireball" } });

    tree = render(props);
    expect(detailsBySummary(tree, "Specialized spell helpers").props?.open).toBe(true);
    const roundsHeld = controlByIdSuffix(tree, "input", "-spell-rounds-held");
    (roundsHeld.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: "3" } });

    tree = render(props);
    expect(detailsBySummary(tree, "Specialized spell helpers").props?.open).toBe(true);
    expect(controlByIdSuffix(tree, "input", "-spell-rounds-held").props?.value).toBe(3);
  });
});
