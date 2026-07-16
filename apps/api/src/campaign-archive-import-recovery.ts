import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  createId,
  nowIso,
  type AuditLog,
  type CampaignArchive,
  type CampaignArchiveImportAssetInverseStep,
  type CampaignArchiveImportOperation,
  type CampaignArchiveImportRecordInverseStep,
  type CampaignArchiveImportRollbackConflict,
  type EngineState,
  type MapAsset,
} from "@open-tabletop/core";
import type { ArchiveAssetRestoreTransaction } from "./archive-asset-restore.js";
import type { AssetStorage } from "./asset-storage.js";
import type { StateStore } from "./store.js";

export interface CampaignArchiveImportOperationSummary {
  id: string;
  campaignIds: string[];
  status: CampaignArchiveImportOperation["status"];
  mode: CampaignArchiveImportOperation["mode"];
  scope: CampaignArchiveImportOperation["scope"];
  collections: string[];
  createdAt: string;
  updatedAt: string;
  recordCount: number;
  assetFileCount: number;
  remainingRecordCount: number;
  remainingAssetFileCount: number;
  lastRollbackAt?: string;
  lastRollbackConflicts: CampaignArchiveImportRollbackConflict[];
}

export interface CampaignArchiveImportRollbackPreview extends CampaignArchiveImportOperationSummary {
  impact: {
    restoreRecords: number;
    deleteRecords: number;
    restoreAssetFiles: number;
    deleteAssetFiles: number;
  };
  conflicts: CampaignArchiveImportRollbackConflict[];
}

export interface CampaignArchiveImportRollbackResult {
  operation: CampaignArchiveImportOperationSummary;
  rolledBackRecords: number;
  rolledBackAssetFiles: number;
  conflicts: CampaignArchiveImportRollbackConflict[];
  campaignUpdatedAt?: string;
}

type RecordDecision = {
  step: CampaignArchiveImportRecordInverseStep;
  outcome: "apply" | "satisfied" | "conflict";
  reason?: CampaignArchiveImportRollbackConflict["reason"];
};

type AssetDecision = {
  step: CampaignArchiveImportAssetInverseStep;
  outcome: "apply" | "satisfied" | "conflict";
  reason?: CampaignArchiveImportRollbackConflict["reason"];
  currentBody?: Buffer;
  inverseBody?: Buffer;
};

type RollbackPlan = {
  records: RecordDecision[];
  assets: AssetDecision[];
  conflicts: CampaignArchiveImportRollbackConflict[];
};

const operationalReferenceCollections = new Set<keyof EngineState>([
  "auditLogs",
  "campaignArchiveImportOperations",
  "campaignWebhookDeliveries",
  "idempotencyRecords",
  "jobs",
]);

export async function prepareCampaignArchiveImportAssetSteps(
  assetStorage: AssetStorage,
  stateBefore: EngineState,
  archive: CampaignArchive,
  operationId: string,
): Promise<CampaignArchiveImportAssetInverseStep[]> {
  const filesByAssetId = new Map((archive.files ?? []).map((file) => [file.assetId, file]));
  const steps: CampaignArchiveImportAssetInverseStep[] = [];
  try {
    for (const incoming of archive.data.assets) {
      const file = filesByAssetId.get(incoming.id);
      if (!file) continue;
      const targetAsset: MapAsset = { ...incoming, url: `/api/v1/assets/${incoming.id}/blob`, storage: undefined };
      const previousBody = await assetStorage.read(targetAsset);
      if (previousBody && checksum(previousBody) === file.checksum) continue;
      let inverseAsset: MapAsset | undefined;
      if (previousBody) {
        const at = nowIso();
        inverseAsset = {
          id: createId("arcinv"),
          campaignId: "__archive_import_recovery",
          name: `${operationId}-${incoming.id}`,
          url: "",
          mimeType: incoming.mimeType,
          sizeBytes: previousBody.length,
          checksum: checksum(previousBody),
          createdAt: at,
          updatedAt: at,
        };
        inverseAsset.storage = await assetStorage.put(inverseAsset, previousBody, { operationId });
      }
      steps.push({
        assetId: incoming.id,
        action: previousBody ? "restore" : "delete",
        targetAsset,
        expectedChecksum: file.checksum,
        ...(inverseAsset ? { inverseAsset } : {}),
      });
    }
    return steps;
  } catch (error) {
    await deleteCampaignArchiveImportInverseObjects(assetStorage, steps);
    throw error;
  }
}

