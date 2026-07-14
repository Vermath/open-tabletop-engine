import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function stateWithoutCompatibilityAudit(store: MemoryStateStore) {
  return {
    ...structuredClone(store.state),
    auditLogs: structuredClone(store.state.auditLogs.filter((log) => log.action !== "auth.legacyUserHeader"))
  };
}

async function createPrivateFighter(app: Awaited<ReturnType<typeof buildApp>>, ownerUserId = "usr_demo_gm") {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
    headers: { ...gmHeaders, "idempotency-key": `rules-preview-create-${ownerUserId}` },
    payload: {
      creationMode: "level-one-srd",
      templateId: "fighter",
      name: "Preview API Fighter",
      ownerUserId,
      backgroundId: "soldier",
      speciesId: "orc",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "perception"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: [],
      classEquipmentPackageId: "equipment-b",
      backgroundEquipmentPackageId: "equipment-a",
      backgroundToolProficiencyChoice: "dice-set",
      weaponMasteryChoices: ["greatsword", "longbow", "flail"],
      fightingStyle: "defense"
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json().actor as { id: string; updatedAt: string; data: Record<string, unknown> };
}

describe("D&D validation and rules preview API", () => {
  it("allows private readers and never persists a validation or preview proposal", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const before = stateWithoutCompatibilityAudit(store);

      const validation = await app.inject({
        method: "GET",
        url: `${route}/rules-validation`,
        headers: gmHeaders
      });
      expect(validation.statusCode).toBe(200);
      expect(validation.json().actor).toEqual(expect.objectContaining({
        entityKind: "actor",
        entityId: fighter.id,
        systemId: "dnd-5e-srd",
        rulesVersion: "SRD 5.2.1",
        schemaVersion: "1.0.0",
        valid: true
      }));

      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: gmHeaders,
        payload: { operation: "advancement", hitPointMode: "fixed" }
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({
        operation: "advancement",
        actorId: fighter.id,
        status: "ready",
        serverRolls: [],
        proposedData: expect.objectContaining({ level: 2 })
      }));
      expect(preview.json().changes).toContainEqual(expect.objectContaining({ path: "/level", operation: "replace", before: 1, after: 2 }));

      expect(stateWithoutCompatibilityAudit(store)).toEqual(before);
      expect(store.state.actors.find((actor) => actor.id === fighter.id)?.data.level).toBe(1);
      expect(store.state.auditLogs.some((log) => log.action.includes("rules.preview") || log.action.includes("rules.validation"))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("returns deterministic reversible repair candidates without changing actor or homebrew data", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const storedActor = store.state.actors.find((actor) => actor.id === fighter.id)!;
      const hitPoints = storedActor.data.hp as { current: number; max: number };
      storedActor.data.hp = { ...hitPoints, current: hitPoints.max + 3 };
      storedActor.data.homebrewSentinel = { nested: ["preserve-me"] };
      const before = stateWithoutCompatibilityAudit(store);
      const url = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}/rules-validation`;

      const response = await app.inject({ method: "GET", url, headers: gmHeaders });
      expect(response.statusCode).toBe(200);
      expect(response.json().repairPreview.actor).toEqual(expect.objectContaining({
        entityKind: "actor",
        entityId: fighter.id,
        candidates: expect.arrayContaining([
          expect.objectContaining({
            path: "/data/hp/current",
            operation: "replace",
            before: hitPoints.max + 3,
            after: hitPoints.max,
            inverse: expect.objectContaining({
              path: "/data/hp/current",
              operation: "replace",
              after: hitPoints.max + 3
            })
          })
        ]),
        proposedEntity: expect.objectContaining({
          data: expect.objectContaining({ homebrewSentinel: { nested: ["preserve-me"] } })
        })
      }));

      const repeated = await app.inject({ method: "GET", url, headers: gmHeaders });
      expect(repeated.statusCode).toBe(200);
      expect(repeated.json()).toEqual(response.json());
      expect(stateWithoutCompatibilityAudit(store)).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it("denies users who can read the campaign but cannot read this actor's private data", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const before = stateWithoutCompatibilityAudit(store);
      const validation = await app.inject({ method: "GET", url: `${route}/rules-validation`, headers: playerHeaders });
      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: playerHeaders,
        payload: { operation: "rest", restType: "long" }
      });

      expect(validation.statusCode).toBe(403);
      expect(validation.json().message).toBe("Missing permission: actor.readPrivate");
      expect(preview.statusCode).toBe(403);
      expect(preview.json().message).toBe("Missing permission: actor.readPrivate");
      expect(stateWithoutCompatibilityAudit(store)).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it("rejects malformed nested preview bodies without state mutation or a server error", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}/rules-preview`;
      const before = stateWithoutCompatibilityAudit(store);
      const malformed = [
        { operation: "advancement", hitPointMode: "fixed", className: 42 },
        { operation: "rest", restType: "short", hitDice: { className: "Fighter" } },
        { operation: "typed-damage", amount: 4, damageType: 42 }
      ];

      for (const payload of malformed) {
        const response = await app.inject({ method: "POST", url: route, headers: gmHeaders, payload });
        expect(response.statusCode).toBe(400);
        expect(response.json().message).toEqual(expect.any(String));
      }
      expect(stateWithoutCompatibilityAudit(store)).toEqual(before);
      expect(store.state.actors.find((actor) => actor.id === fighter.id)?.data.level).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("commits the exact durable prepared advancement and replays retries without rerolling", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const previewKey = "advancement-preview:prepared-roll";
      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "roll", prepare: true }
      });

      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({
        status: "ready",
        proposedData: expect.objectContaining({ level: 2 }),
        preparation: expect.objectContaining({
          idempotencyKey: previewKey,
          actorUpdatedAt: fighter.updatedAt,
          request: expect.objectContaining({ operation: "advancement", hitPointMode: "roll", hitPointRoll: expect.any(Number) }),
          advancementRoll: expect.objectContaining({ total: expect.any(Number) })
        })
      }));
      expect(store.state.idempotencyRecords.some((record) => record.key === previewKey)).toBe(true);

      const commitHeaders = { ...gmHeaders, "idempotency-key": "advancement-commit:prepared-roll" };
      const commitPayload = { expectedUpdatedAt: fighter.updatedAt, preparedPreviewKey: previewKey };
      const committed = await app.inject({ method: "POST", url: `${route}/advance`, headers: commitHeaders, payload: commitPayload });
      expect(committed.statusCode).toBe(200);
      expect(committed.json().actor.data).toEqual(preview.json().proposedData);
      expect(committed.json().advancementRoll.total).toBe(preview.json().preparation.advancementRoll.total);

      const replay = await app.inject({ method: "POST", url: `${route}/advance`, headers: commitHeaders, payload: commitPayload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(committed.json());
      expect(store.state.actors.find((actor) => actor.id === fighter.id)?.data.level).toBe(2);
    } finally {
      await app.close();
    }
  });

  it("rejects a prepared advancement when the actor changed after review", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const previewKey = "advancement-preview:stale";
      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "advancement", optionId: "level-up", hitPointMode: "fixed", prepare: true }
      });
      expect(preview.statusCode).toBe(200);

      const actor = store.state.actors.find((candidate) => candidate.id === fighter.id)!;
      actor.updatedAt = new Date(Date.parse(actor.updatedAt) + 1_000).toISOString();
      const stale = await app.inject({
        method: "POST",
        url: `${route}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "advancement-commit:stale" },
        payload: { expectedUpdatedAt: fighter.updatedAt, preparedPreviewKey: previewKey }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        error: "conflict",
        code: "stale_write",
        resourceType: "actor",
        resourceId: fighter.id,
        expectedUpdatedAt: fighter.updatedAt,
        currentUpdatedAt: actor.updatedAt
      }));
      expect(actor.data.level).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("commits the exact durable prepared short rest and never trusts a client Hit Die total", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const storedFighter = store.state.actors.find((actor) => actor.id === fighter.id)!;
      storedFighter.data = {
        ...storedFighter.data,
        hp: { ...(storedFighter.data.hp as Record<string, unknown>), current: 1 }
      };
      store.save();
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const previewKey = "rest-preview:prepared-hit-die";
      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "rest", restType: "short", hitDice: [{ className: "Fighter", roll: 999 }], prepare: true }
      });

      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({
        operation: "rest",
        status: "ready",
        serverRolls: [],
        proposedData: expect.objectContaining({ hp: expect.objectContaining({ current: expect.any(Number) }) }),
        preparation: expect.objectContaining({
          idempotencyKey: previewKey,
          actorUpdatedAt: fighter.updatedAt,
          request: expect.objectContaining({
            operation: "rest",
            restType: "short",
            hitDice: [expect.objectContaining({ className: "Fighter", roll: expect.any(Number) })]
          })
        })
      }));
      const preparedRoll = preview.json().preparation.request.hitDice[0].roll as number;
      expect(preparedRoll).toBeGreaterThanOrEqual(1);
      expect(preparedRoll).toBeLessThanOrEqual(10);
      expect(preparedRoll).not.toBe(999);
      expect(store.state.idempotencyRecords.some((record) => record.key === previewKey)).toBe(true);

      const previewReplay = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "rest", restType: "short", hitDice: [{ className: "Fighter", roll: 999 }], prepare: true }
      });
      expect(previewReplay.statusCode).toBe(200);
      expect(previewReplay.headers["idempotency-replayed"]).toBe("true");
      expect(previewReplay.json()).toEqual(preview.json());

      const commitHeaders = { ...gmHeaders, "idempotency-key": "rest-commit:prepared-hit-die" };
      const commitPayload = { expectedUpdatedAt: fighter.updatedAt, preparedPreviewKey: previewKey };
      const committed = await app.inject({ method: "POST", url: `${route}/rest`, headers: commitHeaders, payload: commitPayload });
      expect(committed.statusCode).toBe(200);
      expect(committed.json().actor.data).toEqual(preview.json().proposedData);
      expect(committed.json().rest.recovered).toEqual(preview.json().details.recovered);

      const replay = await app.inject({ method: "POST", url: `${route}/rest`, headers: commitHeaders, payload: commitPayload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(committed.json());
      expect(store.state.actors.find((actor) => actor.id === fighter.id)?.data).toEqual(preview.json().proposedData);
    } finally {
      await app.close();
    }
  });

  it("binds prepared rests to the preparing authorization and actor revision", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app, "usr_demo_player");
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const previewKey = "rest-preview:authorization-and-revision";
      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "rest", restType: "long", prepare: true }
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().status).toBe("ready");

      const wrongAuthorization = await app.inject({
        method: "POST",
        url: `${route}/rest`,
        headers: { ...playerHeaders, "idempotency-key": "rest-commit:wrong-authorization" },
        payload: { expectedUpdatedAt: fighter.updatedAt, preparedPreviewKey: previewKey }
      });
      expect(wrongAuthorization.statusCode).toBe(409);
      expect(wrongAuthorization.json().message).toContain("unavailable or expired");

      const actor = store.state.actors.find((candidate) => candidate.id === fighter.id)!;
      actor.updatedAt = new Date(Date.parse(actor.updatedAt) + 1_000).toISOString();
      const stale = await app.inject({
        method: "POST",
        url: `${route}/rest`,
        headers: { ...gmHeaders, "idempotency-key": "rest-commit:stale" },
        payload: { expectedUpdatedAt: fighter.updatedAt, preparedPreviewKey: previewKey }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        error: "conflict",
        code: "stale_write",
        resourceType: "actor",
        resourceId: fighter.id,
        expectedUpdatedAt: fighter.updatedAt,
        currentUpdatedAt: actor.updatedAt
      }));
    } finally {
      await app.close();
    }
  });

  it("commits the exact prepared long-rest recovery without a server roll", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const fighter = await createPrivateFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === fighter.id)!;
      actor.data = {
        ...actor.data,
        hp: { ...(actor.data.hp as Record<string, unknown>), current: 1 },
        hitDice: { ...(actor.data.hitDice as Record<string, unknown>), current: 0 }
      };
      store.save();
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${fighter.id}`;
      const previewKey = "rest-preview:prepared-long";
      const preview = await app.inject({
        method: "POST",
        url: `${route}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "rest", restType: "long", prepare: true }
      });

      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({
        operation: "rest",
        status: "ready",
        serverRolls: [],
        proposedData: expect.objectContaining({
          hp: expect.objectContaining({ current: expect.any(Number) }),
          hitDice: expect.objectContaining({ current: expect.any(Number) })
        })
      }));
      const committed = await app.inject({
        method: "POST",
        url: `${route}/rest`,
        headers: { ...gmHeaders, "idempotency-key": "rest-commit:prepared-long" },
        payload: { expectedUpdatedAt: fighter.updatedAt, preparedPreviewKey: previewKey }
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json().actor.data).toEqual(preview.json().proposedData);
      expect(committed.json().rest.restType).toBe("long");
      expect(committed.json().rest.recovered).toEqual(preview.json().details.recovered);
    } finally {
      await app.close();
    }
  });
});
