import type { Actor, Combat, Item, MapAsset, Scene, Token, TokenLayer } from "@open-tabletop/core";
import type { Dnd5eSrdSpellPreparationMutationResult } from "@open-tabletop/core";
import { Boxes, Check, ChevronRight, ChevronUp, Crosshair, Dices, Eraser, Eye, FileText, Grip, Hand, LockKeyhole, MapPin, PencilLine, Pentagon, Plus, Shield, Swords, Timer, Upload, Users, WandSparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, type Snapshot } from "./api.js";
import { isAdversaryActor } from "./actor-rails.js";
import { HpBar } from "./hp-bar.js";
import { HitDiceRestCard, type ActorRestOptions, type RestPreviewEnvelope } from "./hit-dice-rest-card.js";
import { TypedDamageCard, type TypedDamageApplyResult } from "./typed-damage-card.js";
import { ActorLoadoutPanel, filterActorLoadoutItems, type ActorAttunementChangeOptions, type ActorLoadoutFilter } from "./actor-loadout-panel.js";
import { TacticalMapAids, coverLevelLabel, sceneCoverOverrideBetween } from "./tactical-map-aids.js";
import { CalculationExplanationPanel } from "./calculation-explanation-panel.js";
import { LazyDndInventoryCommercePanel } from "./deferred-panels.js";
import { tokenCenter, tokenCoordinatesFromCenter, tokenLayer, tokenLayerLabel, tokenLayers } from "./scene-canvas.js";
import { actorActionDiceFormula, actorActionOptions, actorActionSupportsEffect, actorArmorClass, actorCombatStateLabels, actorConcentrationLabel, actorConditionLabels, actorCoreStatistics, actorRageStatus, actorResourceControls, actorResourceLabels, actorResourceUpdate, actorSaveFormula, formatActorConditions, isPointInsidePoints, isPurchasableCompendiumEntry, itemDisplayLabel, parseActorConditions, quickActorConditionIds, tokenBrightVisionPatch, tokenDimVisionPatch, tokenPermissionPresetLabel, tokenPlayerOwnerIds, type ActorActionOption, type ActorCoreStatistics, type ActorSheetQuickRoll, type RulesCompendiumEntry, type TokenVisionPatch } from "./actor-sheet-data.js";
import { clampNumber, formatGp, formatNumber, numericValue, slugId, titleCaseLabel } from "./sheet-format.js";
import { formatTokenSenses, parseTokenSenses } from "./actor-sheet-data.js";
import { setTokenDropPreview, writeTokenDropData } from "./token-drag.js";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";
import { clampFloatingPanel, useMovablePanel } from "./movable-panel.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { HeroicInspirationCard } from "./heroic-inspiration-card.js";
import { RulesSupportBoundaryNotice, rulesBoundaryFromAction } from "./rules-support-boundary.js";
import { WeaponMasteryControls, emptyWeaponMasteryDraft, weaponMasterySelectionForAction, weaponMasteryUseForSelection, type Dnd5eSrdWeaponMasteryUse } from "./weapon-mastery-controls.js";
import { actorActionPreviewRequiresInput } from "./actor-action-review.js";

type RulesSaveOutcome = "success" | "failure";
type ActorActionCommitOptions = { targetActorId?: string; applyEffect?: boolean; consumeResources?: boolean; saveOutcomes?: Record<string, RulesSaveOutcome>; effectChoice?: string; weaponMastery?: Dnd5eSrdWeaponMasteryUse };

interface ActorActionResolutionPreview {
  commitMode: "commit" | "preview";
  action?: {
    label: string;
    kind: "action" | "bonusAction" | "reaction" | "free";
    ledger?: { actionsUsed: number; actionSurgeGrants: number };
  };
  blocked?: { reason: string; code: string; supportStatus?: "automated" | "manual" | "unsupported" };
  rolls?: Array<{ rollId: string; label: string; formula: string; d20Mode?: string; targetActorId?: string; advantageSources?: string[]; disadvantageSources?: string[] }>;
  resourceConsumption?: Array<{ label: string; amount: number; remaining: number }>;
  conditions?: Array<{ actorId: string; operation: string; conditionName?: string; reason: string }>;
  pendingSaves?: Array<{ actorId: string; ability: string; dc?: number; reason: string; requiredForCommit?: boolean }>;
  pendingReactions?: Array<{ actorId: string; reason: string }>;
  warnings?: string[];
  pendingChoice?: { kind?: "effect" | "damageType" | "resistance" | "manual"; reason: string; options: string[] };
  manualResolutionRequired?: { reason: string; supportStatus?: "manual" | "unsupported" };
  attunement?: { limit: number; attunedItemIds: string[]; overLimitBy: number };
  weaponMastery?: {
    property: string;
    capability: "automatic" | "choice" | "manual";
    status: "awaiting-roll" | "applied" | "not-triggered" | "choice-required" | "manual-step";
    message: string;
    source: string;
    sourcePage: number;
    sourceUrl: string;
    secondaryTargetActorId?: string;
    geometry?: { inferred: false; confirmedByUser: boolean; instruction: string; distanceFeet?: number };
  };
}

type XpProgressInfo = {
  xp: number;
  level: number;
  levelForXp: number;
  nextLevelXp?: number;
  previousLevelXp: number;
  readyToLevel: boolean;
};

function isUsableImageAsset(asset: MapAsset): boolean {
  return asset.mimeType.startsWith("image/") && asset.lifecycle?.status !== "deleted";
}

function floatingPanelInspectorAllowance(): number {
  return window.innerWidth >= 1180 ? 392 : 0;
}

function initialActorSheetPanelSize() {
  return {
    width: Math.min(620, Math.max(380, window.innerWidth - 48)),
    height: Math.min(660, Math.max(400, window.innerHeight - 96))
  };
}

function initialActorSheetPanelPosition() {
  const { width } = initialActorSheetPanelSize();
  return {
    x: clampFloatingPanel(window.innerWidth - floatingPanelInspectorAllowance() - width - 24, window.innerWidth - 48),
    y: clampFloatingPanel(64, window.innerHeight - 48)
  };
}

function parseTokenConditions(value: string): NonNullable<Token["conditions"]> {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ id: slugId(name), name }));
}

function formatTokenConditions(token?: Token): string {
  return token?.conditions?.map((condition) => condition.name).join(", ") ?? "";
}

function parseTokenAuras(value: string): NonNullable<Token["auras"]> {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name = "", radius = "0", color] = item.split(":").map((part) => part.trim());
      return { id: slugId(name), name, radius: Math.max(0, Math.round(Number(radius) || 0)), ...(color ? { color } : {}) };
    })
    .filter((aura) => aura.id && aura.name);
}

function formatTokenAuras(token?: Token): string {
  return token?.auras?.map((aura) => `${aura.name}:${aura.radius}${aura.color ? `:${aura.color}` : ""}`).join("; ") ?? "";
}

function signedModifier(modifier: number): string {
  return `${modifier >= 0 ? "+" : ""}${modifier}`;
}

type SourcedD20Roll = { d20Mode?: string; advantageSources?: string[]; disadvantageSources?: string[] };

function sourcedD20Description(roll: SourcedD20Roll | undefined): string {
  if (!roll?.d20Mode) return "";
  const advantage = roll.advantageSources ?? [];
  const disadvantage = roll.disadvantageSources ?? [];
  if (roll.d20Mode === "advantage") return `Advantage${advantage.length > 0 ? ` from ${advantage.join(", ")}` : ""}`;
  if (roll.d20Mode === "disadvantage") return `Disadvantage${disadvantage.length > 0 ? ` from ${disadvantage.join(", ")}` : ""}`;
  if (advantage.length > 0 && disadvantage.length > 0) return `Advantage from ${advantage.join(", ")} and Disadvantage from ${disadvantage.join(", ")} cancel`;
  return "Normal d20 roll";
}

function sourcedD20ButtonLabel(roll: SourcedD20Roll | undefined): string {
  if (roll?.d20Mode === "advantage") return "Save · Advantage";
  if (roll?.d20Mode === "disadvantage") return "Save · Disadvantage";
  if ((roll?.advantageSources?.length ?? 0) > 0 && (roll?.disadvantageSources?.length ?? 0) > 0) return "Save · Canceled";
  return "Save";
}

