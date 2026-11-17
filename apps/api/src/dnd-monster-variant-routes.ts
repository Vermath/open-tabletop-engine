import {
  createEvent,
  createId,
  createTimestamped,
  type CompendiumCatalogEntry,
  type EngineEvent,
  type Item,
  type PermissionName,
} from "@open-tabletop/core";
import {
  DND_5E_SRD_SYSTEM_ID,
  buildDndMonsterVariant,
  dnd5eMonsterContentDataFromStatBlock,
  dnd5eSrdCompendium,
  dnd5eSrdEncounterThreats,
  dnd5eSrdMonsterActorData,
  validateDndMonsterTemplateOverrides,
  type DndMonsterBase,
  type DndMonsterTemplateDraft,
  type DndMonsterTemplateRecord,
  type DndMonsterVariantDraft,
} from "@open-tabletop/system-sdk";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { StateStore } from "./store.js";

export const DND_MONSTER_TEMPLATE_ITEM_TYPE = "dnd-monster-template";

interface CustomContentPayload {
  item: Item;
  entry: CompendiumCatalogEntry;
  draft: Record<string, unknown>;
  warnings?: Array<{ path: string; code: string; message: string }>;
  campaignUpdatedAt?: string;
}

interface MonsterVariantRouteDependencies {
  store: StateStore;
  broadcast(event: EngineEvent): void;
  requireCampaignPermission(reply: FastifyReply, headers: FastifyRequest["headers"], campaignId: string, permission: PermissionName): true | FastifyReply;
  requireUser(reply: FastifyReply, headers: FastifyRequest["headers"]): string | FastifyReply;
  badRequest(reply: FastifyReply, message: string): FastifyReply;
  notFound(reply: FastifyReply, message: string): FastifyReply;
  staleWriteConflict(reply: FastifyReply, input: { resourceType: "campaign" | "item"; resourceId: string; expectedUpdatedAt: string; currentUpdatedAt: string; current: unknown }): FastifyReply;
  nextRevisionTimestamp(current: string): string;
  appendAudit(userId: string, entry: { campaignId: string; action: string; targetType: string; targetId: string; before?: Record<string, unknown>; after?: Record<string, unknown> }): void;
  isCustomContentItem(item: Item, campaignId: string): boolean;
  customContentPayload(item: Item): CustomContentPayload;
  idempotencyKey(headers: FastifyRequest["headers"]): string | undefined;
}

