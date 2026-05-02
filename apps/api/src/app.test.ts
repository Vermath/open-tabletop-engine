import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import { createTimestamped, emptyState, isPointInsideVisionPolygon, isPointInsideVisionPolygons, permissionsForRole, type AssetStorageRef, type EngineState, type MapAsset, type VisionSnapshot } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { assetStorageKey, type AssetStorage } from "./asset-storage.js";
import { buildApp } from "./app.js";
import { loadPluginRegistry, pluginSignatureForPackage } from "./plugin-runtime.js";
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

function writeVersionedPluginPackage(pluginRoot: string, packageId: string, pluginId: string, version: string, body: string): void {
  const packagePath = join(pluginRoot, packageId);
  mkdirSync(packagePath);
  writeFileSync(
    join(packagePath, "plugin.manifest.json"),
    JSON.stringify({
      id: pluginId,
      name: "Versioned Plugin",
      version,
      compatibleCore: ">=0.1.0",
      entrypoints: { server: "./server.js" },
      runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: ["chat.write"],
      chatCommands: [{ command: "/version", description: "Report the installed plugin version" }]
    })
  );
  writeFileSync(join(packagePath, "server.js"), `registerCommand("/version", () => ({ body: ${JSON.stringify(body)}, visibility: "public" }));`);
}

