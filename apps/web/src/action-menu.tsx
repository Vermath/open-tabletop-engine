import { useId, useRef, useState, type ReactNode } from "react";
import "./action-menu.css";

interface ActionMenuProps {
  label: string;
  trigger: ReactNode;
  className?: string;
  disabled?: boolean;
  onDismiss?(): void;
  children(close: () => void): ReactNode;
}

export function ActionMenu({ label, trigger, className = "ghost-button small", disabled, children, onDismiss }: ActionMenuProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const items = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not([disabled])') ?? []);
  const close = () => { panel.current?.hidePopover(); button.current?.focus(); };
  return (
    <>
      <button ref={button} className={className} type="button" aria-label={label} aria-haspopup="menu" aria-controls={id} aria-expanded={open} popoverTarget={id} disabled={disabled}
        onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); event.currentTarget.click(); } }}
        onClick={(event) => {
          event.preventDefault();
          const anchor = button.current?.getBoundingClientRect();
          const menu = panel.current;
          if (!anchor || !menu) return;
          if (menu.matches(":popover-open")) { close(); return; }
          menu.showPopover({ source: event.currentTarget });
          const rect = menu.getBoundingClientRect();
          menu.style.left = Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8)) + "px";
          menu.style.top = (anchor.bottom + rect.height + 8 <= window.innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - rect.height - 4)) + "px";
          items()[0]?.focus();
        }}>{trigger}</button>
      <div ref={panel} id={id} className="action-menu" role="menu" aria-label={label} popover="auto"
        onToggle={(event) => {
          const isOpen = event.currentTarget.matches(":popover-open");
          setOpen(isOpen);
          if (!isOpen) onDismiss?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
          const choices = items();
          const index = choices.indexOf(document.activeElement as HTMLButtonElement);
          if (choices.length === 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
          choices[next]?.focus();
        }}>
        {children(close)}
      </div>
    </>
  );
}
