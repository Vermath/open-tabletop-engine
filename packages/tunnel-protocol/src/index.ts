export const tunnelFrameSchemaVersion = 1;

export type TunnelHeaders = Record<string, string>;

export type TunnelFrame =
  | { type: "host.hello"; protocolVersion: typeof tunnelFrameSchemaVersion; tableSlug: string; hostToken: string }
  | { type: "http.request"; requestId: string; method: string; path: string; headers: TunnelHeaders }
  | { type: "http.body"; requestId: string; bodyBase64: string }
  | { type: "http.end"; requestId: string }
  | { type: "http.response"; requestId: string; status: number; headers: TunnelHeaders }
  | { type: "ws.open"; socketId: string; path: string; headers: TunnelHeaders }
  | { type: "ws.message"; socketId: string; bodyBase64: string }
  | { type: "ws.close"; socketId: string; code?: number; reason?: string }
  | { type: "control.ping"; sentAt: string };

const supportedFrameTypes = new Set<TunnelFrame["type"]>(["host.hello", "http.request", "http.body", "http.end", "http.response", "ws.open", "ws.message", "ws.close", "control.ping"]);

export function parseTunnelFrame(value: unknown): TunnelFrame {
  const record = requireRecord(value, "Tunnel frame must be an object");
  const type = stringField(record, "type");
  if (!supportedFrameTypes.has(type as TunnelFrame["type"])) throw new Error(`Unsupported tunnel frame type: ${type}`);
  switch (type) {
    case "host.hello":
      return {
        type,
        protocolVersion: numberField(record, "protocolVersion") === tunnelFrameSchemaVersion ? tunnelFrameSchemaVersion : fail("Unsupported tunnel protocol version"),
        tableSlug: stringField(record, "tableSlug"),
        hostToken: stringField(record, "hostToken")
      };
    case "http.request":
      return {
        type,
        requestId: stringField(record, "requestId"),
        method: httpMethod(record),
        path: safePath(record),
        headers: headersField(record, "headers")
      };
    case "http.body":
      return { type, requestId: stringField(record, "requestId"), bodyBase64: base64Field(record, "bodyBase64") };
    case "http.end":
      return { type, requestId: stringField(record, "requestId") };
    case "http.response":
      return { type, requestId: stringField(record, "requestId"), status: statusField(record), headers: headersField(record, "headers") };
    case "ws.open":
      return { type, socketId: stringField(record, "socketId"), path: safePath(record), headers: headersField(record, "headers") };
    case "ws.message":
      return { type, socketId: stringField(record, "socketId"), bodyBase64: base64Field(record, "bodyBase64") };
    case "ws.close":
      return { type, socketId: stringField(record, "socketId"), code: optionalCode(record), reason: optionalString(record, "reason") };
    case "control.ping":
      return { type, sentAt: stringField(record, "sentAt") };
    default:
      return fail(`Unsupported tunnel frame type: ${type}`);
  }
}

export function serializeTunnelFrame(frame: TunnelFrame): string {
  return JSON.stringify(parseTunnelFrame(frame));
}

export function parseTunnelFrameText(text: string): TunnelFrame {
  try {
    return parseTunnelFrame(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Invalid tunnel frame JSON");
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key} must be a non-empty string`);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  return value;
}

function headersField(record: Record<string, unknown>, key: string): TunnelHeaders {
  const headers = requireRecord(record[key], `${key} must be an object`);
  const clean: TunnelHeaders = {};
  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (typeof headerValue !== "string") throw new Error(`${key}.${headerKey} must be a string`);
    clean[headerKey.toLowerCase()] = headerValue;
  }
  return clean;
}

function safePath(record: Record<string, unknown>): string {
  const path = stringField(record, "path");
  if (!path.startsWith("/")) throw new Error("path must start with /");
  if (path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error("path must be relative to the shared table origin");
  return path;
}

function httpMethod(record: Record<string, unknown>): string {
  const method = stringField(record, "method").toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error("method must be an HTTP token");
  return method;
}

function base64Field(record: Record<string, unknown>, key: string): string {
  const value = stringField(record, key);
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(value)) throw new Error(`${key} must be base64 encoded`);
  return value;
}

function statusField(record: Record<string, unknown>): number {
  const status = numberField(record, "status");
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error("status must be an HTTP status code");
  return status;
}

function optionalCode(record: Record<string, unknown>): number | undefined {
  const value = record.code;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1000 || value > 4999) throw new Error("code must be a WebSocket close code");
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}
