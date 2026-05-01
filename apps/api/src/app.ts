import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { EchoAiProvider, buildPermissionFilteredContext } from "@open-tabletop/ai-core";
import { openApiSpec } from "@open-tabletop/api-contracts";
import {
  applyProposal,
  approveProposal,
  createEvent,
  createId,
  createTimestamped,
  hasPermission,
  makeArchive,
  nowIso,
  type Actor,
  type AiMemoryFact,
  type Campaign,
  type CampaignArchive,
  type ChatMessage,
  type Combat,
  type Encounter,
  type EngineState,
  type JournalEntry,
  type MapAsset,
  type PermissionName,
  type Proposal,
  type Scene,
  type Token
} from "@open-tabletop/core";
import { rollFormula } from "@open-tabletop/dice-engine";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { installedPlugins, installedSystems } from "./registries.js";
import { RealtimeHub } from "./realtime.js";
import { FileStateStore, type StateStore } from "./store.js";

export interface BuildAppOptions {
  store?: StateStore;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const store = options.store ?? new FileStateStore();
  const hub = new RealtimeHub();
  const aiProvider = new EchoAiProvider();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/api/v1/health", async () => ({
    ok: true,
    version: "0.1.0",
    service: "open-tabletop-api"
  }));

  app.get("/api/v1/openapi.json", async () => openApiSpec);

  app.get("/api/v1/auth/session", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    return {
      user: store.state.users.find((user) => user.id === userId) ?? store.state.users[0],
      memberships: store.state.members.filter((member) => member.userId === userId)
    };
  });

  app.get("/api/v1/realtime", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/api/v1/realtime", "http://localhost");
    const campaignId = url.searchParams.get("campaignId") ?? undefined;
    const userId = userIdFromRequest(request.url, request.headers);
    if (!userId || (campaignId && !canCampaign(store, userId, campaignId, "campaign.read"))) {
      socket.send(JSON.stringify({ error: "unauthorized" }));
      socket.close();
      return;
    }
    const client = {
      campaignId,
      send: (data: string) => socket.send(data)
    };
    hub.add(client);
    socket.on("close", () => hub.remove(client));
  });

  app.get("/api/v1/campaigns", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    return store.state.campaigns.filter((campaign) => canCampaign(store, userId, campaign.id, "campaign.read"));
  });

  app.post<{ Body: Partial<Campaign> }>("/api/v1/campaigns", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const campaign = createTimestamped("camp", {
      ownerUserId: userId,
      name: request.body.name ?? "Untitled Campaign",
      description: request.body.description ?? "",
      defaultSystemId: request.body.defaultSystemId ?? "generic-fantasy",
      visibility: request.body.visibility ?? "private"
    }) satisfies Campaign;
    const member = createTimestamped("mem", { campaignId: campaign.id, userId, role: "owner" as const });
    store.state.campaigns.push(campaign);
    store.state.members.push(member);
    store.save();
    hub.broadcast(createEvent({ campaignId: campaign.id, type: "campaign.member.joined", actorUserId: userId, targetId: campaign.id, payload: member }));
    return campaign;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    return campaign;
  });

  app.patch<{ Params: { campaignId: string }; Body: Partial<Campaign> }>("/api/v1/campaigns/:campaignId", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    Object.assign(campaign, request.body, { updatedAt: nowIso() });
    store.save();
    return campaign;
  });

  app.delete<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.delete");
    if (allowed !== true) return allowed;
    const index = store.state.campaigns.findIndex((item) => item.id === request.params.campaignId);
    if (index < 0) return notFound(reply, "Campaign not found");
    const deleted = store.state.campaigns.splice(index, 1)[0]!;
    store.save();
    return deleted;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/scenes", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.read");
    if (allowed !== true) return allowed;
    return store.state.scenes.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<Scene> }>("/api/v1/campaigns/:campaignId/scenes", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.create");
    if (allowed !== true) return allowed;
    const scene = createTimestamped("scn", {
      campaignId: request.params.campaignId,
      name: request.body.name ?? "New Scene",
      width: request.body.width ?? 1200,
      height: request.body.height ?? 800,
      gridType: request.body.gridType ?? "square",
      gridSize: request.body.gridSize ?? 50,
      backgroundAssetId: request.body.backgroundAssetId,
      active: Boolean(request.body.active),
      sortOrder: request.body.sortOrder ?? store.state.scenes.length + 1,
      fog: request.body.fog ?? [],
      walls: request.body.walls ?? [],
      lights: request.body.lights ?? [],
      metadata: request.body.metadata ?? {}
    }) satisfies Scene;
    store.state.scenes.push(scene);
    store.save();
    hub.broadcast(createEvent({ campaignId: scene.campaignId, type: "scene.created", targetId: scene.id, payload: scene }));
    return scene;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/assets", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.read");
    if (allowed !== true) return allowed;
    return store.state.assets.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<MapAsset> }>("/api/v1/campaigns/:campaignId/assets", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.create");
    if (allowed !== true) return allowed;
    const asset = createTimestamped("asset", {
      campaignId: request.params.campaignId,
      name: request.body.name ?? "Map Asset",
      url: request.body.url ?? "",
      mimeType: request.body.mimeType ?? "image/png",
      sizeBytes: request.body.sizeBytes ?? 0,
      checksum: request.body.checksum
    }) satisfies MapAsset;
    store.state.assets.push(asset);
    store.save();
    return asset;
  });

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.read");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    return scene;
  });

  app.patch<{ Params: { sceneId: string }; Body: Partial<Scene> }>("/api/v1/scenes/:sceneId", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.update");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    Object.assign(scene, request.body, { updatedAt: nowIso() });
    store.save();
    hub.broadcast(createEvent({ campaignId: scene.campaignId, type: scene.active ? "scene.activated" : "scene.updated", targetId: scene.id, payload: scene }));
    return scene;
  });

  app.post<{ Params: { sceneId: string }; Body: { x: number; y: number; radius?: number; hidden?: boolean } }>("/api/v1/scenes/:sceneId/fog", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.reveal");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    scene.fog.push({
      id: createId("fog"),
      x: request.body.x,
      y: request.body.y,
      radius: request.body.radius ?? 120,
      hidden: request.body.hidden ?? false
    });
    scene.updatedAt = nowIso();
    store.save();
    hub.broadcast(createEvent({ campaignId: scene.campaignId, type: "scene.updated", targetId: scene.id, payload: scene }));
    return scene;
  });

  app.delete<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.delete");
    if (allowed !== true) return allowed;
    const index = store.state.scenes.findIndex((item) => item.id === request.params.sceneId);
    if (index < 0) return notFound(reply, "Scene not found");
    const deleted = store.state.scenes.splice(index, 1)[0]!;
    store.save();
    hub.broadcast(createEvent({ campaignId: deleted.campaignId, type: "scene.deleted", targetId: deleted.id, payload: deleted }));
    return deleted;
  });

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId/tokens", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.read");
    if (allowed !== true) return allowed;
    return store.state.tokens.filter((item) => item.sceneId === request.params.sceneId);
  });

  app.post<{ Params: { sceneId: string }; Body: Partial<Token> }>("/api/v1/scenes/:sceneId/tokens", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.create");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    const token = createTimestamped("tok", {
      sceneId: scene.id,
      actorId: request.body.actorId,
      name: request.body.name ?? "New Token",
      x: request.body.x ?? 100,
      y: request.body.y ?? 100,
      width: request.body.width ?? scene.gridSize,
      height: request.body.height ?? scene.gridSize,
      rotation: request.body.rotation ?? 0,
      hidden: Boolean(request.body.hidden),
      locked: Boolean(request.body.locked),
      visionEnabled: request.body.visionEnabled ?? true,
      visionRadius: request.body.visionRadius ?? 160,
      disposition: request.body.disposition ?? "neutral",
      imageAssetId: request.body.imageAssetId,
      metadata: request.body.metadata ?? {}
    }) satisfies Token;
    store.state.tokens.push(token);
    store.save();
    hub.broadcast(createEvent({ campaignId: scene.campaignId, type: "token.created", targetId: token.id, payload: token }));
    return token;
  });

  app.patch<{ Params: { tokenId: string }; Body: Partial<Token> }>("/api/v1/tokens/:tokenId", async (request, reply) => {
    const campaignId = campaignIdForToken(store, request.params.tokenId);
    if (!campaignId) return notFound(reply, "Token not found");
    const permission: PermissionName = request.body.x !== undefined || request.body.y !== undefined ? "token.move" : "token.update";
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, permission);
    if (allowed !== true) return allowed;
    const token = store.state.tokens.find((item) => item.id === request.params.tokenId);
    if (!token) return notFound(reply, "Token not found");
    const scene = store.state.scenes.find((item) => item.id === token.sceneId);
    Object.assign(token, request.body, { updatedAt: nowIso() });
    store.save();
    if (scene) {
      const moved = request.body.x !== undefined || request.body.y !== undefined;
      hub.broadcast(createEvent({ campaignId: scene.campaignId, type: moved ? "token.moved" : "token.updated", targetId: token.id, payload: token }));
    }
    return token;
  });

  app.delete<{ Params: { tokenId: string } }>("/api/v1/tokens/:tokenId", async (request, reply) => {
    const campaignId = campaignIdForToken(store, request.params.tokenId);
    if (!campaignId) return notFound(reply, "Token not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.delete");
    if (allowed !== true) return allowed;
    const index = store.state.tokens.findIndex((item) => item.id === request.params.tokenId);
    if (index < 0) return notFound(reply, "Token not found");
    const deleted = store.state.tokens.splice(index, 1)[0]!;
    store.save();
    const scene = store.state.scenes.find((item) => item.id === deleted.sceneId);
    if (scene) hub.broadcast(createEvent({ campaignId: scene.campaignId, type: "token.deleted", targetId: deleted.id, payload: deleted }));
    return deleted;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/actors", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "actor.read");
    if (allowed !== true) return allowed;
    return store.state.actors.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<Actor> }>("/api/v1/campaigns/:campaignId/actors", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "actor.create");
    if (allowed !== true) return allowed;
    const actor = createTimestamped("act", {
      campaignId: request.params.campaignId,
      systemId: request.body.systemId ?? "generic-fantasy",
      ownerUserId: request.body.ownerUserId,
      type: request.body.type ?? "character",
      name: request.body.name ?? "New Actor",
      imageAssetId: request.body.imageAssetId,
      data: request.body.data ?? { hp: { current: 10, max: 10 }, attributes: {} },
      permissions: request.body.permissions ?? {}
    }) satisfies Actor;
    store.state.actors.push(actor);
    store.save();
    hub.broadcast(createEvent({ campaignId: actor.campaignId, type: "actor.created", targetId: actor.id, payload: actor }));
    return actor;
  });

  app.patch<{ Params: { actorId: string }; Body: Partial<Actor> }>("/api/v1/actors/:actorId", async (request, reply) => {
    const actor = store.state.actors.find((item) => item.id === request.params.actorId);
    if (!actor) return notFound(reply, "Actor not found");
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const canUpdate = canCampaign(store, userId, actor.campaignId, "actor.update");
    const canUpdateOwned = actor.ownerUserId === userId && canCampaign(store, userId, actor.campaignId, "actor.updateOwned");
    if (!canUpdate && !canUpdateOwned) return forbidden(reply, "Missing permission: actor.update");
    Object.assign(actor, request.body, { updatedAt: nowIso() });
    store.save();
    hub.broadcast(createEvent({ campaignId: actor.campaignId, type: "actor.updated", targetId: actor.id, payload: actor }));
    return actor;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/items", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "actor.read");
    if (allowed !== true) return allowed;
    return store.state.items.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Record<string, unknown> }>("/api/v1/campaigns/:campaignId/items", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "actor.update");
    if (allowed !== true) return allowed;
    const item = createTimestamped("itm", {
      campaignId: request.params.campaignId,
      systemId: String(request.body.systemId ?? "generic-fantasy"),
      actorId: request.body.actorId ? String(request.body.actorId) : undefined,
      type: String(request.body.type ?? "gear"),
      name: String(request.body.name ?? "New Item"),
      data: (request.body.data as Record<string, unknown>) ?? {}
    });
    store.state.items.push(item);
    store.save();
    return item;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/journal", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!canCampaign(store, userId, request.params.campaignId, "journal.read")) return forbidden(reply, "Missing permission: journal.read");
    const canReadSecret = canCampaign(store, userId, request.params.campaignId, "journal.readSecret");
    return store.state.journals
      .filter((item) => item.campaignId === request.params.campaignId)
      .filter((item) => item.visibility === "public" || canReadSecret || item.visibleToUserIds.includes(userId));
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<JournalEntry> }>("/api/v1/campaigns/:campaignId/journal", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "journal.create");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const entry = createTimestamped("jnl", {
      campaignId: request.params.campaignId,
      parentId: request.body.parentId,
      title: request.body.title ?? "New Journal Entry",
      body: request.body.body ?? "",
      visibility: request.body.visibility ?? "gm_only",
      visibleToUserIds: request.body.visibleToUserIds ?? [],
      visibleToActorIds: request.body.visibleToActorIds ?? [],
      tags: request.body.tags ?? [],
      createdBy: userId,
      updatedBy: userId
    }) satisfies JournalEntry;
    store.state.journals.push(entry);
    store.save();
    hub.broadcast(createEvent({ campaignId: entry.campaignId, type: "journal.created", targetId: entry.id, payload: entry }));
    return entry;
  });

  app.patch<{ Params: { entryId: string }; Body: Partial<JournalEntry> }>("/api/v1/journal/:entryId", async (request, reply) => {
    const entry = store.state.journals.find((item) => item.id === request.params.entryId);
    if (!entry) return notFound(reply, "Journal entry not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, entry.campaignId, "journal.update");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    Object.assign(entry, request.body, { updatedAt: nowIso(), updatedBy: userId });
    store.save();
    hub.broadcast(createEvent({ campaignId: entry.campaignId, type: "journal.updated", targetId: entry.id, payload: entry }));
    return entry;
  });

  app.post<{ Body: { campaignId: string; formula: string; visibility?: "public" | "gm_only" | "whisper"; label?: string } }>("/api/v1/dice/roll", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.body.campaignId, "dice.roll");
    if (allowed !== true) return allowed;
    const userId = currentUserId(request.headers)!;
    const rolled = rollFormula(request.body.formula);
    const roll = createTimestamped("roll", {
      campaignId: request.body.campaignId,
      userId,
      formula: request.body.formula,
      label: request.body.label,
      visibility: request.body.visibility ?? "public",
      terms: rolled.terms,
      total: rolled.total
    });
    store.state.rolls.push(roll);
    const message = createTimestamped("msg", {
      campaignId: request.body.campaignId,
      userId,
      type: "roll" as const,
      body: `${request.body.label ? `${request.body.label}: ` : ""}${request.body.formula} = ${roll.total}`,
      visibility: roll.visibility,
      recipientUserIds: [],
      rollId: roll.id
    });
    store.state.chat.push(message);
    store.save();
    hub.broadcast(createEvent({ campaignId: roll.campaignId, type: "dice.roll.created", actorUserId: userId, targetId: roll.id, payload: roll }));
    hub.broadcast(createEvent({ campaignId: roll.campaignId, type: "chat.message.created", actorUserId: userId, targetId: message.id, payload: message }));
    return roll;
  });

  app.get<{ Querystring: { campaignId?: string } }>("/api/v1/chat/messages", async (request, reply) => {
    if (!request.query.campaignId) {
      const userId = requireUser(store, reply, request.headers);
      if (typeof userId !== "string") return userId;
      return store.state.chat.filter((item) => canCampaign(store, userId, item.campaignId, "chat.read"));
    }
    const allowed = requireCampaignPermission(store, reply, request.headers, request.query.campaignId, "chat.read");
    if (allowed !== true) return allowed;
    return store.state.chat.filter((item) => item.campaignId === request.query.campaignId);
  });

  app.post<{ Body: Partial<ChatMessage> & { campaignId: string; body: string } }>("/api/v1/chat/messages", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.body.campaignId, "chat.write");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const message = createTimestamped("msg", {
      campaignId: request.body.campaignId,
      sceneId: request.body.sceneId,
      userId,
      type: request.body.type ?? "plain",
      body: request.body.body,
      visibility: request.body.visibility ?? "public",
      recipientUserIds: request.body.recipientUserIds ?? [],
      rollId: request.body.rollId
    }) satisfies ChatMessage;
    store.state.chat.push(message);
    store.save();
    hub.broadcast(createEvent({ campaignId: message.campaignId, type: "chat.message.created", actorUserId: message.userId, targetId: message.id, payload: message }));
    return message;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/encounters", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    return store.state.encounters.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<Encounter> }>("/api/v1/campaigns/:campaignId/encounters", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "combat.manage");
    if (allowed !== true) return allowed;
    const encounter = createTimestamped("enc", {
      campaignId: request.params.campaignId,
      name: request.body.name ?? "New Encounter",
      summary: request.body.summary ?? "",
      tokenIds: request.body.tokenIds ?? [],
      difficulty: request.body.difficulty
    }) satisfies Encounter;
    store.state.encounters.push(encounter);
    store.save();
    return encounter;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/combats", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    return store.state.combats.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<Combat> }>("/api/v1/campaigns/:campaignId/combats", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "combat.manage");
    if (allowed !== true) return allowed;
    const combat = createTimestamped("cmb", {
      campaignId: request.params.campaignId,
      encounterId: request.body.encounterId,
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: request.body.combatants ?? []
    }) satisfies Combat;
    store.state.combats.push(combat);
    store.save();
    hub.broadcast(createEvent({ campaignId: combat.campaignId, type: "combat.started", targetId: combat.id, payload: combat }));
    return combat;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/proposals", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    return store.state.proposals.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<Proposal> }>("/api/v1/campaigns/:campaignId/proposals", async (request, reply) => {
    const proposalPermission: PermissionName = request.body.createdByType === "ai" || request.body.createdByType === "plugin" ? "ai.proposeChanges" : "campaign.update";
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, proposalPermission);
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const proposal = createTimestamped("prop", {
      campaignId: request.params.campaignId,
      createdByUserId: userId,
      createdByType: request.body.createdByType ?? "user",
      sourceId: request.body.sourceId,
      title: request.body.title ?? "Untitled Proposal",
      summary: request.body.summary ?? "",
      status: request.body.status ?? "pending",
      changesJson: request.body.changesJson ?? [],
      diffJson: request.body.diffJson ?? {},
      approvalRequired: request.body.approvalRequired ?? true,
      approvedByUserId: request.body.approvedByUserId
    }) satisfies Proposal;
    store.state.proposals.push(proposal);
    store.save();
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "proposal.created", targetId: proposal.id, payload: proposal }));
    return proposal;
  });

  app.post<{ Params: { proposalId: string } }>("/api/v1/proposals/:proposalId/approve", async (request, reply) => {
    const proposal = store.state.proposals.find((item) => item.id === request.params.proposalId);
    if (!proposal) return notFound(reply, "Proposal not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, proposal.campaignId, "ai.applyChanges");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const approved = approveProposal(proposal, userId);
    Object.assign(proposal, approved);
    store.save();
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "proposal.approved", targetId: proposal.id, payload: proposal }));
    return proposal;
  });

  app.post<{ Params: { proposalId: string } }>("/api/v1/proposals/:proposalId/apply", async (request, reply) => {
    const proposal = store.state.proposals.find((item) => item.id === request.params.proposalId);
    if (!proposal) return notFound(reply, "Proposal not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, proposal.campaignId, "ai.applyChanges");
    if (allowed !== true) return allowed;
    store.replace(applyProposal(store.state, proposal));
    const applied = store.state.proposals.find((item) => item.id === request.params.proposalId);
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "proposal.applied", targetId: proposal.id, payload: applied }));
    return applied;
  });

  app.post<{ Params: { campaignId: string }; Body: { prompt: string } }>("/api/v1/campaigns/:campaignId/ai/threads", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.use");
    if (allowed !== true) return allowed;
    const userId = currentUserId(request.headers)!;
    const thread = createTimestamped("thr", {
      campaignId: request.params.campaignId,
      userId,
      provider: aiProvider.id,
      title: request.body.prompt.slice(0, 80) || "AI Thread"
    });
    store.state.aiThreads.push(thread);
    const context = buildPermissionFilteredContext({
      state: store.state,
      campaignId: request.params.campaignId,
      permissions: ["campaign.read", "journal.readSecret", "ai.use", "ai.readGmMemory", "ai.proposeChanges"]
    });
    let content = "";
    for await (const event of aiProvider.stream({ threadId: thread.id, messages: [{ role: "user", content: request.body.prompt }], tools: [], context })) {
      if (event.type === "message.delta") content += event.delta;
    }
    store.save();
    hub.broadcast(createEvent({ campaignId: thread.campaignId, type: "ai.thread.started", actorUserId: userId, targetId: thread.id, payload: thread }));
    return { thread, assistantMessage: content };
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/ai/memory", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const canReadPublic = canCampaign(store, userId, request.params.campaignId, "ai.readPublicMemory");
    const canReadGm = canCampaign(store, userId, request.params.campaignId, "ai.readGmMemory");
    if (!canReadPublic && !canReadGm) return forbidden(reply, "Missing permission: ai.readPublicMemory");
    return store.state.aiMemory
      .filter((item) => item.campaignId === request.params.campaignId)
      .filter((item) => item.visibility === "public" || canReadGm);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<AiMemoryFact> & { text: string } }>("/api/v1/campaigns/:campaignId/ai/memory", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.proposeChanges");
    if (allowed !== true) return allowed;
    const fact = createTimestamped("mem", {
      campaignId: request.params.campaignId,
      text: request.body.text,
      visibility: request.body.visibility ?? "gm_only",
      sourceIds: request.body.sourceIds ?? [],
      approvedByUserId: request.body.approvedByUserId
    }) satisfies AiMemoryFact;
    store.state.aiMemory.push(fact);
    store.save();
    return fact;
  });

  app.post<{ Params: { factId: string } }>("/api/v1/ai/memory/:factId/approve", async (request, reply) => {
    const fact = store.state.aiMemory.find((item) => item.id === request.params.factId);
    if (!fact) return notFound(reply, "Memory fact not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, fact.campaignId, "ai.applyChanges");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    fact.approvedByUserId = userId;
    fact.updatedAt = nowIso();
    store.save();
    return fact;
  });

  app.post<{ Params: { campaignId: string }; Body: { transcript?: string } }>("/api/v1/campaigns/:campaignId/ai/session-recap", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.proposeChanges");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const recap = request.body.transcript?.trim()
      ? `Session recap: ${request.body.transcript.trim()}`
      : `Session recap: ${store.state.chat.filter((message) => message.campaignId === request.params.campaignId).map((message) => message.body).join(" ")}`;
    const proposal = createTimestamped("prop", {
      campaignId: request.params.campaignId,
      createdByUserId: userId,
      createdByType: "ai" as const,
      title: "Session Recap",
      summary: recap.slice(0, 500),
      status: "pending" as const,
      changesJson: [
        {
          entity: "journal" as const,
          action: "create" as const,
          data: createTimestamped("jnl", {
            campaignId: request.params.campaignId,
            title: "Session Recap",
            body: recap,
            visibility: "gm_only" as const,
            visibleToUserIds: [],
            visibleToActorIds: [],
            tags: ["ai", "recap"],
            createdBy: userId,
            updatedBy: userId
          })
        }
      ],
      diffJson: {},
      approvalRequired: true
    }) satisfies Proposal;
    const memory = createTimestamped("mem", {
      campaignId: request.params.campaignId,
      text: recap.slice(0, 240),
      visibility: "gm_only" as const,
      sourceIds: [proposal.id]
    }) satisfies AiMemoryFact;
    store.state.proposals.push(proposal);
    store.state.aiMemory.push(memory);
    store.save();
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "ai.proposal.created", targetId: proposal.id, payload: proposal }));
    return { proposal, memory };
  });

  app.post<{ Params: { campaignId: string }; Body: { prompt: string; difficulty?: string } }>("/api/v1/campaigns/:campaignId/ai/encounter-design", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.proposeChanges");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const tokenIds = store.state.tokens
      .filter((token) => store.state.scenes.some((scene) => scene.campaignId === request.params.campaignId && scene.id === token.sceneId))
      .map((token) => token.id);
    const encounter = createTimestamped("enc", {
      campaignId: request.params.campaignId,
      name: "AI Draft Encounter",
      summary: request.body.prompt,
      tokenIds,
      difficulty: request.body.difficulty ?? "standard"
    }) satisfies Encounter;
    const proposal = createTimestamped("prop", {
      campaignId: request.params.campaignId,
      createdByUserId: userId,
      createdByType: "ai" as const,
      title: "Encounter Designer Draft",
      summary: `Drafted ${encounter.difficulty} encounter: ${request.body.prompt}`,
      status: "pending" as const,
      changesJson: [{ entity: "encounter" as const, action: "create" as const, data: encounter }],
      diffJson: { tokenIds },
      approvalRequired: true
    }) satisfies Proposal;
    store.state.proposals.push(proposal);
    store.save();
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "ai.proposal.created", targetId: proposal.id, payload: proposal }));
    return { proposal, encounter };
  });

  app.get("/api/v1/plugins", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    return installedPlugins;
  });
  app.post<{ Body: (typeof installedPlugins)[number] & { campaignId?: string } }>("/api/v1/plugins/install", async (request, reply) => {
    const campaignId = request.body.campaignId ?? store.state.members.find((member) => member.userId === currentUserId(request.headers))?.campaignId;
    if (!campaignId) return forbidden(reply, "Plugin installation requires a campaign context");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "plugin.install");
    if (allowed !== true) return allowed;
    const plugin = request.body as (typeof installedPlugins)[number];
    installedPlugins.push(plugin);
    return plugin;
  });
  app.get("/api/v1/systems", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    return installedSystems;
  });
  app.post<{ Body: (typeof installedSystems)[number] & { campaignId?: string } }>("/api/v1/systems/install", async (request, reply) => {
    const campaignId = request.body.campaignId ?? store.state.members.find((member) => member.userId === currentUserId(request.headers))?.campaignId;
    if (!campaignId) return forbidden(reply, "System installation requires a campaign context");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const system = request.body as (typeof installedSystems)[number];
    installedSystems.push(system);
    return system;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/export", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    return makeArchive(store.state, request.params.campaignId);
  });

  app.post<{ Body: CampaignArchive | { archive: CampaignArchive; mode?: "upsert" | "reject_conflicts" } }>("/api/v1/import/campaign", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const payload = request.body as CampaignArchive | { archive: CampaignArchive; mode?: "upsert" | "reject_conflicts" };
    const archive = "archive" in payload ? payload.archive : payload;
    const mode = "archive" in payload ? (payload.mode ?? "upsert") : "upsert";
    if (archive.format !== "ottx") throw new Error("Unsupported archive format");

    const conflicts = findArchiveConflicts(store.state, archive);
    if (mode === "reject_conflicts" && conflicts.length > 0) {
      return reply.code(409).send({ error: "import_conflict", conflicts });
    }

    const counts = mergeArchive(store.state, archive);
    store.save();
    return { importedCampaignIds: archive.data.campaigns.map((item) => item.id), counts, conflicts };
  });

  return app;
}

