import { randomUUID } from "node:crypto";
import { expect, test as base } from "@playwright/test";
import type { Scene } from "../../packages/core/src/types.js";

const api = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}/api/v1`;
const gm = { "x-user-id": "usr_demo_gm" };
const mutation = () => ({ ...gm, "idempotency-key": randomUUID() });

// A GM can inspect any scene. Players can only join the active scene,
// which earlier browser journeys may have changed.
export const test = base.extend<{ activeTestScene: Scene }>({
  activeTestScene: async ({ request }, use) => {
    const campaignUrl = `${api}/campaigns/camp_demo`;
    const scenes = await request.get(`${campaignUrl}/scenes`, { headers: gm });
    expect(scenes.ok()).toBe(true);
    const previous = (await scenes.json() as Scene[]).find((scene) => scene.active);
    const campaign = await request.get(campaignUrl, { headers: gm });
    expect(campaign.ok()).toBe(true);
    const created = await request.post(`${campaignUrl}/scenes`, {
      headers: mutation(),
      data: { name: `Test table ${randomUUID().slice(0, 8)}`, width: 800, height: 600, gridType: "square", gridSize: 50, active: true, expectedUpdatedAt: (await campaign.json()).updatedAt },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const scene = await created.json() as Scene;
    try {
      await use(scene);
    } finally {
      if (previous) {
        const url = `${api}/scenes/${previous.id}`;
        const current = await request.get(url, { headers: gm });
        expect(current.ok()).toBe(true);
        const restored = await request.patch(url, { headers: mutation(), data: { active: true, expectedUpdatedAt: (await current.json()).updatedAt } });
        expect(restored.ok(), await restored.text()).toBe(true);
      }
      const url = `${api}/scenes/${scene.id}`;
      const current = await request.get(url, { headers: gm });
      expect(current.ok()).toBe(true);
      const removed = await request.delete(url, { headers: mutation(), params: { expectedUpdatedAt: (await current.json()).updatedAt } });
      expect(removed.ok(), await removed.text()).toBe(true);
    }
  },
});
