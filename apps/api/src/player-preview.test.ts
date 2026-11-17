import { createHash } from "node:crypto";
import { createTimestamped, type Actor, type ChatMessage, type DiceRoll, type Handout, type Scene, type SceneAnnotation, type UserSession, type VisionSnapshot } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const campaignId = "camp_demo";
const sceneId = "scn_vault_entry";
const playerId = "usr_demo_player";
const gmId = "usr_demo_gm";
const gmHeaders = { "x-user-id": gmId };
const playerHeaders = { "x-user-id": playerId };
const baseUrl = `/api/v1/scenes/${sceneId}/player-preview`;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function fixture() {
  const store = new MemoryStateStore();
  const scene = store.state.scenes.find((entry) => entry.id === sceneId)!;
  const actor = createTimestamped("act", {
    id: "act_preview_private",
    campaignId,
    systemId: "generic-fantasy",
    ownerUserId: gmId,
    type: "npc",
    name: "Vault Guardian",
    data: { hp: { current: 97, max: 109 }, secretCode: "PREVIEW_SECRET_ACTOR" },
    permissions: { [gmId]: ["actor.readPrivate"] } as Actor["permissions"],
  }) satisfies Actor;
  store.state.actors.push(actor);
  store.state.tokens.push({
    ...structuredClone(store.state.tokens.find((entry) => entry.id === "tok_valen")!),
    id: "tok_preview_hidden",
    actorId: actor.id,
    name: "PREVIEW_SECRET_TOKEN",
    layer: "gm",
    hidden: true,
  });
  scene.annotations = [createTimestamped("ann", {
    id: "ann_preview_public", sceneId, kind: "drawing", createdByUserId: gmId,
    label: "Public route", color: "#ffb000", points: [{ x: 300, y: 350 }, { x: 400, y: 350 }],
  }) satisfies SceneAnnotation];
  store.state.tokens.push({
    ...structuredClone(store.state.tokens.find((entry) => entry.id === "tok_valen")!),
    id: "tok_preview_public_npc", actorId: actor.id, name: "Vault Guardian", layer: "player", hidden: false,
  });
  store.state.handouts.push(...(["public", "gm_only"] as const).map((visibility) => createTimestamped("hnd", {
    id: `hnd_preview_${visibility}`,
    campaignId,
    title: visibility === "public" ? "Public clue" : "PREVIEW_SECRET_HANDOUT",
    body: visibility === "public" ? "Meet at the vault." : "PREVIEW_SECRET_HANDOUT_BODY",
    visibility,
    assetIds: [],
    createdBy: gmId,
  }) satisfies Handout));
  store.state.chat.push(...(["public", "gm_only", "whisper"] as const).map((visibility) => createTimestamped("msg", {
    id: `msg_preview_${visibility}`,
    campaignId,
    sceneId,
    userId: gmId,
    type: visibility === "whisper" ? "whisper" : "plain",
    body: visibility === "gm_only" ? "PREVIEW_SECRET_CHAT" : `Visible ${visibility} message`,
    visibility,
    recipientUserIds: visibility === "whisper" ? [playerId] : [],
  }) satisfies ChatMessage));
  store.state.users.push(createTimestamped("usr", { id: "usr_preview_peer", displayName: "Other player" }));
  store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: "usr_preview_peer", role: "member" }));
  store.state.members.push(createTimestamped("mem", { campaignId, userId: "usr_preview_peer", role: "player" }));
  store.state.chat.push(createTimestamped("msg", {
    id: "msg_preview_other_player_whisper",
    campaignId,
    sceneId,
    userId: "usr_preview_peer",
    type: "whisper",
    body: "PREVIEW_PRIVATE_PLAYER_CONVERSATION",
    visibility: "whisper",
    recipientUserIds: [playerId],
    rollId: "roll_preview_private_link",
  }) satisfies ChatMessage);
  store.state.chat.push(createTimestamped("msg", {
    id: "msg_preview_player_to_gm",
    campaignId,
    sceneId,
    userId: playerId,
    type: "whisper",
    body: "Visible reply to GM",
    visibility: "whisper",
    recipientUserIds: [gmId],
    rollId: "roll_preview_gm_whisper",
  }) satisfies ChatMessage);
  store.state.rolls.push(...(["public", "private_link", "gm_whisper"] as const).map((kind) => createTimestamped("roll", {
    id: `roll_preview_${kind}`,
    campaignId,
    userId: gmId,
    formula: "1d6",
    total: 3,
    terms: [],
    visibility: kind === "gm_whisper" ? "whisper" : "public",
  }) satisfies DiceRoll));
  const app = await buildApp({ store, rateLimit: { enabled: false } });
  apps.push(app);
  return { store, app, scene };
}

