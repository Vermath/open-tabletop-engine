import type { CalculationFieldExplanation, RulesSupportBoundary } from "@open-tabletop/core";
import type { ReactNode } from "react";

interface ActionBoundaryInput {
  blocked?: { code: string; reason: string; supportStatus?: "automated" | "manual" | "unsupported" };
  pendingChoice?: { reason: string };
  pendingSaves?: Array<{ reason: string; requiredForCommit?: boolean }>;
  pendingReactions?: Array<{ reason: string }>;
  manualResolutionRequired?: { reason: string; supportStatus?: "manual" | "unsupported" };
  rolls?: Array<{ advantageSources?: string[]; disadvantageSources?: string[] }>;
  weaponMastery?: { capability: "automatic" | "choice" | "manual"; status: "awaiting-roll" | "applied" | "not-triggered" | "choice-required" | "manual-step"; message: string; source?: string };
}

export function rulesBoundaryFromCalculation(field: CalculationFieldExplanation): RulesSupportBoundary {
  const sources = unique(field.terms.map((term) => `${term.source.name}${term.source.version ? ` ${term.source.version}` : ""}`));
  const explanation = field.flags.reasons.join(" ");
  if (field.flags.unsupported) {
    return boundary("unsupported", explanation || `${field.label} is outside the supported calculation model.`, sources);
  }
  if (field.flags.manual || field.flags.ambiguous) {
    return boundary("manual", explanation || `${field.label} needs a documented DM decision.`, sources);
  }
  return boundary("automated", `${field.label} is calculated by the server from the ordered sources shown below.`, sources);
}

export function rulesBoundaryFromAction(input: ActionBoundaryInput | undefined, supportsEffect: boolean, applyEffect: boolean): RulesSupportBoundary {
  const sources = unique([
    "D&D 5e SRD resolver",
    ...(input?.rolls ?? []).flatMap((roll) => [...(roll.advantageSources ?? []), ...(roll.disadvantageSources ?? [])]),
    ...(input?.weaponMastery?.source ? [input.weaponMastery.source] : []),
  ]);
  if (applyEffect && !supportsEffect) return boundary("unsupported", "This action can be rolled, but its effect is outside the typed consequence model.", sources);
  const manualReason = input?.manualResolutionRequired?.reason;
  if (manualReason && input?.manualResolutionRequired?.supportStatus === "unsupported") return boundary("unsupported", manualReason, sources);
  if (input?.blocked?.supportStatus === "unsupported") return boundary("unsupported", input.blocked.reason, sources);
  if (manualReason) return boundary("manual", manualReason, sources);
  if (input?.weaponMastery?.status === "choice-required" || input?.weaponMastery?.status === "manual-step" || (input?.weaponMastery?.capability === "manual" && input.weaponMastery.status === "awaiting-roll")) {
    return boundary("manual", input.weaponMastery.message, sources);
  }
  const requiredSave = input?.pendingSaves?.find((save) => save.requiredForCommit)?.reason;
  const pendingReason = input?.pendingChoice?.reason ?? requiredSave ?? input?.pendingReactions?.[0]?.reason;
  if (pendingReason) return boundary("manual", pendingReason, sources);
  if (input?.blocked) return boundary("automated", `The supported rules resolver blocked this action: ${input.blocked.reason}`, sources);
  return boundary("automated", applyEffect ? "The server will apply the reviewed typed consequences." : "The server will produce and record the reviewed roll.", sources);
}

export function rulesBoundaryFromSpell(input: { supported: boolean; automation: "preview_only" | "schedule_template" | "manual"; manualSteps: string[]; warnings: string[]; source: string }): RulesSupportBoundary {
  if (!input.supported) return boundary("unsupported", input.warnings[0] ?? "This spell helper is outside the supported typed rules model.", [input.source]);
  if (input.automation !== "schedule_template" || input.manualSteps.length > 0) {
    return boundary("manual", input.manualSteps[0] ?? "The preview is supported, but a DM must resolve the remaining outcome.", [input.source]);
  }
  return boundary("automated", "The server produced a typed effect schedule from this reviewed spell helper.", [input.source]);
}

export function RulesSupportBoundaryNotice(props: { boundary: RulesSupportBoundary; children?: ReactNode }) {
  return (
    <div className={`rules-support-boundary rules-support-${props.boundary.status}`} role="note" aria-label={`Rules support: ${props.boundary.label}`}>
      <div className="combatant-header">
        <strong>{props.boundary.label}</strong>
        <span className="status-pill">{props.boundary.status}</span>
      </div>
      <p>{props.boundary.explanation}</p>
      {props.boundary.sources.length > 0 && <small>Source{props.boundary.sources.length === 1 ? "" : "s"}: {props.boundary.sources.join(", ")}</small>}
      {props.boundary.nextAction && <p><strong>Next:</strong> {props.boundary.nextAction}</p>}
      {props.children}
    </div>
  );
}

function boundary(status: RulesSupportBoundary["status"], explanation: string, sources: string[]): RulesSupportBoundary {
  if (status === "manual") return { status, label: "DM decision", explanation, nextAction: "Review and record the DM ruling; any required choices remain blocked until supplied.", sources };
  if (status === "unsupported") return { status, label: "Unsupported", explanation, nextAction: "No automatic mutation will be made. Resolve it with a documented manual ruling or supported homebrew override.", sources };
  return { status, label: "Automated", explanation, sources };
}

function unique(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}
