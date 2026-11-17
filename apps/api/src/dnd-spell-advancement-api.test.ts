import { emptyState, type Actor, type EngineState, type Item } from "@open-tabletop/core";
import { dnd5eSrdCharacterTemplate, dnd5eSrdCompendium, dnd5eSrdSpellcastingClassProfile } from "@open-tabletop/system-sdk";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const characterRoute = "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters";

const wizardCreation = {
  creationMode: "level-one-srd",
  templateId: "wizard",
  name: "Spell Advancement Wizard",
  ownerUserId: "usr_demo_player",
  backgroundId: "sage",
  speciesId: "elf",
  abilityScoreIncreases: { intelligence: 2, constitution: 1 },
  classSkillProficiencies: ["insight", "investigation"],
  originLanguageChoices: ["common-sign-language", "dwarvish"],
  classLanguageChoices: [],
  elfLineage: "high-elf",
  elfCantrip: "prestidigitation",
  speciesSpellcastingAbility: "intelligence",
  classEquipmentPackageId: "equipment-a",
  backgroundEquipmentPackageId: "equipment-a",
  weaponMasteryChoices: [],
  classCantripChoices: ["fire-bolt", "light", "mage-hand"],
  wizardSpellbookChoices: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield"],
  classPreparedSpellChoices: ["burning-hands", "detect-magic", "magic-missile", "shield"],
  backgroundMagicInitiateCantrips: ["ray-of-frost", "shocking-grasp"],
  backgroundMagicInitiateSpell: "chromatic-orb",
  backgroundMagicInitiateAbility: "intelligence"
};

const clericCreation = {
  creationMode: "level-one-srd",
  templateId: "cleric",
  name: "Spell Advancement Cleric",
  ownerUserId: "usr_demo_player",
  backgroundId: "acolyte",
  speciesId: "dwarf",
  abilityScoreIncreases: { wisdom: 2, intelligence: 1 },
  classSkillProficiencies: ["medicine", "persuasion"],
  originLanguageChoices: ["dwarvish", "elvish"],
  classLanguageChoices: [],
  classEquipmentPackageId: "equipment-a",
  backgroundEquipmentPackageId: "equipment-a",
  classEquipmentChoices: { "holy-symbol": "holy-symbol-amulet" },
  backgroundEquipmentChoices: { "holy-symbol": "holy-symbol-emblem" },
  weaponMasteryChoices: [],
  divineOrder: "protector",
  classCantripChoices: ["guidance", "sacred-flame", "spare-the-dying"],
  classPreparedSpellChoices: ["bless", "command", "cure-wounds", "healing-word"],
  backgroundMagicInitiateCantrips: ["light", "thaumaturgy"],
  backgroundMagicInitiateSpell: "sanctuary",
  backgroundMagicInitiateAbility: "wisdom"
};

function actorSpells(store: MemoryStateStore, actor: Actor): Item[] {
  return store.state.items.filter((item) => item.actorId === actor.id && item.type === "spell");
}

function spellByEntryId(store: MemoryStateStore, actor: Actor, entryId: string): Item | undefined {
  return actorSpells(store, actor).find((item) => item.data.compendiumId === entryId || item.data.compendiumEntryId === entryId);
}

