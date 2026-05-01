export const apiVersion = "v1";

export const routes = {
  health: "/api/v1/health",
  session: "/api/v1/auth/session",
  campaigns: "/api/v1/campaigns",
  campaign: (campaignId: string) => `/api/v1/campaigns/${campaignId}`,
  scenes: (campaignId: string) => `/api/v1/campaigns/${campaignId}/scenes`,
  assets: (campaignId: string) => `/api/v1/campaigns/${campaignId}/assets`,
  scene: (sceneId: string) => `/api/v1/scenes/${sceneId}`,
  tokens: (sceneId: string) => `/api/v1/scenes/${sceneId}/tokens`,
  token: (tokenId: string) => `/api/v1/tokens/${tokenId}`,
  actors: (campaignId: string) => `/api/v1/campaigns/${campaignId}/actors`,
  actor: (actorId: string) => `/api/v1/actors/${actorId}`,
  items: (campaignId: string) => `/api/v1/campaigns/${campaignId}/items`,
  journals: (campaignId: string) => `/api/v1/campaigns/${campaignId}/journal`,
  journal: (entryId: string) => `/api/v1/journal/${entryId}`,
  chat: "/api/v1/chat/messages",
  dice: "/api/v1/dice/roll",
  encounters: (campaignId: string) => `/api/v1/campaigns/${campaignId}/encounters`,
  combats: (campaignId: string) => `/api/v1/campaigns/${campaignId}/combats`,
  proposals: (campaignId: string) => `/api/v1/campaigns/${campaignId}/proposals`,
  proposal: (proposalId: string) => `/api/v1/proposals/${proposalId}`,
  aiThreads: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/threads`,
  aiMemory: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/memory`,
  aiSessionRecap: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/session-recap`,
  aiEncounterDesign: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/encounter-design`,
  systems: "/api/v1/systems",
  plugins: "/api/v1/plugins",
  exportCampaign: (campaignId: string) => `/api/v1/campaigns/${campaignId}/export`,
  importCampaign: "/api/v1/import/campaign"
} as const;

const endpointSpecs = [
  ["GET", routes.health],
  ["GET", routes.campaigns],
  ["POST", routes.campaigns],
  ["GET", "/api/v1/campaigns/{campaignId}"],
  ["PATCH", "/api/v1/campaigns/{campaignId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/scenes"],
  ["POST", "/api/v1/campaigns/{campaignId}/scenes"],
  ["GET", "/api/v1/scenes/{sceneId}"],
  ["PATCH", "/api/v1/scenes/{sceneId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}"],
  ["GET", "/api/v1/scenes/{sceneId}/tokens"],
  ["POST", "/api/v1/scenes/{sceneId}/tokens"],
  ["PATCH", "/api/v1/tokens/{tokenId}"],
  ["DELETE", "/api/v1/tokens/{tokenId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/actors"],
  ["POST", "/api/v1/campaigns/{campaignId}/actors"],
  ["GET", "/api/v1/campaigns/{campaignId}/journal"],
  ["POST", "/api/v1/campaigns/{campaignId}/journal"],
  ["POST", routes.dice],
  ["POST", routes.chat],
  ["GET", routes.chat],
  ["GET", routes.plugins],
  ["POST", "/api/v1/plugins/install"],
  ["GET", routes.systems],
  ["POST", "/api/v1/systems/install"]
] as const;

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OpenTabletop Engine API",
    version: "0.1.0"
  },
  paths: Object.fromEntries(
    endpointSpecs.map(([method, path]) => [
      path,
      {
        [method.toLowerCase()]: {
          responses: {
            "200": {
              description: "OK"
            }
          }
        }
      }
    ])
  )
};
