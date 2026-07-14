import { createTimestamped, makeArchive, type Actor, type DndControlledCreatureCreateRequest, type DndControlledCreaturePreview, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };
const base = "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/controlled-creatures";

function addDndSource(store: MemoryStateStore, kind: "spell" | "feature" = "spell") {
  const actor = createTimestamped("act", {
    id: `act_control_${kind}`,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name: "Controller",
    data: { hp: { current: 20, max: 20 }, rulesVersion: "SRD 5.2.1", rulesEngine: { concentration: { rollId: "open-summon", label: "Open Summon" } } },
    permissions: {},
  }) satisfies Actor;
  const item = createTimestamped("itm", {
    id: `itm_control_${kind}`,
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: kind,
    name: kind === "spell" ? "Open Summon" : "Open Companion Feature",
    data: { rulesVersion: "SRD 5.2.1" },
  }) satisfies Item;
  store.state.actors.push(actor);
  store.state.items.push(item);
  return { actor, item };
}

function requestFor(source: ReturnType<typeof addDndSource>, kind: "summon" | "persistent_companion" = "summon"): DndControlledCreatureCreateRequest {
  return {
    kind,
    sceneId: "scn_vault_entry",
    source: { kind: source.item.type as "spell" | "feature", actorId: source.actor.id, itemId: source.item.id, name: source.item.name, systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1" },
    controllerUserId: "usr_demo_gm",
    controllerActorId: source.actor.id,
    ownerUserId: "usr_demo_gm",
    actor: { name: kind === "summon" ? "Reviewed Spirit" : "Persistent Companion", type: kind, data: { hp: { current: 12, max: 12 }, rulesVersion: "SRD 5.2.1" } },
    token: { x: 100, y: 150, width: 50, height: 50, disposition: "friendly" },
    duration: kind === "summon" ? { mode: "until_dismissed" } : { mode: "persistent" },
    ...(kind === "summon" ? { concentration: { sourceActorId: source.actor.id, groupId: "open-summon" } } : {}),
    initiative: { mode: "independent" },
    command: { required: true, action: "bonus_action" },
  };
}

async function preview(app: Awaited<ReturnType<typeof buildApp>>, request: DndControlledCreatureCreateRequest): Promise<DndControlledCreaturePreview> {
  const response = await app.inject({ method: "POST", url: `${base}/preview`, headers, payload: request });
  expect(response.statusCode).toBe(200);
  return response.json() as DndControlledCreaturePreview;
}

describe("D&D controlled-creature API", () => {
  it("previews, idempotently confirms, archives, and atomically cleans concentration-linked summons", async () => {
    const store = new MemoryStateStore();
    const source = addDndSource(store);
    const app = await buildApp({ store });
    try {
      const request = requestFor(source);
      const initial = await preview(app, request);
      expect(initial.ready).toBe(true);

      const confirm = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "controlled-create" }, payload: { request, previewToken: initial.previewToken, expectedUpdatedAt: initial.requiredRevisions } });
      expect(confirm.statusCode).toBe(200);
      const created = confirm.json();
      expect(created).toMatchObject({ action: "created", records: [{ kind: "summon", concentration: { groupId: "open-summon" } }] });
      const controlledActorId = created.records[0].linkedActorId as string;
      const controlledTokenId = created.records[0].linkedTokenIds[0] as string;
      expect(store.state.actors.some((actor) => actor.id === controlledActorId)).toBe(true);
      expect(makeArchive(store.state, "camp_demo").data.actors.some((actor) => actor.id === controlledActorId)).toBe(true);

      const replay = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "controlled-create" }, payload: { request, previewToken: initial.previewToken, expectedUpdatedAt: initial.requiredRevisions } });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.actors.filter((actor) => actor.id === controlledActorId)).toHaveLength(1);

      const list = await app.inject({ method: "GET", url: base, headers });
      const entry = list.json().records.find((candidate: { actor: Actor }) => candidate.actor.id === controlledActorId);
      const revisions = structuredClone(entry.requiredRevisions);
      revisions.actors[source.actor.id] = source.actor.updatedAt;
      const beforeStale = structuredClone({ actors: store.state.actors, tokens: store.state.tokens, combats: store.state.combats });
      const stale = await app.inject({ method: "POST", url: `${base}/concentration/end`, headers: { ...headers, "idempotency-key": "controlled-concentration-stale" }, payload: { sourceActorId: source.actor.id, groupId: "open-summon", expectedUpdatedAt: { ...revisions, actors: { ...revisions.actors, [source.actor.id]: "2000-01-01T00:00:00.000Z" } } } });
      expect(stale.statusCode).toBe(409);
      expect({ actors: store.state.actors, tokens: store.state.tokens, combats: store.state.combats }).toEqual(beforeStale);

      const ended = await app.inject({ method: "POST", url: `${base}/concentration/end`, headers: { ...headers, "idempotency-key": "controlled-concentration-end" }, payload: { sourceActorId: source.actor.id, groupId: "open-summon", reason: "spell ended", expectedUpdatedAt: revisions } });
      expect(ended.statusCode).toBe(200);
      expect(ended.json()).toMatchObject({ action: "concentration_ended", removedActorIds: [controlledActorId], removedTokenIds: [controlledTokenId] });
      expect(store.state.actors.some((actor) => actor.id === controlledActorId)).toBe(false);
      expect(store.state.tokens.some((token) => token.id === controlledTokenId)).toBe(false);
      expect(store.state.auditLogs.some((log) => log.action === "actor.controlledCreatureConcentrationEnded")).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("reverts transformation snapshots and keeps dismissed persistent companions archiveable", async () => {
    const store = new MemoryStateStore();
    const source = addDndSource(store, "feature");
    const target = createTimestamped("act", { id: "act_transform_target", campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm", type: "character", name: "Original Hero", data: { hp: { current: 7, max: 20 }, rulesVersion: "SRD 5.2.1", homebrewField: { preserved: true } }, permissions: {} }) satisfies Actor;
    const equipment = createTimestamped("itm", { id: "itm_transform_gear", campaignId: "camp_demo", systemId: "dnd-5e-srd", actorId: target.id, type: "equipment", name: "Homebrew Gear", data: { homebrew: true } }) satisfies Item;
    store.state.actors.push(target);
    store.state.items.push(equipment);
    const app = await buildApp({ store });
    try {
      const transformRequest: DndControlledCreatureCreateRequest = {
        ...requestFor(source),
        kind: "transformation",
        sceneId: undefined,
        targetActorId: target.id,
        token: undefined,
        actor: { name: "Reviewed Form", type: "transformed", data: { hp: { current: 30, max: 30 }, rulesVersion: "SRD 5.2.1" } },
        duration: { mode: "until_dismissed" },
        concentration: undefined,
        transformation: { hpCarryover: "preserve", equipmentCarryover: "suppress" },
      };
      const transformPreview = await preview(app, transformRequest);
      expect(transformPreview.ready).toBe(true);
      const transformed = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "controlled-transform" }, payload: { request: transformRequest, previewToken: transformPreview.previewToken, expectedUpdatedAt: transformPreview.requiredRevisions } });
      expect(transformed.statusCode).toBe(200);
      expect(store.state.actors.find((actor) => actor.id === target.id)?.data.hp).toEqual({ current: 7, max: 20 });
      expect(store.state.items.find((item) => item.id === equipment.id)?.actorId).toBeUndefined();

      const listAfterTransform = await app.inject({ method: "GET", url: base, headers });
      const transformEntry = listAfterTransform.json().records.find((candidate: { actor: Actor }) => candidate.actor.id === target.id);
      const reverted = await app.inject({ method: "POST", url: `${base}/${target.id}/end`, headers: { ...headers, "idempotency-key": "controlled-revert" }, payload: { reason: "dismissed", expectedUpdatedAt: transformEntry.requiredRevisions } });
      expect(reverted.statusCode).toBe(200);
      expect(reverted.json().action).toBe("reverted");
      expect(store.state.actors.find((actor) => actor.id === target.id)).toMatchObject({ name: "Original Hero", data: { homebrewField: { preserved: true } } });
      expect(store.state.items.find((item) => item.id === equipment.id)).toMatchObject({ actorId: target.id, data: { homebrew: true } });

      const companionRequest = requestFor(source, "persistent_companion");
      const companionPreview = await preview(app, companionRequest);
      const companion = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "controlled-companion" }, payload: { request: companionRequest, previewToken: companionPreview.previewToken, expectedUpdatedAt: companionPreview.requiredRevisions } });
      expect(companion.statusCode).toBe(200);
      const companionActorId = companion.json().records[0].linkedActorId as string;
      const companionList = await app.inject({ method: "GET", url: base, headers });
      const companionEntry = companionList.json().records.find((candidate: { actor: Actor }) => candidate.actor.id === companionActorId);
      const dismissed = await app.inject({ method: "POST", url: `${base}/${companionActorId}/end`, headers: { ...headers, "idempotency-key": "controlled-companion-dismiss" }, payload: { reason: "dismissed", expectedUpdatedAt: companionEntry.requiredRevisions } });
      expect(dismissed.statusCode).toBe(200);
      expect(store.state.actors.find((actor) => actor.id === companionActorId)?.data.dnd5eControlledCreature).toMatchObject({ kind: "persistent_companion", status: "dismissed", linkedTokenIds: [] });
      expect(makeArchive(store.state, "camp_demo").data.actors.some((actor) => actor.id === companionActorId)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
