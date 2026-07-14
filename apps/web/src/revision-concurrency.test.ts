import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("combat-critical revision wiring", () => {
  it("sends reviewed actor and combat revisions on critical mutations", () => {
    expect(appSource).toContain("expectedUpdatedAt: actor.updatedAt");
    expect(appSource).toContain("{ ...patch, expectedUpdatedAt: latest.updatedAt }");
    expect(appSource).toContain("{ ...patch, syncActorSheet, expectedUpdatedAt: latest.updatedAt }");
    expect(appSource).toContain("expectedUpdatedAt: combat.updatedAt,");
  });

  it("loads the authoritative conflict resource and surfaces a retry message", () => {
    expect(appSource).toContain('body.code !== "stale_write"');
    expect(appSource).toContain("Latest state loaded; review and retry.");
    expect(appSource).toContain("reconcileStaleWriteConflict(error)");
  });

  it("installs authoritative combat revisions before snapshot reconciliation", () => {
    expect(appSource).toContain("function applyCombatToSnapshot(combat: Combat)");
    expect(appSource).toContain("invalidateInFlightRefreshes();\n    setSnapshot((current) => ({\n      ...current,\n      combats:");
    expect(appSource.match(/applyCombatToSnapshot\(updated\);/g)).toHaveLength(2);
  });
});
