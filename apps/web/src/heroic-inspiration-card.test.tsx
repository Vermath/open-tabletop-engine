import { createTimestamped, type Actor, type DiceRoll } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroicInspirationCard, heroicInspirationDieChoicesForRoll } from "./heroic-inspiration-card.js";

const actor = createTimestamped("act", { id: "act_heroic_ui", campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_player", type: "character" as const, name: "Hero", permissions: {}, data: { heroicInspiration: false } }) satisfies Actor;

describe("Heroic Inspiration sheet affordance", () => {
  it("shows transparent GM grant state on the normal actor sheet", () => {
    const html = renderToStaticMarkup(<HeroicInspirationCard campaignId="camp_demo" actor={actor} actors={[actor]} canManage canReroll />);
    expect(html).toContain("Heroic Inspiration");
    expect(html).toContain("None");
    expect(html).toContain("Grant Heroic Inspiration");
  });

  it("lists the exact normal, Advantage, and Disadvantage d20 choices", () => {
    const choices = (terms: DiceRoll["terms"]) => heroicInspirationDieChoicesForRoll({ terms });
    expect(choices([{ type: "die", count: 1, sides: 20, results: [9], kept: [9] }])).toEqual([{ termIndex: 0, resultIndex: 0, value: 9, kept: true }]);
    expect(choices([{ type: "die", count: 2, sides: 20, results: [4, 17], kept: [17], keep: "highest", keepCount: 1 }])).toEqual([
      { termIndex: 0, resultIndex: 0, value: 4, kept: false },
      { termIndex: 0, resultIndex: 1, value: 17, kept: true },
    ]);
    expect(choices([{ type: "die", count: 2, sides: 20, results: [3, 14], kept: [3], keep: "lowest", keepCount: 1 }])).toHaveLength(2);
    expect(choices([{ type: "die", count: 3, sides: 20, results: [1, 2, 3], kept: [3] }])).toEqual([]);
  });
});
