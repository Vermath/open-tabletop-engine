import { createHash, randomBytes } from "node:crypto";
import { createId, nowIso, type CampaignWebhookDelivery, type CampaignWebhookEnvelopeV1, type CampaignWebhookEventType, type CampaignWebhookSubscription, type PermissionName } from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { campaignWebhookEnvelopeFromDelivery, campaignWebhookEventTypes, isCampaignWebhookEventType, type CampaignWebhookTransport } from "./campaign-webhooks.js";
import {
  CAMPAIGN_WEBHOOK_ROTATION_IDEMPOTENCY_RETENTION,
  CAMPAIGN_WEBHOOK_SUBSCRIPTION_LIMIT_PER_CAMPAIGN,
  createCampaignWebhookDelivery,
} from "./campaign-webhook-ledger.js";
import type { StateStore } from "./store.js";

interface CampaignWebhookAuditInput {
  campaignId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export interface CampaignWebhookRouteDependencies {
  store: StateStore;
  webhookTransport: CampaignWebhookTransport;
  requireCampaignPermission(
    store: StateStore,
    reply: FastifyReply,
    headers: FastifyRequest["headers"],
    campaignId: string,
    permission: PermissionName,
  ): true | FastifyReply;
  currentUserId(store: StateStore, headers: FastifyRequest["headers"]): string | undefined;
  requireExpectedRevision(
    reply: FastifyReply,
    input: {
      resourceType: "campaign";
      resourceId: string;
      currentUpdatedAt: string;
      expectedUpdatedAt: unknown;
      current: unknown;
      label: "Campaign";
    },
  ): true | FastifyReply;
  appendServerAuditLog(store: StateStore, userId: string, input: CampaignWebhookAuditInput): unknown;
  nextRevisionTimestamp(current: string): string;
  hashStableJson(value: unknown): string;
  stageManualWebhookDispatch(
    webhook: CampaignWebhookSubscription,
    delivery: CampaignWebhookDelivery,
    envelope: CampaignWebhookEnvelopeV1,
  ): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortTimestampsDesc(left: { createdAt: string }, right: { createdAt: string }): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function opaqueHeaderText(value: string | string[] | undefined): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: "bad_request", message });
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: "not_found", message });
}

function conflict(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(409).send({ error: "conflict", message });
}

type CampaignWebhookMutableFields = Pick<CampaignWebhookSubscription, "name" | "url" | "eventTypes" | "enabled">;

function normalizeCampaignWebhookInput(
  input: unknown,
  partial: boolean,
): { ok: true; value: Partial<CampaignWebhookMutableFields> } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "Webhook body must be an object" };
  const allowedFields = new Set(["name", "url", "eventTypes", "enabled", partial ? "expectedUpdatedAt" : "expectedCampaignUpdatedAt"]);
  const unsupported = Object.keys(input).find((field) => !allowedFields.has(field));
  if (unsupported) return { ok: false, error: `Unsupported webhook field: ${unsupported}` };
  const value: Partial<CampaignWebhookMutableFields> = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) return { ok: false, error: "name must be 1-80 characters" };
    value.name = input.name.trim();
  } else if (!partial) return { ok: false, error: "name is required" };
  if (input.url !== undefined) {
    if (typeof input.url !== "string" || !input.url.trim() || input.url.length > 2_048) return { ok: false, error: "url must be 1-2048 characters" };
    value.url = input.url.trim();
  } else if (!partial) return { ok: false, error: "url is required" };
  if (input.eventTypes !== undefined) {
    if (!Array.isArray(input.eventTypes) || input.eventTypes.length === 0 || input.eventTypes.length > campaignWebhookEventTypes.length) {
      return { ok: false, error: "eventTypes must contain 1 or more supported event types" };
    }
    if (!input.eventTypes.every(isCampaignWebhookEventType)) return { ok: false, error: "eventTypes contains an unsupported event type" };
    const eventTypes = [...new Set(input.eventTypes as CampaignWebhookEventType[])];
    if (eventTypes.length !== input.eventTypes.length) return { ok: false, error: "eventTypes must not contain duplicates" };
    value.eventTypes = eventTypes;
  } else if (!partial) return { ok: false, error: "eventTypes is required" };
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") return { ok: false, error: "enabled must be a boolean" };
    value.enabled = input.enabled;
  }
  return { ok: true, value };
}

