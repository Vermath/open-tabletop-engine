import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState, type CampaignArchive, type EngineState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { assetStorageKey } from "./asset-storage.js";
import { SqliteStateStore } from "./sqlite-store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

describe("P0 rules-safe core loop recovery", () => {
  it("preserves advanced and rested D&D state, combat, and a large asset through SQLite restart and archive recovery", async () => {
    const root = mkdtempSync(join(tmpdir(), "otte-p0-core-loop-"));
    const sourceDatabasePath = join(root, "source", "opentabletop.sqlite");
    const sourceUploadDir = join(root, "source", "uploads");
    const targetDatabasePath = join(root, "target", "opentabletop.sqlite");
    const targetUploadDir = join(root, "target", "uploads");
    const assetBytes = deterministicPngBytes(1024 * 1024 + 257);

    try {
      const created = await createPersistedCoreLoop(sourceDatabasePath, sourceUploadDir, assetBytes);
      const archive = await reopenAndExportCoreLoop(sourceDatabasePath, sourceUploadDir, assetBytes, created);
      await importReopenAndVerifyCoreLoop(targetDatabasePath, targetUploadDir, assetBytes, archive, created);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

interface CoreLoopIds {
  actorId: string;
  combatId: string;
  assetId: string;
  attunedItemId: string;
  effectItemId: string;
}

interface PersistedCoreLoop extends CoreLoopIds {
  snapshot: ReturnType<typeof coreLoopSnapshot>;
  snapshotChecksum: string;
}

async function createPersistedCoreLoop(
  databasePath: string,
  uploadDir: string,
  assetBytes: Buffer
): Promise<PersistedCoreLoop> {
  const store = new SqliteStateStore(databasePath, { seedDemo: true });
  const app = await buildApp({ store, uploadDir });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
      headers: { ...authHeaders, "idempotency-key": "p0-core-loop-create-character" },
      payload: { templateId: "fighter", name: "Recovery Fighter", ownerUserId: "usr_demo_gm" }
    });
    expect(created.statusCode).toBe(200);
    const actorId = created.json().actor.id as string;

    const advanced = await preparedAdvancement(app, actorId, created.json().actor.updatedAt, {
      optionId: "level-up",
      hitPointMode: "fixed",
      weaponMasteryChoices: ["greatsword", "longbow", "flail"]
    }, "p0-core-loop-advance");
    expect(advanced.statusCode).toBe(200);
    expect(advanced.json().actor.data).toEqual(expect.objectContaining({ level: 2 }));

    const compendiumRoute = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/compendium`;
    const cloak = await app.inject({
      method: "POST",
      url: compendiumRoute,
      headers: { ...authHeaders, "idempotency-key": "p0-core-loop-cloak" },
      payload: { entryId: "cloak-of-protection", expectedUpdatedAt: advanced.json().actor.updatedAt }
    });
    expect(cloak.statusCode).toBe(200);
    expect(cloak.json().item.data).toEqual(expect.objectContaining({ requiresAttunement: true }));
    const attunedItemId = cloak.json().item.id as string;

    const attuned = await app.inject({
      method: "POST",
      url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/attunement`,
      headers: { ...authHeaders, "idempotency-key": "p0-core-loop-attunement" },
      payload: { itemId: attunedItemId, attuned: true, expectedUpdatedAt: cloak.json().actor.updatedAt }
    });
    expect(attuned.statusCode).toBe(200);
    expect(attuned.json().attunement.activeAttunedItemIds).toContain(attunedItemId);

    const web = await app.inject({
      method: "POST",
      url: compendiumRoute,
      headers: { ...authHeaders, "idempotency-key": "p0-core-loop-web" },
      payload: { entryId: "web", expectedUpdatedAt: attuned.json().actor.updatedAt }
    });
    expect(web.statusCode).toBe(200);
    const effectItemId = web.json().item.id as string;

    const appliedEffect = await preparedAction(app, actorId, web.json().actor.updatedAt, {
      rollId: `spell-${effectItemId}-effect`,
      applyEffect: true,
      targetActorId: actorId,
      saveOutcomes: { [actorId]: "failure" }
    }, "p0-core-loop-web-effect");
    expect(appliedEffect.statusCode).toBe(200);
    expect(appliedEffect.json().effects).toContainEqual(expect.objectContaining({
      type: "condition",
      targetActorId: actorId,
      conditionId: "restrained"
    }));
    const concentratingActor = requiredRecord(store.state.actors, actorId, "actor");
    expect((concentratingActor.data.rulesEngine as { concentration?: unknown }).concentration).toEqual(expect.objectContaining({ sourceActorId: actorId }));

    concentratingActor.data = {
      ...concentratingActor.data,
      temporaryHitPoints: 5,
      resistances: ["fire"]
    };
    concentratingActor.updatedAt = new Date(Date.parse(concentratingActor.updatedAt) + 1).toISOString();
    store.save();
    const blockedDamage = await app.inject({
      method: "POST",
      url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/rules-preview`,
      headers: { ...authHeaders, "idempotency-key": "p0-core-loop-concentration-damage-preview" },
      payload: { operation: "typed-damage", prepare: true, amount: 14, damageType: "fire" }
    });
    expect(blockedDamage.statusCode).toBe(200);
    expect(blockedDamage.json()).toEqual(expect.objectContaining({
      status: "blocked",
      blockers: expect.arrayContaining([expect.objectContaining({ code: "rules.save_required" })])
    }));
    expect(blockedDamage.json().preparation).toBeUndefined();

    const endedConcentration = await preparedConcentrationEnd(app, actorId, "P0 exact cleanup", "p0-core-loop-concentration-end");
    expect(endedConcentration.statusCode).toBe(200);
    expect(endedConcentration.json()).toEqual(expect.objectContaining({ concentrationEnded: true, rulesMutationId: expect.any(String), undo: expect.any(Object) }));
    const actorBeforeDamage = requiredRecord(store.state.actors, actorId, "actor");
    expect((actorBeforeDamage.data.rulesEngine as { concentration?: unknown }).concentration).toBeUndefined();
    expect((actorBeforeDamage.data.rulesEngine as { activeEffects?: unknown[] }).activeEffects ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ conditionIds: ["restrained"] })]));
    const hpBeforeDamage = (actorBeforeDamage.data.hp as { current: number; max: number }).current;
    expect(actorBeforeDamage.data).toEqual(expect.objectContaining({ temporaryHitPoints: 5, resistances: ["fire"] }));

    const damaged = await preparedTypedDamage(app, actorId, { amount: 14, damageType: "fire" }, "p0-core-loop-typed-damage");
    expect(damaged.statusCode).toBe(200);
    expect(damaged.json().previews[0].preview.details.effects).toEqual([expect.objectContaining({
      type: "damage",
      damageType: "fire",
      amount: 7,
      resistance: ["fire"],
      before: hpBeforeDamage,
      after: hpBeforeDamage - 2
    })]);

    const woundedActor = requiredRecord(store.state.actors, actorId, "actor");
    const hpAfterDamage = (woundedActor.data.hp as { current: number; max: number }).current;
    const hitDiceBeforeRest = woundedActor.data.hitDice as { current: number; max: number; size: string };
    expect(hpAfterDamage).toBe(hpBeforeDamage - 2);
    expect(woundedActor.data).toEqual(expect.objectContaining({ temporaryHitPoints: 0, resistances: ["fire"] }));
    expect((woundedActor.data.rulesEngine as { attunedItemIds?: string[] }).attunedItemIds).toContain(attunedItemId);

    const rested = await preparedRest(app, actorId, woundedActor.updatedAt, { restType: "short", hitDice: [{}] }, "p0-core-loop-rest");
    expect(rested.statusCode).toBe(200);
    expect(rested.json().rest.recovered).toEqual(expect.objectContaining({ hitDiceSpent: 1 }));
    expect(rested.json().actor.data.hp.current).toBeGreaterThan(hpAfterDamage);
    expect(rested.json().actor.data.hitDice.current).toBe(hitDiceBeforeRest.current - 1);
    expect(rested.json().actor.data).toEqual(expect.objectContaining({ temporaryHitPoints: 0, resistances: ["fire"] }));
    expect(rested.json().actor.data.rulesEngine.concentration).toBeUndefined();

    const started = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/combats/start",
      headers: { ...authHeaders, "idempotency-key": "p0-core-loop-combat-start" },
      payload: {
        expectedUpdatedAt: requiredRecord(store.state.campaigns, "camp_demo", "campaign").updatedAt,
        sceneId: "scn_vault_entry",
        participants: [{ tokenId: "tok_valen", initiativeMode: "manual", initiative: 17 }]
      }
    });
    expect(started.statusCode).toBe(200);
    expect(started.json().combat).toEqual(
      expect.objectContaining({
        active: true,
        round: 1,
        turnIndex: 0,
        combatants: [expect.objectContaining({ tokenId: "tok_valen", initiative: 17 })]
      })
    );
    const combatId = started.json().combat.id as string;

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload",
      headers: {
        ...authHeaders,
        "idempotency-key": "p0-core-loop-upload-asset",
        "content-type": "image/png",
        "x-asset-name": encodeURIComponent("P0 Recovery Map.png")
      },
      payload: assetBytes
    });
    expect(uploaded.statusCode).toBe(200);
    const assetId = uploaded.json().asset.id as string;
    expect(uploaded.json().asset).toEqual(
      expect.objectContaining({
        sizeBytes: assetBytes.length,
        checksum: checksum(assetBytes)
      })
    );

    store.flush();
    const ids = { actorId, combatId, assetId, attunedItemId, effectItemId };
    const snapshot = coreLoopSnapshot(store.state, ids);
    expect(checksum(readFileSync(join(uploadDir, assetStorageKey(snapshot.asset))))).toBe(checksum(assetBytes));
    return { ...ids, snapshot, snapshotChecksum: checksum(canonicalJsonBytes(snapshot)) };
  } finally {
    await app.close();
    store.close();
  }
}

async function reopenAndExportCoreLoop(
  databasePath: string,
  uploadDir: string,
  assetBytes: Buffer,
  expected: PersistedCoreLoop
): Promise<CampaignArchive> {
  const store = new SqliteStateStore(databasePath, { seedDemo: false });
  const app = await buildApp({ store, uploadDir });

  try {
    const reopenedSnapshot = coreLoopSnapshot(store.state, expected);
    expect(reopenedSnapshot).toEqual(expected.snapshot);
    expect(checksum(canonicalJsonBytes(reopenedSnapshot))).toBe(expected.snapshotChecksum);
    expect(reopenedSnapshot.actor.data).toEqual(expect.objectContaining({ temporaryHitPoints: 0, resistances: ["fire"] }));
    expect((reopenedSnapshot.actor.data.rulesEngine as { concentration?: unknown }).concentration).toBeUndefined();
    expect(checksum(readFileSync(join(uploadDir, assetStorageKey(reopenedSnapshot.asset))))).toBe(checksum(assetBytes));

    const exported = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/export",
      headers: authHeaders
    });
    expect(exported.statusCode).toBe(200);
    expect(Buffer.byteLength(exported.body, "utf8")).toBeGreaterThan(assetBytes.length);
    const archive = exported.json() as CampaignArchive;
    const embeddedAsset = archive.files?.find((file) => file.assetId === expected.assetId);
    expect(embeddedAsset).toEqual(
      expect.objectContaining({
        assetId: expected.assetId,
        sizeBytes: assetBytes.length,
        checksum: checksum(assetBytes),
        encoding: "base64"
      })
    );
    expect(Buffer.from(embeddedAsset!.data, "base64")).toEqual(assetBytes);
    return archive;
  } finally {
    await app.close();
    store.close();
  }
}

async function importReopenAndVerifyCoreLoop(
  databasePath: string,
  uploadDir: string,
  assetBytes: Buffer,
  archive: CampaignArchive,
  expected: PersistedCoreLoop
): Promise<void> {
  const initialState = emptyState();
  initialState.users.push({
    id: "usr_demo_gm",
    displayName: "Recovery GM",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z"
  });
  const importStore = new SqliteStateStore(databasePath, { seedDemo: false });
  importStore.replace(initialState);
  const importApp = await buildApp({ store: importStore, uploadDir });

  try {
    const imported = await importApp.inject({
      method: "POST",
      url: "/api/v1/import/campaign",
      headers: authHeaders,
      payload: archive
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toEqual(
      expect.objectContaining({
        importedCampaignIds: ["camp_demo"],
        assetFiles: 1
      })
    );
    importStore.flush();
  } finally {
    await importApp.close();
    importStore.close();
  }

  const reopenedStore = new SqliteStateStore(databasePath, { seedDemo: false });
  const reopenedApp = await buildApp({ store: reopenedStore, uploadDir });
  try {
    const restoredSnapshot = coreLoopSnapshot(reopenedStore.state, expected);
    expect(restoredSnapshot).toEqual(expected.snapshot);
    expect(checksum(canonicalJsonBytes(restoredSnapshot))).toBe(expected.snapshotChecksum);
    expect(restoredSnapshot.actor.data).toEqual(expect.objectContaining({ temporaryHitPoints: 0, resistances: ["fire"] }));
    expect((restoredSnapshot.actor.data.rulesEngine as { concentration?: unknown }).concentration).toBeUndefined();
    expect(checksum(readFileSync(join(uploadDir, assetStorageKey(restoredSnapshot.asset))))).toBe(checksum(assetBytes));

    const sheet = await reopenedApp.inject({
      method: "GET",
      url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${expected.actorId}/sheet`,
      headers: authHeaders
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().data).toEqual(
      expect.objectContaining({
        level: 2,
        hp: expected.snapshot.actor.data.hp,
        hitDice: expected.snapshot.actor.data.hitDice
      })
    );
  } finally {
    await reopenedApp.close();
    reopenedStore.close();
  }
}

async function preparedAdvancement(
  app: Awaited<ReturnType<typeof buildApp>>,
  actorId: string,
  expectedUpdatedAt: string,
  request: Record<string, unknown>,
  key: string
) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}`;
  const preview = await app.inject({
    method: "POST",
    url: `${route}/rules-preview`,
    headers: { ...authHeaders, "idempotency-key": `${key}:preview` },
    payload: { operation: "advancement", prepare: true, ...request }
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({
    method: "POST",
    url: `${route}/advance`,
    headers: { ...authHeaders, "idempotency-key": `${key}:commit` },
    payload: { preparedPreviewKey: preview.json().preparation.preparedPreviewKey, expectedUpdatedAt }
  });
}

async function preparedRest(
  app: Awaited<ReturnType<typeof buildApp>>,
  actorId: string,
  expectedUpdatedAt: string,
  request: Record<string, unknown>,
  key: string
) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}`;
  const preview = await app.inject({
    method: "POST",
    url: `${route}/rules-preview`,
    headers: { ...authHeaders, "idempotency-key": `${key}:preview` },
    payload: { operation: "rest", prepare: true, ...request }
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({
    method: "POST",
    url: `${route}/rest`,
    headers: { ...authHeaders, "idempotency-key": `${key}:commit` },
    payload: { preparedPreviewKey: preview.json().preparation.preparedPreviewKey, expectedUpdatedAt }
  });
}

async function preparedAction(
  app: Awaited<ReturnType<typeof buildApp>>,
  actorId: string,
  expectedUpdatedAt: string,
  request: Record<string, unknown>,
  key: string
) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/roll`;
  const preview = await app.inject({
    method: "POST",
    url: route,
    headers: { ...authHeaders, "idempotency-key": `${key}:preview` },
    payload: { ...request, expectedUpdatedAt, prepare: true, commit: false }
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({
    method: "POST",
    url: route,
    headers: { ...authHeaders, "idempotency-key": `${key}:commit` },
    payload: { preparedPreviewKey: preview.json().preparation.preparedPreviewKey, expectedUpdatedAt }
  });
}

async function preparedConcentrationEnd(
  app: Awaited<ReturnType<typeof buildApp>>,
  actorId: string,
  reason: string,
  key: string
) {
  const route = `/api/v1/actors/${actorId}/concentration/end`;
  const preview = await app.inject({
    method: "POST",
    url: route,
    headers: { ...authHeaders, "idempotency-key": `${key}:preview` },
    payload: { prepare: true, reason }
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({
    method: "POST",
    url: route,
    headers: { ...authHeaders, "idempotency-key": `${key}:commit` },
    payload: {
      preparedPreviewKey: preview.json().preparation.preparedPreviewKey,
      expectedActorUpdatedAt: preview.json().preparation.revisions.actorUpdatedAt,
      expectedCombatUpdatedAt: preview.json().preparation.revisions.combatUpdatedAt,
      reason
    }
  });
}

async function preparedTypedDamage(
  app: Awaited<ReturnType<typeof buildApp>>,
  actorId: string,
  request: { amount: number; damageType: string },
  key: string
) {
  const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}`;
  const preview = await app.inject({
    method: "POST",
    url: `${route}/rules-preview`,
    headers: { ...authHeaders, "idempotency-key": `${key}:preview` },
    payload: { operation: "typed-damage", prepare: true, ...request }
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().status).toBe("ready");
  return app.inject({
    method: "POST",
    url: `${route}/typed-damage/apply`,
    headers: { ...authHeaders, "idempotency-key": `${key}:commit` },
    payload: {
      preparedPreviewKey: preview.json().preparation.preparedPreviewKey,
      expectedActorUpdatedAt: preview.json().preparation.actorUpdatedAt,
      expectedItemUpdatedAt: preview.json().preparation.itemUpdatedAt
    }
  });
}

function coreLoopSnapshot(state: EngineState, ids: CoreLoopIds) {
  return structuredClone({
    actor: requiredRecord(state.actors, ids.actorId, "actor"),
    actorItems: [ids.attunedItemId, ids.effectItemId].map((itemId) => requiredRecord(state.items, itemId, "item")),
    combat: requiredRecord(state.combats, ids.combatId, "combat"),
    asset: requiredRecord(state.assets, ids.assetId, "asset")
  });
}

function requiredRecord<T extends { id: string }>(records: T[], id: string, label: string): T {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Missing ${label} ${id}`);
  return record;
}

function deterministicPngBytes(size: number): Buffer {
  const body = Buffer.alloc(size, 0x5a);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body);
  return body;
}

function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(sortObjectKeys(value)), "utf8");
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortObjectKeys(item)])
  );
}

function checksum(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}
