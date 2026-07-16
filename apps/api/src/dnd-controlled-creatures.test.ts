import { createHash } from "node:crypto";
import { createTimestamped, makeArchive, type Actor, type DndControlledCreatureActionHandoff, type DndControlledCreatureCreateRequest, type DndControlledCreaturePreview, type Item, type UserSession } from "@open-tabletop/core";
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

function addPreparedSummonSource(store: MemoryStateStore) {
  const actor = createTimestamped("act", {
    id: "act_prepared_summoner",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name: "Prepared Summoner",
    data: {
      class: "Wizard",
      level: 5,
      attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      hp: { current: 30, max: 30 },
      spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
      rulesVersion: "SRD 5.2.1",
    },
    permissions: {},
  }) satisfies Actor;
  const spell = createTimestamped("itm", {
    id: "itm_prepared_summon",
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "spell",
    name: "Summon Reviewed Spirit",
    data: {
      level: 1,
      action: "action",
      concentration: true,
      rulesVersion: "SRD 5.2.1",
      controlledCreature: {
        kind: "summon",
        duration: { mode: "hours", amount: 1 },
        concentration: true,
        initiative: { mode: "independent" },
        command: { required: false, action: "none" },
        statBlockComplete: true,
        actor: { name: "Reviewed Spirit", type: "celestial", hp: { current: 12, max: 12 }, data: { armorClass: 14, speed: 30 } },
      },
    },
  }) satisfies Item;
  store.state.actors.push(actor);
  store.state.items.push(spell);
  return { actor, spell, rollId: `spell-${spell.id}-effect` };
}

function addWildShapeSource(store: MemoryStateStore) {
  const actor = createTimestamped("act", {
    id: "act_prepared_wild_shape",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name: "Prepared Druid",
    data: {
      class: "Druid",
      level: 5,
      attributes: { strength: 10, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 18, charisma: 10 },
      hp: { current: 21, max: 35 },
      features: ["Wild Shape"],
      resources: { wildShape: { current: 2, max: 2, recovery: "short" } },
      rulesVersion: "SRD 5.2.1",
    },
    permissions: {},
  }) satisfies Actor;
  const equipment = createTimestamped("itm", { id: "itm_wild_shape_gear", campaignId: actor.campaignId, systemId: actor.systemId, actorId: actor.id, type: "equipment", name: "Druid Gear", data: { equipped: true } }) satisfies Item;
  store.state.actors.push(actor);
  store.state.items.push(equipment);
  return { actor, equipment };
}

async function preview(app: Awaited<ReturnType<typeof buildApp>>, request: DndControlledCreatureCreateRequest): Promise<DndControlledCreaturePreview> {
  const response = await app.inject({ method: "POST", url: `${base}/preview`, headers, payload: request });
  expect(response.statusCode).toBe(200);
  return response.json() as DndControlledCreaturePreview;
}

