import { routes, type CharacterClaimOption } from "@open-tabletop/api-contracts";
import * as core from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { secureArchiveIdentityForImport } from "./archive-operations.js";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const campaignId = "camp_demo";
const gm = { "x-user-id": "usr_demo_gm" };
const mutation = (key: string) => ({ "idempotency-key": "claim-test-" + key });

function prepareRoster(store: MemoryStateStore) {
  const actor = store.state.actors.find((entry) => entry.id === "act_valen")!;
  delete actor.ownerUserId;
  const token = store.state.tokens.find((entry) => entry.actorId === actor.id)!;
  token.ownerUserIds = [];
  store.state.tokens.push({ ...structuredClone(token), id: "second-linked-token", hidden: true });
  store.save();
  store.flush();
  return { actor, token };
}

async function acceptPlayer(app: Awaited<ReturnType<typeof buildApp>>, name: string, role: "player" | "observer" | "assistant_gm" = "player", targetCampaignId = campaignId) {
  const email = `${name}@example.test`;
  const invite = await app.inject({ method: "POST", url: `/api/v1/campaigns/${targetCampaignId}/invites`, headers: { ...gm, ...mutation("invite-" + name) }, payload: { email, role } });
  expect(invite.statusCode, invite.body).toBe(200);
  const accept = await app.inject({ method: "POST", url: "/api/v1/invites/accept", headers: mutation("accept-" + name), payload: {
    email, displayName: name, password: "strong password for this test", token: invite.json().token, expectedUpdatedAt: invite.json().invite.updatedAt
  } });
  expect(accept.statusCode, accept.body).toBe(200);
  return { userId: accept.json().user.id as string, headers: { authorization: `Bearer ${accept.json().token}` } };
}

