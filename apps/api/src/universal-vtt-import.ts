import { randomUUID } from "node:crypto";
import { createEvent, createTimestamped, parseUniversalVtt, UniversalVttError, type EngineEvent, type EngineState, type Scene } from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ArchiveAssetRestoreTransaction } from "./archive-asset-restore.js";
import { AssetUploadError, prepareUploadedAsset } from "./asset-upload.js";
import type { AssetStorage } from "./asset-storage.js";
import type { CampaignWebhookTransport } from "./campaign-webhooks.js";
import type { StateStore } from "./store.js";

interface UniversalVttImportDependencies {
  store: StateStore;
  assetStorage: AssetStorage;
  maxAssetBytes: number;
  scannerTransport?: CampaignWebhookTransport;
  requireSceneCreate(reply: FastifyReply, headers: FastifyRequest["headers"], campaignId: string): true | FastifyReply;
  currentUserId(headers: FastifyRequest["headers"]): string;
  requireExpectedRevision(reply: FastifyReply, input: { resourceType: "campaign"; resourceId: string; currentUpdatedAt: string; expectedUpdatedAt: unknown; current: unknown; label: string }): true | FastifyReply;
  nextRevisionTimestamp(current: string): string;
  attachAssetTransaction(request: FastifyRequest, transaction: ArchiveAssetRestoreTransaction, snapshot: EngineState): void;
  broadcast(event: EngineEvent): void;
}

function invalid(reply: FastifyReply, message: string, path?: string) {
  return reply.code(400).send({ error: "invalid_universal_vtt", message, ...(path ? { path } : {}) });
}

