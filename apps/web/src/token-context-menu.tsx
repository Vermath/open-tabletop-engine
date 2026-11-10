import { Crosshair, Layers, PanelRightOpen } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./token-context-menu.css";

export interface TokenContextMenuAction {
  id: string;
  label: string;
  icon: ReactNode;
  run(): void;
}

export interface TokenContextMenuInput {
  tokenName: string;
  targeted: boolean;
  /** Label of the layer a layer change would move the token to. */
  nextLayerLabel: string;
  canTarget: boolean;
  canChangeLayer: boolean;
  onShowInInspector(): void;
  onToggleTarget(): void;
  onMoveToNextLayer(): void;
}

/** The actions offered for one token, in display order. Permission-gated actions are omitted, not disabled. */
export function tokenContextMenuActions(input: TokenContextMenuInput): TokenContextMenuAction[] {
  return [
    { id: "inspect", label: "Show in inspector", icon: <PanelRightOpen size={15} aria-hidden="true" />, run: input.onShowInInspector },
    ...(input.canTarget ? [{ id: "target", label: input.targeted ? "Clear target mark" : "Mark as target", icon: <Crosshair size={15} aria-hidden="true" />, run: input.onToggleTarget }] : []),
    ...(input.canChangeLayer ? [{ id: "layer", label: `Move to ${input.nextLayerLabel}`, icon: <Layers size={15} aria-hidden="true" />, run: input.onMoveToNextLayer }] : [])
  ];
}

/** Keeps a menu of the given size fully inside the window, a small margin from each edge. */
export function clampMenuPosition(position: { x: number; y: number }, menu: { width: number; height: number }, viewport: { width: number; height: number }, margin = 8): { x: number; y: number } {
  return {
    x: Math.max(margin, Math.min(position.x, viewport.width - menu.width - margin)),
    y: Math.max(margin, Math.min(position.y, viewport.height - menu.height - margin))
  };
}

export function TokenContextMenu(props: { tokenName: string; position: { x: number; y: number }; actions: TokenContextMenuAction[]; onClose(): void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(props.position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    setPosition(clampMenuPosition(props.position, { width: menu.offsetWidth, height: menu.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [props.position.x, props.position.y]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) props.onClose();
    };
    const close = () => props.onClose();
    // Capture phase: the board stops propagation for its own gestures.
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("wheel", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [props.onClose]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === "ArrowDown" ? (currentIndex + 1) % items.length :
      event.key === "ArrowUp" ? (currentIndex - 1 + items.length) % items.length :
      event.key === "Home" ? 0 :
      event.key === "End" ? items.length - 1 :
      -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    items[nextIndex]?.focus();
  }

  return (
    <div
      ref={menuRef}
      className="token-context-menu"
      role="menu"
      aria-label={`${props.tokenName} actions`}
      style={{ left: position.x, top: position.y }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="token-context-menu-title" aria-hidden="true">{props.tokenName}</div>
      {props.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className="token-context-menu-item"
          onClick={() => {
            props.onClose();
            action.run();
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
