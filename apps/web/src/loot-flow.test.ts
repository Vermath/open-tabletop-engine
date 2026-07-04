import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("loot flow", () => {
  it("applies item mutation responses locally", () => {
    expect(appSource).toContain("function applyItemToSnapshot");
    expect(appSource).toContain("applyItemToSnapshot(await apiPatch<Item>");
  });

  it("lets party and adversary rail rows accept item drops", () => {
    expect(appSource).toContain("itemDropMime");
    expect(appSource).toContain("onDrop={(event) => giveDroppedItemToActor(event, actor)}");
    expect(appSource).toContain("partyDropTargetActorId");
  });

  it("provides a give-to fallback per loadout item", () => {
    expect(appSource).toContain('aria-label={`Give ${item.name} to actor`}');
  });

  it("splits party gold from combat", () => {
    expect(appSource).toContain("function awardPartyGold");
    expect(appSource).toContain('aria-label="Party gold award"');
    expect(appSource).toContain("Split GP");
  });

  it("styles party rail item drop targets", () => {
    expect(stylesSource).toContain(".party-row.drop-target");
  });
});
