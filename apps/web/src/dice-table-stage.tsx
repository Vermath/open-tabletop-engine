import { useLayoutEffect, useRef } from "react";
import { diceBoxContainerId } from "./dice-box-stage.js";
import type { DiceCastPlan } from "./dice-3d.js";
import { DiceCastOverlay } from "./tabletop-overlays.js";
import "./dice-table-stage.css";

export function DiceTableStage({ casts }: { casts: DiceCastPlan[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!stage || !workspace) return;
    let target: HTMLElement | undefined;
    const resize = new ResizeObserver(update);
    const changes = new MutationObserver(update);
    function update() {
      const board = workspace!.querySelector<HTMLElement>(".scene-viewport");
      const next = board?.getClientRects().length ? board : workspace!;
      if (next !== target) {
        if (target) resize.unobserve(target);
        resize.observe(next);
        target = next;
      }
      const rect = next.getBoundingClientRect();
      Object.assign(stage!.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
    }
    update();
    changes.observe(workspace, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      resize.disconnect();
      changes.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="dice-table-stage" ref={stageRef} aria-hidden="true">
      <div className="dice-box-stage" id={diceBoxContainerId} />
      {casts.length > 0 && <DiceCastOverlay casts={casts} />}
    </div>
  );
}