describe("campaign player character claims", () => {
  it("lets one invited player claim a GM offer and reconnect with a private sheet and linked tokens", async () => {
    const store = new MemoryStateStore();
    const { actor, token } = prepareRoster(store);
    const app = await buildApp({ store });
    try {
      const one = await acceptPlayer(app, "claim-first");
      const two = await acceptPlayer(app, "claim-second");
      const observer = await acceptPlayer(app, "claim-observer", "observer");
      const offerUrl = routes.characterClaimOffer(campaignId, actor.id);
      const claimUrl = routes.characterClaim(campaignId, actor.id);
      const options = async (headers: Record<string, string>) => (await app.inject({ url: routes.characterClaims(campaignId), headers })).json() as CharacterClaimOption[];
      expect(await options(one.headers)).toEqual([]);
      const offer = { offered: true, expectedUpdatedAt: actor.updatedAt };
      expect((await app.inject({ method: "POST", url: offerUrl, headers: { ...one.headers, ...mutation("bad-offer") }, payload: offer })).statusCode).toBe(403);
      const offered = await app.inject({ method: "POST", url: offerUrl, headers: { ...gm, ...mutation("offer") }, payload: offer });
      expect(offered.statusCode, offered.body).toBe(200);
      expect(await options(observer.headers)).toEqual([]);
      expect(await options(one.headers)).toEqual([offered.json()]);
      const claim = (player: typeof one, key: string, revision = offered.json().updatedAt) => app.inject({ method: "POST", url: claimUrl, headers: { ...player.headers, ...mutation(key) }, payload: { expectedUpdatedAt: revision } });
      expect((await claim(observer, "observer")).statusCode).toBe(403);
      expect((await claim(one, "stale", offer.expectedUpdatedAt)).statusCode).toBe(409);
      const attempts = await Promise.all([claim(one, "race-first"), claim(two, "race-second")]);
      expect(attempts.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      const firstWon = attempts[0].statusCode === 200;
      const [winner, loser] = firstWon ? [one, two] : [two, one];
      const replay = await claim(winner, firstWon ? "race-first" : "race-second");
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.json()).toEqual({ actorId: actor.id, sceneId: token.sceneId, tokenId: token.id });
      expect((await claim(loser, "try-again", actor.updatedAt)).statusCode).toBe(409);
      expect(await options(loser.headers)).toEqual([]);
      expect(store.state.actors.find((entry) => entry.id === actor.id)?.ownerUserId).toBe(winner.userId);
      expect(store.state.tokens.filter((entry) => entry.actorId === actor.id).map((entry) => entry.ownerUserIds)).toEqual([[winner.userId], [winner.userId]]);
      expect(store.state.auditLogs.filter((entry) => entry.action === "actor.claim")).toHaveLength(1);

      const restored = await buildApp({ store: new MemoryStateStore(structuredClone(store.state)) });
      try {
        const snapshot = await restored.inject({ url: `/api/v1/campaigns/${campaignId}/snapshot?sceneId=${token.sceneId}`, headers: winner.headers });
        expect(snapshot.statusCode, snapshot.body).toBe(200);
        expect(snapshot.json().tokens).toContainEqual(expect.objectContaining({ id: token.id, ownerUserIds: [winner.userId] }));
        expect(snapshot.json().tokens).not.toContainEqual(expect.objectContaining({ id: "second-linked-token" }));
        const sheetUrl = `/api/v1/campaigns/${campaignId}/systems/${actor.systemId}/actors/${actor.id}`;
        const sheet = await restored.inject({ url: sheetUrl + "/sheet", headers: winner.headers });
        expect(sheet.statusCode, sheet.body).toBe(200);
        const roll = await restored.inject({ method: "POST", url: sheetUrl + "/roll", headers: { ...winner.headers, ...mutation("first-sheet-roll") }, payload: { rollId: "ability-strength" } });
        expect(roll.statusCode, roll.body).toBe(200);
        expect(roll.json().roll.total).toEqual(expect.any(Number));
      } finally { await restored.close(); }
    } finally { await app.close(); }
  });

  it("rolls actor, token, offer and receipt back together on a durable write failure", async () => {
    class FailingClaimStore extends MemoryStateStore {
      failClaim = false;
      override flush() {
        if (this.failClaim && this.state.auditLogs.some((event) => event.action === "actor.claim")) {
          this.failClaim = false;
          throw new Error("simulated claim commit failure");
        }
        super.flush();
      }
    }
    const store = new FailingClaimStore();
    const { actor, token } = prepareRoster(store);
    const app = await buildApp({ store });
    try {
      const player = await acceptPlayer(app, "durable-claim");
      const offer = await app.inject({ method: "POST", url: routes.characterClaimOffer(campaignId, actor.id), headers: { ...gm, ...mutation("durable-offer") }, payload: { offered: true, expectedUpdatedAt: actor.updatedAt } });
      expect(offer.statusCode).toBe(200);
      const claim = () => app.inject({ method: "POST", url: routes.characterClaim(campaignId, actor.id), headers: { ...player.headers, ...mutation("durable-claim") }, payload: { expectedUpdatedAt: offer.json().updatedAt } });
      store.failClaim = true;
      expect((await claim()).statusCode).toBe(500);
      const restored = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      expect(restored.ownerUserId).toBeUndefined();
      expect(restored.characterClaimOffered).toBe(true);
      expect(store.state.tokens.find((candidate) => candidate.id === token.id)?.ownerUserIds).toEqual([]);
      expect(store.state.auditLogs.some((event) => event.action === "actor.claim")).toBe(false);
      expect((await claim()).statusCode).toBe(200);
    } finally { await app.close(); }
  });

  it("requires private-sheet access for both the offer and its later redemption", async () => {
    const store = new MemoryStateStore();
    const { actor } = prepareRoster(store);
    const app = await buildApp({ store });
    try {
      const assistant = await acceptPlayer(app, "claim-assistant", "assistant_gm");
      const player = await acceptPlayer(app, "claim-scoped-player");
      // Exercise a scoped assistant independently of the default role's broad grants.
      const original = core.hasPermission;
      const permissions = vi.spyOn(core, "hasPermission").mockImplementation((input) =>
        !(input.userId === assistant.userId && input.permission === "actor.readPrivate") && original(input));
      try {
        const options = async (headers: Record<string, string>) => (await app.inject({ url: routes.characterClaims(campaignId), headers })).json();
        const offer = (key: string) => app.inject({ method: "POST", url: routes.characterClaimOffer(campaignId, actor.id), headers: { ...assistant.headers, ...mutation(key) }, payload: { offered: true, expectedUpdatedAt: actor.updatedAt } });
        expect(await options(assistant.headers)).toEqual([]);
        expect((await offer("assistant-no-access")).statusCode).toBe(403);
        actor.permissions[assistant.userId] = ["actor.readPrivate"];
        const offered = await offer("assistant-shared");
        expect(offered.statusCode, offered.body).toBe(200);
        expect(await options(player.headers)).toEqual([offered.json()]);
        delete actor.permissions[assistant.userId];
        expect(await options(player.headers)).toEqual([]);
        const claim = (key: string) => app.inject({ method: "POST", url: routes.characterClaim(campaignId, actor.id), headers: { ...player.headers, ...mutation(key) }, payload: { expectedUpdatedAt: actor.updatedAt } });
        expect((await claim("assistant-revoked")).statusCode).toBe(409);
        const campaign = store.state.campaigns.find((entry) => entry.id === campaignId)!;
        const copy = await app.inject({ method: "POST", url: routes.campaignDuplicate(campaignId), headers: { ...gm, ...mutation("copy-revoked-offer") }, payload: { expectedUpdatedAt: campaign.updatedAt } });
        expect(copy.statusCode, copy.body).toBe(201);
        const copyId = copy.json().campaign.id as string;
        const copyPlayer = await acceptPlayer(app, "copy-after-revocation", "player", copyId);
        const copiedActor = store.state.actors.find((entry) => entry.campaignId === copyId && entry.name === actor.name)!;
        expect(copiedActor.characterClaimOffered).toBeUndefined();
        expect((await app.inject({ url: routes.characterClaims(copyId), headers: copyPlayer.headers })).json()).toEqual([]);
        const copyClaim = await app.inject({ method: "POST", url: routes.characterClaim(copyId, copiedActor.id), headers: { ...copyPlayer.headers, ...mutation("copy-revoked-claim") }, payload: { expectedUpdatedAt: copiedActor.updatedAt } });
        expect(copyClaim.statusCode).toBe(409);
        actor.permissions[assistant.userId] = ["actor.readPrivate"];
        store.state.members.find((member) => member.userId === assistant.userId && member.campaignId === campaignId)!.role = "observer";
        expect((await claim("assistant-demoted")).statusCode).toBe(409);
        expect(actor.ownerUserId).toBeUndefined();
      } finally { permissions.mockRestore(); }
    } finally { await app.close(); }
  });

  it("copies starter and GM-authored offers under the new campaign owner", async () => {
    const store = new MemoryStateStore();
    const { actor, token } = prepareRoster(store);
    const app = await buildApp({ store });
    try {
      const assistant = await acceptPlayer(app, "copy-offer-gm", "assistant_gm");
      actor.characterClaimOffered = true; // Starter characters have no individual offering manager.
      const explicit = { ...structuredClone(actor), id: "act_explicit_offer", name: "Assistant's character", ownerUserId: assistant.userId, characterClaimOfferedByUserId: assistant.userId };
      store.state.actors.push(explicit);
      store.state.tokens.push({ ...structuredClone(token), id: "explicit-offer-token", actorId: explicit.id, ownerUserIds: [assistant.userId] });
      const campaign = store.state.campaigns.find((entry) => entry.id === campaignId)!;
      const copy = await app.inject({ method: "POST", url: routes.campaignDuplicate(campaignId), headers: { ...gm, ...mutation("duplicate-offered") }, payload: { name: "Copied offers", expectedUpdatedAt: campaign.updatedAt } });
      expect(copy.statusCode, copy.body).toBe(201);
      const copyId = copy.json().campaign.id as string;
      const player = await acceptPlayer(app, "copy-offer-player", "player", copyId);
      const options = (await app.inject({ url: routes.characterClaims(copyId), headers: player.headers })).json() as CharacterClaimOption[];
      expect(options.map((entry) => entry.name).sort()).toEqual([actor.name, explicit.name].sort());
      const choice = options.find((entry) => entry.name === explicit.name)!;
      const claim = await app.inject({ method: "POST", url: routes.characterClaim(copyId, choice.actorId), headers: { ...player.headers, ...mutation("claim-copy") }, payload: { expectedUpdatedAt: choice.updatedAt } });
      expect(claim.statusCode, claim.body).toBe(200);
      expect(store.state.tokens.find((entry) => entry.id === claim.json().tokenId)?.ownerUserIds).toEqual([player.userId]);
      expect(explicit.ownerUserId).toBe(assistant.userId);
    } finally { await app.close(); }
  });

  it("restores existing campaign offers from local authority and discards foreign offers", () => {
    const store = new MemoryStateStore();
    const { actor } = prepareRoster(store);
    const archive = structuredClone(core.makeArchive(store.state, campaignId));
    const archivedActor = archive.data.actors.find((entry) => entry.id === actor.id)!;
    archivedActor.characterClaimOffered = true;
    archivedActor.characterClaimOfferedByUserId = "absent-manager";
    const campaign = store.state.campaigns.find((entry) => entry.id === campaignId)!;
    const restored = () => secureArchiveIdentityForImport(store.state, archive, { userId: campaign.ownerUserId, organizationId: campaign.organizationId! }).data.actors.find((entry) => entry.id === actor.id)!;
    expect(restored().characterClaimOffered).toBeUndefined();
    actor.characterClaimOffered = true;
    actor.characterClaimOfferedByUserId = campaign.ownerUserId;
    expect(restored().characterClaimOfferedByUserId).toBe(campaign.ownerUserId);
    archivedActor.ownerUserId = "usr_demo_player";
    expect(restored().characterClaimOffered).toBeUndefined();
  });

  it("withdraws offers and rechecks token eligibility at claim time", async () => {
    const store = new MemoryStateStore();
    const { actor, token } = prepareRoster(store);
    const app = await buildApp({ store });
    try {
      const player = await acceptPlayer(app, "guarded-claim");
      const postOffer = (offered: boolean, key: string) => app.inject({ method: "POST", url: routes.characterClaimOffer(campaignId, actor.id), headers: { ...gm, ...mutation(key) }, payload: { offered, expectedUpdatedAt: actor.updatedAt } });
      expect((await postOffer(true, "offer-original")).statusCode).toBe(200);
      expect((await postOffer(false, "withdraw")).statusCode).toBe(200);
      const claim = (key: string) => app.inject({ method: "POST", url: routes.characterClaim(campaignId, actor.id), headers: { ...player.headers, ...mutation(key) }, payload: { expectedUpdatedAt: actor.updatedAt } });
      expect((await claim("withdrawn")).statusCode).toBe(409);
      expect((await postOffer(true, "reoffer")).statusCode).toBe(200);
      token.ownerUserIds = ["usr_demo_player"];
      expect((await claim("reassigned-token")).statusCode).toBe(409);
      token.ownerUserIds = [];
      token.hidden = true;
      expect((await claim("hidden-token")).statusCode).toBe(409);
      expect(actor.ownerUserId).toBeUndefined();
    } finally { await app.close(); }
  });
});
