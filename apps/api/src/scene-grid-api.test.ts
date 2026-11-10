import { makeArchive, normalizeEngineState, sceneGridOrigin, seedState, type Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { validateCampaignArchiveShape } from "./archive-validation.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("scene grid calibration API", () => {
  it("persists fractional origins with permission, revision, identity, and undo guards", async () => {
    const store = new MemoryStateStore(seedState());
    const app = await buildApp({ store });
    let sequence = 0;
    const headers = () => ({ ...gmHeaders, "idempotency-key": `grid-calibration-${++sequence}` });
    try {
      const campaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;
      const createdResponse = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/scenes", headers: headers(), payload: { name: "Fractional grid", width: 202.5, height: 164.75, gridSize: 37.5, gridOrigin: { x: 12.25, y: -8.5 }, expectedUpdatedAt: campaign.updatedAt } });
      expect(createdResponse.statusCode).toBe(200);
      const created = createdResponse.json() as Scene;
      expect(created).toMatchObject({ width: 202.5, height: 164.75, gridSize: 37.5, gridOrigin: { x: 12.25, y: -8.5 } });
      const denied = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${created.id}`, headers: { ...playerHeaders, "idempotency-key": "grid-player-denied" }, payload: { gridOrigin: { x: 2, y: 3 }, expectedUpdatedAt: created.updatedAt } });
      expect(denied.statusCode).toBe(403);
      const identity = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${created.id}`, headers: headers(), payload: { id: "scn_changed", gridOrigin: { x: 2, y: 3 }, expectedUpdatedAt: created.updatedAt } });
      expect(identity.statusCode).toBe(400);
      const patchedResponse = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${created.id}`, headers: headers(), payload: { gridSize: 62.125, gridOrigin: { x: -25.125, y: 18.875 }, expectedUpdatedAt: created.updatedAt } });
      expect(patchedResponse.statusCode).toBe(200);
      const patched = patchedResponse.json() as Scene;
      expect(patched).toMatchObject({ id: created.id, campaignId: created.campaignId, createdAt: created.createdAt, gridSize: 62.125, gridOrigin: { x: -25.125, y: 18.875 } });
      expect(Date.parse(patched.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
      const stale = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${created.id}`, headers: headers(), payload: { gridOrigin: { x: 1, y: 1 }, expectedUpdatedAt: created.updatedAt } });
      expect(stale.statusCode).toBe(409);
      const undo = await app.inject({ method: "POST", url: `/api/v1/scenes/${created.id}/undo`, headers: headers(), payload: { expectedUpdatedAt: patched.updatedAt } });
      expect(undo.statusCode).toBe(200);
      expect(undo.json()).toMatchObject({ id: created.id, createdAt: created.createdAt, gridSize: 37.5, gridOrigin: { x: 12.25, y: -8.5 } });
      expect(Date.parse(undo.json().updatedAt)).toBeGreaterThan(Date.parse(patched.updatedAt));
      const reloaded = await app.inject({ method: "GET", url: `/api/v1/scenes/${created.id}`, headers: gmHeaders });
      expect(reloaded.json()).toMatchObject({ gridSize: 37.5, gridOrigin: { x: 12.25, y: -8.5 } });
    } finally { await app.close(); }
  }, 15_000);

  it("rejects malformed calibration before mutation and restores legacy defaults on undo", async () => {
    const store = new MemoryStateStore(seedState());
    const app = await buildApp({ store });
    const scene = store.state.scenes[0]!;
    const original = structuredClone(scene);
    let sequence = 0;
    const headers = () => ({ ...gmHeaders, "idempotency-key": `grid-validation-${++sequence}` });
    try {
      for (const fields of [
        { gridOrigin: null }, { gridOrigin: { x: 1 } }, { gridOrigin: { x: "1", y: 2 } },
        { gridOrigin: { x: 0, y: 100001 } }, { gridOrigin: { x: -100001, y: 0 } },
        { gridOrigin: { x: 0, y: 0, z: 0 } }, { gridSize: 0.5 }, { gridSize: 10001 },
        { width: 100001 }, { height: 100001 },
      ]) {
        const patch = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${scene.id}`, headers: headers(), payload: { ...fields, expectedUpdatedAt: original.updatedAt } });
        expect(patch.statusCode, JSON.stringify(fields)).toBe(400);
        const create = await app.inject({ method: "POST", url: `/api/v1/campaigns/${scene.campaignId}/scenes`, headers: headers(), payload: { ...fields, active: true, expectedUpdatedAt: store.state.campaigns[0]!.updatedAt } });
        expect(create.statusCode, JSON.stringify(fields)).toBe(400);
        expect(store.state.scenes).toHaveLength(1);
        expect(store.state.scenes[0]).toEqual(original);
      }
      const changed = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${scene.id}`, headers: headers(), payload: { gridSize: 33.125, gridOrigin: { x: -100000, y: 100000 }, expectedUpdatedAt: scene.updatedAt } });
      expect(changed.statusCode).toBe(200);
      const undo = await app.inject({ method: "POST", url: `/api/v1/scenes/${scene.id}/undo`, headers: headers(), payload: { expectedUpdatedAt: changed.json().updatedAt } });
      expect(undo.statusCode).toBe(200);
      expect(undo.json().gridSize).toBe(original.gridSize);
      expect(undo.json().gridOrigin).toBeUndefined();
      expect(sceneGridOrigin(undo.json())).toEqual({ x: 0, y: 0 });
    } finally { await app.close(); }
  }, 15_000);

  it("uses exact calibrated annotation points and leaves gridless coordinates continuous", async () => {
    const state = seedState();
    Object.assign(state.scenes[0]!, { width: 202.5, height: 164.75, gridSize: 37.5, gridOrigin: { x: 12.25, y: -8.5 } });
    const store = new MemoryStateStore(state);
    const app = await buildApp({ store });
    let sequence = 0;
    const headers = () => ({ ...gmHeaders, "idempotency-key": `grid-annotations-${++sequence}` });
    try {
      const scene = store.state.scenes[0]!;
      const annotation = await app.inject({ method: "POST", url: `/api/v1/scenes/${scene.id}/annotations`, headers: headers(), payload: { kind: "ruler", points: [{ x: 51.75, y: 70 }, { x: 999, y: -99 }], snapToGrid: true, expectedUpdatedAt: scene.updatedAt } });
      expect(annotation.statusCode).toBe(200);
      expect((annotation.json() as Scene).annotations.at(-1)?.points).toEqual([{ x: 49.75, y: 66.5 }, { x: 202.5, y: 0 }]);
      const gridless = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${scene.id}`, headers: headers(), payload: { gridType: "gridless", expectedUpdatedAt: annotation.json().updatedAt } });
      expect(gridless.statusCode).toBe(200);
      const free = await app.inject({ method: "POST", url: `/api/v1/scenes/${scene.id}/annotations`, headers: headers(), payload: { kind: "ruler", points: [{ x: 63.125, y: 87.625 }, { x: 119.875, y: 143.25 }], snapToGrid: true, expectedUpdatedAt: gridless.json().updatedAt } });
      expect(free.statusCode).toBe(200);
      expect((free.json() as Scene).annotations.at(-1)).toMatchObject({ snapToGrid: false, points: [{ x: 63.125, y: 87.625 }, { x: 119.875, y: 143.25 }] });
    } finally { await app.close(); }
  }, 15_000);
});

describe("archived scene grid calibration", () => {
  it("exports and restores calibration through the real archive API alongside legacy scenes", async () => {
    const store = new MemoryStateStore(seedState());
    const original = store.state.scenes[0]!;
    store.state.scenes.push({ ...structuredClone(original), id: "scn_archive_grid", active: false, gridSize: 62.125, gridOrigin: { x: -25.125, y: 18.875 } });
    const app = await buildApp({ store });
    try {
      const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(exported.statusCode).toBe(200);
      const archive = exported.json();
      const calibrated = store.state.scenes.find((scene) => scene.id === "scn_archive_grid")!;
      const updated = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${calibrated.id}`, headers: { ...gmHeaders, "idempotency-key": "grid-archive-edit" }, payload: { gridOrigin: { x: 0, y: 0 }, gridSize: 50, expectedUpdatedAt: calibrated.updatedAt } });
      expect(updated.statusCode).toBe(200);
      const imported = await app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: { ...gmHeaders, "idempotency-key": "grid-archive-restore" }, payload: { archive, mode: "upsert", scope: "all", expectedUpdatedAt: store.state.campaigns[0]!.updatedAt } });
      expect(imported.statusCode).toBe(200);
      const loaded = await app.inject({ method: "GET", url: "/api/v1/scenes/scn_archive_grid", headers: gmHeaders });
      expect(loaded.statusCode).toBe(200);
      expect(loaded.json()).toMatchObject({ gridSize: 62.125, gridOrigin: { x: -25.125, y: 18.875 } });
      const legacy = await app.inject({ method: "GET", url: `/api/v1/scenes/${original.id}`, headers: gmHeaders });
      expect(legacy.statusCode).toBe(200);
      expect(legacy.json().gridOrigin).toBeUndefined();
    } finally { await app.close(); }
  }, 15_000);

  it("accepts legacy scenes and round-trips exact new origins through validated archive data", () => {
    const state = seedState();
    const legacy = makeArchive(state, "camp_demo");
    expect(validateCampaignArchiveShape(legacy, { maxAssetBytes: 1024 }).ok).toBe(true);
    Object.assign(state.scenes[0]!, { gridSize: 37.5, gridOrigin: { x: -12.25, y: 8.5 } });
    const serialized = JSON.parse(JSON.stringify(makeArchive(state, "camp_demo")));
    const validated = validateCampaignArchiveShape(serialized, { maxAssetBytes: 1024 });
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error(validated.error);
    expect(normalizeEngineState(validated.value.data).scenes[0]).toMatchObject({ gridSize: 37.5, gridOrigin: { x: -12.25, y: 8.5 } });
    for (const origin of [{ x: Infinity, y: 0 }, { x: 0, y: NaN }, { x: 100001, y: 0 }, { x: 1 }, null]) {
      const malformed = structuredClone(serialized);
      malformed.data.scenes[0].gridOrigin = origin;
      expect(validateCampaignArchiveShape(malformed, { maxAssetBytes: 1024 })).toMatchObject({ ok: false, error: expect.stringContaining("gridOrigin") });
    }
  });
});
