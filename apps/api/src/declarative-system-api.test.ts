import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actor, Campaign, DeclarativeActorSheet, DeclarativeSystemManifest, DiceRoll, Item, PermissionName, SystemInstallation, SystemManifestIdentity } from "@open-tabletop/core";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { declarativeSystemManifestChecksum } from "./declarative-system-runtime.js";

const campaignId = "camp_demo";
const adminId = "usr_demo_gm";
const playerId = "usr_demo_player";
const managerId = "usr_decl_manager";
const readerId = "usr_decl_reader";
const noChatId = "usr_decl_nochat";
const noDiceId = "usr_decl_nodice";
const outsiderId = "usr_decl_outsider";
const systemId = "orbital-scout-rules";

function manifest(version = "1.0.0"): DeclarativeSystemManifest {
  return {
    id: systemId, name: "Orbital Scout Rules", version, compatibleCore: ">=0.3.0 <0.4.0", entrypoints: {},
    schemas: {
      actor: { type: "object", additionalProperties: false, required: ["focus", "drive", "energy"], properties: {
        focus: { type: "integer", minimum: 0, maximum: 5 },
        drive: { type: "integer", minimum: -2, maximum: 5 },
        energy: { type: "integer", minimum: 0, maximum: 6 },
      } },
      item: { type: "object", additionalProperties: false, required: ["mass", "category"], properties: {
        mass: { type: "integer", minimum: 0, maximum: 20 },
        category: { type: "string", maxLength: 16, enum: ["tool", "supply"] },
      } },
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions"],
    definition: {
      kind: "declarative-v1", actorTypes: ["scout"], itemTypes: ["kit"],
      actorDefaults: { focus: 2, drive: 1, energy: 6 }, itemDefaults: { mass: 1, category: "tool" },
      sheet: { fields: [
        { path: ["focus"], label: "Focus", editable: true },
        { path: ["drive"], label: "Drive", editable: true },
        { path: ["energy"], label: "Energy", editable: true },
      ] },
      quickRolls: [
        { id: "scan", label: "Scan", dice: { count: 2, sides: 6, bonus: 0, addFields: [["focus"]] } },
        { id: "boost", label: "Boost", dice: { count: 2, sides: 6, bonus: 0, addFields: [["drive"]] }, cost: { path: ["energy"], amount: 1 } },
      ],
    },
  };
}

interface Harness { directory: string; databasePath: string; store: SqliteStateStore; app: FastifyInstance; logs: string[] }

function headers(userId: string, key?: string) {
  return { "x-user-id": userId, ...(key === undefined ? {} : { "idempotency-key": key }) };
}

async function harness(retainedInstallations: SystemInstallation[] = []): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), "otte-declarative-api-"));
  const databasePath = join(directory, "state.sqlite");
  const logs: string[] = [];
  const store = new SqliteStateStore(databasePath, { seedDemo: true });
  const source = structuredClone(store.state.users.find((user) => user.id === adminId)!);
  const member = structuredClone(store.state.members.find((entry) => entry.campaignId === campaignId && entry.userId === adminId)!);
  store.state.users.find((user) => user.id === adminId)!.serverAdmin = true;
  for (const userId of [managerId, readerId, noChatId, noDiceId, outsiderId]) {
    store.state.users.push({ ...source, id: userId, email: `${userId}@example.test`, serverAdmin: false });
    if (userId !== outsiderId) store.state.members.push({ ...member, id: `member-${userId}`, userId, role: userId === managerId ? "gm" : "observer" });
  }
  for (const [userId, permissions] of [[readerId, ["dice.roll", "chat.write"]], [noChatId, ["dice.roll"]], [noDiceId, ["chat.write"]]] as Array<[string, PermissionName[]]>) {
    store.state.permissionGrants.push({ id: `grant-${userId}`, subjectType: "user", subjectId: userId, campaignId, permissions, createdAt: source.createdAt, updatedAt: source.updatedAt });
  }
  store.state.systemInstallations.push(...retainedInstallations);
  store.save(); store.flush();
  try { return { directory, databasePath, store, logs, app: await buildApp({ store, uploadDir: join(directory, "uploads"), requestLogStream: { write: (message) => logs.push(message) } }) }; }
  catch (error) { store.close(); rmSync(directory, { recursive: true, force: true }); throw error; }
}

