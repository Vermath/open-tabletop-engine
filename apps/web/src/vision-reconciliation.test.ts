import type { VisionSnapshot } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { createVisionReconciliation } from "./vision-reconciliation.js";

const baseline: VisionSnapshot = { sceneId: "scene", userId: "player", fogActive: true, polygons: [] };
const moved: VisionSnapshot = {
  ...baseline,
  polygons: [{ id: "polygon", source: "token", sourceId: "token", points: [{ x: 40, y: 20 }] }],
};

describe("live vision reconciliation", () => {
  it("publishes changed vision once and leaves an unchanged projection alone", () => {
    const store = createVisionReconciliation();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.publish(baseline, { ...baseline, polygons: [] });
    expect(listener).not.toHaveBeenCalled();
    store.publish(baseline, moved);
    store.publish(baseline, structuredClone(moved));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.read(baseline, "scene", "player")).toBe(moved);

    unsubscribe();
    store.publish(baseline, baseline);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps narrow updates scoped to their scene, user, and full snapshot", () => {
    const store = createVisionReconciliation();
    store.publish(baseline, { ...moved, userId: "gm" });
    expect(store.read(baseline, "scene", "player")).toBe(baseline);

    store.publish(baseline, moved);
    expect(store.read(baseline, "another scene", "player")).toBeUndefined();
    expect(store.read(baseline, "scene", "gm")).toBeUndefined();
    expect(store.read(undefined, "scene", "player")).toBeUndefined();
    const refreshed = structuredClone(baseline);
    expect(store.read(refreshed, "scene", "player")).toBe(refreshed);
  });
});
