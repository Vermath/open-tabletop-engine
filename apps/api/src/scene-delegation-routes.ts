import { createEvent, type EngineEvent, type Scene } from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StateStore } from "./store.js";

type SceneDelegationPermission = "scene.read" | "scene.update";

interface SceneDelegationAuditInput {
  campaignId: string;
  action: "scene.delegation.update";
  targetType: "scene";
  targetId: string;
  before: unknown;
  after: unknown;
}

export interface SceneDelegationRouteDependencies {
  store: StateStore;
  requireSceneUpdate(
    reply: FastifyReply,
    headers: FastifyRequest["headers"],
    campaignId: string,
  ): true | FastifyReply;
  requireExpectedRevision(
    reply: FastifyReply,
    input: {
      resourceType: "scene";
      resourceId: string;
      currentUpdatedAt: string;
      expectedUpdatedAt: unknown;
      current: unknown;
      label: "Scene";
    },
  ): true | FastifyReply;
  currentUserId(headers: FastifyRequest["headers"]): string;
  isActiveUserId(userId: string): boolean;
  withoutEditHistory(scene: Scene): Scene;
  nextRevisionTimestamp(current: string): string;
  appendAudit(userId: string, input: SceneDelegationAuditInput): void;
  broadcast(event: EngineEvent): void;
}

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: "bad_request", message });
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: "not_found", message });
}

function idempotencyKey(headers: FastifyRequest["headers"]): string | undefined {
  const value = headers["idempotency-key"];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

function delegatedPermissions(scene: Scene): Array<{ userId: string; permissions: SceneDelegationPermission[] }> {
  return Object.entries(scene.permissions ?? {})
    .filter(([, permissions]) => permissions.length > 0)
    .map(([userId, permissions]) => ({
      userId,
      permissions: permissions.filter((permission): permission is SceneDelegationPermission => permission === "scene.read" || permission === "scene.update"),
    }))
    .filter((delegation) => delegation.permissions.length > 0)
    .sort((left, right) => left.userId.localeCompare(right.userId));
}

export function registerSceneDelegationRoutes(
  app: FastifyInstance,
  dependencies: SceneDelegationRouteDependencies,
): void {
  const { store } = dependencies;

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId/delegations", async (request, reply) => {
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) return notFound(reply, "Scene not found");
    const allowed = dependencies.requireSceneUpdate(reply, request.headers, scene.campaignId);
    if (allowed !== true) return allowed;
    return { sceneId: scene.id, updatedAt: scene.updatedAt, delegations: delegatedPermissions(scene) };
  });

  app.patch<{
    Params: { sceneId: string; userId: string };
    Body: { permissions?: unknown; expectedUpdatedAt?: unknown };
  }>("/api/v1/scenes/:sceneId/delegations/:userId", async (request, reply) => {
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) return notFound(reply, "Scene not found");
    const allowed = dependencies.requireSceneUpdate(reply, request.headers, scene.campaignId);
    if (allowed !== true) return allowed;
    if (!idempotencyKey(request.headers)) return badRequest(reply, "Scene delegation updates require an Idempotency-Key header");
    const revision = dependencies.requireExpectedRevision(reply, {
      resourceType: "scene",
      resourceId: scene.id,
      currentUpdatedAt: scene.updatedAt,
      expectedUpdatedAt: request.body?.expectedUpdatedAt,
      current: dependencies.withoutEditHistory(scene),
      label: "Scene",
    });
    if (revision !== true) return revision;
    const member = store.state.members.find((candidate) => candidate.campaignId === scene.campaignId && candidate.userId === request.params.userId);
    if (!member || !dependencies.isActiveUserId(member.userId)) return badRequest(reply, "Scene delegation target must be an active campaign member");
    if (!Array.isArray(request.body?.permissions)) return badRequest(reply, "permissions must be an array containing scene.read and/or scene.update");
    const requested = request.body.permissions;
    if (!requested.every((permission) => permission === "scene.read" || permission === "scene.update")) {
      return badRequest(reply, "Scene delegations may grant only scene.read and scene.update");
    }
    const permissions = [...new Set(requested)] as SceneDelegationPermission[];
    if (permissions.includes("scene.update") && !permissions.includes("scene.read")) permissions.unshift("scene.read");
    const userId = dependencies.currentUserId(request.headers);
    const before = { userId: member.userId, permissions: scene.permissions?.[member.userId] ?? [], updatedAt: scene.updatedAt };
    const nextPermissions = { ...(scene.permissions ?? {}) };
    if (permissions.length === 0) delete nextPermissions[member.userId];
    else nextPermissions[member.userId] = permissions;
    scene.permissions = Object.keys(nextPermissions).length > 0 ? nextPermissions : undefined;
    scene.updatedAt = dependencies.nextRevisionTimestamp(scene.updatedAt);
    dependencies.appendAudit(userId, {
      campaignId: scene.campaignId,
      action: "scene.delegation.update",
      targetType: "scene",
      targetId: scene.id,
      before,
      after: { userId: member.userId, permissions, updatedAt: scene.updatedAt },
    });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: scene.campaignId, type: "scene.updated", actorUserId: userId, targetId: scene.id, payload: dependencies.withoutEditHistory(scene) }));
    return { sceneId: scene.id, userId: member.userId, permissions, updatedAt: scene.updatedAt };
  });
}
