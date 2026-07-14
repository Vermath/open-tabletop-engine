import { Search } from "lucide-react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { filterPaletteCommands, movePaletteIndex, paletteDiceFormula, type PaletteCommand } from "./command-palette.js";
import { dieShapeName, dieShapePoints, type DiceCastPlan } from "./dice-3d.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { formatNumber } from "./sheet-format.js";

export function CommandPalette(props: { commands: PaletteCommand[]; onRun(commandId: string): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalAccessibility<HTMLDivElement>(props.onClose, { initialFocusRef: inputRef });

  const queryFormula = paletteDiceFormula(query);
  const matches = filterPaletteCommands(props.commands, query).slice(0, 12);
  const results: PaletteCommand[] = queryFormula
    ? [{ id: `roll:${queryFormula}`, label: `Roll ${queryFormula}`, section: "Dice", hint: "press Enter to roll" }, ...matches.filter((command) => command.id !== `roll:${queryFormula}`)]
    : matches;
  const active = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div ref={dialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" tabIndex={-1}>
        <div className="command-palette-input-row">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="Command palette search"
            placeholder="Jump to a scene, switch workspace, or roll 2d6+3..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex(movePaletteIndex(active, 1, results.length));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(movePaletteIndex(active, -1, results.length));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const target = results[active];
                if (target) props.onRun(target.id);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette-list" ref={listRef} role="listbox" aria-label="Command results">
          {results.length === 0 && <div className="command-palette-empty">No matching commands.</div>}
          {results.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === active}
              data-active={index === active ? "true" : undefined}
              className={index === active ? "command-palette-item active" : "command-palette-item"}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => props.onRun(command.id)}
            >
              <span className="command-palette-item-label">{command.label}</span>
              {command.hint && <small>{command.hint}</small>}
              <span className="command-palette-item-section">{command.section}</span>
            </button>
          ))}
        </div>
        <footer className="command-palette-footer">
          <span>
            <kbd>Up</kbd>
            <kbd>Down</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> toggle
          </span>
        </footer>
      </div>
    </div>
  );
}

export function DiceCastOverlay(props: { casts: DiceCastPlan[] }) {
  return (
    <div className="dice-cast-overlay" aria-hidden="true">
      {props.casts.map((cast) => (
        <div className={cast.highlight ? `dice-cast dice-cast-${cast.highlight}` : "dice-cast"} key={cast.rollId}>
          <div className="dice-cast-dice">
            {cast.dice.map((die) => {
              const shape = dieShapeName(die.sides);
              const points = dieShapePoints(shape);
              const face = die.value >= die.sides ? "crit" : die.value === 1 ? "fumble" : "plain";
              const style = {
                "--cast-delay": `${die.delayMs}ms`,
                "--cast-spin-x": `${die.spinXTurns}turn`,
                "--cast-spin-y": `${die.spinYTurns}turn`,
                "--cast-from-x": `${die.fromXVmin}vmin`,
                "--cast-from-y": `${die.fromYVmin}vmin`,
                "--cast-rest": `${360 + die.restTiltDeg}deg`,
                "--cast-final-opacity": die.kept ? 1 : 0.4
              } as CSSProperties;
              return (
                <span className={`dice-cast-die dice-cast-die-${shape} dice-cast-die-${face}${die.kept ? "" : " dice-cast-die-dropped"}`} key={die.id} style={style}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    {points ? <polygon className="dice-cast-face" points={points} /> : <rect className="dice-cast-face" x="5" y="5" width="38" height="38" rx="8" />}
                  </svg>
                  <strong>{die.value}</strong>
                </span>
              );
            })}
          </div>
          <div className="dice-cast-label" style={{ "--cast-label-delay": `${cast.settleMs}ms` } as CSSProperties}>
            <span>{cast.label}</span>
            <strong>{formatNumber(cast.total)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
