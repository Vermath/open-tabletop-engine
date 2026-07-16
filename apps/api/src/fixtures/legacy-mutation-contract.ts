import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { EngineState } from "@open-tabletop/core";
import { pluginRegistryRevision } from "../plugin-system-operator.js";
import type { PluginRuntimeRegistry } from "../plugin-runtime.js";
import type { StateStore } from "../store.js";

type LegacyInjectRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  payload?: unknown;
};

type RevisionRecord = { id: string; updatedAt: string };
type RevisionRequirement = { record: RevisionRecord; field: string };
type LegacyMutationContractAdapterOptions = {
  addIdempotencyKeys?: boolean;
  pluginRegistry?: PluginRuntimeRegistry;
};

let legacyMutationSequence = 0;
const legacyRevisionByReplayKey = new Map<string, string>();

/**
 * Keeps the pre-hardening integration suite focused on its original behavior
 * while sending the exact current revision required by shared-state routes.
 * Dedicated concurrency/route-contract suites use buildApp directly and are
 * therefore never adapted. Explicit keys and revisions, including empty or
 * stale values, are preserved so negative tests remain meaningful.
 */
export function installLegacyMutationContractAdapter(
  app: FastifyInstance,
  store: StateStore,
  options: LegacyMutationContractAdapterOptions = {},
): void {
  const inject = app.inject.bind(app);
  const revisionByReplayKey = legacyRevisionByReplayKey;
  const adaptedInject = (request: LegacyInjectRequest) => {
    if (!request || typeof request !== "object" || !request.url)
      return inject(request as never);
    const method = (request.method ?? "GET").toUpperCase();
    const parsed = new URL(request.url, "http://legacy-test.local");
    const pathname = parsed.pathname;
    if (
      !isMutation(method) ||
      pathname.includes("/ai/") ||
      pathname.startsWith("/api/v1/ai/") ||
      pathname.startsWith("/api/v1/agent/")
    ) {
      return inject(request as never);
    }

    const headers = { ...(request.headers ?? {}) };
    const suppliedIdempotencyKey = headerText(headers, "idempotency-key");
    if (
      options.addIdempotencyKeys !== false &&
      !hasHeader(headers, "idempotency-key")
    ) {
      headers["idempotency-key"] =
        `legacy-app-test-${++legacyMutationSequence}`;
    }

    let url = request.url;
    let payload = request.payload;
    if (
      method === "POST" &&
      pathname === "/api/v1/import/campaign" &&
      isBodyRecord(payload) &&
      !Object.prototype.hasOwnProperty.call(payload, "archive")
    ) {
      const campaignId = archiveCampaignId(payload);
      if (campaignId && stateCampaignById(store.state, campaignId)) payload = { archive: payload };
    }
    if (
      method === "POST" &&
      (pathname === "/api/v1/plugins/registry/sync" ||
        pathname === "/api/v1/admin/plugins/registry/sync") &&
      options.pluginRegistry &&
      isBodyRecord(payload) &&
      !Object.prototype.hasOwnProperty.call(payload, "expectedRegistryRevision")
    ) {
      payload = {
        ...payload,
        expectedRegistryRevision: pluginRegistryRevision(
          options.pluginRegistry.listPackages(),
        ),
      };
    }
    const pluginReviewMatch =
      method === "PATCH"
        ? /^\/api\/v1\/admin\/plugins\/reviews\/([^/]+)$/.exec(pathname)
        : undefined;
    if (
      pluginReviewMatch &&
      isBodyRecord(payload) &&
      !Object.prototype.hasOwnProperty.call(payload, "expectedUpdatedAt")
    ) {
      const reviewKey = decodeURIComponent(pluginReviewMatch[1]!);
      const review = statePluginReviewByKey(store.state, reviewKey);
      if (review) payload = { ...payload, expectedUpdatedAt: review.updatedAt };
    }
    if (
      method === "DELETE" &&
      !pathname.endsWith("/advancement/pending") &&
      !pathname.startsWith("/api/v1/admin/scim/group-role-mappings/") &&
      !parsed.searchParams.has("expectedUpdatedAt") &&
      isBodyRecord(payload) &&
      Object.prototype.hasOwnProperty.call(payload, "expectedUpdatedAt")
    ) {
      parsed.searchParams.set(
        "expectedUpdatedAt",
        String(payload.expectedUpdatedAt ?? ""),
      );
      const { expectedUpdatedAt: _expectedUpdatedAt, ...remainingPayload } =
        payload;
      payload =
        Object.keys(remainingPayload).length > 0 ? remainingPayload : undefined;
      url = `${parsed.pathname}${parsed.search}`;
    }
    const replayScope = suppliedIdempotencyKey?.trim()
      ? `${method} ${parsed.pathname}${parsed.search} ${suppliedIdempotencyKey}`
      : undefined;
    const uploadScene = assetUploadSceneRevision(
      store.state,
      method,
      pathname,
      parsed,
    );
    if (uploadScene && !parsed.searchParams.has("expectedSceneUpdatedAt")) {
      const replayRevisionKey = replayScope
        ? `${replayScope} expectedSceneUpdatedAt`
        : undefined;
      const expectedSceneUpdatedAt = replayRevisionKey
        ? (revisionByReplayKey.get(replayRevisionKey) ?? uploadScene.updatedAt)
        : uploadScene.updatedAt;
      if (replayRevisionKey && !revisionByReplayKey.has(replayRevisionKey)) {
        revisionByReplayKey.set(replayRevisionKey, expectedSceneUpdatedAt);
      }
      parsed.searchParams.set("expectedSceneUpdatedAt", expectedSceneUpdatedAt);
      url = `${parsed.pathname}${parsed.search}`;
    }
    const fogPresetScene = fogPresetSourceSceneRevision(
      store.state,
      method,
      pathname,
      payload,
    );
    if (
      fogPresetScene &&
      isBodyRecord(payload) &&
      !Object.prototype.hasOwnProperty.call(payload, "expectedSceneUpdatedAt")
    ) {
      payload = {
        ...payload,
        expectedSceneUpdatedAt: fogPresetScene.updatedAt,
      };
    }

    const requirement =
      specializedMutationRevision(
        store.state,
        method,
        pathname,
        payload,
        headers,
      ) ?? sharedMutationRevision(store.state, method, pathname, payload);
    if (requirement) {
      const { record: revision, field } = requirement;
      const bodyHasRevision =
        isBodyRecord(payload) &&
        Object.prototype.hasOwnProperty.call(payload, field);
      const queryHasRevision = parsed.searchParams.has(field);
      if (!bodyHasRevision && !(method === "DELETE" && queryHasRevision)) {
        const replayRevisionKey = replayScope
          ? `${replayScope} ${field}`
          : undefined;
        const explicitQueryRevision = queryHasRevision
          ? (parsed.searchParams.get(field) ?? "")
          : undefined;
        const expectedUpdatedAt =
          explicitQueryRevision ??
          (replayRevisionKey
            ? (revisionByReplayKey.get(replayRevisionKey) ?? revision.updatedAt)
            : revision.updatedAt);
        if (replayRevisionKey && !revisionByReplayKey.has(replayRevisionKey)) {
          revisionByReplayKey.set(replayRevisionKey, expectedUpdatedAt);
        }
        if (
          method === "DELETE" ||
          (payload !== undefined && !isBodyRecord(payload))
        ) {
          parsed.searchParams.set(field, expectedUpdatedAt);
          url = `${parsed.pathname}${parsed.search}`;
        } else {
          payload = {
            ...(isBodyRecord(payload) ? payload : {}),
            [field]: expectedUpdatedAt,
          };
        }
      }
    }

    const adaptedRequest: LegacyInjectRequest = { ...request, url, headers };
    if (payload === undefined) delete adaptedRequest.payload;
    else adaptedRequest.payload = payload;
    return inject(adaptedRequest as never);
  };
  app.inject = adaptedInject as typeof app.inject;
}

