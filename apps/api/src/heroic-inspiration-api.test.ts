import { createTimestamped, type Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };

function hero(id: string, ownerUserId = "usr_demo_player", heroicInspiration = false): Actor {
  return createTimestamped("act", {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId,
    type: "character" as const,
    name: id,
    permissions: {},
    data: {
      class: "Fighter",
      level: 1,
      attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
      hp: { current: 12, max: 12 },
      heroicInspiration,
    },
  }) satisfies Actor;
}

function actorPath(actor: Actor): string {
  return `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}`;
}

describe("Heroic Inspiration API lifecycle", () => {
  it("permission-checks and audits GM grants, one-instance overflow transfers, and stale recipients", async () => {
    const store = new MemoryStateStore();
    const source = hero("act_inspiration_source");
    const recipient = hero("act_inspiration_recipient");
    const alreadyHolding = hero("act_inspiration_holding", "usr_demo_player", true);
    store.state.actors.push(source, recipient, alreadyHolding);
    const app = await buildApp({ store });

    try {
      const denied = await app.inject({
        method: "POST",
        url: `${actorPath(source)}/heroic-inspiration/grant`,
        headers: { ...player, "idempotency-key": "player-cannot-grant" },
        payload: { expectedActorUpdatedAt: source.updatedAt },
      });
      expect(denied.statusCode).toBe(403);

      const granted = await app.inject({
        method: "POST",
        url: `${actorPath(source)}/heroic-inspiration/grant`,
        headers: { ...gm, "idempotency-key": "gm-grant" },
        payload: { expectedActorUpdatedAt: source.updatedAt },
      });
      expect(granted.statusCode).toBe(200);
      expect(granted.json()).toMatchObject({ awardedTo: "actor", actor: { id: source.id, data: { heroicInspiration: true } } });

      const noRecipient = await app.inject({
        method: "POST",
        url: `${actorPath(source)}/heroic-inspiration/grant`,
        headers: { ...gm, "idempotency-key": "gm-grant-no-recipient" },
        payload: { expectedActorUpdatedAt: store.state.actors.find((candidate) => candidate.id === source.id)!.updatedAt },
      });
      expect(noRecipient.statusCode).toBe(409);

      const staleRecipient = await app.inject({
        method: "POST",
        url: `${actorPath(source)}/heroic-inspiration/grant`,
        headers: { ...gm, "idempotency-key": "gm-stale-recipient" },
        payload: { expectedActorUpdatedAt: store.state.actors.find((candidate) => candidate.id === source.id)!.updatedAt, recipientActorId: recipient.id, expectedRecipientUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(staleRecipient.statusCode).toBe(409);
      expect(staleRecipient.json().code).toBe("stale_write");

      const transfer = await app.inject({
        method: "POST",
        url: `${actorPath(source)}/heroic-inspiration/grant`,
        headers: { ...gm, "idempotency-key": "gm-transfer" },
        payload: { expectedActorUpdatedAt: store.state.actors.find((candidate) => candidate.id === source.id)!.updatedAt, recipientActorId: recipient.id, expectedRecipientUpdatedAt: recipient.updatedAt },
      });
      expect(transfer.statusCode).toBe(200);
      expect(transfer.json()).toMatchObject({ awardedTo: "recipient", actor: { data: { heroicInspiration: true } }, recipient: { id: recipient.id, data: { heroicInspiration: true } } });

      const ineligible = await app.inject({
        method: "POST",
        url: `${actorPath(source)}/heroic-inspiration/grant`,
        headers: { ...gm, "idempotency-key": "gm-ineligible-transfer" },
        payload: { expectedActorUpdatedAt: store.state.actors.find((candidate) => candidate.id === source.id)!.updatedAt, recipientActorId: alreadyHolding.id, expectedRecipientUpdatedAt: alreadyHolding.updatedAt },
      });
      expect(ineligible.statusCode).toBe(409);
      expect(store.state.auditLogs.filter((log) => log.action === "system.actor.heroicInspiration.grant")).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it("spends once, links old and mandatory new results, verifies recorded replay consistency, and replays idempotently", async () => {
    const store = new MemoryStateStore();
    const actor = hero("act_inspiration_reroll");
    store.state.actors.push(actor);
    const app = await buildApp({ store });

    try {
      const rolled = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/roll`,
        headers: player,
        payload: { rollId: "ability-strength", visibility: "public", expectedUpdatedAt: actor.updatedAt },
      });
      expect(rolled.statusCode).toBe(200);
      const original = rolled.json().roll;
      expect(original.actorId).toBe(actor.id);

      const grant = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/grant`,
        headers: { ...gm, "idempotency-key": "grant-before-reroll" },
        payload: { expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(grant.statusCode).toBe(200);
      const expectedActorUpdatedAt = grant.json().actor.updatedAt;
      const rerollRequest = {
        originalRollId: original.id,
        selectedTermIndex: 0,
        selectedResultIndex: 0,
        expectedActorUpdatedAt,
      };
      const rerolled = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/reroll`,
        headers: { ...player, "idempotency-key": "heroic-reroll-once" },
        payload: rerollRequest,
      });
      expect(rerolled.statusCode).toBe(200);
      const result = rerolled.json();
      expect(result).toMatchObject({
        mustUseNewRoll: true,
        actor: { data: { heroicInspiration: false } },
        originalRoll: { id: original.id, heroicInspiration: { kind: "original", rerollRollId: result.reroll.id } },
        reroll: { actorId: actor.id, formula: original.formula, visibility: "public", heroicInspiration: { kind: "reroll", originalRollId: original.id } },
      });
      expect(result.chat.body).toContain("new required result");
      expect(store.state.auditLogs.at(-1)).toMatchObject({ action: "system.actor.heroicInspiration.reroll", targetId: actor.id, after: { requiredResult: true } });

      const verified = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/rolls/${result.reroll.id}/verify`, headers: player });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ verified: true, rollId: result.reroll.id });

      const replay = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/reroll`,
        headers: { ...player, "idempotency-key": "heroic-reroll-once" },
        payload: rerollRequest,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().reroll.id).toBe(result.reroll.id);
      expect(store.state.rolls.filter((candidate) => candidate.heroicInspiration?.kind === "reroll")).toHaveLength(1);

      const spentAgain = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/reroll`,
        headers: { ...player, "idempotency-key": "heroic-reroll-twice" },
        payload: { ...rerollRequest, expectedActorUpdatedAt: result.actor.updatedAt },
      });
      expect(spentAgain.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  it("rejects stale and non-immediate rolls and keeps GM-only linked history private", async () => {
    const store = new MemoryStateStore();
    const actor = hero("act_inspiration_timing", "usr_demo_gm", true);
    store.state.actors.push(actor);
    const app = await buildApp({ store });

    try {
      const first = await app.inject({ method: "POST", url: `${actorPath(actor)}/roll`, headers: gm, payload: { rollId: "ability-strength", visibility: "gm_only", expectedUpdatedAt: actor.updatedAt } });
      const second = await app.inject({ method: "POST", url: `${actorPath(actor)}/roll`, headers: gm, payload: { rollId: "ability-strength", visibility: "gm_only", expectedUpdatedAt: actor.updatedAt } });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const tooLate = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/reroll`,
        headers: { ...gm, "idempotency-key": "heroic-too-late" },
        payload: { originalRollId: first.json().roll.id, selectedTermIndex: 0, selectedResultIndex: 0, expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(tooLate.statusCode).toBe(409);
      expect(tooLate.json().message).toContain("immediately");

      const stale = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/reroll`,
        headers: { ...gm, "idempotency-key": "heroic-stale" },
        payload: { originalRollId: second.json().roll.id, selectedTermIndex: 0, selectedResultIndex: 0, expectedActorUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe("stale_write");

      const rerolled = await app.inject({
        method: "POST",
        url: `${actorPath(actor)}/heroic-inspiration/reroll`,
        headers: { ...gm, "idempotency-key": "heroic-private" },
        payload: { originalRollId: second.json().roll.id, selectedTermIndex: 0, selectedResultIndex: 0, expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(rerolled.statusCode).toBe(200);
      expect(rerolled.json().reroll.visibility).toBe("gm_only");

      const playerHistory = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/rolls", headers: player });
      expect(playerHistory.statusCode).toBe(200);
      expect(playerHistory.json().map((roll: { id: string }) => roll.id)).not.toContain(rerolled.json().reroll.id);
    } finally {
      await app.close();
    }
  });
});
