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
  makeArchive,
  nowIso,
  type Actor,
  type AiMemoryFact,
  type Campaign,
  type ChatMessage,
  type Combat,
  type Encounter,
  type JournalEntry,
  type MapAsset,
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

  app.get("/api/v1/auth/session", async (request) => {
    const userId = currentUserId(request.headers);
    return {
      user: store.state.users.find((user) => user.id === userId) ?? store.state.users[0],
      memberships: store.state.members.filter((member) => member.userId === userId)
    };
  });

  app.get("/api/v1/realtime", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/api/v1/realtime", "http://localhost");
    const client = {
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      send: (data: string) => socket.send(data)
    };
    hub.add(client);
    socket.on("close", () => hub.remove(client));
  });

  app.get("/api/v1/campaigns", async () => store.state.campaigns);

  app.post<{ Body: Partial<Campaign> }>("/api/v1/campaigns", async (request) => {
    const userId = currentUserId(request.headers);
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
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    return campaign;
  });

  app.patch<{ Params: { campaignId: string }; Body: Partial<Campaign> }>("/api/v1/campaigns/:campaignId", async (request, reply) => {
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    Object.assign(campaign, request.body, { updatedAt: nowIso() });
    store.save();
    return campaign;
  });

  app.delete<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId", async (request, reply) => {
    const index = store.state.campaigns.findIndex((item) => item.id === request.params.campaignId);
    if (index < 0) return notFound(reply, "Campaign not found");
    const deleted = store.state.campaigns.splice(index, 1)[0]!;
    store.save();
    return deleted;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/scenes", async (request) =>
    store.state.scenes.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<Scene> }>("/api/v1/campaigns/:campaignId/scenes", async (request) => {
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/assets", async (request) =>
    store.state.assets.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<MapAsset> }>("/api/v1/campaigns/:campaignId/assets", async (request) => {
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
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) return notFound(reply, "Scene not found");
    return scene;
  });

  app.patch<{ Params: { sceneId: string }; Body: Partial<Scene> }>("/api/v1/scenes/:sceneId", async (request, reply) => {
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) return notFound(reply, "Scene not found");
    Object.assign(scene, request.body, { updatedAt: nowIso() });
    store.save();
    hub.broadcast(createEvent({ campaignId: scene.campaignId, type: scene.active ? "scene.activated" : "scene.updated", targetId: scene.id, payload: scene }));
    return scene;
  });

  app.post<{ Params: { sceneId: string }; Body: { x: number; y: number; radius?: number; hidden?: boolean } }>("/api/v1/scenes/:sceneId/fog", async (request, reply) => {
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) return notFound(reply, "Scene not found");
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
    const index = store.state.scenes.findIndex((item) => item.id === request.params.sceneId);
    if (index < 0) return notFound(reply, "Scene not found");
    const deleted = store.state.scenes.splice(index, 1)[0]!;
    store.save();
    hub.broadcast(createEvent({ campaignId: deleted.campaignId, type: "scene.deleted", targetId: deleted.id, payload: deleted }));
    return deleted;
  });

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId/tokens", async (request) =>
    store.state.tokens.filter((item) => item.sceneId === request.params.sceneId)
  );

  app.post<{ Params: { sceneId: string }; Body: Partial<Token> }>("/api/v1/scenes/:sceneId/tokens", async (request, reply) => {
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId);
    if (!scene) return notFound(reply, "Scene not found");
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
    const index = store.state.tokens.findIndex((item) => item.id === request.params.tokenId);
    if (index < 0) return notFound(reply, "Token not found");
    const deleted = store.state.tokens.splice(index, 1)[0]!;
    store.save();
    const scene = store.state.scenes.find((item) => item.id === deleted.sceneId);
    if (scene) hub.broadcast(createEvent({ campaignId: scene.campaignId, type: "token.deleted", targetId: deleted.id, payload: deleted }));
    return deleted;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/actors", async (request) =>
    store.state.actors.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<Actor> }>("/api/v1/campaigns/:campaignId/actors", async (request) => {
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
    Object.assign(actor, request.body, { updatedAt: nowIso() });
    store.save();
    hub.broadcast(createEvent({ campaignId: actor.campaignId, type: "actor.updated", targetId: actor.id, payload: actor }));
    return actor;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/items", async (request) =>
    store.state.items.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Record<string, unknown> }>("/api/v1/campaigns/:campaignId/items", async (request) => {
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/journal", async (request) =>
    store.state.journals.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<JournalEntry> }>("/api/v1/campaigns/:campaignId/journal", async (request) => {
    const userId = currentUserId(request.headers);
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
    Object.assign(entry, request.body, { updatedAt: nowIso(), updatedBy: currentUserId(request.headers) });
    store.save();
    hub.broadcast(createEvent({ campaignId: entry.campaignId, type: "journal.updated", targetId: entry.id, payload: entry }));
    return entry;
  });

  app.post<{ Body: { campaignId: string; formula: string; visibility?: "public" | "gm_only" | "whisper"; label?: string } }>("/api/v1/dice/roll", async (request) => {
    const userId = currentUserId(request.headers);
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

  app.get<{ Querystring: { campaignId?: string } }>("/api/v1/chat/messages", async (request) =>
    request.query.campaignId ? store.state.chat.filter((item) => item.campaignId === request.query.campaignId) : store.state.chat
  );

  app.post<{ Body: Partial<ChatMessage> & { campaignId: string; body: string } }>("/api/v1/chat/messages", async (request) => {
    const message = createTimestamped("msg", {
      campaignId: request.body.campaignId,
      sceneId: request.body.sceneId,
      userId: currentUserId(request.headers),
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/encounters", async (request) =>
    store.state.encounters.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<Encounter> }>("/api/v1/campaigns/:campaignId/encounters", async (request) => {
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/combats", async (request) =>
    store.state.combats.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<Combat> }>("/api/v1/campaigns/:campaignId/combats", async (request) => {
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/proposals", async (request) =>
    store.state.proposals.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<Proposal> }>("/api/v1/campaigns/:campaignId/proposals", async (request) => {
    const proposal = createTimestamped("prop", {
      campaignId: request.params.campaignId,
      createdByUserId: currentUserId(request.headers),
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
    const approved = approveProposal(proposal, currentUserId(request.headers));
    Object.assign(proposal, approved);
    store.save();
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "proposal.approved", targetId: proposal.id, payload: proposal }));
    return proposal;
  });

  app.post<{ Params: { proposalId: string } }>("/api/v1/proposals/:proposalId/apply", async (request, reply) => {
    const proposal = store.state.proposals.find((item) => item.id === request.params.proposalId);
    if (!proposal) return notFound(reply, "Proposal not found");
    store.replace(applyProposal(store.state, proposal));
    const applied = store.state.proposals.find((item) => item.id === request.params.proposalId);
    hub.broadcast(createEvent({ campaignId: proposal.campaignId, type: "proposal.applied", targetId: proposal.id, payload: applied }));
    return applied;
  });

  app.post<{ Params: { campaignId: string }; Body: { prompt: string } }>("/api/v1/campaigns/:campaignId/ai/threads", async (request) => {
    const userId = currentUserId(request.headers);
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/ai/memory", async (request) =>
    store.state.aiMemory.filter((item) => item.campaignId === request.params.campaignId)
  );

  app.post<{ Params: { campaignId: string }; Body: Partial<AiMemoryFact> & { text: string } }>("/api/v1/campaigns/:campaignId/ai/memory", async (request) => {
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
    fact.approvedByUserId = currentUserId(request.headers);
    fact.updatedAt = nowIso();
    store.save();
    return fact;
  });

  app.post<{ Params: { campaignId: string }; Body: { transcript?: string } }>("/api/v1/campaigns/:campaignId/ai/session-recap", async (request) => {
    const recap = request.body.transcript?.trim()
      ? `Session recap: ${request.body.transcript.trim()}`
      : `Session recap: ${store.state.chat.filter((message) => message.campaignId === request.params.campaignId).map((message) => message.body).join(" ")}`;
    const proposal = createTimestamped("prop", {
      campaignId: request.params.campaignId,
      createdByUserId: currentUserId(request.headers),
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
            createdBy: currentUserId(request.headers),
            updatedBy: currentUserId(request.headers)
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

  app.post<{ Params: { campaignId: string }; Body: { prompt: string; difficulty?: string } }>("/api/v1/campaigns/:campaignId/ai/encounter-design", async (request) => {
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
      createdByUserId: currentUserId(request.headers),
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

  app.get("/api/v1/plugins", async () => installedPlugins);
  app.post("/api/v1/plugins/install", async (request) => {
    const plugin = request.body as (typeof installedPlugins)[number];
    installedPlugins.push(plugin);
    return plugin;
  });
  app.get("/api/v1/systems", async () => installedSystems);
  app.post("/api/v1/systems/install", async (request) => {
    const system = request.body as (typeof installedSystems)[number];
    installedSystems.push(system);
    return system;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/export", async (request) => makeArchive(store.state, request.params.campaignId));

  app.post<{ Body: { data?: unknown } }>("/api/v1/import/campaign", async (request) => {
    const archive = request.body as ReturnType<typeof makeArchive>;
    if (archive.format !== "ottx") throw new Error("Unsupported archive format");
    store.state.campaigns.push(...archive.data.campaigns);
    store.state.members.push(...archive.data.members);
    store.state.worlds.push(...archive.data.worlds);
    store.state.scenes.push(...archive.data.scenes);
    store.state.assets.push(...archive.data.assets);
    store.state.tokens.push(...archive.data.tokens);
    store.state.actors.push(...archive.data.actors);
    store.state.items.push(...archive.data.items);
    store.state.journals.push(...archive.data.journals);
    store.state.handouts.push(...archive.data.handouts);
    store.state.chat.push(...archive.data.chat);
    store.state.rolls.push(...archive.data.rolls);
    store.state.encounters.push(...archive.data.encounters);
    store.state.combats.push(...archive.data.combats);
    store.state.proposals.push(...archive.data.proposals);
    store.save();
    return { importedCampaignIds: archive.data.campaigns.map((item) => item.id) };
  });

  return app;
}

function currentUserId(headers: Record<string, string | string[] | undefined>): string {
  const header = headers["x-user-id"];
  return Array.isArray(header) ? (header[0] ?? "usr_demo_gm") : (header ?? "usr_demo_gm");
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: "not_found", message });
}
