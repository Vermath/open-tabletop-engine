import type { CampaignArchive, Scene, Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("tactical map aids", () => {
  it("keeps terrain and cover authoring GM-controlled while exposing advisory measurement", async () => {
    const store = new MemoryStateStore();
    const source = store.state.tokens.find((token) => token.id === "tok_valen")!;
    store.state.tokens.push({
      ...structuredClone(source),
      id: "tok_cover_target",
      actorId: undefined,
      name: "Cover Target",
      x: 650,
      disposition: "hostile",
      ownerUserIds: [],
      targetedByUserIds: [],
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z"
    } satisfies Token);
    const initialRevision = store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt;
    let revision = initialRevision;
    const app = await buildApp({ store });
    try {
      const terrainPayload = {
        label: "Collapsed masonry",
        color: "#d97706",
        points: [{ x: 400, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 500 }, { x: 400, y: 500 }]
      };
      const deniedTerrain = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/difficult-terrain",
        headers: { ...playerHeaders, "idempotency-key": "terrain-player-denied" },
        payload: terrainPayload
      });
      expect(deniedTerrain.statusCode).toBe(403);

      const createdTerrain = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/difficult-terrain",
        headers: { ...gmHeaders, "idempotency-key": "terrain-create-1" },
        payload: { ...terrainPayload, expectedUpdatedAt: revision }
      });
      expect(createdTerrain.statusCode).toBe(200);
      revision = createdTerrain.json().updatedAt as string;
      const regionId = createdTerrain.json().difficultTerrain[0].id as string;
      expect(createdTerrain.json().difficultTerrain[0]).toMatchObject({ label: "Collapsed masonry", createdByUserId: "usr_demo_gm" });

      const replayedTerrain = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/difficult-terrain",
        headers: { ...gmHeaders, "idempotency-key": "terrain-create-1" },
        payload: { ...terrainPayload, expectedUpdatedAt: initialRevision }
      });
      expect(replayedTerrain.statusCode).toBe(200);
      expect(replayedTerrain.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.scenes.find((scene) => scene.id === "scn_vault_entry")?.difficultTerrain).toHaveLength(1);

      const staleTerrain = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/difficult-terrain",
        headers: { ...gmHeaders, "idempotency-key": "terrain-create-stale" },
        payload: { ...terrainPayload, label: "Stale copy", expectedUpdatedAt: initialRevision }
      });
      expect(staleTerrain.statusCode).toBe(409);
      expect(staleTerrain.json()).toMatchObject({ code: "stale_write", resourceType: "scene", currentUpdatedAt: revision });

      const measured = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/path-measurement",
        headers: { ...playerHeaders, "idempotency-key": "cover-player-denied" },
        payload: { points: [{ x: 300, y: 400 }, { x: 700, y: 400 }] }
      });
      expect(measured.statusCode).toBe(200);
      expect(measured.json()).toMatchObject({
        unit: "feet",
        normalDistance: 20,
        difficultTerrainDistance: 20,
        totalDistance: 40,
        movementCostDistance: 60
      });
      expect(store.state.tokens.find((token) => token.id === "tok_valen")).toMatchObject({ x: source.x, y: source.y });

      const renamed = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/scn_vault_entry/difficult-terrain/${regionId}`,
        headers: { ...gmHeaders, "idempotency-key": "terrain-update-1" },
        payload: { label: "Deep collapsed masonry", expectedUpdatedAt: revision }
      });
      expect(renamed.statusCode).toBe(200);
      revision = renamed.json().updatedAt as string;
      expect(renamed.json().difficultTerrain[0].label).toBe("Deep collapsed masonry");

      const deniedCover = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/cover-overrides",
        headers: playerHeaders,
        payload: { sourceTokenId: "tok_valen", targetTokenId: "tok_cover_target", level: "half" }
      });
      expect(deniedCover.statusCode).toBe(403);

      const coverPayload = { sourceTokenId: "tok_valen", targetTokenId: "tok_cover_target", level: "three_quarters", note: "Arrow slit ruling" };
      const createdCover = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/cover-overrides",
        headers: { ...gmHeaders, "idempotency-key": "cover-create-1" },
        payload: { ...coverPayload, expectedUpdatedAt: revision }
      });
      expect(createdCover.statusCode).toBe(200);
      revision = createdCover.json().updatedAt as string;
      const overrideId = createdCover.json().coverOverrides[0].id as string;
      expect(createdCover.json().coverOverrides[0]).toMatchObject({ ...coverPayload, createdByUserId: "usr_demo_gm" });

      const search = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/search?q=collapsed", headers: gmHeaders });
      expect(search.statusCode).toBe(200);
      expect(search.json()).toEqual(expect.arrayContaining([expect.objectContaining({ type: "scene", id: "scn_vault_entry" })]));

      const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(exported.statusCode).toBe(200);
      const archive = exported.json() as CampaignArchive;
      const archivedScene = archive.data.scenes.find((scene) => scene.id === "scn_vault_entry") as Scene;
      expect(archivedScene.difficultTerrain).toEqual(expect.arrayContaining([expect.objectContaining({ id: regionId, label: "Deep collapsed masonry" })]));
      expect(archivedScene.coverOverrides).toEqual(expect.arrayContaining([expect.objectContaining({ id: overrideId, level: "three_quarters" })]));

      const deletedCover = await app.inject({
        method: "DELETE",
        url: `/api/v1/scenes/scn_vault_entry/cover-overrides/${overrideId}?expectedUpdatedAt=${encodeURIComponent(revision)}`,
        headers: { ...gmHeaders, "idempotency-key": "cover-delete-1" }
      });
      expect(deletedCover.statusCode).toBe(200);
      revision = deletedCover.json().updatedAt as string;
      expect(deletedCover.json().coverOverrides).toEqual([]);

      const recreatedCover = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/cover-overrides",
        headers: { ...gmHeaders, "idempotency-key": "cover-create-2" },
        payload: { ...coverPayload, expectedUpdatedAt: revision }
      });
      expect(recreatedCover.statusCode).toBe(200);
      revision = recreatedCover.json().updatedAt as string;
      const deletedToken = await app.inject({
        method: "DELETE",
        url: `/api/v1/tokens/tok_cover_target?expectedUpdatedAt=${encodeURIComponent(store.state.tokens.find((token) => token.id === "tok_cover_target")!.updatedAt)}`,
        headers: { ...gmHeaders, "idempotency-key": "cover-target-token-delete" }
      });
      expect(deletedToken.statusCode).toBe(200);
      expect(store.state.scenes.find((scene) => scene.id === "scn_vault_entry")?.coverOverrides).toEqual([]);
      revision = store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt;

      const deletedTerrain = await app.inject({
        method: "DELETE",
        url: `/api/v1/scenes/scn_vault_entry/difficult-terrain/${regionId}?expectedUpdatedAt=${encodeURIComponent(revision)}`,
        headers: { ...gmHeaders, "idempotency-key": "terrain-delete-1" }
      });
      expect(deletedTerrain.statusCode).toBe(200);
      expect(deletedTerrain.json().difficultTerrain).toEqual([]);
      expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining([
        "scene.difficultTerrain.create",
        "scene.difficultTerrain.update",
        "scene.difficultTerrain.delete",
        "scene.coverOverride.create",
        "scene.coverOverride.delete"
      ]));
    } finally {
      await app.close();
    }
  });

  it("rejects degenerate terrain and cross-scene cover references", async () => {
    const store = new MemoryStateStore();
    const revision = store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt;
    const app = await buildApp({ store });
    try {
      const degenerate = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/difficult-terrain",
        headers: { ...gmHeaders, "idempotency-key": "terrain-degenerate" },
        payload: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }], expectedUpdatedAt: revision }
      });
      expect(degenerate.statusCode).toBe(400);
      expect(degenerate.json()).toMatchObject({ message: "Difficult terrain polygon must enclose an area" });

      const invalidCover = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/cover-overrides",
        headers: { ...gmHeaders, "idempotency-key": "cover-invalid" },
        payload: { sourceTokenId: "tok_valen", targetTokenId: "tok_elsewhere", level: "half", expectedUpdatedAt: revision }
      });
      expect(invalidCover.statusCode).toBe(400);
      expect(invalidCover.json()).toMatchObject({ message: "Cover override tokens must belong to this scene" });
    } finally {
      await app.close();
    }
  });
});
