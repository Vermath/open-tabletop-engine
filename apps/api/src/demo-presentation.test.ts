import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };

it("installs the illustrated demo once and restores its six originals from a campaign archive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "otte-demo-art-"));
  const store = new MemoryStateStore();
  const uploadDir = join(directory, "source");
  const app = await buildApp({ store, uploadDir, seedDemoPresentation: true });
  try {
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry");
    const assets = store.state.assets.filter((asset) => asset.campaignId === "camp_demo");
    const map = assets.find((asset) => asset.id === scene?.backgroundAssetId);
    expect(scene).toMatchObject({ width: 2800, height: 2100, gridSize: 100, metadata: { mapCalibrationComplete: true } });
    expect(scene?.lights).toHaveLength(3);
    expect(scene?.walls.filter((wall) => wall.kind === "door" && wall.open === false)).toHaveLength(2);
    for (const x of [730, 2340]) {
      expect(scene?.walls.some((wall) => wall.y1 === 472 && wall.y2 === 472 && wall.x1 <= x && x <= wall.x2)).toBe(false);
    }
    expect(scene?.fog).toMatchObject([{ mode: "reveal", shape: "polygon" }]);
    expect(map).toMatchObject({ image: { width: 2800, height: 2100 }, mimeType: "image/webp" });
    expect(map?.renditions?.length).toBeGreaterThan(0);
    expect(assets).toHaveLength(6);
    expect(assets.every((asset) => asset.storage && asset.checksum && asset.security?.status === "clean")).toBe(true);

    const tokens = store.state.tokens.filter((token) => token.sceneId === scene?.id);
    expect(tokens).toHaveLength(5);
    expect(new Set(tokens.map((token) => token.imageAssetId))).toEqual(new Set(assets.filter((asset) => asset !== map).map((asset) => asset.id)));
    expect(store.state.encounters.find((encounter) => encounter.name === "The Vault Watch")?.tokenIds).toEqual(tokens.filter((token) => token.disposition === "hostile").map((token) => token.id));
    for (const token of tokens.filter((candidate) => candidate.disposition === "hostile")) {
      const actor = store.state.actors.find(({ id }) => id === token.actorId);
      expect(actor?.data).toMatchObject({
        armorClass: expect.any(Number),
        hp: { max: expect.any(Number) },
        monster: { statBlock: { actions: expect.arrayContaining([expect.objectContaining({ attackBonus: expect.any(Number), damageFormula: expect.any(String) })]) } },
      });
      expect(actor?.data.armorClass).not.toBe(10);
    }

    const restarted = await buildApp({ store, uploadDir, seedDemoPresentation: true });
    await restarted.close();
    expect(store.state.assets).toEqual(assets);
    expect(store.state.tokens.filter((token) => token.sceneId === scene?.id)).toEqual(tokens);

    const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers });
    expect(exported.statusCode, exported.body).toBe(200);
    const archive = exported.json();
    expect(archive.files.map((file: { assetId: string }) => file.assetId).sort()).toEqual(assets.map((asset) => asset.id).sort());

    const importedStore = new MemoryStateStore();
    const destination = await buildApp({ store: importedStore, uploadDir: join(directory, "destination") });
    try {
      const imported = await destination.inject({ method: "POST", url: "/api/v1/import/campaign", headers, payload: archive });
      expect(imported.statusCode, imported.body).toBe(200);
      const reexport = await destination.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers });
      expect(reexport.statusCode, reexport.body).toBe(200);
      expect(reexport.json().files).toEqual(expect.arrayContaining(archive.files));
      expect(importedStore.state.scenes.find((candidate) => candidate.id === scene?.id)?.backgroundAssetId).toBe(map?.id);
    } finally {
      await destination.close();
    }
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
