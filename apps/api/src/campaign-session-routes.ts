import { createEvent, createTimestamped, type CampaignSession, type EngineEvent, type PermissionName, type Scene } from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StateStore } from "./store.js";

interface CampaignSessionCreateBody {
  title?: unknown;
  agenda?: unknown;
  notes?: unknown;
  scheduledFor?: unknown;
  sceneIds?: unknown;
  encounterIds?: unknown;
  expectedCampaignUpdatedAt?: unknown;
}

interface CampaignSessionPatchBody extends CampaignSessionCreateBody {
  status?: unknown;
  expectedUpdatedAt?: unknown;
}

interface CampaignSessionActionBody {
  expectedUpdatedAt?: unknown;
  activateSceneId?: unknown;
  notes?: unknown;
}

interface CampaignSessionAuditInput {
  campaignId: string;
  action: string;
  targetType: "campaign_session";
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export interface CampaignSessionRouteDependencies {
  store: StateStore;
  requireCampaignPermission(
    reply: FastifyReply,
    headers: FastifyRequest["headers"],
    campaignId: string,
    permission: PermissionName,
  ): true | FastifyReply;
  requireExpectedRevision(
    reply: FastifyReply,
    input: {
      resourceType: "campaign_session";
      resourceId: string;
      currentUpdatedAt: string;
      expectedUpdatedAt: unknown;
      current: unknown;
      label: "Campaign session";
    },
  ): true | FastifyReply;
  currentUserId(headers: FastifyRequest["headers"]): string;
  nextRevisionTimestamp(current: string): string;
  activateScene(scene: Scene, userId: string, activatedAt: string): void;
  appendAudit(userId: string, input: CampaignSessionAuditInput): void;
  broadcast(event: EngineEvent): void;
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

function idempotencyKey(headers: FastifyRequest["headers"]): string | undefined {
  const value = headers["idempotency-key"];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length > maxLength) return undefined;
  return value.trim();
}

function normalizeCampaignSessionInput(
  store: StateStore,
  campaignId: string,
  rawBody: unknown,
  existing?: CampaignSession,
):
  | { ok: true; value: Partial<Pick<CampaignSession, "title" | "agenda" | "notes" | "scheduledFor" | "sceneIds" | "encounterIds">> }
  | { ok: false; error: string } {
  if (!isRecord(rawBody)) return { ok: false, error: "Campaign session body must be a JSON object" };
  const value: Partial<Pick<CampaignSession, "title" | "agenda" | "notes" | "scheduledFor" | "sceneIds" | "encounterIds">> = {};
  if ("title" in rawBody) {
    const title = boundedText(rawBody.title, 160);
    if (!title) return { ok: false, error: "Session title must be 1-160 characters" };
    value.title = title;
  } else if (!existing) {
    value.title = undefined;
  }
  for (const [field, maxLength] of [["agenda", 20_000], ["notes", 20_000]] as const) {
    if (!(field in rawBody)) continue;
    const text = boundedText(rawBody[field], maxLength);
    if (text === undefined) return { ok: false, error: `${field} must be a string no longer than ${maxLength} characters` };
    value[field] = text;
  }
  if ("scheduledFor" in rawBody) {
    if (rawBody.scheduledFor === null || rawBody.scheduledFor === "") value.scheduledFor = undefined;
    else if (typeof rawBody.scheduledFor === "string" && Number.isFinite(Date.parse(rawBody.scheduledFor))) value.scheduledFor = new Date(rawBody.scheduledFor).toISOString();
    else return { ok: false, error: "scheduledFor must be an ISO date or null" };
  }
  for (const [field, collection] of [["sceneIds", store.state.scenes] as const, ["encounterIds", store.state.encounters] as const]) {
    if (!(field in rawBody)) continue;
    const ids = rawBody[field];
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== "string" || !id.trim())) {
      return { ok: false, error: `${field} must be an array of at most 100 non-empty ids` };
    }
    const normalizedIds = [...new Set(ids.map((id) => id.trim()))];
    const missingId = normalizedIds.find((id) => !collection.some((record) => record.id === id && record.campaignId === campaignId));
    if (missingId) return { ok: false, error: `${field} contains a record outside this campaign: ${missingId}` };
    value[field] = normalizedIds;
  }
  return { ok: true, value };
}

function campaignSessionAuditSummary(session: CampaignSession): Record<string, unknown> {
  return {
    id: session.id,
    campaignId: session.campaignId,
    number: session.number,
    title: session.title,
    status: session.status,
    scheduledFor: session.scheduledFor,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    sceneCount: session.sceneIds.length,
    encounterCount: session.encounterIds.length,
    agendaCharacters: session.agenda.length,
    notesCharacters: session.notes.length,
    recapProposalId: session.recapProposalId,
    recapJournalId: session.recapJournalId,
  };
}

