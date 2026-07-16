import { createTimestamped, type EncounterMonsterPlacementBatchInput, type PermissionGrant } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { CampaignWebhookTransport, CampaignWebhookTransportInput } from "./campaign-webhooks.js";
import { MemoryStateStore } from "./store.js";

const path = "/api/v1/scenes/scn_vault_entry/encounter-monster-placements";
const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function placement(name: string, x: number, width = 50) {
  return {
    threatId: "goblin-boss",
    name,
    x,
    y: 350,
    width,
    height: 50,
    layer: "player" as const,
    disposition: "hostile" as const,
  };
}

function batch(expectedUpdatedAt: string, placements = [placement("Goblin Boss", 500)]): EncounterMonsterPlacementBatchInput {
  return { systemId: "dnd-5e-srd", expectedUpdatedAt, placements };
}

describe("atomic encounter monster placement", () => {
  it("commits every actor/token pair once and durably replays the exact response", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const initialRevision = scene.updatedAt;
    const initialActorCount = store.state.actors.length;
    const initialTokenCount = store.state.tokens.length;
    const payload = batch(initialRevision, [
      placement("Goblin Boss 1", 500),
      placement("Goblin Boss 2", 550),
    ]);
    const headers = { ...gmHeaders, "idempotency-key": "encounter-placement-success" };

    try {
      const response = await app.inject({ method: "POST", url: path, headers, payload });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.placements).toHaveLength(2);
      expect(body.scene.updatedAt).not.toBe(initialRevision);
      expect(store.state.actors).toHaveLength(initialActorCount + 2);
      expect(store.state.tokens).toHaveLength(initialTokenCount + 2);
      for (const result of body.placements) {
        expect(result.sceneToken).toMatchObject({
          sceneId: scene.id,
          actorId: result.actor.id,
          layer: "player",
          disposition: "hostile",
        });
        expect(store.state.actors.some((actor) => actor.id === result.actor.id)).toBe(true);
        expect(store.state.tokens.some((token) => token.id === result.sceneToken.id && token.actorId === result.actor.id)).toBe(true);
      }

      const replay = await app.inject({ method: "POST", url: path, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(response.body);
      expect(store.state.actors).toHaveLength(initialActorCount + 2);
      expect(store.state.tokens).toHaveLength(initialTokenCount + 2);
      expect(scene.updatedAt).toBe(body.scene.updatedAt);
    } finally {
      await app.close();
    }
  });

  it("replays the committed batch after an application restart", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const initialActorCount = store.state.actors.length;
    const initialTokenCount = store.state.tokens.length;
    const payload = batch(scene.updatedAt);
    const headers = { ...gmHeaders, "idempotency-key": "encounter-placement-restart" };
    const firstApp = await buildApp({ store });
    let firstBody = "";
    try {
      const response = await firstApp.inject({ method: "POST", url: path, headers, payload });
      expect(response.statusCode).toBe(200);
      firstBody = response.body;
    } finally {
      await firstApp.close();
    }

    const restartedStore = new MemoryStateStore(structuredClone(store.state));
    const restartedApp = await buildApp({ store: restartedStore });
    try {
      const replay = await restartedApp.inject({ method: "POST", url: path, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(firstBody);
      expect(restartedStore.state.actors).toHaveLength(initialActorCount + 1);
      expect(restartedStore.state.tokens).toHaveLength(initialTokenCount + 1);
    } finally {
      await restartedApp.close();
    }
  });

  it("validates the entire batch before mutating any actor, token, or scene revision", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const initialRevision = scene.updatedAt;
    const initialActorCount = store.state.actors.length;
    const initialTokenCount = store.state.tokens.length;

    try {
      const response = await app.inject({
        method: "POST",
        url: path,
        headers: { ...gmHeaders, "idempotency-key": "encounter-placement-invalid-second" },
        payload: batch(initialRevision, [
          placement("Valid First Placement", 500),
          placement("Invalid Second Placement", 550, -1),
        ]),
      });

      expect(response.statusCode).toBe(400);
      expect(store.state.actors).toHaveLength(initialActorCount);
      expect(store.state.tokens).toHaveLength(initialTokenCount);
      expect(scene.updatedAt).toBe(initialRevision);
    } finally {
      await app.close();
    }
  });

  it("requires an exact scene revision without partial writes", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const initialRevision = scene.updatedAt;
    const initialActorCount = store.state.actors.length;
    const initialTokenCount = store.state.tokens.length;

    try {
      const missing = await app.inject({
        method: "POST",
        url: path,
        headers: { ...gmHeaders, "idempotency-key": "encounter-placement-missing-revision" },
        payload: { systemId: "dnd-5e-srd", placements: [placement("Missing Revision", 500)] },
      });
      expect(missing.statusCode).toBe(400);

      const stale = await app.inject({
        method: "POST",
        url: path,
        headers: { ...gmHeaders, "idempotency-key": "encounter-placement-stale-revision" },
        payload: batch("2020-01-01T00:00:00.000Z"),
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", resourceType: "scene", resourceId: scene.id });
      expect(store.state.actors).toHaveLength(initialActorCount);
      expect(store.state.tokens).toHaveLength(initialTokenCount);
      expect(scene.updatedAt).toBe(initialRevision);
    } finally {
      await app.close();
    }
  });

  it("rolls back the batch and emits no campaign events when persistence fails", async () => {
    class FailingFlushStore extends MemoryStateStore {
      failNextFlush = false;
      pending = false;

      override save(): void {
        this.pending = true;
      }

      override flush(): void {
        if (!this.pending) return;
        if (this.failNextFlush) {
          this.failNextFlush = false;
          throw new Error("injected encounter placement persistence failure");
        }
        this.pending = false;
      }
    }

    class RecordingTransport implements CampaignWebhookTransport {
      sent: CampaignWebhookTransportInput[] = [];
      async validateTarget(url: string) {
        return { ok: true as const, normalizedUrl: url, resolvedAddresses: ["203.0.113.10"] };
      }
      async send(input: CampaignWebhookTransportInput) {
        this.sent.push(structuredClone(input));
        return { ok: true as const, responseStatus: 204, responseBytes: 0 };
      }
    }

    const store = new FailingFlushStore();
    store.state.campaignWebhooks.push(createTimestamped("cwh", {
      id: "cwh_encounter_placement_atomicity",
      campaignId: "camp_demo",
      name: "Atomic placement witness",
      url: "https://hooks.example.test/encounter-placement",
      eventTypes: ["actor.created" as const, "token.created" as const, "scene.updated" as const],
      enabled: true,
      signingSecret: "otte_whsec_encounter_atomicity",
      secretHint: "omicity",
      createdByUserId: "usr_demo_gm",
      updatedByUserId: "usr_demo_gm",
    }));
    const transport = new RecordingTransport();
    const app = await buildApp({ store, webhookTransport: transport });
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const initialRevision = scene.updatedAt;
    const initialActorCount = store.state.actors.length;
    const initialTokenCount = store.state.tokens.length;

    try {
      store.failNextFlush = true;
      const response = await app.inject({
        method: "POST",
        url: path,
        headers: { ...gmHeaders, "idempotency-key": "encounter-placement-persistence-failure" },
        payload: batch(initialRevision),
      });
      expect(response.statusCode).toBe(500);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(transport.sent).toEqual([]);
      expect(store.state.actors).toHaveLength(initialActorCount);
      expect(store.state.tokens).toHaveLength(initialTokenCount);
      expect(store.state.scenes.find((candidate) => candidate.id === scene.id)?.updatedAt).toBe(initialRevision);
      expect(store.state.idempotencyRecords.some((record) => record.key === "encounter-placement-persistence-failure")).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("requires actor.create and token.create independently before writing", async () => {
    const store = new MemoryStateStore();
    const grant: PermissionGrant = createTimestamped("grant", {
      campaignId: "camp_demo",
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      permissions: ["actor.create"],
    });
    store.state.permissionGrants.push(grant);
    const app = await buildApp({ store });
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const initialActorCount = store.state.actors.length;
    const initialTokenCount = store.state.tokens.length;

    try {
      const missingTokenPermission = await app.inject({
        method: "POST",
        url: path,
        headers: { ...playerHeaders, "idempotency-key": "encounter-placement-actor-only" },
        payload: batch(scene.updatedAt),
      });
      expect(missingTokenPermission.statusCode).toBe(403);
      expect(missingTokenPermission.json().message).toContain("token.create");

      grant.permissions = ["token.create"];
      const missingActorPermission = await app.inject({
        method: "POST",
        url: path,
        headers: { ...playerHeaders, "idempotency-key": "encounter-placement-token-only" },
        payload: batch(scene.updatedAt),
      });
      expect(missingActorPermission.statusCode).toBe(403);
      expect(missingActorPermission.json().message).toContain("actor.create");
      expect(store.state.actors).toHaveLength(initialActorCount);
      expect(store.state.tokens).toHaveLength(initialTokenCount);
    } finally {
      await app.close();
    }
  });
});