function publicCampaignWebhook(store: StateStore, webhook: CampaignWebhookSubscription) {
  const latestDelivery = store.state.campaignWebhookDeliveries
    .filter((candidate) => candidate.webhookId === webhook.id)
    .sort(sortTimestampsDesc)[0];
  return {
    id: webhook.id,
    campaignId: webhook.campaignId,
    name: webhook.name,
    url: webhook.url,
    eventTypes: [...webhook.eventTypes],
    enabled: webhook.enabled,
    secretConfigured: Boolean(webhook.signingSecret),
    secretHint: webhook.secretHint,
    createdByUserId: webhook.createdByUserId,
    updatedByUserId: webhook.updatedByUserId,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    latestDelivery: latestDelivery ? publicCampaignWebhookDelivery(latestDelivery) : undefined,
  };
}

function publicCampaignWebhookDelivery(delivery: CampaignWebhookDelivery) {
  return {
    id: delivery.id,
    campaignId: delivery.campaignId,
    webhookId: delivery.webhookId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    occurredAt: delivery.occurredAt,
    resourceType: delivery.resourceType,
    resourceId: delivery.resourceId,
    attempt: delivery.attempt,
    status: delivery.status,
    responseStatus: delivery.responseStatus,
    responseBytes: delivery.responseBytes,
    durationMs: delivery.durationMs,
    deliveredAt: delivery.deliveredAt,
    failedAt: delivery.failedAt,
    errorCode: delivery.errorCode,
    retryOfDeliveryId: delivery.retryOfDeliveryId,
    initiatedByUserId: delivery.initiatedByUserId,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

function campaignWebhookAuditSummary(webhook: CampaignWebhookSubscription): Record<string, unknown> {
  let targetOrigin = "invalid";
  try {
    targetOrigin = new URL(webhook.url).origin;
  } catch {
    // Persist only the safe invalid marker; never copy a malformed URL to audit.
  }
  return {
    name: webhook.name,
    targetOrigin,
    enabled: webhook.enabled,
    eventTypeCount: webhook.eventTypes.length,
  };
}

function campaignWebhookDeliveryAuditSummary(delivery: CampaignWebhookDelivery): Record<string, unknown> {
  return {
    webhookId: delivery.webhookId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    attempt: delivery.attempt,
    status: delivery.status,
    responseStatus: delivery.responseStatus,
    responseBytes: delivery.responseBytes,
    durationMs: delivery.durationMs,
    errorCode: delivery.errorCode,
    retryOfDeliveryId: delivery.retryOfDeliveryId,
  };
}

function requireCampaignWebhookMutationGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  store: StateStore,
  webhook: CampaignWebhookSubscription,
  expectedUpdatedAtValue: unknown,
  operation: string,
  requireIdempotency = true,
): true | FastifyReply {
  if (requireIdempotency && !opaqueHeaderText(request.headers["idempotency-key"])) {
    return badRequest(reply, `${operation} requires an Idempotency-Key header`);
  }
  const expectedUpdatedAt = normalizeNonEmptyString(expectedUpdatedAtValue);
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) return badRequest(reply, "expectedUpdatedAt must be a valid date-time");
  if (expectedUpdatedAt !== webhook.updatedAt) {
    return reply.code(409).send({
      error: "conflict",
      code: "stale_write",
      message: "Campaign webhook changed after this action was prepared. Review the latest state and retry.",
      resourceType: "campaign_webhook",
      resourceId: webhook.id,
      expectedUpdatedAt,
      currentUpdatedAt: webhook.updatedAt,
      current: publicCampaignWebhook(store, webhook),
    });
  }
  return true;
}

function campaignWebhookTargetError(reply: FastifyReply, code: string, message: string): FastifyReply {
  return reply.code(422).send({ error: "invalid_webhook_target", code, message });
}

function generateCampaignWebhookSecret(): string {
  return `otte_whsec_${randomBytes(32).toString("base64url")}`;
}

function hashCampaignWebhookIdempotencyKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function registerCampaignWebhookRoutes(
  app: FastifyInstance,
  dependencies: CampaignWebhookRouteDependencies,
): void {
  const {
    store,
    webhookTransport,
    requireCampaignPermission,
    currentUserId,
    requireExpectedRevision,
    appendServerAuditLog,
    nextRevisionTimestamp,
    hashStableJson,
    stageManualWebhookDispatch,
  } = dependencies;
  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/webhooks", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    return {
      items: store.state.campaignWebhooks
        .filter((webhook) => webhook.campaignId === request.params.campaignId)
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
        .map((webhook) => publicCampaignWebhook(store, webhook)),
      supportedEventTypes: campaignWebhookEventTypes,
    };
  });

  app.post<{
    Params: { campaignId: string };
    Body: { name?: unknown; url?: unknown; eventTypes?: unknown; enabled?: unknown; expectedCampaignUpdatedAt?: unknown };
  }>("/api/v1/campaigns/:campaignId/webhooks", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const userId = currentUserId(store, request.headers)!;
    const campaign = store.state.campaigns.find((candidate) => candidate.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    const idempotencyKey = opaqueHeaderText(request.headers["idempotency-key"]);
    if (!idempotencyKey) return badRequest(reply, "Creating a campaign webhook requires an Idempotency-Key header");
    const idempotencyKeyHash = hashCampaignWebhookIdempotencyKey(idempotencyKey);
    const creationRequestHash = hashStableJson(request.body ?? {});
    const existing = store.state.campaignWebhooks.find((candidate) =>
      candidate.campaignId === campaign.id && candidate.createdByUserId === userId && candidate.creationIdempotencyKeyHash === idempotencyKeyHash
    );
    if (existing) {
      if (existing.creationRequestHash !== creationRequestHash) return conflict(reply, "Idempotency-Key was already used for a different campaign webhook request");
      return { webhook: publicCampaignWebhook(store, existing), signingSecretAlreadyShown: true };
    }
    const subscriptionCount = store.state.campaignWebhooks.filter((candidate) => candidate.campaignId === campaign.id).length;
    if (subscriptionCount >= CAMPAIGN_WEBHOOK_SUBSCRIPTION_LIMIT_PER_CAMPAIGN) {
      return reply.code(409).send({
        error: "conflict",
        code: "webhook_subscription_limit",
        message: `A campaign can have at most ${CAMPAIGN_WEBHOOK_SUBSCRIPTION_LIMIT_PER_CAMPAIGN} webhook subscriptions`,
      });
    }
    const campaignRevision = requireExpectedRevision(reply, {
      resourceType: "campaign",
      resourceId: campaign.id,
      currentUpdatedAt: campaign.updatedAt,
      expectedUpdatedAt: request.body?.expectedCampaignUpdatedAt,
      current: campaign,
      label: "Campaign",
    });
    if (campaignRevision !== true) return campaignRevision;
    const normalized = normalizeCampaignWebhookInput(request.body ?? {}, false);
    if (!normalized.ok) return badRequest(reply, normalized.error);
    const target = await webhookTransport.validateTarget(normalized.value.url!);
    if (!target.ok) return campaignWebhookTargetError(reply, target.errorCode, target.message);
    const changedAt = nextRevisionTimestamp(campaign.updatedAt);
    const signingSecret = generateCampaignWebhookSecret();
    const webhook: CampaignWebhookSubscription = {
      id: createId("whk"),
      campaignId: campaign.id,
      name: normalized.value.name!,
      url: target.normalizedUrl,
      eventTypes: normalized.value.eventTypes!,
      enabled: normalized.value.enabled ?? true,
      signingSecret,
      secretHint: signingSecret.slice(-6),
      createdByUserId: userId,
      updatedByUserId: userId,
      creationIdempotencyKeyHash: idempotencyKeyHash,
      creationRequestHash,
      createdAt: changedAt,
      updatedAt: changedAt,
    };
    store.state.campaignWebhooks.push(webhook);
    campaign.updatedAt = changedAt;
    appendServerAuditLog(store, userId, {
      campaignId: campaign.id,
      action: "campaign.webhook.create",
      targetType: "campaign_webhook",
      targetId: webhook.id,
      after: campaignWebhookAuditSummary(webhook),
    });
    store.save();
    return reply.code(201).send({ webhook: publicCampaignWebhook(store, webhook), signingSecret, campaignUpdatedAt: campaign.updatedAt });
  });

  app.patch<{
    Params: { campaignId: string; webhookId: string };
    Body: { name?: unknown; url?: unknown; eventTypes?: unknown; enabled?: unknown; expectedUpdatedAt?: unknown };
  }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const webhook = store.state.campaignWebhooks.find((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const guard = requireCampaignWebhookMutationGuard(request, reply, store, webhook, request.body?.expectedUpdatedAt, "Updating a campaign webhook");
    if (guard !== true) return guard;
    const normalized = normalizeCampaignWebhookInput(request.body ?? {}, true);
    if (!normalized.ok) return badRequest(reply, normalized.error);
    if (Object.keys(normalized.value).length === 0) return badRequest(reply, "At least one webhook field must be updated");
    if (normalized.value.url) {
      const target = await webhookTransport.validateTarget(normalized.value.url);
      if (!target.ok) return campaignWebhookTargetError(reply, target.errorCode, target.message);
      normalized.value.url = target.normalizedUrl;
    }
    const before = campaignWebhookAuditSummary(webhook);
    Object.assign(webhook, normalized.value, {
      updatedByUserId: currentUserId(store, request.headers)!,
      updatedAt: nextRevisionTimestamp(webhook.updatedAt),
    });
    appendServerAuditLog(store, currentUserId(store, request.headers)!, {
      campaignId: webhook.campaignId,
      action: "campaign.webhook.update",
      targetType: "campaign_webhook",
      targetId: webhook.id,
      before,
      after: campaignWebhookAuditSummary(webhook),
    });
    store.save();
    return publicCampaignWebhook(store, webhook);
  });

  app.post<{ Params: { campaignId: string; webhookId: string }; Body: { expectedUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId/disable", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const webhook = store.state.campaignWebhooks.find((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const guard = requireCampaignWebhookMutationGuard(request, reply, store, webhook, request.body?.expectedUpdatedAt, "Disabling a campaign webhook");
    if (guard !== true) return guard;
    const before = campaignWebhookAuditSummary(webhook);
    webhook.enabled = false;
    webhook.updatedByUserId = currentUserId(store, request.headers)!;
    webhook.updatedAt = nextRevisionTimestamp(webhook.updatedAt);
    appendServerAuditLog(store, currentUserId(store, request.headers)!, {
      campaignId: webhook.campaignId,
      action: "campaign.webhook.disable",
      targetType: "campaign_webhook",
      targetId: webhook.id,
      before,
      after: campaignWebhookAuditSummary(webhook),
    });
    store.save();
    return publicCampaignWebhook(store, webhook);
  });

  app.delete<{ Params: { campaignId: string; webhookId: string }; Querystring: { expectedUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const index = store.state.campaignWebhooks.findIndex((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    const webhook = store.state.campaignWebhooks[index];
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const guard = requireCampaignWebhookMutationGuard(request, reply, store, webhook, request.query.expectedUpdatedAt, "Deleting a campaign webhook");
    if (guard !== true) return guard;
    store.state.campaignWebhooks.splice(index, 1);
    appendServerAuditLog(store, currentUserId(store, request.headers)!, {
      campaignId: webhook.campaignId,
      action: "campaign.webhook.delete",
      targetType: "campaign_webhook",
      targetId: webhook.id,
      before: campaignWebhookAuditSummary(webhook),
      after: { deleted: true },
    });
    store.save();
    return { webhook: publicCampaignWebhook(store, webhook), deleted: true };
  });

  app.post<{ Params: { campaignId: string; webhookId: string }; Body: { expectedUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId/rotate-secret", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const webhook = store.state.campaignWebhooks.find((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const idempotencyKey = opaqueHeaderText(request.headers["idempotency-key"]);
    if (!idempotencyKey) return badRequest(reply, "Rotating a campaign webhook secret requires an Idempotency-Key header");
    const userId = currentUserId(store, request.headers)!;
    const idempotencyKeyHash = hashCampaignWebhookIdempotencyKey(idempotencyKey);
    const requestHash = hashStableJson(request.body ?? {});
    const priorRotation = (webhook.rotationIdempotencyRecords ?? []).find(
      (record) => record.userId === userId && record.keyHash === idempotencyKeyHash,
    );
    if (priorRotation) {
      if (priorRotation.requestHash !== requestHash) {
        return conflict(reply, "Idempotency-Key was already used for a different secret rotation request");
      }
      return { webhook: publicCampaignWebhook(store, webhook), signingSecretAlreadyShown: true };
    }
    // Preserve replay safety for subscriptions persisted by the initial
    // implementation, which only recorded the latest key hash.
    if (webhook.lastRotationIdempotencyKeyHash === idempotencyKeyHash && webhook.updatedByUserId === userId) {
      return { webhook: publicCampaignWebhook(store, webhook), signingSecretAlreadyShown: true };
    }
    const guard = requireCampaignWebhookMutationGuard(request, reply, store, webhook, request.body?.expectedUpdatedAt, "Rotating a campaign webhook secret", false);
    if (guard !== true) return guard;
    const signingSecret = generateCampaignWebhookSecret();
    webhook.signingSecret = signingSecret;
    webhook.secretHint = signingSecret.slice(-6);
    webhook.lastRotationIdempotencyKeyHash = idempotencyKeyHash;
    webhook.rotationIdempotencyRecords = [
      ...(webhook.rotationIdempotencyRecords ?? []),
      { keyHash: idempotencyKeyHash, requestHash, userId, createdAt: nowIso() },
    ].slice(-CAMPAIGN_WEBHOOK_ROTATION_IDEMPOTENCY_RETENTION);
    webhook.updatedByUserId = userId;
    webhook.updatedAt = nextRevisionTimestamp(webhook.updatedAt);
    appendServerAuditLog(store, userId, {
      campaignId: webhook.campaignId,
      action: "campaign.webhook.secret.rotate",
      targetType: "campaign_webhook",
      targetId: webhook.id,
      after: { rotated: true, enabled: webhook.enabled, eventTypeCount: webhook.eventTypes.length },
    });
    store.save();
    return { webhook: publicCampaignWebhook(store, webhook), signingSecret };
  });

  app.get<{ Params: { campaignId: string; webhookId: string }; Querystring: { limit?: string } }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId/deliveries", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const webhook = store.state.campaignWebhooks.find((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const limit = request.query.limit === undefined ? 50 : positiveInteger(request.query.limit);
    if (!limit || limit > 100) return badRequest(reply, "limit must be an integer from 1 to 100");
    return store.state.campaignWebhookDeliveries
      .filter((delivery) => delivery.webhookId === webhook.id && delivery.campaignId === webhook.campaignId)
      .sort(sortTimestampsDesc)
      .slice(0, limit)
      .map(publicCampaignWebhookDelivery);
  });

  app.post<{ Params: { campaignId: string; webhookId: string }; Body: { expectedUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId/test", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const webhook = store.state.campaignWebhooks.find((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const guard = requireCampaignWebhookMutationGuard(request, reply, store, webhook, request.body?.expectedUpdatedAt, "Testing a campaign webhook");
    if (guard !== true) return guard;
    const target = await webhookTransport.validateTarget(webhook.url);
    if (!target.ok) return campaignWebhookTargetError(reply, target.errorCode, target.message);
    const userId = currentUserId(store, request.headers)!;
    const envelope: CampaignWebhookEnvelopeV1 = {
      version: "1.0",
      eventId: createId("evt"),
      eventType: "webhook.test",
      occurredAt: nowIso(),
      campaignId: webhook.campaignId,
      resource: { type: "webhook", id: webhook.id },
    };
    const delivery = createCampaignWebhookDelivery(store, webhook, envelope, { initiatedByUserId: userId });
    stageManualWebhookDispatch(webhook, delivery, envelope);
    appendServerAuditLog(store, userId, {
      campaignId: webhook.campaignId,
      action: "campaign.webhook.test",
      targetType: "campaign_webhook_delivery",
      targetId: delivery.id,
      after: campaignWebhookDeliveryAuditSummary(delivery),
    });
    store.save();
    return reply.code(202).send(publicCampaignWebhookDelivery(delivery));
  });

  app.post<{
    Params: { campaignId: string; webhookId: string; deliveryId: string };
    Body: { expectedUpdatedAt?: unknown };
  }>("/api/v1/campaigns/:campaignId/webhooks/:webhookId/deliveries/:deliveryId/retry", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const webhook = store.state.campaignWebhooks.find((candidate) => candidate.id === request.params.webhookId && candidate.campaignId === request.params.campaignId);
    if (!webhook) return notFound(reply, "Campaign webhook not found");
    const previous = store.state.campaignWebhookDeliveries.find((candidate) => candidate.id === request.params.deliveryId && candidate.webhookId === webhook.id && candidate.campaignId === webhook.campaignId);
    if (!previous) return notFound(reply, "Campaign webhook delivery not found");
    if (previous.status !== "failed") return conflict(reply, "Only failed campaign webhook deliveries can be retried");
    const guard = requireCampaignWebhookMutationGuard(request, reply, store, webhook, request.body?.expectedUpdatedAt, "Retrying a campaign webhook delivery");
    if (guard !== true) return guard;
    const target = await webhookTransport.validateTarget(webhook.url);
    if (!target.ok) return campaignWebhookTargetError(reply, target.errorCode, target.message);
    const userId = currentUserId(store, request.headers)!;
    const envelope = campaignWebhookEnvelopeFromDelivery(previous);
    const delivery = createCampaignWebhookDelivery(store, webhook, envelope, { retryOfDeliveryId: previous.id, initiatedByUserId: userId });
    stageManualWebhookDispatch(webhook, delivery, envelope);
    appendServerAuditLog(store, userId, {
      campaignId: webhook.campaignId,
      action: "campaign.webhook.retry",
      targetType: "campaign_webhook_delivery",
      targetId: delivery.id,
      before: campaignWebhookDeliveryAuditSummary(previous),
      after: campaignWebhookDeliveryAuditSummary(delivery),
    });
    store.save();
    return reply.code(202).send(publicCampaignWebhookDelivery(delivery));
  });
}
