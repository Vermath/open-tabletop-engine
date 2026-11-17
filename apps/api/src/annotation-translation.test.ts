import { type Scene, type VisionPoint } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function createFixture(input: {
  gridType?: Scene["gridType"];
  width?: number;
  snapToGrid?: boolean;
  kind?: "drawing" | "template";
  points?: VisionPoint[];
  radius?: number;
} = {}) {
  const store = new MemoryStateStore();
  const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
  Object.assign(scene, { width: input.width ?? 325, height: 200, gridSize: 50, gridType: input.gridType ?? "square", annotations: [] });
  const app = await buildApp({ store, rateLimit: { enabled: false } });
  apps.push(app);
  const created = await app.inject({
    method: "POST",
    url: `/api/v1/scenes/${scene.id}/annotations`,
    headers: { ...gmHeaders, "idempotency-key": "annotation-translation-create" },
    payload: {
      kind: input.kind ?? "drawing",
      points: input.points ?? [{ x: 200, y: 100 }, { x: 300, y: 100 }],
      snapToGrid: input.snapToGrid ?? true,
      radius: input.radius,
      expectedUpdatedAt: scene.updatedAt,
    },
  });
  expect(created.statusCode).toBe(200);
  const annotation = (created.json() as Scene).annotations[0]!;
  return { store, app, scene, annotation, url: `/api/v1/scenes/${scene.id}/annotations/${annotation.id}` };
}

