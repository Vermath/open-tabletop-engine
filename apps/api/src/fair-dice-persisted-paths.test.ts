import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { FileStateStore, MemoryStateStore } from "./store.js";

describe("persisted replay-verifiable dice paths", () => {
  it("persists and verifies a normal actor-sheet roll", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actorRoll = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_generic_demo/roll",
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "ability-strength", visibility: "public" },
      });
      expect(actorRoll.statusCode).toBe(200);
      expect(actorRoll.json().roll.fairness).toEqual(expect.objectContaining({
        algorithm: "xmur3-mulberry32",
        serverSeed: expect.any(String),
        serverSeedHash: expect.any(String),
      }));

      const verified = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/camp_demo/rolls/${actorRoll.json().roll.id}/verify`,
        headers: { "x-user-id": "usr_demo_player" },
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ verified: true, expected: { total: actorRoll.json().roll.total } });
    } finally {
      await app.close();
    }
  });

  it("keeps replay metadata verifiable across a durable restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-fair-dice-restart-"));
    const statePath = join(directory, "state.json");
    let firstStore: FileStateStore | undefined;
    let restartedStore: FileStateStore | undefined;
    try {
      firstStore = new FileStateStore(statePath);
      const firstApp = await buildApp({ store: firstStore });
      const created = await firstApp.inject({
        method: "POST",
        url: "/api/v1/dice/roll",
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "fair-restart-roll" },
        payload: { campaignId: "camp_demo", formula: "2d20kh1+3", label: "Restart proof" },
      });
      expect(created.statusCode, created.body).toBe(200);
      const rollId = created.json().id as string;
      firstStore.flush();
      await firstApp.close();
      firstStore.close();
      firstStore = undefined;

      restartedStore = new FileStateStore(statePath, { seedDemo: false });
      const restartedApp = await buildApp({ store: restartedStore });
      try {
        const verified = await restartedApp.inject({
          method: "GET",
          url: `/api/v1/campaigns/camp_demo/rolls/${rollId}/verify`,
          headers: { "x-user-id": "usr_demo_player" },
        });
        expect(verified.statusCode).toBe(200);
        expect(verified.json()).toMatchObject({ verified: true, rollId });
      } finally {
        await restartedApp.close();
      }
    } finally {
      firstStore?.close();
      restartedStore?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves replay-verifiable metadata when an archive is regenerated as a campaign copy", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/dice/roll",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "fair-archive-roll" },
        payload: { campaignId: "camp_demo", formula: "1d20+4", label: "Archive proof" },
      });
      expect(created.statusCode, created.body).toBe(200);

      const exported = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: { "x-user-id": "usr_demo_gm" },
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.json().data.rolls).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Archive proof", fairness: expect.objectContaining({ algorithm: "xmur3-mulberry32" }) }),
      ]));

      const imported = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "fair-archive-import" },
        payload: { archive: exported.json(), regenerateIds: true },
      });
      expect(imported.statusCode).toBe(200);
      const copiedCampaignId = imported.json().importedCampaignIds[0] as string;
      const copiedRoll = store.state.rolls.find((roll) => roll.campaignId === copiedCampaignId && roll.label === "Archive proof");
      expect(copiedRoll?.fairness).toEqual(expect.objectContaining({ algorithm: "xmur3-mulberry32" }));

      const verified = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/${copiedCampaignId}/rolls/${copiedRoll?.id}/verify`,
        headers: { "x-user-id": "usr_demo_player" },
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ verified: true, rollId: copiedRoll?.id });
    } finally {
      await app.close();
    }
  });
});
