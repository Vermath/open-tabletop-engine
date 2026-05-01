import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { basename, resolve } from "node:path";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { EchoAiProvider, OpenAiResponsesProvider, buildPermissionFilteredContext, type AiProvider, type AiProviderEvent, type AiToolContext, type AiToolDefinition } from "@open-tabletop/ai-core";
import { openApiSpec } from "@open-tabletop/api-contracts";
import { CodexAppServerProvider, LoopbackCodexTransport } from "@open-tabletop/codex-app-server-provider";
import { applyProposal, approveProposal, computeFogRevealPolygon, computeLightVisionPolygon, computeTokenVisionPolygon, createEvent, createId, createTimestamped, hasPermission, isPointInsideVisionPolygons, makeArchive, nowIso, permissionsForRole, tokenCenter as centerOfToken, type Actor, type AiMemoryFact, type AuthIdentity, type Campaign, type CampaignInvite, type CampaignMember, type CampaignArchive, type CampaignArchiveFile, type ChatMessage, type Combat, type DiceRoll, type EmailOutboxMessage, type Encounter, type EngineEvent, type EngineState, type FogMode, type FogRegion, type FogShape, type JournalEntry, type MapAsset, type OAuthLoginState, type PasswordResetToken, type PermissionGrant, type PermissionName, type Proposal, type ProposalChange, type Scene, type Token, type User, type UserRole, type UserSession, type VisionPoint, type VisionPolygon, type VisionSnapshot, type WallKind } from "@open-tabletop/core";
import { rollFormula } from "@open-tabletop/dice-engine";
import { genericFantasyQuickRolls, summarizeActor } from "@open-tabletop/system-sdk";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { createAssetStorage, createAssetStorageForProvider, type AssetStorage } from "./asset-storage.js";
import { installedPlugins, installedSystems } from "./registries.js";
import { RealtimeHub } from "./realtime.js";
import { FileStateStore, type StateStore } from "./store.js";

export interface BuildAppOptions {
  store?: StateStore;
  uploadDir?: string;
  assetStorage?: AssetStorage;
  maxAssetBytes?: number;
  aiProvider?: AiProvider;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const store = options.store ?? new FileStateStore();
  const uploadDir = resolve(options.uploadDir ?? process.env.OTTE_UPLOAD_DIR ?? "uploads");
  const assetStorage = options.assetStorage ?? createAssetStorage({ uploadDir });
  const maxAssetBytes = options.maxAssetBytes ?? 25 * 1024 * 1024;
  const hub = new RealtimeHub();
  const broadcast = (event: EngineEvent) => hub.broadcast(event, (candidate, client) => filterRealtimeEvent(store, candidate, client.userId));
  const aiProvider = options.aiProvider ?? createConfiguredAiProvider();
  const app = Fastify({ logger: true });

