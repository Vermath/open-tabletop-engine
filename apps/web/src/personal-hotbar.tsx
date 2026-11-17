import type { Actor, DeclarativeActorSheet, DiceMacro, Item, PermissionName, Token } from "@open-tabletop/core";
import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { actorActionOptions } from "./actor-sheet-data.js";
import { actorActionTargetLabel, scopedActorActionTargetIds } from "./action-preview-state.js";
import { useHotbarSheets } from "./hotbar-actor-sheets.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { canUseHotbarActor, hotbarAttackTarget, hotbarKeyIndex, readHotbar, validHotbarFormula, type HotbarPin } from "./personal-hotbar-state.js";
import type { ActorActionCommitOptions } from "./workspace-types.js";
import "./personal-hotbar.css";

interface Props {
  storagePrefix: string;
  campaignId: string;
  userId: string;
  actors: Actor[];
  selectedActorId?: string;
  sceneId: string;
  tokens: Token[];
  selectedTokenId?: string;
  items: Item[];
  savedFormulas: string[];
  macros: DiceMacro[];
  permissions: PermissionName[];
  onActorRoll(rollId: string, options: ActorActionCommitOptions, actor: Actor): Promise<void>;
  onDeclarativeRoll(sheet: DeclarativeActorSheet, rollId: string): Promise<void>;
  onDiceRoll(formula: string): Promise<void>;
  onError(error: unknown): void;
}

