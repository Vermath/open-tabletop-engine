import { expect, test } from "@playwright/test";

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
