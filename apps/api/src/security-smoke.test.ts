import { createHash, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTimestamped, type MapAsset } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { assetStorageKey, LocalAssetStorage } from "./asset-storage.js";
import { buildApp } from "./app.js";
import { loadPluginRegistry, pluginSignatureForPackage } from "./plugin-runtime.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const demoPassword = "demo-password-123";
const envKeys = [
  "NODE_ENV",
  "OTTE_ADMIN_USER_IDS",
  "OTTE_ASSET_CDN_BASE_URL",
  "OTTE_ASSET_URL_SIGNING_SECRET",
  "OTTE_ASSET_URL_TTL_SECONDS",
  "OTTE_ASSET_URL_MAX_TTL_SECONDS",
  "OTTE_PLUGIN_REVIEW_POLICY",
  "OTTE_PLUGIN_TRUST_POLICY",
  "OTTE_PLUGIN_TRUST_KEYS"
];

describe("security smoke", () => {
  afterEach(() => {
    restoreEnv(snapshot);
  });

  const snapshot = snapshotEnv(envKeys);

  it("enforces server-admin auth boundaries", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });
    try {
      const missingSession = await app.inject({
        method: "GET",
        url: "/api/v1/admin/audit-logs"
      });
      expect(missingSession.statusCode).toBe(401);

      const nonAdmin = await app.inject({
        method: "GET",
        url: "/api/v1/admin/audit-logs",
        headers: playerHeaders
      });
      expect(nonAdmin.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("blocks unsafe uploaded assets before records or bytes are written", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-security-upload-"));
    const store = new MemoryStateStore();
    const app = await buildApp({ store, uploadDir: directory });
    try {
      const activeSvg = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...gmHeaders,
          "content-type": "image/svg+xml",
          "x-asset-name": encodeURIComponent("active.svg")
        },
        payload: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(1)</script></svg>")
      });

      expect(activeSvg.statusCode).toBe(422);
      expect(activeSvg.json()).toMatchObject({ error: "asset_security_blocked", scanner: "builtin-asset-scanner" });
      expect(activeSvg.json().findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "active_svg_content", severity: "high" })]));
      expect(store.state.assets).toHaveLength(0);
      expect(existsSync(join(directory, "camp_demo"))).toBe(false);
    } finally {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires valid signed asset URLs and does not echo signing secrets", async () => {
    const previousEnv = snapshotEnv(envKeys);
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    process.env.OTTE_ASSET_CDN_BASE_URL = "https://cdn.example.test/otte";
    process.env.OTTE_ASSET_URL_SIGNING_SECRET = "security-smoke-signing-secret";
    process.env.OTTE_ASSET_URL_TTL_SECONDS = "120";
    process.env.OTTE_ASSET_URL_MAX_TTL_SECONDS = "600";

    const directory = mkdtempSync(join(tmpdir(), "otte-security-signed-"));
    const app = await buildApp({ store: new MemoryStateStore(), uploadDir: directory });
    try {
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...gmHeaders,
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("signed.png")
        },
        payload: Buffer.from("signed-image-bytes")
      });
      expect(uploaded.statusCode).toBe(200);
      const asset = uploaded.json().asset as MapAsset;

      const delivery = await app.inject({
        method: "POST",
        url: `/api/v1/assets/${asset.id}/delivery-url`,
        headers: gmHeaders,
        payload: { expiresInSeconds: 180, disposition: "attachment" }
      });
      expect(delivery.statusCode).toBe(200);
      expect(JSON.stringify(delivery.json())).not.toContain("security-smoke-signing-secret");

      const signedUrl = new URL(delivery.json().url as string);
      const signedApiPath = signedUrl.pathname.replace(/^\/otte/, "");
      const signedBlob = await app.inject({
        method: "GET",
        url: `${signedApiPath}${signedUrl.search}`
      });
      expect(signedBlob.statusCode).toBe(200);
      expect(signedBlob.headers["cache-control"]).toContain("public");

      const unsignedBlob = await app.inject({
        method: "GET",
        url: `/api/v1/assets/${asset.id}/blob`
      });
      expect(unsignedBlob.statusCode).toBe(401);

      signedUrl.searchParams.set("signature", "tampered");
      const tamperedBlob = await app.inject({
        method: "GET",
        url: `${signedApiPath}${signedUrl.search}`
      });
      expect(tamperedBlob.statusCode).toBe(401);
    } finally {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
      restoreEnv(previousEnv);
    }
  });

  it("keeps local asset storage paths inside the configured upload root", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-security-path-"));
    const storage = new LocalAssetStorage(directory);
    const asset = createTimestamped("asset", {
      id: "../asset/with\\slashes",
      campaignId: "../camp\\demo",
      name: "Unsafe path.png",
      mimeType: "image/png",
      sizeBytes: 5,
      checksum: "sha256:test",
      url: "/api/v1/assets/unsafe/blob",
      createdByUserId: "usr_demo_gm"
    }) satisfies MapAsset;

    try {
      expect(assetStorageKey(asset)).toBe("___camp_demo/___asset_with_slashes.png");
      const traversalAsset = { ...asset, storage: { provider: "local" as const, key: "../escape.png" } };
      await expect(storage.put(traversalAsset, Buffer.from("bytes"))).rejects.toThrow("Invalid asset storage path");
      expect(existsSync(join(directory, "..", "escape.png"))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires trusted plugin packages before install and command execution", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-security-plugin-"));
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      writeVersionedPluginPackage(pluginRoot, "unsigned-plugin", "unsigned-plugin", "1.0.0", "Unsigned macro");
      writeVersionedPluginPackage(pluginRoot, "signed-plugin", "signed-plugin", "1.0.0", "Signed macro");
      writePluginSignature(pluginRoot, "signed-plugin", "trusted-local", "shared-secret");

      app = await buildApp({
        store: new MemoryStateStore(),
        pluginRegistry: loadPluginRegistry({
          pluginRoot,
          trustPolicy: { policy: "require_trusted", keys: { "trusted-local": "shared-secret" } }
        })
      });

      const unsignedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/unsigned-plugin/install",
        headers: gmHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(unsignedInstall.statusCode).toBe(403);

      const unsignedCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/unsigned-plugin/chat-command",
        headers: gmHeaders,
        payload: { command: "/version" }
      });
      expect(unsignedCommand.statusCode).toBe(403);

      const signedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/signed-plugin/install",
        headers: gmHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(signedInstall.statusCode).toBe(200);
      expect(signedInstall.json().plugin.trust).toMatchObject({ status: "trusted", installable: true });

      const signedCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/signed-plugin/chat-command",
        headers: gmHeaders,
        payload: { command: "/version" }
      });
      expect(signedCommand.statusCode).toBe(200);
      expect(signedCommand.json().chat.body).toBe("Signed macro");
    } finally {
      await app?.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("covers plugin trust policy posture across production, registry, and review-required deployments", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-security-plugin-matrix-"));
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      writeVersionedPluginPackage(pluginRoot, "local-unsigned-plugin", "local-unsigned-plugin", "1.0.0", "Local unsigned macro");
      writeVersionedPluginPackage(pluginRoot, "registry-signed-plugin", "registry-signed-plugin", "1.0.0", "Registry signed macro");
      writePluginSignature(pluginRoot, "registry-signed-plugin", "trusted-local", "shared-secret");
      writePluginRegistryMetadata(pluginRoot, "registry-signed-plugin", "https://registry.example.test/catalog.json");
      process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";

      process.env.NODE_ENV = "production";
      delete process.env.OTTE_PLUGIN_REVIEW_POLICY;
      process.env.OTTE_PLUGIN_TRUST_POLICY = "allow_unsigned";
      delete process.env.OTTE_PLUGIN_TRUST_KEYS;
      const permissiveStore = new MemoryStateStore();
      app = await buildApp({
        store: permissiveStore,
        pluginRegistry: loadPluginRegistry({
          pluginRoot,
          trustPolicy: { policy: "allow_unsigned" }
        })
      });
      const permissiveRegistryAdminHeaders = await loginTestUser(app, permissiveStore, "usr_demo_gm");
      const registryReviewBlockedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/registry-signed-plugin/install",
        headers: permissiveRegistryAdminHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(registryReviewBlockedInstall.statusCode).toBe(403);
      // A present but unverifiable signature is always a trust failure. Review
      // policy must not mask or downgrade that fail-closed decision.
      expect(registryReviewBlockedInstall.json().message).toContain("signature key is not trusted");
      const permissiveRegistryPosture = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/operations",
        headers: permissiveRegistryAdminHeaders
      });
      expect(permissiveRegistryPosture.statusCode).toBe(200);
      expect(permissiveRegistryPosture.json()).toEqual(
        expect.objectContaining({
          policy: { review: "allow_unreviewed", trust: "allow_unsigned" },
          actionReasons: expect.arrayContaining(["community_registry_review_policy_permissive"]),
          registryOperations: expect.objectContaining({
            communityDistributionNeedsReviewPolicy: true
          }),
          remediationQueue: expect.arrayContaining([
            expect.objectContaining({
              code: "require_review_for_community_registries",
              action: expect.stringContaining("OTTE_PLUGIN_REVIEW_POLICY=require_approved")
            })
          ])
        })
      );
      await app.close();
      app = undefined;

      process.env.NODE_ENV = "production";
      process.env.OTTE_PLUGIN_REVIEW_POLICY = "require_approved";
      process.env.OTTE_PLUGIN_TRUST_POLICY = "allow_unsigned";
      delete process.env.OTTE_PLUGIN_TRUST_KEYS;
      const productionStore = new MemoryStateStore();
      app = await buildApp({
        store: productionStore,
        pluginRegistry: loadPluginRegistry({
          pluginRoot,
          trustPolicy: { policy: "allow_unsigned" }
        })
      });
      const productionAdminHeaders = await loginTestUser(app, productionStore, "usr_demo_gm");
      const productionUnsignedPosture = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/operations",
        headers: productionAdminHeaders
      });
      expect(productionUnsignedPosture.statusCode).toBe(200);
      expect(productionUnsignedPosture.json()).toMatchObject({
        policy: { review: "require_approved", trust: "allow_unsigned" },
        securityPosture: {
          runtimeConfig: {
            trustPolicy: "allow_unsigned",
            allowUnsignedInProduction: true,
            trustedModeWithoutKeys: false
          },
          unsignedPackageCount: 1
        },
        reviewOperations: {
          sourceCounts: { local: 1, registry: 1 }
        }
      });
      expect(productionUnsignedPosture.json().actionReasons).toEqual(expect.arrayContaining(["plugin_trust_policy_allows_unsigned_in_production", "review_backlog"]));
      await app.close();
      app = undefined;

      process.env.NODE_ENV = "development";
      process.env.OTTE_PLUGIN_TRUST_POLICY = "require_trusted";
      delete process.env.OTTE_PLUGIN_TRUST_KEYS;
      const missingKeyStore = new MemoryStateStore();
      app = await buildApp({
        store: missingKeyStore,
        pluginRegistry: loadPluginRegistry({
          pluginRoot,
          trustPolicy: { policy: "require_trusted", keys: {} }
        })
      });
      const missingKeyAdminHeaders = await loginTestUser(app, missingKeyStore, "usr_demo_gm");
      const missingKeyPosture = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/operations",
        headers: missingKeyAdminHeaders
      });
      expect(missingKeyPosture.statusCode).toBe(200);
      expect(missingKeyPosture.json()).toMatchObject({
        policy: { review: "require_approved", trust: "require_trusted" },
        securityPosture: {
          runtimeConfig: {
            trustPolicy: "require_trusted",
            trustKeyCount: 0,
            trustedModeWithoutKeys: true
          },
          trustBlockedPackageCount: 2
        }
      });
      expect(missingKeyPosture.json().actionReasons).toEqual(expect.arrayContaining(["plugin_trust_keys_missing", "plugin_trust_policy_blocks"]));
      await app.close();
      app = undefined;

      process.env.NODE_ENV = "production";
      process.env.OTTE_PLUGIN_TRUST_POLICY = "require_trusted";
      process.env.OTTE_PLUGIN_TRUST_KEYS = JSON.stringify({ "trusted-local": "shared-secret" });
      const trustedStore = new MemoryStateStore();
      app = await buildApp({
        store: trustedStore,
        pluginRegistry: loadPluginRegistry({
          pluginRoot,
          trustPolicy: { policy: "require_trusted", keys: { "trusted-local": "shared-secret" } }
        })
      });
      const trustedAdminHeaders = await loginTestUser(app, trustedStore, "usr_demo_gm");
      const reviewBlockedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/registry-signed-plugin/install",
        headers: trustedAdminHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(reviewBlockedInstall.statusCode).toBe(403);
      expect(reviewBlockedInstall.json().message).toContain("requires marketplace approval");

      const reviews = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/reviews",
        headers: trustedAdminHeaders
      });
      expect(reviews.statusCode).toBe(200);
      const registryReview = reviews.json().plugins.find((item: { plugin: { id: string } }) => item.plugin.id === "registry-signed-plugin");
      expect(registryReview).toMatchObject({
        review: { sourceType: "registry", registryUrl: "https://registry.example.test/catalog.json" },
        plugin: { id: "registry-signed-plugin" },
        trust: { status: "trusted", installable: true }
      });
      const approvedReview = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/plugins/reviews/${registryReview.review.reviewKey}`,
        headers: trustedAdminHeaders,
        payload: { status: "approved", note: "deployment matrix smoke" }
      });
      expect(approvedReview.statusCode).toBe(200);

      const approvedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/registry-signed-plugin/install",
        headers: trustedAdminHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(approvedInstall.statusCode).toBe(200);
      expect(approvedInstall.json().plugin).toMatchObject({
        trust: { status: "trusted", installable: true },
        marketplaceReview: { review: { status: "approved" }, installable: true }
      });

      const localUnsignedInstall = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/local-unsigned-plugin/install",
        headers: trustedAdminHeaders,
        payload: { permissions: ["chat.write"] }
      });
      expect(localUnsignedInstall.statusCode).toBe(403);
      expect(localUnsignedInstall.json().message).toContain("unsigned");

      const signedCommand = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/plugins/registry-signed-plugin/chat-command",
        headers: trustedAdminHeaders,
        payload: { command: "/version" }
      });
      expect(signedCommand.statusCode).toBe(200);
      expect(signedCommand.json().chat.body).toBe("Registry signed macro");
    } finally {
      await app?.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });
});

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

function writeVersionedPluginPackage(pluginRoot: string, packageId: string, pluginId: string, version: string, body: string): void {
  const packagePath = join(pluginRoot, packageId);
  mkdirSync(packagePath);
  writeFileSync(
    join(packagePath, "plugin.manifest.json"),
    JSON.stringify({
      id: pluginId,
      name: "Security Smoke Plugin",
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

function testPasswordHash(password = demoPassword): string {
  const salt = "test-password-salt";
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString("base64url")}`;
}

