import { seedState, type Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("gridless scene API", () => {
  it("round-trips both grid types with revisions, permissions, validation, and freeform annotations", async () => {
    const store = new MemoryStateStore(seedState());
    const app = await buildApp({ store });
    try {
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const deniedCreate = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scenes",
        headers: { ...playerHeaders, "idempotency-key": "gridless-create-denied" },
        payload: { name: "Denied gridless", gridType: "gridless", expectedUpdatedAt: campaign.updatedAt },
      });
      expect(deniedCreate.statusCode).toBe(403);

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scenes",
        headers: { ...gmHeaders, "idempotency-key": "gridless-create" },
        payload: { name: "Gridless Field", width: 1400, height: 900, gridType: "gridless", expectedUpdatedAt: campaign.updatedAt },
      });
      expect(created.statusCode).toBe(200);
      const gridless = created.json() as Scene;
      expect(gridless).toMatchObject({ gridType: "gridless", gridSize: 50, width: 1400, height: 900 });

      const listed = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/scenes", headers: gmHeaders });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: gridless.id, gridType: "gridless" })]));

      const invalid = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${gridless.id}`,
        headers: { ...gmHeaders, "idempotency-key": "gridless-invalid" },
        payload: { gridType: "hex", expectedUpdatedAt: gridless.updatedAt },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().message).toContain("allowed values");

      const squareResponse = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${gridless.id}`,
        headers: { ...gmHeaders, "idempotency-key": "gridless-to-square" },
        payload: { gridType: "square", gridSize: 64, expectedUpdatedAt: gridless.updatedAt },
      });
      expect(squareResponse.statusCode).toBe(200);
      const square = squareResponse.json() as Scene;
      expect(square).toMatchObject({ gridType: "square", gridSize: 64 });

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${gridless.id}`,
        headers: { ...gmHeaders, "idempotency-key": "gridless-stale" },
        payload: { gridType: "gridless", expectedUpdatedAt: gridless.updatedAt },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", resourceType: "scene", resourceId: gridless.id, currentUpdatedAt: square.updatedAt });

      const deniedEdit = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${gridless.id}`,
        headers: { ...playerHeaders, "idempotency-key": "gridless-edit-denied" },
        payload: { gridType: "gridless", expectedUpdatedAt: square.updatedAt },
      });
      expect(deniedEdit.statusCode).toBe(403);

      const backToGridless = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${gridless.id}`,
        headers: { ...gmHeaders, "idempotency-key": "square-to-gridless" },
        payload: { gridType: "gridless", expectedUpdatedAt: square.updatedAt },
      });
      expect(backToGridless.statusCode).toBe(200);
      const reopened = backToGridless.json() as Scene;
      expect(reopened).toMatchObject({ gridType: "gridless", gridSize: 64 });

      const annotated = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${gridless.id}/annotations`,
        headers: { ...gmHeaders, "idempotency-key": "gridless-freeform-template" },
        payload: { kind: "template", points: [{ x: 63, y: 87 }, { x: 119, y: 143 }], snapToGrid: true, expectedUpdatedAt: reopened.updatedAt },
      });
      expect(annotated.statusCode).toBe(200);
      expect((annotated.json() as Scene).annotations.at(-1)).toMatchObject({ snapToGrid: false, points: [{ x: 63, y: 87 }, { x: 119, y: 143 }] });

      const reloaded = await app.inject({ method: "GET", url: `/api/v1/scenes/${gridless.id}`, headers: gmHeaders });
      expect(reloaded.statusCode).toBe(200);
      expect(reloaded.json()).toMatchObject({ gridType: "gridless", gridSize: 64 });
    } finally {
      await app.close();
    }
  });
});
