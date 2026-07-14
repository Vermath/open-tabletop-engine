import type { Actor, Dnd5eSrdPendingAdvancement } from "@open-tabletop/core";
import { ChevronLeft, Eye, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage, formatNumber, numericValue, recordValue, stringValue, titleCaseLabel } from "./sheet-format.js";
import { systemAdvancementLabel, type AdvancementOptionInfo } from "./system-actions.js";

export type AdvancementHitPointMode = "fixed" | "roll";

export interface AdvancementFeatInfo {
  id: string;
  name: string;
  category: string;
  summary: string;
  abilityPoints: number;
  abilityChoices: string[];
  maximumScore: number;
}

export interface AdvancementMulticlassOption {
  className: string;
  eligible: boolean;
  reasons: string[];
  nextClassLevel: number;
  grantsFeat: boolean;
  requiresSubclass?: boolean;
  weaponMastery?: AdvancementWeaponMasteryInfo;
}

export interface AdvancementWeaponMasteryOption {
  id: string;
  name: string;
  mastery: string;
}

export interface AdvancementWeaponMasteryInfo {
  className: string;
  nextClassLevel: number;
  requiredCount: number;
  requiresSelection: boolean;
  selectedWeaponIds: string[];
  options: AdvancementWeaponMasteryOption[];
}

export interface AdvancementSubclassOption {
  id: string;
  name: string;
  className: string;
  selectionLevel: number;
  summary?: string;
  featureNames?: string[];
  alwaysPreparedSpells?: string[];
}

export interface AdvancementChoicePayload {
  featId?: string;
  abilityChoices?: Record<string, number>;
  multiclassInto?: string;
  hitPointMode?: AdvancementHitPointMode;
  subclassId?: string;
  weaponMasteryChoices?: string[];
  /** Durable server-side preview selected by the player. */
  preparedPreviewKey?: string;
  /** Stable retry key for the final commit. */
  idempotencyKey?: string;
}

export interface AdvancementPreviewChange {
  path: string;
  operation: "add" | "remove" | "replace";
  before?: unknown;
  after?: unknown;
  source: { systemId: string; rulesVersion: string; schemaVersion: string; rule: string };
}

export interface AdvancementPreviewEnvelope {
  actorId: string;
  status: "ready" | "blocked";
  blockers: Array<{ path: string; code: string; message: string }>;
  serverRolls: Array<{ id: string; path: string; formula: string; reason: string }>;
  changes: AdvancementPreviewChange[];
  validation: { actor: { issues: Array<{ path: string; severity: "error" | "warning"; code: string; message: string }> } };
  preparation?: {
    preparedPreviewKey?: string;
    idempotencyKey?: string;
    actorUpdatedAt: string;
    request: Record<string, unknown>;
    pendingAdvancement?: Dnd5eSrdPendingAdvancement;
    advancementRoll?: { formula: string; total: number };
  };
  draft?: { pendingAdvancement: Dnd5eSrdPendingAdvancement };
}

export type AdvancementFlowProps = {
  advancementOptions: AdvancementOptionInfo[];
  advancementGrantsFeat: boolean;
  advancementFeats: AdvancementFeatInfo[];
  multiclassOptions: AdvancementMulticlassOption[];
  advancementClassName?: string;
  nextClassLevel?: number;
  requiresSubclass?: boolean;
  subclassOptions: AdvancementSubclassOption[];
  weaponMastery?: AdvancementWeaponMasteryInfo;
  onPreviewActor?(optionId: string | undefined, choices: AdvancementChoicePayload, idempotencyKey: string): Promise<AdvancementPreviewEnvelope>;
  onAdvanceActor(optionId?: string, choices?: AdvancementChoicePayload): void | Promise<void>;
  pendingAdvancement?: Dnd5eSrdPendingAdvancement;
  onCancelPendingAdvancement?(pending: Dnd5eSrdPendingAdvancement): void | Promise<void>;
  canAdvanceActor: boolean;
  actor?: Actor;
};

const dndAbilityIds = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;

export interface AdvancementAbilityAllocationStatus {
  allowedAbilities: string[];
  abilityPoints: number;
  pointsSpent: number;
  maximumScore: number;
  complete: boolean;
  error?: string;
}

export interface AdvancementWeaponMasterySelectionStatus {
  complete: boolean;
  selectedCount: number;
  requiredCount: number;
  error?: string;
}

