import { createId, type Actor, type ActorCalculationExplanation, type CalculationOverride, type PermissionName } from "@open-tabletop/core";
import { DND_5E_SRD_SYSTEM_ID, dnd5eSrdCalculationExplanation } from "@open-tabletop/system-sdk";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StateStore } from "./store.js";

export interface CalculationOverrideCreateBody {
  fieldId?: unknown;
  source?: unknown;
  effectiveValue?: unknown;
  reason?: unknown;
  expectedActorUpdatedAt?: unknown;
}

export interface CalculationOverrideClearBody {
  reason?: unknown;
  expectedUpdatedAt?: unknown;
  expectedActorUpdatedAt?: unknown;
}

interface CalculationOverrideAuditInput {
  campaignId: string;
  action: string;
  targetType: "calculation_override";
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export interface CalculationOverrideRouteDependencies {
  store: StateStore;
  requireCampaignPermission(
    reply: FastifyReply,
    headers: FastifyRequest["headers"],
    campaignId: string,
    permission: PermissionName,
  ): true | FastifyReply;
  requireUser(reply: FastifyReply, headers: FastifyRequest["headers"]): string | FastifyReply;
  currentUserId(headers: FastifyRequest["headers"]): string | undefined;
  canReadActorPrivateData(userId: string, campaignId: string, actor: Actor): boolean;
  appendAudit(userId: string, input: CalculationOverrideAuditInput): void;
  broadcastActorUpdated(actor: Actor): void;
  nextRevisionTimestamp(current: string): string;
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

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function overrideValue(value: unknown): number | string | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= 500 ? normalized : undefined;
}

function requireExactRevision(
  reply: FastifyReply,
  input: { resourceType: "actor" | "calculation_override"; resourceId: string; currentUpdatedAt: string; expectedUpdatedAt: unknown; current: unknown; label: string },
): true | FastifyReply {
  if (typeof input.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
    return badRequest(reply, `${input.label} expectedUpdatedAt must be a valid date-time`);
  }
  if (input.expectedUpdatedAt === input.currentUpdatedAt) return true;
  return reply.code(409).send({
    error: "stale_write",
    code: "stale_write",
    message: `${input.label} changed after it was loaded. Review the current revision and retry.`,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    currentUpdatedAt: input.currentUpdatedAt,
    current: input.current,
  });
}

function rawExplanation(store: StateStore, actor: Actor): ActorCalculationExplanation {
  return dnd5eSrdCalculationExplanation(
    actor,
    store.state.items.filter((item) => item.actorId === actor.id && item.campaignId === actor.campaignId),
  );
}

export function applyCalculationOverrides(
  explanation: ActorCalculationExplanation,
  overrides: readonly CalculationOverride[],
): ActorCalculationExplanation {
  const activeByField = new Map<string, CalculationOverride>();
  for (const override of [...overrides]
    .filter((candidate) => candidate.actorId === explanation.actorId && !candidate.clearedAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))) {
    activeByField.set(override.fieldId, override);
  }
  return {
    ...explanation,
    fields: explanation.fields.map((field) => {
      const override = activeByField.get(field.id);
      if (!override) return field;
      const reason = `${override.source}: ${override.reason}`;
      return {
        ...field,
        result: override.effectiveValue,
        terms: [
          ...field.terms,
          {
            label: "Documented calculation override",
            formula: `${String(override.baseValue)} -> ${String(override.effectiveValue)}`,
            source: { kind: "override", id: override.id, name: override.reason },
          },
        ],
        flags: {
          ...field.flags,
          override: true,
          reasons: [...new Set([...field.flags.reasons, reason])],
        },
      };
    }),
  };
}

