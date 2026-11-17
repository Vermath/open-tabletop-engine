import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { makeArchive, type CampaignWebhookDelivery, type CampaignWebhookSubscription } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import {
  campaignWebhookEnvelope,
  createCampaignWebhookTransport,
  sendPinnedCampaignWebhook,
  validateCampaignWebhookTarget,
  type CampaignWebhookTransport,
  type CampaignWebhookTransportInput,
  type CampaignWebhookTransportResult,
} from "./campaign-webhooks.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const targetUrl = "https://hooks.example.test/events";
const updatedTargetUrl = "https://updated-hooks.example.test/events";

class RecordingWebhookTransport implements CampaignWebhookTransport {
  readonly sent: CampaignWebhookTransportInput[] = [];
  readonly results: CampaignWebhookTransportResult[] = [];
  sendBarrier?: Promise<void>;

  async validateTarget(url: string) {
    if (url !== targetUrl && url !== updatedTargetUrl) return { ok: false as const, errorCode: "invalid_target" as const, message: "Test target rejected" };
    return { ok: true as const, normalizedUrl: url, resolvedAddresses: ["203.0.113.10"] };
  }

  async send(input: CampaignWebhookTransportInput): Promise<CampaignWebhookTransportResult> {
    this.sent.push(structuredClone(input));
    if (this.sendBarrier) await this.sendBarrier;
    return this.results.shift() ?? { ok: true, responseStatus: 204, responseBytes: 0 };
  }
}

class DurableWebhookTestStore extends MemoryStateStore {}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(message);
}

