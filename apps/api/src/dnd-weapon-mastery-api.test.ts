import { createTimestamped, type Actor, type Combat, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };

type PreparedAction = {
  preparation: {
    preparedPreviewKey: string;
    sourceActorId: string;
    revisions: { actorUpdatedAt: Record<string, string> };
  };
  resolution: { weaponMastery?: { property: string; status: string }; rolls?: unknown[] };
};

function fixtures(store: MemoryStateStore, properties: string[]) {
  const source = createTimestamped("act", {
    id: `act_mastery_${properties.join("_")}`,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Mastery Fighter",
    permissions: {},
    data: {
      class: "Fighter",
      level: 5,
      attributes: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 40, max: 40 },
      speed: 30,
      weaponMasteries: properties.map((property) => ({ weaponId: `itm_mastery_${property}`, mastery: property, className: "Fighter", source: "SRD 5.2.1" })),
    },
  }) satisfies Actor;
  const target = createTimestamped("act", {
    id: "act_mastery_target",
    campaignId: source.campaignId,
    systemId: source.systemId,
    ownerUserId: "usr_demo_gm",
    type: "npc" as const,
    name: "Training Ogre",
    permissions: {},
    data: { attributes: { strength: 18, dexterity: 10, constitution: 16, intelligence: 5, wisdom: 8, charisma: 7 }, hp: { current: 80, max: 80 }, speed: 30, size: "large", conditions: [] },
  }) satisfies Actor;
  const secondary = createTimestamped("act", {
    id: "act_mastery_secondary",
    campaignId: source.campaignId,
    systemId: source.systemId,
    ownerUserId: "usr_demo_gm",
    type: "npc" as const,
    name: "Training Goblin",
    permissions: {},
    data: { attributes: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 }, hp: { current: 20, max: 20 }, speed: 30, size: "small", conditions: [] },
  }) satisfies Actor;
  const weapons = properties.map((property) => createTimestamped("itm", {
    id: `itm_mastery_${property}`,
    campaignId: source.campaignId,
    systemId: source.systemId,
    actorId: source.id,
    type: "item" as const,
    name: `${property} weapon`,
    data: { category: "weapon", equipmentCategory: "weapon", weaponCategory: "martial", weaponKind: "melee", properties: ["light"], damage: "1d8", damageType: "slashing", ability: "strength", attackBonus: 100, equipped: true, mastery: property },
  }) satisfies Item);
  const targetWeapon = createTimestamped("itm", {
    id: "itm_mastery_target_attack",
    campaignId: source.campaignId,
    systemId: source.systemId,
    actorId: target.id,
    type: "item" as const,
    name: "Ogre Club",
    data: { category: "weapon", equipmentCategory: "weapon", weaponCategory: "simple", weaponKind: "melee", properties: [], damage: "1d8", damageType: "bludgeoning", ability: "strength", attackBonus: 100, equipped: true },
  }) satisfies Item;
  const combat = createTimestamped("cmb", {
    id: `cmb_mastery_${properties.join("_")}`,
    campaignId: source.campaignId,
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [
      { id: "cmbt_mastery_source", tokenId: "tok_mastery_source", actorId: source.id, name: source.name, initiative: 20, defeated: false, conditions: [] },
      { id: "cmbt_mastery_target", tokenId: "tok_mastery_target", actorId: target.id, name: target.name, initiative: 10, defeated: false, conditions: [] },
      { id: "cmbt_mastery_secondary", tokenId: "tok_mastery_secondary", actorId: secondary.id, name: secondary.name, initiative: 5, defeated: false, conditions: [] },
    ],
  }) satisfies Combat;
  store.state.combats = store.state.combats.map((candidate) => candidate.campaignId === source.campaignId ? { ...candidate, active: false } : candidate);
  store.state.actors.push(source, target, secondary);
  store.state.items.push(...weapons, targetWeapon);
  store.state.combats.push(combat);
  return { source, target, secondary, weapons: new Map(properties.map((property, index) => [property, weapons[index]!])), targetWeapon, combat };
}

