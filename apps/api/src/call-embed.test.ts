import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { callRoomId, campaignCallResponse, resolveCallEmbedConfig } from "./call-embed.js";
import { MemoryStateStore } from "./store.js";

const secret = "0123456789abcdef0123456789abcdef-call";
const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const callEnvNames = ["OTTE_CALL_EMBED_URL", "OTTE_CALL_ROOM_SECRET", "OTTE_CALL_PROVIDER_NAME"] as const;
const savedEnv = Object.fromEntries(callEnvNames.map((name) => [name, process.env[name]]));
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const name of callEnvNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

async function app(store = new MemoryStateStore()) {
  const built = await buildApp({ store });
  apps.push(built);
  return built;
}

describe("call embed configuration", () => {
  it("is off unless the operator sets a room URL", () => {
    expect(resolveCallEmbedConfig({})).toEqual({ status: "off" });
    expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "   " })).toEqual({ status: "off" });
    expect(resolveCallEmbedConfig({ OTTE_CALL_ROOM_SECRET: secret, OTTE_CALL_PROVIDER_NAME: "Jitsi" })).toEqual({ status: "off" });
  });

  it("accepts an HTTPS room template with a secret and names the provider by host", () => {
    expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: " https://meet.example.org/otte-{room} ", OTTE_CALL_ROOM_SECRET: secret })).toEqual({
      status: "on", provider: "meet.example.org", origin: "https://meet.example.org", template: "https://meet.example.org/otte-{room}", secret,
    });
  });

  it("allows the room in the path, query and fragment, and a fixed room without a secret", () => {
    expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org:8443/r/{room}?lang=en#config.prejoinPageEnabled=true&r={room}", OTTE_CALL_ROOM_SECRET: secret })).toMatchObject({ status: "on", origin: "https://meet.example.org:8443" });
    expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/our-table" })).toEqual({ status: "on", provider: "meet.example.org", origin: "https://meet.example.org", template: "https://meet.example.org/our-table" });
  });

  it("uses the operator's provider name, trimmed, without control characters, and bounded", () => {
    expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/x", OTTE_CALL_PROVIDER_NAME: "  Guild\u0007 Jitsi\n" })).toMatchObject({ provider: "Guild  Jitsi" });
    const long = resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/x", OTTE_CALL_PROVIDER_NAME: "x".repeat(200) });
    expect(long.status === "on" && long.provider.length).toBe(40);
  });

  it.each([
    ["a relative URL", "/call/{room}", /absolute HTTPS URL/],
    ["a non-URL", "meet.example.org/{room}", /absolute HTTPS URL/],
    ["plain HTTP on a public host", "http://meet.example.org/{room}", /HTTPS outside loopback/],
    ["another scheme", "javascript:alert(1)//{room}", /HTTPS outside loopback/],
    ["a data URL", "data:text/html,<p>{room}</p>", /HTTPS outside loopback/],
    ["embedded credentials", "https://user:pass@meet.example.org/{room}", /credential-free/],
    ["a wildcard host", "https://*.example.org/{room}", /credential-free, non-wildcard/],
    ["the room in the host", "https://{room}.example.org/", /not in the host/],
    ["the room as the port", "https://meet.example.org:{room}/", /absolute HTTPS URL|not in the host/],
    ["an unsupported placeholder", "https://meet.example.org/{campaignId}", /only the \{room\} placeholder/],
    ["a stray brace", "https://meet.example.org/{room}}", /only the \{room\} placeholder/],
  ])("rejects %s and stays off", (_label, template, reason) => {
    const config = resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: template, OTTE_CALL_ROOM_SECRET: secret });
    expect(config.status).toBe("invalid");
    expect(config.status === "invalid" && config.reason).toMatch(reason);
    expect(campaignCallResponse(config, "camp_demo")).toEqual({ enabled: false });
  });

  it("requires a secret of at least 32 characters when rooms are per campaign", () => {
    for (const roomSecret of [undefined, "", "short", "x".repeat(31)]) {
      const config = resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/{room}", OTTE_CALL_ROOM_SECRET: roomSecret });
      expect(config).toEqual({ status: "invalid", reason: "OTTE_CALL_ROOM_SECRET must be at least 32 characters when OTTE_CALL_EMBED_URL uses {room}" });
    }
    expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/{room}", OTTE_CALL_ROOM_SECRET: "x".repeat(32) }).status).toBe("on");
  });

  it("allows plain HTTP only on loopback, for development", () => {
    for (const host of ["localhost:8443", "127.0.0.1:8443", "[::1]:8443"]) {
      expect(resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: `http://${host}/{room}`, OTTE_CALL_ROOM_SECRET: secret })).toMatchObject({ status: "on", origin: `http://${host}` });
    }
  });
});

