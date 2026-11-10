import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "info" | "error";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

const maxVisibleToasts = 3;
const statusNoisePattern = /^(ready|loading|synced|connected|rolled)\b/i;
const connectionStatusPattern = /realtime|reconnect|api offline/i;
const errorStatusPattern = /fail|error|denied|required|unable|invalid|missing|cannot|expired|unauthorized/i;

/** Classifies a workspace status line, or returns undefined when it should not raise a toast. */
export function statusToastTone(status: string): ToastTone | undefined {
  const text = status.trim();
  if (!text || statusNoisePattern.test(text) || connectionStatusPattern.test(text)) return undefined;
  return errorStatusPattern.test(text) ? "error" : "info";
}

/**
 * Owns the toast stack. Workspace status lines raise toasts automatically;
 * `pushToast` raises one directly (for example, a chat mention).
 */
export function useStatusToasts(status: string, ready: boolean, suppressedStatus?: string) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const lastStatusRef = useRef("");

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((text: string, tone: ToastTone, durationMs: number) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => [...current.slice(1 - maxVisibleToasts), { id, text, tone }]);
    window.setTimeout(() => dismissToast(id), durationMs);
  }, [dismissToast]);

  useEffect(() => {
    if (!ready) return;
    const text = status.trim();
    if (!text || text === lastStatusRef.current) return;
    lastStatusRef.current = text;
    if (text === suppressedStatus) return;
    const tone = statusToastTone(text);
    if (tone) pushToast(text, tone, tone === "error" ? 8000 : 4000);
  }, [pushToast, ready, status, suppressedStatus]);

  return { toasts, pushToast, dismissToast };
}