  app.addContentTypeParser(/^image\/(png|jpeg|webp|gif|svg\+xml)$/i, { parseAs: "buffer", bodyLimit: maxAssetBytes }, (_request, body: Buffer, done) => {
    done(null, body);
  });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: maxAssetBytes }, (_request, body: Buffer, done) => {
    done(null, body);
  });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/api/v1/health", async () => ({
    ok: true,
    version: "0.1.0",
    service: "open-tabletop-api"
  }));

  app.get("/api/v1/openapi.json", async () => openApiSpec);

  app.post<{ Body: { userId?: string; email?: string; password?: string } }>("/api/v1/auth/login", async (request, reply) => {
    const body = request.body ?? {};
    pruneExpiredSessions(store);
    const user = findLoginUser(store, body);
    if (!user) return unauthorized(reply, "Unknown login identity");
    if (isDisabledUser(user)) return forbidden(reply, "User account is disabled");
    if (user.passwordResetRequired) return forbidden(reply, "Password reset required");
    if (user.passwordHash && !verifyPassword(body.password ?? "", user.passwordHash)) return unauthorized(reply, "Invalid login credentials");
    const { token, session } = createUserSession(store, user.id);
    store.save();
    return {
      token,
      session: publicSession(session),
      user: publicUser(user),
      memberships: store.state.members.filter((member) => member.userId === user.id)
    };
  });

  app.post<{ Body: { email?: string; displayName?: string; password?: string } }>("/api/v1/auth/register", async (request, reply) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    if (!email) return badRequest(reply, "A valid email is required");
    if (!isUsablePassword(body.password)) return badRequest(reply, "Password must be at least 8 characters");
    if (store.state.users.some((user) => normalizeEmail(user.email) === email)) return conflict(reply, "Email is already registered");
    const displayName = normalizeDisplayName(body.displayName) ?? email.split("@")[0] ?? "Player";
    const user = createTimestamped("usr", {
      displayName,
      email,
      passwordHash: hashPassword(body.password)
    }) satisfies User;
    store.state.users.push(user);
    const { token, session } = createUserSession(store, user.id);
    store.save();
    return {
      token,
      session: publicSession(session),
      user: publicUser(user),
      memberships: []
    };
  });

  app.post<{ Body: { email?: string; returnTo?: string } }>("/api/v1/auth/password-reset/request", async (request) => {
    const body = request.body ?? {};
    const email = normalizeEmail(body.email);
    const user = email ? store.state.users.find((item) => normalizeEmail(item.email) === email && !isDisabledUser(item)) : undefined;
    if (user?.email) {
      await issuePasswordReset(store, user, undefined, body.returnTo);
      store.save();
    }
    return { ok: true };
  });

  app.post<{ Body: { token?: string; password?: string } }>("/api/v1/auth/password-reset/confirm", async (request, reply) => {
    const body = request.body ?? {};
    if (!isUsablePassword(body.password)) return badRequest(reply, "Password must be at least 8 characters");
    try {
      const login = confirmPasswordReset(store, body.token, body.password);
      store.save();
      return {
        token: login.token,
        session: publicSession(login.session),
        user: publicUser(login.user),
        memberships: store.state.members.filter((member) => member.userId === login.user.id)
      };
    } catch (error) {
      return unauthorized(reply, errorMessage(error));
    }
  });

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>("/api/v1/auth/password/change", async (request, reply) => {
    const body = request.body ?? {};
    const session = sessionFromRequest(store, undefined, request.headers);
    if (!session) return unauthorized(reply, "Bearer session required");
    const user = store.state.users.find((item) => item.id === session.userId);
    if (!user) return unauthorized(reply, "Unknown user session");
    if (isDisabledUser(user)) return forbidden(reply, "User account is disabled");
    if (!isUsablePassword(body.newPassword)) return badRequest(reply, "Password must be at least 8 characters");
    if (user.passwordHash && !verifyPassword(body.currentPassword ?? "", user.passwordHash)) return unauthorized(reply, "Invalid current password");
    setUserPassword(user, body.newPassword, false);
    store.state.sessions = store.state.sessions.filter((item) => item.userId !== user.id);
    const { token, session: nextSession } = createUserSession(store, user.id);
    store.save();
    return {
      token,
      session: publicSession(nextSession),
      user: publicUser(user),
      memberships: store.state.members.filter((member) => member.userId === user.id)
    };
  });

  app.get("/api/v1/auth/sessions", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    pruneExpiredSessions(store);
    store.save();
    return store.state.sessions.filter((session) => session.userId === userId).map(publicSession);
  });

  app.delete<{ Params: { sessionId: string } }>("/api/v1/auth/sessions/:sessionId", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const session = store.state.sessions.find((item) => item.id === request.params.sessionId && item.userId === userId);
    if (!session) return notFound(reply, "Session not found");
    store.state.sessions = store.state.sessions.filter((item) => item.id !== session.id);
    store.save();
    return { ok: true };
  });

  app.get("/api/v1/admin/users", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    return store.state.users.map((user) => adminUserInfo(store, user));
  });

  app.patch<{ Params: { userId: string }; Body: { displayName?: string; email?: string | null; disabled?: boolean; disabledReason?: string; passwordResetRequired?: boolean } }>("/api/v1/admin/users/:userId", async (request, reply) => {
    const body = request.body ?? {};
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const user = store.state.users.find((item) => item.id === request.params.userId);
    if (!user) return notFound(reply, "User not found");
    const displayName = normalizeDisplayName(body.displayName);
    if (displayName) user.displayName = displayName;
    if (body.email !== undefined) {
      const email = body.email === null ? undefined : normalizeEmail(body.email);
      if (body.email !== null && !email) return badRequest(reply, "A valid email is required");
      if (email && store.state.users.some((item) => item.id !== user.id && normalizeEmail(item.email) === email)) return conflict(reply, "Email is already registered");
      user.email = email;
    }
    if (body.passwordResetRequired !== undefined) user.passwordResetRequired = body.passwordResetRequired;
    if (body.disabled !== undefined) {
      if (body.disabled && user.id === adminUserId) return badRequest(reply, "Admins cannot disable their own account");
      setUserDisabled(store, user, body.disabled, adminUserId, body.disabledReason);
    }
    user.updatedAt = nowIso();
    store.save();
    return adminUserInfo(store, user);
  });

  app.post<{ Params: { userId: string }; Body: { returnTo?: string } }>("/api/v1/admin/users/:userId/password-reset", async (request, reply) => {
    const body = request.body ?? {};
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const user = store.state.users.find((item) => item.id === request.params.userId);
    if (!user) return notFound(reply, "User not found");
    if (isDisabledUser(user)) return forbidden(reply, "User account is disabled");
    if (!user.email) return badRequest(reply, "User does not have an email address");
    const reset = await issuePasswordReset(store, user, adminUserId, body.returnTo);
    store.save();
    return {
      reset: publicPasswordResetToken(reset.reset),
      email: publicEmailOutboxMessage(reset.email)
    };
  });

  app.delete<{ Params: { userId: string } }>("/api/v1/admin/users/:userId/sessions", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    if (!store.state.users.some((user) => user.id === request.params.userId)) return notFound(reply, "User not found");
    const before = store.state.sessions.length;
    store.state.sessions = store.state.sessions.filter((session) => session.userId !== request.params.userId);
    store.save();
    return { revoked: before - store.state.sessions.length };
  });

  app.get("/api/v1/admin/sessions", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    pruneExpiredSessions(store);
    store.save();
    return store.state.sessions.map((session) => {
      const user = store.state.users.find((item) => item.id === session.userId);
      return {
        ...publicSession(session),
        user: user ? publicUser(user) : { id: session.userId, displayName: "Unknown user" }
      };
    });
  });

  app.delete<{ Params: { sessionId: string } }>("/api/v1/admin/sessions/:sessionId", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const session = store.state.sessions.find((item) => item.id === request.params.sessionId);
    if (!session) return notFound(reply, "Session not found");
    store.state.sessions = store.state.sessions.filter((item) => item.id !== session.id);
    store.save();
    return { ok: true };
  });

  app.get("/api/v1/admin/email-outbox", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    return store.state.emailOutbox.slice(-100).map(publicEmailOutboxMessage);
  });

  app.get("/api/v1/auth/oidc/config", async (request) => {
    const config = oidcProviderConfig(request.headers);
    if (!config) return { enabled: false };
    return {
      enabled: true,
      issuer: config.issuer,
      clientId: config.clientId,
      scope: config.scope,
      displayName: config.displayName,
      redirectUri: config.redirectUri
    };
  });

  app.post<{ Body: { returnTo?: string } }>("/api/v1/auth/oidc/start", async (request, reply) => {
    const config = oidcProviderConfig(request.headers);
    if (!config) return badRequest(reply, "OIDC is not configured");
    try {
      return await createOidcAuthorization(store, config, request.body.returnTo);
    } catch (error) {
      return badRequest(reply, errorMessage(error));
    }
  });

  app.get<{ Querystring: { returnTo?: string } }>("/api/v1/auth/oidc/start", async (request, reply) => {
    const config = oidcProviderConfig(request.headers);
    if (!config) return badRequest(reply, "OIDC is not configured");
    try {
      const authorization = await createOidcAuthorization(store, config, request.query.returnTo);
      return reply.redirect(authorization.authorizationUrl);
    } catch (error) {
      return badRequest(reply, errorMessage(error));
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>("/api/v1/auth/oidc/callback", async (request, reply) => {
    if (request.query.error) return unauthorized(reply, request.query.error_description ?? request.query.error);
    if (!request.query.code || !request.query.state) return badRequest(reply, "OIDC callback requires code and state");
    const config = oidcProviderConfig(request.headers);
    if (!config) return badRequest(reply, "OIDC is not configured");
    try {
      const login = await completeOidcCallback(store, config, request.query.code, request.query.state);
      store.save();
      if (login.returnTo) return reply.redirect(ssoRedirectUrl(login.returnTo, login.token, login.user.id));
      return {
        token: login.token,
        session: publicSession(login.session),
        user: publicUser(login.user),
        memberships: store.state.members.filter((member) => member.userId === login.user.id),
        identity: publicIdentity(login.identity)
      };
    } catch (error) {
      return unauthorized(reply, `OIDC callback failed: ${errorMessage(error)}`);
    }
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const session = sessionFromRequest(store, undefined, request.headers);
    if (!session) return unauthorized(reply, "Missing session token");
    store.state.sessions = store.state.sessions.filter((item) => item.id !== session.id);
    store.save();
    return { ok: true };
  });

  app.get("/api/v1/auth/session", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const session = sessionFromRequest(store, undefined, request.headers);
    const user = store.state.users.find((item) => item.id === userId);
    if (!user) return unauthorized(reply, "Unknown user session");
    return {
      user: publicUser(user),
      session: session ? publicSession(session) : undefined,
      memberships: store.state.members.filter((member) => member.userId === userId)
    };
  });

  app.get("/api/v1/realtime", { websocket: true }, (socket, request) => {
    const url = new URL(request.url ?? "/api/v1/realtime", "http://localhost");
    const campaignId = url.searchParams.get("campaignId") ?? undefined;
    const userId = userIdFromRequest(store, request.url, request.headers);
    if (!userId || (campaignId && !canCampaign(store, userId, campaignId, "campaign.read"))) {
      socket.send(JSON.stringify({ error: "unauthorized" }));
      socket.close();
      return;
    }
    const client = {
      campaignId,
      userId,
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
    const member = createTimestamped("mem", {
      campaignId: campaign.id,
      userId,
      role: "owner" as const
    });
    store.state.campaigns.push(campaign);
    store.state.members.push(member);
    store.save();
    broadcast(
      createEvent({
        campaignId: campaign.id,
        type: "campaign.member.joined",
        actorUserId: userId,
        targetId: campaign.id,
        payload: member
      })
    );
    return campaign;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    return campaign;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/members", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    return store.state.members.filter((member) => member.campaignId === request.params.campaignId).map((member) => memberSessionInfo(store, member));
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/invites", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    return store.state.invites.filter((invite) => invite.campaignId === request.params.campaignId).map(publicInvite);
  });

  app.post<{ Params: { campaignId: string }; Body: { email?: string; role?: UserRole; expiresInDays?: number } }>("/api/v1/campaigns/:campaignId/invites", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    const role = request.body.role ?? "player";
    if (!isInvitableRole(role)) return badRequest(reply, "Invite role must be gm, assistant_gm, player, or observer");
    const email = request.body.email === undefined ? undefined : normalizeEmail(request.body.email);
    if (request.body.email !== undefined && !email) return badRequest(reply, "Invite email is invalid");
    const expiresInDays = inviteExpirationDays(request.body.expiresInDays);
    const token = `oti_${randomBytes(32).toString("base64url")}`;
    const invite = createTimestamped("inv", {
      campaignId: campaign.id,
      tokenHash: hashSessionToken(token),
      email,
      role,
      invitedByUserId: currentUserId(store, request.headers)!,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    }) satisfies CampaignInvite;
    store.state.invites.push(invite);
    store.save();
    return {
      invite: publicInvite(invite),
      token,
      acceptUrl: `/join?invite=${encodeURIComponent(token)}`
    };
  });

  app.post<{ Params: { inviteId: string } }>("/api/v1/invites/:inviteId/revoke", async (request, reply) => {
    const invite = store.state.invites.find((item) => item.id === request.params.inviteId);
    if (!invite) return notFound(reply, "Invite not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, invite.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    if (!invite.acceptedAt) {
      invite.revokedAt = nowIso();
      invite.updatedAt = invite.revokedAt;
      store.save();
    }
    return publicInvite(invite);
  });

  app.post<{ Body: { token?: string; userId?: string; email?: string; displayName?: string; password?: string } }>("/api/v1/invites/accept", async (request, reply) => {
    const token = request.body.token?.trim();
    if (!token) return badRequest(reply, "Invite token is required");
    const invite = store.state.invites.find((item) => item.tokenHash === hashSessionToken(token));
    if (!invite) return unauthorized(reply, "Invite token is invalid");
    if (invite.revokedAt) return forbidden(reply, "Invite has been revoked");
    if (invite.acceptedAt) return conflict(reply, "Invite has already been accepted");
    if (Date.parse(invite.expiresAt) <= Date.now()) return forbidden(reply, "Invite has expired");
    const campaign = store.state.campaigns.find((item) => item.id === invite.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    if (invite.email && request.body.email !== undefined && normalizeEmail(request.body.email) !== invite.email) return forbidden(reply, "Invite is restricted to a different email");

    const user = resolveInviteUser(store, request.headers, request.body, reply);
    if (!("id" in user)) return user;
    if (invite.email && normalizeEmail(user.email) !== invite.email) return forbidden(reply, "Invite is restricted to a different email");

    let member = store.state.members.find((item) => item.campaignId === invite.campaignId && item.userId === user.id);
    if (!member) {
      member = createTimestamped("mem", {
        campaignId: invite.campaignId,
        userId: user.id,
        role: invite.role
      }) satisfies CampaignMember;
      store.state.members.push(member);
    } else if (member.role !== "owner") {
      member.role = invite.role;
      member.updatedAt = nowIso();
    }
    invite.acceptedAt = nowIso();
    invite.acceptedByUserId = user.id;
    invite.updatedAt = invite.acceptedAt;
    const { token: sessionToken, session } = createUserSession(store, user.id);
    store.save();
    broadcast(
      createEvent({
        campaignId: invite.campaignId,
        type: "campaign.member.joined",
        actorUserId: user.id,
        targetId: user.id,
        payload: member
      })
    );
    return {
      token: sessionToken,
      session: publicSession(session),
      user: publicUser(user),
      invite: publicInvite(invite),
      membership: memberSessionInfo(store, member),
      campaign
    };
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
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: "scene.created",
        targetId: scene.id,
        payload: scene
      })
    );
    return scene;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/assets", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.read");
    if (allowed !== true) return allowed;
    return store.state.assets.filter((item) => item.campaignId === request.params.campaignId);
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/assets/storage", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.read");
    if (allowed !== true) return allowed;
    return campaignAssetStorageInfo(store, request.params.campaignId);
  });

  app.post<{ Params: { campaignId: string }; Body: Partial<MapAsset> }>("/api/v1/campaigns/:campaignId/assets", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.create");
    if (allowed !== true) return allowed;
    const body = request.body ?? {};
    const sizeBytes = normalizeAssetSizeBytes(body.sizeBytes);
    if (sizeBytes === undefined) return badRequest(reply, "Asset sizeBytes must be a non-negative finite number");
    const quotaExceeded = assetQuotaExceeded(store, request.params.campaignId, sizeBytes);
    if (quotaExceeded) return reply.code(413).send(quotaExceeded);
    const asset = createTimestamped("asset", {
      campaignId: request.params.campaignId,
      name: body.name ?? "Map Asset",
      url: body.url ?? "",
      mimeType: body.mimeType ?? "image/png",
      sizeBytes,
      checksum: body.checksum,
      lifecycle: defaultAssetLifecycle()
    }) satisfies MapAsset;
    store.state.assets.push(asset);
    store.save();
    return asset;
  });

  app.post<{
    Params: { campaignId: string };
    Querystring: { sceneId?: string; setAsBackground?: string };
    Body: Buffer;
  }>("/api/v1/campaigns/:campaignId/assets/upload", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.create");
    if (allowed !== true) return allowed;
    const shouldSetBackground = request.query.sceneId && truthyQuery(request.query.setAsBackground);
    if (shouldSetBackground) {
      const sceneUpdateAllowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "scene.update");
      if (sceneUpdateAllowed !== true) return sceneUpdateAllowed;
    }
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
    if (body.length === 0) return reply.code(400).send({ error: "empty_upload", message: "Asset upload body is empty" });
    if (body.length > maxAssetBytes)
      return reply.code(413).send({
        error: "asset_too_large",
        message: `Asset exceeds ${maxAssetBytes} bytes`
      });
    const quotaExceeded = assetQuotaExceeded(store, request.params.campaignId, body.length);
    if (quotaExceeded) return reply.code(413).send(quotaExceeded);
    const mimeType = normalizeAssetMimeType(request.headers["content-type"]);
    const sourceName = displayNameFromHeader(request.headers["x-asset-name"]) ?? "Uploaded Map";
    const checksum = checksumForBuffer(body);
    const scene = shouldSetBackground ? store.state.scenes.find((item) => item.id === request.query.sceneId && item.campaignId === request.params.campaignId) : undefined;
    if (shouldSetBackground && !scene) return notFound(reply, "Scene not found");
    const asset: MapAsset = createTimestamped("asset", {
      campaignId: request.params.campaignId,
      name: sourceName,
      url: "",
      mimeType,
      sizeBytes: body.length,
      checksum,
      lifecycle: defaultAssetLifecycle()
    });
    asset.storage = await assetStorage.put(asset, body);
    asset.url = `/api/v1/assets/${asset.id}/blob`;
    store.state.assets.push(asset);

    if (scene) {
      scene.backgroundAssetId = asset.id;
      scene.updatedAt = nowIso();
    }

    store.save();
    if (scene)
      broadcast(
        createEvent({
          campaignId: scene.campaignId,
          type: "scene.updated",
          targetId: scene.id,
          payload: scene
        })
      );
    return { asset, scene };
  });

  app.post<{ Params: { assetId: string }; Body: { expiresInSeconds?: number; disposition?: "inline" | "attachment" } }>("/api/v1/assets/:assetId/delivery-url", async (request, reply) => {
    const body = request.body ?? {};
    const asset = store.state.assets.find((item) => item.id === request.params.assetId);
    if (!asset) return notFound(reply, "Asset not found");
    if (!isAssetDeliverable(asset)) return assetUnavailable(reply, asset);
    const allowed = requireCampaignPermission(store, reply, request.headers, asset.campaignId, "scene.read");
    if (allowed !== true) return allowed;
    try {
      return signedAssetDelivery(asset, request.headers, body.expiresInSeconds, body.disposition);
    } catch (error) {
      return reply.code(500).send({ error: "asset_signing_unavailable", message: errorMessage(error) });
    }
  });

  app.patch<{ Params: { assetId: string }; Body: { status?: "active" | "archived" | "deleted"; expiresAt?: string | null; reason?: string } }>("/api/v1/assets/:assetId/lifecycle", async (request, reply) => {
    const body = request.body ?? {};
    const asset = store.state.assets.find((item) => item.id === request.params.assetId);
    if (!asset) return notFound(reply, "Asset not found");
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!canCampaign(store, userId, asset.campaignId, "scene.update")) return forbidden(reply, "Missing permission: scene.update");
    const status = normalizeAssetLifecycleStatus(body.status);
    if (!status) return badRequest(reply, "Asset lifecycle status must be active, archived, or deleted");
    const expiresAt = normalizeOptionalIsoDate(body.expiresAt);
    if (body.expiresAt !== undefined && body.expiresAt !== null && !expiresAt) return badRequest(reply, "expiresAt must be an ISO date");
    asset.lifecycle = {
      status,
      expiresAt,
      updatedAt: nowIso(),
      updatedByUserId: userId,
      reason: body.reason?.trim().slice(0, 160)
    };
    asset.updatedAt = nowIso();
    store.save();
    return asset;
  });

  app.get<{ Params: { assetId: string }; Querystring: { userId?: string; expiresAt?: string; signature?: string; disposition?: "inline" | "attachment" } }>("/api/v1/assets/:assetId/blob", async (request, reply) => {
    const asset = store.state.assets.find((item) => item.id === request.params.assetId);
    if (!asset) return notFound(reply, "Asset not found");
    if (!isAssetDeliverable(asset)) return assetUnavailable(reply, asset);
    const signedAccess = isValidAssetSignature(asset.id, request.query.expiresAt, request.query.signature, request.query.disposition);
    if (!signedAccess) {
      const userId = userIdFromRequest(store, request.url, request.headers);
      if (!userId) return unauthorized(reply, "Missing asset session");
      if (!canCampaign(store, userId, asset.campaignId, "scene.read")) return forbidden(reply, "Missing permission: scene.read");
    }
    const cacheControl = signedAccess ? signedAssetCacheControl(request.query.expiresAt) : "private, max-age=60";
    const contentDisposition = request.query.disposition === "attachment" ? `attachment; filename="${safeDownloadFileName(asset.name)}"` : undefined;
    const stream = await assetStorage.stream?.(asset);
    if (contentDisposition) reply.header("content-disposition", contentDisposition);
    if (stream) return reply.header("content-type", asset.mimeType).header("cache-control", cacheControl).send(stream);
    const body = await assetStorage.read(asset);
    if (!body) return notFound(reply, "Asset file not found");
    return reply.header("content-type", asset.mimeType).header("cache-control", cacheControl).send(body);
  });

  app.get("/api/v1/admin/assets/storage", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    return globalAssetStorageInfo(store);
  });

  app.post<{
    Body: {
      campaignId?: string;
      assetIds?: string[];
      dryRun?: boolean;
      includeDeleted?: boolean;
      overwrite?: boolean;
    };
  }>("/api/v1/admin/assets/migrate", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const result = await migrateStoredAssets(store, assetStorage, uploadDir, request.body ?? {});
    if (result.changed) store.save();
    return result;
  });

  app.post<{
    Body: {
      campaignId?: string;
      assetIds?: string[];
      dryRun?: boolean;
      includeDeleted?: boolean;
      includeExpired?: boolean;
      graceDays?: number;
    };
  }>("/api/v1/admin/assets/cleanup", async (request, reply) => {
    const adminUserId = requireServerAdmin(store, reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const result = await cleanupStoredAssets(store, assetStorage, uploadDir, request.body ?? {}, adminUserId);
    if (result.changed) store.save();
    return result;
  });

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.read");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    return scene;
  });

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId/vision", async (request, reply): Promise<VisionSnapshot | FastifyReply> => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.read");
    if (allowed !== true) return allowed;
    const userId = currentUserId(store, request.headers)!;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    return visionSnapshotForUser(store, userId, campaignId, scene);
  });

  app.patch<{ Params: { sceneId: string }; Body: Partial<Scene> }>("/api/v1/scenes/:sceneId", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.update");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    Object.assign(scene, request.body, { updatedAt: nowIso() });
    store.save();
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: scene.active ? "scene.activated" : "scene.updated",
        targetId: scene.id,
        payload: scene
      })
    );
    return scene;
  });

  app.post<{
    Params: { sceneId: string };
    Body: { x?: number; y?: number; radius?: number; hidden?: boolean; shape?: FogShape; mode?: FogMode; points?: VisionPoint[] };
  }>("/api/v1/scenes/:sceneId/fog", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.reveal");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    const fogRegion = normalizeFogRegion(request.body, scene);
    if (!fogRegion) return badRequest(reply, "Invalid fog region");
    scene.fog.push({ id: createId("fog"), ...fogRegion });
    scene.updatedAt = nowIso();
    store.save();
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: "scene.updated",
        targetId: scene.id,
        payload: scene
      })
    );
    return scene;
  });

  app.delete<{ Params: { sceneId: string; fogId: string } }>("/api/v1/scenes/:sceneId/fog/:fogId", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.reveal");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    const index = scene.fog.findIndex((region) => region.id === request.params.fogId);
    if (index < 0) return notFound(reply, "Fog region not found");
    scene.fog.splice(index, 1);
    scene.updatedAt = nowIso();
    store.save();
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: "scene.updated",
        targetId: scene.id,
        payload: scene
      })
    );
    return scene;
  });

  app.post<{
    Params: { sceneId: string };
    Body: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      blocksVision?: boolean;
      blocksMovement?: boolean;
      kind?: WallKind;
    };
  }>("/api/v1/scenes/:sceneId/walls", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.update");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    const kind: WallKind = request.body.kind === "terrain" ? "terrain" : "wall";
    scene.walls.push({
      id: createId("wall"),
      x1: request.body.x1,
      y1: request.body.y1,
      x2: request.body.x2,
      y2: request.body.y2,
      blocksVision: request.body.blocksVision ?? true,
      blocksMovement: request.body.blocksMovement ?? (kind === "wall"),
      kind
    });
    scene.updatedAt = nowIso();
    store.save();
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: "scene.updated",
        targetId: scene.id,
        payload: scene
      })
    );
    return scene;
  });

  app.post<{
    Params: { sceneId: string };
    Body: { x: number; y: number; radius?: number; color?: string; intensity?: number };
  }>("/api/v1/scenes/:sceneId/lights", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "scene.update");
    if (allowed !== true) return allowed;
    const scene = store.state.scenes.find((item) => item.id === request.params.sceneId)!;
    scene.lights.push({
      id: createId("light"),
      x: request.body.x,
      y: request.body.y,
      radius: request.body.radius ?? 180,
      color: request.body.color ?? "#facc15",
      intensity: clampLightIntensity(request.body.intensity ?? 0.28)
    });
    scene.updatedAt = nowIso();
    store.save();
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: "scene.updated",
        targetId: scene.id,
        payload: scene
      })
    );
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
    broadcast(
      createEvent({
        campaignId: deleted.campaignId,
        type: "scene.deleted",
        targetId: deleted.id,
        payload: deleted
      })
    );
    return deleted;
  });

  app.get<{ Params: { sceneId: string } }>("/api/v1/scenes/:sceneId/tokens", async (request, reply) => {
    const campaignId = campaignIdForScene(store, request.params.sceneId);
    if (!campaignId) return notFound(reply, "Scene not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, "token.read");
    if (allowed !== true) return allowed;
    const userId = currentUserId(store, request.headers)!;
    return visibleTokensForUser(store, userId, campaignId, store.state.tokens.filter((item) => item.sceneId === request.params.sceneId));
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
    broadcast(
      createEvent({
        campaignId: scene.campaignId,
        type: "token.created",
        targetId: token.id,
        payload: token
      })
    );
    return token;
  });

  app.patch<{ Params: { tokenId: string }; Body: Partial<Token> }>("/api/v1/tokens/:tokenId", async (request, reply) => {
    const campaignId = campaignIdForToken(store, request.params.tokenId);
    if (!campaignId) return notFound(reply, "Token not found");
    const moved = request.body.x !== undefined || request.body.y !== undefined;
    const permission: PermissionName = moved ? "token.move" : "token.update";
    const allowed = requireCampaignPermission(store, reply, request.headers, campaignId, permission);
    if (allowed !== true) return allowed;
    const token = store.state.tokens.find((item) => item.id === request.params.tokenId);
    if (!token) return notFound(reply, "Token not found");
    const userId = currentUserId(store, request.headers)!;
    if (!isTokenVisibleToUser(store, userId, campaignId, token)) return notFound(reply, "Token not found");
    if (moved && !canMoveToken(store, userId, campaignId, token)) return forbidden(reply, "Missing token ownership");
    const scene = store.state.scenes.find((item) => item.id === token.sceneId);
    Object.assign(token, request.body, { updatedAt: nowIso() });
    store.save();
    if (scene) {
      broadcast(
        createEvent({
          campaignId: scene.campaignId,
          type: moved ? "token.moved" : "token.updated",
          targetId: token.id,
          payload: token
        })
      );
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
    const userId = currentUserId(store, request.headers)!;
    if (!isTokenVisibleToUser(store, userId, campaignId, store.state.tokens[index]!)) return notFound(reply, "Token not found");
    const deleted = store.state.tokens.splice(index, 1)[0]!;
    store.save();
    const scene = store.state.scenes.find((item) => item.id === deleted.sceneId);
    if (scene)
      broadcast(
        createEvent({
          campaignId: scene.campaignId,
          type: "token.deleted",
          targetId: deleted.id,
          payload: deleted
        })
      );
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
      data: request.body.data ?? {
        hp: { current: 10, max: 10 },
        attributes: {}
      },
      permissions: request.body.permissions ?? {}
    }) satisfies Actor;
    store.state.actors.push(actor);
    store.save();
    broadcast(
      createEvent({
        campaignId: actor.campaignId,
        type: "actor.created",
        targetId: actor.id,
        payload: actor
      })
    );
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
    broadcast(
      createEvent({
        campaignId: actor.campaignId,
        type: "actor.updated",
        targetId: actor.id,
        payload: actor
      })
    );
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
    return store.state.journals.filter((item) => item.campaignId === request.params.campaignId).filter((item) => item.visibility === "public" || canReadSecret || item.visibleToUserIds.includes(userId));
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
    broadcast(
      createEvent({
        campaignId: entry.campaignId,
        type: "journal.created",
        targetId: entry.id,
        payload: entry
      })
    );
    return entry;
  });

  app.patch<{ Params: { entryId: string }; Body: Partial<JournalEntry> }>("/api/v1/journal/:entryId", async (request, reply) => {
    const entry = store.state.journals.find((item) => item.id === request.params.entryId);
    if (!entry) return notFound(reply, "Journal entry not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, entry.campaignId, "journal.update");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    Object.assign(entry, request.body, {
      updatedAt: nowIso(),
      updatedBy: userId
    });
    store.save();
    broadcast(
      createEvent({
        campaignId: entry.campaignId,
        type: "journal.updated",
        targetId: entry.id,
        payload: entry
      })
    );
    return entry;
  });

  app.post<{
    Body: {
      campaignId: string;
      formula: string;
      visibility?: "public" | "gm_only" | "whisper";
      label?: string;
    };
  }>("/api/v1/dice/roll", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.body.campaignId, "dice.roll");
    if (allowed !== true) return allowed;
    const userId = currentUserId(store, request.headers)!;
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
    broadcast(
      createEvent({
        campaignId: roll.campaignId,
        type: "dice.roll.created",
        actorUserId: userId,
        targetId: roll.id,
        payload: roll
      })
    );
    broadcast(
      createEvent({
        campaignId: roll.campaignId,
        type: "chat.message.created",
        actorUserId: userId,
        targetId: message.id,
        payload: message
      })
    );
    return roll;
  });

  app.get<{ Querystring: { campaignId?: string } }>("/api/v1/chat/messages", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!request.query.campaignId) {
      return store.state.chat.filter((item) => canCampaign(store, userId, item.campaignId, "chat.read") && canReadChatMessage(store, userId, item));
    }
    const allowed = requireCampaignPermission(store, reply, request.headers, request.query.campaignId, "chat.read");
    if (allowed !== true) return allowed;
    return store.state.chat.filter((item) => item.campaignId === request.query.campaignId && canReadChatMessage(store, userId, item));
  });

  app.post<{
    Body: Partial<ChatMessage> & { campaignId: string; body: string };
  }>("/api/v1/chat/messages", async (request, reply) => {
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
    broadcast(
      createEvent({
        campaignId: message.campaignId,
        type: "chat.message.created",
        actorUserId: message.userId,
        targetId: message.id,
        payload: message
      })
    );
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
    broadcast(
      createEvent({
        campaignId: combat.campaignId,
        type: "combat.started",
        targetId: combat.id,
        payload: combat
      })
    );
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
    broadcast(
      createEvent({
        campaignId: proposal.campaignId,
        type: "proposal.created",
        targetId: proposal.id,
        payload: proposal
      })
    );
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
    broadcast(
      createEvent({
        campaignId: proposal.campaignId,
        type: "proposal.approved",
        targetId: proposal.id,
        payload: proposal
      })
    );
    return proposal;
  });

  app.post<{ Params: { proposalId: string } }>("/api/v1/proposals/:proposalId/apply", async (request, reply) => {
    const proposal = store.state.proposals.find((item) => item.id === request.params.proposalId);
    if (!proposal) return notFound(reply, "Proposal not found");
    const allowed = requireCampaignPermission(store, reply, request.headers, proposal.campaignId, "ai.applyChanges");
    if (allowed !== true) return allowed;
    try {
      store.replace(applyProposal(store.state, proposal));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proposal could not be applied";
      return reply.code(409).send({ error: "proposal_not_ready", message });
    }
    const applied = store.state.proposals.find((item) => item.id === request.params.proposalId);
    broadcast(
      createEvent({
        campaignId: proposal.campaignId,
        type: "proposal.applied",
        targetId: proposal.id,
        payload: applied
      })
    );
    return applied;
  });

  app.post<{ Params: { campaignId: string }; Body: { prompt: string } }>("/api/v1/campaigns/:campaignId/ai/threads", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.use");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const thread = createTimestamped("thr", {
      campaignId: request.params.campaignId,
      userId,
      provider: aiProvider.id,
      title: request.body.prompt.slice(0, 80) || "AI Thread"
    });
    store.state.aiThreads.push(thread);
    const permissions = permissionsForUser(store, userId, request.params.campaignId);
    const context = buildPermissionFilteredContext({
      state: store.state,
      campaignId: request.params.campaignId,
      permissions
    });
    const tools = createAiThreadTools();
    const toolContext = createAiToolContext(store, request.params.campaignId, userId, permissions);
    let content = "";
    const events: AiProviderEvent[] = [];
    for await (const event of aiProvider.stream({
      threadId: thread.id,
      messages: [{ role: "user", content: request.body.prompt }],
      tools,
      context
    })) {
      events.push(event);
      if (event.type === "message.delta") content += event.delta;
      if (event.type === "message.completed" && !content) content = event.content;
      if (event.type === "tool.started") {
        store.state.aiToolCalls.push(
          createTimestamped("tool", {
            threadId: thread.id,
            toolName: event.toolName,
            input: event.input,
            output: undefined,
            status: "started" as const
          })
        );
        const output = await executeAiTool(tools, event.toolName, event.input, toolContext);
        const completedEvent: AiProviderEvent = { type: "tool.completed", toolName: event.toolName, output };
        events.push(completedEvent);
        store.state.aiToolCalls.push(
          createTimestamped("tool", {
            threadId: thread.id,
            toolName: event.toolName,
            input: undefined,
            output,
            status: "completed" as const
          })
        );
        if (isProposalToolOutput(output)) {
          events.push({ type: "proposal.created", proposalId: output.proposalId });
        }
      } else if (event.type === "tool.completed") {
        store.state.aiToolCalls.push(
          createTimestamped("tool", {
            threadId: thread.id,
            toolName: event.toolName,
            input: undefined,
            output: event.output,
            status: "completed" as const
          })
        );
      }
    }
    if (content.trim()) {
      const message = createTimestamped("msg", {
        campaignId: request.params.campaignId,
        userId: aiProvider.id,
        type: "ai" as const,
        body: content,
        visibility: permissions.includes("ai.readGmMemory") ? ("gm_only" as const) : ("public" as const),
        recipientUserIds: []
      }) satisfies ChatMessage;
      store.state.chat.push(message);
      broadcast(
        createEvent({
          campaignId: message.campaignId,
          type: "chat.message.created",
          actorUserId: userId,
          targetId: message.id,
          payload: message
        })
      );
    }
    store.save();
    broadcast(
      createEvent({
        campaignId: thread.campaignId,
        type: "ai.thread.started",
        actorUserId: userId,
        targetId: thread.id,
        payload: thread
      })
    );
    return { thread, assistantMessage: content, events };
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/ai/memory", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const canReadPublic = canCampaign(store, userId, request.params.campaignId, "ai.readPublicMemory");
    const canReadGm = canCampaign(store, userId, request.params.campaignId, "ai.readGmMemory");
    if (!canReadPublic && !canReadGm) return forbidden(reply, "Missing permission: ai.readPublicMemory");
    return store.state.aiMemory.filter((item) => item.campaignId === request.params.campaignId).filter((item) => item.visibility === "public" || canReadGm);
  });

  app.post<{
    Params: { campaignId: string };
    Body: Partial<AiMemoryFact> & { text: string };
  }>("/api/v1/campaigns/:campaignId/ai/memory", async (request, reply) => {
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

  app.post<{
    Params: { campaignId: string };
    Body: { sourceText?: string; visibility?: "public" | "gm_only" };
  }>("/api/v1/campaigns/:campaignId/ai/memory/extract", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.proposeChanges");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const sourceText = request.body.sourceText?.trim() || defaultMemoryExtractionSource(store, request.params.campaignId);
    const thread = createTimestamped("thr", {
      campaignId: request.params.campaignId,
      userId,
      provider: aiProvider.id,
      title: "Memory Extraction"
    });
    store.state.aiThreads.push(thread);
    const permissions = permissionsForUser(store, userId, request.params.campaignId);
    const context = buildPermissionFilteredContext({
      state: store.state,
      campaignId: request.params.campaignId,
      permissions
    });
    let providerOutput = "";
    const events: AiProviderEvent[] = [];
    for await (const event of aiProvider.stream({
      threadId: thread.id,
      messages: [
        {
          role: "user",
          content: `Extract durable campaign memory from this source text:\n${sourceText}`
        }
      ],
      tools: [],
      context
    })) {
      events.push(event);
      if (event.type === "message.delta") providerOutput += event.delta;
      if (event.type === "message.completed" && !providerOutput) providerOutput = event.content;
    }
    const memory = createTimestamped("mem", {
      campaignId: request.params.campaignId,
      text: extractedMemoryText(providerOutput, sourceText),
      visibility: request.body.visibility ?? "gm_only",
      sourceIds: [thread.id]
    }) satisfies AiMemoryFact;
    store.state.aiMemory.push(memory);
    store.save();
    return { thread, memory, providerOutput, events };
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
      : `Session recap: ${store.state.chat
          .filter((message) => message.campaignId === request.params.campaignId)
          .map((message) => message.body)
          .join(" ")}`;
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
    broadcast(
      createEvent({
        campaignId: proposal.campaignId,
        type: "ai.proposal.created",
        targetId: proposal.id,
        payload: proposal
      })
    );
    return { proposal, memory };
  });

  app.post<{
    Params: { campaignId: string };
    Body: { prompt: string; difficulty?: string };
  }>("/api/v1/campaigns/:campaignId/ai/encounter-design", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "ai.proposeChanges");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const tokenIds = store.state.tokens.filter((token) => store.state.scenes.some((scene) => scene.campaignId === request.params.campaignId && scene.id === token.sceneId)).map((token) => token.id);
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
      changesJson: [
        {
          entity: "encounter" as const,
          action: "create" as const,
          data: encounter
        }
      ],
      diffJson: { tokenIds },
      approvalRequired: true
    }) satisfies Proposal;
    store.state.proposals.push(proposal);
    store.save();
    broadcast(
      createEvent({
        campaignId: proposal.campaignId,
        type: "ai.proposal.created",
        targetId: proposal.id,
        payload: proposal
      })
    );
    return { proposal, encounter };
  });

  app.get("/api/v1/plugins", async (request, reply) => {
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    return installedPlugins;
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/plugins", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    return installedPlugins.map((plugin) => {
      const grant = findPluginGrant(store, request.params.campaignId, plugin.id);
      return {
        ...plugin,
        installed: Boolean(grant),
        grantedPermissions: grant?.permissions ?? [],
        missingPermissions: plugin.permissions.filter((permission) => !grant?.permissions.includes(permission))
      };
    });
  });

  app.post<{ Params: { campaignId: string; pluginId: string } }>("/api/v1/campaigns/:campaignId/plugins/:pluginId/install", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "plugin.install");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const plugin = installedPlugins.find((item) => item.id === request.params.pluginId);
    if (!plugin) return notFound(reply, "Plugin not found");
    const existing = findPluginGrant(store, request.params.campaignId, plugin.id);
    const grant =
      existing ??
      (createTimestamped("grant", {
        subjectType: "plugin" as const,
        subjectId: plugin.id,
        campaignId: request.params.campaignId,
        permissions: plugin.permissions
      }) satisfies PermissionGrant);
    grant.permissions = plugin.permissions;
    grant.updatedAt = nowIso();
    if (!existing) store.state.permissionGrants.push(grant);
    store.state.auditLogs.push(
      createTimestamped("audit", {
        campaignId: request.params.campaignId,
        actorUserId: userId,
        actorType: "user" as const,
        action: "plugin.install",
        targetType: "plugin",
        targetId: plugin.id,
        after: { permissions: plugin.permissions }
      })
    );
    store.save();
    return { plugin, grant };
  });

  app.post<{
    Params: { campaignId: string; pluginId: string };
    Body: { command: string; args?: string };
  }>("/api/v1/campaigns/:campaignId/plugins/:pluginId/chat-command", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "chat.write");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const plugin = installedPlugins.find((item) => item.id === request.params.pluginId);
    if (!plugin) return notFound(reply, "Plugin not found");
    const command = request.body.command.startsWith("/") ? request.body.command : `/${request.body.command}`;
    if (!plugin.chatCommands?.some((item) => item.command === command)) return notFound(reply, "Plugin command not found");
    if (!pluginCan(store, request.params.campaignId, plugin.id, "chat.write")) {
      return forbidden(reply, `Plugin ${plugin.id} lacks chat.write in this campaign`);
    }
    const canReadTokens = pluginCan(store, request.params.campaignId, plugin.id, "token.read");
    const sceneIds = campaignSceneIds(store, request.params.campaignId);
    const tokenNames = canReadTokens ? store.state.tokens.filter((token) => sceneIds.includes(token.sceneId)).map((token) => token.name) : [];
    const message = createTimestamped("msg", {
      campaignId: request.params.campaignId,
      userId: plugin.id,
      type: "plugin" as const,
      body: command === "/spark" ? `Spark macro: ${request.body.args?.trim() || "arcane sparks flare across the scene"}${tokenNames.length ? ` near ${tokenNames.join(", ")}` : ""}.` : `${plugin.name} ran ${command}.`,
      visibility: "public" as const,
      recipientUserIds: []
    }) satisfies ChatMessage;
    store.state.chat.push(message);
    store.state.auditLogs.push(
      createTimestamped("audit", {
        campaignId: request.params.campaignId,
        actorUserId: userId,
        actorType: "plugin" as const,
        action: "plugin.chatCommand",
        targetType: "chat",
        targetId: message.id,
        after: { pluginId: plugin.id, command }
      })
    );
    store.save();
    broadcast(
      createEvent({
        campaignId: message.campaignId,
        type: "chat.message.created",
        actorUserId: userId,
        targetId: message.id,
        payload: message
      })
    );
    return { pluginId: plugin.id, command, chat: message };
  });

  app.post<{
    Body: (typeof installedPlugins)[number] & { campaignId?: string };
  }>("/api/v1/plugins/install", async (request, reply) => {
    const campaignId = request.body.campaignId ?? store.state.members.find((member) => member.userId === currentUserId(store, request.headers))?.campaignId;
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

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/systems", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.read");
    if (allowed !== true) return allowed;
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    return installedSystems.map((system) => ({
      ...system,
      active: campaign.defaultSystemId === system.id
    }));
  });

  app.post<{ Params: { campaignId: string; systemId: string } }>("/api/v1/campaigns/:campaignId/systems/:systemId/install", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return notFound(reply, "Campaign not found");
    const system = installedSystems.find((item) => item.id === request.params.systemId);
    if (!system) return notFound(reply, "System not found");
    campaign.defaultSystemId = system.id;
    campaign.updatedAt = nowIso();
    store.state.auditLogs.push(
      createTimestamped("audit", {
        campaignId: campaign.id,
        actorUserId: userId,
        actorType: "system" as const,
        action: "system.install",
        targetType: "system",
        targetId: system.id
      })
    );
    store.save();
    return { system, campaign };
  });

  app.get<{
    Params: { campaignId: string; systemId: string; actorId: string };
  }>("/api/v1/campaigns/:campaignId/systems/:systemId/actors/:actorId/sheet", async (request, reply) => {
    const allowed = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "actor.read");
    if (allowed !== true) return allowed;
    const actor = findSystemActor(store, request.params.campaignId, request.params.systemId, request.params.actorId);
    if (!actor) return notFound(reply, "System actor not found");
    return {
      actorId: actor.id,
      systemId: request.params.systemId,
      summary: summarizeActor(actor),
      data: actor.data,
      quickRolls: genericFantasyQuickRolls(actor)
    };
  });

  app.post<{
    Params: { campaignId: string; systemId: string; actorId: string };
    Body: {
      rollId?: string;
      ability?: string;
      visibility?: "public" | "gm_only" | "whisper";
    };
  }>("/api/v1/campaigns/:campaignId/systems/:systemId/actors/:actorId/roll", async (request, reply) => {
    const canReadActor = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "actor.read");
    if (canReadActor !== true) return canReadActor;
    const canRoll = requireCampaignPermission(store, reply, request.headers, request.params.campaignId, "dice.roll");
    if (canRoll !== true) return canRoll;
    const userId = requireUser(store, reply, request.headers);
    if (typeof userId !== "string") return userId;
    const actor = findSystemActor(store, request.params.campaignId, request.params.systemId, request.params.actorId);
    if (!actor) return notFound(reply, "System actor not found");
    const quickRolls = genericFantasyQuickRolls(actor);
    const rollDefinition = quickRolls.find((item) => item.id === request.body.rollId) ?? quickRolls.find((item) => item.id === `ability-${request.body.ability}`) ?? quickRolls[0];
    if (!rollDefinition) return notFound(reply, "No system roll is available for this actor");
    const rolled = rollFormula(rollDefinition.formula);
    const roll = createTimestamped("roll", {
      campaignId: request.params.campaignId,
      userId,
      formula: rollDefinition.formula,
      label: rollDefinition.label,
      visibility: request.body.visibility ?? "public",
      terms: rolled.terms,
      total: rolled.total
    }) satisfies DiceRoll;
    const message = createTimestamped("msg", {
      campaignId: request.params.campaignId,
      userId,
      type: "roll" as const,
      body: `${actor.name} ${rollDefinition.label}: ${rollDefinition.formula} = ${roll.total}`,
      visibility: roll.visibility,
      recipientUserIds: [],
      rollId: roll.id
    }) satisfies ChatMessage;
    store.state.rolls.push(roll);
    store.state.chat.push(message);
    store.save();
    broadcast(
      createEvent({
        campaignId: roll.campaignId,
        type: "dice.roll.created",
        actorUserId: userId,
        targetId: roll.id,
        payload: roll
      })
    );
    broadcast(
      createEvent({
        campaignId: message.campaignId,
        type: "chat.message.created",
        actorUserId: userId,
        targetId: message.id,
        payload: message
      })
    );
    return { roll, chat: message, quickRoll: rollDefinition };
  });

  app.post<{
    Body: (typeof installedSystems)[number] & { campaignId?: string };
  }>("/api/v1/systems/install", async (request, reply) => {
    const campaignId = request.body.campaignId ?? store.state.members.find((member) => member.userId === currentUserId(store, request.headers))?.campaignId;
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
    return await withArchivedAssetFiles(makeArchive(store.state, request.params.campaignId), assetStorage);
  });

  app.post<{
    Body: CampaignArchive | { archive: CampaignArchive; mode?: "upsert" | "reject_conflicts" };
  }>("/api/v1/import/campaign", async (request, reply) => {
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

    const restoredAssetFiles = await restoreArchivedAssetFiles(assetStorage, archive);
    const counts = mergeArchive(store.state, archive);
    store.save();
    return {
      importedCampaignIds: archive.data.campaigns.map((item) => item.id),
      counts,
      conflicts,
      assetFiles: restoredAssetFiles
    };
  });

  return app;
}

