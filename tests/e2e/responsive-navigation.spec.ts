import { expect, test, type Locator } from "@playwright/test";

async function expectUnclippedLabels(controls: Locator) {
  const clipped = await controls.evaluateAll((elements) => elements.flatMap((element) => {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return [];
    const label = element.getAttribute("aria-label") ?? element.textContent?.trim();
    if (element.scrollWidth > element.clientWidth + 1) return [{ label, reason: "horizontal overflow" }];
    const textNodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (textNodes.nextNode()) {
      const text = textNodes.currentNode;
      if (!text.textContent?.trim() || !text.parentElement) continue;
      const style = getComputedStyle(text.parentElement);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.fontSize) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const textBox of range.getClientRects()) {
        if (textBox.width && (textBox.left < box.left - 1 || textBox.right > box.right + 1 || textBox.top < box.top - 1 || textBox.bottom > box.bottom + 1)) {
          return [{ label, reason: "text outside button" }];
        }
      }
    }
    return [];
  }));
  expect(clipped).toEqual([]);
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1280, height: 900 },
]) {
  test(`navigation labels fit and remain reachable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Demo GM", exact: true }).click();
    const tabs = page.getByRole("tablist", { name: "Inspector panels" });
    await expect(tabs.getByRole("tab")).toHaveCount(7);
    await expectUnclippedLabels(tabs.getByRole("tab"));
    if (viewport.width <= 640) {
      const railControls = page.locator(".workspace-mode-switcher button, .rail > .ai-agent-toggle");
      await expectUnclippedLabels(railControls);
      const unreachable = await railControls.evaluateAll((controls) => controls.flatMap((control) => {
        const box = control.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return box.width < 44 || box.height < 44 || box.left < 0 || box.right > innerWidth || !hit || !control.contains(hit)
          ? [control.getAttribute("aria-label")]
          : [];
      }));
      expect(unreachable).toEqual([]);
    }
    await tabs.getByRole("tab", { name: "Actors", exact: true }).focus();
    await page.keyboard.press("End");
    await expect(tabs.getByRole("tab", { name: "Combat", exact: true })).toBeFocused();
    await tabs.getByRole("tab", { name: "Chat", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Chat message", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("long connection errors wrap on a phone and can be retried", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/api/v1/health", (route) => route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ message: `API source fingerprint mismatch: sha256:${"a".repeat(64)}. Restart the API from this checkout.` }),
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "API connection required" })).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry campaign load" });
  await retry.scrollIntoViewIfNeeded();
  await expectUnclippedLabels(retry);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.unroute("**/api/v1/health");
  await retry.click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});