describe("call rooms", () => {
  it("are stable per campaign, differ between campaigns, and depend on the secret", () => {
    const room = callRoomId(secret, "camp_demo");
    expect(room).toMatch(/^[0-9a-f]{32}$/);
    expect(callRoomId(secret, "camp_demo")).toBe(room);
    expect(callRoomId(secret, "camp_other")).not.toBe(room);
    expect(callRoomId(`${secret}-rotated`, "camp_demo")).not.toBe(room);
  });

  it("put the opaque room in every placeholder and never the campaign id", () => {
    const config = resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/otte-{room}#r={room}", OTTE_CALL_ROOM_SECRET: secret, OTTE_CALL_PROVIDER_NAME: "Jitsi" });
    const room = callRoomId(secret, "camp_demo");
    expect(campaignCallResponse(config, "camp_demo")).toEqual({ enabled: true, provider: "Jitsi", origin: "https://meet.example.org", url: `https://meet.example.org/otte-${room}#r=${room}` });
    expect(JSON.stringify(campaignCallResponse(config, "camp_demo"))).not.toContain("camp_demo");
  });

  it("share one fixed room when the template has no placeholder", () => {
    const config = resolveCallEmbedConfig({ OTTE_CALL_EMBED_URL: "https://meet.example.org/our-table" });
    expect(campaignCallResponse(config, "camp_demo")).toEqual(campaignCallResponse(config, "camp_other"));
  });
});

describe("GET /api/v1/campaigns/:campaignId/call", () => {
  it("reports the call as off by default, to a game master and a player alike", async () => {
    for (const name of callEnvNames) delete process.env[name];
    const api = await app();
    for (const headers of [gmHeaders, playerHeaders]) {
      const response = await api.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/call", headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ enabled: false });
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });

  it("gives every campaign member the same room once the operator configures a provider", async () => {
    process.env.OTTE_CALL_EMBED_URL = "https://meet.example.org/otte-{room}";
    process.env.OTTE_CALL_ROOM_SECRET = secret;
    process.env.OTTE_CALL_PROVIDER_NAME = "Jitsi";
    const api = await app();
    const expected = { enabled: true, provider: "Jitsi", origin: "https://meet.example.org", url: `https://meet.example.org/otte-${callRoomId(secret, "camp_demo")}` };
    for (const headers of [gmHeaders, playerHeaders]) {
      const response = await api.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/call", headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expected);
    }
  });

  it("does not reveal a room to someone who cannot read the campaign", async () => {
    process.env.OTTE_CALL_EMBED_URL = "https://meet.example.org/otte-{room}";
    process.env.OTTE_CALL_ROOM_SECRET = secret;
    const store = new MemoryStateStore();
    const outsider = { ...structuredClone(store.state.users.find((user) => user.id === "usr_demo_player")!), id: "usr_call_outsider", email: "outsider@example.test", displayName: "Outsider" };
    store.state.users.push(outsider);
    const api = await app(store);
    const anonymous = await api.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/call" });
    expect(anonymous.statusCode).toBe(401);
    const forbidden = await api.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/call", headers: { "x-user-id": outsider.id } });
    expect(forbidden.statusCode).toBe(403);
    for (const response of [anonymous, forbidden]) {
      expect(response.body).not.toContain("meet.example.org");
      expect(response.body).not.toContain(callRoomId(secret, "camp_demo"));
    }
  });

  it("answers not found or forbidden for a campaign that does not exist, without a room", async () => {
    process.env.OTTE_CALL_EMBED_URL = "https://meet.example.org/otte-{room}";
    process.env.OTTE_CALL_ROOM_SECRET = secret;
    const api = await app();
    const response = await api.inject({ method: "GET", url: "/api/v1/campaigns/camp_missing/call", headers: gmHeaders });
    expect([403, 404]).toContain(response.statusCode);
    expect(response.body).not.toContain("meet.example.org");
  });

  it("stays off, without failing the request, when the configuration is invalid", async () => {
    process.env.OTTE_CALL_EMBED_URL = "http://meet.example.org/{room}";
    process.env.OTTE_CALL_ROOM_SECRET = secret;
    const api = await app();
    const response = await api.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/call", headers: gmHeaders });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: false });
  });
});
