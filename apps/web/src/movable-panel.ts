import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface FloatingPanelPosition {
  x: number;
  y: number;
}

export interface FloatingPanelSize {
  width: number;
  height: number;
}

interface FloatingPanelDrag {
  pointerId: number;
  handle: HTMLElement;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  maxX: number;
  maxY: number;
}

interface FloatingPanelResize {
  pointerId: number;
  handle: HTMLElement;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

interface FloatingPanelResizeOptions {
  minWidth?: number;
  minHeight?: number;
}

export function clampFloatingPanel(value: number, max: number): number {
  return Math.max(8, Math.min(Math.max(8, max), Math.round(value)));
}

function clampFloatingPanelSize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.max(min, max), Math.round(value)));
}


const floatingPanelInteractiveSelector = "button,input,select,textarea,a,label,[role='button']";

export function useMovablePanel(initialPosition: FloatingPanelPosition | (() => FloatingPanelPosition), initialSize: FloatingPanelSize | (() => FloatingPanelSize) = { width: 320, height: 280 }, resizeOptions: FloatingPanelResizeOptions = {}) {
  const [position, setPosition] = useState<FloatingPanelPosition>(() => (typeof initialPosition === "function" ? initialPosition() : initialPosition));
  const [size, setSize] = useState<FloatingPanelSize>(() => (typeof initialSize === "function" ? initialSize() : initialSize));
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<FloatingPanelDrag | null>(null);
  const resizeRef = useRef<FloatingPanelResize | null>(null);
  const minWidth = resizeOptions.minWidth ?? 280;
  const minHeight = resizeOptions.minHeight ?? 180;
  const style = useMemo(
    () =>
      ({
        "--floating-panel-x": `${position.x}px`,
        "--floating-panel-y": `${position.y}px`,
        "--floating-panel-width": `${size.width}px`,
        "--floating-panel-height": `${size.height}px`
      }) as CSSProperties,
    [position, size]
  );

  const releaseDrag = (drag: FloatingPanelDrag) => {
    try {
      drag.handle.releasePointerCapture(drag.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const updateDragPosition = (drag: FloatingPanelDrag, clientX: number, clientY: number) => {
    setPosition({
      x: clampFloatingPanel(drag.startX + clientX - drag.startClientX, drag.maxX),
      y: clampFloatingPanel(drag.startY + clientY - drag.startClientY, drag.maxY)
    });
  };

  const releaseResize = (resize: FloatingPanelResize) => {
    try {
      resize.handle.releasePointerCapture(resize.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const updateResizeSize = (resize: FloatingPanelResize, clientX: number, clientY: number) => {
    setSize({
      width: clampFloatingPanelSize(resize.startWidth + clientX - resize.startClientX, resize.minWidth, resize.maxWidth),
      height: clampFloatingPanelSize(resize.startHeight + clientY - resize.startClientY, resize.minHeight, resize.maxHeight)
    });
  };

  const endCurrentDrag = (event?: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (event && drag.pointerId !== event.pointerId) return;
    if (event) updateDragPosition(drag, event.clientX, event.clientY);
    dragRef.current = null;
    releaseDrag(drag);
  };

  const endCurrentResize = (event?: PointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    if (event && resize.pointerId !== event.pointerId) return;
    if (event) updateResizeSize(resize, event.clientX, event.clientY);
    resizeRef.current = null;
    releaseResize(resize);
  };

  useEffect(() => {
    const endWindowPointer = (event: PointerEvent) => {
      endCurrentDrag(event);
      endCurrentResize(event);
    };
    const cancelWindowPointer = (event: PointerEvent) => {
      endCurrentDrag(event);
      endCurrentResize(event);
    };
    const endPointerOnBlur = () => {
      endCurrentDrag();
      endCurrentResize();
    };
    window.addEventListener("pointerup", endWindowPointer);
    window.addEventListener("pointercancel", cancelWindowPointer);
    window.addEventListener("blur", endPointerOnBlur);
    return () => {
      window.removeEventListener("pointerup", endWindowPointer);
      window.removeEventListener("pointercancel", cancelWindowPointer);
      window.removeEventListener("blur", endPointerOnBlur);
    };
  }, []);

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateDragPosition(drag, event.clientX, event.clientY);
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const endResize = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    updateResizeSize(resize, event.clientX, event.clientY);
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLElement>, deltaWidth: number, deltaHeight: number) => {
    const panel = event.currentTarget.closest<HTMLElement>(".movable-panel");
    if (!panel) return;
    const container = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : document.documentElement;
    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const maxWidth = containerRect.right - panelRect.left - 8;
    const maxHeight = containerRect.bottom - panelRect.top - 8;
    setSize((current) => ({
      width: clampFloatingPanelSize(current.width + deltaWidth, minWidth, maxWidth),
      height: clampFloatingPanelSize(current.height + deltaHeight, minHeight, maxHeight)
    }));
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleCollapsed = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(floatingPanelInteractiveSelector)) return;
    if (dragRef.current || resizeRef.current) return;
    setCollapsed((current) => !current);
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    style,
    collapsed,
    panelProps: {
      "data-floating-panel-collapsed": collapsed ? "true" : undefined
    },
    dragHandleProps: {
      onDoubleClick: toggleCollapsed,
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(floatingPanelInteractiveSelector)) return;
        const panel = event.currentTarget.closest<HTMLElement>(".movable-panel");
        if (!panel) return;
        const container = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : document.documentElement;
        const panelRect = panel.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        dragRef.current = {
          pointerId: event.pointerId,
          handle: event.currentTarget,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: panelRect.left - containerRect.left,
          startY: panelRect.top - containerRect.top,
          maxX: containerRect.width - 48,
          maxY: containerRect.height - 48
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (event.buttons === 0) {
          endDrag(event);
          return;
        }
        updateDragPosition(drag, event.clientX, event.clientY);
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag
    },
    resizeHandleProps: {
      onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
        const step = event.shiftKey ? 48 : 16;
        if (event.key === "ArrowRight") resizeByKeyboard(event, step, 0);
        else if (event.key === "ArrowLeft") resizeByKeyboard(event, -step, 0);
        else if (event.key === "ArrowDown") resizeByKeyboard(event, 0, step);
        else if (event.key === "ArrowUp") resizeByKeyboard(event, 0, -step);
      },
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        const panel = event.currentTarget.closest<HTMLElement>(".movable-panel");
        if (!panel) return;
        const container = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : document.documentElement;
        const panelRect = panel.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        dragRef.current = null;
        resizeRef.current = {
          pointerId: event.pointerId,
          handle: event.currentTarget,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startWidth: panelRect.width,
          startHeight: panelRect.height,
          minWidth,
          minHeight,
          maxWidth: containerRect.right - panelRect.left - 8,
          maxHeight: containerRect.bottom - panelRect.top - 8
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const resize = resizeRef.current;
        if (!resize || resize.pointerId !== event.pointerId) return;
        if (event.buttons === 0) {
          endResize(event);
          return;
        }
        updateResizeSize(resize, event.clientX, event.clientY);
      },
      onPointerUp: endResize,
      onPointerCancel: endResize
    }
  };
}
