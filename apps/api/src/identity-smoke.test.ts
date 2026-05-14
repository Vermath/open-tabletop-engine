import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const identitySmokeBaseUrl = trimTrailingSlash(process.env.OTTE_IDENTITY_SMOKE_BASE_URL);
const identitySmokeAdminToken = envText("OTTE_IDENTITY_SMOKE_ADMIN_TOKEN");
const scimBearerToken = envText("OTTE_SCIM_BEARER_TOKEN");

type SmokeResponse = {
  status: number;
  body: unknown;
  text: string;
};

type SmokeMethod = "GET" | "POST";
type SmokeRequest = (path: string, init?: { method?: SmokeMethod; headers?: Record<string, string>; body?: unknown }) => Promise<SmokeResponse>;

describe("identity provider smoke", () => {
  if (identitySmokeBaseUrl && identitySmokeAdminToken && scimBearerToken) {
    it("checks deployed OIDC and SCIM readiness without exposing provider secrets", async () => {
      const request: SmokeRequest = async (path, init = {}) => {
        const response = await fetch(`${identitySmokeBaseUrl}${path}`, {
          method: init.method ?? "GET",
          headers: {
            ...(init.body ? { "content-type": "application/json" } : {}),
            ...(init.headers ?? {})
          },
          body: init.body ? JSON.stringify(init.body) : undefined
        });
        const text = await response.text();
        const body = text ? JSON.parse(text) : undefined;
        return { status: response.status, body, text };
      };

      await assertIdentitySmoke(request, {
        adminAuthorization: `Bearer ${identitySmokeAdminToken}`,
        scimAuthorization: `Bearer ${scimBearerToken}`
      });
    });
    return;
  }

  if (hasLocalIdentitySmokeEnv()) {
    it("checks local sandbox OIDC discovery and SCIM readiness without exposing provider secrets", async () => {
      const adminUserId = envText("OTTE_IDENTITY_SMOKE_ADMIN_USER_ID") ?? "usr_demo_gm";
      const previousAdminUserIds = process.env.OTTE_ADMIN_USER_IDS;
      process.env.OTTE_ADMIN_USER_IDS = adminUserId;

      const app = await buildApp({ store: new MemoryStateStore() });
      try {
        const login = await app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { userId: adminUserId }
        });
        expect(login.statusCode).toBe(200);
        const adminAuthorization = `Bearer ${login.json().token}`;
        const request: SmokeRequest = async (path, init = {}) => {
        const response = await app.inject({
          method: init.method ?? "GET",
          url: path,
          headers: init.headers,
          payload: init.body as string | object | Buffer | undefined
        });
          const text = response.body;
          return { status: response.statusCode, body: text ? JSON.parse(text) : undefined, text };
        };

        await assertIdentitySmoke(request, {
          adminAuthorization,
          scimAuthorization: `Bearer ${scimBearerToken}`
        });
      } finally {
        await app.close();
        if (previousAdminUserIds === undefined) {
          delete process.env.OTTE_ADMIN_USER_IDS;
        } else {
          process.env.OTTE_ADMIN_USER_IDS = previousAdminUserIds;
        }
      }
    });
    return;
  }

  it.skip("requires OTTE_IDENTITY_SMOKE_BASE_URL/OTTE_IDENTITY_SMOKE_ADMIN_TOKEN/OTTE_SCIM_BEARER_TOKEN or local OIDC plus SCIM env", () => undefined);
});

async function assertIdentitySmoke(
  request: SmokeRequest,
  options: { adminAuthorization: string; scimAuthorization: string }
): Promise<void> {
  const oidc = await request("/api/v1/admin/auth/test-connection", {
    method: "POST",
    headers: { authorization: options.adminAuthorization },
    body: { provider: "oidc" }
  });
  expect(oidc.status).toBe(200);
  expect(oidc.body).toMatchObject({
    provider: "oidc",
    ok: true,
    status: "passed",
    checks: expect.arrayContaining([
      expect.objectContaining({ name: "discovery_document", ok: true }),
      expect.objectContaining({ name: "authorization_endpoint", ok: true }),
      expect.objectContaining({ name: "token_endpoint", ok: true }),
      expect.objectContaining({ name: "userinfo_endpoint", ok: true })
    ])
  });

  const scimAdmin = await request("/api/v1/admin/auth/test-connection", {
    method: "POST",
    headers: { authorization: options.adminAuthorization },
    body: { provider: "scim" }
  });
  expect(scimAdmin.status).toBe(200);
  expect(scimAdmin.body).toMatchObject({
    provider: "scim",
    ok: true,
    status: "passed",
    checks: expect.arrayContaining([
      expect.objectContaining({ name: "bearer_token_configured", ok: true }),
      expect.objectContaining({ name: "service_provider_config", ok: true }),
      expect.objectContaining({ name: "users_endpoint", ok: true }),
      expect.objectContaining({ name: "groups_endpoint", ok: true })
    ])
  });

  const serviceProviderConfig = await request("/api/v1/scim/v2/ServiceProviderConfig", {
    headers: { authorization: options.scimAuthorization }
  });
  expect(serviceProviderConfig.status).toBe(200);
  expect(serviceProviderConfig.body).toMatchObject({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    authenticationSchemes: [expect.objectContaining({ type: "oauthbearertoken", primary: true })]
  });

  const responseText = `${oidc.text}\n${scimAdmin.text}\n${serviceProviderConfig.text}`;
  for (const value of sensitiveEnvValues(options)) {
    expect(responseText).not.toContain(value);
  }
}

function hasLocalIdentitySmokeEnv(): boolean {
  return Boolean(envText("OTTE_OIDC_ISSUER") && envText("OTTE_OIDC_CLIENT_ID") && scimBearerToken);
}

function sensitiveEnvValues(options: { adminAuthorization: string; scimAuthorization: string }): string[] {
  const values = [
    process.env.OTTE_IDENTITY_SMOKE_ADMIN_TOKEN,
    process.env.OTTE_OIDC_ISSUER,
    process.env.OTTE_OIDC_CLIENT_ID,
    process.env.OTTE_OIDC_CLIENT_SECRET,
    process.env.OTTE_OIDC_REDIRECT_URI,
    process.env.OTTE_SCIM_BEARER_TOKEN,
    options.adminAuthorization.replace(/^Bearer\s+/i, ""),
    options.scimAuthorization.replace(/^Bearer\s+/i, "")
  ];
  const sensitive: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (text && text.length >= 8 && text !== "undefined") sensitive.push(text);
  }
  return sensitive;
}

function envText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function trimTrailingSlash(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text.replace(/\/+$/, "") : undefined;
}