export function advancementWeaponMasterySelectionStatus(info: AdvancementWeaponMasteryInfo | undefined, selectedWeaponIds: string[]): AdvancementWeaponMasterySelectionStatus {
  const requiredCount = info?.requiresSelection ? Math.max(0, Math.floor(info.requiredCount)) : 0;
  const eligible = new Set(info?.options.map((option) => option.id) ?? []);
  const unique = [...new Set(selectedWeaponIds)];
  const invalid = unique.find((weaponId) => !eligible.has(weaponId));
  const complete = requiredCount === 0 || (!invalid && unique.length === requiredCount);
  return {
    complete,
    selectedCount: unique.length,
    requiredCount,
    ...(!complete
      ? { error: invalid ? `${invalid} is not an eligible Weapon Mastery choice.` : `Choose exactly ${formatNumber(requiredCount)} Weapon Mastery weapon${requiredCount === 1 ? "" : "s"}.` }
      : {})
  };
}

export function advancementAbilityAllocationStatus(actor: Actor, feat: AdvancementFeatInfo, allocations: Record<string, number>): AdvancementAbilityAllocationStatus {
  const abilityPoints = Math.max(0, Math.floor(numericValue(feat.abilityPoints, 0)));
  const maximumScore = Math.max(1, Math.floor(numericValue(feat.maximumScore, 20)));
  const allowedAbilities = feat.abilityChoices.length > 0 ? [...feat.abilityChoices] : [...dndAbilityIds];
  const attributes = recordValue(actor.data.attributes);
  let pointsSpent = 0;
  let allocationError: string | undefined;

  for (const [ability, amount] of Object.entries(allocations)) {
    if (!Number.isInteger(amount) || amount <= 0) {
      allocationError = `${titleCaseLabel(ability)} must use positive whole points.`;
      break;
    }
    if (!allowedAbilities.includes(ability)) {
      allocationError = `${feat.name} cannot increase ${titleCaseLabel(ability)}.`;
      break;
    }
    pointsSpent += amount;
    const currentScore = numericValue(attributes[ability], 10);
    if (currentScore + amount > maximumScore) {
      allocationError = `${titleCaseLabel(ability)} cannot exceed ${formatNumber(maximumScore)} with ${feat.name}.`;
      break;
    }
  }

  if (!allocationError && pointsSpent > abilityPoints) {
    allocationError = `${feat.name} grants only ${formatNumber(abilityPoints)} ability point${abilityPoints === 1 ? "" : "s"}.`;
  }
  if (!allocationError && pointsSpent < abilityPoints) {
    const remaining = abilityPoints - pointsSpent;
    allocationError = `Allocate ${formatNumber(remaining)} more ability point${remaining === 1 ? "" : "s"}.`;
  }

  return {
    allowedAbilities,
    abilityPoints,
    pointsSpent,
    maximumScore,
    complete: !allocationError && pointsSpent === abilityPoints,
    ...(allocationError ? { error: allocationError } : {})
  };
}

