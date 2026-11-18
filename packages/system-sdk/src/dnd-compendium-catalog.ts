import type { CompendiumProvenance } from "@open-tabletop/api-contracts";
import { DND_5E_SRD_SYSTEM_ID, DND_5E_SRD_VERSION } from "./dnd-static-content.js";
import type { EncounterThreat } from "./index.js";

export const DND_5E_SRD_COMPENDIUM_PROVENANCE: CompendiumProvenance = {
  sourceKind: "srd",
  sourceName: "Dungeons & Dragons System Reference Document",
  sourceVersion: "5.2.1",
  contentVersion: "5.2.1",
  systemId: DND_5E_SRD_SYSTEM_ID,
  systemVersion: "5.2.1",
  rulesVersion: DND_5E_SRD_VERSION,
  license: {
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/",
    usage: "srd",
    attribution: "Dungeons & Dragons System Reference Document 5.2.1 by Wizards of the Coast LLC, licensed under CC BY 4.0."
  }
};

/** Compact source entries for the standalone compendium; actors are instantiated on placement. */
export function monsterCatalogEntries(threats: readonly EncounterThreat[]) {
  return threats.map((threat) => ({
    id: `srd-monster:${threat.id}`,
    type: "monster",
    name: threat.name,
    summary: threat.summary,
    data: { challengeRating: threat.challengeRating },
    provenance: structuredClone(DND_5E_SRD_COMPENDIUM_PROVENANCE),
  }));
}
