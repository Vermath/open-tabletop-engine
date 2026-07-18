import { useState, type RefObject } from "react";
import { formatNumber, prettyOriginId, titleCaseLabel } from "./sheet-format.js";

export type AdvancementSpellAcquisitionMode = "prepared-class-level" | "prepared-long-rest" | "spellbook";

export interface AdvancementEligibleSpell {
  id: string;
  name: string;
  level: number;
  school?: string;
  ritual: boolean;
  classes: string[];
  source: string;
}

export interface AdvancementSpellPathInfo {
  className: string;
  nextClassLevel: number;
  spellcastingAbility: "intelligence" | "wisdom" | "charisma";
  acquisitionMode: AdvancementSpellAcquisitionMode;
  maxSpellLevel: number;
  preparedSpellCapacity: number;
  spellbookAdditions: number;
  eligibleSpells: AdvancementEligibleSpell[];
}

export interface AdvancementSpellSelectionStatus {
  complete: boolean;
  preparedCount: number;
  preparedRequired: number;
  spellbookAdditionCount: number;
  spellbookAdditionsRequired: number;
  error?: string;
}

const normalizedSpellIds = (values: string[]): string[] => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];

export function advancementSpellPathFor(paths: AdvancementSpellPathInfo[], className: string, nextClassLevel?: number): AdvancementSpellPathInfo | undefined {
  if (!className || !nextClassLevel) return undefined;
  return paths.find((path) => path.className.toLowerCase() === className.trim().toLowerCase() && path.nextClassLevel === nextClassLevel);
}

export function advancementSpellPathKey(path: Pick<AdvancementSpellPathInfo, "className" | "nextClassLevel">): string {
  return `${path.className.trim().toLowerCase()}:${path.nextClassLevel}`;
}

export function advancementSpellSelectionStatus(
  path: AdvancementSpellPathInfo | undefined,
  preparedSpellIds: string[],
  wizardSpellbookAdditions: string[],
  existingSpellbookIds: string[] = [],
  alwaysPreparedSpellIds: string[] = []
): AdvancementSpellSelectionStatus {
  if (!path) return { complete: true, preparedCount: 0, preparedRequired: 0, spellbookAdditionCount: 0, spellbookAdditionsRequired: 0 };
  const prepared = normalizedSpellIds(preparedSpellIds);
  const additions = normalizedSpellIds(wizardSpellbookAdditions);
  const existingBook = new Set(normalizedSpellIds(existingSpellbookIds));
  const alwaysPrepared = new Set(normalizedSpellIds(alwaysPreparedSpellIds));
  const eligible = new Set(path.eligibleSpells.map((spell) => spell.id.trim().toLowerCase()));
  let error: string | undefined;
  if (prepared.length !== preparedSpellIds.length) error = "Prepared-spell choices cannot repeat or be blank.";
  else if (additions.length !== wizardSpellbookAdditions.length) error = "Wizard spellbook additions cannot repeat or be blank.";
  else if (path.spellbookAdditions !== additions.length) error = `Choose exactly ${formatNumber(path.spellbookAdditions)} new ${path.className} spellbook spell${path.spellbookAdditions === 1 ? "" : "s"}.`;
  else if (additions.some((spellId) => !eligible.has(spellId))) error = "Choose spellbook additions from the eligible class-spell list.";
  else if (additions.some((spellId) => existingBook.has(spellId))) error = "Choose only spells that are not already in this Wizard's spellbook.";
  else if (prepared.length !== path.preparedSpellCapacity) error = `Choose exactly ${formatNumber(path.preparedSpellCapacity)} normal ${path.className} prepared spell${path.preparedSpellCapacity === 1 ? "" : "s"}.`;
  else if (prepared.some((spellId) => alwaysPrepared.has(spellId))) error = "Always-prepared spells do not consume normal preparation capacity.";
  else if (path.acquisitionMode === "spellbook") {
    const resultingBook = new Set([...existingBook, ...additions]);
    if (prepared.some((spellId) => !resultingBook.has(spellId))) error = "Wizard prepared spells must come from the resulting spellbook.";
  } else if (prepared.some((spellId) => !eligible.has(spellId))) error = `Choose prepared spells from the eligible ${path.className} spell list.`;
  return {
    complete: !error,
    preparedCount: prepared.length,
    preparedRequired: path.preparedSpellCapacity,
    spellbookAdditionCount: additions.length,
    spellbookAdditionsRequired: path.spellbookAdditions,
    ...(error ? { error } : {})
  };
}

