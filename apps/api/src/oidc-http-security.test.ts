import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { oidcJsonRequest, resolveOidcTarget } from "./oidc-http-security.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("OIDC HTTP security", () => {
  it("pins and reads a same-origin loopback endpoint only when insecure local development is explicit", async () => {
    const server = await listen((request, response) => {
      if (request.url === "/json") return send(response, 200, "application/json", JSON.stringify({ ok: true }));
      return send(response, 404, "application/json", JSON.stringify({ error: "not_found" }));
    });
    const origin = serverOrigin(server);

    await expect(oidcJsonRequest(`${origin}/json`, {}, { issuer: origin, allowInsecure: true })).resolves.toEqual({ ok: true });
    await expect(resolveOidcTarget(`${origin}/json`, { issuer: origin })).rejects.toThrow(/HTTPS/);
  });

  it("rejects cross-origin, credentialed, fragmented, private-network, and redirect targets", async () => {
    let redirectedRequestCount = 0;
    const server = await listen((request, response) => {
      if (request.url === "/redirect") {
        redirectedRequestCount += 1;
        response.writeHead(302, { location: "/json" }).end();
        return;
      }
      return send(response, 200, "application/json", JSON.stringify({ ok: true }));
    });
    const origin = serverOrigin(server);
    const port = (server.address() as AddressInfo).port;

    await expect(resolveOidcTarget(`http://localhost:${port}/json`, { issuer: origin, allowInsecure: true })).rejects.toThrow(/origin is not allowed/);
    await expect(resolveOidcTarget(`http://user:secret@127.0.0.1:${port}/json`, { issuer: origin, allowInsecure: true })).rejects.toThrow(/credentials/);
    await expect(resolveOidcTarget(`${origin}/json#secret`, { issuer: origin, allowInsecure: true })).rejects.toThrow(/fragments/);
    await expect(resolveOidcTarget("http://10.0.0.1/json", { issuer: "http://10.0.0.1", allowInsecure: true })).rejects.toThrow(/disallowed network address/);
    await expect(oidcJsonRequest(`${origin}/redirect`, {}, { issuer: origin, allowInsecure: true })).rejects.toThrow(/redirects are not allowed/);
    expect(redirectedRequestCount).toBe(1);
  });

  it("bounds response bytes and requires a JSON content type", async () => {
    const server = await listen((request, response) => {
      if (request.url === "/large") return send(response, 200, "application/json", JSON.stringify({ value: "x".repeat(2_048) }));
      return send(response, 200, "text/plain", JSON.stringify({ ok: true }));
    });
    const origin = serverOrigin(server);

    await expect(oidcJsonRequest(`${origin}/large`, {}, { issuer: origin, allowInsecure: true, maxResponseBytes: 1_024 })).rejects.toThrow(/exceeds 1024 bytes/);
    await expect(oidcJsonRequest(`${origin}/plain`, {}, { issuer: origin, allowInsecure: true })).rejects.toThrow(/JSON content type/);
  });
});

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<ReturnType<typeof createServer>> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function serverOrigin(server: ReturnType<typeof createServer>): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function send(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(body) });
  response.end(body);
}