const ALL_PERMISSIONS: PermissionName[] = ["campaign.read", "campaign.update", "campaign.delete", "scene.read", "scene.create", "scene.update", "scene.delete", "scene.activate", "token.read", "token.create", "token.update", "token.move", "token.delete", "token.reveal", "actor.read", "actor.create", "actor.update", "actor.delete", "actor.readPrivate", "actor.updateOwned", "journal.read", "journal.readSecret", "journal.create", "journal.update", "journal.delete", "chat.read", "chat.write", "chat.moderate", "combat.manage", "plugin.install", "plugin.configure", "dice.roll", "ai.use", "ai.readPublicMemory", "ai.readGmMemory", "ai.proposeChanges", "ai.applyChanges"];

function createConfiguredAiProvider(): AiProvider {
  if (process.env.OTTE_AI_PROVIDER === "codex-loopback") {
    return new CodexAppServerProvider({
      transport: new LoopbackCodexTransport(),
      approvalMode: "proposal"
    });
  }
  if (process.env.OTTE_AI_PROVIDER === "openai" || process.env.OTTE_AI_PROVIDER === "openai-responses") {
    return new OpenAiResponsesProvider({
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
      organization: process.env.OPENAI_ORGANIZATION ?? process.env.OPENAI_ORG_ID,
      project: process.env.OPENAI_PROJECT ?? process.env.OPENAI_PROJECT_ID
    });
  }
  return new EchoAiProvider();
}

