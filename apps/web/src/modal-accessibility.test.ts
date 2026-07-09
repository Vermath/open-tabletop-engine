import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { modalFocusableElements } from "./modal-accessibility.js";

const hookSource = readFileSync(resolve(__dirname, "modal-accessibility.ts"), "utf8").replace(/\r\n/g, "\n");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const creatorSource = readFileSync(resolve(__dirname, "character-creator-dialog.tsx"), "utf8");
const encounterSource = readFileSync(resolve(__dirname, "encounter-builder.tsx"), "utf8");

describe("modal accessibility", () => {
  it("filters hidden and programmatically unfocusable descendants", () => {
    const focusable = { tabIndex: 0, getAttribute: () => null };
    const hidden = { tabIndex: 0, getAttribute: (name: string) => name === "aria-hidden" ? "true" : null };
    const programmatic = { tabIndex: -1, getAttribute: () => null };
    const dialog = { querySelectorAll: () => [focusable, hidden, programmatic] } as unknown as HTMLElement;

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
    expect(appSource.match(/useModalAccessibility<HTMLDivElement>/g)).toHaveLength(4);
    expect(appSource.match(/aria-modal="true"/g)).toHaveLength(4);
    expect(appSource.match(/tabIndex=\{-1\}/g)?.length).toBeGreaterThanOrEqual(4);
    expect(appSource).toContain("setDeleteDialogOpen(false);\n  }, [props.token?.id]);");
    expect(appSource).toContain("initialFocusRef: deleteConfirmRef");
    expect(appSource).toContain('type="button" ref={deleteConfirmRef} onClick={() => {');
    expect(creatorSource).toContain("useModalAccessibility<HTMLDivElement>(props.onClose)");
    expect(encounterSource).toContain("useModalAccessibility<HTMLDivElement>(props.onClose)");
    expect(creatorSource).toContain("ref={dialogRef}");
    expect(encounterSource).toContain("ref={dialogRef}");
  });
});