export function CoreStatisticsSection(props: { stats: ActorCoreStatistics; canRoll: boolean; onRoll(rollId: string): void }) {
  const { stats } = props;
  if (stats.abilities.length === 0) return null;
  return (
    <div className="actor-core-statistics" role="group" aria-label="Core statistics and rolls">
      <div className="actor-sheet-subheading">
        <span>Abilities &amp; saves</span>
        {stats.speed !== undefined && <strong title="Speed">Speed {formatNumber(stats.speed)} ft</strong>}
      </div>
      {stats.deathSave && (
        <div className="metric-row actor-death-save-row">
          <span aria-label={`Death saves ${stats.deathSave.successes} of 3 successes, ${stats.deathSave.failures} of 3 failures`}>
            Death saves {formatNumber(stats.deathSave.successes)}/3 - {formatNumber(stats.deathSave.failures)}/3
          </span>
          {stats.deathSave.state ? (
            <strong>{stats.deathSave.state === "stable" ? "Stable" : "Dead"}</strong>
          ) : (
            <button
              className="ghost-button small"
              type="button"
              title={`Roll Death Saving Throw: ${stats.deathSave.formula}`}
              aria-label={`Roll Death Saving Throw ${stats.deathSave.formula}`}
              disabled={!props.canRoll}
              onClick={() => props.onRoll(stats.deathSave!.rollId)}
            >
              <Dices size={14} /> Death Saving Throw
            </button>
          )}
        </div>
      )}
      {stats.initiative && (
        <div className="metric-row">
          <span>Initiative</span>
          <button
            className="ghost-button small"
            type="button"
            title={`Roll initiative: ${stats.initiative.formula}`}
            aria-label={`Roll initiative ${stats.initiative.formula}`}
            disabled={!props.canRoll}
            onClick={() => props.onRoll(stats.initiative!.rollId)}
          >
            <Dices size={14} /> {stats.initiative.formula}
          </button>
        </div>
      )}
      {stats.abilities.map((ability) => (
        <div className="metric-row" key={`core-ability-${ability.key}`}>
          <span>
            {ability.label}
            {ability.score !== undefined ? ` ${formatNumber(ability.score)}` : ""}
            {ability.modifier !== undefined ? ` (${signedModifier(ability.modifier)})` : ""}
          </span>
          <span className="button-row">
            {ability.check && (
              <button
                className="ghost-button small"
                type="button"
                title={`Roll ${ability.label} check: ${ability.check.formula}`}
                aria-label={`Roll ${ability.label} check ${ability.check.formula}`}
                disabled={!props.canRoll}
                onClick={() => props.onRoll(ability.check!.rollId)}
              >
                Check
              </button>
            )}
            {ability.save && (
              <button
                className="ghost-button small"
                type="button"
                title={`Roll ${ability.label} saving throw: ${ability.save.formula}${sourcedD20Description(ability.save) ? `; ${sourcedD20Description(ability.save)}` : ""}`}
                aria-label={`Roll ${ability.label} saving throw ${ability.save.formula}${sourcedD20Description(ability.save) ? `; ${sourcedD20Description(ability.save)}` : ""}`}
                disabled={!props.canRoll}
                onClick={() => props.onRoll(ability.save!.rollId)}
              >
                {sourcedD20ButtonLabel(ability.save)}
              </button>
            )}
          </span>
        </div>
      ))}
      {stats.passives.map((passive) => (
        <div className="metric-row" key={`core-${passive.id}`}>
          <span>{passive.label}</span>
          <strong>{formatNumber(passive.value)}</strong>
        </div>
      ))}
      {stats.skills.length > 0 && (
        <details className="actor-rules-trace-disclosure">
          <summary>Skill checks ({formatNumber(stats.skills.length)})</summary>
          {stats.skills.map((skill) => (
            <div className="metric-row" key={`core-${skill.rollId}`}>
              <span>{skill.label}</span>
              <button
                className="ghost-button small"
                type="button"
                title={`Roll ${skill.label} check: ${skill.formula}`}
                aria-label={`Roll ${skill.label} check ${skill.formula}`}
                disabled={!props.canRoll}
                onClick={() => props.onRoll(skill.rollId)}
              >
                <Dices size={14} /> {skill.formula}
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export function ActorPanel(props: { campaignId: string; actor?: Actor; token?: Token; systemLabel?: string; scene?: Scene; currentUserId: string; actors: Actor[]; tokens: Token[]; combat?: Combat; members: Snapshot["members"]; assets: MapAsset[]; items: Item[]; focusItemId?: string; compendiumEntries: RulesCompendiumEntry[]; compendiumSearch: string; setCompendiumSearch(value: string): void; compendiumStatus: string; actionTargetActorId: string; setActionTargetActorId(value: string): void; actionApplyEffect: boolean; setActionApplyEffect(value: boolean): void; actionConsumeResources: boolean; setActionConsumeResources(value: boolean): void; updateActorHp(actor: Actor, current: number): void; adjustActorHp(actor: Actor, delta: number): void; awardActorXp(actor: Actor, amount: number): Promise<void>; xpProgress?: XpProgressInfo; advancementReady: boolean; onLevelUp(): void; onPreviewRestActor(restType: "short" | "long", options: ActorRestOptions, idempotencyKey: string): Promise<RestPreviewEnvelope>; onRestActor(restType: "short" | "long", options?: ActorRestOptions): void | Promise<void>; onTypedDamageApplied(result: TypedDamageApplyResult): void; updateActorData(actor: Actor, patch: Record<string, unknown>): void; toggleActorCondition(actor: Actor, conditionId: string, options?: { overrideReason?: string }): void; updateItemData(item: Item, patch: Record<string, unknown>): Promise<void>; changeActorAttunement(actor: Actor, item: Item, attuned: boolean, options?: ActorAttunementChangeOptions): Promise<void>; assignItemToActor(item: Item, actor: Actor): Promise<void>; onSpellPreparationApplied(result: Dnd5eSrdSpellPreparationMutationResult): void; updateToken(patch: Partial<Token>): void; onUploadTokenImage(file: File, input?: HTMLInputElement): Promise<void>; targetToken(tokenId: string, targeted: boolean): void; targetTokens(tokenIds: string[], targeted: boolean): void; deleteToken(): void; updateTokenVision(patch: TokenVisionPatch): Promise<boolean>; useActorAction(rollId: string, options?: ActorActionCommitOptions): void; onImportCompendiumEntry(entry: RulesCompendiumEntry): Promise<void>; onPurchaseCompendiumEntry(entry: RulesCompendiumEntry, quantity: number): Promise<void>; onPlaceActor(actor: Actor, placementAttemptId: string): Promise<void>; canCreateToken: boolean; canUpdateActor: boolean; canManageActorRules?: boolean; canAwardActorXp: boolean; canRestActor: boolean; canUpdateToken: boolean; canDeleteToken: boolean; canUseAction: boolean }) {
  const canManageActorRules = props.canManageActorRules ?? Boolean(
    props.members.find((member) => member.userId === props.currentUserId)?.permissions.includes("actor.update")
  );
  const tokenAction = useRetryableAction(`${props.campaignId}:${props.actor?.id ?? "none"}:${props.token?.id ?? "none"}`);
  const [sheetView, setSheetView] = useState<"stats" | "loadout" | "actions" | "compendium">("stats");
  const [loadoutSearch, setLoadoutSearch] = useState("");
  const [loadoutFilter, setLoadoutFilter] = useState<ActorLoadoutFilter>("all");
  const [conditionOverrideReason, setConditionOverrideReason] = useState("");
  const [purchaseQuantities, setPurchaseQuantities] = useState<Record<string, number>>({});
  const [coreStatistics, setCoreStatistics] = useState<{ actorId: string; stats: ActorCoreStatistics } | undefined>();
  const [coreStatisticsLoading, setCoreStatisticsLoading] = useState(false);
  const [actionPreview, setActionPreview] = useState<ActorActionResolutionPreview | undefined>();
  const [actionPreviewStatus, setActionPreviewStatus] = useState("");
  const [actionPreviewRollId, setActionPreviewRollId] = useState("");
  const [actionSaveOutcomes, setActionSaveOutcomes] = useState<Record<string, RulesSaveOutcome>>({});
  const [actionEffectChoice, setActionEffectChoice] = useState("");
  const [weaponMasteryDraft, setWeaponMasteryDraft] = useState(emptyWeaponMasteryDraft);
  const [targetAreaX, setTargetAreaX] = useState("0");
  const [targetAreaY, setTargetAreaY] = useState("0");
  const [targetAreaWidth, setTargetAreaWidth] = useState("1200");
  const [targetAreaHeight, setTargetAreaHeight] = useState("800");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [rulesTraceOpen, setRulesTraceOpen] = useState(false);
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null);
  const tokenImageInputRef = useRef<HTMLInputElement | null>(null);
  const sheetPanel = useMovablePanel(initialActorSheetPanelPosition, initialActorSheetPanelSize, { minWidth: 380, minHeight: 360 });
  const deleteDialogRef = useModalAccessibility<HTMLDivElement>(() => setDeleteDialogOpen(false), { enabled: deleteDialogOpen, initialFocusRef: deleteConfirmRef });
  const commitTokenVisionInput = (input: HTMLInputElement, patch: TokenVisionPatch | undefined, fallback: number) => {
    const restore = () => { if (input.isConnected) input.value = String(fallback); };
    if (!patch) {
      restore();
      return;
    }
    void props.updateTokenVision(patch).then((saved) => { if (!saved) restore(); }, restore);
  };
  useEffect(() => {
    setFullSheetOpen(false);
    setDeleteDialogOpen(false);
  }, [props.token?.id]);
  useEffect(() => {
    const focusedItem = props.items.find((item) => item.id === props.focusItemId);
    if (focusedItem && props.actor && (!focusedItem.actorId || focusedItem.actorId === props.actor.id)) setSheetView("loadout");
  }, [props.actor?.id, props.focusItemId, props.items]);
  useEffect(() => {
    if (!fullSheetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullSheetOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [fullSheetOpen]);
  useEffect(() => {
    if (!props.actor || props.actor.systemId !== "dnd-5e-srd" || !props.canUseAction) {
      setActionPreview(undefined);
      setActionPreviewStatus("");
      return;
    }
    const actorItems = props.items.filter((item) => item.actorId === props.actor?.id);
    const actions = actorActionOptions(props.actor, actorItems);
    const previewAction = actions.find((action) => action.rollId === actionPreviewRollId) ?? actions[0];
    if (!previewAction) {
      setActionPreview(undefined);
      setActionPreviewStatus("");
      return;
    }
    let cancelled = false;
    setActionPreviewStatus("Previewing");
    apiPost<{ resolution?: ActorActionResolutionPreview }>(`/api/v1/campaigns/${props.campaignId}/systems/${props.actor.systemId}/actors/${props.actor.id}/roll`, {
      rollId: previewAction.rollId,
      targetActorId: props.actionTargetActorId || props.actor.id,
      applyEffect: props.actionApplyEffect,
      consumeResources: props.actionConsumeResources,
      saveOutcomes: Object.keys(actionSaveOutcomes).length > 0 ? actionSaveOutcomes : undefined,
      effectChoice: actionEffectChoice || undefined,
      weaponMastery: weaponMasteryUseForSelection(weaponMasterySelectionForAction(props.actor, actorItems, previewAction.rollId), weaponMasteryDraft),
      commit: false
    })
      .then((result) => {
        if (cancelled) return;
        setActionPreview(result.resolution);
        setActionPreviewStatus(result.resolution ? "Preview ready" : "");
      })
      .catch((error) => {
        if (cancelled) return;
        setActionPreview(undefined);
        setActionPreviewStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [props.actor?.id, props.actor?.updatedAt, props.campaignId, props.actionApplyEffect, props.actionConsumeResources, props.actionTargetActorId, props.canUseAction, props.items, actionPreviewRollId, actionSaveOutcomes, actionEffectChoice, weaponMasteryDraft]);
  useEffect(() => {
    setActionSaveOutcomes({});
    setActionEffectChoice("");
    setWeaponMasteryDraft(emptyWeaponMasteryDraft());
  }, [props.actor?.id, props.actionTargetActorId, actionPreviewRollId]);
  const coreStatisticsActorId = props.actor?.id;
  const coreStatisticsActorRevision = props.actor?.updatedAt;
  const coreStatisticsSystemId = props.actor?.systemId;
  const coreStatisticsActorType = props.actor?.type;
  useEffect(() => {
    if (!coreStatisticsActorId || !coreStatisticsSystemId) {
      setCoreStatistics(undefined);
      setCoreStatisticsLoading(false);
      return;
    }
    let cancelled = false;
    setCoreStatisticsLoading(true);
    apiGet<{ quickRolls?: ActorSheetQuickRoll[]; data?: Record<string, unknown> }>(
      `/api/v1/campaigns/${props.campaignId}/systems/${coreStatisticsSystemId}/actors/${coreStatisticsActorId}/sheet`
    )
      .then((sheet) => {
        if (cancelled) return;
        setCoreStatistics({ actorId: coreStatisticsActorId, stats: actorCoreStatistics(sheet, { actorType: coreStatisticsActorType }) });
        setCoreStatisticsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCoreStatistics(undefined);
        setCoreStatisticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.campaignId, coreStatisticsActorId, coreStatisticsSystemId, coreStatisticsActorRevision, coreStatisticsActorType]);
  if (!props.actor) return <div className="panel-empty">No actor selected.</div>;
  const tokenOwnerIds = props.token?.ownerUserIds ?? [];
  const playerOwnerIds = tokenPlayerOwnerIds(props.members);
  const setTokenOwner = (userId: string, checked: boolean) => {
    const nextOwners = new Set(tokenOwnerIds);
    if (checked) nextOwners.add(userId);
    else nextOwners.delete(userId);
    props.updateToken({ ownerUserIds: [...nextOwners].sort() });
  };
  const hp = props.actor.data.hp as { current?: number; max?: number } | undefined;
  const conditions = actorConditionLabels(props.actor);
  const concentration = actorConcentrationLabel(props.actor);
  const rage = actorRageStatus(props.actor);
  const combatState = actorCombatStateLabels(props.actor);
  const actorItems = props.items.filter((item) => item.actorId === props.actor?.id);
  const inventory = actorItems.filter((item) => item.type !== "spell" && item.type !== "talent" && item.type !== "clue" && item.type !== "ritual");
  const spells = actorItems.filter((item) => item.type === "spell");
  const talents = actorItems.filter((item) => item.type === "talent");
  const clues = actorItems.filter((item) => item.type === "clue");
  const rituals = actorItems.filter((item) => item.type === "ritual");
  const tokenImageAssets = props.assets.filter(isUsableImageAsset);
  const tokenGridSize = Math.max(1, props.scene?.gridSize ?? 50);
  const tokenFootprintWidth = props.token ? Math.max(1, Math.round(props.token.width / tokenGridSize)) : 1;
  const tokenFootprintHeight = props.token ? Math.max(1, Math.round(props.token.height / tokenGridSize)) : 1;
  const tokenFootprintLabel = tokenFootprintWidth === tokenFootprintHeight ? `${tokenFootprintWidth}x${tokenFootprintHeight}` : `${tokenFootprintWidth}x${tokenFootprintHeight}`;

  function updateTokenSize(width: number, height: number) {
    const safeWidth = Math.max(1, Math.round(width) || 1);
    const safeHeight = Math.max(1, Math.round(height) || 1);
    if (!props.token || !props.scene) {
      props.updateToken({ width: safeWidth, height: safeHeight });
      return;
    }
    const center = tokenCenter(props.token);
    props.updateToken({ width: safeWidth, height: safeHeight, ...tokenCoordinatesFromCenter(props.scene, safeWidth, safeHeight, center.x, center.y) });
  }

  function setTokenFootprint(cells: number) {
    updateTokenSize(tokenGridSize * cells, tokenGridSize * cells);
  }
  const filteredActorItems = filterActorLoadoutItems(actorItems, loadoutSearch, loadoutFilter);
  const resources = actorResourceLabels(props.actor);
  const resourceControls = actorResourceControls(props.actor);
  const actionOptions = actorActionOptions(props.actor, actorItems);
  const actionLabels = actionOptions.map((option) => option.description);
  const firstAction = actionOptions[0];
  const previewAction = actionOptions.find((action) => action.rollId === actionPreviewRollId) ?? firstAction;
  const previewWeaponMasterySelection = previewAction ? weaponMasterySelectionForAction(props.actor, actorItems, previewAction.rollId) : undefined;
  const previewWeaponMasteryUse = weaponMasteryUseForSelection(previewWeaponMasterySelection, weaponMasteryDraft);
  const previewActionSupportsEffect = actorActionSupportsEffect(previewAction);
  const requiredPendingSaves = actionPreview?.pendingSaves?.filter((save) => save.requiredForCommit === true) ?? [];
  const missingRequiredSaveOutcomes = requiredPendingSaves.some((save) => !actionSaveOutcomes[save.actorId]);
  const actionPreviewRequiresInput = actorActionPreviewRequiresInput(actionPreview, {
    applyEffect: props.actionApplyEffect,
    missingRequiredSaveOutcomes,
    effectChoice: actionEffectChoice,
  });
  const previewRulesBoundary = rulesBoundaryFromAction(actionPreview, previewActionSupportsEffect, props.actionApplyEffect);
  const actionTargetActorId = props.actionTargetActorId || props.actor.id;
  const selectedActionTarget = props.actors.find((actor) => actor.id === actionTargetActorId) ?? props.actor;
  const actionSaveOutcomePayload = Object.keys(actionSaveOutcomes).length > 0 ? actionSaveOutcomes : undefined;
  const actionEffectChoicePayload = actionEffectChoice || undefined;
  const previewActionCommitOptions: ActorActionCommitOptions = { targetActorId: actionTargetActorId, applyEffect: props.actionApplyEffect, consumeResources: props.actionConsumeResources, saveOutcomes: actionSaveOutcomePayload, effectChoice: actionEffectChoicePayload, weaponMastery: previewWeaponMasteryUse };
  const baseActionCommitOptions: ActorActionCommitOptions = { targetActorId: actionTargetActorId, applyEffect: props.actionApplyEffect, consumeResources: props.actionConsumeResources };
  const commitOptionsForAction = (rollId: string): ActorActionCommitOptions => (rollId === previewAction?.rollId ? previewActionCommitOptions : baseActionCommitOptions);
  const actionSaveActorName = (actorId: string): string => props.actors.find((actor) => actor.id === actorId)?.name ?? actorId;
  const updateActionSaveOutcome = (actorId: string, outcome: RulesSaveOutcome) => setActionSaveOutcomes((current) => ({ ...current, [actorId]: outcome }));
  const sceneTargetTokens = props.token ? props.tokens.filter((token) => token.sceneId === props.token?.sceneId) : props.tokens;
  const targetedSceneTokens = sceneTargetTokens.filter((token) => token.targetedByUserIds?.includes(props.currentUserId));
  const hostileSceneTokens = sceneTargetTokens.filter((token) => token.disposition === "hostile");
  const targetableSceneTokens = sceneTargetTokens.slice(0, 12);
  const combatants = props.combat?.combatants ?? [];
  const currentCombatant = props.combat && combatants.length > 0 ? combatants[props.combat.turnIndex] ?? combatants[0] : undefined;
  const nextCombatant = props.combat && combatants.length > 1 ? combatants[(props.combat.turnIndex + 1) % combatants.length] : undefined;
  const currentTurnTokenIds = currentCombatant?.tokenId ? [currentCombatant.tokenId] : [];
  const nextTurnTokenIds = nextCombatant?.tokenId ? [nextCombatant.tokenId] : [];
  const areaX = Number(targetAreaX);
  const areaY = Number(targetAreaY);
  const areaWidth = Number(targetAreaWidth);
  const areaHeight = Number(targetAreaHeight);
  const hasTargetArea = [areaX, areaY, areaWidth, areaHeight].every(Number.isFinite) && areaWidth > 0 && areaHeight > 0;
  const areaTargetTokens = hasTargetArea
    ? sceneTargetTokens.filter((token) => {
        const centerX = token.x + token.width / 2;
        const centerY = token.y + token.height / 2;
        return centerX >= areaX && centerX <= areaX + areaWidth && centerY >= areaY && centerY <= areaY + areaHeight;
      })
    : [];
  const areaTargetTokenIds = areaTargetTokens.map((token) => token.id);
  const latestLasso = props.scene?.annotations?.filter((annotation) => annotation.kind === "drawing" && annotation.points.length >= 3).at(-1);
  const lassoTargetTokens = latestLasso
    ? sceneTargetTokens.filter((token) => isPointInsidePoints({ x: token.x + token.width / 2, y: token.y + token.height / 2 }, latestLasso.points))
    : [];
  const lassoTargetTokenIds = lassoTargetTokens.map((token) => token.id);
  const tokenActionTargetOptions = props.tokens
    .filter((token) => token.actorId && (token.id === props.token?.id || token.targetedByUserIds?.includes(props.currentUserId)))
    .map((token) => ({ token, actor: props.actors.find((actor) => actor.id === token.actorId) }))
    .filter((option): option is { token: Token; actor: Actor } => Boolean(option.actor))
    .filter((option, index, options) => options.findIndex((item) => item.actor.id === option.actor.id) === index);
  const selectedActionTargetToken = tokenActionTargetOptions.find((option) => option.actor.id === actionTargetActorId)?.token
    ?? sceneTargetTokens.find((token) => token.actorId === actionTargetActorId);
  const selectedActionCover = sceneCoverOverrideBetween(props.scene, props.token?.id, selectedActionTargetToken?.id);
  const selectedActionCoverLabel = selectedActionCover ? `${coverLevelLabel(selectedActionCover.level)} (manual ruling)` : "No manual cover override";
  const armorClass = (coreStatistics?.actorId === props.actor.id ? coreStatistics.stats.armorClass : undefined) ?? actorArmorClass(props.actor, actorItems);
  const normalizedCompendiumSearch = props.compendiumSearch.trim().toLocaleLowerCase();
  const filteredCompendiumEntries = props.compendiumEntries
    .filter((entry) => !normalizedCompendiumSearch || [entry.name, entry.type, entry.summary, entry.id].some((value) => value.toLocaleLowerCase().includes(normalizedCompendiumSearch)))
    .slice(0, 8);
  const adversary = isAdversaryActor(props.actor, props.tokens);
  const sheetTone = props.token?.disposition ?? (adversary ? "hostile" : "friendly");
  const rollActions = actionOptions.filter((action) => actorActionDiceFormula(action));
  const featureActions = actionOptions.filter((action) => !actorActionDiceFormula(action));
  const activeConditionIds = parseActorConditions(formatActorConditions(props.actor));
  const conditionChipIds = [...new Set([...quickActorConditionIds, ...activeConditionIds])];
  const toggleCondition = (conditionId: string) => {
    const applying = !activeConditionIds.includes(conditionId);
    props.toggleActorCondition(props.actor!, conditionId, applying && conditionOverrideReason.trim()
      ? { overrideReason: conditionOverrideReason.trim() }
      : undefined);
  };
  const renderSheetAction = (action: ActorActionOption) => {
    const formula = actorActionDiceFormula(action);
    return (
      <div className="actor-action-row" key={`full-sheet-action-${action.rollId}`}>
        <div className="actor-action-info">
          <strong>{action.label}</strong>
          <span>{action.description}</span>
          {action.resolutionNote && <span className="admin-status">{action.resolutionNote}</span>}
        </div>
        <button className="ghost-button small" type="button" disabled={!props.canUseAction} onClick={() => props.useActorAction(action.rollId, commitOptionsForAction(action.rollId))}>
          {formula ? <Dices size={14} /> : <WandSparkles size={14} />} {formula ? `Roll ${formula}` : "Use"}
        </button>
      </div>
    );
  };
  return (
    <div className="panel-stack actor-sidebar-summary">
      <header className={`panel-hero actor-hero actor-tone-${sheetTone}`}>
        <div>
          <div className="section-title">{adversary ? "NPC" : "Character"}</div>
          <h2>{props.actor.name}</h2>
          <div className="admin-meta">
            <span title="Rules system">{props.systemLabel ?? props.actor.systemId}</span>
            <span title={props.token ? "Linked token" : undefined}>{props.token ? props.token.name : "No linked token"}</span>
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={() => setFullSheetOpen(true)}>
          <FileText size={16} /> Sheet
        </button>
      </header>
      <RetryableActionNotice
        operation={tokenAction.operation}
        onRetry={tokenAction.retryAction ? () => void tokenAction.retryAction?.() : undefined}
        onDismiss={tokenAction.clearAction}
      />
      <section className="operator-section actor-at-a-glance" aria-label="Actor at a glance">
        <HpBar current={hp?.current} max={hp?.max} canEdit={props.canUpdateActor} onAdjust={(delta) => props.adjustActorHp(props.actor!, delta)} />
        <div className="actor-vitals-row">
          <span className="actor-vital" title={armorClass?.label ? `Armor class - ${armorClass.label}` : "Armor class"}>
            <Shield size={13} aria-hidden="true" /> AC {armorClass ? armorClass.value : "?"}
          </span>
          {resources.map((resource) => (
            <span className="actor-vital" key={resource}>{resource}</span>
          ))}
          {conditions.map((condition) => (
            <span className="actor-vital actor-vital-condition" key={condition}>{condition}</span>
          ))}
          {concentration && <span className="actor-vital actor-vital-condition" aria-label="Active concentration">Concentrating: {concentration}</span>}
          {rage && <span className="actor-vital actor-vital-condition" aria-label="Active Rage">{rage.label}</span>}
          {combatState.map((state) => (
            <span className="actor-vital actor-vital-muted" key={state}>{state}</span>
          ))}
        </div>
      </section>
      {fullSheetOpen && (
        <aside className={`actor-sheet-popout movable-panel actor-tone-${sheetTone}`} role="dialog" aria-labelledby={`actor-full-sheet-title-${props.actor.id}`} style={sheetPanel.style} {...sheetPanel.panelProps}>
          <header className="actor-sheet-header floating-panel-header" title="Drag panel" {...sheetPanel.dragHandleProps}>
            <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
            <div className="actor-sheet-title">
              <div className="section-title">{adversary ? "NPC Sheet" : "Character Sheet"}</div>
              <h2 id={`actor-full-sheet-title-${props.actor.id}`}>{props.actor.name}</h2>
            </div>
            <span className="actor-sheet-ac" title={armorClass?.label ? `Armor class - ${armorClass.label}` : "Armor class"}>
              <Shield size={13} aria-hidden="true" /> {armorClass ? armorClass.value : "?"}
            </span>
            <button className="icon-button" type="button" aria-label="Close full character sheet" onClick={() => setFullSheetOpen(false)}>
              <X size={15} />
            </button>
          </header>
          <div className="actor-sheet-body">
            <section className="actor-sheet-section" aria-label="Full sheet stats">
              <HpBar current={hp?.current} max={hp?.max} canEdit={props.canUpdateActor} onAdjust={(delta) => props.adjustActorHp(props.actor!, delta)} />
              {coreStatistics?.actorId === props.actor.id && (
                <CoreStatisticsSection
                  stats={coreStatistics.stats}
                  canRoll={props.canUseAction}
                  onRoll={(rollId) => props.useActorAction(rollId, { consumeResources: false })}
                />
              )}
              {(conditions.length > 0 || resources.length > 0 || combatState.length > 0 || Boolean(rage) || Boolean(concentration)) && (
                <div className="actor-vitals-row">
                  {resources.map((resource) => (
                    <span className="actor-vital" key={`sheet-resource-${resource}`}>{resource}</span>
                  ))}
                  {conditions.map((condition) => (
                    <span className="actor-vital actor-vital-condition" key={`sheet-condition-${condition}`}>{condition}</span>
                  ))}
                  {concentration && <span className="actor-vital actor-vital-condition" aria-label="Active concentration">Concentrating: {concentration}</span>}
                  {rage && <span className="actor-vital actor-vital-condition" aria-label="Active Rage">{rage.label}</span>}
                  {combatState.map((state) => (
                    <span className="actor-vital actor-vital-muted" key={`sheet-state-${state}`}>{state}</span>
                  ))}
                </div>
              )}
            </section>
            {actorItems.length > 0 && (
              <section className="actor-sheet-section" aria-label="Full sheet loadout">
                <div className="actor-sheet-subheading">
                  <span>Loadout</span>
                  <strong>{formatNumber(actorItems.length)}</strong>
                </div>
                <div className="placement-list">
                  {filteredActorItems.slice(0, 16).map((item) => (
                    <span className="placement-chip" key={`full-sheet-item-${item.id}`}>
                      <Boxes size={14} />
                      <span>{itemDisplayLabel(item)}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section className="actor-sheet-section" aria-label="Full sheet actions">
              {actionOptions.length === 0 && <div className="empty-state compact">No actions available.</div>}
              {rollActions.length > 0 && (
                <>
                  <div className="actor-sheet-subheading">
                    <span>Rolls</span>
                    <strong>{formatNumber(rollActions.length)}</strong>
                  </div>
                  {rollActions.slice(0, 10).map(renderSheetAction)}
                </>
              )}
              {featureActions.length > 0 && (
                <>
                  <div className="actor-sheet-subheading">
                    <span>Features</span>
                    <strong>{formatNumber(featureActions.length)}</strong>
                  </div>
                  {featureActions.slice(0, 10).map(renderSheetAction)}
                </>
              )}
            </section>
            <section className="actor-sheet-section" aria-label="Full sheet targeting">
              <div className="actor-sheet-subheading">
                <span>Targeting</span>
                <strong>{formatNumber(targetedSceneTokens.length)} marked</strong>
              </div>
              <div className="metric-row">
                <span>Action target</span>
                <strong>{selectedActionTarget.name}</strong>
              </div>
              <div className="metric-row">
                <span>Cover ruling</span>
                <strong title={selectedActionCover?.note}>{selectedActionCoverLabel}</strong>
              </div>
              {tokenActionTargetOptions.length > 0 && (
                <div className="button-row">
                  {tokenActionTargetOptions.slice(0, 4).map(({ token, actor }) => (
                    <button className={actionTargetActorId === actor.id ? "ghost-button small active" : "ghost-button small"} key={`full-sheet-target-${actor.id}`} type="button" disabled={!props.canUseAction} onClick={() => props.setActionTargetActorId(actor.id)}>
                      <MapPin size={14} /> {actor.name}
                      {token.targetedByUserIds?.includes(props.currentUserId) ? " (marked)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
          <button className="floating-panel-resize-handle" type="button" aria-label="Resize character sheet" title="Resize panel" {...sheetPanel.resizeHandleProps}>
            <Grip size={13} aria-hidden="true" />
          </button>
        </aside>
      )}
      {props.canCreateToken && (
      <section className="operator-section placement-tray" aria-label="Actor placement tray">
        <div className="operator-heading">
          <div className="section-title">Place actors</div>
          <strong>click or drag</strong>
        </div>
        <div className="placement-list">
          {props.actors.slice(0, 8).map((actor) => (
            <button
              className="placement-chip"
              key={actor.id}
              type="button"
              draggable={props.canCreateToken}
              aria-label={`Place ${actor.name} actor on scene`}
              title={props.canCreateToken ? "Click to place in the party staging area, or drag to an exact board position" : "Requires token.create"}
              disabled={!props.canCreateToken}
              onClick={() => {
                const placementAttemptId = globalThis.crypto.randomUUID();
                void tokenAction.runAction(`Place ${actor.name} on scene`, () => props.onPlaceActor(actor, placementAttemptId));
              }}
              onDragStart={(event) => {
                writeTokenDropData(event.dataTransfer, { type: "actor", id: actor.id, actorId: actor.id, name: actor.name, disposition: "friendly" });
                setTokenDropPreview(event.dataTransfer, actor.name);
              }}
            >
              <Users size={14} />
              <span>{actor.name}</span>
            </button>
          ))}
        </div>
      </section>
      )}
      <div className="tabs" role="tablist" aria-label="Actor sheet views">
        <button className={sheetView === "stats" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "stats"} onClick={() => setSheetView("stats")}>
          Stats
        </button>
        <button className={sheetView === "loadout" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "loadout"} onClick={() => setSheetView("loadout")}>
          Loadout
        </button>
        <button className={sheetView === "actions" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "actions"} onClick={() => setSheetView("actions")}>
          Actions
        </button>
        <button className={sheetView === "compendium" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "compendium"} onClick={() => setSheetView("compendium")}>
          Compendium
        </button>
      </div>
      {sheetView === "stats" && (
        <section className="operator-section" aria-label="Actor stats sheet">
          {coreStatisticsLoading && !coreStatistics && <div className="empty-state compact">Loading core statistics...</div>}
          {coreStatistics?.actorId === props.actor.id && (
            <CoreStatisticsSection
              stats={coreStatistics.stats}
              canRoll={props.canUseAction}
              onRoll={(rollId) => props.useActorAction(rollId, { consumeResources: false })}
            />
          )}
          {props.actor.systemId === "dnd-5e-srd" && (
            <HeroicInspirationCard campaignId={props.campaignId} actor={props.actor} actors={props.actors} canManage={canManageActorRules} canReroll={props.canUseAction} />
          )}
          <div className="metric-row">
            <span>Armor class</span>
            <strong>{armorClass ? (armorClass.label ? `${armorClass.value} - ${armorClass.label}` : String(armorClass.value)) : "n/a"}</strong>
          </div>
          {resourceControls.map((resource) => (
            <div className="metric-row" key={`stats-resource-${resource.key}`}>
              <span>{resource.label}</span>
              <strong>{formatNumber(resource.current)}</strong>
            </div>
          ))}
          <div className="sheet-row">
            <label htmlFor="actor-hp-tab">Set HP</label>
            <input id="actor-hp-tab" aria-label="Actor sheet current HP" key={`sheet:${props.actor.id}:${hp?.current ?? 0}`} type="number" defaultValue={hp?.current ?? 0} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorHp(props.actor!, Number(event.currentTarget.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          </div>
          {props.xpProgress && (
            <div className="xp-row">
              <div className="xp-bar" role="meter" aria-label={`Experience ${props.xpProgress.xp}${props.xpProgress.nextLevelXp ? ` of ${props.xpProgress.nextLevelXp}` : ""}`} aria-valuemin={props.xpProgress.previousLevelXp} aria-valuemax={props.xpProgress.nextLevelXp ?? props.xpProgress.xp} aria-valuenow={props.xpProgress.xp}>
                <div className="xp-bar-fill" style={{ width: `${props.xpProgress.nextLevelXp ? Math.max(0, Math.min(100, Math.round(((props.xpProgress.xp - props.xpProgress.previousLevelXp) / Math.max(1, props.xpProgress.nextLevelXp - props.xpProgress.previousLevelXp)) * 100))) : 100}%` }} />
                <span className="xp-bar-value">XP {formatNumber(props.xpProgress.xp)}{props.xpProgress.nextLevelXp !== undefined ? ` / ${formatNumber(props.xpProgress.nextLevelXp)}` : ""}</span>
              </div>
              {props.advancementReady && (
                <button className="ghost-button level-up-button" type="button" onClick={() => props.onLevelUp()}>
                  <ChevronUp size={14} /> Level Up
                </button>
              )}
              {props.canAwardActorXp && (
                <form className="xp-award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("xp-award-amount") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount !== 0) void tokenAction.runAction(`Award ${props.actor!.name} XP`, async () => { await props.awardActorXp(props.actor!, amount); input.value = ""; }); }}>
                  <input name="xp-award-amount" aria-label="Award XP amount" type="number" placeholder="XP" />
                  <button className="ghost-button small" type="submit">Award</button>
                </form>
              )}
            </div>
          )}
          <HitDiceRestCard actor={props.actor} canRest={props.canRestActor} onPreviewRest={props.onPreviewRestActor} onRest={props.onRestActor} />
          {props.actor.systemId === "dnd-5e-srd" && <TypedDamageCard campaignId={props.campaignId} actor={props.actor} actors={props.actors} canApply={props.canUpdateActor} onApplied={props.onTypedDamageApplied} />}
          <div className="condition-quick-chips" role="group" aria-label="Toggle common conditions">
            {conditionChipIds.map((conditionId) => (
              <button
                className={activeConditionIds.includes(conditionId) ? "condition-chip active" : "condition-chip"}
                key={`condition-chip-${conditionId}`}
                type="button"
                aria-pressed={activeConditionIds.includes(conditionId)}
                disabled={!props.canUpdateActor}
                onClick={() => toggleCondition(conditionId)}
              >
                {titleCaseLabel(conditionId)}
              </button>
            ))}
          </div>
          {props.actor.systemId === "dnd-5e-srd" && canManageActorRules && (
            <label>
              <span>Optional condition-immunity override</span>
              <input
                aria-label="Condition immunity override reason"
                type="text"
                maxLength={500}
                value={conditionOverrideReason}
                placeholder="Document the specific effect or table ruling"
                onChange={(event) => setConditionOverrideReason(event.currentTarget.value)}
              />
            </label>
          )}
          <div className="sheet-row">
            <label htmlFor="actor-conditions-tab">Custom conditions</label>
            <input id="actor-conditions-tab" aria-label="Actor sheet conditions" key={formatActorConditions(props.actor)} defaultValue={formatActorConditions(props.actor)} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { conditions: parseActorConditions(event.currentTarget.value) })} />
          </div>
          <details className="actor-rules-trace-disclosure" onToggle={(event) => setRulesTraceOpen(event.currentTarget.open)}>
            <summary>Rules trace &amp; calculation sources</summary>
            {rulesTraceOpen && <CalculationExplanationPanel campaignId={props.campaignId} actor={props.actor} canManageOverrides={props.canUpdateActor} />}
          </details>
        </section>
      )}
      {sheetView === "loadout" && (
        <>
          <ActorLoadoutPanel
            actor={props.actor}
            actors={props.actors}
            items={props.items}
            requestedItemId={props.focusItemId}
            search={loadoutSearch}
            filter={loadoutFilter}
            canUpdateActor={props.canUpdateActor}
            canManageActorRules={canManageActorRules}
            onSearchChange={setLoadoutSearch}
            onFilterChange={setLoadoutFilter}
            updateItemData={props.updateItemData}
            changeActorAttunement={props.changeActorAttunement}
            assignItemToActor={props.assignItemToActor}
            onSpellPreparationApplied={props.onSpellPreparationApplied}
          />
          {props.actor.systemId === "dnd-5e-srd" && (
            <LazyDndInventoryCommercePanel
              campaignId={props.campaignId}
              actor={props.actor}
              combat={props.combat}
              canUpdateActor={props.canUpdateActor}
              canManageCampaign={props.members.some((member) => member.userId === props.currentUserId && (member.role === "gm" || member.role === "assistant_gm"))}
              canManageCombat={props.members.some((member) => member.userId === props.currentUserId && (member.role === "gm" || member.role === "assistant_gm"))}
            />
          )}
        </>
      )}
      {sheetView === "actions" && (
        <section className="operator-section" aria-label="Actor action sheet">
          <div className="operator-heading">
            <div className="section-title">Actions</div>
            <strong>{formatNumber(actionOptions.length)}</strong>
          </div>
          {actionOptions.length === 0 ? (
            <div className="empty-state compact">No system actions are currently available.</div>
          ) : (
            <>
              <div className="asset-pressure-list" role="region" aria-label="Action resolution preview">
                <div className="operator-row tool-call-row">
                  <span>Previewed action</span>
                  <strong>{previewAction?.label ?? "No action"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Target actor</span>
                  <strong>{selectedActionTarget.name}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Cover ruling</span>
                  <strong title={selectedActionCover?.note}>{selectedActionCoverLabel}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Marked tokens</span>
                  <strong>{formatNumber(targetedSceneTokens.length)}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Effect mode</span>
                  <strong>{props.actionApplyEffect ? "apply damage/healing" : "roll only"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Effect support</span>
                  <strong>{previewAction ? (previewActionSupportsEffect ? "supported" : "roll only") : "no action"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Resources</span>
                  <strong>{props.actionConsumeResources ? "consume resources" : "do not consume"}</strong>
                </div>
                {actionPreviewStatus && (
                  <div className="operator-row tool-call-row">
                    <span>Resolver</span>
                    <strong>{actionPreviewStatus}</strong>
                  </div>
                )}
                {actionPreview?.rolls?.[0] && (
                  <div className="operator-row tool-call-row">
                    <span>Roll preview</span>
                    <strong>{actionPreview.rolls[0].d20Mode ? `${actionPreview.rolls[0].formula} (${sourcedD20Description(actionPreview.rolls[0])})` : actionPreview.rolls[0].formula}</strong>
                  </div>
                )}
                {actionPreview?.action?.ledger && (
                  <div className="operator-row tool-call-row">
                    <span>Action availability</span>
                    <strong>{Math.max(0, 1 + actionPreview.action.ledger.actionSurgeGrants - actionPreview.action.ledger.actionsUsed)} remaining this turn</strong>
                  </div>
                )}
                <WeaponMasteryControls
                  selection={previewWeaponMasterySelection}
                  draft={weaponMasteryDraft}
                  actors={props.actors}
                  sourceActorId={props.actor.id}
                  primaryTargetActorId={actionTargetActorId}
                  disabled={!props.canUseAction}
                  onChange={setWeaponMasteryDraft}
                />
                {actionPreview?.weaponMastery && (
                  <div className="operator-row tool-call-row" role="status" aria-label="Weapon Mastery resolution">
                    <span>{titleCaseLabel(actionPreview.weaponMastery.property)} Weapon Mastery</span>
                    <strong>{titleCaseLabel(actionPreview.weaponMastery.capability)} / {titleCaseLabel(actionPreview.weaponMastery.status)}</strong>
                    <small>{actionPreview.weaponMastery.message}</small>
                    {actionPreview.weaponMastery.geometry && <small>Geometry inferred: no; reviewed: {actionPreview.weaponMastery.geometry.confirmedByUser ? "yes" : "no"}. {actionPreview.weaponMastery.geometry.instruction}</small>}
                    <small><a href={actionPreview.weaponMastery.sourceUrl} target="_blank" rel="noreferrer">{actionPreview.weaponMastery.source}, page {formatNumber(actionPreview.weaponMastery.sourcePage)}</a></small>
                  </div>
                )}
                {previewAction && <RulesSupportBoundaryNotice boundary={previewRulesBoundary} />}
                {actionPreview?.resourceConsumption && actionPreview.resourceConsumption.length > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Spend</span>
                    <strong>{actionPreview.resourceConsumption.map((resource) => `${resource.label} ${resource.amount} (${resource.remaining} left)`).join(", ")}</strong>
                  </div>
                )}
                {actionPreview?.conditions && actionPreview.conditions.length > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Conditions</span>
                    <strong>{actionPreview.conditions.map((condition) => condition.conditionName ?? condition.operation).join(", ")}</strong>
                  </div>
                )}
                {actionPreview?.pendingSaves?.map((save) => (
                  <div className="operator-row tool-call-row" key={`action-save-${save.actorId}-${save.ability}-${save.reason}`}>
                    <span>{actionSaveActorName(save.actorId)} {titleCaseLabel(save.ability)} save{save.dc ? ` DC ${save.dc}` : ""}</span>
                    {save.requiredForCommit === true ? (
                      <div className="button-row" role="group" aria-label={`${actionSaveActorName(save.actorId)} ${save.ability} save outcome`}>
                        <button className={actionSaveOutcomes[save.actorId] === "success" ? "ghost-button active" : "ghost-button"} type="button" aria-pressed={actionSaveOutcomes[save.actorId] === "success"} onClick={() => updateActionSaveOutcome(save.actorId, "success")}>
                          <Check size={14} /> Success
                        </button>
                        <button className={actionSaveOutcomes[save.actorId] === "failure" ? "ghost-button active" : "ghost-button"} type="button" aria-pressed={actionSaveOutcomes[save.actorId] === "failure"} onClick={() => updateActionSaveOutcome(save.actorId, "failure")}>
                          <X size={14} /> Failure
                        </button>
                      </div>
                    ) : (
                      <strong>{save.reason}</strong>
                    )}
                  </div>
                ))}
                {actionPreview?.pendingReactions && actionPreview.pendingReactions.length > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Reactions</span>
                    <strong>{actionPreview.pendingReactions.map((reaction) => reaction.reason).join(", ")}</strong>
                  </div>
                )}
                {actionPreview?.attunement && actionPreview.attunement.overLimitBy > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Attunement</span>
                    <strong>{actionPreview.attunement.attunedItemIds.length}/{actionPreview.attunement.limit}</strong>
                  </div>
                )}
                {previewAction && <p>{previewAction.description}</p>}
                {previewAction && props.actionApplyEffect && !previewActionSupportsEffect && <p className="admin-status">Effect unsupported: clear Apply action effect to roll this action.</p>}
                {actionPreview?.blocked && <p className="admin-status">{actionPreview.blocked.reason}</p>}
                {actionPreview?.pendingChoice && (
                  <div className="operator-row tool-call-row">
                    <span>{actionPreview.pendingChoice.reason}</span>
                    <select aria-label="Action effect choice" value={actionEffectChoice} onChange={(event) => setActionEffectChoice(event.target.value)}>
                      <option value="">Choose option</option>
                      {actionPreview.pendingChoice.options.map((option) => (
                        <option key={`action-choice-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {actionPreview?.manualResolutionRequired && <p className="admin-status">Manual resolution required: {actionPreview.manualResolutionRequired.reason}</p>}
                {actionPreviewRequiresInput && <p className="admin-status">Resolve the pending save, required choice, unsupported effect, or Weapon Mastery selection before committing this action.</p>}
                {actionPreview?.warnings?.map((warning) => <p className="admin-status" key={`action-preview-warning-${warning}`}>{warning}</p>)}
                <button className="ghost-button" type="button" disabled={!props.canUseAction || !previewAction || Boolean(actionPreview?.blocked) || actionPreviewRequiresInput || (props.actionApplyEffect && !previewActionSupportsEffect)} onClick={() => previewAction && props.useActorAction(previewAction.rollId, previewActionCommitOptions)}>
                  <WandSparkles size={14} /> Use previewed action
                </button>
              </div>
              {actionOptions.map((action) => {
                const supportsEffect = actorActionSupportsEffect(action);
                const unsupportedEffect = props.actionApplyEffect && !supportsEffect;
                const isPreviewed = action.rollId === previewAction?.rollId;
                const previewBlocked = isPreviewed ? actionPreview?.blocked : undefined;
                const previewRequiresInput = isPreviewed ? actionPreviewRequiresInput : false;
                return (
                  <article className="operator-item admin-item" key={action.rollId}>
                    <strong>{action.label}</strong>
                    <p>{action.description}</p>
                    {action.resolutionNote && <p className="admin-status">{action.resolutionNote}</p>}
                    <div className="admin-meta">
                      <span>{supportsEffect ? "effect supported" : "roll only action"}</span>
                    </div>
                    {unsupportedEffect && <p className="admin-status">Effect unsupported: clear Apply action effect to roll this action.</p>}
                    {previewBlocked && <p className="admin-status">{previewBlocked.reason}</p>}
                    {previewRequiresInput && <p className="admin-status">Resolve pending inputs before committing.</p>}
                    <div className="button-row">
                      <button className={isPreviewed ? "ghost-button active" : "ghost-button"} type="button" aria-pressed={isPreviewed} disabled={!props.canUseAction} onClick={() => setActionPreviewRollId(action.rollId)}>
                        <Eye size={14} /> Preview
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUseAction || unsupportedEffect || Boolean(previewBlocked) || previewRequiresInput} onClick={() => props.useActorAction(action.rollId, commitOptionsForAction(action.rollId))}>
                        <WandSparkles size={14} /> Use action
                      </button>
                    </div>
                  </article>
                );
              })}
            </>
          )}
        </section>
      )}
      <details className="operator-section actor-detail-disclosure actor-token-editor">
        <summary>Token settings</summary>
      </details>
      <div className="operator-section actor-detail-body actor-token-editor-body">
      <div className="metric-row">
        <span>Token</span>
        <strong>{props.token?.name ?? "Unlinked"}</strong>
      </div>
      {props.token && (
        <>
          <div className="metric-row">
            <span>Vision</span>
            <strong>{props.token.visionEnabled ? `${formatNumber(props.token.brightVisionRadius ?? 0)} bright / ${formatNumber(props.token.dimVisionRadius ?? props.token.visionRadius)} dim${props.token.senses?.length ? ` / ${props.token.senses.map((sense) => `${sense.type} ${formatNumber(sense.range)}`).join(", ")}` : ""}` : "disabled"}</strong>
          </div>
          <div className="metric-row">
            <span>Token State</span>
            <strong>{[tokenLayerLabel(tokenLayer(props.token)), ...(props.token.conditions?.map((condition) => condition.name) ?? []), ...(props.token.auras?.map((aura) => `${aura.name} ${aura.radius}`) ?? []), ...(props.token.ownerUserIds?.length ? [`Owners ${props.token.ownerUserIds.length}`] : []), ...(props.token.targetedByUserIds?.length ? [`Targeted ${props.token.targetedByUserIds.length}`] : [])].join(", ") || "Ready"}</strong>
          </div>
          <div className="inspector-grid" key={`${props.token.id}-${props.token.x}-${props.token.y}-${props.token.width}-${props.token.height}-${props.token.imageAssetId ?? "marker"}`}>
            <label>
              <span>Name</span>
              <input aria-label="Token inspector name" defaultValue={props.token.name} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ name: event.currentTarget.value.trim() || props.token!.name })} />
            </label>
            <label>
              <span>Actor</span>
              <select aria-label="Token inspector actor" value={props.token.actorId ?? ""} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ actorId: event.target.value || undefined })}>
                <option value="">Unlinked</option>
                {props.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sheet-row">
              <span>Owners</span>
              <div className="inline-options" aria-label="Token owners">
                {props.members.map((member) => (
                  <label className="inline-check" key={member.userId}>
                    <input type="checkbox" checked={tokenOwnerIds.includes(member.userId)} disabled={!props.canUpdateToken} onChange={(event) => setTokenOwner(member.userId, event.target.checked)} />
                    <span>{member.user.displayName || member.user.email || member.role}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sheet-row token-permission-presets" aria-label="Token permission presets">
              <span>Permission Presets</span>
              <strong>{tokenPermissionPresetLabel(props.token, playerOwnerIds)}</strong>
              <div className="button-row">
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => props.updateToken({ ownerUserIds: [], locked: true, hidden: false })}>
                  <LockKeyhole size={14} /> GM locked
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken || playerOwnerIds.length === 0} onClick={() => props.updateToken({ ownerUserIds: playerOwnerIds, locked: false, hidden: false })}>
                  <Users size={14} /> Party controlled
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => props.updateToken({ ownerUserIds: [], locked: false, hidden: false })}>
                  <Eye size={14} /> Target only
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => props.updateToken({ ownerUserIds: [], locked: true, hidden: true })}>
                  <Shield size={14} /> Hidden hold
                </button>
              </div>
            </div>
            <label>
              <span>Disposition</span>
              <select aria-label="Token inspector disposition" value={props.token.disposition} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ disposition: event.target.value as Token["disposition"] })}>
                <option value="friendly">Friendly</option>
                <option value="neutral">Neutral</option>
                <option value="hostile">Hostile</option>
              </select>
            </label>
            <label>
              <span>Image</span>
              <select aria-label="Token image asset" value={props.token.imageAssetId ?? ""} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ imageAssetId: event.target.value || undefined })}>
                <option value="">Default marker</option>
                {tokenImageAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Layer</span>
              <select aria-label="Token layer" value={tokenLayer(props.token)} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ layer: event.target.value as TokenLayer })}>
                {tokenLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="token-image-actions">
              <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => tokenImageInputRef.current?.click()}>
                <Upload size={14} /> Upload image
              </button>
              <input
                ref={tokenImageInputRef}
                aria-label="Upload token image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                hidden
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (file) void tokenAction.runAction(`Upload ${file.name} as token art`, () => props.onUploadTokenImage(file, input));
                }}
              />
            </div>
            <div className="sheet-row token-size-presets" aria-label="Token footprint presets">
              <span>Footprint</span>
              <strong>{tokenFootprintLabel} grid</strong>
              <div className="button-row">
                {[1, 2, 3, 4].map((cells) => (
                  <button className="ghost-button" type="button" key={cells} disabled={!props.canUpdateToken || !props.scene} onClick={() => setTokenFootprint(cells)}>
                    {cells}x{cells}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span>X</span>
              <input aria-label="Token x" type="number" defaultValue={props.token.x} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ x: Number(event.currentTarget.value) })} />
            </label>
            <label>
              <span>Y</span>
              <input aria-label="Token y" type="number" defaultValue={props.token.y} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ y: Number(event.currentTarget.value) })} />
            </label>
            <label>
              <span>Width</span>
              <input aria-label="Token width" type="number" min={1} defaultValue={props.token.width} disabled={!props.canUpdateToken} onBlur={(event) => updateTokenSize(Number(event.currentTarget.value), props.token!.height)} />
            </label>
            <label>
              <span>Height</span>
              <input aria-label="Token height" type="number" min={1} defaultValue={props.token.height} disabled={!props.canUpdateToken} onBlur={(event) => updateTokenSize(props.token!.width, Number(event.currentTarget.value))} />
            </label>
            <label>
              <span>Rotation</span>
              <input
                key={`${props.token.id}:${props.token.rotation}:rotation`}
                aria-label="Token rotation"
                type="number"
                min={0}
                max={359}
                step={1}
                defaultValue={props.token.rotation}
                disabled={!props.canUpdateToken}
                onBlur={(event) => props.updateToken({ rotation: Number(event.currentTarget.value) })}
              />
            </label>
            <label>
              <span>Elevation (ft)</span>
              <input
                key={`${props.token.id}:${props.token.elevation ?? 0}:elevation`}
                aria-label="Token elevation"
                type="number"
                step={1}
                defaultValue={props.token.elevation ?? 0}
                disabled={!props.canUpdateToken}
                onBlur={(event) => props.updateToken({ elevation: Number(event.currentTarget.value) })}
              />
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={props.token.hidden} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ hidden: event.target.checked })} />
              <span>Hidden</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={props.token.locked} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ locked: event.target.checked })} />
              <span>Locked</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={props.token.targetedByUserIds?.includes(props.currentUserId) ?? false} onChange={(event) => props.targetToken(props.token!.id, event.target.checked)} />
              <span>Targeted</span>
            </label>
          </div>
          <section className="operator-section" aria-label="Canvas target manager">
            <div className="operator-heading">
              <div>
                <div className="section-title">Canvas Targets</div>
                <p>My targets {formatNumber(targetedSceneTokens.length)} / {formatNumber(sceneTargetTokens.length)}</p>
                {currentCombatant && <p>Initiative: {currentCombatant.name}{nextCombatant ? ` -> ${nextCombatant.name}` : ""}</p>}
              </div>
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={sceneTargetTokens.length === 0} onClick={() => props.targetTokens(sceneTargetTokens.map((token) => token.id), true)}>
                <Crosshair size={14} /> Target visible
              </button>
              <button className="ghost-button" type="button" disabled={hostileSceneTokens.length === 0} onClick={() => props.targetTokens(hostileSceneTokens.map((token) => token.id), true)}>
                <Swords size={14} /> Target hostiles
              </button>
              <button className="ghost-button" type="button" disabled={targetedSceneTokens.length === 0} onClick={() => props.targetTokens(targetedSceneTokens.map((token) => token.id), false)}>
                <X size={14} /> Clear my targets
              </button>
              <button className="ghost-button" type="button" disabled={currentTurnTokenIds.length === 0} onClick={() => props.targetTokens(currentTurnTokenIds, true)}>
                <Timer size={14} /> Target current turn
              </button>
              <button className="ghost-button" type="button" disabled={nextTurnTokenIds.length === 0} onClick={() => props.targetTokens(nextTurnTokenIds, true)}>
                <ChevronRight size={14} /> Target next turn
              </button>
            </div>
            <div className="admin-form-grid" role="group" aria-label="Canvas target area">
              <label>
                <span>X</span>
                <input aria-label="Target area x" type="number" value={targetAreaX} onChange={(event) => setTargetAreaX(event.target.value)} />
              </label>
              <label>
                <span>Y</span>
                <input aria-label="Target area y" type="number" value={targetAreaY} onChange={(event) => setTargetAreaY(event.target.value)} />
              </label>
              <label>
                <span>Width</span>
                <input aria-label="Target area width" type="number" min={1} value={targetAreaWidth} onChange={(event) => setTargetAreaWidth(event.target.value)} />
              </label>
              <label>
                <span>Height</span>
                <input aria-label="Target area height" type="number" min={1} value={targetAreaHeight} onChange={(event) => setTargetAreaHeight(event.target.value)} />
              </label>
              <div className="admin-meta target-preview" role="status" aria-live="polite" aria-label="Target area preview">
                <span>{formatNumber(areaTargetTokens.length)} tokens in area</span>
                {areaTargetTokens.slice(0, 6).map((token) => (
                  <span key={`area-preview-${token.id}`}>{token.name}</span>
                ))}
                {areaTargetTokens.length > 6 && <span>+{formatNumber(areaTargetTokens.length - 6)} more</span>}
              </div>
              <button className="ghost-button" type="button" disabled={areaTargetTokenIds.length === 0} onClick={() => props.targetTokens(areaTargetTokenIds, true)}>
                <Pentagon size={14} /> Target area
              </button>
              <button className="ghost-button" type="button" disabled={areaTargetTokenIds.length === 0} onClick={() => props.targetTokens(areaTargetTokenIds, false)}>
                <Eraser size={14} /> Clear area targets
              </button>
            </div>
            <div className="admin-meta target-preview" role="status" aria-live="polite" aria-label="Latest drawing lasso preview">
              <span>{latestLasso ? `${formatNumber(lassoTargetTokens.length)} tokens in lasso` : "Draw a lasso on the canvas"}</span>
              {lassoTargetTokens.slice(0, 6).map((token) => (
                <span key={`lasso-preview-${token.id}`}>{token.name}</span>
              ))}
              {lassoTargetTokens.length > 6 && <span>+{formatNumber(lassoTargetTokens.length - 6)} more</span>}
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={lassoTargetTokenIds.length === 0} onClick={() => props.targetTokens(lassoTargetTokenIds, true)}>
                <PencilLine size={14} /> Target lasso
              </button>
              <button className="ghost-button" type="button" disabled={lassoTargetTokenIds.length === 0} onClick={() => props.targetTokens(lassoTargetTokenIds, false)}>
                <Eraser size={14} /> Clear lasso targets
              </button>
            </div>
            <div className="placement-list">
              {targetableSceneTokens.map((token) => {
                const actor = token.actorId ? props.actors.find((item) => item.id === token.actorId) : undefined;
                const targeted = token.targetedByUserIds?.includes(props.currentUserId) ?? false;
                return (
                  <button className={targeted ? "placement-chip active" : "placement-chip"} key={`target-${token.id}`} type="button" onClick={() => props.targetToken(token.id, !targeted)}>
                    <Crosshair size={14} />
                    <span>{token.name}{actor && actor.name !== token.name ? ` / ${actor.name}` : ""}</span>
                    {targeted ? <strong>marked</strong> : null}
                  </button>
                );
              })}
            </div>
          </section>
          <label className="sheet-row">
            <span>Conditions</span>
            <input aria-label="Token conditions" defaultValue={formatTokenConditions(props.token)} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ conditions: parseTokenConditions(event.currentTarget.value) })} />
          </label>
          <label className="sheet-row">
            <span>Auras</span>
            <input aria-label="Token auras" defaultValue={formatTokenAuras(props.token)} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ auras: parseTokenAuras(event.currentTarget.value) })} />
          </label>
          <label className="sheet-row">
            <span>Notes</span>
            <textarea aria-label="Token notes" defaultValue={props.token.notes ?? ""} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ notes: event.currentTarget.value })} />
          </label>
          <div className="sheet-row">
            <label htmlFor="token-vision-enabled">Token vision</label>
            <input id="token-vision-enabled" type="checkbox" checked={props.token.visionEnabled} disabled={!props.canUpdateToken} onChange={(event) => { void props.updateTokenVision({ visionEnabled: event.target.checked }); }} />
          </div>
          <div className="sheet-row">
            <label htmlFor="token-dim-vision">Dim vision radius</label>
            <input key={`dim-vision:${props.token.id}:${props.token.dimVisionRadius ?? props.token.visionRadius}`} id="token-dim-vision" type="number" min={0} defaultValue={props.token.dimVisionRadius ?? props.token.visionRadius} disabled={!props.canUpdateToken || !props.token.visionEnabled} onBlur={(event) => commitTokenVisionInput(event.currentTarget, tokenDimVisionPatch(event.currentTarget.value), props.token!.dimVisionRadius ?? props.token!.visionRadius)} />
          </div>
          <div className="sheet-row">
            <label htmlFor="token-bright-vision">Bright vision radius</label>
            <input key={`bright-vision:${props.token.id}:${props.token.brightVisionRadius ?? 0}`} id="token-bright-vision" type="number" min={0} defaultValue={props.token.brightVisionRadius ?? 0} disabled={!props.canUpdateToken || !props.token.visionEnabled} onBlur={(event) => commitTokenVisionInput(event.currentTarget, tokenBrightVisionPatch(event.currentTarget.value), props.token!.brightVisionRadius ?? 0)} />
          </div>
          <div className="sheet-row token-senses-row">
            <label htmlFor="token-senses">Typed senses</label>
            <input
              key={`token-senses:${props.token.id}:${formatTokenSenses(props.token)}`}
              id="token-senses"
              aria-label="Token typed senses"
              placeholder="darkvision:60, blindsight:10"
              defaultValue={formatTokenSenses(props.token)}
              disabled={!props.canUpdateToken || !props.token.visionEnabled}
              onBlur={(event) => {
                const senses = parseTokenSenses(event.currentTarget.value);
                if (senses === undefined) {
                  event.currentTarget.value = formatTokenSenses(props.token);
                  return;
                }
                props.updateToken({ senses });
              }}
            />
          </div>
          <button className="ghost-button wide" onClick={() => setDeleteDialogOpen(true)} disabled={!props.canDeleteToken}>
            <X size={16} /> Delete Token
          </button>
          {deleteDialogOpen && props.token && (
            <div className="modal-backdrop" role="presentation">
              <div ref={deleteDialogRef} className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="token-delete-dialog-title" aria-describedby="token-delete-dialog-description" tabIndex={-1}>
                <div className="section-title" id="token-delete-dialog-title">Confirm token deletion</div>
                <p id="token-delete-dialog-description">Delete {props.token.name} from {props.scene?.name ?? "the current scene"}. This removes the token from the scene and keeps the actor sheet.</p>
                <div className="admin-actions">
                  <button className="ghost-button danger-button" type="button" ref={deleteConfirmRef} onClick={() => {
                    setDeleteDialogOpen(false);
                    props.deleteToken();
                  }}>
                    <X size={16} /> Confirm Delete Token
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setDeleteDialogOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
        </div>
      <details className="operator-section actor-detail-disclosure">
        <summary>Actor details</summary>
      </details>
      <div className="operator-section actor-detail-body">
      <div className="metric-row">
        <span>HP</span>
        <strong>
          {hp?.current ?? "?"}/{hp?.max ?? "?"}
        </strong>
      </div>
      {armorClass && (
        <div className="metric-row">
          <span>AC</span>
          <strong>{armorClass.label ? `${armorClass.value} (${armorClass.label})` : armorClass.value}</strong>
        </div>
      )}
      {conditions.length > 0 && (
        <div className="metric-row">
          <span>Conditions</span>
          <strong>{conditions.join(", ")}</strong>
        </div>
      )}
      {combatState.length > 0 && (
        <div className="metric-row">
          <span>Combat State</span>
          <strong>{combatState.join(" - ")}</strong>
        </div>
      )}
      {resources.length > 0 && (
        <div className="metric-row">
          <span>Resources</span>
          <strong>{resources.join(", ")}</strong>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="metric-row">
          <span>Inventory</span>
          <strong>{inventory.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {spells.length > 0 && (
        <div className="metric-row">
          <span>Spells</span>
          <strong>{spells.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {talents.length > 0 && (
        <div className="metric-row">
          <span>Talents</span>
          <strong>{talents.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {clues.length > 0 && (
        <div className="metric-row">
          <span>Clues</span>
          <strong>{clues.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {rituals.length > 0 && (
        <div className="metric-row">
          <span>Rituals</span>
          <strong>{rituals.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {actionLabels.length > 0 && (
        <div className="metric-row">
          <span>Actions</span>
          <strong>{actionLabels.join(", ")}</strong>
        </div>
      )}
      {firstAction && (
        <>
          <label className="sheet-row">
            <span>Action Target</span>
            <select aria-label="Action target actor" value={actionTargetActorId} disabled={!props.canUseAction} onChange={(event) => props.setActionTargetActorId(event.target.value)}>
              {props.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sheet-row" aria-label="Manual cover action review">
            <span>Cover Ruling</span>
            <strong title={selectedActionCover?.note}>{selectedActionCoverLabel}</strong>
          </div>
          {tokenActionTargetOptions.length > 0 && (
            <div className="sheet-row" aria-label="Token action target shortcuts">
              <span>Token Targets</span>
              <div className="button-row">
                {tokenActionTargetOptions.slice(0, 4).map(({ token, actor }) => (
                  <button className={actionTargetActorId === actor.id ? "ghost-button active" : "ghost-button"} key={actor.id} type="button" disabled={!props.canUseAction} onClick={() => props.setActionTargetActorId(actor.id)}>
                    <MapPin size={14} /> Target {actor.name}
                    {token.targetedByUserIds?.includes(props.currentUserId) ? " (marked)" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="inline-check">
            <input aria-label="Apply action effect" type="checkbox" checked={props.actionApplyEffect} disabled={!props.canUseAction} onChange={(event) => props.setActionApplyEffect(event.target.checked)} />
            <span>Apply damage/healing to target</span>
          </label>
          <label className="inline-check">
            <input aria-label="Consume action resources" type="checkbox" checked={props.actionConsumeResources} disabled={!props.canUseAction} onChange={(event) => props.setActionConsumeResources(event.target.checked)} />
            <span>Consume spell slots, item charges, or class resources</span>
          </label>
          <button className="ghost-button wide" onClick={() => previewAction && props.useActorAction(previewAction.rollId, previewActionCommitOptions)} disabled={!props.canUseAction || !previewAction || Boolean(actionPreview?.blocked) || actionPreviewRequiresInput}>
            <WandSparkles size={16} /> Use {previewAction?.label ?? firstAction.label}
          </button>
        </>
      )}
      <div className="sheet-row">
        <label htmlFor="actor-hp">Current HP</label>
        <input id="actor-hp" key={`detail:${props.actor.id}:${hp?.current ?? 0}`} type="number" defaultValue={hp?.current ?? 0} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorHp(props.actor!, Number(event.currentTarget.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      </div>
      <div className="sheet-row">
        <label htmlFor="actor-conditions">Actor conditions</label>
        <input id="actor-conditions" aria-label="Actor conditions" defaultValue={formatActorConditions(props.actor)} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { conditions: parseActorConditions(event.currentTarget.value) })} />
      </div>
      {resourceControls.map((resource) => (
        <div className="sheet-row" key={resource.key}>
          <label htmlFor={`actor-resource-${resource.key}`}>{resource.label}</label>
          <input id={`actor-resource-${resource.key}`} aria-label={`${resource.label} resource current`} type="number" defaultValue={resource.current} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { resources: actorResourceUpdate(props.actor!, resource.key, Number(event.currentTarget.value)) })} />
        </div>
      ))}
        </div>
      {sheetView === "compendium" && (
      <section className="operator-section compendium-browser" aria-label="Actor compendium browser">
        <div className="operator-heading">
          <div>
            <div className="section-title">Compendium</div>
            <p>{formatNumber(props.compendiumEntries.length)} entries for {props.actor.systemId}</p>
          </div>
        </div>
        <label>
          <span>Search</span>
          <input aria-label="Compendium search" value={props.compendiumSearch} placeholder="Spell, item, condition" onChange={(event) => props.setCompendiumSearch(event.target.value)} />
        </label>
        <div className="admin-status" role="status" aria-live="polite">{props.compendiumStatus}</div>
        <div className="compendium-list">
          {filteredCompendiumEntries.length === 0 ? (
            <div className="empty-state compact">No compendium entries match this search.</div>
          ) : (
            filteredCompendiumEntries.map((entry) => {
              const purchasable = isPurchasableCompendiumEntry(props.actor!, entry);
              const purchaseQuantity = purchaseQuantities[entry.id] ?? 1;
              return (
                <article className="compendium-entry" key={entry.id}>
                  <div>
                    <strong>{entry.name}</strong>
                    <p>{entry.summary}</p>
                    <div className="admin-meta">
                      <span>{titleCaseLabel(entry.type)}</span>
                      <span>{entry.id}</span>
                      <span>{entry.provenance.sourceName} v{entry.provenance.contentVersion}</span>
                      <span>{entry.provenance.license.name}</span>
                      {entry.data.level !== undefined && <span>level {String(entry.data.level)}</span>}
                      {entry.data.costGp !== undefined && <span>{formatGp(numericValue(entry.data.costGp, 0))}</span>}
                      {purchasable && <span>{formatGp(numericValue(entry.data.costGp, 0) * purchaseQuantity)} total</span>}
                    </div>
                  </div>
                  <div className="admin-actions">
                    {purchasable && (
                      <label>
                        <span>Qty</span>
                        <input
                          aria-label={`${entry.name} purchase quantity`}
                          type="number"
                          min={1}
                          max={99}
                          value={purchaseQuantity}
                          disabled={!props.canUpdateActor}
                          onChange={(event) => setPurchaseQuantities({ ...purchaseQuantities, [entry.id]: clampNumber(Number(event.target.value), 1, 99) })}
                        />
                      </label>
                    )}
                    <button className="ghost-button" type="button" disabled={!props.canUpdateActor} onClick={() => void props.onImportCompendiumEntry(entry)}>
                      <Plus size={14} /> Add
                    </button>
                    {purchasable && (
                      <button className="ghost-button" type="button" disabled={!props.canUpdateActor} onClick={() => void props.onPurchaseCompendiumEntry(entry, purchaseQuantity)}>
                        <Boxes size={14} /> Purchase
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
      )}
      <details className="operator-section raw-data-details">
        <summary>Raw actor data</summary>
        <pre>{JSON.stringify(props.actor.data, null, 2)}</pre>
      </details>
    </div>
  );
}
