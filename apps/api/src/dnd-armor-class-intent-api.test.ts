import { makeArchive, type Actor, type CalculationOverride, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const now = "2026-07-15T20:00:00.000Z";

function legacyActor(id: string, armorClass: number, extraData: Record<string, unknown> = {}, type = "character"): Actor {
  return {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_player",
    type,
    name: id,
    data: { class: "Fighter", level: 1, attributes: { strength: 14, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, hp: { current: 10, max: 10 }, armorClass, ...extraData },
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };
}

async function sheet(app: Awaited<ReturnType<typeof buildApp>>, actorId: string) {
  return app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actorId}/sheet`, headers: gmHeaders });
}

describe("D&D Armor Class intent API", () => {
  it("migrates equal, stale, explicit, and monster values once across restart and archive serialization", async () => {
    const store = new MemoryStateStore();
    store.state.actors.push(
      legacyActor("act_ac_equal", 12),
      legacyActor("act_ac_stale", 19),
      legacyActor("act_ac_explicit", 18, { armorClassIntent: { version: 1, mode: "override", source: "house_rule", reason: "Imported campaign defense floor", createdByUserId: "usr_demo_gm" } }),
      legacyActor("act_ac_monster", 17, { attributes: { dexterity: 8 } }, "monster"),
    );

    const first = await buildApp({ store });
    try {
      expect(store.state.actors.find((actor) => actor.id === "act_ac_equal")?.data.armorClass).toBeUndefined();
      expect(store.state.actors.find((actor) => actor.id === "act_ac_stale")?.data).toMatchObject({ armorClassReview: { version: 1, status: "requires-review", legacyStoredValue: 19, derivedValueAtMigration: 12 } });
      expect(store.state.actors.find((actor) => actor.id === "act_ac_explicit")?.data.armorClass).toBeUndefined();
      expect(store.state.actors.find((actor) => actor.id === "act_ac_monster")?.data.armorClass).toBe(17);

      const migratedOverride = store.state.calculationOverrides.find((override) => override.actorId === "act_ac_explicit")!;
      expect(migratedOverride).toMatchObject({ systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1", fieldId: "armor-class", source: "house_rule", baseValue: 12, effectiveValue: 18, reason: "Imported campaign defense floor" });
      expect((await sheet(first, "act_ac_explicit")).json().data).toMatchObject({ armorClass: 18, armorClassDetails: { calculationOverride: true, calculationOverrideReason: "Imported campaign defense floor", calculationOverrideBaseValue: 12 } });
      expect((await sheet(first, "act_ac_stale")).json().data).toMatchObject({ armorClass: 12, armorClassDetails: { requiresReview: true, legacyStoredValue: 19 } });
      expect((await sheet(first, "act_ac_monster")).json().data).toMatchObject({ armorClass: 17, armorClassDetails: { monsterStatBlock: true } });

      const migrationAudits = store.state.auditLogs.filter((entry) => entry.action.startsWith("actor.armorClass.migrate."));
      expect(migrationAudits.map((entry) => entry.action).sort()).toEqual(["actor.armorClass.migrate.derived", "actor.armorClass.migrate.override", "actor.armorClass.migrate.review"]);
      expect(migrationAudits.every((entry) => entry.actorType === "system")).toBe(true);

      const archive = JSON.parse(JSON.stringify(makeArchive(store.state, "camp_demo")));
      expect(archive.data.actors.find((actor: Actor) => actor.id === "act_ac_stale").data.armorClassReview).toMatchObject({ legacyStoredValue: 19 });
      expect(archive.data.calculationOverrides.find((override: CalculationOverride) => override.actorId === "act_ac_explicit")).toMatchObject({ effectiveValue: 18, reason: "Imported campaign defense floor" });

      const auditCount = migrationAudits.length;
      const overrideCount = store.state.calculationOverrides.length;
      await first.close();
      const restarted = await buildApp({ store });
      try {
        expect(store.state.auditLogs.filter((entry) => entry.action.startsWith("actor.armorClass.migrate."))).toHaveLength(auditCount);
        expect(store.state.calculationOverrides).toHaveLength(overrideCount);
        expect((await sheet(restarted, "act_ac_explicit")).json().data.armorClass).toBe(18);
      } finally {
        await restarted.close();
      }
    } finally {
      if (!first.server.listening) await first.close();
    }
  }, 20_000);

  it("keeps create, equip, unequip, and Dexterity edits on the derived path", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: { ...gmHeaders, "idempotency-key": "create-derived-equipment-hero" },
        payload: { templateId: "fighter", ownerUserId: "usr_demo_player", name: "Equipment Hero" },
      });
      expect(created.statusCode).toBe(200);
      const actor = created.json().actor as Actor;
      expect(actor.data.armorClass).toBeUndefined();

      let armor: Item = { id: "itm_derived_leather", campaignId: "camp_demo", systemId: "dnd-5e-srd", actorId: actor.id, type: "equipment", name: "Leather Armor", data: { quantity: 1, equipped: true, armorBase: 11 }, createdAt: now, updatedAt: now };
      store.state.items.push(armor);
      expect((await sheet(app, actor.id)).json().data).toMatchObject({ armorClass: 12, armorClassDetails: { armorName: "Leather Armor" } });

      const unequipped = await app.inject({ method: "PATCH", url: `/api/v1/items/${armor.id}`, headers: { ...playerHeaders, "idempotency-key": "unequip-derived-leather" }, payload: { expectedUpdatedAt: armor.updatedAt, data: { ...armor.data, equipped: false } } });
      expect(unequipped.statusCode).toBe(200);
      armor = unequipped.json() as Item;
      expect((await sheet(app, actor.id)).json().data).toMatchObject({ armorClass: 11, armorClassDetails: { armorName: "Unarmored" } });

      const equipped = await app.inject({ method: "PATCH", url: `/api/v1/items/${armor.id}`, headers: { ...playerHeaders, "idempotency-key": "reequip-derived-leather" }, payload: { expectedUpdatedAt: armor.updatedAt, data: { ...armor.data, equipped: true } } });
      expect(equipped.statusCode).toBe(200);
      expect((await sheet(app, actor.id)).json().data.armorClass).toBe(12);

      const current = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const dexterityEdit = await app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers: { ...gmHeaders, "idempotency-key": "edit-derived-dexterity" }, payload: { expectedUpdatedAt: current.updatedAt, manualOverrideReason: "Reviewed ability edit fixture", data: { ...current.data, attributes: { ...(current.data.attributes as Record<string, unknown>), dexterity: 18 } } } });
      expect(dexterityEdit.statusCode).toBe(200);
      expect((await sheet(app, actor.id)).json().data.armorClass).toBe(15);

      expect(store.state.actors.find((candidate) => candidate.id === actor.id)?.data.armorClass).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("imports explicit intent through T24, enforces permission and raw-patch boundaries, and supports reasoned removal", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const imported = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters/import",
        headers: { ...gmHeaders, "idempotency-key": "import-explicit-ac-intent" },
        payload: { name: "Imported Intent", data: { armorClass: 18, armorClassIntent: { version: 1, mode: "override", source: "gm_manual", reason: "Documented source-sheet ruling" }, attributes: { dexterity: 14 } } },
      });
      expect(imported.statusCode).toBe(200);
      const actor = imported.json().actor as Actor;
      expect(imported.json().sheet.data).toMatchObject({ armorClass: 18, armorClassDetails: { calculationOverride: true, calculationOverrideReason: "Documented source-sheet ruling" } });
      expect(actor.data.armorClass).toBeUndefined();

      const rawPatch = await app.inject({ method: "PATCH", url: `/api/v1/actors/${actor.id}`, headers: { ...gmHeaders, "idempotency-key": "reject-raw-ac-scalar" }, payload: { expectedUpdatedAt: actor.updatedAt, manualOverrideReason: "Do not allow scalar bypass", data: { ...actor.data, armorClass: 30 } } });
      expect(rawPatch.statusCode, rawPatch.body).toBe(409);
      expect(rawPatch.json()).toMatchObject({ code: "calculation_override_route_required", managedRoots: ["armorClass"] });

      const denied = await app.inject({ method: "POST", url: `/api/v1/campaigns/camp_demo/actors/${actor.id}/calculation-overrides`, headers: { ...playerHeaders, "idempotency-key": "player-ac-override" }, payload: { expectedActorUpdatedAt: actor.updatedAt, fieldId: "armor-class", source: "gm_manual", effectiveValue: 21, reason: "Player should not set this" } });
      expect(denied.statusCode).toBe(403);

      const migrated = store.state.calculationOverrides.find((override) => override.actorId === actor.id && !override.clearedAt)!;
      const currentActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const cleared = await app.inject({ method: "POST", url: `/api/v1/calculation-overrides/${migrated.id}/clear`, headers: { ...gmHeaders, "idempotency-key": "clear-imported-ac-override" }, payload: { expectedUpdatedAt: migrated.updatedAt, expectedActorUpdatedAt: currentActor.updatedAt, reason: "Return to equipment-derived AC" } });
      expect(cleared.statusCode).toBe(200);
      expect((await sheet(app, actor.id)).json().data.armorClass).toBe(12);

      const afterClearActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const recreated = await app.inject({ method: "POST", url: `/api/v1/campaigns/camp_demo/actors/${actor.id}/calculation-overrides`, headers: { ...gmHeaders, "idempotency-key": "recreate-ac-override" }, payload: { expectedActorUpdatedAt: afterClearActor.updatedAt, fieldId: "armor-class", source: "house_rule", effectiveValue: 20, reason: "Temporary sanctuary ward" } });
      expect(recreated.statusCode).toBe(201);
      expect((await sheet(app, actor.id)).json().data).toMatchObject({ armorClass: 20, armorClassDetails: { calculationOverrideReason: "Temporary sanctuary ward" } });

      const recreatedOverride = recreated.json() as CalculationOverride;
      const afterCreateActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const removed = await app.inject({ method: "POST", url: `/api/v1/calculation-overrides/${recreatedOverride.id}/clear`, headers: { ...gmHeaders, "idempotency-key": "remove-recreated-ac-override" }, payload: { expectedUpdatedAt: recreatedOverride.updatedAt, expectedActorUpdatedAt: afterCreateActor.updatedAt, reason: "Sanctuary ward expired" } });
      expect(removed.statusCode).toBe(200);
      expect((await sheet(app, actor.id)).json().data.armorClass).toBe(12);

      const explanation = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/calculation-explanation`, headers: gmHeaders });
      expect(explanation.statusCode).toBe(200);
      expect(explanation.json().fields.find((field: { id: string }) => field.id === "armor-class")).toMatchObject({ result: 12, flags: { override: false } });
      expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining(["actor.armorClass.migrate.override", "calculation.override.clear", "calculation.override.create"]));
    } finally {
      await app.close();
    }
  });
});