export function advancementSpellChoicePayload(path: AdvancementSpellPathInfo | undefined, preparedSpellIds: string[], wizardSpellbookAdditions: string[]): { classPreparedSpellChoices?: string[]; wizardSpellbookAdditions?: string[] } {
  if (!path) return {};
  return {
    classPreparedSpellChoices: normalizedSpellIds(preparedSpellIds),
    ...(path.spellbookAdditions > 0 ? { wizardSpellbookAdditions: normalizedSpellIds(wizardSpellbookAdditions) } : {})
  };
}

export function AdvancementSpellChoices(props: {
  path: AdvancementSpellPathInfo;
  preparedSpellIds: string[];
  wizardSpellbookAdditions: string[];
  existingSpellbookIds?: string[];
  alwaysPreparedSpellIds?: string[];
  canChoose: boolean;
  invalidPrepared?: boolean;
  invalidSpellbook?: boolean;
  firstPreparedRef?: RefObject<HTMLInputElement | null>;
  firstSpellbookRef?: RefObject<HTMLInputElement | null>;
  onPreparedSpellIdsChange(values: string[]): void;
  onWizardSpellbookAdditionsChange(values: string[]): void;
}) {
  const [preparedSearch, setPreparedSearch] = useState("");
  const [spellbookSearch, setSpellbookSearch] = useState("");
  const existingBook = normalizedSpellIds(props.existingSpellbookIds ?? []);
  const alwaysPrepared = normalizedSpellIds(props.alwaysPreparedSpellIds ?? []);
  const status = advancementSpellSelectionStatus(props.path, props.preparedSpellIds, props.wizardSpellbookAdditions, existingBook, alwaysPrepared);
  const eligibleById = new Map(props.path.eligibleSpells.map((spell) => [spell.id.toLowerCase(), spell]));
  const selectedAdditions = normalizedSpellIds(props.wizardSpellbookAdditions);
  const preparedCandidates: AdvancementEligibleSpell[] = props.path.acquisitionMode === "spellbook"
    ? normalizedSpellIds([...existingBook, ...selectedAdditions]).map((id) => eligibleById.get(id) ?? { id, name: prettyOriginId(id), level: 1, ritual: false, classes: [props.path.className], source: "character spellbook" })
    : props.path.eligibleSpells;
  const spellbookCandidates = props.path.eligibleSpells.filter((spell) => !existingBook.includes(spell.id.toLowerCase()));
  const matches = (spell: AdvancementEligibleSpell, search: string) => !search.trim() || [spell.name, spell.id, spell.school ?? "", String(spell.level)].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (current: string[], spellId: string, checked: boolean, maximum: number): string[] => {
    if (!checked) return current.filter((candidate) => candidate !== spellId);
    return current.includes(spellId) || current.length >= maximum ? current : [...current, spellId];
  };
  const modeLabel = props.path.acquisitionMode === "spellbook" ? "Wizard spellbook"
    : props.path.acquisitionMode === "prepared-long-rest" ? "Prepared after a Long Rest" : "Prepared on class advancement";
  return (
    <section className="advancement-spell-choices" aria-label={`${props.path.className} spell advancement`}>
      <div className="operator-heading">
        <div><strong>{props.path.className} level {formatNumber(props.path.nextClassLevel)} spells</strong><p>{modeLabel}</p></div>
        <span className="status-pill">{titleCaseLabel(props.path.spellcastingAbility)} · spell level 1–{formatNumber(props.path.maxSpellLevel)}</span>
      </div>
      {alwaysPrepared.length > 0 && <p className="creator-note">Always prepared without using these choices: {alwaysPrepared.map((id) => eligibleById.get(id)?.name ?? prettyOriginId(id)).join(", ")}.</p>}
      {props.path.spellbookAdditions > 0 && (
        <fieldset className="advancement-ability-allocation" aria-label="Wizard spellbook additions">
          <legend>Choose exactly {formatNumber(props.path.spellbookAdditions)} new spellbook spells ({formatNumber(status.spellbookAdditionCount)}/{formatNumber(status.spellbookAdditionsRequired)})</legend>
          <label><span>Search eligible additions</span><input aria-label="Search Wizard spellbook additions" value={spellbookSearch} onChange={(event) => setSpellbookSearch(event.target.value)} /></label>
          <div className="advancement-spell-grid">
            {spellbookCandidates.filter((spell) => matches(spell, spellbookSearch)).map((spell, index) => {
              const checked = props.wizardSpellbookAdditions.includes(spell.id);
              return <label key={spell.id}><input ref={index === 0 ? props.firstSpellbookRef : undefined} aria-invalid={props.invalidSpellbook} aria-describedby={props.invalidSpellbook ? "advancement-error" : undefined} type="checkbox" checked={checked} disabled={!props.canChoose || (!checked && props.wizardSpellbookAdditions.length >= props.path.spellbookAdditions)} onChange={(event) => props.onWizardSpellbookAdditionsChange(toggle(props.wizardSpellbookAdditions, spell.id, event.target.checked, props.path.spellbookAdditions))} /><span><strong>{spell.name}</strong><small>Level {formatNumber(spell.level)}{spell.school ? ` · ${titleCaseLabel(spell.school)}` : ""}{spell.ritual ? " · ritual" : ""}</small></span></label>;
            })}
          </div>
        </fieldset>
      )}
      <fieldset className="advancement-ability-allocation" aria-label={`${props.path.className} prepared spells`}>
        <legend>Choose exactly {formatNumber(props.path.preparedSpellCapacity)} normal prepared spells ({formatNumber(status.preparedCount)}/{formatNumber(status.preparedRequired)})</legend>
        <label><span>Search prepared spells</span><input aria-label={`Search ${props.path.className} prepared spells`} value={preparedSearch} onChange={(event) => setPreparedSearch(event.target.value)} /></label>
        <div className="advancement-spell-grid">
          {preparedCandidates.filter((spell) => !alwaysPrepared.includes(spell.id.toLowerCase()) && matches(spell, preparedSearch)).map((spell, index) => {
            const checked = props.preparedSpellIds.includes(spell.id);
            return <label key={spell.id}><input ref={index === 0 ? props.firstPreparedRef : undefined} aria-invalid={props.invalidPrepared} aria-describedby={props.invalidPrepared ? "advancement-error" : undefined} type="checkbox" checked={checked} disabled={!props.canChoose || (!checked && props.preparedSpellIds.length >= props.path.preparedSpellCapacity)} onChange={(event) => props.onPreparedSpellIdsChange(toggle(props.preparedSpellIds, spell.id, event.target.checked, props.path.preparedSpellCapacity))} /><span><strong>{spell.name}</strong><small>Level {formatNumber(spell.level)}{spell.school ? ` · ${titleCaseLabel(spell.school)}` : ""}{spell.ritual ? " · ritual" : ""}</small></span></label>;
          })}
        </div>
      </fieldset>
      <p className={status.complete ? "advancement-choice-status complete" : "advancement-choice-status"} role="status">{status.complete ? `${props.path.className} spell choices are complete.` : status.error}</p>
    </section>
  );
}
