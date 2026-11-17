import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SystemManifestData } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import {
  loadPluginRegistry,
  type PluginRuntimeRegistry,
} from "./plugin-runtime.js";
import { MemoryStateStore } from "./store.js";

const playerHeaders = { "x-user-id": "usr_demo_player" };

class DurableTestStateStore extends MemoryStateStore {}

function operatorHeaders(store: MemoryStateStore) {
  const sourceUser = store.state.users.find(
    (user) => user.id === "usr_demo_gm",
  )!;
  const sourceMember = store.state.members.find(
    (member) =>
      member.userId === sourceUser.id && member.campaignId === "camp_demo",
  )!;
  const userId = "usr_plugin_operator";
  store.state.users.push({
    ...structuredClone(sourceUser),
    id: userId,
    email: "plugin-operator@example.test",
    serverAdmin: false,
  });
  store.state.members.push({
    ...structuredClone(sourceMember),
    id: "mem_plugin_operator",
    userId,
    role: "gm",
  });
  return { "x-user-id": userId };
}

function promoteOperator(store: MemoryStateStore): void {
  store.state.users.find(
    (user) => user.id === "usr_plugin_operator",
  )!.serverAdmin = true;
}

function writePluginPackage(pluginRoot: string, packageId = "operator-plugin") {
  const packageDirectory = join(pluginRoot, packageId);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, "plugin.manifest.json"),
    JSON.stringify({
      id: "operator-plugin",
      name: "Operator Plugin",
      version: "1.0.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { server: "./server.js" },
      runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: ["chat.write"],
      chatCommands: [
        { command: "/operator", description: "Exercise operator safety" },
      ],
    }),
  );
  writeFileSync(
    join(packageDirectory, "server.js"),
    "registerCommand('/operator', () => ({ body: 'ok', visibility: 'public' }));",
  );
}

function localRegistry(pluginRoot: string): PluginRuntimeRegistry {
  return loadPluginRegistry({
    pluginRoot,
    trustPolicy: { policy: "allow_unsigned" },
  });
}

function systemManifest(): SystemManifestData {
  return {
    id: "operator-system",
    name: "Operator System",
    version: "1.0.0",
    compatibleCore: ">=0.3.0",
    entrypoints: {},
    schemas: {
      actor: "schemas/actor.json",
      item: "schemas/item.json",
    },
    permissions: ["actor.read"],
    capabilities: ["data-model"],
  };
}