export function PersonalHotbar(props: Props) {
  const [pins, setPins] = useState(() => readHotbar(props.storagePrefix));
  const [editIndex, setEditIndex] = useState<number>();
  const [source, setSource] = useState<HotbarPin["kind"]>("actor");
  const [actorId, setActorId] = useState("");
  const [rollId, setRollId] = useState("");
  const [formula, setFormula] = useState("");
  const [macroId, setMacroId] = useState("");
  const [busy, setBusy] = useState(false);
  const [targetRequest, setTargetRequest] = useState<{ pin: Extract<HotbarPin, { kind: "actor" }>; sceneId: string }>();
  const pending = useRef(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const dialog = useModalAccessibility<HTMLDivElement>(() => setEditIndex(undefined), { enabled: editIndex !== undefined });
  const canRoll = props.permissions.includes("dice.roll");
  const actors = props.actors.filter((actor) => actor.campaignId === props.campaignId && canUseHotbarActor(actor, props.userId, props.permissions));
  const macros = props.macros.filter((macro) => canRoll && macro.campaignId === props.campaignId && (macro.visibility === "public" || props.permissions.includes("campaign.update")));
  const requestedActors = new Set(pins.flatMap((pin) => pin?.kind === "actor" ? [pin.actorId] : []));
  const pickingActor = actors.find((actor) => actor.id === actorId) ?? actors[0];
  if (editIndex !== undefined && source === "actor" && pickingActor) requestedActors.add(pickingActor.id);
  const sheets = useHotbarSheets(actors, props.items, requestedActors);

  function rollsFor(actor: Actor) {
    const sheet = sheets.resultFor(actor.id)?.sheet;
    if (sheet?.kind === "declarative-v1") {
      return props.permissions.includes("chat.write") && sheet.actorUpdatedAt === actor.updatedAt && sheet.system.systemId === actor.systemId && sheet.actorId === actor.id
        ? sheet.quickRolls.filter((roll) => roll.available) : [];
    }
    return sheet?.quickRolls ?? [];
  }
  const rolls = pickingActor ? rollsFor(pickingActor) : [];
  const pickedRoll = rolls.find((roll) => roll.id === rollId) ?? rolls[0];
  const pickedMacro = macros.find((macro) => macro.id === macroId) ?? macros[0];
  function draftPin(): HotbarPin | undefined {
    if (!canRoll) return;
    if (source === "actor" && pickingActor && pickedRoll) return { kind: "actor", actorId: pickingActor.id, rollId: pickedRoll.id };
    if (source === "macro" && pickedMacro) return { kind: "macro", macroId: pickedMacro.id };
    if (source === "formula" && validHotbarFormula(formula.trim())) return { kind: "formula", formula: formula.trim() };
  }

  function edit(index: number) {
    const pin = pins[index];
    setEditIndex(index);
    setSource(pin?.kind ?? (actors.length ? "actor" : "formula"));
    setActorId(pin?.kind === "actor" ? pin.actorId : props.selectedActorId ?? "");
    setRollId(pin?.kind === "actor" ? pin.rollId : "");
    setMacroId(pin?.kind === "macro" ? pin.macroId : "");
    setFormula(pin?.kind === "formula" ? pin.formula : props.savedFormulas[0] ?? "");
  }
  function save(pin?: HotbarPin) {
    if (editIndex === undefined) return;
    try {
      const key = props.storagePrefix + editIndex;
      if (pin) window.localStorage.setItem(key, JSON.stringify(pin));
      else window.localStorage.removeItem(key);
      setPins(readHotbar(props.storagePrefix));
      setEditIndex(undefined);
    } catch {
      props.onError(new Error("Your browser could not save this hotbar slot."));
    }
  }
  useEffect(() => {
    function reload(event: StorageEvent) {
      if (!event.key || event.key.startsWith(props.storagePrefix)) setPins(readHotbar(props.storagePrefix));
    }
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [props.storagePrefix]);
  useEffect(() => {
    if (editIndex !== undefined) return;
    function activateKey(event: KeyboardEvent) {
      const index = hotbarKeyIndex(event);
      const button = index === undefined ? undefined : buttons.current[index];
      if (!button || button.disabled || !button.hasAttribute("data-assigned")) return;
      event.preventDefault();
      button.click();
    }
    window.addEventListener("keydown", activateKey);
    return () => window.removeEventListener("keydown", activateKey);
  }, [editIndex]);

  function resolve(pin: HotbarPin, chosenTarget?: string) {
    if (!canRoll) return;
    if (pin.kind === "formula") return { label: pin.formula, run: () => props.onDiceRoll(pin.formula) };
    if (pin.kind === "macro") {
      const macro = macros.find((candidate) => candidate.id === pin.macroId);
      if (macro) return { label: macro.name, run: () => props.onDiceRoll(macro.formula) };
      return;
    }
    const actor = actors.find((candidate) => candidate.id === pin.actorId);
    if (!actor) return;
    const sheet = sheets.resultFor(actor.id)?.sheet;
    const roll = rollsFor(actor).find((entry) => entry.id === pin.rollId);
    if (!sheet || !roll) return;
    return { label: roll.label, detail: actor.name, run: async () => {
      if (sheet.kind === "declarative-v1") return props.onDeclarativeRoll(sheet, roll.id);
      const action = actorActionOptions(actor, props.items.filter((item) => item.actorId === actor.id)).some((entry) => entry.rollId === roll.id);
      if (!action) return props.onActorRoll(roll.id, { consumeResources: false }, actor);
      const descriptor = sheet.quickRolls.find((entry) => entry.id === roll.id)?.metadata;
      const offensive = descriptor?.effectKind === "attack" || descriptor?.effectKind === "damage" || /-(attack|damage)$/.test(roll.id);
      let targetActorId: string | undefined;
      if (offensive && String(descriptor?.range ?? "").toLowerCase() !== "self") {
        targetActorId = chosenTarget ?? hotbarAttackTarget(props.userId, props.sceneId, props.tokens, props.actors, actor.id, props.selectedTokenId);
        if (targetActorId === undefined) {
          setTargetRequest({ pin, sceneId: props.sceneId });
          return;
        }
      }
      return props.onActorRoll(roll.id, { targetActorId: targetActorId || undefined, consumeResources: true, oneStep: true }, actor);
    } };
  }
  async function activate(run: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try { await run(); } catch (error) { props.onError(error); }
    finally { pending.current = false; setBusy(false); }
  }
  const targetPin = targetRequest?.sceneId === props.sceneId ? targetRequest.pin : undefined;
  const targetAction = targetPin && resolve(targetPin);
  return <>
    <div className="personal-hotbar" role="group" aria-label="Personal action hotbar">
      {pins.map((pin, index) => {
        const action = pin && resolve(pin);
        const label = pin ? action?.label ?? "Unavailable" : "Assign";
        const title = `Slot ${index + 1}: ${label}${action?.detail ? ` (${action.detail})` : ""}`;
        return <button type="button" className="ghost-button" key={index} ref={(button) => { buttons.current[index] = button; }} data-assigned={pin ? true : undefined}
          aria-label={title} title={title} aria-keyshortcuts={pin ? String(index + 1) : undefined} disabled={busy || Boolean(pin && !action)}
          onClick={() => action ? void activate(action.run) : edit(index)}>
          <kbd>{index + 1}</kbd>{pin ? <span>{label}</span> : <Plus size={12} aria-hidden="true" />}
        </button>;
      })}
      <button className="icon-button" type="button" aria-label="Edit hotbar" title="Edit hotbar" onClick={() => edit(0)}><Pencil size={15} /></button>
    </div>
    {targetPin && targetAction && <HotbarTargetChoice actorId={targetPin.actorId} action={targetAction.label} sceneId={props.sceneId} actors={props.actors} tokens={props.tokens}
      onCancel={() => setTargetRequest(undefined)} onChoose={(id) => {
        setTargetRequest(undefined);
        const action = resolve(targetPin, id);
        if (action) void activate(action.run);
      }} />}
    {editIndex !== undefined && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditIndex(undefined); }}>
      <div className="modal-dialog hotbar-editor" role="dialog" aria-modal="true" aria-label="Edit hotbar" ref={dialog} tabIndex={-1}>
        <div className="operator-heading"><h2>Edit hotbar</h2><button className="icon-button" aria-label="Close hotbar editor" onClick={() => setEditIndex(undefined)}><X size={16} /></button></div>
        <label>Slot<select value={editIndex} onChange={(event) => edit(Number(event.target.value))}>{pins.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label>
        <label>Shortcut type<select value={source} onChange={(event) => setSource(event.target.value as HotbarPin["kind"])}>
          <option value="actor">Actor action</option><option value="formula">Dice formula</option><option value="macro">Campaign dice macro</option>
        </select></label>
        {source === "actor" && <>
          <label>Actor<select value={pickingActor?.id ?? ""} onChange={(event) => { setActorId(event.target.value); setRollId(""); }}>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
          <label>Action<select value={pickedRoll?.id ?? ""} onChange={(event) => setRollId(event.target.value)}>{rolls.map((roll) => <option key={roll.id} value={roll.id}>{roll.label}</option>)}</select></label>
          {!actors.length && <p>No controllable actors.</p>}
          {pickingActor && !sheets.resultFor(pickingActor.id) && <p role="status">Loading character sheet…</p>}
          {sheets.resultFor(pickingActor?.id)?.error && <button type="button" className="ghost-button" onClick={sheets.retry}>Retry loading character sheet</button>}
        </>}
        {source === "formula" && <label>Dice formula<input list="hotbar-saved-formulas" value={formula} onChange={(event) => setFormula(event.target.value)} placeholder="1d20+5" />
          <datalist id="hotbar-saved-formulas">{props.savedFormulas.map((saved) => <option key={saved} value={saved} />)}</datalist></label>}
        {source === "macro" && <label>Campaign dice macro<select value={pickedMacro?.id ?? ""} onChange={(event) => setMacroId(event.target.value)}>{macros.map((macro) => <option key={macro.id} value={macro.id}>{macro.name} · {macro.formula}</option>)}</select>{!macros.length && <span>No campaign dice macros available.</span>}</label>}
        <div className="button-row">
          <button type="button" className="primary-button" disabled={!draftPin()} onClick={() => save(draftPin())}>Pin to slot {editIndex + 1}</button>
          {pins[editIndex] && <button type="button" className="ghost-button" onClick={() => save()}>Clear slot</button>}
        </div>
      </div>
    </div>}
  </>;
}

function HotbarTargetChoice(props: { actorId: string; action: string; sceneId: string; actors: Actor[]; tokens: Token[]; onCancel(): void; onChoose(id: string): void }) {
  const [target, setTarget] = useState("");
  const dialog = useModalAccessibility<HTMLDivElement>(props.onCancel);
  const ids = scopedActorActionTargetIds({ actorIds: props.actors.map((actor) => actor.id), tokens: props.tokens, sourceActorId: props.actorId, sceneId: props.sceneId });
  const actors = props.actors.filter((actor) => ids.includes(actor.id));
  return <div className="modal-backdrop"><div className="modal-dialog hotbar-editor" role="dialog" aria-modal="true" aria-label={`Target for ${props.action}`} ref={dialog}>
    <h2>{props.action}</h2>
    <label>Target<select value={target} onChange={(event) => setTarget(event.target.value)}>
      <option value="">Roll without a target</option>
      {actors.map((actor) => <option key={actor.id} value={actor.id}>{actorActionTargetLabel(actor, actors)}</option>)}
    </select></label>
    <div className="button-row"><button className="primary-button" type="button" disabled={Boolean(target && !ids.includes(target))} onClick={() => props.onChoose(target)}>Use action</button>
      <button className="ghost-button" type="button" onClick={props.onCancel}>Cancel</button></div>
  </div></div>;
}