function route(actor: Actor): string {
  return `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/roll`;
}

async function prepareUntil(
  app: Awaited<ReturnType<typeof buildApp>>,
  actor: Actor,
  prefix: string,
  payload: Record<string, unknown>,
  status: string,
  headers: Record<string, string> = gm,
): Promise<ReturnType<typeof app.inject> extends Promise<infer T> ? T : never> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await app.inject({ method: "POST", url: route(actor), headers: { ...headers, "idempotency-key": `${prefix}:prepare:${attempt}` }, payload: { ...payload, expectedUpdatedAt: actor.updatedAt, prepare: true, commit: false } });
    expect(response.statusCode, response.body).toBe(200);
    if (response.json().resolution?.weaponMastery?.status === status) return response as never;
  }
  throw new Error(`No ${status} mastery preview after 60 fair rolls`);
}

async function commit(app: Awaited<ReturnType<typeof buildApp>>, actor: Actor, prefix: string, prepared: PreparedAction, headers: Record<string, string> = gm) {
  return app.inject({
    method: "POST",
    url: route(actor),
    headers: { ...headers, "idempotency-key": `${prefix}:commit` },
    payload: { preparedPreviewKey: prepared.preparation.preparedPreviewKey, expectedUpdatedAt: prepared.preparation.revisions.actorUpdatedAt[prepared.preparation.sourceActorId] },
  });
}

function nextRevision(value: string): string {
  return new Date(Date.parse(value) + 1).toISOString();
}

