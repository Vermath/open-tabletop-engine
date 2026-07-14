import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createTimestamped, type AuthIdentity, type User } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

interface OidcTestClaims {
  sub: string;
  email?: string;
  emailVerified?: unknown;
  name?: string;
}

const oidcEnvKeys = [
  "OTTE_OIDC_ISSUER",
  "OTTE_OIDC_CLIENT_ID",
  "OTTE_OIDC_CLIENT_SECRET",
  "OTTE_OIDC_REDIRECT_URI",
  "OTTE_OIDC_SCOPE",
  "OTTE_OIDC_DISPLAY_NAME",
  "OTTE_OIDC_TOKEN_AUTH",
  "OTTE_OIDC_ALLOW_INSECURE"
] as const;

describe.sequential("OIDC verified-email account linking", () => {
  it("links a new OIDC identity to an existing normalized-email user only when email_verified is true", async () => {
    const harness = await createOidcHarness({
      sub: "verified-link-subject",
      email: "verified.link@example.test",
      emailVerified: true,
      name: "Verified Link"
    });
    try {
      const existingUser = createTimestamped("usr", {
        displayName: "Existing Password User",
        email: "Verified.Link@Example.Test"
      }) satisfies User;
      harness.store.state.users.push(existingUser);
      const userCount = harness.store.state.users.length;

      const callback = await harness.login();

      expect(callback.statusCode).toBe(200);
      expect(callback.json().user).toEqual(expect.objectContaining({ id: existingUser.id }));
      expect(harness.store.state.users).toHaveLength(userCount);
      expect(harness.store.state.identities).toContainEqual(
        expect.objectContaining({
          provider: "oidc",
          issuer: harness.issuer,
          subject: "verified-link-subject",
          userId: existingUser.id,
          email: "verified.link@example.test"
        })
      );
      const linkAudit = harness.store.state.auditLogs.find((log) => log.action === "auth.oidc.identity.link" && log.targetId === existingUser.id);
      expect(linkAudit?.after).toEqual(expect.objectContaining({ linkMode: "verified_email", verifiedEmailAccepted: true }));
      expect(JSON.stringify(linkAudit)).not.toContain("verified.link@example.test");
    } finally {
      await harness.close();
    }
  });

  it.each([
    ["false", false],
    ["missing", undefined],
    ["non-boolean", "true"]
  ])("does not link an existing email when email_verified is %s", async (_label, emailVerified) => {
    const harness = await createOidcHarness({
      sub: `unverified-${String(_label)}-subject`,
      email: "claimed.address@example.test",
      emailVerified,
      name: "Independent OIDC User"
    });
    try {
      const existingUser = createTimestamped("usr", {
        displayName: "Existing Password User",
        email: "claimed.address@example.test"
      }) satisfies User;
      harness.store.state.users.push(existingUser);

      const callback = await harness.login();

      expect(callback.statusCode).toBe(200);
      const oidcUserId = callback.json().user.id as string;
      expect(oidcUserId).not.toBe(existingUser.id);
      expect(harness.store.state.users.find((user) => user.id === oidcUserId)?.email).toBeUndefined();
      expect(harness.store.state.identities).toContainEqual(
        expect.objectContaining({
          provider: "oidc",
          issuer: harness.issuer,
          subject: `unverified-${String(_label)}-subject`,
          userId: oidcUserId,
          email: undefined
        })
      );
      expect(harness.store.state.identities.some((identity) => identity.userId === existingUser.id)).toBe(false);
      const linkAudit = harness.store.state.auditLogs.find((log) => log.action === "auth.oidc.identity.link" && log.targetId === oidcUserId);
      expect(linkAudit?.after).toEqual(expect.objectContaining({ linkMode: "isolated_oidc_user", verifiedEmailAccepted: false }));
      expect(JSON.stringify(linkAudit)).not.toContain("claimed.address@example.test");
    } finally {
      await harness.close();
    }
  });

  it("continues to authenticate an explicitly linked issuer and subject when a later email claim is unverified", async () => {
    const harness = await createOidcHarness({
      sub: "returning-subject",
      email: "untrusted-change@example.test",
      emailVerified: false,
      name: "Returning User"
    });
    try {
      const existingUser = createTimestamped("usr", {
        displayName: "Returning User",
        email: "original@example.test"
      }) satisfies User;
      const existingIdentity = createTimestamped("ident", {
        userId: existingUser.id,
        provider: "oidc" as const,
        issuer: harness.issuer,
        subject: "returning-subject",
        email: "original@example.test"
      }) satisfies AuthIdentity;
      harness.store.state.users.push(existingUser);
      harness.store.state.identities.push(existingIdentity);

      const callback = await harness.login();

      expect(callback.statusCode).toBe(200);
      expect(callback.json().user).toEqual(expect.objectContaining({ id: existingUser.id, email: "original@example.test" }));
      expect(existingUser.email).toBe("original@example.test");
      expect(existingIdentity.email).toBe("original@example.test");
      expect(harness.store.state.identities).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

  it("keeps issuer and subject identity precedence without overwriting a primary email owned by another user", async () => {
    const harness = await createOidcHarness({
      sub: "stable-subject",
      email: "other.owner@example.test",
      emailVerified: true,
      name: "Stable Subject"
    });
    try {
      const linkedUser = createTimestamped("usr", {
        displayName: "Stable Subject",
        email: "stable.subject@example.test"
      }) satisfies User;
      const emailOwner = createTimestamped("usr", {
        displayName: "Other Owner",
        email: "other.owner@example.test"
      }) satisfies User;
      const identity = createTimestamped("ident", {
        userId: linkedUser.id,
        provider: "oidc" as const,
        issuer: harness.issuer,
        subject: "stable-subject",
        email: linkedUser.email
      }) satisfies AuthIdentity;
      harness.store.state.users.push(linkedUser, emailOwner);
      harness.store.state.identities.push(identity);

      const callback = await harness.login();

      expect(callback.statusCode).toBe(200);
      expect(callback.json().user).toEqual(expect.objectContaining({ id: linkedUser.id }));
      expect(identity.userId).toBe(linkedUser.id);
      expect(identity.email).toBe("stable.subject@example.test");
      expect(linkedUser.email).toBe("stable.subject@example.test");
      expect(emailOwner.email).toBe("other.owner@example.test");
      expect(harness.store.state.identities).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });
});

async function createOidcHarness(initialClaims: OidcTestClaims) {
  const claims = initialClaims;
  let issuer = "";
  const provider = createServer((request, response) => {
    if (request.url === "/.well-known/openid-configuration") {
      sendJson(response, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`
      });
      return;
    }
    if (request.url === "/token" && request.method === "POST") {
      sendJson(response, { access_token: "test-access-token", token_type: "Bearer" });
      return;
    }
    if (request.url === "/userinfo") {
      sendJson(response, {
        sub: claims.sub,
        ...(claims.email === undefined ? {} : { email: claims.email }),
        ...(claims.emailVerified === undefined ? {} : { email_verified: claims.emailVerified }),
        ...(claims.name === undefined ? {} : { name: claims.name })
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address() as AddressInfo;
  issuer = `http://127.0.0.1:${address.port}`;

  const previousEnv = Object.fromEntries(oidcEnvKeys.map((key) => [key, process.env[key]])) as Record<string, string | undefined>;
  process.env.OTTE_OIDC_ISSUER = issuer;
  process.env.OTTE_OIDC_CLIENT_ID = "test-client";
  delete process.env.OTTE_OIDC_CLIENT_SECRET;
  process.env.OTTE_OIDC_REDIRECT_URI = "http://127.0.0.1:4000/api/v1/auth/oidc/callback";
  process.env.OTTE_OIDC_TOKEN_AUTH = "none";
  process.env.OTTE_OIDC_ALLOW_INSECURE = "true";

  const store = new MemoryStateStore();
  const app = await buildApp({ store });
  return {
    app,
    store,
    issuer,
    async login() {
      const started = await app.inject({
        method: "POST",
        url: "/api/v1/auth/oidc/start",
        payload: {}
      });
      if (started.statusCode !== 200) throw new Error(`OIDC start failed with ${started.statusCode}: ${started.body}`);
      const state = new URL(started.json().authorizationUrl as string).searchParams.get("state");
      if (!state) throw new Error("OIDC start response did not include state");
      return app.inject({
        method: "GET",
        url: `/api/v1/auth/oidc/callback?code=test-code&state=${encodeURIComponent(state)}`
      });
    },
    async close() {
      await app.close();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      for (const key of oidcEnvKeys) {
        const value = previousEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