describe("versioned campaign webhooks", () => {
  it("does not hold the durable mutation gate while a webhook transport is pending", async () => {
    const store = new DurableWebhookTestStore();
    const transport = new RecordingWebhookTransport();
    let releaseTransport: () => void = () => undefined;
    transport.sendBarrier = new Promise<void>((resolve) => {
      releaseTransport = resolve;
    });
    const app = await buildApp({ store, webhookTransport: transport });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/webhooks",
        headers: { ...gmHeaders, "idempotency-key": "webhook-unlocked-create" },
        payload: { name: "Unlocked delivery", url: targetUrl, eventTypes: ["campaign.updated"], expectedCampaignUpdatedAt: campaign.updatedAt },
      });
      expect(created.statusCode).toBe(201);
      const webhook = (created.json() as { webhook: { id: string; updatedAt: string } }).webhook;
      const queued = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/webhooks/${webhook.id}/test`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-unlocked-test" },
        payload: { expectedUpdatedAt: webhook.updatedAt },
      });
      expect(queued.statusCode).toBe(202);
      const deliveryId = (queued.json() as { id: string }).id;
      await waitFor(() => transport.sent.length === 1, "slow webhook delivery did not start");

      const actorWrite = app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-unlocked-actor-write" },
        payload: { name: "Valen during webhook delivery", expectedUpdatedAt: actor.updatedAt },
      });
      const timedOut = Symbol("timed-out");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const writeBeforeWebhookRelease = await Promise.race([
        actorWrite,
        new Promise<typeof timedOut>((resolve) => {
          timer = setTimeout(() => resolve(timedOut), 1_000);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (writeBeforeWebhookRelease === timedOut) {
        releaseTransport();
        await actorWrite;
        throw new Error("Unrelated actor write remained blocked behind webhook transport I/O");
      }

      expect(writeBeforeWebhookRelease.statusCode).toBe(200);
      expect(writeBeforeWebhookRelease.json()).toMatchObject({ id: actor.id, name: "Valen during webhook delivery" });
      expect(store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === deliveryId)?.status).toBe("queued");
      expect(store.state.auditLogs.some((log) => log.action === "campaign.webhook.test" && log.targetId === deliveryId)).toBe(true);

      releaseTransport();
      await waitFor(() => store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === deliveryId)?.status === "delivered", "slow webhook delivery did not finish");
      expect(transport.sent).toHaveLength(1);
    } finally {
      releaseTransport();
      await app.close();
    }
  }, 15_000);

  it("manages one-time secrets, safe signed delivery, async retry, audit, archive, and campaign cleanup", async () => {
    const store = new MemoryStateStore();
    const transport = new RecordingWebhookTransport();
    transport.results.push(
      { ok: false, responseStatus: 503, responseBytes: 4, errorCode: "http_error" },
      { ok: true, responseStatus: 202, responseBytes: 2 },
      { ok: true, responseStatus: 204, responseBytes: 0 },
    );
    const app = await buildApp({ store, webhookTransport: transport });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const route = "/api/v1/campaigns/camp_demo/webhooks";
    const createBody = {
      name: "Encounter log",
      url: targetUrl,
      eventTypes: ["campaign.updated"],
      expectedCampaignUpdatedAt: campaign.updatedAt,
    };
    const createHeaders = { ...gmHeaders, "idempotency-key": "webhook-create-once" };

    try {
      expect((await app.inject({ method: "GET", url: route, headers: playerHeaders })).statusCode).toBe(403);
      expect((await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "" },
        payload: createBody,
      })).statusCode).toBe(400);

      const created = await app.inject({ method: "POST", url: route, headers: createHeaders, payload: createBody });
      expect(created.statusCode).toBe(201);
      const createdBody = created.json() as { webhook: CampaignWebhookSubscription; signingSecret: string; campaignUpdatedAt: string };
      expect(createdBody.signingSecret).toMatch(/^otte_whsec_/);
      expect(createdBody.webhook).not.toHaveProperty("signingSecret");
      const webhookId = createdBody.webhook.id;

      const exactReplay = await app.inject({ method: "POST", url: route, headers: createHeaders, payload: createBody });
      expect(exactReplay.statusCode).toBe(200);
      expect(exactReplay.json()).toMatchObject({ signingSecretAlreadyShown: true, webhook: { id: webhookId } });
      expect(exactReplay.json()).not.toHaveProperty("signingSecret");
      const conflictingReplay = await app.inject({
        method: "POST",
        url: route,
        headers: createHeaders,
        payload: { ...createBody, name: "Different integration" },
      });
      expect(conflictingReplay.statusCode).toBe(409);
      expect(store.state.idempotencyRecords.some((record) => record.responseBody.includes("otte_whsec_"))).toBe(false);

      const listed = await app.inject({ method: "GET", url: route, headers: gmHeaders });
      expect(listed.statusCode).toBe(200);
      expect(JSON.stringify(listed.json())).not.toContain(createdBody.signingSecret);
      expect(listed.json()).toMatchObject({ items: [{ id: webhookId, secretConfigured: true }], supportedEventTypes: expect.arrayContaining(["campaign.updated"]) });

      const staleUpdate = await app.inject({
        method: "PATCH",
        url: `${route}/${webhookId}`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-update-stale" },
        payload: { name: "Stale", expectedUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(staleUpdate.statusCode).toBe(409);
      const currentWebhook = store.state.campaignWebhooks[0]!;
      const updated = await app.inject({
        method: "PATCH",
        url: `${route}/${webhookId}`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-update" },
        payload: { name: "Encounter events", expectedUpdatedAt: currentWebhook.updatedAt },
      });
      expect(updated.statusCode).toBe(200);
      const updatedInfo = updated.json() as { updatedAt: string };

      const rotateHeaders = { ...gmHeaders, "idempotency-key": "webhook-rotate-once" };
      const rotated = await app.inject({
        method: "POST",
        url: `${route}/${webhookId}/rotate-secret`,
        headers: rotateHeaders,
        payload: { expectedUpdatedAt: updatedInfo.updatedAt },
      });
      expect(rotated.statusCode).toBe(200);
      const rotatedBody = rotated.json() as { webhook: { updatedAt: string }; signingSecret: string };
      expect(rotatedBody.signingSecret).toMatch(/^otte_whsec_/);
      expect(rotatedBody.signingSecret).not.toBe(createdBody.signingSecret);
      const rotationReplay = await app.inject({
        method: "POST",
        url: `${route}/${webhookId}/rotate-secret`,
        headers: rotateHeaders,
        payload: { expectedUpdatedAt: updatedInfo.updatedAt },
      });
      expect(rotationReplay.statusCode).toBe(200);
      expect(rotationReplay.json()).toMatchObject({ signingSecretAlreadyShown: true });
      expect(rotationReplay.json()).not.toHaveProperty("signingSecret");
      expect(store.state.idempotencyRecords.some((record) => /signingSecret|otte_whsec_/i.test(record.responseBody))).toBe(false);

      const testResponse = await app.inject({
        method: "POST",
        url: `${route}/${webhookId}/test`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-test" },
        payload: { expectedUpdatedAt: rotatedBody.webhook.updatedAt },
      });
      expect(testResponse.statusCode).toBe(202);
      const testDelivery = testResponse.json() as CampaignWebhookDelivery;
      expect(testDelivery.status).toBe("queued");
      await waitFor(() => store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === testDelivery.id)?.status === "failed", "test delivery did not finish");
      const failed = store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === testDelivery.id)!;
      expect(failed).toMatchObject({ status: "failed", errorCode: "http_error", responseStatus: 503, attempt: 1 });

      const firstRequest = transport.sent[0]!;
      const envelope = JSON.parse(firstRequest.body) as Record<string, unknown>;
      expect(Object.keys(envelope).sort()).toEqual(["campaignId", "eventId", "eventType", "occurredAt", "resource", "version"]);
      expect(envelope).toMatchObject({ version: "1.0", eventType: "webhook.test", campaignId: "camp_demo" });
      expect(firstRequest.body).not.toMatch(/payload|chat|dice|actorUserId|signingSecret/i);
      const timestamp = firstRequest.headers["x-open-tabletop-timestamp"]!;
      const expectedSignature = createHmac("sha256", rotatedBody.signingSecret).update(`${timestamp}.${firstRequest.body}`, "utf8").digest("hex");
      expect(firstRequest.headers["x-open-tabletop-signature"]).toBe(`v1=${expectedSignature}`);
      expect(firstRequest.headers["x-open-tabletop-event-id"]).toBe(envelope.eventId);

      const retryResponse = await app.inject({
        method: "POST",
        url: `${route}/${webhookId}/deliveries/${failed.id}/retry`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-retry" },
        payload: { expectedUpdatedAt: rotatedBody.webhook.updatedAt },
      });
      expect(retryResponse.statusCode).toBe(202);
      const retry = retryResponse.json() as CampaignWebhookDelivery;
      await waitFor(() => store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === retry.id)?.status === "delivered", "retry delivery did not finish");
      expect(store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === retry.id)).toMatchObject({
        eventId: failed.eventId,
        attempt: 2,
        status: "delivered",
        retryOfDeliveryId: failed.id,
        responseStatus: 202,
      });

      const campaignUpdate = await app.inject({ method: "PATCH", url: "/api/v1/campaigns/camp_demo", headers: gmHeaders, payload: { description: "Emits metadata only" } });
      expect(campaignUpdate.statusCode).toBe(200);
      await waitFor(() => transport.sent.length === 3, "automatic campaign event did not finish");
      expect(JSON.parse(transport.sent[2]!.body)).toMatchObject({ version: "1.0", eventType: "campaign.updated", resource: { type: "campaign", id: "camp_demo" } });

      const liveWebhook = store.state.campaignWebhooks[0]!;
      const disabled = await app.inject({
        method: "POST",
        url: `${route}/${webhookId}/disable`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-disable" },
        payload: { expectedUpdatedAt: liveWebhook.updatedAt },
      });
      expect(disabled.statusCode).toBe(200);
      const sendCount = transport.sent.length;
      await app.inject({ method: "PATCH", url: "/api/v1/campaigns/camp_demo", headers: gmHeaders, payload: { description: "No disabled delivery" } });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(transport.sent).toHaveLength(sendCount);

      const archive = makeArchive(store.state, "camp_demo");
      expect(archive.data.campaignWebhooks).toEqual([]);
      expect(JSON.stringify(archive)).not.toContain("otte_whsec_");

      const deleteWebhook = await app.inject({
        method: "DELETE",
        url: `${route}/${webhookId}`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-delete" },
        payload: { expectedUpdatedAt: (disabled.json() as { updatedAt: string }).updatedAt },
      });
      expect(deleteWebhook.statusCode).toBe(200);
      expect(store.state.campaignWebhooks).toHaveLength(0);
      expect(store.state.campaignWebhookDeliveries.length).toBeGreaterThan(0);

      const deleteCampaign = await app.inject({ method: "DELETE", url: "/api/v1/campaigns/camp_demo", headers: gmHeaders });
      expect(deleteCampaign.statusCode).toBe(200);
      expect(store.state.campaignWebhooks).toEqual([]);
      expect(store.state.campaignWebhookDeliveries).toEqual([]);
      expect(store.state.auditLogs.some((log) => log.action === "campaign.webhook.create")).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("bounds retained delivery work and recovers interrupted queued rows as retryable failures", async () => {
    const store = new MemoryStateStore();
    const transport = new RecordingWebhookTransport();
    let releaseTransport: () => void = () => undefined;
    transport.sendBarrier = new Promise<void>((resolve) => {
      releaseTransport = resolve;
    });
    const app = await buildApp({ store, webhookTransport: transport });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/webhooks",
        headers: { ...gmHeaders, "idempotency-key": "webhook-retention-create" },
        payload: { name: "Retention", url: targetUrl, eventTypes: ["campaign.updated"], expectedCampaignUpdatedAt: campaign.updatedAt },
      });
      const webhook = store.state.campaignWebhooks[0]!;
      const base = Date.parse("2026-07-13T00:00:00.000Z");
      for (let index = 0; index < 500; index += 1) {
        const timestamp = new Date(base + index).toISOString();
        store.state.campaignWebhookDeliveries.push({
          id: `whdel_retained_${index}`,
          campaignId: webhook.campaignId,
          webhookId: webhook.id,
          eventId: `evt_retained_${index}`,
          eventType: "campaign.updated",
          occurredAt: timestamp,
          attempt: 1,
          status: "delivered",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      const test = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/webhooks/${webhook.id}/test`,
        headers: { ...gmHeaders, "idempotency-key": "webhook-retention-test" },
        payload: { expectedUpdatedAt: (created.json() as { webhook: { updatedAt: string } }).webhook.updatedAt },
      });
      expect(test.statusCode).toBe(202);
      const newestId = (test.json() as { id: string }).id;
      const queued = store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === newestId);
      expect(queued?.status).toBe("queued");
      expect(store.state.campaignWebhookDeliveries.filter((delivery) => delivery.webhookId === webhook.id)).toHaveLength(501);
      releaseTransport();
      await waitFor(() => store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === newestId)?.status === "delivered", "retention delivery did not finish");
      expect(store.state.campaignWebhookDeliveries.filter((delivery) => delivery.webhookId === webhook.id)).toHaveLength(500);
      expect(store.state.campaignWebhookDeliveries.some((delivery) => delivery.id === newestId)).toBe(true);
    } finally {
      releaseTransport();
      await app.close();
    }

    const queued = store.state.campaignWebhookDeliveries[0]!;
    queued.status = "queued";
    queued.errorCode = undefined;
    const recoveredApp = await buildApp({ store, webhookTransport: transport });
    try {
      expect(queued).toMatchObject({ status: "failed", errorCode: "interrupted" });
    } finally {
      await recoveredApp.close();
    }
  });

  it("keeps bounded actor-and-request-bound rotation replay history", async () => {
    const store = new MemoryStateStore();
    const transport = new RecordingWebhookTransport();
    const app = await buildApp({ store, webhookTransport: transport });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const route = "/api/v1/campaigns/camp_demo/webhooks";
    try {
      const created = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "rotation-history-create" },
        payload: { name: "Rotation history", url: targetUrl, eventTypes: ["campaign.updated"], expectedCampaignUpdatedAt: campaign.updatedAt },
      });
      expect(created.statusCode).toBe(201);
      const webhook = (created.json() as { webhook: { id: string; updatedAt: string } }).webhook;
      const firstPayload = { expectedUpdatedAt: webhook.updatedAt };
      const firstRotation = await app.inject({
        method: "POST",
        url: `${route}/${webhook.id}/rotate-secret`,
        headers: { ...gmHeaders, "idempotency-key": "rotation-key-a" },
        payload: firstPayload,
      });
      expect(firstRotation.statusCode).toBe(200);
      const firstBody = firstRotation.json() as { signingSecret: string; webhook: { updatedAt: string } };
      const secondRotation = await app.inject({
        method: "POST",
        url: `${route}/${webhook.id}/rotate-secret`,
        headers: { ...gmHeaders, "idempotency-key": "rotation-key-b" },
        payload: { expectedUpdatedAt: firstBody.webhook.updatedAt },
      });
      expect(secondRotation.statusCode).toBe(200);
      const secondBody = secondRotation.json() as { signingSecret: string; webhook: { updatedAt: string } };
      expect(secondBody.signingSecret).not.toBe(firstBody.signingSecret);

      const delayedReplay = await app.inject({
        method: "POST",
        url: `${route}/${webhook.id}/rotate-secret`,
        headers: { ...gmHeaders, "idempotency-key": "rotation-key-a" },
        payload: firstPayload,
      });
      expect(delayedReplay.statusCode).toBe(200);
      expect(delayedReplay.json()).toMatchObject({ signingSecretAlreadyShown: true });
      expect(delayedReplay.json()).not.toHaveProperty("signingSecret");
      expect(store.state.campaignWebhooks[0]?.signingSecret).toBe(secondBody.signingSecret);

      const changedReplay = await app.inject({
        method: "POST",
        url: `${route}/${webhook.id}/rotate-secret`,
        headers: { ...gmHeaders, "idempotency-key": "rotation-key-a" },
        payload: { expectedUpdatedAt: secondBody.webhook.updatedAt },
      });
      expect(changedReplay.statusCode).toBe(409);
      expect(store.state.campaignWebhooks[0]?.signingSecret).toBe(secondBody.signingSecret);
      expect(store.state.campaignWebhooks[0]?.rotationIdempotencyRecords).toHaveLength(2);
      expect(JSON.stringify(store.state.campaignWebhooks[0]?.rotationIdempotencyRecords)).not.toMatch(/rotation-key-[ab]/);
    } finally {
      await app.close();
    }
  });

  it.each(["disable", "delete", "url-update", "secret-rotation"] as const)(
    "cancels queued manual delivery after subscription %s",
    async (mutation) => {
      const store = new MemoryStateStore();
      const transport = new RecordingWebhookTransport();
      let releaseTransport: () => void = () => undefined;
      transport.sendBarrier = new Promise<void>((resolve) => {
        releaseTransport = resolve;
      });
      const app = await buildApp({ store, webhookTransport: transport });
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const route = "/api/v1/campaigns/camp_demo/webhooks";

      try {
        const created = await app.inject({
          method: "POST",
          url: route,
          headers: { ...gmHeaders, "idempotency-key": `stale-manual-create-${mutation}` },
          payload: {
            name: `Stale manual ${mutation}`,
            url: targetUrl,
            eventTypes: ["campaign.updated"],
            expectedCampaignUpdatedAt: campaign.updatedAt,
          },
        });
        expect(created.statusCode).toBe(201);
        const webhook = (created.json() as { webhook: { id: string; updatedAt: string } }).webhook;
        const testUrl = `${route}/${webhook.id}/test`;
        const expectedUpdatedAt = webhook.updatedAt;

        const blocking = await app.inject({
          method: "POST",
          url: testUrl,
          headers: { ...gmHeaders, "idempotency-key": `stale-manual-blocking-${mutation}` },
          payload: { expectedUpdatedAt },
        });
        expect(blocking.statusCode).toBe(202);
        await waitFor(() => transport.sent.length === 1, "blocking manual delivery did not start");

        const queued = await app.inject({
          method: "POST",
          url: testUrl,
          headers: { ...gmHeaders, "idempotency-key": `stale-manual-queued-${mutation}` },
          payload: { expectedUpdatedAt },
        });
        expect(queued.statusCode).toBe(202);
        const queuedId = (queued.json() as { id: string }).id;

        const mutationResponse = mutation === "disable"
          ? await app.inject({
              method: "POST",
              url: `${route}/${webhook.id}/disable`,
              headers: { ...gmHeaders, "idempotency-key": `stale-manual-disable-${mutation}` },
              payload: { expectedUpdatedAt },
            })
          : mutation === "delete"
            ? await app.inject({
                method: "DELETE",
                url: `${route}/${webhook.id}`,
                headers: { ...gmHeaders, "idempotency-key": `stale-manual-delete-${mutation}` },
                payload: { expectedUpdatedAt },
              })
            : mutation === "url-update"
              ? await app.inject({
                  method: "PATCH",
                  url: `${route}/${webhook.id}`,
                  headers: { ...gmHeaders, "idempotency-key": `stale-manual-update-${mutation}` },
                  payload: { url: updatedTargetUrl, expectedUpdatedAt },
                })
              : await app.inject({
                  method: "POST",
                  url: `${route}/${webhook.id}/rotate-secret`,
                  headers: { ...gmHeaders, "idempotency-key": `stale-manual-rotate-${mutation}` },
                  payload: { expectedUpdatedAt },
                });
        expect(mutationResponse.statusCode).toBe(200);

        releaseTransport();
        await waitFor(
          () => store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === queuedId)?.status === "failed",
          "stale queued manual delivery did not become terminal",
        );
        expect(store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === queuedId)).toMatchObject({
          status: "failed",
          errorCode: "subscription_changed",
        });
        expect(transport.sent).toHaveLength(1);
        expect(transport.sent[0]?.url).toBe(targetUrl);
      } finally {
        releaseTransport();
        await app.close();
      }
    },
  );

  it("allows an explicit manual test for an unchanged disabled webhook", async () => {
    const store = new MemoryStateStore();
    const transport = new RecordingWebhookTransport();
    const app = await buildApp({ store, webhookTransport: transport });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const route = "/api/v1/campaigns/camp_demo/webhooks";

    try {
      const created = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "disabled-manual-create" },
        payload: { name: "Disabled manual", url: targetUrl, eventTypes: ["campaign.updated"], expectedCampaignUpdatedAt: campaign.updatedAt },
      });
      const webhook = (created.json() as { webhook: { id: string; updatedAt: string } }).webhook;
      const disabled = await app.inject({
        method: "POST",
        url: `${route}/${webhook.id}/disable`,
        headers: { ...gmHeaders, "idempotency-key": "disabled-manual-disable" },
        payload: { expectedUpdatedAt: webhook.updatedAt },
      });
      expect(disabled.statusCode).toBe(200);
      const disabledWebhook = disabled.json() as { updatedAt: string };
      const manual = await app.inject({
        method: "POST",
        url: `${route}/${webhook.id}/test`,
        headers: { ...gmHeaders, "idempotency-key": "disabled-manual-test" },
        payload: { expectedUpdatedAt: disabledWebhook.updatedAt },
      });
      expect(manual.statusCode).toBe(202);
      const deliveryId = (manual.json() as { id: string }).id;
      await waitFor(
        () => store.state.campaignWebhookDeliveries.find((delivery) => delivery.id === deliveryId)?.status === "delivered",
        "manual test for unchanged disabled webhook did not finish",
      );
      expect(transport.sent).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});

