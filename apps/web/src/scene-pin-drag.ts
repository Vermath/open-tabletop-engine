import type { SceneMapPin } from "@open-tabletop/core";

export const scenePinMime = "application/x-open-tabletop-lore";
export type PinTarget = Pick<SceneMapPin, "targetType" | "targetId">;

export function writePinDrag(transfer: DataTransfer, target: PinTarget) {
  transfer.effectAllowed = "copy";
  transfer.setData(scenePinMime, JSON.stringify(target));
}

export function readPinDrag(transfer: DataTransfer): PinTarget | undefined {
  if (!transfer.types.includes(scenePinMime)) return;
  try {
    const target = JSON.parse(transfer.getData(scenePinMime));
    if ((target?.targetType === "journal" || target?.targetType === "handout") && typeof target.targetId === "string") {
      return { targetType: target.targetType, targetId: target.targetId };
    }
  } catch {
    return;
  }
}
