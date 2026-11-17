import { useLayoutEffect, useMemo, useRef } from "react";

/**
 * Helpers that let memoised board layers skip work.
 *
 * The app re-renders its whole tree several times for one action, and a
 * reconciled snapshot arrives as fresh objects even when nothing in it
 * changed. These keep the references handed to memoised children the same
 * whenever their content is the same.
 */
export interface SignatureCache<T> {
  input?: T;
  output?: T;
  signature?: string;
  filled: boolean;
}

/**
 * Returns the previously returned value when `value` is a different object
 * with the same signature. The signature is computed only when the reference
 * changes, so a plain re-render costs one comparison.
 */
export function stableBySignature<T>(cache: SignatureCache<T>, value: T, signature: (value: T) => string): T {
  if (cache.filled && Object.is(cache.input, value)) return cache.output as T;
  const next = signature(value);
  if (cache.filled && cache.signature === next) {
    cache.input = value;
    return cache.output as T;
  }
  cache.input = value;
  cache.output = value;
  cache.signature = next;
  cache.filled = true;
  return value;
}

const jsonSignature = (value: unknown): string => JSON.stringify(value) ?? "undefined";

export function useStructurallyStable<T>(value: T, signature: (value: T) => string = jsonSignature): T {
  const cache = useRef<SignatureCache<T>>({ filled: false });
  return stableBySignature(cache.current, value, signature);
}

type HandlerMap = Record<string, (...args: never[]) => unknown>;

/** A handler object whose identity never changes and whose methods run `read()`'s current implementation. */
export function forwardingHandlers<T extends HandlerMap>(names: ReadonlyArray<keyof T & string>, read: () => T): T {
  const forwarding = {} as Record<string, (...args: never[]) => unknown>;
  for (const name of names) forwarding[name] = (...args: never[]) => read()[name]!(...args);
  return forwarding as T;
}

/**
 * Gives memoised children one stable handler object. The handlers a child
 * calls are always those of the latest committed render, exactly as inline
 * handlers were, so nothing sees stale state. The set of handler names is
 * fixed by the first render.
 */
export function useStableHandlers<T extends HandlerMap>(handlers: T): T {
  const latest = useRef(handlers);
  useLayoutEffect(() => { latest.current = handlers; });
  return useMemo(() => forwardingHandlers(Object.keys(handlers) as Array<keyof T & string>, () => latest.current), []);
}
