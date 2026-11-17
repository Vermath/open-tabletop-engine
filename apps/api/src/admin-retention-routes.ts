import type { FastifyInstance, FastifyReply } from "fastify";
import { OperationalRetentionError, applyOperationalRetention, operationalRetentionDiagnostics, planOperationalRetention, type OperationalRetentionRequest } from "./admin-retention-operations.js";
import type { StateStore } from "./store.js";

interface RetentionAuditInput {
  action: string;
  targetType: string;
  after: unknown;
}

export interface RegisterAdminRetentionRoutesOptions {
  store: StateStore;
  requireServerAdmin(reply: FastifyReply, headers: Record<string, string | string[] | undefined>): string | FastifyReply;
  appendAudit(actorUserId: string, input: RetentionAuditInput): void;
  appendReadAudit(actorUserId: string, input: RetentionAuditInput): void;
}

export function registerAdminRetentionRoutes(app: FastifyInstance, options: RegisterAdminRetentionRoutesOptions): void {
  const admin = (reply: FastifyReply, headers: Record<string, string | string[] | undefined>) => options.requireServerAdmin(reply, headers);

  app.get("/api/v1/admin/retention/operations", async (request, reply) => {
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const diagnostics = operationalRetentionDiagnostics(options.store.state);
    options.appendReadAudit(adminUserId, { action: "admin.retention.inspect", targetType: "operational_retention", after: { counts: diagnostics.counts, preservationDefault: true } });
    return diagnostics;
  });

  app.post<{ Body: OperationalRetentionRequest }>("/api/v1/admin/retention/prune", async (request, reply) => {
    if (!idempotencyKey(request.headers["idempotency-key"])) return reply.code(400).send({ error: "bad_request", message: "Operational retention preview and execution require an Idempotency-Key header" });
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    try {
      if (request.body?.dryRun !== false) {
        const plan = planOperationalRetention(options.store.state, { ...request.body, dryRun: true });
        options.appendReadAudit(adminUserId, { action: "admin.retention.preview", targetType: "operational_retention", after: auditSummary(plan) });
        return plan;
      }
      const result = applyOperationalRetention(options.store.state, request.body);
      options.appendAudit(adminUserId, { action: "admin.retention.prune", targetType: "operational_retention", after: auditSummary(result) });
      options.store.save();
      return result;
    } catch (error) {
      if (error instanceof OperationalRetentionError) {
        return reply.code(error.code === "target_set_changed" ? 409 : 400).send({ error: error.code, message: error.message });
      }
      throw error;
    }
  });
}

function idempotencyKey(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value.length === 1 ? value[0] : undefined : value;
  return candidate?.trim() || undefined;
}

function auditSummary(plan: ReturnType<typeof planOperationalRetention> | ReturnType<typeof applyOperationalRetention>) {
  return {
    dryRun: plan.dryRun,
    olderThanDays: plan.olderThanDays,
    recordClasses: plan.recordClasses,
    eligibleCount: plan.eligibleCount,
    selectedCount: plan.selectedCount,
    remainingCount: plan.remainingCount,
    targetSetHash: plan.targetSetHash,
    ...("deletedCount" in plan ? { deletedCount: plan.deletedCount, reason: plan.reason } : {}),
  };
}