function writePluginSignature(pluginRoot: string, packageId: string, keyId: string, secret: string): void {
  const packagePath = join(pluginRoot, packageId);
  const manifestPath = join(packagePath, "plugin.manifest.json");
  const serverPath = join(packagePath, "server.js");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { id: string; version: string };
  const manifestChecksum = `sha256:${createHash("sha256").update(readFileSync(manifestPath)).digest("hex")}`;
  const sourceChecksum = `sha256:${createHash("sha256").update(readFileSync(serverPath)).digest("hex")}`;
  writeFileSync(
    join(packagePath, "plugin.signature.json"),
    JSON.stringify({
      keyId,
      algorithm: "hmac-sha256",
      signature: pluginSignatureForPackage(manifest, manifestChecksum, sourceChecksum, secret)
    })
  );
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

async function waitForCondition(predicate: () => boolean | Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
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

      const adminSession = await app.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: adminHeaders
      });
      expect(adminSession.statusCode).toBe(200);
      expect(adminSession.json()).toMatchObject({ serverAdmin: true });

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
    scene.fogHistory = [];
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
    const hiddenFogId = hidden.json().fog.at(-1).id as string;

    const blockedPlayerHistory = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/fog/history",
      headers: playerHeaders
    });
    expect(blockedPlayerHistory.statusCode).toBe(403);

    const blockedPlayerUndo = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog/undo",
      headers: playerHeaders,
      payload: {}
    });
    expect(blockedPlayerUndo.statusCode).toBe(403);

    const historyAfterCreate = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/fog/history",
      headers: authHeaders
    });
    expect(historyAfterCreate.statusCode).toBe(200);
    expect(historyAfterCreate.json().map((entry: { action: string; fogId: string }) => [entry.action, entry.fogId])).toEqual([
      ["create", revealed.json().fog.at(-1).id],
      ["create", hiddenFogId]
    ]);

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
      url: `/api/v1/scenes/scn_vault_entry/fog/${hiddenFogId}`,
      headers: authHeaders
    });
    expect(deletedFog.statusCode).toBe(200);
    expect(deletedFog.json().fog.some((region: { mode?: string }) => region.mode === "hide")).toBe(false);

    const historyAfterDelete = await app.inject({
      method: "GET",
      url: "/api/v1/scenes/scn_vault_entry/fog/history",
      headers: authHeaders
    });
    expect(historyAfterDelete.statusCode).toBe(200);
    expect(historyAfterDelete.json().at(-1)).toEqual(expect.objectContaining({ action: "delete", fogId: hiddenFogId }));

    const undoDelete = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog/undo",
      headers: authHeaders,
      payload: {}
    });
    expect(undoDelete.statusCode).toBe(200);
    expect(undoDelete.json().fog.some((region: { id: string; mode?: string }) => region.id === hiddenFogId && region.mode === "hide")).toBe(true);
    expect(undoDelete.json().fogHistory.at(-1)).toEqual(expect.objectContaining({ action: "undo", fogId: hiddenFogId, targetHistoryId: historyAfterDelete.json().at(-1).id }));

    const undoCreate = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog/undo",
      headers: authHeaders,
      payload: {}
    });
    expect(undoCreate.statusCode).toBe(200);
    expect(undoCreate.json().fog.some((region: { id: string }) => region.id === hiddenFogId)).toBe(false);
    expect(store.state.auditLogs.some((entry) => entry.action === "scene.fog.undo" && entry.targetId === hiddenFogId)).toBe(true);

    await app.close();
  });

  it("saves and applies multi-scene fog presets", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.fog = [];
    scene.fogHistory = [];
    const app = await buildApp({ store });
    const playerHeaders = { "x-user-id": "usr_demo_player" };

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
    const hidden = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: authHeaders,
      payload: { x: 825, y: 335, radius: 70, mode: "hide" }
    });
    expect(hidden.statusCode).toBe(200);

    const blockedPlayerPreset = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/fog-presets",
      headers: playerHeaders,
      payload: { name: "Player preset", sceneId: "scn_vault_entry" }
    });
    expect(blockedPlayerPreset.statusCode).toBe(403);

    const preset = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/fog-presets",
      headers: authHeaders,
      payload: { name: "Vault fog", sceneId: "scn_vault_entry" }
    });
    expect(preset.statusCode).toBe(200);
    expect(preset.json()).toEqual(expect.objectContaining({ name: "Vault fog", sourceSceneId: "scn_vault_entry" }));
    expect(preset.json().regions).toHaveLength(2);
    expect(preset.json().regions.some((region: { id?: string }) => region.id)).toBe(false);

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/fog-presets",
      headers: authHeaders
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().map((item: { name: string }) => item.name)).toEqual(["Vault fog"]);

    const targetScene = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/scenes",
      headers: authHeaders,
      payload: { name: "Mirror Vault", fog: [{ id: "fog_old", x: 100, y: 100, radius: 30, hidden: false }] }
    });
    expect(targetScene.statusCode).toBe(200);
    const targetSceneId = targetScene.json().id as string;

    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/scenes/${targetSceneId}/fog/apply-preset`,
      headers: authHeaders,
      payload: { presetId: preset.json().id, mode: "replace" }
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().fog).toHaveLength(2);
    expect(applied.json().fog.map((region: { mode?: string }) => region.mode).sort()).toEqual(["hide", "reveal"]);
    expect(applied.json().fog.some((region: { id: string }) => region.id === "fog_old")).toBe(false);
    expect(applied.json().fog.every((region: { id: string }) => region.id.startsWith("fog_"))).toBe(true);
    expect(applied.json().fogHistory.map((entry: { action: string }) => entry.action)).toEqual(["delete", "create", "create"]);

    const blockedPlayerApply = await app.inject({
      method: "POST",
      url: `/api/v1/scenes/${targetSceneId}/fog/apply-preset`,
      headers: playerHeaders,
      payload: { presetId: preset.json().id }
    });
    expect(blockedPlayerApply.statusCode).toBe(403);

    const deletedPreset = await app.inject({
      method: "DELETE",
      url: `/api/v1/campaigns/camp_demo/fog-presets/${preset.json().id}`,
      headers: authHeaders
    });
    expect(deletedPreset.statusCode).toBe(200);
    expect(store.state.fogPresets).toHaveLength(0);
    expect(store.state.auditLogs.some((entry) => entry.action === "scene.fogPreset.create" && entry.targetId === preset.json().id)).toBe(true);
    expect(store.state.auditLogs.some((entry) => entry.action === "scene.fogPreset.apply" && entry.targetId === preset.json().id)).toBe(true);
    expect(store.state.auditLogs.some((entry) => entry.action === "scene.fogPreset.delete" && entry.targetId === preset.json().id)).toBe(true);

    await app.close();
  });

  it("smooths freehand fog brush strokes through the fog route", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.fog = [];
    scene.fogHistory = [];
    const app = await buildApp({ store });
    const rawStroke = Array.from({ length: 86 }, (_, index) => ({
      x: 140 + index * 9,
      y: 300 + Math.cos(index / 2) * 16 + (index % 2 === 0 ? 8 : -8)
    }));

    const brushed = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: authHeaders,
      payload: {
        shape: "brush",
        mode: "hide",
        brushRadius: 46,
        points: rawStroke
      }
    });

    expect(brushed.statusCode).toBe(200);
    const region = brushed.json().fog.at(-1) as { shape: string; mode: string; radius: number; points: Array<{ x: number; y: number }> };
    expect(region).toEqual(expect.objectContaining({ shape: "polygon", mode: "hide", radius: 46 }));
    expect(region.points.length).toBeGreaterThan(8);
    expect(region.points.length).toBeLessThanOrEqual(64);
    expect(region.points.length).toBeLessThan(rawStroke.length);
    expect(isPointInsideVisionPolygon({ x: 480, y: 300 }, region.points)).toBe(true);
    expect(brushed.json().fogHistory.at(-1)).toEqual(expect.objectContaining({ action: "create" }));

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
    const spellRollId = `spell-${learnedSpell.json().item.id}-healing`;
    expect(learnedSpell.json().sheet.quickRolls).toContainEqual({
      id: spellRollId,
      label: "Healing Word Healing",
      formula: "1d4+2"
    });

    const learnedWeapon = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/compendium",
      headers: authHeaders,
      payload: { entryId: "longsword" }
    });
    expect(learnedWeapon.statusCode).toBe(200);
    expect(learnedWeapon.json().item).toEqual(expect.objectContaining({ type: "item", name: "Longsword", actorId: "act_valen" }));
    const weaponRollId = `item-${learnedWeapon.json().item.id}-damage`;
    expect(learnedWeapon.json().sheet.quickRolls).toEqual(
      expect.arrayContaining([
        { id: weaponRollId, label: "Longsword Damage", formula: "1d8+2" },
        { id: `item-${learnedWeapon.json().item.id}-versatile-damage`, label: "Longsword Versatile Damage", formula: "1d10+2" },
        { id: spellRollId, label: "Healing Word Healing", formula: "1d4+2" }
      ])
    );

    const weaponActionRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: authHeaders,
      payload: { rollId: weaponRollId }
    });
    expect(weaponActionRoll.statusCode).toBe(200);
    expect(weaponActionRoll.json().quickRoll).toEqual({ id: weaponRollId, label: "Longsword Damage", formula: "1d8+2" });
    expect(store.state.chat.some((message) => message.body.includes("Valen Ash Longsword Damage"))).toBe(true);

    const spellActionRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: authHeaders,
      payload: { rollId: spellRollId }
    });
    expect(spellActionRoll.statusCode).toBe(200);
    expect(spellActionRoll.json().quickRoll).toEqual({ id: spellRollId, label: "Healing Word Healing", formula: "1d4+2" });
    expect(store.state.chat.some((message) => message.body.includes("Valen Ash Healing Word Healing"))).toBe(true);

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

  it("supports a second rules system with its own compendium, sheet, conditions, and rolls", async () => {
    const store = new MemoryStateStore();
    store.state.users.push(
      createTimestamped("usr", {
        id: "usr_observer",
        displayName: "Observer"
      })
    );
    store.state.members.push(
      createTimestamped("mem", {
        campaignId: "camp_demo",
        userId: "usr_observer",
        role: "observer" as const
      })
    );
    const app = await buildApp({ store });

    try {
      const systems = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems",
        headers: authHeaders
      });
      expect(systems.statusCode).toBe(200);
      expect(systems.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "dnd-5e-srd", active: true }),
          expect.objectContaining({ id: "generic-fantasy", active: false }),
          expect.objectContaining({ id: "stellar-frontiers", active: false }),
          expect.objectContaining({ id: "mystic-noir", active: false })
        ])
      );

      const install = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/install",
        headers: authHeaders
      });
      expect(install.statusCode).toBe(200);
      expect(install.json().campaign.defaultSystemId).toBe("stellar-frontiers");

      const actor = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "stellar-frontiers",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "Nova Quill",
          data: {
            aptitudes: { combat: 2, tech: 3, pilot: 1, science: 2, charm: 0 },
            strain: { current: 3, max: 6 },
            conditions: []
          }
        }
      });
      expect(actor.statusCode).toBe(200);
      const actorId = actor.json().id;

      const compendium = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/compendium",
        headers: authHeaders
      });
      expect(compendium.statusCode).toBe(200);
      expect(compendium.json().entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "laser-carbine", type: "gear" }),
          expect.objectContaining({ id: "overclock", type: "talent" }),
          expect.objectContaining({ id: "jammed", type: "condition" })
        ])
      );

      const sheet = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/sheet`,
        headers: authHeaders
      });
      expect(sheet.statusCode).toBe(200);
      expect(sheet.json()).toMatchObject({
        systemId: "stellar-frontiers",
        actorId,
        summary: expect.stringContaining("Nova Quill")
      });
      expect(sheet.json().quickRolls).toContainEqual({
        id: "aptitude-tech",
        label: "Tech Check",
        formula: "1d20+3"
      });

      const learnedTalent = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "overclock" }
      });
      expect(learnedTalent.statusCode).toBe(200);
      expect(learnedTalent.json().item).toEqual(expect.objectContaining({ type: "talent", name: "Overclock", actorId }));
      expect(learnedTalent.json().sheet.talents).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Overclock" })]));
      const talentRollId = `talent-${learnedTalent.json().item.id}-boost`;
      expect(learnedTalent.json().sheet.quickRolls).toContainEqual({
        id: talentRollId,
        label: "Overclock Boost",
        formula: "1d6+3"
      });

      const learnedGear = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "laser-carbine" }
      });
      expect(learnedGear.statusCode).toBe(200);
      expect(learnedGear.json().item).toEqual(expect.objectContaining({ type: "gear", name: "Laser Carbine", actorId }));
      const gearRollId = `gear-${learnedGear.json().item.id}-damage`;
      expect(learnedGear.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          { id: talentRollId, label: "Overclock Boost", formula: "1d6+3" },
          { id: gearRollId, label: "Laser Carbine Damage", formula: "1d8+2" }
        ])
      );

      const talentActionRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/roll`,
        headers: authHeaders,
        payload: { rollId: talentRollId }
      });
      expect(talentActionRoll.statusCode).toBe(200);
      expect(talentActionRoll.json().quickRoll).toEqual({ id: talentRollId, label: "Overclock Boost", formula: "1d6+3" });
      expect(store.state.chat.some((message) => message.body.includes("Nova Quill Overclock Boost"))).toBe(true);

      const gearActionRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/roll`,
        headers: authHeaders,
        payload: { rollId: gearRollId }
      });
      expect(gearActionRoll.statusCode).toBe(200);
      expect(gearActionRoll.json().quickRoll).toEqual({ id: gearRollId, label: "Laser Carbine Damage", formula: "1d8+2" });
      expect(store.state.chat.some((message) => message.body.includes("Nova Quill Laser Carbine Damage"))).toBe(true);

      const lockedIn = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/conditions`,
        headers: authHeaders,
        payload: { conditionId: "locked-in" }
      });
      expect(lockedIn.statusCode).toBe(200);
      expect(lockedIn.json().sheet.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "locked-in", name: "Locked In" })]));
      expect(lockedIn.json().sheet.quickRolls).toContainEqual({
        id: "aptitude-tech",
        label: "Tech Check",
        formula: "1d20+3+1d6"
      });

      const jammed = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/conditions`,
        headers: authHeaders,
        payload: { conditionId: "jammed" }
      });
      expect(jammed.statusCode).toBe(200);
      expect(jammed.json().sheet.quickRolls).toContainEqual({
        id: "aptitude-tech",
        label: "Tech Check",
        formula: "2d20kl1+3+1d6"
      });

      const roll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/roll`,
        headers: authHeaders,
        payload: { rollId: "aptitude-tech" }
      });
      expect(roll.statusCode).toBe(200);
      expect(roll.json().quickRoll.formula).toBe("2d20kl1+3+1d6");
      expect(store.state.chat.some((message) => message.body.includes("Nova Quill Tech Check"))).toBe(true);

      const observerRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${actorId}/roll`,
        headers: { "x-user-id": "usr_observer" },
        payload: { rollId: "aptitude-tech" }
      });
      expect(observerRoll.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("supports a third rules system with investigation compendium, sheets, conditions, and rolls", async () => {
    const store = new MemoryStateStore();
    store.state.users.push(
      createTimestamped("usr", {
        id: "usr_observer",
        displayName: "Observer"
      })
    );
    store.state.members.push(
      createTimestamped("mem", {
        campaignId: "camp_demo",
        userId: "usr_observer",
        role: "observer" as const
      })
    );
    const app = await buildApp({ store });

    try {
      const install = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/install",
        headers: authHeaders
      });
      expect(install.statusCode).toBe(200);
      expect(install.json().campaign.defaultSystemId).toBe("mystic-noir");

      const actor = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "mystic-noir",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "Mara Vale",
          data: {
            rank: 1,
            archetype: "Field Investigator",
            skills: { investigation: 3, resolve: 2, influence: 1, stealth: 2, occult: 1 },
            composure: { current: 4, max: 6 },
            conditions: []
          }
        }
      });
      expect(actor.statusCode).toBe(200);
      const actorId = actor.json().id;

      const compendium = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/compendium",
        headers: authHeaders
      });
      expect(compendium.statusCode).toBe(200);
      expect(compendium.json().entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "case-notebook", type: "clue" }),
          expect.objectContaining({ id: "warding-rite", type: "ritual" }),
          expect.objectContaining({ id: "shaken", type: "condition" })
        ])
      );

      const sheet = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/sheet`,
        headers: authHeaders
      });
      expect(sheet.statusCode).toBe(200);
      expect(sheet.json()).toMatchObject({
        systemId: "mystic-noir",
        actorId,
        summary: expect.stringContaining("Mara Vale")
      });
      expect(sheet.json().quickRolls).toContainEqual({
        id: "skill-investigation",
        label: "Investigation Check",
        formula: "1d20+3"
      });

      const notebook = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "case-notebook" }
      });
      expect(notebook.statusCode).toBe(200);
      expect(notebook.json().item).toEqual(expect.objectContaining({ type: "clue", name: "Case Notebook", actorId }));
      expect(notebook.json().sheet.clues).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Case Notebook" })]));
      const notebookRollId = `clue-${notebook.json().item.id}-insight`;
      expect(notebook.json().sheet.quickRolls).toContainEqual({
        id: notebookRollId,
        label: "Case Notebook Insight",
        formula: "1d4+3"
      });

      const rite = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "warding-rite" }
      });
      expect(rite.statusCode).toBe(200);
      expect(rite.json().item).toEqual(expect.objectContaining({ type: "ritual", name: "Warding Rite", actorId }));
      expect(rite.json().sheet.rituals).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Warding Rite" })]));
      const riteRollId = `ritual-${rite.json().item.id}-ward`;
      expect(rite.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          { id: notebookRollId, label: "Case Notebook Insight", formula: "1d4+3" },
          { id: riteRollId, label: "Warding Rite Ward", formula: "1d6+2" }
        ])
      );

      const actionRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/roll`,
        headers: authHeaders,
        payload: { rollId: notebookRollId }
      });
      expect(actionRoll.statusCode).toBe(200);
      expect(actionRoll.json().quickRoll).toEqual({ id: notebookRollId, label: "Case Notebook Insight", formula: "1d4+3" });
      expect(store.state.chat.some((message) => message.body.includes("Mara Vale Case Notebook Insight"))).toBe(true);

      const focused = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/conditions`,
        headers: authHeaders,
        payload: { conditionId: "focused" }
      });
      expect(focused.statusCode).toBe(200);
      expect(focused.json().sheet.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "focused", name: "Focused" })]));
      expect(focused.json().sheet.quickRolls).toContainEqual({
        id: "skill-investigation",
        label: "Investigation Check",
        formula: "1d20+3+1d4"
      });

      const shaken = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/conditions`,
        headers: authHeaders,
        payload: { conditionId: "shaken" }
      });
      expect(shaken.statusCode).toBe(200);
      expect(shaken.json().sheet.quickRolls).toContainEqual({
        id: "skill-investigation",
        label: "Investigation Check",
        formula: "2d20kl1+3+1d4"
      });

      const roll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/roll`,
        headers: authHeaders,
        payload: { rollId: "skill-investigation" }
      });
      expect(roll.statusCode).toBe(200);
      expect(roll.json().quickRoll.formula).toBe("2d20kl1+3+1d4");
      expect(store.state.chat.some((message) => message.body.includes("Mara Vale Investigation Check"))).toBe(true);

      const observerRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${actorId}/roll`,
        headers: { "x-user-id": "usr_observer" },
        payload: { rollId: "skill-investigation" }
      });
      expect(observerRoll.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("builds and advances characters from system templates", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const templates = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/character-templates",
        headers: authHeaders
      });
      expect(templates.statusCode).toBe(200);
      expect(templates.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "guardian", name: "Guardian" }),
          expect.objectContaining({ id: "mender", name: "Mender" })
        ])
      );

      const playerCreate = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters",
        headers: { "x-user-id": "usr_demo_player" },
        payload: { templateId: "guardian", name: "Player Built Guardian" }
      });
      expect(playerCreate.statusCode).toBe(403);

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters",
        headers: authHeaders,
        payload: { templateId: "guardian", name: "Edda Shield", ownerUserId: "usr_demo_player" }
      });
      expect(created.statusCode).toBe(200);
      expect(created.json().actor).toEqual(
        expect.objectContaining({
          systemId: "generic-fantasy",
          ownerUserId: "usr_demo_player",
          name: "Edda Shield"
        })
      );
      expect(created.json().items).toEqual([expect.objectContaining({ type: "item", name: "Longsword" })]);
      expect(created.json().sheet.inventory).toEqual([expect.objectContaining({ name: "Longsword" })]);
      const actorId = created.json().actor.id;

      const advancement = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${actorId}/advancement`,
        headers: authHeaders
      });
      expect(advancement.statusCode).toBe(200);
      expect(advancement.json().options).toContainEqual(expect.objectContaining({ id: "level-up", nextValue: 2 }));

      const advanced = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${actorId}/advance`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { optionId: "level-up" }
      });
      expect(advanced.statusCode).toBe(200);
      expect(advanced.json().actor.data.level).toBe(2);
      expect(advanced.json().actor.data.hp).toEqual({ current: 17, max: 17 });
      expect(advanced.json().actor.data.features).toEqual(expect.arrayContaining(["Guardian Level 2"]));

      const stellarTemplates = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/character-templates",
        headers: authHeaders
      });
      expect(stellarTemplates.statusCode).toBe(200);
      expect(stellarTemplates.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ship-tech", name: "Ship Tech" })]));

      const tech = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/characters",
        headers: authHeaders,
        payload: { templateId: "ship-tech", name: "Patch Mira", ownerUserId: "usr_demo_player" }
      });
      expect(tech.statusCode).toBe(200);
      expect(tech.json().items.map((item: { name: string }) => item.name)).toEqual(["Med Patch", "Overclock"]);
      expect(tech.json().sheet.talents).toEqual([expect.objectContaining({ name: "Overclock" })]);

      const promoted = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${tech.json().actor.id}/advance`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { optionId: "rank-up" }
      });
      expect(promoted.statusCode).toBe(200);
      expect(promoted.json().actor.data.rank).toBe(2);
      expect(promoted.json().actor.data.strain).toEqual({ current: 4, max: 7 });
      expect(promoted.json().actor.data.milestones).toEqual(expect.arrayContaining(["Rank 2 Field Promotion"]));

      const mysticTemplates = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/character-templates",
        headers: authHeaders
      });
      expect(mysticTemplates.statusCode).toBe(200);
      expect(mysticTemplates.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "field-investigator", name: "Field Investigator" })]));

      const investigator = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/characters",
        headers: authHeaders,
        payload: { templateId: "field-investigator", name: "Mara Vale", ownerUserId: "usr_demo_player" }
      });
      expect(investigator.statusCode).toBe(200);
      expect(investigator.json().items.map((item: { name: string }) => item.name)).toEqual(["Case Notebook"]);
      expect(investigator.json().sheet.clues).toEqual([expect.objectContaining({ name: "Case Notebook" })]);

      const breakthrough = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${investigator.json().actor.id}/advance`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { optionId: "case-breakthrough" }
      });
      expect(breakthrough.statusCode).toBe(200);
      expect(breakthrough.json().actor.data.rank).toBe(2);
      expect(breakthrough.json().actor.data.composure).toEqual({ current: 5, max: 7 });
      expect(breakthrough.json().actor.data.breakthroughs).toEqual(expect.arrayContaining(["Case 2 Breakthrough"]));
    } finally {
      await app.close();
    }
  });

  it("applies system rest recovery with permission boundaries", async () => {
    const store = new MemoryStateStore();
    store.state.users.push(
      createTimestamped("usr", {
        id: "usr_observer",
        displayName: "Observer"
      })
    );
    store.state.members.push(
      createTimestamped("mem", {
        campaignId: "camp_demo",
        userId: "usr_observer",
        role: "observer" as const
      })
    );
    const app = await buildApp({ store });

    try {
      const fantasy = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "generic-fantasy",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "Resting Mender",
          data: {
            class: "Mender",
            level: 2,
            attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
            hp: { current: 2, max: 12 },
            hitDice: { current: 1, max: 2, size: "d8" },
            resources: {
              fieldPrayer: { current: 0, max: 1, recovery: "long" },
              secondWind: { current: 0, max: 1, recovery: "short" }
            },
            spellSlots: { level1: { current: 0, max: 3, recovery: "long" } },
            conditions: [{ id: "blessed" }, { id: "poisoned" }, { id: "restrained" }]
          }
        }
      });
      expect(fantasy.statusCode).toBe(200);
      const fantasyActorId = fantasy.json().id;

      const observerRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${fantasyActorId}/rest`,
        headers: { "x-user-id": "usr_observer" },
        payload: { restType: "long" }
      });
      expect(observerRest.statusCode).toBe(403);

      const fantasyRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${fantasyActorId}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(fantasyRest.statusCode).toBe(200);
      expect(fantasyRest.json().rest).toEqual(
        expect.objectContaining({
          systemId: "generic-fantasy",
          actorId: fantasyActorId,
          restType: "long",
          removedConditions: expect.arrayContaining([expect.objectContaining({ id: "poisoned" }), expect.objectContaining({ id: "restrained" })])
        })
      );
      expect(fantasyRest.json().actor.data.hp).toEqual({ current: 12, max: 12 });
      expect(fantasyRest.json().actor.data.hitDice).toEqual({ current: 2, max: 2, size: "d8" });
      expect(fantasyRest.json().actor.data.resources).toEqual({
        fieldPrayer: { current: 1, max: 1, recovery: "long" },
        secondWind: { current: 1, max: 1, recovery: "short" }
      });
      expect(fantasyRest.json().actor.data.spellSlots).toEqual({ level1: { current: 3, max: 3, recovery: "long" } });
      expect(fantasyRest.json().sheet.conditions.map((condition: { id: string }) => condition.id)).toEqual(["blessed"]);
      expect(store.state.actors.find((actor) => actor.id === fantasyActorId)?.data.hp).toEqual({ current: 12, max: 12 });

      const mystic = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "mystic-noir",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "Resting Occultist",
          data: {
            rank: 1,
            archetype: "Occult Scholar",
            skills: { investigation: 2, resolve: 3, influence: 1, stealth: 1, occult: 4 },
            composure: { current: 1, max: 6 },
            resources: {
              ward: { current: 0, max: 1, recovery: "short" },
              lead: { current: 0, max: 2, recovery: "long" }
            },
            conditions: [{ id: "focused" }, { id: "shaken" }, { id: "marked" }]
          }
        }
      });
      expect(mystic.statusCode).toBe(200);
      const mysticActorId = mystic.json().id;

      const mysticRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/mystic-noir/actors/${mysticActorId}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(mysticRest.statusCode).toBe(200);
      expect(mysticRest.json().actor.data.composure).toEqual({ current: 3, max: 6 });
      expect(mysticRest.json().actor.data.resources).toEqual({
        ward: { current: 1, max: 1, recovery: "short" },
        lead: { current: 0, max: 2, recovery: "long" }
      });
      expect(mysticRest.json().sheet.conditions.map((condition: { id: string }) => condition.id)).toEqual(["marked"]);
      expect(mysticRest.json().rest.removedConditions.map((condition: { id: string }) => condition.id)).toEqual(["focused", "shaken"]);
    } finally {
      await app.close();
    }
  });

  it("spends system action resources with actor update permission", async () => {
    const store = new MemoryStateStore();
    store.state.users.push(
      createTimestamped("usr", {
        id: "usr_observer",
        displayName: "Observer"
      })
    );
    store.state.members.push(
      createTimestamped("mem", {
        campaignId: "camp_demo",
        userId: "usr_observer",
        role: "observer" as const
      })
    );
    const app = await buildApp({ store });

    try {
      const fantasy = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "generic-fantasy",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "Slot Mender",
          data: {
            class: "Mender",
            level: 2,
            attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
            hp: { current: 12, max: 12 },
            spellSlots: { level1: { current: 1, max: 2, recovery: "long" } },
            conditions: []
          }
        }
      });
      expect(fantasy.statusCode).toBe(200);
      const fantasyActorId = fantasy.json().id;

      const cureWounds = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${fantasyActorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "cure-wounds" }
      });
      expect(cureWounds.statusCode).toBe(200);
      const spellRollId = `spell-${cureWounds.json().item.id}-healing`;

      const observerSpend = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${fantasyActorId}/roll`,
        headers: { "x-user-id": "usr_observer" },
        payload: { rollId: spellRollId, consumeResources: true }
      });
      expect(observerSpend.statusCode).toBe(403);

      const spellUse = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${fantasyActorId}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: spellRollId, consumeResources: true }
      });
      expect(spellUse.statusCode).toBe(200);
      expect(spellUse.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }]);
      expect(spellUse.json().actor.data.spellSlots).toEqual({ level1: { current: 0, max: 2, recovery: "long" } });
      expect(store.state.actors.find((actor) => actor.id === fantasyActorId)?.data.spellSlots).toEqual({ level1: { current: 0, max: 2, recovery: "long" } });

      const depletedSpell = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${fantasyActorId}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: spellRollId, consumeResources: true }
      });
      expect(depletedSpell.statusCode).toBe(409);
      expect(depletedSpell.json().message).toBe("Insufficient level 1 spell slot");

      const tech = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/characters",
        headers: authHeaders,
        payload: { templateId: "ship-tech", name: "Charge Tech", ownerUserId: "usr_demo_player" }
      });
      expect(tech.statusCode).toBe(200);
      const techActorId = tech.json().actor.id;
      const medPatch = tech.json().items.find((item: { name: string }) => item.name === "Med Patch");
      const medPatchRollId = `gear-${medPatch.id}-healing`;

      const medPatchUse = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${techActorId}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: medPatchRollId, consumeResources: true }
      });
      expect(medPatchUse.statusCode).toBe(200);
      expect(medPatchUse.json().usage.consumed).toEqual([{ type: "itemQuantity", key: medPatch.id, label: "Med Patch", amount: 1, remaining: 0 }]);
      expect(medPatchUse.json().sheet.inventory.find((item: { id: string }) => item.id === medPatch.id).data.quantity).toBe(0);
      expect(store.state.items.find((item) => item.id === medPatch.id)?.data.quantity).toBe(0);

      const depletedMedPatch = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/stellar-frontiers/actors/${techActorId}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: medPatchRollId, consumeResources: true }
      });
      expect(depletedMedPatch.statusCode).toBe(409);
      expect(depletedMedPatch.json().message).toBe("Med Patch has no remaining uses");
    } finally {
      await app.close();
    }
  });

  it("applies system action damage and healing effects to target actor pools", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const source = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "generic-fantasy",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "Effect Mender",
          data: {
            class: "Mender",
            level: 2,
            attributes: { strength: 14, dexterity: 12, constitution: 13, intelligence: 10, wisdom: 13, charisma: 16 },
            hp: { current: 12, max: 12 },
            spellSlots: { level1: { current: 1, max: 1, recovery: "long" } },
            conditions: []
          }
        }
      });
      expect(source.statusCode).toBe(200);
      const sourceActorId = source.json().id;

      const target = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "generic-fantasy",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "Effect Target",
          data: {
            class: "Guard",
            level: 1,
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            hp: { current: 10, max: 10 },
            conditions: []
          }
        }
      });
      expect(target.statusCode).toBe(200);
      const targetActorId = target.json().id;

      const weapon = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${sourceActorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "longsword" }
      });
      expect(weapon.statusCode).toBe(200);
      const weaponRollId = `item-${weapon.json().item.id}-damage`;

      const spell = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${sourceActorId}/compendium`,
        headers: authHeaders,
        payload: { entryId: "healing-word" }
      });
      expect(spell.statusCode).toBe(200);
      const spellRollId = `spell-${spell.json().item.id}-healing`;

      const damage = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${sourceActorId}/roll`,
        headers: authHeaders,
        payload: { rollId: weaponRollId, applyEffect: true, targetActorId }
      });
      expect(damage.statusCode).toBe(200);
      const damageEffect = damage.json().effect as { amount: number; after: number };
      expect(damage.json().effect).toEqual(
        expect.objectContaining({
          type: "damage",
          targetActorId,
          targetActorName: "Effect Target",
          pool: "hp",
          before: 10,
          max: 10
        })
      );
      expect(damageEffect.after).toBe(Math.max(0, 10 - damageEffect.amount));
      expect(store.state.actors.find((actor) => actor.id === targetActorId)?.data.hp).toEqual({ current: damageEffect.after, max: 10 });

      const deniedHeal = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${sourceActorId}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: spellRollId, consumeResources: true, applyEffect: true, targetActorId }
      });
      expect(deniedHeal.statusCode).toBe(403);
      expect(store.state.actors.find((actor) => actor.id === targetActorId)?.data.hp).toEqual({ current: damageEffect.after, max: 10 });
      expect(store.state.actors.find((actor) => actor.id === sourceActorId)?.data.spellSlots).toEqual({ level1: { current: 1, max: 1, recovery: "long" } });

      const healing = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${sourceActorId}/roll`,
        headers: authHeaders,
        payload: { rollId: spellRollId, consumeResources: true, applyEffect: true, targetActorId }
      });
      expect(healing.statusCode).toBe(200);
      const healingEffect = healing.json().effect as { amount: number; after: number };
      expect(healing.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }]);
      expect(healing.json().effect).toEqual(
        expect.objectContaining({
          type: "healing",
          targetActorId,
          targetActorName: "Effect Target",
          pool: "hp",
          before: damageEffect.after,
          max: 10
        })
      );
      expect(healingEffect.after).toBe(Math.min(10, damageEffect.after + healingEffect.amount));
      expect(store.state.actors.find((actor) => actor.id === targetActorId)?.data.hp).toEqual({ current: healingEffect.after, max: 10 });
      expect(store.state.actors.find((actor) => actor.id === sourceActorId)?.data.spellSlots).toEqual({ level1: { current: 0, max: 1, recovery: "long" } });
    } finally {
      await app.close();
    }
  });

  it("supports the D&D 5.5e SRD system as a first-class rules runtime", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const systems = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems",
        headers: authHeaders
      });
      expect(systems.statusCode).toBe(200);
      expect(systems.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "dnd-5e-srd", name: "D&D 5.5e SRD" })]));

      const templates = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-templates",
        headers: authHeaders
      });
      expect(templates.statusCode).toBe(200);
      expect(templates.json().map((template: { id: string }) => template.id)).toEqual(["fighter", "barbarian", "bard", "cleric", "paladin", "druid", "ranger", "monk", "wizard", "rogue"]);

      const origins = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-origins",
        headers: authHeaders
      });
      expect(origins.statusCode).toBe(200);
      expect(origins.json().backgrounds.map((background: { id: string }) => background.id)).toEqual(["acolyte", "criminal", "sage", "soldier"]);
      expect(origins.json().species.map((species: { id: string }) => species.id)).toEqual(["dragonborn", "dwarf", "elf", "gnome", "goliath", "halfling", "human", "orc", "tiefling"]);

      const criminalOrc = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: {
          templateId: "wizard",
          name: "SRD Criminal Orc Wizard",
          backgroundId: "criminal",
          speciesId: "orc",
          abilityScoreIncreases: { dexterity: 2, constitution: 1 }
        }
      });
      expect(criminalOrc.statusCode).toBe(200);
      expect(criminalOrc.json().origins.background).toEqual(expect.objectContaining({ id: "criminal", feat: "Alert" }));
      expect(criminalOrc.json().origins.species).toEqual(expect.objectContaining({ id: "orc", traits: expect.arrayContaining(["Adrenaline Rush", "Relentless Endurance"]) }));
      expect(criminalOrc.json().actor.data).toEqual(
        expect.objectContaining({
          background: "Criminal",
          species: "Orc",
          skillProficiencies: ["sleight-of-hand", "stealth"],
          toolProficiencies: ["thieves-tools"],
          feats: ["Alert"],
          attributes: expect.objectContaining({ dexterity: 16, constitution: 15 }),
          resources: expect.objectContaining({ adrenalineRush: { current: 2, max: 2, recovery: "short" }, relentlessEndurance: { current: 1, max: 1, recovery: "long" } })
        })
      );
      expect(criminalOrc.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "skill-stealth", formula: "1d20+5" }),
          expect.objectContaining({ id: "tool-thieves-tools", formula: "1d20+5" })
        ])
      );

      const invalidOrigin = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: {
          templateId: "wizard",
          backgroundId: "criminal",
          abilityScoreIncreases: { strength: 2, constitution: 1 }
        }
      });
      expect(invalidOrigin.statusCode).toBe(400);
      expect(invalidOrigin.json().message).toContain("Criminal ability increases");

      const wizard = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "wizard", name: "SRD Wizard", ownerUserId: "usr_demo_player" }
      });
      expect(wizard.statusCode).toBe(200);
      expect(wizard.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Spellcasting", "Arcane Recovery"],
          resources: { arcaneRecovery: { current: 1, max: 1, recovery: "long" } },
          spellSlots: { level1: { current: 2, max: 2, recovery: "long" } }
        })
      );
      const storedWizard = store.state.actors.find((actor) => actor.id === wizard.json().actor.id)!;
      storedWizard.data = { ...storedWizard.data, spellSlots: { level1: { current: 0, max: 2, recovery: "long" } } };
      const arcaneRecoveryRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${wizard.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short", arcaneRecovery: { level1: 1 } }
      });
      expect(arcaneRecoveryRest.statusCode).toBe(200);
      expect(arcaneRecoveryRest.json().rest.recovered).toEqual(
        expect.objectContaining({
          spellSlots: { level1: 1 },
          arcaneRecovery: { totalLevels: 1, limit: 1 },
          resourcesSpent: { arcaneRecovery: 1 }
        })
      );
      expect(arcaneRecoveryRest.json().actor.data.resources).toEqual({ arcaneRecovery: { current: 0, max: 1, recovery: "long" } });
      expect(arcaneRecoveryRest.json().actor.data.spellSlots).toEqual({ level1: { current: 1, max: 2, recovery: "long" } });
      const depletedArcaneRecovery = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${wizard.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short", arcaneRecovery: { level1: 1 } }
      });
      expect(depletedArcaneRecovery.statusCode).toBe(409);
      expect(depletedArcaneRecovery.json().message).toContain("Arcane Recovery is unavailable");
      const wizardLongRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${wizard.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(wizardLongRest.statusCode).toBe(200);
      expect(wizardLongRest.json().actor.data.resources).toEqual({ arcaneRecovery: { current: 1, max: 1, recovery: "long" } });
      expect(wizardLongRest.json().actor.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });

      const barbarian = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "barbarian", name: "SRD Barbarian", ownerUserId: "usr_demo_player" }
      });
      expect(barbarian.statusCode).toBe(200);
      expect(barbarian.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Rage", "Unarmored Defense", "Weapon Mastery"],
          hitDice: { current: 1, max: 1, size: "d12" },
          resources: { rage: { current: 2, max: 2, recovery: "short" } },
          saveProficiencies: ["strength", "constitution"]
        })
      );
      expect(barbarian.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Spear"]);
      expect(barbarian.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-strength", formula: "1d20+5" }),
          expect.objectContaining({ id: "feature-rage", formula: "0", metadata: expect.objectContaining({ resource: "rage", damageBonus: 2, damageBonusRollId: "feature-rage-damage-bonus" }) }),
          expect.objectContaining({ id: "feature-rage-damage-bonus", formula: "2", metadata: expect.objectContaining({ bonusDamage: 2, damageType: "Weapon" }) })
        ])
      );

      const levelFiveBarbarian = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "barbarian", name: "SRD Level Five Barbarian", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveBarbarian.statusCode).toBe(200);
      let levelFiveBarbarianAdvance = levelFiveBarbarian;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveBarbarianAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveBarbarian.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveBarbarianAdvance.statusCode).toBe(200);
      }
      expect(levelFiveBarbarianAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Rage", "Danger Sense", "Reckless Attack", "Extra Attack", "Fast Movement"]),
          resources: { rage: { current: 2, max: 3, recovery: "short" } },
          combat: expect.objectContaining({ attacksPerAction: 2, fastMovement: { bonusFt: 10, armorRestriction: "not wearing Heavy armor" } })
        })
      );
      expect(levelFiveBarbarianAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-dexterity", formula: "1d20+1", metadata: { advantage: true, feature: "Danger Sense", exceptConditions: ["Incapacitated"] } }),
          expect.objectContaining({ id: "feature-reckless-attack", formula: "0", metadata: expect.objectContaining({ drawback: "attack rolls against you have Advantage during that time" }) }),
          expect.objectContaining({ id: "feature-rage-damage-bonus", formula: "2", metadata: expect.objectContaining({ bonusDamage: 2 }) })
        ])
      );

      const bard = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "bard", name: "SRD Bard", ownerUserId: "usr_demo_player" }
      });
      expect(bard.statusCode).toBe(200);
      expect(bard.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Bardic Inspiration", "Spellcasting"],
          hitDice: { current: 1, max: 1, size: "d8" },
          resources: { bardicInspiration: { current: 3, max: 3, recovery: "long" } },
          saveProficiencies: ["dexterity", "charisma"],
          skillProficiencies: ["performance", "persuasion", "perception"],
          spellSlots: { level1: { current: 2, max: 2, recovery: "long" } }
        })
      );
      expect(bard.json().sheet.spells.map((item: { name: string }) => item.name)).toEqual(["Healing Word"]);
      expect(bard.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Dagger"]);
      expect(bard.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-charisma", formula: "1d20+5" }),
          expect.objectContaining({ id: "skill-performance", formula: "1d20+5" }),
          expect.objectContaining({ id: "feature-bardic-inspiration", formula: "1d6", metadata: expect.objectContaining({ resource: "bardicInspiration", die: "d6", recovery: "long" }) }),
          expect.objectContaining({ label: "Healing Word Healing", formula: "1d4+3" })
        ])
      );

      const levelFiveBard = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "bard", name: "SRD Level Five Bard", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveBard.statusCode).toBe(200);
      let levelFiveBardAdvance = levelFiveBard;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveBardAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveBard.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveBardAdvance.statusCode).toBe(200);
      }
      expect(levelFiveBardAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Bardic Inspiration", "Jack of All Trades", "Font of Inspiration"]),
          resources: { bardicInspiration: { current: 3, max: 5, recovery: "short" } },
          spellSlots: {
            level1: { current: 2, max: 4, recovery: "long" },
            level2: { current: 2, max: 3, recovery: "long" },
            level3: { current: 2, max: 2, recovery: "long" }
          }
        })
      );
      expect(levelFiveBardAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "skill-athletics", formula: "1d20+0", metadata: { feature: "Jack of All Trades", bonus: 1 } }),
          expect.objectContaining({ id: "feature-bardic-inspiration", formula: "1d8", metadata: expect.objectContaining({ die: "d8", recovery: "short" }) }),
          expect.objectContaining({ id: "feature-font-of-inspiration", formula: "0", metadata: expect.objectContaining({ resource: "bardicInspiration" }) })
        ])
      );

      const paladin = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "paladin", name: "SRD Paladin", ownerUserId: "usr_demo_player" }
      });
      expect(paladin.statusCode).toBe(200);
      expect(paladin.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Lay On Hands", "Spellcasting", "Weapon Mastery"],
          hitDice: { current: 1, max: 1, size: "d10" },
          resources: { layOnHands: { current: 5, max: 5, recovery: "long" } },
          saveProficiencies: ["wisdom", "charisma"],
          skillProficiencies: ["athletics", "persuasion"],
          spellSlots: { level1: { current: 2, max: 2, recovery: "long" } }
        })
      );
      expect(paladin.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Longsword"]);
      expect(paladin.json().sheet.spells.map((item: { name: string }) => item.name)).toEqual(["Cure Wounds"]);
      expect(paladin.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-charisma", formula: "1d20+4" }),
          expect.objectContaining({ id: "skill-athletics", formula: "1d20+5" }),
          expect.objectContaining({ id: "feature-lay-on-hands-healing", formula: "5", metadata: expect.objectContaining({ resource: "layOnHands", pool: 5 }) })
        ])
      );

      const levelFivePaladin = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "paladin", name: "SRD Level Five Paladin", ownerUserId: "usr_demo_player" }
      });
      expect(levelFivePaladin.statusCode).toBe(200);
      let levelFivePaladinAdvance = levelFivePaladin;
      for (let level = 2; level <= 5; level += 1) {
        levelFivePaladinAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFivePaladin.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFivePaladinAdvance.statusCode).toBe(200);
      }
      expect(levelFivePaladinAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Lay On Hands", "Paladin's Smite", "Extra Attack", "Faithful Steed"]),
          resources: {
            layOnHands: { current: 5, max: 25, recovery: "long" },
            paladinsSmite: { current: 1, max: 1, recovery: "long" },
            faithfulSteed: { current: 1, max: 1, recovery: "long" }
          },
          spellSlots: {
            level1: { current: 2, max: 4, recovery: "long" },
            level2: { current: 2, max: 2, recovery: "long" }
          },
          combat: expect.objectContaining({ attacksPerAction: 2 })
        })
      );
      expect(levelFivePaladinAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-divine-smite-damage", formula: "2d8", metadata: expect.objectContaining({ freeCastResource: "paladinsSmite" }) }),
          expect.objectContaining({ id: "feature-faithful-steed", formula: "0", metadata: expect.objectContaining({ resource: "faithfulSteed" }) }),
          expect.objectContaining({ label: "Longsword Damage", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
        ])
      );

      const druid = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "druid", name: "SRD Druid", ownerUserId: "usr_demo_player" }
      });
      expect(druid.statusCode).toBe(200);
      expect(druid.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Spellcasting", "Druidic", "Primal Order"],
          hitDice: { current: 1, max: 1, size: "d8" },
          resources: {},
          saveProficiencies: ["intelligence", "wisdom"],
          skillProficiencies: ["nature", "survival"],
          spellSlots: { level1: { current: 2, max: 2, recovery: "long" } }
        })
      );
      expect(druid.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Quarterstaff"]);
      expect(druid.json().sheet.spells.map((item: { name: string }) => item.name)).toEqual(["Cure Wounds"]);
      expect(druid.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-wisdom", formula: "1d20+5" }),
          expect.objectContaining({ id: "skill-nature", formula: "1d20+3" }),
          expect.objectContaining({ id: "skill-survival", formula: "1d20+5" }),
          expect.objectContaining({ label: "Cure Wounds Healing", formula: "2d8+3" })
        ])
      );

      const levelFiveDruid = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "druid", name: "SRD Level Five Druid", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveDruid.statusCode).toBe(200);
      let levelFiveDruidAdvance = levelFiveDruid;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveDruidAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveDruidAdvance.statusCode).toBe(200);
      }
      expect(levelFiveDruidAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Wild Shape", "Wild Companion", "Druid Subclass", "Wild Resurgence"]),
          resources: {
            wildShape: { current: 2, max: 2, recovery: "short" },
            wildResurgence: { current: 1, max: 1, recovery: "long" }
          },
          spellSlots: {
            level1: { current: 2, max: 4, recovery: "long" },
            level2: { current: 2, max: 3, recovery: "long" },
            level3: { current: 2, max: 2, recovery: "long" }
          }
        })
      );
      expect(levelFiveDruidAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-wild-shape", formula: "0", metadata: expect.objectContaining({ resource: "wildShape", maxUses: 2, temporaryHitPoints: 5, durationHours: 2 }) }),
          expect.objectContaining({ id: "feature-wild-companion", formula: "0", metadata: expect.objectContaining({ spell: "Find Familiar", resource: "wildShape" }) }),
          expect.objectContaining({ id: "feature-wild-resurgence-wild-shape", formula: "0", metadata: expect.objectContaining({ restores: "wildShape", cost: "spell slot" }) }),
          expect.objectContaining({ id: "feature-wild-resurgence-spell-slot", formula: "0", metadata: expect.objectContaining({ resource: "wildResurgence", restores: "level1 spell slot" }) })
        ])
      );

      const ranger = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "ranger", name: "SRD Ranger", ownerUserId: "usr_demo_player" }
      });
      expect(ranger.statusCode).toBe(200);
      expect(ranger.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Spellcasting", "Favored Enemy", "Weapon Mastery"],
          hitDice: { current: 1, max: 1, size: "d10" },
          resources: { favoredEnemy: { current: 2, max: 2, recovery: "long" } },
          saveProficiencies: ["strength", "dexterity"],
          skillProficiencies: ["nature", "perception", "survival"],
          spellSlots: { level1: { current: 2, max: 2, recovery: "long" } }
        })
      );
      expect(ranger.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Longbow", "Scimitar", "Shortsword", "Studded Leather Armor"]);
      expect(ranger.json().sheet.spells.map((item: { name: string }) => item.name)).toEqual(["Hunter's Mark", "Cure Wounds"]);
      expect(ranger.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-dexterity", formula: "1d20+5" }),
          expect.objectContaining({ id: "skill-perception", formula: "1d20+4" }),
          expect.objectContaining({ id: "feature-hunters-mark-damage", formula: "1d6", metadata: expect.objectContaining({ resource: "favoredEnemy", freeUses: 2, damageType: "Force" }) }),
          expect.objectContaining({ label: "Longbow Damage", formula: "1d8+3" })
        ])
      );

      const levelFiveRanger = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "ranger", name: "SRD Level Five Ranger", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveRanger.statusCode).toBe(200);
      let levelFiveRangerAdvance = levelFiveRanger;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveRangerAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRanger.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveRangerAdvance.statusCode).toBe(200);
      }
      expect(levelFiveRangerAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Favored Enemy", "Deft Explorer", "Fighting Style", "Ranger Subclass", "Extra Attack"]),
          resources: { favoredEnemy: { current: 2, max: 3, recovery: "long" } },
          spellSlots: {
            level1: { current: 2, max: 4, recovery: "long" },
            level2: { current: 2, max: 2, recovery: "long" }
          },
          combat: expect.objectContaining({ attacksPerAction: 2 })
        })
      );
      expect(levelFiveRangerAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-hunters-mark-damage", formula: "1d6", metadata: expect.objectContaining({ freeUses: 3, freeCastResource: "favoredEnemy" }) }),
          expect.objectContaining({ label: "Longbow Damage", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
        ])
      );

      const monk = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "monk", name: "SRD Monk", ownerUserId: "usr_demo_player" }
      });
      expect(monk.statusCode).toBe(200);
      expect(monk.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Martial Arts", "Unarmored Defense"],
          hitDice: { current: 1, max: 1, size: "d8" },
          resources: {},
          saveProficiencies: ["strength", "dexterity"],
          skillProficiencies: ["acrobatics", "stealth"],
          spellSlots: {}
        })
      );
      expect(monk.json().sheet.data).toEqual(expect.objectContaining({ armorClass: 15, armorClassDetails: expect.objectContaining({ armorName: "Unarmored Defense" }) }));
      expect(monk.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Spear", "Dagger", "Musical Instrument"]);
      expect(monk.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-dexterity", formula: "1d20+5" }),
          expect.objectContaining({ id: "skill-acrobatics", formula: "1d20+5" }),
          expect.objectContaining({ id: "tool-musical-instrument", formula: "1d20+2" }),
          expect.objectContaining({ id: "feature-martial-arts-damage", formula: "1d6+3", metadata: expect.objectContaining({ martialArtsDie: "d6" }) }),
          expect.objectContaining({ label: "Spear Damage", formula: "1d6+3", metadata: expect.objectContaining({ martialArts: { die: "d6", dexterousAttacks: true } }) })
        ])
      );

      const levelFiveMonk = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "monk", name: "SRD Level Five Monk", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveMonk.statusCode).toBe(200);
      let levelFiveMonkAdvance = levelFiveMonk;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveMonkAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveMonkAdvance.statusCode).toBe(200);
      }
      expect(levelFiveMonkAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Monk's Focus", "Flurry of Blows", "Patient Defense", "Step of the Wind", "Uncanny Metabolism", "Deflect Attacks", "Monk Subclass", "Extra Attack", "Stunning Strike"]),
          resources: {
            focus: { current: 2, max: 5, recovery: "short" },
            uncannyMetabolism: { current: 1, max: 1, recovery: "long" }
          },
          combat: expect.objectContaining({ attacksPerAction: 2, unarmoredMovement: { bonusFt: 10, armorRestriction: "not wearing armor or wielding a Shield" } })
        })
      );
      expect(levelFiveMonkAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-martial-arts-damage", formula: "1d8+5", metadata: expect.objectContaining({ martialArtsDie: "d8" }) }),
          expect.objectContaining({ id: "feature-flurry-of-blows", formula: "0", metadata: expect.objectContaining({ resource: "focus", unarmedStrikes: 2 }) }),
          expect.objectContaining({ id: "feature-uncanny-metabolism-healing", formula: "1d8+5", metadata: expect.objectContaining({ resource: "uncannyMetabolism", focusRestoredTo: 5 }) }),
          expect.objectContaining({ id: "feature-deflect-attacks-damage", formula: "2d8+5", metadata: expect.objectContaining({ reductionFormula: "1d10+5+5", save: { ability: "dexterity", dc: 13 } }) }),
          expect.objectContaining({ id: "feature-stunning-strike", formula: "0", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 13 } }) }),
          expect.objectContaining({ label: "Spear Damage", formula: "1d8+5", metadata: expect.objectContaining({ attacksPerAction: 2, feature: "Extra Attack" }) })
        ])
      );

      const rogue = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "rogue", name: "SRD Rogue", ownerUserId: "usr_demo_player" }
      });
      expect(rogue.statusCode).toBe(200);
      expect(rogue.json().actor.data).toEqual(
        expect.objectContaining({
          features: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
          saveProficiencies: ["dexterity", "intelligence"],
          skillExpertise: ["stealth", "sleight-of-hand"],
          toolProficiencies: ["thieves-tools"]
        })
      );
      expect(rogue.json().sheet.inventory.map((item: { name: string }) => item.name)).toEqual(["Dagger", "Shortbow"]);
      expect(rogue.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "save-dexterity", formula: "1d20+5" }),
          expect.objectContaining({ id: "skill-stealth", formula: "1d20+7" }),
          expect.objectContaining({ id: "tool-thieves-tools", formula: "1d20+5" }),
          expect.objectContaining({ id: "feature-sneak-attack-damage", formula: "1d6", metadata: expect.objectContaining({ limit: "once per turn" }) })
        ])
      );

      const levelFiveRogue = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "rogue", name: "SRD Level Five Rogue", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveRogue.statusCode).toBe(200);
      let levelFiveRogueAdvance = levelFiveRogue;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveRogueAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRogue.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveRogueAdvance.statusCode).toBe(200);
      }
      expect(levelFiveRogueAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Cunning Action", "Steady Aim", "Cunning Strike", "Uncanny Dodge"])
        })
      );
      expect(levelFiveRogueAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-sneak-attack-damage", formula: "3d6", metadata: expect.objectContaining({ cunningStrike: expect.objectContaining({ saveDc: 16, reducedSneakAttackFormula: "2d6" }) }) }),
          expect.objectContaining({ id: "feature-cunning-strike", formula: "0", metadata: expect.objectContaining({ saveDc: 16, sneakAttackDice: 3 }) })
        ])
      );

      const cleric = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "cleric", name: "SRD Cleric", ownerUserId: "usr_demo_player" }
      });
      expect(cleric.statusCode).toBe(200);
      expect(cleric.json().actor).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "SRD Cleric" }));
      expect(cleric.json().actor.data.saveProficiencies).toEqual(["wisdom", "charisma"]);
      expect(cleric.json().actor.data.skillProficiencies).toEqual(["medicine", "religion"]);
      expect(cleric.json().actor.data.toolProficiencies).toEqual(["calligraphers-supplies"]);
      expect(cleric.json().actor.data.currency).toEqual({ gp: 50, sp: 0, cp: 0 });
      expect(cleric.json().sheet.spells.map((item: { name: string }) => item.name)).toEqual(["Healing Word", "Cure Wounds"]);
      expect(cleric.json().sheet.quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "save-wisdom", label: "Wisdom Save", formula: "1d20+5" })]));
      expect(cleric.json().sheet.quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "skill-medicine", label: "Medicine Check", formula: "1d20+5" })]));
      expect(cleric.json().sheet.quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "tool-calligraphers-supplies", label: "Calligrapher's Supplies Check", formula: "1d20+3" })]));
      const storedCleric = store.state.actors.find((actor) => actor.id === cleric.json().actor.id)!;
      storedCleric.data = {
        ...storedCleric.data,
        spellSlots: { ...(storedCleric.data.spellSlots as Record<string, unknown>), level2: { current: 1, max: 1, recovery: "long" } }
      };
      const healingWord = cleric.json().items.find((item: { name: string }) => item.name === "Healing Word");
      const healingRollId = `spell-${healingWord.id}-healing`;

      const levelTwoCleric = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "cleric", name: "SRD Level Two Cleric", ownerUserId: "usr_demo_player" }
      });
      expect(levelTwoCleric.statusCode).toBe(200);
      const levelTwoClericAdvance = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoCleric.json().actor.id}/advance`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { optionId: "level-up" }
      });
      expect(levelTwoClericAdvance.statusCode).toBe(200);
      expect(levelTwoClericAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 2,
          features: expect.arrayContaining(["Channel Divinity", "Divine Spark", "Turn Undead"]),
          resources: { channelDivinity: { current: 2, max: 2, recovery: "short" } }
        })
      );
      expect(levelTwoClericAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-divine-spark-healing", formula: "1d8+3", metadata: expect.objectContaining({ resource: "channelDivinity", rangeFt: 30 }) }),
          expect.objectContaining({ id: "feature-divine-spark-damage", formula: "1d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 13, success: "half" } }) }),
          expect.objectContaining({ id: "feature-turn-undead", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 13 } }) })
        ])
      );

      const levelFiveCleric = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "cleric", name: "SRD Level Five Cleric", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveCleric.statusCode).toBe(200);
      let levelFiveClericAdvance = levelFiveCleric;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveClericAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveClericAdvance.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveClericAdvance.statusCode).toBe(200);
      }
      expect(levelFiveClericAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Channel Divinity", "Divine Spark", "Turn Undead", "Sear Undead"]),
          resources: { channelDivinity: { current: 2, max: 2, recovery: "short" } }
        })
      );
      expect(levelFiveClericAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-turn-undead", formula: "0", metadata: expect.objectContaining({ searUndead: { formula: "5d8", damageType: "Radiant" } }) }),
          expect.objectContaining({ id: "feature-sear-undead-damage", formula: "5d8", metadata: expect.objectContaining({ trigger: "Turn Undead failed save", damageType: "Radiant" }) })
        ])
      );

      const fighter = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "fighter", name: "SRD Fighter", ownerUserId: "usr_demo_player" }
      });
      expect(fighter.statusCode).toBe(200);
      expect(fighter.json().actor.data.resources).toEqual({ secondWind: { current: 2, max: 2, recovery: "short" } });
      expect(fighter.json().sheet.quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "feature-second-wind-healing", label: "Second Wind Healing", formula: "1d10+1" })]));
      const storedFighter = store.state.actors.find((actor) => actor.id === fighter.json().actor.id)!;
      storedFighter.data = { ...storedFighter.data, hp: { current: 4, max: 12 } };

      const compendium = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium",
        headers: authHeaders
      });
      expect(compendium.statusCode).toBe(200);
      expect(compendium.json().entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "healing-word", name: "Healing Word", data: expect.objectContaining({ healingFormula: "1d4+@spellcasting", upcastFormula: "2d4" }) }),
          expect.objectContaining({ id: "magic-initiate", name: "Magic Initiate" }),
          expect.objectContaining({ id: "chromatic-orb", name: "Chromatic Orb", data: expect.objectContaining({ damageFormula: "3d8", upcastFormula: "1d8" }) }),
          expect.objectContaining({ id: "ice-knife", name: "Ice Knife", data: expect.objectContaining({ damageFormula: "1d10", secondaryDamageFormula: "2d6" }) }),
          expect.objectContaining({ id: "hunters-mark", name: "Hunter's Mark", data: expect.objectContaining({ damageFormula: "1d6", damageType: "force" }) }),
          expect.objectContaining({ id: "shield-armor", name: "Shield", data: expect.objectContaining({ costGp: 10, armorBonus: 2 }) }),
          expect.objectContaining({ id: "leather-armor", name: "Leather Armor", data: expect.objectContaining({ costGp: 10, armorBase: 11 }) }),
          expect.objectContaining({ id: "studded-leather-armor", name: "Studded Leather Armor", data: expect.objectContaining({ costGp: 45, armorBase: 12 }) }),
          expect.objectContaining({ id: "chain-mail", name: "Chain Mail", data: expect.objectContaining({ costGp: 75, armorBase: 16, dexBonus: false }) }),
          expect.objectContaining({ id: "shortbow", name: "Shortbow", data: expect.objectContaining({ costGp: 25, damage: "1d6" }) }),
          expect.objectContaining({ id: "longbow", name: "Longbow", data: expect.objectContaining({ costGp: 50, damage: "1d8" }) }),
          expect.objectContaining({ id: "musical-instrument", name: "Musical Instrument", data: expect.objectContaining({ toolId: "musical-instrument", costGp: 2 }) })
        ])
      );

      const chromaticSpell = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${criminalOrc.json().actor.id}/compendium`,
        headers: authHeaders,
        payload: { entryId: "chromatic-orb" }
      });
      expect(chromaticSpell.statusCode).toBe(200);
      expect(chromaticSpell.json().item).toEqual(expect.objectContaining({ name: "Chromatic Orb", data: expect.objectContaining({ damageFormula: "3d8", upcastFormula: "1d8" }) }));
      expect(chromaticSpell.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: `spell-${chromaticSpell.json().item.id}-damage`, label: "Chromatic Orb Damage", formula: "3d8" })])
      );
      const storedCriminalOrc = store.state.actors.find((actor) => actor.id === criminalOrc.json().actor.id)!;
      storedCriminalOrc.data = {
        ...storedCriminalOrc.data,
        spellSlots: { ...(storedCriminalOrc.data.spellSlots as Record<string, unknown>), level2: { current: 1, max: 1, recovery: "long" } }
      };
      const chromaticRollId = `spell-${chromaticSpell.json().item.id}-damage`;

      const dndThreats = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/encounter-threats",
        headers: authHeaders
      });
      expect(dndThreats.statusCode).toBe(200);
      expect(dndThreats.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "goblin-boss", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 17, hitPoints: 21, xp: 200 }) }),
          expect.objectContaining({ id: "tough-boss", budget: 1100, challengeRating: "4", data: expect.objectContaining({ actions: expect.arrayContaining([expect.objectContaining({ name: "Warhammer" })]) }) })
        ])
      );

      const dndEncounterPlan = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/encounter-plan",
        headers: authHeaders,
        payload: {
          partyActorIds: [cleric.json().actor.id],
          threats: [{ id: "goblin-warrior", count: 2 }]
        }
      });
      expect(dndEncounterPlan.statusCode).toBe(200);
      expect(dndEncounterPlan.json().plan).toMatchObject({
        systemId: "dnd-5e-srd",
        partyRating: 100,
        threatBudget: 100,
        difficulty: "hard",
        difficultyBudgets: { easy: 50, standard: 75, hard: 100 },
        threats: [expect.objectContaining({ id: "goblin-warrior", count: 2, budgetEach: 50, budgetTotal: 100, challengeRating: "1/4" })]
      });

      const monster = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/monsters",
        headers: authHeaders,
        payload: { threatId: "goblin-boss", name: "SRD Goblin Boss" }
      });
      expect(monster.statusCode).toBe(200);
      expect(monster.json().actor).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", type: "monster", name: "SRD Goblin Boss" }));
      expect(monster.json().actor.data).toEqual(expect.objectContaining({ hp: { current: 21, max: 21 }, armorClass: 17, challengeRating: "1", xp: 200 }));
      expect(monster.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "monster-scimitar-attack", label: "Scimitar Attack", formula: "1d20+4" }),
          expect.objectContaining({ id: "monster-scimitar-damage", label: "Scimitar Damage", formula: "1d6+2" }),
          expect.objectContaining({ id: "monster-shortbow-attack", label: "Shortbow Attack", formula: "1d20+4" })
        ])
      );

      const purchase = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/purchase`,
        headers: authHeaders,
        payload: { entryId: "longsword", quantity: 2 }
      });
      expect(purchase.statusCode).toBe(200);
      expect(purchase.json().purchase).toEqual(expect.objectContaining({ entryId: "longsword", quantity: 2, unitCostGp: 15, totalCostGp: 30, currency: { gp: 20, sp: 0, cp: 0 } }));
      expect(purchase.json().actor.data.currency).toEqual({ gp: 20, sp: 0, cp: 0 });
      expect(purchase.json().item).toEqual(expect.objectContaining({ name: "Longsword", data: expect.objectContaining({ quantity: 2, purchasedForGp: 30 }) }));
      expect(purchase.json().sheet.inventory.map((item: { name: string }) => item.name)).toContain("Longsword");

      const shieldPurchase = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/purchase`,
        headers: authHeaders,
        payload: { entryId: "shield-armor", quantity: 1 }
      });
      expect(shieldPurchase.statusCode).toBe(200);
      expect(shieldPurchase.json().purchase).toEqual(expect.objectContaining({ entryId: "shield-armor", quantity: 1, unitCostGp: 10, totalCostGp: 10, currency: { gp: 10, sp: 0, cp: 0 } }));
      expect(shieldPurchase.json().sheet.data).toEqual(
        expect.objectContaining({
          armorClass: 13,
          armorClassDetails: expect.objectContaining({ value: 13, base: 10, dexModifier: 1, armorName: "Unarmored", shieldBonus: 2 })
        })
      );

      const insufficientPurchase = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/purchase`,
        headers: authHeaders,
        payload: { entryId: "longsword", quantity: 2 }
      });
      expect(insufficientPurchase.statusCode).toBe(409);
      expect(store.state.actors.find((actor) => actor.id === cleric.json().actor.id)?.data.currency).toEqual({ gp: 10, sp: 0, cp: 0 });

      const target = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Target",
          data: {
            ruleset: "SRD 5.2.1",
            class: "Fighter",
            species: "Human",
            background: "Soldier",
            hp: { current: 4, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(target.statusCode).toBe(200);

      const monsterTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Monster Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(monsterTarget.statusCode).toBe(200);

      const spellTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Spell Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(spellTarget.statusCode).toBe(200);

      const divineSparkTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Divine Spark Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 3, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(divineSparkTarget.statusCode).toBe(200);

      const searUndeadTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Sear Undead Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(searUndeadTarget.statusCode).toBe(200);

      const rogueTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Rogue Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(rogueTarget.statusCode).toBe(200);

      const barbarianTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_gm",
          type: "character",
          name: "SRD Barbarian Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(barbarianTarget.statusCode).toBe(200);

      const paladinTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "SRD Paladin Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 3, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(paladinTarget.statusCode).toBe(200);

      const paladinSmiteTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "SRD Paladin Smite Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(paladinSmiteTarget.statusCode).toBe(200);

      const rangerTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "SRD Ranger Mark Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(rangerTarget.statusCode).toBe(200);

      const monkTarget = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/actors",
        headers: authHeaders,
        payload: {
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: "SRD Monk Target",
          data: {
            ruleset: "SRD 5.2.1",
            hp: { current: 10, max: 12 },
            attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            conditions: []
          }
        }
      });
      expect(monkTarget.statusCode).toBe(200);

      const sneakAttack = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRogue.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-sneak-attack-damage", applyEffect: true, targetActorId: rogueTarget.json().id }
      });
      expect(sneakAttack.statusCode).toBe(200);
      expect(sneakAttack.json().roll.formula).toBe("3d6");
      expect(sneakAttack.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-sneak-attack-damage", formula: "3d6", metadata: expect.objectContaining({ cunningStrike: expect.objectContaining({ saveDc: 16 }) }) }));
      expect(sneakAttack.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: rogueTarget.json().id, pool: "hp", before: 10, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === rogueTarget.json().id)?.data.hp).toEqual({ current: sneakAttack.json().effect.after, max: 12 });

      const cunningStrike = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRogue.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-cunning-strike" }
      });
      expect(cunningStrike.statusCode).toBe(200);
      expect(cunningStrike.json().roll.formula).toBe("0");
      expect(cunningStrike.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-cunning-strike", formula: "0", metadata: expect.objectContaining({ saveDc: 16, sneakAttackDice: 3 }) }));

      const rage = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${barbarian.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-rage", consumeResources: true }
      });
      expect(rage.statusCode).toBe(200);
      expect(rage.json().roll.formula).toBe("0");
      expect(rage.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-rage", metadata: expect.objectContaining({ resource: "rage", damageBonus: 2 }) }));
      expect(rage.json().usage.consumed).toEqual([{ type: "resource", key: "rage", label: "Rage", amount: 1, remaining: 1 }]);
      expect(store.state.actors.find((actor) => actor.id === barbarian.json().actor.id)?.data.resources).toEqual({ rage: { current: 1, max: 2, recovery: "short" } });

      const rageAgain = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${barbarian.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-rage", consumeResources: true }
      });
      expect(rageAgain.statusCode).toBe(200);
      expect(rageAgain.json().usage.consumed).toEqual([{ type: "resource", key: "rage", label: "Rage", amount: 1, remaining: 0 }]);

      const depletedRage = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${barbarian.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-rage", consumeResources: true }
      });
      expect(depletedRage.statusCode).toBe(409);
      expect(depletedRage.json().message).toContain("Insufficient rage");

      const barbarianShortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${barbarian.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(barbarianShortRest.statusCode).toBe(200);
      expect(barbarianShortRest.json().actor.data.resources).toEqual({ rage: { current: 1, max: 2, recovery: "short" } });
      expect(barbarianShortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ rage: 1 }));

      const barbarianLongRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${barbarian.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(barbarianLongRest.statusCode).toBe(200);
      expect(barbarianLongRest.json().actor.data.resources).toEqual({ rage: { current: 2, max: 2, recovery: "short" } });

      const layOnHands = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${paladin.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-lay-on-hands-healing", resourceAmount: 4, consumeResources: true, applyEffect: true, targetActorId: paladinTarget.json().id }
      });
      expect(layOnHands.statusCode).toBe(200);
      expect(layOnHands.json().roll.formula).toBe("4");
      expect(layOnHands.json().usage.consumed).toEqual([{ type: "resource", key: "layOnHands", label: "Lay On Hands", amount: 4, remaining: 1 }]);
      expect(layOnHands.json().effect).toEqual(expect.objectContaining({ type: "healing", targetActorId: paladinTarget.json().id, pool: "hp", before: 3, max: 12, amount: 4, after: 7 }));
      expect(store.state.actors.find((actor) => actor.id === paladin.json().actor.id)?.data.resources).toEqual({ layOnHands: { current: 1, max: 5, recovery: "long" } });

      const depletedLayOnHands = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${paladin.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-lay-on-hands-healing", resourceAmount: 2, consumeResources: true }
      });
      expect(depletedLayOnHands.statusCode).toBe(409);
      expect(depletedLayOnHands.json().message).toContain("Insufficient lay on hands");

      const divineSmite = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFivePaladin.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-divine-smite-damage", spellSlotLevel: 2, consumeResources: true, applyEffect: true, targetActorId: paladinSmiteTarget.json().id }
      });
      expect(divineSmite.statusCode).toBe(200);
      expect(divineSmite.json().roll.formula).toBe("3d8");
      expect(divineSmite.json().usage).toEqual(expect.objectContaining({ slotLevel: 2 }));
      expect(divineSmite.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 1 }]);
      expect(divineSmite.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: paladinSmiteTarget.json().id, pool: "hp", before: 10, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === levelFivePaladin.json().actor.id)?.data.spellSlots).toEqual({
        level1: { current: 2, max: 4, recovery: "long" },
        level2: { current: 1, max: 2, recovery: "long" }
      });

      const freeDivineSmite = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFivePaladin.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-divine-smite-damage", useFreeResource: true, consumeResources: true }
      });
      expect(freeDivineSmite.statusCode).toBe(200);
      expect(freeDivineSmite.json().roll.formula).toBe("2d8");
      expect(freeDivineSmite.json().usage.consumed).toEqual([{ type: "resource", key: "paladinsSmite", label: "Paladin's Smite", amount: 1, remaining: 0 }]);

      const faithfulSteed = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFivePaladin.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-faithful-steed", consumeResources: true }
      });
      expect(faithfulSteed.statusCode).toBe(200);
      expect(faithfulSteed.json().usage.consumed).toEqual([{ type: "resource", key: "faithfulSteed", label: "Faithful Steed", amount: 1, remaining: 0 }]);
      expect(store.state.actors.find((actor) => actor.id === levelFivePaladin.json().actor.id)?.data.resources).toEqual({
        layOnHands: { current: 5, max: 25, recovery: "long" },
        paladinsSmite: { current: 0, max: 1, recovery: "long" },
        faithfulSteed: { current: 0, max: 1, recovery: "long" }
      });

      const paladinLongRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFivePaladin.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(paladinLongRest.statusCode).toBe(200);
      expect(paladinLongRest.json().actor.data.resources).toEqual({
        layOnHands: { current: 25, max: 25, recovery: "long" },
        paladinsSmite: { current: 1, max: 1, recovery: "long" },
        faithfulSteed: { current: 1, max: 1, recovery: "long" }
      });
      expect(paladinLongRest.json().actor.data.spellSlots).toEqual({
        level1: { current: 4, max: 4, recovery: "long" },
        level2: { current: 2, max: 2, recovery: "long" }
      });

      const wildShape = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-wild-shape", consumeResources: true }
      });
      expect(wildShape.statusCode).toBe(200);
      expect(wildShape.json().roll.formula).toBe("0");
      expect(wildShape.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-wild-shape", metadata: expect.objectContaining({ resource: "wildShape", temporaryHitPoints: 5 }) }));
      expect(wildShape.json().usage.consumed).toEqual([{ type: "resource", key: "wildShape", label: "Wild Shape", amount: 1, remaining: 1 }]);

      const wildCompanion = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-wild-companion", consumeResources: true }
      });
      expect(wildCompanion.statusCode).toBe(200);
      expect(wildCompanion.json().usage).toEqual(expect.objectContaining({ slotLevel: 1 }));
      expect(wildCompanion.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 1 }]);

      const wildCompanionWithShape = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-wild-companion", useFreeResource: true, consumeResources: true }
      });
      expect(wildCompanionWithShape.statusCode).toBe(200);
      expect(wildCompanionWithShape.json().usage.consumed).toEqual([{ type: "resource", key: "wildShape", label: "Wild Shape", amount: 1, remaining: 0 }]);

      const depletedWildShape = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-wild-shape", consumeResources: true }
      });
      expect(depletedWildShape.statusCode).toBe(409);
      expect(depletedWildShape.json().message).toContain("Insufficient wild shape");

      const wildShapeResurgence = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-wild-resurgence-wild-shape", consumeResources: true }
      });
      expect(wildShapeResurgence.statusCode).toBe(200);
      expect(wildShapeResurgence.json().usage).toEqual(expect.objectContaining({ slotLevel: 1 }));
      expect(wildShapeResurgence.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }]);
      expect(store.state.actors.find((actor) => actor.id === levelFiveDruid.json().actor.id)?.data.resources).toEqual({
        wildShape: { current: 1, max: 2, recovery: "short" },
        wildResurgence: { current: 1, max: 1, recovery: "long" }
      });

      const storedLevelFiveDruid = store.state.actors.find((actor) => actor.id === levelFiveDruid.json().actor.id)!;
      storedLevelFiveDruid.data = {
        ...storedLevelFiveDruid.data,
        resources: {
          wildShape: { current: 1, max: 2, recovery: "short" },
          wildResurgence: { current: 1, max: 1, recovery: "long" }
        },
        spellSlots: {
          level1: { current: 3, max: 4, recovery: "long" },
          level2: { current: 2, max: 3, recovery: "long" },
          level3: { current: 2, max: 2, recovery: "long" }
        }
      };
      const wildSpellSlot = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-wild-resurgence-spell-slot", consumeResources: true }
      });
      expect(wildSpellSlot.statusCode).toBe(200);
      expect(wildSpellSlot.json().usage).toEqual(expect.objectContaining({ slotLevel: 1 }));
      expect(wildSpellSlot.json().usage.consumed).toEqual([
        { type: "resource", key: "wildShape", label: "Wild Shape", amount: 1, remaining: 0 },
        { type: "resource", key: "wildResurgence", label: "Wild Resurgence", amount: 1, remaining: 0 }
      ]);
      expect(store.state.actors.find((actor) => actor.id === levelFiveDruid.json().actor.id)?.data.spellSlots).toEqual({
        level1: { current: 4, max: 4, recovery: "long" },
        level2: { current: 2, max: 3, recovery: "long" },
        level3: { current: 2, max: 2, recovery: "long" }
      });

      const druidShortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(druidShortRest.statusCode).toBe(200);
      expect(druidShortRest.json().actor.data.resources).toEqual({
        wildShape: { current: 1, max: 2, recovery: "short" },
        wildResurgence: { current: 0, max: 1, recovery: "long" }
      });
      expect(druidShortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ wildShape: 1 }));

      const druidLongRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveDruid.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(druidLongRest.statusCode).toBe(200);
      expect(druidLongRest.json().actor.data.resources).toEqual({
        wildShape: { current: 2, max: 2, recovery: "short" },
        wildResurgence: { current: 1, max: 1, recovery: "long" }
      });
      expect(druidLongRest.json().actor.data.spellSlots).toEqual({
        level1: { current: 4, max: 4, recovery: "long" },
        level2: { current: 3, max: 3, recovery: "long" },
        level3: { current: 2, max: 2, recovery: "long" }
      });

      const huntersMarkFree = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRanger.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-hunters-mark-damage", useFreeResource: true, consumeResources: true, applyEffect: true, targetActorId: rangerTarget.json().id }
      });
      expect(huntersMarkFree.statusCode).toBe(200);
      expect(huntersMarkFree.json().roll.formula).toBe("1d6");
      expect(huntersMarkFree.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-hunters-mark-damage", metadata: expect.objectContaining({ resource: "favoredEnemy", damageType: "Force" }) }));
      expect(huntersMarkFree.json().usage.consumed).toEqual([{ type: "resource", key: "favoredEnemy", label: "Favored Enemy", amount: 1, remaining: 1 }]);
      expect(huntersMarkFree.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: rangerTarget.json().id, pool: "hp", before: 10, max: 12 }));

      const huntersMarkSlot = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRanger.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-hunters-mark-damage", spellSlotLevel: 2, consumeResources: true }
      });
      expect(huntersMarkSlot.statusCode).toBe(200);
      expect(huntersMarkSlot.json().usage).toEqual(expect.objectContaining({ slotLevel: 2 }));
      expect(huntersMarkSlot.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 1 }]);

      const storedLevelFiveRanger = store.state.actors.find((actor) => actor.id === levelFiveRanger.json().actor.id)!;
      storedLevelFiveRanger.data = {
        ...storedLevelFiveRanger.data,
        resources: { favoredEnemy: { current: 0, max: 3, recovery: "long" } },
        spellSlots: { level1: { current: 0, max: 4, recovery: "long" }, level2: { current: 0, max: 2, recovery: "long" } }
      };
      const depletedFavoredEnemy = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRanger.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-hunters-mark-damage", useFreeResource: true, consumeResources: true }
      });
      expect(depletedFavoredEnemy.statusCode).toBe(409);
      expect(depletedFavoredEnemy.json().message).toContain("Insufficient favored enemy");

      const rangerLongRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveRanger.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(rangerLongRest.statusCode).toBe(200);
      expect(rangerLongRest.json().actor.data.resources).toEqual({ favoredEnemy: { current: 3, max: 3, recovery: "long" } });
      expect(rangerLongRest.json().actor.data.spellSlots).toEqual({
        level1: { current: 4, max: 4, recovery: "long" },
        level2: { current: 2, max: 2, recovery: "long" }
      });

      const flurryOfBlows = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-flurry-of-blows", consumeResources: true }
      });
      expect(flurryOfBlows.statusCode).toBe(200);
      expect(flurryOfBlows.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-flurry-of-blows", metadata: expect.objectContaining({ resource: "focus", unarmedStrikes: 2 }) }));
      expect(flurryOfBlows.json().usage.consumed).toEqual([{ type: "resource", key: "focus", label: "Focus Point", amount: 1, remaining: 1 }]);

      const deflectAttacks = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-deflect-attacks-damage", consumeResources: true, applyEffect: true, targetActorId: monkTarget.json().id }
      });
      expect(deflectAttacks.statusCode).toBe(200);
      expect(deflectAttacks.json().roll.formula).toBe("2d8+5");
      expect(deflectAttacks.json().usage.consumed).toEqual([{ type: "resource", key: "focus", label: "Focus Point", amount: 1, remaining: 0 }]);
      expect(deflectAttacks.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: monkTarget.json().id, pool: "hp", before: 10, max: 12 }));

      const depletedFocus = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-stunning-strike", consumeResources: true }
      });
      expect(depletedFocus.statusCode).toBe(409);
      expect(depletedFocus.json().message).toContain("Insufficient focus point");

      const monkShortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(monkShortRest.statusCode).toBe(200);
      expect(monkShortRest.json().actor.data.resources).toEqual({
        focus: { current: 5, max: 5, recovery: "short" },
        uncannyMetabolism: { current: 1, max: 1, recovery: "long" }
      });
      expect(monkShortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ focus: 5 }));

      const uncannyMetabolism = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-uncanny-metabolism-healing", consumeResources: true, applyEffect: true }
      });
      expect(uncannyMetabolism.statusCode).toBe(200);
      expect(uncannyMetabolism.json().roll.formula).toBe("1d8+5");
      expect(uncannyMetabolism.json().usage.consumed).toEqual([{ type: "resource", key: "uncannyMetabolism", label: "Uncanny Metabolism", amount: 1, remaining: 0 }]);
      expect(uncannyMetabolism.json().actor.data.resources).toEqual({
        focus: { current: 5, max: 5, recovery: "short" },
        uncannyMetabolism: { current: 0, max: 1, recovery: "long" }
      });

      const monkLongRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveMonk.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(monkLongRest.statusCode).toBe(200);
      expect(monkLongRest.json().actor.data.resources).toEqual({
        focus: { current: 5, max: 5, recovery: "short" },
        uncannyMetabolism: { current: 1, max: 1, recovery: "long" }
      });

      const bardicInspiration = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${bard.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-bardic-inspiration", consumeResources: true }
      });
      expect(bardicInspiration.statusCode).toBe(200);
      expect(bardicInspiration.json().roll.formula).toBe("1d6");
      expect(bardicInspiration.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-bardic-inspiration", metadata: expect.objectContaining({ resource: "bardicInspiration", die: "d6" }) }));
      expect(bardicInspiration.json().usage.consumed).toEqual([{ type: "resource", key: "bardicInspiration", label: "Bardic Inspiration", amount: 1, remaining: 2 }]);
      expect(store.state.actors.find((actor) => actor.id === bard.json().actor.id)?.data.resources).toEqual({ bardicInspiration: { current: 2, max: 3, recovery: "long" } });

      const storedBard = store.state.actors.find((actor) => actor.id === bard.json().actor.id)!;
      storedBard.data = { ...storedBard.data, resources: { bardicInspiration: { current: 0, max: 3, recovery: "long" } } };
      const depletedBardicInspiration = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${bard.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-bardic-inspiration", consumeResources: true }
      });
      expect(depletedBardicInspiration.statusCode).toBe(409);
      expect(depletedBardicInspiration.json().message).toContain("Insufficient bardic inspiration");

      const storedLevelFiveBard = store.state.actors.find((actor) => actor.id === levelFiveBard.json().actor.id)!;
      storedLevelFiveBard.data = {
        ...storedLevelFiveBard.data,
        resources: { bardicInspiration: { current: 4, max: 5, recovery: "short" } },
        spellSlots: {
          level1: { current: 1, max: 4, recovery: "long" },
          level2: { current: 3, max: 3, recovery: "long" },
          level3: { current: 2, max: 2, recovery: "long" }
        }
      };
      const fontOfInspiration = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveBard.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-font-of-inspiration", consumeResources: true }
      });
      expect(fontOfInspiration.statusCode).toBe(200);
      expect(fontOfInspiration.json().roll.formula).toBe("0");
      expect(fontOfInspiration.json().usage).toEqual(expect.objectContaining({ slotLevel: 1 }));
      expect(fontOfInspiration.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }]);
      expect(store.state.actors.find((actor) => actor.id === levelFiveBard.json().actor.id)?.data.resources).toEqual({ bardicInspiration: { current: 5, max: 5, recovery: "short" } });
      expect(store.state.actors.find((actor) => actor.id === levelFiveBard.json().actor.id)?.data.spellSlots).toEqual({
        level1: { current: 0, max: 4, recovery: "long" },
        level2: { current: 3, max: 3, recovery: "long" },
        level3: { current: 2, max: 2, recovery: "long" }
      });
      storedLevelFiveBard.data = { ...storedLevelFiveBard.data, resources: { bardicInspiration: { current: 0, max: 5, recovery: "short" } } };
      const bardShortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveBard.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(bardShortRest.statusCode).toBe(200);
      expect(bardShortRest.json().actor.data.resources).toEqual({ bardicInspiration: { current: 5, max: 5, recovery: "short" } });
      expect(bardShortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ bardicInspiration: 5 }));

      const rageDamage = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveBarbarian.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-rage-damage-bonus", applyEffect: true, targetActorId: barbarianTarget.json().id }
      });
      expect(rageDamage.statusCode).toBe(200);
      expect(rageDamage.json().roll.formula).toBe("2");
      expect(rageDamage.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-rage-damage-bonus", formula: "2", metadata: expect.objectContaining({ bonusDamage: 2 }) }));
      expect(rageDamage.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: barbarianTarget.json().id, pool: "hp", before: 10, max: 12, amount: 2, after: 8 }));

      const recklessAttack = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveBarbarian.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-reckless-attack" }
      });
      expect(recklessAttack.statusCode).toBe(200);
      expect(recklessAttack.json().roll.formula).toBe("0");
      expect(recklessAttack.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-reckless-attack", formula: "0", metadata: expect.objectContaining({ advantage: { attacksUsing: "Strength", until: "start of your next turn" } }) }));

      const searTurnUndead = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveCleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-turn-undead", consumeResources: true }
      });
      expect(searTurnUndead.statusCode).toBe(200);
      expect(searTurnUndead.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-turn-undead", metadata: expect.objectContaining({ searUndead: { formula: "5d8", damageType: "Radiant" } }) }));
      expect(searTurnUndead.json().usage.consumed).toEqual([{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 1 }]);

      const searUndeadDamage = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveCleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-sear-undead-damage", applyEffect: true, targetActorId: searUndeadTarget.json().id }
      });
      expect(searUndeadDamage.statusCode).toBe(200);
      expect(searUndeadDamage.json().roll.formula).toBe("5d8");
      expect(searUndeadDamage.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-sear-undead-damage", formula: "5d8", metadata: expect.objectContaining({ damageType: "Radiant" }) }));
      expect(searUndeadDamage.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: searUndeadTarget.json().id, pool: "hp", before: 10, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === searUndeadTarget.json().id)?.data.hp).toEqual({ current: searUndeadDamage.json().effect.after, max: 12 });

      const divineSpark = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoCleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-divine-spark-healing", consumeResources: true, applyEffect: true, targetActorId: divineSparkTarget.json().id }
      });
      expect(divineSpark.statusCode).toBe(200);
      expect(divineSpark.json().roll.formula).toBe("1d8+3");
      expect(divineSpark.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-divine-spark-healing", formula: "1d8+3", metadata: expect.objectContaining({ resource: "channelDivinity" }) }));
      expect(divineSpark.json().usage.consumed).toEqual([{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 1 }]);
      expect(divineSpark.json().effect).toEqual(expect.objectContaining({ type: "healing", targetActorId: divineSparkTarget.json().id, pool: "hp", before: 3, max: 12 }));

      const turnUndead = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoCleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-turn-undead", consumeResources: true }
      });
      expect(turnUndead.statusCode).toBe(200);
      expect(turnUndead.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-turn-undead", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 13 } }) }));
      expect(turnUndead.json().usage.consumed).toEqual([{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 0 }]);

      const depletedChannelDivinity = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoCleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "feature-divine-spark-damage", consumeResources: true }
      });
      expect(depletedChannelDivinity.statusCode).toBe(409);
      expect(depletedChannelDivinity.json().message).toContain("Insufficient channel divinity");

      const clericShortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoCleric.json().actor.id}/rest`,
        headers: authHeaders,
        payload: { restType: "short" }
      });
      expect(clericShortRest.statusCode).toBe(200);
      expect(clericShortRest.json().actor.data.resources).toEqual({ channelDivinity: { current: 1, max: 2, recovery: "short" } });
      expect(clericShortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ channelDivinity: 1 }));

      const monsterAttack = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${monster.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "monster-scimitar-attack" }
      });
      expect(monsterAttack.statusCode).toBe(200);
      expect(monsterAttack.json().quickRoll).toEqual(expect.objectContaining({ id: "monster-scimitar-attack", formula: "1d20+4" }));
      expect(monsterAttack.json().chat.body).toContain("SRD Goblin Boss Scimitar Attack: 1d20+4");

      const monsterDamage = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${monster.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "monster-scimitar-damage", applyEffect: true, targetActorId: monsterTarget.json().id }
      });
      expect(monsterDamage.statusCode).toBe(200);
      expect(monsterDamage.json().quickRoll).toEqual(expect.objectContaining({ id: "monster-scimitar-damage", formula: "1d6+2" }));
      expect(monsterDamage.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: monsterTarget.json().id, pool: "hp", before: 10, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === monsterTarget.json().id)?.data.hp).toEqual({ current: monsterDamage.json().effect.after, max: 12 });

      const saveRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "save-wisdom" }
      });
      expect(saveRoll.statusCode).toBe(200);
      expect(saveRoll.json().quickRoll).toEqual(expect.objectContaining({ id: "save-wisdom", formula: "1d20+5" }));
      expect(saveRoll.json().chat.body).toContain("Wisdom Save: 1d20+5");

      const skillRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "skill-medicine" }
      });
      expect(skillRoll.statusCode).toBe(200);
      expect(skillRoll.json().quickRoll).toEqual(expect.objectContaining({ id: "skill-medicine", formula: "1d20+5" }));
      expect(skillRoll.json().chat.body).toContain("Medicine Check: 1d20+5");

      const toolRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: "tool-calligraphers-supplies" }
      });
      expect(toolRoll.statusCode).toBe(200);
      expect(toolRoll.json().quickRoll).toEqual(expect.objectContaining({ id: "tool-calligraphers-supplies", formula: "1d20+3" }));
      expect(toolRoll.json().chat.body).toContain("Calligrapher's Supplies Check: 1d20+3");

      const secondWind = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-second-wind-healing", consumeResources: true, applyEffect: true }
      });
      expect(secondWind.statusCode).toBe(200);
      expect(secondWind.json().roll.formula).toBe("1d10+1");
      expect(secondWind.json().usage).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd" }));
      expect(secondWind.json().usage.consumed).toEqual([{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 1 }]);
      expect(secondWind.json().effect).toEqual(expect.objectContaining({ type: "healing", targetActorId: fighter.json().actor.id, pool: "hp", before: 4, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === fighter.json().actor.id)?.data.resources).toEqual({ secondWind: { current: 1, max: 2, recovery: "short" } });

      const secondWindAgain = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-second-wind-healing", consumeResources: true }
      });
      expect(secondWindAgain.statusCode).toBe(200);
      expect(secondWindAgain.json().usage.consumed).toEqual([{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 0 }]);

      const depletedSecondWind = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-second-wind-healing", consumeResources: true }
      });
      expect(depletedSecondWind.statusCode).toBe(409);
      expect(depletedSecondWind.json().message).toBe("Insufficient second wind");

      const shortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(shortRest.statusCode).toBe(200);
      expect(shortRest.json().actor.data.resources).toEqual({ secondWind: { current: 1, max: 2, recovery: "short" } });
      expect(shortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ secondWind: 1 }));

      const storedFighterAfterShortRest = store.state.actors.find((actor) => actor.id === fighter.json().actor.id)!;
      storedFighterAfterShortRest.data = { ...storedFighterAfterShortRest.data, resources: { secondWind: { current: 0, max: 2, recovery: "short" } } };
      const longRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "long" }
      });
      expect(longRest.statusCode).toBe(200);
      expect(longRest.json().actor.data.resources).toEqual({ secondWind: { current: 2, max: 2, recovery: "short" } });

      const levelTwoFighter = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "fighter", name: "SRD Level Two Fighter", ownerUserId: "usr_demo_player" }
      });
      expect(levelTwoFighter.statusCode).toBe(200);
      const levelTwoAdvance = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoFighter.json().actor.id}/advance`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { optionId: "level-up" }
      });
      expect(levelTwoAdvance.statusCode).toBe(200);
      expect(levelTwoAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 2,
          features: expect.arrayContaining(["Action Surge", "Tactical Mind"]),
          resources: {
            secondWind: { current: 2, max: 2, recovery: "short" },
            actionSurge: { current: 1, max: 1, recovery: "short" }
          }
        })
      );
      expect(levelTwoAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-action-surge", label: "Action Surge", formula: "0" }),
          expect.objectContaining({ id: "feature-tactical-mind-bonus", label: "Tactical Mind Bonus", formula: "1d10" })
        ])
      );

      const actionSurge = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoFighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-action-surge", consumeResources: true }
      });
      expect(actionSurge.statusCode).toBe(200);
      expect(actionSurge.json().roll.formula).toBe("0");
      expect(actionSurge.json().quickRoll).toEqual(expect.objectContaining({ id: "feature-action-surge", formula: "0" }));
      expect(actionSurge.json().usage.consumed).toEqual([{ type: "resource", key: "actionSurge", label: "Action Surge", amount: 1, remaining: 0 }]);
      expect(store.state.actors.find((actor) => actor.id === levelTwoFighter.json().actor.id)?.data.resources).toEqual({
        secondWind: { current: 2, max: 2, recovery: "short" },
        actionSurge: { current: 0, max: 1, recovery: "short" }
      });

      const depletedActionSurge = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoFighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-action-surge", consumeResources: true }
      });
      expect(depletedActionSurge.statusCode).toBe(409);
      expect(depletedActionSurge.json().message).toBe("Insufficient action surge");

      const tacticalMind = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoFighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: "feature-tactical-mind-bonus", consumeResources: true }
      });
      expect(tacticalMind.statusCode).toBe(200);
      expect(tacticalMind.json().roll.formula).toBe("1d10");
      expect(tacticalMind.json().usage.consumed).toEqual([{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 1 }]);

      const storedLevelTwoFighter = store.state.actors.find((actor) => actor.id === levelTwoFighter.json().actor.id)!;
      storedLevelTwoFighter.data = {
        ...storedLevelTwoFighter.data,
        resources: {
          secondWind: { current: 0, max: 2, recovery: "short" },
          actionSurge: { current: 0, max: 1, recovery: "short" }
        }
      };
      const levelTwoShortRest = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelTwoFighter.json().actor.id}/rest`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { restType: "short" }
      });
      expect(levelTwoShortRest.statusCode).toBe(200);
      expect(levelTwoShortRest.json().actor.data.resources).toEqual({
        secondWind: { current: 1, max: 2, recovery: "short" },
        actionSurge: { current: 1, max: 1, recovery: "short" }
      });
      expect(levelTwoShortRest.json().rest.recovered.resources).toEqual(expect.objectContaining({ secondWind: 1, actionSurge: 1 }));

      const levelFiveFighter = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: authHeaders,
        payload: { templateId: "fighter", name: "SRD Level Five Fighter", ownerUserId: "usr_demo_player" }
      });
      expect(levelFiveFighter.statusCode).toBe(200);
      let levelFiveAdvance = levelFiveFighter;
      for (let level = 2; level <= 5; level += 1) {
        levelFiveAdvance = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveFighter.json().actor.id}/advance`,
          headers: { "x-user-id": "usr_demo_player" },
          payload: { optionId: "level-up" }
        });
        expect(levelFiveAdvance.statusCode).toBe(200);
      }
      const levelFiveLongsword = levelFiveFighter.json().items.find((item: { name: string }) => item.name === "Longsword");
      const levelFiveLongswordRollId = `item-${levelFiveLongsword.id}-damage`;
      expect(levelFiveAdvance.json().actor.data).toEqual(
        expect.objectContaining({
          level: 5,
          features: expect.arrayContaining(["Extra Attack", "Tactical Shift"]),
          combat: expect.objectContaining({ attacksPerAction: 2, tacticalShift: { movementFt: 15, opportunityAttacks: false } })
        })
      );
      expect(levelFiveAdvance.json().sheet.quickRolls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "feature-second-wind-healing", formula: "1d10+5", metadata: { tacticalShift: { movementFt: 15, opportunityAttacks: false } } }),
          expect.objectContaining({ id: levelFiveLongswordRollId, formula: "1d8+5", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
        ])
      );
      const levelFiveWeaponRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${levelFiveFighter.json().actor.id}/roll`,
        headers: { "x-user-id": "usr_demo_player" },
        payload: { rollId: levelFiveLongswordRollId }
      });
      expect(levelFiveWeaponRoll.statusCode).toBe(200);
      expect(levelFiveWeaponRoll.json().quickRoll).toEqual(expect.objectContaining({ id: levelFiveLongswordRollId, formula: "1d8+5", metadata: { attacksPerAction: 2, feature: "Extra Attack" } }));

      const chromaticRoll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${criminalOrc.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: chromaticRollId, spellSlotLevel: 2, consumeResources: true, applyEffect: true, targetActorId: spellTarget.json().id }
      });
      expect(chromaticRoll.statusCode).toBe(200);
      expect(chromaticRoll.json().roll.formula).toBe("3d8+1d8");
      expect(chromaticRoll.json().quickRoll).toEqual(expect.objectContaining({ id: chromaticRollId, formula: "3d8+1d8" }));
      expect(chromaticRoll.json().usage).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", slotLevel: 2 }));
      expect(chromaticRoll.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 0 }]);
      expect(chromaticRoll.json().effect).toEqual(expect.objectContaining({ type: "damage", targetActorId: spellTarget.json().id, pool: "hp", before: 10, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === spellTarget.json().id)?.data.hp).toEqual({ current: chromaticRoll.json().effect.after, max: 12 });
      expect(store.state.actors.find((actor) => actor.id === criminalOrc.json().actor.id)?.data.spellSlots).toEqual(
        expect.objectContaining({ level2: { current: 0, max: 1, recovery: "long" } })
      );

      const roll = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${cleric.json().actor.id}/roll`,
        headers: authHeaders,
        payload: { rollId: healingRollId, spellSlotLevel: 2, consumeResources: true, applyEffect: true, targetActorId: target.json().id }
      });
      expect(roll.statusCode).toBe(200);
      expect(roll.json().roll.formula).toBe("1d4+3+2d4");
      expect(roll.json().quickRoll).toEqual(expect.objectContaining({ formula: "1d4+3+2d4" }));
      expect(roll.json().usage).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", slotLevel: 2 }));
      expect(roll.json().usage.consumed).toEqual([{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 0 }]);
      expect(roll.json().effect).toEqual(expect.objectContaining({ type: "healing", targetActorId: target.json().id, pool: "hp", before: 4, max: 12 }));
      expect(store.state.actors.find((actor) => actor.id === target.json().id)?.data.hp).toEqual({ current: roll.json().effect.after, max: 12 });
      expect(store.state.actors.find((actor) => actor.id === cleric.json().actor.id)?.data.spellSlots).toEqual({
        level1: { current: 2, max: 2, recovery: "long" },
        level2: { current: 0, max: 1, recovery: "long" }
      });
    } finally {
      await app.close();
    }
  });

  it("imports system characters from normalized character data", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const playerImport = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters/import",
        headers: { "x-user-id": "usr_demo_player" },
        payload: { name: "Player Imported", data: { level: 2 } }
      });
      expect(playerImport.statusCode).toBe(403);

      const imported = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters/import",
        headers: authHeaders,
        payload: {
          name: "Imported Mender",
          ownerUserId: "usr_demo_player",
          data: {
            level: 3,
            class: "Mender",
            hp: { current: 14, max: 18 },
            attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
            features: ["Field Prayer"],
            conditions: ["blessed"],
            items: ["healing-word", "longsword", "missing-item"]
          }
        }
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().actor).toEqual(
        expect.objectContaining({
          systemId: "generic-fantasy",
          ownerUserId: "usr_demo_player",
          name: "Imported Mender"
        })
      );
      expect(imported.json().actor.data).toEqual(expect.objectContaining({ level: 3, class: "Mender", conditions: [{ id: "blessed" }] }));
      expect(imported.json().items.map((item: { name: string }) => item.name)).toEqual(["Healing Word", "Longsword"]);
      expect(imported.json().sheet.spells).toEqual([expect.objectContaining({ name: "Healing Word" })]);
      expect(imported.json().import.warnings).toEqual(["Unknown compendium entry skipped: missing-item"]);

      const stellar = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/characters/import",
        headers: authHeaders,
        payload: {
          name: "Imported Ace",
          data: {
            rank: 4,
            background: "Corsair Defector",
            aptitudes: { combat: 3, tech: 2, pilot: 4, science: 1, charm: 1 },
            strain: { current: 5, max: 8 },
            milestones: ["Defected at Dawn"],
            conditions: ["locked-in"],
            items: ["laser-carbine", "overclock", "vacuum-exposed"]
          }
        }
      });
      expect(stellar.statusCode).toBe(200);
      expect(stellar.json().actor.data).toEqual(
        expect.objectContaining({
          rank: 4,
          background: "Corsair Defector",
          conditions: [{ id: "locked-in" }, { id: "vacuum-exposed" }]
        })
      );
      expect(stellar.json().sheet.inventory).toEqual([expect.objectContaining({ name: "Laser Carbine" })]);
      expect(stellar.json().sheet.talents).toEqual([expect.objectContaining({ name: "Overclock" })]);
      expect(store.state.actors.some((actor) => actor.name === "Imported Ace")).toBe(true);

      const mystic = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/characters/import",
        headers: authHeaders,
        payload: {
          name: "Imported Investigator",
          data: {
            rank: 3,
            archetype: "Occult Scholar",
            skills: { investigation: 2, resolve: 3, influence: 1, stealth: 1, occult: 4 },
            composure: { current: 4, max: 7 },
            breakthroughs: ["Solved the First Case"],
            conditions: ["focused"],
            items: ["case-notebook", "warding-rite", "marked"]
          }
        }
      });
      expect(mystic.statusCode).toBe(200);
      expect(mystic.json().actor.data).toEqual(
        expect.objectContaining({
          rank: 3,
          archetype: "Occult Scholar",
          conditions: [{ id: "focused" }, { id: "marked" }]
        })
      );
      expect(mystic.json().sheet.clues).toEqual([expect.objectContaining({ name: "Case Notebook" })]);
      expect(mystic.json().sheet.rituals).toEqual([expect.objectContaining({ name: "Warding Rite" })]);
      expect(store.state.actors.some((actor) => actor.name === "Imported Investigator")).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("plans system encounters with threat budgets and permission boundaries", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const threats = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/encounter-threats",
        headers: authHeaders
      });
      expect(threats.statusCode).toBe(200);
      expect(threats.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "skeletal-guard", budget: 75 })]));

      const guardian = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/characters",
        headers: authHeaders,
        payload: { templateId: "guardian", name: "Budget Guardian", ownerUserId: "usr_demo_player" }
      });
      expect(guardian.statusCode).toBe(200);

      const plan = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/encounter-plan",
        headers: authHeaders,
        payload: {
          partyActorIds: [guardian.json().actor.id],
          threats: [{ id: "skeletal-guard", count: 2 }]
        }
      });
      expect(plan.statusCode).toBe(200);
      expect(plan.json().plan).toMatchObject({
        systemId: "generic-fantasy",
        partyRating: 100,
        threatBudget: 150,
        difficulty: "hard"
      });

      const playerCreate = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/encounter-plan",
        headers: { "x-user-id": "usr_demo_player" },
        payload: {
          threats: [{ id: "skeletal-guard", count: 2 }],
          createEncounter: true
        }
      });
      expect(playerCreate.statusCode).toBe(403);

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/encounter-plan",
        headers: authHeaders,
        payload: {
          partyActorIds: [guardian.json().actor.id],
          threats: [{ id: "skeletal-guard", count: 2 }],
          createEncounter: true,
          name: "Budgeted Crypt Guards"
        }
      });
      expect(created.statusCode).toBe(200);
      expect(created.json().encounter).toEqual(
        expect.objectContaining({
          name: "Budgeted Crypt Guards",
          difficulty: "hard",
          summary: expect.stringContaining("2x Skeletal Guard")
        })
      );
      expect(store.state.encounters.some((encounter) => encounter.name === "Budgeted Crypt Guards")).toBe(true);

      const stellarThreats = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/encounter-threats",
        headers: authHeaders
      });
      expect(stellarThreats.statusCode).toBe(200);
      expect(stellarThreats.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "void-raider", budget: 70 })]));

      const tech = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/characters",
        headers: authHeaders,
        payload: { templateId: "ship-tech", name: "Budget Tech", ownerUserId: "usr_demo_player" }
      });
      expect(tech.statusCode).toBe(200);

      const stellarPlan = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/stellar-frontiers/encounter-plan",
        headers: authHeaders,
        payload: {
          partyActorIds: [tech.json().actor.id],
          threats: [
            { id: "boarding-drone", count: 2 },
            { id: "void-raider", count: 1 }
          ]
        }
      });
      expect(stellarPlan.statusCode).toBe(200);
      expect(stellarPlan.json().plan).toMatchObject({
        systemId: "stellar-frontiers",
        partyRating: 90,
        threatBudget: 160,
        difficulty: "deadly"
      });

      const mysticThreats = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/encounter-threats",
        headers: authHeaders
      });
      expect(mysticThreats.statusCode).toBe(200);
      expect(mysticThreats.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: "masked-agent", budget: 60 })]));

      const investigator = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/characters",
        headers: authHeaders,
        payload: { templateId: "field-investigator", name: "Budget Investigator", ownerUserId: "usr_demo_player" }
      });
      expect(investigator.statusCode).toBe(200);

      const mysticPlan = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/mystic-noir/encounter-plan",
        headers: authHeaders,
        payload: {
          partyActorIds: [investigator.json().actor.id],
          threats: [{ id: "masked-agent", count: 1 }]
        }
      });
      expect(mysticPlan.statusCode).toBe(200);
      expect(mysticPlan.json().plan).toMatchObject({
        systemId: "mystic-noir",
        partyRating: 80,
        threatBudget: 60,
        difficulty: "standard"
      });
    } finally {
      await app.close();
    }
  });

  it("installs, upgrades, and rolls back versioned plugin packages", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-api-"));
    try {
      writeVersionedPluginPackage(pluginRoot, "versioned-plugin-1", "versioned-plugin", "1.0.0", "Version 1 macro");
      writeVersionedPluginPackage(pluginRoot, "versioned-plugin-2", "versioned-plugin", "2.0.0", "Version 2 macro");
      const store = new MemoryStateStore();
      const app = await buildApp({ store, pluginRoot });

      const catalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/plugins",
        headers: authHeaders
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toEqual([
        expect.objectContaining({
          id: "versioned-plugin",
          version: "2.0.0",
          installed: false,
          distribution: { availableVersions: ["2.0.0", "1.0.0"], latestVersion: "2.0.0" }
        })
      ]);

      const installOld = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/versioned-plugin/install",
        headers: authHeaders,
        payload: { version: "1.0.0", permissions: ["chat.write"] }
      });
      expect(installOld.statusCode).toBe(200);
      expect(installOld.json().plugin).toEqual(expect.objectContaining({ version: "1.0.0", installedVersion: "1.0.0", updateAvailable: true, rollbackVersions: ["2.0.0"] }));
      expect(store.state.permissionGrants.find((grant) => grant.subjectId === "versioned-plugin")?.metadata).toEqual(
        expect.objectContaining({ packageId: "versioned-plugin-1", version: "1.0.0", checksum: expect.stringMatching(/^sha256:/) })
      );

      const oldCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/versioned-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/version" }
      });
      expect(oldCommand.statusCode).toBe(200);
      expect(oldCommand.json().chat.body).toBe("Version 1 macro");

      const installLatest = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/versioned-plugin/install",
        headers: authHeaders,
        payload: { version: "2.0.0", permissions: ["chat.write"] }
      });
      expect(installLatest.statusCode).toBe(200);
      expect(installLatest.json().plugin).toEqual(expect.objectContaining({ version: "2.0.0", installedVersion: "2.0.0", updateAvailable: false, rollbackVersions: ["1.0.0"] }));

      const latestCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/versioned-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/version" }
      });
      expect(latestCommand.statusCode).toBe(200);
      expect(latestCommand.json().chat.body).toBe("Version 2 macro");

      const rollback = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/versioned-plugin/install",
        headers: authHeaders,
        payload: { version: "1.0.0", permissions: ["chat.write"] }
      });
      expect(rollback.statusCode).toBe(200);
      expect(rollback.json().plugin).toEqual(expect.objectContaining({ version: "1.0.0", installedVersion: "1.0.0", updateAvailable: true, rollbackVersions: ["2.0.0"] }));

      const rolledBackCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/versioned-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/version" }
      });
      expect(rolledBackCommand.statusCode).toBe(200);
      expect(rolledBackCommand.json().chat.body).toBe("Version 1 macro");

      await app.close();
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("enforces plugin trusted-only install and execution policy", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-api-"));
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      writeVersionedPluginPackage(pluginRoot, "unsigned-plugin", "unsigned-plugin", "1.0.0", "Unsigned macro");
      writeVersionedPluginPackage(pluginRoot, "signed-plugin", "signed-plugin", "1.0.0", "Signed macro");
      writePluginSignature(pluginRoot, "signed-plugin", "trusted-local", "shared-secret");
      const store = new MemoryStateStore();
      const pluginRegistry = loadPluginRegistry({
        pluginRoot,
        trustPolicy: { policy: "require_trusted", keys: { "trusted-local": "shared-secret" } }
      });
      app = await buildApp({ store, pluginRegistry });

      const catalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/plugins",
        headers: authHeaders
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "signed-plugin", trust: expect.objectContaining({ status: "trusted", installable: true }) }),
          expect.objectContaining({ id: "unsigned-plugin", trust: expect.objectContaining({ status: "unsigned", installable: false }) })
        ])
      );

      const unsignedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/unsigned-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(unsignedInstall.statusCode).toBe(403);
      expect(unsignedInstall.json().message).toContain("current trust policy");

      const signedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/signed-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(signedInstall.statusCode).toBe(200);
      expect(signedInstall.json().plugin.trust).toEqual(expect.objectContaining({ status: "trusted", installable: true }));
      expect(signedInstall.json().grant.metadata.trust).toEqual(expect.objectContaining({ status: "trusted", installable: true }));

      const signedCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/signed-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/version" }
      });
      expect(signedCommand.statusCode).toBe(200);
      expect(signedCommand.json().chat.body).toBe("Signed macro");
    } finally {
      await app?.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("gates plugin install and execution through server-admin marketplace review", async () => {
    const previousEnv = snapshotEnv(["OTTE_PLUGIN_REVIEW_POLICY", "OTTE_ADMIN_USER_IDS"]);
    process.env.OTTE_PLUGIN_REVIEW_POLICY = "require_approved";
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-review-"));
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      writeVersionedPluginPackage(pluginRoot, "reviewed-plugin-1", "reviewed-plugin", "1.0.0", "Reviewed macro");
      const store = new MemoryStateStore();
      app = await buildApp({ store, pluginRoot });

      const reviews = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/reviews",
        headers: authHeaders
      });
      expect(reviews.statusCode).toBe(200);
      expect(reviews.json()).toEqual(
        expect.objectContaining({
          policy: { mode: "require_approved" },
          totals: expect.objectContaining({ pending: 1, approved: 0, rejected: 0, blocked: 1 }),
          plugins: [
            expect.objectContaining({
              plugin: expect.objectContaining({ id: "reviewed-plugin", version: "1.0.0" }),
              review: expect.objectContaining({ status: "pending", sourceType: "local", packageId: "reviewed-plugin-1" }),
              installable: false,
              installBlock: expect.stringContaining("requires marketplace approval")
            })
          ]
        })
      );
      const reviewKey = reviews.json().plugins[0].review.reviewKey as string;

      const deniedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/reviewed-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(deniedInstall.statusCode).toBe(403);
      expect(deniedInstall.json().message).toContain("requires marketplace approval");

      const approved = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/plugins/reviews/${encodeURIComponent(reviewKey)}`,
        headers: authHeaders,
        payload: { status: "approved", notes: "Approved in API test" }
      });
      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toEqual(
        expect.objectContaining({
          review: expect.objectContaining({ reviewKey, status: "approved", reviewedByUserId: "usr_demo_gm", notes: "Approved in API test" }),
          installable: true
        })
      );

      const install = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/reviewed-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(install.statusCode).toBe(200);
      expect(install.json().plugin.marketplaceReview.review.status).toBe("approved");

      const command = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/reviewed-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/version" }
      });
      expect(command.statusCode).toBe(200);
      expect(command.json().chat.body).toBe("Reviewed macro");

      const rejected = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/plugins/reviews/${encodeURIComponent(reviewKey)}`,
        headers: authHeaders,
        payload: { status: "rejected", notes: "Rejected in API test" }
      });
      expect(rejected.statusCode).toBe(200);
      expect(rejected.json().installable).toBe(false);
      expect(rejected.json().installBlock).toContain("rejected by marketplace review");

      const deniedCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/reviewed-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/version" }
      });
      expect(deniedCommand.statusCode).toBe(403);
      expect(deniedCommand.json().message).toContain("rejected by marketplace review");
      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["admin.pluginReviews.list", "admin.pluginReview.update", "plugin.install", "plugin.chatCommand"]));

    } finally {
      await app?.close();
      restoreEnv(previousEnv);
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("persists plugin campaign storage through configure-gated APIs and command mutations", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-storage-"));
    const packagePath = join(pluginRoot, "stateful-plugin");
    mkdirSync(packagePath);
    writeFileSync(
      join(packagePath, "plugin.manifest.json"),
      JSON.stringify({
        id: "stateful-plugin",
        name: "Stateful Plugin",
        version: "1.0.0",
        compatibleCore: ">=0.1.0",
        entrypoints: { server: "./server.js" },
        runtime: { apiVersion: "0.1", sandbox: "vm" },
        permissions: ["chat.write", "plugin.configure"],
        chatCommands: [{ command: "/state", description: "Persist plugin state" }]
      })
    );
    writeFileSync(
      join(packagePath, "server.js"),
      `
registerCommand("/state", (input) => {
  const counter = (input.storage?.entries ?? []).find((entry) => entry.key === "counter");
  const previous = typeof counter?.value?.count === "number" ? counter.value.count : 0;
  const next = previous + 1;
  return {
    body: \`State count \${next}\`,
    visibility: "public",
    storage: { set: { counter: { count: next, args: input.args } } }
  };
});
`
    );
    const store = new MemoryStateStore();
    const app = await buildApp({ store, pluginRegistry: loadPluginRegistry({ pluginRoot }) });
    try {
      const limitedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(limitedInstall.statusCode).toBe(200);

      const deniedStorageWrite = await app.inject({
        method: "PUT",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/storage/settings",
        headers: authHeaders,
        payload: { value: { enabled: true } }
      });
      expect(deniedStorageWrite.statusCode).toBe(403);
      expect(deniedStorageWrite.json().message).toContain("plugin.configure");

      const deniedCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/state" }
      });
      expect(deniedCommand.statusCode).toBe(403);
      expect(store.state.pluginStorage).toEqual([]);

      const fullInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write", "plugin.configure"] }
      });
      expect(fullInstall.statusCode).toBe(200);

      const storageWrite = await app.inject({
        method: "PUT",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/storage/settings",
        headers: authHeaders,
        payload: { value: { enabled: true, threshold: 3 } }
      });
      expect(storageWrite.statusCode).toBe(200);
      expect(storageWrite.json()).toEqual(expect.objectContaining({ pluginId: "stateful-plugin", key: "settings", value: { enabled: true, threshold: 3 }, updatedByType: "user" }));

      const firstCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/state", args: "alpha" }
      });
      expect(firstCommand.statusCode).toBe(200);
      expect(firstCommand.json()).toEqual(expect.objectContaining({ storageMutation: { set: [{ key: "counter", size: 26 }], deleted: [] } }));
      expect(firstCommand.json().chat.body).toBe("State count 1");

      const secondCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/state", args: "beta" }
      });
      expect(secondCommand.statusCode).toBe(200);
      expect(secondCommand.json().chat.body).toBe("State count 2");

      const storageList = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/storage",
        headers: authHeaders
      });
      expect(storageList.statusCode).toBe(200);
      expect(storageList.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "settings", value: { enabled: true, threshold: 3 } }),
          expect.objectContaining({ key: "counter", value: { count: 2, args: "beta" }, updatedByType: "plugin" })
        ])
      );

      const storageRead = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/storage/counter",
        headers: authHeaders
      });
      expect(storageRead.statusCode).toBe(200);
      expect(storageRead.json().value).toEqual({ count: 2, args: "beta" });

      const storageDelete = await app.inject({
        method: "DELETE",
        url: "/api/v1/campaigns/camp_demo/plugins/stateful-plugin/storage/settings",
        headers: authHeaders
      });
      expect(storageDelete.statusCode).toBe(200);
      expect(storageDelete.json()).toEqual({ deleted: true, key: "settings" });

      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["plugin.storageSet", "plugin.storageMutation", "plugin.storageDelete"]));
    } finally {
      await app.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("syncs an allowlisted remote plugin registry into the runtime catalog", async () => {
    const previousEnv = snapshotEnv(["OTTE_PLUGIN_REGISTRY_URLS", "OTTE_PLUGIN_REGISTRY_TIMEOUT_MS"]);
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-registry-"));
    const manifest = JSON.stringify({
      id: "remote-plugin",
      name: "Remote Plugin",
      version: "1.0.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { server: "./server.js" },
      runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: ["chat.write"],
      chatCommands: [{ command: "/remote", description: "Run remote registry macro" }]
    });
    const packageText = JSON.stringify({
      files: {
        "plugin.manifest.json": manifest,
        "server.js": "registerCommand('/remote', () => ({ body: 'Remote registry macro', visibility: 'public' }));"
      }
    });
    const packageChecksum = `sha256:${createHash("sha256").update(Buffer.from(packageText, "utf8")).digest("hex")}`;
    const registry = createServer((request, response) => {
      if (request.url === "/catalog.json") {
        sendJson(response, {
          plugins: [{ packageId: "remote-plugin-1", packageUrl: "/remote-plugin-1.json", checksum: packageChecksum }]
        });
        return;
      }
      if (request.url === "/remote-plugin-1.json") {
        response.writeHead(200, { "content-type": "application/json" }).end(packageText);
        return;
      }
      response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
    });
    await new Promise<void>((resolve) => registry.listen(0, "127.0.0.1", resolve));
    const registryPort = (registry.address() as AddressInfo).port;
    const registryUrl = `http://127.0.0.1:${registryPort}/catalog.json`;
    process.env.OTTE_PLUGIN_REGISTRY_URLS = registryUrl;
    process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS = "1000";
    const store = new MemoryStateStore();
    const pluginRegistry = loadPluginRegistry({ pluginRoot });
    const app = await buildApp({ store, pluginRegistry });
    try {
      const sync = await app.inject({
        method: "POST",
        url: "/api/v1/plugins/registry/sync",
        headers: authHeaders,
        payload: { campaignId: "camp_demo", registryUrl }
      });
      expect(sync.statusCode).toBe(200);
      expect(sync.json().registries[0]).toEqual(
        expect.objectContaining({
          registryUrl,
          imported: [
            expect.objectContaining({
              id: "remote-plugin",
              version: "1.0.0",
              source: expect.objectContaining({
                type: "registry",
                packageId: "remote-plugin-1",
                registryUrl,
                packageUrl: `http://127.0.0.1:${registryPort}/remote-plugin-1.json`,
                packageChecksum
              })
            })
          ],
          errors: []
        })
      );

      const catalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/plugins",
        headers: authHeaders
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "remote-plugin",
            installed: false,
            source: expect.objectContaining({ type: "registry", packageId: "remote-plugin-1" })
          })
        ])
      );

      const install = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/remote-plugin/install",
        headers: authHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(install.statusCode).toBe(200);
      expect(install.json().grant.metadata).toEqual(expect.objectContaining({ packageId: "remote-plugin-1", version: "1.0.0" }));

      const command = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/remote-plugin/chat-command",
        headers: authHeaders,
        payload: { command: "/remote" }
      });
      expect(command.statusCode).toBe(200);
      expect(command.json().chat.body).toBe("Remote registry macro");
      expect(store.state.auditLogs.find((log) => log.action === "plugin.registrySync")).toEqual(
        expect.objectContaining({
          targetType: "plugin",
          after: expect.objectContaining({
            registries: [expect.objectContaining({ imported: ["remote-plugin@1.0.0"] })]
          })
        })
      );
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => registry.close((error) => (error ? reject(error) : resolve())));
      restoreEnv(previousEnv);
      rmSync(pluginRoot, { recursive: true, force: true });
    }
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
    expect(provider.requests[0]!.tools.map((tool) => tool.name)).toEqual(["roll_dice", "read_compendium"]);
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
    expect(provider.requests[1]!.tools.map((tool) => tool.name)).toEqual(["create_proposal", "draft_encounter", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "create_memory", "roll_dice", "use_actor_action", "read_compendium"]);
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
    const previousEnv = snapshotEnv(["OTTE_AI_PROVIDER", "OPENAI_API_KEY", "OTTE_AI_PROVIDER_TIMEOUT_MS", "OTTE_ADMIN_USER_IDS"]);
    process.env.OTTE_AI_PROVIDER = "openai-responses";
    process.env.OTTE_AI_PROVIDER_TIMEOUT_MS = "1234";
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
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

      const operations = await app.inject({
        method: "GET",
        url: "/api/v1/admin/ai/operations",
        headers: authHeaders
      });
      expect(operations.statusCode).toBe(200);
      expect(operations.json().runtime.openai).toEqual(
        expect.objectContaining({
          apiKeyConfigured: false,
          timeoutMs: 1234
        })
      );
    } finally {
      await app?.close();
      restoreEnv(previousEnv);
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

  it("lets server admins inspect redacted ai operations across campaigns", async () => {
    const previousEnv = snapshotEnv(["OTTE_ADMIN_USER_IDS", "OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K", "OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K"]);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    process.env.OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K = "0.01";
    process.env.OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K = "0.02";

    class OperationsProvider implements AiProvider {
      id = "codex-ops-test";
      label = "Codex Ops Test";

      async *stream(_input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        yield {
          type: "usage.reported",
          usage: {
            inputTokens: 120,
            outputTokens: 30,
            totalTokens: 150
          }
        };
        yield {
          type: "tool.started",
          toolName: "roll_dice",
          input: {
            formula: "1d20+2",
            label: "Ops Check"
          }
        };
        yield {
          type: "message.completed",
          content: "Operations telemetry recorded"
        };
      }
    }

    const store = new MemoryStateStore();
    const app = await buildApp({ store, aiProvider: new OperationsProvider() });

    try {
      const adminLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { userId: "usr_demo_gm" }
      });
      const adminHeaders = { authorization: `Bearer ${adminLogin.json().token}` };

      const thread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: adminHeaders,
        payload: { prompt: "Record a Codex operations smoke test." }
      });
      expect(thread.statusCode).toBe(200);

      const operations = await app.inject({
        method: "GET",
        url: "/api/v1/admin/ai/operations",
        headers: adminHeaders
      });
      expect(operations.statusCode).toBe(200);
      expect(operations.json()).toMatchObject({
        provider: {
          id: "codex-ops-test",
          label: "Codex Ops Test"
        },
        runtime: {
          selectedProvider: "local-echo",
          activeProvider: "codex-ops-test",
          costRatesConfigured: {
            inputTokens: true,
            outputTokens: true
          }
        },
        totals: {
          threadCount: 1,
          completedThreadCount: 1,
          failedThreadCount: 0,
          toolCallCount: 1,
          usage: {
            inputTokens: 120,
            outputTokens: 30,
            totalTokens: 150
          }
        }
      });
      expect(operations.json().campaigns).toEqual([expect.objectContaining({ campaignId: "camp_demo", campaignName: "The Ember Vault", threadCount: 1 })]);
      expect(operations.json().recentThreads[0]).toMatchObject({ provider: "codex-ops-test", status: "completed" });
      expect(operations.json().recentToolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            campaignId: "camp_demo",
            campaignName: "The Ember Vault",
            provider: "codex-ops-test",
            toolName: "roll_dice",
            status: "completed"
          }),
          expect.objectContaining({
            campaignId: "camp_demo",
            campaignName: "The Ember Vault",
            provider: "codex-ops-test",
            toolName: "roll_dice",
            status: "started"
          })
        ])
      );
      expect(JSON.stringify(operations.json())).not.toContain("OPENAI_API_KEY");
      expect(store.state.auditLogs.map((log) => log.action)).toContain("admin.aiOperations.inspect");

      const blocked = await app.inject({
        method: "GET",
        url: "/api/v1/admin/ai/operations",
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
        yield { type: "tool.started", toolName: "use_actor_action", input: { actorId: "act_valen", actionName: "Healing Word Healing", applyEffect: true, targetActorId: "act_valen" } };
        yield { type: "tool.started", toolName: "unknown_tool", input: {} };
        yield { type: "message.completed", content: "Expanded tools requested" };
      }
    }

    const gmProvider = new ExpandedToolProvider();
    const gmStore = new MemoryStateStore();
    const gmActor = gmStore.state.actors.find((actor) => actor.id === "act_valen")!;
    gmActor.data = { ...gmActor.data, spellSlots: { level1: { current: 1, max: 1, recovery: "long" } } };
    gmStore.state.items.push(
      createTimestamped("item", {
        id: "item_ai_healing_word",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        actorId: "act_valen",
        type: "spell",
        name: "Healing Word",
        data: { level: 1, healingFormula: "1d4+@attributes.wisdom", compendiumId: "healing-word" }
      })
    );
    const gmApp = await buildApp({ store: gmStore, aiProvider: gmProvider });
    const gmThread = await gmApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: authHeaders,
      payload: { prompt: "Read the compendium, remember a key, draft an encounter, and roll dice." }
    });
    expect(gmThread.statusCode).toBe(200);
    expect(gmProvider.requests[0]!.tools.map((tool) => tool.name)).toEqual(["create_proposal", "draft_encounter", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "create_memory", "roll_dice", "use_actor_action", "read_compendium"]);
    expect(gmProvider.requests[0]!.tools.find((tool) => tool.name === "draft_encounter")?.parameters?.required).toEqual(["name", "summary"]);
    expect(gmProvider.requests[0]!.tools.find((tool) => tool.name === "draft_token_update")?.requiredPermissions).toEqual(["ai.proposeChanges", "token.update"]);
    expect(gmProvider.requests[0]!.context.actors?.map((actor) => actor.name)).toContain("Valen Ash");
    expect(gmProvider.requests[0]!.context.actors?.find((actor) => actor.id === "act_valen")?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ rollId: "spell-item_ai_healing_word-healing", label: "Healing Word Healing" })])
    );
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
        expect.objectContaining({
          type: "tool.completed",
          toolName: "use_actor_action",
          output: expect.objectContaining({
            actorId: "act_valen",
            actionRollId: "spell-item_ai_healing_word-healing",
            consumed: [{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }],
            effect: expect.objectContaining({ type: "healing", targetActorId: "act_valen", targetActorName: "Valen Ash", pool: "hp", before: 18, max: 22 })
          })
        }),
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
    expect(gmStore.state.rolls).toHaveLength(2);
    expect(gmStore.state.chat.some((message) => message.body.includes("AI Perception: 1d20+5"))).toBe(true);
    expect(gmStore.state.chat.some((message) => message.body.includes("Valen Ash Healing Word Healing"))).toBe(true);
    expect(gmStore.state.actors.find((actor) => actor.id === "act_valen")?.data.spellSlots).toEqual({ level1: { current: 0, max: 1, recovery: "long" } });
    const actorActionOutput = gmStore.state.aiToolCalls.find((call) => call.toolName === "use_actor_action" && call.status === "completed")?.output as { effect: { after: number } };
    expect(gmStore.state.actors.find((actor) => actor.id === "act_valen")?.data.hp).toEqual({ current: actorActionOutput.effect.after, max: 22 });

    const observedToolCalls = await gmApp.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/ai/tool-calls",
      headers: authHeaders
    });
    expect(observedToolCalls.statusCode).toBe(200);
    expect(observedToolCalls.json().map((call: { toolName: string }) => call.toolName)).toEqual(
      expect.arrayContaining(["read_compendium", "create_memory", "draft_encounter", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "roll_dice", "use_actor_action", "unknown_tool"])
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
    expect(playerProvider.requests[0]!.tools.map((tool) => tool.name)).toEqual(["roll_dice", "read_compendium"]);
    const playerCompleted = playerThread.json().events.filter((event: { type: string }) => event.type === "tool.completed");
    expect(playerCompleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "create_memory", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_encounter", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_journal_entry", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_scene", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_token_update", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "draft_actor_update", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "use_actor_action", output: { error: "missing_permission", permission: "ai.proposeChanges" } }),
        expect.objectContaining({ toolName: "read_compendium", output: expect.objectContaining({ systemId: "generic-fantasy" }) }),
        expect.objectContaining({ toolName: "roll_dice", output: expect.objectContaining({ formula: "1d20+5" }) })
      ])
    );
    expect(playerStore.state.aiMemory.some((fact) => fact.text === "The moon key opens the observatory.")).toBe(false);
    expect(playerStore.state.proposals.some((proposal) => proposal.title === "Encounter: Mirror Knight")).toBe(false);
    expect(playerStore.state.rolls).toHaveLength(1);
    await playerApp.close();
  });

  it("keeps ai provider tool advertisement covered by role permission invariants", async () => {
    class ToolPolicyProvider implements AiProvider {
      id = "tool-policy-ai";
      label = "Tool Policy AI";
      requests: AiProviderRequest[] = [];

      async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.requests.push(input);
        yield { type: "message.completed", content: "Tool policy captured" };
      }
    }

    const permissionSafeTools = new Set(["roll_dice", "read_compendium"]);
    const provider = new ToolPolicyProvider();
    const store = new MemoryStateStore();
    store.state.users.push(
      createTimestamped("usr", {
        id: "usr_policy_assistant",
        displayName: "Policy Assistant",
        email: "policy.assistant@example.test"
      }),
      createTimestamped("usr", {
        id: "usr_policy_observer",
        displayName: "Policy Observer",
        email: "policy.observer@example.test"
      })
    );
    store.state.members.push(
      createTimestamped("mem", {
        id: "mem_policy_assistant",
        campaignId: "camp_demo",
        userId: "usr_policy_assistant",
        role: "assistant_gm" as const
      }),
      createTimestamped("mem", {
        id: "mem_policy_observer",
        campaignId: "camp_demo",
        userId: "usr_policy_observer",
        role: "observer" as const
      })
    );
    const app = await buildApp({ store, aiProvider: provider });

    try {
      const gmThread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Capture GM tools." }
      });
      const assistantThread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_policy_assistant" },
        payload: { prompt: "Capture assistant GM tools." }
      });
      const playerThread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_demo_player" },
        payload: { prompt: "Capture player tools." }
      });
      const observerThread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: { "x-user-id": "usr_policy_observer" },
        payload: { prompt: "Observers cannot use AI." }
      });

      expect(gmThread.statusCode).toBe(200);
      expect(assistantThread.statusCode).toBe(200);
      expect(playerThread.statusCode).toBe(200);
      expect(observerThread.statusCode).toBe(403);
      expect(provider.requests).toHaveLength(3);

      const gmTools = provider.requests[0]!.tools;
      const assistantTools = provider.requests[1]!.tools;
      const playerTools = provider.requests[2]!.tools;
      expect(gmTools.map((tool) => tool.name)).toEqual(["create_proposal", "draft_encounter", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "create_memory", "roll_dice", "use_actor_action", "read_compendium"]);

      for (const tool of gmTools) {
        expect(tool.requiredPermissions.length, `${tool.name} should declare required permissions`).toBeGreaterThan(0);
        expect(tool.parameters?.type, `${tool.name} should expose an object schema`).toBe("object");
        expect(tool.parameters?.additionalProperties, `${tool.name} should reject stray provider arguments`).toBe(false);
        if (!permissionSafeTools.has(tool.name)) expect(tool.requiredPermissions, `${tool.name} should require AI proposal permission`).toContain("ai.proposeChanges");
      }

      expect(assistantTools.map((tool) => tool.name)).toEqual(["create_proposal", "draft_journal_entry", "draft_scene", "draft_token_update", "draft_actor_update", "create_memory", "roll_dice", "use_actor_action", "read_compendium"]);
      expect(assistantTools.map((tool) => tool.name)).not.toContain("draft_encounter");
      for (const tool of assistantTools) {
        expect(tool.requiredPermissions.every((permission) => permissionsForRole("assistant_gm").includes(permission))).toBe(true);
      }

      expect(playerTools.map((tool) => tool.name)).toEqual(["roll_dice", "read_compendium"]);
      for (const tool of playerTools) {
        expect(tool.requiredPermissions.every((permission) => permissionsForRole("player").includes(permission))).toBe(true);
        expect(permissionSafeTools.has(tool.name)).toBe(true);
      }
    } finally {
      await app.close();
    }
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

  it("runs clean uploads through an external asset trust scanner before storage writes", async () => {
    const previousEnv = snapshotEnv(["OTTE_ASSET_TRUST_WEBHOOK_URL", "OTTE_ASSET_TRUST_WEBHOOK_TOKEN", "OTTE_ASSET_TRUST_TIMEOUT_MS", "OTTE_ASSET_TRUST_FAIL_CLOSED", "OTTE_ASSET_TRUST_SCANNER_NAME"]);
    const directory = mkdtempSync(join(tmpdir(), "otte-asset-trust-clean-"));
    const store = new MemoryStateStore();
    let scannerRequest: { authorization?: string; body?: Record<string, unknown> } = {};
    const scanner = createServer(async (request, response) => {
      scannerRequest = {
        authorization: request.headers.authorization,
        body: JSON.parse(await readRequestBody(request)) as Record<string, unknown>
      };
      sendJson(response, {
        status: "clean",
        scanner: "manual-av",
        findings: [{ code: "third_party_av_clean", severity: "low", message: "External scanner accepted upload" }]
      });
    });
    await new Promise<void>((resolve) => scanner.listen(0, "127.0.0.1", resolve));
    const address = scanner.address() as AddressInfo;
    process.env.OTTE_ASSET_TRUST_WEBHOOK_URL = `http://127.0.0.1:${address.port}/scan`;
    process.env.OTTE_ASSET_TRUST_WEBHOOK_TOKEN = "trust-token";
    process.env.OTTE_ASSET_TRUST_TIMEOUT_MS = "1000";
    const app = await buildApp({
      store,
      uploadDir: directory
    });
    try {
      const bytes = Buffer.from("trusted-image-bytes");
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...authHeaders,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Trusted.png")
        },
        payload: bytes
      });

      expect(uploaded.statusCode).toBe(200);
      const asset = uploaded.json().asset as MapAsset;
      expect(scannerRequest.authorization).toBe("Bearer trust-token");
      expect(scannerRequest.body).toMatchObject({
        name: "Trusted.png",
        mimeType: "image/png",
        sizeBytes: bytes.length,
        checksum: asset.checksum,
        contentBase64: bytes.toString("base64")
      });
      expect(asset.security).toMatchObject({
        status: "clean",
        scanner: "builtin-asset-scanner+manual-av",
        findings: [{ code: "third_party_av_clean", severity: "low" }]
      });
      expect(existsSync(join(directory, "camp_demo", `${asset.id}.png`))).toBe(true);
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => scanner.close((error) => (error ? reject(error) : resolve())));
      restoreEnv(previousEnv);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks external asset trust scanner rejections before writing records or bytes", async () => {
    const previousEnv = snapshotEnv(["OTTE_ASSET_TRUST_WEBHOOK_URL", "OTTE_ASSET_TRUST_WEBHOOK_TOKEN", "OTTE_ASSET_TRUST_TIMEOUT_MS", "OTTE_ASSET_TRUST_FAIL_CLOSED", "OTTE_ASSET_TRUST_SCANNER_NAME"]);
    const directory = mkdtempSync(join(tmpdir(), "otte-asset-trust-blocked-"));
    const store = new MemoryStateStore();
    const scanner = createServer(async (_request, response) => {
      sendJson(response, {
        status: "blocked",
        scanner: "manual-av",
        findings: [{ code: "third_party_malware", severity: "high", message: "External scanner blocked upload" }]
      });
    });
    await new Promise<void>((resolve) => scanner.listen(0, "127.0.0.1", resolve));
    const address = scanner.address() as AddressInfo;
    process.env.OTTE_ASSET_TRUST_WEBHOOK_URL = `http://127.0.0.1:${address.port}/scan`;
    process.env.OTTE_ASSET_TRUST_TIMEOUT_MS = "1000";
    process.env.OTTE_ASSET_TRUST_FAIL_CLOSED = "true";
    process.env.OTTE_ASSET_TRUST_SCANNER_NAME = "external-asset-scanner";
    const app = await buildApp({
      store,
      uploadDir: directory
    });
    try {
      const blocked = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...authHeaders,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Blocked.png")
        },
        payload: Buffer.from("blocked-image-bytes")
      });

      expect(blocked.statusCode).toBe(422);
      expect(blocked.json()).toMatchObject({
        error: "asset_security_blocked",
        scanner: "manual-av",
        findings: [{ code: "third_party_malware", severity: "high" }]
      });
      expect(store.state.assets).toHaveLength(0);
      expect(existsSync(join(directory, "camp_demo"))).toBe(false);
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => scanner.close((error) => (error ? reject(error) : resolve())));
      restoreEnv(previousEnv);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when a configured external asset trust scanner errors", async () => {
    const previousEnv = snapshotEnv(["OTTE_ASSET_TRUST_WEBHOOK_URL", "OTTE_ASSET_TRUST_WEBHOOK_TOKEN", "OTTE_ASSET_TRUST_TIMEOUT_MS", "OTTE_ASSET_TRUST_FAIL_CLOSED", "OTTE_ASSET_TRUST_SCANNER_NAME"]);
    const directory = mkdtempSync(join(tmpdir(), "otte-asset-trust-error-"));
    const store = new MemoryStateStore();
    const scanner = createServer((_request, response) => {
      response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "scanner_down" }));
    });
    await new Promise<void>((resolve) => scanner.listen(0, "127.0.0.1", resolve));
    const address = scanner.address() as AddressInfo;
    process.env.OTTE_ASSET_TRUST_WEBHOOK_URL = `http://127.0.0.1:${address.port}/scan`;
    process.env.OTTE_ASSET_TRUST_TIMEOUT_MS = "1000";
    process.env.OTTE_ASSET_TRUST_FAIL_CLOSED = "true";
    process.env.OTTE_ASSET_TRUST_SCANNER_NAME = "external-asset-scanner";
    const app = await buildApp({
      store,
      uploadDir: directory
    });
    try {
      const blocked = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...authHeaders,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Scanner Error.png")
        },
        payload: Buffer.from("scanner-error-bytes")
      });

      expect(blocked.statusCode).toBe(422);
      expect(blocked.json()).toMatchObject({
        error: "asset_security_blocked",
        scanner: "external-asset-scanner",
        findings: [{ code: "external_scanner_unavailable", severity: "high" }]
      });
      expect(store.state.assets).toHaveLength(0);
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => scanner.close((error) => (error ? reject(error) : resolve())));
      restoreEnv(previousEnv);
      rmSync(directory, { recursive: true, force: true });
    }
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

  it("runs scheduled asset cleanup and reports scheduler status", async () => {
    const previousEnv = snapshotEnv([
      "OTTE_ADMIN_USER_IDS",
      "OTTE_ASSET_CLEANUP_CAMPAIGN_ID",
      "OTTE_ASSET_CLEANUP_DRY_RUN",
      "OTTE_ASSET_CLEANUP_GRACE_DAYS",
      "OTTE_ASSET_CLEANUP_INCLUDE_DELETED",
      "OTTE_ASSET_CLEANUP_INCLUDE_EXPIRED",
      "OTTE_ASSET_CLEANUP_INTERVAL_SECONDS",
      "OTTE_ASSET_CLEANUP_RUN_ON_START",
      "OTTE_ASSET_CLEANUP_USER_ID"
    ]);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    process.env.OTTE_ASSET_CLEANUP_CAMPAIGN_ID = "camp_scheduler";
    process.env.OTTE_ASSET_CLEANUP_GRACE_DAYS = "0";
    process.env.OTTE_ASSET_CLEANUP_INTERVAL_SECONDS = "0.2";
    process.env.OTTE_ASSET_CLEANUP_USER_ID = "usr_demo_gm";
    const directory = mkdtempSync(join(tmpdir(), "otte-scheduled-cleanup-"));
    const store = new MemoryStateStore();
    const targetStorage = new MemoryAssetStorage("scheduled-assets");
    const expiredBytes = Buffer.from("scheduled-expired-storage-bytes");
    const expiredAsset: MapAsset = createTimestamped("asset", {
      campaignId: "camp_scheduler",
      name: "Scheduled Expired.png",
      url: "",
      mimeType: "image/png",
      sizeBytes: expiredBytes.length,
      lifecycle: { status: "active", expiresAt: "2026-01-01T00:00:00.000Z" }
    });
    expiredAsset.url = `/api/v1/assets/${expiredAsset.id}/blob`;
    expiredAsset.storage = await targetStorage.put(expiredAsset, expiredBytes);
    store.state.assets.push(expiredAsset);
    const app = await buildApp({
      store,
      uploadDir: directory,
      assetStorage: targetStorage
    });
    try {
      const initialStatus = await app.inject({
        method: "GET",
        url: "/api/v1/admin/assets/storage",
        headers: authHeaders
      });
      expect(initialStatus.statusCode).toBe(200);
      expect(initialStatus.json().cleanupScheduler).toMatchObject({
        enabled: true,
        intervalSeconds: 0.2,
        runOnStart: false,
        dryRun: false,
        includeDeleted: true,
        includeExpired: true,
        graceDays: 0,
        campaignId: "camp_scheduler",
        updatedByUserId: "usr_demo_gm"
      });

      let scheduledRun: Record<string, unknown> | undefined;
      await waitForCondition(async () => {
        const status = await app.inject({
          method: "GET",
          url: "/api/v1/admin/assets/storage",
          headers: authHeaders
        });
        const lastRun = status.json().cleanupScheduler?.lastRun as Record<string, unknown> | undefined;
        if (lastRun?.status === "succeeded" && lastRun.deleted === 1 && Boolean(expiredAsset.lifecycle?.storageDeletedAt)) {
          scheduledRun = lastRun;
          return true;
        }
        return false;
      }, 2000);

      expect(targetStorage.objects.has(assetStorageKey(expiredAsset))).toBe(false);
      expect(expiredAsset.lifecycle).toMatchObject({
        status: "active",
        updatedByUserId: "usr_demo_gm",
        cleanupReason: "expired_asset"
      });
      expect(scheduledRun).toMatchObject({
        trigger: "interval",
        status: "succeeded",
        assetCount: 1,
        deleted: 1,
        missingMarked: 0,
        planned: 0,
        failed: 0,
        changed: true
      });
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
