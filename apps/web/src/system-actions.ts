

export type AdvancementOptionInfo = {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  nextValue: number;
};


export function systemRollId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "aptitude-tech";
  if (systemId === "mystic-noir") return "skill-investigation";
  if (systemId === "dnd-5e-srd") return "ability-strength";
  return "ability-charisma";
}


export function systemRollLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Tech Check";
  if (systemId === "mystic-noir") return "Investigation Check";
  if (systemId === "dnd-5e-srd") return "Strength Check";
  return "Charisma Check";
}


export function systemAdvancementOptionId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "rank-up";
  if (systemId === "mystic-noir") return "case-breakthrough";
  return "level-up";
}


export function systemAdvancementLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Advance Rank";
  if (systemId === "mystic-noir") return "Case Breakthrough";
  return "Level Up";
}


export function systemEncounterThreatId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "void-raider";
  if (systemId === "mystic-noir") return "masked-agent";
  if (systemId === "dnd-5e-srd") return "goblin-minion";
  return "skeletal-guard";
}


export function systemImportPayload(systemId: string, ownerUserId: string): Record<string, unknown> {
  if (systemId === "dnd-5e-srd") {
    return {
      name: "Imported Cleric",
      ownerUserId,
      data: {
        level: 3,
        class: "Cleric",
        species: "Human",
        background: "Sage",
        hp: { current: 16, max: 21 },
        attributes: { strength: 10, dexterity: 12, constitution: 14, intelligence: 12, wisdom: 16, charisma: 10 },
        features: ["Spellcasting"],
        conditions: ["blessed"],
        items: ["healing-word", "cure-wounds", "longsword"]
      }
    };
  }
  if (systemId === "stellar-frontiers") {
    return {
      name: "Imported Ace",
      ownerUserId,
      data: {
        rank: 4,
        background: "Corsair Defector",
        aptitudes: { combat: 3, tech: 2, pilot: 4, science: 1, charm: 1 },
        strain: { current: 5, max: 8 },
        milestones: ["Defected at Dawn"],
        conditions: ["locked-in"],
        items: ["laser-carbine", "overclock"]
      }
    };
  }
  if (systemId === "mystic-noir") {
    return {
      name: "Imported Investigator",
      ownerUserId,
      data: {
        rank: 3,
        archetype: "Occult Scholar",
        skills: { investigation: 2, resolve: 3, influence: 1, stealth: 1, occult: 4 },
        composure: { current: 4, max: 7 },
        breakthroughs: ["Solved the First Case"],
        conditions: ["focused"],
        items: ["case-notebook", "warding-rite", "marked"]
      }
    };
  }
  return {
    name: "Imported Mender",
    ownerUserId,
    data: {
      level: 3,
      class: "Mender",
      hp: { current: 14, max: 18 },
      attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
      features: ["Field Prayer"],
      conditions: ["blessed"],
      items: ["healing-word", "longsword"]
    }
  };
}