function defaultMemoryExtractionSource(store: StateStore, campaignId: string): string {
  const chat = store.state.chat
    .filter((message) => message.campaignId === campaignId)
    .slice(-8)
    .map((message) => `${message.type}: ${message.body}`);
  const journals = store.state.journals
    .filter((journal) => journal.campaignId === campaignId)
    .slice(-4)
    .map((journal) => `${journal.title}: ${journal.body}`);
  const source = [...journals, ...chat].join("\n").trim();
  return source || "No recent campaign text was available for extraction.";
}

function extractedMemoryText(providerOutput: string, sourceText: string): string {
  const text = providerOutput.trim() || `Extracted memory: ${sourceText}`;
  return text.slice(0, 500);
}

function createAiThreadTools(): AiToolDefinition[] {
  return [
    {
      name: "create_proposal",
      description: "Create a pending OpenTabletop proposal for GM approval.",
      requiredPermissions: ["ai.proposeChanges"],
      async execute(input: unknown, context: AiToolContext): Promise<ProposalToolOutput> {
        const request = isRecord(input) ? input : {};
        const title = stringFromRecord(request, "title") ?? "AI Tool Proposal";
        const summary = stringFromRecord(request, "summary") ?? title;
        const changes = Array.isArray(request.changes) ? request.changes.filter(isProposalChange) : [];
        const proposalId = await context.createProposal({ title, summary, changes });
        return {
          proposalId,
          title,
          changeCount: changes.length
        };
      }
    }
  ];
}

