import { expect, test, type Page } from "@playwright/test";

test("the campaign loading shell settles below 0.05 cumulative layout shift", async ({ page }) => {
  let releaseSnapshot!: () => void;
  const pendingSnapshot = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
  await page.route("**/api/v1/campaigns/*/snapshot*", async (route) => {
    await pendingSnapshot;
    await route.continue();
  });

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Demo GM", exact: true }).click();
    const loading = page.locator(".workspace-loading");
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading.getByRole("heading", { name: "Loading campaign" })).toBeVisible();
    await page.evaluate(() => {
      const shifts: Array<{ value: number; targets: Array<string | undefined> }> = [];
      Object.defineProperty(window, "campaignLoadingLayoutShift", { get: () => shifts });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean; sources: Array<{ node: Node | null }> };
          if (!shift.hadRecentInput) shifts.push({ value: shift.value, targets: shift.sources.map(({ node }) => node instanceof Element ? node.getAttribute("class") ?? node.tagName : node?.parentElement?.className) });
        }
      }).observe({ type: "layout-shift" });
    });
    // Wait past the user-input exclusion window so this measures the swap itself.
    await page.waitForTimeout(600);
    releaseSnapshot();
    await expect(loading).toHaveCount(0);
    await expect(page.locator(".scene-viewport")).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const shifts = await page.evaluate(() => Reflect.get(window, "campaignLoadingLayoutShift") as Array<{ value: number; targets: string[] }>);
    expect(shifts.reduce((total, entry) => total + entry.value, 0), JSON.stringify(shifts)).toBeLessThan(0.05);
  } finally {
    releaseSnapshot();
  }
});

const apiBase = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBase = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;

