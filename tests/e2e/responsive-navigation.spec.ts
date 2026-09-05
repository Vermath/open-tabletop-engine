import { randomUUID } from "node:crypto";
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
test("desktop workspaces emphasize the scene and give preparation its own reading space", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await expect(page.getByRole("heading", { level: 1, name: "Vault Entry", exact: true })).toBeVisible();

  const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
  const sceneIds: string[] = [];
  const headers = { "x-user-id": "usr_demo_gm" };
  try {
    for (let index = 1; index <= 10; index += 1) {
      const campaignResponse = await page.request.get(`${apiBaseUrl}/api/v1/campaigns/camp_demo`, { headers });
      await expect(campaignResponse).toBeOK();
      const campaign = await campaignResponse.json() as { updatedAt: string };
      const response = await page.request.post(`${apiBaseUrl}/api/v1/campaigns/camp_demo/scenes`, {
        headers: { ...headers, "idempotency-key": `focus-scene:${randomUUID()}` },
        data: { expectedUpdatedAt: campaign.updatedAt, name: `Focus regression scene ${index}`, active: false, width: 900, height: 700, gridSize: 50 },
      });
      await expect(response).toBeOK();
      sceneIds.push((await response.json() as { id: string }).id);
    }
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Vault Entry", exact: true })).toBeVisible();
    await expect.poll(() => page.locator(".scene-tabs .scene-tab").count()).toBeGreaterThanOrEqual(11);

    const inspector = page.locator("#workspace-inspector");
    const originalInspectorWidth = (await inspector.boundingBox())!.width;
    await page.getByRole("button", { name: "Hide inspector", exact: true }).click();
    await expect(inspector).toBeHidden();
    await expect(page.getByRole("button", { name: "Live Table", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show inspector", exact: true })).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Show inspector", exact: true }).click();
    await expect(inspector).toBeVisible();
    await page.getByRole("button", { name: "Enter map focus mode", exact: true }).click();
    await expect(page.getByRole("main", { name: "OpenTabletop workspace" })).toHaveAttribute("data-table-focus", "true");
    await page.getByRole("button", { name: "Show inspector", exact: true }).click();
    await expect(page.getByRole("main", { name: "OpenTabletop workspace" })).not.toHaveAttribute("data-table-focus", "true");
    await expect(inspector).toBeVisible();

    await page.getByRole("button", { name: "Prep", exact: true }).click();
    await page.getByRole("tablist", { name: "Inspector panels" }).getByRole("tab", { name: "Sessions", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sessions", exact: true })).toBeVisible();
    const grid = page.locator(".table-grid");
    const scene = page.locator("#scene-workspace");
    await expect(grid).toHaveAttribute("data-content-workspace", "true");
    await expect(scene).toBeHidden();
    await expect(page.getByRole("region", { name: "Session Desk" })).toBeVisible();
    await expect.poll(async () => (await inspector.boundingBox())!.width).toBeGreaterThan(originalInspectorWidth + 200);
    await page.getByRole("button", { name: "Show scene", exact: true }).click();
    await expect(scene).toBeVisible();
    await expect(grid).toHaveAttribute("data-scene-preview", "true");
    await page.getByRole("button", { name: "Hide scene", exact: true }).click();
    await expect(scene).toBeHidden();

    const sceneTools = page.locator("details.scene-management-disclosure");
    await expect(sceneTools).toBeHidden();
    await page.getByRole("button", { name: "Show scene", exact: true }).click();
    await expect(sceneTools).not.toHaveAttribute("open");
    await expect(sceneTools.getByRole("textbox", { name: "Scene search", exact: true })).toBeHidden();
    await sceneTools.locator(":scope > summary").click();
    await expect(sceneTools.getByRole("textbox", { name: "Scene search", exact: true })).toBeVisible();
    await expect(sceneTools.getByRole("button", { name: "Select visible scenes", exact: true })).toBeVisible();
    await sceneTools.locator(":scope > summary").click();
    await expect(sceneTools.getByRole("textbox", { name: "Scene search", exact: true })).toBeHidden();

    await page.getByRole("tablist", { name: "Inspector panels" }).getByRole("tab", { name: "Actors", exact: true }).click();
    await expect(scene).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    for (const sceneId of sceneIds.reverse()) {
      const current = await page.request.get(`${apiBaseUrl}/api/v1/scenes/${sceneId}`, { headers });
      await expect(current).toBeOK();
      const scene = await current.json() as { updatedAt: string };
      const removed = await page.request.delete(`${apiBaseUrl}/api/v1/scenes/${sceneId}?expectedUpdatedAt=${encodeURIComponent(scene.updatedAt)}`, {
        headers: { ...headers, "idempotency-key": `focus-scene-cleanup:${randomUUID()}` },
      });
      await expect(removed).toBeOK();
    }
  }
});

test("actor details stay compact until the player opens the relevant controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await page.getByRole("region", { name: "Party", exact: true }).getByRole("button").filter({ has: page.getByText("Valen Ash", { exact: true }) }).click();
  const inspector = page.locator("#workspace-inspector");
  const actorHeading = inspector.getByRole("heading", { name: "Valen Ash", exact: true });
  await expect(actorHeading).toBeVisible();
  const headingBounds = (await actorHeading.boundingBox())!;
  expect(headingBounds.width, "actor names have enough width to read horizontally").toBeGreaterThan(100);
  expect(headingBounds.height, "actor names do not wrap into a vertical stack").toBeLessThan(70);
  for (const control of [
    inspector.getByRole("tab", { name: "Actions", exact: true }),
    inspector.getByRole("region", { name: "Actor at a glance", exact: true }).getByRole("meter"),
  ]) {
    await expect(control).toBeVisible();
    const bounds = (await control.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height, "essential actor controls fit in the first viewport").toBeLessThanOrEqual(900);
  }

  const actorDetails = inspector.locator("details.actor-advanced-details");
  await expect(actorDetails.getByRole("combobox", { name: "Action target actor", exact: true })).toBeHidden();
  await actorDetails.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(actorDetails.getByRole("combobox", { name: "Action target actor", exact: true })).toBeVisible();
  await actorDetails.locator(":scope > summary").click();
  await expect(actorDetails.getByRole("combobox", { name: "Action target actor", exact: true })).toBeHidden();

  const tokenSettings = inspector.locator("details.actor-token-editor");
  await expect(tokenSettings.getByRole("textbox", { name: "Token inspector name", exact: true })).toBeHidden();
  await tokenSettings.locator(":scope > summary").click();
  await expect(tokenSettings.getByRole("textbox", { name: "Token inspector name", exact: true })).toBeVisible();
  await tokenSettings.locator(":scope > summary").click();

  const damage = inspector.locator("details.actor-damage-disclosure");
  await expect(damage).not.toHaveAttribute("open");
  await inspector.getByRole("button", { name: "Open reviewed typed damage", exact: true }).click();
  await expect(damage).toHaveAttribute("open", "");
  await expect(damage.getByRole("region", { name: "Reviewed typed damage", exact: true })).toBeFocused();
  await damage.locator(":scope > summary").click();

  const conditions = inspector.locator("details.actor-condition-editor");
  await expect(conditions.getByRole("textbox", { name: "Actor sheet conditions", exact: true })).toBeHidden();
  await conditions.locator(":scope > summary").click();
  await expect(conditions.getByRole("textbox", { name: "Actor sheet conditions", exact: true })).toBeVisible();
  await conditions.locator(":scope > summary").click();
  await expect(inspector.locator("details.actor-rest-disclosure")).not.toHaveAttribute("open");

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  const placement = page.locator("details.placement-tray-disclosure");
  await expect(placement).not.toHaveAttribute("open");
  await expect(placement.getByRole("textbox", { name: "Search actors to place", exact: true })).toBeHidden();
  await placement.locator(":scope > summary").click();
  await expect(placement.getByRole("textbox", { name: "Search actors to place", exact: true })).toBeVisible();
  await placement.getByRole("textbox", { name: "Search actors to place", exact: true }).fill("Valen");
  await expect(placement.getByRole("button", { name: "Place Valen Ash actor on scene", exact: true })).toBeVisible();
});

test.describe("short phone scene view", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 568 } });

  test("gives the scene unobstructed pointer space and restores the selected inspector", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Demo GM", exact: true }).click();
    await page.getByRole("button", { name: "Prep", exact: true }).click();
    const inspector = page.locator("#workspace-inspector");
    const actors = page.getByRole("tablist", { name: "Inspector panels" }).getByRole("tab", { name: "Actors", exact: true });
    await actors.click();
    const scene = page.locator("#scene-workspace");
    await expect(scene).toBeHidden();
    await page.getByRole("button", { name: "Show scene", exact: true }).click();
    await expect(scene).toBeVisible();
    await expect(inspector).toBeHidden();
    const board = page.getByRole("group", { name: "Vault Entry interactive battle map", exact: true });
    await expect(board).toBeVisible();

    const usableMap = await board.evaluate((element) => {
      const boardBox = element.getBoundingClientRect();
      const viewport = element.closest(".scene-viewport")!.getBoundingClientRect();
      const tableArea = element.closest(".table-area")!.getBoundingClientRect();
      const left = Math.max(0, boardBox.left, viewport.left, tableArea.left);
      const right = Math.min(innerWidth, boardBox.right, viewport.right, tableArea.right);
      const top = Math.max(0, boardBox.top, viewport.top, tableArea.top);
      const bottom = Math.min(innerHeight, boardBox.bottom, viewport.bottom, tableArea.bottom);
      const step = 8;
      const xs = [0.2, 0.5, 0.8].map((fraction) => left + (right - left) * fraction);
      let longestRows: number[] = [];
      let currentRows: number[] = [];
      let pointer: { x: number; y: number } | undefined;
      for (let y = top + step / 2; y < bottom; y += step) {
        const hits = xs.map((x) => document.elementFromPoint(x, y));
        if (hits.every((hit) => hit && element.contains(hit))) {
          currentRows.push(y);
          if (currentRows.length > longestRows.length) longestRows = [...currentRows];
          const plainIndex = hits.findIndex((hit) => hit && !hit.closest("button"));
          if (plainIndex >= 0 && !pointer) pointer = { x: xs[plainIndex]!, y };
        } else {
          currentRows = [];
        }
      }
      return { tableHeight: tableArea.height, visibleWidth: right - left, unobstructedHeight: longestRows.length * step, pointer };
    });
    expect(usableMap.tableHeight, "scene view has useful space above the phone rail").toBeGreaterThanOrEqual(240);
    expect(usableMap.visibleWidth, "the board is wide enough for pointer interactions").toBeGreaterThanOrEqual(200);
    expect(usableMap.unobstructedHeight, "map controls leave a continuous reachable board area").toBeGreaterThanOrEqual(120);
    expect(usableMap.pointer).toBeDefined();
    await page.mouse.move(usableMap.pointer!.x, usableMap.pointer!.y);
    await page.mouse.down();
    await expect(board).toHaveClass(/token-selecting/);
    await page.mouse.up();
    await expect(board).not.toHaveClass(/token-selecting/);
    await expect(inspector).toBeHidden();

    await page.getByRole("button", { name: "Show inspector", exact: true }).click();
    await expect(inspector).toBeVisible();
    await expect(scene).toBeHidden();
    await expect(actors).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tablist", { name: "Inspector panels" }).getByRole("tab", { name: "Sessions", exact: true }).click();
    const sessions = page.getByRole("region", { name: "Session Desk", exact: true });
    const planSession = sessions.getByRole("button", { name: "Plan session", exact: true });
    await expectUnclippedLabels(planSession);
    await planSession.click();
    const sessionTitle = sessions.getByRole("textbox", { name: "Session title", exact: true });
    await expect(sessionTitle).toBeFocused();
    await expect(sessionTitle).toBeInViewport({ ratio: 1 });
    await sessionTitle.fill("Unsubmitted phone session draft");
    await page.screenshot({ path: testInfo.outputPath("short-phone-session-editor-focused.png") });
    await page.getByRole("button", { name: "Show scene", exact: true }).click();
    await expect(inspector).toBeHidden();
    await page.getByRole("button", { name: "Show inspector", exact: true }).click();
    await expect(sessionTitle).toHaveValue("Unsubmitted phone session draft");
    await expect(sessionTitle).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("short-phone-session-editor-restored.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("a hidden chat inspector reports new messages and clears unread only when reopened", async ({ browser, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const manage = page.getByRole("region", { name: "Manage workspace panel" });
  await manage.locator(".manage-category-button", { hasText: "Account" }).click();
  const preference = manage.getByRole("combobox", { name: "Chat notification preference", exact: true });
  const originalPreference = await preference.inputValue();
  await preference.selectOption("all");
  await manage.getByRole("button", { name: "Save profile & preferences", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile preferences synced" })).toBeVisible();
  await manage.getByRole("button", { name: "Close", exact: true }).click();
  const chatTab = page.locator("#inspector-tab-chat");
  await chatTab.click();
  await page.getByRole("button", { name: "Hide inspector", exact: true }).click();
  await expect(page.locator("#workspace-inspector")).toBeHidden();

  const player = await browser.newPage();
  try {
    await player.goto("/");
    await player.getByRole("button", { name: "Demo GM", exact: true }).click();
    await player.getByLabel("Session user", { exact: true }).selectOption("usr_demo_player");
    await expect(player.getByLabel("Session user", { exact: true })).toHaveValue("usr_demo_player");
    await player.locator("#inspector-tab-chat").click();
    const message = `Hidden inspector message ${Date.now()}`;
    await player.getByRole("textbox", { name: "Chat message", exact: true }).fill(message);
    await player.getByRole("button", { name: "Send chat command", exact: true }).click();
    await expect(page.locator(".toast").filter({ hasText: message })).toBeVisible();
    await expect(chatTab).toHaveText("Chat (1)");
    await expect(page.locator(".inspector-unread-badge")).toHaveText("Chat 1");
    await expect(page.getByRole("button", { name: "Show inspector", exact: true })).toHaveAccessibleDescription("1 unread chat message");
    await page.getByRole("button", { name: "Show inspector", exact: true }).click();
    await expect(chatTab).toHaveText("Chat");
    await expect(page.getByLabel("Chat messages", { exact: true })).toContainText(message);
    await expect(page.locator(".inspector-unread-badge")).toHaveCount(0);
    await page.getByRole("button", { name: "Hide inspector", exact: true }).click();
    await expect(chatTab).toHaveText("Chat");
    await page.getByRole("button", { name: "Show inspector", exact: true }).click();
    await expect(chatTab).toHaveText("Chat");
  } finally {
    await player.close();
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await manage.locator(".manage-category-button", { hasText: "Account" }).click();
    await preference.selectOption(originalPreference);
    await manage.getByRole("button", { name: "Save profile & preferences", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Profile preferences synced" })).toBeVisible();
  }
});
