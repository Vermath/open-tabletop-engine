import type { User } from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AdminIdentityMutationError,
  adminSessionRiskReport,
  issueAdminPasswordReset,
  normalizeSessionRiskReasons,
  normalizeSessionRiskStaleDays,
  prunePasswordResetTokensForAdmin,
  pruneSessionsForAdmin,
  publicEmailOutboxMessage,
  publicPasswordResetToken,
  publicSession,
  revokeRiskSessions,
  revokeSingleSession,
  revokeUserSessions,
  updateAdminUser,
  userSessionRevocationPlan,
  type AdminPasswordResetIssueInput,
  type AdminPasswordResetPruneBody,
  type AdminSessionPruneBody,
  type AdminSessionRiskRevokeBody,
  type AdminUserPatchBody,
} from "./admin-identity-operations.js";
import {
  EmailOperatorMutationError,
  emailWebhookUrl,
  retryEmailOutboxMessage,
  retryEmailOutboxMessages,
  type AdminEmailOutboxRetryAllBody,
  type EmailDeliveryOptions,
} from "./email-outbox.js";
import type { StateStore } from "./store.js";

export interface AdminIdentityAuditInput {
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}

export interface RegisterAdminIdentityRoutesOptions {
  store: StateStore;
  requireServerAdmin(reply: FastifyReply, headers: Record<string, string | string[] | undefined>): string | FastifyReply;
  adminUserInfo(user: User): unknown;
  publicUser(user: User): unknown;
  appendAudit(actorUserId: string, input: AdminIdentityAuditInput): void;
  appendReadAudit(actorUserId: string, input: AdminIdentityAuditInput): void;
  emailDeliveryOptions?: EmailDeliveryOptions;
}