export function AdvancementFlow(props: AdvancementFlowProps) {
  const [advancementOptionId, setAdvancementOptionId] = useState("");
  const [advancementStep, setAdvancementStep] = useState<"choose" | "review">("choose");
  const [advancementConfirmed, setAdvancementConfirmed] = useState(false);
  const [advancementMode, setAdvancementMode] = useState<"level" | "multiclass">("level");
  const [selectedFeatId, setSelectedFeatId] = useState("");
  const [selectedMulticlass, setSelectedMulticlass] = useState("");
  const [selectedSubclassId, setSelectedSubclassId] = useState("");
  const [hitPointMode, setHitPointMode] = useState<AdvancementHitPointMode | "">("");
  const [abilityAllocations, setAbilityAllocations] = useState<Record<string, number>>({});
  const [weaponMasteryChoices, setWeaponMasteryChoices] = useState<string[]>([]);
  const [advancementError, setAdvancementError] = useState("");
  const [advancementPreview, setAdvancementPreview] = useState<AdvancementPreviewEnvelope>();
  const [previewing, setPreviewing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [cancellingPending, setCancellingPending] = useState(false);
  const previewingRef = useRef(false);
  const advancingRef = useRef(false);
  const previewAttemptKeyRef = useRef("");
  const commitAttemptKeyRef = useRef("");
  const requestGenerationRef = useRef(0);
  const advancementLabel = systemAdvancementLabel(props.actor?.systemId);
  const selectedAdvancementOption = props.advancementOptions.find((option) => option.id === advancementOptionId) ?? props.advancementOptions[0];
  const selectedMulticlassOption = props.multiclassOptions.find((option) => option.className === selectedMulticlass);
  const activeClassName = advancementMode === "multiclass" ? selectedMulticlass : props.advancementClassName ?? stringValue(props.actor?.data.class) ?? "";
  const activeNextClassLevel = advancementMode === "multiclass" ? selectedMulticlassOption?.nextClassLevel : props.nextClassLevel;
  const actorSubclasses = recordValue(props.actor?.data.subclasses);
  const existingSubclass = Object.entries(actorSubclasses).find(([className]) => className.toLowerCase() === activeClassName.toLowerCase())?.[1]
    ?? (activeClassName && activeClassName.toLowerCase() === stringValue(props.actor?.data.class)?.toLowerCase() ? props.actor?.data.subclass : undefined);
  const activeSubclassOptions = props.subclassOptions.filter((option) => option.className.toLowerCase() === activeClassName.toLowerCase());
  const derivedRequiresSubclass = Boolean(!existingSubclass && activeNextClassLevel && activeSubclassOptions.some((option) => activeNextClassLevel >= option.selectionLevel));
  const pathRequiresSubclass = advancementMode === "multiclass" ? selectedMulticlassOption?.requiresSubclass ?? derivedRequiresSubclass : props.requiresSubclass ?? derivedRequiresSubclass;
  const selectedSubclass = activeSubclassOptions.find((option) => option.id === selectedSubclassId);
  const pathGrantsFeat = advancementMode === "multiclass" ? selectedMulticlassOption?.grantsFeat ?? false : props.advancementGrantsFeat;
  const weaponMastery = advancementMode === "multiclass" ? selectedMulticlassOption?.weaponMastery : props.weaponMastery;
  const weaponMasteryStatus = advancementWeaponMasterySelectionStatus(weaponMastery, weaponMasteryChoices);
  const selectedFeat = props.advancementFeats.find((feat) => feat.id === selectedFeatId);
  const allocationStatus = props.actor && selectedFeat ? advancementAbilityAllocationStatus(props.actor, selectedFeat, abilityAllocations) : undefined;
  const requiresHitPointMode = props.actor?.systemId === "dnd-5e-srd";
  const advancementBlockingMessage = !selectedAdvancementOption
    ? "Select an advancement."
    : requiresHitPointMode && !hitPointMode
      ? "Choose how to determine the hit point increase."
      : advancementMode === "multiclass" && !selectedMulticlass
        ? "Select a class for this level."
      : advancementMode === "multiclass" && selectedMulticlassOption?.eligible !== true
          ? selectedMulticlassOption?.reasons[0] ?? "That multiclass path is not eligible."
        : pathRequiresSubclass && activeSubclassOptions.length === 0
          ? `No subclass choices are available for ${activeClassName || "this class"}; refresh the advancement catalog.`
        : pathRequiresSubclass && !selectedSubclass
          ? `Select a subclass for ${activeClassName} level ${formatNumber(activeNextClassLevel ?? 3)}.`
          : weaponMasteryStatus.complete !== true
            ? weaponMasteryStatus.error ?? "Complete the Weapon Mastery choices."
          : pathGrantsFeat && !selectedFeat
            ? "Select a feat or Ability Score Improvement for this class level."
            : pathGrantsFeat && allocationStatus?.complete !== true
              ? allocationStatus?.error ?? "Complete the feat ability allocation."
              : "";
  const advancementReadyToReview = Boolean(props.actor && props.canAdvanceActor && !advancementBlockingMessage);

  useEffect(() => {
    requestGenerationRef.current += 1;
    previewingRef.current = false;
    advancingRef.current = false;
    setPreviewing(false);
    setAdvancing(false);
    setCancellingPending(false);
    if (props.advancementOptions.length === 0) {
      if (advancementOptionId) setAdvancementOptionId("");
      setAdvancementStep("choose");
      setAdvancementConfirmed(false);
      return;
    }
    if (!props.advancementOptions.some((option) => option.id === advancementOptionId)) setAdvancementOptionId(props.advancementOptions[0]!.id);
  }, [props.advancementOptions, advancementOptionId]);

  useEffect(() => {
    setAdvancementStep("choose");
    setAdvancementConfirmed(false);
    setAdvancementPreview(undefined);
    previewAttemptKeyRef.current = "";
    commitAttemptKeyRef.current = "";
  }, [selectedAdvancementOption?.id]);

  useEffect(() => {
    setAdvancementMode("level");
    setSelectedFeatId("");
    setSelectedMulticlass("");
    setSelectedSubclassId("");
    setHitPointMode("");
    setAbilityAllocations({});
    setWeaponMasteryChoices([]);
    setAdvancementError("");
    setAdvancementPreview(undefined);
    previewAttemptKeyRef.current = "";
    commitAttemptKeyRef.current = "";
    setAdvancementStep("choose");
    setAdvancementConfirmed(false);
  }, [props.actor?.id]);

  useEffect(() => {
    setAdvancementStep("choose");
    setAdvancementConfirmed(false);
    setAdvancementPreview(undefined);
    previewAttemptKeyRef.current = "";
    commitAttemptKeyRef.current = "";
  }, [advancementMode, selectedFeatId, selectedMulticlass, selectedSubclassId]);

  useEffect(() => {
    setSelectedFeatId("");
    setSelectedSubclassId("");
    setAbilityAllocations({});
  }, [advancementMode, selectedMulticlass]);

  useEffect(() => {
    setWeaponMasteryChoices(weaponMastery?.requiresSelection ? [...weaponMastery.selectedWeaponIds] : []);
  }, [props.actor?.id, weaponMastery]);

  useEffect(() => {
    setAbilityAllocations({});
  }, [selectedFeatId]);

  useEffect(() => {
    setAdvancementStep("choose");
    setAdvancementConfirmed(false);
    setAdvancementPreview(undefined);
    previewAttemptKeyRef.current = "";
    commitAttemptKeyRef.current = "";
  }, [hitPointMode, abilityAllocations, weaponMasteryChoices]);

  const setAbilityAllocation = (ability: string, rawAmount: string) => {
    const amount = Math.max(0, Math.floor(Number(rawAmount) || 0));
    setAbilityAllocations((current) => {
      const next = { ...current };
      if (amount === 0) delete next[ability];
      else next[ability] = amount;
      return next;
    });
  };

  const toggleWeaponMastery = (weaponId: string, selected: boolean) => {
    setWeaponMasteryChoices((current) => {
      if (!selected) return current.filter((candidate) => candidate !== weaponId);
      if (current.includes(weaponId) || current.length >= (weaponMastery?.requiredCount ?? 0)) return current;
      return [...current, weaponId];
    });
  };

  const selectedChoices = (): AdvancementChoicePayload => ({
    ...(requiresHitPointMode && hitPointMode ? { hitPointMode } : {}),
    ...(advancementMode === "multiclass" ? { multiclassInto: selectedMulticlass } : {}),
    ...(selectedSubclass ? { subclassId: selectedSubclass.id } : {}),
    ...(weaponMastery?.requiresSelection ? { weaponMasteryChoices: [...weaponMasteryChoices] } : {}),
    ...(selectedFeat ? { featId: selectedFeat.id, abilityChoices: { ...abilityAllocations } } : {})
  });

  const resumePendingAdvancement = async () => {
    const pending = props.pendingAdvancement;
    if (!pending || previewingRef.current) return;
    const request = recordValue(pending.request);
    const requestedOptionId = stringValue(request.optionId) ?? props.advancementOptions[0]?.id ?? "";
    const requestedClassName = stringValue(request.className) ?? "";
    const requestedFeatId = stringValue(request.featId) ?? "";
    const requestedSubclassId = stringValue(request.subclassId) ?? "";
    const requestedHitPointMode = request.hitPointMode === "fixed" || request.hitPointMode === "roll" ? request.hitPointMode : "";
    const requestedWeaponMasteryChoices = Array.isArray(request.weaponMasteryChoices)
      ? request.weaponMasteryChoices.filter((weaponId): weaponId is string => typeof weaponId === "string" && Boolean(weaponId.trim()))
      : [];
    const requestedAbilityChoices = Object.fromEntries(
      Object.entries(recordValue(request.abilityChoices)).flatMap(([ability, amount]) =>
        typeof amount === "number" && Number.isInteger(amount) && amount > 0 ? [[ability, amount]] : []
      )
    );
    if (requestedOptionId) setAdvancementOptionId(requestedOptionId);
    setAdvancementMode(requestedClassName ? "multiclass" : "level");
    setSelectedMulticlass(requestedClassName);
    setSelectedFeatId(requestedFeatId);
    setSelectedSubclassId(requestedSubclassId);
    setHitPointMode(requestedHitPointMode);
    setAbilityAllocations(requestedAbilityChoices);
    setWeaponMasteryChoices(requestedWeaponMasteryChoices);
    setAdvancementError("");
    setAdvancementConfirmed(false);
    setAdvancementPreview(undefined);
    setAdvancementStep("choose");
    if (pending.status !== "ready" || !pending.preparedPreviewKey || !props.onPreviewActor) return;
    previewingRef.current = true;
    setPreviewing(true);
    const generation = requestGenerationRef.current;
    previewAttemptKeyRef.current = pending.preparedPreviewKey;
    try {
      const preview = await props.onPreviewActor(requestedOptionId || undefined, {
        ...(requestedFeatId ? { featId: requestedFeatId } : {}),
        ...(Object.keys(requestedAbilityChoices).length > 0 ? { abilityChoices: requestedAbilityChoices } : {}),
        ...(requestedClassName ? { multiclassInto: requestedClassName } : {}),
        ...(requestedSubclassId ? { subclassId: requestedSubclassId } : {}),
        ...(requestedWeaponMasteryChoices.length > 0 ? { weaponMasteryChoices: requestedWeaponMasteryChoices } : {}),
        ...(requestedHitPointMode ? { hitPointMode: requestedHitPointMode } : {})
      }, pending.preparedPreviewKey);
      if (generation !== requestGenerationRef.current) return;
      setAdvancementPreview(preview);
      setAdvancementStep("review");
      if (preview.status !== "ready") setAdvancementError(preview.blockers[0]?.message ?? "Saved advancement is no longer ready.");
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setAdvancementError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) {
        previewingRef.current = false;
        setPreviewing(false);
      }
    }
  };

  const cancelPendingAdvancement = async () => {
    const pending = props.pendingAdvancement;
    if (!pending || !props.onCancelPendingAdvancement || cancellingPending) return;
    setCancellingPending(true);
    const generation = requestGenerationRef.current;
    setAdvancementError("");
    try {
      await props.onCancelPendingAdvancement(pending);
      if (generation !== requestGenerationRef.current) return;
      setAdvancementPreview(undefined);
      setAdvancementStep("choose");
      setAdvancementConfirmed(false);
      previewAttemptKeyRef.current = "";
      commitAttemptKeyRef.current = "";
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setAdvancementError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) setCancellingPending(false);
    }
  };

  const reviewAdvancement = async () => {
    if (previewingRef.current || !selectedAdvancementOption || !advancementReadyToReview) return;
    setAdvancementError("");
    setAdvancementConfirmed(false);
    if (!props.onPreviewActor) {
      setAdvancementStep("review");
      return;
    }
    previewingRef.current = true;
    setPreviewing(true);
    const generation = requestGenerationRef.current;
    const idempotencyKey = previewAttemptKeyRef.current || `advancement-preview:${window.crypto.randomUUID()}`;
    previewAttemptKeyRef.current = idempotencyKey;
    try {
      const preview = await props.onPreviewActor(selectedAdvancementOption.id, selectedChoices(), idempotencyKey);
      if (generation !== requestGenerationRef.current) return;
      setAdvancementPreview(preview);
      setAdvancementStep("review");
      if (preview.status !== "ready") setAdvancementError(preview.blockers[0]?.message ?? preview.serverRolls[0]?.reason ?? "Advancement is not ready to commit.");
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setAdvancementError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) {
        previewingRef.current = false;
        setPreviewing(false);
      }
    }
  };

  const saveAdvancementDraft = async () => {
    if (previewingRef.current || !props.onPreviewActor || !props.actor || !props.canAdvanceActor || !selectedAdvancementOption) return;
    previewingRef.current = true;
    setPreviewing(true);
    setAdvancementError("");
    setAdvancementConfirmed(false);
    const generation = requestGenerationRef.current;
    const idempotencyKey = `advancement-draft:${window.crypto.randomUUID()}`;
    try {
      const draft = await props.onPreviewActor(selectedAdvancementOption.id, selectedChoices(), idempotencyKey);
      if (generation !== requestGenerationRef.current) return;
      setAdvancementPreview(draft);
      setAdvancementStep("choose");
      if (draft.draft?.pendingAdvancement) {
        setAdvancementError(`${draft.blockers[0]?.message ?? "Choices are incomplete."} Draft saved.`);
      } else {
        setAdvancementError(draft.blockers[0]?.message ?? "This advancement cannot be saved until its invalid choices are corrected.");
      }
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setAdvancementError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) {
        previewingRef.current = false;
        setPreviewing(false);
      }
    }
  };

  const submitAdvancement = async () => {
    if (advancingRef.current || !selectedAdvancementOption) return;
    if (!advancementReadyToReview || (props.onPreviewActor && (advancementPreview?.status !== "ready" || !advancementPreview.preparation))) return;
    const choices: AdvancementChoicePayload = {
      ...selectedChoices(),
      ...(advancementPreview?.preparation?.preparedPreviewKey || advancementPreview?.preparation?.idempotencyKey
        ? { preparedPreviewKey: advancementPreview.preparation.preparedPreviewKey ?? advancementPreview.preparation.idempotencyKey }
        : {}),
      idempotencyKey: commitAttemptKeyRef.current || `advancement-commit:${window.crypto.randomUUID()}`
    };
    commitAttemptKeyRef.current = choices.idempotencyKey!;
    advancingRef.current = true;
    setAdvancing(true);
    const generation = requestGenerationRef.current;
    setAdvancementError("");
    try {
      await props.onAdvanceActor(selectedAdvancementOption.id, choices);
      if (generation !== requestGenerationRef.current) return;
      setAdvancementStep("choose");
      setAdvancementConfirmed(false);
      setSelectedFeatId("");
      setSelectedMulticlass("");
      setSelectedSubclassId("");
      setHitPointMode("");
      setAbilityAllocations({});
      setWeaponMasteryChoices([]);
      setAdvancementPreview(undefined);
      previewAttemptKeyRef.current = "";
      commitAttemptKeyRef.current = "";
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setAdvancementError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) {
        advancingRef.current = false;
        setAdvancing(false);
      }
    }
  };

  return (
    <>
      <section className="operator-section content-import-form" aria-label="Actor advancement choices">
        <div className="operator-heading">
          <div className="section-title">Advancement</div>
          <strong>{formatNumber(props.advancementOptions.length)} choices</strong>
        </div>
        {props.pendingAdvancement && (
          <div className="operator-item admin-item" role="status" aria-label="Saved advancement">
            <strong>{props.pendingAdvancement.status === "ready" ? "Saved advancement ready for review" : "Saved advancement draft"}</strong>
            <p>{props.pendingAdvancement.status === "ready" ? "Resume the exact server-prepared result before committing it." : "Resume your saved choices and finish the missing decisions."}</p>
            <div className="admin-actions">
              <button className="ghost-button small" type="button" disabled={previewing || cancellingPending} onClick={() => void resumePendingAdvancement()}>
                {previewing ? "Resuming..." : "Resume saved advancement"}
              </button>
              {props.onCancelPendingAdvancement && (
                <button className="ghost-button small danger" type="button" disabled={previewing || cancellingPending} onClick={() => void cancelPendingAdvancement()}>
                  {cancellingPending ? "Cancelling..." : "Cancel saved advancement"}
                </button>
              )}
            </div>
          </div>
        )}
        {props.advancementOptions.length === 0 ? (
          <div className="empty-state compact">No advancement choices are available for this actor.</div>
        ) : (
          <>
            <label>
              <span>Choice</span>
              <select aria-label="Advancement option" value={selectedAdvancementOption?.id ?? ""} disabled={!props.canAdvanceActor} onChange={(event) => setAdvancementOptionId(event.target.value)}>
                {props.advancementOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-meta">
              <span>{selectedAdvancementOption?.summary ?? "No advancement selected"}</span>
              {selectedAdvancementOption && <span>next {formatNumber(selectedAdvancementOption.nextValue)}</span>}
            </div>
            {props.multiclassOptions.length > 0 && (
              <div className="segmented-control" role="group" aria-label="Advancement type">
                <button className={advancementMode === "level" ? "active" : ""} type="button" onClick={() => setAdvancementMode("level")}>Level up class</button>
                <button className={advancementMode === "multiclass" ? "active" : ""} type="button" onClick={() => setAdvancementMode("multiclass")}>Multiclass</button>
              </div>
            )}
            {advancementMode === "multiclass" && (
              <label>
                <span>Add a level in</span>
                <select aria-label="Multiclass into" value={selectedMulticlass} disabled={!props.canAdvanceActor} onChange={(event) => setSelectedMulticlass(event.target.value)}>
                  <option value="">Select a class</option>
                  {props.multiclassOptions.map((option) => (
                    <option key={option.className} value={option.className} disabled={!option.eligible}>
                      {option.className} level {formatNumber(option.nextClassLevel)}{option.grantsFeat ? " - feat/ASI" : ""}{option.eligible ? "" : " (ineligible)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {advancementMode === "multiclass" && selectedMulticlass && (
              <div className="admin-meta">
                <span>{selectedMulticlassOption?.eligible ? `Adds ${selectedMulticlass} level ${formatNumber(selectedMulticlassOption.nextClassLevel)} using the shared multiclass spell-slot table.` : selectedMulticlassOption?.reasons[0] ?? "Ineligible"}</span>
              </div>
            )}
            {pathRequiresSubclass && (
              <label className="advancement-subclass-choice">
                <span>Subclass for {activeClassName}</span>
                <select aria-label="Advancement subclass" value={selectedSubclassId} disabled={!props.canAdvanceActor || activeSubclassOptions.length === 0} onChange={(event) => setSelectedSubclassId(event.target.value)}>
                  <option value="">Select a subclass</option>
                  {activeSubclassOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
            )}
            {selectedSubclass && (
              <div className="advancement-subclass-summary" role="status">
                <strong>{selectedSubclass.name}</strong>
                <span>{selectedSubclass.summary ?? `Selects the ${selectedSubclass.name} subclass for ${selectedSubclass.className}.`}</span>
                {selectedSubclass.featureNames?.length ? <small>Class-aware grants in this review: {selectedSubclass.featureNames.join(", ")}</small> : <small>Class-aware feature and always-prepared spell grants appear in the exact server preview before commit.</small>}
                {selectedSubclass.alwaysPreparedSpells?.length ? <small>Always prepared: {selectedSubclass.alwaysPreparedSpells.join(", ")}. Other prepared spells remain managed from the sheet after advancement.</small> : <small>Later spell preparation remains available from the character sheet after advancement.</small>}
              </div>
            )}
            {requiresHitPointMode && (
              <fieldset className="advancement-choice-fieldset">
                <legend>Hit point increase</legend>
                <label>
                  <input type="radio" name="advancement-hit-point-mode" value="fixed" checked={hitPointMode === "fixed"} disabled={!props.canAdvanceActor} onChange={() => setHitPointMode("fixed")} />
                  <span><strong>Fixed average</strong><small>Use the class's reliable fixed increase.</small></span>
                </label>
                <label>
                  <input type="radio" name="advancement-hit-point-mode" value="roll" checked={hitPointMode === "roll"} disabled={!props.canAdvanceActor} onChange={() => setHitPointMode("roll")} />
                  <span><strong>Roll on server</strong><small>Roll the class hit die authoritatively when submitted.</small></span>
                </label>
              </fieldset>
            )}
            {weaponMastery?.requiresSelection && (
              <fieldset className="advancement-ability-allocation" aria-label="Weapon Mastery choices">
                <legend>Choose exactly {formatNumber(weaponMastery.requiredCount)} Weapon Mastery weapon{weaponMastery.requiredCount === 1 ? "" : "s"}</legend>
                <div className="advancement-ability-grid">
                  {weaponMastery.options.map((option) => {
                    const selected = weaponMasteryChoices.includes(option.id);
                    return (
                      <label key={option.id}>
                        <input
                          aria-label={`${option.name} Weapon Mastery`}
                          type="checkbox"
                          checked={selected}
                          disabled={!props.canAdvanceActor || (!selected && weaponMasteryChoices.length >= weaponMastery.requiredCount)}
                          onChange={(event) => toggleWeaponMastery(option.id, event.target.checked)}
                        />
                        <span>{option.name} <small>{titleCaseLabel(option.mastery)}</small></span>
                      </label>
                    );
                  })}
                </div>
                <p className={weaponMasteryStatus.complete ? "advancement-choice-status complete" : "advancement-choice-status"} role="status">
                  {weaponMasteryStatus.complete
                    ? `${formatNumber(weaponMasteryStatus.selectedCount)} of ${formatNumber(weaponMasteryStatus.requiredCount)} Weapon Mastery weapons selected.`
                    : weaponMasteryStatus.error}
                </p>
              </fieldset>
            )}
            {pathGrantsFeat && (
              <label>
                <span>Feat or Ability Score Improvement</span>
                <select aria-label="Advancement feat" value={selectedFeatId} disabled={!props.canAdvanceActor || props.advancementFeats.length === 0} onChange={(event) => setSelectedFeatId(event.target.value)}>
                  <option value="">Select a feat or ASI</option>
                  {props.advancementFeats.map((feat) => (
                    <option key={feat.id} value={feat.id}>{feat.name}</option>
                  ))}
                </select>
              </label>
            )}
            {selectedFeat && (
              <div className="advancement-feat-summary">
                <strong>{selectedFeat.name}</strong>
                <span>{selectedFeat.summary}</span>
              </div>
            )}
            {selectedFeat && allocationStatus && allocationStatus.abilityPoints > 0 && (
              <fieldset className="advancement-ability-allocation">
                <legend>Allocate exactly {formatNumber(allocationStatus.abilityPoints)} ability point{allocationStatus.abilityPoints === 1 ? "" : "s"}</legend>
                <div className="advancement-ability-grid">
                  {allocationStatus.allowedAbilities.map((ability) => {
                    const currentScore = numericValue(recordValue(props.actor?.data.attributes)[ability], 10);
                    const availableIncrease = Math.max(0, Math.min(allocationStatus.abilityPoints, allocationStatus.maximumScore - currentScore));
                    return (
                      <label key={ability}>
                        <span>{titleCaseLabel(ability)} <small>{formatNumber(currentScore)} / {formatNumber(allocationStatus.maximumScore)}</small></span>
                        <input aria-label={`${titleCaseLabel(ability)} ability points`} type="number" inputMode="numeric" min={0} max={availableIncrease} step={1} value={abilityAllocations[ability] ?? 0} disabled={!props.canAdvanceActor || availableIncrease === 0} onChange={(event) => setAbilityAllocation(ability, event.target.value)} />
                      </label>
                    );
                  })}
                </div>
                <p className={allocationStatus.complete ? "advancement-choice-status complete" : "advancement-choice-status"} role="status">
                  {allocationStatus.complete ? `${formatNumber(allocationStatus.pointsSpent)} of ${formatNumber(allocationStatus.abilityPoints)} points allocated.` : allocationStatus.error}
                </p>
              </fieldset>
            )}
            {advancementBlockingMessage && <p className="advancement-choice-status" role="status">{advancementBlockingMessage}</p>}
            {advancementError && <div className="lore-load-state error" role="alert">{advancementError}</div>}
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={!advancementReadyToReview || previewing} onClick={() => void reviewAdvancement()}>
                <Eye size={14} /> {previewing ? "Preparing review..." : "Review advancement"}
              </button>
              {props.actor?.systemId === "dnd-5e-srd" && props.onPreviewActor && advancementBlockingMessage && (
                <button className="ghost-button" type="button" disabled={!props.canAdvanceActor || !selectedAdvancementOption || previewing} onClick={() => void saveAdvancementDraft()}>
                  {previewing ? "Saving draft..." : "Save advancement draft"}
                </button>
              )}
              {advancementStep === "review" && (
                <button className="ghost-button" type="button" onClick={() => setAdvancementStep("choose")}>
                  <ChevronLeft size={14} /> Back to choice
                </button>
              )}
            </div>
            {advancementStep === "review" && selectedAdvancementOption && (
              <div className="asset-pressure-list" role="region" aria-label="Advancement review step">
                <div className="operator-row tool-call-row">
                  <span>Actor</span>
                  <strong>{props.actor?.name ?? "No actor"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Advancement</span>
                  <strong>{selectedAdvancementOption.name}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Mode</span>
                  <strong>{advancementMode === "multiclass" ? `Multiclass into ${selectedMulticlass}` : "Level up class"}</strong>
                </div>
                {requiresHitPointMode && (
                  <div className="operator-row tool-call-row">
                    <span>Hit points</span>
                    <strong>{hitPointMode === "roll" ? "Server roll" : "Fixed average"}</strong>
                  </div>
                )}
                {weaponMastery?.requiresSelection && (
                  <div className="operator-row tool-call-row">
                    <span>Weapon Mastery</span>
                    <strong>{weaponMasteryChoices.map((weaponId) => weaponMastery.options.find((option) => option.id === weaponId)?.name ?? weaponId).join(", ")}</strong>
                  </div>
                )}
                {selectedFeat && (
                  <div className="operator-row tool-call-row">
                    <span>Feat / ASI</span>
                    <strong>{selectedFeat.name}</strong>
                  </div>
                )}
                {selectedSubclass && (
                  <div className="operator-row tool-call-row">
                    <span>Subclass</span>
                    <strong>{selectedSubclass.name}</strong>
                  </div>
                )}
                {allocationStatus && allocationStatus.abilityPoints > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Ability increases</span>
                    <strong>{Object.entries(abilityAllocations).map(([ability, amount]) => `${titleCaseLabel(ability)} +${formatNumber(amount)}`).join(", ")}</strong>
                  </div>
                )}
                <div className="operator-row tool-call-row">
                  <span>Next value</span>
                  <strong>{formatNumber(selectedAdvancementOption.nextValue)}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Review</span>
                  <strong>{selectedAdvancementOption.summary}</strong>
                </div>
                {advancementPreview?.preparation?.advancementRoll && (
                  <div className="operator-row tool-call-row">
                    <span>Server Hit Point roll</span>
                    <strong>{advancementPreview.preparation.advancementRoll.formula} = {formatNumber(advancementPreview.preparation.advancementRoll.total)}</strong>
                  </div>
                )}
                {advancementPreview && advancementPreview.changes.length > 0 && (
                  <div className="advancement-preview-diff" aria-label="Proposed advancement changes">
                    {advancementPreview.changes.map((change) => (
                      <div className="operator-row tool-call-row" key={`${change.path}:${change.operation}`}>
                        <span>{advancementPreviewPath(change.path)}</span>
                        <strong>{advancementPreviewValue(change.before)} → {advancementPreviewValue(change.after)}</strong>
                        <small>{change.source.rulesVersion} · {change.source.rule}</small>
                      </div>
                    ))}
                  </div>
                )}
                {advancementPreview?.validation.actor.issues.filter((issue) => issue.severity === "warning").map((issue) => (
                  <p className="advancement-choice-status" key={`${issue.path}:${issue.code}`}>{issue.message}</p>
                ))}
                {advancementPreview?.blockers.map((blocker) => (
                  <p className="advancement-choice-status" key={`${blocker.path}:${blocker.code}`}>{blocker.message}</p>
                ))}
                <label className="inline-check">
                  <input aria-label="Confirm advancement review" type="checkbox" checked={advancementConfirmed} disabled={Boolean(props.onPreviewActor && advancementPreview?.status !== "ready")} onChange={(event) => setAdvancementConfirmed(event.target.checked)} />
                  <span>Reviewed the exact proposed changes</span>
                </label>
              </div>
            )}
          </>
        )}
      </section>
      <button className="ghost-button wide" onClick={() => void submitAdvancement()} disabled={!advancementReadyToReview || props.advancementOptions.length === 0 || advancementStep !== "review" || !advancementConfirmed || advancing}>
        <RefreshCw size={16} /> {advancing ? "Advancing..." : advancementMode === "multiclass" ? "Multiclass" : advancementLabel}
      </button>
    </>
  );
}

export function advancementPreviewPath(path: string): string {
  const label = path.split("/").filter(Boolean).map(titleCaseLabel).join(" · ");
  return label || "Actor data";
}

export function advancementPreviewValue(value: unknown): string {
  if (value === undefined) return "not set";
  if (value === null) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "structured value";
  }
}