function currentUserId(headers: Record<string, string | string[] | undefined>): string | undefined {
  const header = headers["x-user-id"];
  return Array.isArray(header) ? header[0] : header;
}

function userIdFromRequest(requestUrl: string | undefined, headers: Record<string, string | string[] | undefined>): string | undefined {
  const url = new URL(requestUrl ?? "/api/v1/realtime", "http://localhost");
  return url.searchParams.get("userId") ?? currentUserId(headers);
}

function requireUser(store: StateStore, reply: FastifyReply, headers: Record<string, string | string[] | undefined>): string | FastifyReply {
  const userId = currentUserId(headers);
  if (!userId) return unauthorized(reply, "Missing x-user-id session header");
  if (!store.state.users.some((user) => user.id === userId)) return unauthorized(reply, "Unknown user session");
  return userId;
}

function requireCampaignPermission(
  store: StateStore,
  reply: FastifyReply,
  headers: Record<string, string | string[] | undefined>,
  campaignId: string,
  permission: PermissionName
): true | FastifyReply {
  const userId = requireUser(store, reply, headers);
  if (typeof userId !== "string") return userId;
  if (
    !hasPermission({
      userId,
      campaignId,
      permission,
      members: store.state.members,
      grants: store.state.permissionGrants
    })
  ) {
    return forbidden(reply, `Missing permission: ${permission}`);
  }
  return true;
}

