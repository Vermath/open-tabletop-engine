import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { journalVisibilityHasTargets } from "./journal-panel.js";

describe("journal visibility targeting", () => {
  it("requires a matching target for scoped visibility", () => {
    expect(journalVisibilityHasTargets("public", [], [])).toBe(true);
    expect(journalVisibilityHasTargets("gm_only", [], [])).toBe(true);
    expect(journalVisibilityHasTargets("specific_players", [], [])).toBe(false);
    expect(journalVisibilityHasTargets("specific_players", ["user_1"], [])).toBe(true);
    expect(journalVisibilityHasTargets("specific_characters", [], [])).toBe(false);
    expect(journalVisibilityHasTargets("specific_characters", [], ["actor_1"])).toBe(true);
  });

  it("submits both scoped ids and character-owner user ids", () => {
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(appSource).toContain("const actorOwnerUserIds = targets.visibleToActorIds");
    expect(appSource).toContain("visibleToUserIds,");
    expect(appSource).toContain("visibleToActorIds: targets.visibleToActorIds");
  });
});
