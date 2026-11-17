import { createId, nowIso, type CampaignWebhookDelivery, type CampaignWebhookEnvelopeV1, type CampaignWebhookSubscription } from "@open-tabletop/core";
import type { StateStore } from "./store.js";

export const CAMPAIGN_WEBHOOK_QUEUE_MAX_PENDING_DELIVERIES = 512;
export const CAMPAIGN_WEBHOOK_SUBSCRIPTION_LIMIT_PER_CAMPAIGN = 25;
export const CAMPAIGN_WEBHOOK_ROTATION_IDEMPOTENCY_RETENTION = 32;
const CAMPAIGN_WEBHOOK_DELIVERY_RETENTION_PER_WEBHOOK = 500;
const CAMPAIGN_WEBHOOK_DELIVERY_RETENTION_PER_CAMPAIGN = 5_000;

function sortTimestampsDesc(left: { createdAt: string }, right: { createdAt: string }): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function nextRevisionTimestamp(current: string): string {
  const now = Date.now();
  const currentTime = Date.parse(current);
  return new Date(Number.isFinite(currentTime) && currentTime >= now ? currentTime + 1 : now).toISOString();
}

export function createCampaignWebhookDelivery(
  store: StateStore,
  webhook: CampaignWebhookSubscription,
  envelope: CampaignWebhookEnvelopeV1,
  options: { retryOfDeliveryId?: string; initiatedByUserId?: string } = {},
): CampaignWebhookDelivery {
  const attempt = Math.max(
    0,
    ...store.state.campaignWebhookDeliveries
      .filter((candidate) => candidate.webhookId === webhook.id && candidate.eventId === envelope.eventId)
      .map((candidate) => candidate.attempt),
  ) + 1;
  const latestCreatedAt = store.state.campaignWebhookDeliveries
    .filter((candidate) => candidate.webhookId === webhook.id)
    .map((candidate) => candidate.createdAt)
    .sort()
    .at(-1);
  const createdAt = latestCreatedAt ? nextRevisionTimestamp(latestCreatedAt) : nowIso();
  const delivery: CampaignWebhookDelivery = {
    id: createId("whdel"),
    campaignId: webhook.campaignId,
    webhookId: webhook.id,
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    occurredAt: envelope.occurredAt,
    resourceType: envelope.resource?.type,
    resourceId: envelope.resource?.id,
    attempt,
    status: "queued",
    retryOfDeliveryId: options.retryOfDeliveryId,
    initiatedByUserId: options.initiatedByUserId,
    createdAt,
    updatedAt: createdAt,
  };
  store.state.campaignWebhookDeliveries.push(delivery);
  pruneCampaignWebhookLedgers(store, delivery);
  return delivery;
}

function retainedCampaignWebhookDeliveryIds(deliveries: CampaignWebhookDelivery[], limit: number): Set<string> {
  const ordered = deliveries.slice().sort(sortTimestampsDesc);
  if (ordered.length <= limit) return new Set(ordered.map((delivery) => delivery.id));
  const byId = new Map(ordered.map((delivery) => [delivery.id, delivery]));
  const queued = ordered.filter((delivery) => delivery.status === "queued");
  const keep = new Set(queued.map((delivery) => delivery.id));
  let terminalCount = 0;
  const keepTerminalChain = (delivery: CampaignWebhookDelivery | undefined) => {
    let candidate = delivery;
    while (candidate) {
      if (candidate.status === "queued") keep.add(candidate.id);
      else if (!keep.has(candidate.id)) {
        if (terminalCount >= limit) return;
        keep.add(candidate.id);
        terminalCount += 1;
      }
      candidate = candidate.retryOfDeliveryId ? byId.get(candidate.retryOfDeliveryId) : undefined;
    }
  };
  for (const delivery of queued) keepTerminalChain(delivery);
  for (const delivery of ordered) {
    if (terminalCount >= limit) break;
    keepTerminalChain(delivery);
  }
  return keep;
}

export function pruneCampaignWebhookDeliveryLedger(store: StateStore, webhookId: string): void {
  const deliveries = store.state.campaignWebhookDeliveries
    .filter((candidate) => candidate.webhookId === webhookId)
    .sort(sortTimestampsDesc);
  if (deliveries.length <= CAMPAIGN_WEBHOOK_DELIVERY_RETENTION_PER_WEBHOOK) return;
  const keep = retainedCampaignWebhookDeliveryIds(deliveries, CAMPAIGN_WEBHOOK_DELIVERY_RETENTION_PER_WEBHOOK);
  store.state.campaignWebhookDeliveries = store.state.campaignWebhookDeliveries.filter((candidate) => candidate.webhookId !== webhookId || keep.has(candidate.id));
}

export function pruneCampaignWebhookCampaignLedger(store: StateStore, campaignId: string): void {
  const deliveries = store.state.campaignWebhookDeliveries
    .filter((candidate) => candidate.campaignId === campaignId)
    .sort(sortTimestampsDesc);
  if (deliveries.length <= CAMPAIGN_WEBHOOK_DELIVERY_RETENTION_PER_CAMPAIGN) return;
  const keep = retainedCampaignWebhookDeliveryIds(deliveries, CAMPAIGN_WEBHOOK_DELIVERY_RETENTION_PER_CAMPAIGN);
  store.state.campaignWebhookDeliveries = store.state.campaignWebhookDeliveries.filter((candidate) => candidate.campaignId !== campaignId || keep.has(candidate.id));
}

export function pruneCampaignWebhookLedgers(store: StateStore, delivery: Pick<CampaignWebhookDelivery, "webhookId" | "campaignId">): void {
  pruneCampaignWebhookDeliveryLedger(store, delivery.webhookId);
  pruneCampaignWebhookCampaignLedger(store, delivery.campaignId);
}
