import type { Campaign, Scene } from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StateStore } from "./store.js";

export function registerPlayerPreviewRoutes<TSnapshot>(app: FastifyInstance, dependencies: {
  store: StateStore;
  requirePreviewAccess(reply: FastifyReply, headers: FastifyRequest["headers"], scene: Scene): true | FastifyReply;
  canReadScene(userId: string, scene: Scene): boolean;
  canReadCampaign(userId: string, campaignId: string): boolean;
  isActiveUserId(userId: string): boolean;
  requesterUserId(headers: FastifyRequest["headers"]): string;
  snapshot(userId: string, campaign: Campaign, sceneId: string, requesterUserId: string): TSnapshot;
}): void {
  app.get<{ Params: { sceneId: string }; Querystring: { userId?: string } }>("/api/v1/scenes/:sceneId/player-preview", async (request, reply) => {
    const scene = dependencies.store.state.scenes.find((candidate) => candidate.id === request.params.sceneId);
    if (!scene) return reply.code(404).send({ error: "not_found", message: "Scene not found" });
    const allowed = dependencies.requirePreviewAccess(reply, request.headers, scene);
    if (allowed !== true) return allowed;
    const userId = request.query.userId?.trim();
    if (!userId) return reply.code(400).send({ error: "bad_request", message: "Choose a player to preview" });
    const member = dependencies.store.state.members.find((candidate) => candidate.campaignId === scene.campaignId && candidate.userId === userId && candidate.role === "player");
    const campaign = dependencies.store.state.campaigns.find((candidate) => candidate.id === scene.campaignId);
    const user = member && dependencies.store.state.users.find((candidate) => candidate.id === userId);
    if (!campaign || !user || (campaign.organizationId && !dependencies.store.state.organizationMembers.some((candidate) => candidate.organizationId === campaign.organizationId && candidate.userId === userId) && !dependencies.store.state.organizations.some((organization) => organization.id === campaign.organizationId && organization.ownerUserId === userId)) || !dependencies.isActiveUserId(userId) || !dependencies.canReadCampaign(userId, scene.campaignId) || !dependencies.canReadScene(userId, scene)) {
      return reply.code(404).send({ error: "not_found", message: "Player preview unavailable" });
    }
    reply.header("Cache-Control", "no-store");
    return { readOnly: true as const, player: { id: user.id, displayName: user.displayName }, snapshot: dependencies.snapshot(userId, campaign, scene.id, dependencies.requesterUserId(request.headers)) };
  });
}
