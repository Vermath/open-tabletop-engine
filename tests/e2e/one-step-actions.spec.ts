import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function openValenActions(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await expect(page.locator(".scene-board")).toBeVisible();
  await page.locator("#inspector-tab-actors").click();
  await page.getByRole("region", { name: "Party" }).getByRole("button", { name: /Valen Ash/ }).click();
  await expect(page.locator(".inspector").getByRole("heading", { name: "Valen Ash" })).toBeVisible();
  await page.getByRole("tab", { name: "Actions" }).click();
  const sheet = page.getByRole("region", { name: "Actor action sheet" });
  await expect(sheet).toBeVisible();
  // Target and effect options live in the collapsed actor details.
  const details = page.locator(".inspector details.actor-detail-disclosure").filter({ hasText: "Actor details" }).first();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator(":scope > summary").click();
  return sheet;
}

function statusLine(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

test("a routine action commits in one step and can be undone from its toast", async ({ page }) => {
  const sheet = await openValenActions(page);
  const inspector = page.locator(".inspector");
  const resources = inspector.locator(".metric-row", { hasText: "Resources" });
  await expect(resources).toContainText("Second Wind 2/2");
  const hpBefore = await inspector.locator(".hp-bar").first().innerText();

  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Valen Ash" });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
  await secondWind.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("status", { name: "Action review progress" })).toContainText("Preview ready - nothing committed");

  await secondWind.getByRole("button", { name: /^Use .* now$/ }).click();

  // No review dialog: the result is committed and reported with an undo.
  const toast = page.locator(".toast").filter({ hasText: "Valen Ash used action: Second Wind 1; healing applied" });
  await expect(toast).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Review / })).toHaveCount(0);
  await expect(resources).toContainText("Second Wind 1/2");
  await expect.poll(async () => inspector.locator(".hp-bar").first().innerText()).not.toBe(hpBefore);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(statusLine(page, "Last D&D rules change undone")).toBeVisible();
  await expect(resources).toContainText("Second Wind 2/2");
  await expect.poll(async () => inspector.locator(".hp-bar").first().innerText()).toBe(hpBefore);
});

test("the review is still one click away and cancelling it commits nothing", async ({ page }) => {
  const sheet = await openValenActions(page);
  const inspector = page.locator(".inspector");
  const resources = inspector.locator(".metric-row", { hasText: "Resources" });
  await expect(resources).toContainText("Second Wind 2/2");

  await page.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Valen Ash" });
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
  await secondWind.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("status", { name: "Action review progress" })).toContainText("Preview ready - nothing committed");

  await secondWind.getByRole("button", { name: "Continue to final review" }).click();
  const review = page.getByRole("dialog", { name: /^Review / });
  await expect(review).toBeVisible();
  await expect(review.getByRole("button", { name: "Commit exact action", exact: true })).toBeVisible();
  await review.getByRole("button", { name: /Cancel/ }).first().click();
  await expect(review).toHaveCount(0);
  await expect(statusLine(page, "Valen Ash action cancelled after review")).toBeVisible();
  await expect(resources).toContainText("Second Wind 2/2");
});
