import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { boundedCombatCounter, parseCombatantConditions } from "./combat-panel.js";

const source = readFileSync(resolve(__dirname, "combat-panel.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("combatant draft editing", () => {
  it("normalizes committed combat fields", () => {
    expect(parseCombatantConditions(" prone, stunned,  ")).toEqual(["prone", "stunned"]);
    expect(boundedCombatCounter("9")).toBe(3);
    expect(boundedCombatCounter("-1")).toBe(0);
  });

  it("keeps keystrokes local and commits once on blur", () => {
    expect(source).toContain("function CombatantDraftInput(props:");
    expect(source).toContain("if (pendingRef.current || draft === props.value) return;");
    expect(source).toContain("onChange={(event) => setDraft(event.target.value)}");
    expect(source).toContain("if (skipBlurCommitRef.current)");
    expect(source).toContain("void commit();");
    expect(source).not.toContain("onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { initiative:");
  });

  it("synchronously guards combat toggles, turn changes, and GM actions", () => {
    expect(source).toContain("const pendingControlsRef = useRef<Set<string>>(new Set());");
    expect(source).toContain("if (pendingControlsRef.current.has(key)) return;");
    expect(source).toContain("pendingControlsRef.current.add(key);");
    expect(source).toContain("pendingControlsRef.current.delete(key);");
    expect(source).toContain("runPendingControl(`action:${action.id}`");
    expect(source).toContain("runPendingControl(`turn:${props.combat!.id}`");
    expect(source).toContain("runPendingControl(`combatant:${combatant.id}:readiness`");
    expect(source).toContain("runPendingControl(`combatant:${combatant.id}:defeated`");
    expect(source).toContain("runPendingControl(`combatant:${combatant.id}:resource`");
    expect(source).toContain('runPendingControl("combat:start", "Start combat", props.onStart)');
    expect(source).toContain("<RetryableActionNotice");
    expect(source).not.toContain("console.error");
  });
});
