import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const close = () => { setOpen(false); onDismiss?.(); button.current?.focus(); };

  useLayoutEffect(() => {
    const menu = panel.current;
    const triggerButton = button.current;
    if (!open || !menu || !triggerButton) return;
    const position = () => {
      const anchor = triggerButton.getBoundingClientRect();
      const rect = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8)) + "px";
      menu.style.top = (anchor.bottom + rect.height + 8 <= window.innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - rect.height - 4)) + "px";
    };
    position();
    items()[0]?.focus();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || button.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
      onDismiss?.();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("focusin", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("focusin", closeFromOutside);
    };
  }, [open, onDismiss]);
  return (
    <>
      <button ref={button} className={className} type="button" aria-label={label} aria-haspopup="menu" aria-controls={open ? id : undefined} aria-expanded={open} disabled={disabled}
        onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}
        onClick={() => open ? close() : setOpen(true)}>{trigger}</button>
      {open && createPortal(<div ref={panel} id={id} className="action-menu" role="menu" aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
          if (event.key === "Tab") { close(); return; }
          const choices = items();
          const index = choices.indexOf(document.activeElement as HTMLButtonElement);
          if (choices.length === 0 || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
          choices[next]?.focus();
        }}>
        {children(close)}
      </div>, document.body)}
    </>
  );
}
