import type {
  Actor,
  Combat,
  DndControlledCreatureCreateRequest,
  DndControlledCreatureDuration,
  DndControlledCreatureMutationResult,
  DndControlledCreaturePreview,
  DndControlledCreatureRecord,
  DndControlledCreatureRevisionSet,
  Item,
  Scene,
} from "@open-tabletop/core";
import { useEffect, useId, useMemo, useState } from "react";

import { ApiError, apiGet, apiPost } from "./api.js";

const DND_SYSTEM_ID = "dnd-5e-srd";

interface ControlledCreatureEntry {
  actor: Actor;
  record: DndControlledCreatureRecord;
  requiredRevisions: DndControlledCreatureRevisionSet;
}

interface ControlledCreaturesPanelProps {
  campaignId: string;
  currentUserId: string;
  actors: Actor[];
  items: Item[];
  scenes: Scene[];
  combats: Combat[];
  canPrepare: boolean;
  onChanged(): void;
  onStatus(message: string): void;
}

interface LifecycleDraft {
  kind: DndControlledCreatureCreateRequest["kind"];
  sourceActorId: string;
  sourceItemId: string;
  targetActorId: string;
  sceneId: string;
  combatId: string;
  name: string;
  actorType: string;
  rulesVersion: string;
  hpCurrent: number;
  hpMax: number;
  tokenX: number;
  tokenY: number;
  tokenSize: number;
  disposition: "friendly" | "neutral" | "hostile";
  durationMode: DndControlledCreatureDuration["mode"];
  expiresAtRound: number;
  expiresAt: string;
  concentrationGroupId: string;
  initiativeMode: "shared" | "independent";
  initiativeValue: number;
  commandRequired: boolean;
  commandAction: DndControlledCreatureRecord["command"]["action"];
  hpCarryover: "preserve" | "replace";
  equipmentCarryover: "preserve" | "suppress";
}

