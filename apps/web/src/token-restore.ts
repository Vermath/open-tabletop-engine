import type { Token } from "@open-tabletop/core";

export function tokenRestorePayload(token: Token): Partial<Token> {
  return {
    id: token.id,
    actorId: token.actorId,
    name: token.name,
    x: token.x,
    y: token.y,
    width: token.width,
    height: token.height,
    rotation: token.rotation,
    elevation: token.elevation,
    layer: token.layer,
    hidden: token.hidden,
    locked: token.locked,
    visionEnabled: token.visionEnabled,
    visionRadius: token.visionRadius,
    brightVisionRadius: token.brightVisionRadius,
    dimVisionRadius: token.dimVisionRadius,
    senses: token.senses,
    disposition: token.disposition,
    imageAssetId: token.imageAssetId,
    ownerUserIds: token.ownerUserIds,
    notes: token.notes,
    conditions: token.conditions,
    auras: token.auras,
    metadata: token.metadata
  };
}
