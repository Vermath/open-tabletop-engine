import { emptyState, type EngineState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const route = "/api/v1/campaigns/camp_demo/dnd/custom-content";

function conditionDraft(contentVersion = "1.0.0") {
  return {
    kind: "condition",
    name: "Ash Marked",
    summary: "A private campaign condition.",
    sourceName: "Demo campaign",
    sourceVersion: "1",
    contentVersion,
    license: { name: "Private home game", usage: "private_home_game" },
    data: {
      description: "The marked creature leaves a visible trail of ash.",
      effects: [{ name: "Visible trail", description: "Tracking the creature does not require an ability check." }],
      stacking: "refresh",
      defaultDuration: "Until the next Long Rest"
    }
  };
}

describe("D&D custom content builder API", () => {
  it("previews and creates validated private content with replay safety and provenance", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const campaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;
      const beforeCount = store.state.items.length;
      const preview = await app.inject({ method: "POST", url: `${route}/preview`, headers: gmHeaders, payload: conditionDraft() });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        preview: true,
        entry: {
          type: "condition",
          provenance: { sourceKind: "user", systemId: "dnd-5e-srd", license: { usage: "private_home_game" } }
        }
      });
      expect(store.state.items).toHaveLength(beforeCount);

      const payload = { ...conditionDraft(), expectedUpdatedAt: campaign.updatedAt };
      const headers = { ...gmHeaders, "idempotency-key": "custom-content-create-ash-marked" };
      const created = await app.inject({ method: "POST", url: route, headers, payload });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        item: { type: "condition", name: "Ash Marked", data: { customContentKind: "condition", builderSchemaVersion: "1.0.0" } },
        entry: { id: expect.stringMatching(/^campaign-item:/), provenance: { sourceKind: "user", contentVersion: "1.0.0" } }
      });
      const itemId = created.json().item.id as string;
      expect(store.state.items).toHaveLength(beforeCount + 1);

      const replay = await app.inject({ method: "POST", url: route, headers, payload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.items.filter((item) => item.id === itemId)).toHaveLength(1);

      const catalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium?q=ash%20marked",
        headers: gmHeaders
      });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json().entries).toEqual([expect.objectContaining({ id: `campaign-item:${itemId}`, type: "condition" })]);

      const playerCatalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium?q=ash%20marked",
        headers: playerHeaders
      });
      expect(playerCatalog.statusCode).toBe(200);
      expect(playerCatalog.json().entries).toEqual([]);

      const archive = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(archive.statusCode).toBe(200);
      expect(archive.json().data.items.find((item: { id: string }) => item.id === itemId)).toMatchObject({
        data: { compendiumProvenance: { sourceKind: "user", contentVersion: "1.0.0" } }
      });
    } finally {
      await app.close();
    }
  });

  it("enforces permissions, explicit provenance, revision guards, and audited update/delete", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const campaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;
      const forbidden = await app.inject({ method: "POST", url: `${route}/preview`, headers: playerHeaders, payload: conditionDraft() });
      expect(forbidden.statusCode).toBe(403);

      const forged = await app.inject({
        method: "POST",
        url: `${route}/preview`,
        headers: gmHeaders,
        payload: { ...conditionDraft(), license: { name: "SRD", usage: "srd" } }
      });
      expect(forged.statusCode, forged.body).toBe(422);
      expect(forged.json().issues).toContainEqual(expect.objectContaining({ path: "license.usage", code: "reserved_usage" }));

      const missingKey = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "" },
        payload: { ...conditionDraft(), expectedUpdatedAt: campaign.updatedAt }
      });
      expect(missingKey.statusCode).toBe(400);

      const created = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "custom-content-guard-create" },
        payload: { ...conditionDraft(), expectedUpdatedAt: campaign.updatedAt }
      });
      expect(created.statusCode).toBe(201);
      const itemId = created.json().item.id as string;
      const item = store.state.items.find((candidate) => candidate.id === itemId)!;

      const staleUpdate = await app.inject({
        method: "PATCH",
        url: `${route}/${itemId}`,
        headers: { ...gmHeaders, "idempotency-key": "custom-content-stale-update" },
        payload: { ...conditionDraft("1.1.0"), expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }
      });
      expect(staleUpdate.statusCode).toBe(409);
      expect(staleUpdate.json()).toMatchObject({ code: "stale_write", resourceType: "item", resourceId: itemId });
      expect(item.data).toMatchObject({ compendiumProvenance: { contentVersion: "1.0.0" } });

      const updated = await app.inject({
        method: "PATCH",
        url: `${route}/${itemId}`,
        headers: { ...gmHeaders, "idempotency-key": "custom-content-update" },
        payload: { ...conditionDraft("1.1.0"), name: "Ash Marked Revised", expectedUpdatedAt: item.updatedAt }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ item: { id: itemId, name: "Ash Marked Revised" }, entry: { provenance: { contentVersion: "1.1.0" } } });

      const staleDelete = await app.inject({
        method: "DELETE",
        url: `${route}/${itemId}`,
        headers: { ...gmHeaders, "idempotency-key": "custom-content-stale-delete" },
        payload: { expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }
      });
      expect(staleDelete.statusCode).toBe(409);
      expect(store.state.items.some((candidate) => candidate.id === itemId)).toBe(true);

      const deleted = await app.inject({
        method: "DELETE",
        url: `${route}/${itemId}`,
        headers: { ...gmHeaders, "idempotency-key": "custom-content-delete" },
        payload: { expectedUpdatedAt: item.updatedAt }
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ deleted: true, itemId });
      expect(store.state.items.some((candidate) => candidate.id === itemId)).toBe(false);
      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining([
        "dnd.customContent.create",
        "dnd.customContent.update",
        "dnd.customContent.delete"
      ]));
    } finally {
      await app.close();
    }
  });

  it("creates reusable typed monster templates and immutable reviewed variants with exact diffs", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const templateRoute = "/api/v1/campaigns/camp_demo/dnd/monster-templates";
      const variantRoute = "/api/v1/campaigns/camp_demo/dnd/monster-variants";
      const basesRoute = "/api/v1/campaigns/camp_demo/dnd/monster-bases";
      const campaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;

      const forbidden = await app.inject({ method: "GET", url: basesRoute, headers: playerHeaders });
      expect(forbidden.statusCode).toBe(403);

      const templateDraft = {
        name: "Elite defender",
        description: "A reusable campaign template for tougher defensive monsters.",
        overrides: { armorClass: 18, challengeRating: "1", xp: 200 }
      };
      const templatePreview = await app.inject({ method: "POST", url: `${templateRoute}/preview`, headers: gmHeaders, payload: templateDraft });
      expect(templatePreview.statusCode, templatePreview.body).toBe(200);
      expect(templatePreview.json()).toMatchObject({ preview: true, template: { name: "Elite defender", overrides: { armorClass: 18, challengeRating: "1", xp: 200 } } });
      expect(store.state.items.some((item) => item.type === "dnd-monster-template")).toBe(false);

      const templateHeaders = { ...gmHeaders, "idempotency-key": "monster-template-create-elite" };
      const templatePayload = { ...templateDraft, expectedCampaignUpdatedAt: campaign.updatedAt };
      const createdTemplate = await app.inject({ method: "POST", url: templateRoute, headers: templateHeaders, payload: templatePayload });
      expect(createdTemplate.statusCode, createdTemplate.body).toBe(201);
      let template = createdTemplate.json().template as { id: string; version: string; name: string };
      const templateReplay = await app.inject({ method: "POST", url: templateRoute, headers: templateHeaders, payload: templatePayload });
      expect(templateReplay.statusCode).toBe(201);
      expect(templateReplay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.items.filter((item) => item.id === template.id)).toHaveLength(1);

      const staleTemplateUpdate = await app.inject({
        method: "PATCH",
        url: `${templateRoute}/${template.id}`,
        headers: { ...gmHeaders, "idempotency-key": "monster-template-stale-update" },
        payload: { ...templateDraft, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }
      });
      expect(staleTemplateUpdate.statusCode).toBe(409);
      expect(staleTemplateUpdate.json()).toMatchObject({ resourceType: "item", resourceId: template.id, currentUpdatedAt: template.version });

      const updatedTemplate = await app.inject({
        method: "PATCH",
        url: `${templateRoute}/${template.id}`,
        headers: { ...gmHeaders, "idempotency-key": "monster-template-update-elite" },
        payload: { ...templateDraft, description: "A reviewed reusable template for tougher defensive monsters.", expectedUpdatedAt: template.version }
      });
      expect(updatedTemplate.statusCode, updatedTemplate.body).toBe(200);
      expect(updatedTemplate.json()).toMatchObject({ template: { id: template.id, description: "A reviewed reusable template for tougher defensive monsters.", overrides: templateDraft.overrides } });
      expect(updatedTemplate.json().template.version).not.toBe(template.version);
      template = updatedTemplate.json().template;

      const bases = await app.inject({ method: "GET", url: basesRoute, headers: gmHeaders });
      expect(bases.statusCode, bases.body).toBe(200);
      const guard = (bases.json() as Array<{ kind: string; id: string; version: string; data: Record<string, unknown> }>).find((base) => base.kind === "bundled" && base.id === "guard")!;
      expect(guard).toMatchObject({ data: { armorClass: expect.any(Number), hitPoints: expect.any(Number), challengeRating: expect.any(String), xp: expect.any(Number) } });
      const guardBefore = structuredClone(guard);

      const incompleteVariant = {
        name: "Veteran Guard",
        summary: "A tougher campaign guard.",
        sourceName: "Demo campaign",
        sourceVersion: "1",
        contentVersion: "1.0.0",
        license: { name: "Private home game", usage: "private_home_game" },
        base: { kind: "bundled", id: guard.id, version: guard.version },
        template: { id: template.id, version: template.version },
        overrides: { hitPoints: 44 }
      };
      const incomplete = await app.inject({ method: "POST", url: `${variantRoute}/preview`, headers: gmHeaders, payload: { ...incompleteVariant, template: undefined } });
      expect(incomplete.statusCode, incomplete.body).toBe(422);
      expect(incomplete.json().issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "explicit_xp_required" })]));

      const variantDraft = {
        ...incompleteVariant,
        overrides: { hitPoints: 44, challengeRating: "2", xp: 450, languages: ["Common", "Dwarvish"] }
      };
      const preview = await app.inject({ method: "POST", url: `${variantRoute}/preview`, headers: gmHeaders, payload: variantDraft });
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json()).toMatchObject({
        preview: true,
        entry: { type: "monster", data: { armorClass: 18, hitPoints: 44, challengeRating: "2", xp: 450 } },
        variant: { base: { kind: "bundled", id: "guard", version: guard.version }, template: { id: template.id, version: template.version }, overrides: variantDraft.overrides },
        warnings: expect.arrayContaining([expect.objectContaining({ code: "cr_xp_not_inferred" })])
      });
      expect(preview.json().diff).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "data.armorClass", after: 18 }),
        expect.objectContaining({ path: "data.hitPoints", after: 44 }),
        expect.objectContaining({ path: "data.challengeRating", after: "2" }),
        expect.objectContaining({ path: "data.xp", after: 450 })
      ]));

      const currentCampaignRevision = store.state.campaigns.find((item) => item.id === "camp_demo")!.updatedAt;
      const variantHeaders = { ...gmHeaders, "idempotency-key": "monster-variant-create-veteran" };
      const variantPayload = { ...variantDraft, expectedCampaignUpdatedAt: currentCampaignRevision };
      const created = await app.inject({ method: "POST", url: variantRoute, headers: variantHeaders, payload: variantPayload });
      expect(created.statusCode, created.body).toBe(201);
      const variantItemId = created.json().item.id as string;
      const replay = await app.inject({ method: "POST", url: variantRoute, headers: variantHeaders, payload: variantPayload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.items.filter((item) => item.id === variantItemId)).toHaveLength(1);

      const variantBeforeEditAttempt = structuredClone(store.state.items.find((item) => item.id === variantItemId)!);
      const immutableEdit = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaigns/camp_demo/dnd/custom-content/${variantItemId}`,
        headers: { ...gmHeaders, "idempotency-key": "reject-variant-in-place-edit" },
        payload: { ...created.json().draft, name: "Mutated in place", expectedUpdatedAt: variantBeforeEditAttempt.updatedAt }
      });
      expect(immutableEdit.statusCode).toBe(400);
      expect(immutableEdit.json()).toMatchObject({ error: "bad_request", message: expect.stringContaining("immutable snapshots") });
      expect(store.state.items.find((item) => item.id === variantItemId)).toEqual(variantBeforeEditAttempt);

      const basesAfter = await app.inject({ method: "GET", url: basesRoute, headers: gmHeaders });
      const guardAfter = (basesAfter.json() as Array<{ kind: string; id: string }>).find((base) => base.kind === "bundled" && base.id === "guard");
      expect(guardAfter).toEqual(guardBefore);

      const monster = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/monsters",
        headers: { ...gmHeaders, "idempotency-key": "instantiate-veteran-guard" },
        payload: { customMonsterItemId: variantItemId }
      });
      expect(monster.statusCode, monster.body).toBe(200);
      expect(monster.json()).toMatchObject({
        threat: { id: `campaign-item:${variantItemId}`, challengeRating: "2", budget: 450 },
        actor: { type: "monster", name: "Veteran Guard", data: { hp: { current: 44, max: 44 }, armorClass: 18, challengeRating: "2", xp: 450, monster: { variant: { base: { id: "guard" } } } } }
      });

      const archive = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(archive.statusCode).toBe(200);
      expect(archive.json().data.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: template.id, type: "dnd-monster-template", data: expect.objectContaining({ overrides: templateDraft.overrides }) }),
        expect.objectContaining({ id: variantItemId, type: "monster", data: expect.objectContaining({ monsterVariant: expect.objectContaining({ base: expect.objectContaining({ id: "guard", provenance: expect.objectContaining({ sourceKind: "srd" }) }), template: expect.objectContaining({ id: template.id, version: template.version }), overrides: variantDraft.overrides }) }) })
      ]));

      const targetState: EngineState = emptyState();
      targetState.users.push(structuredClone(store.state.users.find((user) => user.id === "usr_demo_gm")!));
      const targetStore = new MemoryStateStore(targetState);
      const targetApp = await buildApp({ store: targetStore });
      try {
        const imported = await targetApp.inject({
          method: "POST",
          url: "/api/v1/import/campaign",
          headers: { ...gmHeaders, "idempotency-key": "monster-variant-archive-roundtrip" },
          payload: archive.json()
        });
        expect(imported.statusCode, imported.body).toBe(200);
        expect(imported.json()).toMatchObject({ importedCampaignIds: ["camp_demo"] });
        expect(targetStore.state.items).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: template.id, type: "dnd-monster-template", data: expect.objectContaining({ overrides: templateDraft.overrides }) }),
          expect.objectContaining({ id: variantItemId, type: "monster", data: expect.objectContaining({ monsterVariant: expect.objectContaining({ base: expect.objectContaining({ id: "guard", version: guard.version }), template: expect.objectContaining({ id: template.id, version: template.version }), overrides: variantDraft.overrides }) }) })
        ]));

        const importedMonster = await targetApp.inject({
          method: "POST",
          url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/monsters",
          headers: { ...gmHeaders, "idempotency-key": "instantiate-imported-veteran-guard" },
          payload: { customMonsterItemId: variantItemId }
        });
        expect(importedMonster.statusCode, importedMonster.body).toBe(200);
        expect(importedMonster.json()).toMatchObject({
          actor: { type: "monster", data: { challengeRating: "2", xp: 450, monster: { variant: { base: { id: "guard" }, template: { id: template.id } } } } },
          sheet: { quickRolls: expect.arrayContaining([
            expect.objectContaining({ id: "monster-spear-attack", formula: "1d20+3" }),
            expect.objectContaining({ id: "monster-spear-damage", formula: "1d6+1" })
          ]) }
        });
        const importedActorId = importedMonster.json().actor.id as string;
        const rollPreview = await targetApp.inject({
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${importedActorId}/roll`,
          headers: { ...gmHeaders, "idempotency-key": "preview-imported-veteran-spear" },
          payload: { rollId: "monster-spear-attack" }
        });
        expect(rollPreview.statusCode, rollPreview.body).toBe(200);
        expect(rollPreview.json()).toMatchObject({ quickRoll: { id: "monster-spear-attack", formula: "1d20+3" }, roll: { formula: "1d20+3" } });
      } finally {
        await targetApp.close();
      }

      const currentCampaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;
      const disposable = await app.inject({
        method: "POST",
        url: templateRoute,
        headers: { ...gmHeaders, "idempotency-key": "monster-template-create-disposable" },
        payload: { name: "Disposable template", description: "Exercises revision-guarded query deletion.", overrides: { languages: ["Common"] }, expectedCampaignUpdatedAt: currentCampaign.updatedAt }
      });
      expect(disposable.statusCode, disposable.body).toBe(201);
      const disposableTemplate = disposable.json().template as { id: string; version: string };
      const deleted = await app.inject({
        method: "DELETE",
        url: `${templateRoute}/${disposableTemplate.id}?expectedUpdatedAt=${encodeURIComponent(disposableTemplate.version)}`,
        headers: { ...gmHeaders, "idempotency-key": "monster-template-delete-disposable" }
      });
      expect(deleted.statusCode, deleted.body).toBe(200);
      expect(deleted.json()).toMatchObject({ deleted: true, templateId: disposableTemplate.id });
      expect(store.state.items.some((item) => item.id === disposableTemplate.id)).toBe(false);
    } finally {
      await app.close();
    }
  }, 15_000);

  it("rejects stale monster base/template revisions without mutating campaign content", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const bases = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/dnd/monster-bases", headers: gmHeaders });
      const guard = (bases.json() as Array<{ kind: string; id: string; version: string }>).find((base) => base.kind === "bundled" && base.id === "guard")!;
      const baseDraft = {
        name: "Stale Guard",
        summary: "Must not be written from stale review state.",
        sourceName: "Demo campaign",
        sourceVersion: "1",
        contentVersion: "1.0.0",
        license: { name: "Private home game", usage: "private_home_game" },
        base: { kind: "bundled", id: guard.id, version: "stale-version" },
        overrides: { languages: ["Common"] }
      };
      const beforeCount = store.state.items.length;
      const staleBase = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/dnd/monster-variants/preview", headers: gmHeaders, payload: baseDraft });
      expect(staleBase.statusCode).toBe(409);
      expect(staleBase.json()).toMatchObject({ code: "stale_base", expectedVersion: "stale-version", currentVersion: guard.version });

      const campaign = store.state.campaigns.find((item) => item.id === "camp_demo")!;
      const template = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/dnd/monster-templates",
        headers: { ...gmHeaders, "idempotency-key": "stale-template-create" },
        payload: { name: "Stale template", description: "Template changed after review.", overrides: { languages: ["Common"] }, expectedCampaignUpdatedAt: campaign.updatedAt }
      });
      expect(template.statusCode).toBe(201);
      const templateRecord = template.json().template as { id: string; version: string };
      const staleTemplate = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/dnd/monster-variants/preview",
        headers: gmHeaders,
        payload: { ...baseDraft, base: { kind: "bundled", id: guard.id, version: guard.version }, template: { id: templateRecord.id, version: "2000-01-01T00:00:00.000Z" } }
      });
      expect(staleTemplate.statusCode).toBe(409);
      expect(staleTemplate.json()).toMatchObject({ code: "stale_template", resourceId: templateRecord.id, currentVersion: templateRecord.version });
      expect(store.state.items).toHaveLength(beforeCount + 1);
    } finally {
      await app.close();
    }
  });
});
