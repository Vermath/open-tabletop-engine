import type { Actor, AuditLog, Combat, CombatAction, Token } from "@open-tabletop/core";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, ScrollText, Swords, X } from "lucide-react";
import { useState } from "react";
import { actorCombatResource } from "./actor-sheet-data.js";
import { formatDateTime, formatNumber, numericValue, titleCaseLabel } from "./sheet-format.js";


export function CombatPanel(props: { combat?: Combat; recentCombats: Combat[]; auditLogs: AuditLog[]; actors: Actor[]; tokens: Token[]; onFocusCombatant(combatant: Combat["combatants"][number]): void; onStart(): void; onPlanEncounter(): void; onNext(combat: Combat): void; onPrevious(combat: Combat): void; onEnd(combat: Combat): void; onAwardPartyXp(total: number): void; onAwardPartyGold(totalGp: number): void; canAwardXp: boolean; onUpdateCombatant(combat: Combat, combatantId: string, patch: Partial<Combat["combatants"][number]>): void; onConfirmAction(combat: Combat, action: CombatAction): void; onRejectAction(combat: Combat, action: CombatAction): void; canManage: boolean }) {
  const [expandedCombatantId, setExpandedCombatantId] = useState("");
  const combatants = props.combat?.combatants ?? [];
  const activeCombatant = props.combat && combatants.length > 0 ? combatants[props.combat.turnIndex] ?? combatants[0] : undefined;
  const readyCount = combatants.filter((combatant) => combatant.readiness === "ready").length;
  const defeatedCount = combatants.filter((combatant) => combatant.defeated).length;
  const pendingActions = props.combat?.actions?.filter((action) => action.status === "pending_gm") ?? [];
  const actorById = new Map(props.actors.map((actor) => [actor.id, actor]));
  const tokenById = new Map(props.tokens.map((token) => [token.id, token]));
  const combatantActor = (combatant: Combat["combatants"][number]): Actor | undefined => {
    if (combatant.actorId) return actorById.get(combatant.actorId);
    const linkedActorId = combatant.tokenId ? tokenById.get(combatant.tokenId)?.actorId : undefined;
    return linkedActorId ? actorById.get(linkedActorId) : undefined;
  };
  return (
    <div className="panel-stack">
      <header className="panel-hero combat-hero">
        <div>
          <div className="section-title">Combat</div>
          <h2>{props.combat ? `Round ${formatNumber(props.combat.round)}` : "No Active Combat"}</h2>
          {activeCombatant && <p className="panel-subtitle">{activeCombatant.name} is up</p>}
        </div>
      </header>
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
              {pendingActions.map((action) => (
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
                    <button className="ghost-button" onClick={() => props.onRejectAction(props.combat!, action)} disabled={!props.canManage}>
                      <X size={14} /> Reject
                    </button>
                    <button className="primary-button" onClick={() => props.onConfirmAction(props.combat!, action)} disabled={!props.canManage}>
                      <Check size={14} /> Confirm
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          <div className="combatant-list" role="list" aria-label="Initiative order">
            {combatants.map((combatant, index) => {
              const isTurn = index === props.combat?.turnIndex;
              const expanded = expandedCombatantId === combatant.id;
              const actor = combatantActor(combatant);
              const hp = actor?.data.hp as { current?: number; max?: number } | undefined;
              const hpRatio = hp && typeof hp.current === "number" && typeof hp.max === "number" && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : undefined;
              const hpTone = hpRatio === undefined ? "" : hpRatio <= 0.25 ? "danger" : hpRatio <= 0.5 ? "warning" : "healthy";
              const stateLabel = combatant.defeated ? "Defeated" : isTurn ? "Taking turn" : combatant.readiness === "ready" ? "Ready action" : combatant.readiness === "delayed" ? "Delayed" : hp && typeof hp.current === "number" && typeof hp.max === "number" ? `${formatNumber(hp.current)}/${formatNumber(hp.max)} HP` : "Waiting";
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
                      <input className="combatant-initiative" aria-label={`${combatant.name} initiative`} title="Initiative" type="number" value={combatant.initiative} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { initiative: Number(event.target.value) })} />
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
                          <select aria-label={`${combatant.name} readiness`} value={combatant.readiness ?? "normal"} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { readiness: event.target.value as NonNullable<typeof combatant.readiness> })}>
                            <option value="normal">Normal turn</option>
                            <option value="ready">Ready action</option>
                            <option value="delayed">Delayed turn</option>
                          </select>
                        </label>
                        <label>
                          <span>Conditions</span>
                          <input aria-label={`${combatant.name} combat conditions`} value={formatCombatantConditions(combatant)} disabled={!props.canManage} placeholder="prone, stunned" onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { conditions: parseCombatantConditions(event.target.value) })} />
                        </label>
                        <label>
                          <span>Successes</span>
                          <input aria-label={`${combatant.name} death save successes`} type="number" min={0} max={3} value={combatant.deathSaveSuccesses ?? 0} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { deathSaveSuccesses: boundedCombatCounter(event.target.value) })} />
                        </label>
                        <label>
                          <span>Failures</span>
                          <input aria-label={`${combatant.name} death save failures`} type="number" min={0} max={3} value={combatant.deathSaveFailures ?? 0} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { deathSaveFailures: boundedCombatCounter(event.target.value) })} />
                        </label>
                      </div>
                      <div className="combatant-flags">
                        <label className="inline-check">
                          <input type="checkbox" checked={combatant.defeated} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { defeated: event.target.checked })} />
                          <span>Defeated</span>
                        </label>
                        <label className="inline-check">
                          <input type="checkbox" checked={combatant.resourceUsed ?? false} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { resourceUsed: event.target.checked })} />
                          <span>{combatant.resourceLabel ? `${combatant.resourceLabel} used` : "Resource used"}</span>
                        </label>
                      </div>
                      <p className="panel-status-line" aria-label={`${combatant.name} combat state`}>
                        <span>Death saves {combatant.deathSaveSuccesses ?? 0}/3 - {combatant.deathSaveFailures ?? 0}/3</span>
                        {combatant.deathSaveOutcome && <span>{titleCaseLabel(combatant.deathSaveOutcome)}</span>}
                        {combatant.resourceSpent && <span>{combatant.resourceLabel ?? "Resource"} depleted</span>}
                        {combatantConditionTimingLabels(combatant).map((label) => (
                          <span key={`${combatant.id}-${label}`}>{label}</span>
                        ))}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {(props.canManage || props.canAwardXp) && (
            <div className="combat-turn-controls" role="group" aria-label="Turn controls">
              {props.canManage && (
                <>
                  <button className="ghost-button" onClick={() => props.onPrevious(props.combat!)} disabled={combatants.length === 0}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button className="primary-button" onClick={() => props.onNext(props.combat!)} disabled={combatants.length === 0}>
                    Next turn <ChevronRight size={14} />
                  </button>
                  <button className="ghost-button" onClick={() => props.onEnd(props.combat!)}>
                    <X size={14} /> End
                  </button>
                </>
              )}
              {props.canAwardXp && (
                <>
                  <form className="xp-award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("party-xp-award") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount > 0) { props.onAwardPartyXp(amount); input.value = ""; } }}>
                    <input name="party-xp-award" aria-label="Party XP award" type="number" placeholder="XP" />
                    <button className="ghost-button small" type="submit">Split XP</button>
                  </form>
                  <form className="xp-award" aria-label="Party gold award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("party-gp-award") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount > 0) { props.onAwardPartyGold(amount); input.value = ""; } }}>
                    <input name="party-gp-award" aria-label="Party gold award" type="number" placeholder="GP" />
                    <button className="ghost-button small" type="submit">Split GP</button>
                  </form>
                </>
              )}
            </div>
          )}
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
          <section className="combat-empty-state" aria-label="Start combat from scene tokens">
            <div>
              <Swords size={18} />
              <div>
                <strong>Ready to roll initiative</strong>
                <p>Build the first round from every token in the active scene.</p>
              </div>
            </div>
            {props.canManage && (
              <div className="button-row">
                <button className="primary-button" onClick={props.onStart}>
                  <Swords size={15} /> Start combat
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
                  <p>{combat.combatants.length} combatants, {combat.combatants.filter((combatant) => combatant.defeated).length} defeated, {combat.actions?.filter((action) => action.status === "confirmed").length ?? 0} confirmed actions</p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </div>
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
