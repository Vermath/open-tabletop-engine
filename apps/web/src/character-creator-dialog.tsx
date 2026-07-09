import { Check, ChevronLeft, ChevronRight, UserPlus, X } from "lucide-react";
import { useState } from "react";
import type { CharacterTemplateInfo, Snapshot } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { errorMessage, prettyOriginId } from "./sheet-format.js";


export type CharacterOriginsInfo = {
  backgrounds: Array<{ id: string; name: string; abilityScores: string[]; feat: string; skillProficiencies: string[]; toolProficiencies: string[]; startingGp: number }>;
  species: Array<{ id: string; name: string; size: string; speed: number; traits: string[]; senses?: string[] }>;
  elfLineages: Array<{ id: string; name: string; cantrip: string; level3Spell: string; level5Spell: string }>;
  gnomeLineages: Array<{ id: string; name: string }>;
  tieflingLegacies: Array<{ id: string; name: string; resistance: string }>;
  highElfCantrips: string[];
  skills: Array<{ id: string; label: string; ability: string }>;
  originFeats: string[];
  spellcastingAbilities: string[];
};


export type CharacterCreateInput = {
  name: string;
  ownerUserId: string;
  backgroundId?: string;
  speciesId?: string;
  abilityScoreIncreases?: Record<string, number>;
  skillProficiency?: string;
  originFeat?: string;
  elfLineage?: string;
  elfCantrip?: string;
  gnomeLineage?: string;
  tieflingLegacy?: string;
  speciesSpellcastingAbility?: string;
};


