import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

describe("D&D character import compatibility API", () => {
  it("persists common JSON fields as a playable spellcaster sheet", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters/import",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "import-common-wizard-fields" },
        payload: {
          name: "Orin Glass",
          ownerUserId: "usr_demo_player",
          data: {
            class: "Wizard",
            level: 1,
            hp: { current: 8, max: 8 },
            armorClass: 12,
            abilities: { strength: 8, dexterity: 14, constitution: 13, intelligence: 17, wisdom: 12, charisma: 10 },
            spellbook: ["Fire Bolt", "Mage Hand", "Magic Missile", "Shield", "Sleep"],
            preparedSpells: ["Magic Missile", "Shield", "Sleep"],
            spellSlots: { "1": { current: 2, max: 2 } }
          }
        }
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().actor.data).toEqual(expect.objectContaining({
        attributes: expect.objectContaining({ intelligence: 17, dexterity: 14 }),
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        spellcasting: expect.objectContaining({
          cantrips: ["fire-bolt", "mage-hand"],
          preparedSpells: ["magic-missile", "shield", "sleep"],
          spellbookSpells: ["magic-missile", "shield", "sleep"]
        })
      }));
      expect(response.json().actor.data).not.toHaveProperty("armorClassReview");
      expect(response.json().sheet.data).toEqual(expect.objectContaining({
        armorClass: 12
      }));
      expect(response.json().sheet.data.armorClassDetails).not.toHaveProperty("requiresReview");
      expect(response.json().items.map((item: { name: string }) => item.name)).toEqual([
        "Fire Bolt",
        "Mage Hand",
        "Magic Missile",
        "Shield",
        "Sleep"
      ]);
      expect(response.json().sheet.spells).toHaveLength(5);
      expect(response.json().sheet.quickRolls.map((roll: { label: string }) => roll.label)).toEqual(expect.arrayContaining([
        "Fire Bolt Attack",
        "Fire Bolt Damage",
        "Magic Missile Damage",
        "Shield Effect",
        "Sleep Effect"
      ]));
      expect(response.json().import.warnings).toEqual(expect.arrayContaining([
        expect.stringContaining("Normalized abilities to attributes"),
        "Normalized spell slot keys: 1 to level1."
      ]));
    } finally {
      await app.close();
    }
  });
});