async function moveAnnotation(fixture: Awaited<ReturnType<typeof createFixture>>, points: VisionPoint[], key = "annotation-translation-move") {
  const response = await fixture.app.inject({
    method: "PATCH",
    url: fixture.url,
    headers: { ...gmHeaders, "idempotency-key": key },
    payload: { points, expectedUpdatedAt: fixture.scene.updatedAt },
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as Scene).annotations.find((annotation) => annotation.id === fixture.annotation.id)!;
}

describe("annotation translation API", () => {
  it("preserves drawing geometry when snapping meets a scene edge between grid lines", async () => {
    const fixture = await createFixture();
    const expectedPoints = [{ x: 225, y: 100 }, { x: 325, y: 100 }];
    const moved = await moveAnnotation(fixture, expectedPoints);
    expect(moved.points).toEqual(expectedPoints);
    expect(fixture.scene.annotations[0]!.points).toEqual(expectedPoints);

    const reloaded = await fixture.app.inject({ method: "GET", url: `/api/v1/scenes/${fixture.scene.id}`, headers: gmHeaders });
    expect(reloaded.statusCode).toBe(200);
    expect((reloaded.json() as Scene).annotations[0]!.points).toEqual(expectedPoints);
  });

  it("keeps an edge-aligned drawing's off-grid coordinates while translating back by a grid step", async () => {
    const fixture = await createFixture();
    await moveAnnotation(fixture, [{ x: 225, y: 100 }, { x: 325, y: 100 }], "annotation-translation-to-edge");
    const moved = await moveAnnotation(fixture, [{ x: 175, y: 100 }, { x: 275, y: 100 }], "annotation-translation-from-edge");
    expect(moved.points).toEqual([{ x: 175, y: 100 }, { x: 275, y: 100 }]);
  });

  it.each(["left", "right"] as const)("preserves all residual grid offsets when reaching the %s edge", async (side) => {
    const fixture = await createFixture({ snapToGrid: false });
    for (let residual = 1; residual < 50; residual += 1) {
      const points = side === "left"
        ? [{ x: residual, y: 100 }, { x: residual + 100, y: 100 }]
        : [{ x: 225 - residual, y: 100 }, { x: 325 - residual, y: 100 }];
      const destination = side === "left"
        ? [{ x: 0, y: 100 }, { x: 100, y: 100 }]
        : [{ x: 225, y: 100 }, { x: 325, y: 100 }];
      const positioned = await fixture.app.inject({
        method: "PATCH",
        url: fixture.url,
        headers: { ...gmHeaders, "idempotency-key": `annotation-translation-position-${residual}` },
        payload: { points, snapToGrid: false, expectedUpdatedAt: fixture.scene.updatedAt },
      });
      expect(positioned.statusCode).toBe(200);
      expect((positioned.json() as Scene).annotations[0]!.points).toEqual(points);
      const enabledSnap = await fixture.app.inject({
        method: "PATCH",
        url: fixture.url,
        headers: { ...gmHeaders, "idempotency-key": `annotation-translation-enable-snap-${residual}` },
        payload: { snapToGrid: true, expectedUpdatedAt: fixture.scene.updatedAt },
      });
      expect(enabledSnap.statusCode).toBe(200);
      expect((enabledSnap.json() as Scene).annotations[0]!.points).toEqual(points);
      const moved = await moveAnnotation(fixture, destination, `annotation-translation-to-edge-${residual}`);
      expect(moved.points, `${side} edge with ${residual}px residual`).toEqual(destination);
    }
  });
  it("snaps a small rigid movement once without changing either endpoint", async () => {
    const fixture = await createFixture();
    const moved = await moveAnnotation(fixture, [{ x: 210, y: 110 }, { x: 310, y: 110 }]);
    expect(moved.points).toEqual(fixture.annotation.points);
  });

  it("caps an out-of-bounds rigid movement with one shared offset", async () => {
    const fixture = await createFixture();
    const moved = await moveAnnotation(fixture, [{ x: 300, y: 250 }, { x: 400, y: 250 }]);
    expect(moved.points).toEqual([{ x: 225, y: 200 }, { x: 325, y: 200 }]);
  });

  it("still snaps individual points when editing a drawing's shape", async () => {
    const fixture = await createFixture();
    const moved = await moveAnnotation(fixture, [{ x: 213, y: 87 }, { x: 278, y: 163 }]);
    expect(moved.points).toEqual([{ x: 200, y: 100 }, { x: 300, y: 150 }]);
  });

  it("preserves exact small translations in a gridless scene", async () => {
    const fixture = await createFixture({ gridType: "gridless" });
    const expectedPoints = [{ x: 210, y: 110 }, { x: 310, y: 110 }];
    const moved = await moveAnnotation(fixture, expectedPoints);
    expect(moved.points).toEqual(expectedPoints);
    expect(moved.snapToGrid).toBe(false);
  });

  it("preserves a circle's explicit radius when only its points are translated", async () => {
    const fixture = await createFixture({ kind: "template", points: [{ x: 100, y: 100 }, { x: 150, y: 100 }], radius: 70 });
    expect(fixture.annotation).toMatchObject({ templateShape: "circle", radius: 70 });
    const moved = await moveAnnotation(fixture, [{ x: 150, y: 100 }, { x: 200, y: 100 }]);
    expect(moved).toMatchObject({ radius: 70, points: [{ x: 150, y: 100 }, { x: 200, y: 100 }] });
  });

  it("retains permission, stale revision, and idempotency enforcement for translations", async () => {
    const fixture = await createFixture();
    const points = [{ x: 225, y: 100 }, { x: 325, y: 100 }];
    const before = structuredClone(fixture.scene.annotations[0]);
    const revision = fixture.scene.updatedAt;
    const denied = await fixture.app.inject({
      method: "PATCH",
      url: fixture.url,
      headers: { "x-user-id": "usr_demo_player", "idempotency-key": "annotation-translation-denied" },
      payload: { points, expectedUpdatedAt: revision },
    });
    expect(denied.statusCode).toBe(403);
    expect(fixture.scene.annotations[0]).toEqual(before);

    const stale = await fixture.app.inject({
      method: "PATCH",
      url: fixture.url,
      headers: { ...gmHeaders, "idempotency-key": "annotation-translation-stale" },
      payload: { points, expectedUpdatedAt: "1970-01-01T00:00:00.000Z" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "stale_write", resourceType: "scene" });
    expect(fixture.scene.annotations[0]).toEqual(before);

    const request = {
      method: "PATCH" as const,
      url: fixture.url,
      headers: { ...gmHeaders, "idempotency-key": "annotation-translation-replay" },
      payload: { points, expectedUpdatedAt: revision },
    };
    const moved = await fixture.app.inject(request);
    expect(moved.statusCode).toBe(200);
    const replay = await fixture.app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json()).toEqual(moved.json());
    expect(fixture.scene.annotations[0]!.points).toEqual(points);
  });
});
