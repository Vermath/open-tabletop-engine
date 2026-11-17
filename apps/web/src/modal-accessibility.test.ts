import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { modalFocusableElements } from "./modal-accessibility.js";

const hookSource = readFileSync(resolve(__dirname, "modal-accessibility.ts"), "utf8").replace(/\r\n/g, "\n");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const tabletopOverlaysSource = readFileSync(resolve(__dirname, "tabletop-overlays.tsx"), "utf8").replace(/\r\n/g, "\n");
const appModalSources = `${appSource}\n${actorPanelSource}\n${tabletopOverlaysSource}`;
const creatorSource = readFileSync(resolve(__dirname, "character-creator-dialog.tsx"), "utf8").replace(/\r\n/g, "\n");
const encounterSource = readFileSync(resolve(__dirname, "encounter-builder.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("modal accessibility", () => {
  it("filters hidden and programmatically unfocusable descendants", () => {
    const focusable = { tabIndex: 0, getAttribute: () => null, closest: () => null, matches: () => false };
    const hidden = { tabIndex: 0, getAttribute: (name: string) => name === "aria-hidden" ? "true" : null, closest: () => hidden, matches: () => false };
    const hiddenByAncestor = { tabIndex: 0, getAttribute: () => null, closest: () => ({ getAttribute: () => "true" }), matches: () => false };
    const inertByAncestor = { tabIndex: 0, getAttribute: () => null, closest: () => ({ hasAttribute: () => true }), matches: () => false };
    const disabledByFieldset = { tabIndex: 0, getAttribute: () => null, closest: () => null, matches: (selector: string) => selector === ":disabled" };
    const programmatic = { tabIndex: -1, getAttribute: () => null, closest: () => null, matches: () => false };
    const dialog = { querySelectorAll: () => [focusable, hidden, hiddenByAncestor, inertByAncestor, disabledByFieldset, programmatic] } as unknown as HTMLElement;

    expect(modalFocusableElements(dialog)).toEqual([focusable]);
  });

  it("places focus, traps Tab, closes on Escape, and restores the opener", () => {
    expect(hookSource).toContain("initialTarget.focus();");
    expect(hookSource).toContain('event.key === "Escape"');
    expect(hookSource).toContain('event.key !== "Tab"');
    expect(hookSource).toContain('document.addEventListener("keydown", handleKeyDown, true);');
    expect(hookSource).toContain("if (restoreTarget?.isConnected) restoreTarget.focus();");
    expect(hookSource).toContain("isTopmostModal(dialog)");
  });

  it("wires every aria-modal dialog through the shared behavior", () => {
    expect(appModalSources.match(/useModalAccessibility<HTMLDivElement>/g)).toHaveLength(5);
    expect(appModalSources.match(/aria-modal="true"/g)).toHaveLength(5);
    expect(appModalSources.match(/tabIndex=\{-1\}/g)?.length).toBeGreaterThanOrEqual(5);
    expect(actorPanelSource).toContain("setDeleteDialogOpen(false);\n  }, [props.token?.id]);");
    expect(actorPanelSource).toContain("initialFocusRef: deleteConfirmRef");
    expect(actorPanelSource).toContain('type="button" ref={deleteConfirmRef} onClick={() => {');
    expect(actorPanelSource).toContain("initialFocusRef: actorDeleteConfirmRef");
    expect(actorPanelSource).toContain("void props.deleteActor(props.actor!);");
    expect(creatorSource).toContain("useModalAccessibility<HTMLDivElement>(props.onClose)");
    expect(encounterSource).toContain("useModalAccessibility<HTMLDivElement>(closeDialog)");
    expect(encounterSource).toContain("spawnAbortRef.current?.abort();\n    props.onClose();");
    expect(creatorSource).toContain("ref={dialogRef}");
    expect(encounterSource).toContain("ref={dialogRef}");
  });
});