export function controlledCreaturesPath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/systems/${DND_SYSTEM_ID}/controlled-creatures`;
}

export function emptyControlledCreatureRevisions(): DndControlledCreatureRevisionSet {
  return { actors: {}, items: {}, tokens: {}, combats: {}, scenes: {}, encounters: {} };
}

export function mergeControlledCreatureRevisions(
  ...sets: DndControlledCreatureRevisionSet[]
): DndControlledCreatureRevisionSet {
  const merged = emptyControlledCreatureRevisions();
  for (const revisions of sets) {
    for (const collection of Object.keys(merged) as Array<keyof DndControlledCreatureRevisionSet>) {
      Object.assign(merged[collection], revisions[collection]);
    }
  }
  return merged;
}

export function controlledCreatureDurationLabel(record: DndControlledCreatureRecord): string {
  if (record.duration.mode === "rounds") return `through round ${record.duration.expiresAtRound}`;
  if (record.duration.mode === "until_time") return `until ${new Date(record.duration.expiresAt).toLocaleString()}`;
  if (record.duration.mode === "persistent") return "persistent companion";
  return "until dismissed";
}

export function ControlledCreaturesPanel({ campaignId, currentUserId, actors, items, scenes, combats, canPrepare, onChanged, onStatus }: ControlledCreaturesPanelProps) {
  const headingId = useId();
  const [entries, setEntries] = useState<ControlledCreatureEntry[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [draft, setDraft] = useState<LifecycleDraft>(defaultLifecycleDraft);
  const [preview, setPreview] = useState<DndControlledCreaturePreview>();
  const [manualReviewConfirmed, setManualReviewConfirmed] = useState(false);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState("");
  const [commandNotes, setCommandNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");
    void apiGet<{ records: ControlledCreatureEntry[] }>(controlledCreaturesPath(campaignId), { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setEntries(response.records);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setLoadError(errorMessage(error, "Controlled creatures could not be loaded."));
      });
    return () => controller.abort();
  }, [campaignId, reloadVersion]);

  const dndActors = useMemo(
    () => actors.filter((actor) => actor.campaignId === campaignId && actor.systemId === DND_SYSTEM_ID),
    [actors, campaignId],
  );
  const sourceItems = useMemo(
    () => items.filter((item) => item.actorId === draft.sourceActorId && item.systemId === DND_SYSTEM_ID && sourceKind(item)),
    [draft.sourceActorId, items],
  );
  const concentrationLeaders = useMemo(() => {
    const leaders = new Set<string>();
    const groups = new Set<string>();
    for (const entry of entries) {
      const concentration = entry.record.status === "active" ? entry.record.concentration : undefined;
      if (!concentration) continue;
      const key = `${concentration.sourceActorId}:${concentration.groupId}`;
      if (groups.has(key)) continue;
      groups.add(key);
      leaders.add(entry.record.id);
    }
    return leaders;
  }, [entries]);

  function updateDraft(patch: Partial<LifecycleDraft>): void {
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(undefined);
    setManualReviewConfirmed(false);
    setFormError("");
  }

  function selectSourceItem(itemId: string): void {
    const item = items.find((candidate) => candidate.id === itemId);
    const itemRulesVersion = textValue(item?.data.rulesVersion);
    updateDraft({ sourceItemId: itemId, ...(itemRulesVersion ? { rulesVersion: itemRulesVersion } : {}) });
  }

  function requestFromDraft(): DndControlledCreatureCreateRequest | undefined {
    const sourceActor = dndActors.find((actor) => actor.id === draft.sourceActorId);
    const sourceItem = sourceItems.find((item) => item.id === draft.sourceItemId);
    if (!sourceActor || !sourceItem) {
      setFormError("Choose a D&D source actor and an actor-owned spell or feature.");
      return undefined;
    }
    if (!draft.rulesVersion.trim()) {
      setFormError("Enter the rules or content version used for the reviewed stat block.");
      return undefined;
    }
    if (!draft.name.trim() || !draft.actorType.trim() || draft.hpMax <= 0 || draft.hpCurrent < 0) {
      setFormError("Enter a name, actor type, and explicit current and maximum hit points.");
      return undefined;
    }
    if (draft.kind === "transformation" && !draft.targetActorId) {
      setFormError("Choose the actor that will transform.");
      return undefined;
    }
    if (draft.kind !== "transformation" && !draft.sceneId) {
      setFormError("Choose a scene for the controlled creature token.");
      return undefined;
    }

    const duration = durationFromDraft(draft);
    if (!duration) {
      setFormError(draft.durationMode === "rounds" ? "Choose a combat and a future expiration round." : "Choose a future expiration time.");
      return undefined;
    }
    const hasCombat = Boolean(draft.combatId);
    if (hasCombat && draft.initiativeMode === "independent" && !Number.isFinite(draft.initiativeValue)) {
      setFormError("Enter an initiative value before adding the creature to combat.");
      return undefined;
    }

    return {
      kind: draft.kind,
      ...(draft.kind === "transformation" ? { targetActorId: draft.targetActorId } : { sceneId: draft.sceneId }),
      ...(draft.combatId ? { combatId: draft.combatId } : {}),
      source: {
        kind: sourceKind(sourceItem)!,
        actorId: sourceActor.id,
        itemId: sourceItem.id,
        name: sourceItem.name,
        systemId: DND_SYSTEM_ID,
        rulesVersion: draft.rulesVersion.trim(),
      },
      controllerUserId: currentUserId,
      controllerActorId: sourceActor.id,
      ownerUserId: currentUserId,
      actor: {
        name: draft.name.trim(),
        type: draft.actorType.trim(),
        data: { hp: { current: draft.hpCurrent, max: draft.hpMax }, rulesVersion: draft.rulesVersion.trim() },
      },
      ...(draft.kind === "transformation" ? {} : {
        token: { x: draft.tokenX, y: draft.tokenY, width: draft.tokenSize, height: draft.tokenSize, disposition: draft.disposition },
      }),
      duration,
      ...(draft.concentrationGroupId.trim() && draft.kind !== "persistent_companion"
        ? { concentration: { sourceActorId: sourceActor.id, groupId: draft.concentrationGroupId.trim() } }
        : {}),
      initiative: draft.initiativeMode === "shared"
        ? { mode: "shared", sourceActorId: sourceActor.id }
        : { mode: "independent", ...(hasCombat ? { value: draft.initiativeValue } : {}) },
      command: { required: draft.commandRequired, action: draft.commandRequired ? draft.commandAction : "none" },
      ...(draft.kind === "transformation" ? { transformation: { hpCarryover: draft.hpCarryover, equipmentCarryover: draft.equipmentCarryover } } : {}),
      manualReviewConfirmed,
    };
  }

  async function previewLifecycle(): Promise<void> {
    const request = requestFromDraft();
    if (!request) return;
    setPending("preview");
    setFormError("");
    try {
      const next = await apiPost<DndControlledCreaturePreview>(`${controlledCreaturesPath(campaignId)}/preview`, request);
      setPreview(next);
      onStatus(next.ready ? "Controlled-creature preview is ready to confirm." : "Controlled-creature preview needs human review.");
    } catch (error) {
      setPreview(undefined);
      setFormError(errorMessage(error, "Controlled-creature preview failed."));
    } finally {
      setPending("");
    }
  }

  async function confirmLifecycle(): Promise<void> {
    const request = requestFromDraft();
    if (!request || !preview?.ready) return;
    setPending("confirm");
    setFormError("");
    try {
      const result = await apiPost<DndControlledCreatureMutationResult>(controlledCreaturesPath(campaignId), {
        request,
        previewToken: preview.previewToken,
        expectedUpdatedAt: preview.requiredRevisions,
      }, { idempotencyKey: lifecycleIdempotencyKey("confirm") });
      onStatus(result.action === "transformed" ? "Transformation applied from the reviewed snapshot." : "Controlled creature created.");
      setDraft(defaultLifecycleDraft());
      setPreview(undefined);
      setManualReviewConfirmed(false);
      refreshAfterMutation();
    } catch (error) {
      handleMutationError(error, "Controlled-creature confirmation failed.");
    } finally {
      setPending("");
    }
  }

  async function command(entry: ControlledCreatureEntry): Promise<void> {
    setPending(`command:${entry.actor.id}`);
    try {
      await apiPost<DndControlledCreatureMutationResult>(`${controlledCreaturesPath(campaignId)}/${encodeURIComponent(entry.actor.id)}/command`, {
        expectedUpdatedAt: entry.requiredRevisions,
        note: commandNotes[entry.actor.id]?.trim() || undefined,
        ...(entry.record.duration.mode === "rounds" ? { combatId: entry.record.duration.combatId } : {}),
      }, { idempotencyKey: lifecycleIdempotencyKey("command") });
      setCommandNotes((current) => ({ ...current, [entry.actor.id]: "" }));
      onStatus(`${entry.actor.name} command recorded (${actionLabel(entry.record.command.action)}).`);
      refreshAfterMutation();
    } catch (error) {
      handleMutationError(error, "Command could not be recorded.");
    } finally {
      setPending("");
    }
  }

  async function endLifecycle(entry: ControlledCreatureEntry, reason: "dismissed" | "expired"): Promise<void> {
    setPending(`end:${entry.actor.id}`);
    try {
      const result = await apiPost<DndControlledCreatureMutationResult>(`${controlledCreaturesPath(campaignId)}/${encodeURIComponent(entry.actor.id)}/end`, {
        reason,
        expectedUpdatedAt: entry.requiredRevisions,
      }, { idempotencyKey: lifecycleIdempotencyKey(`end-${reason}`) });
      onStatus(result.action === "reverted" ? `${entry.actor.name} reverted to its preserved form.` : `${entry.actor.name} ${reason}.`);
      refreshAfterMutation();
    } catch (error) {
      handleMutationError(error, "Controlled-creature cleanup failed.");
    } finally {
      setPending("");
    }
  }

  async function endConcentration(entry: ControlledCreatureEntry): Promise<void> {
    const concentration = entry.record.concentration;
    if (!concentration) return;
    const linked = entries.filter((candidate) => candidate.record.status === "active" && candidate.record.concentration?.sourceActorId === concentration.sourceActorId && candidate.record.concentration.groupId === concentration.groupId);
    const expected = mergeControlledCreatureRevisions(...linked.map((candidate) => candidate.requiredRevisions));
    for (const actor of dndActors) expected.actors[actor.id] = actor.updatedAt;
    for (const combat of combats.filter((candidate) => candidate.campaignId === campaignId && candidate.active)) expected.combats[combat.id] = combat.updatedAt;
    setPending(`concentration:${entry.actor.id}`);
    try {
      await apiPost<DndControlledCreatureMutationResult>(`${controlledCreaturesPath(campaignId)}/concentration/end`, {
        sourceActorId: concentration.sourceActorId,
        groupId: concentration.groupId,
        reason: "Ended from the reviewed controlled-creature panel",
        expectedUpdatedAt: expected,
      }, { idempotencyKey: lifecycleIdempotencyKey("concentration-end") });
      onStatus(`Concentration ${concentration.groupId} ended; linked creatures were cleaned up atomically.`);
      refreshAfterMutation();
    } catch (error) {
      handleMutationError(error, "Concentration cleanup failed.");
    } finally {
      setPending("");
    }
  }

  function handleMutationError(error: unknown, fallback: string): void {
    const message = errorMessage(error, fallback);
    setFormError(error instanceof ApiError && error.status === 409 ? `${message} Reloaded current records; review and try again.` : message);
    if (error instanceof ApiError && error.status === 409) {
      setPreview(undefined);
      setReloadVersion((value) => value + 1);
    }
    onStatus(message);
  }

  function refreshAfterMutation(): void {
    setReloadVersion((value) => value + 1);
    onChanged();
  }

  return (
    <section className="operator-section controlled-creatures-panel" aria-labelledby={headingId}>
      <div className="operator-heading">
        <div>
          <div className="section-title">D&amp;D controlled creatures</div>
          <h3 id={headingId}>Summons, transformations, and companions</h3>
          <p>Preview explicit duration, concentration, initiative, command, hit-point, and equipment choices before changing campaign state.</p>
        </div>
        <button className="ghost-button small" type="button" disabled={loadState === "loading"} onClick={() => setReloadVersion((value) => value + 1)}>Refresh</button>
      </div>

      {loadState === "loading" && <p role="status">Loading controlled creatures...</p>}
      {loadState === "error" && <div className="inline-error" role="alert"><p>{loadError}</p><button className="ghost-button small" type="button" onClick={() => setReloadVersion((value) => value + 1)}>Retry</button></div>}
      {loadState === "ready" && entries.length === 0 && <p className="empty-state compact">No controlled-creature lifecycles yet.</p>}
      {entries.length > 0 && (
        <div className="controlled-creature-list" role="list" aria-label="Controlled creature lifecycles">
          {entries.map((entry) => (
            <article className="operator-row controlled-creature-row" role="listitem" key={entry.record.id}>
              <div>
                <strong>{entry.actor.name}</strong>
                <p>{kindLabel(entry.record.kind)} · {entry.record.status.replaceAll("_", " ")} · {controlledCreatureDurationLabel(entry.record)}</p>
                <small>Source: {entry.record.source.name} · Initiative: {entry.record.initiative.mode} · Command: {entry.record.command.required ? actionLabel(entry.record.command.action) : "not required"}</small>
                {entry.record.lastCommand && <small>Last commanded {new Date(entry.record.lastCommand.commandedAt).toLocaleString()}</small>}
              </div>
              {entry.record.status === "active" && (
                <div className="controlled-creature-actions">
                  {entry.record.command.required && (
                    <label className="compact-field">
                      <span>Command note</span>
                      <input value={commandNotes[entry.actor.id] ?? ""} maxLength={500} onChange={(event) => setCommandNotes((current) => ({ ...current, [entry.actor.id]: event.target.value }))} />
                    </label>
                  )}
                  <div className="row-actions">
                    {entry.record.command.required && <button className="ghost-button small" type="button" disabled={Boolean(pending)} onClick={() => void command(entry)}>Record command</button>}
                    {entry.record.concentration && concentrationLeaders.has(entry.record.id) && <button className="ghost-button small" type="button" disabled={Boolean(pending)} onClick={() => void endConcentration(entry)}>End concentration</button>}
                    <button className="danger-button small" type="button" disabled={Boolean(pending)} onClick={() => void endLifecycle(entry, "dismissed")}>{entry.record.kind === "transformation" ? "Revert form" : "Dismiss"}</button>
                    {(entry.record.duration.mode === "rounds" || entry.record.duration.mode === "until_time") && <button className="ghost-button small" type="button" disabled={Boolean(pending)} onClick={() => void endLifecycle(entry, "expired")}>Mark expired</button>}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {canPrepare ? <form className="controlled-creature-form" onSubmit={(event) => { event.preventDefault(); void previewLifecycle(); }}>
        <fieldset disabled={Boolean(pending)}>
          <legend>Prepare a reviewed lifecycle</legend>
          <div className="form-grid two-column">
            <Select label="Lifecycle" value={draft.kind} onChange={(value) => updateDraft({ kind: value as LifecycleDraft["kind"], durationMode: value === "persistent_companion" ? "persistent" : "until_dismissed", actorType: value === "transformation" ? "transformed" : value })} options={[{ value: "summon", label: "Summon" }, { value: "transformation", label: "Transformation" }, { value: "persistent_companion", label: "Persistent companion" }]} />
            <Select label="Source actor" value={draft.sourceActorId} onChange={(value) => updateDraft({ sourceActorId: value, sourceItemId: "" })} options={[{ value: "", label: "Choose actor" }, ...dndActors.map((actor) => ({ value: actor.id, label: actor.name }))]} />
            <Select label="Source spell or feature" value={draft.sourceItemId} onChange={selectSourceItem} options={[{ value: "", label: "Choose source" }, ...sourceItems.map((item) => ({ value: item.id, label: `${item.name} (${sourceKind(item)})` }))]} />
            <TextField label="Rules/content version" value={draft.rulesVersion} onChange={(value) => updateDraft({ rulesVersion: value })} required />
            {draft.kind === "transformation" ? (
              <Select label="Transformation target" value={draft.targetActorId} onChange={(value) => updateDraft({ targetActorId: value })} options={[{ value: "", label: "Choose target" }, ...dndActors.map((actor) => ({ value: actor.id, label: actor.name }))]} />
            ) : (
              <Select label="Token scene" value={draft.sceneId} onChange={(value) => updateDraft({ sceneId: value })} options={[{ value: "", label: "Choose scene" }, ...scenes.map((scene) => ({ value: scene.id, label: scene.name }))]} />
            )}
            <TextField label="Reviewed form name" value={draft.name} onChange={(value) => updateDraft({ name: value })} required />
            <TextField label="Actor type" value={draft.actorType} onChange={(value) => updateDraft({ actorType: value })} required />
            <NumberField label="Current HP" value={draft.hpCurrent} min={0} onChange={(value) => updateDraft({ hpCurrent: value })} />
            <NumberField label="Maximum HP" value={draft.hpMax} min={1} onChange={(value) => updateDraft({ hpMax: value })} />
            <Select label="Combat (optional)" value={draft.combatId} onChange={(value) => updateDraft({ combatId: value })} options={[{ value: "", label: "Not in combat" }, ...combats.map((combat) => ({ value: combat.id, label: `Round ${combat.round}${combat.active ? " (active)" : ""}` }))]} />
            {draft.kind !== "persistent_companion" && <Select label="Duration" value={draft.durationMode} onChange={(value) => updateDraft({ durationMode: value as LifecycleDraft["durationMode"] })} options={[{ value: "until_dismissed", label: "Until dismissed" }, { value: "rounds", label: "Through a combat round" }, { value: "until_time", label: "Until a date and time" }]} />}
            {draft.durationMode === "rounds" && <NumberField label="Expires at round" value={draft.expiresAtRound} min={1} onChange={(value) => updateDraft({ expiresAtRound: value })} />}
            {draft.durationMode === "until_time" && <TextField label="Expires at" value={draft.expiresAt} onChange={(value) => updateDraft({ expiresAt: value })} type="datetime-local" required />}
            {draft.kind !== "persistent_companion" && <TextField label="Concentration group (optional)" value={draft.concentrationGroupId} onChange={(value) => updateDraft({ concentrationGroupId: value })} />}
            <Select label="Initiative" value={draft.initiativeMode} onChange={(value) => updateDraft({ initiativeMode: value as LifecycleDraft["initiativeMode"] })} options={[{ value: "independent", label: "Independent" }, { value: "shared", label: "Share source actor" }]} />
            {draft.initiativeMode === "independent" && draft.combatId && <NumberField label="Initiative value" value={draft.initiativeValue} onChange={(value) => updateDraft({ initiativeValue: value })} />}
            <Select label="Command cost" value={draft.commandRequired ? draft.commandAction : "none"} onChange={(value) => updateDraft({ commandRequired: value !== "none", commandAction: value as LifecycleDraft["commandAction"] })} options={[{ value: "none", label: "No command required" }, { value: "action", label: "Action" }, { value: "bonus_action", label: "Bonus action" }, { value: "reaction", label: "Reaction" }, { value: "free", label: "Free command" }]} />
            {draft.kind === "transformation" && <Select label="Hit-point carryover" value={draft.hpCarryover} onChange={(value) => updateDraft({ hpCarryover: value as LifecycleDraft["hpCarryover"] })} options={[{ value: "preserve", label: "Preserve current HP" }, { value: "replace", label: "Use form HP" }]} />}
            {draft.kind === "transformation" && <Select label="Equipment carryover" value={draft.equipmentCarryover} onChange={(value) => updateDraft({ equipmentCarryover: value as LifecycleDraft["equipmentCarryover"] })} options={[{ value: "suppress", label: "Suppress equipment" }, { value: "preserve", label: "Keep equipment active" }]} />}
            {draft.kind !== "transformation" && <NumberField label="Token X" value={draft.tokenX} onChange={(value) => updateDraft({ tokenX: value })} />}
            {draft.kind !== "transformation" && <NumberField label="Token Y" value={draft.tokenY} onChange={(value) => updateDraft({ tokenY: value })} />}
            {draft.kind !== "transformation" && <NumberField label="Token size" value={draft.tokenSize} min={1} onChange={(value) => updateDraft({ tokenSize: value })} />}
            {draft.kind !== "transformation" && <Select label="Disposition" value={draft.disposition} onChange={(value) => updateDraft({ disposition: value as LifecycleDraft["disposition"] })} options={[{ value: "friendly", label: "Friendly" }, { value: "neutral", label: "Neutral" }, { value: "hostile", label: "Hostile" }]} />}
          </div>
        </fieldset>

        {formError && <div className="inline-error" role="alert">{formError}</div>}
        {preview && (
          <article className={preview.ready ? "proposal-card" : "proposal-card controlled-creature-review"} aria-live="polite">
            <strong>{preview.ready ? "Ready to confirm" : "Human review required"}</strong>
            <p>{preview.summary}</p>
            {preview.errors.length > 0 && <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
            {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            {preview.manualReview.length > 0 && (
              <div>
                <ul>{preview.manualReview.map((review) => <li key={review.id}><strong>{review.category.replaceAll("_", " ")}:</strong> {review.message} {review.resolution}</li>)}</ul>
                <label className="controlled-creature-confirm-review"><input type="checkbox" checked={manualReviewConfirmed} onChange={(event) => { setManualReviewConfirmed(event.target.checked); setPreview(undefined); }} /> I reviewed these ambiguities with the DM.</label>
              </div>
            )}
          </article>
        )}
        <div className="row-actions">
          <button className="ghost-button" type="submit" disabled={Boolean(pending)}>{pending === "preview" ? "Previewing..." : manualReviewConfirmed ? "Preview reviewed choices" : "Preview lifecycle"}</button>
          <button className="primary-button" type="button" disabled={Boolean(pending) || !preview?.ready} onClick={() => void confirmLifecycle()}>{pending === "confirm" ? "Confirming..." : "Confirm reviewed lifecycle"}</button>
        </div>
      </form> : <p className="empty-state compact">You can review and command linked creatures here. Creating or transforming one requires actor-update permissions.</p>}
    </section>
  );
}

function defaultLifecycleDraft(): LifecycleDraft {
  return {
    kind: "summon", sourceActorId: "", sourceItemId: "", targetActorId: "", sceneId: "", combatId: "", name: "", actorType: "summon", rulesVersion: "", hpCurrent: 1, hpMax: 1,
    tokenX: 0, tokenY: 0, tokenSize: 50, disposition: "friendly", durationMode: "until_dismissed", expiresAtRound: 2, expiresAt: "", concentrationGroupId: "",
    initiativeMode: "independent", initiativeValue: 10, commandRequired: true, commandAction: "bonus_action", hpCarryover: "preserve", equipmentCarryover: "suppress",
  };
}

function durationFromDraft(draft: LifecycleDraft): DndControlledCreatureDuration | undefined {
  if (draft.kind === "persistent_companion") return { mode: "persistent" };
  if (draft.durationMode === "rounds") return draft.combatId && Number.isInteger(draft.expiresAtRound) ? { mode: "rounds", combatId: draft.combatId, expiresAtRound: draft.expiresAtRound } : undefined;
  if (draft.durationMode === "until_time") {
    const timestamp = Date.parse(draft.expiresAt);
    return Number.isFinite(timestamp) ? { mode: "until_time", expiresAt: new Date(timestamp).toISOString() } : undefined;
  }
  return { mode: "until_dismissed" };
}

function sourceKind(item: Item): "spell" | "feature" | undefined {
  const type = item.type.toLowerCase();
  if (type.includes("spell")) return "spell";
  if (type.includes("feature") || type.includes("feat")) return "feature";
  return undefined;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function lifecycleIdempotencyKey(action: string): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `controlled-creature-${action}-${id}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function kindLabel(kind: DndControlledCreatureRecord["kind"]): string {
  if (kind === "persistent_companion") return "Persistent companion";
  return kind === "transformation" ? "Transformation" : "Summon";
}

function actionLabel(action: DndControlledCreatureRecord["command"]["action"]): string {
  if (action === "bonus_action") return "bonus action";
  return action.replaceAll("_", " ");
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange(value: string): void }) {
  return <label className="compact-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function TextField({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange(value: string): void; required?: boolean; type?: string }) {
  return <label className="compact-field"><span>{label}</span><input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange, min }: { label: string; value: number; onChange(value: number): void; min?: number }) {
  return <label className="compact-field"><span>{label}</span><input type="number" value={value} min={min} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