export function CharacterCreatorDialog(props: {
  templates: CharacterTemplateInfo[];
  origins?: CharacterOriginsInfo;
  members: Snapshot["members"];
  currentUserId: string;
  onClose(): void;
  onCreate(template: CharacterTemplateInfo, input: CharacterCreateInput): Promise<void>;
}) {
  const steps = props.origins ? ["Class", "Origin", "Background", "Finish"] : ["Class", "Finish"];
  const [stepIndex, setStepIndex] = useState(0);
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [ownerUserId, setOwnerUserId] = useState(props.currentUserId);
  const [speciesId, setSpeciesId] = useState("human");
  const [backgroundId, setBackgroundId] = useState("soldier");
  const [spreadMode, setSpreadMode] = useState<"2-1" | "1-1-1">("2-1");
  const [plusTwoChoice, setPlusTwoChoice] = useState("");
  const [plusOneChoice, setPlusOneChoice] = useState("");
  const [skillProficiency, setSkillProficiency] = useState("");
  const [originFeat, setOriginFeat] = useState("Skilled");
  const [elfLineage, setElfLineage] = useState("high-elf");
  const [elfCantrip, setElfCantrip] = useState("prestidigitation");
  const [gnomeLineage, setGnomeLineage] = useState("forest-gnome");
  const [tieflingLegacy, setTieflingLegacy] = useState("infernal");
  const [spellAbility, setSpellAbility] = useState("intelligence");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useModalAccessibility<HTMLDivElement>(props.onClose);

  const template = props.templates.find((item) => item.id === templateId);
  const origins = props.origins;
  const species = origins?.species.find((item) => item.id === speciesId);
  const background = origins?.backgrounds.find((item) => item.id === backgroundId);
  const spreadAbilities = background?.abilityScores ?? [];
  const plusTwo = spreadAbilities.includes(plusTwoChoice) ? plusTwoChoice : spreadAbilities[0] ?? "";
  const plusOneFallback = spreadAbilities.find((ability) => ability !== plusTwo) ?? "";
  const plusOne = spreadAbilities.includes(plusOneChoice) && plusOneChoice !== plusTwo ? plusOneChoice : plusOneFallback;
  const humanSkillOptions = origins?.skills.filter((skill) => !background?.skillProficiencies.includes(skill.id)) ?? [];
  const speciesNeedsSpellAbility = speciesId === "elf" || speciesId === "gnome" || speciesId === "tiefling";
  const buildSummary = [species?.name, background?.name, template?.name].filter(Boolean).join(" ");

  function creationInput(): CharacterCreateInput {
    const input: CharacterCreateInput = { name, ownerUserId };
    if (!origins) return input;
    input.backgroundId = backgroundId;
    input.speciesId = speciesId;
    input.abilityScoreIncreases = spreadMode === "2-1"
      ? { [plusTwo]: 2, [plusOne]: 1 }
      : Object.fromEntries(spreadAbilities.map((ability) => [ability, 1]));
    if (speciesId === "human") {
      if (skillProficiency) input.skillProficiency = skillProficiency;
      input.originFeat = originFeat;
    }
    if (speciesId === "elf") {
      input.elfLineage = elfLineage;
      if (elfLineage === "high-elf") input.elfCantrip = elfCantrip;
    }
    if (speciesId === "gnome") input.gnomeLineage = gnomeLineage;
    if (speciesId === "tiefling") input.tieflingLegacy = tieflingLegacy;
    if (speciesNeedsSpellAbility) input.speciesSpellcastingAbility = spellAbility;
    return input;
  }

  async function submit() {
    if (!template || creating) return;
    setCreating(true);
    setError("");
    try {
      await props.onCreate(template, creationInput());
    } catch (submitError) {
      setError(errorMessage(submitError));
      setCreating(false);
    }
  }

  const stepName = steps[stepIndex] ?? "Class";
  const nextDisabled = stepName === "Class" ? !template : stepName === "Background" ? spreadMode === "2-1" && (!plusTwo || !plusOne) : false;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div ref={dialogRef} className="modal-dialog character-creator" role="dialog" aria-modal="true" aria-label="Character creator" tabIndex={-1}>
        <header className="creator-header">
          <div>
            <h2>Create a character</h2>
            <p>{buildSummary || template?.name || "Choose a class to begin"}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close character creator" onClick={props.onClose}><X size={16} /></button>
        </header>
        <nav className="creator-steps" aria-label="Creator steps">
          {steps.map((step, index) => (
            <button key={step} type="button" className={index === stepIndex ? "creator-step active" : index < stepIndex ? "creator-step done" : "creator-step"} onClick={() => setStepIndex(Math.min(index, stepIndex))} disabled={index > stepIndex}>
              {index < stepIndex ? <Check size={12} /> : <span className="creator-step-number">{index + 1}</span>} {step}
            </button>
          ))}
        </nav>
        <div className="creator-body">
          {stepName === "Class" && (
            <div className="creator-grid" role="radiogroup" aria-label="Class">
              {props.templates.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={item.id === templateId} className={item.id === templateId ? "creator-card selected" : "creator-card"} onClick={() => setTemplateId(item.id)}>
                  <strong>{item.name}</strong>
                  <small>{item.summary}</small>
                </button>
              ))}
            </div>
          )}
          {stepName === "Origin" && origins && (
            <>
              <div className="creator-grid compact" role="radiogroup" aria-label="Species">
                {origins.species.map((item) => (
                  <button key={item.id} type="button" role="radio" aria-checked={item.id === speciesId} className={item.id === speciesId ? "creator-card selected" : "creator-card"} onClick={() => setSpeciesId(item.id)}>
                    <strong>{item.name}</strong>
                    <small>{item.size} · {item.speed} ft. · {item.traits.slice(0, 3).join(", ")}</small>
                  </button>
                ))}
              </div>
              <div className="creator-choices">
                {speciesId === "human" && (
                  <>
                    <label>
                      <span>Skillful proficiency</span>
                      <select aria-label="Human skill proficiency" value={skillProficiency} onChange={(event) => setSkillProficiency(event.target.value)}>
                        <option value="">Choose later</option>
                        {humanSkillOptions.map((skill) => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Versatile origin feat</span>
                      <select aria-label="Human origin feat" value={originFeat} onChange={(event) => setOriginFeat(event.target.value)}>
                        {origins.originFeats.map((feat) => <option key={feat} value={feat}>{feat}</option>)}
                      </select>
                    </label>
                  </>
                )}
                {speciesId === "elf" && (
                  <>
                    <label>
                      <span>Elven lineage</span>
                      <select aria-label="Elven lineage" value={elfLineage} onChange={(event) => setElfLineage(event.target.value)}>
                        {origins.elfLineages.map((lineage) => <option key={lineage.id} value={lineage.id}>{lineage.name}</option>)}
                      </select>
                    </label>
                    {elfLineage === "high-elf" && (
                      <label>
                        <span>High Elf cantrip</span>
                        <select aria-label="High Elf cantrip" value={elfCantrip} onChange={(event) => setElfCantrip(event.target.value)}>
                          {origins.highElfCantrips.map((cantrip) => <option key={cantrip} value={cantrip}>{prettyOriginId(cantrip)}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
                {speciesId === "gnome" && (
                  <label>
                    <span>Gnomish lineage</span>
                    <select aria-label="Gnomish lineage" value={gnomeLineage} onChange={(event) => setGnomeLineage(event.target.value)}>
                      {origins.gnomeLineages.map((lineage) => <option key={lineage.id} value={lineage.id}>{lineage.name}</option>)}
                    </select>
                  </label>
                )}
                {speciesId === "tiefling" && (
                  <label>
                    <span>Fiendish legacy</span>
                    <select aria-label="Fiendish legacy" value={tieflingLegacy} onChange={(event) => setTieflingLegacy(event.target.value)}>
                      {origins.tieflingLegacies.map((legacy) => <option key={legacy.id} value={legacy.id}>{legacy.name} · resists {legacy.resistance}</option>)}
                    </select>
                  </label>
                )}
                {speciesNeedsSpellAbility && (
                  <label>
                    <span>Spellcasting ability for species spells</span>
                    <select aria-label="Species spellcasting ability" value={spellAbility} onChange={(event) => setSpellAbility(event.target.value)}>
                      {origins.spellcastingAbilities.map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </>
          )}
          {stepName === "Background" && origins && (
            <>
              <div className="creator-grid compact" role="radiogroup" aria-label="Background">
                {origins.backgrounds.map((item) => (
                  <button key={item.id} type="button" role="radio" aria-checked={item.id === backgroundId} className={item.id === backgroundId ? "creator-card selected" : "creator-card"} onClick={() => setBackgroundId(item.id)}>
                    <strong>{item.name}</strong>
                    <small>{item.feat} · {item.skillProficiencies.map(prettyOriginId).join(", ")}</small>
                  </button>
                ))}
              </div>
              <div className="creator-choices">
                <div className="segmented-control" role="group" aria-label="Ability score spread">
                  <button className={spreadMode === "2-1" ? "active" : ""} type="button" onClick={() => setSpreadMode("2-1")}>+2 / +1</button>
                  <button className={spreadMode === "1-1-1" ? "active" : ""} type="button" onClick={() => setSpreadMode("1-1-1")}>+1 / +1 / +1</button>
                </div>
                {spreadMode === "2-1" ? (
                  <>
                    <label>
                      <span>+2 to</span>
                      <select aria-label="Plus two ability" value={plusTwo} onChange={(event) => setPlusTwoChoice(event.target.value)}>
                        {spreadAbilities.map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>+1 to</span>
                      <select aria-label="Plus one ability" value={plusOne} onChange={(event) => setPlusOneChoice(event.target.value)}>
                        {spreadAbilities.filter((ability) => ability !== plusTwo).map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className="creator-note">+1 to {spreadAbilities.map(prettyOriginId).join(", ")}.</p>
                )}
              </div>
            </>
          )}
          {stepName === "Finish" && (
            <div className="creator-choices">
              <label>
                <span>Character name</span>
                <input aria-label="Character name" type="text" placeholder={template?.name ?? "Name"} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>Played by</span>
                <select aria-label="Character owner" value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
                  {props.members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName} · {member.role}</option>)}
                </select>
              </label>
              {origins && background && (
                <p className="creator-note">
                  {buildSummary}. {spreadMode === "2-1" ? `${prettyOriginId(plusTwo)} +2, ${prettyOriginId(plusOne)} +1` : `${spreadAbilities.map(prettyOriginId).join(" +1, ")} +1`} · {background.feat} · {background.startingGp} gp.
                </p>
              )}
            </div>
          )}
          {error && <p className="creator-error" role="alert">{error}</p>}
        </div>
        <footer className="creator-footer">
          <button className="ghost-button" type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
            <ChevronLeft size={14} /> Back
          </button>
          {stepIndex < steps.length - 1 ? (
            <button className="ghost-button" type="button" disabled={nextDisabled} onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}>
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button className="ghost-button wide" type="button" disabled={!template || creating} onClick={() => void submit()}>
              <UserPlus size={15} /> {creating ? "Creating…" : "Create character"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