export function registerCampaignSessionRoutes(
  app: FastifyInstance,
  dependencies: CampaignSessionRouteDependencies,
): void {
  const { store } = dependencies;

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/sessions", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    return store.state.campaignSessions
      .filter((session) => session.campaignId === request.params.campaignId)
      .sort((left, right) => left.number - right.number || left.createdAt.localeCompare(right.createdAt));
  });

  app.post<{ Params: { campaignId: string }; Body: CampaignSessionCreateBody }>("/api/v1/campaigns/:campaignId/sessions", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    if (!idempotencyKey(request.headers)) return badRequest(reply, "Campaign session creation requires an Idempotency-Key header");
    const userId = dependencies.currentUserId(request.headers);
    const normalized = normalizeCampaignSessionInput(store, request.params.campaignId, request.body ?? {});
    if (!normalized.ok) return badRequest(reply, normalized.error);
    const number = Math.max(0, ...store.state.campaignSessions.filter((session) => session.campaignId === request.params.campaignId).map((session) => session.number)) + 1;
    const session = createTimestamped("cses", {
      campaignId: request.params.campaignId,
      status: "planned" as const,
      title: normalized.value.title ?? `Session ${number}`,
      number,
      agenda: normalized.value.agenda ?? "",
      notes: normalized.value.notes ?? "",
      scheduledFor: normalized.value.scheduledFor,
      sceneIds: normalized.value.sceneIds ?? [],
      encounterIds: normalized.value.encounterIds ?? [],
      createdBy: userId,
      updatedBy: userId,
    }) satisfies CampaignSession;
    store.state.campaignSessions.push(session);
    dependencies.appendAudit(userId, { campaignId: session.campaignId, action: "campaign.session.create", targetType: "campaign_session", targetId: session.id, after: campaignSessionAuditSummary(session) });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: session.campaignId, type: "campaign.session.created", actorUserId: userId, targetId: session.id, payload: session }));
    return session;
  });

  app.get<{ Params: { sessionId: string } }>("/api/v1/campaign-sessions/:sessionId", async (request, reply) => {
    const session = store.state.campaignSessions.find((item) => item.id === request.params.sessionId);
    if (!session) return notFound(reply, "Campaign session not found");
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, session.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    return session;
  });

  app.patch<{ Params: { sessionId: string }; Body: CampaignSessionPatchBody }>("/api/v1/campaign-sessions/:sessionId", async (request, reply) => {
    const session = store.state.campaignSessions.find((item) => item.id === request.params.sessionId);
    if (!session) return notFound(reply, "Campaign session not found");
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, session.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    if (!idempotencyKey(request.headers)) return badRequest(reply, "Campaign session updates require an Idempotency-Key header");
    const revision = dependencies.requireExpectedRevision(reply, { resourceType: "campaign_session", resourceId: session.id, currentUpdatedAt: session.updatedAt, expectedUpdatedAt: request.body?.expectedUpdatedAt, current: session, label: "Campaign session" });
    if (revision !== true) return revision;
    if (isRecord(request.body) && "status" in request.body) return badRequest(reply, "Use the session start or complete actions to change status");
    const userId = dependencies.currentUserId(request.headers);
    const normalized = normalizeCampaignSessionInput(store, session.campaignId, request.body ?? {}, session);
    if (!normalized.ok) return badRequest(reply, normalized.error);
    const before = campaignSessionAuditSummary(session);
    Object.assign(session, normalized.value, { updatedBy: userId, updatedAt: dependencies.nextRevisionTimestamp(session.updatedAt) });
    dependencies.appendAudit(userId, { campaignId: session.campaignId, action: "campaign.session.update", targetType: "campaign_session", targetId: session.id, before, after: campaignSessionAuditSummary(session) });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: session.campaignId, type: "campaign.session.updated", actorUserId: userId, targetId: session.id, payload: session }));
    return session;
  });

  app.post<{ Params: { sessionId: string }; Body: CampaignSessionActionBody }>("/api/v1/campaign-sessions/:sessionId/start", async (request, reply) => {
    const session = store.state.campaignSessions.find((item) => item.id === request.params.sessionId);
    if (!session) return notFound(reply, "Campaign session not found");
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, session.campaignId, "scene.activate");
    if (allowed !== true) return allowed;
    if (!idempotencyKey(request.headers)) return badRequest(reply, "Starting a campaign session requires an Idempotency-Key header");
    const revision = dependencies.requireExpectedRevision(reply, { resourceType: "campaign_session", resourceId: session.id, currentUpdatedAt: session.updatedAt, expectedUpdatedAt: request.body?.expectedUpdatedAt, current: session, label: "Campaign session" });
    if (revision !== true) return revision;
    if (session.status !== "planned") return conflict(reply, "Only a planned session can be started");
    const existingLive = store.state.campaignSessions.find((item) => item.campaignId === session.campaignId && item.status === "live");
    if (existingLive) return conflict(reply, `Session ${existingLive.number} is already live`);
    const userId = dependencies.currentUserId(request.headers);
    const activateSceneId = typeof request.body?.activateSceneId === "string" ? request.body.activateSceneId.trim() : undefined;
    if (request.body?.activateSceneId !== undefined && !activateSceneId) return badRequest(reply, "activateSceneId must be a non-empty string");
    if (activateSceneId && !session.sceneIds.includes(activateSceneId)) return badRequest(reply, "activateSceneId must be linked to this session");
    const scene = activateSceneId ? store.state.scenes.find((item) => item.id === activateSceneId && item.campaignId === session.campaignId) : undefined;
    if (activateSceneId && !scene) return notFound(reply, "Session scene not found");
    const startedAt = dependencies.nextRevisionTimestamp(session.updatedAt);
    if (scene) dependencies.activateScene(scene, userId, startedAt);
    Object.assign(session, { status: "live" as const, startedAt, endedAt: undefined, updatedBy: userId, updatedAt: startedAt });
    dependencies.appendAudit(userId, { campaignId: session.campaignId, action: "campaign.session.start", targetType: "campaign_session", targetId: session.id, after: campaignSessionAuditSummary(session) });
    store.save();
    if (scene) dependencies.broadcast(createEvent({ campaignId: scene.campaignId, type: "scene.activated", actorUserId: userId, targetId: scene.id, payload: scene }));
    dependencies.broadcast(createEvent({ campaignId: session.campaignId, type: "campaign.session.started", actorUserId: userId, targetId: session.id, payload: session }));
    return session;
  });

  app.post<{ Params: { sessionId: string }; Body: CampaignSessionActionBody }>("/api/v1/campaign-sessions/:sessionId/complete", async (request, reply) => {
    const session = store.state.campaignSessions.find((item) => item.id === request.params.sessionId);
    if (!session) return notFound(reply, "Campaign session not found");
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, session.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    if (!idempotencyKey(request.headers)) return badRequest(reply, "Completing a campaign session requires an Idempotency-Key header");
    const revision = dependencies.requireExpectedRevision(reply, { resourceType: "campaign_session", resourceId: session.id, currentUpdatedAt: session.updatedAt, expectedUpdatedAt: request.body?.expectedUpdatedAt, current: session, label: "Campaign session" });
    if (revision !== true) return revision;
    if (session.status !== "live") return conflict(reply, "Only a live session can be completed");
    const notes = request.body?.notes === undefined ? session.notes : boundedText(request.body.notes, 20_000);
    if (notes === undefined) return badRequest(reply, "notes must be a string no longer than 20000 characters");
    const userId = dependencies.currentUserId(request.headers);
    const endedAt = dependencies.nextRevisionTimestamp(session.updatedAt);
    Object.assign(session, { status: "completed" as const, notes, endedAt, updatedBy: userId, updatedAt: endedAt });
    dependencies.appendAudit(userId, { campaignId: session.campaignId, action: "campaign.session.complete", targetType: "campaign_session", targetId: session.id, after: campaignSessionAuditSummary(session) });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: session.campaignId, type: "campaign.session.completed", actorUserId: userId, targetId: session.id, payload: session }));
    return session;
  });

  app.delete<{ Params: { sessionId: string }; Querystring: { expectedUpdatedAt?: string } }>("/api/v1/campaign-sessions/:sessionId", async (request, reply) => {
    const index = store.state.campaignSessions.findIndex((item) => item.id === request.params.sessionId);
    const session = store.state.campaignSessions[index];
    if (!session) return notFound(reply, "Campaign session not found");
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, session.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    if (!idempotencyKey(request.headers)) return badRequest(reply, "Deleting a campaign session requires an Idempotency-Key header");
    const revision = dependencies.requireExpectedRevision(reply, { resourceType: "campaign_session", resourceId: session.id, currentUpdatedAt: session.updatedAt, expectedUpdatedAt: request.query.expectedUpdatedAt, current: session, label: "Campaign session" });
    if (revision !== true) return revision;
    if (session.status !== "planned") return conflict(reply, "Live or completed sessions are auditable records and cannot be deleted");
    const userId = dependencies.currentUserId(request.headers);
    store.state.campaignSessions.splice(index, 1);
    dependencies.appendAudit(userId, { campaignId: session.campaignId, action: "campaign.session.delete", targetType: "campaign_session", targetId: session.id, before: campaignSessionAuditSummary(session), after: { deleted: true } });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: session.campaignId, type: "campaign.session.deleted", actorUserId: userId, targetId: session.id, payload: session }));
    return session;
  });
}