export function registerUniversalVttImportRoute(app: FastifyInstance, dependencies: UniversalVttImportDependencies): void {
  const { store, assetStorage } = dependencies;
  app.post<{ Params: { campaignId: string }; Body: unknown }>("/api/v1/campaigns/:campaignId/scenes/import-universal-vtt", { bodyLimit: 16 * 1024 * 1024 + 65536 }, async (request, reply) => {
    const allowed = dependencies.requireSceneCreate(reply, request.headers, request.params.campaignId);
    if (allowed !== true) return allowed;
    if (typeof request.headers["idempotency-key"] !== "string" || !request.headers["idempotency-key"].trim()) return invalid(reply, "Universal VTT import requires an Idempotency-Key header.");
    const campaign = store.state.campaigns.find((candidate) => candidate.id === request.params.campaignId);
    if (!campaign) return reply.code(404).send({ error: "not_found", message: "Campaign not found" });
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return invalid(reply, "Universal VTT import request must be an object.");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["name", "sourceFileName", "document", "expectedCampaignUpdatedAt"].includes(key))) return invalid(reply, "Unexpected Universal VTT import request field.");
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 160) return invalid(reply, "Scene name must be 1-160 characters.", "/name");
    if (typeof input.sourceFileName !== "string" || !input.sourceFileName.trim() || input.sourceFileName.length > 255 || /[\u0000-\u001f\u007f]/.test(input.sourceFileName)) return invalid(reply, "Source filename must be 1-255 printable characters.", "/sourceFileName");
    const revision = dependencies.requireExpectedRevision(reply, { resourceType: "campaign", resourceId: campaign.id, currentUpdatedAt: campaign.updatedAt, expectedUpdatedAt: input.expectedCampaignUpdatedAt, current: campaign, label: "Universal VTT import" });
    if (revision !== true) return revision;
    if (typeof input.document !== "string") return invalid(reply, "Universal VTT document must be a JSON string.", "/document");
    let plan;
    try {
      plan = parseUniversalVtt(input.document);
    } catch (error) {
      if (error instanceof UniversalVttError) return invalid(reply, error.message, error.path);
      throw error;
    }
    const before = store.state;
    const writtenObjects: Array<Parameters<AssetStorage["delete"]>[0]> = [];
    let settled = false;
    const transaction: ArchiveAssetRestoreTransaction = {
      get restoredFiles() { return writtenObjects.length; },
      async commit() { settled = true; writtenObjects.length = 0; },
      async rollback() {
        if (settled) return;
        const failures: unknown[] = [];
        for (const object of [...writtenObjects].reverse()) {
          try { await assetStorage.delete(object); } catch (error) { failures.push(error); }
        }
        if (failures.length) throw new AggregateError(failures, "Universal VTT image cleanup failed; imported scene remains rolled back.");
        settled = true;
        writtenObjects.length = 0;
      },
    };
    dependencies.attachAssetTransaction(request, transaction, before);
    try {
      const prepared = await prepareUploadedAsset({ store, storage: assetStorage, maxAssetBytes: dependencies.maxAssetBytes, scannerTransport: dependencies.scannerTransport, campaignId: campaign.id, name: `${input.name.trim()}.${plan.image.contentType === "image/png" ? "png" : "webp"}`, mimeType: plan.image.contentType, body: Buffer.from(plan.image.dataBase64, "base64"), requiredImageDimensions: { width: plan.image.width, height: plan.image.height }, beforeObjectWrite: (asset) => writtenObjects.push(asset) });
      const userId = dependencies.currentUserId(request.headers);
      const scene: Scene = createTimestamped("scn", {
        id: `scn_${randomUUID()}`, campaignId: campaign.id, name: input.name.trim(), width: plan.width, height: plan.height, gridType: "square" as const, gridSize: plan.gridSize,
        ...(plan.gridOrigin ? { gridOrigin: plan.gridOrigin } : {}), visibilityMode: "dynamic" as const, backgroundAssetId: prepared.asset.id,
        active: false, sortOrder: Math.max(0, ...store.state.scenes.filter((candidate) => candidate.campaignId === campaign.id).map((candidate) => candidate.sortOrder)) + 1,
        fog: [], fogHistory: [], walls: plan.walls.map((wall) => ({ ...wall, id: `wall_${randomUUID()}` })), lights: plan.lights.map((light) => ({ ...light, id: `light_${randomUUID()}` })),
        annotations: [], difficultTerrain: [], coverOverrides: [], metadata: { universalVtt: { format: plan.format, sourceFileName: input.sourceFileName, ...plan.provenance, provenanceSource: "user-provided", importedByUserId: userId } },
      });
      const updatedCampaign = { ...campaign, updatedAt: dependencies.nextRevisionTimestamp(campaign.updatedAt) };
      const warnings = [...plan.warnings, ...prepared.renditionWarnings.map((warning) => warning.message)];
      const next: EngineState = { ...before, campaigns: before.campaigns.map((candidate) => candidate.id === campaign.id ? updatedCampaign : candidate), scenes: [...before.scenes, scene], assets: prepared.deduplicated ? before.assets : [...before.assets, prepared.asset], auditLogs: [...before.auditLogs, createTimestamped("audit", { campaignId: campaign.id, actorUserId: userId, actorType: "user" as const, action: "scene.importUniversalVtt", targetType: "scene", targetId: scene.id, after: { sourceFileName: input.sourceFileName, format: plan.format, assetId: prepared.asset.id, checksum: prepared.asset.checksum, deduplicated: prepared.deduplicated, wallCount: scene.walls.length, lightCount: scene.lights.length, warnings, active: false, provenanceSource: "user-provided" } })] };
      if (request.raw.aborted) throw new Error("Universal VTT import request was aborted before commit.");
      store.replace(next);
        if (!prepared.deduplicated) dependencies.broadcast(createEvent({ campaignId: campaign.id, type: "asset.created", actorUserId: userId, targetId: prepared.asset.id, payload: prepared.asset }));
        dependencies.broadcast(createEvent({ campaignId: campaign.id, type: "scene.created", actorUserId: userId, targetId: scene.id, payload: scene }));
        dependencies.broadcast(createEvent({ campaignId: campaign.id, type: "campaign.updated", actorUserId: userId, targetId: campaign.id, payload: updatedCampaign }));
      return reply.code(201).send({ scene, asset: prepared.asset, campaignUpdatedAt: updatedCampaign.updatedAt, warnings, deduplicated: prepared.deduplicated });
    } catch (error) {
      store.state = before;
      await transaction.rollback();
      if (error instanceof AssetUploadError) return reply.code(error.statusCode).send(error.payload);
      throw error;
    }
  });
}
