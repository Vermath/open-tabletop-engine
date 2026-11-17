import { useLayoutEffect, useRef, useState } from "react";

const exitCleanupMs = 140;

function interfaceMotionReduced(): boolean {
  return document.documentElement.dataset.reducedMotion === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Keep the painted surface briefly while its controls and focus trap are already inactive. */
export function useInterfacePresence(open: boolean) {
  const [keepMounted, setKeepMounted] = useState(open);
  useLayoutEffect(() => {
    if (open) {
      setKeepMounted(true);
      return;
    }
    if (!keepMounted) return;
    if (interfaceMotionReduced()) {
      setKeepMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setKeepMounted(false), exitCleanupMs);
    return () => window.clearTimeout(timer);
  }, [open, keepMounted]);
  return { mounted: open || keepMounted, closing: !open };
}

export function useLeavingInterfaceItems<T extends { id: number }>(items: readonly T[]): readonly T[] {
  const previous = useRef(items);
  const [leaving, setLeaving] = useState<T[]>([]);
  const timers = useRef(new Map<number, number>());
  useLayoutEffect(() => {
    const removed = previous.current.filter(({ id }) => !items.some((item) => item.id === id));
    previous.current = items;
    if (removed.length === 0 || interfaceMotionReduced()) return;
    setLeaving((current) => [...current, ...removed]);
    for (const item of removed) {
      timers.current.set(item.id, window.setTimeout(() => {
        setLeaving((current) => current.filter(({ id }) => id !== item.id));
        timers.current.delete(item.id);
      }, exitCleanupMs));
    }
  }, [items]);
  useLayoutEffect(() => {
    const pending = timers.current;
    return () => { for (const timer of pending.values()) window.clearTimeout(timer); };
  }, []);
  return leaving;
}
