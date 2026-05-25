import type { Actor, Token } from "@open-tabletop/core";

export function isAdversaryActor(actor: Actor, tokens: Token[]): boolean {
  if (isActorMarkedAdversary(actor)) return true;
  return tokens.some((token) => token.actorId === actor.id && token.disposition === "hostile");
}

export function adversaryActorsForSceneBoard(actors: Actor[], tokens: Token[], sceneId: string | undefined): Actor[] {
  if (!sceneId) return [];
  const sceneBoardTokens = tokens.filter((token) => token.sceneId === sceneId && token.actorId && token.layer !== "map");
  const sceneBoardActorIds = new Set(sceneBoardTokens.map((token) => token.actorId!));

  return actors.filter((actor) => {
    if (!sceneBoardActorIds.has(actor.id)) return false;
    if (isActorMarkedAdversary(actor)) return true;
    return sceneBoardTokens.some((token) => token.actorId === actor.id && token.disposition === "hostile");
  });
}

function isActorMarkedAdversary(actor: Actor): boolean {
  const type = actor.type.toLowerCase();
  if (type === "monster" || type === "adversary" || type === "enemy") return true;
  const data = recordValue(actor.data);
  const role = stringValue(data.role)?.toLowerCase() ?? stringValue(data.category)?.toLowerCase();
  return role === "adversary" || role === "enemy" || role === "monster";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
