import { describe, expect, it } from "vitest";

import { activeSceneAnnotations, annotationIsExpired, nextAnnotationExpiryMs } from "./annotation-expiry.js";

describe("annotation expiry", () => {
  const nowMs = Date.parse("2026-05-25T15:00:00.000Z");

  it("keeps persistent, future, and invalid expiry annotations active", () => {
    const annotations = [
      { id: "persistent" },
      { id: "future", expiresAt: "2026-05-25T15:00:05.000Z" },
      { id: "invalid", expiresAt: "not-a-date" }
    ];

    expect(activeSceneAnnotations(annotations, nowMs).map((annotation) => annotation.id)).toEqual(["persistent", "future", "invalid"]);
  });

  it("filters annotations once their expiry reaches the current clock time", () => {
    const annotations = [
      { id: "expired", expiresAt: "2026-05-25T14:59:59.999Z" },
      { id: "at-now", expiresAt: "2026-05-25T15:00:00.000Z" },
      { id: "future", expiresAt: "2026-05-25T15:00:00.001Z" }
    ];

    expect(annotationIsExpired(annotations[0]!, nowMs)).toBe(true);
    expect(annotationIsExpired(annotations[1]!, nowMs)).toBe(true);
    expect(activeSceneAnnotations(annotations, nowMs).map((annotation) => annotation.id)).toEqual(["future"]);
  });

  it("returns the next pending expiry and ignores expired or invalid values", () => {
    expect(
      nextAnnotationExpiryMs(
        [
          { expiresAt: "2026-05-25T14:59:59.000Z" },
          { expiresAt: "not-a-date" },
          { expiresAt: "2026-05-25T15:00:04.000Z" },
          { expiresAt: "2026-05-25T15:00:02.000Z" }
        ],
        nowMs
      )
    ).toBe(Date.parse("2026-05-25T15:00:02.000Z"));

    expect(nextAnnotationExpiryMs([{ expiresAt: "2026-05-25T14:59:59.000Z" }, { expiresAt: "not-a-date" }], nowMs)).toBeUndefined();
  });
});
