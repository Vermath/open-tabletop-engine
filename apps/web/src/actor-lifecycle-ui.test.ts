import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const panelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const clientSource = readFileSync(resolve(__dirname, "actor-lifecycle-client.ts"), "utf8").replace(/\r\n/g, "\n");

describe("actor lifecycle UI", () => {
  it("exposes actor deletion only through the explicit actor.delete permission", () => {
    expect(appSource).toContain('canDeleteActor={!blankCanvasDemoOpen && hasPermission("actor.delete")}');
    expect(panelSource).toContain("{props.canDeleteActor && (");
    expect(panelSource).toContain('aria-label="Actor lifecycle"');
  });

  it("reviews destructive consequences before invoking the existing domain delete route", () => {
    expect(panelSource).toContain("Linked tokens and items remain but become unlinked");
    expect(panelSource).toContain("This cannot be undone.");
    expect(panelSource).toContain("void props.deleteActor(props.actor!);");
    expect(clientSource).toContain("apiDelete<Actor>(`/api/v1/actors/${actor.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`");
    expect(clientSource).toContain("await context.refresh();");
    expect(appSource).toContain('await import("./actor-lifecycle-client.js")');
  });
});