interface ProposalToolOutput {
  proposalId: string;
  title: string;
  changeCount: number;
}

function createAiToolContext(store: StateStore, campaignId: string, userId: string, permissions: PermissionName[]): AiToolContext {
  return {
    campaignId,
    userId,
    permissions,
    state: store.state,
    createProposal: async ({ title, summary, changes }) => {
      const proposal = createTimestamped("prop", {
        campaignId,
        createdByUserId: userId,
        createdByType: "ai" as const,
        title,
        summary,
        status: "pending" as const,
        changesJson: normalizeProposalChanges(changes, campaignId, userId),
        diffJson: {
          source: "ai_tool"
        },
        approvalRequired: true
      }) satisfies Proposal;
      store.state.proposals.push(proposal);
      return proposal.id;
    }
  };
}

function normalizeProposalChanges(changes: ProposalChange[], campaignId: string, userId: string): ProposalChange[] {
  return changes.map((change) => {
    if (change.action !== "create") return change;
    const data = {
      ...change.data
    };
    if (typeof data.id !== "string") data.id = createId(prefixForProposalEntity(change.entity));
    if (change.entity !== "token" && typeof data.campaignId !== "string") data.campaignId = campaignId;
    if (typeof data.createdAt !== "string") data.createdAt = nowIso();
    if (typeof data.updatedAt !== "string") data.updatedAt = data.createdAt;

    if (change.entity === "journal") {
      if (typeof data.visibility !== "string") data.visibility = "gm_only";
      if (!Array.isArray(data.visibleToUserIds)) data.visibleToUserIds = [];
      if (!Array.isArray(data.visibleToActorIds)) data.visibleToActorIds = [];
      if (!Array.isArray(data.tags)) data.tags = ["ai"];
      if (typeof data.createdBy !== "string") data.createdBy = userId;
      if (typeof data.updatedBy !== "string") data.updatedBy = userId;
    }

    return {
      ...change,
      data
    };
  });
}

function prefixForProposalEntity(entity: ProposalChange["entity"]): string {
  switch (entity) {
    case "campaign":
      return "camp";
    case "scene":
      return "scn";
    case "token":
      return "tok";
    case "actor":
      return "act";
    case "item":
      return "item";
    case "journal":
      return "jnl";
    case "chat":
      return "msg";
    case "encounter":
      return "enc";
    case "combat":
      return "cmb";
  }
}

async function executeAiTool(tools: AiToolDefinition[], toolName: string, input: unknown, context: AiToolContext): Promise<unknown> {
  const tool = tools.find((item) => item.name === toolName);
  if (!tool) return { error: "unknown_tool", toolName };

  const missingPermission = tool.requiredPermissions.find((permission) => !context.permissions.includes(permission));
  if (missingPermission) {
    return {
      error: "missing_permission",
      permission: missingPermission
    };
  }

  return tool.execute(input, context);
}

function isProposalToolOutput(value: unknown): value is ProposalToolOutput {
  return isRecord(value) && typeof value.proposalId === "string";
}

function isProposalChange(value: unknown): value is ProposalChange {
  if (!isRecord(value)) return false;
  return (
    typeof value.entity === "string" &&
    typeof value.action === "string" &&
    isRecord(value.data) &&
    ["campaign", "scene", "token", "actor", "item", "journal", "chat", "encounter", "combat"].includes(value.entity) &&
    ["create", "update", "delete"].includes(value.action)
  );
}

function stringFromRecord(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeFogRegion(body: { x?: number; y?: number; radius?: number; hidden?: boolean; shape?: FogShape; mode?: FogMode; points?: VisionPoint[] }, scene: Scene): Omit<FogRegion, "id"> | undefined {
  const rawPoints = Array.isArray(body.points) ? body.points : undefined;
  const shape: FogShape = body.shape === "polygon" || rawPoints?.length ? "polygon" : "circle";
  const mode: FogMode = body.mode === "hide" ? "hide" : "reveal";
  if (shape === "polygon") {
    const points = normalizeFogPoints(rawPoints, scene);
    if (!points) return undefined;
    const center = polygonCenter(points);
    return {
      x: center.x,
      y: center.y,
      radius: 0,
      hidden: body.hidden ?? false,
      shape,
      mode,
      points
    };
  }
  const x = clampNumber(body.x ?? scene.width / 2, 0, scene.width);
  const y = clampNumber(body.y ?? scene.height / 2, 0, scene.height);
  const radius = clampNumber(body.radius ?? 120, 1, Math.max(scene.width, scene.height));
  if (x === undefined || y === undefined || radius === undefined) return undefined;
  return {
    x,
    y,
    radius,
    hidden: body.hidden ?? false,
    shape,
    mode
  };
}

function normalizeFogPoints(points: unknown[] | undefined, scene: Scene): VisionPoint[] | undefined {
  if (!points || points.length < 3 || points.length > 64) return undefined;
  const normalized = points
    .map((point) => {
      if (!isRecord(point)) return undefined;
      const x = typeof point.x === "number" ? clampNumber(point.x, 0, scene.width) : undefined;
      const y = typeof point.y === "number" ? clampNumber(point.y, 0, scene.height) : undefined;
      return x === undefined || y === undefined ? undefined : { x, y };
    })
    .filter((point): point is VisionPoint => Boolean(point));
  return normalized.length >= 3 ? normalized : undefined;
}

function polygonCenter(points: VisionPoint[]): VisionPoint {
  return {
    x: Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: Math.round(points.reduce((sum, point) => sum + point.y, 0) / points.length)
  };
}

function clampNumber(value: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function clampLightIntensity(value: number): number {
  return Math.max(0.05, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function permissionsForUser(store: StateStore, userId: string, campaignId: string): PermissionName[] {
  return ALL_PERMISSIONS.filter((permission) => canCampaign(store, userId, campaignId, permission));
}

function visibleTokensForUser(store: StateStore, userId: string, campaignId: string, tokens: Token[]): Token[] {
  if (canReadHiddenTokens(store, userId, campaignId)) return tokens;
  return tokens.filter((token) => isTokenVisibleToUser(store, userId, campaignId, token, tokens));
}

function canReadHiddenTokens(store: StateStore, userId: string, campaignId: string): boolean {
  return canCampaign(store, userId, campaignId, "token.update") || canCampaign(store, userId, campaignId, "scene.update");
}

function canMoveToken(store: StateStore, userId: string, campaignId: string, token: Token): boolean {
  if (canReadHiddenTokens(store, userId, campaignId)) return true;
  return canCampaign(store, userId, campaignId, "token.move") && isTokenOwnedByUser(store, userId, token);
}

function isTokenVisibleToUser(store: StateStore, userId: string, campaignId: string, token: Token, sceneTokens?: Token[]): boolean {
  if (canReadHiddenTokens(store, userId, campaignId)) return true;
  if (token.hidden) return false;
  if (isTokenOwnedByUser(store, userId, token)) return true;
  const scene = store.state.scenes.find((item) => item.id === token.sceneId);
  if (!scene) return false;
  const activeFog = scene.fog.filter((region) => !region.hidden);
  if (activeFog.length === 0) return true;
  const center = centerOfToken(token);
  const fogPolygons = activeFog.map((region) => computeFogRevealPolygon(scene, region)).filter((polygon): polygon is VisionPolygon => Boolean(polygon));
  const hidePolygons = fogPolygons.filter((polygon) => polygon.mode === "hide");
  if (isPointInsideVisionPolygons(center, hidePolygons)) return false;
  const revealPolygons = fogPolygons.filter((polygon) => polygon.mode !== "hide");
  if (isPointInsideVisionPolygons(center, revealPolygons)) return true;
  return isPointInsideVisionPolygons(center, ownedVisionPolygonsForUser(store, userId, scene, sceneTokens));
}

function isTokenOwnedByUser(store: StateStore, userId: string, token: Token): boolean {
  return Boolean(token.actorId && store.state.actors.some((actor) => actor.id === token.actorId && actor.ownerUserId === userId));
}

function visionSnapshotForUser(store: StateStore, userId: string, campaignId: string, scene: Scene): VisionSnapshot {
  const activeFog = scene.fog.filter((region) => !region.hidden);
  const lightPolygons = scene.lights.map((light) => computeLightVisionPolygon(scene, light));
  if (canReadHiddenTokens(store, userId, campaignId) || activeFog.length === 0) {
    return {
      sceneId: scene.id,
      userId,
      fogActive: false,
      polygons: lightPolygons
    };
  }
  const fogPolygons = activeFog.map((region) => computeFogRevealPolygon(scene, region)).filter((polygon): polygon is VisionPolygon => Boolean(polygon));
  return {
    sceneId: scene.id,
    userId,
    fogActive: true,
    polygons: [...fogPolygons, ...ownedVisionPolygonsForUser(store, userId, scene), ...lightPolygons]
  };
}

function ownedVisionPolygonsForUser(store: StateStore, userId: string, scene: Scene, sceneTokens?: Token[]): VisionPolygon[] {
  const tokens = sceneTokens ?? store.state.tokens.filter((item) => item.sceneId === scene.id);
  return tokens
    .filter((item) => item.visionEnabled && item.visionRadius > 0 && isTokenOwnedByUser(store, userId, item))
    .map((token) => computeTokenVisionPolygon(scene, token))
    .filter((polygon): polygon is VisionPolygon => Boolean(polygon));
}

function filterRealtimeEvent(store: StateStore, event: EngineEvent, userId: string | undefined): EngineEvent | undefined {
  if (!userId || !event.type.startsWith("token.")) return event;
  const token = event.payload as Partial<Token> | undefined;
  if (!token?.sceneId) return event;
  const campaignId = campaignIdForScene(store, token.sceneId) ?? event.campaignId;
  if (isTokenVisibleToUser(store, userId, campaignId, token as Token)) return event;
  return {
    ...event,
    type: "scene.updated",
    targetId: token.sceneId,
    payload: { id: token.sceneId, redacted: true }
  };
}

function memberSessionInfo(
  store: StateStore,
  member: CampaignMember
): CampaignMember & {
  user: Pick<User, "id" | "displayName" | "email">;
  permissions: PermissionName[];
} {
  const user = store.state.users.find((item) => item.id === member.userId);
  const grantPermissions = store.state.permissionGrants.filter((grant) => grant.campaignId === member.campaignId && grant.subjectType === "user" && grant.subjectId === member.userId && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now())).flatMap((grant) => grant.permissions);
  return {
    ...member,
    user: {
      id: member.userId,
      displayName: user?.displayName ?? member.userId,
      email: user?.email
    },
    permissions: [...new Set([...permissionsForRole(member.role), ...grantPermissions])]
  };
}

interface OidcProviderConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
  displayName: string;
  tokenAuth: "client_secret_basic" | "client_secret_post" | "none";
}

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

interface OidcTokenResponse {
  access_token?: string;
  token_type?: string;
  id_token?: string;
  expires_in?: number;
}

interface OidcClaims {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
  preferred_username?: unknown;
}

function oidcProviderConfig(headers: Record<string, string | string[] | undefined>): OidcProviderConfig | undefined {
  const issuer = process.env.OTTE_OIDC_ISSUER?.replace(/\/+$/, "");
  const clientId = process.env.OTTE_OIDC_CLIENT_ID;
  if (!issuer || !clientId) return undefined;
  if (!isAllowedIssuerUrl(issuer)) throw new Error("OTTE_OIDC_ISSUER must use HTTPS unless it is localhost or OTTE_OIDC_ALLOW_INSECURE=true");
  return {
    issuer,
    clientId,
    clientSecret: process.env.OTTE_OIDC_CLIENT_SECRET,
    redirectUri: process.env.OTTE_OIDC_REDIRECT_URI ?? `${requestBaseUrl(headers)}/api/v1/auth/oidc/callback`,
    scope: process.env.OTTE_OIDC_SCOPE ?? "openid email profile",
    displayName: process.env.OTTE_OIDC_DISPLAY_NAME ?? "Single Sign-On",
    tokenAuth: oidcTokenAuthMethod(process.env.OTTE_OIDC_TOKEN_AUTH, process.env.OTTE_OIDC_CLIENT_SECRET)
  };
}

async function createOidcAuthorization(store: StateStore, config: OidcProviderConfig, requestedReturnTo: string | undefined): Promise<{ authorizationUrl: string; expiresAt: string; provider: Pick<OidcProviderConfig, "issuer" | "clientId" | "scope" | "displayName" | "redirectUri"> }> {
  const discovery = await discoverOidc(config);
  const stateToken = `oss_${randomBytes(32).toString("base64url")}`;
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const oauthState = createTimestamped("oauth", {
    provider: "oidc" as const,
    issuer: config.issuer,
    stateHash: hashSessionToken(stateToken),
    codeVerifier,
    nonceHash: hashSessionToken(nonce),
    redirectUri: config.redirectUri,
    returnTo: sanitizeReturnTo(requestedReturnTo),
    expiresAt
  }) satisfies OAuthLoginState;
  store.state.oauthStates.push(oauthState);
  pruneExpiredOAuthStates(store);
  store.save();

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", stateToken);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", base64Url(createHash("sha256").update(codeVerifier).digest()));
  url.searchParams.set("code_challenge_method", "S256");

  return {
    authorizationUrl: url.toString(),
    expiresAt,
    provider: {
      issuer: config.issuer,
      clientId: config.clientId,
      scope: config.scope,
      displayName: config.displayName,
      redirectUri: config.redirectUri
    }
  };
}

async function completeOidcCallback(
  store: StateStore,
  config: OidcProviderConfig,
  code: string,
  stateToken: string
): Promise<{ token: string; session: UserSession; user: User; identity: AuthIdentity; returnTo?: string }> {
  pruneExpiredOAuthStates(store);
  const stateHash = hashSessionToken(stateToken);
  const stateIndex = store.state.oauthStates.findIndex((state) => state.provider === "oidc" && state.issuer === config.issuer && state.stateHash === stateHash && Date.parse(state.expiresAt) > Date.now());
  if (stateIndex < 0) throw new Error("Unknown or expired OIDC state");
  const oauthState = store.state.oauthStates.splice(stateIndex, 1)[0]!;
  store.save();
  const discovery = await discoverOidc(config);
  const token = await exchangeOidcCode(config, discovery, oauthState, code);
  const claims = await fetchOidcUserInfo(discovery, token);
  const { user, identity } = upsertOidcUser(store, config, claims);
  if (isDisabledUser(user)) throw new Error("User account is disabled");
  const session = createUserSession(store, user.id);
  return {
    token: session.token,
    session: session.session,
    user,
    identity,
    returnTo: oauthState.returnTo
  };
}

async function discoverOidc(config: OidcProviderConfig): Promise<OidcDiscoveryDocument> {
  const discoveryUrl = `${config.issuer}/.well-known/openid-configuration`;
  const document = await fetchJson<Partial<OidcDiscoveryDocument>>(discoveryUrl);
  if (document.issuer !== config.issuer) throw new Error("OIDC discovery issuer mismatch");
  if (!document.authorization_endpoint || !document.token_endpoint) throw new Error("OIDC discovery document is missing required endpoints");
  if (!document.userinfo_endpoint) throw new Error("OIDC discovery document is missing userinfo_endpoint");
  return {
    issuer: document.issuer,
    authorization_endpoint: document.authorization_endpoint,
    token_endpoint: document.token_endpoint,
    userinfo_endpoint: document.userinfo_endpoint
  };
}

async function exchangeOidcCode(config: OidcProviderConfig, discovery: OidcDiscoveryDocument, oauthState: OAuthLoginState, code: string): Promise<OidcTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthState.redirectUri,
    client_id: config.clientId,
    code_verifier: oauthState.codeVerifier
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (config.clientSecret && config.tokenAuth === "client_secret_basic") {
    headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  } else if (config.clientSecret && config.tokenAuth === "client_secret_post") {
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers,
    body
  });
  if (!response.ok) throw new Error(`Token endpoint returned ${response.status}`);
  const token = (await response.json()) as OidcTokenResponse;
  if (!token.access_token) throw new Error("Token endpoint did not return an access token");
  return token;
}

