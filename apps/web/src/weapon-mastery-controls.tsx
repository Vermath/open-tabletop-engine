import type { Actor, Item } from "@open-tabletop/core";
import { recordValue, slugId, stringValue, titleCaseLabel } from "./sheet-format.js";

export interface Dnd5eSrdWeaponMasteryUse {
  use: boolean;
  damageDealt?: boolean;
  nickExtraAttack?: boolean;
  secondaryTargetActorId?: string;
  geometryConfirmed?: boolean;
  pushDistanceFeet?: number;
}

export interface WeaponMasterySelection {
  itemId: string;
  itemName: string;
  property: string;
}

export interface WeaponMasteryDraft {
  use: boolean;
  damageDealt?: boolean;
  nickExtraAttack: boolean;
  secondaryTargetActorId: string;
  geometryConfirmed: boolean;
  pushDistanceFeet?: number;
}

export function emptyWeaponMasteryDraft(): WeaponMasteryDraft {
  return { use: false, nickExtraAttack: false, secondaryTargetActorId: "", geometryConfirmed: false };
}

/** Mirrors the server's selected-weapon gate without claiming that the client is authoritative. */
export function weaponMasterySelectionForAction(actor: Actor, items: Item[], rollId: string): WeaponMasterySelection | undefined {
  const item = items.find((candidate) => `item-${candidate.id}-attack` === rollId);
  if (!item) return undefined;
  const data = recordValue(item.data);
  const property = stringValue(data.mastery)?.toLowerCase();
  if (!property) return undefined;
  const candidateIds = new Set([
    stringValue(data.compendiumId),
    stringValue(data.weaponId),
    item.id,
    slugId(item.name),
  ].filter((value): value is string => Boolean(value)));
  const selected = Array.isArray(actor.data.weaponMasteries) && actor.data.weaponMasteries.some((raw) => {
    const weaponId = stringValue(recordValue(raw).weaponId);
    return Boolean(weaponId && candidateIds.has(weaponId));
  });
  return selected ? { itemId: item.id, itemName: item.name, property } : undefined;
}

/** Emits only fields relevant to the selected property so stale UI choices cannot leak into review. */
export function weaponMasteryUseForSelection(selection: WeaponMasterySelection | undefined, draft: WeaponMasteryDraft): Dnd5eSrdWeaponMasteryUse | undefined {
  if (!selection || !draft.use) return undefined;
  const property = selection.property;
  return {
    use: true,
    ...((property === "vex" || property === "slow") && draft.damageDealt !== undefined ? { damageDealt: draft.damageDealt } : {}),
    ...(property === "nick" ? { nickExtraAttack: draft.nickExtraAttack } : {}),
    ...(property === "cleave" && draft.secondaryTargetActorId ? { secondaryTargetActorId: draft.secondaryTargetActorId } : {}),
    ...((property === "cleave" || property === "push") ? { geometryConfirmed: draft.geometryConfirmed } : {}),
    ...(property === "push" && draft.pushDistanceFeet !== undefined ? { pushDistanceFeet: draft.pushDistanceFeet } : {}),
  };
}

export function WeaponMasteryControls(props: {
  selection?: WeaponMasterySelection;
  draft: WeaponMasteryDraft;
  actors: Actor[];
  sourceActorId: string;
  primaryTargetActorId: string;
  disabled: boolean;
  onChange(draft: WeaponMasteryDraft): void;
}) {
  const selection = props.selection;
  if (!selection) return null;
  const property = selection.property;
  const label = titleCaseLabel(property);
  const update = (patch: Partial<WeaponMasteryDraft>) => props.onChange({ ...props.draft, ...patch });
  const secondaryTargets = props.actors.filter((actor) => actor.id !== props.sourceActorId && actor.id !== props.primaryTargetActorId);
  const capability = ["graze", "nick", "sap", "slow", "vex"].includes(property)
    ? "Automatic after its trigger is confirmed"
    : property === "push"
      ? "Reviewed manual movement; token coordinates are never inferred"
      : ["cleave", "topple"].includes(property)
        ? "Reviewed target or save choice"
        : "Reviewed manual property";

  return (
    <fieldset className="operator-item admin-item" aria-label={`${label} Weapon Mastery`}>
      <legend>Weapon Mastery</legend>
      <p><strong>{selection.itemName}: {label}</strong></p>
      <p className="admin-status">{capability}</p>
      <label className="inline-check">
        <input
          aria-label={`Use ${label} Weapon Mastery`}
          type="checkbox"
          checked={props.draft.use}
          disabled={props.disabled}
          onChange={(event) => update({ use: event.target.checked })}
        />
        <span>Declare {label} for this attack</span>
      </label>
      {props.draft.use && (property === "vex" || property === "slow") && (
        <label className="sheet-row">
          <span>Weapon damage on a hit</span>
          <select
            aria-label={`${label} weapon damage declaration`}
            value={props.draft.damageDealt === undefined ? "" : String(props.draft.damageDealt)}
            disabled={props.disabled}
            onChange={(event) => update({ damageDealt: event.target.value === "" ? undefined : event.target.value === "true" })}
          >
            <option value="">Declare for this attack</option>
            <option value="true">Yes, the hit deals weapon damage</option>
            <option value="false">No weapon damage</option>
          </select>
        </label>
      )}
      {props.draft.use && property === "nick" && (
        <label className="inline-check">
          <input
            aria-label="Declare Nick Light extra attack"
            type="checkbox"
            checked={props.draft.nickExtraAttack}
            disabled={props.disabled}
            onChange={(event) => update({ nickExtraAttack: event.target.checked })}
          />
          <span>This is the Light extra attack folded into the current Attack action</span>
        </label>
      )}
      {props.draft.use && property === "cleave" && (
        <>
          <label className="sheet-row">
            <span>Second creature</span>
            <select aria-label="Cleave secondary target" value={props.draft.secondaryTargetActorId} disabled={props.disabled} onChange={(event) => update({ secondaryTargetActorId: event.target.value })}>
              <option value="">Choose a different creature</option>
              {secondaryTargets.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
            </select>
          </label>
          <label className="inline-check">
            <input aria-label="Confirm Cleave geometry" type="checkbox" checked={props.draft.geometryConfirmed} disabled={props.disabled} onChange={(event) => update({ geometryConfirmed: event.target.checked })} />
            <span>I reviewed that the second creature is within 5 feet of the first target and within weapon reach</span>
          </label>
          <p className="admin-status">The engine does not infer Cleave reach or 5-foot geometry.</p>
        </>
      )}
      {props.draft.use && property === "push" && (
        <>
          <label className="sheet-row">
            <span>Push distance (feet)</span>
            <input
              aria-label="Push distance in feet"
              type="number"
              min={0}
              max={10}
              placeholder="Up to 10"
              value={props.draft.pushDistanceFeet ?? ""}
              disabled={props.disabled}
              onChange={(event) => update({ pushDistanceFeet: event.target.value === "" ? undefined : Math.max(0, Math.min(10, Math.floor(Number(event.target.value)))) })}
            />
          </label>
          <label className="inline-check">
            <input aria-label="Confirm Push geometry review" type="checkbox" checked={props.draft.geometryConfirmed} disabled={props.disabled} onChange={(event) => update({ geometryConfirmed: event.target.checked })} />
            <span>I reviewed straight-away movement and target size; movement remains a manual table step</span>
          </label>
          <p className="admin-status">No token coordinates will be inferred or mutated.</p>
        </>
      )}
    </fieldset>
  );
}