export function registerDndMonsterVariantRoutes(app: FastifyInstance, dependencies: MonsterVariantRouteDependencies): void {
  const { store } = dependencies;

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/dnd/monster-templates", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    return store.state.items
      .filter((item) => isDndMonsterTemplateItem(item, request.params.campaignId))
      .map(dndMonsterTemplatePayload)
      .sort((left, right) => left.template.name.localeCompare(right.template.name) || left.template.id.localeCompare(right.template.id));
  });

  app.post<{ Params: { campaignId: string }; Body: DndMonsterTemplateDraft }>("/api/v1/campaigns/:campaignId/dnd/monster-templates/preview", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const validated = validateDndMonsterTemplateDraft(request.body);
    if (!validated.ok) return reply.code(422).send({ error: "monster_template_invalid", issues: validated.errors, warnings: validated.warnings });
    return { preview: true as const, template: { id: "monster-template-preview", version: "preview", ...validated.template }, warnings: validated.warnings };
  });

  app.post<{ Params: { campaignId: string }; Body: DndMonsterTemplateDraft & { expectedCampaignUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/dnd/monster-templates", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const userId = dependencies.requireUser(reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!dependencies.idempotencyKey(request.headers)) return dependencies.badRequest(reply, "Creating a monster template requires an Idempotency-Key header");
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return dependencies.notFound(reply, "Campaign not found");
    const expectedUpdatedAt = nonEmptyString(request.body?.expectedCampaignUpdatedAt);
    if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) return dependencies.badRequest(reply, "expectedCampaignUpdatedAt must be a valid campaign date-time");
    if (expectedUpdatedAt !== campaign.updatedAt) return dependencies.staleWriteConflict(reply, { resourceType: "campaign", resourceId: campaign.id, expectedUpdatedAt, currentUpdatedAt: campaign.updatedAt, current: { id: campaign.id, updatedAt: campaign.updatedAt } });
    const validated = validateDndMonsterTemplateDraft(request.body);
    if (!validated.ok) return reply.code(422).send({ error: "monster_template_invalid", issues: validated.errors, warnings: validated.warnings });
    const changedAt = dependencies.nextRevisionTimestamp(campaign.updatedAt);
    const item = createTimestamped("itm", { campaignId: campaign.id, systemId: DND_5E_SRD_SYSTEM_ID, type: DND_MONSTER_TEMPLATE_ITEM_TYPE, name: validated.template.name, data: templateData(validated.template) }) satisfies Item;
    item.updatedAt = changedAt;
    campaign.updatedAt = changedAt;
    store.state.items.push(item);
    dependencies.appendAudit(userId, { campaignId: campaign.id, action: "dnd.monsterTemplate.create", targetType: "item", targetId: item.id, after: dndMonsterTemplateAuditSummary(item) });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: campaign.id, type: "item.created", actorUserId: userId, targetId: item.id, payload: item }));
    return reply.code(201).send({ ...dndMonsterTemplatePayload(item), warnings: validated.warnings, campaignUpdatedAt: campaign.updatedAt });
  });

  app.patch<{ Params: { campaignId: string; templateId: string }; Body: DndMonsterTemplateDraft & { expectedUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/dnd/monster-templates/:templateId", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const userId = dependencies.requireUser(reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!dependencies.idempotencyKey(request.headers)) return dependencies.badRequest(reply, "Updating a monster template requires an Idempotency-Key header");
    const item = store.state.items.find((candidate) => candidate.id === request.params.templateId && isDndMonsterTemplateItem(candidate, request.params.campaignId));
    if (!item) return dependencies.notFound(reply, "Monster template not found");
    const expectedUpdatedAt = nonEmptyString(request.body?.expectedUpdatedAt);
    if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) return dependencies.badRequest(reply, "expectedUpdatedAt must be a valid monster template date-time");
    if (expectedUpdatedAt !== item.updatedAt) return dependencies.staleWriteConflict(reply, { resourceType: "item", resourceId: item.id, expectedUpdatedAt, currentUpdatedAt: item.updatedAt, current: dndMonsterTemplatePayload(item) });
    const validated = validateDndMonsterTemplateDraft(request.body);
    if (!validated.ok) return reply.code(422).send({ error: "monster_template_invalid", issues: validated.errors, warnings: validated.warnings });
    const before = dndMonsterTemplateAuditSummary(item);
    item.name = validated.template.name;
    item.data = templateData(validated.template);
    item.updatedAt = dependencies.nextRevisionTimestamp(item.updatedAt);
    const campaign = store.state.campaigns.find((candidate) => candidate.id === item.campaignId);
    if (campaign) campaign.updatedAt = dependencies.nextRevisionTimestamp(campaign.updatedAt);
    dependencies.appendAudit(userId, { campaignId: item.campaignId, action: "dnd.monsterTemplate.update", targetType: "item", targetId: item.id, before, after: dndMonsterTemplateAuditSummary(item) });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: item.campaignId, type: "item.updated", actorUserId: userId, targetId: item.id, payload: item }));
    return { ...dndMonsterTemplatePayload(item), warnings: validated.warnings, campaignUpdatedAt: campaign?.updatedAt };
  });

  app.delete<{ Params: { campaignId: string; templateId: string }; Body: { expectedUpdatedAt?: unknown }; Querystring: { expectedUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/dnd/monster-templates/:templateId", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const userId = dependencies.requireUser(reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!dependencies.idempotencyKey(request.headers)) return dependencies.badRequest(reply, "Deleting a monster template requires an Idempotency-Key header");
    const index = store.state.items.findIndex((candidate) => candidate.id === request.params.templateId && isDndMonsterTemplateItem(candidate, request.params.campaignId));
    const item = store.state.items[index];
    if (!item) return dependencies.notFound(reply, "Monster template not found");
    const expectedUpdatedAt = nonEmptyString(request.body?.expectedUpdatedAt ?? request.query.expectedUpdatedAt);
    if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) return dependencies.badRequest(reply, "expectedUpdatedAt must be a valid monster template date-time");
    if (expectedUpdatedAt !== item.updatedAt) return dependencies.staleWriteConflict(reply, { resourceType: "item", resourceId: item.id, expectedUpdatedAt, currentUpdatedAt: item.updatedAt, current: dndMonsterTemplatePayload(item) });
    store.state.items.splice(index, 1);
    const campaign = store.state.campaigns.find((candidate) => candidate.id === item.campaignId);
    if (campaign) campaign.updatedAt = dependencies.nextRevisionTimestamp(campaign.updatedAt);
    dependencies.appendAudit(userId, { campaignId: item.campaignId, action: "dnd.monsterTemplate.delete", targetType: "item", targetId: item.id, before: dndMonsterTemplateAuditSummary(item), after: { deleted: true } });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: item.campaignId, type: "item.deleted", actorUserId: userId, targetId: item.id, payload: item }));
    return { deleted: true as const, templateId: item.id, campaignUpdatedAt: campaign?.updatedAt };
  });

  app.get<{ Params: { campaignId: string } }>("/api/v1/campaigns/:campaignId/dnd/monster-bases", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    return dndMonsterVariantBases(store, request.params.campaignId, dependencies);
  });

  app.post<{ Params: { campaignId: string }; Body: DndMonsterVariantDraft }>("/api/v1/campaigns/:campaignId/dnd/monster-variants/preview", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const resolved = resolveDndMonsterVariantInputs(store, request.params.campaignId, request.body, dependencies);
    if (!resolved.ok) return resolutionError(reply, resolved, dependencies);
    const result = buildDndMonsterVariant({ id: "monster-variant-preview", draft: request.body, base: resolved.base, template: resolved.template });
    if (!result.ok) return reply.code(422).send({ error: "monster_variant_invalid", issues: result.errors, warnings: result.warnings });
    return { preview: true as const, entry: result.entry, variant: result.metadata, diff: result.diff, warnings: result.warnings };
  });

  app.post<{ Params: { campaignId: string }; Body: DndMonsterVariantDraft & { expectedCampaignUpdatedAt?: unknown } }>("/api/v1/campaigns/:campaignId/dnd/monster-variants", async (request, reply) => {
    const allowed = dependencies.requireCampaignPermission(reply, request.headers, request.params.campaignId, "campaign.update");
    if (allowed !== true) return allowed;
    const userId = dependencies.requireUser(reply, request.headers);
    if (typeof userId !== "string") return userId;
    if (!dependencies.idempotencyKey(request.headers)) return dependencies.badRequest(reply, "Creating a monster variant requires an Idempotency-Key header");
    const campaign = store.state.campaigns.find((item) => item.id === request.params.campaignId);
    if (!campaign) return dependencies.notFound(reply, "Campaign not found");
    const expectedUpdatedAt = nonEmptyString(request.body?.expectedCampaignUpdatedAt);
    if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) return dependencies.badRequest(reply, "expectedCampaignUpdatedAt must be a valid campaign date-time");
    if (expectedUpdatedAt !== campaign.updatedAt) return dependencies.staleWriteConflict(reply, { resourceType: "campaign", resourceId: campaign.id, expectedUpdatedAt, currentUpdatedAt: campaign.updatedAt, current: { id: campaign.id, updatedAt: campaign.updatedAt } });
    const resolved = resolveDndMonsterVariantInputs(store, request.params.campaignId, request.body, dependencies);
    if (!resolved.ok) return resolutionError(reply, resolved, dependencies);
    const result = buildDndMonsterVariant({ id: createId("custom"), draft: request.body, base: resolved.base, template: resolved.template });
    if (!result.ok) return reply.code(422).send({ error: "monster_variant_invalid", issues: result.errors, warnings: result.warnings });
    const changedAt = dependencies.nextRevisionTimestamp(campaign.updatedAt);
    const item = createTimestamped("itm", { campaignId: campaign.id, systemId: DND_5E_SRD_SYSTEM_ID, type: "monster", name: result.entry.name, data: { ...clone(result.entry.data), compendiumProvenance: clone(result.entry.provenance) } }) satisfies Item;
    item.updatedAt = changedAt;
    campaign.updatedAt = changedAt;
    store.state.items.push(item);
    dependencies.appendAudit(userId, { campaignId: campaign.id, action: "dnd.monsterVariant.create", targetType: "item", targetId: item.id, after: { name: item.name, base: result.metadata.base, template: result.metadata.template, overrides: result.metadata.overrides, diff: result.diff } });
    store.save();
    dependencies.broadcast(createEvent({ campaignId: campaign.id, type: "item.created", actorUserId: userId, targetId: item.id, payload: item }));
    return reply.code(201).send({ ...dependencies.customContentPayload(item), variant: result.metadata, diff: result.diff, warnings: result.warnings, campaignUpdatedAt: campaign.updatedAt });
  });
}

