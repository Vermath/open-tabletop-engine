import { emptyState, type EmailOutboxMessage } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import {
  EmailOperatorMutationError,
  deliverEmailMessage,
  publicEmailOutboxMessage,
  retryEmailOutboxMessage,
  retryEmailOutboxMessages,
} from "./email-outbox.js";
import { MemoryStateStore } from "./store.js";

const timestamp = "2026-07-14T12:00:00.000Z";

function message(id: string, status: EmailOutboxMessage["status"] = "failed", updatedAt = timestamp): EmailOutboxMessage {
  return {
    id,
    to: `${id}@example.com`,
    subject: `Message ${id}`,
    text: "A credential-bearing body that must not enter generic replay storage: opr_sensitive",
    status,
    provider: "webhook",
    createdAt: timestamp,
    updatedAt,
    metadata: { kind: "password_reset", resetId: `reset_${id}` },
  };
}

describe("email outbox operator safety", () => {
  it("persists one delivery identity and forwards it through both downstream idempotency headers", async () => {
    const outbound = message("email_headers");
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));

    await deliverEmailMessage(outbound, {
      webhookUrl: "https://mail.example.test/deliver",
      webhookToken: "transport-token",
      fetchImpl,
      preferredDeliveryId: "delivery_reset_123",
      timeoutMs: 500,
    });

    expect(outbound).toMatchObject({
      deliveryId: "delivery_reset_123",
      deliveryAttempts: 1,
      status: "delivered",
    });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Idempotency-Key": "delivery_reset_123",
      "X-Open-Tabletop-Delivery-Id": "delivery_reset_123",
      authorization: "Bearer transport-token",
    });
  });

  it("deduplicates a single retry without storing or exposing the credential-bearing response", async () => {
    const store = new MemoryStateStore(emptyState());
    const outbound = message("email_single");
    store.state.emailOutbox.push(outbound);
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));
    const context = { actorUserId: "usr_admin", idempotencyKey: "retry-single-1", expectedUpdatedAt: timestamp };

    const first = await retryEmailOutboxMessage(store, outbound, context, { webhookUrl: "https://mail.example.test", fetchImpl });
    const replay = await retryEmailOutboxMessage(store, outbound, context, { webhookUrl: "https://mail.example.test", fetchImpl });

    expect(first.deduplicated).toBe(false);
    expect(replay.deduplicated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.state.idempotencyRecords).toEqual([]);
    expect(publicEmailOutboxMessage(outbound).metadata).toEqual({ kind: "password_reset", resetId: "reset_email_single" });
    expect(JSON.stringify(publicEmailOutboxMessage(outbound))).not.toContain("_operatorReceiptsV1");
  });

  it("requires an unchanged prepared target set and safely deduplicates a completed batch", async () => {
    const store = new MemoryStateStore(emptyState());
    store.state.emailOutbox.push(message("email_a"), message("email_b"));
    const context = { actorUserId: "usr_admin", idempotencyKey: "retry-batch-1" };
    const preview = await retryEmailOutboxMessages(store, { dryRun: true, status: "failed", limit: 25 }, context);

    store.state.emailOutbox[0]!.updatedAt = "2026-07-14T12:01:00.000Z";
    await expect(retryEmailOutboxMessages(store, {
      status: "failed",
      limit: 25,
      targetSetHash: preview.targetSetHash,
    }, context, { webhookUrl: "https://mail.example.test", fetchImpl: vi.fn<typeof fetch>() })).rejects.toMatchObject({
      statusCode: 409,
      code: "target_set_changed",
    });

    const refreshed = await retryEmailOutboxMessages(store, { dryRun: true, status: "failed", limit: 25 }, context);
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));
    const executionBody = { status: "failed" as const, limit: 25, targetSetHash: refreshed.targetSetHash };
    const executed = await retryEmailOutboxMessages(store, executionBody, context, { webhookUrl: "https://mail.example.test", fetchImpl });
    const replay = await retryEmailOutboxMessages(store, executionBody, context, { webhookUrl: "https://mail.example.test", fetchImpl });

    expect(executed).toMatchObject({ dryRun: false, deduplicated: false, retried: 2, delivered: 2 });
    expect(replay).toMatchObject({ dryRun: false, deduplicated: true, retried: 2, delivered: 2 });
    expect(executed.batchDeliveryId).toBe(replay.batchDeliveryId);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe(headers["X-Open-Tabletop-Delivery-Id"]);
    }
  });

  it("rejects reuse of a route-specific idempotency key for another email operation", async () => {
    const store = new MemoryStateStore(emptyState());
    const first = message("email_first");
    const second = message("email_second");
    store.state.emailOutbox.push(first, second);
    const context = { actorUserId: "usr_admin", idempotencyKey: "same-key", expectedUpdatedAt: timestamp };
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));

    await retryEmailOutboxMessage(store, first, context, { webhookUrl: "https://mail.example.test", fetchImpl });
    await expect(retryEmailOutboxMessage(store, second, context, { webhookUrl: "https://mail.example.test", fetchImpl }))
      .rejects.toBeInstanceOf(EmailOperatorMutationError);
  });
});