describe("plugin and system operator mutation API", () => {
  it("requires K plus dual authority and replays redacted package/system installs exactly once", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-operator-"));
    writePluginPackage(pluginRoot);
    const store = new MemoryStateStore();
    const headers = operatorHeaders(store);
    const app = await buildApp({
      store,
      pluginRegistry: localRegistry(pluginRoot),
    });
    try {
      const playerDenied = await app.inject({
        method: "POST",
        url: "/api/v1/plugins/install",
        headers: { ...playerHeaders, "idempotency-key": "plugin-player" },
        payload: { campaignId: "camp_demo", packagePath: "operator-plugin" },
      });
      expect(playerDenied.statusCode).toBe(403);

      const adminDenied = await app.inject({
        method: "POST",
        url: "/api/v1/plugins/install",
        headers: { ...headers, "idempotency-key": "plugin-non-admin" },
        payload: { campaignId: "camp_demo", packagePath: "operator-plugin" },
      });
      expect(adminDenied.statusCode).toBe(403);
      expect(adminDenied.json().message).toBe("Server admin access required");

      promoteOperator(store);
      const missingKey = await app.inject({
        method: "POST",
        url: "/api/v1/plugins/install",
        headers,
        payload: { campaignId: "camp_demo", packagePath: "operator-plugin" },
      });
      expect(missingKey.statusCode).toBe(400);
      expect(missingKey.json().message.toLowerCase()).toContain(
        "idempotency-key",
      );

      const installRequest = {
        method: "POST" as const,
        url: "/api/v1/plugins/install",
        headers: { ...headers, "idempotency-key": "plugin-install-once" },
        payload: { campaignId: "camp_demo", packagePath: "operator-plugin" },
      };
      const installed = await app.inject(installRequest);
      const replay = await app.inject(installRequest);
      expect(installed.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(replay.body).toBe(installed.body);
      expect(
        store.state.auditLogs.filter(
          (audit) => audit.action === "plugin.packageRegister",
        ),
      ).toHaveLength(1);
      const audit = store.state.auditLogs.find(
        (entry) => entry.action === "plugin.packageRegister",
      )!;
      expect(audit).toMatchObject({
        actorUserId: "usr_plugin_operator",
        campaignId: "camp_demo",
        targetType: "plugin_package",
        targetId: "operator-plugin",
        after: {
          pluginId: "operator-plugin",
          version: "1.0.0",
          source: { packageId: "operator-plugin" },
        },
      });
      expect(audit.after).not.toHaveProperty("packagePath");
      expect(audit.after).not.toHaveProperty("manifestPath");

      const conflictingReplay = await app.inject({
        ...installRequest,
        payload: { campaignId: "camp_demo", packagePath: "missing-package" },
      });
      expect(conflictingReplay.statusCode).toBe(409);
      expect(
        store.state.auditLogs.filter(
          (entry) => entry.action === "plugin.packageRegister",
        ),
      ).toHaveLength(1);

      const systemWithoutKey = await app.inject({
        method: "POST",
        url: "/api/v1/systems/install",
        headers,
        payload: { campaignId: "camp_demo", manifest: systemManifest() },
      });
      expect(systemWithoutKey.statusCode).toBe(400);

      const systemRequest = {
        method: "POST" as const,
        url: "/api/v1/systems/install",
        headers: { ...headers, "idempotency-key": "system-install-once" },
        payload: { campaignId: "camp_demo", manifest: systemManifest() },
      };
      const system = await app.inject(systemRequest);
      const systemReplay = await app.inject(systemRequest);
      expect(system.statusCode).toBe(200);
      expect(systemReplay.body).toBe(system.body);
      expect(store.state.systemInstallations).toHaveLength(1);
      expect(
        store.state.auditLogs.filter(
          (entry) => entry.action === "system.install",
        ),
      ).toHaveLength(1);
    } finally {
      await app.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("requires K plus the exact review timestamp and exposes the registry generation", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-review-"));
    writePluginPackage(pluginRoot);
    const store = new MemoryStateStore();
    const headers = operatorHeaders(store);
    promoteOperator(store);
    const app = await buildApp({
      store,
      pluginRegistry: localRegistry(pluginRoot),
    });
    try {
      const snapshot = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/reviews",
        headers,
      });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json().registryRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
      const review = snapshot.json().plugins[0].review as {
        reviewKey: string;
        updatedAt: string;
      };
      const path = `/api/v1/admin/plugins/reviews/${encodeURIComponent(review.reviewKey)}`;

      const missingKey = await app.inject({
        method: "PATCH",
        url: path,
        headers,
        payload: { status: "approved", expectedUpdatedAt: review.updatedAt },
      });
      expect(missingKey.statusCode).toBe(400);

      const missingRevision = await app.inject({
        method: "PATCH",
        url: path,
        headers: { ...headers, "idempotency-key": "review-missing-revision" },
        payload: { status: "approved" },
      });
      expect(missingRevision.statusCode).toBe(400);
      expect(missingRevision.json().message).toContain("expectedUpdatedAt");

      const stale = await app.inject({
        method: "PATCH",
        url: path,
        headers: { ...headers, "idempotency-key": "review-stale" },
        payload: {
          status: "approved",
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        error: "stale_write",
        currentUpdatedAt: review.updatedAt,
      });

      const request = {
        method: "PATCH" as const,
        url: path,
        headers: { ...headers, "idempotency-key": "review-approve-once" },
        payload: { status: "approved", expectedUpdatedAt: review.updatedAt },
      };
      const approved = await app.inject(request);
      const replay = await app.inject(request);
      expect(approved.statusCode).toBe(200);
      expect(replay.body).toBe(approved.body);
      expect(
        store.state.auditLogs.filter(
          (entry) => entry.action === "admin.pluginReview.update",
        ),
      ).toHaveLength(1);

      const operations = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/operations",
        headers,
      });
      expect(operations.statusCode).toBe(200);
      expect(operations.json().registryRevision).toBe(
        snapshot.json().registryRevision,
      );
    } finally {
      await app.close();
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("serializes competing registry generations, rejects stale work, and replays the winning sync", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-sync-"));
    const manifest = JSON.stringify({
      id: "remote-operator-plugin",
      name: "Remote Operator Plugin",
      version: "1.0.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { server: "./server.js" },
      runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: ["chat.write"],
      chatCommands: [
        { command: "/remote", description: "Remote operator test" },
      ],
    });
    const packageText = JSON.stringify({
      files: {
        "plugin.manifest.json": manifest,
        "server.js":
          "registerCommand('/remote', () => ({ body: 'ok', visibility: 'public' }));",
      },
    });
    const checksum = `sha256:${createHash("sha256").update(packageText).digest("hex")}`;
    let catalogHits = 0;
    let packageHits = 0;
    const server = createServer((request, response) => {
      if (request.url === "/catalog.json") {
        catalogHits += 1;
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            plugins: [
              {
                packageId: "remote-operator-plugin-1",
                packageUrl: "/remote-operator-plugin-1.json",
                checksum,
              },
            ],
          }),
        );
        return;
      }
      if (request.url === "/remote-operator-plugin-1.json") {
        packageHits += 1;
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(packageText);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog.json`;
    const previousRegistryUrls = process.env.OTTE_PLUGIN_REGISTRY_URLS;
    const previousTimeout = process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS;
    process.env.OTTE_PLUGIN_REGISTRY_URLS = registryUrl;
    process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS = "2000";
    const store = new MemoryStateStore();
    const headers = operatorHeaders(store);
    promoteOperator(store);
    const pluginRegistry = loadPluginRegistry({
      pluginRoot,
      trustPolicy: { policy: "allow_unsigned" },
      network: { allowPrivateNetwork: true },
    });
    const app = await buildApp({ store, pluginRegistry });
    try {
      const snapshot = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/reviews",
        headers,
      });
      const expectedRegistryRevision = snapshot.json()
        .registryRevision as string;

      const missingKey = await app.inject({
        method: "POST",
        url: "/api/v1/admin/plugins/registry/sync",
        headers,
        payload: { registryUrl, expectedRegistryRevision },
      });
      expect(missingKey.statusCode).toBe(400);

      const missingRevision = await app.inject({
        method: "POST",
        url: "/api/v1/plugins/registry/sync",
        headers: { ...headers, "idempotency-key": "sync-missing-revision" },
        payload: { campaignId: "camp_demo", registryUrl },
      });
      expect(missingRevision.statusCode).toBe(400);
      expect(missingRevision.json().message).toContain(
        "expectedRegistryRevision",
      );

      const nonAdminStore = store.state.users.find(
        (user) => user.id === "usr_plugin_operator",
      )!;
      nonAdminStore.serverAdmin = false;
      const nonAdmin = await app.inject({
        method: "POST",
        url: "/api/v1/plugins/registry/sync",
        headers: { ...headers, "idempotency-key": "sync-non-admin" },
        payload: {
          campaignId: "camp_demo",
          registryUrl,
          expectedRegistryRevision,
        },
      });
      expect(nonAdmin.statusCode).toBe(403);
      nonAdminStore.serverAdmin = true;

      const campaignRequest = {
        method: "POST" as const,
        url: "/api/v1/plugins/registry/sync",
        headers: { ...headers, "idempotency-key": "sync-campaign" },
        payload: {
          campaignId: "camp_demo",
          registryUrl,
          expectedRegistryRevision,
        },
      };
      const adminRequest = {
        method: "POST" as const,
        url: "/api/v1/admin/plugins/registry/sync",
        headers: { ...headers, "idempotency-key": "sync-admin" },
        payload: { registryUrl, expectedRegistryRevision },
      };
      const competing = await Promise.all([
        app.inject(campaignRequest),
        app.inject(adminRequest),
      ]);
      expect(competing.map((response) => response.statusCode).sort()).toEqual([
        200, 409,
      ]);
      const winnerIndex = competing.findIndex(
        (response) => response.statusCode === 200,
      );
      const winner = competing[winnerIndex]!;
      expect(winner.json()).toMatchObject({
        previousRegistryRevision: expectedRegistryRevision,
        registryRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });
      expect(winner.json().registryRevision).not.toBe(expectedRegistryRevision);
      const replay = await app.inject(
        winnerIndex === 0 ? campaignRequest : adminRequest,
      );
      expect(replay.statusCode).toBe(200);
      expect(replay.body).toBe(winner.body);
      expect(catalogHits).toBe(1);
      expect(packageHits).toBe(1);
      expect(
        store.state.auditLogs.filter(
          (entry) =>
            entry.action === "plugin.registrySync" ||
            entry.action === "admin.pluginRegistry.sync",
        ),
      ).toHaveLength(1);

      const stale = await app.inject({
        ...adminRequest,
        headers: { ...headers, "idempotency-key": "sync-stale" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        error: "stale_write",
        expectedRegistryRevision,
        currentRegistryRevision: winner.json().registryRevision,
      });
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previousRegistryUrls === undefined)
        delete process.env.OTTE_PLUGIN_REGISTRY_URLS;
      else process.env.OTTE_PLUGIN_REGISTRY_URLS = previousRegistryUrls;
      if (previousTimeout === undefined)
        delete process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS;
      else process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS = previousTimeout;
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });

  it("does not hold the durable mutation gate while registry DNS or download work is pending", async () => {
    const pluginRoot = mkdtempSync(join(tmpdir(), "otte-plugin-sync-gate-"));
    let releaseCatalog: (() => void) | undefined;
    let markCatalogStarted!: () => void;
    const catalogStarted = new Promise<void>((resolve) => {
      markCatalogStarted = resolve;
    });
    const server = createServer((request, response) => {
      if (request.url !== "/catalog.json") {
        response.writeHead(404).end();
        return;
      }
      releaseCatalog = () => {
        if (response.writableEnded) return;
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ plugins: [] }));
      };
      markCatalogStarted();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog.json`;
    const previousRegistryUrls = process.env.OTTE_PLUGIN_REGISTRY_URLS;
    const previousTimeout = process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS;
    process.env.OTTE_PLUGIN_REGISTRY_URLS = registryUrl;
    process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS = "3000";
    const store = new DurableTestStateStore();
    const headers = operatorHeaders(store);
    promoteOperator(store);
    const pluginRegistry = loadPluginRegistry({
      pluginRoot,
      trustPolicy: { policy: "allow_unsigned" },
      network: { allowPrivateNetwork: true },
    });
    const app = await buildApp({ store, pluginRegistry });
    try {
      const snapshot = await app.inject({
        method: "GET",
        url: "/api/v1/admin/plugins/reviews",
        headers,
      });
      const syncPromise = app.inject({
        method: "POST",
        url: "/api/v1/admin/plugins/registry/sync",
        headers: { ...headers, "idempotency-key": "sync-gate-pending" },
        payload: {
          registryUrl,
          expectedRegistryRevision: snapshot.json().registryRevision,
        },
      });
      await catalogStarted;

      const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
      const writePromise = app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: {
          "x-user-id": "usr_demo_gm",
          "idempotency-key": "actor-write-during-registry-sync",
        },
        payload: { name: "Valen During Registry Sync", expectedUpdatedAt: actor.updatedAt },
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const writeOutcome = await Promise.race([
        writePromise.then((response) => ({ kind: "response" as const, response })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timeout = setTimeout(() => resolve({ kind: "timeout" }), 750);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      const releasePendingCatalog = releaseCatalog;
      if (!releasePendingCatalog) throw new Error("Registry catalog request did not reach the test server");
      releasePendingCatalog();
      const sync = await syncPromise;

      expect(writeOutcome.kind).toBe("response");
      if (writeOutcome.kind === "response") expect(writeOutcome.response.statusCode, writeOutcome.response.body).toBe(200);
      expect(sync.statusCode).toBe(200);
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)?.name).toBe("Valen During Registry Sync");
    } finally {
      releaseCatalog?.();
      await app.close();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      if (previousRegistryUrls === undefined) delete process.env.OTTE_PLUGIN_REGISTRY_URLS;
      else process.env.OTTE_PLUGIN_REGISTRY_URLS = previousRegistryUrls;
      if (previousTimeout === undefined) delete process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS;
      else process.env.OTTE_PLUGIN_REGISTRY_TIMEOUT_MS = previousTimeout;
      rmSync(pluginRoot, { recursive: true, force: true });
    }
  });
});
