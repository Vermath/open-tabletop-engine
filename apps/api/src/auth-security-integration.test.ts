import { createHash } from "node:crypto";
import { emptyState, seedState, type EngineState } from "@open-tabletop/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { BoundedPasswordVerifier } from "./auth-security.js";
import { MemoryStateStore } from "./store.js";

const managedEnvironment = [
  "NODE_ENV",
  "OTTE_TRUSTED_PROXY_HOPS",
  "OTTE_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
  "OTTE_LOGIN_RATE_LIMIT_ACCOUNT_MAX",
  "OTTE_LOGIN_RATE_LIMIT_NETWORK_MAX",
  "OTTE_LOGIN_RATE_LIMIT_PAIR_MAX",
] as const;
const originalEnvironment = Object.fromEntries(managedEnvironment.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of managedEnvironment) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("integrated browser authentication security", () => {
  it("issues an HttpOnly cookie, rejects spoofed/cross-origin mutations, and clears the session", async () => {
    process.env.NODE_ENV = "test";
    process.env.OTTE_TRUSTED_PROXY_HOPS = "0";
    const store = new MemoryStateStore(emptyState());
    const app = await buildApp({ store, rateLimit: { enabled: false } });
    try {
      const bootstrap = await app.inject({
        method: "POST",
        url: "/api/v1/auth/bootstrap",
        payload: { email: "owner@example.test", displayName: "Owner", password: "correct-password", campaignName: "Secure Table" },
      });
      expect(bootstrap.statusCode).toBe(200);
      const bootstrapCookies = String(bootstrap.headers["set-cookie"]);
      expect(bootstrapCookies).toContain("otte_session=ots_");
      expect(bootstrapCookies).toContain("HttpOnly");
      expect(bootstrapCookies).toContain("SameSite=Lax");
      expect(bootstrap.headers["x-otte-session-transport"]).toBe("cookie");
      const cookie = String(bootstrap.headers["set-cookie"]).split(";", 1)[0]!;
      const legacyUpgrade = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie",
        headers: { authorization: `Bearer ${bootstrap.json().token}` },
        payload: { expectedUserId: bootstrap.json().user.id },
      });
      expect(legacyUpgrade.statusCode).toBe(200);
      expect(String(legacyUpgrade.headers["set-cookie"])).toContain("otte_session=ots_");
      expect(legacyUpgrade.headers["x-otte-session-transport"]).toBe("cookie-pending-revocation");
      const upgradedCookie = String(legacyUpgrade.headers["set-cookie"]).match(/(?:__Host-)?otte_session=[^;,]+/)?.[0];
      expect(upgradedCookie).toBeTruthy();

      // A retry creates a sibling without invalidating the cookie already
      // delivered to another tab. Confirmation promotes one child and revokes
      // the legacy parent plus every pending sibling.
      const siblingUpgrade = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie",
        headers: { authorization: `Bearer ${bootstrap.json().token}` },
        payload: { expectedUserId: bootstrap.json().user.id },
      });
      const siblingCookie = String(siblingUpgrade.headers["set-cookie"]).match(/(?:__Host-)?otte_session=[^;,]+/)?.[0];
      expect((await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie: upgradedCookie! } })).statusCode).toBe(200);

      const ordinarySameUserCookie = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie/confirm",
        headers: { cookie, origin: "http://localhost" },
        payload: { expectedUserId: bootstrap.json().user.id },
      });
      expect(ordinarySameUserCookie.statusCode).toBe(401);
      expect(ordinarySameUserCookie.json()).toMatchObject({ message: "No pending legacy session upgrade is bound to this cookie" });

      const confirmed = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie/confirm",
        headers: { cookie: upgradedCookie!, origin: "http://localhost" },
        payload: { expectedUserId: bootstrap.json().user.id },
      });
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json()).toMatchObject({ ok: true, upgradeConfirmed: true, session: { userId: bootstrap.json().user.id } });
      expect(confirmed.headers["x-otte-session-transport"]).toBe("cookie");
      expect((await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { authorization: `Bearer ${bootstrap.json().token}` } })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie: siblingCookie! } })).statusCode).toBe(401);
      expect(store.state.sessions).toEqual([
        expect.objectContaining({ id: confirmed.json().session.id, cookieUpgradeConfirmedAt: expect.any(String) }),
      ]);

      // If the first response is lost after the atomic promotion/revocation,
      // retrying with that promoted cookie returns the same confirmation.
      const confirmationRetry = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie/confirm",
        headers: { cookie: upgradedCookie!, origin: "http://localhost" },
        payload: { expectedUserId: bootstrap.json().user.id },
      });
      expect(confirmationRetry.statusCode).toBe(200);
      expect(confirmationRetry.json()).toMatchObject({ ok: true, upgradeConfirmed: true, session: { id: confirmed.json().session.id, userId: bootstrap.json().user.id } });
      expect(confirmationRetry.headers["x-otte-session-transport"]).toBe("cookie");
      expect(store.state.sessions).toHaveLength(1);

      const session = await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie: upgradedCookie! } });
      expect(session.statusCode).toBe(200);

      const spoofedForwardedHost = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie: upgradedCookie!, origin: "https://evil.example.test", "x-forwarded-host": "evil.example.test", "x-forwarded-proto": "https" },
      });
      expect(spoofedForwardedHost.statusCode).toBe(403);
      expect(spoofedForwardedHost.json()).toMatchObject({ error: "cookie_origin_rejected", reason: "cross_origin" });

      const logout = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie: upgradedCookie!, origin: "http://localhost" },
      });
      expect(logout.statusCode).toBe(200);
      expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");
      expect((await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie: upgradedCookie! } })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("rejects an unrelated account cookie as an upgrade confirmation", async () => {
    process.env.NODE_ENV = "test";
    const app = await buildApp({ store: new MemoryStateStore(seedState()), rateLimit: { enabled: false } });
    try {
      const legacyLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { userId: "usr_demo_gm" } });
      const otherLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { userId: "usr_demo_player" } });
      const otherCookie = String(otherLogin.headers["set-cookie"]).match(/(?:__Host-)?otte_session=[^;,]+/)?.[0];
      const upgraded = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie",
        headers: { authorization: `Bearer ${legacyLogin.json().token}` },
        payload: { expectedUserId: legacyLogin.json().user.id },
      });
      expect(upgraded.statusCode).toBe(200);
      const mixedConfirmation = await app.inject({
        method: "POST",
        url: "/api/v1/auth/session/upgrade-cookie/confirm",
        headers: { cookie: otherCookie!, origin: "http://localhost" },
        payload: { expectedUserId: legacyLogin.json().user.id },
      });
      expect(mixedConfirmation.statusCode).toBe(401);
      expect(mixedConfirmation.json()).toMatchObject({ message: "Upgraded session does not match the expected user" });
      expect((await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { authorization: `Bearer ${legacyLogin.json().token}` } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("throttles distributed account attacks and proxy-resolved network abuse before password work", async () => {
    process.env.NODE_ENV = "test";
    process.env.OTTE_TRUSTED_PROXY_HOPS = "1";
    process.env.OTTE_LOGIN_RATE_LIMIT_WINDOW_SECONDS = "60";
    process.env.OTTE_LOGIN_RATE_LIMIT_ACCOUNT_MAX = "2";
    process.env.OTTE_LOGIN_RATE_LIMIT_NETWORK_MAX = "100";
    process.env.OTTE_LOGIN_RATE_LIMIT_PAIR_MAX = "100";
    const app = await buildApp({ store: new MemoryStateStore(emptyState()), rateLimit: { enabled: false } });
    try {
      await app.inject({ method: "POST", url: "/api/v1/auth/bootstrap", payload: { email: "owner@example.test", displayName: "Owner", password: "correct-password", campaignName: "Secure Table" } });
      for (const address of ["203.0.113.10", "203.0.113.11"]) {
        const failed = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-forwarded-for": address }, payload: { email: "owner@example.test", password: "wrong-password" } });
        expect(failed.statusCode).toBe(401);
      }
      const limited = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { "x-forwarded-for": "203.0.113.12" }, payload: { email: "owner@example.test", password: "wrong-password" } });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBeTruthy();
      expect(limited.json()).toMatchObject({ error: "login_rate_limited", limitedBy: ["account"] });
    } finally {
      await app.close();
    }
  });

  it("throttles malformed login floods before validation audits or password work", async () => {
    process.env.NODE_ENV = "test";
    process.env.OTTE_TRUSTED_PROXY_HOPS = "0";
    process.env.OTTE_LOGIN_RATE_LIMIT_WINDOW_SECONDS = "60";
    process.env.OTTE_LOGIN_RATE_LIMIT_ACCOUNT_MAX = "100";
    process.env.OTTE_LOGIN_RATE_LIMIT_NETWORK_MAX = "2";
    process.env.OTTE_LOGIN_RATE_LIMIT_PAIR_MAX = "100";
    const verify = vi.fn(async () => ({ status: "mismatch" as const, ok: false }));
    const store = new CountingDurableTestStore(emptyState());
    const app = await buildApp({
      store,
      rateLimit: { enabled: false },
      passwordVerifier: new BoundedPasswordVerifier({ verify }),
    });
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const invalid = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: 123, password: ["invalid"] } });
        expect(invalid.statusCode).toBe(400);
      }
      const limited = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: 123, password: ["invalid"] } });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ error: "login_rate_limited", limitedBy: ["network"] });
      expect(verify).not.toHaveBeenCalled();
      store.saves = 0;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: 123 } })).statusCode).toBe(429);
      }
      expect(store.saves).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("does not hold the durable mutation coordinator while bounded password hashing runs", async () => {
    process.env.NODE_ENV = "test";
    let releaseHash!: () => void;
    let markHashStarted!: () => void;
    const hashStarted = new Promise<void>((resolve) => { markHashStarted = resolve; });
    const passwordVerifier = new BoundedPasswordVerifier({
      hash: () => new Promise<string>((resolve) => {
        releaseHash = () => resolve("scrypt:test-salt:test-hash");
        markHashStarted();
      }),
    });
    const app = await buildApp({ store: new DurableTestStore(emptyState()), rateLimit: { enabled: false }, passwordVerifier });
    try {
      const bootstrap = app.inject({ method: "POST", url: "/api/v1/auth/bootstrap", payload: { email: "owner@example.test", displayName: "Owner", password: "correct-password", campaignName: "Secure Table" } });
      await hashStarted;
      const invalidLogin = await Promise.race([
        app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: 123 } }),
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("unrelated mutation was blocked by password hashing")), 500)),
      ]);
      expect(invalidLogin.statusCode).toBe(400);
      releaseHash();
      expect((await bootstrap).statusCode).toBe(200);
    } finally {
      releaseHash?.();
      await app.close();
    }
  });

  it("rolls a failed phased bootstrap back byte-for-byte and allows a clean retry", async () => {
    process.env.NODE_ENV = "test";
    const store = new FailOnceDurableAuthStore(emptyState());
    const before = JSON.stringify(store.state);
    const app = await buildApp({ store, rateLimit: { enabled: false } });
    try {
      const failed = await app.inject({
        method: "POST",
        url: "/api/v1/auth/bootstrap",
        payload: { email: "owner@example.test", displayName: "Owner", password: "correct-password", campaignName: "Secure Table" },
      });

      expect(failed.statusCode).toBe(500);
      expect(JSON.stringify(store.state)).toBe(before);
      expect(JSON.stringify(store.persisted)).toBe(before);

      const retry = await app.inject({
        method: "POST",
        url: "/api/v1/auth/bootstrap",
        payload: { email: "owner@example.test", displayName: "Owner", password: "correct-password", campaignName: "Secure Table" },
      });

      expect(retry.statusCode).toBe(200);
      expect(store.state.users).toHaveLength(1);
      expect(store.state.sessions).toHaveLength(1);
      expect(store.state.organizations).toHaveLength(1);
      expect(store.state.organizationMembers).toHaveLength(1);
      expect(store.state.campaigns).toHaveLength(1);
      expect(store.state.members).toHaveLength(1);
      expect(store.state.scenes).toHaveLength(1);
      expect(store.persisted).toEqual(store.state);
    } finally {
      await app.close();
    }
  });

  it("rejects bogus reset tokens before the shared password queue without starving valid login", async () => {
    process.env.NODE_ENV = "test";
    const state = seedState();
    const user = state.users.find((candidate) => candidate.id === "usr_demo_gm")!;
    user.passwordHash = "scrypt:test-salt:test-hash";
    const validResetToken = `opr_${"A".repeat(43)}`;
    const now = new Date().toISOString();
    state.passwordResetTokens.push({
      id: "reset_queue_valid",
      userId: user.id,
      email: user.email ?? "gm@example.test",
      tokenHash: `sha256:${createHash("sha256").update(validResetToken).digest("hex")}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    let allowHash = false;
    let releaseUnexpectedHash: (() => void) | undefined;
    const hash = vi.fn((password: string) => {
      if (allowHash) return Promise.resolve(`scrypt:replacement:${Buffer.from(password).toString("base64url")}`);
      return new Promise<string>((resolve) => {
        releaseUnexpectedHash = () => resolve("scrypt:unexpected:hash");
      });
    });
    const verify = vi.fn(async () => ({ status: "match" as const, ok: true }));
    const passwordVerifier = new BoundedPasswordVerifier({ maxConcurrent: 1, maxQueue: 0, hash, verify });
    const app = await buildApp({ store: new MemoryStateStore(state), rateLimit: { enabled: false }, passwordVerifier });
    try {
      const bogusResponsesPromise = Promise.all(
        Array.from({ length: 8 }, (_, index) => app.inject({
          method: "POST",
          url: "/api/v1/auth/password-reset/confirm",
          payload: { token: `opr_${index.toString(36).padStart(43, "0")}`, password: "replacement-password" },
        })),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: user.id, password: "correct-password" },
      });
      releaseUnexpectedHash?.();
      const bogusResponses = await bogusResponsesPromise;

      expect(bogusResponses.every((response) => response.statusCode === 401)).toBe(true);
      expect(bogusResponses.every((response) => response.json().message === "Unknown or expired password reset token")).toBe(true);
      expect(hash).not.toHaveBeenCalled();
      expect(login.statusCode).toBe(200);
      expect(verify).toHaveBeenCalledTimes(1);

      allowHash = true;
      const confirmed = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/confirm",
        payload: { token: validResetToken, password: "replacement-password" },
      });
      expect(confirmed.statusCode).toBe(200);
      expect(hash).toHaveBeenCalledTimes(1);
    } finally {
      releaseUnexpectedHash?.();
      await app.close();
    }
  });

  it("keeps pre-coordinator rate-limit identity lookup free of session writes", async () => {
    process.env.NODE_ENV = "test";
    const store = new CountingDurableTestStore(emptyState());
    const app = await buildApp({ store, rateLimit: { enabled: true, maxRequests: 100, windowMs: 60_000 } });
    try {
      const bootstrap = await app.inject({ method: "POST", url: "/api/v1/auth/bootstrap", payload: { email: "owner@example.test", displayName: "Owner", password: "correct-password", campaignName: "Secure Table" } });
      const cookie = String(bootstrap.headers["set-cookie"]).match(/(?:__Host-)?otte_session=[^;,]+/)?.[0];
      const staleLastSeenAt = "2020-01-01T00:00:00.000Z";
      store.state.sessions[0]!.lastSeenAt = staleLastSeenAt;
      store.saves = 0;

      const health = await app.inject({ method: "GET", url: "/api/v1/health", headers: { cookie: cookie! } });

      expect(health.statusCode).toBe(200);
      expect(store.saves).toBe(0);
      expect(store.state.sessions[0]!.lastSeenAt).toBe(staleLastSeenAt);
    } finally {
      await app.close();
    }
  });
});

class DurableTestStore extends MemoryStateStore {}
class CountingDurableTestStore extends MemoryStateStore {
  saves = 0;
  override save(): void { this.saves += 1; }
}

class FailOnceDurableAuthStore extends MemoryStateStore {
  private failNextFlush = true;
  private pending = false;
  persisted: EngineState;

  constructor(state: EngineState) {
    super(state);
    this.persisted = structuredClone(this.state);
  }

  override save(): void { this.pending = true; }

  override flush(): void {
    if (!this.pending) return;
    if (this.failNextFlush) {
      this.failNextFlush = false;
      throw new Error("simulated auth durable write failure");
    }
    this.persisted = structuredClone(this.state);
    this.pending = false;
  }
}
