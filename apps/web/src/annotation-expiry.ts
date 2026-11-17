import type { SceneAnnotation } from "@open-tabletop/core";

type ExpiringAnnotation = Pick<SceneAnnotation, "expiresAt">;

export function annotationIsExpired(annotation: ExpiringAnnotation, nowMs = Date.now()): boolean {
  if (!annotation.expiresAt) return false;
  const expiresAt = Date.parse(annotation.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

export function activeSceneAnnotations<T extends ExpiringAnnotation>(annotations: readonly T[] | undefined, nowMs = Date.now()): T[] {
  return (annotations ?? []).filter((annotation) => !annotationIsExpired(annotation, nowMs));
}

export function nextAnnotationExpiryMs(annotations: readonly ExpiringAnnotation[] | undefined, nowMs = Date.now()): number | undefined {
  let nextExpiry: number | undefined;

  for (const annotation of annotations ?? []) {
    if (!annotation.expiresAt) continue;
    const expiresAt = Date.parse(annotation.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) continue;
    nextExpiry = nextExpiry === undefined ? expiresAt : Math.min(nextExpiry, expiresAt);
  }

  return nextExpiry;
}
