import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { dnd5eSrdNaturalD20FromRollTerms, resolveDnd5eSrdDeathSavingThrowRoll } from "@open-tabletop/system-sdk";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

vi.mock("./fair-dice.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fair-dice.js")>();
  return {
    ...actual,
    // Fair rolls use cryptographic server seeds, so Math.random cannot make
    // this route fixture deterministic. This seed resolves 1d20 to 19.
    rollFormulaWithFairness: (formula: string, options: { clientSeed?: unknown; serverSeed?: string } = {}) =>
      actual.rollFormulaWithFairness(formula, { ...options, serverSeed: "stable" })
  };
});

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };

function dyingCharacter(id: string, data: Record<string, unknown> = {}): Actor {
  return createTimestamped("act", {
    id, campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm",
    type: "character" as const, name: "Dying Hero", permissions: {},
    data: { hp: { current: 0, max: 12 }, conditions: [{ id: "unconscious" }], lifeState: "unconscious", deathSaves: { successes: 0, failures: 0 }, ...data }
  }) satisfies Actor;
}

function rollPath(actorId: string): string {
  return `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/roll`;
}

const deathSaveBody = { rollId: "death-save", consumeResources: false };

describe("death saving throw roll route", () => {
  it("resolves each committed roll into the exact pure-resolver state until a terminal outcome", async () => {
    const store = new MemoryStateStore();
    const hero = dyingCharacter("act_ds_loop");
    const combat = createTimestamped("cmb", {
      id: "cmb_ds_loop", campaignId: "camp_demo", active: true, round: 1, turnIndex: 0,
      combatants: [{ id: "cmbt_ds_loop", tokenId: "tok_ds_loop", actorId: hero.id, name: hero.name, initiative: 12, defeated: false, conditions: ["unconscious"] }]
    }) satisfies Combat;
    store.state.actors.push(hero);
    store.state.combats.push(combat);
    const app = await buildApp({ store });

    try {
      let terminal: string | undefined;
      // Every roll adds at least one counter or revives, so a terminal state
      // arrives within five rolls without any RNG control.
      for (let attempt = 0; attempt < 5 && !terminal; attempt += 1) {
        const before = structuredClone(store.state.actors.find((candidate) => candidate.id === hero.id)!);
        const response = await app.inject({ method: "POST", url: rollPath(hero.id), headers: gm, payload: { ...deathSaveBody, expectedUpdatedAt: before.updatedAt } });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.resolution.deathSave).toBeTruthy();
        const rolled = {
          total: body.roll.total as number,
          ...(dnd5eSrdNaturalD20FromRollTerms(body.roll.terms) !== undefined ? { naturalD20: dnd5eSrdNaturalD20FromRollTerms(body.roll.terms) } : {})
        };
        const expected = resolveDnd5eSrdDeathSavingThrowRoll(before, rolled);
        expect(body.resolution.deathSave).toEqual(expected.deathSave);
        const stored = store.state.actors.find((candidate) => candidate.id === hero.id)!;
        expect(stored.data).toEqual(expected.data);
        // The roll label and chat card carry the outcome so the table sees the
        // consequence with the roll, not just a bare d20 result.
        const storedRoll = store.state.rolls.find((candidate) => candidate.id === body.roll.id)!;
        expect(storedRoll.label).toContain("Death Saving Throw");
        expect(storedRoll.label).toMatch(/success|failure|natural/);
        const chat = store.state.chat[store.state.chat.length - 1]!;
        expect(chat.rollId).toBe(body.roll.id);
        expect(chat.body).toContain("Death Saving Throw");
        expect(chat.body).toMatch(/success|failure|natural/);
        // The active-combat tracker stays synchronized with the actor lifecycle.
        const combatant = store.state.combats.find((candidate) => candidate.id === combat.id)!.combatants[0]!;
        if (expected.deathSave.result === "revived") {
          expect(combatant.deathSaveSuccesses).toBeUndefined();
          expect(combatant.deathSaveFailures).toBeUndefined();
          expect(combatant.defeated).toBe(false);
        } else {
          const persistedCounters = expected.data.deathSaves as { successes: number; failures: number };
          expect(combatant.deathSaveSuccesses).toBe(persistedCounters.successes);
          expect(combatant.deathSaveFailures).toBe(persistedCounters.failures);
          expect(combatant.defeated).toBe(expected.deathSave.result === "dead");
          if (expected.deathSave.result === "stable") {
            expect(combatant).toMatchObject({ deathSaveOutcome: "stable", deathSaveSuccesses: 0, deathSaveFailures: 0 });
          }
          if (expected.deathSave.result === "dead") expect(combatant.deathSaveOutcome).toBe("dead");
        }
        const audit = store.state.auditLogs[store.state.auditLogs.length - 1]!;
        expect(audit).toMatchObject({ action: "system.actor.roll", targetId: hero.id, after: { deathSave: expected.deathSave } });
        // Every transition is undoable through the rules-mutation ledger.
        expect(body.rulesMutationId).toBeTruthy();
        expect(body.undo).toBeTruthy();
        terminal = expected.deathSave.result;
      }
      expect(terminal).toMatch(/^(revived|stable|dead)$/);

      // A terminal creature no longer rolls Death Saving Throws.
      const settled = store.state.actors.find((candidate) => candidate.id === hero.id)!;
      const rejected = await app.inject({ method: "POST", url: rollPath(hero.id), headers: gm, payload: { ...deathSaveBody, expectedUpdatedAt: settled.updatedAt } });
      expect(rejected.statusCode).toBe(409);
      const settledAfter = store.state.actors.find((candidate) => candidate.id === hero.id)!;
      expect(settledAfter.data).toEqual(settled.data);
    } finally {
      await app.close();
    }
  }, 20_000);

  it("persists Stable actor and combatant counters at zero while retaining the terminal roll detail", async () => {
    const store = new MemoryStateStore();
    const hero = dyingCharacter("act_ds_stable_transition", { deathSaves: { successes: 2, failures: 1 } });
    const combat = createTimestamped("cmb", {
      id: "cmb_ds_stable_transition", campaignId: "camp_demo", active: true, round: 1, turnIndex: 0,
      combatants: [{ id: "cmbt_ds_stable_transition", tokenId: "tok_ds_stable_transition", actorId: hero.id, name: hero.name, initiative: 12, defeated: false, conditions: ["unconscious"], deathSaveSuccesses: 2, deathSaveFailures: 1 }]
    }) satisfies Combat;
    store.state.actors.push(hero);
    store.state.combats.push(combat);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "POST", url: rollPath(hero.id), headers: gm, payload: { ...deathSaveBody, expectedUpdatedAt: hero.updatedAt } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.resolution.deathSave).toEqual({ outcome: "success", successes: 3, failures: 1, result: "stable" });
      expect(store.state.actors.find((candidate) => candidate.id === hero.id)!.data).toMatchObject({
        hp: { current: 0, max: 12 },
        deathSaves: { successes: 0, failures: 0 },
        lifeState: "stable",
        defeated: false
      });
      expect(store.state.combats.find((candidate) => candidate.id === combat.id)!.combatants[0]).toMatchObject({
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        deathSaveOutcome: "stable",
        defeated: false
      });
      expect(store.state.chat[store.state.chat.length - 1]!.body).toContain("third success: Stable (3/3 successes, 1/3 failures)");
      expect(store.state.auditLogs[store.state.auditLogs.length - 1]).toMatchObject({
        action: "system.actor.roll",
        after: { deathSave: { outcome: "success", successes: 3, failures: 1, result: "stable" } }
      });
    } finally {
      await app.close();
    }
  });

  it("rejects ineligible actors without rolling and without state changes", async () => {
    const store = new MemoryStateStore();
    const healthy = dyingCharacter("act_ds_healthy", { hp: { current: 8, max: 12 }, conditions: [], lifeState: "conscious" });
    const monster = createTimestamped("act", {
      id: "act_ds_monster", campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm",
      type: "monster" as const, name: "Spared Goblin", permissions: {},
      data: { hp: { current: 0, max: 7 }, conditions: [{ id: "unconscious" }], zeroHpBehavior: "knockout" }
    }) satisfies Actor;
    const stable = dyingCharacter("act_ds_stable", { lifeState: "stable", conditions: [{ id: "unconscious" }, { id: "stable" }], deathSaves: { successes: 0, failures: 0 } });
    const dead = dyingCharacter("act_ds_dead", { lifeState: "dead", conditions: [{ id: "dead" }], deathSaves: { successes: 0, failures: 3 } });
    store.state.actors.push(healthy, monster, stable, dead);
    const app = await buildApp({ store });

    try {
      const rollCount = store.state.rolls.length;
      const chatCount = store.state.chat.length;
      for (const actor of [healthy, monster, stable, dead]) {
        const response = await app.inject({ method: "POST", url: rollPath(actor.id), headers: gm, payload: { ...deathSaveBody, expectedUpdatedAt: actor.updatedAt } });
        expect(response.statusCode).toBe(409);
        expect(store.state.actors.find((candidate) => candidate.id === actor.id)!.data).toEqual(actor.data);
      }
      expect(store.state.rolls.length).toBe(rollCount);
      expect(store.state.chat.length).toBe(chatCount);
    } finally {
      await app.close();
    }
  }, 20_000);

  it("commits in one step: prepare, resource, and effect options are rejected", async () => {
    const store = new MemoryStateStore();
    const hero = dyingCharacter("act_ds_one_step");
    store.state.actors.push(hero);
    const app = await buildApp({ store });

    try {
      for (const payload of [
        { ...deathSaveBody, prepare: true, expectedUpdatedAt: hero.updatedAt },
        { rollId: "death-save", consumeResources: true, expectedUpdatedAt: hero.updatedAt },
        { ...deathSaveBody, applyEffect: true, expectedUpdatedAt: hero.updatedAt }
      ]) {
        const response = await app.inject({ method: "POST", url: rollPath(hero.id), headers: { ...gm, "idempotency-key": `ds-one-step-${JSON.stringify(payload).length}` }, payload });
        expect(response.statusCode).toBe(400);
        expect(response.json().message).toContain("one step");
      }
      expect(store.state.actors.find((candidate) => candidate.id === hero.id)!.data).toEqual(hero.data);
    } finally {
      await app.close();
    }
  });

  it("previews the formula without mutating state or posting a roll", async () => {
    const store = new MemoryStateStore();
    const hero = dyingCharacter("act_ds_preview");
    store.state.actors.push(hero);
    const app = await buildApp({ store });

    try {
      const rollCount = store.state.rolls.length;
      const response = await app.inject({ method: "POST", url: rollPath(hero.id), headers: gm, payload: { ...deathSaveBody, preview: true, expectedUpdatedAt: hero.updatedAt } });
      expect(response.statusCode).toBe(200);
      expect(response.json().quickRoll.id).toBe("death-save");
      expect(store.state.actors.find((candidate) => candidate.id === hero.id)!.data).toEqual(hero.data);
      expect(store.state.rolls.length).toBe(rollCount);
    } finally {
      await app.close();
    }
  });

  it("denies a player who cannot update the dying actor and persists nothing", async () => {
    const store = new MemoryStateStore();
    const hero = dyingCharacter("act_ds_denied");
    hero.permissions = { usr_demo_player: ["actor.readPrivate"] };
    store.state.actors.push(hero);
    const app = await buildApp({ store });

    try {
      const rollCount = store.state.rolls.length;
      const response = await app.inject({ method: "POST", url: rollPath(hero.id), headers: player, payload: { ...deathSaveBody, expectedUpdatedAt: hero.updatedAt } });
      expect(response.statusCode).toBe(403);
      expect(store.state.actors.find((candidate) => candidate.id === hero.id)!.data).toEqual(hero.data);
      expect(store.state.rolls.length).toBe(rollCount);
    } finally {
      await app.close();
    }
  });

  it("keeps exact-revision protection on the commit", async () => {
    const store = new MemoryStateStore();
    const hero = dyingCharacter("act_ds_stale");
    store.state.actors.push(hero);
    const app = await buildApp({ store });

    try {
      const response = await app.inject({ method: "POST", url: rollPath(hero.id), headers: gm, payload: { ...deathSaveBody, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" } });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("stale_write");
      expect(store.state.actors.find((candidate) => candidate.id === hero.id)!.data).toEqual(hero.data);
    } finally {
      await app.close();
    }
  });
});
