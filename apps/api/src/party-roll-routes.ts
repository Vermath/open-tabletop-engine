import { createHash } from "node:crypto";
import {
  createEvent, createTimestamped, hasPermission,
  type Actor, type DiceRoll, type EngineEvent, type PartyRollChoice, type PartyRollRecipient,
  type PartyRollRequest, type PermissionName, type StoredPartyRollRequest,
} from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { rollFormulaWithFairness } from "./fair-dice.js";
import type { StateStore } from "./store.js";

type Headers = FastifyRequest["headers"];
interface PartyRollDependencies {
  store: StateStore;
  requirePermission(reply: FastifyReply, headers: Headers, campaignId: string, permission: PermissionName): true | FastifyReply;
  currentUserId(headers: Headers): string;
  nextRevisionTimestamp(current: string): string;
  quickRolls(actor: Actor): Array<{ id: string; label: string; formula: string }>;
  broadcast(event: EngineEvent): void;
}

function permitted(store: StateStore, userId: string, campaignId: string, permission: PermissionName): boolean {
  return hasPermission({ userId, campaignId, permission, members: store.state.members, grants: store.state.permissionGrants });
}

function memberRole(store: StateStore, userId: string, campaignId: string) {
  return store.state.members.find((member) => member.userId === userId && member.campaignId === campaignId)?.role;
}

function managesRequests(store: StateStore, userId: string, campaignId: string): boolean {
  const role = memberRole(store, userId, campaignId);
  return (role === "owner" || role === "gm" || role === "assistant_gm") && permitted(store, userId, campaignId, "combat.manage");
}

function eligibleCharacter(store: StateStore, actor: Actor): actor is Actor & { ownerUserId: string } {
  const owner = actor.ownerUserId;
  return actor.type === "character" && Boolean(owner && store.state.users.some((user) => user.id === owner && !user.disabledAt)
    && memberRole(store, owner, actor.campaignId) === "player"
    && permitted(store, owner, actor.campaignId, "actor.read") && permitted(store, owner, actor.campaignId, "dice.roll"));
}

function currentPlayerCharacter(store: StateStore, campaignId: string, row: PartyRollRecipient, userId: string): Actor | undefined {
  if (row.userId !== userId) return undefined;
  return store.state.actors.find((actor) => actor.id === row.actorId && actor.campaignId === campaignId
    && actor.ownerUserId === userId && eligibleCharacter(store, actor));
}

export function partyRollForUser(store: StateStore, userId: string, stored: StoredPartyRollRequest): PartyRollRequest | undefined {
  const { creation: _creation, ...request } = stored;
  if (managesRequests(store, userId, request.campaignId)) return {
    ...request,
    recipients: request.recipients.map((row) => row.result || currentPlayerCharacter(store, request.campaignId, row, row.userId)
      ? row : { ...row, unavailable: true }),
  };
  const recipients = request.recipients.filter((row) => currentPlayerCharacter(store, request.campaignId, row, userId));
  return recipients.length ? { ...request, recipients } : undefined;
}

export function partyRollChangedEvent(request: PartyRollRequest): EngineEvent {
  // Socket recipients get a permission-filtered projection of the committed roster.
  return createEvent({ campaignId: request.campaignId, type: "partyRoll.updated", targetId: request.id, payload: {} });
}

export function replacePartyRollResult(store: StateStore, original: DiceRoll, replacement: DiceRoll, nextRevision: (timestamp: string) => string): PartyRollRequest | undefined {
  for (const request of store.state.partyRollRequests) {
    if (request.campaignId !== original.campaignId) continue;
    const row = request.recipients.find((recipient) => recipient.actorId === original.actorId && recipient.result?.id === original.id);
    if (!row) continue;
    row.result = { id: replacement.id, formula: replacement.formula, total: replacement.total };
    request.updatedAt = nextRevision(request.updatedAt);
    return request;
  }
  return undefined;
}