describe("campaign webhook transport safety", () => {
  it("rejects insecure, credentialed, private, mixed-DNS, site-local, and NAT64 targets", async () => {
    const publicResolver = async () => ["2606:4700:4700::1111"];
    await expect(validateCampaignWebhookTarget("http://hooks.example.test/events", { production: true, resolveHostname: publicResolver })).resolves.toMatchObject({ ok: false, errorCode: "insecure_target" });
    await expect(validateCampaignWebhookTarget("https://user:pass@hooks.example.test/events", { production: false, resolveHostname: publicResolver })).resolves.toMatchObject({ ok: false, errorCode: "invalid_target" });
    await expect(validateCampaignWebhookTarget("https://hooks.example.test/events?token=secret", { production: false, resolveHostname: publicResolver })).resolves.toMatchObject({ ok: false, errorCode: "invalid_target" });
    await expect(validateCampaignWebhookTarget("https://127.0.0.1/events", { production: false })).resolves.toMatchObject({ ok: false, errorCode: "blocked_target" });
    await expect(validateCampaignWebhookTarget("https://169.254.169.254/events", { production: false })).resolves.toMatchObject({ ok: false, errorCode: "blocked_target" });
    await expect(validateCampaignWebhookTarget("https://[fec0::1]/events", { production: false })).resolves.toMatchObject({ ok: false, errorCode: "blocked_target" });
    await expect(validateCampaignWebhookTarget("https://[64:ff9b:1::7f00:1]/events", { production: false })).resolves.toMatchObject({ ok: false, errorCode: "blocked_target" });
    await expect(validateCampaignWebhookTarget("https://hooks.example.test/events", { production: false, resolveHostname: async () => ["203.0.113.10", "10.0.0.1"] })).resolves.toMatchObject({ ok: false, errorCode: "blocked_target" });
    await expect(validateCampaignWebhookTarget("https://hooks.example.test/events", { production: true, resolveHostname: publicResolver })).resolves.toMatchObject({ ok: true, resolvedAddresses: ["2606:4700:4700::1111"] });
  });

  it("uses an absolute DNS deadline and a pinned request that never follows redirects", async () => {
    const timeoutTransport = createCampaignWebhookTransport({
      production: true,
      timeoutMs: 500,
      resolveHostname: async () => new Promise<string[]>(() => undefined),
    });
    const startedAt = Date.now();
    await expect(timeoutTransport.validateTarget(targetUrl)).resolves.toMatchObject({ ok: false, errorCode: "timeout" });
    expect(Date.now() - startedAt).toBeLessThan(2_000);

    let privatePathHits = 0;
    let hostHeader = "";
    const server = createServer((request, response) => {
      hostHeader = request.headers.host ?? "";
      if (request.url === "/private") privatePathHits += 1;
      response.statusCode = request.url === "/hook" ? 302 : 200;
      if (request.url === "/hook") response.setHeader("location", "/private");
      response.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const result = await sendPinnedCampaignWebhook(
        `http://rebind.example.test:${port}/hook`,
        "127.0.0.1",
        { url: `http://rebind.example.test:${port}/hook`, body: "{}", headers: { "content-type": "application/json" } },
        1_000,
      );
      expect(result).toMatchObject({ ok: false, responseStatus: 302, errorCode: "redirect_rejected", redirectLocation: "/private" });
      expect(hostHeader).toBe(`rebind.example.test:${port}`);
      expect(privatePathHits).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("never derives webhook metadata from private payloads", () => {
    const envelope = campaignWebhookEnvelope({
      id: "evt_metadata_only",
      campaignId: "camp_demo",
      type: "actor.updated",
      actorUserId: "usr_private",
      targetId: "act_private",
      timestamp: "2026-07-13T12:00:00.000Z",
      payload: { secretNotes: "never send", hp: 1, privateSheet: true },
    });
    expect(envelope).toEqual({
      version: "1.0",
      eventId: "evt_metadata_only",
      eventType: "actor.updated",
      occurredAt: "2026-07-13T12:00:00.000Z",
      campaignId: "camp_demo",
      resource: { type: "actor", id: "act_private" },
    });
    expect(campaignWebhookEnvelope({
      id: "evt_chat_private",
      campaignId: "camp_demo",
      type: "chat.message.created",
      timestamp: "2026-07-13T12:00:00.000Z",
      payload: { body: "secret whisper" },
    })).toBeUndefined();
  });
});
