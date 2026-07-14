import { createTimestamped, type Actor, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function addDndActor(store: MemoryStateStore): Actor {
  const actor = createTimestamped("act", {
    id: "act_condition_safety",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Condition Safety Fighter",
    data: { level: 1, class: "Fighter", conditions: [] },
    permissions: {}
  }) satisfies Actor;
  store.state.actors.push(actor);
  return actor;
}

describe("system actor condition mutation safety", () => {
  it("enforces actor, monster, effect, and active-item condition immunities with an audited manager override", async () => {
    const store = new MemoryStateStore();
    const actor = addDndActor(store);
    const ward = createTimestamped("itm", {
      id: "itm_condition_ward",
      campaignId: actor.campaignId,
      systemId: actor.systemId,
      actorId: actor.id,
      type: "item",
      name: "Ward of Freedom",
      data: { equipped: true, requiresAttunement: true, conditionImmunity: ["restrained"] }
    }) satisfies Item;
    store.state.items.push(ward);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/conditions`;

    try {
      const cases = [
        { conditionId: "poisoned", data: { level: 1, class: "Fighter", conditions: [], conditionImmunities: ["poisoned"] } },
        { conditionId: "charmed", data: { level: 1, class: "Fighter", conditions: [], monster: { statBlock: { conditionImmunity: ["charmed"] } } } },
        { conditionId: "frightened", data: { level: 1, class: "Fighter", conditions: [], rulesEngine: { activeEffects: [{ conditionImmunities: ["frightened"] }] } } },
        { conditionId: "restrained", data: { level: 1, class: "Fighter", conditions: [], rulesEngine: { attunedItemIds: [ward.id] } } }
      ];

      for (const [index, entry] of cases.entries()) {
        actor.data = entry.data;
        const before = structuredClone(actor);
        const response = await app.inject({
          method: "POST",
          url: route,
          headers: { ...gmHeaders, "idempotency-key": `condition-immunity-${index}` },
          payload: { conditionId: entry.conditionId, expectedUpdatedAt: actor.updatedAt }
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().message).toContain("is immune to");
        expect(actor).toEqual(before);
      }

      actor.ownerUserId = "usr_demo_player";
      actor.data = { level: 1, class: "Fighter", conditions: [], conditionImmunities: ["poisoned"] };
      const ownerOverride = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "condition-immunity-owner-override" },
        payload: { conditionId: "poisoned", expectedUpdatedAt: actor.updatedAt, overrideReason: "Table ruling" }
      });
      expect(ownerOverride.statusCode).toBe(403);
      expect(actor.data.conditions).toEqual([]);

      const observedRevision = actor.updatedAt;
      const managerOverride = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "condition-immunity-manager-override" },
        payload: { conditionId: "poisoned", expectedUpdatedAt: observedRevision, overrideReason: "Specific effect overrides immunity" }
      });
      expect(managerOverride.statusCode).toBe(200);
      expect(actor.data.conditions).toContainEqual(expect.objectContaining({ id: "poisoned" }));
      expect(store.state.auditLogs.find((entry) => entry.action === "actor.conditionApplied" && entry.targetId === actor.id)).toMatchObject({
        before: { updatedAt: observedRevision },
        after: { conditionId: "poisoned", overrideReason: "Specific effect overrides immunity" }
      });
    } finally {
      await app.close();
    }
  });

  it("requires explicit actor permission, a replay key, and the observed revision", async () => {
    const store = new MemoryStateStore();
    const actor = addDndActor(store);
    const before = structuredClone(actor);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/conditions`;

    try {
      const forbidden = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "condition-player-denied" },
        payload: { conditionId: "exhaustion", expectedUpdatedAt: actor.updatedAt }
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toMatchObject({ error: "forbidden", message: "Missing permission: actor.update" });

      const missingKey = await app.inject({
        method: "POST",
        url: route,
        headers: gmHeaders,
        payload: { conditionId: "exhaustion", expectedUpdatedAt: actor.updatedAt }
      });
      expect(missingKey.statusCode).toBe(400);
      expect(missingKey.json()).toMatchObject({
        error: "Bad Request",
        message: "headers must have required property 'idempotency-key'"
      });

      const missingRevision = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "condition-missing-revision" },
        payload: { conditionId: "exhaustion" }
      });
      expect(missingRevision.statusCode).toBe(400);
      expect(missingRevision.json()).toMatchObject({
        error: "Bad Request",
        message: "body must have required property 'expectedUpdatedAt'"
      });

      const missingRemovalRevision = await app.inject({
        method: "DELETE",
        url: `${route}/exhaustion`,
        headers: { ...gmHeaders, "idempotency-key": "condition-missing-removal-revision" }
      });
      expect(missingRemovalRevision.statusCode).toBe(400);
      expect(missingRemovalRevision.json()).toMatchObject({
        error: "Bad Request",
        message: "querystring must have required property 'expectedUpdatedAt'"
      });
      expect(actor).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it("replays one exhaustion application once and rejects stale apply and removal attempts", async () => {
    const store = new MemoryStateStore();
    const actor = addDndActor(store);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/conditions`;

    try {
      const observedRevision = actor.updatedAt;
      const firstPayload = { conditionId: "exhaustion", expectedUpdatedAt: observedRevision };
      const firstHeaders = { ...gmHeaders, "idempotency-key": "condition-exhaustion-first" };
      const applied = await app.inject({ method: "POST", url: route, headers: firstHeaders, payload: firstPayload });
      expect(applied.statusCode).toBe(200);
      expect(applied.json().sheet.conditions).toEqual([expect.objectContaining({ id: "exhaustion", level: 1 })]);
      expect(actor.updatedAt).not.toBe(observedRevision);
      const afterFirstRevision = actor.updatedAt;

      const replayed = await app.inject({ method: "POST", url: route, headers: firstHeaders, payload: firstPayload });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.headers["idempotency-replayed"]).toBe("true");
      expect(replayed.json()).toEqual(applied.json());
      expect(actor.updatedAt).toBe(afterFirstRevision);
      expect(actor.data.conditions).toEqual([expect.objectContaining({ id: "exhaustion", level: 1 })]);
      expect(store.state.auditLogs.filter((entry) => entry.action === "actor.conditionApplied" && entry.targetId === actor.id)).toHaveLength(1);
      expect(store.state.auditLogs.find((entry) => entry.action === "actor.conditionApplied" && entry.targetId === actor.id)).toMatchObject({
        before: { updatedAt: observedRevision },
        after: { updatedAt: afterFirstRevision, conditionId: "exhaustion" }
      });

      const staleApply = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "condition-exhaustion-stale" },
        payload: firstPayload
      });
      expect(staleApply.statusCode).toBe(409);
      expect(staleApply.json()).toMatchObject({ error: "conflict", code: "stale_write", resourceType: "actor", resourceId: actor.id });
      expect(actor.data.conditions).toEqual([expect.objectContaining({ id: "exhaustion", level: 1 })]);

      const second = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "condition-exhaustion-second" },
        payload: { conditionId: "exhaustion", expectedUpdatedAt: actor.updatedAt }
      });
      expect(second.statusCode).toBe(200);
      expect(actor.data.conditions).toEqual([expect.objectContaining({ id: "exhaustion", level: 2 })]);

      const staleRemoval = await app.inject({
        method: "DELETE",
        url: `${route}/exhaustion?expectedUpdatedAt=${encodeURIComponent(afterFirstRevision)}`,
        headers: { ...gmHeaders, "idempotency-key": "condition-exhaustion-stale-remove" }
      });
      expect(staleRemoval.statusCode).toBe(409);
      expect(actor.data.conditions).toEqual([expect.objectContaining({ id: "exhaustion", level: 2 })]);

      const removalRevision = actor.updatedAt;
      const removalUrl = `${route}/exhaustion?expectedUpdatedAt=${encodeURIComponent(removalRevision)}`;
      const removalHeaders = { ...gmHeaders, "idempotency-key": "condition-exhaustion-remove" };
      const removed = await app.inject({ method: "DELETE", url: removalUrl, headers: removalHeaders });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().sheet.conditions).toEqual([]);

      const removalReplay = await app.inject({ method: "DELETE", url: removalUrl, headers: removalHeaders });
      expect(removalReplay.statusCode).toBe(200);
      expect(removalReplay.headers["idempotency-replayed"]).toBe("true");
      expect(removalReplay.json()).toEqual(removed.json());
      expect(actor.data.conditions).toEqual([]);
      expect(store.state.auditLogs.filter((entry) => entry.action === "actor.conditionRemoved" && entry.targetId === actor.id)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("preserves non-D&D condition behavior for an actor owner", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.id === "act_generic_demo")!;
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${actor.id}/conditions`;

    try {
      const applied = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "condition-generic-owner-apply" },
        payload: { conditionId: "blessed", expectedUpdatedAt: actor.updatedAt }
      });
      expect(applied.statusCode).toBe(200);
      expect(applied.json().sheet.conditions).toEqual([expect.objectContaining({ id: "blessed" })]);

      const removed = await app.inject({
        method: "DELETE",
        url: `${route}/blessed?expectedUpdatedAt=${encodeURIComponent(actor.updatedAt)}`,
        headers: { ...playerHeaders, "idempotency-key": "condition-generic-owner-remove" }
      });
      expect(removed.statusCode).toBe(200);
      expect(removed.json().sheet.conditions).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
