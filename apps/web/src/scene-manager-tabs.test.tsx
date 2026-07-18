import type { MapAsset, Scene } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SceneManagerTabs } from "./scene-manager-tabs.js";

const timestamp = "2026-07-18T00:00:00.000Z";

function scene(id: string, name: string, active = false): Scene {
  return {
    id,
    campaignId: "camp-scenes",
    name,
    width: 1200,
    height: 800,
    gridSize: 50,
    gridType: "square",
    active,
    sortOrder: 0,
    fog: [],
    walls: [],
    lights: [],
    annotations: [],
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("SceneManagerTabs", () => {
  it("renders the selected and available scenes inside Manage", () => {
    const vault = scene("scn-vault", "Vault Entry", true);
    const bridge = scene("scn-bridge", "Furnace Bridge");
    const html = renderToStaticMarkup(
      <SceneManagerTabs assets={[]} canSelectScenes scenes={[vault, bridge]} selectedSceneId={bridge.id} selectedSceneIds={[vault.id]} onSelectScene={vi.fn()} onToggleSceneSelection={vi.fn()} />
    );

    expect(html).toContain('aria-label="Manage scenes"');
    expect(html).toContain("Vault Entry");
    expect(html).toContain("Furnace Bridge");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Select scene Vault Entry"');
  });

  it("uses a usable map thumbnail and omits bulk selectors without update permission", () => {
    const vault = { ...scene("scn-vault", "Vault Entry", true), backgroundAssetId: "asset-vault" };
    const asset = {
      id: "asset-vault",
      campaignId: "camp-scenes",
      name: "Vault map",
      mimeType: "image/webp",
      sizeBytes: 100,
      url: "/api/v1/assets/asset-vault/blob",
      lifecycle: { status: "active" },
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies MapAsset;
    const html = renderToStaticMarkup(
      <SceneManagerTabs assets={[asset]} canSelectScenes={false} scenes={[vault]} selectedSceneId={vault.id} selectedSceneIds={[]} onSelectScene={vi.fn()} onToggleSceneSelection={vi.fn()} />
    );

    expect(html).toContain('/api/v1/assets/asset-vault/blob');
    expect(html).not.toContain("Select scene Vault Entry");
  });
});
