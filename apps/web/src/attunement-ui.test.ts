import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const loadoutSource = readFileSync(resolve(__dirname, "actor-loadout-panel.tsx"), "utf8");

describe("D&D attunement inventory controls", () => {
  it("uses the explicit optimistic and idempotent attunement transaction", () => {
    expect(appSource).toContain("/actors/${latest.id}/attunement");
    expect(appSource).toContain("expectedUpdatedAt: latest.updatedAt");
    expect(appSource).toContain('...(options?.breakCurse ? { breakCurse: true } : {})');
    expect(appSource).toContain('idempotencyKey: `attunement:${latest.id}:${item.id}:${attuned}:${options?.breakCurse ? "break-curse" : "standard"}:${latest.updatedAt}`');
  });

  it("shows attunement status and a permission-gated inventory control", () => {
    expect(loadoutSource).toContain('isAttuned ? "Attuned" : "Attunement required"');
    expect(loadoutSource).toContain('isAttuned ? isCursedAttunement ? "Break curse & unattune" : "Unattune" : "Attune"');
    expect(loadoutSource).toContain('"Break curse & unattune"');
    expect(loadoutSource).toContain("breakCurse: true");
    expect(loadoutSource).toContain("changeActorAttunement(actor, item, !isAttuned");
  });
});
