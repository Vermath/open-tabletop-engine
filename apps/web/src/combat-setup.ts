import type { Actor, Token } from "@open-tabletop/core";

export interface CombatSetupSelection {
  tokenIds: string[];
  manualInitiatives: Record<string, number>;
  surprisedTokenIds: string[];
  surpriseEnabled: boolean;
  rollNpcInitiative: boolean;
  manualTurnOrder: boolean;
}

export interface CombatSetupSubmission extends CombatSetupSelection {
  idempotencyKey: string;
}

export interface CombatSetupValidation {
  submission?: CombatSetupSelection;
  error?: string;
}

export function isNpcInitiativeActor(actor: Actor | undefined): boolean {
  return actor?.type === "npc" || actor?.type === "monster";
}

export function initialCombatSetupTokenIds(tokens: Token[], selectedTokenIds: string[]): string[] {
  const selected = new Set(selectedTokenIds);
  return tokens.filter((token) => selected.has(token.id)).map((token) => token.id);
}

export function validateCombatSetup(input: {
  tokens: Token[];
  actors: Actor[];
  selectedTokenIds: string[];
  initiativeDrafts: Record<string, string>;
  surprisedTokenIds?: string[];
  surpriseEnabled?: boolean;
  rollNpcInitiative: boolean;
  manualTurnOrder?: boolean;
}): CombatSetupValidation {
  const selected = new Set(input.selectedTokenIds);
  const tokensById = new Map(input.tokens.map((token) => [token.id, token]));
  const participants = input.selectedTokenIds.flatMap((tokenId) => {
    const token = tokensById.get(tokenId);
    return token && selected.has(token.id) ? [token] : [];
  });
  if (participants.length === 0) return { error: "Choose at least one scene token." };

  const actors = new Map(input.actors.map((actor) => [actor.id, actor]));
  const manualInitiatives: Record<string, number> = {};
  for (const token of participants) {
    const actor = token.actorId ? actors.get(token.actorId) : undefined;
    if (input.rollNpcInitiative && isNpcInitiativeActor(actor)) continue;
    const draft = input.initiativeDrafts[token.id]?.trim() ?? "";
    const initiative = Number(draft);
    if (!draft || !Number.isFinite(initiative)) {
      return { error: `Enter initiative for ${token.name}.` };
    }
    manualInitiatives[token.id] = initiative;
  }

  return {
    submission: {
      tokenIds: participants.map((token) => token.id),
      manualInitiatives,
      surprisedTokenIds: input.surpriseEnabled === false ? [] : (input.surprisedTokenIds ?? []).filter((tokenId) => selected.has(tokenId) && tokensById.has(tokenId)),
      surpriseEnabled: input.surpriseEnabled !== false,
      rollNpcInitiative: input.rollNpcInitiative,
      manualTurnOrder: input.manualTurnOrder === true
    }
  };
}

export function moveCombatSetupToken(tokenIds: string[], tokenId: string, direction: -1 | 1): string[] {
  const index = tokenIds.indexOf(tokenId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= tokenIds.length) return tokenIds;
  const next = [...tokenIds];
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return next;
}