export function isDndMonsterTemplateItem(item: Item, campaignId: string): boolean {
  return item.campaignId === campaignId && item.systemId === DND_5E_SRD_SYSTEM_ID && item.actorId === undefined && item.type === DND_MONSTER_TEMPLATE_ITEM_TYPE && item.data.dndMonsterTemplate === true && item.data.schemaVersion === "1.0.0" && isRecord(item.data.overrides);
}

function templateData(template: DndMonsterTemplateDraft): Record<string, unknown> {
  return { dndMonsterTemplate: true, schemaVersion: "1.0.0", description: template.description, overrides: clone(template.overrides) };
}

function dndMonsterTemplatePayload(item: Item) {
  return { item: { ...item, data: clone(item.data) }, template: { id: item.id, version: item.updatedAt, name: item.name, description: nonEmptyString(item.data.description) ?? "Campaign monster override template.", overrides: clone(item.data.overrides) as DndMonsterTemplateRecord["overrides"] } satisfies DndMonsterTemplateRecord };
}

function dndMonsterTemplateAuditSummary(item: Item): Record<string, unknown> {
  return { name: item.name, updatedAt: item.updatedAt, description: nonEmptyString(item.data.description), overrideFields: Object.keys(isRecord(item.data.overrides) ? item.data.overrides : {}).sort() };
}

