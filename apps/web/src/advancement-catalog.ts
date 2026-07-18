import type { Actor, Dnd5eSrdPendingAdvancement } from "@open-tabletop/core";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api.js";
import type { AdvancementFeatInfo, AdvancementMulticlassOption, AdvancementSubclassOption, AdvancementWeaponMasteryInfo } from "./advancement-flow.js";
import type { AdvancementSpellPathInfo } from "./advancement-spell-choices.js";
import { errorMessage } from "./sheet-format.js";
import type { AdvancementOptionInfo } from "./system-actions.js";

export interface XpProgressInfo {
  xp: number;
  level: number;
  levelForXp: number;
  nextLevelXp?: number;
  previousLevelXp: number;
  readyToLevel: boolean;
}

interface AdvancementCatalogData {
  actorId: string;
  options: AdvancementOptionInfo[];
  grantsFeat: boolean;
  feats: AdvancementFeatInfo[];
  multiclassOptions: AdvancementMulticlassOption[];
  className: string;
  nextClassLevel?: number;
  requiresSubclass: boolean;
  subclassOptions: AdvancementSubclassOption[];
  weaponMastery?: AdvancementWeaponMasteryInfo;
  spellAdvancementPaths: AdvancementSpellPathInfo[];
  pendingAdvancement?: Dnd5eSrdPendingAdvancement;
  xp?: XpProgressInfo;
}

interface AdvancementCatalogResponse {
  actorId: string;
  options: AdvancementOptionInfo[];
  advancementClassName?: string;
  nextClassLevel?: number;
  requiresSubclass?: boolean;
  subclassOptions?: AdvancementSubclassOption[];
  weaponMastery?: AdvancementWeaponMasteryInfo;
  spellAdvancement?: { paths: AdvancementSpellPathInfo[] };
  grantsFeat?: boolean;
  feats?: AdvancementFeatInfo[];
  multiclassOptions?: AdvancementMulticlassOption[];
  xp?: XpProgressInfo;
  pendingAdvancement?: Dnd5eSrdPendingAdvancement;
}

const emptyCatalog = (): AdvancementCatalogData => ({ actorId: "", options: [], grantsFeat: false, feats: [], multiclassOptions: [], className: "", requiresSubclass: false, subclassOptions: [], spellAdvancementPaths: [] });

export function shouldPreserveAdvancementCatalog(loadedActorId: string, requestedActorId: string) {
  return loadedActorId === requestedActorId;
}

export function useAdvancementCatalog(input: { campaignId: string; actor?: Actor; disabled?: boolean }) {
  const [data, setData] = useState<AdvancementCatalogData>(emptyCatalog);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (input.disabled || !input.actor) {
      setData(emptyCatalog());
      setLoadState("idle");
      setLoadError("");
      return;
    }
    const actor = input.actor;
    let cancelled = false;
    setData((current) => shouldPreserveAdvancementCatalog(current.actorId, actor.id) ? current : emptyCatalog());
    setLoadState("loading");
    setLoadError("");
    apiGet<AdvancementCatalogResponse>(`/api/v1/campaigns/${input.campaignId}/systems/${actor.systemId}/actors/${actor.id}/advancement`)
      .then((result) => {
        if (cancelled) return;
        setData({ actorId: result.actorId, options: result.options, grantsFeat: result.grantsFeat ?? false, feats: result.feats ?? [], multiclassOptions: result.multiclassOptions ?? [], className: result.advancementClassName ?? "", nextClassLevel: result.nextClassLevel, requiresSubclass: result.requiresSubclass ?? false, subclassOptions: result.subclassOptions ?? [], weaponMastery: result.weaponMastery, spellAdvancementPaths: result.spellAdvancement?.paths ?? [], pendingAdvancement: result.pendingAdvancement, xp: result.xp });
        setLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setData((current) => shouldPreserveAdvancementCatalog(current.actorId, actor.id) ? current : emptyCatalog());
        setLoadState("error");
        setLoadError(errorMessage(error));
      });
    return () => { cancelled = true; };
  }, [input.actor?.id, input.actor?.systemId, input.actor?.updatedAt, input.campaignId, input.disabled, reloadVersion]);

  const setPendingAdvancement = useCallback((pending: Dnd5eSrdPendingAdvancement | undefined) => setData((current) => ({ ...current, pendingAdvancement: pending })), []);
  const reset = useCallback(() => { setData(emptyCatalog()); setLoadState("idle"); setLoadError(""); }, []);
  return { ...data, loadState, loadError, retry: () => setReloadVersion((version) => version + 1), setPendingAdvancement, reset };
}
