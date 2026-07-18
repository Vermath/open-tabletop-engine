import type { AddressInfo } from "node:net";
import type { Actor, Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };

function zeroHpFixture(store: MemoryStateStore): { actor: Actor; combat: Combat } {
  const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
  actor.data = { ...actor.data, hp: { current: 0, max: 18 }, conditions: [{ id: "unconscious" }], deathSaves: { successes: 0, failures: 0 }, lifeState: "unconscious", defeated: false };
  actor.updatedAt = next(actor.updatedAt);
  for (const existing of store.state.combats) existing.active = false;
  const combat: Combat = {
    id: "cmb_combatant_actor_sync", campaignId: actor.campaignId, active: true, round: 1, turnIndex: 0,
    combatants: [{ id: "cmbt_combatant_actor_sync", tokenId: "tok_valen", actorId: actor.id, name: actor.name, initiative: 20, defeated: false, conditions: ["unconscious"], deathSaveSuccesses: 0, deathSaveFailures: 0 }],
    createdAt: next(actor.updatedAt), updatedAt: next(next(actor.updatedAt))
  };
  store.state.combats.push(combat);
  return { actor, combat };
}

describe("exact combatant-to-actor lifecycle synchronization", () => {
  it("forces a canonical paired mutation, rejects stale actor state, replays once, and undoes exactly", async () => {
    const store = new MemoryStateStore();
    const { actor, combat } = zeroHpFixture(store);
    const app = await buildApp({ store });
    const route = `/api/v1/combats/${combat.id}/combatants/${combat.combatants[0]!.id}`;
    const body = { deathSaveSuccesses: 3, syncActorSheet: false, expectedUpdatedAt: combat.updatedAt, expectedActorUpdatedAt: actor.updatedAt };
    const actorBefore = structuredClone(actor);
    const combatBefore = structuredClone(combat);
    try {
      const missingKey = await app.inject({ method: "PATCH", url: route, headers: gm, payload: body });
      expect(missingKey.statusCode).toBe(400);
      expect(actor).toEqual(actorBefore);
      expect(combat).toEqual(combatBefore);

      const staleActor = await app.inject({ method: "PATCH", url: route, headers: { ...gm, "idempotency-key": "combatant-sync-stale" }, payload: { ...body, expectedActorUpdatedAt: next(actor.updatedAt) } });
      expect(staleActor.statusCode).toBe(409);
      expect(staleActor.json()).toMatchObject({ code: "stale_write", resourceType: "actor", resourceId: actor.id });
      expect(actor).toEqual(actorBefore);
      expect(combat).toEqual(combatBefore);

      const applied = await app.inject({ method: "PATCH", url: route, headers: { ...gm, "idempotency-key": "combatant-sync-stable" }, payload: body });
      expect(applied.statusCode, applied.body).toBe(200);
      expect(applied.json()).toMatchObject({
        actor: { id: actor.id, data: { hp: { current: 0, max: 18 }, lifeState: "stable", defeated: false, deathSaves: { successes: 0, failures: 0 } } },
        combat: { id: combat.id, combatants: [{ id: combat.combatants[0]!.id, defeated: false, deathSaveOutcome: "stable", deathSaveSuccesses: 0, deathSaveFailures: 0 }] },
        rulesMutationId: expect.any(String), undo: { mutationId: expect.any(String) }
      });
      expect(applied.json().actor.updatedAt).toBe(applied.json().combat.updatedAt);
      expect(store.state.dndRulesMutations.find((mutation) => mutation.id === applied.json().rulesMutationId)).toMatchObject({ kind: "combatant_sync", roots: { combat: { before: combatBefore } } });

      const after = { actor: structuredClone(actor), combat: structuredClone(combat), mutations: store.state.dndRulesMutations.length };
      const replay = await app.inject({ method: "PATCH", url: route, headers: { ...gm, "idempotency-key": "combatant-sync-stable" }, payload: body });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(applied.json());
      expect(actor).toEqual(after.actor);
      expect(combat).toEqual(after.combat);
      expect(store.state.dndRulesMutations).toHaveLength(after.mutations);

      const undo = await app.inject({
        method: "POST", url: `/api/v1/campaigns/${actor.campaignId}/dnd/rules-mutations/${applied.json().rulesMutationId}/undo`,
        headers: { ...gm, "idempotency-key": "combatant-sync-undo" },
        payload: { expectedActorUpdatedAt: applied.json().undo.expectedActorUpdatedAt, expectedItemUpdatedAt: {}, expectedCombatUpdatedAt: applied.json().undo.expectedCombatUpdatedAt }
      });
      expect(undo.statusCode, undo.body).toBe(200);
      expect({ ...undo.json().actors[0], updatedAt: actorBefore.updatedAt }).toEqual(actorBefore);
      expect({ ...undo.json().combat, updatedAt: combatBefore.updatedAt }).toEqual(combatBefore);
    } finally {
      await app.close();
    }
  });

  it("rejects Stable or death-save state on a positive-HP actor without mutating either root", async () => {
    const store = new MemoryStateStore();
    const { actor, combat } = zeroHpFixture(store);
    actor.data = { ...actor.data, hp: { current: 8, max: 18 }, conditions: [], deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious" };
    const before = { actor: structuredClone(actor), combat: structuredClone(combat) };
    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "PATCH", url: `/api/v1/combats/${combat.id}/combatants/${combat.combatants[0]!.id}`,
        headers: { ...gm, "idempotency-key": "combatant-sync-impossible" },
        payload: { deathSaveSuccesses: 3, syncActorSheet: false, expectedUpdatedAt: combat.updatedAt, expectedActorUpdatedAt: actor.updatedAt }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("positive-HP actor");
      expect(actor).toEqual(before.actor);
      expect(combat).toEqual(before.combat);
    } finally {
      await app.close();
    }
  });

  it("delivers the paired recovery in actor-then-combat order and a reconnect snapshot can act immediately", async () => {
    const store = new MemoryStateStore();
    const { actor, combat } = zeroHpFixture(store);
    combat.combatants[0] = { ...combat.combatants[0]!, defeated: true };
    const app = await buildApp({ store });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { userId: "usr_demo_gm" } });
    expect(login.statusCode).toBe(200);
    const token = login.json().token as string;
    const first = await openRealtime(app, token);
    const disconnected = await openRealtime(app, token);
    disconnected.close();
    try {
      const response = await app.inject({
        method: "POST", url: `/api/v1/campaigns/${actor.campaignId}/systems/dnd-5e-srd/actors/${actor.id}/combat-vitals`,
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "combat-vitals-reconnect" },
        payload: { kind: "healing", amount: 4, expectedActorUpdatedAt: actor.updatedAt, expectedCombatUpdatedAt: combat.updatedAt }
      });
      expect(response.statusCode, response.body).toBe(200);
      await first.waitFor("combat.turnChanged", combat.id);
      expect(first.messages.filter((message) => message.type === "actor.updated" || message.type === "combat.turnChanged").map((message) => message.type)).toEqual(["actor.updated", "combat.turnChanged"]);

      const reconnect = await openRealtime(app, token);
      const snapshot = await app.inject({ method: "GET", url: `/api/v1/campaigns/${actor.campaignId}/snapshot`, headers: { authorization: `Bearer ${token}` } });
      expect(snapshot.statusCode, snapshot.body).toBe(200);
      const recoveredActor = snapshot.json().actors.find((candidate: Actor) => candidate.id === actor.id);
      const recoveredCombat = snapshot.json().combats.find((candidate: Combat) => candidate.id === combat.id);
      expect(recoveredActor).toMatchObject({ data: { hp: { current: 4 }, lifeState: "conscious", defeated: false } });
      expect(recoveredCombat.combatants[0]).toMatchObject({ defeated: false });
      expect(recoveredActor.updatedAt).toBe(recoveredCombat.updatedAt);

      const action = await app.inject({
        method: "POST", url: `/api/v1/campaigns/${actor.campaignId}/systems/dnd-5e-srd/actors/${actor.id}/roll`,
        headers: { authorization: `Bearer ${token}`, "idempotency-key": "recovered-actor-acts" },
        payload: { ability: "strength", expectedUpdatedAt: recoveredActor.updatedAt }
      });
      expect(action.statusCode, action.body).toBe(200);
      expect(action.json().roll.actorId).toBe(actor.id);
      reconnect.close();
    } finally {
      first.close();
      await app.close();
    }
  }, 20_000);
});