function validateDndMonsterTemplateDraft(value: unknown) {
  const input = isRecord(value) ? value : {};
  const errors: Array<{ path: string; code: string; message: string }> = [];
  const name = nonEmptyString(input.name);
  const description = nonEmptyString(input.description);
  if (!name) errors.push({ path: "name", code: "required", message: "Template name is required." });
  else if (name.length > 120) errors.push({ path: "name", code: "too_long", message: "Template name must be 120 characters or fewer." });
  if (!description) errors.push({ path: "description", code: "required", message: "Template description is required." });
  else if (description.length > 600) errors.push({ path: "description", code: "too_long", message: "Template description must be 600 characters or fewer." });
  const overrideResult = validateDndMonsterTemplateOverrides(input.overrides);
  if (!overrideResult.ok) errors.push(...overrideResult.errors);
  if (errors.length > 0 || !name || !description || !overrideResult.ok) return { ok: false as const, errors, warnings: overrideResult.warnings };
  return { ok: true as const, template: { name, description, overrides: overrideResult.overrides } satisfies DndMonsterTemplateDraft, warnings: overrideResult.warnings };
}

function dndMonsterVariantBases(store: StateStore, campaignId: string, dependencies: MonsterVariantRouteDependencies): DndMonsterBase[] {
  const provenance = dnd5eSrdCompendium()[0]?.provenance;
  if (!provenance) return [];
  const bundled = dnd5eSrdEncounterThreats().flatMap((threat): DndMonsterBase[] => {
    const actorData = dnd5eSrdMonsterActorData(threat.id);
    const statBlock = actorData && isRecord(actorData.monster) && isRecord(actorData.monster.statBlock) ? actorData.monster.statBlock : undefined;
    return statBlock ? [{ kind: "bundled", id: threat.id, version: provenance.contentVersion, name: threat.name, provenance: clone(provenance), data: dnd5eMonsterContentDataFromStatBlock(statBlock) }] : [];
  });
  const campaign = store.state.items.flatMap((item): DndMonsterBase[] => {
    if (!dependencies.isCustomContentItem(item, campaignId) || item.type !== "monster") return [];
    const entry = dependencies.customContentPayload(item).entry;
    return [{ kind: "campaign", id: item.id, version: item.updatedAt, name: item.name, provenance: clone(entry.provenance), data: clone(entry.data) }];
  });
  return [...bundled, ...campaign].sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

type Resolution = { ok: true; base: DndMonsterBase; template?: DndMonsterTemplateRecord } | { ok: false; status: 404; resource: "base" | "template"; id: string } | { ok: false; status: 409; resource: "base" | "template"; id: string; expectedVersion: string; currentVersion: string };

function resolveDndMonsterVariantInputs(store: StateStore, campaignId: string, draft: DndMonsterVariantDraft, dependencies: MonsterVariantRouteDependencies): Resolution {
  const baseInput = isRecord(draft?.base) ? draft.base as unknown as Record<string, unknown> : {};
  const id = nonEmptyString(baseInput.id) ?? "";
  const version = nonEmptyString(baseInput.version) ?? "";
  const kind = baseInput.kind === "bundled" || baseInput.kind === "campaign" ? baseInput.kind : undefined;
  const base = dndMonsterVariantBases(store, campaignId, dependencies).find((candidate) => candidate.id === id && candidate.kind === kind);
  if (!base) return { ok: false, status: 404, resource: "base", id };
  if (base.version !== version) return { ok: false, status: 409, resource: "base", id, expectedVersion: version, currentVersion: base.version };
  const templateInput = isRecord(draft?.template) ? draft.template as unknown as Record<string, unknown> : undefined;
  if (!templateInput) return { ok: true, base };
  const templateId = nonEmptyString(templateInput.id) ?? "";
  const templateVersion = nonEmptyString(templateInput.version) ?? "";
  const templateItem = store.state.items.find((item) => item.id === templateId && isDndMonsterTemplateItem(item, campaignId));
  if (!templateItem) return { ok: false, status: 404, resource: "template", id: templateId };
  const template = dndMonsterTemplatePayload(templateItem).template;
  return template.version === templateVersion ? { ok: true, base, template } : { ok: false, status: 409, resource: "template", id: template.id, expectedVersion: templateVersion, currentVersion: template.version };
}

function resolutionError(reply: FastifyReply, result: Exclude<Resolution, { ok: true }>, dependencies: MonsterVariantRouteDependencies): FastifyReply {
  if (result.status === 404) return dependencies.notFound(reply, `Monster variant ${result.resource} not found`);
  return reply.code(409).send({ error: "conflict", code: `stale_${result.resource}`, message: `The monster variant ${result.resource} changed after review. Refresh and preview again.`, resourceType: result.resource === "base" ? "monster_base" : "monster_template", resourceId: result.id, expectedVersion: result.expectedVersion, currentVersion: result.currentVersion });
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
