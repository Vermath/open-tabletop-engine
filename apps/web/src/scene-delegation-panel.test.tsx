import type { Scene } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeSceneDelegationPermissions, SceneDelegationPanel, sceneDelegationChanged } from "./scene-delegation-panel.js";

const scene = { id: "scene-one", campaignId: "campaign-one", name: "Vault", width: 1000, height: 1000, gridType: "square", gridSize: 50, active: false, sortOrder: 0, fog: [], walls: [], lights: [], annotations: [], metadata: {}, createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z" } as Scene;

describe("SceneDelegationPanel", () => {
  it("normalizes edit access to include view access", () => {
    expect(normalizeSceneDelegationPermissions(false, true)).toEqual(["scene.read", "scene.update"]);
    expect(normalizeSceneDelegationPermissions(true, false)).toEqual(["scene.read"]);
    expect(sceneDelegationChanged(["scene.read"], ["scene.read", "scene.update"])).toBe(true);
    expect(sceneDelegationChanged(["scene.update", "scene.read"], ["scene.read", "scene.update"])).toBe(false);
  });

  it("renders an accessible loading surface and explains delegation scope", () => {
    const html = renderToStaticMarkup(<SceneDelegationPanel scene={scene} members={[]} currentUserId="user-one" onSceneChange={() => undefined} onStatus={() => undefined} />);
    expect(html).toContain("Delegation for Vault");
    expect(html).toContain("Loading scene access...");
    expect(html).toContain("Campaign-wide permissions still apply");
    expect(html).toContain('role="status"');
  });
});