type RealtimeMessage = { type?: string; targetId?: string; payload?: unknown };
type RealtimeSocket = { onopen: (() => void) | null; onmessage: ((event: { data: unknown }) => void) | null; onerror: ((event: unknown) => void) | null; close(): void };

async function openRealtime(app: Awaited<ReturnType<typeof buildApp>>, token: string) {
  const WebSocketConstructor = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string[]) => RealtimeSocket }).WebSocket;
  if (!WebSocketConstructor) throw new Error("WebSocket is unavailable in this Node runtime");
  const address = app.server.address() as AddressInfo;
  const socket = new WebSocketConstructor(`ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=camp_demo`, ["otte.v1", `otte.auth.${token}`]);
  const messages: RealtimeMessage[] = [];
  socket.onmessage = (event) => messages.push(JSON.parse(String(event.data)) as RealtimeMessage);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening combat sync realtime socket")), 2_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = (error) => { clearTimeout(timer); reject(new Error(`Combat sync realtime socket failed: ${String(error)}`)); };
  });
  return {
    messages,
    async waitFor(type: string, targetId: string) {
      const deadline = Date.now() + 2_000;
      while (!messages.some((message) => message.type === type && message.targetId === targetId)) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${type}:${targetId}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    close: () => socket.close()
  };
}

function next(revision: string): string {
  return new Date(Date.parse(revision) + 1).toISOString();
}
