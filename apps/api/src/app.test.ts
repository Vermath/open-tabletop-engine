import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import { createTimestamped, emptyState, isPointInsideVisionPolygons, type AssetStorageRef, type EngineState, type MapAsset, type VisionSnapshot } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { assetStorageKey, type AssetStorage } from "./asset-storage.js";
import { buildApp } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

class MemoryAssetStorage implements AssetStorage {
  readonly provider = "s3" as const;
  readonly objects = new Map<string, Buffer>();

  constructor(private readonly bucket = "test-assets") {}

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const key = asset.storage?.provider === "s3" ? asset.storage.key : assetStorageKey(asset);
    this.objects.set(key, Buffer.from(body));
    return { provider: "s3", bucket: this.bucket, key };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    const key = asset.storage?.provider === "s3" ? asset.storage.key : assetStorageKey(asset);
    const body = this.objects.get(key);
    return body ? Buffer.from(body) : undefined;
  }

  async delete(asset: MapAsset): Promise<boolean> {
    const key = asset.storage?.provider === "s3" ? asset.storage.key : assetStorageKey(asset);
    return this.objects.delete(key);
  }
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const testBase32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function testTotpCode(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 30_000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBytes.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac("sha1", testBase32Decode(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function testBase32Decode(input: string): Buffer {
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const char of input.toUpperCase().replace(/[=\s-]/g, "")) {
    const index = testBase32Alphabet.indexOf(char);
    if (index < 0) throw new Error(`Invalid test base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

describe("api", () => {
  it("serves campaigns, rolls dice, and exports campaign data", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });

    const campaigns = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns",
      headers: authHeaders
    });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json()).toHaveLength(1);

    const roll = await app.inject({
      method: "POST",
      url: "/api/v1/dice/roll",
      headers: authHeaders,
      payload: {
        campaignId: "camp_demo",
        formula: "1d20+5",
        visibility: "public"
      }
    });
    expect(roll.statusCode).toBe(200);
    expect(roll.json().total).toBeGreaterThanOrEqual(6);

    const exported = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/export",
      headers: authHeaders
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().format).toBe("ottx");

    await app.close();
  });

  it("supports a seeded player session without GM permissions", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });
    const playerHeaders = { "x-user-id": "usr_demo_player" };

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: playerHeaders
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.displayName).toBe("Demo Player");
    expect(session.json().memberships[0]).toEqual(expect.objectContaining({ campaignId: "camp_demo", role: "player" }));

    const campaigns = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns",
      headers: playerHeaders
    });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().map((campaign: { id: string }) => campaign.id)).toEqual(["camp_demo"]);

    const members = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/members",
      headers: playerHeaders
    });
    expect(members.statusCode).toBe(200);
    expect(members.json()).toHaveLength(2);
    const playerMember = members.json().find((member: { user: { id: string } }) => member.user.id === "usr_demo_player");
    expect(playerMember.permissions).toContain("token.move");
    expect(playerMember.permissions).not.toContain("scene.update");

    const movedToken = await app.inject({
      method: "PATCH",
      url: "/api/v1/tokens/tok_valen",
      headers: playerHeaders,
      payload: { x: 460, y: 390 }
    });
    expect(movedToken.statusCode).toBe(200);
    expect(movedToken.json()).toEqual(expect.objectContaining({ x: 460, y: 390 }));

    const updatedActor = await app.inject({
      method: "PATCH",
      url: "/api/v1/actors/act_valen",
      headers: playerHeaders,
      payload: { data: { hp: { current: 17, max: 22 } } }
    });
    expect(updatedActor.statusCode).toBe(200);
    expect(updatedActor.json().data.hp.current).toBe(17);

    const blockedWall = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/walls",
      headers: playerHeaders,
      payload: { x1: 100, y1: 100, x2: 500, y2: 100 }
    });
    expect(blockedWall.statusCode).toBe(403);

    const secretJournal = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/journal",
      headers: playerHeaders
    });
    expect(secretJournal.statusCode).toBe(200);
    expect(secretJournal.json()).toEqual([]);

    await app.close();
  });

  it("issues durable bearer sessions and supports logout", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-session-"));
    const dbPath = join(directory, "state.sqlite");

    const firstStore = new SqliteStateStore(dbPath);
    const firstApp = await buildApp({ store: firstStore });
    const login = await firstApp.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { userId: "usr_demo_player" }
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().token).toMatch(/^ots_/);
    expect(login.json().session.userId).toBe("usr_demo_player");

    const token = login.json().token as string;
    const bearerHeaders = { authorization: `Bearer ${token}` };
    const campaigns = await firstApp.inject({
      method: "GET",
      url: "/api/v1/campaigns",
      headers: bearerHeaders
    });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().map((campaign: { id: string }) => campaign.id)).toEqual(["camp_demo"]);
    await firstApp.close();
    firstStore.close();

    const secondStore = new SqliteStateStore(dbPath);
    const secondApp = await buildApp({ store: secondStore });
    const restoredSession = await secondApp.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: bearerHeaders
    });
    expect(restoredSession.statusCode).toBe(200);
    expect(restoredSession.json().user.id).toBe("usr_demo_player");

    const logout = await secondApp.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: bearerHeaders
    });
    expect(logout.statusCode).toBe(200);

    const afterLogout = await secondApp.inject({
      method: "GET",
      url: "/api/v1/campaigns",
      headers: bearerHeaders
    });
    expect(afterLogout.statusCode).toBe(401);

    await secondApp.close();
    secondStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("registers password users and requires valid credentials", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "New.User@Example.Test",
        displayName: "New User",
        password: "correct horse"
      }
    });
    expect(registered.statusCode).toBe(200);
    expect(registered.json().token).toMatch(/^ots_/);
    expect(registered.json().user).toMatchObject({
      displayName: "New User",
      email: "new.user@example.test"
    });
    expect(registered.json().user).not.toHaveProperty("passwordHash");
    expect(store.state.users.find((user) => user.email === "new.user@example.test")?.passwordHash).toMatch(/^scrypt:/);

    const badLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "new.user@example.test",
        password: "wrong password"
      }
    });
    expect(badLogin.statusCode).toBe(401);

    const goodLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "NEW.USER@example.test",
        password: "correct horse"
      }
    });
    expect(goodLogin.statusCode).toBe(200);
    expect(goodLogin.json().user.email).toBe("new.user@example.test");
    expect(goodLogin.json().user).not.toHaveProperty("passwordHash");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "new.user@example.test",
        displayName: "Duplicate",
        password: "correct horse"
      }
    });
    expect(duplicate.statusCode).toBe(409);

    await app.close();
  });

  it("requests and confirms password resets through the email delivery outbox", async () => {
    let deliveredEmail: { text?: string; metadata?: { resetId?: string } } | undefined;
    let webhookAuthorization: string | undefined;
    const webhook = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      webhookAuthorization = request.headers.authorization;
      deliveredEmail = JSON.parse(await readRequestBody(request));
      sendJson(response, { ok: true });
    });
    await new Promise<void>((resolve) => webhook.listen(0, "127.0.0.1", resolve));
    const address = webhook.address() as AddressInfo;
    const previousEnv = snapshotEnv(["OTTE_EMAIL_WEBHOOK_URL", "OTTE_EMAIL_WEBHOOK_TOKEN", "OTTE_PASSWORD_RESET_URL", "OTTE_PASSWORD_RESET_TTL_MINUTES"]);
    process.env.OTTE_EMAIL_WEBHOOK_URL = `http://127.0.0.1:${address.port}/email`;
    process.env.OTTE_EMAIL_WEBHOOK_TOKEN = "email-secret";
    process.env.OTTE_PASSWORD_RESET_URL = "http://127.0.0.1:5186/reset-password";

    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const unknown = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: { email: "missing@example.test" }
      });
      expect(unknown.statusCode).toBe(200);
      expect(unknown.json()).toEqual({ ok: true });
      expect(store.state.passwordResetTokens).toHaveLength(0);
      expect(store.state.emailOutbox).toHaveLength(0);

      const requested = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/request",
        payload: { email: "GM@Example.Test" }
      });
      expect(requested.statusCode).toBe(200);
      expect(store.state.passwordResetTokens).toHaveLength(1);
      expect(store.state.passwordResetTokens[0]!.tokenHash).toMatch(/^sha256:/);
      expect(store.state.emailOutbox).toHaveLength(1);
      expect(store.state.emailOutbox[0]).toMatchObject({ to: "gm@example.test", status: "delivered", provider: "webhook" });
      expect(webhookAuthorization).toBe("Bearer email-secret");
      expect(deliveredEmail?.metadata?.resetId).toBe(store.state.passwordResetTokens[0]!.id);
      const token = deliveredEmail?.text?.match(/token=(opr_[A-Za-z0-9_-]+)/)?.[1];
      expect(token).toMatch(/^opr_/);

      const confirmed = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/confirm",
        payload: { token, password: "new gm password" }
      });
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json().token).toMatch(/^ots_/);
      expect(confirmed.json().user).not.toHaveProperty("passwordHash");
      expect(store.state.passwordResetTokens[0]!.usedAt).toBeTruthy();
      expect(store.state.users.find((user) => user.id === "usr_demo_gm")?.passwordHash).toMatch(/^scrypt:/);

      const reused = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password-reset/confirm",
        payload: { token, password: "new gm password" }
      });
      expect(reused.statusCode).toBe(401);

      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "gm@example.test", password: "new gm password" }
      });
      expect(login.statusCode).toBe(200);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
      await new Promise<void>((resolve) => webhook.close(() => resolve()));
    }
  });

  it("changes passwords and lets users revoke their own sessions", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });
    try {
      const registered = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "session.owner@example.test",
          displayName: "Session Owner",
          password: "original password"
        }
      });
      expect(registered.statusCode).toBe(200);

      const secondLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "session.owner@example.test",
          password: "original password"
        }
      });
      expect(secondLogin.statusCode).toBe(200);

      const badChange = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password/change",
        headers: { authorization: `Bearer ${registered.json().token}` },
        payload: { currentPassword: "wrong password", newPassword: "updated password" }
      });
      expect(badChange.statusCode).toBe(401);

      const changed = await app.inject({
        method: "POST",
        url: "/api/v1/auth/password/change",
        headers: { authorization: `Bearer ${registered.json().token}` },
        payload: { currentPassword: "original password", newPassword: "updated password" }
      });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().token).toMatch(/^ots_/);
      expect(changed.json().user).not.toHaveProperty("passwordHash");

      const staleSession = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: { authorization: `Bearer ${secondLogin.json().token}` }
      });
      expect(staleSession.statusCode).toBe(401);

      const sessions = await app.inject({
        method: "GET",
        url: "/api/v1/auth/sessions",
        headers: { authorization: `Bearer ${changed.json().token}` }
      });
      expect(sessions.statusCode).toBe(200);
      expect(sessions.json().map((session: { id: string }) => session.id)).toEqual([changed.json().session.id]);

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/v1/auth/sessions/${changed.json().session.id}`,
        headers: { authorization: `Bearer ${changed.json().token}` }
      });
      expect(deleted.statusCode).toBe(200);

      const afterDelete = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: { authorization: `Bearer ${changed.json().token}` }
      });
      expect(afterDelete.statusCode).toBe(401);

      const relogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "session.owner@example.test",
          password: "updated password"
        }
      });
      expect(relogin.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("enrolls TOTP MFA and requires a code or recovery code at login", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const registered = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "mfa.owner@example.test",
          displayName: "MFA Owner",
          password: "original password"
        }
      });
      expect(registered.statusCode).toBe(200);
      const headers = { authorization: `Bearer ${registered.json().token}` };

      const initialStatus = await app.inject({
        method: "GET",
        url: "/api/v1/auth/mfa",
        headers
      });
      expect(initialStatus.statusCode).toBe(200);
      expect(initialStatus.json()).toMatchObject({ totpEnabled: false, totpPending: false, recoveryCodeCount: 0 });

      const rejectedEnroll = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/totp/enroll",
        headers,
        payload: { currentPassword: "wrong password" }
      });
      expect(rejectedEnroll.statusCode).toBe(401);

      const enrolled = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/totp/enroll",
        headers,
        payload: { currentPassword: "original password" }
      });
      expect(enrolled.statusCode).toBe(200);
      expect(enrolled.json().secret).toMatch(/^[A-Z2-7]+$/);
      expect(enrolled.json().otpauthUrl).toContain("otpauth://totp/");
      expect(enrolled.json().mfa).toMatchObject({ totpEnabled: false, totpPending: true });

      const secret = enrolled.json().secret as string;
      const badConfirm = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/totp/confirm",
        headers,
        payload: { code: "abcdef" }
      });
      expect(badConfirm.statusCode).toBe(401);

      const confirmed = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/totp/confirm",
        headers,
        payload: { code: testTotpCode(secret) }
      });
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json().recoveryCodes).toHaveLength(8);
      expect(confirmed.json().user).not.toHaveProperty("passwordHash");
      expect(confirmed.json().user.mfa).toMatchObject({ totpEnabled: true, totpPending: false, recoveryCodeCount: 8 });
      expect(JSON.stringify(confirmed.json().user)).not.toContain(secret);
      expect(store.state.users.find((user) => user.email === "mfa.owner@example.test")?.mfa?.recoveryCodeHashes?.[0]).toMatch(/^sha256:/);

      const missingMfa = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "mfa.owner@example.test", password: "original password" }
      });
      expect(missingMfa.statusCode).toBe(401);
      expect(missingMfa.json()).toMatchObject({ error: "mfa_required", mfaRequired: true });

      const wrongMfa = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "mfa.owner@example.test", password: "original password", mfaCode: "abcdef" }
      });
      expect(wrongMfa.statusCode).toBe(401);

      const mfaLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "mfa.owner@example.test", password: "original password", mfaCode: testTotpCode(secret) }
      });
      expect(mfaLogin.statusCode).toBe(200);
      expect(mfaLogin.json().token).toMatch(/^ots_/);
      expect(mfaLogin.json().user.mfa).toMatchObject({ totpEnabled: true });

      const recoveryCode = confirmed.json().recoveryCodes[0] as string;
      const recoveryLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "mfa.owner@example.test", password: "original password", recoveryCode }
      });
      expect(recoveryLogin.statusCode).toBe(200);
      expect(recoveryLogin.json().user.mfa.recoveryCodeCount).toBe(7);

      const reusedRecovery = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "mfa.owner@example.test", password: "original password", recoveryCode }
      });
      expect(reusedRecovery.statusCode).toBe(401);

      const disabled = await app.inject({
        method: "DELETE",
        url: "/api/v1/auth/mfa/totp",
        headers: { authorization: `Bearer ${mfaLogin.json().token}` },
        payload: { currentPassword: "original password", mfaCode: testTotpCode(secret) }
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().mfa).toMatchObject({ totpEnabled: false, totpPending: false, recoveryCodeCount: 0 });
      expect(store.state.users.find((user) => user.email === "mfa.owner@example.test")?.mfa).toBeUndefined();

      const postDisableLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "mfa.owner@example.test", password: "original password" }
      });
      expect(postDisableLogin.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("provisions users and groups through token-protected SCIM", async () => {
    const previousEnv = snapshotEnv(["OTTE_SCIM_BEARER_TOKEN"]);
    process.env.OTTE_SCIM_BEARER_TOKEN = "scim-secret";
    const directory = mkdtempSync(join(tmpdir(), "otte-scim-"));
    const dbPath = join(directory, "state.sqlite");
    const store = new SqliteStateStore(dbPath);
    const app = await buildApp({ store });
    const scimHeaders = { authorization: "Bearer scim-secret" };
    try {
      const unauthorizedUsers = await app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users"
      });
      expect(unauthorizedUsers.statusCode).toBe(401);

      const serviceProviderConfig = await app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/ServiceProviderConfig",
        headers: scimHeaders
      });
      expect(serviceProviderConfig.statusCode).toBe(200);
      expect(serviceProviderConfig.json()).toMatchObject({
        patch: { supported: true },
        filter: { supported: true }
      });

      const createdUser = await app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: scimHeaders,
        payload: {
          userName: "scim.user@example.test",
          externalId: "idp-user-123",
          name: { formatted: "SCIM User" },
          emails: [{ value: "SCIM.User@Example.Test", primary: true }],
          active: true
        }
      });
      expect(createdUser.statusCode).toBe(201);
      expect(createdUser.json()).toMatchObject({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: "scim.user@example.test",
        displayName: "SCIM User",
        active: true,
        emails: [{ value: "scim.user@example.test", primary: true, type: "work" }]
      });
      expect(JSON.stringify(createdUser.json())).not.toContain("passwordHash");
      const userId = createdUser.json().id as string;
      const storedUser = store.state.users.find((user) => user.id === userId);
      expect(storedUser).toMatchObject({
        email: "scim.user@example.test",
        passwordResetRequired: true,
        scim: { userName: "scim.user@example.test", externalId: "idp-user-123" }
      });

      const passwordlessLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "scim.user@example.test" }
      });
      expect(passwordlessLogin.statusCode).toBe(403);

      const filteredUsers = await app.inject({
        method: "GET",
        url: "/api/v1/scim/v2/Users?filter=userName%20eq%20%22scim.user%40example.test%22",
        headers: scimHeaders
      });
      expect(filteredUsers.statusCode).toBe(200);
      expect(filteredUsers.json()).toMatchObject({ totalResults: 1, itemsPerPage: 1 });

      const deactivatedUser = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Users/${userId}`,
        headers: scimHeaders,
        payload: { Operations: [{ op: "replace", path: "active", value: false }] }
      });
      expect(deactivatedUser.statusCode).toBe(200);
      expect(deactivatedUser.json()).toMatchObject({ id: userId, active: false });
      expect(store.state.users.find((user) => user.id === userId)?.disabledReason).toBe("SCIM inactive");

      const createdGroup = await app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: scimHeaders,
        payload: {
          displayName: "Playtesters",
          externalId: "idp-group-123",
          members: [{ value: userId }]
        }
      });
      expect(createdGroup.statusCode).toBe(201);
      expect(createdGroup.json()).toMatchObject({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
        displayName: "Playtesters",
        members: [{ value: userId }]
      });
      const groupId = createdGroup.json().id as string;

      const duplicateGroup = await app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: scimHeaders,
        payload: { displayName: "Playtesters" }
      });
      expect(duplicateGroup.statusCode).toBe(409);

      const patchedGroup = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${groupId}`,
        headers: scimHeaders,
        payload: { Operations: [{ op: "replace", path: "members", value: [] }] }
      });
      expect(patchedGroup.statusCode).toBe(200);
      expect(patchedGroup.json().members).toEqual([]);

      const restoredStore = new SqliteStateStore(dbPath);
      expect(restoredStore.state.scimGroups.find((group) => group.id === groupId)).toMatchObject({
        displayName: "Playtesters",
        externalId: "idp-group-123",
        memberUserIds: []
      });
      restoredStore.close();

      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["scim.user.create", "scim.user.patch", "scim.group.create", "scim.group.patch"]));
      expect(store.state.auditLogs.filter((log) => log.action.startsWith("scim.")).every((log) => log.actorType === "system")).toBe(true);
    } finally {
      await app.close();
      store.close();
      restoreEnv(previousEnv);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("maps SCIM groups into campaign memberships", async () => {
    const previousEnv = snapshotEnv(["OTTE_SCIM_BEARER_TOKEN", "OTTE_ADMIN_USER_IDS"]);
    process.env.OTTE_SCIM_BEARER_TOKEN = "scim-secret";
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const scimHeaders = { authorization: "Bearer scim-secret" };
    try {
      const adminLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_gm" }
      });
      expect(adminLogin.statusCode).toBe(200);
      const adminHeaders = { authorization: `Bearer ${adminLogin.json().token}` };

      const createdUser = await app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Users",
        headers: scimHeaders,
        payload: {
          userName: "scim.role.member@example.test",
          externalId: "role-user-1",
          displayName: "SCIM Role Member",
          emails: [{ value: "scim.role.member@example.test", primary: true }],
          active: true
        }
      });
      expect(createdUser.statusCode).toBe(201);
      const userId = createdUser.json().id as string;

      const createdGroup = await app.inject({
        method: "POST",
        url: "/api/v1/scim/v2/Groups",
        headers: scimHeaders,
        payload: {
          displayName: "Observer Group",
          externalId: "role-group-1",
          members: [{ value: userId }]
        }
      });
      expect(createdGroup.statusCode).toBe(201);
      const groupId = createdGroup.json().id as string;

      const createdMapping = await app.inject({
        method: "POST",
        url: "/api/v1/admin/scim/group-role-mappings",
        headers: adminHeaders,
        payload: {
          groupExternalId: "role-group-1",
          campaignId: "camp_demo",
          role: "observer"
        }
      });
      expect(createdMapping.statusCode).toBe(201);
      expect(createdMapping.json().sync).toMatchObject({ matchedGroups: 1, createdMemberships: 1, removedMemberships: 0 });
      const mappingId = createdMapping.json().mapping.id as string;
      expect(store.state.members.find((member) => member.campaignId === "camp_demo" && member.userId === userId)).toMatchObject({
        role: "observer",
        source: { type: "scim_group", groupId, mappingId }
      });

      const archive = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: adminHeaders
      });
      expect(archive.statusCode).toBe(200);
      const archivedMember = archive.json().data.members.find((member: { userId: string }) => member.userId === userId);
      expect(archivedMember).not.toHaveProperty("source");
      expect(JSON.stringify(archive.json())).not.toContain(mappingId);

      const removedMember = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${groupId}`,
        headers: scimHeaders,
        payload: { Operations: [{ op: "replace", path: "members", value: [] }] }
      });
      expect(removedMember.statusCode).toBe(200);
      expect(store.state.members.some((member) => member.source?.type === "scim_group" && member.source.mappingId === mappingId)).toBe(false);

      const restoredMember = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${groupId}`,
        headers: scimHeaders,
        payload: { Operations: [{ op: "replace", path: "members", value: [{ value: userId }] }] }
      });
      expect(restoredMember.statusCode).toBe(200);
      expect(store.state.members.find((member) => member.source?.type === "scim_group" && member.source.mappingId === mappingId)).toMatchObject({
        userId,
        campaignId: "camp_demo",
        role: "observer"
      });

      const changedIdentity = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${groupId}`,
        headers: scimHeaders,
        payload: { Operations: [{ op: "replace", path: "externalId", value: "renamed-role-group-1" }] }
      });
      expect(changedIdentity.statusCode).toBe(200);
      expect(store.state.members.some((member) => member.source?.type === "scim_group" && member.source.mappingId === mappingId)).toBe(false);

      const restoredIdentity = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${groupId}`,
        headers: scimHeaders,
        payload: { Operations: [{ op: "replace", path: "externalId", value: "role-group-1" }] }
      });
      expect(restoredIdentity.statusCode).toBe(200);
      expect(store.state.members.find((member) => member.source?.type === "scim_group" && member.source.mappingId === mappingId)).toMatchObject({
        userId,
        campaignId: "camp_demo",
        role: "observer"
      });

      const mappings = await app.inject({
        method: "GET",
        url: "/api/v1/admin/scim/group-role-mappings",
        headers: adminHeaders
      });
      expect(mappings.statusCode).toBe(200);
      expect(mappings.json()[0]).toMatchObject({
        id: mappingId,
        groupExternalId: "role-group-1",
        group: { id: groupId, displayName: "Observer Group" }
      });

      const deletedMapping = await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/scim/group-role-mappings/${mappingId}`,
        headers: adminHeaders
      });
      expect(deletedMapping.statusCode).toBe(200);
      expect(deletedMapping.json()).toEqual({ removedMemberships: 1 });
      expect(store.state.members.some((member) => member.userId === userId && member.campaignId === "camp_demo")).toBe(false);
      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["admin.scim.groupRoleMapping.create", "admin.scim.groupRoleMapping.delete", "scim.group.patch"]));
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("lets server admins manage users and sessions", async () => {
    const previousEnv = snapshotEnv(["OTTE_ADMIN_USER_IDS"]);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const adminLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_gm" }
      });
      const adminHeaders = { authorization: `Bearer ${adminLogin.json().token}` };
      const playerLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_player" }
      });
      const playerSecondLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_player" }
      });
      const playerHeaders = { authorization: `Bearer ${playerLogin.json().token}` };

      const ownSessions = await app.inject({
        method: "GET",
        url: "/api/v1/auth/sessions",
        headers: playerHeaders
      });
      expect(ownSessions.statusCode).toBe(200);
      expect(ownSessions.json().map((session: { id: string }) => session.id)).toContain(playerLogin.json().session.id);
      expect(ownSessions.json().map((session: { id: string }) => session.id)).toContain(playerSecondLogin.json().session.id);

      const users = await app.inject({
        method: "GET",
        url: "/api/v1/admin/users",
        headers: adminHeaders
      });
      expect(users.statusCode).toBe(200);
      expect(users.json().find((user: { id: string }) => user.id === "usr_demo_player")).toMatchObject({ disabled: false, sessionCount: 2 });

      const reset = await app.inject({
        method: "POST",
        url: "/api/v1/admin/users/usr_demo_player/password-reset",
        headers: adminHeaders
      });
      expect(reset.statusCode).toBe(200);
      expect(reset.json().reset).not.toHaveProperty("tokenHash");
      expect(reset.json().email).toMatchObject({ to: "player@example.test", status: "pending", provider: "outbox" });

      const adminSessions = await app.inject({
        method: "GET",
        url: "/api/v1/admin/sessions",
        headers: adminHeaders
      });
      expect(adminSessions.statusCode).toBe(200);
      expect(adminSessions.json().map((session: { id: string }) => session.id)).toContain(playerLogin.json().session.id);

      const revokedSession = await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/sessions/${playerLogin.json().session.id}`,
        headers: adminHeaders
      });
      expect(revokedSession.statusCode).toBe(200);
      const playerAfterRevoke = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: playerHeaders
      });
      expect(playerAfterRevoke.statusCode).toBe(401);

      const revokedUserSessions = await app.inject({
        method: "DELETE",
        url: "/api/v1/admin/users/usr_demo_player/sessions",
        headers: adminHeaders
      });
      expect(revokedUserSessions.statusCode).toBe(200);
      expect(revokedUserSessions.json()).toEqual({ revoked: 1 });
      const playerSecondAfterRevoke = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: { authorization: `Bearer ${playerSecondLogin.json().token}` }
      });
      expect(playerSecondAfterRevoke.statusCode).toBe(401);

      const disabled = await app.inject({
        method: "PATCH",
        url: "/api/v1/admin/users/usr_demo_player",
        headers: adminHeaders,
        payload: { disabled: true, disabledReason: "left the table" }
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json()).toMatchObject({ disabled: true, disabledReason: "left the table", sessionCount: 0 });
      const disabledLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_player" }
      });
      expect(disabledLogin.statusCode).toBe(403);

      const enabledWithReset = await app.inject({
        method: "PATCH",
        url: "/api/v1/admin/users/usr_demo_player",
        headers: adminHeaders,
        payload: { disabled: false, passwordResetRequired: true }
      });
      expect(enabledWithReset.statusCode).toBe(200);
      expect(enabledWithReset.json()).toMatchObject({ disabled: false, passwordResetRequired: true });
      const resetRequiredLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_player" }
      });
      expect(resetRequiredLogin.statusCode).toBe(403);

      const outbox = await app.inject({
        method: "GET",
        url: "/api/v1/admin/email-outbox",
        headers: adminHeaders
      });
      expect(outbox.statusCode).toBe(200);
      expect(outbox.json()).toHaveLength(1);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("exports server admin audit logs with filters and ndjson", async () => {
    const previousEnv = snapshotEnv(["OTTE_ADMIN_USER_IDS"]);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const adminLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_gm" }
      });
      const playerLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_player" }
      });
      const adminHeaders = { authorization: `Bearer ${adminLogin.json().token}` };
      const playerHeaders = { authorization: `Bearer ${playerLogin.json().token}` };

      const blocked = await app.inject({
        method: "GET",
        url: "/api/v1/admin/audit-logs",
        headers: playerHeaders
      });
      expect(blocked.statusCode).toBe(403);

      const updated = await app.inject({
        method: "PATCH",
        url: "/api/v1/admin/users/usr_demo_player",
        headers: adminHeaders,
        payload: { displayName: "Audited Player", disabled: true, disabledReason: "audit evidence" }
      });
      expect(updated.statusCode).toBe(200);

      const badLimit = await app.inject({
        method: "GET",
        url: "/api/v1/admin/audit-logs?limit=0",
        headers: adminHeaders
      });
      expect(badLimit.statusCode).toBe(400);

      const jsonExport = await app.inject({
        method: "GET",
        url: "/api/v1/admin/audit-logs?action=admin.user.update&targetId=usr_demo_player&limit=5",
        headers: adminHeaders
      });
      expect(jsonExport.statusCode).toBe(200);
      expect(jsonExport.json()).toMatchObject({
        count: 1,
        filters: { action: "admin.user.update", targetId: "usr_demo_player" }
      });
      const auditEntry = jsonExport.json().auditLogs[0];
      expect(auditEntry).toMatchObject({
        actorUserId: "usr_demo_gm",
        actorType: "user",
        action: "admin.user.update",
        targetType: "user",
        targetId: "usr_demo_player"
      });
      expect(auditEntry.before).toMatchObject({ id: "usr_demo_player", disabled: false });
      expect(auditEntry.after).toMatchObject({ id: "usr_demo_player", disabled: true, disabledReason: "audit evidence" });
      expect(auditEntry.before).not.toHaveProperty("passwordHash");
      expect(auditEntry.after).not.toHaveProperty("passwordHash");

      const ndjson = await app.inject({
        method: "GET",
        url: "/api/v1/admin/audit-logs?format=ndjson&targetType=user&actorUserId=usr_demo_gm",
        headers: adminHeaders
      });
      expect(ndjson.statusCode).toBe(200);
      expect(ndjson.headers["content-type"]).toContain("application/x-ndjson");
      expect(ndjson.headers["content-disposition"]).toContain("opentabletop-audit-");
      const lines = ndjson.body.trim().split("\n").map((line) => JSON.parse(line));
      expect(lines.some((entry: { action: string; targetId?: string }) => entry.action === "admin.user.update" && entry.targetId === "usr_demo_player")).toBe(true);
      expect(lines.every((entry: { actorUserId?: string }) => entry.actorUserId === "usr_demo_gm")).toBe(true);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("hard-fences legacy x-user-id auth outside test or explicit compatibility mode", async () => {
    const previousEnv = snapshotEnv(["NODE_ENV", "OTTE_ALLOW_LEGACY_USER_HEADER"]);
    process.env.NODE_ENV = "production";
    delete process.env.OTTE_ALLOW_LEGACY_USER_HEADER;
    const app = await buildApp({ store: new MemoryStateStore() });
    try {
      const blocked = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns",
        headers: authHeaders
      });
      expect(blocked.statusCode).toBe(401);

      const login = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_gm" }
      });
      expect(login.statusCode).toBe(200);
      const bearer = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns",
        headers: { authorization: `Bearer ${login.json().token}` }
      });
      expect(bearer.statusCode).toBe(200);

      process.env.OTTE_ALLOW_LEGACY_USER_HEADER = "true";
      const enabled = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns",
        headers: authHeaders
      });
      expect(enabled.statusCode).toBe(200);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("supports campaign invites for new password users", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    const blockedInvite = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/invites",
      headers: { "x-user-id": "usr_demo_player" },
      payload: { email: "blocked@example.test", role: "player" }
    });
    expect(blockedInvite.statusCode).toBe(403);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/invites",
      headers: authHeaders,
      payload: {
        email: "Invited.Player@Example.Test",
        role: "player",
        expiresInDays: 3
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().token).toMatch(/^oti_/);
    expect(created.json().invite).toMatchObject({
      campaignId: "camp_demo",
      email: "invited.player@example.test",
      role: "player",
      status: "pending"
    });
    expect(created.json().invite).not.toHaveProperty("tokenHash");

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/invites",
      headers: authHeaders
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()[0]).toEqual(expect.objectContaining({ email: "invited.player@example.test", status: "pending" }));
    expect(listed.json()[0]).not.toHaveProperty("tokenHash");

    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/invites/accept",
      payload: {
        token: created.json().token,
        email: "invited.player@example.test",
        displayName: "Invited Player",
        password: "join table"
      }
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().token).toMatch(/^ots_/);
    expect(accepted.json().user).toMatchObject({ displayName: "Invited Player", email: "invited.player@example.test" });
    expect(accepted.json().user).not.toHaveProperty("passwordHash");
    expect(accepted.json().invite.status).toBe("accepted");
    expect(accepted.json().membership).toMatchObject({
      campaignId: "camp_demo",
      role: "player",
      user: { email: "invited.player@example.test" }
    });
    expect(accepted.json().membership.permissions).toContain("token.move");
    expect(accepted.json().membership.permissions).not.toContain("scene.update");
    expect(store.state.users.find((user) => user.email === "invited.player@example.test")?.passwordHash).toMatch(/^scrypt:/);

    const reused = await app.inject({
      method: "POST",
      url: "/api/v1/invites/accept",
      payload: {
        token: created.json().token,
        email: "another@example.test",
        displayName: "Another",
        password: "join table"
      }
    });
    expect(reused.statusCode).toBe(409);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "invited.player@example.test",
        password: "join table"
      }
    });
    expect(login.statusCode).toBe(200);
    const campaigns = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns",
      headers: { authorization: `Bearer ${login.json().token}` }
    });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().map((campaign: { id: string }) => campaign.id)).toEqual(["camp_demo"]);

    const revocable = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/invites",
      headers: authHeaders,
      payload: { email: "revoked@example.test", role: "observer" }
    });
    const revoked = await app.inject({
      method: "POST",
      url: `/api/v1/invites/${revocable.json().invite.id}/revoke`,
      headers: authHeaders
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().status).toBe("revoked");
    const acceptRevoked = await app.inject({
      method: "POST",
      url: "/api/v1/invites/accept",
      payload: {
        token: revocable.json().token,
        email: "revoked@example.test",
        displayName: "Revoked",
        password: "join table"
      }
    });
    expect(acceptRevoked.statusCode).toBe(403);

    await app.close();
  });

  it("starts and completes OIDC SSO with PKCE and user linking", async () => {
    let tokenRequestBody: URLSearchParams | undefined;
    let tokenRequestAuthorization: string | undefined;
    let userInfoAuthorization: string | undefined;
    let issuer = "";
    const provider = createServer(async (request: IncomingMessage, response: ServerResponse) => {
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
        tokenRequestAuthorization = request.headers.authorization;
        tokenRequestBody = new URLSearchParams(await readRequestBody(request));
        sendJson(response, {
          access_token: "provider-access-token",
          token_type: "Bearer"
        });
        return;
      }
      if (request.url === "/userinfo") {
        userInfoAuthorization = request.headers.authorization;
        sendJson(response, {
          sub: "subject-123",
          email: "Sso.User@Example.Test",
          name: "SSO User"
        });
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
    const address = provider.address() as AddressInfo;
    issuer = `http://127.0.0.1:${address.port}`;

    const previousEnv = snapshotEnv([
      "OTTE_OIDC_ISSUER",
      "OTTE_OIDC_CLIENT_ID",
      "OTTE_OIDC_CLIENT_SECRET",
      "OTTE_OIDC_REDIRECT_URI",
      "OTTE_OIDC_SCOPE",
      "OTTE_OIDC_DISPLAY_NAME",
      "OTTE_OIDC_TOKEN_AUTH",
      "OTTE_PUBLIC_URL",
      "OTTE_OIDC_ALLOW_INSECURE",
      "OTTE_WEB_ORIGIN",
      "OTTE_OIDC_ALLOWED_RETURN_ORIGINS"
    ]);
    process.env.OTTE_OIDC_ISSUER = issuer;
    process.env.OTTE_OIDC_CLIENT_ID = "otte-client";
    process.env.OTTE_OIDC_CLIENT_SECRET = "otte-secret";
    process.env.OTTE_OIDC_REDIRECT_URI = "http://127.0.0.1:4000/api/v1/auth/oidc/callback";
    process.env.OTTE_OIDC_DISPLAY_NAME = "Test SSO";
    process.env.OTTE_OIDC_ALLOW_INSECURE = "true";
    process.env.OTTE_OIDC_ALLOWED_RETURN_ORIGINS = "http://127.0.0.1:5186";

    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const config = await app.inject({
        method: "GET",
        url: "/api/v1/auth/oidc/config"
      });
      expect(config.statusCode).toBe(200);
      expect(config.json()).toEqual(expect.objectContaining({ enabled: true, issuer, clientId: "otte-client", displayName: "Test SSO" }));

      const started = await app.inject({
        method: "POST",
        url: "/api/v1/auth/oidc/start",
        payload: { returnTo: "http://127.0.0.1:5186/" }
      });
      expect(started.statusCode).toBe(200);
      const authorizationUrl = new URL(started.json().authorizationUrl);
      expect(authorizationUrl.origin).toBe(issuer);
      expect(authorizationUrl.pathname).toBe("/authorize");
      expect(authorizationUrl.searchParams.get("client_id")).toBe("otte-client");
      expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authorizationUrl.searchParams.get("state")).toMatch(/^oss_/);
      expect(store.state.oauthStates).toHaveLength(1);

      const callback = await app.inject({
        method: "GET",
        url: `/api/v1/auth/oidc/callback?code=valid-code&state=${encodeURIComponent(authorizationUrl.searchParams.get("state")!)}`
      });
      expect(callback.statusCode).toBe(302);
      const location = callback.headers.location as string;
      expect(location).toContain("http://127.0.0.1:5186/#");
      const fragment = new URLSearchParams(new URL(location).hash.slice(1));
      expect(fragment.get("ssoToken")).toMatch(/^ots_/);
      expect(fragment.get("ssoUserId")).toMatch(/^usr_/);
      expect(store.state.oauthStates).toHaveLength(0);
      expect(store.state.identities).toEqual([
        expect.objectContaining({
          provider: "oidc",
          issuer,
          subject: "subject-123",
          email: "sso.user@example.test"
        })
      ]);
      expect(store.state.users.find((user) => user.id === fragment.get("ssoUserId"))).toEqual(
        expect.objectContaining({
          displayName: "SSO User",
          email: "sso.user@example.test"
        })
      );
      expect(tokenRequestAuthorization).toBe(`Basic ${Buffer.from("otte-client:otte-secret").toString("base64")}`);
      expect(tokenRequestBody?.get("grant_type")).toBe("authorization_code");
      expect(tokenRequestBody?.get("code")).toBe("valid-code");
      expect(tokenRequestBody?.get("code_verifier")).toBeTruthy();
      expect(userInfoAuthorization).toBe("Bearer provider-access-token");

      const session = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: { authorization: `Bearer ${fragment.get("ssoToken")}` }
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().user).toEqual(expect.objectContaining({ email: "sso.user@example.test" }));
      expect(session.json().user).not.toHaveProperty("passwordHash");

      const ssoUser = store.state.users.find((user) => user.id === fragment.get("ssoUserId"));
      expect(ssoUser).toBeTruthy();
      ssoUser!.disabledAt = "2026-05-01T00:00:00.000Z";
      const disabledStart = await app.inject({
        method: "POST",
        url: "/api/v1/auth/oidc/start",
        payload: { returnTo: "http://127.0.0.1:5186/" }
      });
      const disabledAuthorizationUrl = new URL(disabledStart.json().authorizationUrl);
      const disabledCallback = await app.inject({
        method: "GET",
        url: `/api/v1/auth/oidc/callback?code=valid-code&state=${encodeURIComponent(disabledAuthorizationUrl.searchParams.get("state")!)}`
      });
      expect(disabledCallback.statusCode).toBe(401);

      const reusedState = await app.inject({
        method: "GET",
        url: `/api/v1/auth/oidc/callback?code=valid-code&state=${encodeURIComponent(authorizationUrl.searchParams.get("state")!)}`
      });
      expect(reusedState.statusCode).toBe(401);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
  });

  it("filters hidden tokens from player reads and mutations", async () => {
    const store = new MemoryStateStore();
    store.state.tokens.push({
      id: "tok_hidden_sentinel",
      sceneId: "scn_vault_entry",
      name: "Hidden Sentinel",
      x: 700,
      y: 260,
      width: 50,
      height: 50,
      rotation: 0,
      hidden: true,
      locked: false,
      visionEnabled: false,
      visionRadius: 0,
      disposition: "hostile",
      metadata: {},
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });
    const playerHeaders = { "x-user-id": "usr_demo_player" };

    const playerTokens = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: playerHeaders
    });
    expect(playerTokens.statusCode).toBe(200);
    expect(playerTokens.json().map((token: { id: string }) => token.id)).toEqual(["tok_valen"]);

    const gmTokens = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: authHeaders
    });
    expect(gmTokens.statusCode).toBe(200);
    expect(gmTokens.json().map((token: { id: string }) => token.id)).toContain("tok_hidden_sentinel");

    const blockedMove = await app.inject({
      method: "PATCH",
      url: "/api/v1/tokens/tok_hidden_sentinel",
      headers: playerHeaders,
      payload: { x: 760, y: 300 }
    });
    expect(blockedMove.statusCode).toBe(404);

    const gmMove = await app.inject({
      method: "PATCH",
      url: "/api/v1/tokens/tok_hidden_sentinel",
      headers: authHeaders,
      payload: { x: 760, y: 300 }
    });
    expect(gmMove.statusCode).toBe(200);
    expect(gmMove.json()).toEqual(expect.objectContaining({ hidden: true, x: 760, y: 300 }));

    await app.close();
  });

  it("filters player token visibility by fog, owned vision, and walls", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.fog = [{ id: "fog_southeast", x: 900, y: 700, radius: 120, hidden: false }];
    scene.walls = [{ id: "wall_screen", x1: 200, y1: 300, x2: 600, y2: 300, blocksVision: true }];
    const valen = store.state.tokens.find((item) => item.id === "tok_valen")!;
    valen.visionRadius = 220;
    store.state.tokens.push(
      {
        id: "tok_visible_guard",
        sceneId: "scn_vault_entry",
        name: "Visible Guard",
        x: 450,
        y: 350,
        width: 50,
        height: 50,
        rotation: 0,
        hidden: false,
        locked: false,
        visionEnabled: false,
        visionRadius: 0,
        disposition: "hostile",
        metadata: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "tok_blocked_guard",
        sceneId: "scn_vault_entry",
        name: "Blocked Guard",
        x: 300,
        y: 200,
        width: 50,
        height: 50,
        rotation: 0,
        hidden: false,
        locked: false,
        visionEnabled: false,
        visionRadius: 0,
        disposition: "hostile",
        metadata: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "tok_fog_scout",
        sceneId: "scn_vault_entry",
        name: "Fog Scout",
        x: 880,
        y: 680,
        width: 50,
        height: 50,
        rotation: 0,
        hidden: false,
        locked: false,
        visionEnabled: false,
        visionRadius: 0,
        disposition: "neutral",
        metadata: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    );
    const app = await buildApp({ store });
    const playerHeaders = { "x-user-id": "usr_demo_player" };

    const playerTokens = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: playerHeaders
    });
    expect(playerTokens.statusCode).toBe(200);
    expect(playerTokens.json().map((token: { id: string }) => token.id)).toEqual(["tok_valen", "tok_visible_guard", "tok_fog_scout"]);

    const playerVision = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/vision",
      headers: playerHeaders
    });
    expect(playerVision.statusCode).toBe(200);
    const vision = playerVision.json() as VisionSnapshot;
    expect(vision.fogActive).toBe(true);
    expect(vision.polygons.some((polygon) => polygon.source === "token" && polygon.sourceId === "tok_valen")).toBe(true);
    expect(vision.polygons.some((polygon) => polygon.source === "fog" && polygon.sourceId === "fog_southeast")).toBe(true);
    expect(vision.polygons.some((polygon) => polygon.source === "light" && polygon.color === "#f59e0b")).toBe(true);
    expect(isPointInsideVisionPolygons({ x: 325, y: 225 }, vision.polygons.filter((polygon) => polygon.source !== "light"))).toBe(false);

    const gmTokens = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: authHeaders
    });
    expect(gmTokens.statusCode).toBe(200);
    expect(gmTokens.json().map((token: { id: string }) => token.id)).toContain("tok_blocked_guard");

    const blockedUnownedMove = await app.inject({
      method: "PATCH",
      url: "/api/v1/tokens/tok_visible_guard",
      headers: playerHeaders,
      payload: { x: 470, y: 370 }
    });
    expect(blockedUnownedMove.statusCode).toBe(403);

    const blockedMove = await app.inject({
      method: "PATCH",
      url: "/api/v1/tokens/tok_blocked_guard",
      headers: playerHeaders,
      payload: { x: 360, y: 220 }
    });
    expect(blockedMove.statusCode).toBe(404);

    await app.close();
  });

  it("supports polygon reveal and hide brush fog operations", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.fog = [];
    const valen = store.state.tokens.find((item) => item.id === "tok_valen")!;
    valen.visionRadius = 120;
    const app = await buildApp({ store });
    const playerHeaders = { "x-user-id": "usr_demo_player" };

    const blockedPlayerFog = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: playerHeaders,
      payload: {
        shape: "polygon",
        points: [
          { x: 700, y: 250 },
          { x: 900, y: 250 },
          { x: 900, y: 430 },
          { x: 700, y: 430 }
        ]
      }
    });
    expect(blockedPlayerFog.statusCode).toBe(403);

    const revealed = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: authHeaders,
      payload: {
        shape: "polygon",
        mode: "reveal",
        points: [
          { x: 700, y: 250 },
          { x: 900, y: 250 },
          { x: 900, y: 430 },
          { x: 700, y: 430 }
        ]
      }
    });
    expect(revealed.statusCode).toBe(200);
    expect(revealed.json().fog.at(-1)).toEqual(expect.objectContaining({ shape: "polygon", mode: "reveal", x: 800, y: 340 }));

    const hidden = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: authHeaders,
      payload: { x: 825, y: 335, radius: 70, mode: "hide" }
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().fog.at(-1)).toEqual(expect.objectContaining({ shape: "circle", mode: "hide", radius: 70 }));

    const polygonScout = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: authHeaders,
      payload: { name: "Polygon Scout", x: 715, y: 310, disposition: "neutral" }
    });
    expect(polygonScout.statusCode).toBe(200);

    const erasedScout = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: authHeaders,
      payload: { name: "Erased Scout", x: 800, y: 310, disposition: "hostile" }
    });
    expect(erasedScout.statusCode).toBe(200);

    const playerTokens = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: playerHeaders
    });
    expect(playerTokens.statusCode).toBe(200);
    expect(playerTokens.json().map((token: { name: string }) => token.name)).toEqual(["Valen Ash", "Polygon Scout"]);

    const playerVision = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/vision",
      headers: playerHeaders
    });
    expect(playerVision.statusCode).toBe(200);
    const vision = playerVision.json() as VisionSnapshot;
    expect(vision.polygons.some((polygon) => polygon.source === "fog" && polygon.mode === "reveal")).toBe(true);
    expect(vision.polygons.some((polygon) => polygon.source === "fog" && polygon.mode === "hide")).toBe(true);

    const deletedFog = await app.inject({
      method: "DELETE",
      url: `/api/v1/scenes/scn_vault_entry/fog/${hidden.json().fog.at(-1).id}`,
      headers: authHeaders
    });
    expect(deletedFog.statusCode).toBe(200);
    expect(deletedFog.json().fog.some((region: { mode?: string }) => region.mode === "hide")).toBe(false);

    await app.close();
  });

  it("covers auth, assets, fog, encounter design, and session memory", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: authHeaders
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.id).toBe("usr_demo_gm");

    const asset = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets",
      headers: authHeaders,
      payload: {
        name: "Vault Map",
        url: "https://example.test/vault.png",
        mimeType: "image/png"
      }
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.json().name).toBe("Vault Map");

    const fog = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: authHeaders,
      payload: { x: 420, y: 320, radius: 100 }
    });
    expect(fog.statusCode).toBe(200);
    expect(fog.json().fog).toHaveLength(2);

    const encounter = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      headers: authHeaders,
      payload: { prompt: "A clockwork sentinel", difficulty: "hard" }
    });
    expect(encounter.statusCode).toBe(200);
    expect(encounter.json().proposal.title).toBe("Encounter Designer Draft");

    const recap = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      headers: authHeaders,
      payload: { transcript: "The party opened the vault." }
    });
    expect(recap.statusCode).toBe(200);
    expect(recap.json().memory.text).toContain("vault");

    const memory = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/ai/memory",
      headers: authHeaders
    });
    expect(memory.statusCode).toBe(200);
    expect(memory.json()).toHaveLength(1);

    await app.close();
  });

  it("rejects unauthenticated and unauthorized campaign access", async () => {
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_observer",
      displayName: "Observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    store.state.members.push({
      id: "mem_observer",
      campaignId: "camp_demo",
      userId: "usr_observer",
      role: "observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });

    const missingSession = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns"
    });
    expect(missingSession.statusCode).toBe(401);

    const blockedMutation = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: { "x-user-id": "usr_observer" },
      payload: { name: "Unauthorized Token" }
    });
    expect(blockedMutation.statusCode).toBe(403);

    const secretJournal = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/journal",
      headers: { "x-user-id": "usr_observer" }
    });
    expect(secretJournal.statusCode).toBe(200);
    expect(secretJournal.json()).toEqual([]);

    await app.close();
  });

  it("authors walls and lights with scene update permission", async () => {
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_observer",
      displayName: "Observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    store.state.members.push({
      id: "mem_observer",
      campaignId: "camp_demo",
      userId: "usr_observer",
      role: "observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });

    const blockedWall = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/walls",
      headers: { "x-user-id": "usr_observer" },
      payload: { x1: 100, y1: 100, x2: 500, y2: 100 }
    });
    expect(blockedWall.statusCode).toBe(403);

    const wall = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/walls",
      headers: authHeaders,
      payload: { x1: 220, y1: 160, x2: 840, y2: 160, kind: "terrain", blocksMovement: false }
    });
    expect(wall.statusCode).toBe(200);
    expect(wall.json().walls.at(-1)).toEqual(
      expect.objectContaining({
        x1: 220,
        y1: 160,
        x2: 840,
        y2: 160,
        blocksVision: true,
        blocksMovement: false,
        kind: "terrain"
      })
    );

    const light = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/lights",
      headers: authHeaders,
      payload: { x: 360, y: 340, radius: 240, color: "#38bdf8", intensity: 0.42 }
    });
    expect(light.statusCode).toBe(200);
    expect(light.json().lights.at(-1)).toEqual(
      expect.objectContaining({
        x: 360,
        y: 340,
        radius: 240,
        color: "#38bdf8",
        intensity: 0.42
      })
    );

    const vision = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/vision",
      headers: authHeaders
    });
    expect(vision.statusCode).toBe(200);
    expect((vision.json() as VisionSnapshot).polygons.some((polygon) => polygon.source === "light" && polygon.sourceId === light.json().lights.at(-1).id && polygon.color === "#38bdf8")).toBe(true);

    const scene = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry",
      headers: authHeaders
    });
    expect(scene.json().walls).toHaveLength(2);
    expect(scene.json().lights).toHaveLength(2);

    await app.close();
  });

  it("runs plugin and system runtime flows with permission boundaries", async () => {
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_observer",
      displayName: "Observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    store.state.members.push({
      id: "mem_observer",
      campaignId: "camp_demo",
      userId: "usr_observer",
      role: "observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });

    const observerInstall = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/install",
      headers: { "x-user-id": "usr_observer" }
    });
    expect(observerInstall.statusCode).toBe(403);

    const invalidPermissionInstall = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/install",
      headers: authHeaders,
      payload: { permissions: ["campaign.delete"] }
    });
    expect(invalidPermissionInstall.statusCode).toBe(400);

    const pluginInstall = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/install",
      headers: authHeaders,
      payload: { permissions: ["token.read"] }
    });
    expect(pluginInstall.statusCode).toBe(200);
    expect(pluginInstall.json().plugin.source).toEqual(expect.objectContaining({ packageId: "example-macro-plugin", sandbox: "vm" }));
    expect(pluginInstall.json().grant.permissions).toEqual(["token.read"]);
    expect(pluginInstall.json().permissionReview).toEqual({
      requestedPermissions: ["chat.write", "token.read"],
      grantedPermissions: ["token.read"],
      missingPermissions: ["chat.write"]
    });

    const grant = store.state.permissionGrants.find((item) => item.subjectType === "plugin" && item.subjectId === "example-macro-plugin");
    expect(grant).toBeTruthy();
    const blockedCommand = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/chat-command",
      headers: authHeaders,
      payload: { command: "/spark" }
    });
    expect(blockedCommand.statusCode).toBe(403);

    const reviewedInstall = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/install",
      headers: authHeaders,
      payload: { permissions: ["chat.write", "token.read"] }
    });
    expect(reviewedInstall.statusCode).toBe(200);
    expect(reviewedInstall.json().permissionReview.missingPermissions).toEqual([]);

    const command = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/chat-command",
      headers: authHeaders,
      payload: { command: "/spark", args: "test flare" }
    });
    expect(command.statusCode).toBe(200);
    expect(command.json().chat.type).toBe("plugin");
    expect(command.json().chat.body).toContain("Valen Ash");

    const sheet = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/sheet",
      headers: authHeaders
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().summary).toContain("Valen Ash");
    expect(sheet.json().quickRolls).toContainEqual({
      id: "ability-charisma",
      label: "Charisma Check",
      formula: "1d20+2"
    });

    const compendium = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/compendium",
      headers: authHeaders
    });
    expect(compendium.statusCode).toBe(200);
    expect(compendium.json().entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "longsword", type: "item" }),
        expect.objectContaining({ id: "healing-word", type: "spell" }),
        expect.objectContaining({ id: "poisoned", type: "condition" })
      ])
    );

    const observerCondition = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/conditions",
      headers: { "x-user-id": "usr_observer" },
      payload: { conditionId: "blessed" }
    });
    expect(observerCondition.statusCode).toBe(403);

    const observerRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: { "x-user-id": "usr_observer" },
      payload: { rollId: "ability-charisma" }
    });
    expect(observerRoll.statusCode).toBe(403);

    const systemRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: authHeaders,
      payload: { rollId: "ability-charisma" }
    });
    expect(systemRoll.statusCode).toBe(200);
    expect(systemRoll.json().quickRoll.formula).toBe("1d20+2");
    expect(store.state.chat.some((message) => message.body.includes("Charisma Check"))).toBe(true);

    const learnedSpell = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/compendium",
      headers: authHeaders,
      payload: { entryId: "healing-word" }
    });
    expect(learnedSpell.statusCode).toBe(200);
    expect(learnedSpell.json().item).toEqual(expect.objectContaining({ type: "spell", name: "Healing Word", actorId: "act_valen" }));
    expect(learnedSpell.json().sheet.spells).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Healing Word" })]));

    const blessed = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/conditions",
      headers: authHeaders,
      payload: { conditionId: "blessed" }
    });
    expect(blessed.statusCode).toBe(200);
    expect(blessed.json().sheet.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "blessed", name: "Blessed" })]));
    expect(blessed.json().sheet.quickRolls).toContainEqual({
      id: "ability-charisma",
      label: "Charisma Check",
      formula: "1d20+2+1d4"
    });

    const poisoned = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/conditions",
      headers: authHeaders,
      payload: { conditionId: "poisoned" }
    });
    expect(poisoned.statusCode).toBe(200);
    expect(poisoned.json().sheet.quickRolls).toContainEqual({
      id: "ability-charisma",
      label: "Charisma Check",
      formula: "2d20kl1+2+1d4"
    });

    const cleared = await app.inject({
      method: "DELETE",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/conditions/poisoned",
      headers: authHeaders
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().sheet.conditions.map((condition: { id: string }) => condition.id)).toEqual(["blessed"]);
    expect(cleared.json().sheet.quickRolls).toContainEqual({
      id: "ability-charisma",
      label: "Charisma Check",
      formula: "1d20+2+1d4"
    });

    const conditionedRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: authHeaders,
      payload: { rollId: "ability-charisma" }
    });
    expect(conditionedRoll.statusCode).toBe(200);
    expect(conditionedRoll.json().quickRoll.formula).toBe("1d20+2+1d4");

    await app.close();
  });

  it("passes only caller-visible campaign context to ai providers", async () => {
    class CapturingAiProvider implements AiProvider {
      id = "test-ai";
      label = "Test AI";
      requests: AiProviderRequest[] = [];

      async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.requests.push(input);
        yield {
          type: "message.completed",
          content: `Captured response ${this.requests.length}`
        };
      }
    }

    const now = "2026-05-01T00:00:00.000Z";
    const provider = new CapturingAiProvider();
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_player",
      displayName: "Player",
      createdAt: now,
      updatedAt: now
    });
    store.state.members.push({
      id: "mem_player",
      campaignId: "camp_demo",
      userId: "usr_player",
      role: "player",
      createdAt: now,
      updatedAt: now
    });
    store.state.journals.push({
      id: "jnl_public",
      campaignId: "camp_demo",
      title: "Public Rumor",
      body: "The brass key is visible to everyone.",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
      createdAt: now,
      updatedAt: now
    });
    const app = await buildApp({ store, aiProvider: provider });

    const playerThread = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: { "x-user-id": "usr_player" },
      payload: { prompt: "What do I know?" }
    });
    expect(playerThread.statusCode).toBe(200);
    expect(playerThread.json().thread.provider).toBe("test-ai");
    expect(provider.requests).toHaveLength(1);
    const playerContext = provider.requests[0]!.context;
    expect(playerContext.publicSummary).toContain("Public Rumor");
    expect(playerContext.publicSummary).not.toContain("Session Hook");
    expect(playerContext.gmSecrets).toEqual([]);
    expect(store.state.chat.find((message) => message.body === "Captured response 1")?.visibility).toBe("public");

    const gmThread = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: authHeaders,
      payload: { prompt: "What is secret?" }
    });
    expect(gmThread.statusCode).toBe(200);
    expect(provider.requests).toHaveLength(2);
    const gmContext = provider.requests[1]!.context;
    expect(gmContext.publicSummary).toContain("Session Hook");
    expect(gmContext.gmSecrets.some((secret) => secret.includes("founder's oath"))).toBe(true);
    expect(store.state.chat.find((message) => message.body === "Captured response 2")?.visibility).toBe("gm_only");

    const playerChat = await app.inject({
      method: "GET",
      url: "/api/v1/chat/messages?campaignId=camp_demo",
      headers: { "x-user-id": "usr_player" }
    });
    expect(playerChat.statusCode).toBe(200);
    expect(playerChat.json().map((message: { body: string }) => message.body)).toContain("Captured response 1");
    expect(playerChat.json().map((message: { body: string }) => message.body)).not.toContain("Captured response 2");

    await app.close();
  });

  it("can select the codex loopback ai provider from configuration", async () => {
    const previousProvider = process.env.OTTE_AI_PROVIDER;
    process.env.OTTE_AI_PROVIDER = "codex-loopback";
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;

    try {
      const store = new MemoryStateStore();
      app = await buildApp({ store });
      const thread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Summarize the party state" }
      });

      expect(thread.statusCode).toBe(200);
      expect(thread.json().thread.provider).toBe("codex-app-server");
      expect(thread.json().assistantMessage).toContain("Codex loopback handled turn/start");
      expect(thread.json().events).toContainEqual(expect.objectContaining({ type: "message.completed" }));

      const toolThread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Create a prep proposal for the vault" }
      });
      expect(toolThread.statusCode).toBe(200);
      expect(toolThread.json().events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "proposal.created" })]));
      expect(store.state.proposals.some((proposal) => proposal.title === "Codex Loopback Proposal")).toBe(true);

      const extracted = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/memory/extract",
        headers: authHeaders,
        payload: {
          sourceText: "The party learned that the silver door opens at moonrise."
        }
      });
      expect(extracted.statusCode).toBe(200);
      expect(extracted.json().thread.provider).toBe("codex-app-server");
      expect(extracted.json().memory.text).toContain("silver door opens at moonrise");
      expect(extracted.json().memory.sourceIds).toContain(extracted.json().thread.id);
      expect(store.state.aiMemory.some((fact) => fact.text.includes("silver door opens at moonrise"))).toBe(true);

      const blockedExtraction = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/memory/extract",
        headers: { "x-user-id": "usr_demo_player" },
        payload: {
          sourceText: "Players cannot queue campaign memory."
        }
      });
      expect(blockedExtraction.statusCode).toBe(403);
    } finally {
      await app?.close();
      if (previousProvider === undefined) {
        delete process.env.OTTE_AI_PROVIDER;
      } else {
        process.env.OTTE_AI_PROVIDER = previousProvider;
      }
    }
  });

  it("can select the OpenAI Responses ai provider from configuration", async () => {
    const previousProvider = process.env.OTTE_AI_PROVIDER;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OTTE_AI_PROVIDER = "openai-responses";
    delete process.env.OPENAI_API_KEY;
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;

    try {
      app = await buildApp({ store: new MemoryStateStore() });
      const thread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Summarize the party state" }
      });

      expect(thread.statusCode).toBe(200);
      expect(thread.json().thread.provider).toBe("openai-responses");
      expect(thread.json().assistantMessage).toContain("Set OPENAI_API_KEY");
      expect(thread.json().events).toContainEqual(expect.objectContaining({ type: "message.completed" }));
    } finally {
      await app?.close();
      if (previousProvider === undefined) {
        delete process.env.OTTE_AI_PROVIDER;
      } else {
        process.env.OTTE_AI_PROVIDER = previousProvider;
      }
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });

  it("retries ai providers before events and exposes thread status", async () => {
    const previousEnv = snapshotEnv(["OTTE_AI_PROVIDER_RETRY_ATTEMPTS"]);
    process.env.OTTE_AI_PROVIDER_RETRY_ATTEMPTS = "1";

    class FlakyProvider implements AiProvider {
      id = "flaky-ai";
      label = "Flaky AI";
      attempts = 0;

      async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.attempts += 1;
        if (this.attempts === 1) {
          throw new Error("temporary upstream outage");
        }
        yield {
          type: "message.completed",
          content: "Recovered response"
        };
      }
    }

    const store = new MemoryStateStore();
    const provider = new FlakyProvider();
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const thread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Retry this provider" }
      });

      expect(thread.statusCode).toBe(200);
      expect(provider.attempts).toBe(2);
      expect(thread.json().thread).toMatchObject({
        status: "completed",
        retryAttempts: 1,
        eventCount: 1,
        toolCallCount: 0
      });
      expect(thread.json().thread.durationMs).toEqual(expect.any(Number));

      const listed = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()[0]).toMatchObject({
        id: thread.json().thread.id,
        status: "completed",
        provider: "flaky-ai"
      });

      const blocked = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_player" }
      });
      expect(blocked.statusCode).toBe(403);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("persists failed ai threads when provider retries are exhausted", async () => {
    const previousEnv = snapshotEnv(["OTTE_AI_PROVIDER_RETRY_ATTEMPTS"]);
    process.env.OTTE_AI_PROVIDER_RETRY_ATTEMPTS = "1";

    class FailingProvider implements AiProvider {
      id = "failing-ai";
      label = "Failing AI";
      attempts = 0;

      async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.attempts += 1;
        throw new Error("upstream unavailable");
      }
    }

    const store = new MemoryStateStore();
    const provider = new FailingProvider();
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Fail this provider" }
      });

      expect(response.statusCode).toBe(502);
      expect(provider.attempts).toBe(2);
      expect(response.json()).toMatchObject({
        error: "ai_provider_failed",
        message: "upstream unavailable"
      });
      expect(response.json().thread).toMatchObject({
        status: "failed",
        retryAttempts: 1,
        eventCount: 0,
        toolCallCount: 0,
        providerError: "upstream unavailable"
      });
      expect(response.json().thread.durationMs).toEqual(expect.any(Number));
      expect(store.state.aiThreads[0]).toMatchObject({
        status: "failed",
        providerError: "upstream unavailable"
      });

      const listed = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()[0]).toMatchObject({
        status: "failed",
        providerError: "upstream unavailable"
      });
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("records ai usage metrics and exposes aggregate operator usage", async () => {
    const previousEnv = snapshotEnv(["OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K", "OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K"]);
    process.env.OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K = "0.01";
    process.env.OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K = "0.02";

    class UsageProvider implements AiProvider {
      id = "usage-ai";
      label = "Usage AI";

      async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        yield {
          type: "usage.reported",
          usage: {
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500
          }
        };
        yield {
          type: "message.completed",
          content: "Usage recorded"
        };
      }
    }

    const app = await buildApp({ store: new MemoryStateStore(), aiProvider: new UsageProvider() });

    try {
      const thread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Track usage for this provider" }
      });
      expect(thread.statusCode).toBe(200);
      expect(thread.json().events).toContainEqual({
        type: "usage.reported",
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500
        }
      });
      expect(thread.json().thread.usage).toEqual(
        expect.objectContaining({
          promptCharacters: "Track usage for this provider".length,
          contextCharacters: expect.any(Number),
          responseCharacters: "Usage recorded".length,
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          estimatedCostUsd: 0.02
        })
      );

      const usage = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/ai/usage",
        headers: authHeaders
      });
      expect(usage.statusCode).toBe(200);
      expect(usage.json()).toMatchObject({
        campaignId: "camp_demo",
        threadCount: 1,
        completedThreadCount: 1,
        failedThreadCount: 0,
        usage: {
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          estimatedCostUsd: 0.02
        },
        providers: [
          expect.objectContaining({
            provider: "usage-ai",
            threadCount: 1,
            usage: expect.objectContaining({
              inputTokens: 1000,
              outputTokens: 500,
              estimatedCostUsd: 0.02
            })
          })
        ]
      });

      const blocked = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/ai/usage",
        headers: { "x-user-id": "usr_demo_player" }
      });
      expect(blocked.statusCode).toBe(403);
    } finally {
      await app.close();
      restoreEnv(previousEnv);
    }
  });

  it("executes ai provider proposal tools with permission boundaries", async () => {
    class ToolCallingProvider implements AiProvider {
      id = "tool-ai";
      label = "Tool AI";
      requests: AiProviderRequest[] = [];

      async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.requests.push(input);
        yield {
          type: "tool.started",
          toolName: "create_proposal",
          input: {
            title: "Tool Journal Proposal",
            summary: "Create a journal note from the provider tool call.",
            changes: [
              {
                entity: "journal",
                action: "create",
                data: {
                  campaignId: "camp_demo",
                  title: "Tool Created Note",
                  body: "The provider proposed this note.",
                  visibility: "gm_only",
                  visibleToUserIds: [],
                  visibleToActorIds: [],
                  tags: ["ai", "tool"],
                  createdBy: "usr_demo_gm",
                  updatedBy: "usr_demo_gm"
                }
              }
            ]
          }
        };
        yield {
          type: "message.completed",
          content: "Tool proposal requested"
        };
      }
    }

    const gmProvider = new ToolCallingProvider();
    const gmStore = new MemoryStateStore();
    const gmApp = await buildApp({ store: gmStore, aiProvider: gmProvider });
    const gmThread = await gmApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: authHeaders,
      payload: { prompt: "Use a tool to propose prep" }
    });
    expect(gmThread.statusCode).toBe(200);
    expect(gmProvider.requests[0]!.tools.map((tool) => tool.name)).toContain("create_proposal");
    expect(gmThread.json().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool.completed", toolName: "create_proposal" }),
        expect.objectContaining({ type: "proposal.created" })
      ])
    );
    const proposal = gmStore.state.proposals.find((item) => item.title === "Tool Journal Proposal");
    expect(proposal).toEqual(expect.objectContaining({ status: "pending", createdByType: "ai" }));
    expect(proposal?.changesJson[0]?.entity).toBe("journal");
    expect(proposal?.changesJson[0]?.data.id).toMatch(/^jnl_/);
    expect(proposal?.changesJson[0]?.data.createdAt).toEqual(expect.any(String));
    expect(gmStore.state.aiToolCalls.map((call) => call.status)).toEqual(expect.arrayContaining(["started", "completed"]));
    expect(gmStore.state.aiToolCalls.find((call) => call.status === "completed")?.durationMs).toEqual(expect.any(Number));
    await gmApp.close();

    const playerProvider = new ToolCallingProvider();
    const playerStore = new MemoryStateStore();
    const playerApp = await buildApp({ store: playerStore, aiProvider: playerProvider });
    const playerThread = await playerApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: { "x-user-id": "usr_demo_player" },
      payload: { prompt: "Try to create a proposal" }
    });
    expect(playerThread.statusCode).toBe(200);
    const playerToolCompleted = playerThread.json().events.find((event: { type: string }) => event.type === "tool.completed");
    expect(playerToolCompleted.output).toEqual({
      error: "missing_permission",
      permission: "ai.proposeChanges"
    });
    expect(playerStore.state.proposals.some((item) => item.title === "Tool Journal Proposal")).toBe(false);
    await playerApp.close();
  });

  it("executes expanded ai tools with permission and observability boundaries", async () => {
    class ExpandedToolProvider implements AiProvider {
      id = "expanded-tool-ai";
      label = "Expanded Tool AI";
      requests: AiProviderRequest[] = [];

      async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.requests.push(input);
        yield { type: "tool.started", toolName: "read_compendium", input: { systemId: "generic-fantasy" } };
        yield { type: "tool.started", toolName: "create_memory", input: { text: "The moon key opens the observatory.", visibility: "gm_only" } };
        yield { type: "tool.started", toolName: "draft_encounter", input: { name: "Mirror Knight", summary: "A reflective guardian blocks the vault.", difficulty: "hard" } };
        yield { type: "tool.started", toolName: "draft_journal_entry", input: { title: "Mirror Clue", body: "The western mirror answers to moonlight.", visibility: "gm_only", tags: ["ai", "clue"] } };
        yield { type: "tool.started", toolName: "draft_scene", input: { name: "Mirror Annex", width: 900, height: 700, gridSize: 50 } };
        yield { type: "tool.started", toolName: "draft_token_update", input: { tokenId: "tok_valen", x: 220, y: 240, disposition: "friendly" } };
        yield { type: "tool.started", toolName: "draft_actor_update", input: { actorId: "act_valen", data: { resources: { focus: 4 } } } };
        yield { type: "tool.started", toolName: "roll_dice", input: { formula: "1d20+5", label: "AI Perception" } };
        yield { type: "tool.started", toolName: "unknown_tool", input: {} };
        yield { type: "message.completed", content: "Expanded tools requested" };
      }
    }

    const gmProvider = new ExpandedToolProvider();
    const gmStore = new MemoryStateStore();
    const gmApp = await buildApp({ store: gmStore, aiProvider: gmProvider });
    const gmThread = await gmApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: authHeaders,
      payload: { prompt: "Read the compendium, remember a key, draft an encounter, and roll dice." }
    });
    expect(gmThread.statusCode).toBe(200);
    expect(gmProvider.requests[0]!.tools.map((tool) => tool.name)).toEqual(["create_proposal", "draft_encounter", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "create_memory", "roll_dice", "read_compendium"]);
    expect(gmProvider.requests[0]!.tools.find((tool) => tool.name === "draft_encounter")?.parameters?.required).toEqual(["name", "summary"]);
    expect(gmProvider.requests[0]!.tools.find((tool) => tool.name === "draft_token_update")?.requiredPermissions).toEqual(["ai.proposeChanges", "token.update"]);
    expect(gmProvider.requests[0]!.context.actors?.map((actor) => actor.name)).toContain("Valen Ash");
    expect(gmProvider.requests[0]!.context.scenes?.map((scene) => scene.name)).toContain("Vault Entry");
    expect(gmThread.json().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool.completed", toolName: "read_compendium", output: expect.objectContaining({ entries: expect.arrayContaining([expect.objectContaining({ id: "healing-word" })]) }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "create_memory", output: expect.objectContaining({ memoryId: expect.any(String), visibility: "gm_only" }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "draft_encounter", output: expect.objectContaining({ proposalId: expect.any(String), changeCount: 1 }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "draft_journal_entry", output: expect.objectContaining({ proposalId: expect.any(String), changeCount: 1 }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "draft_scene", output: expect.objectContaining({ proposalId: expect.any(String), changeCount: 1 }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "draft_token_update", output: expect.objectContaining({ proposalId: expect.any(String), changeCount: 1 }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "draft_actor_update", output: expect.objectContaining({ proposalId: expect.any(String), changeCount: 1 }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "roll_dice", output: expect.objectContaining({ rollId: expect.any(String), formula: "1d20+5", label: "AI Perception" }) }),
        expect.objectContaining({ type: "tool.completed", toolName: "unknown_tool", output: { error: "unknown_tool", toolName: "unknown_tool" } })
      ])
    );
    expect(gmStore.state.aiMemory.some((fact) => fact.text === "The moon key opens the observatory.")).toBe(true);
    const encounterProposal = gmStore.state.proposals.find((proposal) => proposal.title === "Encounter: Mirror Knight");
    expect(encounterProposal?.changesJson[0]).toEqual(expect.objectContaining({ entity: "encounter", action: "create" }));
    expect(gmStore.state.proposals.find((proposal) => proposal.title === "Journal: Mirror Clue")?.changesJson[0]).toEqual(expect.objectContaining({ entity: "journal", action: "create" }));
    expect(gmStore.state.proposals.find((proposal) => proposal.title === "Scene: Mirror Annex")?.changesJson[0]).toEqual(expect.objectContaining({ entity: "scene", action: "create" }));
    expect(gmStore.state.proposals.find((proposal) => proposal.title === "Token: Valen Ash")?.changesJson[0]).toEqual(expect.objectContaining({ entity: "token", action: "update", id: "tok_valen", data: expect.objectContaining({ x: 220, y: 240 }) }));
    expect(gmStore.state.proposals.find((proposal) => proposal.title === "Actor: Valen Ash")?.changesJson[0]).toEqual(expect.objectContaining({ entity: "actor", action: "update", id: "act_valen" }));
    expect(gmStore.state.rolls).toHaveLength(1);
    expect(gmStore.state.chat.some((message) => message.body.includes("AI Perception: 1d20+5"))).toBe(true);

    const observedToolCalls = await gmApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/ai/tool-calls",
      headers: authHeaders
    });
    expect(observedToolCalls.statusCode).toBe(200);
    expect(observedToolCalls.json().map((call: { toolName: string }) => call.toolName)).toEqual(
      expect.arrayContaining(["read_compendium", "create_memory", "draft_encounter", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "roll_dice", "unknown_tool"])
    );
    expect(gmStore.state.aiToolCalls.find((call) => call.toolName === "unknown_tool" && call.status === "failed")?.output).toEqual({
      error: "unknown_tool",
      toolName: "unknown_tool"
    });
    expect(gmStore.state.aiToolCalls.find((call) => call.toolName === "draft_encounter" && call.status === "completed")?.durationMs).toEqual(expect.any(Number));

    const blockedToolCalls = await gmApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/ai/tool-calls",
      headers: { "x-user-id": "usr_demo_player" }
    });
    expect(blockedToolCalls.statusCode).toBe(403);
    await gmApp.close();

    const playerProvider = new ExpandedToolProvider();
    const playerStore = new MemoryStateStore();
    const playerApp = await buildApp({ store: playerStore, aiProvider: playerProvider });
    const playerThread = await playerApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: { "x-user-id": "usr_demo_player" },
      payload: { prompt: "Try expanded tools as a player." }
    });
    expect(playerThread.statusCode).toBe(200);
    const playerCompleted = playerThread.json().events.filter((event: { type: string }) => event.type === "tool.completed");
    expect(playerCompleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "create_memory", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_encounter", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_journal_entry", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_scene", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_token_update", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_actor_update", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "read_compendium", output: expect.objectContaining({ systemId: "generic-fantasy" }) }),
        expect.objectContaining({ toolName: "roll_dice", output: expect.objectContaining({ formula: "1d20+5" }) })
      ])
    );
    expect(playerStore.state.aiMemory.some((fact) => fact.text === "The moon key opens the observatory.")).toBe(false);
    expect(playerStore.state.proposals.some((proposal) => proposal.title === "Encounter: Mirror Knight")).toBe(false);
    expect(playerStore.state.rolls).toHaveLength(1);
    await playerApp.close();
  });

  it("requires underlying campaign permissions for ai campaign-edit proposal tools", async () => {
    class RestrictedEditProvider implements AiProvider {
      id = "restricted-edit-ai";
      label = "Restricted Edit AI";

      async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        yield {
          type: "tool.started",
          toolName: "create_proposal",
          input: {
            title: "Restricted Journal Proposal",
            summary: "A generic proposal should still honor the underlying journal permission.",
            changes: [
              {
                entity: "journal",
                action: "create",
                data: {
                  title: "Restricted Note",
                  body: "This should not be proposed by a user without journal.create."
                }
              }
            ]
          }
        };
        yield { type: "tool.started", toolName: "draft_encounter", input: { name: "Restricted Encounter", summary: "Requires campaign update." } };
        yield { type: "tool.started", toolName: "draft_journal_entry", input: { title: "Restricted Note", body: "Requires journal create." } };
        yield { type: "tool.started", toolName: "draft_scene", input: { name: "Restricted Scene" } };
        yield { type: "tool.started", toolName: "draft_token_update", input: { tokenId: "tok_valen", x: 300 } };
        yield { type: "tool.started", toolName: "draft_actor_update", input: { actorId: "act_valen", data: { hp: { current: 1 } } } };
        yield { type: "message.completed", content: "Restricted edits requested" };
      }
    }

    const store = new MemoryStateStore();
    store.state.permissionGrants.push(
      createTimestamped("grant", {
        subjectType: "user" as const,
        subjectId: "usr_demo_player",
        campaignId: "camp_demo",
        permissions: ["ai.proposeChanges"]
      })
    );
    const app = await buildApp({ store, aiProvider: new RestrictedEditProvider() });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: { "x-user-id": "usr_demo_player" },
      payload: { prompt: "Try to propose edits without the underlying edit permissions." }
    });

    expect(response.statusCode).toBe(200);
    const completed = response.json().events.filter((event: { type: string }) => event.type === "tool.completed");
    expect(completed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "create_proposal", output: { error: "missing_permission", permission: "journal.create" } }),
        expect.objectContaining({ toolName: "draft_encounter", output: { error: "missing_permission", permission: "campaign.update" } }),
        expect.objectContaining({ toolName: "draft_journal_entry", output: { error: "missing_permission", permission: "journal.create" } }),
        expect.objectContaining({ toolName: "draft_scene", output: { error: "missing_permission", permission: "scene.create" } }),
        expect.objectContaining({ toolName: "draft_token_update", output: { error: "missing_permission", permission: "token.update" } }),
        expect.objectContaining({ toolName: "draft_actor_update", output: { error: "missing_permission", permission: "actor.update" } })
      ])
    );
    expect(store.state.proposals.some((proposal) => proposal.title.startsWith("Restricted"))).toBe(false);
    await app.close();
  });

  it("rejects malformed ai tool inputs without campaign side effects", async () => {
    class MalformedToolProvider implements AiProvider {
      id = "malformed-tool-ai";
      label = "Malformed Tool AI";

      async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        yield { type: "tool.started", toolName: "create_proposal", input: { rawArguments: "{not-json" } };
        yield { type: "tool.started", toolName: "draft_scene", input: { width: 900 } };
        yield { type: "tool.started", toolName: "draft_token_update", input: { tokenId: "tok_valen", x: "east" } };
        yield { type: "tool.started", toolName: "create_memory", input: "remember this" };
        yield { type: "tool.started", toolName: "unknown_tool", input: { title: "No such tool" } };
        yield { type: "message.completed", content: "Malformed tools requested" };
      }
    }

    const store = new MemoryStateStore();
    const beforeProposals = store.state.proposals.length;
    const beforeMemory = store.state.aiMemory.length;
    const beforeRolls = store.state.rolls.length;
    const app = await buildApp({ store, aiProvider: new MalformedToolProvider() });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: authHeaders,
      payload: { prompt: "Try malformed function-call inputs." }
    });

    expect(response.statusCode).toBe(200);
    const completed = response.json().events.filter((event: { type: string }) => event.type === "tool.completed");
    expect(completed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "create_proposal", output: expect.objectContaining({ error: "invalid_tool_input", message: "Missing required field: title" }) }),
        expect.objectContaining({ toolName: "draft_scene", output: expect.objectContaining({ error: "invalid_tool_input", message: "Missing required field: name" }) }),
        expect.objectContaining({ toolName: "draft_token_update", output: expect.objectContaining({ error: "invalid_tool_input", message: "Invalid field: x" }) }),
        expect.objectContaining({ toolName: "create_memory", output: expect.objectContaining({ error: "invalid_tool_input", message: "Tool input must be an object." }) }),
        expect.objectContaining({ toolName: "unknown_tool", output: { error: "unknown_tool", toolName: "unknown_tool" } })
      ])
    );
    expect(store.state.proposals).toHaveLength(beforeProposals);
    expect(store.state.aiMemory).toHaveLength(beforeMemory);
    expect(store.state.rolls).toHaveLength(beforeRolls);
    const failedToolNames = store.state.aiToolCalls.filter((call) => call.status === "failed").map((call) => call.toolName);
    expect(failedToolNames).toEqual(expect.arrayContaining(["create_proposal", "draft_scene", "draft_token_update", "create_memory", "unknown_tool"]));
    expect(store.state.aiToolCalls.some((call) => call.status === "completed" && ["create_proposal", "draft_scene", "draft_token_update", "create_memory", "unknown_tool"].includes(call.toolName))).toBe(false);
    await app.close();
  });

  it("approves and applies ai proposals and memory with permission boundaries", async () => {
    const now = "2026-05-01T00:00:00.000Z";
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_player",
      displayName: "Player",
      createdAt: now,
      updatedAt: now
    });
    store.state.members.push({
      id: "mem_player",
      campaignId: "camp_demo",
      userId: "usr_player",
      role: "player",
      createdAt: now,
      updatedAt: now
    });
    const app = await buildApp({ store });

    const encounterDraft = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      headers: authHeaders,
      payload: {
        prompt: "A mirror knight guarding the vault",
        difficulty: "hard"
      }
    });
    expect(encounterDraft.statusCode).toBe(200);
    const proposalId = encounterDraft.json().proposal.id as string;

    const blockedApply = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/apply`,
      headers: { "x-user-id": "usr_player" }
    });
    expect(blockedApply.statusCode).toBe(403);

    const unapprovedApply = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/apply`,
      headers: authHeaders
    });
    expect(unapprovedApply.statusCode).toBe(409);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/approve`,
      headers: authHeaders
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("approved");
    expect(approved.json().approvedByUserId).toBe("usr_demo_gm");

    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/apply`,
      headers: authHeaders
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().status).toBe("applied");
    expect(store.state.encounters.some((encounter) => encounter.name === "AI Draft Encounter" && encounter.difficulty === "hard")).toBe(true);

    const recap = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      headers: authHeaders,
      payload: { transcript: "The party mapped the lower vault." }
    });
    expect(recap.statusCode).toBe(200);
    const memoryId = recap.json().memory.id as string;

    const blockedMemoryApproval = await app.inject({
      method: "POST",
      url: `/api/v1/ai/memory/${memoryId}/approve`,
      headers: { "x-user-id": "usr_player" }
    });
    expect(blockedMemoryApproval.statusCode).toBe(403);

    const approvedMemory = await app.inject({
      method: "POST",
      url: `/api/v1/ai/memory/${memoryId}/approve`,
      headers: authHeaders
    });
    expect(approvedMemory.statusCode).toBe(200);
    expect(approvedMemory.json().approvedByUserId).toBe("usr_demo_gm");

    const memory = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/ai/memory",
      headers: authHeaders
    });
    expect(memory.json().some((fact: { id: string; approvedByUserId?: string }) => fact.id === memoryId && fact.approvedByUserId === "usr_demo_gm")).toBe(true);

    await app.close();
  });

  it("uploads a map asset, assigns it to a scene, and serves the stored bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-assets-"));
    const app = await buildApp({
      store: new MemoryStateStore(),
      uploadDir: directory
    });
    const bytes = Buffer.from("fake-image-bytes");

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true",
      headers: {
        ...authHeaders,
        "content-type": "image/png",
        "x-asset-name": encodeURIComponent("Vault Upload.png")
      },
      payload: bytes
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().asset.name).toBe("Vault Upload.png");
    expect(uploaded.json().asset.sizeBytes).toBe(bytes.length);
    expect(uploaded.json().asset.checksum).toMatch(/^sha256:/);
    expect(uploaded.json().asset.security).toMatchObject({
      status: "clean",
      scanner: "builtin-asset-scanner",
      findings: []
    });
    expect(uploaded.json().asset.storage).toMatchObject({
      provider: "local",
      key: expect.stringMatching(/^camp_demo\/asset_.+\.png$/)
    });
    expect(uploaded.json().scene.backgroundAssetId).toBe(uploaded.json().asset.id);

    const assetId = uploaded.json().asset.id as string;
    expect(existsSync(join(directory, "camp_demo", `${assetId}.png`))).toBe(true);

    const unauthenticatedBlob = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${assetId}/blob`
    });
    expect(unauthenticatedBlob.statusCode).toBe(401);

    const blob = await app.inject({
      method: "GET",
      url: `/api/v1/assets/${assetId}/blob?userId=usr_demo_gm`
    });
    expect(blob.statusCode).toBe(200);
    expect(blob.headers["content-type"]).toContain("image/png");
    expect(blob.body).toBe("fake-image-bytes");

    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("scans uploaded map assets before writing asset records or bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-asset-scan-"));
    const store = new MemoryStateStore();
    const app = await buildApp({
      store,
      uploadDir: directory
    });
    const cleanSvg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><text>passive</text></svg>");

    const clean = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload",
      headers: {
        ...authHeaders,
        "content-type": "image/svg+xml",
        "x-asset-name": encodeURIComponent("Passive.svg")
      },
      payload: cleanSvg
    });
    expect(clean.statusCode).toBe(200);
    const asset = clean.json().asset as MapAsset;
    expect(asset.security).toMatchObject({
      status: "clean",
      scanner: "builtin-asset-scanner",
      findings: []
    });
    expect(asset.security?.scannedAt).toBeTruthy();
    expect(existsSync(join(directory, "camp_demo", `${asset.id}.svg`))).toBe(true);

    const activeSvg = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload",
      headers: {
        ...authHeaders,
        "content-type": "image/svg+xml",
        "x-asset-name": encodeURIComponent("Active.svg")
      },
      payload: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(1)</script></svg>")
    });
    expect(activeSvg.statusCode).toBe(422);
    expect(activeSvg.json()).toMatchObject({
      error: "asset_security_blocked",
      scanner: "builtin-asset-scanner"
    });
    expect(activeSvg.json().findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "active_svg_content", severity: "high" })]));

    const eicar = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload",
      headers: {
        ...authHeaders,
        "content-type": "image/png",
        "x-asset-name": encodeURIComponent("Eicar.png")
      },
      payload: Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
    });
    expect(eicar.statusCode).toBe(422);
    expect(eicar.json().findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "malware_signature", severity: "high" })]));

    const html = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload",
      headers: {
        ...authHeaders,
        "content-type": "text/html",
        "x-asset-name": encodeURIComponent("exploit.html")
      },
      payload: Buffer.from("<!doctype html><script>alert(1)</script>")
    });
    expect(html.statusCode).toBe(422);
    expect(html.json().findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "disallowed_asset_type", severity: "high" })]));

    expect(store.state.assets).toHaveLength(1);

    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("issues signed CDN asset URLs, enforces quotas, and tracks lifecycle storage stats", async () => {
    const previousEnv = snapshotEnv([
      "OTTE_ADMIN_USER_IDS",
      "OTTE_ASSET_CDN_BASE_URL",
      "OTTE_ASSET_QUOTA_BYTES",
      "OTTE_ASSET_RETENTION_DAYS",
      "OTTE_ASSET_URL_SIGNING_SECRET",
      "OTTE_ASSET_URL_TTL_SECONDS",
      "OTTE_ASSET_URL_MAX_TTL_SECONDS"
    ]);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    process.env.OTTE_ASSET_CDN_BASE_URL = "https://cdn.example.test/otte";
    process.env.OTTE_ASSET_QUOTA_BYTES = "20";
    process.env.OTTE_ASSET_RETENTION_DAYS = "7";
    process.env.OTTE_ASSET_URL_SIGNING_SECRET = "test-asset-signing-secret";
    process.env.OTTE_ASSET_URL_TTL_SECONDS = "120";
    process.env.OTTE_ASSET_URL_MAX_TTL_SECONDS = "600";

    const directory = mkdtempSync(join(tmpdir(), "otte-delivery-"));
    const store = new MemoryStateStore();
    const app = await buildApp({
      store,
      uploadDir: directory
    });
    try {
      const bytes = Buffer.from("signed-asset");
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true",
        headers: {
          ...authHeaders,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Signed Delivery.png")
        },
        payload: bytes
      });
      expect(uploaded.statusCode).toBe(200);
      const asset = uploaded.json().asset as MapAsset;
      expect(asset.lifecycle?.status).toBe("active");
      expect(asset.lifecycle?.expiresAt).toBeTruthy();

      const invalidMetadataAsset = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets",
        headers: authHeaders,
        payload: { name: "Invalid Metadata Asset", sizeBytes: -1 }
      });
      expect(invalidMetadataAsset.statusCode).toBe(400);

      const overQuota = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...authHeaders,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Too Big.png")
        },
        payload: Buffer.from("over-quota")
      });
      expect(overQuota.statusCode).toBe(413);
      expect(overQuota.json()).toMatchObject({ error: "asset_quota_exceeded", quotaBytes: 20, usedBytes: bytes.length });

      const storage = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/assets/storage",
        headers: authHeaders
      });
      expect(storage.statusCode).toBe(200);
      expect(storage.json()).toMatchObject({
        campaignId: "camp_demo",
        assetCount: 1,
        activeAssetCount: 1,
        usedBytes: bytes.length,
        quotaBytes: 20,
        remainingBytes: 20 - bytes.length,
        lifecycleCounts: { active: 1 },
        providerCounts: { local: 1 }
      });

      const delivery = await app.inject({
        method: "POST",
        url: `/api/v1/assets/${asset.id}/delivery-url`,
        headers: authHeaders,
        payload: { expiresInSeconds: 180, disposition: "attachment" }
      });
      expect(delivery.statusCode).toBe(200);
      expect(delivery.json()).toMatchObject({ assetId: asset.id, ttlSeconds: 180, delivery: "cdn" });
      const signedUrl = new URL(delivery.json().url);
      expect(`${signedUrl.origin}${signedUrl.pathname}`).toBe(`https://cdn.example.test/otte/api/v1/assets/${asset.id}/blob`);
      expect(signedUrl.searchParams.get("signature")).toBeTruthy();
      expect(signedUrl.searchParams.get("expiresAt")).toBeTruthy();
      const signedApiPath = signedUrl.pathname.replace(/^\/otte/, "");

      const signedBlob = await app.inject({
        method: "GET",
        url: `${signedApiPath}${signedUrl.search}`
      });
      expect(signedBlob.statusCode).toBe(200);
      expect(signedBlob.headers["cache-control"]).toContain("public");
      expect(signedBlob.headers["content-disposition"]).toContain("attachment");
      expect(signedBlob.body).toBe(bytes.toString());

      signedUrl.searchParams.set("signature", "tampered");
      const tampered = await app.inject({
        method: "GET",
        url: `${signedApiPath}${signedUrl.search}`
      });
      expect(tampered.statusCode).toBe(401);

      const deleted = await app.inject({
        method: "PATCH",
        url: `/api/v1/assets/${asset.id}/lifecycle`,
        headers: authHeaders,
        payload: { status: "deleted", reason: "manual cleanup" }
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json().lifecycle).toMatchObject({ status: "deleted", updatedByUserId: "usr_demo_gm", reason: "manual cleanup" });

      const afterDelete = await app.inject({
        method: "GET",
        url: `${signedApiPath}${new URL(delivery.json().url).search}`
      });
      expect(afterDelete.statusCode).toBe(410);

      const postDeleteStorage = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/assets/storage",
        headers: authHeaders
      });
      expect(postDeleteStorage.statusCode).toBe(200);
      expect(postDeleteStorage.json()).toMatchObject({
        assetCount: 1,
        activeAssetCount: 0,
        usedBytes: 0,
        allBytes: bytes.length,
        lifecycleCounts: { deleted: 1 }
      });

      const adminStorage = await app.inject({
        method: "GET",
        url: "/api/v1/admin/assets/storage",
        headers: authHeaders
      });
      expect(adminStorage.statusCode).toBe(200);
      expect(adminStorage.json()).toMatchObject({
        assetCount: 1,
        activeAssetCount: 0,
        usedBytes: 0,
        allBytes: bytes.length,
        lifecycleCounts: { deleted: 1 },
        providerCounts: { local: 1 }
      });
    } finally {
      await app.close();
      restoreEnv(previousEnv);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("migrates stored assets and cleans up deleted asset objects", async () => {
    const previousEnv = snapshotEnv(["OTTE_ADMIN_USER_IDS"]);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    const directory = mkdtempSync(join(tmpdir(), "otte-asset-ops-"));
    const store = new MemoryStateStore();
    const targetStorage = new MemoryAssetStorage("migrated-assets");
    const bytes = Buffer.from("storage-migration-bytes");
    const asset: MapAsset = createTimestamped("asset", {
      campaignId: "camp_demo",
      name: "Migration Source.png",
      url: "",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      lifecycle: { status: "active" }
    });
    asset.url = `/api/v1/assets/${asset.id}/blob`;
    asset.storage = { provider: "local", key: assetStorageKey(asset) };
    mkdirSync(join(directory, asset.campaignId), { recursive: true });
    writeFileSync(join(directory, asset.campaignId, `${asset.id}.png`), bytes);
    store.state.assets.push(asset);
    const app = await buildApp({
      store,
      uploadDir: directory,
      assetStorage: targetStorage
    });
    try {
      const dryRun = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: authHeaders,
        payload: { assetIds: [asset.id], dryRun: true }
      });
      expect(dryRun.statusCode).toBe(200);
      expect(dryRun.json()).toMatchObject({ dryRun: true, targetProvider: "s3", planned: 1, migrated: 0, failed: 0, changed: false });
      expect(asset.storage).toEqual({ provider: "local", key: assetStorageKey(asset) });

      const migrated = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: authHeaders,
        payload: { assetIds: [asset.id] }
      });
      expect(migrated.statusCode).toBe(200);
      expect(migrated.json()).toMatchObject({ targetProvider: "s3", migrated: 1, planned: 0, failed: 0, changed: true });
      expect(asset.storage).toEqual({ provider: "s3", bucket: "migrated-assets", key: assetStorageKey(asset) });
      expect(targetStorage.objects.get(assetStorageKey(asset))?.toString()).toBe(bytes.toString());

      asset.lifecycle = { status: "deleted", updatedAt: "2026-01-01T00:00:00.000Z", reason: "test cleanup" };
      const cleanup = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/cleanup",
        headers: authHeaders,
        payload: { assetIds: [asset.id] }
      });
      expect(cleanup.statusCode).toBe(200);
      expect(cleanup.json()).toMatchObject({ deleted: 1, missingMarked: 0, failed: 0, changed: true });
      expect(targetStorage.objects.has(assetStorageKey(asset))).toBe(false);
      expect(asset.lifecycle).toMatchObject({
        status: "deleted",
        updatedByUserId: "usr_demo_gm",
        cleanupReason: "deleted_asset"
      });
      expect(asset.lifecycle.storageDeletedAt).toBeTruthy();

      const repeatedCleanup = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/cleanup",
        headers: authHeaders,
        payload: { assetIds: [asset.id] }
      });
      expect(repeatedCleanup.statusCode).toBe(200);
      expect(repeatedCleanup.json()).toMatchObject({ deleted: 0, skipped: 1, changed: false });
      expect(repeatedCleanup.json().results[0]).toMatchObject({ status: "skipped", reason: "storage_already_deleted" });

      const expiredBytes = Buffer.from("expired-storage-bytes");
      const expiredAsset: MapAsset = createTimestamped("asset", {
        campaignId: "camp_demo",
        name: "Expired Source.png",
        url: "",
        mimeType: "image/png",
        sizeBytes: expiredBytes.length,
        lifecycle: { status: "active", expiresAt: "2026-01-01T00:00:00.000Z" }
      });
      expiredAsset.url = `/api/v1/assets/${expiredAsset.id}/blob`;
      expiredAsset.storage = await targetStorage.put(expiredAsset, expiredBytes);
      store.state.assets.push(expiredAsset);
      const expiredCleanup = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/cleanup",
        headers: authHeaders,
        payload: { assetIds: [expiredAsset.id], includeExpired: true }
      });
      expect(expiredCleanup.statusCode).toBe(200);
      expect(expiredCleanup.json()).toMatchObject({ deleted: 1, failed: 0, changed: true });
      expect(expiredCleanup.json().results[0]).toMatchObject({ status: "deleted", reason: "expired_asset" });
      expect(targetStorage.objects.has(assetStorageKey(expiredAsset))).toBe(false);
      expect(expiredAsset.lifecycle).toMatchObject({ status: "active", cleanupReason: "expired_asset" });
    } finally {
      await app.close();
      restoreEnv(previousEnv);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("stores uploaded assets through S3-compatible storage and archives them from that backend", async () => {
    const sourceUploadDir = mkdtempSync(join(tmpdir(), "otte-s3-source-"));
    const targetUploadDir = mkdtempSync(join(tmpdir(), "otte-s3-target-"));
    const sourceStorage = new MemoryAssetStorage("source-assets");
    const targetStorage = new MemoryAssetStorage("target-assets");
    const sourceApp = await buildApp({
      store: new MemoryStateStore(),
      uploadDir: sourceUploadDir,
      assetStorage: sourceStorage
    });
    const assetBytes = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><text>storage-backed</text></svg>");

    const uploaded = await sourceApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true",
      headers: {
        ...authHeaders,
        "content-type": "image/svg+xml",
        "x-asset-name": encodeURIComponent("Storage Map.svg")
      },
      payload: assetBytes
    });
    expect(uploaded.statusCode).toBe(200);
    const asset = uploaded.json().asset as MapAsset;
    const expectedKey = `camp_demo/${asset.id}.svg`;
    expect(asset.storage).toEqual({ provider: "s3", bucket: "source-assets", key: expectedKey });
    expect(sourceStorage.objects.get(expectedKey)?.toString()).toBe(assetBytes.toString());
    expect(existsSync(join(sourceUploadDir, "camp_demo", `${asset.id}.svg`))).toBe(false);

    const blob = await sourceApp.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/blob?userId=usr_demo_gm`
    });
    expect(blob.statusCode).toBe(200);
    expect(blob.headers["content-type"]).toContain("image/svg+xml");
    expect(blob.body).toBe(assetBytes.toString());

    const exported = await sourceApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/export",
      headers: authHeaders
    });
    expect(exported.statusCode).toBe(200);
    const archive = exported.json();
    expect(archive.manifest.assetFileCount).toBe(1);
    expect(archive.files[0]).toMatchObject({
      assetId: asset.id,
      mimeType: "image/svg+xml",
      sizeBytes: assetBytes.length,
      encoding: "base64",
      data: assetBytes.toString("base64")
    });
    await sourceApp.close();

    const freshState: EngineState = emptyState();
    freshState.users.push({
      id: "usr_demo_gm",
      displayName: "Import Admin",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const targetStore = new MemoryStateStore(freshState);
    const targetApp = await buildApp({
      store: targetStore,
      uploadDir: targetUploadDir,
      assetStorage: targetStorage
    });
    const imported = await targetApp.inject({
      method: "POST",
      url: "/api/v1/import/campaign",
      headers: authHeaders,
      payload: archive
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().assetFiles).toBe(1);
    expect(targetStorage.objects.get(expectedKey)?.toString()).toBe(assetBytes.toString());

    const importedAssets = await targetApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/assets",
      headers: authHeaders
    });
    expect(importedAssets.statusCode).toBe(200);
    const importedAsset = importedAssets.json().find((item: MapAsset) => item.id === asset.id);
    expect(importedAsset.storage).toEqual({ provider: "s3", bucket: "target-assets", key: expectedKey });

    const importedBlob = await targetApp.inject({
      method: "GET",
      url: `/api/v1/assets/${asset.id}/blob?userId=usr_demo_gm`
    });
    expect(importedBlob.statusCode).toBe(200);
    expect(importedBlob.body).toBe(assetBytes.toString());

    await targetApp.close();
    rmSync(sourceUploadDir, { recursive: true, force: true });
    rmSync(targetUploadDir, { recursive: true, force: true });
  });

  it("persists campaign state across sqlite-backed store restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-api-"));
    const dbPath = join(directory, "state.sqlite");

    const firstStore = new SqliteStateStore(dbPath);
    const firstApp = await buildApp({ store: firstStore });
    const created = await firstApp.inject({
      method: "POST",
      url: "/api/v1/campaigns",
      headers: authHeaders,
      payload: {
        name: "Restart Safe Campaign",
        description: "Stored in SQLite"
      }
    });
    expect(created.statusCode).toBe(200);
    const campaignId = created.json().id;
    await firstApp.close();
    firstStore.close();

    const secondStore = new SqliteStateStore(dbPath);
    const secondApp = await buildApp({ store: secondStore });
    const campaigns = await secondApp.inject({
      method: "GET",
      url: "/api/v1/campaigns",
      headers: authHeaders
    });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().some((campaign: { id: string }) => campaign.id === campaignId)).toBe(true);
    await secondApp.close();
    secondStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("round-trips a campaign archive into a fresh instance with all MVP collections", async () => {
    const sourceUploadDir = mkdtempSync(join(tmpdir(), "otte-archive-source-"));
    const targetUploadDir = mkdtempSync(join(tmpdir(), "otte-archive-target-"));
    const sourceStore = new MemoryStateStore();
    sourceStore.state.permissionGrants.push({
      id: "grant_player_token_move",
      subjectType: "user",
      subjectId: "usr_demo_gm",
      campaignId: "camp_demo",
      permissions: ["token.move"],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const sourceApp = await buildApp({ store: sourceStore, uploadDir: sourceUploadDir });
    const assetBytes = Buffer.from("archive-image-bytes");
    const uploadedAsset = await sourceApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true",
      headers: {
        ...authHeaders,
        "content-type": "image/png",
        "x-asset-name": encodeURIComponent("Roundtrip Map.png")
      },
      payload: assetBytes
    });
    expect(uploadedAsset.statusCode).toBe(200);
    const uploadedAssetId = uploadedAsset.json().asset.id as string;
    await sourceApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/encounters",
      headers: authHeaders,
      payload: {
        id: "enc_roundtrip",
        name: "Roundtrip Encounter",
        summary: "Imported later",
        tokenIds: ["tok_valen"]
      }
    });
    const exported = await sourceApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/export",
      headers: authHeaders
    });
    expect(exported.statusCode).toBe(200);
    const archive = exported.json();
    expect(archive.manifest.assetFileCount).toBe(1);
    expect(archive.files).toHaveLength(1);
    expect(archive.files[0]).toMatchObject({
      assetId: uploadedAssetId,
      name: "Roundtrip Map.png",
      mimeType: "image/png",
      sizeBytes: assetBytes.length,
      encoding: "base64"
    });
    expect(archive.files[0].data).toBe(assetBytes.toString("base64"));
    await sourceApp.close();

    const freshState: EngineState = emptyState();
    freshState.users.push({
      id: "usr_demo_gm",
      displayName: "Import Admin",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const targetStore = new MemoryStateStore(freshState);
    const targetApp = await buildApp({ store: targetStore, uploadDir: targetUploadDir });
    const imported = await targetApp.inject({
      method: "POST",
      url: "/api/v1/import/campaign",
      headers: authHeaders,
      payload: archive
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().importedCampaignIds).toEqual(["camp_demo"]);
    expect(imported.json().assetFiles).toBe(1);

    const importedScenes = await targetApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/scenes",
      headers: authHeaders
    });
    const importedTokens = await targetApp.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: authHeaders
    });
    const importedActors = await targetApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/actors",
      headers: authHeaders
    });
    const importedJournals = await targetApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/journal",
      headers: authHeaders
    });
    const importedAssets = await targetApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/assets",
      headers: authHeaders
    });
    const importedEncounters = await targetApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/encounters",
      headers: authHeaders
    });

    expect(importedScenes.json().map((scene: { id: string }) => scene.id)).toContain("scn_vault_entry");
    expect(importedScenes.json().find((scene: { id: string }) => scene.id === "scn_vault_entry").backgroundAssetId).toBe(uploadedAssetId);
    expect(importedTokens.json().map((token: { id: string }) => token.id)).toContain("tok_valen");
    expect(importedActors.json().map((actor: { id: string }) => actor.id)).toContain("act_valen");
    expect(importedJournals.json().map((journal: { id: string }) => journal.id)).toContain("jnl_hook");
    expect(importedAssets.json().map((asset: { name: string }) => asset.name)).toContain("Roundtrip Map.png");
    expect(importedEncounters.json().map((encounter: { name: string }) => encounter.name)).toContain("Roundtrip Encounter");
    expect(targetStore.state.permissionGrants.map((grant) => grant.id)).toContain("grant_player_token_move");

    const importedBlob = await targetApp.inject({
      method: "GET",
      url: `/api/v1/assets/${uploadedAssetId}/blob?userId=usr_demo_gm`
    });
    expect(importedBlob.statusCode).toBe(200);
    expect(importedBlob.headers["content-type"]).toContain("image/png");
    expect(importedBlob.body).toBe("archive-image-bytes");
    expect(existsSync(join(targetUploadDir, "camp_demo", `${uploadedAssetId}.png`))).toBe(true);

    await targetApp.close();
    rmSync(sourceUploadDir, { recursive: true, force: true });
    rmSync(targetUploadDir, { recursive: true, force: true });
  });
});
