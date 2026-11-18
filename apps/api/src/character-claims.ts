import type { Actor, EngineState, Token } from "@open-tabletop/core";

export function campaignCharacterClaimRoster(state: EngineState, campaignId: string, offeringManagerId?: string) {
  const scenes = new Map(state.scenes.filter((scene) => scene.campaignId === campaignId).map((scene) => [scene.id, scene]));
  const pending = new Set(state.characterTransfers.filter((transfer) => transfer.campaignId === campaignId && transfer.status === "pending").map((transfer) => transfer.actorId));
  const linked = new Map<string, Token[]>();
  for (const token of state.tokens) {
    if (!token.actorId || !scenes.has(token.sceneId)) continue;
    const group = linked.get(token.actorId);
    if (group) group.push(token);
    else linked.set(token.actorId, [token]);
  }
  return state.actors.filter((actor) => actor.campaignId === campaignId && actor.type === "character").map((actor) => {
    const tokens = linked.get(actor.id) ?? [];
    const landingToken = tokens.find((token) => scenes.get(token.sceneId)?.active && !token.hidden && (token.layer ?? "player") === "player");
    // A manager may offer their own wizard-created character. Pin that identity
    // to the offer so an intervening transfer cannot give away the next owner's sheet.
    const allowedOwner = offeringManagerId ?? actor.characterClaimOfferedByUserId;
    const eligible = Boolean(landingToken && (!actor.ownerUserId || actor.ownerUserId === allowedOwner)
      && tokens.every((token) => (token.ownerUserIds ?? []).every((owner) => owner === allowedOwner)) && !pending.has(actor.id));
    return { actor, tokens, landingToken, eligible };
  });
}

export function characterClaimOption(actor: Actor) {
  return { actorId: actor.id, name: actor.name, updatedAt: actor.updatedAt, offered: actor.characterClaimOffered === true };
}
