import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SystemManifestData } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const tempDirectories: string[] = [];

function manifest(overrides: Partial<SystemManifestData> = {}): SystemManifestData {
  return {
    id: "data-driven-test",
    name: "Data Driven Test",
    version: "1.0.0",
    compatibleCore: ">=0.3.0",
    entrypoints: {},
    schemas: { actor: "schemas/actor.json", item: "schemas/item.json" },
    permissions: ["actor.read"],
    capabilities: ["data-model"],
    ...overrides
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("durable rules-system registry", () => {
  it("requires campaign and server-admin authority, validates manifests, rejects conflicts, activates, audits, and reports unsupported runtime capabilities", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    const playerDenied = await app.inject({
      method: "POST",
      url: "/api/v1/systems/install",
      headers: playerHeaders,
      payload: { campaignId: "camp_demo", manifest: manifest() }
    });
    expect(playerDenied.statusCode).toBe(403);

    const adminDenied = await app.inject({
      method: "POST",
      url: "/api/v1/systems/install",
      headers: gmHeaders,
      payload: { campaignId: "camp_demo", manifest: manifest() }
    });
    expect(adminDenied.statusCode).toBe(403);
    expect(adminDenied.json()).toEqual(expect.objectContaining({ error: "forbidden", message: "Server admin access required" }));

    const gm = store.state.users.find((user) => user.id === "usr_demo_gm")!;
    gm.serverAdmin = true;

    for (const invalid of [
      manifest({ id: "Not Safe" }),
      manifest({ version: "latest" }),
      manifest({ compatibleCore: ">=9.0.0" }),
      manifest({ permissions: ["campaign.delete"] }),
      manifest({ schemas: { actor: "../actor.json", item: "schemas/item.json" } })
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/systems/install", headers: gmHeaders, payload: { campaignId: "camp_demo", manifest: invalid } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(expect.objectContaining({ error: "invalid_system_manifest", issues: expect.any(Array) }));
    }

    const runtimeRejected = await app.inject({
      method: "POST",
      url: "/api/v1/systems/install",
      headers: gmHeaders,
      payload: { campaignId: "camp_demo", manifest: manifest({ capabilities: ["data-model", "actor-sheet"] }) }
    });
    expect(runtimeRejected.statusCode).toBe(422);
    expect(runtimeRejected.json()).toEqual(expect.objectContaining({ error: "unsupported_system_capabilities", capabilities: ["actor-sheet"] }));

    const installed = await app.inject({
      method: "POST",
      url: "/api/v1/systems/install",
      headers: gmHeaders,
      payload: { campaignId: "camp_demo", manifest: manifest() }
    });
    expect(installed.statusCode).toBe(200);
    expect(installed.json()).toEqual(expect.objectContaining({ id: "data-driven-test", source: "api", dataDriven: true, runtimeCapabilities: ["data-model"], active: false }));
    expect(store.state.systemInstallations).toHaveLength(1);
    expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "system.install", actorUserId: "usr_demo_gm", actorType: "user", targetId: "data-driven-test" }));

    const duplicate = await app.inject({ method: "POST", url: "/api/v1/systems/install", headers: gmHeaders, payload: { campaignId: "camp_demo", manifest: manifest() } });
    expect(duplicate.statusCode).toBe(409);
    const nameConflict = await app.inject({ method: "POST", url: "/api/v1/systems/install", headers: gmHeaders, payload: { campaignId: "camp_demo", manifest: manifest({ id: "different-id" }) } });
    expect(nameConflict.statusCode).toBe(409);

    const activated = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/systems/data-driven-test/install", headers: gmHeaders, payload: {} });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toEqual(expect.objectContaining({ system: expect.objectContaining({ id: "data-driven-test", active: true }), campaign: expect.objectContaining({ defaultSystemId: "data-driven-test" }) }));
    expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "system.activate", actorUserId: "usr_demo_gm", actorType: "user", targetId: "data-driven-test" }));

    const snapshot = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot", headers: gmHeaders });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().bundled.systems).toContainEqual(expect.objectContaining({ id: "data-driven-test", active: true, runtimeCapabilities: ["data-model"] }));
    expect(snapshot.json().bundled).not.toHaveProperty("characterTemplates");

    const baseActor = store.state.actors[0]!;
    store.state.actors.push({ ...baseActor, id: "act_data_driven", name: "Data Driven Hero", systemId: "data-driven-test", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const unsupportedSheet = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/systems/data-driven-test/actors/act_data_driven/sheet",
      headers: gmHeaders
    });
    expect(unsupportedSheet.statusCode).toBe(422);
    expect(unsupportedSheet.json()).toEqual(expect.objectContaining({ error: "unsupported_system_capability", systemId: "data-driven-test", capability: "actor-sheet" }));

    const unsupportedRest = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/data-driven-test/actors/act_data_driven/rest",
      headers: gmHeaders,
      payload: { restType: "long" }
    });
    expect(unsupportedRest.statusCode).toBe(422);
    expect(unsupportedRest.json()).toEqual(expect.objectContaining({ error: "unsupported_system_capability", systemId: "data-driven-test", capability: "rest" }));

    const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().manifest.systemRequirements).toContainEqual(expect.objectContaining({ id: "data-driven-test", version: "1.0.0", capabilities: ["data-model"] }));

    await app.close();
  });

  it("persists approved installations across a SQLite restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-system-registry-"));
    tempDirectories.push(directory);
    const databasePath = join(directory, "state.sqlite");
    const firstStore = new SqliteStateStore(databasePath, { seedDemo: true });
    firstStore.state.users.find((user) => user.id === "usr_demo_gm")!.serverAdmin = true;
    firstStore.save();
    firstStore.flush();
    const firstApp = await buildApp({ store: firstStore });
    const response = await firstApp.inject({
      method: "POST",
      url: "/api/v1/systems/install",
      headers: gmHeaders,
      payload: { campaignId: "camp_demo", manifest: manifest({ id: "persistent-system", name: "Persistent System" }) }
    });
    expect(response.statusCode).toBe(200);
    firstStore.flush();
    await firstApp.close();
    firstStore.close();

    const restartedStore = new SqliteStateStore(databasePath, { seedDemo: false });
    const restartedApp = await buildApp({ store: restartedStore });
    const catalog = await restartedApp.inject({ method: "GET", url: "/api/v1/systems", headers: gmHeaders });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toContainEqual(expect.objectContaining({ id: "persistent-system", source: "api", dataDriven: true }));
    expect(restartedStore.state.systemInstallations).toContainEqual(expect.objectContaining({ manifest: expect.objectContaining({ id: "persistent-system" }) }));
    await restartedApp.close();
    restartedStore.close();
  });
});