export function withCampaignArchiveImportRecoveryCleanup(
  transaction: ArchiveAssetRestoreTransaction,
  assetStorage: AssetStorage,
  steps: CampaignArchiveImportAssetInverseStep[],
): ArchiveAssetRestoreTransaction {
  return {
    get restoredFiles() {
      return transaction.restoredFiles;
    },
    commit: () => transaction.commit(),
    async rollback() {
      try {
        await transaction.rollback();
      } finally {
        await deleteCampaignArchiveImportInverseObjects(assetStorage, steps);
      }
    },
  };
}

export async function deleteCampaignArchiveImportInverseObjects(
  assetStorage: AssetStorage,
  steps: CampaignArchiveImportAssetInverseStep[],
): Promise<void> {
  await Promise.allSettled(steps.map((step) => step.inverseAsset ? assetStorage.delete(step.inverseAsset) : Promise.resolve(false)));
}

export function createCampaignArchiveImportOperation(input: {
  id: string;
  stateBefore: EngineState;
  stateAfter: EngineState;
  archive: CampaignArchive;
  campaignIds: string[];
  createdByUserId: string;
  mode: CampaignArchiveImportOperation["mode"];
  scope: CampaignArchiveImportOperation["scope"];
  collections: string[];
  assetSteps: CampaignArchiveImportAssetInverseStep[];
}): CampaignArchiveImportOperation {
  const at = nowIso();
  const recordSteps: CampaignArchiveImportRecordInverseStep[] = [];
  for (const collection of Object.keys(input.archive.data) as Array<keyof EngineState>) {
    if (collection === "campaignArchiveImportOperations") continue;
    const incoming = input.archive.data[collection] as Array<{ id: string }>;
    if (incoming.length === 0) continue;
    const before = input.stateBefore[collection] as Array<{ id: string }>;
    const after = input.stateAfter[collection] as Array<{ id: string }>;
    for (const record of incoming) {
      const previous = before.find((candidate) => candidate.id === record.id);
      const current = after.find((candidate) => candidate.id === record.id);
      if (!current || sameRecord(collection, previous, current)) continue;
      recordSteps.push({
        collection: collection as CampaignArchiveImportRecordInverseStep["collection"],
        id: record.id,
        action: previous ? "restore" : "delete",
        ...(previous ? { before: structuredClone(previous) } : {}),
        after: structuredClone(current),
      });
    }
  }
  const campaignIds = [...new Set(input.campaignIds)];
  const finalizedAssetSteps = input.assetSteps.map((step) => ({
    ...step,
    targetAsset: structuredClone(input.stateAfter.assets.find((asset) => asset.id === step.assetId) ?? step.targetAsset),
  }));
  return {
    id: input.id,
    campaignIds,
    createdByUserId: input.createdByUserId,
    status: "applied",
    mode: input.mode,
    scope: input.scope,
    collections: [...input.collections],
    campaignRevisions: Object.fromEntries(campaignIds.flatMap((campaignId) => {
      const campaign = input.stateAfter.campaigns.find((candidate) => candidate.id === campaignId);
      return campaign ? [[campaignId, campaign.updatedAt]] : [];
    })),
    recordSteps,
    assetSteps: finalizedAssetSteps,
    createdAt: at,
    updatedAt: at,
  };
}

export function publicCampaignArchiveImportOperation(operation: CampaignArchiveImportOperation): CampaignArchiveImportOperationSummary {
  return {
    id: operation.id,
    campaignIds: [...operation.campaignIds],
    status: operation.status,
    mode: operation.mode,
    scope: operation.scope,
    collections: [...operation.collections],
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    recordCount: operation.recordSteps.length,
    assetFileCount: operation.assetSteps.length,
    remainingRecordCount: operation.recordSteps.filter((step) => !step.rolledBackAt).length,
    remainingAssetFileCount: operation.assetSteps.filter((step) => !step.rolledBackAt).length,
    lastRollbackAt: operation.lastRollbackAt,
    lastRollbackConflicts: [...(operation.lastRollbackConflicts ?? [])],
  };
}

export async function previewCampaignArchiveImportRollback(
  state: EngineState,
  assetStorage: AssetStorage,
  operation: CampaignArchiveImportOperation,
): Promise<CampaignArchiveImportRollbackPreview> {
  const plan = await campaignArchiveImportRollbackPlan(state, assetStorage, operation);
  return {
    ...publicCampaignArchiveImportOperation(operation),
    impact: {
      restoreRecords: plan.records.filter((item) => item.outcome !== "conflict" && item.step.action === "restore").length,
      deleteRecords: plan.records.filter((item) => item.outcome !== "conflict" && item.step.action === "delete").length,
      restoreAssetFiles: plan.assets.filter((item) => item.outcome !== "conflict" && item.step.action === "restore").length,
      deleteAssetFiles: plan.assets.filter((item) => item.outcome !== "conflict" && item.step.action === "delete").length,
    },
    conflicts: plan.conflicts,
  };
}