function seedDemoPassword(store: MemoryStateStore, userId: string): { email?: string; password?: string; userId: string } {
  const user = store.state.users.find((item) => item.id === userId);
  if (!user) throw new Error(`Missing test user ${userId}`);
  user.passwordHash = testPasswordHash();
  user.passwordResetRequired = false;
  user.mfa = undefined;
  return { userId, email: user.email, password: user.email ? demoPassword : undefined };
}

async function loginTestUser(app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStateStore, userId: string): Promise<{ authorization: string }> {
  const credentials = seedDemoPassword(store, userId);
  const email = userId === "usr_demo_gm" ? "gm@example.test" : userId === "usr_demo_player" ? "player@example.test" : undefined;
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: email ? { email, password: credentials.password } : { userId }
  });
  expect(login.statusCode).toBe(200);
  return { authorization: `Bearer ${login.json().token}` };
}

function writePluginRegistryMetadata(pluginRoot: string, packageId: string, registryUrl: string): void {
  writeFileSync(
    join(pluginRoot, packageId, "plugin.registry.json"),
    JSON.stringify({
      registryUrl,
      packageUrl: `${registryUrl.replace(/\/catalog\.json$/, "")}/${packageId}.json`,
      packageChecksum: "sha256:test",
      syncedAt: new Date().toISOString()
    })
  );
}