describe("Weapon Mastery prepared-action API", () => {
  it("persists, replays, sources, grants, and consumes Vex through ordinary attacks", async () => {
    const store = new MemoryStateStore();
    const { source, target, weapons, combat } = fixtures(store, ["vex", "sap"]);
    const app = await buildApp({ store });
    try {
      const preparedResponse = await prepareUntil(app, source, "mastery:vex", { rollId: `item-${weapons.get("vex")!.id}-attack`, targetActorId: target.id, weaponMastery: { use: true, damageDealt: true } }, "applied");
      const prepared = preparedResponse.json() as PreparedAction;
      expect(preparedResponse.json().resolution).toMatchObject({ weaponMastery: { property: "vex", capability: "automatic", status: "applied", targetActorId: target.id }, auditEvents: expect.arrayContaining([expect.objectContaining({ code: "weapon-mastery.vex.applied" })]) });
      const committed = await commit(app, source, "mastery:vex", prepared);
      expect(committed.statusCode, committed.body).toBe(200);
      const afterVex = store.state.actors.find((candidate) => candidate.id === source.id)!;
      expect((afterVex.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toContainEqual(expect.objectContaining({ kind: "weaponMastery", property: "vex", targetActorId: target.id, source: "SRD 5.2.1" }));

      const replay = await commit(app, source, "mastery:vex", prepared);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");

      combat.round = 2;
      combat.turnIndex = 0;
      combat.updatedAt = nextRevision(combat.updatedAt);
      const consumePrepared = await app.inject({ method: "POST", url: route(afterVex), headers: { ...gm, "idempotency-key": "mastery:vex:consume:prepare" }, payload: { rollId: `item-${weapons.get("sap")!.id}-attack`, targetActorId: target.id, expectedUpdatedAt: afterVex.updatedAt, weaponMastery: { use: false }, prepare: true, commit: false } });
      expect(consumePrepared.statusCode, consumePrepared.body).toBe(200);
      expect(consumePrepared.json().resolution.rolls[0]).toMatchObject({ d20Mode: "advantage", advantageSources: ["Weapon Mastery: Vex"] });
      expect(consumePrepared.json().resolution.auditEvents).toContainEqual(expect.objectContaining({ code: "weapon-mastery.vex.consumed" }));
      const consumed = await commit(app, afterVex, "mastery:vex:consume", consumePrepared.json() as PreparedAction);
      expect(consumed.statusCode, consumed.body).toBe(200);
      const finalEffects = ((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as { activeEffects: Array<Record<string, unknown>> }).activeEffects);
      expect(finalEffects).not.toContainEqual(expect.objectContaining({ property: "vex" }));
    } finally {
      await app.close();
    }
  });

  it("applies Sap to the next target attack and expires Slow with actor/combat synchronization", async () => {
    const store = new MemoryStateStore();
    const { source, target, weapons, targetWeapon, combat } = fixtures(store, ["sap", "slow"]);
    const app = await buildApp({ store });
    try {
      const sapPrepared = await prepareUntil(app, source, "mastery:sap", { rollId: `item-${weapons.get("sap")!.id}-attack`, targetActorId: target.id, weaponMastery: { use: true } }, "applied");
      expect((await commit(app, source, "mastery:sap", sapPrepared.json() as PreparedAction)).statusCode).toBe(200);
      const targetWithSap = store.state.actors.find((candidate) => candidate.id === target.id)!;
      combat.turnIndex = 1;
      combat.updatedAt = nextRevision(combat.updatedAt);
      const targetAttack = await app.inject({ method: "POST", url: route(targetWithSap), headers: { ...gm, "idempotency-key": "mastery:sap:consume:prepare" }, payload: { rollId: `item-${targetWeapon.id}-attack`, targetActorId: source.id, expectedUpdatedAt: targetWithSap.updatedAt, prepare: true, commit: false } });
      expect(targetAttack.statusCode, targetAttack.body).toBe(200);
      expect(targetAttack.json().resolution.rolls[0]).toMatchObject({ d20Mode: "disadvantage", disadvantageSources: ["Weapon Mastery: Sap"] });
      expect((await commit(app, targetWithSap, "mastery:sap:consume", targetAttack.json() as PreparedAction)).statusCode).toBe(200);

      combat.round = 2;
      combat.turnIndex = 0;
      combat.updatedAt = nextRevision(combat.updatedAt);
      const currentSource = store.state.actors.find((candidate) => candidate.id === source.id)!;
      const slowPrepared = await prepareUntil(app, currentSource, "mastery:slow", { rollId: `item-${weapons.get("slow")!.id}-attack`, targetActorId: target.id, weaponMastery: { use: true, damageDealt: true } }, "applied");
      expect((await commit(app, currentSource, "mastery:slow", slowPrepared.json() as PreparedAction)).statusCode).toBe(200);
      const slowedSheet = await app.inject({ method: "GET", url: `/api/v1/campaigns/${source.campaignId}/systems/${source.systemId}/actors/${target.id}/sheet`, headers: gm });
      expect(slowedSheet.json().data).toMatchObject({ effectiveSpeed: 20, speedDetails: { weaponMasteryPenalty: -10 } });

      const currentCombat = store.state.combats.find((candidate) => candidate.id === combat.id)!;
      const advanced = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: { ...gm, "idempotency-key": "mastery:slow:expiry" }, payload: { round: 3, turnIndex: 0, expectedUpdatedAt: currentCombat.updatedAt } });
      expect(advanced.statusCode, advanced.body).toBe(200);
      const expiredSheet = await app.inject({ method: "GET", url: `/api/v1/campaigns/${source.campaignId}/systems/${source.systemId}/actors/${target.id}/sheet`, headers: gm });
      expect(expiredSheet.json().data.effectiveSpeed).toBe(30);
    } finally {
      await app.close();
    }
  });

  it("blocks Topple for its save, syncs Prone, and restores actor/combat state through undo", async () => {
    const store = new MemoryStateStore();
    const { source, target, weapons, combat } = fixtures(store, ["topple"]);
    const app = await buildApp({ store });
    try {
      const unresolved = await app.inject({ method: "POST", url: route(source), headers: gm, payload: { rollId: `item-${weapons.get("topple")!.id}-attack`, targetActorId: target.id, weaponMastery: { use: true }, commit: false } });
      expect(unresolved.statusCode, unresolved.body).toBe(200);
      expect(unresolved.json().resolution).toMatchObject({ weaponMastery: { status: "choice-required", save: { ability: "constitution", dc: 14 } }, pendingSaves: [expect.objectContaining({ actorId: target.id, requiredForCommit: true })] });

      const preparedResponse = await prepareUntil(app, source, "mastery:topple", { rollId: `item-${weapons.get("topple")!.id}-attack`, targetActorId: target.id, weaponMastery: { use: true }, saveOutcomes: { [target.id]: "failure" } }, "applied");
      expect(preparedResponse.json().resolution.conditions).toContainEqual(expect.objectContaining({ actorId: target.id, conditionId: "prone" }));
      const committed = await commit(app, source, "mastery:topple", preparedResponse.json() as PreparedAction);
      expect(committed.statusCode, committed.body).toBe(200);
      expect(store.state.actors.find((candidate) => candidate.id === target.id)!.data.conditions).toContainEqual(expect.objectContaining({ id: "prone" }));
      expect(store.state.combats.find((candidate) => candidate.id === combat.id)!.combatants.find((candidate) => candidate.actorId === target.id)?.conditions).toContain("prone");

      const undo = await app.inject({ method: "POST", url: `/api/v1/campaigns/${source.campaignId}/dnd/rules-mutations/${committed.json().rulesMutationId}/undo`, headers: { ...gm, "idempotency-key": "mastery:topple:undo" }, payload: { expectedActorUpdatedAt: committed.json().undo.expectedActorUpdatedAt, expectedItemUpdatedAt: committed.json().undo.expectedItemUpdatedAt, expectedCombatUpdatedAt: committed.json().undo.expectedCombatUpdatedAt } });
      expect(undo.statusCode, undo.body).toBe(200);
      expect(store.state.actors.find((candidate) => candidate.id === target.id)!.data.conditions).not.toContainEqual(expect.objectContaining({ id: "prone" }));
      expect(store.state.combats.find((candidate) => candidate.id === combat.id)!.combatants.find((candidate) => candidate.actorId === target.id)?.conditions ?? []).not.toContain("prone");
    } finally {
      await app.close();
    }
  });

  it("folds Nick into the existing Attack action and reviews Cleave/Push without inferred geometry", async () => {
    const nickStore = new MemoryStateStore();
    const nickFixture = fixtures(nickStore, ["sap", "nick"]);
    let app = await buildApp({ store: nickStore });
    try {
      const first = await app.inject({ method: "POST", url: route(nickFixture.source), headers: { ...gm, "idempotency-key": "mastery:nick:first:prepare" }, payload: { rollId: `item-${nickFixture.weapons.get("sap")!.id}-attack`, targetActorId: nickFixture.target.id, expectedUpdatedAt: nickFixture.source.updatedAt, prepare: true, commit: false } });
      expect(first.statusCode, first.body).toBe(200);
      expect((await commit(app, nickFixture.source, "mastery:nick:first", first.json() as PreparedAction)).statusCode).toBe(200);
      const currentSource = nickStore.state.actors.find((candidate) => candidate.id === nickFixture.source.id)!;
      const nick = await prepareUntil(app, currentSource, "mastery:nick", { rollId: `item-${nickFixture.weapons.get("nick")!.id}-attack`, targetActorId: nickFixture.target.id, weaponMastery: { use: true, nickExtraAttack: true } }, "applied");
      expect(nick.json().resolution).toMatchObject({ action: { kind: "action", ledger: { actionsUsed: 1 } }, weaponMastery: { property: "nick", status: "applied" } });
      expect((await commit(app, currentSource, "mastery:nick", nick.json() as PreparedAction)).statusCode).toBe(200);
      const duplicate = await app.inject({ method: "POST", url: route(nickStore.state.actors.find((candidate) => candidate.id === currentSource.id)!), headers: { ...gm, "idempotency-key": "mastery:nick:duplicate" }, payload: { rollId: `item-${nickFixture.weapons.get("nick")!.id}-attack`, targetActorId: nickFixture.target.id, weaponMastery: { use: true, nickExtraAttack: true }, expectedUpdatedAt: nickStore.state.actors.find((candidate) => candidate.id === currentSource.id)!.updatedAt, prepare: true, commit: false } });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().message).toContain("already used");
    } finally {
      await app.close();
    }

    const spatialStore = new MemoryStateStore();
    const spatial = fixtures(spatialStore, ["cleave", "push"]);
    app = await buildApp({ store: spatialStore });
    try {
      const missingGeometry = await app.inject({ method: "POST", url: route(spatial.source), headers: gm, payload: { rollId: `item-${spatial.weapons.get("cleave")!.id}-attack`, targetActorId: spatial.target.id, weaponMastery: { use: true, secondaryTargetActorId: spatial.secondary.id }, commit: false } });
      expect(missingGeometry.statusCode).toBe(200);
      expect(missingGeometry.json().resolution.weaponMastery).toMatchObject({ status: "choice-required", geometry: { inferred: false, confirmedByUser: false } });
      const cleave = await prepareUntil(app, spatial.source, "mastery:cleave", { rollId: `item-${spatial.weapons.get("cleave")!.id}-attack`, targetActorId: spatial.target.id, weaponMastery: { use: true, secondaryTargetActorId: spatial.secondary.id, geometryConfirmed: true } }, "applied");
      expect(cleave.json().rolls).toEqual(expect.arrayContaining([expect.objectContaining({ targetActorId: spatial.target.id }), expect.objectContaining({ targetActorId: spatial.secondary.id })]));
      expect(cleave.json().resolution.weaponMastery).toMatchObject({ secondaryTargetActorId: spatial.secondary.id, secondaryAttack: { targetActorId: spatial.secondary.id, geometryConfirmed: true }, geometry: { inferred: false, confirmedByUser: true } });
      expect((await commit(app, spatial.source, "mastery:cleave", cleave.json() as PreparedAction)).statusCode).toBe(200);

      spatial.combat.round = 2;
      spatial.combat.updatedAt = nextRevision(spatial.combat.updatedAt);
      const currentSource = spatialStore.state.actors.find((candidate) => candidate.id === spatial.source.id)!;
      const push = await prepareUntil(app, currentSource, "mastery:push", { rollId: `item-${spatial.weapons.get("push")!.id}-attack`, targetActorId: spatial.target.id, weaponMastery: { use: true, geometryConfirmed: true, pushDistanceFeet: 10 } }, "manual-step");
      expect(push.json().resolution).toMatchObject({ weaponMastery: { capability: "manual", status: "manual-step", geometry: { inferred: false, distanceFeet: 10 } }, auditEvents: expect.arrayContaining([expect.objectContaining({ code: "weapon-mastery.push.declared" })]) });
      expect(push.json().resolution.actorUpdates).not.toContainEqual(expect.objectContaining({ actorId: spatial.target.id }));
    } finally {
      await app.close();
    }
  });

  it("routes a player-owned Sap consequence on an unowned target through GM confirmation", async () => {
    const store = new MemoryStateStore();
    const { source, target, weapons, combat } = fixtures(store, ["sap"]);
    source.ownerUserId = "usr_demo_player";
    const targetBefore = structuredClone(target.data);
    const app = await buildApp({ store });
    try {
      const prepared = await prepareUntil(app, source, "mastery:sap:player", { rollId: `item-${weapons.get("sap")!.id}-attack`, targetActorId: target.id, weaponMastery: { use: true } }, "applied", player);
      const committed = await commit(app, source, "mastery:sap:player", prepared.json() as PreparedAction, player);

      expect(committed.statusCode, committed.body).toBe(200);
      expect(committed.json().combatAction).toMatchObject({ status: "pending_gm", requestedByUserId: "usr_demo_player", targetActorIds: [target.id], applyEffect: true });
      expect(store.state.actors.find((candidate) => candidate.id === target.id)!.data).toEqual(targetBefore);
      expect(store.state.combats.find((candidate) => candidate.id === combat.id)!.actions).toContainEqual(expect.objectContaining({ status: "pending_gm", requestedByUserId: "usr_demo_player" }));
    } finally {
      await app.close();
    }
  });
});