export async function rollbackCampaignArchiveImportOperation(input: {
  store: StateStore;
  assetStorage: AssetStorage;
  operationId: string;
  campaignId: string;
  userId: string;
}): Promise<CampaignArchiveImportRollbackResult> {
  const stateBeforeRollback = input.store.state;
  const operation = stateBeforeRollback.campaignArchiveImportOperations.find((candidate) => candidate.id === input.operationId && candidate.campaignIds.includes(input.campaignId));
  if (!operation) throw new CampaignArchiveImportRecoveryError("archive_import_operation_not_found", 404);
  const plan = await campaignArchiveImportRollbackPlan(stateBeforeRollback, input.assetStorage, operation);
  const appliedAt = nowIso();
  const nextState = stateForCampaignArchiveImportRollback(stateBeforeRollback, operation, plan, appliedAt, input.userId);
  const assetWrites = plan.assets.filter((decision) => decision.outcome === "apply");
  const appliedAssetWrites: AssetDecision[] = [];
  try {
    for (const decision of assetWrites) {
      if (decision.step.action === "restore") {
        if (!decision.inverseBody) throw new Error(`Archive import inverse bytes are missing for ${decision.step.assetId}`);
        await input.assetStorage.put(decision.step.targetAsset, decision.inverseBody, { operationId: operation.id });
      } else {
        await input.assetStorage.delete(decision.step.targetAsset);
      }
      appliedAssetWrites.push(decision);
    }
    input.store.replace(nextState);
    input.store.flush?.();
  } catch (error) {
    const failures: Error[] = [];
    try {
      if (input.store.restoreDurableState) input.store.restoreDurableState();
      else {
        input.store.replace(stateBeforeRollback);
        input.store.flush?.();
      }
    } catch (rollbackError) {
      input.store.state = stateBeforeRollback;
      failures.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
    }
    for (const decision of [...appliedAssetWrites].reverse()) {
      try {
        if (decision.currentBody) await input.assetStorage.put(decision.step.targetAsset, decision.currentBody, { operationId: operation.id });
        else await input.assetStorage.delete(decision.step.targetAsset);
      } catch (rollbackError) {
        failures.push(rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)));
      }
    }
    if (failures.length > 0) throw new Error(`Campaign archive rollback failed and compensation was incomplete: ${failures.map((failure) => failure.message).join("; ")}`, { cause: error });
    throw error;
  }

  const nextOperation = nextState.campaignArchiveImportOperations.find((candidate) => candidate.id === operation.id)!;
  await deleteCampaignArchiveImportInverseObjects(input.assetStorage, nextOperation.assetSteps.filter((step) => Boolean(step.rolledBackAt)));
  return {
    operation: publicCampaignArchiveImportOperation(nextOperation),
    rolledBackRecords: plan.records.filter((item) => item.outcome !== "conflict").length,
    rolledBackAssetFiles: plan.assets.filter((item) => item.outcome !== "conflict").length,
    conflicts: plan.conflicts,
    campaignUpdatedAt: nextState.campaigns.find((campaign) => campaign.id === input.campaignId)?.updatedAt,
  };
}

export class CampaignArchiveImportRecoveryError extends Error {
  constructor(readonly code: string, readonly statusCode: 400 | 404 | 409) {
    super(code);
  }
}

