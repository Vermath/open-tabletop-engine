import type { AudioTrack, MapAsset } from "@open-tabletop/core";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

async function loginHeaders(app: FastifyInstance, email: string): Promise<{ authorization: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email },
  });
  expect(response.statusCode).toBe(200);
  return { authorization: `Bearer ${(response.json() as { token: string }).token}` };
}

describe("uploaded soundboard asset visibility", () => {
  it("lets players mint delivery URLs only while the linked audio track is playing", async () => {
    const store = new MemoryStateStore();
    const timestamp = "2026-07-18T12:00:00.000Z";
    const asset: MapAsset = {
      id: "asset_soundboard_visibility",
      campaignId: "camp_demo",
      name: "Relay ambience.wav",
      url: "/api/v1/assets/asset_soundboard_visibility/blob",
      mimeType: "audio/wav",
      sizeBytes: 24,
      checksum: "sha256:soundboard-visibility",
      folder: "audio",
      tags: ["audio", "ambient"],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.state.assets.push(asset);
    const app = await buildApp({ store });

    try {
      const gmHeaders = await loginHeaders(app, "gm@example.test");
      const playerHeaders = await loginHeaders(app, "player@example.test");
      const deliveryPath = `/api/v1/assets/${asset.id}/delivery-url`;

      const hiddenBeforePlayback = await app.inject({
        method: "POST",
        url: deliveryPath,
        headers: playerHeaders,
        payload: { expiresInSeconds: 300, disposition: "inline" },
      });
      expect(hiddenBeforePlayback.statusCode).toBe(404);

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/audio",
        headers: { ...gmHeaders, "idempotency-key": "soundboard-visibility-create" },
        payload: { name: "Relay ambience", url: asset.url, kind: "ambient", loop: true },
      });
      expect(created.statusCode).toBe(200);
      const track = created.json() as AudioTrack;
      const started = await app.inject({
        method: "PATCH",
        url: `/api/v1/audio/${track.id}`,
        headers: { ...gmHeaders, "idempotency-key": "soundboard-visibility-start" },
        payload: { playing: true, expectedUpdatedAt: track.updatedAt },
      });
      expect(started.statusCode).toBe(200);
      const playingTrack = started.json() as AudioTrack;

      const playerTracks = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/audio",
        headers: playerHeaders,
      });
      expect(playerTracks.statusCode).toBe(200);
      expect(playerTracks.json()).toEqual([
        expect.objectContaining({ id: track.id, url: asset.url, playing: true }),
      ]);

      const visibleDuringPlayback = await app.inject({
        method: "POST",
        url: deliveryPath,
        headers: playerHeaders,
        payload: { expiresInSeconds: 300, disposition: "inline" },
      });
      expect(visibleDuringPlayback.statusCode).toBe(200);
      expect(visibleDuringPlayback.json()).toEqual(expect.objectContaining({
        assetId: asset.id,
        url: expect.stringContaining(`/api/v1/assets/${asset.id}/blob?`),
      }));

      const stopped = await app.inject({
        method: "PATCH",
        url: `/api/v1/audio/${track.id}`,
        headers: { ...gmHeaders, "idempotency-key": "soundboard-visibility-stop" },
        payload: { playing: false, expectedUpdatedAt: playingTrack.updatedAt },
      });
      expect(stopped.statusCode).toBe(200);

      const playerTracksAfterStop = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/audio",
        headers: playerHeaders,
      });
      expect(playerTracksAfterStop.statusCode).toBe(200);
      expect(playerTracksAfterStop.json()).toEqual([]);

      const hiddenAfterPlayback = await app.inject({
        method: "POST",
        url: deliveryPath,
        headers: playerHeaders,
        payload: { expiresInSeconds: 300, disposition: "inline" },
      });
      expect(hiddenAfterPlayback.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
