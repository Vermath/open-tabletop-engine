import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SystemRuntimeInfo } from "./api.js";
import { DeclarativeSystemControls, type SystemManagementContext } from "./sdk-panel.js";

const currentIdentity = { systemId: "custom-fantasy", version: "1.0.0", checksum: "a".repeat(64) };
const nextIdentity = { systemId: "custom-fantasy", version: "2.0.0", checksum: "b".repeat(64) };
const context: SystemManagementContext = {
  campaign: { id: "campaign-one", updatedAt: "revision-one" }, currentUserId: "user-one", canRegisterSystem: true,
  onChanged: vi.fn(async () => undefined), onOpenActorSheet: vi.fn()
};

function system(overrides: Partial<SystemRuntimeInfo> = {}): SystemRuntimeInfo {
  return {
    id: "custom-fantasy", name: "Custom fantasy", version: "1.0.0", active: false,
    definition: {
      kind: "declarative-v1", actorTypes: ["traveler"], itemTypes: ["gear"],
      actorDefaults: { focus: 3 }, itemDefaults: {}, sheet: { fields: [] }, quickRolls: []
    },
    binding: currentIdentity,
    installedVersions: [nextIdentity, currentIdentity],
    ...overrides
  };
}

function render(overrides: Partial<ComponentProps<typeof DeclarativeSystemControls>> = {}): string {
  return renderToStaticMarkup(<DeclarativeSystemControls context={context} canManage canCreate {...overrides} />);
}

function buttonAttributes(html: string, label: string): string {
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (match[2]!.replace(/<[^>]*>/g, "").trim() === label) return match[1]!;
  }
  throw new Error(`Button not found: ${label}`);
}

describe("declarative system management controls", () => {
  it("shows manifest registration only with the explicit registration permission", () => {
    const allowed = render({ canManage: false, canCreate: false });
    expect(allowed).toContain('aria-label="Rules manifest JSON"');
    expect(buttonAttributes(allowed, "Install manifest")).toContain('disabled=""');
    const denied = render({ context: { ...context, canRegisterSystem: false } });
    expect(denied).not.toContain('aria-label="Rules manifest JSON"');
    expect(denied).not.toContain(">Install manifest</button>");
    expect(buttonAttributes(denied, "Refresh rules catalog")).not.toContain('disabled=""');
  });

  it("shows exact installed identities and selects the current binding instead of the first catalog version", () => {
    const html = render({ system: system() });
    expect(html).toContain(`title="${currentIdentity.checksum}"`);
    expect(html).toContain(`value="${nextIdentity.version}:${nextIdentity.checksum}"`);
    expect(html).toMatch(new RegExp(`value="${currentIdentity.version}:${currentIdentity.checksum}"[^>]*selected=""`));
    expect(html).toContain("1.0.0 · aaaaaaaaaaaa");
    expect(buttonAttributes(html, "Change rules version")).toContain('disabled=""');
    expect(buttonAttributes(html, "Activate")).not.toContain('disabled=""');
  });

  it("offers the first binding but keeps activation and default character creation unavailable until bound", () => {
    const html = render({ system: system({ binding: undefined }) });
    expect(html).toContain("Not bound");
    expect(buttonAttributes(html, "Bind rules version")).not.toContain('disabled=""');
    expect(buttonAttributes(html, "Activate")).toContain('disabled=""');
    expect(html).toMatch(/<input aria-label="Custom fantasy character name"[^>]*disabled=""/);
    expect(buttonAttributes(html, "Create character")).toContain('disabled=""');
    const empty = render({ system: system({ binding: undefined, installedVersions: [] }) });
    expect(empty).toContain("No installed versions");
    expect(buttonAttributes(empty, "Bind rules version")).toContain('disabled=""');
  });

  it("keeps version management and actor creation permission gates independent", () => {
    const readonly = render({ system: system({ binding: undefined }), canManage: false, canCreate: false });
    expect(readonly).toMatch(/<select aria-label="Custom fantasy installed version"[^>]*disabled=""/);
    expect(buttonAttributes(readonly, "Bind rules version")).toContain('disabled=""');
    expect(buttonAttributes(readonly, "Activate")).toContain('disabled=""');
    expect(readonly).not.toContain('aria-label="Custom fantasy character name"');

    const creator = render({ system: system(), canManage: false, canCreate: true });
    expect(creator).toMatch(/<select aria-label="Custom fantasy installed version"[^>]*disabled=""/);
    expect(creator).toContain('aria-label="Custom fantasy character name"');
    expect(creator).not.toMatch(/<input aria-label="Custom fantasy character name"[^>]*disabled=""/);
  });

  it("exposes only a name for host-default character creation and disables a blank submit", () => {
    const html = render({ system: system({ active: true }) });
    expect(html).toContain('aria-label="Custom fantasy character name"');
    expect(buttonAttributes(html, "Create character")).toContain('disabled=""');
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('aria-label="Actor type"');
    expect(html).not.toContain(">Activate</button>");
  });
});
