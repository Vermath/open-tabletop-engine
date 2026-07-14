import { createTimestamped, type Actor, type Combat, type EngineState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { CampaignWebhookTransport, CampaignWebhookTransportInput } from "./campaign-webhooks.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function addLifecycleFixtures(store: MemoryStateStore, expiresAtRound = 2) {
  const startedAt = "2026-07-13T00:00:00.000Z";
  const source = createTimestamped("act", {
    id: "act_lifecycle_source",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Lifecycle Source",
    data: {
      conditions: [{ id: "concentration" }],
      rulesEngine: {
        concentration: {
          rollId: "spell-fear",
          sourceActorId: "act_lifecycle_source",
          targetActorIds: ["act_lifecycle_target"],
          startedAt,
          startedAtRound: 1,
          durationRounds: 10,
          expiresAtRound
        },
        activeEffects: [{ id: "source-fear", rollId: "spell-fear", sourceActorId: "act_lifecycle_source", startedAt, concentration: true, expiresAtRound }]
      }
    },
    permissions: {}
  }) satisfies Actor;
  const target = createTimestamped("act", {
    id: "act_lifecycle_target",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Lifecycle Target",
    data: {
      conditions: [{ id: "frightened" }, { id: "prone" }],
      rulesEngine: {
        activeEffects: [
          { id: "target-fear", rollId: "spell-fear", sourceActorId: source.id, targetActorId: "act_lifecycle_target", startedAt, concentration: true, ownedConditionIds: ["frightened"], conditionIds: ["frightened"], expiresAtRound },
          { id: "target-prone", rollId: "trip", sourceActorId: "act_other", ownedConditionIds: ["prone"], conditionIds: ["prone"] }
        ]
      }
    },
    permissions: {}
  }) satisfies Actor;
  const combat = createTimestamped("cmb", {
    id: "cmb_lifecycle",
    campaignId: "camp_demo",
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [
      { id: "cmbt_lifecycle_source", tokenId: "tok_valen", actorId: source.id, name: source.name, initiative: 20, defeated: false, conditions: ["concentration"] },
      { id: "cmbt_lifecycle_target", tokenId: "tok_goblin_scout", actorId: target.id, name: target.name, initiative: 10, defeated: false, conditions: ["frightened:99", "prone"] }
    ]
  }) satisfies Combat;
  store.state.actors.push(source, target);
  store.state.combats.push(combat);
  return { source, target, combat };
}