export function registerAdminIdentityRoutes(app: FastifyInstance, options: RegisterAdminIdentityRoutesOptions): void {
  const { store } = options;
  const admin = (reply: FastifyReply, headers: Record<string, string | string[] | undefined>) => options.requireServerAdmin(reply, headers);

  app.get("/api/v1/admin/users", async (request, reply) => {
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const users = store.state.users.map(options.adminUserInfo);
    options.appendReadAudit(adminUserId, { action: "admin.users.list", targetType: "user", after: { count: users.length } });
    return users;
  });

  app.patch<{ Params: { userId: string }; Body: AdminUserPatchBody }>("/api/v1/admin/users/:userId", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const user = store.state.users.find((candidate) => candidate.id === request.params.userId);
    if (!user) return reply.code(404).send({ error: "not_found", message: "User not found" });
    const before = options.adminUserInfo(user);
    try {
      updateAdminUser(store, user, adminUserId, request.body ?? {});
    } catch (error) {
      return sendOperatorError(reply, error);
    }
    const after = options.adminUserInfo(user);
    options.appendAudit(adminUserId, { action: "admin.user.update", targetType: "user", targetId: user.id, before, after });
    store.save();
    return after;
  });

  app.post<{ Params: { userId: string }; Body: AdminPasswordResetIssueInput }>("/api/v1/admin/users/:userId/password-reset", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const user = store.state.users.find((candidate) => candidate.id === request.params.userId);
    if (!user) return reply.code(404).send({ error: "not_found", message: "User not found" });
    try {
      const issued = await issueAdminPasswordReset(store, user, request.body ?? {}, { actorUserId: adminUserId, idempotencyKey: key }, options.emailDeliveryOptions);
      options.appendAudit(adminUserId, {
        action: "admin.user.passwordReset",
        targetType: "user",
        targetId: user.id,
        after: {
          resetId: issued.reset.id,
          emailId: issued.email.id,
          deliveryId: issued.email.deliveryId,
          emailStatus: issued.email.status,
          deduplicated: issued.deduplicated,
        },
      });
      store.save();
      if (issued.deduplicated) reply.header("X-Open-Tabletop-Operation-Deduplicated", "true");
      return { reset: publicPasswordResetToken(issued.reset), email: publicEmailOutboxMessage(issued.email) };
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });

  app.post<{ Body: AdminPasswordResetPruneBody }>("/api/v1/admin/password-resets/prune", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    try {
      const result = prunePasswordResetTokensForAdmin(store, request.body ?? {});
      options.appendAudit(adminUserId, { action: "admin.passwordResets.prune", targetType: "password_reset", after: result });
      store.save();
      return result;
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });

  app.get<{ Params: { userId: string } }>("/api/v1/admin/users/:userId/sessions/revocation-plan", async (request, reply) => {
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    if (!store.state.users.some((user) => user.id === request.params.userId)) return reply.code(404).send({ error: "not_found", message: "User not found" });
    const plan = userSessionRevocationPlan(store, request.params.userId);
    options.appendReadAudit(adminUserId, {
      action: "admin.user.sessionsRevokePlan",
      targetType: "user",
      targetId: request.params.userId,
      after: { matched: plan.matched, targetSetHash: plan.targetSetHash },
    });
    return plan;
  });

  app.delete<{ Params: { userId: string }; Body: { targetSetHash?: string }; Querystring: { targetSetHash?: string } }>("/api/v1/admin/users/:userId/sessions", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    if (!store.state.users.some((user) => user.id === request.params.userId)) return reply.code(404).send({ error: "not_found", message: "User not found" });
    try {
      const result = revokeUserSessions(store, request.params.userId, request.body?.targetSetHash ?? request.query.targetSetHash);
      options.appendAudit(adminUserId, {
        action: "admin.user.sessionsRevoke",
        targetType: "user",
        targetId: request.params.userId,
        after: { revoked: result.revoked, targetSetHash: result.targetSetHash },
      });
      store.save();
      return result;
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });

  app.get("/api/v1/admin/sessions", async (request, reply) => {
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const now = Date.now();
    const sessions = store.state.sessions.filter((session) => Date.parse(session.expiresAt) > now).map((session) => {
      const user = store.state.users.find((candidate) => candidate.id === session.userId);
      return { ...publicSession(session), user: user ? options.publicUser(user) : { id: session.userId, displayName: "Unknown user" } };
    });
    options.appendReadAudit(adminUserId, { action: "admin.sessions.list", targetType: "session", after: { count: sessions.length } });
    return sessions;
  });

  app.get<{ Querystring: { staleDays?: string | number } }>("/api/v1/admin/sessions/risk", async (request, reply) => {
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const staleDays = normalizeSessionRiskStaleDays(request.query.staleDays);
    if (!staleDays) return reply.code(400).send({ error: "bad_request", message: "staleDays must be an integer from 1 to 365" });
    const report = adminSessionRiskReport(store, staleDays);
    options.appendReadAudit(adminUserId, { action: "admin.sessions.riskInspect", targetType: "session", after: { staleDays, ...report.totals } });
    return report;
  });

  app.post<{ Body: AdminSessionRiskRevokeBody }>("/api/v1/admin/sessions/risk/revoke", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const staleDays = normalizeSessionRiskStaleDays(request.body?.staleDays);
    if (!staleDays) return reply.code(400).send({ error: "bad_request", message: "staleDays must be an integer from 1 to 365" });
    const reasons = normalizeSessionRiskReasons(request.body?.reasons);
    if (!reasons) return reply.code(400).send({ error: "bad_request", message: "reasons must contain only expired, stale, disabled_user, or unknown_user" });
    try {
      const result = revokeRiskSessions(store, staleDays, reasons, request.body ?? {});
      options.appendAudit(adminUserId, { action: "admin.sessions.riskRevoke", targetType: "session", after: result });
      store.save();
      return result;
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });

  app.post<{ Body: AdminSessionPruneBody }>("/api/v1/admin/sessions/prune", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    try {
      const result = pruneSessionsForAdmin(store, request.body ?? {});
      options.appendAudit(adminUserId, { action: "admin.sessions.prune", targetType: "session", after: result });
      store.save();
      return result;
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });

  app.delete<{ Params: { sessionId: string }; Body: { expectedUpdatedAt?: string }; Querystring: { expectedUpdatedAt?: string } }>("/api/v1/admin/sessions/:sessionId", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const session = store.state.sessions.find((candidate) => candidate.id === request.params.sessionId);
    if (!session) return reply.code(404).send({ error: "not_found", message: "Session not found" });
    const before = publicSession(session);
    try {
      revokeSingleSession(store, session, request.body?.expectedUpdatedAt ?? request.query.expectedUpdatedAt);
    } catch (error) {
      return sendOperatorError(reply, error);
    }
    options.appendAudit(adminUserId, { action: "admin.session.revoke", targetType: "session", targetId: session.id, before, after: { revoked: true, userId: session.userId } });
    store.save();
    return { ok: true };
  });

  app.get("/api/v1/admin/email-outbox", async (request, reply) => {
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const messages = store.state.emailOutbox.slice(-100).map(publicEmailOutboxMessage);
    options.appendReadAudit(adminUserId, { action: "admin.emailOutbox.list", targetType: "email_outbox", after: { count: messages.length } });
    return messages;
  });

  app.post<{ Body: AdminEmailOutboxRetryAllBody }>("/api/v1/admin/email-outbox/retry-all", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    if (request.body?.dryRun !== true && !(options.emailDeliveryOptions?.webhookUrl ?? emailWebhookUrl())) {
      return reply.code(400).send({ error: "bad_request", message: "Email webhook is not configured" });
    }
    try {
      const result = await retryEmailOutboxMessages(store, request.body ?? {}, { actorUserId: adminUserId, idempotencyKey: key }, options.emailDeliveryOptions);
      options.appendAudit(adminUserId, { action: "admin.emailOutbox.retryAll", targetType: "email_outbox", after: result });
      store.save();
      if (result.deduplicated) reply.header("X-Open-Tabletop-Operation-Deduplicated", "true");
      return result;
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });

  app.post<{ Params: { messageId: string }; Body: { expectedUpdatedAt?: string } }>("/api/v1/admin/email-outbox/:messageId/retry", async (request, reply) => {
    const key = requireIdempotencyKey(request.headers, reply);
    if (!key) return reply;
    const adminUserId = admin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const message = store.state.emailOutbox.find((candidate) => candidate.id === request.params.messageId);
    if (!message) return reply.code(404).send({ error: "not_found", message: "Email message not found" });
    if (!(options.emailDeliveryOptions?.webhookUrl ?? emailWebhookUrl())) return reply.code(400).send({ error: "bad_request", message: "Email webhook is not configured" });
    const before = publicEmailOutboxMessage(message);
    try {
      const result = await retryEmailOutboxMessage(store, message, {
        actorUserId: adminUserId,
        idempotencyKey: key,
        expectedUpdatedAt: request.body?.expectedUpdatedAt,
      }, options.emailDeliveryOptions);
      options.appendAudit(adminUserId, {
        action: "admin.emailOutbox.retry",
        targetType: "email_outbox",
        targetId: message.id,
        before,
        after: { ...publicEmailOutboxMessage(message), deduplicated: result.deduplicated },
      });
      store.save();
      if (result.deduplicated) reply.header("X-Open-Tabletop-Operation-Deduplicated", "true");
      return publicEmailOutboxMessage(message);
    } catch (error) {
      return sendOperatorError(reply, error);
    }
  });
}

function requireIdempotencyKey(headers: Record<string, string | string[] | undefined>, reply: FastifyReply): string | undefined {
  const raw = headers["idempotency-key"];
  const key = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!key) {
    reply.code(400).send({ error: "bad_request", code: "idempotency_key_required", message: "Operator mutations require an Idempotency-Key header" });
    return undefined;
  }
  if (key.length > 160) {
    reply.code(400).send({ error: "bad_request", code: "invalid_idempotency_key", message: "Idempotency-Key must be 160 characters or fewer" });
    return undefined;
  }
  return key;
}

function sendOperatorError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AdminIdentityMutationError || error instanceof EmailOperatorMutationError) {
    return reply.code(error.statusCode).send(error.response());
  }
  throw error;
}
