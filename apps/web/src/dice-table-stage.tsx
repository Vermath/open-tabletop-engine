import { useLayoutEffect, useRef } from "react";
import { diceBoxContainerId } from "./dice-box-stage.js";
import type { DiceCastPlan } from "./dice-3d.js";
import { DiceCastOverlay } from "./tabletop-overlays.js";
import "./dice-table-stage.css";

export function DiceTableStage({ casts, boardId }: { casts: DiceCastPlan[]; boardId?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const workspace = stage?.parentElement?.querySelector<HTMLElement>(".workspace");
    if (!stage || !workspace) return;
    const board = boardId ? workspace.querySelector<HTMLElement>(".scene-viewport") : null;
    const target = board ?? workspace;
    let frame = 0;
    const update = () => {
      frame = 0;
      const { left, top, width, height } = target.getBoundingClientRect();
      Object.assign(stage.style, { left: left + "px", top: top + "px", width: width + "px", height: height + "px" });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    const resize = new ResizeObserver(schedule);
    resize.observe(target);
    if (target !== workspace) resize.observe(workspace);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [boardId]);
  return (
    <div className="dice-table-stage" ref={stageRef} aria-hidden="true">
      <div className="dice-box-stage" id={diceBoxContainerId} />
      {casts.length > 0 && <DiceCastOverlay casts={casts} />}
    </div>
  );
}
