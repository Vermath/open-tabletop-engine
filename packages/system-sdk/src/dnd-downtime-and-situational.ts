// Dependency-free SRD 5.2.1 situational-combat references and downtime
// crafting tables, extracted from the orchestration entrypoint to keep it
// inside the remediated architecture budget.

export function dnd5eSrdUnderwaterCombatRules(): Record<string, unknown> {
  return {
    meleeAttacks: "disadvantage unless the weapon is a dagger, javelin, shortsword, spear, or trident",
    rangedAttacks: "automatically miss beyond normal range; disadvantage within normal range unless the weapon is a crossbow, net, or thrown like a javelin",
    swimSpeedExemption: "creatures with a swim speed ignore the melee penalty",
    fireDamage: "fully submerged creatures have resistance to fire damage"
  };
}

export function dnd5eSrdMountedCombatRules(): Record<string, unknown> {
  return {
    mounting: "costs an amount of movement equal to half your speed",
    controlledMount: "acts on your initiative and can only Dash, Disengage, or Dodge",
    independentMount: "retains its own initiative and actions",
    dismountedByForce: "if an effect moves your mount against its will, succeed on a DC 10 Dexterity saving throw or land Prone within 5 feet",
    proneMount: "if your mount is knocked Prone, dismount as it falls or fall Prone within 5 feet",
    targeting: "attackers can target you or your mount"
  };
}

export const dnd5eSrdMagicItemCraftingTable: Record<string, { costGp: number; days: number }> = {
  common: { costGp: 50, days: 5 },
  uncommon: { costGp: 200, days: 10 },
  rare: { costGp: 2000, days: 50 },
  "very rare": { costGp: 20000, days: 125 },
  legendary: { costGp: 100000, days: 250 }
};

export function dnd5eSrdMagicItemCraftingPlan(rarity: string, options: { crafters?: number } = {}): { rarity: string; costGp: number; days: number; requirements: string[] } | undefined {
  const entry = dnd5eSrdMagicItemCraftingTable[rarity.toLowerCase()];
  if (!entry) return undefined;
  const crafters = typeof options.crafters === "number" && Number.isFinite(options.crafters) ? Math.max(1, Math.floor(options.crafters)) : 1;
  return {
    rarity: rarity.toLowerCase(),
    costGp: entry.costGp,
    days: Math.ceil(entry.days / crafters),
    requirements: [
      "Proficiency with the Arcana skill or with tools appropriate to the item",
      "Access to any spells the item can produce for every day of crafting",
      "Raw materials worth the listed cost"
    ]
  };
}

export const dnd5eSrdSpellScrollCraftingTable: ReadonlyArray<{ spellLevel: number; costGp: number; days: number }> = [
  { spellLevel: 0, costGp: 15, days: 1 },
  { spellLevel: 1, costGp: 25, days: 1 },
  { spellLevel: 2, costGp: 100, days: 3 },
  { spellLevel: 3, costGp: 150, days: 5 },
  { spellLevel: 4, costGp: 1000, days: 10 },
  { spellLevel: 5, costGp: 1500, days: 25 },
  { spellLevel: 6, costGp: 10000, days: 40 },
  { spellLevel: 7, costGp: 12500, days: 50 },
  { spellLevel: 8, costGp: 15000, days: 60 },
  { spellLevel: 9, costGp: 50000, days: 120 }
];

export function dnd5eSrdSpellScrollCraftingPlan(spellLevel: number): { spellLevel: number; costGp: number; days: number; requirements: string[] } | undefined {
  const entry = dnd5eSrdSpellScrollCraftingTable.find((row) => row.spellLevel === Math.max(0, Math.floor(spellLevel)));
  if (!entry) return undefined;
  return {
    ...entry,
    requirements: [
      "Proficiency with the Arcana skill or with Calligrapher's Supplies",
      "The spell prepared on each day of scribing",
      "Any material components the spell consumes"
    ]
  };
}
