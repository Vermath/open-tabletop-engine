
export type CampaignPermissionTemplateId = "standard" | "player_authoring" | "ai_assisted" | "assistant_ops";


export const campaignPermissionTemplates: Array<{ id: CampaignPermissionTemplateId; label: string; description: string }> = [
  { id: "standard", label: "Standard table", description: "Role defaults only; players can play assigned characters without prep permissions." },
  { id: "player_authoring", label: "Player authoring", description: "Players can create actors, journal entries, and tokens for collaborative prep." },
  { id: "ai_assisted", label: "AI-assisted players", description: "Players keep standard play rights and can draft AI proposals for GM review." },
  { id: "assistant_ops", label: "Assistant GM ops", description: "Assistant GMs gain moderation and plugin setup permissions for shared administration." }
];


export const identityProviderSetupGuides = [
  {
    id: "okta",
    name: "Okta",
    oidc: "Create an OIDC web app, add the API callback URL, allow authorization-code flow, and copy issuer, client id, and client secret into OTTE_OIDC_*.",
    scim: "Create a SCIM 2.0 app integration, set the base URL to /api/v1/scim/v2, use bearer token auth, then map Okta groups to campaign roles below."
  },
  {
    id: "entra",
    name: "Microsoft Entra ID",
    oidc: "Register a web application, add the API callback URL as a web redirect URI, issue a client secret, and use the tenant v2.0 issuer.",
    scim: "Use enterprise app provisioning with bearer token auth, point tenant URL at /api/v1/scim/v2, and map Entra groups by display name or external id."
  },
  {
    id: "google",
    name: "Google Workspace",
    oidc: "Create an OAuth web client, add the API callback URL, and use Google's accounts issuer with the generated client id and secret.",
    scim: "Google Workspace does not provide generic SCIM for all editions; use an identity bridge or map groups from a SCIM-capable directory."
  },
  {
    id: "generic",
    name: "Generic OIDC/SCIM",
    oidc: "Use issuer discovery, authorization-code callback to /api/v1/auth/oidc/callback, and a browser return origin matching OTTE_WEB_ORIGIN.",
    scim: "Provision users and groups through /api/v1/scim/v2/Users and /api/v1/scim/v2/Groups with the OTTE_SCIM_BEARER_TOKEN bearer credential."
  }
] as const;