describe("reviewed D&D spell advancement API", () => {
  it("stores omitted mandatory spell choices only as a draft and refuses to commit that preview", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({ method: "POST", url: characterRoute, headers: { ...gmHeaders, "idempotency-key": "spell-adv-required-create" }, payload: { ...clericCreation, name: "Required Spell Choices Cleric" } });
      const actor = created.json().actor as Actor;
      const base = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}`;
      const previewKey = "spell-adv-required-preview";
      const preview = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": previewKey },
        payload: { operation: "advancement", hitPointMode: "fixed", prepare: true }
      });

      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({
        status: "blocked",
        draft: expect.objectContaining({ pendingAdvancement: expect.objectContaining({ status: "draft" }) }),
        blockers: expect.arrayContaining([expect.objectContaining({ path: "/classPreparedSpellChoices", code: "rules.choice_required" })])
      }));
      expect(preview.json().preparation).toBeUndefined();

      const commit = await app.inject({
        method: "POST",
        url: `${base}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-required-commit" },
        payload: { preparedPreviewKey: previewKey, expectedUpdatedAt: actor.updatedAt }
      });
      expect(commit.statusCode).toBe(409);
      expect(commit.json().message).toContain("not ready to commit");
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)?.data.level).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("materializes six spellbook spells and four prepared spells on Fighter to Wizard entry", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const wizardSpellIds = dnd5eSrdCompendium().flatMap((entry) => {
        const classes = Array.isArray(entry.data.classes) ? entry.data.classes : [];
        return entry.type === "spell" && entry.data.level === 1 && classes.some((value) => typeof value === "string" && value.toLowerCase() === "wizard") ? [entry.id] : [];
      }).slice(0, 6);
      const fighter: Actor = {
        id: "act_spell_path_fighter_wizard",
        campaignId: "camp_demo",
        systemId: "dnd-5e-srd",
        ownerUserId: "usr_demo_player",
        type: "character",
        name: "Fighter Wizard Entry",
        data: {
          class: "Fighter",
          level: 1,
          attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 14, wisdom: 10, charisma: 8 },
          hp: { current: 12, max: 12 },
          hitDice: { current: 1, max: 1, size: "d10" }
        },
        permissions: {},
        createdAt: "2026-07-17T00:00:00.000Z",
        updatedAt: "2026-07-17T00:00:00.000Z"
      };
      store.state.actors.push(fighter);
      const base = `/api/v1/campaigns/${fighter.campaignId}/systems/${fighter.systemId}/actors/${fighter.id}`;
      const preview = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-fighter-wizard-preview" },
        payload: {
          operation: "advancement",
          className: "Wizard",
          hitPointMode: "fixed",
          prepare: true,
          wizardSpellbookAdditions: wizardSpellIds,
          classPreparedSpellChoices: wizardSpellIds.slice(0, 4)
        }
      });
      expect(preview.statusCode, preview.body).toBe(200);
      const plan = preview.json();
      expect(plan.status, JSON.stringify(plan.blockers)).toBe("ready");
      expect(plan.details.spellAdvancement).toEqual(expect.objectContaining({ className: "Wizard", classLevel: 1, wizardSpellbookAdditions: wizardSpellIds, preparedSpellCapacity: 4 }));

      const commit = await app.inject({
        method: "POST",
        url: `${base}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-fighter-wizard-commit" },
        payload: { preparedPreviewKey: plan.preparation.preparedPreviewKey, expectedUpdatedAt: plan.preparation.actorUpdatedAt }
      });
      expect(commit.statusCode, commit.body).toBe(200);
      const advanced = commit.json().actor as Actor;
      expect((advanced.data.spellcasting as Record<string, unknown>).spellbookSpells).toEqual(wizardSpellIds);
      expect((advanced.data.spellcasting as Record<string, unknown>).preparedSpellsByClass).toEqual(expect.objectContaining({ Wizard: wizardSpellIds.slice(0, 4) }));
      expect(wizardSpellIds.map((entryId) => spellByEntryId(store, advanced, entryId)).every(Boolean)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("materializes a Cleric's complete canonical prepared list with provenance", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({ method: "POST", url: characterRoute, headers: { ...gmHeaders, "idempotency-key": "spell-adv-cleric-create" }, payload: clericCreation });
      let actor = created.json().actor as Actor;
      const base = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}`;
      const preview = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-cleric-preview" },
        payload: { operation: "advancement", hitPointMode: "fixed", prepare: true, classPreparedSpellChoices: ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt"] }
      });
      expect(preview.statusCode).toBe(200);
      const plan = preview.json();
      expect(plan.status, JSON.stringify(plan.blockers)).toBe("ready");
      expect(plan.details.spellAdvancement).toEqual(expect.objectContaining({ className: "Cleric", classLevel: 2, preparedSpellCapacity: 5, wizardSpellbookAdditions: [] }));
      const commit = await app.inject({
        method: "POST",
        url: `${base}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-cleric-commit" },
        payload: { preparedPreviewKey: plan.preparation.preparedPreviewKey, expectedUpdatedAt: plan.preparation.actorUpdatedAt }
      });
      expect(commit.statusCode, commit.body).toBe(200);
      actor = commit.json().actor as Actor;
      expect(actor.data.spellcasting).toEqual(expect.objectContaining({ preparedSpellCapacity: 5, preparedSpellCapacityLevel: 2, preparedSpells: ["bless", "command", "cure-wounds", "healing-word", "guiding-bolt"] }));
      const guidingBolt = spellByEntryId(store, actor, "guiding-bolt")!;
      expect(guidingBolt.data).toEqual(expect.objectContaining({ prepared: true, classSpell: true, compendiumProvenance: expect.objectContaining({ contentVersion: "5.2.1" }) }));
      expect(guidingBolt.data.spellSources).toContainEqual(expect.objectContaining({ kind: "class", className: "Cleric", selection: "prepared", selectedAtLevel: 2, spellcastingAbility: "wisdom", acquisitionMode: "prepared-long-rest" }));
    } finally {
      await app.close();
    }
  });

  it("atomically learns canonical Wizard spells and fills the prepared list through level 3", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({ method: "POST", url: characterRoute, headers: { ...gmHeaders, "idempotency-key": "spell-adv-create" }, payload: wizardCreation });
      expect(created.statusCode).toBe(200);
      let actor = created.json().actor as Actor;
      const base = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}`;

      const levelTwoPreview = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-preview-2" },
        payload: {
          operation: "advancement",
          optionId: "level-up",
          hitPointMode: "fixed",
          prepare: true,
          wizardSpellbookAdditions: ["disguise-self", "find-familiar"],
          classPreparedSpellChoices: ["alarm", "burning-hands", "charm-person", "magic-missile", "shield"]
        }
      });
      expect(levelTwoPreview.statusCode).toBe(200);
      const levelTwoPlan = levelTwoPreview.json();
      expect(levelTwoPlan.status, JSON.stringify(levelTwoPlan.blockers)).toBe("ready");
      expect(levelTwoPlan.preparation.itemUpdatedAt).toEqual(Object.fromEntries(actorSpells(store, actor).map((item) => [item.id, item.updatedAt])));
      expect(levelTwoPlan.details.spellAdvancement).toEqual(expect.objectContaining({ className: "Wizard", classLevel: 2, maxSpellLevel: 1, preparedSpellCapacity: 5 }));

      const levelTwoCommit = await app.inject({
        method: "POST",
        url: `${base}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-commit-2" },
        payload: { preparedPreviewKey: levelTwoPlan.preparation.preparedPreviewKey, expectedUpdatedAt: levelTwoPlan.preparation.actorUpdatedAt }
      });
      expect(levelTwoCommit.statusCode, levelTwoCommit.body).toBe(200);
      actor = levelTwoCommit.json().actor as Actor;
      expect(actor.data.level).toBe(2);
      expect(actor.data.spellcasting).toEqual(expect.objectContaining({
        preparedSpellCapacity: 5,
        preparedSpellCapacityLevel: 2,
        preparedSpells: ["alarm", "burning-hands", "charm-person", "magic-missile", "shield"],
        spellbookSpells: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield", "disguise-self", "find-familiar"]
      }));
      for (const entryId of ["disguise-self", "find-familiar"]) {
        const item = spellByEntryId(store, actor, entryId)!;
        expect(item).toBeDefined();
        expect(item.data).toEqual(expect.objectContaining({ compendiumId: entryId, classSpell: true, inSpellbook: true, compendiumProvenance: expect.objectContaining({ rulesVersion: "SRD 5.2.1", contentVersion: "5.2.1" }) }));
        expect(item.data.spellSources).toContainEqual(expect.objectContaining({ kind: "class", className: "Wizard", selection: "spellbook", selectedAtLevel: 2, spellcastingAbility: "intelligence", acquisitionMode: "spellbook" }));
      }

      const levelThreePreview = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-preview-3" },
        payload: {
          operation: "advancement",
          optionId: "level-up",
          hitPointMode: "fixed",
          subclassId: "evoker",
          prepare: true,
          wizardSpellbookAdditions: ["scorching-ray", "web"],
          classPreparedSpellChoices: ["burning-hands", "magic-missile", "shield", "disguise-self", "scorching-ray", "web"]
        }
      });
      expect(levelThreePreview.statusCode).toBe(200);
      const levelThreePlan = levelThreePreview.json();
      expect(levelThreePlan.status, JSON.stringify(levelThreePlan.blockers)).toBe("ready");
      expect(levelThreePlan.details.spellAdvancement).toEqual(expect.objectContaining({ classLevel: 3, maxSpellLevel: 2, preparedSpellCapacity: 6 }));

      const levelThreeCommit = await app.inject({
        method: "POST",
        url: `${base}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-commit-3" },
        payload: { preparedPreviewKey: levelThreePlan.preparation.preparedPreviewKey, expectedUpdatedAt: levelThreePlan.preparation.actorUpdatedAt }
      });
      expect(levelThreeCommit.statusCode, levelThreeCommit.body).toBe(200);
      actor = levelThreeCommit.json().actor as Actor;
      const spellcasting = actor.data.spellcasting as Record<string, unknown>;
      expect(actor.data).toEqual(expect.objectContaining({ level: 3, subclass: "Evoker", subclasses: expect.objectContaining({ Wizard: "evoker" }) }));
      expect(spellcasting.preparedSpellCapacity).toBe(6);
      expect(spellcasting.preparedSpells).toEqual(["burning-hands", "magic-missile", "shield", "disguise-self", "scorching-ray", "web"]);
      expect(spellcasting.spellbookSpells).toHaveLength(10);
      for (const entryId of ["scorching-ray", "web"]) {
        const item = spellByEntryId(store, actor, entryId)!;
        expect(item.data).toEqual(expect.objectContaining({ level: 2, prepared: true, inSpellbook: true, compendiumProvenance: expect.objectContaining({ sourceKind: "srd" }) }));
        expect(item.data.spellSources).toContainEqual(expect.objectContaining({ kind: "class", className: "Wizard", selection: "spellbook", selectedAtLevel: 3, spellcastingAbility: "intelligence", acquisitionMode: "spellbook" }));
      }
      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "system.actor.advance", targetId: actor.id, after: expect.objectContaining({ spellAdvancement: expect.objectContaining({ className: "Wizard", classLevel: 3 }) }) }));
    } finally {
      await app.close();
    }
  });

  it("publishes and commits reviewed spell grants for every SRD casting path and preserves them through archive reload", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const castingClasses = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"] as const;
    const expectedActorIds: string[] = [];
    try {
      for (const className of castingClasses) {
        const template = dnd5eSrdCharacterTemplate(className.toLowerCase());
        const profile = dnd5eSrdSpellcastingClassProfile(className, 2);
        if (!template || !profile) throw new Error(`Missing ${className} spell advancement fixture`);
        const id = `act_spell_path_${className.toLowerCase()}`;
        expectedActorIds.push(id);
        const eligibleSpellIds = dnd5eSrdCompendium().flatMap((entry) => {
          const classes = Array.isArray(entry.data.classes) ? entry.data.classes : [];
          return entry.type === "spell" && entry.data.level === 1 && classes.some((candidate) => typeof candidate === "string" && candidate.toLowerCase() === className.toLowerCase()) ? [entry.id] : [];
        });
        expect(eligibleSpellIds.length, `${className} level-one catalog`).toBeGreaterThanOrEqual(profile.preparedSpellCapacity + profile.spellbookAdditions);
        const initialSpellbook = className === "Wizard" ? eligibleSpellIds.slice(0, 6) : [];
        const wizardSpellbookAdditions = className === "Wizard" ? eligibleSpellIds.slice(6, 8) : [];
        const resultingSpellbook = [...initialSpellbook, ...wizardSpellbookAdditions];
        const classPreparedSpellChoices = (className === "Wizard" ? resultingSpellbook : eligibleSpellIds).slice(0, profile.preparedSpellCapacity);
        const actor: Actor = {
          id,
          campaignId: "camp_demo",
          systemId: "dnd-5e-srd",
          ownerUserId: "usr_demo_player",
          type: "character",
          name: `${className} Spell Path`,
          data: {
            ...structuredClone(template.data),
            class: className,
            level: 1,
            ...(className === "Wizard" ? {
              spellcasting: {
                ...(typeof template.data.spellcasting === "object" && template.data.spellcasting ? structuredClone(template.data.spellcasting) : {}),
                spellbookSpells: initialSpellbook
              }
            } : {})
          },
          permissions: {},
          createdAt: "2026-07-17T00:00:00.000Z",
          updatedAt: "2026-07-17T00:00:00.000Z"
        };
        store.state.actors.push(actor);
        const base = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}`;

        const catalogResponse = await app.inject({ method: "GET", url: `${base}/advancement`, headers: gmHeaders });
        expect(catalogResponse.statusCode, catalogResponse.body).toBe(200);
        const catalog = catalogResponse.json();
        const catalogPath = catalog.spellAdvancement.paths.find((path: { className: string }) => path.className === className);
        expect(catalogPath).toEqual(expect.objectContaining({
          className,
          nextClassLevel: 2,
          spellcastingAbility: profile.spellcastingAbility,
          acquisitionMode: profile.acquisitionMode,
          maxSpellLevel: profile.maxSpellLevel,
          preparedSpellCapacity: profile.preparedSpellCapacity,
          spellbookAdditions: profile.spellbookAdditions,
          eligibleSpells: expect.arrayContaining([expect.objectContaining({ id: eligibleSpellIds[0], level: 1, classes: expect.arrayContaining([className.toLowerCase()]), source: expect.any(String) })])
        }));

        const preview = await app.inject({
          method: "POST",
          url: `${base}/rules-preview`,
          headers: { ...gmHeaders, "idempotency-key": `spell-path-${className.toLowerCase()}-preview` },
          payload: {
            operation: "advancement",
            hitPointMode: "fixed",
            prepare: true,
            classPreparedSpellChoices,
            ...(catalog.weaponMastery?.requiresSelection ? { weaponMasteryChoices: catalog.weaponMastery.options.slice(0, catalog.weaponMastery.requiredCount).map((option: { id: string }) => option.id) } : {}),
            ...(className === "Wizard" ? { wizardSpellbookAdditions } : {})
          }
        });
        expect(preview.statusCode, preview.body).toBe(200);
        const plan = preview.json();
        expect(plan.status, `${className}: ${JSON.stringify(plan.blockers)}`).toBe("ready");
        expect(plan.details.spellAdvancement).toEqual(expect.objectContaining({ className, spellcastingAbility: profile.spellcastingAbility, acquisitionMode: profile.acquisitionMode }));

        const commit = await app.inject({
          method: "POST",
          url: `${base}/advance`,
          headers: { ...gmHeaders, "idempotency-key": `spell-path-${className.toLowerCase()}-commit` },
          payload: { preparedPreviewKey: plan.preparation.preparedPreviewKey, expectedUpdatedAt: plan.preparation.actorUpdatedAt }
        });
        expect(commit.statusCode, `${className}: ${commit.body}`).toBe(200);
        const committedActor = commit.json().actor as Actor;
        expect(committedActor.data.level).toBe(2);
        for (const entryId of plan.details.spellAdvancement.materializedSpellIds as string[]) {
          const item = spellByEntryId(store, committedActor, entryId);
          expect(item?.data).toEqual(expect.objectContaining({
            classSpell: true,
            spellcastingClass: className,
            spellcastingAbility: profile.spellcastingAbility,
            acquisitionMode: profile.acquisitionMode,
            preparedForClass: className
          }));
          expect(item?.data.spellSources).toContainEqual(expect.objectContaining({
            kind: "class",
            className,
            selectedAtLevel: 2,
            spellcastingAbility: profile.spellcastingAbility,
            acquisitionMode: profile.acquisitionMode
          }));
        }
      }

      const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(exported.statusCode, exported.body).toBe(200);
      const targetState: EngineState = emptyState();
      targetState.users.push({ id: "usr_demo_gm", displayName: "Archive GM", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z" });
      const targetStore = new MemoryStateStore(targetState);
      const targetApp = await buildApp({ store: targetStore });
      try {
        const imported = await targetApp.inject({ method: "POST", url: "/api/v1/import/campaign", headers: gmHeaders, payload: exported.json() });
        expect(imported.statusCode, imported.body).toBe(200);
        for (const actorId of expectedActorIds) {
          const reloadedActor = targetStore.state.actors.find((candidate) => candidate.id === actorId);
          expect(reloadedActor?.data.level).toBe(2);
          const className = String(reloadedActor?.data.class);
          const profile = dnd5eSrdSpellcastingClassProfile(className, 2)!;
          const reloadedClassSpells = targetStore.state.items.filter((item) => item.actorId === actorId && item.type === "spell" && item.data.classSpell === true);
          expect(reloadedClassSpells.length, `${className} archived spells`).toBeGreaterThan(0);
          expect(reloadedClassSpells[0]?.data).toEqual(expect.objectContaining({ spellcastingClass: className, spellcastingAbility: profile.spellcastingAbility, acquisitionMode: profile.acquisitionMode }));
        }
      } finally {
        await targetApp.close();
      }
    } finally {
      await app.close();
    }
  }, 60_000);

  it("blocks forged choices and rejects a stale spell item before any advancement write", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({ method: "POST", url: characterRoute, headers: { ...gmHeaders, "idempotency-key": "spell-adv-stale-create" }, payload: { ...wizardCreation, name: "Stale Spell Wizard" } });
      const actor = created.json().actor as Actor;
      const base = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}`;
      const beforeItems = actorSpells(store, actor).map((item) => ({ id: item.id, entryId: item.data.compendiumId, data: structuredClone(item.data) }));

      const forged = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-forged" },
        payload: {
          operation: "advancement",
          hitPointMode: "fixed",
          prepare: true,
          wizardSpellbookAdditions: ["alarm", "web"],
          classPreparedSpellChoices: ["detect-magic", "guiding-bolt", "alarm", "shield", "charm-person"]
        }
      });
      expect(forged.statusCode).toBe(200);
      expect(forged.json().status).toBe("blocked");
      expect(forged.json().blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "rules.spell_already_known" }),
        expect.objectContaining({ code: "rules.spell_level_unavailable" }),
        expect.objectContaining({ code: "rules.outside_class_list" })
      ]));
      expect((store.state.actors.find((candidate) => candidate.id === actor.id)!.data.level)).toBe(1);

      const preview = await app.inject({
        method: "POST",
        url: `${base}/rules-preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-stale-preview" },
        payload: {
          operation: "advancement",
          hitPointMode: "fixed",
          prepare: true,
          wizardSpellbookAdditions: ["disguise-self", "find-familiar"],
          classPreparedSpellChoices: ["alarm", "burning-hands", "charm-person", "magic-missile", "shield"]
        }
      });
      expect(preview.json().status, JSON.stringify(preview.json().blockers)).toBe("ready");
      const plan = preview.json();
      const changedSpell = actorSpells(store, actor)[0]!;
      changedSpell.updatedAt = "2099-01-01T00:00:00.000Z";

      const commit = await app.inject({
        method: "POST",
        url: `${base}/advance`,
        headers: { ...gmHeaders, "idempotency-key": "spell-adv-stale-commit" },
        payload: { preparedPreviewKey: plan.preparation.preparedPreviewKey, expectedUpdatedAt: plan.preparation.actorUpdatedAt }
      });
      expect(commit.statusCode).toBe(409);
      expect(commit.json()).toEqual(expect.objectContaining({ code: "stale_write", resourceType: "item", resourceId: changedSpell.id }));
      const storedActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      expect(storedActor.data.level).toBe(1);
      expect(spellByEntryId(store, storedActor, "disguise-self")).toBeUndefined();
      expect(spellByEntryId(store, storedActor, "find-familiar")).toBeUndefined();
      expect(actorSpells(store, storedActor).map((item) => item.id).sort()).toEqual(beforeItems.map((item) => item.id).sort());
      expect(store.state.auditLogs.some((entry) => entry.action === "system.actor.advance" && entry.targetId === actor.id)).toBe(false);
    } finally {
      await app.close();
    }
  });
});