async function gmApi<T>(page: Page, method: "GET" | "POST" | "PATCH", path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(apiBase + path, {
    method, data,
    headers: { authorization: "Bearer otte-cookie-session", origin: webBase, "idempotency-key": crypto.randomUUID() }
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

async function sceneSwitchFixture(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const campaign = await gmApi<{ updatedAt: string }>(page, "GET", "/api/v1/campaigns/camp_demo");
  const scene = await gmApi<{ id: string; name: string }>(page, "POST", "/api/v1/campaigns/camp_demo/scenes", {
    name: "Switch target " + crypto.randomUUID().slice(0, 8), expectedUpdatedAt: campaign.updatedAt
  });
  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const target = page.locator(".scene-tabs button.scene-tab").filter({ hasText: scene.name });
  const path = /\/api\/v1\/campaigns\/camp_demo\/snapshot/;
  let release!: () => void;
  let observed!: () => void;
  let requests = 0;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { observed = resolve; });
  await page.route(path, async (route) => {
    if (new URL(route.request().url()).searchParams.get("sceneId") !== scene.id) return route.continue();
    if (requests++ > 0) return route.continue();
    observed();
    await pending;
    await route.continue();
  });
  return { scene, target, started, release, requests: () => requests };
}

test("scene switching retries when a realtime token edit supersedes the pending snapshot", async ({ page }) => {
  const { target, scene, started, release, requests } = await sceneSwitchFixture(page);
  try {
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    const piece = page.locator('[data-token-id="tok_valen"]');
    await expect(piece).toBeVisible();
    const priorPosition = await piece.evaluate((element) => (element as HTMLElement).style.left);
    await target.click();
    await started;
    const [token] = await gmApi<Array<{ id: string; x: number; updatedAt: string }>>(page, "GET", "/api/v1/scenes/scn_vault_entry/tokens");
    expect(token?.id).toBe("tok_valen");
    await gmApi(page, "PATCH", "/api/v1/tokens/tok_valen", { x: token!.x + 25, expectedUpdatedAt: token!.updatedAt });
    await expect.poll(() => piece.evaluate((element) => (element as HTMLElement).style.left)).not.toBe(priorPosition);
    release();
    await expect(page.getByRole("group", { name: scene.name + " interactive battle map" })).toBeVisible();
    expect(requests()).toBeGreaterThanOrEqual(2);
  } finally {
    release();
  }
});

test("a scene draft edited while the destination loads stays on the original scene", async ({ page }) => {
  const { target, started, release } = await sceneSwitchFixture(page);
  try {
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    const manager = page.getByRole("region", { name: "Manage workspace panel" });
    await manager.locator(".manage-category-button", { hasText: "Scenes" }).click();
    const editName = page.getByRole("textbox", { name: "Edit scene name" });
    await expect(editName).toHaveValue("Vault Entry");
    await target.click();
    await started;
    await editName.fill("Vault Entry work in progress");
    release();
    await expect(page.getByText("Save or discard scene changes before switching scenes", { exact: true }).first()).toBeVisible();
    await expect(editName).toHaveValue("Vault Entry work in progress");
  } finally {
    release();
  }
});

test("a search result opens the requested scene across worlds", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const campaignPath = "/api/v1/campaigns/camp_demo";
  const revision = async () => (await gmApi<{ updatedAt: string }>(page, "GET", campaignPath)).updatedAt;
  const world = await gmApi<{ id: string }>(page, "POST", campaignPath + "/worlds", {
    name: "Other world " + crypto.randomUUID().slice(0, 8), expectedUpdatedAt: await revision()
  });
  await gmApi(page, "POST", campaignPath + "/scenes", {
    name: "First scene in other world", worldId: world.id, expectedUpdatedAt: await revision()
  });
  const destination = await gmApi<{ id: string; name: string }>(page, "POST", campaignPath + "/scenes", {
    name: "Hidden Harbor " + crypto.randomUUID().slice(0, 8), worldId: world.id, expectedUpdatedAt: await revision()
  });
  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/campaigns/camp_demo/snapshot*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("sceneId") === destination.id) await pending;
    await route.continue();
  });
  try {
    await page.getByRole("tab", { name: "Search", exact: true }).click();
    const search = page.getByRole("region", { name: "Campaign Search" });
    await search.getByRole("textbox", { name: "Search this campaign" }).fill(destination.name);
    await search.getByRole("button", { name: new RegExp(destination.name) }).click();
    await expect(page.getByRole("progressbar", { name: "Loading selected scene" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Vault Entry interactive battle map" })).toBeVisible();
    release();
    await expect(page.getByRole("group", { name: destination.name + " interactive battle map" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Loading selected scene" })).toHaveCount(0);
  } finally {
    release();
  }
});

test("the empty saved-encounter action is disabled during the first save", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const campaign = await gmApi<{ name: string }>(page, "POST", "/api/v1/campaigns", {
    name: "Encounter test " + crypto.randomUUID().slice(0, 8)
  });
  await page.reload();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await page.locator("details.campaign-switcher > summary").click();
  await page.getByRole("navigation", { name: "Campaigns" }).getByRole("button", { name: campaign.name, exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText(campaign.name);
  await page.getByRole("button", { name: "Open command palette" }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("textbox", { name: "Command palette search" }).fill("Open Encounter Builder");
  await palette.getByRole("option", { name: /Open Encounter Builder/ }).click();
  const dialog = page.getByRole("dialog", { name: "Encounter builder" });
  const startEncounter = dialog.getByRole("button", { name: "Start an encounter" });
  await expect(startEncounter).toBeEnabled();
  await dialog.getByRole("textbox", { name: "Encounter name" }).fill("First saved encounter");
  await dialog.getByRole("textbox", { name: "Search encounter threats" }).fill("Goblin");
  const goblin = dialog.locator("article.encounter-threat").filter({ hasText: "Goblin" }).first();
  await goblin.getByRole("button", { name: "Add" }).click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/encounter-plan", async (route) => {
    if (route.request().postDataJSON()?.createEncounter) await pending;
    await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "Save encounter", exact: true }).click();
    await expect(startEncounter).toBeDisabled();
    release();
    await expect(dialog.getByRole("region", { name: "Saved encounters" })).toContainText("First saved encounter");
  } finally {
    release();
  }
});
