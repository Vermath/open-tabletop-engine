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

async function openInspectorTab(page: Page, id: "actors" | "combat") {
  const tab = page.locator(`#inspector-tab-${id}`);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

function combatPanel(page: Page) {
  return page.locator(".inspector .panel-stack").filter({ has: page.locator(".combat-hero") });
}

async function endCombatIfActive(page: Page) {
  await openInspectorTab(page, "combat");
  const panel = combatPanel(page);
  const end = panel.getByRole("button", { name: "End combat", exact: true });
  if (!(await end.isVisible().catch(() => false))) return;
  await end.click();
  await panel.getByRole("button", { name: "Confirm end combat" }).click();
  await expect(panel.getByRole("button", { name: "Review combatants" })).toBeVisible();
}

test("the initiative strip keeps turn order on the map while the inspector shows something else", async ({ page }) => {
  await openDemoTable(page);
  const strip = page.locator(".initiative-strip");
  await endCombatIfActive(page);
  await expect(strip).toHaveCount(0);

  try {
    const panel = combatPanel(page);
    await panel.getByRole("button", { name: "Review combatants" }).click();
    const dialog = page.getByRole("dialog", { name: /^Review / });
    await expect(dialog).toBeVisible();
    const selectAll = dialog.getByRole("button", { name: "Select all" });
    if (await selectAll.isEnabled()) await selectAll.click();
    const serverRoll = dialog.getByRole("checkbox", { name: /Server-roll initiative/ });
    if (await serverRoll.isChecked()) await serverRoll.uncheck();
    const initiatives = dialog.locator('input[type="number"]:enabled');
    for (let index = 0; index < await initiatives.count(); index += 1) await initiatives.nth(index).fill(String(20 - index));
    await dialog.getByRole("button", { name: /^Start combat \(\d+\)$/ }).click();
    await expect(dialog).toBeHidden();

    // Leave the Combat tab: the order is still on the map.
    await openInspectorTab(page, "actors");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Round 1");
    const current = strip.locator('[aria-current="step"]');
    await expect(current).toHaveCount(1);
    const before = { name: await current.getAttribute("aria-label"), round: await strip.locator(".initiative-strip-round").innerText() };

    // The strip does not cover the tool palette or the map dock.
    const stripBox = (await strip.boundingBox())!;
    const toolbarBox = (await page.locator(".toolbar").first().boundingBox())!;
    const dockBox = (await page.getByRole("group", { name: "Battle map zoom controls" }).boundingBox())!;
    expect(stripBox.x).toBeGreaterThanOrEqual(toolbarBox.x + toolbarBox.width);
    expect(stripBox.y + stripBox.height).toBeLessThan(dockBox.y);

    const advanced = page.waitForResponse((response) => response.request().method() === "PATCH" && /\/api\/v1\/combats\/[^/]+$/.test(new URL(response.url()).pathname) && response.ok());
    await strip.getByRole("button", { name: "Next turn" }).click();
    await advanced;
    await expect.poll(async () => {
      const name = await strip.locator('[aria-current="step"]').getAttribute("aria-label");
      const round = await strip.locator(".initiative-strip-round").innerText();
      return name !== before.name || round !== before.round;
    }).toBe(true);

    await strip.getByRole("button", { name: /^Round / }).click();
    await expect(page.locator("#inspector-tab-combat")).toHaveAttribute("aria-selected", "true");
  } finally {
    await endCombatIfActive(page);
  }
  await expect(strip).toHaveCount(0);
});

test("the inspector can be resized, remembers its width and resets", async ({ page }) => {
  await openDemoTable(page);
  const inspector = page.locator("#workspace-inspector");
  const handle = page.getByRole("separator", { name: "Resize inspector" });
  await expect(handle).toBeVisible();
  const initial = (await inspector.boundingBox())!.width;

  const handleBox = (await handle.boundingBox())!;
  const grip = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + 200 };
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x - 120, grip.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await inspector.boundingBox())!.width)).toBeGreaterThanOrEqual(Math.round(initial) + 110);
  const widened = Math.round((await inspector.boundingBox())!.width);

  await page.reload();
  await expect(page.locator(".scene-board")).toBeVisible();
  await expect.poll(async () => Math.round((await inspector.boundingBox())!.width)).toBe(widened);

  // Keyboard: Arrow Right narrows by one step; Enter returns to the built-in width.
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Math.round((await inspector.boundingBox())!.width)).toBe(widened - 16);
  await page.keyboard.press("Enter");
  await expect.poll(async () => Math.round((await inspector.boundingBox())!.width)).toBe(Math.round(initial));
  expect(await page.evaluate(() => window.localStorage.getItem("otte:inspectorWidth"))).toBeNull();
});
