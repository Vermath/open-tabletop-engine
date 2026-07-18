import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { openApiRuntimeValidationCoverage, registerOpenApiRuntimeValidation } from "./openapi-runtime-validation.js";

describe("OpenAPI runtime request validation", () => {
  it("rejects malformed published JSON bodies before a non-AI handler runs", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    let registeredSchema: unknown;
    app.addHook("onRoute", (routeOptions) => {
      if (routeOptions.url === "/api/v1/campaigns" && routeOptions.method === "POST") registeredSchema = routeOptions.schema;
    });
    let handled = 0;
    app.post("/api/v1/campaigns", async () => {
      handled += 1;
      return { ok: true };
    });
    try {
      const malformed = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns",
        payload: { name: { nested: "objects cannot be coerced to campaign names" } },
      });
      expect(registeredSchema).toMatchObject({ body: { type: "object" } });
      expect(malformed.statusCode).toBe(400);
      expect(handled).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("accepts structurally valid input and leaves domain decisions to the handler", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    app.post("/api/v1/campaigns", async (_request, reply) => reply.code(202).send({ ok: true }));
    try {
      const valid = await app.inject({ method: "POST", url: "/api/v1/campaigns", payload: { name: "Runtime-validated campaign" } });
      expect(valid.statusCode).toBe(202);
      expect(valid.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it("rejects JSON body coercion while preserving Fastify query coercion", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    let handled = 0;
    let capturedQuery: unknown;
    app.post("/api/v1/campaigns/:campaignId/systems/:systemId/actors/:actorId/rules-preview", async (_request, reply) => {
      handled += 1;
      return reply.code(202).send({ ok: true });
    });
    app.get("/api/v1/chat/messages", async (request) => {
      capturedQuery = request.query;
      return [];
    });
    try {
      const malformedBody = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/act_demo/rules-preview",
        payload: { operation: "advancement", className: 42 },
      });
      expect(malformedBody.statusCode).toBe(400);
      expect(malformedBody.json().message).toContain("className");
      expect(handled).toBe(0);

      const supportedAdvancement = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/act_demo/rules-preview",
        payload: {
          operation: "advancement",
          subclassId: "champion",
          weaponMasteryChoices: ["greatsword", "longbow"],
        },
      });
      expect(supportedAdvancement.statusCode).toBe(202);
      expect(handled).toBe(1);

      const coercedQuery = await app.inject({ method: "GET", url: "/api/v1/chat/messages?limit=5" });
      expect(coercedQuery.statusCode).toBe(200);
      expect(capturedQuery).toMatchObject({ limit: 5 });
    } finally {
      await app.close();
    }
  });

  it("executes the published AI agent request contract at runtime", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    let handled = 0;
    app.post("/api/v1/campaigns/:campaignId/ai/threads", async (_request, reply) => {
      handled += 1;
      return reply.code(202).send({ accepted: true });
    });
    app.post("/api/v1/campaigns/:campaignId/ai/encounter-design", async (_request, reply) => {
      handled += 1;
      return reply.code(202).send({ accepted: true });
    });
    app.post("/api/v1/campaigns/:campaignId/ai/generate-map-asset", async (_request, reply) => {
      handled += 1;
      return reply.code(202).send({ accepted: true });
    });
    try {
      const malformed = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/ai/threads", payload: { deliberately: "not a published field" } });
      expect(malformed.statusCode).toBe(400);
      expect(handled).toBe(0);

      const expectedUpdatedAt = "2026-07-17T00:00:00.000Z";
      const valid = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/ai/threads", headers: { "idempotency-key": "runtime-ai-thread" }, payload: { prompt: "Draft a room", approvalMode: "auto", expectedUpdatedAt } });
      expect(valid.statusCode).toBe(202);
      expect(handled).toBe(1);

      const validEncounter = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/ai/encounter-design", headers: { "idempotency-key": "runtime-ai-encounter" }, payload: { prompt: "Draft a room", sceneName: "Vault", sceneWidth: 1200, sceneHeight: 800, gridSize: 50, partyActorIds: ["act_valen"], expectedUpdatedAt } });
      expect(validEncounter.statusCode).toBe(202);
      expect(handled).toBe(2);

      const malformedAsset = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/ai/generate-map-asset", payload: { prompt: "Map", outputFormat: "svg" } });
      expect(malformedAsset.statusCode).toBe(400);
      expect(handled).toBe(2);

      const validAsset = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/ai/generate-map-asset", headers: { "idempotency-key": "runtime-ai-map" }, payload: { prompt: "Map", sceneId: "scn_vault_entry", outputFormat: "png", expectedUpdatedAt } });
      expect(validAsset.statusCode).toBe(202);
      expect(handled).toBe(3);
    } finally {
      await app.close();
    }
  });

  it("executes the reviewed scheduled-effect preview and advance contracts at runtime", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    let previewHandled = 0;
    let advanceHandled = 0;
    app.post("/api/v1/combats/:combatId/effects/preview", async (_request, reply) => {
      previewHandled += 1;
      return reply.code(202).send({ accepted: true });
    });
    app.post("/api/v1/combats/:combatId/effects/advance", async (_request, reply) => {
      advanceHandled += 1;
      return reply.code(202).send({ accepted: true });
    });

    try {
      const malformedPreview = await app.inject({
        method: "POST",
        url: "/api/v1/combats/combat_1/effects/preview",
        payload: { phase: "end_turn", prepare: true, inferredOutcome: "success" },
      });
      expect(malformedPreview.statusCode).toBe(400);
      expect(previewHandled).toBe(0);

      const validPreview = await app.inject({
        method: "POST",
        url: "/api/v1/combats/combat_1/effects/preview",
        headers: { "idempotency-key": "effect-preview-runtime" },
        payload: { phase: "end_turn", now: "2026-07-17T12:00:00.000Z", saveOutcomes: { effect_1: "success" }, prepare: true },
      });
      expect(validPreview.statusCode).toBe(202);
      expect(previewHandled).toBe(1);

      const malformedAdvance = await app.inject({
        method: "POST",
        url: "/api/v1/combats/combat_1/effects/advance",
        headers: { "idempotency-key": "effect-advance-runtime-invalid" },
        payload: { preparedPreviewKey: "effect-preview-runtime" },
      });
      expect(malformedAdvance.statusCode).toBe(400);
      expect(advanceHandled).toBe(0);

      const validAdvance = await app.inject({
        method: "POST",
        url: "/api/v1/combats/combat_1/effects/advance",
        headers: { "idempotency-key": "effect-advance-runtime" },
        payload: { preparedPreviewKey: "effect-preview-runtime", expectedUpdatedAt: "2026-07-17T12:00:00.000Z" },
      });
      expect(validAdvance.statusCode).toBe(202);
      expect(advanceHandled).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("fails malformed documented non-AI responses at runtime", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    app.get("/api/v1/campaigns", async () => ({ malformed: true }));
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const malformed = await app.inject({ method: "GET", url: "/api/v1/campaigns" });
      expect(malformed.statusCode).toBe(500);
      expect(malformed.json()).toMatchObject({
        statusCode: 500,
        code: "OPENAPI_RESPONSE_VALIDATION_FAILED",
      });
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      await app.close();
    }
  });

  it("does not treat NDJSON streams as JSON response documents", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    app.get("/api/v1/admin/audit-logs", async (_request, reply) =>
      reply.type("application/x-ndjson").send('{"id":"audit_1"}\n')
    );
    try {
      const streamed = await app.inject({ method: "GET", url: "/api/v1/admin/audit-logs" });
      expect(streamed.statusCode).toBe(200);
      expect(streamed.headers["content-type"]).toContain("application/x-ndjson");
      expect(streamed.body).toBe('{"id":"audit_1"}\n');
    } finally {
      await app.close();
    }
  });

  it("reports executable coverage separately from routes with no request input and deliberate protocol exceptions", () => {
    const coverage = openApiRuntimeValidationCoverage();
    expect(coverage.totalOperations).toBeGreaterThan(300);
    expect(coverage.deliberateExceptionOperations).toBe(1);
    expect(coverage.aiOwnedOperations).toBe(coverage.deliberateExceptionOperations);
    expect(coverage.operationsWithExecutableRequestContract).toBeGreaterThan(200);
    expect(coverage.operationsWithoutRequestInput).toBeGreaterThan(0);
    expect(coverage.operationsWithExecutableJsonResponseContract).toBeGreaterThan(200);
    expect(coverage.documentedJsonResponseContracts).toBeGreaterThan(coverage.operationsWithExecutableJsonResponseContract);
  });
});