describe("D&D linked effect lifecycle API", () => {
  it("does not expose exact concentration diffs with actor.update but without actor.readPrivate", async () => {
    const store = new MemoryStateStore();
    const { source } = addLifecycleFixtures(store, 11);
    store.state.permissionGrants.push(createTimestamped("grant", {
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      campaignId: "camp_demo",
      permissions: ["actor.update"]
    }));
    const app = await buildApp({ store });
    try {
      const denied = await app.inject({
        method: "POST",
        url: `/api/v1/actors/${source.id}/concentration/end`,
        headers: { ...playerHeaders, "idempotency-key": "concentration-private-denial" },
        payload: { prepare: true }
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain("actorUpdates");
      expect((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as { concentration?: unknown }).concentration).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it("expires linked actor effects and combat conditions through automatic round progression", async () => {
    const store = new MemoryStateStore();
    const { source, target, combat } = addLifecycleFixtures(store);
    store.state.permissionGrants.push(createTimestamped("grant", {
      subjectType: "user" as const,
      subjectId: "usr_demo_player",
      campaignId: "camp_demo",
      permissions: ["combat.manage", "actor.update"]
    }));
    const app = await buildApp({ store });

    try {
      const advanced = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${combat.id}`,
        headers: { ...playerHeaders, "idempotency-key": "advance-lifecycle-round" },
        payload: { round: 2, turnIndex: 1, expectedUpdatedAt: combat.updatedAt }
      });
      expect(advanced.statusCode).toBe(200);
      expect(advanced.json()).toEqual(expect.objectContaining({ round: 2, turnIndex: 1 }));
      const updatedCombat = store.state.combats.find((candidate) => candidate.id === combat.id)!;
      expect(updatedCombat.combatants.find((candidate) => candidate.actorId === source.id)?.conditions).toEqual([]);
      expect(updatedCombat.combatants.find((candidate) => candidate.actorId === target.id)?.conditions).toEqual(["prone"]);
      const updatedSource = store.state.actors.find((candidate) => candidate.id === source.id)!;
      const updatedTarget = store.state.actors.find((candidate) => candidate.id === target.id)!;
      expect(updatedSource.data.conditions).toEqual([]);
      expect((updatedSource.data.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
      expect(updatedTarget.data.conditions).toEqual([{ id: "prone" }]);
      expect((updatedTarget.data.rulesEngine as { activeEffects?: Array<{ id: string }> }).activeEffects).toEqual([expect.objectContaining({ id: "target-prone" })]);
      const audit = store.state.auditLogs.find((log) => log.action === "combat.roundAdvanced" && log.targetId === combat.id)!;
      expect(audit.after).toMatchObject({ rulesProgression: { actorIds: expect.arrayContaining([source.id, target.id]), eventIds: expect.any(Array) } });
    } finally {
      await app.close();
    }
  });

  it("cleans linked concentration effects when automatic turn progression finds an incapacitated source", async () => {
    const store = new MemoryStateStore();
    const { source, target, combat } = addLifecycleFixtures(store, 11);
    combat.combatants.find((candidate) => candidate.actorId === source.id)!.conditions = ["concentration", "incapacitated"];
    const app = await buildApp({ store });

    try {
      const changedTurn = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${combat.id}`,
        headers: { ...gmHeaders, "idempotency-key": "advance-lifecycle-turn" },
        payload: { turnIndex: 1, expectedUpdatedAt: combat.updatedAt }
      });
      expect(changedTurn.statusCode).toBe(200);
      expect(changedTurn.json()).toEqual(expect.objectContaining({ round: 1, turnIndex: 1 }));
      expect(changedTurn.json().combatants.find((candidate: { actorId: string }) => candidate.actorId === source.id).conditions).toEqual(["incapacitated"]);
      expect(changedTurn.json().combatants.find((candidate: { actorId: string }) => candidate.actorId === target.id).conditions).toEqual(["prone"]);
      expect((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
      expect(store.state.actors.find((candidate) => candidate.id === target.id)!.data.conditions).toEqual([{ id: "prone" }]);
      const audit = store.state.auditLogs.find((log) => log.action === "combat.updated" && log.targetId === combat.id)!;
      expect(audit.after).toMatchObject({ rulesProgression: { actorIds: expect.arrayContaining([source.id, target.id]), eventIds: expect.any(Array) } });
    } finally {
      await app.close();
    }
  });

  it("prepares, commits, replays, and undoes exact concentration cleanup", async () => {
    const store = new MemoryStateStore();
    const { source, target, combat } = addLifecycleFixtures(store, 11);
    const app = await buildApp({ store });
    const route = `/api/v1/actors/${source.id}/concentration/end`;

    try {
      const forbidden = await app.inject({ method: "POST", url: route, headers: { ...playerHeaders, "idempotency-key": "forbidden-concentration-preview" }, payload: { prepare: true } });
      expect(forbidden.statusCode).toBe(403);

      const reason = "Caster chose to stop";
      const preview = await app.inject({ method: "POST", url: route, headers: { ...gmHeaders, "idempotency-key": "end-lifecycle-concentration-preview" }, payload: { prepare: true, reason } });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({ status: "ready", concentrationEnded: true, preparation: expect.objectContaining({ preparedPreviewKey: "end-lifecycle-concentration-preview" }) }));
      expect((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as Record<string, unknown>).concentration).toBeDefined();
      const preparation = preview.json().preparation as { preparedPreviewKey: string; revisions: { actorUpdatedAt: Record<string, string>; combatUpdatedAt: Record<string, string> } };

      const stale = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "end-lifecycle-concentration-stale" },
        payload: {
          preparedPreviewKey: preparation.preparedPreviewKey,
          expectedActorUpdatedAt: { ...preparation.revisions.actorUpdatedAt, [source.id]: "1970-01-01T00:00:00.000Z" },
          expectedCombatUpdatedAt: preparation.revisions.combatUpdatedAt,
          reason
        }
      });
      expect(stale.statusCode).toBe(409);
      expect((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as Record<string, unknown>).concentration).toBeDefined();

      const headers = { ...gmHeaders, "idempotency-key": "end-lifecycle-concentration-commit" };
      const payload = {
        preparedPreviewKey: preparation.preparedPreviewKey,
        expectedActorUpdatedAt: preparation.revisions.actorUpdatedAt,
        expectedCombatUpdatedAt: preparation.revisions.combatUpdatedAt,
        reason
      };
      const ended = await app.inject({ method: "POST", url: route, headers, payload });
      expect(ended.statusCode).toBe(200);
      expect(ended.json()).toEqual(expect.objectContaining({ concentrationEnded: true, actor: expect.objectContaining({ id: source.id }), rulesMutationId: expect.any(String), undo: expect.any(Object) }));
      expect(store.state.actors.find((candidate) => candidate.id === source.id)!.data.conditions).toEqual([]);
      expect(store.state.actors.find((candidate) => candidate.id === target.id)!.data.conditions).toEqual([{ id: "prone" }]);
      expect(combat.combatants.find((candidate) => candidate.actorId === source.id)?.conditions).toEqual([]);
      expect(combat.combatants.find((candidate) => candidate.actorId === target.id)?.conditions).toEqual(["prone"]);

      const replay = await app.inject({ method: "POST", url: route, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(ended.json());
      expect(store.state.auditLogs.filter((log) => log.action === "actor.concentrationEnded" && log.targetId === source.id)).toHaveLength(1);

      const { mutationId, ...undoPayload } = ended.json().undo as { mutationId: string; expectedActorUpdatedAt: Record<string, string>; expectedItemUpdatedAt: Record<string, string>; expectedCombatUpdatedAt?: string };
      const undone = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/rules-mutations/${mutationId}/undo`,
        headers: { ...gmHeaders, "idempotency-key": "undo-lifecycle-concentration" },
        payload: undoPayload
      });
      expect(undone.statusCode).toBe(200);
      expect(undone.json()).toEqual(expect.objectContaining({ undone: true, mutation: expect.objectContaining({ kind: "concentration", status: "undone" }) }));
      expect((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as Record<string, unknown>).concentration).toBeDefined();
      expect(store.state.combats.find((candidate) => candidate.id === combat.id)?.combatants.find((candidate) => candidate.actorId === source.id)?.conditions).toEqual(["concentration"]);
    } finally {
      await app.close();
    }
  });

  it("does not dispatch concentration events when durable persistence fails", async () => {
    class FailingDurableStore extends MemoryStateStore {
      failNextFlush = false;
      pending = false;
      persisted: EngineState;

      constructor() {
        super();
        this.persisted = structuredClone(this.state);
      }

      override save(): void {
        this.pending = true;
      }

      override flush(): void {
        if (!this.pending) return;
        if (this.failNextFlush) {
          this.failNextFlush = false;
          throw new Error("injected concentration persistence failure");
        }
        this.persisted = structuredClone(this.state);
        this.pending = false;
      }
    }

    class RecordingTransport implements CampaignWebhookTransport {
      sent: CampaignWebhookTransportInput[] = [];
      async validateTarget(url: string) {
        return { ok: true as const, normalizedUrl: url, resolvedAddresses: ["203.0.113.10"] };
      }
      async send(input: CampaignWebhookTransportInput) {
        this.sent.push(structuredClone(input));
        return { ok: true as const, responseStatus: 204, responseBytes: 0 };
      }
    }

    const store = new FailingDurableStore();
    const { source } = addLifecycleFixtures(store, 11);
    store.state.campaignWebhooks.push(createTimestamped("cwh", {
      id: "cwh_concentration_atomicity",
      campaignId: "camp_demo",
      name: "Atomicity witness",
      url: "https://hooks.example.test/concentration",
      eventTypes: ["actor.updated"],
      enabled: true,
      signingSecret: "otte_whsec_atomicity",
      secretHint: "omicity",
      createdByUserId: "usr_demo_gm",
      updatedByUserId: "usr_demo_gm"
    }));
    const transport = new RecordingTransport();
    const app = await buildApp({ store, webhookTransport: transport });
    const route = `/api/v1/actors/${source.id}/concentration/end`;

    try {
      const reason = "Durability test";
      const preview = await app.inject({ method: "POST", url: route, headers: { ...gmHeaders, "idempotency-key": "concentration-failure-preview" }, payload: { prepare: true, reason } });
      expect(preview.statusCode).toBe(200);
      const preparation = preview.json().preparation as { preparedPreviewKey: string; revisions: { actorUpdatedAt: Record<string, string>; combatUpdatedAt: Record<string, string> } };
      store.failNextFlush = true;
      const failed = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "concentration-failure-commit" },
        payload: {
          preparedPreviewKey: preparation.preparedPreviewKey,
          expectedActorUpdatedAt: preparation.revisions.actorUpdatedAt,
          expectedCombatUpdatedAt: preparation.revisions.combatUpdatedAt,
          reason
        }
      });
      expect(failed.statusCode).toBe(500);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(transport.sent).toEqual([]);
      expect((store.state.actors.find((candidate) => candidate.id === source.id)!.data.rulesEngine as { concentration?: unknown }).concentration).toBeDefined();
      expect(store.state.dndRulesMutations.some((mutation) => mutation.kind === "concentration")).toBe(false);
      expect(store.state.auditLogs.some((log) => log.action === "actor.concentrationEnded" && log.targetId === source.id)).toBe(false);
    } finally {
      await app.close();
    }
  });
});