async function fetchOidcUserInfo(discovery: OidcDiscoveryDocument, token: OidcTokenResponse): Promise<{ subject: string; email?: string; displayName: string }> {
  const response = await fetch(discovery.userinfo_endpoint!, {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  if (!response.ok) throw new Error(`UserInfo endpoint returned ${response.status}`);
  const claims = (await response.json()) as OidcClaims;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) throw new Error("UserInfo response is missing sub");
  const email = typeof claims.email === "string" ? normalizeEmail(claims.email) : undefined;
  const name = typeof claims.name === "string" ? normalizeDisplayName(claims.name) : undefined;
  const preferredUsername = typeof claims.preferred_username === "string" ? normalizeDisplayName(claims.preferred_username) : undefined;
  return {
    subject: claims.sub,
    email,
    displayName: name ?? preferredUsername ?? email?.split("@")[0] ?? claims.sub
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

function upsertOidcUser(store: StateStore, config: OidcProviderConfig, claims: { subject: string; email?: string; displayName: string }): { user: User; identity: AuthIdentity } {
  const existingIdentity = store.state.identities.find((identity) => identity.provider === "oidc" && identity.issuer === config.issuer && identity.subject === claims.subject);
  if (existingIdentity) {
    const user = store.state.users.find((item) => item.id === existingIdentity.userId);
    if (!user) throw new Error("OIDC identity points to a missing user");
    if (claims.email && user.email !== claims.email) {
      user.email = claims.email;
      user.updatedAt = nowIso();
    }
    existingIdentity.email = claims.email;
    existingIdentity.updatedAt = nowIso();
    return { user, identity: existingIdentity };
  }

  let user = claims.email ? store.state.users.find((item) => normalizeEmail(item.email) === claims.email) : undefined;
  if (!user) {
    user = createTimestamped("usr", {
      displayName: claims.displayName,
      email: claims.email
    }) satisfies User;
    store.state.users.push(user);
  }
  const identity = createTimestamped("ident", {
    userId: user.id,
    provider: "oidc" as const,
    issuer: config.issuer,
    subject: claims.subject,
    email: claims.email
  }) satisfies AuthIdentity;
  store.state.identities.push(identity);
  return { user, identity };
}

function publicIdentity(identity: AuthIdentity): Omit<AuthIdentity, "createdAt" | "updatedAt"> {
  return {
    id: identity.id,
    userId: identity.userId,
    provider: identity.provider,
    issuer: identity.issuer,
    subject: identity.subject,
    email: identity.email
  };
}

function pruneExpiredOAuthStates(store: StateStore): void {
  const now = Date.now();
  store.state.oauthStates = store.state.oauthStates.filter((state) => Date.parse(state.expiresAt) > now);
}

function oidcTokenAuthMethod(value: string | undefined, clientSecret: string | undefined): OidcProviderConfig["tokenAuth"] {
  if (value === "client_secret_post" || value === "none") return value;
  if (value === "client_secret_basic") return value;
  return clientSecret ? "client_secret_basic" : "none";
}

function requestBaseUrl(headers: Record<string, string | string[] | undefined>): string {
  const configured = process.env.OTTE_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const proto = headerValue(headers["x-forwarded-proto"]) ?? "http";
  const host = headerValue(headers["x-forwarded-host"]) ?? headerValue(headers.host) ?? "localhost:4000";
  return `${proto}://${host}`;
}

function sanitizeReturnTo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const allowedOrigins = new Set(
      [
        process.env.OTTE_WEB_ORIGIN,
        ...(process.env.OTTE_OIDC_ALLOWED_RETURN_ORIGINS?.split(",") ?? [])
      ]
        .map((origin) => origin?.trim().replace(/\/+$/, ""))
        .filter((origin): origin is string => Boolean(origin))
    );
    if (isLocalhostUrl(url) || allowedOrigins.has(url.origin)) return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function ssoRedirectUrl(returnTo: string, token: string, userId: string): string {
  const url = new URL(returnTo);
  url.hash = new URLSearchParams({
    ssoToken: token,
    ssoUserId: userId
  }).toString();
  return url.toString();
}

function isAllowedIssuerUrl(value: string): boolean {
  if (process.env.OTTE_OIDC_ALLOW_INSECURE === "true") return true;
  const url = new URL(value);
  return url.protocol === "https:" || isLocalhostUrl(url);
}

function isLocalhostUrl(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findLoginUser(store: StateStore, input: { userId?: string; email?: string }): User | undefined {
  const email = normalizeEmail(input.email);
  return store.state.users.find((user) => user.id === input.userId || (email !== undefined && normalizeEmail(user.email) === email));
}

function resolveInviteUser(store: StateStore, headers: Record<string, string | string[] | undefined>, input: { userId?: string; email?: string; displayName?: string; password?: string }, reply: FastifyReply): User | FastifyReply {
  const session = sessionFromRequest(store, undefined, headers);
  if (session) {
    const sessionUser = store.state.users.find((user) => user.id === session.userId);
    return sessionUser ?? unauthorized(reply, "Unknown user session");
  }

  const existingUser = findLoginUser(store, input);
  if (existingUser) {
    if (existingUser.passwordHash && !verifyPassword(input.password ?? "", existingUser.passwordHash)) return unauthorized(reply, "Invalid login credentials");
    return existingUser;
  }
  if (input.userId) return unauthorized(reply, "Unknown login identity");

  const email = normalizeEmail(input.email);
  if (!email) return badRequest(reply, "A valid email is required");
  if (!isUsablePassword(input.password)) return badRequest(reply, "Password must be at least 8 characters");
  const displayName = normalizeDisplayName(input.displayName) ?? email.split("@")[0] ?? "Player";
  const user = createTimestamped("usr", {
    displayName,
    email,
    passwordHash: hashPassword(input.password)
  }) satisfies User;
  store.state.users.push(user);
  return user;
}

async function issuePasswordReset(store: StateStore, user: User, requestedByUserId: string | undefined, requestedReturnTo: string | undefined): Promise<{ reset: PasswordResetToken; email: EmailOutboxMessage; token: string }> {
  if (!user.email) throw new Error("User does not have an email address");
  pruneExpiredPasswordResetTokens(store);
  const token = `opr_${randomBytes(32).toString("base64url")}`;
  const reset = createTimestamped("reset", {
    userId: user.id,
    email: normalizeEmail(user.email)!,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + passwordResetTtlMs()).toISOString(),
    requestedByUserId
  }) satisfies PasswordResetToken;
  store.state.passwordResetTokens.push(reset);

  const resetUrl = passwordResetUrl(token, requestedReturnTo);
  const email = createTimestamped("email", {
    to: reset.email,
    subject: "Reset your OpenTabletop password",
    text: [
      `A password reset was requested for ${user.displayName}.`,
      resetUrl ? `Open this link to reset your password: ${resetUrl}` : `Use this reset token: ${token}`,
      "If you did not request this, you can ignore this message."
    ].join("\n\n"),
    status: "pending" as const,
    provider: emailWebhookUrl() ? "webhook" as const : "outbox" as const,
    metadata: {
      kind: "password_reset",
      userId: user.id,
      resetId: reset.id
    }
  }) satisfies EmailOutboxMessage;
  store.state.emailOutbox.push(email);
  await deliverEmailMessage(email);
  return { reset, email, token };
}

function confirmPasswordReset(store: StateStore, token: string | undefined, password: string): { token: string; session: UserSession; user: User } {
  if (!token) throw new Error("Missing password reset token");
  pruneExpiredPasswordResetTokens(store);
  const tokenHash = hashSessionToken(token);
  const reset = store.state.passwordResetTokens.find((item) => item.tokenHash === tokenHash && !item.usedAt && Date.parse(item.expiresAt) > Date.now());
  if (!reset) throw new Error("Unknown or expired password reset token");
  const user = store.state.users.find((item) => item.id === reset.userId);
  if (!user) throw new Error("Password reset user is missing");
  if (isDisabledUser(user)) throw new Error("User account is disabled");
  setUserPassword(user, password, false);
  const now = nowIso();
  reset.usedAt = now;
  reset.updatedAt = now;
  store.state.sessions = store.state.sessions.filter((session) => session.userId !== user.id);
  const session = createUserSession(store, user.id);
  return {
    token: session.token,
    session: session.session,
    user
  };
}

function setUserPassword(user: User, password: string, passwordResetRequired: boolean): void {
  const now = nowIso();
  user.passwordHash = hashPassword(password);
  user.passwordUpdatedAt = now;
  user.passwordResetRequired = passwordResetRequired;
  user.updatedAt = now;
}

function setUserDisabled(store: StateStore, user: User, disabled: boolean, adminUserId: string, reason: string | undefined): void {
  const now = nowIso();
  if (disabled) {
    user.disabledAt = user.disabledAt ?? now;
    user.disabledByUserId = adminUserId;
    user.disabledReason = normalizeDisplayName(reason) ?? reason?.trim().slice(0, 160);
    store.state.sessions = store.state.sessions.filter((session) => session.userId !== user.id);
  } else {
    user.disabledAt = undefined;
    user.disabledByUserId = undefined;
    user.disabledReason = undefined;
  }
  user.updatedAt = now;
}

function passwordResetUrl(token: string, requestedReturnTo: string | undefined): string | undefined {
  const configured = process.env.OTTE_PASSWORD_RESET_URL?.trim();
  const returnTo = configured || sanitizeReturnTo(requestedReturnTo) || (process.env.OTTE_WEB_ORIGIN ? `${process.env.OTTE_WEB_ORIGIN.replace(/\/+$/, "")}/reset-password` : undefined);
  if (!returnTo) return undefined;
  try {
    const url = new URL(returnTo);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return undefined;
  }
}

async function deliverEmailMessage(message: EmailOutboxMessage): Promise<void> {
  const webhookUrl = emailWebhookUrl();
  if (!webhookUrl) return;
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = process.env.OTTE_EMAIL_WEBHOOK_TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(publicEmailOutboxMessage(message)),
      signal: AbortSignal.timeout(emailWebhookTimeoutMs())
    });
    if (!response.ok) throw new Error(`Email webhook returned ${response.status}`);
    message.status = "delivered";
    message.sentAt = nowIso();
  } catch (error) {
    message.status = "failed";
    message.error = errorMessage(error).slice(0, 500);
  }
  message.updatedAt = nowIso();
}

function emailWebhookUrl(): string | undefined {
  return process.env.OTTE_EMAIL_WEBHOOK_URL?.trim() || undefined;
}

