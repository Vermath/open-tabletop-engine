import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "error";

export interface ToastAction {
  id?: string;
  label: string;
  run(): void;
}

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** One follow-up the toast offers, such as undoing what it reports. */
  action?: ToastAction;
}

const maxVisibleToasts = 3;
const infoToastMs = 4000;
const errorToastMs = 8000;
const statusNoisePattern = /^(ready|loading|synced|connected|rolled)\b/i;
const connectionStatusPattern = /realtime|reconnect|api offline/i;
const errorStatusPattern = /fail|error|denied|requires?\b|required|unable|invalid|missing|cannot|can't|expired|unauthorized|forbidden|blocked|conflict|not allowed|do(?:es)? not match|timed out|no longer available/i;

/**
 * Fallback for status lines whose caller did not say what they are: returns
 * the tone to toast with, or undefined when the line should not raise a toast.
 * Prefer `reportError` and `setQuietStatus`, which state the intent directly.
 */
export function statusToastTone(status: string): ToastTone | undefined {
  const text = status.trim();
  if (!text || statusNoisePattern.test(text) || connectionStatusPattern.test(text)) return undefined;
  return errorStatusPattern.test(text) ? "error" : "info";
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Adds a toast, replacing a visible one with the same text and tone instead of stacking a duplicate. */
export function withToast(current: readonly Toast[], next: Toast): Toast[] {
  const others = current.filter((toast) => toast.text !== next.text || toast.tone !== next.tone);
  return [...others.slice(Math.max(0, others.length - (maxVisibleToasts - 1))), next];
}

/**
 * Owns the toast stack and the three ways the workspace reports something:
 *
 * - `setStatus(text)` (the caller's own setter): status line, plus a toast whose
 *   tone is inferred from the text.
 * - `setQuietStatus(text)`: status line only, for confirmations of something
 *   the user can already see on the board.
 * - `reportError(error)`: status line and an error toast, every time, whatever
 *   the message says.
 */
export function useStatusToasts(options: { status: string; setStatus(text: string): void; ready: boolean; suppressedStatus?: string }) {
  const { status, setStatus, ready, suppressedStatus } = options;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const handledStatusRef = useRef("");
  // Read through a ref so `reportError` keeps one identity and long-lived listeners never hold a stale copy.
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismissToastAction = useCallback((actionId: string) => {
    setToasts((current) => current.filter((toast) => toast.action?.id !== actionId));
  }, []);

  const pushToast = useCallback((text: string, tone: ToastTone, durationMs: number = tone === "error" ? errorToastMs : infoToastMs, action?: ToastAction) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => withToast(current, { id, text, tone, ...(action ? { action } : {}) }));
    window.setTimeout(() => dismissToast(id), durationMs);
  }, [dismissToast]);

  const setQuietStatus = useCallback((text: string) => {
    handledStatusRef.current = text.trim();
    setStatus(text);
  }, [setStatus]);

  const reportError = useCallback((error: unknown) => {
    const text = describeError(error);
    // Before the workspace is ready there is no toast stack on screen; leave the
    // line unhandled so it is toasted, by inference, once the workspace appears.
    if (readyRef.current && text.trim()) {
      handledStatusRef.current = text.trim();
      pushToast(text, "error");
    }
    setStatus(text);
  }, [pushToast, setStatus]);

  useEffect(() => {
    if (!ready) return;
    const text = status.trim();
    if (!text || text === handledStatusRef.current) return;
    handledStatusRef.current = text;
    if (text === suppressedStatus) return;
    const tone = statusToastTone(text);
    if (tone) pushToast(text, tone);
  }, [pushToast, ready, status, suppressedStatus]);

  return { toasts, pushToast, dismissToast, dismissToastAction, setQuietStatus, reportError };
}