function preview(app: Awaited<ReturnType<typeof buildApp>>, userId = playerId, headers: Record<string, string> = gmHeaders) {
  return app.inject({ method: "GET", url: `${baseUrl}?userId=${encodeURIComponent(userId)}`, headers });
}

function domainState(store: MemoryStateStore) {
  const state = structuredClone(store.state);
  // Legacy test authentication records each accepted header separately. Those
  // audit entries are expected; game data, permissions, and every other log stay fixed.
  state.auditLogs = state.auditLogs.filter((entry) => entry.action !== "auth.legacyUserHeader");
  return state;
}

function expectNoSnapshot(response: { body: string; json(): Record<string, unknown> }) {
  expect(response.json()).not.toHaveProperty("snapshot");
  expect(response.json()).not.toHaveProperty("player");
  expect(response.body).not.toContain("PREVIEW_SECRET_");
  expect(response.body).not.toContain("Demo Player");
}

describe("read-only player preview", () => {
  it("matches the selected player's authoritative snapshot and omits GM-only content", async () => {
    const { app, store } = await fixture();
    const stateBefore = domainState(store);
    const actual = await app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${sceneId}`, headers: playerHeaders });
    expect(actual.statusCode).toBe(200);
    const response = await preview(app);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const payload = response.json();
    expect(payload).toMatchObject({ readOnly: true, player: { id: playerId, displayName: "Demo Player" } });
    const snapshot = payload.snapshot;
    const playerSnapshot = actual.json();
    const keys = ["campaign", "generatedAt", "selectedSceneId", "scenes", "tokens", "actors", "assets", "chat", "combats", "handouts", ...(playerSnapshot.vision ? ["vision"] : [])];
    expect(Object.keys(snapshot).sort()).toEqual(keys.sort());
    expect(snapshot.campaign).toEqual({ id: playerSnapshot.campaign.id, name: playerSnapshot.campaign.name });
    expect(snapshot.scenes).toEqual(playerSnapshot.scenes.filter((scene: Scene) => scene.id === sceneId));
    expect(snapshot.tokens).toEqual(playerSnapshot.tokens.filter((token: { sceneId: string }) => token.sceneId === sceneId));
    const actorIds = new Set(snapshot.tokens.map((token: { actorId?: string }) => token.actorId));
    expect(snapshot.actors).toEqual(playerSnapshot.actors.filter((actor: Actor) => actorIds.has(actor.id)));
    expect(snapshot.vision).toEqual(playerSnapshot.vision);
    expect(snapshot.handouts).toEqual(playerSnapshot.handouts);
    expect(snapshot.chat).toEqual(playerSnapshot.chat.filter((message: ChatMessage) => ["msg_preview_public", "msg_preview_whisper", "msg_preview_player_to_gm"].includes(message.id)));
    expect(playerSnapshot.chat.map((message: ChatMessage) => message.id)).toContain("msg_preview_other_player_whisper");
    expect(snapshot.chat.map((message: ChatMessage) => message.id)).not.toContain("msg_preview_other_player_whisper");
    expect(response.body).not.toContain("PREVIEW_PRIVATE_PLAYER_CONVERSATION");
    for (const forbidden of ["user", "members", "presences", "rolls", "bundled", "memory", "journals", "worldRecords", "items", "proposals"]) expect(snapshot).not.toHaveProperty(forbidden);
    expect(snapshot.selectedSceneId).toBe(sceneId);
    expect(snapshot.tokens.map((token: { id: string }) => token.id)).toContain("tok_valen");
    expect(snapshot.tokens.map((token: { id: string }) => token.id)).not.toContain("tok_preview_hidden");
    expect(snapshot.actors.find((actor: Actor) => actor.id === "act_preview_private")).toMatchObject({ data: {}, permissions: {}, redacted: true });
    expect(snapshot.actors.find((actor: Actor) => actor.id === "act_valen").data.hp).toEqual({ current: 18, max: 22 });
    expect(snapshot.scenes.find((scene: Scene) => scene.id === sceneId).annotations.map((annotation: SceneAnnotation) => annotation.id)).toEqual(["ann_preview_public"]);
    expect(snapshot.handouts.map((handout: Handout) => handout.id)).toContain("hnd_preview_public");
    expect(snapshot.handouts.map((handout: Handout) => handout.id)).not.toContain("hnd_preview_gm_only");
    expect(snapshot.chat.map((message: ChatMessage) => message.id)).toEqual(expect.arrayContaining(["msg_preview_public"]));
    expect(snapshot.chat.map((message: ChatMessage) => message.id)).not.toContain("msg_preview_gm_only");
    expect(response.body).not.toContain("PREVIEW_SECRET_");
    expect(domainState(store)).toEqual(stateBefore);
  });

  it("requires an explicit player and caller GM capabilities", async () => {
    const { app, store } = await fixture();
    const before = domainState(store);
    const missing = await app.inject({ method: "GET", url: baseUrl, headers: gmHeaders });
    expect(missing.statusCode).toBe(400);
    expectNoSnapshot(missing);
    const ordinaryPlayer = await preview(app, playerId, playerHeaders);
    expect(ordinaryPlayer.statusCode).toBe(403);
    expectNoSnapshot(ordinaryPlayer);
    const unauthenticated = await app.inject({ method: "GET", url: `${baseUrl}?userId=${playerId}` });
    expect(unauthenticated.statusCode).toBe(401);
    expectNoSnapshot(unauthenticated);
    expect(domainState(store)).toEqual(before);
  });

  it("uses the same generic denial for unknown, GM, observer, and cross-campaign targets", async () => {
    const { app, store } = await fixture();
    for (const [id, role, targetCampaign] of [["usr_preview_observer", "observer", campaignId], ["usr_preview_elsewhere", "player", "camp_preview_elsewhere"]] as const) {
      store.state.users.push(createTimestamped("usr", { id, displayName: `Private target ${id}` }));
      store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: id, role: "member" }));
      store.state.members.push(createTimestamped("mem", { campaignId: targetCampaign, userId: id, role }));
    }
    store.state.campaigns.push({ ...structuredClone(store.state.campaigns[0]!), id: "camp_preview_elsewhere", name: "Other campaign" });
    let genericDenial: unknown;
    for (const target of ["usr_preview_unknown", gmId, "usr_preview_observer", "usr_preview_elsewhere"]) {
      const denied = await preview(app, target);
      expect(denied.statusCode, target).toBe(404);
      expectNoSnapshot(denied);
      expect(denied.body).not.toContain(target);
      if (genericDenial === undefined) genericDenial = denied.json();
      else expect(denied.json()).toEqual(genericDenial);
    }
  });

  it.each(["campaign membership", "organization membership", "active account"])("rechecks the target's %s on every preview", async (revoked) => {
    const { app, store } = await fixture();
    expect((await preview(app)).statusCode).toBe(200);
    if (revoked === "campaign membership") store.state.members = store.state.members.filter((member) => member.userId !== playerId || member.campaignId !== campaignId);
    else if (revoked === "organization membership") store.state.organizationMembers = store.state.organizationMembers.filter((member) => member.userId !== playerId || member.organizationId !== "org_demo");
    else store.state.users.find((user) => user.id === playerId)!.disabledAt = new Date().toISOString();
    const before = domainState(store);
    const denied = await preview(app);
    expect(denied.statusCode).toBe(404);
    expectNoSnapshot(denied);
    expect(domainState(store)).toEqual(before);
  });

  it("immediately denies a caller whose campaign membership is revoked", async () => {
    const { app, store } = await fixture();
    expect((await preview(app)).statusCode).toBe(200);
    store.state.members = store.state.members.filter((member) => member.userId !== gmId || member.campaignId !== campaignId);
    const before = domainState(store);
    const denied = await preview(app);
    expect(denied.statusCode).toBe(403);
    expectNoSnapshot(denied);
    expect(domainState(store)).toEqual(before);
  });

  it("rejects scene-only delegates and requires both campaign and private-actor capabilities", async () => {
    const { app, store, scene } = await fixture();
    const delegateId = "usr_preview_delegate";
    store.state.users.push(createTimestamped("usr", { id: delegateId, displayName: "Scene delegate" }));
    store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: delegateId, role: "member" }));
    store.state.members.push(createTimestamped("mem", { campaignId, userId: delegateId, role: "observer" }));
    const headers = { "x-user-id": delegateId };
    store.state.scenes.push({
      ...structuredClone(scene),
      id: "scn_preview_other_delegation",
      active: false,
      permissions: { [delegateId]: ["scene.read", "scene.update"] },
    });
    expect((await preview(app, playerId, headers)).statusCode).toBe(403);
    scene.permissions = { [delegateId]: ["scene.read", "scene.update"] };
    const sceneOnly = await preview(app, playerId, headers);
    expect(sceneOnly.statusCode).toBe(403);
    expectNoSnapshot(sceneOnly);
    const grant = createTimestamped("grant", { campaignId, subjectType: "user" as const, subjectId: delegateId, permissions: ["campaign.update"] as ("campaign.update" | "actor.readPrivate")[], grantedBy: gmId });
    store.state.permissionGrants.push(grant);
    const campaignOnly = await preview(app, playerId, headers);
    expect(campaignOnly.statusCode).toBe(403);
    expectNoSnapshot(campaignOnly);
    grant.permissions.push("actor.readPrivate");
    expect((await preview(app, playerId, headers)).statusCode).toBe(200);
    grant.permissions = ["actor.readPrivate"];
    const revokedCampaign = await preview(app, playerId, headers);
    expect(revokedCampaign.statusCode).toBe(403);
    expectNoSnapshot(revokedCampaign);
    grant.permissions.push("campaign.update");
    scene.permissions = {};
    const before = domainState(store);
    const denied = await preview(app, playerId, headers);
    expect(denied.statusCode).toBe(403);
    expectNoSnapshot(denied);
    expect(domainState(store)).toEqual(before);
  });

  it("never widens a delegated caller's nested combat visibility", async () => {
    const { app, store, scene } = await fixture();
    const delegateId = "usr_preview_combat_delegate";
    store.state.users.push(createTimestamped("usr", { id: delegateId, displayName: "Preview delegate" }));
    store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: delegateId, role: "member" }));
    store.state.members.push(createTimestamped("mem", { campaignId, userId: delegateId, role: "observer" }));
    scene.permissions = { [delegateId]: ["scene.read", "scene.update"] };
    store.state.permissionGrants.push(createTimestamped("grant", { campaignId, subjectType: "user", subjectId: delegateId, permissions: ["campaign.update", "actor.readPrivate"] }));
    store.state.permissionGrants.push(createTimestamped("grant", { campaignId, subjectType: "user", subjectId: playerId, permissions: ["combat.manage"] }));
    store.state.combats.push(createTimestamped("cmb", {
      id: "cmb_preview_scope", campaignId, active: true, round: 1, turnIndex: 0,
      combatants: [
        { id: "combatant_secret", name: "PREVIEW_SECRET_COMBATANT", initiative: 20, defeated: false, hidden: true, tokenId: "tok_preview_hidden" },
        { id: "combatant_public", name: "Valen", initiative: 10, defeated: false, tokenId: "tok_valen" },
      ],
      legendaryActionPrompts: [{ id: "prompt_private", actorId: "act_preview_private", combatantId: "combatant_secret", actorName: "PREVIEW_SECRET_PROMPT", round: 1, afterTurnIndex: 0, remainingUses: 1, maximumUses: 1, options: ["PREVIEW_SECRET_LEGENDARY"], resolution: "reviewed-manual", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    }));
    const actual = await app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${sceneId}`, headers: playerHeaders });
    expect(actual.body).toContain("PREVIEW_SECRET_COMBATANT");
    const response = await preview(app, playerId, { "x-user-id": delegateId });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("PREVIEW_SECRET_");
    expect(response.json().snapshot.combats).toEqual([{
      id: "cmb_preview_scope", active: true,
      combatants: [{ id: "combatant_public", tokenId: "tok_valen" }],
      turnPresentation: { nextCombatantId: "combatant_public" },
    }]);
  });

  it("does not disclose vision polygons sourced from tokens outside the caller's read scope", async () => {
    const { app, store, scene } = await fixture();
    const delegateId = "usr_preview_vision_delegate";
    store.state.users.push(createTimestamped("usr", { id: delegateId, displayName: "Vision delegate" }));
    store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: delegateId, role: "member" }));
    store.state.members.push(createTimestamped("mem", { campaignId, userId: delegateId, role: "observer" }));
    scene.permissions = { [delegateId]: ["scene.read", "scene.update"] };
    store.state.permissionGrants.push(createTimestamped("grant", { campaignId, subjectType: "user", subjectId: delegateId, permissions: ["campaign.update", "actor.readPrivate"] }));
    scene.fog = [{ id: "fog_preview_scope_public", x: 50, y: 50, radius: 40, hidden: false }];
    scene.walls = [];
    scene.lights = [{ id: "light_preview_scope_public", x: 50, y: 50, radius: 150, color: "#ffffff" }];
    const token = structuredClone(store.state.tokens.find((candidate) => candidate.id === "tok_valen")!);
    const privateSourceId = "tok_preview_private_vision_source";
    const publicSourceId = "tok_preview_public_vision_source";
    store.state.tokens.push(
      { ...token, id: privateSourceId, x: 900, y: 600, layer: "player", hidden: false, visionEnabled: true, visionRadius: 80, ownerUserIds: [playerId] },
      { ...token, id: publicSourceId, x: 40, y: 40, width: 20, height: 20, layer: "player", hidden: false, visionEnabled: true, visionRadius: 80, ownerUserIds: [playerId] },
    );
    const before = domainState(store);
    const target = await app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${sceneId}`, headers: playerHeaders });
    const callerHeaders = { "x-user-id": delegateId };
    const caller = await app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${sceneId}`, headers: callerHeaders });
    expect(target.statusCode).toBe(200);
    expect(caller.statusCode).toBe(200);
    const targetVision = target.json().vision as VisionSnapshot;
    expect(targetVision.polygons.some((polygon) => polygon.sourceId === privateSourceId)).toBe(true);
    expect(caller.json().tokens.map((candidate: { id: string }) => candidate.id)).not.toContain(privateSourceId);
    const response = await preview(app, playerId, callerHeaders);
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(privateSourceId);
    const projectedVision = response.json().snapshot.vision as VisionSnapshot;
    expect(projectedVision.polygons.some((polygon) => polygon.sourceId === publicSourceId)).toBe(true);
    expect(projectedVision.polygons.filter((polygon) => polygon.source !== "token")).toEqual(targetVision.polygons.filter((polygon) => polygon.source !== "token"));
    expect(projectedVision).toMatchObject({ sceneId, userId: playerId, fogActive: true });
    const gmPreview = await preview(app);
    expect(gmPreview.statusCode).toBe(200);
    expect(gmPreview.json().snapshot.vision).toEqual(targetVision);
    expect(domainState(store)).toEqual(before);
  });
  it("does not substitute another scene when the chosen player cannot read the requested scene", async () => {
    const { app, store, scene } = await fixture();
    scene.active = false;
    const before = domainState(store);
    const denied = await preview(app);
    expect(denied.statusCode).toBe(404);
    expectNoSnapshot(denied);
    expect(domainState(store)).toEqual(before);
  });

  it("requires the caller's authenticated active organization to own the scene's campaign", async () => {
    const { app, store } = await fixture();
    const otherOrganization = { ...structuredClone(store.state.organizations[0]!), id: "org_preview_other", name: "Other workspace" };
    store.state.organizations.push(otherOrganization);
    store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: otherOrganization.id, userId: gmId, role: "owner" }));
    const token = "ots_preview_wrong_workspace";
    const session = createTimestamped("sess", {
      id: "sess_preview_wrong_workspace",
      userId: gmId,
      tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}`,
      activeOrganizationId: otherOrganization.id,
      expiresAt: "2099-01-01T00:00:00.000Z",
      lastSeenAt: new Date().toISOString(),
    }) satisfies UserSession;
    store.state.sessions.push(session);
    const headers = { authorization: `Bearer ${token}` };
    const denied = await preview(app, playerId, headers);
    expect(denied.statusCode).toBe(403);
    expectNoSnapshot(denied);
    session.activeOrganizationId = "org_demo";
    expect((await preview(app, playerId, headers)).statusCode).toBe(200);
  });
});

