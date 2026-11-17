import type { Actor, Combat, CombatEnvironmentMechanic, DndRulesMutationUndoDescriptor, RulesEffectSchedule, RulesEffectScheduleEvent, RulesEffectScheduleTiming } from "@open-tabletop/core";
import { Clock3, Sparkles, WandSparkles } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { apiDelete, apiPatch, apiPost } from "./api.js";
import { errorMessage, formatNumber, recordValue, stringValue, titleCaseLabel } from "./sheet-format.js";
import { isStaleWriteError, sharedMutationIdempotencyKey, staleDraftPreservedMessage } from "./shared-mutation.js";
import { RulesSupportBoundaryNotice, rulesBoundaryFromSpell } from "./rules-support-boundary.js";
import { useConsequenceReview, type ConsequenceReviewRequest } from "./consequence-review.js";

interface EffectScheduleEvaluation {
  phase: RulesEffectScheduleTiming;
  round: number;
  turnIndex: number;
  events: RulesEffectScheduleEvent[];
  actorChanges: Array<{ actorId: string; reason: string }>;
  unresolvedEventIds: string[];
  canApply: boolean;
  combatUpdatedAt: string;
  preparedPreviewKey?: string;
  preparation?: {
    preparedPreviewKey: string;
    combatId: string;
    revisions: { combatUpdatedAt: string; actorUpdatedAt: Record<string, string> };
    resolutionHash: string;
  };
}

interface SpellHelperPreview {
  spellId: string;
  spellName: string;
  supported: boolean;
  automation: "preview_only" | "schedule_template" | "manual";
  summary: string;
  rolls: Array<{ label: string; formula: string; targetActorId?: string; save?: { ability: string; success?: string } }>;
  scheduleTemplates: Array<{ targetActorId: string; label: string; schedule: RulesEffectSchedule; conditionIds?: string[] }>;
  manualSteps: string[];
  warnings: string[];
}

interface SpellHelperResult {
  preview: SpellHelperPreview;
  source: { id: string; provenance: Record<string, unknown> };
}

export interface AdvancedCombatMechanicsProps {
  campaignId: string;
  combat: Combat;
  actors: Actor[];
  canManage: boolean;
  canManageEffects: boolean;
  canPreviewEffects: boolean;
  onCombatUpdated(combat: Combat): void;
  onRefresh(): Promise<void>;
  onStatus(message: string): void;
  onRulesMutationApplied?(undo: DndRulesMutationUndoDescriptor): void;
}

const effectPhases: Array<{ value: RulesEffectScheduleTiming; label: string }> = [
  { value: "start_turn", label: "Start of turn" },
  { value: "end_turn", label: "End of turn" },
  { value: "start_round", label: "Start of round" },
  { value: "end_round", label: "End of round" },
  { value: "initiative_count", label: "Initiative count" },
  { value: "time", label: "Clock time" },
  { value: "manual", label: "Manual" },
];

const specializedSpells = [
  { id: "magic-missile", name: "Magic Missile", minimumSlot: 1 },
  { id: "bless", name: "Bless", minimumSlot: 1 },
  { id: "moonbeam", name: "Moonbeam", minimumSlot: 2 },
  { id: "delayed-blast-fireball", name: "Delayed Blast Fireball", minimumSlot: 7 },
] as const;

function scheduledEffectRows(actors: Actor[]): Array<{ actorId: string; actorName: string; id: string; label: string; timing: string }> {
  return actors.flatMap((actor) => {
    const effects = recordValue(recordValue(actor.data).rulesEngine).activeEffects;
    if (!Array.isArray(effects)) return [];
    return effects.flatMap((rawEffect) => {
      const effect = recordValue(rawEffect);
      const schedule = recordValue(effect.schedule);
      const id = stringValue(effect.id);
      const timing = stringValue(schedule.timing);
      if (!id || !timing) return [];
      return [{ actorId: actor.id, actorName: actor.name, id, label: stringValue(effect.label) ?? stringValue(effect.name) ?? id, timing }];
    });
  });
}

