import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8");

describe("condition mutation UI safety", () => {
  it("queues authoritative system mutations with actor revisions and stable retry keys", () => {
    expect(appSource).toContain('const idempotencyKey = `condition:${latest.id}:${conditionId}:${removing ? "remove" : options?.overrideReason ? "override" : "apply"}:${latest.updatedAt}`');
    expect(appSource).toContain("?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}");
    expect(appSource).toContain("...(options?.overrideReason ? { overrideReason: options.overrideReason } : {})");
    expect(appSource).toContain("const updated = result.actor");
    expect(appSource).toContain("!reconcileStaleWriteConflict(error)");
  });

  it("offers campaign managers an explicit documented condition-immunity override", () => {
    expect(actorPanelSource).toContain("Optional condition-immunity override");
    expect(actorPanelSource).toContain('aria-label="Condition immunity override reason"');
    expect(actorPanelSource).toContain("{ overrideReason: conditionOverrideReason.trim() }");
  });
});