async function close(h: Harness): Promise<void> {
  try { await h.app.close(); }
  finally { h.store.close(); rmSync(h.directory, { recursive: true, force: true }); }
}

async function restart(h: Harness): Promise<void> {
  h.store.flush(); await h.app.close(); h.store.close();
  h.store = new SqliteStateStore(h.databasePath, { seedDemo: false });
  h.app = await buildApp({ store: h.store, uploadDir: join(h.directory, "uploads"), requestLogStream: { write: (message) => h.logs.push(message) } });
}

async function readCampaign(h: Harness): Promise<Campaign> {
  const response = await h.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}`, headers: headers(adminId) });
  expect(response.statusCode, response.body + "\n" + h.logs.slice(-4).join("\n")).toBe(200);
  return response.json<Campaign>();
}

async function readActor(h: Harness, actorId: string, userId = adminId): Promise<Actor> {
  const response = await h.app.inject({ method: "GET", url: `/api/v1/actors/${actorId}`, headers: headers(userId) });
  expect(response.statusCode, response.body + "\n" + h.logs.slice(-4).join("\n")).toBe(200);
  return response.json<Actor>();
}

async function install(h: Harness, definition: DeclarativeSystemManifest, key: string): Promise<SystemManifestIdentity> {
  const response = await h.app.inject({ method: "POST", url: "/api/v1/systems/install", headers: headers(adminId, key), payload: { campaignId, manifest: definition } });
  expect(response.statusCode, response.body + "\n" + h.logs.slice(-4).join("\n")).toBe(200);
  const result = response.json<{ installedVersions: SystemManifestIdentity[]; runtimeCapabilities: string[]; source: string }>();
  expect(result.source).toBe("api");
  expect(result.runtimeCapabilities).toEqual(["data-model", "actor-sheet", "quick-rolls", "actions"]);
  const identity = result.installedVersions.find((entry) => entry.systemId === definition.id && entry.version === definition.version)!;
  expect(identity).toMatchObject({ systemId: definition.id, version: definition.version, checksum: expect.stringMatching(/^[a-f0-9]{64}$/) });
  return identity;
}

async function bind(h: Harness, system: SystemManifestIdentity, expectedBinding: SystemManifestIdentity | null, key: string): Promise<Campaign> {
  const campaign = await readCampaign(h);
  const response = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/systems/${systemId}/binding`, headers: headers(adminId, key), payload: { expectedUpdatedAt: campaign.updatedAt, system, expectedBinding } });
  expect(response.statusCode, response.body + "\n" + h.logs.slice(-4).join("\n")).toBe(200);
  expect(response.json().binding).toEqual(system);
  return response.json().campaign as Campaign;
}

async function activate(h: Harness, key: string): Promise<void> {
  const campaign = await readCampaign(h);
  const response = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/systems/${systemId}/install`, headers: headers(adminId, key), payload: { expectedUpdatedAt: campaign.updatedAt } });
  expect(response.statusCode, response.body + "\n" + h.logs.slice(-4).join("\n")).toBe(200);
  expect(response.json().campaign.defaultSystemId).toBe(systemId);
}

async function createActor(h: Harness, key: string, options: Partial<Actor> = {}): Promise<Actor> {
  const response = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/actors`, headers: headers(adminId, key), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, name: "Ada the Scout", ownerUserId: playerId, ...options } });
  expect(response.statusCode, response.body + "\n" + h.logs.slice(-4).join("\n")).toBe(200);
  return response.json<Actor>();
}

function actorRoute(actorId: string, operation: "sheet" | "roll"): string {
  return `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/${operation}`;
}

function rollBody(record: Actor, system: SystemManifestIdentity, rollId = "boost") {
  return { rollId, expectedActorUpdatedAt: record.updatedAt, expectedSystem: system };
}

