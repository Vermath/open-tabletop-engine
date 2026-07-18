import { expect, test, type Locator, type Page } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${Number(process.env.OTTE_E2E_API_PORT ?? 4100)}`;

async function loginDemoGm(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "gm@example.test" }),
    });
    if (!response.ok) throw new Error(await response.text());
    const login = await response.json() as { user: { id: string } };
    localStorage.setItem("otte:userId", login.user.id);
    localStorage.setItem("otte:sessionTransport", "cookie");
  }, apiBaseUrl);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
}

async function openScenes(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await panel.locator(".manage-category-button", { hasText: "Scenes" }).click();
  await expect(panel.getByText("Scene Manager", { exact: true })).toBeVisible();
  return panel;
}

async function newSceneForm(panel: Locator): Promise<Locator> {
  const details = panel.locator("details.create-drawer", { hasText: "New scene" });
  await details.evaluate((element) => { (element as HTMLDetailsElement).open = true; });
  return details.locator("form");
}

async function closeManage(panel: Locator): Promise<void> {
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toBeHidden();
}

test("GM creates, reloads, and plays on gridless and square scenes", async ({ page }) => {
  await loginDemoGm(page);
  let panel = await openScenes(page);
  let form = await newSceneForm(panel);
  await form.getByRole("textbox", { name: "Scene name" }).fill("Gridless E2E Field");
  await form.getByRole("combobox", { name: "Scene grid type" }).selectOption("gridless");
  await expect(form.getByRole("spinbutton", { name: "Scene grid size" })).toHaveCount(0);
  await expect(form.locator(".scene-size-presets")).toHaveCount(0);
  await expect(form.getByRole("note")).toContainText("Distance, reach, and area placement require a manual ruling");
  await form.locator('input[type="checkbox"]').check();
  const gridlessCreate = page.waitForResponse((response) => response.request().method() === "POST" && /\/campaigns\/camp_demo\/scenes$/.test(response.url()));
  await form.getByRole("button", { name: "Add Scene" }).click();
  const gridlessResponse = await gridlessCreate;
  expect(gridlessResponse.status()).toBe(200);
  expect((await gridlessResponse.json() as { active: boolean }).active).toBe(true);

  await page.reload();
  panel = await openScenes(page);
  await expect(panel.getByRole("combobox", { name: "Edit scene grid type" })).toHaveValue("gridless");
  await expect(panel.getByRole("spinbutton", { name: "Edit scene grid size" })).toHaveCount(0);
  await expect(panel.getByRole("note")).toContainText("free token placement");
  await closeManage(panel);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calibrate grid" })).toHaveCount(0);

  const quickCreate = page.locator("form.quick-create-form");
  if (!(await quickCreate.getByRole("textbox", { name: "Token name" }).isVisible())) {
    await page.getByRole("button", { name: "Token", exact: true }).click();
  }
  await quickCreate.getByRole("textbox", { name: "Token name" }).fill("Gridless Scout");
  const tokenCreate = page.waitForResponse((response) => response.request().method() === "POST" && /\/scenes\/[^/]+\/tokens$/.test(response.url()));
  await quickCreate.getByRole("button", { name: "Token", exact: true }).click();
  const tokenResponse = await tokenCreate;
  expect(tokenResponse.status()).toBe(200);
  const tokenRecord = await tokenResponse.json() as { id: string; x: number; y: number };
  const token = page.getByRole("button", { name: /token Gridless Scout$/ });
  await expect(token).toBeVisible();
  const box = await token.boundingBox();
  expect(box).toBeTruthy();
  const movedResponse = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/v1\/scenes\/[^/]+\/tokens\/move$/.test(response.url()));
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 37, box!.y + box!.height / 2 + 23, { steps: 5 });
  await page.mouse.up();
  const movedBatch = await (await movedResponse).json() as { tokens: Array<{ id: string; x: number; y: number }> };
  const moved = movedBatch.tokens.find((candidate) => candidate.id === tokenRecord.id);
  expect(moved).toBeTruthy();
  expect(moved!.x).not.toBe(tokenRecord.x);
  expect(moved!.x % 50 === 0 && moved!.y % 50 === 0).toBe(false);

  panel = await openScenes(page);
  form = await newSceneForm(panel);
  await form.getByRole("textbox", { name: "Scene name" }).fill("Square E2E Field");
  await form.getByRole("combobox", { name: "Scene grid type" }).selectOption("square");
  await expect(form.locator(".scene-size-presets")).toBeVisible();
  await form.getByRole("spinbutton", { name: "Scene grid size" }).fill("60");
  await form.locator('input[type="checkbox"]').check();
  const squareCreate = page.waitForResponse((response) => response.request().method() === "POST" && /\/campaigns\/camp_demo\/scenes$/.test(response.url()));
  await form.getByRole("button", { name: "Add Scene" }).click();
  const squareResponse = await squareCreate;
  expect(squareResponse.status()).toBe(200);
  expect((await squareResponse.json() as { active: boolean }).active).toBe(true);

  await page.reload();
  panel = await openScenes(page);
  await expect(panel.getByRole("combobox", { name: "Edit scene grid type" })).toHaveValue("square");
  await expect(panel.getByRole("spinbutton", { name: "Edit scene grid size" })).toHaveValue("60");
  await expect(panel.getByText("Show VTT grid overlay", { exact: true })).toBeVisible();
  await closeManage(panel);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calibrate grid" })).toBeVisible();
});
