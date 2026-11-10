import { describe, expect, it } from "vitest";
import { dnd5eSrdWeaponMasteryChoiceCount, dnd5eSrdWeaponMasteryEligibleWeaponIds } from "./index.js";

const allWeapons = [
  "club", "dagger", "greatclub", "handaxe", "javelin", "light-hammer", "mace", "quarterstaff", "sickle", "spear",
  "dart", "light-crossbow", "shortbow", "sling", "battleaxe", "flail", "glaive", "greataxe", "greatsword", "halberd",
  "lance", "longsword", "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword", "trident", "warhammer",
  "war-pick", "whip", "blowgun", "hand-crossbow", "heavy-crossbow", "longbow", "musket", "pistol"
];
const barbarianWeapons = [
  "club", "dagger", "greatclub", "handaxe", "javelin", "light-hammer", "mace", "quarterstaff", "sickle", "spear",
  "battleaxe", "flail", "glaive", "greataxe", "greatsword", "halberd", "lance", "longsword", "maul", "morningstar",
  "pike", "rapier", "scimitar", "shortsword", "trident", "warhammer", "war-pick", "whip"
];
const rogueWeapons = [
  "club", "dagger", "greatclub", "handaxe", "javelin", "light-hammer", "mace", "quarterstaff", "sickle", "spear",
  "dart", "light-crossbow", "shortbow", "sling", "rapier", "scimitar", "shortsword", "whip", "hand-crossbow"
];

describe("Weapon Mastery catalog choices", () => {
  it.each([
    ["Barbarian", barbarianWeapons],
    ["Fighter", allWeapons],
    ["Paladin", allWeapons],
    ["Ranger", allWeapons],
    ["Rogue", rogueWeapons]
  ] as const)("preserves %s choices and their published order", (className, expected) => {
    expect(dnd5eSrdWeaponMasteryEligibleWeaponIds(className)).toEqual(expected);
    expect(dnd5eSrdWeaponMasteryEligibleWeaponIds(`  ${className.toUpperCase()}  `)).toEqual(expected);
  });

  it.each(["Bard", "Cleric", "Druid", "Monk", "Sorcerer", "Warlock", "Wizard", "Unknown", ""])(
    "returns no Weapon Mastery choices for %s", (className) => {
      expect(dnd5eSrdWeaponMasteryEligibleWeaponIds(className)).toEqual([]);
    }
  );

  it("keeps level-dependent selection counts separate from eligible weapons", () => {
    expect(dnd5eSrdWeaponMasteryChoiceCount("Fighter", 0)).toBe(0);
    expect(dnd5eSrdWeaponMasteryEligibleWeaponIds("Fighter")).toEqual(allWeapons);
    expect([1, 4, 10, 20].map((level) => dnd5eSrdWeaponMasteryChoiceCount("Fighter", level))).toEqual([3, 4, 5, 6]);
  });

  it("isolates each returned choice array from caller mutations", () => {
    const first = dnd5eSrdWeaponMasteryEligibleWeaponIds("Fighter");
    first[0] = "changed";
    first.pop();
    expect(dnd5eSrdWeaponMasteryEligibleWeaponIds("Fighter")).toEqual(allWeapons);
    expect(dnd5eSrdWeaponMasteryEligibleWeaponIds("Paladin")).toEqual(allWeapons);
  });
});
