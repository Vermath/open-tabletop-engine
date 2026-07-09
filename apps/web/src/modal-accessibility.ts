import { useEffect, useRef, type RefObject } from "react";

const modalFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

export interface ModalAccessibilityOptions {
  enabled?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function modalFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(modalFocusableSelector)).filter((element) => element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true");
}

function isTopmostModal(dialog: HTMLElement): boolean {
  const modals = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return modals.length === 0 || modals.item(modals.length - 1) === dialog;
}

export function useModalAccessibility<T extends HTMLElement>(onClose: () => void, options: ModalAccessibilityOptions = {}): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const enabled = options.enabled ?? true;
  const closeOnEscape = options.closeOnEscape ?? true;
  const initialFocusRef = options.initialFocusRef;

  useEffect(() => {
    if (!enabled) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialTarget = initialFocusRef?.current ?? modalFocusableElements(dialog)[0] ?? dialog;
    initialTarget.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTopmostModal(dialog)) return;
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = modalFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [closeOnEscape, enabled, initialFocusRef]);

  return dialogRef;
}
