import { createTimestamped, type CompendiumMonsterPlacement, type CompendiumCatalogEntry, type PermissionName } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const sceneId = "scn_vault_entry";
const path = "/api/v1/scenes/" + sceneId + "/compendium-monster-placements";
const campaignPath = "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd";
const gm = { "x-user-id": "usr_demo_gm" };
async function setup(store = new MemoryStateStore()) {
  const app = await buildApp({ store });
  afterEachClose.push(() => app.close());
  const revision = () => store.state.scenes.find((scene) => scene.id === sceneId)!.updatedAt;
  const counts = () => [store.state.actors.length, store.state.tokens.length];
  const payload = () => ({ entryId: "srd-monster:aboleth", x: 400, y: 300, expectedUpdatedAt: revision() });
  const place = (body = payload(), key = "place-aboleth", user = gm) => app.inject({
    method: "POST", url: path, headers: { ...user, "idempotency-key": "placement-test:" + key }, payload: body,
  });
  const history = (id: string, direction: "undo" | "redo", key: string, user = gm) => app.inject({
    method: "POST", url: path + "/" + id + "/history", headers: { ...user, "idempotency-key": key }, payload: { direction, expectedUpdatedAt: revision() },
  });
  return { app, store, counts, payload, place, history };
}
const afterEachClose: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of afterEachClose.splice(0)) await close(); });

