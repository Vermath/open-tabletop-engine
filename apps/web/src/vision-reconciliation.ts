import type { VisionSnapshot } from "@open-tabletop/core";
import { useSyncExternalStore } from "react";
import { sameSnapshotValue } from "./realtime-snapshot-delta.js";

export function createVisionReconciliation() {
  let update: { baseline: VisionSnapshot; vision: VisionSnapshot } | undefined;
  const listeners = new Set<() => void>();

  function read(baseline: VisionSnapshot | undefined, sceneId: string | undefined, userId: string) {
    // A full snapshot supersedes any narrow update against its predecessor.
    const vision = update && update.baseline === baseline ? update.vision : baseline;
    return vision?.sceneId === sceneId && vision?.userId === userId ? vision : undefined;
  }

  return {
    read,
    publish(baseline: VisionSnapshot, vision: VisionSnapshot) {
      if (baseline.sceneId !== vision.sceneId || baseline.userId !== vision.userId) return;
      if (sameSnapshotValue(read(baseline, vision.sceneId, vision.userId), vision)) return;
      update = { baseline, vision };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type VisionReconciliation = ReturnType<typeof createVisionReconciliation>;

export function useReconciledVision<T>(
  store: VisionReconciliation,
  baseline: VisionSnapshot | undefined,
  sceneId: string | undefined,
  userId: string,
  select: (vision: VisionSnapshot | undefined) => T
): T {
  const getSnapshot = () => select(store.read(baseline, sceneId, userId));
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
