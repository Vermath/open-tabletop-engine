import { routes } from "@open-tabletop/api-contracts";
import type { Actor, AiEvaluationRun, AiMemoryFact, AiThread, AiToolCall, AuditLog, Campaign, CampaignMember, ChatMessage, Combat, CombatAction, ContentImportBatch, DiceMacro, DiceRoll, EngineEvent, FogPreset, FogRegion, Item, JournalEntry, LightSource, MapAsset, OrganizationMember, OrganizationWorkspace, Proposal, Scene, SceneAnnotation, SceneAnnotationKind, Token, User, UserSession, VisionPoint, VisionPointSample, VisionSnapshot, Wall } from "@open-tabletop/core";

export interface OpenTabletopClientOptions {
  token?: string;
  userId?: string;
  fetch?: typeof fetch;
}

export type RealtimeWebSocketConstructor = new (url: string | URL, protocols?: string | string[]) => WebSocket;

export interface OpenTabletopRealtimeOptions {
  token?: string;
  WebSocket?: RealtimeWebSocketConstructor;
  protocols?: string | string[];
}

export const openTabletopRealtimePath = "/api/v1/realtime";

export interface CampaignInviteInfo {
  id: string;
  campaignId: string;
  email?: string;
  role: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
}

export interface CampaignInviteCreateResult {
  invite: CampaignInviteInfo;
  token: string;
  acceptUrl: string;
}

export interface OrganizationInviteInfo extends CampaignInviteInfo {
  campaign: Pick<Campaign, "id" | "name">;
}

export interface CampaignArchiveImportResult {
  importedCampaignIds: string[];
  counts: Record<string, number>;
  conflicts: Array<{ collection: string; id: string }>;
  assetFiles: number;
}

export interface CampaignArchiveImportOptions {
  mode?: "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run";
  scope?: "all" | "assets_only" | "selected_collections";
  collections?: string[];
}

export interface AssetUploadResponse {
  asset: MapAsset;
  scene?: Scene;
}

export interface AiEditLayerApplyResult {
  aiEditSceneId: string;
  targetSceneId: string;
  backgroundAssetId?: string;
  copiedTokenCount: number;
  replacedTokenCount: number;
}

export type AiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AiThreadMessageInput {
  role?: string;
  content?: string;
}

export interface AiThreadCreateInput {
  prompt: string;
  surface?: "agent_panel" | "ai_studio";
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  selectedSceneId?: string;
  selectedTokenIds?: string[];
  messages?: AiThreadMessageInput[];
}

export interface McpJsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

export interface BoardCaptureSubmitInput {
  dataUrl?: string;
  sceneId?: string;
  width?: number;
  height?: number;
  error?: string;
}

export type BoardCaptureResult =
  | {
      status: "captured";
      captureId: string;
      imageUrl: string;
      expiresAt: string;
      sceneId?: string;
      width?: number;
      height?: number;
      mimeType: "image/png";
    }
  | {
      status: "board_capture_unavailable" | "failed";
      reason: string;
      sceneId?: string;
    };

export interface PluginRuntimeInfo {
  id: string;
  name: string;
  version: string;
  permissions: string[];
  installed?: boolean;
  updateAvailable?: boolean;
  audit?: {
    installCount: number;
    lastInstallAt?: string;
    lastActorUserId?: string;
    versions: string[];
  };
}

export interface SystemRuntimeInfo {
  id: string;
  name: string;
  version: string;
  active?: boolean;
}

export interface PublicSession extends Pick<UserSession, "id" | "userId" | "expiresAt" | "lastSeenAt" | "createdAt" | "updatedAt"> {}

export interface SessionInfo {
  user: Omit<User, "passwordHash" | "mfa" | "scim">;
  session?: PublicSession;
  memberships: CampaignMember[];
  serverAdmin?: boolean;
  serverAdmins?: {
    configured: boolean;
    count: number;
    missingInProduction: boolean;
  };
}

export interface SessionLoginInfo extends SessionInfo {
  token: string;
  session: PublicSession;
}

export interface BootstrapStatus {
  required: boolean;
  userCount: number;
  campaignCount: number;
  publicRegistration: boolean;
  serverAdmins: NonNullable<SessionInfo["serverAdmins"]>;
}

export interface BootstrapOwnerInfo extends SessionLoginInfo {
  campaign: Campaign;
  scene: Scene;
}

export interface CombatActionMutationResult {
  combat: Combat;
  combatAction: CombatAction;
}

export type OrganizationMemberInfo = OrganizationMember & { user: Pick<User, "id" | "displayName" | "email"> };
export type OrganizationWorkspaceInfo = OrganizationWorkspace & { role: "owner" | "admin" | "member"; memberCount: number; campaignCount: number };

