import type { Combat } from "@open-tabletop/core";
import { ChevronRight, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatNumber } from "./sheet-format.js";
import "./initiative-strip.css";

type Combatant = Combat["combatants"][number];

export interface InitiativeStripEntry {
  combatant: Combatant;
  state: "current" | "next" | "waiting" | "defeated";
}

/** Initiative order with each combatant's place in the turn, as the caller is allowed to see it. */
export function initiativeStripEntries(combat: Combat, currentCombatantId?: string, nextCombatantId?: string): InitiativeStripEntry[] {
  return combat.combatants.map((combatant) => ({
    combatant,
    state: combatant.id === currentCombatantId ? "current" : combatant.defeated ? "defeated" : combatant.id === nextCombatantId ? "next" : "waiting"
  }));
}

export function initiativeStripEntryLabel(entry: InitiativeStripEntry): string {
  const suffix = entry.state === "current" ? ", taking their turn" : entry.state === "next" ? ", up next" : entry.state === "defeated" ? ", defeated" : "";
  return `${entry.combatant.name}, initiative ${formatNumber(entry.combatant.initiative)}${suffix}`;
}

/**
 * Turn order pinned to the top of the map, so the table can follow combat
 * without giving up the inspector to the Combat tab.
 */
export function InitiativeStrip(props: {
  combat: Combat;
  currentCombatantId?: string;
  nextCombatantId?: string;
  canAdvance: boolean;
  onFocusCombatant(combatant: Combatant): void;
  onNextTurn(combat: Combat): Promise<void>;
  onOpenTracker(): void;
  onError(error: unknown): void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const currentRef = useRef<HTMLButtonElement>(null);
  const entries = initiativeStripEntries(props.combat, props.currentCombatantId, props.nextCombatantId);

  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [props.currentCombatantId, props.combat.round]);

  if (entries.length === 0) return null;

  function advance() {
    if (advancing) return;
    setAdvancing(true);
    props.onNextTurn(props.combat).catch(props.onError).finally(() => setAdvancing(false));
  }

  return (
    <section className="initiative-strip" aria-label="Turn order on the map">
      <button className="initiative-strip-round" type="button" title="Open the combat tracker" onClick={props.onOpenTracker}>
        <Swords size={14} aria-hidden="true" />
        <span>Round {formatNumber(props.combat.round)}</span>
      </button>
      <ol className="initiative-strip-order">
        {entries.map((entry) => (
          <li key={entry.combatant.id}>
            <button
              ref={entry.state === "current" ? currentRef : undefined}
              className={`initiative-strip-entry ${entry.state}`}
              type="button"
              aria-current={entry.state === "current" ? "step" : undefined}
              aria-label={initiativeStripEntryLabel(entry)}
              title={`Select ${entry.combatant.name} on the board`}
              onClick={() => props.onFocusCombatant(entry.combatant)}
            >
              <span className="initiative-strip-avatar" aria-hidden="true">{entry.combatant.name.slice(0, 2).toUpperCase()}</span>
              <span className="initiative-strip-name" aria-hidden="true">{entry.combatant.name}</span>
            </button>
          </li>
        ))}
      </ol>
      {props.canAdvance && (
        <button className="primary-button initiative-strip-next" type="button" onClick={advance} disabled={advancing}>
          Next turn <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