function canCampaign(
  store: StateStore,
  userId: string,
  campaignId: string,
  permission: PermissionName
): boolean {
  return hasPermission({
    userId,
    campaignId,
    permission,
    members: store.state.members,
    grants: store.state.permissionGrants
  });
}

function campaignIdForScene(store: StateStore, sceneId: string): string | undefined {
  return store.state.scenes.find((scene) => scene.id === sceneId)?.campaignId;
}

function campaignIdForToken(store: StateStore, tokenId: string): string | undefined {
  const token = store.state.tokens.find((item) => item.id === tokenId);
  return token ? campaignIdForScene(store, token.sceneId) : undefined;
}

function mergeArchive(state: EngineState, archive: CampaignArchive): Record<keyof EngineState, number> {
  return {
    users: upsertRecords(state.users, archive.data.users),
    campaigns: upsertRecords(state.campaigns, archive.data.campaigns),
    members: upsertRecords(state.members, archive.data.members),
    worlds: upsertRecords(state.worlds, archive.data.worlds),
    scenes: upsertRecords(state.scenes, archive.data.scenes),
    assets: upsertRecords(state.assets, archive.data.assets),
    tokens: upsertRecords(state.tokens, archive.data.tokens),
    actors: upsertRecords(state.actors, archive.data.actors),
    items: upsertRecords(state.items, archive.data.items),
    journals: upsertRecords(state.journals, archive.data.journals),
    handouts: upsertRecords(state.handouts, archive.data.handouts),
    chat: upsertRecords(state.chat, archive.data.chat),
    rolls: upsertRecords(state.rolls, archive.data.rolls),
    encounters: upsertRecords(state.encounters, archive.data.encounters),
    combats: upsertRecords(state.combats, archive.data.combats),
    compendia: upsertRecords(state.compendia, archive.data.compendia),
    proposals: upsertRecords(state.proposals, archive.data.proposals),
    aiThreads: upsertRecords(state.aiThreads, archive.data.aiThreads),
    aiMemory: upsertRecords(state.aiMemory, archive.data.aiMemory),
    aiToolCalls: upsertRecords(state.aiToolCalls, archive.data.aiToolCalls),
    auditLogs: upsertRecords(state.auditLogs, archive.data.auditLogs),
    permissionGrants: upsertRecords(state.permissionGrants, archive.data.permissionGrants)
  };
}

function findArchiveConflicts(state: EngineState, archive: CampaignArchive): Array<{ collection: keyof EngineState; id: string }> {
  const conflicts: Array<{ collection: keyof EngineState; id: string }> = [];
  for (const collection of Object.keys(archive.data) as Array<keyof EngineState>) {
    const target = state[collection] as Array<{ id: string }>;
    const incoming = archive.data[collection] as Array<{ id: string }>;
    for (const record of incoming) {
      if (target.some((item) => item.id === record.id)) conflicts.push({ collection, id: record.id });
    }
  }
  return conflicts;
}

function upsertRecords<T extends { id: string }>(target: T[], incoming: T[]): number {
  for (const record of incoming) {
    const index = target.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      target[index] = record;
    } else {
      target.push(record);
    }
  }
  return incoming.length;
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: "not_found", message });
}

function unauthorized(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(401).send({ error: "unauthorized", message });
}

function forbidden(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(403).send({ error: "forbidden", message });
}
