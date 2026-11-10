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

function statusLine(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

test("moving a token updates the status line without raising a toast", async ({ page }) => {
  await openDemoTable(page);
  const token = await topmostToken(page);
  await token.focus();
  await page.keyboard.press("ArrowRight");
  await expect(statusLine(page, "1 token moved")).toBeVisible();
  await expect(page.locator(".toast").filter({ hasText: "token moved" })).toHaveCount(0);

  // Restore the seeded position for later tests.
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".toast").filter({ hasText: "token moved" })).toHaveCount(0);
});

test("an informative toast sits clear of the map dock", async ({ page }) => {
  await openDemoTable(page);
  const token = await topmostToken(page);
  await token.click({ force: true }); // A token whose turn it is pulses and never reports as still.
  await expect(token).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ControlOrMeta+c");
  const toast = page.locator(".toast").filter({ hasText: "1 token copied" });
  await expect(toast).toBeVisible();

  const toastBox = (await toast.boundingBox())!;
  const dockBox = (await page.getByRole("group", { name: "Battle map zoom controls" }).boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(dockBox.y);
});

test("a failed action raises an error toast whatever the message says", async ({ page }) => {
  await openDemoTable(page);
  const token = await topmostToken(page);
  const tokenId = await token.getAttribute("data-token-id");
  await token.click({ force: true }); // A token whose turn it is pulses and never reports as still.
  await expect(token).toHaveAttribute("aria-pressed", "true");

  // The message has no "error" or "failed" in it, so only the typed path can mark it as an error.
  await page.route("**/api/v1/tokens/**", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ statusCode: 503, error: "Service Unavailable", message: "Simulated outage" }) });
  });
  await page.keyboard.press("Delete");
  await expect(page.locator(".toast.toast-error").first()).toBeVisible();
  await page.unroute("**/api/v1/tokens/**");

  // The token is still on the board.
  await expect(page.locator(`.scene-board [data-token-id="${tokenId}"]`)).toBeVisible();
});
