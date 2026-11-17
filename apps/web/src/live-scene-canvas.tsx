import type { VisionSnapshot } from "@open-tabletop/core";
import type { ComponentProps } from "react";
import { memoWithEventProps } from "./memo-with-event-props.js";
import { MapLayerStack, SceneCanvas } from "./scene-canvas.js";
import { useReconciledVision, type VisionReconciliation } from "./vision-reconciliation.js";

const MemoizedSceneCanvas = memoWithEventProps(SceneCanvas);
const MemoizedMapLayerStack = memoWithEventProps(MapLayerStack);

interface LiveVisionProps {
  visionStore: VisionReconciliation;
  vision?: VisionSnapshot;
}

export function LiveSceneCanvas({ visionStore, vision, ...props }: ComponentProps<typeof SceneCanvas> & LiveVisionProps) {
  const reconciled = useReconciledVision(visionStore, vision, props.scene.id, props.boardCurrentUserId, (value) => value);
  return <MemoizedSceneCanvas {...props} vision={reconciled} />;
}

export function LiveMapLayerStack({ visionStore, vision, userId, ...props }: Omit<ComponentProps<typeof MapLayerStack>, "fogActive"> & LiveVisionProps & { userId: string }) {
  const fogActive = useReconciledVision(visionStore, vision, props.scene?.id, userId, (value) => value?.fogActive === true);
  return <MemoizedMapLayerStack {...props} fogActive={fogActive} />;
}