function emailWebhookTimeoutMs(): number {
  const value = Number(process.env.OTTE_EMAIL_WEBHOOK_TIMEOUT_MS);
  return Number.isFinite(value) ? Math.max(500, Math.min(30_000, value)) : 5_000;
}

function passwordResetTtlMs(): number {
  const value = Number(process.env.OTTE_PASSWORD_RESET_TTL_MINUTES);
  const minutes = Number.isFinite(value) ? Math.max(5, Math.min(24 * 60, value)) : 60;
  return minutes * 60 * 1000;
}

function publicPasswordResetToken(reset: PasswordResetToken): Omit<PasswordResetToken, "tokenHash"> {
  const { tokenHash: _tokenHash, ...safeReset } = reset;
  return safeReset;
}

function publicEmailOutboxMessage(message: EmailOutboxMessage): EmailOutboxMessage {
  return message;
}

function adminUserInfo(store: StateStore, user: User): Omit<User, "passwordHash"> & { disabled: boolean; membershipCount: number; identityCount: number; sessionCount: number } {
  return {
    ...publicUser(user),
    disabled: isDisabledUser(user),
    membershipCount: store.state.members.filter((member) => member.userId === user.id).length,
    identityCount: store.state.identities.filter((identity) => identity.userId === user.id).length,
    sessionCount: store.state.sessions.filter((session) => session.userId === user.id && Date.parse(session.expiresAt) > Date.now()).length
  };
}

function publicUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

type PublicInviteStatus = "pending" | "accepted" | "expired" | "revoked";

function publicInvite(invite: CampaignInvite): Omit<CampaignInvite, "tokenHash"> & { status: PublicInviteStatus } {
  const { tokenHash: _tokenHash, ...safeInvite } = invite;
  return {
    ...safeInvite,
    status: inviteStatus(invite)
  };
}

function inviteStatus(invite: CampaignInvite): PublicInviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  if (Date.parse(invite.expiresAt) <= Date.now()) return "expired";
  return "pending";
}

const invitableRoles = new Set<UserRole>(["gm", "assistant_gm", "player", "observer"]);

function isInvitableRole(value: unknown): value is UserRole {
  return invitableRoles.has(value as UserRole);
}

function inviteExpirationDays(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 14;
  return Math.min(30, Math.max(1, Math.trunc(value)));
}

function normalizeEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 254) return undefined;
  return email;
}

function normalizeDisplayName(value: string | undefined): string | undefined {
  const displayName = value?.trim();
  return displayName && displayName.length <= 80 ? displayName : undefined;
}

function isUsablePassword(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 8;
}

function canReadChatMessage(store: StateStore, userId: string, message: ChatMessage): boolean {
  if (message.visibility === "public") return true;
  if (message.visibility === "whisper") {
    return message.userId === userId || message.recipientUserIds.includes(userId) || canCampaign(store, userId, message.campaignId, "chat.moderate");
  }
  return canCampaign(store, userId, message.campaignId, "chat.moderate") || canCampaign(store, userId, message.campaignId, "journal.readSecret") || canCampaign(store, userId, message.campaignId, "ai.readGmMemory");
}

function currentUserId(store: StateStore, headers: Record<string, string | string[] | undefined>): string | undefined {
  const session = sessionFromRequest(store, undefined, headers);
  if (session && isActiveUserId(store, session.userId)) return session.userId;
  if (!legacyUserHeaderEnabled()) return undefined;
  const header = headers["x-user-id"];
  const userId = Array.isArray(header) ? header[0] : header;
  return userId && isActiveUserId(store, userId) ? userId : undefined;
}

function userIdFromRequest(store: StateStore, requestUrl: string | undefined, headers: Record<string, string | string[] | undefined>): string | undefined {
  const session = sessionFromRequest(store, requestUrl, headers);
  if (session && isActiveUserId(store, session.userId)) return session.userId;
  if (!legacyUserHeaderEnabled()) return undefined;
  const url = new URL(requestUrl ?? "/api/v1/realtime", "http://localhost");
  const userId = url.searchParams.get("userId") ?? currentUserId(store, headers);
  return userId && isActiveUserId(store, userId) ? userId : undefined;
}

function createUserSession(store: StateStore, userId: string): { token: string; session: UserSession } {
  const token = `ots_${randomBytes(32).toString("base64url")}`;
  const now = nowIso();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const session = createTimestamped("sess", {
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    lastSeenAt: now
  }) satisfies UserSession;
  store.state.sessions.push(session);
  return { token, session };
}

function sessionFromRequest(store: StateStore, requestUrl: string | undefined, headers: Record<string, string | string[] | undefined>): UserSession | undefined {
  const token = sessionTokenFromRequest(requestUrl, headers);
  if (!token) return undefined;
  const tokenHash = hashSessionToken(token);
  const now = Date.now();
  const session = store.state.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > now);
  if (session) session.lastSeenAt = nowIso();
  return session;
}

function sessionTokenFromRequest(requestUrl: string | undefined, headers: Record<string, string | string[] | undefined>): string | undefined {
  const authorization = headerValue(headers.authorization);
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice("bearer ".length).trim();
  const explicitHeader = headerValue(headers["x-session-token"]);
  if (explicitHeader) return explicitHeader;
  const cookie = headerValue(headers.cookie);
  const cookieToken = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("otte_session="))
    ?.slice("otte_session=".length);
  if (cookieToken) return decodeURIComponent(cookieToken);
  const url = new URL(requestUrl ?? "/api/v1/realtime", "http://localhost");
  return url.searchParams.get("sessionToken") ?? undefined;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString("base64url")}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expected] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const expectedBytes = Buffer.from(expected, "base64url");
  const actualBytes = scryptSync(password, salt, expectedBytes.length);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function hashSessionToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function pruneExpiredSessions(store: StateStore): void {
  const now = Date.now();
  store.state.sessions = store.state.sessions.filter((session) => Date.parse(session.expiresAt) > now);
}

function pruneExpiredPasswordResetTokens(store: StateStore): void {
  const now = Date.now();
  store.state.passwordResetTokens = store.state.passwordResetTokens.filter((reset) => !reset.usedAt && Date.parse(reset.expiresAt) > now);
}

function publicSession(session: UserSession): Pick<UserSession, "id" | "userId" | "expiresAt" | "lastSeenAt" | "createdAt" | "updatedAt"> {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requireUser(store: StateStore, reply: FastifyReply, headers: Record<string, string | string[] | undefined>): string | FastifyReply {
  const userId = currentUserId(store, headers);
  if (!userId) return unauthorized(reply, "Missing session token");
  const user = store.state.users.find((item) => item.id === userId);
  if (!user) return unauthorized(reply, "Unknown user session");
  if (isDisabledUser(user)) return forbidden(reply, "User account is disabled");
  return userId;
}

function requireServerAdmin(store: StateStore, reply: FastifyReply, headers: Record<string, string | string[] | undefined>): string | FastifyReply {
  const userId = requireUser(store, reply, headers);
  if (typeof userId !== "string") return userId;
  if (!serverAdminUserIds().has(userId)) return forbidden(reply, "Server admin access required");
  return userId;
}

function serverAdminUserIds(): Set<string> {
  return new Set(
    (process.env.OTTE_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isActiveUserId(store: StateStore, userId: string): boolean {
  const user = store.state.users.find((item) => item.id === userId);
  return Boolean(user && !isDisabledUser(user));
}

function isDisabledUser(user: User): boolean {
  return Boolean(user.disabledAt);
}

function legacyUserHeaderEnabled(): boolean {
  return process.env.OTTE_ALLOW_LEGACY_USER_HEADER === "true" || process.env.NODE_ENV === "test";
}

function requireCampaignPermission(store: StateStore, reply: FastifyReply, headers: Record<string, string | string[] | undefined>, campaignId: string, permission: PermissionName): true | FastifyReply {
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

function canCampaign(store: StateStore, userId: string, campaignId: string, permission: PermissionName): boolean {
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

function campaignSceneIds(store: StateStore, campaignId: string): string[] {
  return store.state.scenes.filter((scene) => scene.campaignId === campaignId).map((scene) => scene.id);
}

function findPluginGrant(store: StateStore, campaignId: string, pluginId: string): PermissionGrant | undefined {
  return store.state.permissionGrants.find((grant) => grant.subjectType === "plugin" && grant.subjectId === pluginId && grant.campaignId === campaignId && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()));
}

function pluginCan(store: StateStore, campaignId: string, pluginId: string, permission: PermissionName): boolean {
  return findPluginGrant(store, campaignId, pluginId)?.permissions.includes(permission) ?? false;
}

function findSystemActor(store: StateStore, campaignId: string, systemId: string, actorId: string): Actor | undefined {
  return store.state.actors.find((actor) => actor.id === actorId && actor.campaignId === campaignId && actor.systemId === systemId);
}

function truthyQuery(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function normalizeAssetMimeType(value: string | string[] | undefined): string {
  const contentType = Array.isArray(value) ? value[0] : value;
  const mimeType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mimeType && mimeType.length > 0 ? mimeType : "application/octet-stream";
}

function displayNameFromHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const decoded = safeDecodeURIComponent(raw);
  return basename(decoded).trim() || undefined;
}

interface AssetOperationOptions {
  campaignId?: string;
  assetIds?: string[];
  dryRun?: boolean;
}

interface AssetMigrationOptions extends AssetOperationOptions {
  includeDeleted?: boolean;
  overwrite?: boolean;
}

interface AssetCleanupOptions extends AssetOperationOptions {
  includeDeleted?: boolean;
  includeExpired?: boolean;
  graceDays?: number;
}

interface AssetOperationItem {
  assetId: string;
  name: string;
  campaignId: string;
  fromProvider?: string;
  toProvider?: string;
  status: "migrated" | "deleted" | "planned" | "skipped" | "failed" | "missing_marked";
  reason?: string;
  sizeBytes?: number;
  storage?: MapAsset["storage"];
}

async function migrateStoredAssets(store: StateStore, targetStorage: AssetStorage, uploadDir: string, options: AssetMigrationOptions): Promise<Record<string, unknown>> {
  const assets = selectAssetOperationTargets(store, options);
  const results: AssetOperationItem[] = [];
  let migrated = 0;
  let planned = 0;
  let skipped = 0;
  let failed = 0;
  let changed = false;

  for (const asset of assets) {
    const fromProvider = asset.storage?.provider ?? "unmanaged";
    const base = assetOperationBase(asset, fromProvider, targetStorage.provider);
    if (!asset.url.startsWith("/api/v1/assets/")) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "external_asset_url" });
      continue;
    }
    if (asset.lifecycle?.status === "deleted" && !options.includeDeleted) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "deleted_asset" });
      continue;
    }
    if (asset.lifecycle?.storageDeletedAt) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "storage_already_deleted" });
      continue;
    }
    if (!options.overwrite && fromProvider === targetStorage.provider) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "already_on_target" });
      continue;
    }

    try {
      const sourceStorage = sourceStorageForAsset(asset, targetStorage, uploadDir);
      const body = await sourceStorage.read(asset);
      if (!body) {
        failed++;
        results.push({ ...base, status: "failed", reason: "asset_bytes_missing" });
        continue;
      }
      const checksum = checksumForBuffer(body);
      if (body.length !== asset.sizeBytes || (asset.checksum && asset.checksum !== checksum)) {
        failed++;
        results.push({ ...base, status: "failed", reason: "asset_integrity_mismatch", sizeBytes: body.length });
        continue;
      }
      if (options.dryRun) {
        planned++;
        results.push({ ...base, status: "planned", reason: "migration_verified", sizeBytes: body.length });
        continue;
      }
      const previousStorage = asset.storage;
      asset.storage = undefined;
      try {
        asset.storage = await targetStorage.put(asset, body);
      } catch (error) {
        asset.storage = previousStorage;
        throw error;
      }
      asset.url = `/api/v1/assets/${asset.id}/blob`;
      asset.updatedAt = nowIso();
      changed = true;
      migrated++;
      results.push({ ...base, toProvider: targetStorage.provider, status: "migrated", sizeBytes: body.length, storage: asset.storage });
    } catch (error) {
      failed++;
      results.push({ ...base, status: "failed", reason: errorMessage(error) });
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    targetProvider: targetStorage.provider,
    assetCount: assets.length,
    migrated,
    planned,
    skipped,
    failed,
    changed,
    results
  };
}

async function cleanupStoredAssets(store: StateStore, activeStorage: AssetStorage, uploadDir: string, options: AssetCleanupOptions, adminUserId: string): Promise<Record<string, unknown>> {
  const assets = selectAssetOperationTargets(store, options);
  const results: AssetOperationItem[] = [];
  const cutoffMs = Date.now() - assetCleanupGraceDays(options.graceDays) * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let planned = 0;
  let skipped = 0;
  let failed = 0;
  let missingMarked = 0;
  let changed = false;

  for (const asset of assets) {
    const base = assetOperationBase(asset, asset.storage?.provider ?? "unmanaged", activeStorage.provider);
    const cleanupReason = assetCleanupReason(asset, options, cutoffMs);
    if (!cleanupReason) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "not_cleanup_eligible" });
      continue;
    }
    if (!asset.storage) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "no_storage_ref" });
      continue;
    }
    if (asset.lifecycle?.storageDeletedAt) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "storage_already_deleted" });
      continue;
    }
    if (options.dryRun) {
      planned++;
      results.push({ ...base, status: "planned", reason: cleanupReason });
      continue;
    }

    try {
      const sourceStorage = sourceStorageForAsset(asset, activeStorage, uploadDir);
      const objectDeleted = await sourceStorage.delete(asset);
      markAssetStorageDeleted(asset, cleanupReason, adminUserId);
      changed = true;
      if (objectDeleted) {
        deleted++;
        results.push({ ...base, status: "deleted", reason: cleanupReason });
      } else {
        missingMarked++;
        results.push({ ...base, status: "missing_marked", reason: cleanupReason });
      }
    } catch (error) {
      failed++;
      results.push({ ...base, status: "failed", reason: errorMessage(error) });
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    graceDays: assetCleanupGraceDays(options.graceDays),
    assetCount: assets.length,
    deleted,
    missingMarked,
    planned,
    skipped,
    failed,
    changed,
    results
  };
}

