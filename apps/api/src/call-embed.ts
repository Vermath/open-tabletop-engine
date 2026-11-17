import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Optional voice and video by embedding a service the operator already runs
 * or trusts (Jitsi, LiveKit Meet, or anything else that works in a frame).
 *
 * OpenTabletop carries no media and holds no provider credentials. The
 * operator configures a room URL; a campaign member asks for their campaign's
 * room and the web client embeds it only after that member chooses to join.
 * Off unless OTTE_CALL_EMBED_URL is set.
 */
export const callEmbedUrlEnv = "OTTE_CALL_EMBED_URL";
export const callRoomSecretEnv = "OTTE_CALL_ROOM_SECRET";
export const callProviderNameEnv = "OTTE_CALL_PROVIDER_NAME";

const roomPlaceholder = "{room}";
const minimumRoomSecretLength = 32;
const maximumProviderNameLength = 40;

export type CallEmbedConfig =
  | { status: "off" }
  | { status: "invalid"; reason: string }
  | { status: "on"; provider: string; origin: string; template: string; secret?: string };

export type CampaignCallResponse =
  | { enabled: false }
  | { enabled: true; provider: string; origin: string; url: string };

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Reads and validates the operator's call settings. Anything that is not a
 * complete, safe configuration is reported as invalid and treated as off, so
 * a typo can never embed an unintended page.
 */
export function resolveCallEmbedConfig(env: Record<string, string | undefined>): CallEmbedConfig {
  const template = env[callEmbedUrlEnv]?.trim();
  if (!template) return { status: "off" };

  const unknownPlaceholder = template.replaceAll(roomPlaceholder, "").match(/[{}]/);
  if (unknownPlaceholder) return { status: "invalid", reason: `${callEmbedUrlEnv} supports only the ${roomPlaceholder} placeholder` };

  let url: URL;
  let other: URL;
  try {
    url = new URL(template.replaceAll(roomPlaceholder, "a"));
    other = new URL(template.replaceAll(roomPlaceholder, "b"));
  } catch {
    return { status: "invalid", reason: `${callEmbedUrlEnv} must be an absolute HTTPS URL` };
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    return { status: "invalid", reason: `${callEmbedUrlEnv} must use HTTPS outside loopback development` };
  }
  if (url.username || url.password || url.hostname.includes("*")) {
    return { status: "invalid", reason: `${callEmbedUrlEnv} must be a credential-free, non-wildcard URL` };
  }
  // The embedded origin is what the content security policy allows, so it must not vary by room.
  if (url.origin !== other.origin) {
    return { status: "invalid", reason: `${callEmbedUrlEnv} may use ${roomPlaceholder} in the path, query or fragment, not in the host` };
  }

  const usesRoom = template.includes(roomPlaceholder);
  const secret = env[callRoomSecretEnv]?.trim();
  if (usesRoom && (!secret || secret.length < minimumRoomSecretLength)) {
    return { status: "invalid", reason: `${callRoomSecretEnv} must be at least ${minimumRoomSecretLength} characters when ${callEmbedUrlEnv} uses ${roomPlaceholder}` };
  }

  const configuredName = env[callProviderNameEnv]?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const provider = (configuredName || url.hostname).slice(0, maximumProviderNameLength);
  return { status: "on", provider, origin: url.origin, template, ...(usesRoom && secret ? { secret } : {}) };
}

/**
 * The room name for a campaign: stable, different for every campaign, and
 * not derivable without the server's secret. The provider never sees a
 * campaign id, and knowing one does not reveal its room.
 */
export function callRoomId(secret: string, campaignId: string): string {
  return createHmac("sha256", secret).update(`otte-call-room:${campaignId}`, "utf8").digest("hex").slice(0, 32);
}

export function campaignCallResponse(config: CallEmbedConfig, campaignId: string): CampaignCallResponse {
  if (config.status !== "on") return { enabled: false };
  const url = config.secret ? config.template.replaceAll(roomPlaceholder, callRoomId(config.secret, campaignId)) : config.template;
  return { enabled: true, provider: config.provider, origin: config.origin, url };
}

export function registerCallEmbedRoutes(app: FastifyInstance, dependencies: {
  /** Explicit permission check: the caller must be able to read this campaign. */
  requireCampaignRead(reply: FastifyReply, headers: FastifyRequest["headers"], campaignId: string): true | FastifyReply;
  campaignExists(campaignId: string): boolean;
  env?: () => Record<string, string | undefined>;
  warn?: (message: string) => void;
}): void {
  let lastWarning: string | undefined;
  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/call", async (request, reply) => {
    const allowed = dependencies.requireCampaignRead(reply, request.headers, request.params.campaignId);
    if (allowed !== true) return allowed;
    if (!dependencies.campaignExists(request.params.campaignId)) return reply.code(404).send({ error: "not_found", message: "Campaign not found" });
    const config = resolveCallEmbedConfig((dependencies.env ?? (() => process.env))());
    if (config.status === "invalid" && config.reason !== lastWarning) {
      lastWarning = config.reason;
      (dependencies.warn ?? ((message) => app.log.warn(message)))(`Call embed is off: ${config.reason}`);
    }
    reply.header("Cache-Control", "no-store");
    return campaignCallResponse(config, request.params.campaignId);
  });
}