function rulesWrites(h: Harness, actorId: string) {
  return {
    actor: structuredClone(h.store.state.actors.find((entry) => entry.id === actorId)),
    rolls: structuredClone(h.store.state.rolls.filter((entry) => entry.actorId === actorId)),
    chat: structuredClone(h.store.state.chat.filter((entry) => h.store.state.rolls.some((roll) => roll.actorId === actorId && roll.id === entry.rollId))),
    audit: structuredClone(h.store.state.auditLogs.filter((entry) => entry.action === "system.actor.roll" && entry.targetId === actorId)),
  };
}

function assertDice(roll: DiceRoll, modifier: number): void {
  expect(roll.formula).toBe(`2d6+${modifier}`);
  const dice = roll.terms.find((term) => term.type === "die")!;
  expect(dice).toMatchObject({ count: 2, sides: 6 });
  expect(dice.results).toHaveLength(2);
  for (const result of dice.results!) expect(Number.isInteger(result) && result >= 1 && result <= 6).toBe(true);
  expect(roll.total).toBe(dice.results!.reduce((total, result) => total + result, 0) + modifier);
  expect(roll.fairness).toMatchObject({ algorithm: "xmur3-mulberry32", serverSeed: expect.any(String), serverSeedHash: expect.any(String) });
  expect(createHash("sha256").update(roll.fairness!.serverSeed).digest("hex")).toBe(roll.fairness!.serverSeedHash);
}