async function campaignArchiveImportRollbackPlan(
  state: EngineState,
  assetStorage: AssetStorage,
  operation: CampaignArchiveImportOperation,
): Promise<RollbackPlan> {
  const records: RecordDecision[] = operation.recordSteps.filter((step) => !step.rolledBackAt).map((step) => {
    const current = recordById(state, step.collection, step.id);
    if (step.action === "delete" && current === undefined) return { step, outcome: "satisfied" };
    if (step.action === "restore" && sameRecord(step.collection, current, step.before)) return { step, outcome: "satisfied" };
    if (sameRecord(step.collection, current, step.after)) return { step, outcome: "apply" };
    return { step, outcome: "conflict", reason: "record_changed" };
  });

  const assets: AssetDecision[] = [];
  for (const step of operation.assetSteps.filter((candidate) => !candidate.rolledBackAt)) {
    const recordDecision = records.find((decision) => decision.step.collection === "assets" && decision.step.id === step.assetId);
    const currentBody = await assetStorage.read(step.targetAsset);
    const currentChecksum = currentBody ? checksum(currentBody) : undefined;
    const inverseBody = step.inverseAsset ? await assetStorage.read(step.inverseAsset) : undefined;
    let outcome: AssetDecision["outcome"];
    let reason: AssetDecision["reason"];
    if (recordDecision?.outcome === "conflict") {
      outcome = "conflict";
      reason = "record_changed";
    } else if (step.action === "delete" && currentBody === undefined) {
      outcome = "satisfied";
    } else if (step.action === "restore" && inverseBody && currentChecksum === checksum(inverseBody)) {
      outcome = "satisfied";
    } else if (currentChecksum === step.expectedChecksum) {
      outcome = "apply";
    } else {
      outcome = "conflict";
      reason = "asset_bytes_changed";
      if (recordDecision) {
        recordDecision.outcome = "conflict";
        recordDecision.reason = reason;
      }
    }
    assets.push({ step, outcome, reason, currentBody, inverseBody });
  }

  addReferenceConflicts(state, records);
  for (const decision of assets) {
    const recordDecision = records.find((candidate) => candidate.step.collection === "assets" && candidate.step.id === decision.step.assetId);
    if (recordDecision?.outcome === "conflict" && decision.outcome !== "conflict") {
      decision.outcome = "conflict";
      decision.reason = recordDecision.reason ?? "record_changed";
    }
  }
  const conflicts = uniqueConflicts([
    ...records.filter((item) => item.outcome === "conflict").map((item) => ({ collection: String(item.step.collection), id: item.step.id, reason: item.reason ?? "record_changed" })),
    ...assets.filter((item) => item.outcome === "conflict").map((item) => ({ collection: "assetFiles", id: item.step.assetId, reason: item.reason ?? "asset_bytes_changed" })),
  ]);
  return { records, assets, conflicts };
}

function stateForCampaignArchiveImportRollback(
  state: EngineState,
  operation: CampaignArchiveImportOperation,
  plan: RollbackPlan,
  appliedAt: string,
  userId: string,
): EngineState {
  const next = { ...state } as EngineState;
  const touched = new Set<keyof EngineState>(["campaignArchiveImportOperations", "auditLogs", "campaigns"]);
  for (const decision of plan.records) if (decision.outcome === "apply") touched.add(decision.step.collection);
  for (const collection of touched) {
    // Campaign revisions are bumped below. Clone those records as well as the
    // array so a failed persistence attempt cannot mutate the live snapshot.
    Reflect.set(next, collection, collection === "campaigns" ? structuredClone(state.campaigns) : [...(state[collection] as unknown[])]);
  }

  for (const decision of plan.records) {
    if (decision.outcome !== "apply") continue;
    const collection = next[decision.step.collection] as Array<{ id: string }>;
    const index = collection.findIndex((record) => record.id === decision.step.id);
    if (decision.step.action === "delete") {
      if (index >= 0) collection.splice(index, 1);
    } else if (decision.step.before !== undefined) {
      const restored = structuredClone(decision.step.before) as { id: string };
      if (index >= 0) collection[index] = restored;
      else collection.push(restored);
    }
  }

  const operationIndex = next.campaignArchiveImportOperations.findIndex((candidate) => candidate.id === operation.id);
  const nextOperation = structuredClone(operation);
  const successfulRecordKeys = new Set(plan.records.filter((item) => item.outcome !== "conflict").map((item) => `${String(item.step.collection)}:${item.step.id}`));
  const successfulAssetIds = new Set(plan.assets.filter((item) => item.outcome !== "conflict").map((item) => item.step.assetId));
  nextOperation.recordSteps = nextOperation.recordSteps.map((step) => successfulRecordKeys.has(`${String(step.collection)}:${step.id}`) ? { ...step, rolledBackAt: appliedAt } : step);
  nextOperation.assetSteps = nextOperation.assetSteps.map((step) => successfulAssetIds.has(step.assetId) ? { ...step, rolledBackAt: appliedAt } : step);
  const remaining = nextOperation.recordSteps.some((step) => !step.rolledBackAt) || nextOperation.assetSteps.some((step) => !step.rolledBackAt);
  nextOperation.status = remaining ? "partially_rolled_back" : "rolled_back";
  nextOperation.lastRollbackAt = appliedAt;
  nextOperation.lastRollbackByUserId = userId;
  nextOperation.lastRollbackConflicts = plan.conflicts;
  nextOperation.rolledBackAt = remaining ? undefined : appliedAt;
  nextOperation.updatedAt = appliedAt;
  next.campaignArchiveImportOperations[operationIndex] = nextOperation;

  for (const campaignId of operation.campaignIds) {
    const campaign = next.campaigns.find((candidate) => candidate.id === campaignId);
    if (campaign) campaign.updatedAt = nextRevisionTimestamp(campaign.updatedAt);
  }
  const auditCampaignIds = operation.campaignIds.length > 0 ? operation.campaignIds : [undefined];
  for (const campaignId of auditCampaignIds) {
    next.auditLogs.push({
      id: createId("audit"),
      campaignId,
      actorUserId: userId,
      actorType: "user",
      action: "campaign.archive_import.rollback",
      targetType: "campaign_archive_import_operation",
      targetId: operation.id,
      after: {
        status: nextOperation.status,
        restoredRecordCount: plan.records.filter((item) => item.outcome !== "conflict").length,
        restoredAssetFileCount: plan.assets.filter((item) => item.outcome !== "conflict").length,
        conflictCount: plan.conflicts.length,
      },
      createdAt: appliedAt,
      updatedAt: appliedAt,
    } satisfies AuditLog);
  }
  return next;
}

