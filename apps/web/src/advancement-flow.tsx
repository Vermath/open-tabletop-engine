import type { Actor } from "@open-tabletop/core";
import { ChevronLeft, Eye, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber } from "./sheet-format.js";
import { systemAdvancementLabel, type AdvancementOptionInfo } from "./system-actions.js";

export type AdvancementFlowProps = {
  advancementOptions: AdvancementOptionInfo[];
  advancementGrantsFeat: boolean;
  advancementFeats: Array<{ id: string; name: string; category: string; summary: string }>;
  multiclassOptions: Array<{ className: string; eligible: boolean; reasons: string[] }>;
  onAdvanceActor(optionId?: string, choices?: { featId?: string; abilityChoices?: Record<string, number>; multiclassInto?: string }): void | Promise<void>;
  canAdvanceActor: boolean;
  actor?: Actor;
};

export function AdvancementFlow(props: AdvancementFlowProps) {
  const [advancementOptionId, setAdvancementOptionId] = useState("");
  const [advancementStep, setAdvancementStep] = useState<"choose" | "review">("choose");
  const [advancementConfirmed, setAdvancementConfirmed] = useState(false);
  const [advancementMode, setAdvancementMode] = useState<"level" | "multiclass">("level");
  const [selectedFeatId, setSelectedFeatId] = useState("");
  const [selectedMulticlass, setSelectedMulticlass] = useState("");
  const advancementLabel = systemAdvancementLabel(props.actor?.systemId);
  const selectedAdvancementOption = props.advancementOptions.find((option) => option.id === advancementOptionId) ?? props.advancementOptions[0];

  useEffect(() => {
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
  }, [selectedAdvancementOption?.id, props.actor?.id]);

  return (
    <>
      <section className="operator-section content-import-form" aria-label="Actor advancement choices">
        <div className="operator-heading">
          <div className="section-title">Advancement</div>
          <strong>{formatNumber(props.advancementOptions.length)} choices</strong>
        </div>
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
            {advancementMode === "level" && props.advancementGrantsFeat && props.advancementFeats.length > 0 && (
              <label>
                <span>Feat or Ability Score Improvement</span>
                <select aria-label="Advancement feat" value={selectedFeatId} disabled={!props.canAdvanceActor} onChange={(event) => setSelectedFeatId(event.target.value)}>
                  <option value="">Choose later</option>
                  {props.advancementFeats.map((feat) => (
                    <option key={feat.id} value={feat.id}>{feat.name}</option>
                  ))}
                </select>
              </label>
            )}
            {advancementMode === "multiclass" && (
              <label>
                <span>Add a level in</span>
                <select aria-label="Multiclass into" value={selectedMulticlass} disabled={!props.canAdvanceActor} onChange={(event) => setSelectedMulticlass(event.target.value)}>
                  <option value="">Select a class</option>
                  {props.multiclassOptions.map((option) => (
                    <option key={option.className} value={option.className} disabled={!option.eligible}>
                      {option.className}{option.eligible ? "" : " (ineligible)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {advancementMode === "multiclass" && selectedMulticlass && (
              <div className="admin-meta">
                <span>{props.multiclassOptions.find((option) => option.className === selectedMulticlass)?.eligible ? `Adds a level of ${selectedMulticlass} using the shared multiclass spell-slot table.` : props.multiclassOptions.find((option) => option.className === selectedMulticlass)?.reasons[0] ?? "Ineligible"}</span>
              </div>
            )}
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={!props.actor || !props.canAdvanceActor || !selectedAdvancementOption || (advancementMode === "multiclass" && !selectedMulticlass)} onClick={() => setAdvancementStep("review")}>
                <Eye size={14} /> Review advancement
              </button>
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
                  <span>Next value</span>
                  <strong>{formatNumber(selectedAdvancementOption.nextValue)}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Review</span>
                  <strong>{selectedAdvancementOption.summary}</strong>
                </div>
                <label className="inline-check">
                  <input aria-label="Confirm advancement review" type="checkbox" checked={advancementConfirmed} onChange={(event) => setAdvancementConfirmed(event.target.checked)} />
                  <span>Reviewed advancement changes</span>
                </label>
              </div>
            )}
          </>
        )}
      </section>
      <button className="ghost-button wide" onClick={() => {
        props.onAdvanceActor(selectedAdvancementOption?.id, advancementMode === "multiclass"
          ? { multiclassInto: selectedMulticlass }
          : selectedFeatId ? { featId: selectedFeatId } : {});
        setAdvancementStep("choose");
        setAdvancementConfirmed(false);
        setSelectedFeatId("");
        setSelectedMulticlass("");
      }} disabled={!props.actor || !props.canAdvanceActor || props.advancementOptions.length === 0 || advancementStep !== "review" || !advancementConfirmed || (advancementMode === "multiclass" && !selectedMulticlass)}>
        <RefreshCw size={16} /> {advancementMode === "multiclass" ? "Multiclass" : advancementLabel}
      </button>
    </>
  );
}