describe("public declarative systems through the raw API and SQLite", () => {
  it("requires explicit administrative installation and exact campaign binding before default actor/item creation", async () => {
    const h = await harness();
    try {
      for (const userId of [playerId, managerId]) {
        const response = await h.app.inject({ method: "POST", url: "/api/v1/systems/install", headers: headers(userId, `install-denied-${userId}`), payload: { campaignId, manifest: manifest() } });
        expect(response.statusCode, response.body).toBe(403);
      }
      const noKey = await h.app.inject({ method: "POST", url: "/api/v1/systems/install", headers: headers(adminId), payload: { campaignId, manifest: manifest() } });
      expect(noKey.statusCode, noKey.body).toBe(400);
      const identity = await install(h, manifest(), "install-v1");
      const conflicting = manifest(); conflicting.definition.quickRolls[1]!.label = "Tampered same version";
      const conflict = await h.app.inject({ method: "POST", url: "/api/v1/systems/install", headers: headers(adminId, "install-same-version-tampered"), payload: { campaignId, manifest: conflicting } });
      expect(conflict.statusCode, conflict.body).toBe(409);
      expect(h.store.state.systemInstallations.filter((entry) => entry.manifest.id === systemId)).toHaveLength(1);

      const beforeCount = h.store.state.actors.length;
      const unbound = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/actors`, headers: headers(adminId, "create-unbound"), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, systemId, name: "Unbound scout" } });
      expect(unbound.statusCode, unbound.body).toBe(422);
      expect(h.store.state.actors).toHaveLength(beforeCount);
      expect(unbound.json().error).toBe("invalid_system_state");
      const campaign = await readCampaign(h);
      const bindingPayload = { expectedUpdatedAt: campaign.updatedAt, system: identity, expectedBinding: null };
      const playerBinding = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/systems/${systemId}/binding`, headers: headers(playerId, "player-bind"), payload: bindingPayload });
      expect(playerBinding.statusCode, playerBinding.body).toBe(403);
      const noBindingKey = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/systems/${systemId}/binding`, headers: headers(adminId), payload: bindingPayload });
      expect(noBindingKey.statusCode, noBindingKey.body).toBe(400);
      await bind(h, identity, null, "select-bind-v1");
      await activate(h, "activate-v1");

      const record = await createActor(h, "create-default-scout");
      expect(record).toMatchObject({ systemId, type: "scout", ownerUserId: playerId, data: { focus: 2, drive: 1, energy: 6 } });
      const sheet = await h.app.inject({ method: "GET", url: actorRoute(record.id, "sheet"), headers: headers(playerId) });
      expect(sheet.statusCode, sheet.body).toBe(200);
      expect(sheet.json<DeclarativeActorSheet>()).toMatchObject({ kind: "declarative-v1", system: identity, actorId: record.id, actorUpdatedAt: record.updatedAt });
      expect(sheet.json().fields.map((field: { label: string; value: unknown }) => [field.label, field.value])).toEqual([["Focus", 2], ["Drive", 1], ["Energy", 6]]);
      const itemResponse = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/items`, headers: headers(adminId, "create-default-kit"), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, actorId: record.id, name: "Survey kit" } });
      expect(itemResponse.statusCode, itemResponse.body).toBe(200);
      const item = itemResponse.json<Item>();
      expect(item).toMatchObject({ systemId, type: "kit", actorId: record.id, data: { mass: 1, category: "tool" } });

      const invalidActor = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/actors`, headers: headers(adminId, "invalid-scout"), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, name: "Invalid scout", data: { focus: 99, drive: 1, energy: 6 } } });
      expect(invalidActor.statusCode, invalidActor.body).toBe(422);
      expect(h.store.state.actors).toHaveLength(beforeCount + 1);
      const invalidItem = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/items`, headers: headers(adminId, "invalid-kit"), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, actorId: record.id, name: "Invalid kit", data: { mass: 1, category: "invented" } } });
      expect(invalidItem.statusCode, invalidItem.body).toBe(422);
      expect(h.store.state.items.filter((entry) => entry.systemId === systemId)).toHaveLength(1);

      const edit = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${record.id}`, headers: headers(playerId, "edit-focus"), payload: { expectedUpdatedAt: record.updatedAt, data: { ...record.data, focus: 3 } } });
      expect(edit.statusCode, edit.body).toBe(200);
      const edited = edit.json<Actor>();
      expect(edited.data.focus).toBe(3);
      expect(edited.updatedAt).not.toBe(record.updatedAt);
      const stale = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${record.id}`, headers: headers(playerId, "stale-focus-edit"), payload: { expectedUpdatedAt: record.updatedAt, data: { ...record.data, focus: 4 } } });
      expect(stale.statusCode, stale.body).toBe(409);
      const invalidEdit = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${record.id}`, headers: headers(playerId, "invalid-focus-edit"), payload: { expectedUpdatedAt: edited.updatedAt, data: { ...edited.data, focus: 99 } } });
      expect(invalidEdit.statusCode, invalidEdit.body).toBe(422);
      expect(await readActor(h, record.id)).toEqual(edited);
      const invalidItemEdit = await h.app.inject({ method: "PATCH", url: `/api/v1/items/${item.id}`, headers: headers(adminId, "invalid-kit-edit"), payload: { expectedUpdatedAt: item.updatedAt, data: { mass: -1, category: "tool" } } });
      expect(invalidItemEdit.statusCode, invalidItemEdit.body).toBe(422);
      expect(structuredClone(h.store.state.items.find((entry) => entry.id === item.id))).toEqual(item);
    } finally { await close(h); }
  });

  it("preserves declarative data during authorized metadata-only actor and item edits and rejects unknown or invalid fields", async () => {
    const h = await harness();
    try {
      const definition = manifest();
      definition.definition.actorTypes.push("pilot"); definition.definition.itemTypes.push("probe");
      const identity = await install(h, definition, "install-metadata-rules");
      await bind(h, identity, null, "select-metadata-rules"); await activate(h, "activate-metadata-rules");
      const originalActor = await createActor(h, "create-metadata-scout", { data: { focus: 4, drive: -1, energy: 2 } });
      const worldResponse = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/worlds`, headers: headers(adminId, "create-metadata-world"), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, name: "Outer Rim" } });
      expect(worldResponse.statusCode, worldResponse.body).toBe(200);
      const worldId = worldResponse.json().id as string;
      const itemResponse = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/items`, headers: headers(adminId, "create-metadata-kit"), payload: { expectedUpdatedAt: (await readCampaign(h)).updatedAt, actorId: originalActor.id, name: "Remote sensor", data: { mass: 3, category: "supply" } } });
      expect(itemResponse.statusCode, itemResponse.body).toBe(200);
      const originalItem = itemResponse.json<Item>();
      let actor = originalActor, item = originalItem;

      for (const [field, value] of Object.entries({ name: "Ada of the Outer Rim", type: "pilot", worldId })) {
        const response = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers: headers(playerId, `actor-metadata-${field}`), payload: { expectedUpdatedAt: actor.updatedAt, [field]: value } });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json()).toMatchObject({ [field]: value, data: originalActor.data });
        expect(response.json().updatedAt).not.toBe(actor.updatedAt);
        actor = response.json<Actor>();
        expect(await readActor(h, actor.id)).toEqual(actor);
      }
      for (const [field, value] of Object.entries({ name: "Orbital sensor", type: "probe", worldId })) {
        const response = await h.app.inject({ method: "PATCH", url: `/api/v1/items/${item.id}`, headers: headers(playerId, `item-metadata-${field}`), payload: { expectedUpdatedAt: item.updatedAt, [field]: value } });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json()).toMatchObject({ [field]: value, data: originalItem.data });
        expect(response.json().updatedAt).not.toBe(item.updatedAt);
        item = response.json<Item>();
        expect(structuredClone(h.store.state.items.find((entry) => entry.id === item.id))).toEqual(item);
      }
      const playerOwnerChange = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers: headers(playerId, "player-owner-change-denied"), payload: { expectedUpdatedAt: actor.updatedAt, ownerUserId: managerId } });
      expect(playerOwnerChange.statusCode, playerOwnerChange.body).toBe(403);
      expect(await readActor(h, actor.id)).toEqual(actor);
      const ownerChange = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers: headers(adminId, "manager-owner-change"), payload: { expectedUpdatedAt: actor.updatedAt, ownerUserId: managerId } });
      expect(ownerChange.statusCode, ownerChange.body).toBe(200);
      expect(ownerChange.json()).toMatchObject({ ownerUserId: managerId, data: originalActor.data });
      actor = ownerChange.json<Actor>();

      for (const [kind, record, invalidData] of [["actors", actor, { ...actor.data, focus: 99 }], ["items", item, { ...item.data, mass: -1 }]] as const) {
        for (const [suffix, patch, status] of [["unknown-request", { inventedMetadata: true }, 400], ["unknown-data", { data: { ...record.data, inventedRule: true } }, 422], ["invalid-data", { data: invalidData }, 422], ["invalid-type", { type: "unregistered-type" }, 422]] as const) {
          const rejected = await h.app.inject({ method: "PATCH", url: `/api/v1/${kind}/${record.id}`, headers: headers(adminId, `${kind}-metadata-${suffix}`), payload: { expectedUpdatedAt: record.updatedAt, ...patch } });
          expect(rejected.statusCode, rejected.body).toBe(status);
          expect(structuredClone(h.store.state[kind].find((entry) => entry.id === record.id))).toEqual(record);
        }
      }
      await restart(h);
      expect(await readActor(h, actor.id)).toEqual(actor);
      expect(structuredClone(h.store.state.items.find((entry) => entry.id === item.id))).toEqual(item);
    } finally { await close(h); }
  });
  it("spends exactly once, preserves dice/fairness across SQLite restart, and rejects stale or injected action requests", async () => {
    const h = await harness();
    try {
      const identity = await install(h, manifest(), "install-v1");
      await bind(h, identity, null, "select-bind-v1"); await activate(h, "activate-v1");
      const record = await createActor(h, "create-scout");
      const before = rulesWrites(h, record.id);
      const actionRequest = { method: "POST" as const, url: actorRoute(record.id, "roll"), headers: headers(playerId, "boost-once"), payload: rollBody(record, identity) };
      const performed = await h.app.inject(actionRequest);
      expect(performed.statusCode, performed.body).toBe(200);
      const outcome = performed.json<{ roll: DiceRoll; actor: Actor; sheet: DeclarativeActorSheet; chat: { id: string; rollId: string }; cost: { path: string[]; amount: number; before: number; after: number } }>();
      expect(outcome.cost).toEqual({ path: ["energy"], amount: 1, before: 6, after: 5 });
      expect(outcome.actor.data.energy).toBe(5);
      expect(outcome.actor.updatedAt).not.toBe(record.updatedAt);
      expect(outcome.sheet.system).toEqual(identity);
      expect(outcome.chat.rollId).toBe(outcome.roll.id);
      assertDice(outcome.roll, 1);
      const replay = await h.app.inject(actionRequest);
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.body).toBe(performed.body);
      const committed = rulesWrites(h, record.id);
      expect(committed.rolls).toHaveLength(before.rolls.length + 1);
      expect(committed.chat).toHaveLength(before.chat.length + 1);
      expect(committed.audit).toHaveLength(before.audit.length + 1);

      const changedSameKey = await h.app.inject({ ...actionRequest, payload: { ...actionRequest.payload, rollId: "scan" } });
      expect(changedSameKey.statusCode, changedSameKey.body).toBe(409);
      const stale = await h.app.inject({ ...actionRequest, headers: headers(playerId, "boost-stale-revision") });
      expect(stale.statusCode, stale.body).toBe(409);
      for (const expectedSystem of [{ ...identity, version: "2.0.0" }, { ...identity, checksum: "0".repeat(64) }]) {
        const wrongIdentity = await h.app.inject({ ...actionRequest, headers: headers(playerId, `wrong-${expectedSystem.version}-${expectedSystem.checksum.slice(0, 2)}`), payload: { ...rollBody(outcome.actor, identity), expectedSystem } });
        expect(wrongIdentity.statusCode, wrongIdentity.body).toBe(409);
      }
      const noKey = await h.app.inject({ ...actionRequest, headers: headers(playerId), payload: rollBody(outcome.actor, identity) });
      expect(noKey.statusCode, noKey.body).toBe(400);
      for (const [field, value] of Object.entries({ formula: "100d100", cost: 0, consumeResources: false, targets: [], effects: [] })) {
        const injected = await h.app.inject({ ...actionRequest, headers: headers(playerId, `injected-${field}`), payload: { ...rollBody(outcome.actor, identity), [field]: value } });
        expect(injected.statusCode, injected.body).toBe(400);
      }
      expect(rulesWrites(h, record.id)).toEqual(committed);
      await restart(h);
      expect((await readCampaign(h)).systemBindings).toContainEqual(identity);
      expect((await readActor(h, record.id, playerId)).data.energy).toBe(5);
      const restoredSheet = await h.app.inject({ method: "GET", url: actorRoute(record.id, "sheet"), headers: headers(playerId) });
      expect(restoredSheet.statusCode, restoredSheet.body).toBe(200);
      expect(restoredSheet.json().system).toEqual(identity);
      expect(restoredSheet.json().quickRolls.find((entry: { id: string }) => entry.id === "boost").formula).toBe("2d6+1");
      const verified = await h.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/rolls/${outcome.roll.id}/verify`, headers: headers(playerId) });
      expect(verified.statusCode, verified.body).toBe(200);
      expect(verified.json()).toMatchObject({ verified: true, expected: { total: outcome.roll.total } });
      const restartedReplay = await h.app.inject(actionRequest);
      expect(restartedReplay.statusCode, restartedReplay.body).toBe(200);
      expect(restartedReplay.body).toBe(performed.body);
      expect(rulesWrites(h, record.id)).toEqual(committed);
    } finally { await close(h); }
  });

  it("uses human permissions separately from manifest capabilities and permits shared free rolls without resource authority", async () => {
    const h = await harness();
    try {
      const identity = await install(h, manifest(), "install-v1");
      await bind(h, identity, null, "select-bind-v1"); await activate(h, "activate-v1");
      const record = await createActor(h, "create-private-scout", { ownerUserId: adminId, permissions: { [readerId]: ["actor.readPrivate"], [noChatId]: ["actor.readPrivate"], [noDiceId]: ["actor.readPrivate"] } });
      const before = rulesWrites(h, record.id);
      const deniedSheet = await h.app.inject({ method: "GET", url: actorRoute(record.id, "sheet"), headers: headers(playerId) });
      expect(deniedSheet.statusCode, deniedSheet.body).toBe(403);
      for (const [userId, permission] of [[playerId, "actor.readPrivate"], [readerId, "actor.update"], [noChatId, "chat.write"], [noDiceId, "dice.roll"], [outsiderId, "different active organization"]]) {
        const denied = await h.app.inject({ method: "POST", url: actorRoute(record.id, "roll"), headers: headers(userId!, `denied-${userId}`), payload: rollBody(record, identity) });
        expect(denied.statusCode, denied.body).toBe(403);
        expect(denied.json().message).toContain(permission);
      }
      expect(rulesWrites(h, record.id)).toEqual(before);
      const free = await h.app.inject({ method: "POST", url: actorRoute(record.id, "roll"), headers: headers(readerId, "shared-scan"), payload: rollBody(record, identity, "scan") });
      expect(free.statusCode, free.body).toBe(200);
      expect(free.json().actor.data.energy).toBe(6);
      expect(free.json().actor.updatedAt).toBe(record.updatedAt);
      expect(free.json()).not.toHaveProperty("cost");
      assertDice(free.json().roll, 2);
      const exhausted = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${record.id}`, headers: headers(adminId, "set-empty-resource"), payload: { expectedUpdatedAt: record.updatedAt, data: { ...record.data, energy: 0 } } });
      expect(exhausted.statusCode, exhausted.body).toBe(200);
      const emptyRecord = exhausted.json<Actor>(), emptyBefore = rulesWrites(h, record.id);
      const emptyAction = await h.app.inject({ method: "POST", url: actorRoute(record.id, "roll"), headers: headers(adminId, "exhausted-boost"), payload: rollBody(emptyRecord, identity) });
      expect(emptyAction.statusCode, emptyAction.body).toBe(422);
      expect(emptyAction.json().issues).toContainEqual(expect.objectContaining({ code: "insufficient_resource" }));
      expect(rulesWrites(h, record.id)).toEqual(emptyBefore);
    } finally { await close(h); }
  });

  it("initially pins new campaigns to the eligible catalog version after retaining an incompatible historical installation", async () => {
    const historical = manifest(); historical.compatibleCore = ">=0.1.0 <0.2.0";
    const timestamp = "2026-01-01T00:00:00.000Z";
    // Persist an administrator-approved package from an older core before startup.
    // Execution eligibility still uses the current server's normal SDK policy.
    const retained: SystemInstallation = { id: "sys_historical_orbital_v1", manifest: historical, checksum: declarativeSystemManifestChecksum(historical), installedByUserId: adminId, authorizedByCampaignId: campaignId, source: "api", createdAt: timestamp, updatedAt: timestamp };
    const h = await harness([retained]);
    try {
      const identity = await install(h, manifest("2.0.0"), "install-current-core-v2");
      await restart(h);
      expect(h.store.state.systemInstallations.filter((entry) => entry.manifest.id === systemId).map((entry) => entry.manifest.version)).toEqual(["1.0.0", "2.0.0"]);
      const created = await h.app.inject({ method: "POST", url: "/api/v1/campaigns", headers: headers(adminId, "create-eligible-version-campaign"), payload: { name: "Orbital expedition", defaultSystemId: systemId } });
      expect(created.statusCode, created.body).toBe(200);
      const campaign = created.json<Campaign>();
      expect(campaign.systemBindings).toEqual([identity]);
      const catalog = await h.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaign.id}/systems`, headers: headers(adminId) });
      expect(catalog.statusCode, catalog.body).toBe(200);
      expect(catalog.json().find((entry: { id: string }) => entry.id === systemId)).toMatchObject({ version: "2.0.0", binding: identity, active: true });
      const createdActor = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaign.id}/actors`, headers: headers(adminId, "create-current-core-scout"), payload: { expectedUpdatedAt: campaign.updatedAt, name: "Current core scout" } });
      expect(createdActor.statusCode, createdActor.body).toBe(200);
      expect(createdActor.json()).toMatchObject({ campaignId: campaign.id, systemId, type: "scout", data: { focus: 2, drive: 1, energy: 6 } });
      const sheet = await h.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaign.id}/systems/${systemId}/actors/${createdActor.json().id}/sheet`, headers: headers(adminId) });
      expect(sheet.statusCode, sheet.body).toBe(200);
      expect(sheet.json().system).toEqual(identity);
    } finally { await close(h); }
  });
  it("keeps installed versions immutable, selects compatible upgrades explicitly, rejects incompatible state and invalidates old edits", async () => {
    const h = await harness();
    try {
      const v1 = await install(h, manifest(), "install-v1");
      await bind(h, v1, null, "select-bind-v1"); await activate(h, "activate-v1");
      const original = await createActor(h, "create-scout");
      const next = manifest("2.0.0"); next.definition.quickRolls[1]!.label = "Overdrive"; next.definition.quickRolls[1]!.dice.bonus = 2; next.definition.quickRolls[1]!.cost!.amount = 2;
      const v2 = await install(h, next, "install-v2");
      expect(v2.checksum).not.toBe(v1.checksum);
      expect((await readActor(h, original.id)).updatedAt).toBe(original.updatedAt);
      const catalog = await h.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/systems`, headers: headers(playerId) });
      expect(catalog.statusCode, catalog.body).toBe(200);
      expect(catalog.json().find((entry: { id: string }) => entry.id === systemId)).toMatchObject({ version: "1.0.0", binding: v1, active: true, installedVersions: expect.arrayContaining([v1, v2]) });
      const oldAction = await h.app.inject({ method: "POST", url: actorRoute(original.id, "roll"), headers: headers(playerId, "v1-after-v2-install"), payload: rollBody(original, v1) });
      expect(oldAction.statusCode, oldAction.body).toBe(200);
      expect(oldAction.json()).toMatchObject({ actor: { data: { energy: 5 } }, cost: { amount: 1 }, quickRoll: { label: "Boost", formula: "2d6+1" }, sheet: { system: v1 } });
      const beforeUpgrade = oldAction.json().actor as Actor;
      await bind(h, v2, v1, "select-v2");
      const upgraded = await readActor(h, original.id);
      expect(upgraded.data).toEqual(beforeUpgrade.data);
      expect(upgraded.updatedAt).not.toBe(beforeUpgrade.updatedAt);
      const staleEdit = await h.app.inject({ method: "PATCH", url: `/api/v1/actors/${original.id}`, headers: headers(playerId, "old-sheet-edit-after-upgrade"), payload: { expectedUpdatedAt: beforeUpgrade.updatedAt, data: { ...beforeUpgrade.data, focus: 3 } } });
      expect(staleEdit.statusCode, staleEdit.body).toBe(409);
      const upgradedAction = await h.app.inject({ method: "POST", url: actorRoute(original.id, "roll"), headers: headers(playerId, "v2-boost"), payload: rollBody(upgraded, v2) });
      expect(upgradedAction.statusCode, upgradedAction.body).toBe(200);
      expect(upgradedAction.json()).toMatchObject({ actor: { data: { energy: 3 } }, cost: { amount: 2 }, quickRoll: { label: "Overdrive", formula: "2d6+3" }, sheet: { system: v2 } });
      const incompatible = manifest("3.0.0"); incompatible.schemas.actor.properties.focus = { type: "integer", minimum: 0, maximum: 1 }; incompatible.definition.actorDefaults.focus = 1;
      const v3 = await install(h, incompatible, "install-incompatible-v3");
      const beforeRejectedCampaign = await readCampaign(h), beforeRejectedActor = await readActor(h, original.id);
      const invalidSelection = await h.app.inject({ method: "POST", url: `/api/v1/campaigns/${campaignId}/systems/${systemId}/binding`, headers: headers(adminId, "reject-incompatible-v3"), payload: { expectedUpdatedAt: beforeRejectedCampaign.updatedAt, system: v3, expectedBinding: v2 } });
      expect(invalidSelection.statusCode, invalidSelection.body).toBe(422);
      expect(invalidSelection.json().error).toBe("invalid_system_state");
      expect(await readCampaign(h)).toEqual(beforeRejectedCampaign);
      expect(await readActor(h, original.id)).toEqual(beforeRejectedActor);
      await bind(h, v1, v2, "rollback-v1");
      const rolledBack = await readActor(h, original.id);
      const rollbackAction = await h.app.inject({ method: "POST", url: actorRoute(original.id, "roll"), headers: headers(playerId, "v1-after-rollback"), payload: rollBody(rolledBack, v1) });
      expect(rollbackAction.statusCode, rollbackAction.body).toBe(200);
      expect(rollbackAction.json()).toMatchObject({ actor: { data: { energy: 2 } }, cost: { amount: 1 }, quickRoll: { label: "Boost", formula: "2d6+1" }, sheet: { system: v1 } });
    } finally { await close(h); }
  });
});