function hashParts(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function sheetChecks(dependencies: PartyRollDependencies, actor: Actor) {
  // Declarative actions can carry costs and effects. Only built-in sheet checks are plain roll requests.
  if (!["dnd-5e-srd", "stellar-frontiers", "mystic-noir", "generic-fantasy"].includes(actor.systemId)) return [];
  return dependencies.quickRolls(actor).filter((roll) => /^(skill|save)-/.test(roll.id));
}

export function registerPartyRollRoutes(app: FastifyInstance, dependencies: PartyRollDependencies): void {
  const { store, currentUserId, requirePermission, broadcast } = dependencies;
  const requireManager = (reply: FastifyReply, headers: Headers, campaignId: string) => {
    const allowed = requirePermission(reply, headers, campaignId, "combat.manage");
    if (allowed !== true) return allowed;
    return managesRequests(store, currentUserId(headers), campaignId) || reply.code(403).send({ error: "forbidden", message: "A GM must request party rolls" });
  };
  const changed = (request: PartyRollRequest) => {
    store.save();
    broadcast(partyRollChangedEvent(request));
  };

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/party-roll-requests/choices", async (request, reply) => {
    const { campaignId } = request.params;
    const allowed = requireManager(reply, request.headers, campaignId);
    if (allowed !== true) return allowed;
    return store.state.actors.filter((actor) => actor.campaignId === campaignId && eligibleCharacter(store, actor)).flatMap((actor): PartyRollChoice[] => {
      const rolls = sheetChecks(dependencies, actor).map(({ id, label }) => ({ id, label }));
      return rolls.length ? [{ actorId: actor.id, actorName: actor.name, rolls }] : [];
    });
  });

  app.post<{ Params: { campaignId: string }; Body: { rollId?: unknown; actorIds?: unknown } }>("/api/v1/campaigns/:campaignId/party-roll-requests", async (request, reply) => {
    const { campaignId } = request.params;
    const allowed = requireManager(reply, request.headers, campaignId);
    if (allowed !== true) return allowed;
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !key.trim() || key.length > 160) return reply.code(400).send({ error: "bad_request", message: "Supply an Idempotency-Key of 1–160 characters" });
    const { rollId, actorIds } = request.body ?? {};
    if (typeof rollId !== "string" || !Array.isArray(actorIds) || !actorIds.length || actorIds.length > 100
      || actorIds.some((id) => typeof id !== "string") || new Set(actorIds).size !== actorIds.length) {
      return reply.code(400).send({ error: "bad_request", message: "Choose a check and 1–100 distinct characters" });
    }
    const scopedKeyHash = hashParts([campaignId, currentUserId(request.headers), key.trim()]);
    const inputHash = hashParts([rollId, [...actorIds].sort()]);
    const prior = store.state.partyRollRequests.find((entry) => entry.campaignId === campaignId && entry.creation?.scopedKeyHash === scopedKeyHash);
    if (prior) {
      if (prior.creation?.inputHash !== inputHash) return reply.code(409).send({ error: "conflict", message: "This Idempotency-Key already identifies a different party roll request" });
      return reply.code(201).header("Idempotency-Replayed", "true").send({ id: prior.id });
    }
    const recipients: PartyRollRecipient[] = [];
    let label = "";
    for (const id of actorIds) {
      const actor = store.state.actors.find((candidate) => candidate.id === id && candidate.campaignId === campaignId);
      if (!actor || !eligibleCharacter(store, actor)) return reply.code(400).send({ error: "bad_request", message: "Choose current player-owned characters in this campaign" });
      const roll = sheetChecks(dependencies, actor).find((candidate) => candidate.id === rollId);
      if (!roll) return reply.code(400).send({ error: "bad_request", message: `This check is unavailable for ${actor.name}` });
      label = roll.label;
      recipients.push({ actorId: actor.id, actorName: actor.name, userId: actor.ownerUserId });
    }
    const entry = createTimestamped("partyroll", { campaignId, rollId, label, recipients, creation: { scopedKeyHash, inputHash } });
    store.state.partyRollRequests.push(entry);
    changed(entry);
    return reply.code(201).send({ id: entry.id });
  });

  app.post<{ Params: { campaignId: string; requestId: string; actorId: string } }>("/api/v1/campaigns/:campaignId/party-roll-requests/:requestId/actors/:actorId/roll", async (request, reply) => {
    const { campaignId, requestId, actorId } = request.params;
    const allowed = requirePermission(reply, request.headers, campaignId, "dice.roll");
    if (allowed !== true) return allowed;
    const userId = currentUserId(request.headers);
    const entry = store.state.partyRollRequests.find((candidate) => candidate.id === requestId && candidate.campaignId === campaignId);
    const row = entry?.recipients.find((candidate) => candidate.actorId === actorId);
    const actor = row && currentPlayerCharacter(store, campaignId, row, userId);
    if (!entry || !row || !actor) return reply.code(404).send({ error: "not_found", message: "Roll request unavailable" });
    if (row.result) return { id: row.result.id };
    const definition = sheetChecks(dependencies, actor).find((roll) => roll.id === entry.rollId);
    if (!definition) return reply.code(409).send({ error: "conflict", message: "This character no longer has the requested check" });
    const { rolled, fairness } = rollFormulaWithFairness(definition.formula);
    const roll = createTimestamped("roll", { campaignId, userId, actorId, label: definition.label, formula: definition.formula,
      total: rolled.total, terms: rolled.terms, fairness, visibility: "whisper" as const }) satisfies DiceRoll;
    row.result = { id: roll.id, formula: roll.formula, total: roll.total };
    entry.updatedAt = dependencies.nextRevisionTimestamp(entry.updatedAt);
    store.state.rolls.push(roll);
    changed(entry);
    return { id: roll.id };
  });
}