export type ApiClientRouteStatus = "supported" | "excluded";

export interface ApiClientRouteConformanceEntry {
  method: string;
  path: string;
  status: ApiClientRouteStatus;
  clientMethod?: string;
  reason?: string;
}

export const apiClientExcludedRoutePatterns = [
  { prefix: "/api/v1/admin/", reason: "server-admin operations are intentionally excluded from the reusable public client surface" },
  { prefix: "/api/v1/scim/", reason: "SCIM provisioning is an identity-provider integration surface, not reusable campaign client API" },
  { path: routes.openApi, reason: "OpenAPI contract discovery is consumed at build/test time rather than wrapped as domain behavior" },
  { path: openTabletopRealtimePath, reason: "Realtime uses websocket helpers instead of REST fetch wrappers" },
  { path: "/api/v1/assets/{assetId}/blob", reason: "Binary asset delivery is intentionally fetched directly from signed URLs or browser media elements" },
  { path: "/api/v1/agent/board-captures/{captureHandle}", reason: "Short-lived PNG board captures are fetched directly from signed URLs or browser image elements" }
] as const;

export class OpenTabletopClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly options: OpenTabletopClientOptions = {}
  ) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async health(): Promise<{ ok: boolean; version: string; service: string }> {
    return this.get(routes.health);
  }

  async login(input: { userId?: string; email?: string; password?: string; mfaCode?: string; recoveryCode?: string }): Promise<SessionLoginInfo> {
    return this.post(routes.login, input);
  }

  async register(input: { email: string; displayName: string; password: string }): Promise<SessionLoginInfo> {
    return this.post(routes.register, input);
  }

  async logout(): Promise<{ ok: true }> {
    return this.post(routes.logout, {});
  }

  async session(): Promise<SessionInfo> {
    return this.get(routes.session);
  }

  async requestPasswordReset(input: { email: string; returnTo?: string }): Promise<{ ok: true; resetToken?: string }> {
    return this.post(routes.passwordResetRequest, input);
  }

  async confirmPasswordReset(input: { token: string; password: string }): Promise<SessionLoginInfo> {
    return this.post(routes.passwordResetConfirm, input);
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<SessionLoginInfo> {
    return this.post(routes.passwordChange, input);
  }

  async mfaStatus(): Promise<unknown> {
    return this.get(routes.mfaStatus);
  }

  async enrollTotpMfa(input: { currentPassword: string }): Promise<unknown> {
    return this.post(routes.mfaTotpEnroll, input);
  }

  async confirmTotpMfa(input: { code: string }): Promise<unknown> {
    return this.post(routes.mfaTotpConfirm, input);
  }

  async disableTotpMfa(input: { currentPassword?: string; mfaCode?: string; recoveryCode?: string }): Promise<unknown> {
    return this.delete(routes.mfaTotpDisable, input);
  }

  async sessions(): Promise<PublicSession[]> {
    return this.get(routes.authSessions);
  }

  async deleteSession(sessionId: string): Promise<UserSession> {
    return this.delete(routes.authSession(sessionId));
  }

  async oidcConfig(): Promise<unknown> {
    return this.get(routes.oidcConfig);
  }

  async startOidc(input: { returnTo?: string } = {}): Promise<unknown> {
    return this.post(routes.oidcStart, input);
  }

  async startOidcRedirect(returnTo?: string): Promise<unknown> {
    const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    return this.get(`${routes.oidcStart}${query}`);
  }

  async bootstrapStatus(): Promise<BootstrapStatus> {
    return this.get(routes.bootstrap);
  }

  async bootstrapOwner(input: { email: string; displayName: string; password: string; campaignName: string; campaignDescription?: string; defaultSystemId?: string }): Promise<BootstrapOwnerInfo> {
    return this.post(routes.bootstrap, input);
  }

  realtimeUrl(campaignId: string, options: Pick<OpenTabletopRealtimeOptions, "token"> = {}): string {
    const url = new URL(openTabletopRealtimePath, this.baseUrl);
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    url.searchParams.set("campaignId", campaignId);
    return url.toString();
  }

  connectRealtime(campaignId: string, options: OpenTabletopRealtimeOptions = {}): WebSocket {
    const WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    if (!WebSocketCtor) throw new Error("WebSocket is not available; pass a WebSocket constructor in OpenTabletopRealtimeOptions.");
    return new WebSocketCtor(this.realtimeUrl(campaignId, options), realtimeProtocols(options.protocols, options.token ?? this.options.token));
  }

  parseRealtimeMessage<TEvent extends EngineEvent = EngineEvent>(message: string | MessageEvent<string>): TEvent {
    const data = typeof message === "string" ? message : message.data;
    return JSON.parse(data) as TEvent;
  }

  async organizations(): Promise<OrganizationWorkspaceInfo[]> {
    return this.get(routes.organizations);
  }

  async createOrganization(input: Partial<OrganizationWorkspace> & { name: string }): Promise<{ organization: OrganizationWorkspace; session: PublicSession; organizations: OrganizationWorkspaceInfo[] }> {
    return this.post(routes.organizations, input);
  }

  async switchOrganization(organizationId: string): Promise<{ organization: OrganizationWorkspace; session: PublicSession; organizations: OrganizationWorkspaceInfo[] }> {
    return this.patch(routes.organizationSession, { organizationId });
  }

  async workspaceDefaults(): Promise<OrganizationWorkspace> {
    return this.get(routes.organizationWorkspaceDefaults);
  }

  async updateWorkspaceDefaults(input: Partial<OrganizationWorkspace>): Promise<OrganizationWorkspace> {
    return this.patch(routes.organizationWorkspaceDefaults, input);
  }

  async organizationMembers(): Promise<OrganizationMemberInfo[]> {
    return this.get(routes.organizationMembers);
  }

  async addOrganizationMember(input: { userId?: string; email?: string; role: "admin" | "member" }): Promise<OrganizationMemberInfo> {
    return this.post(routes.organizationMembers, input);
  }

  async updateOrganizationMember(memberId: string, input: { role: "admin" | "member" }): Promise<OrganizationMemberInfo> {
    return this.patch(routes.organizationMember(memberId), input);
  }

  async removeOrganizationMember(memberId: string): Promise<{ removed: boolean; memberId: string; userId: string; removedCampaignMemberships: number }> {
    return this.delete(routes.organizationMember(memberId));
  }

  async organizationInvites(): Promise<OrganizationInviteInfo[]> {
    return this.get(routes.organizationInvites);
  }

  async createOrganizationInvite(input: { campaignId: string; email?: string; role?: string; expiresInDays?: number }): Promise<CampaignInviteCreateResult> {
    return this.post(routes.organizationInvites, input);
  }

  async campaigns(): Promise<Campaign[]> {
    return this.get(routes.campaigns);
  }

  async createCampaign(input: Partial<Campaign>): Promise<Campaign> {
    return this.post(routes.campaigns, input);
  }

  async campaign(campaignId: string): Promise<Campaign> {
    return this.get(routes.campaign(campaignId));
  }

  async updateCampaign(campaignId: string, input: Partial<Campaign>): Promise<Campaign> {
    return this.patch(routes.campaign(campaignId), input);
  }

  async archiveCampaign(campaignId: string, input: { reason?: string } = {}): Promise<Campaign> {
    return this.post(routes.campaignArchive(campaignId), input);
  }

  async restoreCampaign(campaignId: string, input: { reason?: string } = {}): Promise<Campaign> {
    return this.post(routes.campaignRestore(campaignId), input);
  }

  async deleteCampaign(campaignId: string): Promise<Campaign> {
    return this.delete(routes.campaign(campaignId));
  }

  async campaignInvites(campaignId: string): Promise<CampaignInviteInfo[]> {
    return this.get(routes.campaignInvites(campaignId));
  }

  async campaignMembers(campaignId: string): Promise<CampaignMember[]> {
    return this.get(routes.campaignMembers(campaignId));
  }

  async createCampaignInvite(campaignId: string, input: { email?: string; role?: string; expiresInDays?: number }): Promise<CampaignInviteCreateResult> {
    return this.post(routes.campaignInvites(campaignId), input);
  }

  async revokeCampaignInvite(inviteId: string): Promise<CampaignInviteInfo> {
    return this.post(routes.revokeInvite(inviteId), {});
  }

  async acceptInvite(input: { token: string; userId?: string; email?: string; displayName?: string; password?: string }): Promise<unknown> {
    return this.post(routes.acceptInvite, input);
  }

  async scenes(campaignId: string): Promise<Scene[]> {
    return this.get(routes.scenes(campaignId));
  }

  async createScene(campaignId: string, input: Partial<Scene>): Promise<Scene> {
    return this.post(routes.scenes(campaignId), input);
  }

  async scene(sceneId: string): Promise<Scene> {
    return this.get(routes.scene(sceneId));
  }

  async sceneVision(sceneId: string): Promise<VisionSnapshot> {
    return this.get(routes.sceneVision(sceneId));
  }

  async sampleSceneVision(sceneId: string, point: { x: number; y: number }): Promise<VisionPointSample> {
    return this.get(`${routes.sceneVisionSample(sceneId)}?x=${encodeURIComponent(String(point.x))}&y=${encodeURIComponent(String(point.y))}`);
  }

  async sceneRenderingDiagnostics(sceneId: string): Promise<unknown> {
    return this.get(routes.sceneRenderingDiagnostics(sceneId));
  }

  async updateScene(sceneId: string, input: Partial<Scene>): Promise<Scene> {
    return this.patch(routes.scene(sceneId), input);
  }

  async deleteScene(sceneId: string): Promise<Scene> {
    return this.delete(routes.scene(sceneId));
  }

  async createSceneAnnotation(sceneId: string, input: { kind: SceneAnnotationKind; points: VisionPoint[]; label?: string; color?: string; radius?: number; expiresInSeconds?: number }): Promise<Scene> {
    return this.post(routes.sceneAnnotations(sceneId), input);
  }

  async updateSceneAnnotation(sceneId: string, annotationId: string, input: Partial<Pick<SceneAnnotation, "label" | "color" | "layer" | "groupId" | "groupLabel" | "sortOrder" | "templateShape" | "templateSaveAbility" | "templateSaveDc" | "templateDamageFormula" | "templateDamageType" | "snapToGrid" | "points" | "radius">> & { expiresInSeconds?: number }): Promise<Scene> {
    return this.patch(routes.sceneAnnotation(sceneId, annotationId), input);
  }

  async deleteSceneAnnotation(sceneId: string, annotationId: string): Promise<Scene> {
    return this.delete(routes.sceneAnnotation(sceneId, annotationId));
  }

  async fogPresets(campaignId: string): Promise<FogPreset[]> {
    return this.get(routes.fogPresets(campaignId));
  }

  async createFogPreset(campaignId: string, input: { name?: string; description?: string; sceneId?: string }): Promise<FogPreset> {
    return this.post(routes.fogPresets(campaignId), input);
  }

  async deleteFogPreset(campaignId: string, presetId: string): Promise<FogPreset> {
    return this.delete(routes.fogPreset(campaignId, presetId));
  }

  async applyFogPreset(sceneId: string, input: { presetId: string; mode?: "append" | "replace" }): Promise<Scene> {
    return this.post(routes.sceneFogApplyPreset(sceneId), input);
  }

  async createFogRegion(sceneId: string, input: Partial<FogRegion>): Promise<Scene> {
    return this.post(routes.sceneFog(sceneId), input);
  }

  async updateFogRegion(sceneId: string, fogId: string, input: Partial<FogRegion>): Promise<Scene> {
    return this.patch(routes.sceneFogRegion(sceneId, fogId), input);
  }

  async deleteFogRegion(sceneId: string, fogId: string): Promise<Scene> {
    return this.delete(routes.sceneFogRegion(sceneId, fogId));
  }

  async fogHistory(sceneId: string): Promise<unknown> {
    return this.get(routes.sceneFogHistory(sceneId));
  }

  async undoFog(sceneId: string): Promise<Scene> {
    return this.post(routes.sceneFogUndo(sceneId), {});
  }

  async createWall(sceneId: string, input: Partial<Wall>): Promise<Scene> {
    return this.post(routes.sceneWalls(sceneId), input);
  }

  async updateWall(sceneId: string, wallId: string, input: Partial<Wall>): Promise<Scene> {
    return this.patch(routes.sceneWall(sceneId, wallId), input);
  }

  async deleteWall(sceneId: string, wallId: string): Promise<Scene> {
    return this.delete(routes.sceneWall(sceneId, wallId));
  }

  async createLight(sceneId: string, input: Partial<LightSource>): Promise<Scene> {
    return this.post(routes.sceneLights(sceneId), input);
  }

  async updateLight(sceneId: string, lightId: string, input: Partial<LightSource>): Promise<Scene> {
    return this.patch(routes.sceneLight(sceneId, lightId), input);
  }

  async deleteLight(sceneId: string, lightId: string): Promise<Scene> {
    return this.delete(routes.sceneLight(sceneId, lightId));
  }

  async applyAiEditLayerToTarget(sceneId: string): Promise<AiEditLayerApplyResult> {
    return this.post(routes.sceneAiEditsApply(sceneId), {});
  }

  async assets(campaignId: string): Promise<MapAsset[]> {
    return this.get(routes.assets(campaignId));
  }

  async assetStorage(campaignId: string): Promise<unknown> {
    return this.get(routes.assetStorage(campaignId));
  }

  async createAsset(campaignId: string, input: Partial<MapAsset>): Promise<MapAsset> {
    return this.post(routes.assets(campaignId), input);
  }

  async uploadAsset(campaignId: string, body: BodyInit, options: { contentType: string; fileName?: string; folder?: string; tags?: string[] }): Promise<AssetUploadResponse> {
    const headers: Record<string, string> = { "content-type": options.contentType };
    if (options.fileName) headers["x-asset-name"] = options.fileName;
    if (options.folder) headers["x-asset-folder"] = options.folder;
    if (options.tags?.length) headers["x-asset-tags"] = options.tags.join(",");
    return this.requestRaw("POST", routes.uploadAsset(campaignId), body, headers);
  }

  async updateAsset(assetId: string, input: { name?: string; folder?: string | null; tags?: string[] | string }): Promise<MapAsset> {
    return this.patch(routes.asset(assetId), input);
  }

  async updateAssetLifecycle(assetId: string, input: { status: "active" | "archived" | "deleted"; expiresAt?: string | null; reason?: string }): Promise<MapAsset> {
    return this.patch(routes.assetLifecycle(assetId), input);
  }

  async assetDeliveryUrl(assetId: string, input: { expiresInSeconds?: number; disposition?: "inline" | "attachment" } = {}): Promise<{ url: string; expiresAt: string }> {
    return this.post(routes.assetDeliveryUrl(assetId), input);
  }

  async tokens(sceneId: string): Promise<Token[]> {
    return this.get(routes.tokens(sceneId));
  }

  async createToken(sceneId: string, input: Partial<Token>): Promise<Token> {
    return this.post(routes.tokens(sceneId), input);
  }

  async updateToken(tokenId: string, input: Partial<Token>): Promise<Token> {
    return this.patch(routes.token(tokenId), input);
  }

  async targetToken(tokenId: string, targeted: boolean): Promise<Token> {
    return this.post(routes.tokenTarget(tokenId), { targeted });
  }

  async deleteToken(tokenId: string): Promise<Token> {
    return this.delete(routes.token(tokenId));
  }

  async actors(campaignId: string): Promise<Actor[]> {
    return this.get(routes.actors(campaignId));
  }

  async createActor(campaignId: string, input: Partial<Actor>): Promise<Actor> {
    return this.post(routes.actors(campaignId), input);
  }

  async updateActor(actorId: string, input: Partial<Actor>): Promise<Actor> {
    return this.patch(routes.actor(actorId), input);
  }

  async items(campaignId: string): Promise<Item[]> {
    return this.get(routes.items(campaignId));
  }

  async createItem(campaignId: string, input: Record<string, unknown>): Promise<Item> {
    return this.post(routes.items(campaignId), input);
  }

  async updateItem(itemId: string, input: Partial<Item>): Promise<Item> {
    return this.patch(routes.item(itemId), input);
  }

  async journals(campaignId: string): Promise<JournalEntry[]> {
    return this.get(routes.journals(campaignId));
  }

  async createJournal(campaignId: string, input: Partial<JournalEntry>): Promise<JournalEntry> {
    return this.post(routes.journals(campaignId), input);
  }

  async updateJournal(entryId: string, input: Partial<JournalEntry>): Promise<JournalEntry> {
    return this.patch(routes.journal(entryId), input);
  }

  async chat(campaignId: string): Promise<ChatMessage[]> {
    return this.get(`${routes.chat}?campaignId=${encodeURIComponent(campaignId)}`);
  }

  async sendChat(input: { campaignId: string; body: string; type?: ChatMessage["type"]; visibility?: ChatMessage["visibility"]; recipientUserIds?: string[]; replyToMessageId?: string }): Promise<ChatMessage> {
    return this.post(routes.chat, input);
  }

  async moderateChat(messageId: string, moderationStatus: NonNullable<ChatMessage["moderationStatus"]>): Promise<ChatMessage> {
    return this.patch(routes.chatMessageModeration(messageId), { moderationStatus });
  }

  async deleteChat(messageId: string): Promise<ChatMessage> {
    return this.delete(routes.chatMessage(messageId));
  }

  async exportChat(campaignId: string, options: { format?: "json" } = {}): Promise<{ campaignId: string; exportedAt: string; count: number; visibilityCounts: Record<string, number>; typeCounts: Record<string, number>; messages: ChatMessage[] }> {
    const query = options.format ? `?format=${encodeURIComponent(options.format)}` : "";
    return this.get(`${routes.chatExport(campaignId)}${query}`);
  }

  async exportChatNdjson(campaignId: string): Promise<string> {
    return this.getText(`${routes.chatExport(campaignId)}?format=ndjson`);
  }

  async roll(input: { campaignId: string; formula: string; visibility?: DiceRoll["visibility"]; label?: string }): Promise<DiceRoll> {
    return this.post(routes.dice, input);
  }

  async rolls(campaignId: string): Promise<DiceRoll[]> {
    return this.get(routes.campaignRolls(campaignId));
  }

  async diceMacros(campaignId: string): Promise<DiceMacro[]> {
    return this.get(routes.diceMacros(campaignId));
  }

  async createDiceMacro(campaignId: string, input: { name: string; formula: string; visibility?: DiceMacro["visibility"] }): Promise<DiceMacro> {
    return this.post(routes.diceMacros(campaignId), input);
  }

  async updateDiceMacro(macroId: string, input: Partial<Pick<DiceMacro, "name" | "formula" | "visibility">>): Promise<DiceMacro> {
    return this.patch(routes.diceMacro(macroId), input);
  }

  async deleteDiceMacro(macroId: string): Promise<DiceMacro> {
    return this.delete(routes.diceMacro(macroId));
  }

  async combats(campaignId: string): Promise<Combat[]> {
    return this.get(routes.combats(campaignId));
  }

  async combatAudit(combatId: string): Promise<AuditLog[]> {
    return this.get(routes.combatAudit(combatId));
  }

  async startCombat(campaignId: string, input: Partial<Combat>): Promise<Combat> {
    return this.post(routes.combats(campaignId), input);
  }

  async updateCombat(combatId: string, input: Partial<Combat>): Promise<Combat> {
    return this.patch(routes.combat(combatId), input);
  }

  async updateCombatant(combatId: string, combatantId: string, input: Partial<Combat["combatants"][number]> & { syncActorSheet?: boolean }): Promise<Combat> {
    return this.patch(routes.combatant(combatId, combatantId), input);
  }

  async confirmCombatAction(combatId: string, actionId: string): Promise<CombatActionMutationResult> {
    return this.post(routes.combatActionConfirm(combatId, actionId), {});
  }

  async rejectCombatAction(combatId: string, actionId: string, input: { reason?: string } = {}): Promise<CombatActionMutationResult> {
    return this.post(routes.combatActionReject(combatId, actionId), input);
  }

  async endCombat(combatId: string): Promise<Combat> {
    return this.delete(routes.combat(combatId));
  }

  async encounters(campaignId: string): Promise<unknown[]> {
    return this.get(routes.encounters(campaignId));
  }

  async createEncounter(campaignId: string, input: unknown): Promise<unknown> {
    return this.post(routes.encounters(campaignId), input);
  }

  async proposals(campaignId: string): Promise<Proposal[]> {
    return this.get(routes.proposals(campaignId));
  }

  async createProposal(campaignId: string, input: Partial<Proposal>): Promise<Proposal> {
    return this.post(routes.proposals(campaignId), input);
  }

  async approveProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalApprove(proposalId), {});
  }

  async applyProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalApply(proposalId), {});
  }

  async rejectProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalReject(proposalId), {});
  }

  async aiThreads(campaignId: string): Promise<AiThread[]> {
    return this.get(routes.aiThreads(campaignId));
  }

  async createAiThread(campaignId: string, input: AiThreadCreateInput): Promise<AiThread> {
    return this.post(routes.aiThreads(campaignId), input);
  }

  async mcp(input: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    return this.post(routes.mcp, input);
  }

  async submitBoardCapture(requestId: string, input: BoardCaptureSubmitInput): Promise<BoardCaptureResult> {
    return this.post(routes.agentBoardCaptureSubmit(requestId), input);
  }

  async aiUsage(campaignId: string): Promise<unknown> {
    return this.get(routes.aiUsage(campaignId));
  }

  async aiEvaluations(campaignId: string): Promise<AiEvaluationRun[]> {
    return this.get(routes.aiEvaluations(campaignId));
  }

  async createAiEvaluation(campaignId: string, input: unknown): Promise<AiEvaluationRun> {
    return this.post(routes.aiEvaluations(campaignId), input);
  }

  async aiMemory(campaignId: string): Promise<AiMemoryFact[]> {
    return this.get(routes.aiMemory(campaignId));
  }

  async createAiMemory(campaignId: string, input: Partial<AiMemoryFact>): Promise<AiMemoryFact> {
    return this.post(routes.aiMemory(campaignId), input);
  }

  async extractAiMemory(campaignId: string, input: { transcript: string }): Promise<unknown> {
    return this.post(routes.aiMemoryExtract(campaignId), input);
  }

  async approveAiMemory(factId: string): Promise<AiMemoryFact> {
    return this.post(routes.aiMemoryApprove(factId), {});
  }

  async deleteAiMemory(factId: string): Promise<AiMemoryFact> {
    return this.delete(routes.aiMemoryFact(factId));
  }

  async aiToolCalls(campaignId: string): Promise<AiToolCall[]> {
    return this.get(routes.aiToolCalls(campaignId));
  }

  async retryAiToolCall(campaignId: string, toolCallId: string, input: { dryRun?: boolean } = {}): Promise<unknown> {
    return this.post(routes.aiToolCallRetry(campaignId, toolCallId), input);
  }

  async aiSessionRecap(campaignId: string, input: { transcript?: string }): Promise<unknown> {
    return this.post(routes.aiSessionRecap(campaignId), input);
  }

  async aiEncounterDesign(campaignId: string, input: unknown): Promise<Proposal> {
    return this.post(routes.aiEncounterDesign(campaignId), input);
  }

  async aiGenerateMapAsset(campaignId: string, input: { prompt: string; name?: string; sceneId?: string; size?: string; quality?: string; outputFormat?: "png" | "jpeg" | "webp" }): Promise<unknown> {
    return this.post(routes.aiGenerateMapAsset(campaignId), input);
  }

  async aiGenerateTokenAsset(campaignId: string, input: { prompt: string; name?: string; tokenId?: string; size?: string; quality?: string; outputFormat?: "png" | "jpeg" | "webp" }): Promise<unknown> {
    return this.post(routes.aiGenerateTokenAsset(campaignId), input);
  }

  async plugins(campaignId?: string): Promise<PluginRuntimeInfo[]> {
    return this.get(campaignId ? routes.campaignPlugins(campaignId) : routes.plugins);
  }

  async installPlugin(campaignId: string, pluginId: string): Promise<PluginRuntimeInfo> {
    return this.post(`${routes.campaignPlugin(campaignId, pluginId)}/install`, {});
  }

  async registerPlugin(input: { packagePath?: string; packageId?: string }): Promise<PluginRuntimeInfo> {
    return this.post("/api/v1/plugins/install", input);
  }

  async syncPluginRegistry(input: { registryUrl?: string } = {}): Promise<unknown> {
    return this.post(routes.pluginRegistrySync, input);
  }

  async pluginStorage(campaignId: string, pluginId: string): Promise<unknown> {
    return this.get(routes.pluginStorage(campaignId, pluginId));
  }

  async pluginStorageEntry(campaignId: string, pluginId: string, key: string): Promise<unknown> {
    return this.get(routes.pluginStorageEntry(campaignId, pluginId, key));
  }

  async setPluginStorageEntry(campaignId: string, pluginId: string, key: string, value: unknown): Promise<unknown> {
    return this.put(routes.pluginStorageEntry(campaignId, pluginId, key), value);
  }

  async deletePluginStorageEntry(campaignId: string, pluginId: string, key: string): Promise<unknown> {
    return this.delete(routes.pluginStorageEntry(campaignId, pluginId, key));
  }

  async runPluginChatCommand(campaignId: string, pluginId: string, input: { command: string; args?: string; sceneId?: string; actorId?: string; tokenId?: string }): Promise<unknown> {
    return this.post(routes.pluginChatCommand(campaignId, pluginId), input);
  }

  async systems(campaignId?: string): Promise<SystemRuntimeInfo[]> {
    return this.get(campaignId ? routes.campaignSystems(campaignId) : routes.systems);
  }

  async installSystem(campaignId: string, systemId: string): Promise<SystemRuntimeInfo> {
    return this.post(`${routes.campaignSystem(campaignId, systemId)}/install`, {});
  }

  async registerSystem(input: { packagePath?: string; systemId?: string }): Promise<SystemRuntimeInfo> {
    return this.post("/api/v1/systems/install", input);
  }

  async systemCharacterTemplates(campaignId: string, systemId: string): Promise<unknown> {
    return this.get(routes.systemCharacterTemplates(campaignId, systemId));
  }

  async systemCharacterOrigins(campaignId: string, systemId: string): Promise<unknown> {
    return this.get(routes.systemCharacterOrigins(campaignId, systemId));
  }

  async createSystemCharacter(campaignId: string, systemId: string, input: unknown): Promise<Actor> {
    return this.post(routes.systemCharacters(campaignId, systemId), input);
  }

  async createSystemMonster(campaignId: string, systemId: string, input: unknown): Promise<Actor> {
    return this.post(routes.systemMonsters(campaignId, systemId), input);
  }

  async importSystemCharacter(campaignId: string, systemId: string, input: unknown): Promise<unknown> {
    return this.post(routes.systemCharacterImport(campaignId, systemId), input);
  }

  async systemEncounterThreats(campaignId: string, systemId: string): Promise<unknown> {
    return this.get(routes.systemEncounterThreats(campaignId, systemId));
  }

  async systemEncounterPlan(campaignId: string, systemId: string, input: unknown): Promise<unknown> {
    return this.post(routes.systemEncounterPlan(campaignId, systemId), input);
  }

  async systemCompendium(campaignId: string, systemId: string): Promise<unknown> {
    return this.get(routes.systemCompendium(campaignId, systemId));
  }

  async addSystemCompendiumToActor(campaignId: string, systemId: string, actorId: string, input: unknown): Promise<Actor> {
    return this.post(routes.systemActorCompendium(campaignId, systemId, actorId), input);
  }

  async purchaseSystemEquipment(campaignId: string, systemId: string, actorId: string, input: unknown): Promise<Actor> {
    return this.post(routes.systemActorPurchase(campaignId, systemId, actorId), input);
  }

  async addSystemActorCondition(campaignId: string, systemId: string, actorId: string, input: unknown): Promise<Actor> {
    return this.post(routes.systemActorConditions(campaignId, systemId, actorId), input);
  }

  async removeSystemActorCondition(campaignId: string, systemId: string, actorId: string, conditionId: string): Promise<Actor> {
    return this.delete(routes.systemActorCondition(campaignId, systemId, actorId, conditionId));
  }

  async systemActorAdvancement(campaignId: string, systemId: string, actorId: string): Promise<unknown> {
    return this.get(routes.systemActorAdvancement(campaignId, systemId, actorId));
  }

  async advanceSystemActor(campaignId: string, systemId: string, actorId: string, input: unknown): Promise<Actor> {
    return this.post(routes.systemActorAdvance(campaignId, systemId, actorId), input);
  }

  async restSystemActor(campaignId: string, systemId: string, actorId: string, input: unknown): Promise<unknown> {
    return this.post(routes.systemActorRest(campaignId, systemId, actorId), input);
  }

  async systemActorSheet(campaignId: string, systemId: string, actorId: string): Promise<unknown> {
    return this.get(routes.systemActorSheet(campaignId, systemId, actorId));
  }

  async rollSystemActor(campaignId: string, systemId: string, actorId: string, input: unknown): Promise<unknown> {
    return this.post(routes.systemActorRoll(campaignId, systemId, actorId), input);
  }

  async contentImports(campaignId: string): Promise<ContentImportBatch[]> {
    return this.get(routes.contentImports(campaignId));
  }

  async previewContentImport(campaignId: string, input: unknown): Promise<ContentImportBatch> {
    return this.post(routes.contentImportPreview(campaignId), input);
  }

  async contentImport(importId: string): Promise<ContentImportBatch> {
    return this.get(routes.contentImport(importId));
  }

  async applyContentImport(importId: string, input: { selectedEntityIds?: string[] }): Promise<ContentImportBatch> {
    return this.post(routes.contentImportApply(importId), input);
  }

  async rollbackContentImport(importId: string): Promise<ContentImportBatch> {
    return this.post(routes.contentImportRollback(importId), {});
  }

  async deleteContentImport(importId: string): Promise<ContentImportBatch> {
    return this.delete(routes.contentImportDelete(importId));
  }

  async exportCampaign(campaignId: string, options: { scope?: "campaign"; version?: "0.2.0"; redaction?: "portable" } = {}): Promise<unknown> {
    const query = new URLSearchParams();
    if (options.scope) query.set("scope", options.scope);
    if (options.version) query.set("version", options.version);
    if (options.redaction) query.set("redaction", options.redaction);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.get(`${routes.exportCampaign(campaignId)}${suffix}`);
  }

  async dogfoodReportBundle(campaignId: string): Promise<unknown> {
    return this.get(routes.dogfoodReportBundle(campaignId));
  }

  async importCampaign(archive: unknown, options: CampaignArchiveImportOptions = {}): Promise<CampaignArchiveImportResult> {
    const hasOptions = options.mode !== undefined || options.scope !== undefined || options.collections !== undefined;
    return this.post(routes.importCampaign, hasOptions ? { archive, ...options } : archive);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request("PATCH", path, body);
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    return this.request("PUT", path, body);
  }

  private async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request("DELETE", path, body);
  }

  private async requestRaw<T>(method: string, path: string, body: BodyInit, headers: Record<string, string> = {}): Promise<T> {
    const requestHeaders: Record<string, string> = { ...headers };
    if (this.options.token) requestHeaders.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) requestHeaders["x-user-id"] = this.options.userId;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }

  private async getText(path: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) headers["x-user-id"] = this.options.userId;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers
    });
    if (!response.ok) throw new Error(await response.text());
    return response.text();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) headers["x-user-id"] = this.options.userId;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
}

function realtimeProtocols(protocols: string | string[] | undefined, token: string | undefined): string[] | undefined {
  const list = protocols === undefined ? ["otte.v1"] : Array.isArray(protocols) ? [...protocols] : [protocols];
  if (token) list.push(`otte.auth.${token}`);
  return list.length > 0 ? [...new Set(list)] : undefined;
}
