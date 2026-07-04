import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("session recap", () => {
  it("generates deterministic recap journal entries from the current snapshot", () => {
    expect(appSource).toContain("function generateSessionRecap");
    expect(appSource).toContain('tags: ["recap"]');
    expect(appSource).toContain("snapshot.rolls");
    expect(appSource).toContain("snapshot.chat");
    expect(appSource).toContain("snapshot.combats");
    expect(appSource).toContain("snapshot.combatAudit");
    expect(appSource).toContain("!isAdversaryActor(actor, snapshot.tokens)");
  });

  it("wires the journal panel button to the generator", () => {
    expect(appSource).toContain("Generate session recap");
    expect(appSource).toContain("onGenerateRecap");
  });
});