describe("direct compendium monster placement", () => {
  it("places a catalog monster at the drop, durably replays a retry and exposes a usable attack from its sheet", async () => {
    const { app, store, counts, payload, place } = await setup();
    const catalog = await app.inject({ method: "GET", url: campaignPath + "/compendium?includeMonsters=true&type=monster&q=Aboleth", headers: gm });
    const entry = catalog.json<{ entries: CompendiumCatalogEntry[] }>().entries.find((item) => item.name === "Aboleth")!;
    expect(entry.provenance.sourceKind).toBe("srd");
    const initial = counts();
    const body = { ...payload(), entryId: entry.id };
    const first = await place(body);
    expect(first.statusCode, first.body).toBe(200);
    const result = first.json<CompendiumMonsterPlacement>();
    expect(result.actor).toMatchObject({ type: "monster", name: entry.name, data: { hp: { max: 150 } } });
    expect(result.sceneToken).toMatchObject({ sceneId, actorId: result.actor.id, disposition: "hostile", x: 400, y: 300 });
    const restarted = await setup(new MemoryStateStore(structuredClone(store.state)));
    const replay = await restarted.place(body);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body).toEqual(first.body);
    expect(restarted.counts()).toEqual(initial.map((n) => n + 1));
    const actorPath = campaignPath + "/actors/" + result.actor.id;
    const sheet = await app.inject({ method: "GET", url: actorPath + "/sheet", headers: gm });
    expect(sheet.json().quickRolls).toContainEqual(expect.objectContaining({ id: "monster-tentacle-attack", formula: "1d20+9" }));
    const attack = await app.inject({ method: "POST", url: actorPath + "/roll", headers: { ...gm, "idempotency-key": "attack-aboleth" }, payload: { rollId: "monster-tentacle-attack" } });
    expect(attack.statusCode, attack.body).toBe(200);
    expect(attack.body).toContain("1d20+9");
  });

  it("undo removes exactly the placed pair; redo restores both original ids", async () => {
    const { store, counts, place, payload, history } = await setup();
    const initial = counts();
    const first = (await place()).json<CompendiumMonsterPlacement>();
    const second = (await place(payload(), "another-aboleth")).json<CompendiumMonsterPlacement>();
    const undo = await history(first.placementId, "undo", "undo-one");
    expect(undo.statusCode, undo.body).toBe(200);
    expect(undo.json()).toMatchObject({ direction: "undo", actorId: first.actor.id, tokenId: first.sceneToken.id });
    expect(counts()).toEqual(initial.map((n) => n + 1));
    expect(store.state.actors.some(({ id }) => id === second.actor.id)).toBe(true);
    expect(store.state.tokens.some(({ id }) => id === second.sceneToken.id)).toBe(true);
    const scene = store.state.scenes.find((candidate) => candidate.id === sceneId)!;
    const originalWidth = scene.width;
    scene.width = 100;
    expect((await history(first.placementId, "redo", "no-longer-fits")).statusCode).toBe(409);
    expect(counts()).toEqual(initial.map((n) => n + 1));
    scene.width = originalWidth;
    const redo = await history(first.placementId, "redo", "redo-one");
    expect(redo.statusCode, redo.body).toBe(200);
    expect(redo.json()).toMatchObject({ actor: { id: first.actor.id }, sceneToken: { id: first.sceneToken.id, actorId: first.actor.id } });
    store.state.tokens.push({ ...first.sceneToken, id: "tok_other_scene_copy" });
    expect((await history(first.placementId, "undo", "unsafe-undo")).statusCode).toBe(409);
    expect(store.state.actors.some(({ id }) => id === first.actor.id)).toBe(true);
  });

  it("rejects missing permissions, invalid or missing sources, and stale placement before writing", async () => {
    const { counts, payload, place } = await setup();
    const initial = counts();
    const denied = await place(payload(), "denied", { "x-user-id": "usr_demo_player" });
    expect(denied.statusCode, denied.body).toBe(403);
    expect((await place({ ...payload(), entryId: "srd-monster:dne" }, "missing")).statusCode).toBe(404);
    expect((await place({ ...payload(), entryId: "campaign-item:dne" }, "missing-custom")).statusCode).toBe(404);
    expect((await place({ ...payload(), x: -1 }, "invalid-point")).statusCode).toBe(400);
    expect((await place({ ...payload(), expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }, "stale")).statusCode).toBe(409);
    expect(counts()).toEqual(initial);
  });

  it("separately enforces actor, token, and private custom source permissions", async () => {
    const { store, place, payload, history } = await setup();
    const player = { "x-user-id": "usr_demo_player" };
    const grant = createTimestamped("grant", { campaignId: "camp_demo", subjectType: "user" as const, subjectId: player["x-user-id"], permissions: ["actor.create"] as PermissionName[] });
    store.state.permissionGrants.push(grant);
    expect((await place(payload(), "actor-only", player)).statusCode).toBe(403);
    grant.permissions = ["token.create"];
    expect((await place(payload(), "token-only", player)).statusCode).toBe(403);
    grant.permissions.push("actor.create");
    const placed = await place(payload(), "place-without-encounter", player);
    expect(placed.statusCode, placed.body).toBe(200);
    const receipt = placed.json<CompendiumMonsterPlacement>();
    expect((await history(receipt.placementId, "undo", "undo-no-delete", player)).statusCode).toBe(403);
    const custom = createTimestamped("item", {
      campaignId: "camp_demo", systemId: "dnd-5e-srd", type: "monster", name: "Ash Guard",
      data: { customContentKind: "monster", builderSchemaVersion: "1.0.0", hitPoints: 27, armorClass: 16,
        compendiumProvenance: { sourceKind: "user", sourceName: "Campaign", sourceVersion: "1", contentVersion: "1", systemId: "dnd-5e-srd",
          systemVersion: "5.2.1", rulesVersion: "SRD", license: { name: "Private", usage: "private_home_game" } } },
    });
    store.state.items.push(custom);
    const customInput = { ...payload(), entryId: "campaign-item:" + custom.id };
    expect((await place(customInput, "private-source", player)).statusCode).toBe(403);
    const placedCustom = await place(customInput, "gm-custom-source");
    expect(placedCustom.statusCode, placedCustom.body).toBe(200);
    expect(placedCustom.json().actor).toMatchObject({ name: "Ash Guard", data: { armorClass: 16, hp: { max: 27 } } });
  });

  it("rolls back the whole pair and receipt after failed persistence and can retry the same request", async () => {
    class FailingStore extends MemoryStateStore {
      fail = false;
      override flush() {
        if (this.fail) { this.fail = false; throw new Error("Injected placement flush failure"); }
        super.flush();
      }
    }
    const store = new FailingStore();
    const { counts, payload, place } = await setup(store);
    const initial = counts();
    const body = payload();
    store.fail = true;
    expect((await place(body)).statusCode).toBe(500);
    expect(counts()).toEqual(initial);
    expect(store.state.auditLogs.some((log) => log.action === "compendium.monster.place")).toBe(false);
    expect((await place(body)).statusCode).toBe(200);
    expect(counts()).toEqual(initial.map((n) => n + 1));
  });
});
