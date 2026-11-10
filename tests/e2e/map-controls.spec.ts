import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function openDemoTable(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  const board = page.locator(".scene-board");
  await expect(board).toBeVisible();
  await (await board.elementHandle())!.waitForElementState("stable");
  return board;
}

/**
 * The token drawn on top at its own centre. Earlier tests in a run can leave tokens stacked on the seeded one,
 * and a real click only reaches whichever is on top.
 */
async function topmostToken(page: Page): Promise<Locator> {
  const board = page.locator(".scene-board");
  await expect(board.locator("button.token").first()).toBeVisible();
  const tokenId = await board.evaluate((element) => {
    const tokens = Array.from(element.querySelectorAll<HTMLElement>("button.token"));
    const top = tokens.find((token) => {
      const rect = token.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit !== null && token.contains(hit);
    });
    return top?.dataset.tokenId ?? null;
  });
  expect(tokenId).not.toBeNull();
  return page.locator(`.scene-board [data-token-id="${tokenId}"]`);
}

async function zoomPercent(page: Page): Promise<number> {
  return Number.parseInt((await page.locator(".map-zoom-value").innerText()).replace("%", ""), 10);
}

async function boardBox(board: Locator) {
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function viewportScroll(page: Page) {
  return page.locator(".scene-viewport").evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
}

/** Scrolls the wheel over a board point until the map is at least `target` percent. */
async function wheelZoomTo(page: Page, target: number) {
  for (let step = 0; step < 40 && (await zoomPercent(page)) < target; step += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(30);
  }
  expect(await zoomPercent(page)).toBeGreaterThanOrEqual(target);
}

test("plain wheel zooms the map around the pointer", async ({ page }) => {
  const board = await openDemoTable(page);
  expect(await zoomPercent(page)).toBe(100);
  const fitted = await boardBox(board);
  const pointer = { x: fitted.x + 0.42 * fitted.width, y: fitted.y + 0.46 * fitted.height };
  await page.mouse.move(pointer.x, pointer.y);

  // While the whole map fits it stays centred, so anchoring starts once it overflows the view.
  await wheelZoomTo(page, 200);
  await (await board.elementHandle())!.waitForElementState("stable");
  const before = await boardBox(board);
  expect(before.width).toBeGreaterThan(fitted.width * 1.9);
  const fraction = { u: (pointer.x - before.x) / before.width, v: (pointer.y - before.y) / before.height };

  // Past the old 200% ceiling: the board point under the pointer stays under it.
  await wheelZoomTo(page, 400);
  await (await board.elementHandle())!.waitForElementState("stable");
  const after = await boardBox(board);
  expect(after.width).toBeGreaterThan(before.width * 1.9);
  expect(Math.abs(after.x + fraction.u * after.width - pointer.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(after.y + fraction.v * after.height - pointer.y)).toBeLessThanOrEqual(3);

  for (let step = 0; step < 40 && (await zoomPercent(page)) > 100; step += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(30);
  }
  expect(await zoomPercent(page)).toBeLessThanOrEqual(100);
});

test("Shift+wheel scrolls instead of zooming", async ({ page }) => {
  const board = await openDemoTable(page);
  const box = await boardBox(board);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -360);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(100);
  expect(await zoomPercent(page)).toBe(100);
});

test("right-drag pans the map without opening the token menu", async ({ page }) => {
  const board = await openDemoTable(page);
  const box = await boardBox(board);
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await wheelZoomTo(page, 250);
  await (await board.elementHandle())!.waitForElementState("stable");

  const before = await viewportScroll(page);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(centre.x - 140, centre.y - 90, { steps: 6 });
  await page.mouse.up({ button: "right" });
  const after = await viewportScroll(page);
  expect(after.left - before.left).toBeGreaterThanOrEqual(130);
  expect(after.top - before.top).toBeGreaterThanOrEqual(80);
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Left-drag on empty board still draws a selection box rather than panning.
  const scrollBeforeSelect = await viewportScroll(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 60, centre.y + 40, { steps: 4 });
  await page.mouse.up();
  expect(await viewportScroll(page)).toEqual(scrollBeforeSelect);
});

test("right-click opens a token menu that replaces the hidden layer shortcut", async ({ page }) => {
  await openDemoTable(page);
  const token = await topmostToken(page);
  await expect(token).toBeVisible();
  const originalLabel = await token.getAttribute("aria-label");
  expect(originalLabel).toBeTruthy();

  // A token whose turn it is pulses, so skip the wait for a still target; a person can right-click it regardless.
  await token.click({ button: "right", force: true });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Show in inspector" })).toBeFocused();
  // Right-click alone no longer changes the token.
  expect(await token.getAttribute("aria-label")).toBe(originalLabel);

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(token).toBeFocused();

  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await page.keyboard.press("Shift+Tab");
  await expect(token).toBeFocused();

  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await page.keyboard.press("Tab");
  await expect(token).toBeFocused();

  // Keyboard users reach the same menu through the context-menu key.
  await token.dispatchEvent("contextmenu", { button: 0, bubbles: true, cancelable: true });
  await expect(menu).toBeVisible();
  const layerAction = menu.getByRole("menuitem", { name: /^Move to / });
  await expect(layerAction).toBeVisible();
  const tokenId = await token.getAttribute("data-token-id");
  await layerAction.click();
  await expect(menu).toHaveCount(0);
  const sameToken = page.locator(`.scene-board [data-token-id="${tokenId}"]`);
  await expect.poll(() => sameToken.getAttribute("aria-label")).not.toBe(originalLabel);

  // Put the token back on its original layer so later tests see the seeded scene.
  for (let attempt = 0; attempt < 4 && (await sameToken.getAttribute("aria-label")) !== originalLabel; attempt += 1) {
    const current = await sameToken.getAttribute("aria-label");
    await sameToken.dispatchEvent("contextmenu", { button: 0, bubbles: true, cancelable: true });
    await menu.getByRole("menuitem", { name: /^Move to / }).click();
    await expect.poll(() => sameToken.getAttribute("aria-label")).not.toBe(current);
  }
  expect(await sameToken.getAttribute("aria-label")).toBe(originalLabel);
});

test("every wall on a scene shares one drawing layer", async ({ page }) => {
  await openDemoTable(page);
  const layers = page.locator(".scene-board svg.wall-layer");
  await expect(layers).toHaveCount(1);
  expect(await layers.locator("line").count()).toBeGreaterThan(0);
});

test("toolbar zoom-out preserves the view centre near both scroll limits", async ({ page }) => {
  const board = await openDemoTable(page);
  const box = await boardBox(board);
  await board.click({ position: { x: box.width * 0.85, y: box.height * 0.85 } });
  await expect(board.locator(".token.selected")).toHaveCount(0);
  for (let step = 0; step < 12; step += 1) await page.getByRole("button", { name: "Zoom battle map in", exact: true }).click();
  expect(await zoomPercent(page)).toBe(400);
  const viewport = page.locator(".scene-viewport");
  await viewport.evaluate((element) => {
    element.scrollLeft = element.scrollWidth - element.clientWidth - 40;
    element.scrollTop = element.scrollHeight - element.clientHeight - 40;
  });
  // Let the real scroll event record the position before the toolbar changes layout.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const before = await viewport.evaluate((element) => {
    const board = element.querySelector<HTMLElement>(".scene-board")!;
    return { u: (element.scrollLeft + element.clientWidth / 2 - board.offsetLeft) / board.offsetWidth, v: (element.scrollTop + element.clientHeight / 2 - board.offsetTop) / board.offsetHeight };
  });
  await page.getByRole("button", { name: "Zoom battle map out", exact: true }).click();
  expect(await zoomPercent(page)).toBe(375);
  await expect.poll(() => viewport.evaluate((element, centre) => {
    const board = element.querySelector<HTMLElement>(".scene-board")!;
    const expectedX = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, board.offsetLeft + centre.u * board.offsetWidth - element.clientWidth / 2));
    const expectedY = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, board.offsetTop + centre.v * board.offsetHeight - element.clientHeight / 2));
    return Math.max(Math.abs(element.scrollLeft - expectedX), Math.abs(element.scrollTop - expectedY));
  }, before)).toBeLessThanOrEqual(2);
});

test.describe("touch map gestures", () => {
  test.use({ hasTouch: true });

  test("a pinch starting on empty board zooms the map without native page gestures", async ({ page }) => {
    const board = await openDemoTable(page);
    const box = await boardBox(board);
    const centre = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.7 };
    const session = await page.context().newCDPSession(page);
    await page.evaluate(() => {
      document.querySelector(".scene-viewport")!.addEventListener("pointercancel", () => document.documentElement.dataset.mapPointerCancelled = "true", { capture: true });
    });
    const pageBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, scale: window.visualViewport!.scale }));
    const fingers = (distance: number) => [
      { id: 1, x: centre.x - distance / 2, y: centre.y },
      { id: 2, x: centre.x + distance / 2, y: centre.y }
    ];
    try {
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(60) });
      for (const distance of [72, 90, 115, 145]) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(distance) });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => zoomPercent(page)).toBeGreaterThan(200);
      expect(await page.evaluate(() => document.documentElement.dataset.mapPointerCancelled)).toBeUndefined();
      expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, scale: window.visualViewport!.scale }))).toEqual(pageBefore);
    } finally {
      await session.detach();
    }
  });
});
