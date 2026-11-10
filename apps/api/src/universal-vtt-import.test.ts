import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const store = new MemoryStateStore();
  const uploadDir = await mkdtemp(join(tmpdir(), "otte-uvtt-review-"));
  directories.push(uploadDir);
  const app = await buildApp({ store, uploadDir });
  apps.push(app);
  const image = await sharp({ create: { width: 100, height: 100, channels: 4, background: "#334455" } }).png().toBuffer();
  const campaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;
  const payload = {
    name: "Imported vault", sourceFileName: "vault.dd2vtt", expectedCampaignUpdatedAt: campaign.updatedAt,
    document: JSON.stringify({ format: 0.3, resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 1, y: 1 }, pixels_per_grid: 100 }, image: image.toString("base64"), line_of_sight: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]] })
  };
  return { app, store, payload, url: `/api/v1/campaigns/${campaign.id}/scenes/import-universal-vtt` };
}

describe("registered Universal VTT import", () => {
  it("persists the reviewed scene and image and replays an idempotent request", async () => {
    const { app, store, payload, url } = await fixture();
    const request = { method: "POST" as const, url, headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "uvtt-import-review" }, payload };
    const response = await app.inject(request);
    expect(response.statusCode).toBe(201);
    const result = response.json();
    expect(result.scene).toMatchObject({ name: payload.name, active: false, width: 100, height: 100, walls: [expect.objectContaining({ kind: "wall" })] });
    expect(store.state.scenes.find((item) => item.id === result.scene.id)).toBeDefined();
    expect(store.state.assets.find((item) => item.id === result.asset.id)).toBeDefined();
    expect((await app.inject(request)).json()).toEqual(result);
    expect(store.state.scenes.filter((item) => item.id === result.scene.id)).toHaveLength(1);
  });

  it("requires scene.create permission before importing", async () => {
    const { app, store, payload, url } = await fixture();
    const before = { scenes: store.state.scenes.length, assets: store.state.assets.length };
    const response = await app.inject({ method: "POST", url, headers: { "x-user-id": "usr_demo_player", "idempotency-key": "uvtt-denied" }, payload });
    expect(response.statusCode).toBe(403);
    expect({ scenes: store.state.scenes.length, assets: store.state.assets.length }).toEqual(before);
  });

  it("rejects a stale campaign revision without creating a scene or asset", async () => {
    const { app, store, payload, url } = await fixture();
    const before = { scenes: store.state.scenes.length, assets: store.state.assets.length };
    const response = await app.inject({ method: "POST", url, headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "uvtt-stale" }, payload: { ...payload, expectedCampaignUpdatedAt: "2000-01-01T00:00:00.000Z" } });
    expect(response.statusCode).toBe(409);
    expect({ scenes: store.state.scenes.length, assets: store.state.assets.length }).toEqual(before);
  });
});
