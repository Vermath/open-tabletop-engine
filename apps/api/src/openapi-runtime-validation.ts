import { openApiSpec } from "@open-tabletop/api-contracts";
import AjvCompiler from "@fastify/ajv-compiler";
import type { FastifyInstance, FastifySchema, RouteOptions } from "fastify";

type JsonSchema = Record<string, unknown>;
type OpenApiParameter = {
  name: string;
  in: "header" | "path" | "query";
  required?: boolean;
  schema: JsonSchema;
};
type OpenApiOperation = {
  parameters?: readonly OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses?: Record<string, {
    content?: Record<string, { schema?: JsonSchema }>;
  }>;
};

const componentRefPrefix = "#/components/schemas/";
const components = openApiSpec.components.schemas as Record<string, JsonSchema>;
const operations = openApiSpec.paths as Record<string, Partial<Record<string, OpenApiOperation>>>;
const responseValidationFailureSymbol = Symbol("otte.openApiResponseValidationFailure");
const responseValidatorPool = AjvCompiler();
const responseCompiler = responseValidatorPool({}, {
  customOptions: { coerceTypes: false, removeAdditional: false },
});
const responseValidators = new Map<string, ReturnType<ReturnType<ReturnType<typeof AjvCompiler>>>>();

/**
 * Makes the published OpenAPI request contract executable at the Fastify
 * boundary. Route handlers still own domain, permission, revision, and
 * idempotency decisions; this hook rejects structurally malformed input first.
 */
export function registerOpenApiRuntimeValidation(app: FastifyInstance): void {
  installLocationAwareValidatorCompiler(app);
  app.addHook("onRoute", (routeOptions) => {
    const openApiPath = fastifyPathToOpenApiPath(routeOptions.url);
    if (isRuntimeValidationException(openApiPath)) return;
    const operation = operationForRoute(openApiPath, routeOptions.method);
    if (!operation) return;
    const runtimeSchema = runtimeSchemaForOperation(operation);
    if (Object.keys(runtimeSchema).length === 0) return;
    routeOptions.schema = mergeRouteSchemas(routeOptions.schema, runtimeSchema);
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (Reflect.get(request, responseValidationFailureSymbol)) return payload;
    const openApiPath = fastifyPathToOpenApiPath(request.routeOptions.url ?? request.url.split("?")[0] ?? request.url);
    if (isRuntimeValidationException(openApiPath)) return payload;
    const operation = operationForRoute(openApiPath, request.method);
    const responseSchema = jsonResponseSchema(operation, reply.statusCode, reply.getHeader("content-type"));
    if (!responseSchema || reply.statusCode === 204 || reply.statusCode === 304 || payload === null) return payload;

    const cacheKey = `${request.method}:${openApiPath}:${reply.statusCode}`;
    let validate = responseValidators.get(cacheKey);
    if (!validate) {
      validate = responseCompiler({
        schema: dereferenceSchema(responseSchema),
        method: request.method,
        url: openApiPath,
        httpPart: "body",
      });
      responseValidators.set(cacheKey, validate);
    }

    const decoded = decodeJsonPayload(payload);
    if (!decoded.ok || !validate(decoded.value)) {
      Reflect.set(request, responseValidationFailureSymbol, true);
      const detail = decoded.ok ? formatValidationError(validate.errors) : decoded.error;
      throw Object.assign(new Error(`OpenAPI response validation failed for ${request.method} ${openApiPath} ${reply.statusCode}: ${detail}`), {
        code: "OPENAPI_RESPONSE_VALIDATION_FAILED",
        statusCode: 500,
      });
    }
    return payload;
  });
}

function installLocationAwareValidatorCompiler(app: FastifyInstance): void {
  const validatorPool = AjvCompiler();
  const externalSchemas = app.getSchemas() as Parameters<typeof validatorPool>[0];
  const strictBodyCompiler = validatorPool(externalSchemas, {
    customOptions: { coerceTypes: false, removeAdditional: false },
  });
  const parameterCompiler = validatorPool(externalSchemas, {
    customOptions: { coerceTypes: "array", removeAdditional: false },
  });
  const defaultCompiler = validatorPool(externalSchemas, { customOptions: {} });
  app.setValidatorCompiler((route) => {
    if (isRuntimeValidationException(fastifyPathToOpenApiPath(route.url))) return defaultCompiler(route);
    if (route.httpPart !== "body") return parameterCompiler(route);
    const validate = strictBodyCompiler(route);
    const operation = operationForRoute(fastifyPathToOpenApiPath(route.url), route.method);
    if (operation?.requestBody?.required !== false) return validate;
    const optionalValidate = ((data: unknown) => {
      if (data === undefined || data === null) {
        optionalValidate.errors = null;
        return true;
      }
      const result = validate(data);
      optionalValidate.errors = validate.errors;
      return result;
    }) as typeof validate;
    optionalValidate.errors = null;
    return optionalValidate;
  });
}

