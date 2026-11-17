import type { Actor, PermissionName, Token } from "@open-tabletop/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canUseHotbarActor, hotbarAttackTarget, hotbarStoragePrefix, readHotbar, validHotbarFormula } from "./personal-hotbar-state.js";

afterEach(() => vi.unstubAllGlobals());

describe("personal hotbar", () => {
  it("restores only this server, player and campaign, keeping valid slots when a slot is damaged", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null } });
    const key = hotbarStoragePrefix("table-A", "player-A", "campaign-A");
    const actor = { kind: "actor", actorId: "fighter", rollId: "skill-perception" };
    const macro = { kind: "macro", macroId: "attack" };
    values.set(key + 0, JSON.stringify(actor));
    values.set(key + 1, "{");
    values.set(key + 2, JSON.stringify(macro));
    values.set(key + 3, JSON.stringify({ kind: "formula", formula: "2d6+1" }));
    values.set(key + 4, JSON.stringify({ kind: "formula", formula: "arbitrary code" }));
    expect(readHotbar(key)).toEqual([actor, undefined, macro, { kind: "formula", formula: "2d6+1" }, undefined, undefined]);
    for (const [api, user, campaign] of [["table-B", "player-A", "campaign-A"], ["table-A", "player-B", "campaign-A"], ["table-A", "player-A", "campaign-B"]] as const) {
      expect(readHotbar(hotbarStoragePrefix(api, user, campaign)).every((slot) => slot === undefined)).toBe(true);
    }
    expect(validHotbarFormula("2d20kh1+3")).toBe(true);
  });

  it("requires current sheet visibility, actor control and permission to roll", () => {
    const actor = { ownerUserId: "player", permissions: {} } as Actor;
    const owned: PermissionName[] = ["actor.read", "actor.updateOwned", "dice.roll"];
    expect(canUseHotbarActor(actor, "player", owned)).toBe(true);
    expect(canUseHotbarActor({ ...actor, ownerUserId: "someone" }, "player", owned)).toBeFalsy();
    expect(canUseHotbarActor(actor, "player", ["actor.read", "actor.updateOwned"])).toBeFalsy();
    expect(canUseHotbarActor(actor, "other", ["actor.read", "actor.update", "dice.roll"])).toBeFalsy();
    expect(canUseHotbarActor(actor, "gm", ["actor.read", "actor.readPrivate", "actor.update", "dice.roll"])).toBe(true);
  });

  it("prefers this user's marked target and asks for an explicit choice for self or ambiguous attacks", () => {
    const actors = ["hero", "spider", "goblin"].map((id) => ({ id } as Actor));
    const tokens = actors.map(({ id }) => ({ id: "token-" + id, actorId: id, sceneId: "map", targetedByUserIds: [] } as unknown as Token));
    const target = (current: Token[], selected: string) => hotbarAttackTarget("player", "map", current, actors, "hero", selected);
    expect(target(tokens, "token-spider")).toBe("spider");
    expect(target(tokens, "token-hero")).toBeUndefined();
    const marked = tokens.map((token) => ({ ...token, targetedByUserIds: token.actorId === "goblin" ? ["player"] : ["other"] }));
    expect(target(marked, "token-spider")).toBe("goblin");
    expect(target(marked.map((token) => token.actorId === "goblin" ? { ...token, sceneId: "old" } : token), "token-spider")).toBe("spider");
    expect(target(marked.map((token) => ({ ...token, targetedByUserIds: ["player"] })), "token-spider")).toBeUndefined();
  });
});
