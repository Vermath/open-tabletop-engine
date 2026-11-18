import { isDeepStrictEqual } from "node:util";
import {
  createEvent, type Actor, type AuditLog, type CompendiumMonsterPlacement, type CompendiumMonsterPlacementInput,
  type CompendiumPlacementHistoryInput, type CompendiumPlacementHistoryResult, type EncounterMonsterPlacementResult,
  type EngineEvent, type EngineState, type PermissionName, type Scene, type Token,
} from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StateStore } from "./store.js";

interface Pair { actor: Actor; token: Token }
interface Dependencies {
  store: StateStore;
  prepareMonsterPlacement(reply: FastifyReply, scene: Scene, userId: string, placement: unknown, index: number): (Pair & { result: EncounterMonsterPlacementResult }) | FastifyReply;
  requireCampaignPermission(reply: FastifyReply, headers: FastifyRequest["headers"], campaignId: string, permission: PermissionName): true | FastifyReply;
  currentUserId(headers: FastifyRequest["headers"]): string | undefined;
  canReadScene(userId: string, scene: Scene): boolean;
  sceneForUser(userId: string, scene: Scene): Scene;
  actorForUser(userId: string, actor: Actor): Actor;
  appendAudit(userId: string, entry: { campaignId: string; action: string; targetType: string; targetId: string; after: Record<string, unknown> }): AuditLog;
  nextRevisionTimestamp(revision: string): string;
  stageRequestEventsUntilDurableSave(request: FastifyRequest, stage: () => void): void;
  broadcast(event: EngineEvent): void;
}

function problem(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: status === 409 ? "conflict" : status === 404 ? "not_found" : "bad_request", message });
}

// References can live inside system-specific actor, item, and combat data as well as typed links.
// Inspect live campaign records only. Historical logs and roll receipts may continue to name a removed monster.
function referencesPair(value: unknown, pair: Pair): boolean {
  if (typeof value === "string") return value === pair.actor.id || value === pair.token.id;
  return Boolean(value && typeof value === "object" && Object.entries(value).some(([key, child]) =>
    key === pair.actor.id || key === pair.token.id || referencesPair(child, pair)));
}

function pairInUse(state: EngineState, pair: Pair) {
  const { campaignId } = pair.actor;
  const collections = [state.actors, state.items, state.combats, state.encounters, state.journals,
    state.handouts, state.calculationOverrides, state.characterTransfers, state.pendingAdvancements,
    state.worldRecords, state.worldRelations, state.campaignSessions, state.dndRulesMutations.filter((mutation) => mutation.status === "applied")];
  const campaignScenes = state.scenes.filter((scene) => scene.campaignId === campaignId);
  const sceneIds = new Set(campaignScenes.map((scene) => scene.id));
  return collections.some((records) => records.some((record) =>
    record.campaignId === campaignId && record.id !== pair.actor.id && referencesPair(record, pair)))
    || state.tokens.some((token) => token.id !== pair.token.id && sceneIds.has(token.sceneId) && referencesPair(token, pair))
    || campaignScenes.some((scene) => referencesPair(scene.coverOverrides, pair) || referencesPair(scene.annotations, pair));
}

