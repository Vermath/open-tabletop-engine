import type { Actor, AuditLog, Combat, CombatAction, CombatLegendaryActionPrompt, Dnd5eSrdCombatVitalsKind, DndRulesMutationUndoDescriptor, Token } from "@open-tabletop/core";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, HeartPulse, Plus, ScrollText, ShieldPlus, Swords, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { actorCombatResource } from "./actor-sheet-data.js";
import { AdvancedCombatMechanics } from "./advanced-combat-mechanics.js";
import { errorMessage, formatDateTime, formatNumber, numericValue, titleCaseLabel } from "./sheet-format.js";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";
import { TypedDamageCard, type TypedDamageApplyResult } from "./typed-damage-card.js";


export function CombatPanel(props: { campaignId: string; combat?: Combat; recentCombats: Combat[]; auditLogs: AuditLog[]; actors: Actor[]; tokens: Token[]; onFocusCombatant(combatant: Combat["combatants"][number]): void; onStart(): Promise<void>; onPlanEncounter(): void; onNext(combat: Combat): Promise<void>; onPrevious(combat: Combat): Promise<void>; onEnd(combat: Combat): Promise<void>; onAwardPartyXp(total: number): Promise<void>; onAwardPartyGold(totalGp: number): Promise<void>; onRecordLoot(loot: string, note?: string): Promise<void>; canAwardRewards: boolean; onUpdateCombatant(combat: Combat, combatantId: string, patch: Partial<Combat["combatants"][number]>): Promise<void>; onConfirmAction(combat: Combat, action: CombatAction): Promise<void>; onRejectAction(combat: Combat, action: CombatAction): Promise<void>; onCombatUpdated(combat: Combat): void; onRefresh(): Promise<void>; onStatus(message: string): void; onRulesMutationApplied?(undo: DndRulesMutationUndoDescriptor): void; onTypedDamageApplied(result: TypedDamageApplyResult): void; onAdjustVitals(actor: Actor, kind: Dnd5eSrdCombatVitalsKind, amount: number, combat: Combat): Promise<void>; onAddCombatant(combat: Combat, token: Token, initiative: number): Promise<void>; onRemoveCombatant(combat: Combat, combatantId: string): Promise<void>; onSpendLegendaryAction(combat: Combat, prompt: CombatLegendaryActionPrompt, optionName: string, cost: number): Promise<void>; canManage: boolean; canManageEffects: boolean; canPreviewEffects: boolean; canAdjustVitals: boolean; vitalsDisabledReason: string; canManageRoster: boolean; rosterDisabledReason: string; canManageLegendaryActions: boolean; legendaryActionsDisabledReason: string }) {
  const [expandedCombatantId, setExpandedCombatantId] = useState("");
  const [endConfirmationId, setEndConfirmationId] = useState("");
  const [pendingControls, setPendingControls] = useState<Set<string>>(() => new Set());
  const pendingControlsRef = useRef<Set<string>>(new Set());
  const action = useRetryableAction(`${props.campaignId}:${props.combat?.id ?? "none"}`);
  const combatants = props.combat?.combatants ?? [];
  const activeCombatant = combatTurnCombatant(props.combat, "current");
  const readyCount = combatants.filter((combatant) => combatant.readiness === "ready").length;
  const defeatedCount = combatants.filter((combatant) => combatant.defeated).length;
  const pendingActions = props.combat?.actions?.filter((action) => action.status === "pending_gm") ?? [];
  const turnPending = props.combat ? pendingControls.has(`turn:${props.combat.id}`) : false;
  const startPending = pendingControls.has("combat:start");
  const actorById = new Map(props.actors.map((actor) => [actor.id, actor]));
  const tokenById = new Map(props.tokens.map((token) => [token.id, token]));
  const combatantTokenIds = new Set(combatants.map((combatant) => combatant.tokenId));
  const rosterCandidates = props.tokens.filter((token) => token.layer !== "map" && !combatantTokenIds.has(token.id));
  const combatantActor = (combatant: Combat["combatants"][number]): Actor | undefined => {
    if (combatant.actorId) return actorById.get(combatant.actorId);
    const linkedActorId = combatant.tokenId ? tokenById.get(combatant.tokenId)?.actorId : undefined;
    return linkedActorId ? actorById.get(linkedActorId) : undefined;
  };

  function runPendingControl(key: string, label: string, taskAction: () => void | Promise<void>) {
    if (pendingControlsRef.current.has(key)) return;
    pendingControlsRef.current.add(key);
    setPendingControls((current) => new Set(current).add(key));
    void action.runAction(label, async () => {
      await taskAction();
    })
      .finally(() => {
        pendingControlsRef.current.delete(key);
        setPendingControls((current) => {
          if (!current.has(key)) return current;
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      });
  }

  useEffect(() => {
    setEndConfirmationId("");
  }, [props.combat?.id, props.combat?.round, props.combat?.turnIndex]);

  function requestCombatEnd(combat: Combat) {
    if (endConfirmationId !== combat.id) {
      setEndConfirmationId(combat.id);
      return;
    }
    setEndConfirmationId("");
    runPendingControl(`turn:${combat.id}`, "End combat", () => props.onEnd(combat));
  }

  return (
    <div className="panel-stack">
      <header className="panel-hero combat-hero">
        <div>
          <div className="section-title">Combat</div>
          <h2>{props.combat ? `Round ${formatNumber(props.combat.round)}` : "No Active Combat"}</h2>
          {activeCombatant && <p className="panel-subtitle">{activeCombatant.name} is up</p>}
        </div>
      </header>
      <RetryableActionNotice operation={action.operation} onRetry={action.retryAction ? () => void action.retryAction?.() : undefined} onDismiss={action.clearAction} />
      {props.combat ? (
        <>
          <p className="panel-status-line" aria-label="Combat summary">
            <span>{formatNumber(combatants.length)} combatants</span>
            <span>{formatNumber(defeatedCount)} defeated</span>
            {readyCount > 0 && <span>{formatNumber(readyCount)} ready</span>}
          </p>
          {pendingActions.length > 0 && (
            <section className="admin-list" aria-label="Pending combat actions">
              <div className="section-title">Pending GM Confirmation</div>
              {pendingActions.map((action) => {
                const actionPending = pendingControls.has(`action:${action.id}`);
                return (
                  <article className="operator-item admin-item" key={action.id}>
                    <div className="combatant-header">
                      <div>
                        <span>{action.actorName}</span>
                        <strong>{action.actionLabel}</strong>
                      </div>
                      <span className="status-pill">pending</span>
                    </div>
                    <p>{action.resultSummary ?? combatActionRollSummary(action)}</p>
                    <div className="admin-meta">
                      <span>{action.targetActorIds.length} target{action.targetActorIds.length === 1 ? "" : "s"}</span>
                      <span>{action.consumeResources ? "resources spent on confirm" : "no resource spend"}</span>
                      <span>{action.applyEffect ? "effect previewed" : "roll only"}</span>
                    </div>
                    <div className="admin-actions">
                      <button className="ghost-button" onClick={() => runPendingControl(`action:${action.id}`, `Reject ${action.actionLabel}`, () => props.onRejectAction(props.combat!, action))} disabled={!props.canManage || actionPending}>
                        <X size={14} /> Reject
                      </button>
                      <button className="primary-button" onClick={() => runPendingControl(`action:${action.id}`, `Confirm ${action.actionLabel}`, () => props.onConfirmAction(props.combat!, action))} disabled={!props.canManage || actionPending}>
                        <Check size={14} /> Confirm
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          {(props.combat.legendaryActionPrompts?.length ?? 0) > 0 && (
            <section className="admin-list legendary-action-prompts" aria-label="Legendary action opportunities">
              <div className="section-title">Between-turn legendary actions</div>
              {props.combat.legendaryActionPrompts!.map((prompt) => (
                <LegendaryActionPromptCard
                  key={prompt.id}
                  combat={props.combat!}
                  prompt={prompt}
                  canSpend={props.canManageLegendaryActions}
                  disabledReason={props.legendaryActionsDisabledReason}
                  onSpend={props.onSpendLegendaryAction}
                />
              ))}
            </section>
          )}
          <CombatRosterControls
            combat={props.combat}
            tokens={rosterCandidates}
            canManage={props.canManageRoster}
            disabledReason={props.rosterDisabledReason}
            onAdd={props.onAddCombatant}
          />
          <div className="combatant-list" role="list" aria-label="Initiative order">
            {combatants.map((combatant, index) => {
              const isTurn = combatant.id === activeCombatant?.id;
              const expanded = expandedCombatantId === combatant.id;
              const actor = combatantActor(combatant);
              const hp = actor?.data.hp as { current?: number; max?: number } | undefined;
              const hpRatio = hp && typeof hp.current === "number" && typeof hp.max === "number" && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : undefined;
              const hpTone = hpRatio === undefined ? "" : hpRatio <= 0.25 ? "danger" : hpRatio <= 0.5 ? "warning" : "healthy";
              const stateLabel = combatant.defeated ? "Defeated" : combatant.surprised ? (isTurn ? "Surprised turn" : "Surprised") : isTurn ? "Taking turn" : combatant.readiness === "ready" ? "Ready action" : combatant.readiness === "delayed" ? "Delayed" : hp && typeof hp.current === "number" && typeof hp.max === "number" ? `${formatNumber(hp.current)}/${formatNumber(hp.max)} HP` : "Waiting";
              const readinessPending = pendingControls.has(`combatant:${combatant.id}:readiness`);
              const defeatedPending = pendingControls.has(`combatant:${combatant.id}:defeated`);
              const resourcePending = pendingControls.has(`combatant:${combatant.id}:resource`);
              return (
                <div className={`combatant-row ${isTurn ? "current" : ""} ${combatant.defeated ? "defeated" : ""}`} role="listitem" key={combatant.id}>
                  <div className="combatant-row-main">
                    <span className="combatant-order" aria-hidden="true">{isTurn ? <ChevronRight size={14} /> : formatNumber(index + 1)}</span>
                    <button className="combatant-focus" type="button" title="Select this token on the board" onClick={() => props.onFocusCombatant(combatant)}>
                      <span className="party-avatar">{combatant.name.slice(0, 2).toUpperCase()}</span>
                      <span className="combatant-name">
                        <strong>{combatant.name}</strong>
                        <small>
                          {stateLabel}
                          {combatant.conditions?.length ? ` - ${combatant.conditions.join(", ")}` : ""}
                        </small>
                        {hpRatio !== undefined && (
                          <span className={`combatant-hp ${hpTone}`} aria-hidden="true">
                            <span style={{ width: `${Math.round(hpRatio * 100)}%` }} />
                          </span>
                        )}
                      </span>
                    </button>
                    {props.canManage ? (
                      <CombatantDraftInput
                        ariaLabel={`${combatant.name} initiative`}
                        className="combatant-initiative"
                        title="Initiative"
                        type="number"
                        value={String(combatant.initiative)}
                        disabled={!props.canManage}
                        onCommit={(value) => props.onUpdateCombatant(props.combat!, combatant.id, { initiative: Number(value) })}
                        onError={props.onStatus}
                      />
                    ) : (
                      <span className="combatant-initiative combatant-initiative-static" title="Initiative">{formatNumber(combatant.initiative)}</span>
                    )}
                    <button className="icon-button combatant-expand" type="button" aria-expanded={expanded} aria-label={`${combatant.name} details`} onClick={() => setExpandedCombatantId(expanded ? "" : combatant.id)}>
                      <ChevronDown className={expanded ? "open" : ""} size={14} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="combatant-detail">
                      <div className="combatant-controls">
                        <label>
                          <span>Readiness</span>
                          <select aria-label={`${combatant.name} readiness`} value={combatant.readiness ?? "normal"} disabled={!props.canManage || readinessPending} onChange={(event) => runPendingControl(`combatant:${combatant.id}:readiness`, `Update ${combatant.name} readiness`, () => props.onUpdateCombatant(props.combat!, combatant.id, { readiness: event.target.value as NonNullable<typeof combatant.readiness> }))}>
                            <option value="normal">Normal turn</option>
                            <option value="ready">Ready action</option>
                            <option value="delayed">Delayed turn</option>
                          </select>
                        </label>
                        <label>
                          <span>Conditions</span>
                          <CombatantDraftInput ariaLabel={`${combatant.name} combat conditions`} placeholder="prone, stunned" value={formatCombatantConditions(combatant)} disabled={!props.canManage} onCommit={(value) => props.onUpdateCombatant(props.combat!, combatant.id, { conditions: parseCombatantConditions(value) })} onError={props.onStatus} />
                        </label>
                        <label>
                          <span>Successes</span>
                          <CombatantDraftInput ariaLabel={`${combatant.name} death save successes`} type="number" min={0} max={3} value={String(combatant.deathSaveSuccesses ?? 0)} disabled={!props.canManage} onCommit={(value) => props.onUpdateCombatant(props.combat!, combatant.id, { deathSaveSuccesses: boundedCombatCounter(value) })} onError={props.onStatus} />
                        </label>
                        <label>
                          <span>Failures</span>
                          <CombatantDraftInput ariaLabel={`${combatant.name} death save failures`} type="number" min={0} max={3} value={String(combatant.deathSaveFailures ?? 0)} disabled={!props.canManage} onCommit={(value) => props.onUpdateCombatant(props.combat!, combatant.id, { deathSaveFailures: boundedCombatCounter(value) })} onError={props.onStatus} />
                        </label>
                      </div>
                      <div className="combatant-flags">
                        <label className="inline-check">
                          <input type="checkbox" checked={combatant.defeated} disabled={!props.canManage || defeatedPending} onChange={(event) => runPendingControl(`combatant:${combatant.id}:defeated`, `Update ${combatant.name} defeated state`, () => props.onUpdateCombatant(props.combat!, combatant.id, { defeated: event.target.checked }))} />
                          <span>Defeated</span>
                        </label>
                        <label className="inline-check">
                          <input type="checkbox" checked={combatant.resourceUsed ?? false} disabled={!props.canManage || resourcePending} onChange={(event) => runPendingControl(`combatant:${combatant.id}:resource`, `Update ${combatant.name} resource use`, () => props.onUpdateCombatant(props.combat!, combatant.id, { resourceUsed: event.target.checked }))} />
                          <span>{combatant.resourceLabel ? `${combatant.resourceLabel} used` : "Resource used"}</span>
                        </label>
                      </div>
                      <p className="panel-status-line" aria-label={`${combatant.name} combat state`}>
                        {combatant.surprised && <span>Surprised at combat start</span>}
                        <span>Death saves {combatant.deathSaveSuccesses ?? 0}/3 - {combatant.deathSaveFailures ?? 0}/3</span>
                        {combatant.deathSaveOutcome && <span>{titleCaseLabel(combatant.deathSaveOutcome)}</span>}
                        {combatant.resourceSpent && <span>{combatant.resourceLabel ?? "Resource"} depleted</span>}
                        {combatantConditionTimingLabels(combatant).map((label) => (
                          <span key={`${combatant.id}-${label}`}>{label}</span>
                        ))}
                      </p>
                      {actor?.systemId === "dnd-5e-srd" && (
                        <section className="combatant-vitals-tools" aria-label={`${combatant.name} hit point tools`}>
                          <CombatVitalsControls
                            actor={actor}
                            combat={props.combat!}
                            canAdjust={props.canAdjustVitals}
                            disabledReason={props.vitalsDisabledReason}
                            onAdjust={props.onAdjustVitals}
                          />
                          <div title={props.canAdjustVitals ? undefined : props.vitalsDisabledReason}>
                            <TypedDamageCard campaignId={props.campaignId} actor={actor} actors={props.actors} canApply={props.canAdjustVitals} onApplied={props.onTypedDamageApplied} />
                          </div>
                        </section>
                      )}
                      <button
                        className="ghost-button small combatant-remove"
                        type="button"
                        disabled={!props.canManageRoster || pendingControls.has(`combatant:${combatant.id}:remove`)}
                        title={props.canManageRoster ? `Remove ${combatant.name} from combat` : props.rosterDisabledReason}
                        onClick={() => runPendingControl(`combatant:${combatant.id}:remove`, `Remove ${combatant.name} from combat`, () => props.onRemoveCombatant(props.combat!, combatant.id))}
                      >
                        <Trash2 size={14} /> Remove from combat
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {(props.canManage || props.canAwardRewards) && (
            <div className="combat-turn-controls">
              {props.canManage && (
                <div className="combat-turn-navigation" role="group" aria-label="Turn controls">
                  <button className="ghost-button" type="button" onClick={() => runPendingControl(`turn:${props.combat!.id}`, "Move to the previous turn", () => props.onPrevious(props.combat!))} disabled={combatants.length === 0 || turnPending}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button className="primary-button combat-next-turn" type="button" onClick={() => runPendingControl(`turn:${props.combat!.id}`, "Move to the next turn", () => props.onNext(props.combat!))} disabled={combatants.length === 0 || turnPending}>
                    Next turn <ChevronRight size={14} />
                  </button>
                  <button
                    className={endConfirmationId === props.combat.id ? "danger-button" : "ghost-button"}
                    type="button"
                    aria-label={endConfirmationId === props.combat.id ? "Confirm end combat" : "End combat"}
                    onClick={() => requestCombatEnd(props.combat!)}
                    disabled={turnPending}
                  >
                    <X size={14} /> {endConfirmationId === props.combat.id ? "Confirm end" : "End"}
                  </button>
                </div>
              )}
              {props.canAwardRewards && (
                <div className="combat-reward-controls" aria-label="Combat rewards">
                  <form className="xp-award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("party-xp-award") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount > 0) runPendingControl("reward:xp", "Award party XP", async () => { await props.onAwardPartyXp(amount); input.value = ""; }); }}>
                    <input name="party-xp-award" aria-label="Party XP award" type="number" placeholder="XP" />
                    <button className="ghost-button small" type="submit" disabled={pendingControls.has("reward:xp")}>Split XP</button>
                  </form>
                  <form className="xp-award" aria-label="Party gold award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("party-gp-award") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount > 0) runPendingControl("reward:gp", "Award party gold", async () => { await props.onAwardPartyGold(amount); input.value = ""; }); }}>
                    <input name="party-gp-award" aria-label="Party gold award" type="number" placeholder="GP" />
                    <button className="ghost-button small" type="submit" disabled={pendingControls.has("reward:gp")}>Split GP</button>
                  </form>
                  <form className="xp-award combat-loot-award" aria-label="Combat loot award" onSubmit={(event) => { event.preventDefault(); const lootInput = event.currentTarget.elements.namedItem("combat-loot-award") as HTMLInputElement; const noteInput = event.currentTarget.elements.namedItem("combat-loot-note") as HTMLInputElement; if (lootInput.value.trim()) runPendingControl("reward:loot", "Record combat loot", async () => { await props.onRecordLoot(lootInput.value, noteInput.value); lootInput.value = ""; noteInput.value = ""; }); }}>
                    <input name="combat-loot-award" aria-label="Combat loot items" type="text" placeholder="Loot (comma separated)" />
                    <input name="combat-loot-note" aria-label="Combat loot note" type="text" placeholder="Source or note" />
                    <button className="ghost-button small" type="submit" disabled={pendingControls.has("reward:loot")}>Record loot</button>
                  </form>
                </div>
              )}
            </div>
          )}
          {(props.combat.rewards?.length ?? 0) > 0 && (
            <section className="admin-list combat-reward-history" aria-label="Combat reward history">
              <div className="section-title">Rewards &amp; loot history</div>
              {[...(props.combat.rewards ?? [])].reverse().map((reward) => (
                <article className="operator-item admin-item" key={reward.id}>
                  <div className="combatant-header">
                    <strong>{combatRewardSummary(reward)}</strong>
                    <span className="status-pill">recorded</span>
                  </div>
                  {reward.loot.length > 0 && <p>{reward.loot.join(", ")}</p>}
                  {reward.note && <p>{reward.note}</p>}
                  <div className="admin-meta">
                    <span>{formatNumber(reward.recipientActorIds.length)} recipient{reward.recipientActorIds.length === 1 ? "" : "s"}</span>
                    <span>{formatDateTime(reward.createdAt)}</span>
                    {(reward.unallocatedXp > 0 || reward.unallocatedGp > 0) && <span>{combatRewardRemainderLabel(reward)}</span>}
                  </div>
                </article>
              ))}
            </section>
          )}
          <AdvancedCombatMechanics
            campaignId={props.campaignId}
            combat={props.combat}
            actors={props.actors}
            canManage={props.canManage}
            canManageEffects={props.canManageEffects}
            canPreviewEffects={props.canPreviewEffects}
            onCombatUpdated={props.onCombatUpdated}
            onRefresh={props.onRefresh}
            onStatus={props.onStatus}
            onRulesMutationApplied={props.onRulesMutationApplied}
          />
          <details className="create-drawer diagnostics-drawer" aria-label="Combat audit">
            <summary><ScrollText size={15} /> Combat audit <strong>{formatNumber(props.auditLogs.length)}</strong></summary>
            {props.auditLogs.length === 0 ? (
              <div className="empty-state compact">No combat audit entries loaded.</div>
            ) : (
              props.auditLogs.slice(-5).reverse().map((entry) => (
                <article className="operator-item admin-item" key={entry.id}>
                  <strong>{entry.action}</strong>
                  <span>{formatDateTime(entry.createdAt)}</span>
                  <p>{combatAuditLabel(entry)}</p>
                </article>
              ))
            )}
          </details>
        </>
      ) : (
        <>
          <section className="combat-empty-state" aria-label="Review scene combatants">
            <div>
              <Swords size={18} />
              <div>
                <strong>Review combatants first</strong>
                <p>Confirm participants and initiative before round 1.</p>
              </div>
            </div>
            {props.canManage && (
              <div className="button-row">
                <button className="primary-button" onClick={() => runPendingControl("combat:start", "Start combat", props.onStart)} disabled={startPending}>
                  <Swords size={15} /> {startPending ? "Opening..." : "Review combatants"}
                </button>
                <button className="ghost-button" type="button" onClick={props.onPlanEncounter}>
                  <Swords size={15} /> Plan encounter
                </button>
              </div>
            )}
          </section>
          {props.recentCombats.length > 0 && (
            <details className="create-drawer diagnostics-drawer" aria-label="Ended combat recap">
              <summary><ScrollText size={15} /> Recent combats <strong>{formatNumber(props.recentCombats.length)}</strong></summary>
              {props.recentCombats.map((combat) => (
                <article className="operator-item admin-item" key={combat.id}>
                  <strong>Round {combat.round}</strong>
                  <span>{formatDateTime(combat.updatedAt)}</span>
                  <p>{combat.combatants.length} combatants, {combat.combatants.filter((combatant) => combatant.defeated).length} defeated, {combat.actions?.filter((action) => action.status === "confirmed").length ?? 0} confirmed actions, {combat.rewards?.length ?? 0} reward records</p>
                  {(combat.rewards?.length ?? 0) > 0 && <p>{combat.rewards!.map(combatRewardSummary).join("; ")}</p>}
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function LegendaryActionPromptCard(props: {
  combat: Combat;
  prompt: CombatLegendaryActionPrompt;
  canSpend: boolean;
  disabledReason: string;
  onSpend(combat: Combat, prompt: CombatLegendaryActionPrompt, optionName: string, cost: number): Promise<void>;
}) {
  const [optionName, setOptionName] = useState(props.prompt.options[0] ?? "");
  const [cost, setCost] = useState("1");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedOption = props.prompt.options.includes(optionName) ? optionName : props.prompt.options[0] ?? "";

  const spend = async () => {
    const parsedCost = Number(cost);
    if (!props.canSpend || pending) return;
    if (!selectedOption) {
      setError("Choose a legendary action option.");
      return;
    }
    if (!Number.isInteger(parsedCost) || parsedCost < 1 || parsedCost > props.prompt.remainingUses) {
      setError(`Cost must be a whole number from 1 to ${formatNumber(props.prompt.remainingUses)}.`);
      return;
    }
    setPending(true);
    setError("");
    try {
      await props.onSpend(props.combat, props.prompt, selectedOption, parsedCost);
      setCost("1");
    } catch (caught) {
      // Keep the option and cost so the GM can resolve a stale revision and retry.
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <article className="operator-item admin-item legendary-action-prompt" aria-label={`${props.prompt.actorName} legendary action prompt`}>
      <div className="combatant-header">
        <strong>{props.prompt.actorName}</strong>
        <span className="status-pill">Legendary action available ({formatNumber(props.prompt.remainingUses)}/{formatNumber(props.prompt.maximumUses)})</span>
      </div>
      <form className="rest-choice-grid" onSubmit={(event) => { event.preventDefault(); void spend(); }}>
        <label>
          <span>Reviewed option</span>
          <select aria-label={`${props.prompt.actorName} legendary action option`} value={selectedOption} disabled={!props.canSpend || pending || props.prompt.options.length === 0} onChange={(event) => { setOptionName(event.target.value); setError(""); }}>
            {props.prompt.options.length === 0
              ? <option value="">No structured options</option>
              : props.prompt.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          <span>Uses spent</span>
          <input aria-label={`${props.prompt.actorName} legendary action cost`} type="number" inputMode="numeric" min={1} max={props.prompt.remainingUses} step={1} value={cost} disabled={!props.canSpend || pending} onChange={(event) => { setCost(event.target.value); setError(""); }} />
        </label>
        <button className="ghost-button" type="submit" disabled={!props.canSpend || pending || !selectedOption} title={props.canSpend ? "Record this reviewed legendary-action use" : props.disabledReason}>
          <Swords size={14} /> {pending ? "Recording…" : "Record use"}
        </button>
      </form>
      <small>Reviewed/manual: choose targets and resolve the option at the table. This records only the bounded use pool.</small>
      {!props.canSpend && <p className="account-summary">{props.disabledReason}</p>}
      {error && <p className="creator-error" role="alert">Legendary action failed: {error}</p>}
    </article>
  );
}

export function CombatVitalsControls(props: {
  actor: Actor;
  combat: Combat;
  canAdjust: boolean;
  disabledReason: string;
  onAdjust(actor: Actor, kind: Dnd5eSrdCombatVitalsKind, amount: number, combat: Combat): Promise<void>;
}) {
  const [healing, setHealing] = useState("1");
  const [temporaryHitPoints, setTemporaryHitPoints] = useState("1");
  const [pending, setPending] = useState<Dnd5eSrdCombatVitalsKind | "">("");
  const [error, setError] = useState("");

  const submit = async (kind: Dnd5eSrdCombatVitalsKind, value: string) => {
    if (!props.canAdjust || pending) return;
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Enter a positive whole-number amount.");
      return;
    }
    setPending(kind);
    setError("");
    try {
      await props.onAdjust(props.actor, kind, amount, props.combat);
      if (kind === "healing") setHealing("1");
      else setTemporaryHitPoints("1");
    } catch (caught) {
      // Preserve both drafts so correcting a conflict or retrying never loses input.
      setError(errorMessage(caught));
    } finally {
      setPending("");
    }
  };

  return (
    <div className="combat-vitals-controls" aria-label={`${props.actor.name} healing and temporary hit points`}>
      <form onSubmit={(event) => { event.preventDefault(); void submit("healing", healing); }}>
        <label><span>Healing</span><input aria-label={`${props.actor.name} healing amount`} type="number" min={1} step={1} value={healing} disabled={!props.canAdjust || Boolean(pending)} onChange={(event) => setHealing(event.target.value)} /></label>
        <button className="ghost-button small" type="submit" disabled={!props.canAdjust || Boolean(pending)} title={props.canAdjust ? "Apply server-authoritative healing" : props.disabledReason}><HeartPulse size={14} /> {pending === "healing" ? "Healing…" : "Heal"}</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); void submit("temporaryHitPoints", temporaryHitPoints); }}>
        <label><span>Temporary HP</span><input aria-label={`${props.actor.name} temporary hit points`} type="number" min={1} step={1} value={temporaryHitPoints} disabled={!props.canAdjust || Boolean(pending)} onChange={(event) => setTemporaryHitPoints(event.target.value)} /></label>
        <button className="ghost-button small" type="submit" disabled={!props.canAdjust || Boolean(pending)} title={props.canAdjust ? "Set temporary HP using the higher-value rule" : props.disabledReason}><ShieldPlus size={14} /> {pending === "temporaryHitPoints" ? "Applying…" : "Set temp HP"}</button>
      </form>
      {error && <p className="creator-error" role="alert">Vitals update failed: {error}</p>}
    </div>
  );
}

export function CombatRosterControls(props: {
  combat: Combat;
  tokens: Token[];
  canManage: boolean;
  disabledReason: string;
  onAdd(combat: Combat, token: Token, initiative: number): Promise<void>;
}) {
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [initiative, setInitiative] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedToken = props.tokens.find((token) => token.id === selectedTokenId) ?? props.tokens[0];

  const add = async () => {
    const parsedInitiative = Number(initiative);
    if (!props.canManage || !selectedToken || pending) return;
    if (!Number.isFinite(parsedInitiative)) {
      setError("Initiative must be a number.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await props.onAdd(props.combat, selectedToken, parsedInitiative);
      setSelectedTokenId("");
      setInitiative("0");
    } catch (caught) {
      // Keep the selected token and initiative available for explicit retry.
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <details className="create-drawer combat-roster-controls" aria-label="Combat roster controls">
      <summary><Plus size={14} /> Add combatant <strong>{formatNumber(props.tokens.length)} available</strong></summary>
      <form className="rest-choice-grid" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <label><span>Scene token</span><select aria-label="Token to add to combat" value={selectedToken?.id ?? ""} disabled={!props.canManage || pending || props.tokens.length === 0} onChange={(event) => setSelectedTokenId(event.target.value)}>{props.tokens.length === 0 ? <option value="">No eligible scene tokens</option> : props.tokens.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}</select></label>
        <label><span>Initiative</span><input aria-label="New combatant initiative" type="number" value={initiative} disabled={!props.canManage || pending || !selectedToken} onChange={(event) => setInitiative(event.target.value)} /></label>
        <button className="ghost-button" type="submit" disabled={!props.canManage || pending || !selectedToken} title={props.canManage ? "Add this token without changing the active turn" : props.disabledReason}><Plus size={14} /> {pending ? "Adding…" : "Add to combat"}</button>
      </form>
      {!props.canManage && <p className="account-summary">{props.disabledReason}</p>}
      {error && <p className="creator-error" role="alert">Roster update failed: {error}</p>}
    </details>
  );
}

export function combatRosterPatch(combat: Combat, combatants: Combat["combatants"]): Pick<Combat, "combatants" | "turnIndex"> {
  const activeId = combat.combatants[combat.turnIndex]?.id;
  const ordered = combat.manualTurnOrder
    ? combatants
    : combatants.map((combatant, index) => ({ combatant, index }))
      .sort((left, right) => right.combatant.initiative - left.combatant.initiative || left.index - right.index)
      .map(({ combatant }) => combatant);
  const preservedIndex = activeId ? ordered.findIndex((combatant) => combatant.id === activeId) : -1;
  return {
    combatants,
    turnIndex: preservedIndex >= 0 ? preservedIndex : Math.max(0, Math.min(combat.turnIndex, ordered.length - 1))
  };
}


function CombatantDraftInput(props: {
  ariaLabel: string;
  value: string;
  onCommit(value: string): Promise<void>;
  className?: string;
  title?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  onError?(message: string): void;
}) {
  const [draft, setDraft] = useState(props.value);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const skipBlurCommitRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(props.value);
  }, [props.value]);

  const commit = async () => {
    if (pendingRef.current || draft === props.value) return;
    if (props.type === "number" && !Number.isFinite(Number(draft))) {
      setDraft(props.value);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await props.onCommit(draft);
    } catch (error) {
      setDraft(props.value);
      props.onError?.(`${props.ariaLabel} failed: ${errorMessage(error)}. Edit the field again to retry.`);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <input
      ref={inputRef}
      className={props.className}
      aria-label={props.ariaLabel}
      title={props.title}
      type={props.type}
      min={props.min}
      max={props.max}
      placeholder={props.placeholder}
      value={draft}
      disabled={props.disabled || pending}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          skipBlurCommitRef.current = true;
          setDraft(props.value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}


export function nextCombatTurnPosition(combat: Combat, direction: 1 | -1): { turnIndex: number; round: number } {
  const combatants = combat.combatants;
  if (combatants.length === 0) return { turnIndex: 0, round: combat.round };
  if (combatants.every((combatant) => combatant.defeated)) return { turnIndex: combat.turnIndex, round: combat.round };
  let turnIndex = combat.turnIndex;
  let round = combat.round;
  for (let step = 0; step < combatants.length; step += 1) {
    turnIndex += direction;
    if (turnIndex >= combatants.length) {
      turnIndex = 0;
      round += 1;
    } else if (turnIndex < 0) {
      turnIndex = combatants.length - 1;
      round = Math.max(1, round - 1);
    }
    if (!combatants[turnIndex]?.defeated) return { turnIndex, round };
  }
  return { turnIndex: combat.turnIndex, round: combat.round };
}

export function combatTurnCombatant(combat: Combat | undefined, turn: "current" | "next"): Combat["combatants"][number] | undefined {
  if (!combat || combat.combatants.length === 0) return undefined;
  if (combat.turnPresentation !== undefined) {
    const combatantId = turn === "current" ? combat.turnPresentation.currentCombatantId : combat.turnPresentation.nextCombatantId;
    return combatantId ? combat.combatants.find((combatant) => combatant.id === combatantId) : undefined;
  }
  const current = combat.combatants[combat.turnIndex] ?? combat.combatants[0];
  if (turn === "current" || combat.combatants.length < 2) return turn === "current" ? current : undefined;
  const next = combat.combatants[nextCombatTurnPosition(combat, 1).turnIndex];
  return next?.id === current?.id ? undefined : next;
}


export function combatActionRollSummary(action: CombatAction): string {
  if (action.rolls.length === 0) return "No roll result";
  return action.rolls.map((roll) => `${roll.label}: ${roll.total}`).join(", ");
}


export function formatCombatantConditions(combatant: Combat["combatants"][number]): string {
  return combatant.conditions?.join(", ") ?? "";
}


export function parseCombatantConditions(value: string): string[] {
  return value.split(",").map((condition) => condition.trim()).filter(Boolean);
}


export function combatantConditionTimingLabels(combatant: Combat["combatants"][number]): string[] {
  return (combatant.conditions ?? []).flatMap((condition) => {
    const match = condition.match(/^(.+):(\d+)$/);
    if (!match) return [];
    const name = match[1]!.trim();
    const rounds = Number(match[2]);
    if (!name || !Number.isFinite(rounds)) return [];
    return [`${name} expires in ${rounds} ${rounds === 1 ? "round" : "rounds"}`];
  });
}

type CombatRewardRecord = NonNullable<Combat["rewards"]>[number];

export function combatRewardSummary(reward: CombatRewardRecord): string {
  const parts = [
    reward.totalXp > 0 ? `${formatNumber(reward.totalXp)} XP (${formatNumber(reward.xpPerActor)} each)` : "",
    reward.totalGp > 0 ? `${formatNumber(reward.totalGp)} gp (${formatNumber(reward.gpPerActor)} each)` : "",
    reward.loot.length > 0 ? `${formatNumber(reward.loot.length)} loot ${reward.loot.length === 1 ? "item" : "items"}` : ""
  ].filter(Boolean);
  return parts.join(" + ") || "Reward record";
}

export function combatRewardRemainderLabel(reward: CombatRewardRecord): string {
  return [
    reward.unallocatedXp > 0 ? `${formatNumber(reward.unallocatedXp)} XP` : "",
    reward.unallocatedGp > 0 ? `${formatNumber(reward.unallocatedGp)} gp` : ""
  ].filter(Boolean).join(" + ") + " unallocated";
}


export function boundedCombatCounter(value: string): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(3, parsed));
}


export function combatAuditLabel(entry: AuditLog): string {
  const after = entry.after && typeof entry.after === "object" ? (entry.after as Record<string, unknown>) : {};
  const round = typeof after.round === "number" ? after.round : undefined;
  const combatants = typeof after.combatantCount === "number" ? after.combatantCount : undefined;
  const defeated = typeof after.defeatedCount === "number" ? after.defeatedCount : undefined;
  return [`round ${round ?? "?"}`, `${combatants ?? 0} combatants`, `${defeated ?? 0} defeated`].join(" - ");
}
