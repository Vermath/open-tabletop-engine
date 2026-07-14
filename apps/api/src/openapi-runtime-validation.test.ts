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

  it("does not alter the existing AI agent request contract", async () => {
    const app = Fastify();
    registerOpenApiRuntimeValidation(app);
    app.post("/api/v1/campaigns/:campaignId/ai/threads", async (request) => request.body);
    try {
      const unchanged = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/ai/threads", payload: { deliberately: "outside non-AI validation" } });
      expect(unchanged.statusCode).toBe(200);
      expect(unchanged.json()).toEqual({ deliberately: "outside non-AI validation" });
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

  it("reports executable coverage separately from routes with no request input and AI-owned routes", () => {
    const coverage = openApiRuntimeValidationCoverage();
    expect(coverage.totalOperations).toBeGreaterThan(300);
    expect(coverage.aiOwnedOperations).toBeGreaterThan(0);
    expect(coverage.operationsWithExecutableRequestContract).toBeGreaterThan(200);
    expect(coverage.operationsWithoutRequestInput).toBeGreaterThan(0);
    expect(coverage.operationsWithExecutableJsonResponseContract).toBeGreaterThan(200);
    expect(coverage.documentedJsonResponseContracts).toBeGreaterThan(coverage.operationsWithExecutableJsonResponseContract);
  });
});