function mechanicDue(mechanic: CombatEnvironmentMechanic, combat: Combat): boolean {
  if (!mechanic.enabled || combat.round < mechanic.schedule.startsAtRound) return false;
  if ((combat.round - mechanic.schedule.startsAtRound) % mechanic.schedule.intervalRounds !== 0) return false;
  if (mechanic.lastTriggeredRound === combat.round) return false;
  if (mechanic.schedule.timing === "manual") return false;
  if (mechanic.schedule.timing === "round_start") return combat.turnIndex === 0;
  if (mechanic.schedule.timing === "round_end") return combat.turnIndex === Math.max(0, combat.combatants.length - 1);
  const current = combat.combatants[combat.turnIndex];
  const previous = combat.turnIndex > 0 ? combat.combatants[combat.turnIndex - 1] : undefined;
  const count = mechanic.schedule.initiativeCount;
  return count !== undefined && Boolean(current) && current!.initiative <= count && (!previous || previous.initiative > count);
}

export function AdvancedCombatMechanics(props: AdvancedCombatMechanicsProps) {
  const fieldIdPrefix = `advanced-combat-mechanics-${props.combat.id}`;
  const consequenceReview = useConsequenceReview();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState<CombatEnvironmentMechanic["kind"]>("lair_action");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CombatEnvironmentMechanic["visibility"]>("gm_only");
  const [mechanicTiming, setMechanicTiming] = useState<CombatEnvironmentMechanic["schedule"]["timing"]>("initiative_count");
  const [initiativeCount, setInitiativeCount] = useState(20);
  const [phase, setPhase] = useState<RulesEffectScheduleTiming>("end_turn");
  const [effectPreview, setEffectPreview] = useState<EffectScheduleEvaluation>();
  const [saveOutcomes, setSaveOutcomes] = useState<Record<string, "success" | "failure">>({});
  const [casterActorId, setCasterActorId] = useState("");
  const [spellId, setSpellId] = useState<(typeof specializedSpells)[number]["id"]>("magic-missile");
  const [slotLevel, setSlotLevel] = useState(1);
  const [targetActorIds, setTargetActorIds] = useState<string[]>([]);
  const [roundsHeld, setRoundsHeld] = useState(0);
  const [spellPreview, setSpellPreview] = useState<SpellHelperResult>();
  const [mechanicsDrawerOpen, setMechanicsDrawerOpen] = useState((props.combat.environmentMechanics?.length ?? 0) > 0);
  const [effectsDrawerOpen, setEffectsDrawerOpen] = useState(false);
  const [spellDrawerOpen, setSpellDrawerOpen] = useState(false);

  const dndActors = useMemo(() => props.actors.filter((actor) => actor.systemId === "dnd-5e-srd"), [props.actors]);
  const effectRows = useMemo(() => scheduledEffectRows(dndActors), [dndActors]);
  const mechanics = props.combat.environmentMechanics ?? [];

  async function run(label: string, task: () => Promise<void>) {
    if (pending) return;
    setPending(label);
    setError("");
    try {
      await task();
    } catch (caught) {
      if (isStaleWriteError(caught)) await props.onRefresh();
      const message = isStaleWriteError(caught) ? staleDraftPreservedMessage : errorMessage(caught);
      setError(message);
      props.onStatus(message);
    } finally {
      setPending("");
    }
  }

  function applyCombat(combat: Combat, message: string) {
    props.onCombatUpdated(combat);
    props.onStatus(message);
  }

  async function createMechanic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !description.trim()) return;
    await run("mechanic:create", async () => {
      const payload = {
        kind,
        name: name.trim(),
        description: description.trim(),
        visibility,
        enabled: true,
        schedule: {
          timing: mechanicTiming,
          ...(mechanicTiming === "initiative_count" ? { initiativeCount } : {}),
          startsAtRound: props.combat.round,
          intervalRounds: 1,
        },
        options: [],
        expectedUpdatedAt: props.combat.updatedAt,
      };
      const combat = await apiPost<Combat>(`/api/v1/combats/${props.combat.id}/environment-mechanics`, payload, {
        idempotencyKey: sharedMutationIdempotencyKey(`combat:mechanic:create:${props.combat.id}`, props.combat.updatedAt, payload)
      });
      setName("");
      setDescription("");
      applyCombat(combat, "Environment mechanic created");
    });
  }

  async function updateMechanic(mechanic: CombatEnvironmentMechanic, patch: { enabled?: boolean; visibility?: CombatEnvironmentMechanic["visibility"] }) {
    await run(`mechanic:update:${mechanic.id}`, async () => {
      const payload = {
        ...patch,
        expectedUpdatedAt: props.combat.updatedAt,
      };
      const combat = await apiPatch<Combat>(`/api/v1/combats/${props.combat.id}/environment-mechanics/${mechanic.id}`, payload, {
        idempotencyKey: sharedMutationIdempotencyKey(`combat:mechanic:update:${props.combat.id}:${mechanic.id}`, props.combat.updatedAt, payload)
      });
      applyCombat(combat, "Environment mechanic updated");
    });
  }

  async function triggerMechanic(mechanic: CombatEnvironmentMechanic, optionId?: string) {
    await run(`mechanic:trigger:${mechanic.id}`, async () => {
      const payload = {
        ...(optionId ? { optionId } : {}),
        expectedUpdatedAt: props.combat.updatedAt,
      };
      const combat = await apiPost<Combat>(`/api/v1/combats/${props.combat.id}/environment-mechanics/${mechanic.id}/trigger`, payload, {
        idempotencyKey: sharedMutationIdempotencyKey(`combat:mechanic:trigger:${props.combat.id}:${mechanic.id}`, props.combat.updatedAt, payload)
      });
      applyCombat(combat, `${mechanic.name} triggered`);
    });
  }

  async function deleteMechanic(mechanic: CombatEnvironmentMechanic) {
    await run(`mechanic:delete:${mechanic.id}`, async () => {
      const combat = await apiDelete<Combat>(`/api/v1/combats/${props.combat.id}/environment-mechanics/${mechanic.id}?expectedUpdatedAt=${encodeURIComponent(props.combat.updatedAt)}`, {
        idempotencyKey: sharedMutationIdempotencyKey(`combat:mechanic:delete:${props.combat.id}:${mechanic.id}`, props.combat.updatedAt, {}),
      });
      applyCombat(combat, "Environment mechanic deleted");
    });
  }

  async function previewEffects() {
    await run("effects:preview", async () => {
      const preview = await apiPost<EffectScheduleEvaluation>(`/api/v1/combats/${props.combat.id}/effects/preview`, { phase, now: new Date().toISOString() });
      setEffectPreview(preview);
      setSaveOutcomes({});
      props.onStatus(preview.unresolvedEventIds.length ? "Scheduled effects need save outcomes" : "Scheduled effects previewed");
    });
  }

  async function advanceEffects() {
    if (!effectPreview) return;
    await run("effects:advance", async () => {
      const previewIntent = { phase, saveOutcomes };
      const previewKey = sharedMutationIdempotencyKey(`combat:effects:preview:${props.combat.id}`, props.combat.updatedAt, previewIntent);
      const prepared = await apiPost<EffectScheduleEvaluation>(`/api/v1/combats/${props.combat.id}/effects/preview`, {
        phase,
        now: new Date().toISOString(),
        saveOutcomes,
        prepare: true,
      }, { idempotencyKey: previewKey });
      setEffectPreview(prepared);
      if (!prepared.canApply || !prepared.preparation) {
        props.onStatus("Scheduled effects still need explicit save outcomes");
        return;
      }
      if (!await consequenceReview.review(scheduledEffectConsequenceReview(prepared, props.actors))) {
        props.onStatus("Scheduled-effect advancement cancelled after review");
        return;
      }
      const result = await apiPost<{ combat: Combat; evaluation: EffectScheduleEvaluation; rulesMutationId: string; undo: DndRulesMutationUndoDescriptor }>(`/api/v1/combats/${props.combat.id}/effects/advance`, {
        preparedPreviewKey: prepared.preparation.preparedPreviewKey,
        expectedUpdatedAt: prepared.preparation.revisions.combatUpdatedAt,
      }, { idempotencyKey: sharedMutationIdempotencyKey(`combat:effects:advance:${props.combat.id}`, prepared.preparation.revisions.combatUpdatedAt, { preparedPreviewKey: prepared.preparation.preparedPreviewKey }) });
      setEffectPreview(result.evaluation);
      props.onRulesMutationApplied?.(result.undo);
      applyCombat(result.combat, "Scheduled effects advanced");
      await props.onRefresh();
    });
  }

  async function previewSpell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const caster = casterActorId || dndActors[0]?.id;
    if (!caster) return;
    await run("spell:preview", async () => {
      const selectedSpell = specializedSpells.find((spell) => spell.id === spellId)!;
      const result = await apiPost<SpellHelperResult>(`/api/v1/campaigns/${props.campaignId}/systems/dnd-5e-srd/spell-helper/preview`, {
        casterActorId: caster,
        spellId,
        targetActorIds,
        slotLevel: Math.max(selectedSpell.minimumSlot, slotLevel),
        options: {
          ...(spellId === "delayed-blast-fireball" ? { roundsHeld } : {}),
          ...(spellId === "magic-missile" && targetActorIds.length === 1 ? { dartAssignments: { [targetActorIds[0]!]: 2 + Math.max(1, slotLevel) } } : {}),
        },
      });
      setSpellPreview(result);
      props.onStatus(`${result.preview.spellName} helper previewed`);
    });
  }

  return (<>
    {consequenceReview.dialog}
    <section className="advanced-combat-mechanics" aria-label="Advanced D&D combat mechanics">
      <div className="section-title">Advanced D&amp;D Mechanics</div>
      <p className="panel-subtitle">Reviewed prompts and deterministic lifecycle helpers. Damage, movement, and map geometry remain manual unless shown in the preview.</p>
      <div className="sr-only" aria-live="polite">{pending ? "Working" : error || "Ready"}</div>
      {error && <p className="field-error" role="alert">{error}</p>}

      <details className="create-drawer" open={mechanicsDrawerOpen} onToggle={(event) => setMechanicsDrawerOpen(event.currentTarget.open)}>
        <summary><Sparkles size={15} /> Lair &amp; regional mechanics <strong>{formatNumber(mechanics.length)}</strong></summary>
        {mechanics.length === 0 ? <p className="empty-state compact">No environment prompts authored for this combat.</p> : (
          <div className="admin-list">
            {mechanics.map((mechanic) => (
              <article className="operator-item admin-item" key={mechanic.id}>
                <div className="combatant-header">
                  <strong>{mechanic.name}</strong>
                  <span className={`status-pill ${mechanicDue(mechanic, props.combat) ? "warning" : ""}`}>{mechanicDue(mechanic, props.combat) ? "due" : mechanic.enabled ? "ready" : "disabled"}</span>
                </div>
                <p>{mechanic.description}</p>
                <div className="admin-meta">
                  <span>{titleCaseLabel(mechanic.kind)}</span>
                  <span>{titleCaseLabel(mechanic.schedule.timing)}</span>
                  <span>{formatNumber(mechanic.triggerCount)} trigger{mechanic.triggerCount === 1 ? "" : "s"}</span>
                  <span>{mechanic.visibility === "gm_only" ? "GM only" : "Public"}</span>
                </div>
                {props.canManage && (
                  <div className="admin-actions">
                    <button type="button" className="ghost-button small" disabled={Boolean(pending)} onClick={() => void updateMechanic(mechanic, { enabled: !mechanic.enabled })}>{mechanic.enabled ? "Disable" : "Enable"}</button>
                    <button type="button" className="ghost-button small" disabled={Boolean(pending) || !mechanic.enabled} onClick={() => void triggerMechanic(mechanic)}>Trigger</button>
                    {mechanic.options.map((option) => <button type="button" className="ghost-button small" disabled={Boolean(pending) || !mechanic.enabled} key={option.id} onClick={() => void triggerMechanic(mechanic, option.id)}>{option.name}</button>)}
                    <button type="button" className="ghost-button small danger" disabled={Boolean(pending)} onClick={() => void deleteMechanic(mechanic)}>Delete</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {props.canManage && (
          <form className="advanced-mechanics-form" onSubmit={(event) => void createMechanic(event)}>
            <label htmlFor={`${fieldIdPrefix}-mechanic-kind`}><span>Kind</span><select id={`${fieldIdPrefix}-mechanic-kind`} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="lair_action">Lair action</option><option value="regional_effect">Regional effect</option></select></label>
            <label htmlFor={`${fieldIdPrefix}-mechanic-name`}><span>Name</span><input id={`${fieldIdPrefix}-mechanic-name`} required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="wide" htmlFor={`${fieldIdPrefix}-mechanic-description`}><span>Description</span><textarea id={`${fieldIdPrefix}-mechanic-description`} required maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label htmlFor={`${fieldIdPrefix}-mechanic-visibility`}><span>Visibility</span><select id={`${fieldIdPrefix}-mechanic-visibility`} value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="gm_only">GM only</option><option value="public">Public</option></select></label>
            <label htmlFor={`${fieldIdPrefix}-mechanic-timing`}><span>Timing</span><select id={`${fieldIdPrefix}-mechanic-timing`} value={mechanicTiming} onChange={(event) => setMechanicTiming(event.target.value as typeof mechanicTiming)}><option value="initiative_count">Initiative count</option><option value="round_start">Round start</option><option value="round_end">Round end</option><option value="manual">Manual</option></select></label>
            {mechanicTiming === "initiative_count" && <label htmlFor={`${fieldIdPrefix}-mechanic-initiative`}><span>Initiative</span><input id={`${fieldIdPrefix}-mechanic-initiative`} type="number" min={-1000} max={1000} value={initiativeCount} onChange={(event) => setInitiativeCount(Number(event.target.value))} /></label>}
            <button className="primary-button" type="submit" disabled={Boolean(pending) || !name.trim() || !description.trim()}>Add mechanic</button>
          </form>
        )}
      </details>

      <details className="create-drawer" open={effectsDrawerOpen} onToggle={(event) => setEffectsDrawerOpen(event.currentTarget.open)}>
        <summary><Clock3 size={15} /> Scheduled effects <strong>{formatNumber(effectRows.length)}</strong></summary>
        {effectRows.length === 0 ? <p className="empty-state compact">No typed effect schedules are active on D&amp;D combatants.</p> : (
          <ul className="plain-list">{effectRows.map((effect) => <li key={`${effect.actorId}:${effect.id}`}><strong>{effect.label}</strong> on {effect.actorName} · {titleCaseLabel(effect.timing)}</li>)}</ul>
        )}
        <div className="admin-actions">
          <label htmlFor={`${fieldIdPrefix}-effect-phase`}><span>Evaluate phase</span><select id={`${fieldIdPrefix}-effect-phase`} value={phase} onChange={(event) => { setPhase(event.target.value as RulesEffectScheduleTiming); setEffectPreview(undefined); }} disabled={!props.canPreviewEffects}>{effectPhases.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <button type="button" className="ghost-button" disabled={Boolean(pending) || !props.canPreviewEffects} onClick={() => void previewEffects()}>Preview</button>
          {props.canManageEffects && <button type="button" className="primary-button" disabled={Boolean(pending) || !effectPreview || effectPreview.unresolvedEventIds.some((id) => !saveOutcomes[id])} onClick={() => void advanceEffects()}>Apply reviewed outcomes</button>}
        </div>
        {effectPreview && (
          <div className="admin-list" aria-label="Scheduled effect preview">
            {effectPreview.events.length === 0 && <p className="empty-state compact">No effects are due in this phase.</p>}
            {effectPreview.events.map((event) => (
              <article className="operator-item admin-item" key={event.id}>
                <strong>{event.label}</strong><span className="status-pill">{titleCaseLabel(event.status)}</span>
                {event.status === "save_required" && <label><span>{titleCaseLabel(event.saveAbility ?? "save")} save{event.saveDc !== undefined ? ` DC ${formatNumber(event.saveDc)}` : ""}</span><select aria-label={`${event.label} save outcome`} value={saveOutcomes[event.id] ?? ""} onChange={(change) => setSaveOutcomes((current) => ({ ...current, [event.id]: change.target.value as "success" | "failure" }))}><option value="">Choose outcome</option><option value="success">Success</option><option value="failure">Failure</option></select></label>}
              </article>
            ))}
          </div>
        )}
      </details>

      <details className="create-drawer" open={spellDrawerOpen} onToggle={(event) => setSpellDrawerOpen(event.currentTarget.open)}>
        <summary><WandSparkles size={15} /> Specialized spell helpers</summary>
        <form className="advanced-mechanics-form" onSubmit={(event) => void previewSpell(event)}>
          <label htmlFor={`${fieldIdPrefix}-spell-caster`}><span>Caster</span><select id={`${fieldIdPrefix}-spell-caster`} required value={casterActorId || dndActors[0]?.id || ""} onChange={(event) => setCasterActorId(event.target.value)}>{dndActors.map((actor) => <option value={actor.id} key={actor.id}>{actor.name}</option>)}</select></label>
          <label htmlFor={`${fieldIdPrefix}-spell-id`}><span>Spell</span><select id={`${fieldIdPrefix}-spell-id`} value={spellId} onChange={(event) => { const next = event.target.value as typeof spellId; setSpellId(next); setSlotLevel(specializedSpells.find((spell) => spell.id === next)?.minimumSlot ?? 1); }}>{specializedSpells.map((spell) => <option value={spell.id} key={spell.id}>{spell.name}</option>)}</select></label>
          <label htmlFor={`${fieldIdPrefix}-spell-slot-level`}><span>Slot level</span><input id={`${fieldIdPrefix}-spell-slot-level`} type="number" min={specializedSpells.find((spell) => spell.id === spellId)?.minimumSlot ?? 1} max={9} value={slotLevel} onChange={(event) => setSlotLevel(Number(event.target.value))} /></label>
          {spellId === "delayed-blast-fireball" && <label htmlFor={`${fieldIdPrefix}-spell-rounds-held`}><span>Rounds held</span><input id={`${fieldIdPrefix}-spell-rounds-held`} type="number" min={0} max={10} value={roundsHeld} onChange={(event) => setRoundsHeld(Number(event.target.value))} /></label>}
          <label className="wide" htmlFor={`${fieldIdPrefix}-spell-targets`}><span>Targets</span><select id={`${fieldIdPrefix}-spell-targets`} multiple aria-label="Spell helper targets" value={targetActorIds} onChange={(event) => setTargetActorIds(Array.from(event.target.selectedOptions, (option) => option.value))}>{dndActors.filter((actor) => actor.id !== (casterActorId || dndActors[0]?.id)).map((actor) => <option value={actor.id} key={actor.id}>{actor.name}</option>)}</select></label>
          <button className="primary-button" type="submit" disabled={Boolean(pending) || dndActors.length === 0}>Preview spell helper</button>
        </form>
        {spellPreview && (
          <div className="operator-item admin-item" aria-label="Spell helper preview">
            <div className="combatant-header"><strong>{spellPreview.preview.spellName}</strong><span className="status-pill">{titleCaseLabel(spellPreview.preview.automation)}</span></div>
            <RulesSupportBoundaryNotice boundary={rulesBoundaryFromSpell({ supported: spellPreview.preview.supported, automation: spellPreview.preview.automation, manualSteps: spellPreview.preview.manualSteps, warnings: spellPreview.preview.warnings, source: spellPreview.source.id })} />
            <p>{spellPreview.preview.summary}</p>
            {spellPreview.preview.rolls.map((roll, index) => <p key={`${roll.label}:${index}`}><strong>{roll.label}</strong>: {roll.formula}{roll.save ? ` · ${titleCaseLabel(roll.save.ability)} save` : ""}</p>)}
            {spellPreview.preview.manualSteps.length > 0 && <ul>{spellPreview.preview.manualSteps.map((step) => <li key={step}>{step}</li>)}</ul>}
            {spellPreview.preview.warnings.map((warning) => <p className="field-warning" key={warning}>{warning}</p>)}
            <small>Source: {spellPreview.source.id}</small>
          </div>
        )}
      </details>
    </section>
  </>);
}

export function scheduledEffectConsequenceReview(prepared: EffectScheduleEvaluation, actors: Actor[]): ConsequenceReviewRequest {
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
  return {
    title: "Review scheduled effects",
    summary: "The server prepared these exact phase outcomes. Commit applies this prepared revision once; cancel preserves current combat and actor state.",
    source: "D&D 5e SRD scheduled-effect resolver",
    boundary: { status: "automated", label: "Automated", explanation: "The server evaluated typed effect schedules for the selected combat phase.", sources: ["D&D 5e SRD scheduled-effect resolver"] },
    sections: [
      { id: "events", label: "Effect events", items: prepared.events.map((event) => ({ label: event.label, value: `${actorNames.get(event.actorId) ?? event.actorId} - ${titleCaseLabel(event.status)}`, detail: `${titleCaseLabel(event.phase)}; round ${formatNumber(event.round)}${event.saveAbility ? `; ${titleCaseLabel(event.saveAbility)} save${event.saveDc !== undefined ? ` DC ${formatNumber(event.saveDc)}` : ""}` : ""}` })) },
      { id: "changes", label: "Actor changes", items: prepared.actorChanges.map((change) => ({ label: actorNames.get(change.actorId) ?? change.actorId, value: change.reason })) }
    ].filter((section) => section.items.length > 0),
    ...(prepared.unresolvedEventIds.length > 0 ? { blockingIssues: prepared.unresolvedEventIds.map((id) => `Choose the required save outcome for ${id}.`) } : {}),
    confirmLabel: "Commit exact effect outcomes"
  };
}
