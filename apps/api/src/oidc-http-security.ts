import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

export interface OidcHttpSecurityOptions {
  issuer: string;
  allowedEndpointOrigins?: readonly string[];
  allowInsecure?: boolean;
  allowPrivateNetwork?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface OidcJsonRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | Buffer;
}

interface ResolvedOidcTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/**
 * Validates an OIDC endpoint and resolves it once. The returned address is
 * pinned into the subsequent HTTP request so a second DNS lookup cannot swap
 * a public validation result for a private destination.
 */
export async function resolveOidcTarget(value: string, security: OidcHttpSecurityOptions): Promise<ResolvedOidcTarget> {
  const url = parseEndpointUrl(value);
  const issuer = parseEndpointUrl(security.issuer);
  const allowedOrigins = new Set([issuer.origin, ...(security.allowedEndpointOrigins ?? []).map(normalizeOrigin)]);
  if (!allowedOrigins.has(url.origin)) throw new Error(`OIDC endpoint origin is not allowed: ${url.origin}`);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && security.allowInsecure === true)) {
    throw new Error("OIDC endpoints must use HTTPS unless insecure OIDC is explicitly enabled");
  }

  const hostname = normalizeHostname(url.hostname);
  const records = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await dnsLookup(hostname, { all: true, verbatim: true });
  if (records.length === 0) throw new Error(`OIDC endpoint host did not resolve: ${hostname}`);
  for (const record of records) {
    if (!isSafeOidcAddress(record.address, hostname, security)) {
      throw new Error(`OIDC endpoint resolved to a disallowed network address: ${hostname}`);
    }
  }
  const selected = records.find((record) => record.family === 4) ?? records[0]!;
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

export async function assertOidcEndpointUrl(value: string, security: OidcHttpSecurityOptions): Promise<void> {
  await resolveOidcTarget(value, security);
}

export async function oidcJsonRequest<T>(
  value: string,
  requestOptions: OidcJsonRequestOptions,
  security: OidcHttpSecurityOptions,
): Promise<T> {
  const target = await resolveOidcTarget(value, security);
  const timeoutMs = boundedPositiveInteger(security.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 60_000);
  const maxResponseBytes = boundedPositiveInteger(security.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 1024, 8 * 1024 * 1024);
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, target.address, target.family);
  };
  const options: RequestOptions = {
    method: requestOptions.method ?? "GET",
    headers: {
      accept: "application/json",
      ...requestOptions.headers,
    },
    lookup: pinnedLookup,
  };
  const requestFactory = target.url.protocol === "https:" ? httpsRequest : httpRequest;

  return await new Promise<T>((resolve, reject) => {
    const request = requestFactory(target.url, options, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.resume();
        reject(new Error("OIDC endpoint redirects are not allowed"));
        return;
      }
      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        response.destroy();
        reject(new Error(`OIDC endpoint response exceeds ${maxResponseBytes} bytes`));
        return;
      }
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.length;
        if (receivedBytes > maxResponseBytes) {
          response.destroy(new Error(`OIDC endpoint response exceeds ${maxResponseBytes} bytes`));
          return;
        }
        chunks.push(buffer);
      });
      response.on("error", reject);
      response.on("end", () => {
        if (status < 200 || status >= 300) {
          reject(new Error(`OIDC endpoint returned ${status}`));
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        if (!contentType.startsWith("application/json") && !contentType.includes("+json")) {
          reject(new Error("OIDC endpoint response must use a JSON content type"));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
        } catch {
          reject(new Error("OIDC endpoint returned invalid JSON"));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`OIDC endpoint timed out after ${timeoutMs}ms`)));
    request.on("error", reject);
    if (requestOptions.body !== undefined) request.write(requestOptions.body);
    request.end();
  });
}

function parseEndpointUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OIDC endpoint must be an absolute URL");
  }
  if (url.username || url.password) throw new Error("OIDC endpoint URLs must not contain credentials");
  if (url.hash) throw new Error("OIDC endpoint URLs must not contain fragments");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("OIDC endpoint URL scheme is not allowed");
  return url;
}

function normalizeOrigin(value: string): string {
  return parseEndpointUrl(value.trim()).origin;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isSafeOidcAddress(address: string, hostname: string, security: OidcHttpSecurityOptions): boolean {
  const category = oidcAddressCategory(address);
  if (category === "public") return true;
  if (category === "loopback") return security.allowInsecure === true && isExplicitLoopbackHostname(hostname);
  return security.allowPrivateNetwork === true;
}

function isExplicitLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function oidcAddressCategory(address: string): "public" | "loopback" | "private" {
  const version = isIP(address);
  if (version === 4) return ipv4AddressCategory(address);
  if (version === 6) return ipv6AddressCategory(address);
  return "private";
}

function ipv4AddressCategory(address: string): "public" | "loopback" | "private" {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return "private";
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 127) return "loopback";
  if (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  ) return "private";
  return "public";
}

function ipv6AddressCategory(address: string): "public" | "loopback" | "private" {
  const normalized = normalizeHostname(address);
  if (normalized === "::1") return "loopback";
  if (normalized === "::" || normalized.startsWith("::ffff:")) return "private";
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return "private";
  if ((first & 0xffc0) === 0xfe80) return "private";
  if ((first & 0xff00) === 0xff00) return "private";
  if (normalized.startsWith("2001:db8:")) return "private";
  return "public";
}

function boundedPositiveInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value === undefined) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}
