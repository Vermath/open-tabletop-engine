

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
