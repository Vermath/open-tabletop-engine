import type {
  ActorCalculationExplanation,
  CalculationFieldExplanation,
  CalculationFlags,
  CalculationSource,
  CalculationTerm,
  ContentImportLicense
} from "@open-tabletop/core";

export const DND_5E_SRD_CALCULATION_EXPLANATION_VERSION = "1.0.0";

export interface Dnd5eSrdCalculationFlagInput {
  manual?: boolean;
  override?: boolean;
  unsupported?: boolean;
  ambiguous?: boolean;
  reasons?: string[];
}

export interface Dnd5eSrdAbilityCalculationInput {
  id: string;
  label: string;
  score: number;
  modifier: number;
  actorSource: CalculationSource;
  systemSource: CalculationSource;
}

export interface Dnd5eSrdScalarCalculationInput {
  id: string;
  label: string;
  result: number | string;
  terms: CalculationTerm[];
  unit?: string;
  flags?: Dnd5eSrdCalculationFlagInput;
}

export interface Dnd5eSrdRollCalculationInput extends Dnd5eSrdScalarCalculationInput {
  formula: string;
}

export interface Dnd5eSrdCalculationInput {
  actorId: string;
  systemId: string;
  systemVersion: string;
  rulesVersion: string;
  sourceName: string;
  sourceVersion: string;
  license: ContentImportLicense;
  abilities: Dnd5eSrdAbilityCalculationInput[];
  proficiency: Dnd5eSrdScalarCalculationInput;
  armorClass: Dnd5eSrdScalarCalculationInput;
  hitPoints: {
    maximum: Dnd5eSrdScalarCalculationInput;
    current: Dnd5eSrdScalarCalculationInput;
    temporary: Dnd5eSrdScalarCalculationInput;
  };
  initiative: Dnd5eSrdRollCalculationInput;
  savingThrows: Dnd5eSrdRollCalculationInput[];
  skills: Dnd5eSrdRollCalculationInput[];
  passivePerception: Dnd5eSrdScalarCalculationInput;
  speed: Dnd5eSrdScalarCalculationInput;
  spellcasting?: {
    saveDc: Dnd5eSrdScalarCalculationInput;
    attackBonus: Dnd5eSrdScalarCalculationInput;
  };
  actionRolls: Dnd5eSrdRollCalculationInput[];
}

function calculationFlags(input: Dnd5eSrdCalculationFlagInput = {}): CalculationFlags {
  return {
    manual: input.manual === true,
    override: input.override === true,
    unsupported: input.unsupported === true,
    ambiguous: input.ambiguous === true,
    reasons: [...new Set((input.reasons ?? []).map((reason) => reason.trim()).filter(Boolean))]
  };
}

function scalarField(
  group: CalculationFieldExplanation["group"],
  input: Dnd5eSrdScalarCalculationInput
): CalculationFieldExplanation {
  return {
    id: input.id,
    group,
    label: input.label,
    result: input.result,
    ...(input.unit ? { unit: input.unit } : {}),
    terms: input.terms.map((term) => ({ ...term, source: { ...term.source } })),
    flags: calculationFlags(input.flags)
  };
}

function abilityFields(input: Dnd5eSrdAbilityCalculationInput): CalculationFieldExplanation[] {
  return [
    {
      id: `ability.${input.id}.score`,
      group: "abilities",
      label: `${input.label} score`,
      result: input.score,
      terms: [{ label: "Stored ability score", signedValue: input.score, source: { ...input.actorSource } }],
      flags: calculationFlags()
    },
    {
      id: `ability.${input.id}.modifier`,
      group: "abilities",
      label: `${input.label} modifier`,
      result: input.modifier,
      terms: [
        { label: `${input.label} score`, signedValue: input.score, source: { ...input.actorSource } },
        { label: "SRD modifier formula", formula: "floor((score - 10) / 2)", source: { ...input.systemSource } }
      ],
      flags: calculationFlags()
    }
  ];
}

/**
 * Formats already-computed SDK results into a stable explanation envelope.
 * Evaluation order is the input order; this function never recomputes rules.
 */
export function buildDnd5eSrdCalculationExplanation(input: Dnd5eSrdCalculationInput): ActorCalculationExplanation {
  const fields: CalculationFieldExplanation[] = [
    ...input.abilities.flatMap(abilityFields),
    scalarField("checks", input.proficiency),
    scalarField("defenses", input.armorClass),
    scalarField("vitality", input.hitPoints.maximum),
    scalarField("vitality", input.hitPoints.current),
    scalarField("vitality", input.hitPoints.temporary),
    scalarField("checks", input.initiative),
    ...input.savingThrows.map((field) => scalarField("checks", field)),
    ...input.skills.map((field) => scalarField("skills", field)),
    scalarField("skills", input.passivePerception),
    scalarField("defenses", input.speed),
    ...(input.spellcasting
      ? [
          scalarField("magic", input.spellcasting.saveDc),
          scalarField("magic", input.spellcasting.attackBonus)
        ]
      : []),
    ...input.actionRolls.map((field) => scalarField("actions", field))
  ];
  return {
    actorId: input.actorId,
    systemId: input.systemId,
    systemVersion: input.systemVersion,
    rulesVersion: input.rulesVersion,
    source: {
      name: input.sourceName,
      version: input.sourceVersion,
      license: { ...input.license }
    },
    fields
  };
}
