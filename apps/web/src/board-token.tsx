import type { Token, TokenLayer } from "@open-tabletop/core";
import { Ban, Bed, Droplet, EarOff, EyeOff, Footprints, Ghost, HeartOff, Link, Moon, Skull, Snowflake, Sparkles, Unlink, ZapOff } from "lucide-react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { memo, useId } from "react";
import { boardRenderCounts } from "./board-render-counts.js";
import { formatNumber } from "./sheet-format.js";
import "./board-token.css";

const conditionIcons = new Map(Object.entries({
  blinded: EyeOff, charmed: Sparkles, deafened: EarOff, exhaustion: Moon, frightened: Ghost,
  grappled: Link, incapacitated: Ban, invisible: Unlink, paralyzed: ZapOff, petrified: Snowflake,
  poisoned: Droplet, prone: Footprints, restrained: Link, stunned: Sparkles, unconscious: Bed, dead: Skull, dying: HeartOff,
}));

function tokenHue(id: string): number {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

/**
 * One token on the board, memoised.
 *
 * Every prop is a primitive or a reference that stays the same between
 * renders, so the default shallow comparison is exact: a token re-renders
 * only when something it shows has changed. The board keeps deciding what a
 * viewer may see (vitals, conditions, layer) and passes the outcome here;
 * this component adds no rules of its own.
 *
 * The handlers receive the token's id and look the token up at call time, so
 * they always act on current state.
 */
export interface BoardTokenHandlers {
  contextMenu(tokenId: string, event: ReactMouseEvent<HTMLButtonElement>): void;
  click(tokenId: string, event: ReactMouseEvent<HTMLButtonElement>): void;
  keyDown(tokenId: string, event: ReactKeyboardEvent<HTMLButtonElement>): void;
  pointerDown(tokenId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
  pointerMove(tokenId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
  pointerUp(tokenId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
  pointerCancel(tokenId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
  lostPointerCapture(tokenId: string, event: ReactPointerEvent<HTMLButtonElement>): void;
  resizePointerDown(tokenId: string, handleId: string, event: ReactPointerEvent<HTMLElement>): void;
  [name: string]: (...args: never[]) => unknown;
}

export interface BoardTokenProps {
  id: string;
  name: string;
  layer: TokenLayer;
  layerLabel: string;
  activeLayer: boolean;
  disposition: Token["disposition"];
  imageUrl: string | undefined;
  selected: boolean;
  primarySelected: boolean;
  targeted: boolean;
  auraCount: number;
  dragging: boolean;
  turnState: "current" | "next" | undefined;
  /** Position and size as percentages of the scene. */
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  elevation: number;
  /** Hit point ratio from 0 to 1, or undefined when the token has no hit points. Drives the "bloodied" and "down" looks. */
  hpRatio: number | undefined;
  /** Whether this viewer may see the hit point bar. */
  showVitals: boolean;
  /** Condition names as a JSON array, so the prop is a primitive and compares by content. */
  conditions: string;
  readOnly: boolean;
  canMove: boolean;
  calibrationActive: boolean;
  describedBy: string;
  /** Corner handles, present only while this token can be resized. */
  resizeHandles: ReadonlyArray<{ id: string; label: string }> | undefined;
  handlers: BoardTokenHandlers;
}

export const BoardToken = memo(function BoardToken(props: BoardTokenProps) {
  boardRenderCounts.token += 1;
  const { id, handlers, hpRatio } = props;
  const isCurrentTurn = props.turnState === "current";
  const isNextTurn = props.turnState === "next";
  const turnStateLabel = isCurrentTurn ? "current turn" : isNextTurn ? "up next" : undefined;
  const tokenHpTone = hpRatio === undefined ? "" : hpRatio <= 0.25 ? "danger" : hpRatio <= 0.5 ? "warning" : "healthy";
  const conditionEntries = JSON.parse(props.conditions) as string[];
  const descriptionId = useId();
  const conditionDescription = conditionEntries.length ? descriptionId : undefined;
  return (
    <button
      className={`token layer-${props.layer} ${props.activeLayer ? "active-layer" : "inactive-layer"} ${props.disposition} ${props.imageUrl ? "has-image" : ""} ${props.selected ? "selected" : ""} ${props.primarySelected ? "primary-selected" : ""} ${props.targeted ? "targeted" : ""} ${props.auraCount ? "has-aura" : ""} ${props.dragging ? "dragging" : ""} ${isCurrentTurn ? "turn-current" : ""} ${isNextTurn ? "turn-next" : ""} ${hpRatio !== undefined && hpRatio <= 0 ? "down" : hpRatio !== undefined && hpRatio <= 0.5 ? "bloodied" : ""}`}
      data-turn-state={props.turnState}
      data-token-id={id}
      aria-haspopup={props.readOnly ? undefined : "menu"}
      style={{
        left: `${props.left}%`,
        top: `${props.top}%`,
        width: `${props.width}%`,
        height: `${props.height}%`,
        pointerEvents: props.calibrationActive ? "none" : undefined,
        "--token-hue": tokenHue(id),
      } as CSSProperties}
      aria-label={`${props.layerLabel} token ${props.name}${props.elevation !== 0 ? ` at ${formatNumber(Math.abs(props.elevation))} feet ${props.elevation > 0 ? "above" : "below"} ground` : ""}${turnStateLabel ? `, ${turnStateLabel}` : ""}`}
      aria-pressed={props.selected}
      aria-describedby={[props.describedBy, conditionDescription].filter(Boolean).join(" ")}
      aria-keyshortcuts={props.canMove ? "ArrowUp ArrowDown ArrowLeft ArrowRight" : undefined}
      tabIndex={props.calibrationActive || props.readOnly ? -1 : undefined}
      aria-disabled={props.readOnly || undefined}
      title={props.readOnly ? props.name : !props.canMove ? "Token movement requires token.move" : "Arrow keys move; Shift moves 1 px; right-click for token actions"}
      onContextMenu={(event) => handlers.contextMenu(id, event)}
      onClick={(event) => handlers.click(id, event)}
      onKeyDown={props.readOnly ? undefined : (event) => handlers.keyDown(id, event)}
      onPointerDown={(event) => handlers.pointerDown(id, event)}
      onPointerMove={(event) => handlers.pointerMove(id, event)}
      onPointerUp={(event) => handlers.pointerUp(id, event)}
      onPointerCancel={(event) => handlers.pointerCancel(id, event)}
      onLostPointerCapture={(event) => handlers.lostPointerCapture(id, event)}
    >
      <span className="token-visual" style={{ transform: `rotate(${props.rotation}deg)` }} aria-hidden="true">
        {props.imageUrl && <img className="token-image" src={props.imageUrl} alt="" draggable={false} />}
        <span className="token-label">{props.name.slice(0, 2).toUpperCase()}</span>
      </span>
      <span className="token-nameplate" aria-hidden="true">{props.name}</span>
      {props.elevation !== 0 && (
        <small className="token-elevation" aria-hidden="true" title={`${formatNumber(Math.abs(props.elevation))} feet ${props.elevation > 0 ? "above" : "below"} ground`}>
          {props.elevation > 0 ? "+" : "-"}{formatNumber(Math.abs(props.elevation))} ft
        </small>
      )}
      {props.showVitals && (
        <span className={`token-hp ${tokenHpTone}`} aria-hidden="true">
          <span style={{ "--token-hp-fill": `${Math.round((hpRatio ?? 0) * 100)}%` } as CSSProperties} />
        </span>
      )}
      {(isCurrentTurn || isNextTurn) && <span className={`token-turn-ring ${isCurrentTurn ? "current" : "next"}`} aria-hidden="true" />}
      {conditionEntries.length > 0 ? (
        <span className="token-conditions" aria-hidden="true" title={conditionEntries.join(", ")}>
          {conditionEntries.slice(0, 3).map((condition, index) => {
            const Icon = conditionIcons.get(condition.toLowerCase());
            return <small className="token-condition-chip" key={index} title={condition}>{Icon ? <Icon size={12} /> : condition}</small>;
          })}
          {conditionEntries.length > 3 && <small className="token-condition-chip overflow">+{conditionEntries.length - 3}</small>}
        </span>
      ) : null}
      {conditionDescription && <span className="token-condition-description" id={conditionDescription}>{conditionEntries.join(", ")}</span>}
      {props.auraCount ? <small className="token-aura-count">{props.auraCount}</small> : null}
      {props.resizeHandles && (
        <>
          <span className="token-selection-frame" aria-hidden="true" />
          {props.resizeHandles.map((handle) => (
            <span
              className={`token-resize-corner handle-${handle.id}`}
              key={`${id}-${handle.id}`}
              title={handle.label}
              onPointerDown={(event) => handlers.resizePointerDown(id, handle.id, event)}
            />
          ))}
        </>
      )}
    </button>
  );
});
