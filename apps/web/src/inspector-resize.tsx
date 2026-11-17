import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import "./inspector-resize.css";

export const inspectorWidthStorageKey = "otte:inspectorWidth";
export const inspectorMinWidth = 320;
export const inspectorMaxWidth = 720;
const inspectorKeyboardStep = 16;

/** Keeps a requested inspector width within its limits and never wider than 55% of the layout. */
export function clampInspectorWidth(width: number, layoutWidth: number): number {
  const ceiling = Math.max(inspectorMinWidth, Math.min(inspectorMaxWidth, Math.floor(layoutWidth * 0.55)));
  return Math.round(Math.max(inspectorMinWidth, Math.min(ceiling, width)));
}

export function parseStoredInspectorWidth(value: string | null): number | undefined {
  if (!value) return undefined;
  const width = Number(value);
  return Number.isFinite(width) && width >= inspectorMinWidth && width <= inspectorMaxWidth ? Math.round(width) : undefined;
}

/** The user's chosen inspector width, remembered per browser. Undefined means the built-in responsive width. */
export function useInspectorWidth() {
  const [width, setWidthState] = useState<number | undefined>(() => {
    try {
      return parseStoredInspectorWidth(window.localStorage.getItem(inspectorWidthStorageKey));
    } catch {
      return undefined;
    }
  });

  const setWidth = useCallback((next: number | undefined) => {
    setWidthState(next);
    try {
      if (next === undefined) window.localStorage.removeItem(inspectorWidthStorageKey);
      else window.localStorage.setItem(inspectorWidthStorageKey, String(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const layoutProps = {
    "data-inspector-resized": width === undefined ? undefined : "true",
    style: width === undefined ? undefined : ({ "--inspector-width": `${width}px` } as CSSProperties)
  };
  return { width, setWidth, layoutProps };
}

/**
 * Drag handle on the inspector's inner edge. It lives in the layout grid rather
 * than in the inspector, so it does not scroll with the inspector's content.
 */
export function InspectorResizeHandle(props: { inspectorId: string; onResize(width: number | undefined): void }) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = useState(0);
  const dragRef = useRef<{ pointerId: number } | null>(null);

  useEffect(() => {
    const inspector = document.getElementById(props.inspectorId);
    if (!inspector) return;
    const measure = () => setInspectorWidth(inspector.offsetWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(inspector);
    return () => observer.disconnect();
  }, [props.inspectorId]);

  function layoutRect(): DOMRect | undefined {
    return handleRef.current?.parentElement?.getBoundingClientRect();
  }

  function resizeTo(width: number) {
    const layout = layoutRect();
    if (layout) props.onResize(clampInspectorWidth(width, layout.width));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const layout = layoutRect();
    if (dragRef.current?.pointerId !== event.pointerId || !layout) return;
    resizeTo(layout.right - event.clientX);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const next =
      event.key === "ArrowLeft" ? inspectorWidth + inspectorKeyboardStep :
      event.key === "ArrowRight" ? inspectorWidth - inspectorKeyboardStep :
      event.key === "Home" ? inspectorMaxWidth :
      event.key === "End" ? inspectorMinWidth :
      undefined;
    if (next !== undefined) {
      event.preventDefault();
      resizeTo(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      props.onResize(undefined);
    }
  }

  return (
    <div
      ref={handleRef}
      className="inspector-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-controls={props.inspectorId}
      aria-valuemin={inspectorMinWidth}
      aria-valuemax={inspectorMaxWidth}
      aria-valuenow={inspectorWidth || undefined}
      title="Drag to resize the inspector. Double-click to reset."
      tabIndex={0}
      style={{ right: Math.max(0, inspectorWidth - 4) }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => props.onResize(undefined)}
      onKeyDown={handleKeyDown}
    />
  );
}