function addReferenceConflicts(state: EngineState, decisions: RecordDecision[]): void {
  const activeDeletes = new Map(
    decisions
      .filter((decision) => decision.outcome === "apply" && decision.step.action === "delete")
      .map((decision) => [`${String(decision.step.collection)}:${decision.step.id}`, decision]),
  );
  let changed = true;
  while (changed) {
    changed = false;
    const candidate = stateWithRecordDecisions(state, decisions, activeDeletes);
    for (const [key, decision] of [...activeDeletes]) {
      if (!stateReferencesId(candidate, decision.step.id)) continue;
      activeDeletes.delete(key);
      decision.outcome = "conflict";
      decision.reason = "reference_conflict";
      changed = true;
    }
  }
}

function stateWithRecordDecisions(state: EngineState, decisions: RecordDecision[], activeDeletes: Map<string, RecordDecision>): EngineState {
  const candidate = { ...state } as EngineState;
  const touched = new Set<keyof EngineState>();
  for (const decision of decisions) if (decision.outcome === "apply") touched.add(decision.step.collection);
  for (const collection of touched) Reflect.set(candidate, collection, [...(state[collection] as unknown[])]);
  for (const decision of decisions) {
    if (decision.outcome !== "apply") continue;
    const collection = candidate[decision.step.collection] as Array<{ id: string }>;
    const index = collection.findIndex((record) => record.id === decision.step.id);
    if (decision.step.action === "delete") {
      if (activeDeletes.has(`${String(decision.step.collection)}:${decision.step.id}`) && index >= 0) collection.splice(index, 1);
    } else if (decision.step.before !== undefined) {
      const restored = structuredClone(decision.step.before) as { id: string };
      if (index >= 0) collection[index] = restored;
      else collection.push(restored);
    }
  }
  return candidate;
}

function stateReferencesId(state: EngineState, id: string): boolean {
  for (const collection of Object.keys(state) as Array<keyof EngineState>) {
    if (operationalReferenceCollections.has(collection)) continue;
    for (const record of state[collection] as unknown[]) {
      if (referencesId(record, id)) return true;
    }
  }
  return false;
}

function referencesId(value: unknown, id: string, key?: string): boolean {
  if (typeof value === "string") return key !== "id" && value === id;
  if (Array.isArray(value)) return value.some((item) => referencesId(item, id));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([childKey, child]) => referencesId(child, id, childKey));
}

function recordById(state: EngineState, collection: CampaignArchiveImportRecordInverseStep["collection"], id: string): unknown {
  return (state[collection] as Array<{ id: string }>).find((record) => record.id === id);
}

function sameRecord(collection: keyof EngineState, left: unknown, right: unknown): boolean {
  if (collection !== "campaigns") return isDeepStrictEqual(jsonComparable(left), jsonComparable(right));
  return isDeepStrictEqual(jsonComparable(withoutCampaignRevision(left)), jsonComparable(withoutCampaignRevision(right)));
}

function withoutCampaignRevision(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { updatedAt: _updatedAt, ...record } = value as Record<string, unknown>;
  return record;
}

function jsonComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonComparable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, jsonComparable(child)]),
  );
}

function uniqueConflicts(conflicts: CampaignArchiveImportRollbackConflict[]): CampaignArchiveImportRollbackConflict[] {
  return [...new Map(conflicts.map((conflict) => [`${conflict.collection}:${conflict.id}`, conflict])).values()];
}

function checksum(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function nextRevisionTimestamp(current: string): string {
  const now = Date.now();
  const previous = Date.parse(current);
  return new Date(Number.isFinite(previous) ? Math.max(now, previous + 1) : now).toISOString();
}