export function registerCalculationOverrideRoutes(app: FastifyInstance, dependencies: CalculationOverrideRouteDependencies): void {
  const { store } = dependencies;

  app.get<{ Params: { campaignId: string; actorId: string } }>(
    "/api/v1/campaigns/:campaignId/actors/:actorId/calculation-overrides",
    async (request, reply) => {
      const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "actor.read");
      if (allowed !== true) return allowed;
      const userId = dependencies.requireUser(reply, request.headers);
      if (typeof userId !== "string") return userId;
      const actor = store.state.actors.find((candidate) => candidate.id === request.params.actorId && candidate.campaignId === request.params.campaignId);
      if (!actor) return notFound(reply, "Actor not found");
      if (!dependencies.canReadActorPrivateData(userId, actor.campaignId, actor)) return reply.code(403).send({ error: "forbidden", message: "Missing permission: actor.readPrivate" });
      return store.state.calculationOverrides
        .filter((override) => override.actorId === actor.id && override.campaignId === actor.campaignId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    },
  );

  app.post<{ Params: { campaignId: string; actorId: string }; Body: CalculationOverrideCreateBody }>(
    "/api/v1/campaigns/:campaignId/actors/:actorId/calculation-overrides",
    async (request, reply) => {
      const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "actor.update");
      if (allowed !== true) return allowed;
      if (!idempotencyKey(request.headers)) return badRequest(reply, "Calculation override creation requires an Idempotency-Key header");
      const actor = store.state.actors.find((candidate) => candidate.id === request.params.actorId && candidate.campaignId === request.params.campaignId);
      if (!actor) return notFound(reply, "Actor not found");
      if (actor.systemId !== DND_5E_SRD_SYSTEM_ID) return badRequest(reply, "Calculation overrides are currently available only for the D&D 5.5e SRD system");
      const actorRevision = requireExactRevision(reply, { resourceType: "actor", resourceId: actor.id, currentUpdatedAt: actor.updatedAt, expectedUpdatedAt: request.body?.expectedActorUpdatedAt, current: actor, label: "Actor" });
      if (actorRevision !== true) return actorRevision;
      const fieldId = boundedText(request.body?.fieldId, 200);
      if (!fieldId) return badRequest(reply, "Calculation override fieldId must be 1-200 characters");
      if (request.body?.source !== "gm_manual" && request.body?.source !== "house_rule") return badRequest(reply, "Human calculation overrides must use source gm_manual or house_rule");
      const effectiveValue = overrideValue(request.body?.effectiveValue);
      if (effectiveValue === undefined) return badRequest(reply, "Calculation override effectiveValue must be a finite number or a non-empty string up to 500 characters");
      const reason = boundedText(request.body?.reason, 500);
      if (!reason) return badRequest(reply, "Calculation override reason must be 1-500 characters");
      const field = rawExplanation(store, actor).fields.find((candidate) => candidate.id === fieldId);
      if (!field) return badRequest(reply, "Calculation override fieldId must reference a current calculation explanation field");
      const active = store.state.calculationOverrides.find((candidate) => candidate.actorId === actor.id && candidate.fieldId === field.id && !candidate.clearedAt);
      if (active) return conflict(reply, "This calculation field already has an active override; clear it before creating another");
      const userId = dependencies.currentUserId(request.headers)!;
      const changedAt = dependencies.nextRevisionTimestamp(actor.updatedAt);
      const override: CalculationOverride = {
        id: createId("calc_override"),
        campaignId: actor.campaignId,
        actorId: actor.id,
        fieldId: field.id,
        source: request.body.source,
        baseValue: field.result,
        effectiveValue,
        reason,
        createdByUserId: userId,
        createdAt: changedAt,
        updatedAt: changedAt,
      };
      store.state.calculationOverrides.push(override);
      actor.updatedAt = changedAt;
      dependencies.appendAudit(userId, { campaignId: actor.campaignId, action: "calculation.override.create", targetType: "calculation_override", targetId: override.id, after: override });
      store.save();
      dependencies.broadcastActorUpdated(actor);
      return reply.code(201).send(override);
    },
  );

  app.post<{ Params: { overrideId: string }; Body: CalculationOverrideClearBody }>(
    "/api/v1/calculation-overrides/:overrideId/clear",
    async (request, reply) => {
      const override = store.state.calculationOverrides.find((candidate) => candidate.id === request.params.overrideId);
      if (!override) return notFound(reply, "Calculation override not found");
      const allowed = dependencies.requireCampaignPermission(reply, request.headers, override.campaignId, "actor.update");
      if (allowed !== true) return allowed;
      if (!idempotencyKey(request.headers)) return badRequest(reply, "Clearing a calculation override requires an Idempotency-Key header");
      const actor = store.state.actors.find((candidate) => candidate.id === override.actorId && candidate.campaignId === override.campaignId);
      if (!actor) return notFound(reply, "Calculation override actor not found");
      const overrideRevision = requireExactRevision(reply, { resourceType: "calculation_override", resourceId: override.id, currentUpdatedAt: override.updatedAt, expectedUpdatedAt: request.body?.expectedUpdatedAt, current: override, label: "Calculation override" });
      if (overrideRevision !== true) return overrideRevision;
      const actorRevision = requireExactRevision(reply, { resourceType: "actor", resourceId: actor.id, currentUpdatedAt: actor.updatedAt, expectedUpdatedAt: request.body?.expectedActorUpdatedAt, current: actor, label: "Actor" });
      if (actorRevision !== true) return actorRevision;
      if (override.clearedAt) return conflict(reply, "Calculation override is already cleared");
      const reason = boundedText(request.body?.reason, 500);
      if (!reason) return badRequest(reply, "Calculation override clear reason must be 1-500 characters");
      const userId = dependencies.currentUserId(request.headers)!;
      const before = structuredClone(override);
      const changedAt = dependencies.nextRevisionTimestamp(override.updatedAt > actor.updatedAt ? override.updatedAt : actor.updatedAt);
      override.clearedAt = changedAt;
      override.clearedByUserId = userId;
      override.clearReason = reason;
      override.updatedAt = changedAt;
      actor.updatedAt = changedAt;
      dependencies.appendAudit(userId, { campaignId: actor.campaignId, action: "calculation.override.clear", targetType: "calculation_override", targetId: override.id, before, after: override });
      store.save();
      dependencies.broadcastActorUpdated(actor);
      return override;
    },
  );
}