export function openApiRuntimeValidationCoverage(): {
  totalOperations: number;
  deliberateExceptionOperations: number;
  /** @deprecated compatibility alias for the former broad AI exemption count. */
  aiOwnedOperations: number;
  operationsWithExecutableRequestContract: number;
  operationsWithoutRequestInput: number;
  operationsWithExecutableJsonResponseContract: number;
  documentedJsonResponseContracts: number;
} {
  let totalOperations = 0;
  let deliberateExceptionOperations = 0;
  let operationsWithExecutableRequestContract = 0;
  let operationsWithoutRequestInput = 0;
  let operationsWithExecutableJsonResponseContract = 0;
  let documentedJsonResponseContracts = 0;
  for (const [path, pathItem] of Object.entries(operations)) {
    for (const operation of Object.values(pathItem)) {
      if (!operation) continue;
      totalOperations += 1;
      if (isRuntimeValidationException(path)) {
        deliberateExceptionOperations += 1;
        continue;
      }
      const schema = runtimeSchemaForOperation(operation);
      if (Object.keys(schema).length > 0) operationsWithExecutableRequestContract += 1;
      else operationsWithoutRequestInput += 1;
      const responseContractCount = jsonResponseContractCount(operation);
      if (responseContractCount > 0) operationsWithExecutableJsonResponseContract += 1;
      documentedJsonResponseContracts += responseContractCount;
    }
  }
  return {
    totalOperations,
    deliberateExceptionOperations,
    aiOwnedOperations: deliberateExceptionOperations,
    operationsWithExecutableRequestContract,
    operationsWithoutRequestInput,
    operationsWithExecutableJsonResponseContract,
    documentedJsonResponseContracts,
  };
}

function operationForRoute(openApiPath: string, method: RouteOptions["method"]): OpenApiOperation | undefined {
  const methods = Array.isArray(method) ? method : [method];
  for (const candidate of methods) {
    const operation = operations[openApiPath]?.[String(candidate).toLowerCase()];
    if (operation) return operation;
  }
  return undefined;
}

function runtimeSchemaForOperation(operation: OpenApiOperation): FastifySchema {
  const parameters = operation.parameters ?? [];
  const body = operation.requestBody?.content?.["application/json"]?.schema;
  const params = parameterObjectSchema(parameters, "path");
  const querystring = parameterObjectSchema(parameters, "query");
  const headers = parameterObjectSchema(parameters, "header");
  return {
    ...(body ? { body: dereferenceSchema(body) } : {}),
    ...(params ? { params } : {}),
    ...(querystring ? { querystring } : {}),
    ...(headers ? { headers } : {}),
  };
}

function jsonResponseSchema(operation: OpenApiOperation | undefined, statusCode: number, contentType: unknown): JsonSchema | undefined {
  const response = operation?.responses?.[String(statusCode)] ?? operation?.responses?.default;
  if (!response?.content) return undefined;
  const normalizedContentType = Array.isArray(contentType) ? String(contentType[0] ?? "") : String(contentType ?? "");
  if (normalizedContentType && !isJsonMediaType(normalizedContentType)) return undefined;
  for (const [mediaType, media] of Object.entries(response.content)) {
    if (isJsonMediaType(mediaType) && media.schema) return media.schema;
  }
  return undefined;
}

function jsonResponseContractCount(operation: OpenApiOperation): number {
  return Object.values(operation.responses ?? {}).filter((response) => Object.entries(response.content ?? {}).some(([mediaType, media]) =>
    isJsonMediaType(mediaType) && Boolean(media.schema)
  )).length;
}

function isJsonMediaType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function decodeJsonPayload(payload: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof payload !== "string" && !Buffer.isBuffer(payload)) return { ok: true, value: payload };
  const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "payload is not valid JSON" };
  }
}

function formatValidationError(errors: null | undefined | readonly { instancePath?: string; message?: string }[]): string {
  const first = errors?.[0];
  if (!first) return "response does not match its documented schema";
  return `${first.instancePath || "/"} ${first.message ?? "is invalid"}`;
}

function parameterObjectSchema(parameters: readonly OpenApiParameter[], location: OpenApiParameter["in"]): JsonSchema | undefined {
  const selected = parameters.filter((parameter) => parameter.in === location);
  if (selected.length === 0) return undefined;
  const names = selected.map((parameter) => location === "header" ? parameter.name.toLowerCase() : parameter.name);
  return {
    type: "object",
    properties: Object.fromEntries(selected.map((parameter, index) => [names[index]!, dereferenceSchema(parameter.schema)])),
    required: selected.flatMap((parameter, index) => parameter.required ? [names[index]!] : []),
    additionalProperties: true,
  };
}

function dereferenceSchema(schema: JsonSchema, stack: readonly string[] = []): JsonSchema {
  const ref = typeof schema.$ref === "string" ? schema.$ref : undefined;
  if (ref?.startsWith(componentRefPrefix)) {
    const name = ref.slice(componentRefPrefix.length);
    const component = components[name];
    if (!component) throw new Error(`OpenAPI request schema references missing component ${name}`);
    if (stack.includes(name)) throw new Error(`OpenAPI request schema contains a component cycle: ${[...stack, name].join(" -> ")}`);
    return dereferenceSchema(component, [...stack, name]);
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, dereferenceValue(value, stack)]));
}

function dereferenceValue(value: unknown, stack: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((entry) => dereferenceValue(entry, stack));
  if (isRecord(value)) return dereferenceSchema(value, stack);
  return value;
}

function mergeRouteSchemas(existing: FastifySchema | undefined, runtime: FastifySchema): FastifySchema {
  if (!existing) return runtime;
  return {
    ...runtime,
    ...existing,
    body: mergeJsonSchemas(runtime.body, existing.body),
    params: mergeJsonSchemas(runtime.params, existing.params),
    querystring: mergeJsonSchemas(runtime.querystring, existing.querystring),
    headers: mergeJsonSchemas(runtime.headers, existing.headers),
  };
}

function mergeJsonSchemas(runtime: unknown, existing: unknown): unknown {
  if (runtime === undefined) return existing;
  if (existing === undefined) return runtime;
  return { allOf: [runtime, existing] };
}

function fastifyPathToOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function isRuntimeValidationException(path: string): boolean {
  // MCP is an evolving JSON-RPC transport whose method-specific params/result
  // unions are validated by the MCP dispatcher. Stable AI and agent REST
  // resources use the same executable OpenAPI boundary as every other v1 API.
  return path === "/api/v1/mcp";
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