describe("D&D controlled-creature API", () => {
  it("hands a prepared summon into one atomic confirmation without spending on cancel or replay", async () => {
    const store = new MemoryStateStore();
    const source = addPreparedSummonSource(store);
    const app = await buildApp({ store });
    const actionRoute = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${source.actor.id}/roll`;
    const prepareAction = async (key: string) => app.inject({
      method: "POST",
      url: actionRoute,
      headers: { ...headers, "idempotency-key": key },
      payload: {
        rollId: source.rollId,
        consumeResources: true,
        prepare: true,
        controlledCreature: { sceneId: "scn_vault_entry", token: { x: 125, y: 175, width: 50, height: 50, disposition: "friendly" } },
      },
    });
    try {
      const prepared = await prepareAction("prepared-summon-one");
      expect(prepared.statusCode).toBe(200);
      const preparedBody = prepared.json() as { preparation: { preparedPreviewKey: string; revisions: { actorUpdatedAt: Record<string, string> } }; controlledCreatureHandoff: DndControlledCreatureActionHandoff };
      expect(preparedBody.controlledCreatureHandoff).toMatchObject({
        status: "supported",
        action: { actorId: source.actor.id, rollId: source.rollId, preparedPreviewKey: "prepared-summon-one" },
        prefill: { kind: "summon", sceneId: "scn_vault_entry", concentration: { groupId: "prepared-summon-one" } },
      });
      expect(store.state.actors.find((actor) => actor.id === source.actor.id)?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
      expect(store.state.idempotencyRecords.map((record) => ({ key: record.key, path: record.path, userId: record.userId }))).toContainEqual({ key: "prepared-summon-one", path: actionRoute, userId: "usr_demo_gm" });

      const directCommit = await app.inject({ method: "POST", url: actionRoute, headers: { ...headers, "idempotency-key": "prepared-summon-direct-commit" }, payload: { preparedPreviewKey: preparedBody.preparation.preparedPreviewKey, expectedUpdatedAt: preparedBody.preparation.revisions.actorUpdatedAt[source.actor.id] } });
      expect(directCommit.statusCode).toBe(409);
      expect(directCommit.json().message).toContain("controlled-creature review");
      expect(store.state.actors.find((actor) => actor.id === source.actor.id)?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });

      const lifecycleRequest = { ...structuredClone(preparedBody.controlledCreatureHandoff.prefill), manualReviewConfirmed: true } as DndControlledCreatureCreateRequest;
      const tampered = structuredClone(lifecycleRequest);
      tampered.duration = { mode: "until_dismissed" };
      const tamperedPreview = await app.inject({ method: "POST", url: `${base}/preview`, headers, payload: tampered });
      expect(tamperedPreview.statusCode).toBe(409);
      expect(tamperedPreview.json().message).toContain("duration");
      const forgedStats = structuredClone(lifecycleRequest);
      forgedStats.actor.data.armorClass = 99;
      forgedStats.actor.data.speed = 999;
      const forgedStatsPreview = await app.inject({ method: "POST", url: `${base}/preview`, headers, payload: forgedStats });
      expect(forgedStatsPreview.statusCode).toBe(409);
      expect(forgedStatsPreview.json().message).toContain("actor.data");
      const lifecyclePreview = await preview(app, lifecycleRequest);
      expect(lifecyclePreview.ready).toBe(true);
      const rollsBefore = store.state.rolls.length;
      const confirmed = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "prepared-summon-confirm-one" }, payload: { request: lifecycleRequest, previewToken: lifecyclePreview.previewToken, expectedUpdatedAt: lifecyclePreview.requiredRevisions } });
      expect(confirmed.statusCode).toBe(200);
      const confirmedBody = confirmed.json();
      expect(confirmedBody.records[0]).toMatchObject({ originatingAction: { preparedPreviewKey: "prepared-summon-one", resolutionHash: expect.any(String) }, concentration: { groupId: "prepared-summon-one" } });
      const firstControlledActorId = confirmedBody.records[0].linkedActorId as string;
      expect(store.state.actors.find((actor) => actor.id === source.actor.id)?.data.spellSlots).toEqual({ level1: { current: 1, max: 2, recovery: "long" } });
      expect(store.state.rolls).toHaveLength(rollsBefore + 1);

      const replay = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "prepared-summon-confirm-one" }, payload: { request: lifecycleRequest, previewToken: lifecyclePreview.previewToken, expectedUpdatedAt: lifecyclePreview.requiredRevisions } });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.actors.find((actor) => actor.id === source.actor.id)?.data.spellSlots).toEqual({ level1: { current: 1, max: 2, recovery: "long" } });
      expect(store.state.rolls).toHaveLength(rollsBefore + 1);
      const duplicate = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "prepared-summon-confirm-one-again" }, payload: { request: lifecycleRequest, previewToken: lifecyclePreview.previewToken, expectedUpdatedAt: lifecyclePreview.requiredRevisions } });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().message).toContain("already confirmed");

      const preparedSecond = await prepareAction("prepared-summon-two");
      expect(preparedSecond.statusCode).toBe(200);
      const secondHandoff = preparedSecond.json().controlledCreatureHandoff as DndControlledCreatureActionHandoff;
      const secondRequest = { ...structuredClone(secondHandoff.prefill), manualReviewConfirmed: true } as DndControlledCreatureCreateRequest;
      const secondPreview = await preview(app, secondRequest);
      expect(secondPreview.warnings).toContain("Confirming replaces concentration and ends 1 linked controlled-creature lifecycle(s).");
      const secondConfirm = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "prepared-summon-confirm-two" }, payload: { request: secondRequest, previewToken: secondPreview.previewToken, expectedUpdatedAt: secondPreview.requiredRevisions } });
      expect(secondConfirm.statusCode).toBe(200);
      expect(secondConfirm.json().removedActorIds).toContain(firstControlledActorId);
      expect(store.state.actors.some((actor) => actor.id === firstControlledActorId)).toBe(false);
      expect(store.state.actors.find((actor) => actor.id === source.actor.id)?.data.spellSlots).toEqual({ level1: { current: 0, max: 2, recovery: "long" } });
    } finally {
      await app.close();
    }
  });

  it("hands Wild Shape into a reviewed transformation and preserves the spent resource across revert", async () => {
    const store = new MemoryStateStore();
    const { actor, equipment } = addWildShapeSource(store);
    const app = await buildApp({ store });
    const actionRoute = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;
    try {
      const prepared = await app.inject({ method: "POST", url: actionRoute, headers: { ...headers, "idempotency-key": "prepared-wild-shape" }, payload: { rollId: "feature-wild-shape", consumeResources: true, prepare: true } });
      expect(prepared.statusCode).toBe(200);
      const handoff = prepared.json().controlledCreatureHandoff as DndControlledCreatureActionHandoff;
      expect(handoff).toMatchObject({ status: "supported", prefill: { kind: "transformation", targetActorId: actor.id, transformation: { hpCarryover: "preserve" }, originatingAction: { preparedPreviewKey: "prepared-wild-shape" } } });
      expect(handoff.manualChoices).toEqual(expect.arrayContaining([expect.objectContaining({ field: "transformation.form" }), expect.objectContaining({ field: "transformation.equipmentCarryover" })]));
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)?.data.resources).toEqual({ wildShape: { current: 2, max: 2, recovery: "short" } });

      const request = {
        ...structuredClone(handoff.prefill),
        actor: { ...structuredClone(handoff.prefill.actor), name: "Reviewed Wolf", type: "beast", data: { ...structuredClone(handoff.prefill.actor?.data), armorClass: 13, speed: 40 } },
        transformation: { ...structuredClone(handoff.prefill.transformation), equipmentCarryover: "suppress" },
        manualReviewConfirmed: true,
      } as DndControlledCreatureCreateRequest;
      const transformationPreview = await preview(app, request);
      const staleExpected = structuredClone(transformationPreview.requiredRevisions);
      staleExpected.actors[actor.id] = "2000-01-01T00:00:00.000Z";
      const stale = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "prepared-wild-shape-stale" }, payload: { request, previewToken: transformationPreview.previewToken, expectedUpdatedAt: staleExpected } });
      expect(stale.statusCode).toBe(409);
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)?.data.resources).toEqual({ wildShape: { current: 2, max: 2, recovery: "short" } });

      const transformed = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "prepared-wild-shape-confirm" }, payload: { request, previewToken: transformationPreview.previewToken, expectedUpdatedAt: transformationPreview.requiredRevisions } });
      expect(transformed.statusCode).toBe(200);
      expect(transformed.json().records[0]).toMatchObject({ kind: "transformation", originatingAction: { preparedPreviewKey: "prepared-wild-shape" } });
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)).toMatchObject({ name: "Reviewed Wolf", data: { hp: { current: 21, max: 35 }, temporaryHitPoints: 5, resources: { wildShape: { current: 1, max: 2, recovery: "short" } } } });
      expect(store.state.items.find((item) => item.id === equipment.id)?.actorId).toBeUndefined();

      const list = await app.inject({ method: "GET", url: base, headers });
      const entry = list.json().records.find((candidate: { actor: Actor }) => candidate.actor.id === actor.id);
      const reverted = await app.inject({ method: "POST", url: `${base}/${actor.id}/end`, headers: { ...headers, "idempotency-key": "prepared-wild-shape-revert" }, payload: { reason: "dismissed", expectedUpdatedAt: entry.requiredRevisions } });
      expect(reverted.statusCode).toBe(200);
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)).toMatchObject({ name: "Prepared Druid", data: { resources: { wildShape: { current: 1, max: 2, recovery: "short" } } } });
      expect(store.state.items.find((item) => item.id === equipment.id)?.actorId).toBe(actor.id);
    } finally {
      await app.close();
    }
  });

  it("requires current membership and the active workspace for controlled-creature lifecycle mutations", async () => {
    const store = new MemoryStateStore();
    const source = addDndSource(store);
    const app = await buildApp({ store });
    try {
      const request = requestFor(source);
      const initial = await preview(app, request);
      const confirmed = await app.inject({ method: "POST", url: base, headers: { ...headers, "idempotency-key": "controlled-access-create" }, payload: { request, previewToken: initial.previewToken, expectedUpdatedAt: initial.requiredRevisions } });
      expect(confirmed.statusCode).toBe(200);
      const controlledActorId = confirmed.json().records[0].linkedActorId as string;
      const listed = await app.inject({ method: "GET", url: base, headers });
      const initialEntry = listed.json().records.find((candidate: { actor: Actor }) => candidate.actor.id === controlledActorId);

      const currentController = await app.inject({
        method: "POST",
        url: `${base}/${controlledActorId}/command`,
        headers: { ...headers, "idempotency-key": "controlled-access-current-member" },
        payload: { note: "Current controller command", expectedUpdatedAt: initialEntry.requiredRevisions },
      });
      expect(currentController.statusCode).toBe(200);

      const refreshed = await app.inject({ method: "GET", url: base, headers });
      const entry = refreshed.json().records.find((candidate: { actor: Actor }) => candidate.actor.id === controlledActorId);
      const mutations = [
        { name: "command", url: `${base}/${controlledActorId}/command`, payload: { note: "Blocked command", expectedUpdatedAt: entry.requiredRevisions } },
        { name: "end", url: `${base}/${controlledActorId}/end`, payload: { reason: "dismissed", expectedUpdatedAt: entry.requiredRevisions } },
        { name: "concentration", url: `${base}/concentration/end`, payload: { sourceActorId: source.actor.id, groupId: "open-summon", expectedUpdatedAt: entry.requiredRevisions } },
      ];

      const memberIndex = store.state.members.findIndex((member) => member.campaignId === "camp_demo" && member.userId === "usr_demo_gm");
      const [removedMember] = store.state.members.splice(memberIndex, 1);
      for (const mutation of mutations) {
        const response = await app.inject({ method: "POST", url: mutation.url, headers: { ...headers, "idempotency-key": `controlled-access-removed-${mutation.name}` }, payload: mutation.payload });
        expect(response.statusCode, mutation.name).toBe(403);
        expect(response.json().message, mutation.name).toContain("Current campaign membership");
      }
      store.state.members.push(removedMember!);

      const otherWorkspace = { ...structuredClone(store.state.organizations.find((workspace) => workspace.id === "org_demo")!), id: "org_other_controlled", name: "Other Controlled Workspace" };
      store.state.organizations.push(otherWorkspace);
      store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: otherWorkspace.id, userId: "usr_demo_gm", role: "owner" }));
      const token = "ots_controlled_wrong_workspace";
      store.state.sessions.push(createTimestamped("sess", {
        id: "sess_controlled_wrong_workspace",
        userId: "usr_demo_gm",
        tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}`,
        activeOrganizationId: otherWorkspace.id,
        expiresAt: "2099-01-01T00:00:00.000Z",
        lastSeenAt: new Date().toISOString(),
      }) satisfies UserSession);
      for (const mutation of mutations) {
        const response = await app.inject({ method: "POST", url: mutation.url, headers: { authorization: `Bearer ${token}`, "idempotency-key": `controlled-access-workspace-${mutation.name}` }, payload: mutation.payload });
        expect(response.statusCode, mutation.name).toBe(403);
        expect(response.json().message, mutation.name).toBe("Campaign belongs to a different active organization");
      }
    } finally {
      await app.close();
    }
  });

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