function statePluginReviewByKey(
  state: EngineState,
  reviewKey: string,
): RevisionRecord | undefined {
  return state.pluginReviews.find((review) => review.reviewKey === reviewKey);
}

function isMutation(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function hasHeader(headers: Record<string, unknown>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

function headerText(
  headers: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  )?.[1];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function isBodyRecord(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Buffer.isBuffer(value)
  );
}

function assetUploadSceneRevision(
  state: EngineState,
  method: string,
  pathname: string,
  url: URL,
): RevisionRecord | undefined {
  if (
    method !== "POST" ||
    !/^\/api\/v1\/campaigns\/[^/]+\/assets\/upload$/.test(pathname)
  )
    return undefined;
  const setAsBackground = url.searchParams.get("setAsBackground");
  if (
    setAsBackground !== "1" &&
    setAsBackground !== "true" &&
    setAsBackground !== "yes"
  )
    return undefined;
  const sceneId = url.searchParams.get("sceneId");
  const campaignId = /^\/api\/v1\/campaigns\/([^/]+)\/assets\/upload$/.exec(
    pathname,
  )?.[1];
  if (!sceneId || !campaignId) return undefined;
  return state.scenes.find(
    (scene) =>
      scene.id === sceneId &&
      scene.campaignId === decodeURIComponent(campaignId),
  );
}

function fogPresetSourceSceneRevision(
  state: EngineState,
  method: string,
  pathname: string,
  payload: unknown,
): RevisionRecord | undefined {
  if (
    method !== "POST" ||
    !/^\/api\/v1\/campaigns\/[^/]+\/fog-presets$/.test(pathname) ||
    !isBodyRecord(payload)
  )
    return undefined;
  const sceneId =
    typeof payload.sceneId === "string" ? payload.sceneId : undefined;
  return sceneId
    ? state.scenes.find((scene) => scene.id === sceneId)
    : undefined;
}

function specializedMutationRevision(
  state: EngineState,
  method: string,
  pathname: string,
  payload: unknown,
  headers: Record<string, unknown>,
): RevisionRequirement | undefined {
  if (
    method === "PATCH" &&
    pathname === "/api/v1/organization/workspace-defaults"
  ) {
    const workspace = organizationWorkspaceForHeaders(state, headers);
    return workspace
      ? { record: workspace, field: "expectedUpdatedAt" }
      : undefined;
  }
  if (method === "POST" && pathname === "/api/v1/organization/members") {
    const workspace = organizationWorkspaceForHeaders(state, headers);
    return workspace
      ? { record: workspace, field: "expectedOrganizationUpdatedAt" }
      : undefined;
  }
  if (
    method === "POST" &&
    pathname === "/api/v1/organization/invites" &&
    isBodyRecord(payload) &&
    typeof payload.campaignId === "string"
  ) {
    const campaign = state.campaigns.find(
      (candidate) => candidate.id === payload.campaignId,
    );
    return campaign
      ? { record: campaign, field: "expectedCampaignUpdatedAt" }
      : undefined;
  }
  if (
    method === "POST" &&
    pathname === "/api/v1/import/campaign" &&
    isBodyRecord(payload) &&
    isBodyRecord(payload.archive)
  ) {
    const campaignId = archiveCampaignId(payload.archive);
    const campaign = campaignId ? stateCampaignById(state, campaignId) : undefined;
    return campaign ? { record: campaign, field: "expectedUpdatedAt" } : undefined;
  }
  if (
    method === "POST" &&
    pathname === "/api/v1/invites/accept" &&
    isBodyRecord(payload) &&
    typeof payload.token === "string"
  ) {
    const tokenHash = `sha256:${createHash("sha256").update(payload.token).digest("hex")}`;
    const invite = state.invites.find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return invite ? { record: invite, field: "expectedUpdatedAt" } : undefined;
  }
  const storageMatch =
    /^\/api\/v1\/campaigns\/([^/]+)\/plugins\/([^/]+)\/storage\/([^/]+)$/.exec(
      pathname,
    );
  if ((method === "PUT" || method === "DELETE") && storageMatch) {
    const campaignId = decodeURIComponent(storageMatch[1]!);
    const pluginId = decodeURIComponent(storageMatch[2]!);
    const key = decodeURIComponent(storageMatch[3]!);
    const existing = state.pluginStorage.find(
      (candidate) =>
        candidate.campaignId === campaignId &&
        candidate.pluginId === pluginId &&
        candidate.key === key,
    );
    if (existing) return { record: existing, field: "expectedUpdatedAt" };
    if (method === "DELETE") return undefined;
    const campaign = state.campaigns.find(
      (candidate) => candidate.id === campaignId,
    );
    return campaign
      ? { record: campaign, field: "expectedCampaignUpdatedAt" }
      : undefined;
  }
  return undefined;
}

function archiveCampaignId(archive: Record<string, unknown>): string | undefined {
  if (!isBodyRecord(archive.data) || !Array.isArray(archive.data.campaigns)) return undefined;
  const campaign = archive.data.campaigns.find((candidate) => isBodyRecord(candidate) && typeof candidate.id === "string");
  return isBodyRecord(campaign) && typeof campaign.id === "string" ? campaign.id : undefined;
}

function stateCampaignById(state: EngineState, campaignId: string): RevisionRecord | undefined {
  return state.campaigns.find((campaign) => campaign.id === campaignId);
}

function organizationWorkspaceForHeaders(
  state: EngineState,
  headers: Record<string, unknown>,
): RevisionRecord | undefined {
  const directUserId = headerText(headers, "x-user-id")?.trim();
  const authorization = headerText(headers, "authorization")?.trim();
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = bearer
    ? state.sessions.find(
        (candidate) =>
          candidate.tokenHash ===
          `sha256:${createHash("sha256").update(bearer).digest("hex")}`,
      )
    : undefined;
  if (session?.activeOrganizationId) {
    const active = state.organizations.find(
      (candidate) => candidate.id === session.activeOrganizationId,
    );
    if (active) return active;
  }
  const userId = directUserId ?? session?.userId;
  if (!userId) return state.organizations[0];
  const owned = state.organizations.find(
    (candidate) => candidate.ownerUserId === userId,
  );
  if (owned) return owned;
  const membership = state.organizationMembers.find(
    (candidate) => candidate.userId === userId,
  );
  if (membership)
    return state.organizations.find(
      (candidate) => candidate.id === membership.organizationId,
    );
  const campaignMembership = state.members.find(
    (candidate) => candidate.userId === userId,
  );
  const campaign = campaignMembership
    ? state.campaigns.find(
        (candidate) => candidate.id === campaignMembership.campaignId,
      )
    : undefined;
  return (
    state.organizations.find(
      (candidate) => candidate.id === campaign?.organizationId,
    ) ?? state.organizations[0]
  );
}

function sharedMutationRevision(
  state: EngineState,
  method: string,
  pathname: string,
  payload: unknown,
): RevisionRequirement | undefined {
  const direct = (
    pattern: RegExp,
    collection: keyof EngineState,
    capture = 1,
  ): RevisionRecord | undefined => {
    const id = pattern.exec(pathname)?.[capture];
    if (!id) return undefined;
    const records = state[collection] as unknown as RevisionRecord[];
    return records.find((record) => record.id === decodeURIComponent(id));
  };

  if (method === "POST") {
    if (isBodyRecord(payload) && payload.createEncounter === true) {
      const campaign = direct(
        /^\/api\/v1\/campaigns\/([^/]+)\/systems\/[^/]+\/encounter-plan$/,
        "campaigns",
      );
      if (campaign) return { record: campaign, field: "expectedUpdatedAt" };
    }
    const campaign = direct(
      /^\/api\/v1\/campaigns\/([^/]+)\/(?:worlds|scenes|actors|items|handouts|encounters|combats(?:\/start)?|archive|restore|invites|fog-presets|proposals|plugins\/[^/]+\/install|systems\/[^/]+\/install)$/,
      "campaigns",
    );
    if (campaign) return { record: campaign, field: "expectedUpdatedAt" };
    const scene = direct(
      /^\/api\/v1\/scenes\/([^/]+)\/(?:tokens|encounter-monster-placements|undo|fog\/undo|fog\/apply-preset)$/,
      "scenes",
    );
    if (scene) return { record: scene, field: "expectedUpdatedAt" };
  }

  const sceneMutation = direct(
    /^\/api\/v1\/scenes\/([^/]+)\/(?:annotations|fog|walls|lights|difficult-terrain|cover-overrides|delegations)(?:\/[^/]+)?$/,
    "scenes",
  );
  if (sceneMutation)
    return { record: sceneMutation, field: "expectedUpdatedAt" };
  const combatMutation = direct(
    /^\/api\/v1\/combats\/([^/]+)\/(?:initiative\/roll-npcs|combatants\/[^/]+|environment-mechanics(?:\/[^/]+(?:\/trigger)?)?|effects\/advance|actions\/[^/]+\/reject)$/,
    "combats",
  );
  if (combatMutation)
    return { record: combatMutation, field: "expectedUpdatedAt" };

  const member = direct(
    /^\/api\/v1\/campaigns\/[^/]+\/members\/([^/]+)$/,
    "members",
  );
  if (member) return { record: member, field: "expectedUpdatedAt" };
  const webhook = direct(
    /^\/api\/v1\/campaigns\/[^/]+\/webhooks\/([^/]+)(?:\/(?:disable|test|deliveries\/[^/]+\/retry))?$/,
    "campaignWebhooks",
  );
  if (webhook) return { record: webhook, field: "expectedUpdatedAt" };
  const actorCondition = direct(
    /^\/api\/v1\/campaigns\/[^/]+\/systems\/[^/]+\/actors\/([^/]+)\/(?:conditions(?:\/[^/]+)?|attunement)$/,
    "actors",
  );
  if (actorCondition)
    return { record: actorCondition, field: "expectedUpdatedAt" };
  const fogPreset = direct(
    /^\/api\/v1\/campaigns\/[^/]+\/fog-presets\/([^/]+)$/,
    "fogPresets",
  );
  if (fogPreset) return { record: fogPreset, field: "expectedUpdatedAt" };

  for (const [pattern, collection] of [
    [/^\/api\/v1\/campaigns\/([^/]+)$/, "campaigns"],
    [/^\/api\/v1\/organization\/members\/([^/]+)$/, "organizationMembers"],
    [/^\/api\/v1\/worlds\/([^/]+)$/, "worlds"],
    [/^\/api\/v1\/scenes\/([^/]+)$/, "scenes"],
    [/^\/api\/v1\/tokens\/([^/]+)(?:\/target)?$/, "tokens"],
    [/^\/api\/v1\/actors\/([^/]+)$/, "actors"],
    [/^\/api\/v1\/items\/([^/]+)$/, "items"],
    [/^\/api\/v1\/handouts\/([^/]+)$/, "handouts"],
    [/^\/api\/v1\/encounters\/([^/]+)$/, "encounters"],
    [/^\/api\/v1\/combats\/([^/]+)$/, "combats"],
    [/^\/api\/v1\/invites\/([^/]+)\/revoke$/, "invites"],
    [
      /^\/api\/v1\/content-imports\/([^/]+)(?:\/(?:apply|rollback))?$/,
      "contentImports",
    ],
    [/^\/api\/v1\/assets\/([^/]+)(?:\/lifecycle)?$/, "assets"],
    [/^\/api\/v1\/dice-macros\/([^/]+)$/, "diceMacros"],
    [/^\/api\/v1\/audio\/([^/]+)$/, "audioTracks"],
    [/^\/api\/v1\/chat\/messages\/([^/]+)(?:\/moderation)?$/, "chat"],
    [/^\/api\/v1\/proposals\/([^/]+)\/(?:approve|apply|reject)$/, "proposals"],
  ] as const) {
    const record = direct(pattern, collection);
    if (record) return { record, field: "expectedUpdatedAt" };
  }
  return undefined;
}