export function registerCompendiumPlacementRoutes(app: FastifyInstance, deps: Dependencies) {
  const { store } = deps;
  function authorize(request: FastifyRequest, reply: FastifyReply, sceneId: string, undo: boolean) {
    const scene = store.state.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return problem(reply, 404, "Scene not found");
    const permissions: PermissionName[] = undo ? ["actor.delete", "token.delete"] : ["actor.create", "token.create"];
    for (const permission of permissions) {
      const allowed = deps.requireCampaignPermission(reply, request.headers, scene.campaignId, permission);
      if (allowed !== true) return allowed;
    }
    if (!request.headers["idempotency-key"]?.toString().trim()) return problem(reply, 400, "Monster placement requires an Idempotency-Key header");
    const userId = deps.currentUserId(request.headers)!;
    if (!deps.canReadScene(userId, scene)) return problem(reply, 404, "Scene not found");
    return { scene, userId };
  }

  function savePairChange(request: FastifyRequest, scene: Scene, pair: Pair, undo: boolean) {
    scene.updatedAt = deps.nextRevisionTimestamp(scene.updatedAt);
    store.save();
    deps.stageRequestEventsUntilDurableSave(request, () => {
      const event = { campaignId: scene.campaignId, actorUserId: deps.currentUserId(request.headers) };
      deps.broadcast(createEvent({ ...event, type: undo ? "actor.deleted" : "actor.created", targetId: pair.actor.id, payload: pair.actor }));
      deps.broadcast(createEvent({ ...event, type: undo ? "token.deleted" : "token.created", targetId: pair.token.id, payload: pair.token }));
      deps.broadcast(createEvent({ ...event, type: "scene.updated", targetId: scene.id, payload: scene }));
    });
  }

  app.post<{ Params: { sceneId: string }; Body: CompendiumMonsterPlacementInput }>("/api/v1/scenes/:sceneId/compendium-monster-placements", async (request, reply) => {
    const access = authorize(request, reply, request.params.sceneId, false);
    if (!("scene" in access)) return access;
    const { scene, userId } = access;
    const { entryId, x, y } = request.body ?? {};
    if (typeof entryId !== "string" || !Number.isFinite(x) || !Number.isFinite(y)) return problem(reply, 400, "Supply a monster entry and finite map coordinates");
    const width = Math.min(scene.gridSize || 50, scene.width);
    const height = Math.min(scene.gridSize || 50, scene.height);
    if (x < 0 || y < 0 || x + width > scene.width || y + height > scene.height) return problem(reply, 400, "Monster footprint is outside the scene");
    const source = entryId.startsWith("srd-monster:") ? { threatId: entryId.slice("srd-monster:".length) }
      : entryId.startsWith("campaign-item:") ? { customMonsterItemId: entryId.slice("campaign-item:".length) } : undefined;
    if (!source) return problem(reply, 400, "Choose a placeable compendium monster");
    const prepared = deps.prepareMonsterPlacement(reply, scene, userId, { ...source, x, y, width, height }, 0);
    if (!("result" in prepared)) return prepared;
    const { actor, token } = prepared;
    store.state.actors.push(actor);
    store.state.tokens.push(token);
    const receipt = deps.appendAudit(userId, { campaignId: scene.campaignId, action: "compendium.monster.place", targetType: "scene", targetId: scene.id,
      after: { entryId, ...structuredClone({ actor, token }) } });
    savePairChange(request, scene, prepared, false);
    return { placementId: receipt.id, actor: prepared.result.actor, sceneToken: token, scene: deps.sceneForUser(userId, scene) } satisfies CompendiumMonsterPlacement;
  });

  app.post<{ Params: { sceneId: string; placementId: string }; Body: CompendiumPlacementHistoryInput }>("/api/v1/scenes/:sceneId/compendium-monster-placements/:placementId/history", async (request, reply) => {
    const direction = request.body?.direction;
    const undo = direction === "undo";
    const access = authorize(request, reply, request.params.sceneId, undo);
    if (!("scene" in access)) return access;
    if (!undo && direction !== "redo") return problem(reply, 400, "Choose undo or redo");
    const { scene, userId } = access;
    const receipt = store.state.auditLogs.find((log) => log.id === request.params.placementId && log.action === "compendium.monster.place"
      && log.campaignId === scene.campaignId && log.targetId === scene.id && log.actorUserId === userId);
    if (!receipt) return problem(reply, 404, "Monster placement not found");
    const original = receipt.after as Pair & { entryId: string };
    if (typeof original?.entryId !== "string" || original.actor?.campaignId !== scene.campaignId || original.token?.sceneId !== scene.id || original.token.actorId !== original.actor.id) {
      return problem(reply, 409, "The placement receipt does not match this scene");
    }
    if (!undo && original.entryId.startsWith("campaign-item:")) {
      const allowed = deps.requireCampaignPermission(reply, request.headers, scene.campaignId, "campaign.update");
      if (allowed !== true) return allowed;
    }
    const existingActor = store.state.actors.find((actor) => actor.id === original.actor.id);
    const existingToken = store.state.tokens.find((token) => token.id === original.token.id);
    const pair = structuredClone({ actor: original.actor, token: original.token });
    if (undo) {
      if (!existingActor || !existingToken || !isDeepStrictEqual(existingActor, { ...pair.actor, updatedAt: existingActor.updatedAt })
        || !isDeepStrictEqual(existingToken, { ...pair.token, updatedAt: existingToken.updatedAt }) || pairInUse(store.state, pair)) {
        return problem(reply, 409, "The placed monster has changed or is in use");
      }
      store.state.tokens = store.state.tokens.filter((token) => token.id !== pair.token.id);
      store.state.actors = store.state.actors.filter((actor) => actor.id !== pair.actor.id);
    } else {
      const lastChange = [...store.state.auditLogs].reverse().find((log) => log.targetType === "monster_placement" && log.targetId === receipt.id);
      if (existingActor || existingToken || lastChange?.action !== "compendium.monster.undo") return problem(reply, 409, "Only an undone placement can be restored");
      if (pair.token.x < 0 || pair.token.y < 0 || pair.token.x + pair.token.width > scene.width || pair.token.y + pair.token.height > scene.height) {
        return problem(reply, 409, "The original placement no longer fits the scene");
      }
      pair.actor.updatedAt = pair.token.updatedAt = deps.nextRevisionTimestamp(scene.updatedAt);
      store.state.actors.push(pair.actor);
      store.state.tokens.push(pair.token);
    }
    deps.appendAudit(userId, { campaignId: scene.campaignId, action: "compendium.monster." + direction, targetType: "monster_placement", targetId: receipt.id,
      after: { actorId: pair.actor.id, tokenId: pair.token.id } });
    savePairChange(request, scene, pair, undo);
    const projectedScene = deps.sceneForUser(userId, scene);
    return (undo ? { direction, actorId: pair.actor.id, tokenId: pair.token.id, scene: projectedScene }
      : { direction, placementId: receipt.id, actor: deps.actorForUser(userId, pair.actor), sceneToken: pair.token, scene: projectedScene }) satisfies CompendiumPlacementHistoryResult;
  });
}
