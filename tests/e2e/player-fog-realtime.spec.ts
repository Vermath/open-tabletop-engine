import { expect, test, type Page } from "@playwright/test";
import type { Campaign, Scene } from "../../packages/core/src/types.js";

const apiOrigin = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webOrigin = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const campaignPath = "/api/v1/campaigns/camp_demo";

async function gmApi<T>(page: Page, method: "GET" | "POST" | "PATCH", path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(apiOrigin + path, {
    method,
    data,
    headers: { authorization: "Bearer otte-cookie-session", origin: webOrigin, "idempotency-key": crypto.randomUUID() }
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

test("changing manual fog updates the player's tokens without reloading the campaign", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const original = (await gmApi<Scene[]>(page, "GET", campaignPath + "/scenes")).find((scene) => scene.active);
  const campaign = await gmApi<Campaign>(page, "GET", campaignPath);
  const scene = await gmApi<Scene>(page, "POST", campaignPath + "/scenes", {
    name: "Realtime fog", width: 900, height: 700, gridSize: 50, expectedUpdatedAt: campaign.updatedAt
  });
  const path = "/api/v1/scenes/" + scene.id;
  const revise = async (url = path) => (await gmApi<Scene>(page, "GET", url)).updatedAt;
  await gmApi(page, "POST", path + "/tokens", { name: "Fog witness", x: 440, y: 350, expectedUpdatedAt: await revise() });
  await gmApi(page, "POST", path + "/tokens", { name: "Outside witness", x: 760, y: 350, expectedUpdatedAt: await revise() });
  await gmApi(page, "POST", path + "/fog", { x: 300, y: 375, radius: 215, mode: "reveal", expectedUpdatedAt: await revise() });
  const context = await browser.newContext({ baseURL: webOrigin, extraHTTPHeaders: { Origin: webOrigin } });
  try {
    await gmApi(page, "PATCH", path, { active: true, expectedUpdatedAt: await revise() });
    const player = await context.newPage();
    await player.goto("/");
    await player.evaluate(async (apiOrigin) => {
      const response = await fetch(apiOrigin + "/api/v1/auth/login", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "player@example.test" })
      });
      if (!response.ok) throw new Error(await response.text());
      const login = await response.json() as { user: { id: string } };
      localStorage.setItem("otte:userId", login.user.id);
      localStorage.setItem("otte:sessionTransport", "cookie");
    }, apiOrigin);
    await player.reload();
    const board = player.getByRole("group", { name: scene.name + " interactive battle map", exact: true });
    const witness = board.getByRole("button", { name: /token Fog witness$/ });
    const outside = board.getByRole("button", { name: /token Outside witness$/ });
    await expect(witness).toBeVisible();
    await expect(outside).toHaveCount(0);
    await expect(player.locator('.session-pulse[data-connection-state="connected"]')).toBeVisible();
    const requests: URL[] = [];
    player.on("request", (request) => requests.push(new URL(request.url())));
    for (const action of ["hide", "undo"] as const) {
      const response = player.waitForResponse((entry) => {
        const url = new URL(entry.url());
        return url.pathname === path + "/vision" && url.searchParams.get("includeTokens") === "true" && entry.ok();
      });
      void response.catch(() => undefined);
      if (action === "hide") {
        await gmApi(page, "POST", path + "/fog", { x: 465, y: 375, radius: 55, mode: "hide", expectedUpdatedAt: await revise() });
      } else {
        await gmApi(page, "POST", path + "/fog/undo", { expectedUpdatedAt: await revise() });
      }
      const { visibleTokens } = await (await response).json() as { visibleTokens: { name: string }[] };
      expect(visibleTokens.some(({ name }) => name === "Fog witness")).toBe(action === "undo");
      await expect(witness).toHaveCount(action === "hide" ? 0 : 1);
      await expect(outside).toHaveCount(0);
    }
    expect(requests.filter((url) => url.pathname.endsWith("/snapshot"))).toHaveLength(0);
  } finally {
    await context.close();
    if (original) {
      const originalPath = "/api/v1/scenes/" + original.id;
      await gmApi(page, "PATCH", originalPath, { active: true, expectedUpdatedAt: await revise(originalPath) });
    }
  }
});