function selectAssetOperationTargets(store: StateStore, options: AssetOperationOptions): MapAsset[] {
  const assetIds = new Set((options.assetIds ?? []).filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  return store.state.assets.filter((asset) => {
    if (options.campaignId && asset.campaignId !== options.campaignId) return false;
    if (assetIds.size > 0 && !assetIds.has(asset.id)) return false;
    return true;
  });
}

function sourceStorageForAsset(asset: MapAsset, activeStorage: AssetStorage, uploadDir: string): AssetStorage {
  if (!asset.storage || asset.storage.provider === activeStorage.provider) return activeStorage;
  return createAssetStorageForProvider(asset.storage.provider, { uploadDir });
}

function assetOperationBase(asset: MapAsset, fromProvider: string, toProvider: string): Omit<AssetOperationItem, "status"> {
  return {
    assetId: asset.id,
    campaignId: asset.campaignId,
    name: asset.name,
    fromProvider,
    toProvider,
    sizeBytes: asset.sizeBytes,
    storage: asset.storage
  };
}

function assetCleanupReason(asset: MapAsset, options: AssetCleanupOptions, cutoffMs: number): string | undefined {
  const includeDeleted = options.includeDeleted ?? true;
  const includeExpired = options.includeExpired ?? true;
  if (includeDeleted && asset.lifecycle?.status === "deleted" && lifecycleChangeTime(asset) <= cutoffMs) return "deleted_asset";
  const expiresAt = asset.lifecycle?.expiresAt ? Date.parse(asset.lifecycle.expiresAt) : Number.NaN;
  if (includeExpired && Number.isFinite(expiresAt) && expiresAt <= cutoffMs) return "expired_asset";
  return undefined;
}

function lifecycleChangeTime(asset: MapAsset): number {
  return Date.parse(asset.lifecycle?.updatedAt ?? asset.updatedAt ?? asset.createdAt);
}

function assetCleanupGraceDays(requested: number | undefined): number {
  const configured = requested ?? Number(process.env.OTTE_ASSET_CLEANUP_GRACE_DAYS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 3650) : 0;
}

function markAssetStorageDeleted(asset: MapAsset, cleanupReason: string, adminUserId: string): void {
  const updatedAt = nowIso();
  asset.lifecycle = {
    status: asset.lifecycle?.status ?? "active",
    ...asset.lifecycle,
    updatedAt,
    updatedByUserId: adminUserId,
    storageDeletedAt: updatedAt,
    cleanupReason
  };
  asset.updatedAt = updatedAt;
}

function defaultAssetLifecycle(): NonNullable<MapAsset["lifecycle"]> {
  return {
    status: "active",
    expiresAt: assetRetentionExpiresAt()
  };
}

function assetRetentionExpiresAt(): string | undefined {
  const value = Number(process.env.OTTE_ASSET_RETENTION_DAYS);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return new Date(Date.now() + Math.min(value, 3650) * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeAssetLifecycleStatus(value: string | undefined): NonNullable<MapAsset["lifecycle"]>["status"] | undefined {
  return value === "active" || value === "archived" || value === "deleted" ? value : undefined;
}

function normalizeOptionalIsoDate(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeAssetSizeBytes(value: number | undefined): number | undefined {
  if (value === undefined) return 0;
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function isAssetDeliverable(asset: MapAsset): boolean {
  if (asset.lifecycle?.status === "deleted") return false;
  return !asset.lifecycle?.expiresAt || Date.parse(asset.lifecycle.expiresAt) > Date.now();
}

function assetUnavailable(reply: FastifyReply, asset: MapAsset): FastifyReply {
  const deleted = asset.lifecycle?.status === "deleted";
  return reply.code(410).send({
    error: deleted ? "asset_deleted" : "asset_expired",
    message: deleted ? "Asset has been deleted" : "Asset has expired"
  });
}

function assetQuotaExceeded(store: StateStore, campaignId: string, incomingBytes: number): { error: string; message: string; quotaBytes: number; usedBytes: number; incomingBytes: number } | undefined {
  const quotaBytes = assetQuotaBytes();
  if (!quotaBytes) return undefined;
  const usedBytes = campaignAssetBytes(store, campaignId);
  if (usedBytes + incomingBytes <= quotaBytes) return undefined;
  return {
    error: "asset_quota_exceeded",
    message: `Campaign asset quota of ${quotaBytes} bytes would be exceeded`,
    quotaBytes,
    usedBytes,
    incomingBytes
  };
}

function assetQuotaBytes(): number | undefined {
  const value = Number(process.env.OTTE_ASSET_QUOTA_BYTES);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function campaignAssetBytes(store: StateStore, campaignId: string): number {
  return store.state.assets.filter((asset) => asset.campaignId === campaignId && asset.lifecycle?.status !== "deleted").reduce((total, asset) => total + asset.sizeBytes, 0);
}

function campaignAssetStorageInfo(store: StateStore, campaignId: string): Record<string, unknown> {
  const assets = store.state.assets.filter((asset) => asset.campaignId === campaignId);
  const quotaBytes = assetQuotaBytes();
  const usedBytes = campaignAssetBytes(store, campaignId);
  const lifecycleCounts = countBy(assets, (asset) => asset.lifecycle?.status ?? "active");
  const providerCounts = countBy(assets, (asset) => asset.storage?.provider ?? "external");
  return {
    campaignId,
    assetCount: assets.length,
    activeAssetCount: assets.filter((asset) => asset.lifecycle?.status !== "deleted").length,
    usedBytes,
    allBytes: assets.reduce((total, asset) => total + asset.sizeBytes, 0),
    quotaBytes,
    remainingBytes: quotaBytes === undefined ? undefined : Math.max(0, quotaBytes - usedBytes),
    lifecycleCounts,
    providerCounts,
    largestAssets: assets
      .slice()
      .sort((left, right) => right.sizeBytes - left.sizeBytes)
      .slice(0, 10)
      .map((asset) => ({
        id: asset.id,
        campaignId: asset.campaignId,
        name: asset.name,
        sizeBytes: asset.sizeBytes,
        provider: asset.storage?.provider ?? "external",
        lifecycleStatus: asset.lifecycle?.status ?? "active",
        expiresAt: asset.lifecycle?.expiresAt
      }))
  };
}

function globalAssetStorageInfo(store: StateStore): Record<string, unknown> {
  const campaignIds = [...new Set(store.state.assets.map((asset) => asset.campaignId))].sort();
  const campaigns = campaignIds.map((campaignId) => campaignAssetStorageInfo(store, campaignId));
  const usedBytes = store.state.assets.filter((asset) => asset.lifecycle?.status !== "deleted").reduce((total, asset) => total + asset.sizeBytes, 0);
  return {
    assetCount: store.state.assets.length,
    activeAssetCount: store.state.assets.filter((asset) => asset.lifecycle?.status !== "deleted").length,
    usedBytes,
    allBytes: store.state.assets.reduce((total, asset) => total + asset.sizeBytes, 0),
    providerCounts: countBy(store.state.assets, (asset) => asset.storage?.provider ?? "external"),
    lifecycleCounts: countBy(store.state.assets, (asset) => asset.lifecycle?.status ?? "active"),
    campaigns
  };
}

function countBy<T>(items: T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function signedAssetDelivery(asset: MapAsset, headers: Record<string, string | string[] | undefined>, requestedTtlSeconds: number | undefined, disposition: "inline" | "attachment" | undefined): Record<string, string | number | undefined> {
  const ttlSeconds = assetUrlTtlSeconds(requestedTtlSeconds);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const safeDisposition = disposition ?? "inline";
  const signature = signAssetUrl(asset.id, expiresAt, safeDisposition);
  const url = new URL(`${assetDeliveryBase(headers)}/api/v1/assets/${asset.id}/blob`);
  url.searchParams.set("expiresAt", expiresAt);
  url.searchParams.set("signature", signature);
  if (safeDisposition !== "inline") url.searchParams.set("disposition", safeDisposition);
  return {
    assetId: asset.id,
    url: url.toString(),
    expiresAt,
    ttlSeconds,
    cacheControl: signedAssetCacheControl(expiresAt),
    delivery: process.env.OTTE_ASSET_CDN_BASE_URL?.trim() ? "cdn" : "signed_blob"
  };
}

function assetDeliveryBase(headers: Record<string, string | string[] | undefined>): string {
  const configured = process.env.OTTE_ASSET_CDN_BASE_URL?.trim() || process.env.OTTE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const protocol = headerValue(headers["x-forwarded-proto"]) ?? "http";
  const host = headerValue(headers.host) ?? "localhost";
  return `${protocol}://${host}`;
}

function assetUrlTtlSeconds(requested: number | undefined): number {
  const defaultValue = Number(process.env.OTTE_ASSET_URL_TTL_SECONDS);
  const maxValue = Number(process.env.OTTE_ASSET_URL_MAX_TTL_SECONDS);
  const fallback = Number.isFinite(defaultValue) && defaultValue > 0 ? defaultValue : 300;
  const max = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 3600;
  const value = Number.isFinite(requested) && requested! > 0 ? requested! : fallback;
  return Math.max(30, Math.min(Math.floor(value), Math.min(max, 24 * 60 * 60)));
}

function signAssetUrl(assetId: string, expiresAt: string, disposition: string): string {
  return createHmac("sha256", assetSigningSecret()).update(assetSignaturePayload(assetId, expiresAt, disposition)).digest("base64url");
}

function isValidAssetSignature(assetId: string, expiresAt: string | undefined, signature: string | undefined, disposition: string | undefined): boolean {
  if (!expiresAt || !signature || Date.parse(expiresAt) <= Date.now()) return false;
  try {
    const expected = signAssetUrl(assetId, expiresAt, disposition ?? "inline");
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(signature);
    return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
  } catch {
    return false;
  }
}

function assetSignaturePayload(assetId: string, expiresAt: string, disposition: string): string {
  return `${assetId}:${expiresAt}:${disposition}`;
}

function assetSigningSecret(): string {
  const configured = process.env.OTTE_ASSET_URL_SIGNING_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("OTTE_ASSET_URL_SIGNING_SECRET is required for signed asset URLs in production");
  return "development-asset-signing-secret";
}

function signedAssetCacheControl(expiresAt: string | undefined): string {
  const remainingSeconds = expiresAt ? Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)) : 0;
  return `public, max-age=${Math.min(remainingSeconds, 3600)}`;
}

function safeDownloadFileName(name: string): string {
  return basename(name).replace(/["\r\n]/g, "_") || "asset.bin";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function withArchivedAssetFiles(archive: CampaignArchive, assetStorage: AssetStorage): Promise<CampaignArchive> {
  const files = (
    await Promise.all(
      archive.data.assets.map((asset) => {
        return archiveAssetFile(assetStorage, asset);
      })
    )
  ).filter((file): file is CampaignArchiveFile => Boolean(file));
  return {
    ...archive,
    manifest: {
      ...archive.manifest,
      assetFileCount: files.length
    },
    files
  };
}

async function archiveAssetFile(assetStorage: AssetStorage, asset: MapAsset): Promise<CampaignArchiveFile | undefined> {
  if (!asset.url.startsWith("/api/v1/assets/")) return undefined;
  const body = await assetStorage.read(asset);
  if (!body) return undefined;
  return {
    assetId: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: body.length,
    checksum: checksumForBuffer(body),
    encoding: "base64",
    data: body.toString("base64")
  };
}

async function restoreArchivedAssetFiles(assetStorage: AssetStorage, archive: CampaignArchive): Promise<number> {
  const files = archive.files ?? [];
  const assetsById = new Map(archive.data.assets.map((asset) => [asset.id, asset]));

  for (const file of files) {
    const asset = assetsById.get(file.assetId);
    if (!asset) throw new Error(`Archive file does not match an asset: ${file.assetId}`);
    if (file.encoding !== "base64") throw new Error(`Unsupported archive file encoding: ${file.encoding}`);
    const body = Buffer.from(file.data, "base64");
    const checksum = checksumForBuffer(body);
    if (body.length !== file.sizeBytes) throw new Error(`Archive file size mismatch: ${file.assetId}`);
    if (checksum !== file.checksum) throw new Error(`Archive file checksum mismatch: ${file.assetId}`);
    if (asset.checksum && checksum !== asset.checksum) throw new Error(`Asset metadata checksum mismatch: ${file.assetId}`);

    asset.url = `/api/v1/assets/${asset.id}/blob`;
    asset.storage = undefined;
    asset.storage = await assetStorage.put(asset, body);
  }

  return files.length;
}

function checksumForBuffer(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function mergeArchive(state: EngineState, archive: CampaignArchive): Record<keyof EngineState, number> {
  return {
    users: upsertRecords(state.users, archive.data.users),
    sessions: 0,
    identities: 0,
    oauthStates: 0,
    passwordResetTokens: 0,
    emailOutbox: 0,
    invites: 0,
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

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: "bad_request", message });
}

function unauthorized(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(401).send({ error: "unauthorized", message });
}

function forbidden(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(403).send({ error: "forbidden", message });
}

function conflict(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(409).send({ error: "conflict", message });
}
