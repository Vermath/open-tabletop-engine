import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { previewDnd5eSrdSpellPreparation } from "./dnd-spell-preparation.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function wizard(data: Record<string, unknown> = {}): Actor {
  return {
    id: "act_wizard",
    campaignId: "camp_spells",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Mira",
    data: {
      level: 1,
      spellcasting: {
        className: "Wizard",
        preparedSpellCapacity: 4,
        preparedSpellCapacityLevel: 1,
        spellbookSpells: ["alarm", "burning-hands", "charm-person", "detect-magic", "feather-fall"],
        changeTiming: "long-rest"
      },
      ...data
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function classSpell(
  id: string,
  name: string,
  data: Record<string, unknown> = {}
): Item {
  return {
    id,
    campaignId: "camp_spells",
    systemId: "dnd-5e-srd",
    actorId: "act_wizard",
    type: "spell",
    name,
    data: {
      level: 1,
      compendiumId: id.replace("itm_", ""),
      classSpell: true,
      inSpellbook: true,
      prepared: false,
      spellSources: [{ kind: "class", className: "Wizard", selection: "spellbook", selectedAtLevel: 1 }],
      ...data
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("rules-aware D&D spell-preparation preview", () => {
  it("returns exact prepare and unprepare changes without mutating stored input", () => {
    const actor = wizard();
    const alarm = classSpell("itm_alarm", "Alarm", { prepared: true });
    const burningHands = classSpell("itm_burning-hands", "Burning Hands");
    const before = structuredClone([actor, alarm, burningHands]);

    const plan = previewDnd5eSrdSpellPreparation(actor, [alarm, burningHands], {
      selectedSpellIds: [burningHands.id],
      timing: "long-rest"
    });

    expect(plan).toEqual(expect.objectContaining({
      status: "ready",
      requiredTiming: "long-rest",
      capacity: expect.objectContaining({ limit: 4, selected: 1, source: "stored" }),
      selectedSpellIds: [burningHands.id]
    }));
    expect(plan.changes).toEqual([
      expect.objectContaining({ itemId: alarm.id, fromPrepared: true, toPrepared: false }),
      expect.objectContaining({ itemId: burningHands.id, fromPrepared: false, toPrepared: true })
    ]);
    expect([actor, alarm, burningHands]).toEqual(before);
  });

  it("enforces always-prepared exclusion, capacity, timing, and Wizard spellbook membership", () => {
    const spells = [
      classSpell("itm_alarm", "Alarm"),
      classSpell("itm_burning-hands", "Burning Hands"),
      classSpell("itm_charm-person", "Charm Person"),
      classSpell("itm_detect-magic", "Detect Magic"),
      classSpell("itm_feather-fall", "Feather Fall"),
      classSpell("itm_not-in-book", "Not In Book"),
      classSpell("itm_magic-missile", "Magic Missile", { alwaysPrepared: true, prepared: true })
    ];

    const plan = previewDnd5eSrdSpellPreparation(wizard(), spells, {
      selectedSpellIds: spells.map((spell) => spell.id),
      timing: "class-level"
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "timing_mismatch" }),
      expect.objectContaining({ code: "capacity_exceeded" }),
      expect.objectContaining({ code: "wizard_spellbook_unverified", itemId: "itm_not-in-book" }),
      expect.objectContaining({ code: "always_prepared_excluded", itemId: "itm_magic-missile" })
    ]));
    expect(plan.capacity).toEqual(expect.objectContaining({ selected: 5, alwaysPrepared: 1 }));
  });

  it("supports proven later-level acquisition while retaining the manual boundary for legacy or unvalidated homebrew spells", () => {
    const laterLevel = classSpell("itm_fly", "Fly", {
      level: 3,
      compendiumId: "fly",
      spellSources: [{ kind: "class", className: "Wizard", selection: "spellbook", selectedAtLevel: 5 }]
    });
    const legacy = classSpell("itm_homebrew", "Homebrew Bolt", {
      compendiumId: undefined,
      classSpell: undefined,
      spellSources: undefined
    });
    const actor = wizard({
      level: 5,
      spellcasting: {
        className: "Wizard",
        preparedSpellCapacity: 8,
        preparedSpellCapacityLevel: 5,
        spellbookSpells: ["fly"],
        changeTiming: "long-rest"
      }
    });

    const plan = previewDnd5eSrdSpellPreparation(actor, [laterLevel, legacy], {
      selectedSpellIds: [laterLevel.id, legacy.id],
      timing: "long-rest"
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toEqual([
      expect.objectContaining({ code: "class_spell_unverified", itemId: legacy.id })
    ]);
    expect(plan.eligibleSpellIds).toContain(laterLevel.id);
    expect(plan.changes).toContainEqual(expect.objectContaining({ itemId: laterLevel.id, toPrepared: true }));
  });

  it("uses the fixed class progression when a current stored capacity is absent", () => {
    const actor = wizard({
      spellcasting: {
        className: "Wizard",
        spellbookSpells: ["alarm"],
        changeTiming: "long-rest"
      }
    });
    const alarm = classSpell("itm_alarm", "Alarm");

    expect(previewDnd5eSrdSpellPreparation(actor, [alarm], {
      selectedSpellIds: [alarm.id],
      timing: "long-rest"
    }).capacity).toEqual(expect.objectContaining({ limit: 4, source: "level-one-class" }));

    const later = { ...actor, data: { ...actor.data, level: 2 } };
    const laterPlan = previewDnd5eSrdSpellPreparation(later, [alarm], {
      selectedSpellIds: [alarm.id],
      timing: "long-rest"
    });
    expect(laterPlan.blockers).toEqual([]);
    expect(laterPlan.capacity).toEqual(expect.objectContaining({ limit: 5, source: "class-progression" }));
  });

  it("blocks around an existing prepared legacy spell instead of desynchronizing it", () => {
    const legacyPrepared = classSpell("itm_legacy", "Legacy Spell", {
      prepared: true,
      compendiumId: undefined,
      classSpell: undefined,
      spellSources: undefined,
    });

    const plan = previewDnd5eSrdSpellPreparation(wizard(), [legacyPrepared], {
      selectedSpellIds: [],
      timing: "long-rest",
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "class_spell_unverified",
      itemId: legacyPrepared.id,
    }));
    expect(plan.changes).toEqual([]);
  });
});
